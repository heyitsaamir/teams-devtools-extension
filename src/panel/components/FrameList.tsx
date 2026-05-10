import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  useFrameStore,
  extractFrameInfo,
  type WsFrame,
} from '../stores/FrameStore';
import { filterFrames } from './FilterBar';

export function FrameList() {
  const { frames, selectedId, directionFilter, resourceTypeFilter, searchText, setSelectedId } = useFrameStore();
  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevFrameCount = useRef(frames.length);

  const filtered = filterFrames(frames, directionFilter, resourceTypeFilter, searchText);

  useEffect(() => {
    if (frames.length > prevFrameCount.current && shouldAutoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevFrameCount.current = frames.length;
  }, [frames.length]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  if (filtered.length === 0) {
    return (
      <div className="frame-list-empty">
        <span className="empty-text">No matching frames</span>
      </div>
    );
  }

  return (
    <div className="frame-list" ref={listRef} onScroll={handleScroll}>
      <table className="frame-table">
        <thead>
          <tr>
            <th className="col-index">#</th>
            <th className="col-dir">Dir</th>
            <th className="col-resource-type">Event</th>
            <th className="col-from">From</th>
            <th className="col-content">Content</th>
            <th className="col-time">Time</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((frame, i) => (
            <FrameRow
              key={frame.id}
              frame={frame}
              index={i + 1}
              selected={frame.id === selectedId}
              onSelect={() => setSelectedId(frame.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FrameRow({
  frame,
  index,
  selected,
  onSelect,
}: {
  frame: WsFrame;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const info = extractFrameInfo(frame);
  const time = format(new Date(frame.timestamp), 'HH:mm:ss.SSS');

  // Strip HTML tags for preview
  const contentPreview = info.content.replace(/<[^>]*>/g, '').slice(0, 60);

  return (
    <tr
      className={`frame-row ${selected ? 'selected' : ''} ${info.isFromBot ? 'from-bot' : 'from-user'}`}
      onClick={onSelect}
    >
      <td className="col-index">{index}</td>
      <td className="col-dir">
        <span className={`dir-arrow ${info.isFromBot ? 'from-bot' : 'from-user'}`}>
          {info.isFromBot ? '\u2191' : '\u2193'}
        </span>
      </td>
      <td className="col-resource-type">
        <span className="resource-type-badge">{info.resourceType}</span>
      </td>
      <td className="col-from" title={info.senderName}>{info.senderName}</td>
      <td className="col-content" title={contentPreview}>{contentPreview}</td>
      <td className="col-time">{time}</td>
    </tr>
  );
}
