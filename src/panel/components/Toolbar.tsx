import { useConnectionStore } from '../stores/ConnectionStore';
import { useFrameStore } from '../stores/FrameStore';

export function Toolbar() {
  const { botId, setBotId, isCapturing, setCapturing, recentBotIds } = useConnectionStore();
  const clear = useFrameStore((s) => s.clear);

  const handleToggleCapture = () => {
    setCapturing(!isCapturing);
  };

  const handleClear = () => {
    clear();
  };

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <label className="toolbar-label" htmlFor="bot-id-input">Bot ID</label>
        <div className="bot-id-wrapper">
          <input
            id="bot-id-input"
            className="bot-id-input"
            type="text"
            placeholder="Optional bot client ID filter..."
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
            disabled={isCapturing}
            list="recent-bot-ids"
          />
          {recentBotIds.length > 0 && (
            <datalist id="recent-bot-ids">
              {recentBotIds.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          )}
        </div>
        <button
          className={`capture-btn ${isCapturing ? 'capturing' : ''}`}
          onClick={handleToggleCapture}
          disabled={false}
        >
          <span className={`status-dot ${isCapturing ? 'active' : ''}`} />
          {isCapturing ? 'Stop' : 'Capture'}
        </button>
        <button className="clear-btn" onClick={handleClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
