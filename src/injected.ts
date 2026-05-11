/**
 * Main-world content script that intercepts:
 * 1. WebSocket frames in the main thread
 * 2. Messages from Web Workers (trouter runs in a Worker)
 *
 * Stores frames in a global array the DevTools panel reads via eval().
 */

(function () {
  const QUEUE_KEY = '__teamsBotInspectorFrames';
  (window as any)[QUEUE_KEY] = [];

  function pushFrame(type: string, direction: string, data: string | null, url: string, timestamp = Date.now()) {
    try {
      const q = (window as any)[QUEUE_KEY];
      q.push({ type, direction, data, url, timestamp });
      if (q.length > 10000) q.splice(0, q.length - 10000);
    } catch { /* ignore */ }
  }

  function stringifyWireData(data: unknown): string | null {
    try {
      if (typeof data === 'string') return data;
      if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
      if (ArrayBuffer.isView(data)) {
        return new TextDecoder().decode(data as ArrayBufferView<ArrayBuffer>);
      }
    } catch { /* ignore */ }
    return null;
  }

  // --- WebSocket interception (main thread) ---

  const OriginalWebSocket = window.WebSocket;
  const WebSocketProxy = new Proxy(OriginalWebSocket, {
    construct(target, args: [string | URL, (string | string[])?]) {
      const ws = new target(...args);
      const wsUrl = args[0].toString();

      ws.addEventListener('message', (event: MessageEvent) => {
        const data = stringifyWireData(event.data);
        if (data != null) pushFrame('ws-frame', 'incoming', data, wsUrl);
      });

      const origSend = ws.send.bind(ws);
      ws.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        const dataStr = stringifyWireData(data);
        if (dataStr != null) pushFrame('ws-frame', 'outgoing', dataStr, wsUrl);
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
})();
