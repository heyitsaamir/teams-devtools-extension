/**
 * Isolated-world content script that bridges messages from the main-world
 * injected script to the background service worker.
 */

const MESSAGE_SOURCE = 'teams-bot-inspector';

let port: chrome.runtime.Port | null = null;

function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function ensurePort(): boolean {
  if (port) return true;
  if (!isContextValid()) return false;

  try {
    port = chrome.runtime.connect({ name: 'content-script' });
    port.onDisconnect.addListener(() => { port = null; });
    return true;
  } catch {
    port = null;
    return false;
  }
}

// Connect eagerly at load time
ensurePort();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== MESSAGE_SOURCE) return;

  if (!ensurePort()) return;

  try {
    port!.postMessage(event.data);
  } catch {
    port = null;
  }
});
