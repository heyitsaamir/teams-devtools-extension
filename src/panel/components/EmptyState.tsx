import { useConnectionStore } from '../stores/ConnectionStore';

export function EmptyState() {
  const { botId, isCapturing } = useConnectionStore();

  if (!isCapturing) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">&#9654;</div>
        <h2>Ready to capture</h2>
        <p>
          Click <strong>Capture</strong> to start monitoring Teams traffic.
          {botId ? <> Filtering for <code>{botId}</code>.</> : ' Add a bot client ID above if you want to filter.'}
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
