import { useEffect, useRef } from 'react';
import { useConnectionStore } from './stores/ConnectionStore';
import {
  useFrameStore,
  matchesBotId,
  parseTrouterFrame,
  createFrameId,
  extractFrameInfo,
  type WsFrame,
} from './stores/FrameStore';
import { Toolbar } from './components/Toolbar';
import { FilterBar } from './components/FilterBar';
import { BotStrip } from './components/BotStrip';
import { FrameList } from './components/FrameList';
import { FrameDetail } from './components/FrameDetail';
import { EmptyState } from './components/EmptyState';
import './App.css';

interface RawFrame {
  type: string;
  direction: 'incoming' | 'outgoing';
  data: string | null;
  url: string;
  timestamp: number;
  headers?: Record<string, string>;
}

function processRawFrame(raw: RawFrame, botId?: string): WsFrame | null {
  const rawData = raw.data;
  if (rawData == null) return null;
  if (!rawData && raw.type !== 'fetch-response') return null;

  let parsed: Record<string, unknown> | null = null;
  let envelope: WsFrame['envelope'] = null;

  if (raw.type === 'ws-frame') {
    const result = parseTrouterFrame(rawData);
    envelope = result.envelope;
    parsed = result.innerBody;
    if (!parsed && !envelope) {
      try { parsed = JSON.parse(rawData); } catch { /* not JSON */ }
    }
  } else if (raw.type === 'worker-message') {
    try { parsed = JSON.parse(rawData); } catch { return null; }

    // Only keep GraphQL responses
    if (parsed?.['type'] !== 'graphql') return null;

    // Keep NewMessage and MessageUpdate subscriptions (actual message events)
    const ext = (parsed?.['extensions'] as Record<string, unknown>)?.['subscriptionCustomIdentifier'] as Record<string, unknown> | undefined;
    if (!ext || (!ext['NewMessage'] && !ext['MessageUpdate'])) return null;
  } else {
    // fetch-request, fetch-response
    try { parsed = JSON.parse(rawData); } catch { /* not JSON */ }
  }

  const trimmedBotId = botId?.trim();
  const candidate = { parsed, rawData, envelope, url: raw.url };
  const matchedField = trimmedBotId ? matchesBotId(candidate, trimmedBotId) : 'all-traffic';
  if (!matchedField) return null;

  return {
    id: createFrameId(),
    direction: raw.direction,
    sourceType: raw.type as WsFrame['sourceType'],
    rawData,
    parsed,
    envelope,
    url: raw.url,
    timestamp: raw.timestamp,
    matchedField,
    headers: raw.headers,
  };
}

function looksLikeInvokeBody(bodyText: string | null): boolean {
  if (!bodyText) return false;

  try {
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    return typeof body['name'] === 'string' && ('appId' in body || 'value' in body || 'conversation' in body);
  } catch {
    return false;
  }
}

function shouldCaptureDevtoolsNetworkRequest(url: string, method: string, bodyText: string | null): boolean {
  if (!['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) return false;
  return /\/api\/chatsvc\/.*\/(messages|invoke)(?:[/?#]|$)/.test(url) || looksLikeInvokeBody(bodyText);
}

function headersToRecord(headers: Array<{ name: string; value: string }> | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  for (const header of headers ?? []) {
    record[header.name] = header.value;
  }
  return record;
}

function drainFrames(): Promise<RawFrame[]> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(
      'window.__teamsBotInspectorFrames ? window.__teamsBotInspectorFrames.splice(0) : []',
      (result: unknown, error: unknown) => {
        if (error || !Array.isArray(result)) {
          resolve([]);
          return;
        }
        resolve(result as RawFrame[]);
      }
    );
  });
}

function findStreamingMetadata(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;
  const metadata = record['streamingMetadata'];
  if (metadata && typeof metadata === 'object') {
    return metadata as Record<string, unknown>;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findStreamingMetadata(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const value of Object.values(record)) {
    const found = findStreamingMetadata(value, depth + 1);
    if (found) return found;
  }

  return null;
}

function getGraphQLDedupeKey(frame: WsFrame, messageId: string): string {
  const metadata = findStreamingMetadata(frame.parsed);
  if (!metadata) return messageId;

  const streamType = String(metadata['streamType'] ?? 'stream');
  const streamSequence = metadata['streamSequence'];
  const streamEndTime = metadata['streamEndTime'];

  if (streamSequence != null) return `${messageId}:${streamType}:${streamSequence}`;
  if (streamEndTime != null) return `${messageId}:${streamType}:${streamEndTime}`;

  return `${messageId}:${streamType}:${frame.timestamp}`;
}

export function App() {
  const { isCapturing, loadPersistedState } = useConnectionStore();
  const { frames, addFrames, clear } = useFrameStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenNetworkRequests = useRef(new Set<string>());
  useEffect(() => {
    loadPersistedState();
  }, [loadPersistedState]);

  useEffect(() => {
    const theme = chrome.devtools?.panels?.themeName === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  // Track seen message IDs to deduplicate across subscription channels
  const seenMessages = useRef(new Set<string>());

  // Capture HTTP bot traffic from the DevTools Network stack. Some Teams
  // requests are not visible to injected page hooks, but they do appear here.
  useEffect(() => {
    if (!isCapturing) {
      seenNetworkRequests.current.clear();
      return;
    }

    const handleRequestFinished = (request: chrome.devtools.network.Request) => {
      try {
        const url = request.request.url;
        const method = request.request.method;
        const bodyText = request.request.postData?.text ?? null;
        if (!shouldCaptureDevtoolsNetworkRequest(url, method, bodyText)) return;

        const requestKey = `${request.startedDateTime}:${method}:${url}`;
        if (seenNetworkRequests.current.has(requestKey)) return;
        seenNetworkRequests.current.add(requestKey);

        const botId = useConnectionStore.getState().botId;
        const requestFrame = processRawFrame({
          type: 'fetch-request',
          direction: 'outgoing',
          data: bodyText,
          url,
          timestamp: new Date(request.startedDateTime).getTime() || Date.now(),
          headers: headersToRecord(request.request.headers),
        }, botId);

        const processed: WsFrame[] = [];
        if (requestFrame) processed.push(requestFrame);

        request.getContent((content) => {
          const responseFrame = processRawFrame({
            type: 'fetch-response',
            direction: 'incoming',
            data: content || '',
            url,
            timestamp: Date.now(),
            headers: headersToRecord(request.response.headers),
          }, botId);

          if (responseFrame) processed.push(responseFrame);
          if (processed.length > 0) addFrames(processed);
        });
      } catch { /* ignore */ }
    };

    chrome.devtools.network.onRequestFinished.addListener(handleRequestFinished);

    return () => {
      chrome.devtools.network.onRequestFinished.removeListener(handleRequestFinished);
    };
  }, [isCapturing, addFrames]);

  // Poll for frames when capturing
  useEffect(() => {
    if (!isCapturing) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      seenMessages.current.clear();
      return;
    }

    const poll = async () => {
      const botId = useConnectionStore.getState().botId;

      const rawFrames = await drainFrames();
      if (rawFrames.length === 0) return;

      const processed: WsFrame[] = [];
      for (const f of rawFrames) {
        const frame = processRawFrame(f, botId);
        if (!frame) continue;

        const info = extractFrameInfo(frame);

        // Skip typing indicators
        if (info.messageType === 'Control/Typing') continue;

        // Deduplicate GraphQL worker messages across subscription channels.
        // Streaming updates reuse the same message id, so include stream metadata
        // in the key or we drop every follow-up chunk after the first one.
        if (frame.sourceType === 'worker-message' && info.messageId) {
          const dedupeKey = getGraphQLDedupeKey(frame, info.messageId);
          if (seenMessages.current.has(dedupeKey)) continue;
          seenMessages.current.add(dedupeKey);
        }

        processed.push(frame);
      }

      if (processed.length > 0) {
        addFrames(processed);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 300);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isCapturing, addFrames]);

  useEffect(() => {
    if (!isCapturing) clear();
  }, [isCapturing, clear]);

  const hasFrames = frames.length > 0;

  return (
    <div className="app">
      <Toolbar />
      {isCapturing && <FilterBar />}
      {isCapturing && <BotStrip />}
      {!hasFrames ? (
        <EmptyState />
      ) : (
        <div className="main-content">
          <div className="left-pane">
            <FrameList />
          </div>
          <div className="divider" />
          <div className="right-pane">
            <FrameDetail />
          </div>
        </div>
      )}
    </div>
  );
}
