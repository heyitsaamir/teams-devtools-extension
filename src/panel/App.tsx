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
}

function processRawFrame(raw: RawFrame, botId: string): WsFrame | null {
  const rawData = raw.data;
  if (!rawData) return null;

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

  const candidate = { parsed, rawData, envelope, url: raw.url };
  const matchedField = matchesBotId(candidate, botId);
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
  };
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

export function App() {
  const { isCapturing, loadPersistedState } = useConnectionStore();
  const { frames, addFrames, clear } = useFrameStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    loadPersistedState();
  }, [loadPersistedState]);

  useEffect(() => {
    const theme = chrome.devtools?.panels?.themeName === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  // Track seen message IDs to deduplicate across subscription channels
  const seenMessages = useRef(new Set<string>());

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
      if (!botId) return;

      const rawFrames = await drainFrames();
      if (rawFrames.length === 0) return;

      const processed: WsFrame[] = [];
      for (const f of rawFrames) {
        const frame = processRawFrame(f, botId);
        if (!frame) continue;

        const info = extractFrameInfo(frame);

        // Skip typing indicators
        if (info.messageType === 'Control/Typing') continue;

        // Deduplicate GraphQL worker messages across subscription channels
        // Use messageId (unique per message) instead of content
        if (frame.sourceType === 'worker-message' && info.messageId) {
          if (seenMessages.current.has(info.messageId)) continue;
          seenMessages.current.add(info.messageId);
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
