import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useFrameStore, extractFrameInfo, type WsFrame } from '../stores/FrameStore';
import { JsonTree } from './JsonTree';

type ViewMode = 'summary' | 'full' | 'raw' | 'headers' | 'diff';

type DiffRow =
  | { type: 'same'; left: string; right: string }
  | { type: 'removed'; left: string; right?: undefined }
  | { type: 'added'; left?: undefined; right: string };

/**
 * Extract only the useful fields from a GraphQL NewMessage/MessageUpdate payload.
 */
function extractSummary(parsed: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!parsed) return null;

  // GraphQL worker message
  if (parsed['type'] === 'graphql') {
    const response = parsed['response'] as Record<string, unknown> | undefined;
    const data = response?.['data'] as Record<string, unknown> | undefined;
    const events = data?.['chatServiceBatchEvent'] as Array<Record<string, unknown>> | undefined;
    if (!events?.length) return parsed;

    const event = events[0];
    const message = (event['message'] ?? (event['conversation'] as Record<string, unknown>)?.['lastMessage']) as Record<string, unknown> | undefined;

    if (!message) return event;

    // Pick only useful fields
    const summary: Record<string, unknown> = {};
    const usefulFields = [
      'id', 'content', 'from', 'fromUserId', 'imDisplayName',
      'messageType', 'originalArrivalTime', 'composetime',
      'clientMessageId', 'cards', 'files', 'mentions',
      'botMetadata', 'streamingMetadata', 'suggestedActions',
      'importance', 'subject', 'replyToId', 'parentMessageId',
    ];

    for (const key of usefulFields) {
      const val = message[key];
      if (val != null && val !== '' && !(Array.isArray(val) && val.length === 0)) {
        summary[key] = val;
      }
    }

    // Decode base64 adaptive card from <Swift b64="..."> in content
    const content = (message['content'] as string) || '';
    const b64Match = content.match(/b64="([A-Za-z0-9+/=]+)"/);
    if (b64Match) {
      try {
        const decoded = JSON.parse(atob(b64Match[1]));
        summary['decodedCard'] = decoded;
        // Replace verbose HTML content with a short label
        summary['content'] = '[Adaptive Card]';
      } catch { /* ignore decode errors */ }
    }

    // Add conversation context
    const convId = event['convId'] as string | undefined;
    if (convId) summary['conversationId'] = convId;

    const subId = (parsed['extensions'] as Record<string, unknown>)?.['subscriptionCustomIdentifier'] as Record<string, unknown> | undefined;
    if (subId) summary['subscriptionType'] = Object.keys(subId)[0];

    return summary;
  }

  // Fetch request/response — already relatively clean
  return parsed;
}

function stringifyForDiff(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function getFrameDiffText(frame: WsFrame): string {
  return stringifyForDiff(extractSummary(frame.parsed) ?? frame.parsed ?? frame.rawData ?? '');
}

function buildLineDiff(leftText: string, rightText: string): DiffRow[] {
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');
  const lengths = Array.from({ length: leftLines.length + 1 }, () => Array<number>(rightLines.length + 1).fill(0));

  for (let i = leftLines.length - 1; i >= 0; i--) {
    for (let j = rightLines.length - 1; j >= 0; j--) {
      lengths[i][j] = leftLines[i] === rightLines[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < leftLines.length && j < rightLines.length) {
    if (leftLines[i] === rightLines[j]) {
      rows.push({ type: 'same', left: leftLines[i], right: rightLines[j] });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      rows.push({ type: 'removed', left: leftLines[i] });
      i++;
    } else {
      rows.push({ type: 'added', right: rightLines[j] });
      j++;
    }
  }

  while (i < leftLines.length) rows.push({ type: 'removed', left: leftLines[i++] });
  while (j < rightLines.length) rows.push({ type: 'added', right: rightLines[j++] });

  return rows;
}

function DiffView({ leftFrame, rightFrame }: { leftFrame: WsFrame; rightFrame: WsFrame }) {
  const leftInfo = extractFrameInfo(leftFrame);
  const rightInfo = extractFrameInfo(rightFrame);
  const rows = buildLineDiff(getFrameDiffText(leftFrame), getFrameDiffText(rightFrame));

  return (
    <div className="diff-view">
      <div className="diff-header-row">
        <div className="diff-header-cell">
          <span className="diff-label">A</span> {leftInfo.resourceType} · {format(new Date(leftFrame.timestamp), 'HH:mm:ss.SSS')}
        </div>
        <div className="diff-header-cell">
          <span className="diff-label">B</span> {rightInfo.resourceType} · {format(new Date(rightFrame.timestamp), 'HH:mm:ss.SSS')}
        </div>
      </div>
      <div className="diff-grid">
        {rows.map((row, index) => (
          <div className={`diff-row diff-${row.type}`} key={index}>
            <pre className="diff-cell diff-left">{row.left ?? ''}</pre>
            <pre className="diff-cell diff-right">{row.right ?? ''}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FrameDetail() {
  const { frames, selectedId, compareIds } = useFrameStore();
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [copied, setCopied] = useState(false);

  const frame = frames.find((f) => f.id === selectedId);
  const compareFrames = compareIds
    .map((id) => frames.find((f) => f.id === id))
    .filter((f): f is WsFrame => Boolean(f));
  const canDiff = compareFrames.length === 2;

  useEffect(() => {
    if (viewMode === 'diff' && !canDiff) setViewMode('summary');
  }, [canDiff, viewMode]);

  if (!frame) {
    return (
      <div className="frame-detail empty">
        <span className="empty-text">Select a frame to inspect</span>
      </div>
    );
  }

  const info = extractFrameInfo(frame);
  const summary = extractSummary(frame.parsed);
  const hasHeaders = Boolean(frame.headers && Object.keys(frame.headers).length > 0);

  const handleCopy = async () => {
    let text: string;
    if (viewMode === 'diff' && canDiff) {
      text = `${getFrameDiffText(compareFrames[0])}\n\n--- compared with ---\n\n${getFrameDiffText(compareFrames[1])}`;
    } else if (viewMode === 'headers' && hasHeaders) {
      text = JSON.stringify(frame.headers, null, 2);
    } else if (viewMode === 'summary' && summary) {
      text = JSON.stringify(summary, null, 2);
    } else if (viewMode === 'full' && frame.parsed) {
      text = JSON.stringify(frame.parsed, null, 2);
    } else {
      text = frame.rawData ?? '';
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="frame-detail">
      <div className="detail-header">
        <div className="detail-meta">
          <span className={`detail-badge ${info.isFromBot ? 'from-bot' : 'from-user'}`}>
            {info.isFromBot ? 'BOT' : 'USER'}
          </span>
          <span className="detail-event">{info.resourceType}</span>
          {info.senderName && <span className="detail-sender">{info.senderName}</span>}
          <span className="detail-time">
            {format(new Date(frame.timestamp), 'HH:mm:ss.SSS')}
          </span>
        </div>
        <div className="detail-actions">
          <button
            className={`copy-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <div className="view-toggle">
            <button
              className={viewMode === 'summary' ? 'active' : ''}
              onClick={() => setViewMode('summary')}
            >
              Summary
            </button>
            <button
              className={viewMode === 'full' ? 'active' : ''}
              onClick={() => setViewMode('full')}
            >
              Full
            </button>
            <button
              className={viewMode === 'raw' ? 'active' : ''}
              onClick={() => setViewMode('raw')}
            >
              Raw
            </button>
            <button
              className={viewMode === 'headers' ? 'active' : ''}
              onClick={() => hasHeaders && setViewMode('headers')}
              disabled={!hasHeaders}
              title={hasHeaders ? 'Show HTTP headers' : 'No captured headers for this frame'}
            >
              Headers
            </button>
            <button
              className={viewMode === 'diff' ? 'active' : ''}
              onClick={() => canDiff && setViewMode('diff')}
              disabled={!canDiff}
              title={canDiff ? 'Diff selected messages' : 'Ctrl/Cmd-click a second message to enable diff'}
            >
              Diff
            </button>
          </div>
        </div>
      </div>
      {info.content && viewMode !== 'diff' && (
        <div className="detail-content-preview">
          <span
            className="content-text"
            dangerouslySetInnerHTML={{ __html: info.content }}
          />
        </div>
      )}
      <div className="detail-content">
        {viewMode === 'diff' && canDiff ? (
          <DiffView leftFrame={compareFrames[0]} rightFrame={compareFrames[1]} />
        ) : viewMode === 'headers' && hasHeaders ? (
          <JsonTree data={frame.headers!} />
        ) : viewMode === 'summary' && summary ? (
          <JsonTree data={summary} />
        ) : viewMode === 'full' && frame.parsed ? (
          <JsonTree data={frame.parsed} />
        ) : (
          <pre className="raw-json">{frame.rawData ?? 'No data'}</pre>
        )}
      </div>
    </div>
  );
}
