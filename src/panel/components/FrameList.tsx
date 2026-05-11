import { Fragment, type MouseEvent, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  useFrameStore,
  extractFrameInfo,
  type WsFrame,
} from '../stores/FrameStore';
import { filterFrames } from './FilterBar';

interface HierarchyGroup {
  messageId: string;
  frames: WsFrame[];
}

type HierarchyItem = WsFrame | HierarchyGroup;

function isHierarchyGroup(item: HierarchyItem): item is HierarchyGroup {
  return 'frames' in item;
}

function buildHierarchy(frames: WsFrame[]): HierarchyItem[] {
  const counts = new Map<string, number>();
  for (const frame of frames) {
    const messageId = extractFrameInfo(frame).messageId;
    if (!messageId) continue;
    counts.set(messageId, (counts.get(messageId) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const items: HierarchyItem[] = [];

  for (const frame of frames) {
    const messageId = extractFrameInfo(frame).messageId;
    if (!messageId || (counts.get(messageId) ?? 0) < 2) {
      items.push(frame);
      continue;
    }

    if (seen.has(messageId)) continue;
    seen.add(messageId);
    items.push({ messageId, frames: frames.filter((candidate) => extractFrameInfo(candidate).messageId === messageId) });
  }

  return items;
}

export function FrameList() {
  const { frames, selectedId, compareIds, directionFilter, resourceTypeFilter, searchText, botFilter, setSelectedId, setCompareIds } = useFrameStore();
  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevFrameCount = useRef(frames.length);

  const filtered = filterFrames(frames, directionFilter, resourceTypeFilter, searchText, botFilter);
  const hierarchy = buildHierarchy(filtered);

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

  const handleSelect = (frameId: string, event: MouseEvent<HTMLTableRowElement>) => {
    setSelectedId(frameId);

    if (event.metaKey || event.ctrlKey) {
      const nextIds = compareIds.includes(frameId)
        ? compareIds.filter((id) => id !== frameId)
        : [...compareIds, frameId].slice(-2);
      setCompareIds(nextIds.length ? nextIds : [frameId]);
      return;
    }

    setCompareIds([frameId]);
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
          {hierarchy.map((item, i) => {
            if (!isHierarchyGroup(item)) {
              return (
                <FrameRow
                  key={item.id}
                  frame={item}
                  index={i + 1}
                  selected={item.id === selectedId}
                  compareSelected={compareIds.includes(item.id)}
                  onSelect={(event) => handleSelect(item.id, event)}
                />
              );
            }

            const [parent, ...children] = item.frames;
            return (
              <Fragment key={item.messageId}>
                <FrameRow
                  key={parent.id}
                  frame={parent}
                  index={i + 1}
                  selected={parent.id === selectedId}
                  compareSelected={compareIds.includes(parent.id)}
                  onSelect={(event) => handleSelect(parent.id, event)}
                  groupSize={item.frames.length}
                />
                {children.map((child) => (
                  <FrameRow
                    key={child.id}
                    frame={child}
                    index={i + 1}
                    selected={child.id === selectedId}
                    compareSelected={compareIds.includes(child.id)}
                    onSelect={(event) => handleSelect(child.id, event)}
                    depth={1}
                  />
                ))}
              </Fragment>
            );
          })}
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
  compareSelected,
  depth = 0,
  groupSize,
}: {
  frame: WsFrame;
  index: number;
  selected: boolean;
  compareSelected: boolean;
  onSelect: (event: MouseEvent<HTMLTableRowElement>) => void;
  depth?: number;
  groupSize?: number;
}) {
  const info = extractFrameInfo(frame);
  const time = format(new Date(frame.timestamp), 'HH:mm:ss.SSS');

  // Strip HTML tags for preview
  const contentPreview = info.content.replace(/<[^>]*>/g, '').slice(0, 60);

  return (
    <tr
      className={`frame-row ${selected ? 'selected' : ''} ${compareSelected ? 'compare-selected' : ''} ${info.isFromBot ? 'from-bot' : 'from-user'} ${depth > 0 ? 'child-row' : ''} ${groupSize ? 'parent-row' : ''}`}
      onClick={onSelect}
    >
      <td className="col-index">
        {depth > 0 ? <span className="tree-branch">↳</span> : index}
      </td>
      <td className="col-dir">
        <span className={`dir-arrow ${info.isFromBot ? 'from-bot' : 'from-user'}`}>
          {info.isFromBot ? '\u2191' : '\u2193'}
        </span>
      </td>
      <td className="col-resource-type">
        {depth > 0 && <span className="tree-indent" />}
        <span className="resource-type-badge">{info.resourceType}</span>
        {groupSize && <span className="group-count">{groupSize}</span>}
      </td>
      <td className="col-from" title={info.senderName}>{info.senderName}</td>
      <td className="col-content" title={contentPreview}>{contentPreview}</td>
      <td className="col-time">{time}</td>
    </tr>
  );
}
