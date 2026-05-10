import { useConnectionStore } from '../stores/ConnectionStore';

export function EmptyState() {
  const { botId, isCapturing } = useConnectionStore();

  if (!botId) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">&#128269;</div>
        <h2>Teams Bot Inspector</h2>
        <p>Enter a bot client ID (Azure AD app ID) above to start monitoring WebSocket traffic.</p>
      </div>
    );
  }

  if (!isCapturing) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">&#9654;</div>
        <h2>Ready to capture</h2>
        <p>Click <strong>Capture</strong> to start monitoring traffic for <code>{botId}</code></p>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <div className="empty-state-icon">&#8987;</div>
      <h2>Listening...</h2>
      <p>
        Waiting for WebSocket frames matching <code>{botId}</code>.
        <br />
        Send a message to your bot in Teams to see traffic appear here.
      </p>
    </div>
  );
}
