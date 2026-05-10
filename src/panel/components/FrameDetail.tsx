import { useState } from 'react';
import { format } from 'date-fns';
import { useFrameStore, extractFrameInfo } from '../stores/FrameStore';
import { JsonTree } from './JsonTree';

type ViewMode = 'summary' | 'full' | 'raw';

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

export function FrameDetail() {
  const { frames, selectedId } = useFrameStore();
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [copied, setCopied] = useState(false);

  const frame = frames.find((f) => f.id === selectedId);

  if (!frame) {
    return (
      <div className="frame-detail empty">
        <span className="empty-text">Select a frame to inspect</span>
      </div>
    );
  }

  const info = extractFrameInfo(frame);
  const summary = extractSummary(frame.parsed);

  const handleCopy = async () => {
    let text: string;
    if (viewMode === 'summary' && summary) {
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
          </div>
        </div>
      </div>
      {info.content && (
        <div className="detail-content-preview">
          <span
            className="content-text"
            dangerouslySetInnerHTML={{ __html: info.content }}
          />
        </div>
      )}
      <div className="detail-content">
        {viewMode === 'summary' && summary ? (
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
