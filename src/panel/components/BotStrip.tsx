import { extractBotInfo, matchesBotId, useFrameStore } from '../stores/FrameStore';

interface BotSummary {
  id: string;
  name: string;
  count: number;
}

export function BotStrip() {
  const { frames, botFilter, setBotFilter } = useFrameStore();
  const bots = new Map<string, BotSummary>();

  for (const frame of frames) {
    const bot = extractBotInfo(frame);
    if (!bot) continue;

    const existing = bots.get(bot.id);
    if (existing) {
      existing.count += 1;
      if (existing.name === 'Unknown bot' && bot.name) existing.name = bot.name;
    } else {
      bots.set(bot.id, { ...bot, count: 1 });
    }
  }

  const botList = [...bots.values()].sort((a, b) => a.name.localeCompare(b.name));
  const visibleFrameCount = botFilter
    ? frames.filter((frame) => matchesBotId({ parsed: frame.parsed, rawData: frame.rawData, envelope: frame.envelope, url: frame.url }, botFilter)).length
    : frames.length;

  return (
    <div className="bot-strip">
      <span className="bot-strip-label">Bots</span>
      <button
        className={`bot-chip all ${!botFilter ? 'active' : ''}`}
        onClick={() => setBotFilter('')}
        title="Show all captured traffic"
      >
        All <span className="bot-chip-count">{frames.length}</span>
      </button>
      <div className="bot-chip-list">
        {botList.length === 0 ? (
          <span className="bot-strip-empty">No bots detected yet</span>
        ) : (
          botList.map((bot) => (
            <button
              key={bot.id}
              className={`bot-chip ${botFilter === bot.id ? 'active' : ''}`}
              onClick={() => setBotFilter(bot.id)}
              title={bot.id}
            >
              <span className="bot-chip-name">{bot.name}</span>
              <span className="bot-chip-count">{bot.count}</span>
            </button>
          ))
        )}
      </div>
      {botFilter && (
        <span className="bot-filter-status">
          showing {visibleFrameCount} matching frame{visibleFrameCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
