import { create } from 'zustand';

export interface WsFrame {
  id: string;
  direction: 'incoming' | 'outgoing';
  /** The source type: trouter WS frame, fetch request, or fetch response */
  sourceType: 'ws-frame' | 'fetch-request' | 'fetch-response' | 'worker-message';
  /** Raw data string from the wire */
  rawData: string | null;
  /** Parsed trouter payload (the inner resource) */
  parsed: Record<string, unknown> | null;
  /** The full parsed trouter envelope (method, url, headers, body) */
  envelope: TrouterEnvelope | null;
  url: string;
  timestamp: number;
  matchedField?: string;
}

export interface TrouterEnvelope {
  id: number;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export type DirectionFilter = 'all' | 'incoming' | 'outgoing';

export interface FrameStore {
  frames: WsFrame[];
  selectedId: string | null;
  directionFilter: DirectionFilter;
  resourceTypeFilter: string;
  searchText: string;
  setSelectedId: (id: string | null) => void;
  addFrame: (frame: WsFrame) => void;
  addFrames: (frames: WsFrame[]) => void;
  clear: () => void;
  setDirectionFilter: (filter: DirectionFilter) => void;
  setResourceTypeFilter: (filter: string) => void;
  setSearchText: (text: string) => void;
}

let frameCounter = 0;

export function createFrameId(): string {
  return `f-${++frameCounter}-${Date.now()}`;
}

/**
 * Parse a trouter WebSocket frame.
 * Trouter frames use a Socket.IO-like prefix:
 *   "3:::{json}" - data messages
 *   "5:::{json}" - named events
 *
 * Data messages (3:::) have structure:
 *   { id, method, url, headers, body: "<double-encoded JSON string>" }
 *
 * The body contains the actual Teams event:
 *   { time, type, resourceLink, resourceType, resource: { ... } }
 */
export function parseTrouterFrame(raw: string): { envelope: TrouterEnvelope | null; innerBody: Record<string, unknown> | null } {
  // Socket.IO format: type:id:endpoint:data
  // Find the 3rd colon to get the data portion
  let colonCount = 0;
  let dataStart = -1;
  for (let i = 0; i < raw.length && i < 30; i++) {
    if (raw[i] === ':') {
      colonCount++;
      if (colonCount === 3) {
        dataStart = i + 1;
        break;
      }
    }
  }
  if (dataStart === -1 || dataStart >= raw.length) return { envelope: null, innerBody: null };

  const jsonStr = raw.substring(dataStart);
  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) return { envelope: null, innerBody: null };

  try {
    const outer = JSON.parse(jsonStr);

    // Named events (5:::) like user.authenticate, ping
    if (!outer.method && outer.name) {
      return { envelope: { id: 0, ...outer }, innerBody: outer };
    }

    const envelope: TrouterEnvelope = {
      id: outer.id,
      method: outer.method,
      url: outer.url,
      headers: outer.headers,
    };

    // Parse the double-encoded body
    if (typeof outer.body === 'string' && outer.body.length > 0) {
      try {
        const innerBody = JSON.parse(outer.body);
        envelope.body = innerBody;
        return { envelope, innerBody };
      } catch {
        return { envelope, innerBody: null };
      }
    }

    return { envelope, innerBody: outer };
  } catch {
    return { envelope: null, innerBody: null };
  }
}

/**
 * Check if a bot client ID appears in a trouter frame.
 */
export function matchesBotId(frame: { parsed: Record<string, unknown> | null; rawData: string | null; envelope: TrouterEnvelope | null; url?: string }, botId: string): string | null {
  if (!botId) return null;
  const lower = botId.toLowerCase();

  // Check frame URL (fetch requests to bot endpoints)
  if (frame.url && frame.url.toLowerCase().includes(lower)) {
    return 'url';
  }

  // Check envelope URL (contains conversation ID with bot ID)
  if (frame.envelope?.url && frame.envelope.url.toLowerCase().includes(lower)) {
    return 'envelope.url';
  }

  // Check inner body fields
  if (frame.parsed) {
    // resourceLink often contains the bot ID in the conversation path
    const resourceLink = frame.parsed['resourceLink'] as string | undefined;
    if (resourceLink?.toLowerCase().includes(lower)) return 'resourceLink';

    // Check resource.from (contains 28:<bot-id> or conversation URL)
    const resource = frame.parsed['resource'] as Record<string, unknown> | undefined;
    if (resource) {
      const from = resource['from'] as string | undefined;
      if (from?.toLowerCase().includes(lower)) return 'resource.from';

      const to = resource['to'] as string | undefined;
      if (to?.toLowerCase().includes(lower)) return 'resource.to';

      const convLink = resource['conversationLink'] as string | undefined;
      if (convLink?.toLowerCase().includes(lower)) return 'resource.conversationLink';
    }
  }

  // Fallback: raw string search
  if (frame.rawData?.toLowerCase().includes(lower)) return 'payload';

  return null;
}

/**
 * Try to extract lastMessage from a GraphQL chatServiceBatchEvent response.
 */
/**
 * Recursively search for a message-like object in a GraphQL response.
 * Looks for objects with 'content' and 'from'/'fromUserId' fields.
 */
function findMessageInObject(obj: unknown, depth: number = 0): Record<string, unknown> | null {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;

  // Check if this object looks like a message (has content key + from/imDisplayName)
  if ('content' in record && (record['from'] || record['fromUserId'] || record['imDisplayName'])) {
    return record;
  }

  // Check common field names
  for (const key of ['lastMessage', 'message', 'resource']) {
    if (record[key] && typeof record[key] === 'object') {
      const found = findMessageInObject(record[key], depth + 1);
      if (found) return found;
    }
  }

  // Check arrays (chatServiceBatchEvent, messages, etc.)
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findMessageInObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Check nested objects
  for (const val of Object.values(record)) {
    if (val && typeof val === 'object') {
      const found = findMessageInObject(val, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function extractGraphQLMessage(parsed: Record<string, unknown>): {
  content: string;
  senderName: string;
  from: string;
  messageType: string;
  messageId: string;
  subscriptionType: string;
} | null {
  try {
    const extensions = parsed['extensions'] as Record<string, unknown> | undefined;
    const subId = extensions?.['subscriptionCustomIdentifier'] as Record<string, unknown> | undefined;
    const subscriptionType = subId ? Object.keys(subId)[0] || '' : '';
    const requestId = (parsed['requestId'] as string) || '';

    const response = parsed['response'] as Record<string, unknown> | undefined;
    if (!response) return null;

    const msg = findMessageInObject(response);
    if (!msg) return null;

    return {
      content: (msg['content'] as string) || '',
      senderName: (msg['imDisplayName'] as string) || '',
      from: (msg['from'] as string) || (msg['fromUserId'] as string) || '',
      messageType: (msg['messageType'] as string) || '',
      messageId: (msg['id'] as string) || (msg['clientMessageId'] as string) || '',
      subscriptionType: subscriptionType || requestId.split('-')[0] || 'graphql',
    };
  } catch {
    return null;
  }
}

/**
 * Extract display info from a parsed frame.
 */
export function extractFrameInfo(frame: WsFrame): {
  resourceType: string;
  messageType: string;
  senderName: string;
  content: string;
  isFromBot: boolean;
  messageId: string;
} {
  if (frame.sourceType === 'fetch-request') {
    const isInvoke = frame.url.includes('/invoke');
    let content = '';
    if (frame.parsed) {
      content = isInvoke
        ? (frame.parsed['name'] as string) || 'invoke'
        : (frame.parsed['content'] as string) || '';
    }
    return { resourceType: isInvoke ? 'Invoke' : 'SendMessage', messageType: isInvoke ? 'Action' : 'Text', senderName: 'You', content, isFromBot: false, messageId: '' };
  }

  if (frame.sourceType === 'fetch-response') {
    const isInvoke = frame.url.includes('/invoke');
    return { resourceType: isInvoke ? 'InvokeResponse' : 'Response', messageType: isInvoke ? 'Action' : '', senderName: 'Bot', content: '', isFromBot: true, messageId: '' };
  }

  if (!frame.parsed) {
    return { resourceType: 'unknown', messageType: '', senderName: '', content: '', isFromBot: false, messageId: '' };
  }

  // GraphQL Worker message (chatServiceBatchEvent)
  if (frame.parsed['type'] === 'graphql') {
    const msg = extractGraphQLMessage(frame.parsed);
    if (msg) {
      const isFromBot = msg.from.includes('28:');
      return {
        resourceType: msg.subscriptionType || 'GraphQL',
        messageType: msg.messageType,
        senderName: msg.senderName,
        content: msg.content,
        isFromBot,
        messageId: msg.messageId,
      };
    }
    return { resourceType: 'GraphQL', messageType: '', senderName: '', content: '', isFromBot: false, messageId: '' };
  }

  // Trouter frame (legacy path)
  const resourceType = (frame.parsed['resourceType'] as string) || '';
  const resource = frame.parsed['resource'] as Record<string, unknown> | undefined;

  if (!resource) {
    const name = frame.parsed['name'] as string | undefined;
    return { resourceType: name || 'event', messageType: '', senderName: '', content: '', isFromBot: false, messageId: '' };
  }

  const messageType = (resource['messagetype'] as string) || (resource['type'] as string) || '';
  const senderName = (resource['imdisplayname'] as string) || '';
  const content = (resource['content'] as string) || '';
  const from = (resource['from'] as string) || '';
  const isFromBot = from.includes('28:');

  return { resourceType, messageType, senderName, content, isFromBot, messageId: '' };
}

export const useFrameStore = create<FrameStore>()((set) => ({
  frames: [],
  selectedId: null,
  directionFilter: 'all',
  resourceTypeFilter: '',
  searchText: '',

  setSelectedId: (id) => set({ selectedId: id }),

  addFrame: (frame) =>
    set((state) => ({
      frames: [...state.frames, frame],
    })),

  addFrames: (frames) =>
    set((state) => ({
      frames: [...state.frames, ...frames],
    })),

  clear: () => set({ frames: [], selectedId: null }),

  setDirectionFilter: (filter) => set({ directionFilter: filter }),
  setResourceTypeFilter: (filter) => set({ resourceTypeFilter: filter }),
  setSearchText: (text) => set({ searchText: text }),
}));
