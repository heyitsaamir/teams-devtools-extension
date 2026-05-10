/**
 * Main-world content script that intercepts:
 * 1. WebSocket frames in the main thread
 * 2. Messages from Web Workers (trouter runs in a Worker)
 * 3. Fetch requests (outgoing user messages)
 *
 * Stores frames in a global array the DevTools panel reads via eval().
 */

(function () {
  const QUEUE_KEY = '__teamsBotInspectorFrames';
  (window as any)[QUEUE_KEY] = [];

  function pushFrame(type: string, direction: string, data: string | null, url: string) {
    try {
      const q = (window as any)[QUEUE_KEY];
      q.push({ type, direction, data, url, timestamp: Date.now() });
      if (q.length > 10000) q.splice(0, q.length - 10000);
    } catch { /* ignore */ }
  }

  // --- WebSocket interception (main thread) ---

  const OriginalWebSocket = window.WebSocket;
  const WebSocketProxy = new Proxy(OriginalWebSocket, {
    construct(target, args: [string | URL, (string | string[])?]) {
      const ws = new target(...args);
      const wsUrl = args[0].toString();

      ws.addEventListener('message', (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          pushFrame('ws-frame', 'incoming', event.data, wsUrl);
        }
      });

      const origSend = ws.send.bind(ws);
      ws.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === 'string') {
          pushFrame('ws-frame', 'outgoing', data, wsUrl);
        }
        return origSend(data);
      };
      return ws;
    },
  });
  Object.defineProperty(WebSocketProxy, 'prototype', {
    value: OriginalWebSocket.prototype,
    writable: false,
  });
  (window as any).WebSocket = WebSocketProxy;

  // --- Worker interception (capture messages FROM workers) ---

  function interceptWorkerMessages(worker: Worker | MessagePort, label: string) {
    worker.addEventListener('message', (event: Event) => {
      try {
        const raw = (event as MessageEvent).data;
        if (!raw) return;

        let dataStr: string;
        if (typeof raw === 'string') {
          dataStr = raw;
        } else if (typeof raw === 'object') {
          dataStr = JSON.stringify(raw);
        } else {
          return;
        }

        pushFrame('worker-message', 'incoming', dataStr, label);
      } catch { /* ignore */ }
    });
  }

  // Patch Worker constructor
  if (window.Worker) {
    const OriginalWorker = window.Worker;
    (window as any).Worker = new Proxy(OriginalWorker, {
      construct(target, args) {
        const worker = new target(...(args as [string | URL]));
        const workerUrl = args[0]?.toString() || 'worker';
        interceptWorkerMessages(worker, workerUrl);
        return worker;
      },
    });
    Object.defineProperty((window as any).Worker, 'prototype', {
      value: OriginalWorker.prototype,
      writable: false,
    });
  }

  // Patch SharedWorker constructor
  if (window.SharedWorker) {
    const OriginalSharedWorker = window.SharedWorker;
    (window as any).SharedWorker = new Proxy(OriginalSharedWorker, {
      construct(target, args) {
        const worker = new target(...(args as [string | URL]));
        const workerUrl = args[0]?.toString() || 'shared-worker';
        interceptWorkerMessages(worker.port, workerUrl);
        worker.port.start();
        return worker;
      },
    });
    Object.defineProperty((window as any).SharedWorker, 'prototype', {
      value: OriginalSharedWorker.prototype,
      writable: false,
    });
  }

  // --- Fetch interception (outgoing user messages) ---

  const originalFetch = window.fetch.bind(window);
  (window as any).fetch = async function (...args: Parameters<typeof fetch>) {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method?.toUpperCase() || 'GET';

    if (method === 'POST' && /\/api\/chatsvc\/.*\/(messages|invoke)/.test(url)) {
      try {
        let bodyText: string | null = null;
        if (init?.body) {
          if (typeof init.body === 'string') bodyText = init.body;
          else if (init.body instanceof Blob) bodyText = await init.body.text();
        }
        pushFrame('fetch-request', 'outgoing', bodyText, url);
      } catch { /* ignore */ }
    }

    const response = await originalFetch(input, init);

    if (method === 'POST' && /\/api\/chatsvc\/.*\/(messages|invoke)/.test(url)) {
      try {
        const clone = response.clone();
        clone.text().then((text) => pushFrame('fetch-response', 'incoming', text, url));
      } catch { /* ignore */ }
    }

    return response;
  };
})();
