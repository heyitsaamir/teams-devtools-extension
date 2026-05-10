import { useState } from 'react';

interface JsonTreeProps {
  data: unknown;
  defaultExpanded?: boolean;
}

export function JsonTree({ data, defaultExpanded = true }: JsonTreeProps) {
  return (
    <div className="json-tree">
      <JsonValue value={data} depth={0} defaultExpanded={defaultExpanded} />
    </div>
  );
}

function JsonValue({
  value,
  depth,
  defaultExpanded,
}: {
  value: unknown;
  depth: number;
  defaultExpanded: boolean;
}) {
  if (value === null) return <span className="json-null">null</span>;
  if (value === undefined) return <span className="json-null">undefined</span>;

  switch (typeof value) {
    case 'string':
      return <span className="json-string">"{value}"</span>;
    case 'number':
      return <span className="json-number">{String(value)}</span>;
    case 'boolean':
      return <span className="json-boolean">{String(value)}</span>;
    case 'object':
      if (Array.isArray(value)) {
        return <JsonArray items={value} depth={depth} defaultExpanded={defaultExpanded} />;
      }
      return <JsonObject obj={value as Record<string, unknown>} depth={depth} defaultExpanded={defaultExpanded} />;
    default:
      return <span>{String(value)}</span>;
  }
}

function JsonObject({
  obj,
  depth,
  defaultExpanded,
}: {
  obj: Record<string, unknown>;
  depth: number;
  defaultExpanded: boolean;
}) {
  const entries = Object.entries(obj);
  const [expanded, setExpanded] = useState(depth < 2 && defaultExpanded);

  if (entries.length === 0) return <span className="json-bracket">{'{}'}</span>;

  if (!expanded) {
    return (
      <span className="json-collapsed" onClick={() => setExpanded(true)}>
        <span className="json-toggle">&#9654;</span>
        <span className="json-bracket">{'{'}</span>
        <span className="json-ellipsis">{entries.length} keys</span>
        <span className="json-bracket">{'}'}</span>
      </span>
    );
  }

  return (
    <span className="json-expanded">
      <span className="json-toggle" onClick={() => setExpanded(false)}>&#9660;</span>
      <span className="json-bracket">{'{'}</span>
      <div className="json-indent">
        {entries.map(([key, val]) => (
          <div key={key} className="json-entry">
            <span className="json-key">{key}</span>
            <span className="json-colon">: </span>
            <JsonValue value={val} depth={depth + 1} defaultExpanded={defaultExpanded} />
          </div>
        ))}
      </div>
      <span className="json-bracket">{'}'}</span>
    </span>
  );
}

function JsonArray({
  items,
  depth,
  defaultExpanded,
}: {
  items: unknown[];
  depth: number;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2 && defaultExpanded);

  if (items.length === 0) return <span className="json-bracket">[]</span>;

  if (!expanded) {
    return (
      <span className="json-collapsed" onClick={() => setExpanded(true)}>
        <span className="json-toggle">&#9654;</span>
        <span className="json-bracket">[</span>
        <span className="json-ellipsis">{items.length} items</span>
        <span className="json-bracket">]</span>
      </span>
    );
  }

  return (
    <span className="json-expanded">
      <span className="json-toggle" onClick={() => setExpanded(false)}>&#9660;</span>
      <span className="json-bracket">[</span>
      <div className="json-indent">
        {items.map((item, i) => (
          <div key={i} className="json-entry">
            <span className="json-index">{i}: </span>
            <JsonValue value={item} depth={depth + 1} defaultExpanded={defaultExpanded} />
          </div>
        ))}
      </div>
      <span className="json-bracket">]</span>
    </span>
  );
}
