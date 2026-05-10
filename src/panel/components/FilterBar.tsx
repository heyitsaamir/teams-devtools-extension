import { useFrameStore, extractFrameInfo, type DirectionFilter, type WsFrame } from '../stores/FrameStore';

export function FilterBar() {
  const { frames, directionFilter, resourceTypeFilter, searchText, setDirectionFilter, setResourceTypeFilter, setSearchText } =
    useFrameStore();

  // Collect unique resource types from captured frames
  const resourceTypes = [...new Set(frames.map((f) => extractFrameInfo(f).resourceType))].sort();

  const filteredCount = filterFrames(frames, directionFilter, resourceTypeFilter, searchText).length;

  return (
    <div className="filter-bar">
      <select
        className="filter-select"
        value={directionFilter}
        onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
      >
        <option value="all">All</option>
        <option value="incoming">From Bot</option>
        <option value="outgoing">To Bot</option>
      </select>
      <select
        className="filter-select"
        value={resourceTypeFilter}
        onChange={(e) => setResourceTypeFilter(e.target.value)}
      >
        <option value="">All Events</option>
        {resourceTypes.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <input
        className="search-input"
        type="text"
        placeholder="Search content..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      <span className="frame-count">{filteredCount} frames</span>
    </div>
  );
}

export function filterFrames(
  frames: WsFrame[],
  directionFilter: string,
  resourceTypeFilter: string,
  searchText: string
): WsFrame[] {
  return frames.filter((f) => {
    if (directionFilter !== 'all') {
      const info = extractFrameInfo(f);
      if (directionFilter === 'incoming' && !info.isFromBot) return false;
      if (directionFilter === 'outgoing' && info.isFromBot) return false;
    }
    if (resourceTypeFilter) {
      const info = extractFrameInfo(f);
      if (info.resourceType !== resourceTypeFilter) return false;
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      if (!f.rawData?.toLowerCase().includes(lower)) return false;
    }
    return true;
  });
}
