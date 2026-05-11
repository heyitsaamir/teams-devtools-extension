import { useConnectionStore } from '../stores/ConnectionStore';

export function EmptyState() {
  const { botId, isCapturing, setCapturing } = useConnectionStore();

  if (!isCapturing) {
    return (
      <div className="empty-state">
        <button className="empty-capture-btn" onClick={() => setCapturing(true)} aria-label="Start capture">
          <span className="empty-capture-dot" />
        </button>
        <div className="empty-capture-label">Capture</div>
        <h2>Ready to monitor Teams traffic</h2>
        <p>
          {botId ? <>Filtering for <code>{botId}</code>.</> : 'Add a bot client ID above if you want to filter first.'}
        </p>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <div className="empty-state-icon">&#8987;</div>
      <h2>Listening...</h2>
      <p>
        {botId ? <>Waiting for traffic matching <code>{botId}</code>.</> : 'Waiting for Teams traffic.'}
        <br />
        Send or receive a message in Teams to see traffic appear here.
      </p>
    </div>
  );
}
