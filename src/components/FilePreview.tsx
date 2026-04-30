import { useState, useEffect, useRef } from "react";

import ReactMarkdown from "react-markdown";
import hljs from "highlight.js";

import "./FilePreview.css";

type FilePreviewProps = {
  filePath: string;
};

type PreviewType =
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "markdown"
  | "csv"
  | "json"
  | "text"
  | "unknown";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "aac"];
const VIDEO_EXTS = ["mp4", "webm", "mov", "avi"];
const PDF_EXTS = ["pdf"];
const MARKDOWN_EXTS = ["md", "markdown"];
const CSV_EXTS = ["csv", "tsv"];
const JSON_EXTS = ["json"];
const TEXT_EXTS = [
  "txt",
  "ts",
  "tsx",
  "js",
  "jsx",
  "jsonc",
  "yaml",
  "yml",
  "toml",
  "sh",
  "bash",
  "py",
  "rb",
  "go",
  "rs",
  "c",
  "cpp",
  "h",
  "css",
  "html",
  "xml",
  "sql",
  "env",
  "gitignore",
  "dockerfile",
];

function detectPreviewType(filePath: string): PreviewType {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (PDF_EXTS.includes(ext)) return "pdf";
  if (MARKDOWN_EXTS.includes(ext)) return "markdown";
  if (CSV_EXTS.includes(ext)) return "csv";
  if (JSON_EXTS.includes(ext)) return "json";
  if (TEXT_EXTS.includes(ext)) return "text";
  return "unknown";
}

const FILE_URL_BASE = "/api/file?path=";

function fileUrl(filePath: string): string {
  return `${FILE_URL_BASE}${encodeURIComponent(filePath)}`;
}

/**
 * FilePreview
 *
 * Renders a preview of a file from .openclaw/shared based on its extension.
 */
export function FilePreview({ filePath }: FilePreviewProps): JSX.Element {
  const type = detectPreviewType(filePath);
  const url = fileUrl(filePath);

  switch (type) {
    case "image":
      return <ImagePreview url={url} name={filePath} />;
    case "audio":
      return <AudioPreview url={url} />;
    case "video":
      return <VideoPreview url={url} />;
    case "pdf":
      return <PdfPreview url={url} />;
    case "markdown":
      return <MarkdownPreview url={url} />;
    case "csv":
      return <CsvPreview url={url} filePath={filePath} />;
    case "json":
      return <JsonPreview url={url} />;
    case "text":
      return <TextPreview url={url} filePath={filePath} />;
    default:
      return (
        <div className="file-preview file-preview--unknown">
          <p>No preview available for this file type.</p>
          <a href={url} download className="file-preview__download">
            Download file
          </a>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImagePreview({
  url,
  name,
}: {
  url: string;
  name: string;
}): JSX.Element {
  return (
    <div className="file-preview file-preview--image">
      <img src={url} alt={name} className="file-preview__image" />
    </div>
  );
}

function AudioPreview({ url }: { url: string }): JSX.Element {
  return (
    <div className="file-preview file-preview--audio">
      <audio controls src={url} className="file-preview__audio" />
    </div>
  );
}

function VideoPreview({ url }: { url: string }): JSX.Element {
  return (
    <div className="file-preview file-preview--video">
      <video controls src={url} className="file-preview__video" />
    </div>
  );
}

function PdfPreview({ url }: { url: string }): JSX.Element {
  return (
    <div className="file-preview file-preview--pdf">
      <embed src={url} type="application/pdf" className="file-preview__pdf" />
    </div>
  );
}

function MarkdownPreview({ url }: { url: string }): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(null);
    setRawMode(false);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setContent)
      .catch((err: unknown) => setError(String(err)));
  }, [url]);

  if (error) return <p className="file-preview__error">{error}</p>;
  if (content === null)
    return <p className="file-preview__loading">Loading…</p>;

  return (
    <div className="file-preview file-preview--markdown">
      <div className="file-preview-md__toolbar">
        <button
          className={`file-preview-md__toggle${rawMode ? " file-preview-md__toggle--active" : ""}`}
          onClick={() => setRawMode((v) => !v)}
          title={rawMode ? "Switch to rendered view" : "Switch to raw text"}
        >
          {rawMode ? "Rendered" : "Raw"}
        </button>
      </div>
      {rawMode ? (
        <pre className="file-preview__code file-preview-md__raw file-preview-md__content">
          <code>{content}</code>
        </pre>
      ) : (
        <div className="file-preview-md__content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function TextPreview({
  url,
  filePath,
}: {
  url: string;
  filePath: string;
}): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setContent)
      .catch((err: unknown) => setError(String(err)));
  }, [url]);

  if (error) return <p className="file-preview__error">{error}</p>;
  if (content === null)
    return <p className="file-preview__loading">Loading…</p>;

  const ext = filePath.split(".").pop() ?? "plaintext";
  let highlighted: string;
  try {
    highlighted = hljs.highlight(content, {
      language: ext,
      ignoreIllegals: true,
    }).value;
  } catch {
    highlighted = hljs.highlightAuto(content).value;
  }

  return (
    <div className="file-preview file-preview--text">
      <pre className="file-preview__code hljs">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

type JsonObject = {
  [key: string]: JsonValue;
};

function JsonPreview({ url }: { url: string }): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Record<string, boolean>>(
    {},
  );
  const [rawMode, setRawMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  useEffect(() => {
    setContent(null);
    setError(null);
    setCollapsedPaths({});
    setRawMode(false);
    setCompactMode(false);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setContent)
      .catch((err: unknown) => setError(String(err)));
  }, [url]);

  if (error) return <p className="file-preview__error">{error}</p>;
  if (content === null)
    return <p className="file-preview__loading">Loading…</p>;

  let value: JsonValue;
  try {
    value = JSON.parse(content) as JsonValue;
  } catch {
    return (
      <div className="file-preview file-preview--text">
        <pre className="file-preview__code hljs">
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  if (rawMode) {
    return (
      <div className="file-preview file-preview--json">
        <div className="file-preview-json__toolbar">
          <button
            className="file-preview-json__toggle"
            onClick={() => setRawMode(false)}
          >
            Preview
          </button>
          <button
            className="file-preview-json__toggle file-preview-json__toggle--active"
            onClick={() => setRawMode(true)}
          >
            Raw
          </button>
        </div>
        <pre className="file-preview__code file-preview-json__raw">
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  if (compactMode) {
    return (
      <div className="file-preview file-preview--json">
        <div className="file-preview-json__toolbar">
          <button
            className="file-preview-json__toggle file-preview-json__toggle--active"
            onClick={() => setCompactMode(false)}
          >
            Preview
          </button>
          <button className="file-preview-json__toggle" onClick={() => setRawMode(true)}>
            Raw
          </button>
          <button
            className="file-preview-json__toggle file-preview-json__toggle--active"
            onClick={() => setCompactMode((prev) => !prev)}
          >
            Compact
          </button>
        </div>
        <pre className="file-preview__code file-preview-json__raw">
          <code>{JSON.stringify(value)}</code>
        </pre>
      </div>
    );
  }

  const togglePath = (path: string): void => {
    setCollapsedPaths((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const setAllExpanded = (): void => {
    setCollapsedPaths({});
  };

  const setAllCollapsed = (): void => {
    setCollapsedPaths(buildCollapsedPathMap(value));
  };

  return (
    <div className="file-preview file-preview--json">
      <div className="file-preview-json__toolbar">
        <button
          className="file-preview-json__toggle file-preview-json__toggle--active"
          onClick={() => setRawMode(false)}
        >
          Preview
        </button>
        <button className="file-preview-json__toggle" onClick={() => setRawMode(true)}>
          Raw
        </button>
        <button className="file-preview-json__toggle" onClick={setAllExpanded}>
          Expand all
        </button>
        <button className="file-preview-json__toggle" onClick={setAllCollapsed}>
          Collapse all
        </button>
        <button
          className={`file-preview-json__toggle${compactMode ? " file-preview-json__toggle--active" : ""}`}
          onClick={() => setCompactMode((prev) => !prev)}
        >
          Compact
        </button>
      </div>
      <div className="file-preview-json__content">
        <JsonNode
          value={value}
          path="root"
          depth={0}
          collapsedPaths={collapsedPaths}
          onToggle={togglePath}
        />
      </div>
    </div>
  );
}

function buildCollapsedPathMap(
  value: JsonValue,
  path = "root",
): Record<string, boolean> {
  if (!isJsonContainer(value)) {
    return {};
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);

  return entries.reduce<Record<string, boolean>>((acc, [key, child]) => {
    const childPath = `${path}.${key}`;
    if (isJsonContainer(child)) {
      acc[childPath] = true;
      Object.assign(acc, buildCollapsedPathMap(child, childPath));
    }
    return acc;
  }, {});
}

function JsonNode({
  value,
  path,
  depth,
  label,
  collapsedPaths,
  onToggle,
}: {
  value: JsonValue;
  path: string;
  depth: number;
  label?: string;
  collapsedPaths: Record<string, boolean>;
  onToggle: (path: string) => void;
}): JSX.Element {
  const collapsed = collapsedPaths[path] ?? false;

  if (Array.isArray(value)) {
    return (
      <div className="file-preview-json__node" style={{ marginLeft: depth * 18 }}>
        <div className="file-preview-json__line">
          <button
            className="file-preview-json__caret"
            onClick={() => onToggle(path)}
            aria-label={collapsed ? "Expand array" : "Collapse array"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          {label !== undefined && (
            <span className="file-preview-json__key">"{label}"</span>
          )}
          {label !== undefined && <span className="file-preview-json__punct">: </span>}
          {collapsed ? (
            <span className="file-preview-json__summary">
              [{value.length} item{value.length === 1 ? "" : "s"}]
            </span>
          ) : (
            <span className="file-preview-json__punct">[</span>
          )}
        </div>
        {!collapsed && (
          <>
            {value.map((item, index) => (
              <JsonNode
                key={`${path}.${index}`}
                value={item}
                path={`${path}.${index}`}
                depth={depth + 1}
                label={String(index)}
                collapsedPaths={collapsedPaths}
                onToggle={onToggle}
              />
            ))}
            <div
              className="file-preview-json__line"
              style={{ marginLeft: depth * 18 }}
            >
              <span className="file-preview-json__spacer" />
              <span className="file-preview-json__punct">]</span>
            </div>
          </>
        )}
      </div>
    );
  }

  if (isJsonObject(value)) {
    const entries = Object.entries(value);
    return (
      <div className="file-preview-json__node" style={{ marginLeft: depth * 18 }}>
        <div className="file-preview-json__line">
          <button
            className="file-preview-json__caret"
            onClick={() => onToggle(path)}
            aria-label={collapsed ? "Expand object" : "Collapse object"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          {label !== undefined && (
            <span className="file-preview-json__key">"{label}"</span>
          )}
          {label !== undefined && <span className="file-preview-json__punct">: </span>}
          {collapsed ? (
            <span className="file-preview-json__summary">
              {`{${entries.length} key${entries.length === 1 ? "" : "s"}}`}
            </span>
          ) : (
            <span className="file-preview-json__punct">{"{"}</span>
          )}
        </div>
        {!collapsed && (
          <>
            {entries.map(([key, childValue]) => (
              <JsonNode
                key={`${path}.${key}`}
                value={childValue}
                path={`${path}.${key}`}
                depth={depth + 1}
                label={key}
                collapsedPaths={collapsedPaths}
                onToggle={onToggle}
              />
            ))}
            <div
              className="file-preview-json__line"
              style={{ marginLeft: depth * 18 }}
            >
              <span className="file-preview-json__spacer" />
              <span className="file-preview-json__punct">{"}"}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="file-preview-json__line" style={{ marginLeft: depth * 18 }}>
      <span className="file-preview-json__spacer" />
      {label !== undefined && (
        <span className="file-preview-json__key">"{label}"</span>
      )}
      {label !== undefined && <span className="file-preview-json__punct">: </span>}
      <JsonPrimitive value={value} />
    </div>
  );
}

function JsonPrimitive({ value }: { value: null | boolean | number | string }): JSX.Element {
  if (value === null) {
    return <span className="file-preview-json__null">null</span>;
  }

  if (typeof value === "string") {
    return <span className="file-preview-json__string">"{value}"</span>;
  }

  if (typeof value === "number") {
    return <span className="file-preview-json__number">{value}</span>;
  }

  return <span className="file-preview-json__boolean">{String(value)}</span>;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonContainer(value: JsonValue): value is JsonObject | JsonValue[] {
  return Array.isArray(value) || isJsonObject(value);
}

// ---------------------------------------------------------------------------
// CSV / TSV preview
// ---------------------------------------------------------------------------

/**
 * Parse CSV/TSV text into a 2-D array of strings.
 * Handles quoted fields (including embedded commas and newlines) per RFC 4180.
 */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead — escaped quote?
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r" || ch === "\n") {
      row.push(field);
      field = "";
      // Skip \r\n pair
      if (ch === "\r" && text[i + 1] === "\n") i++;
      rows.push(row);
      row = [];
      i++;
    } else {
      field += ch;
      i++;
    }
  }

  // Last field / row
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing empty row that many editors append
  if (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }

  return rows;
}

const MAX_ROWS = 2000;
const MIN_CSV_COLUMN_WIDTH = 80;

type CsvColumnResizeState = {
  columnIndex: number;
  startX: number;
  startWidth: number;
};

function CsvPreview({
  url,
  filePath,
}: {
  url: string;
  filePath: string;
}): JSX.Element {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const resizeStateRef = useRef<CsvColumnResizeState | null>(null);

  useEffect(() => {
    setRaw(null);
    setError(null);
    setRawMode(false);
    setColumnWidths([]);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setRaw)
      .catch((err: unknown) => setError(String(err)));
  }, [url]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const nextWidth = Math.max(
        MIN_CSV_COLUMN_WIDTH,
        resizeState.startWidth + (event.clientX - resizeState.startX),
      );

      setColumnWidths((prev) => {
        if (prev[resizeState.columnIndex] === nextWidth) {
          return prev;
        }

        const next = [...prev];
        next[resizeState.columnIndex] = nextWidth;
        return next;
      });
    };

    const handlePointerUp = (): void => {
      resizeStateRef.current = null;
      document.body.classList.remove("file-preview-csv--resizing");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("file-preview-csv--resizing");
    };
  }, []);

  if (error) return <p className="file-preview__error">{error}</p>;
  if (raw === null) return <p className="file-preview__loading">Loading…</p>;

  const isTsv = filePath.toLowerCase().endsWith(".tsv");
  const delimiter = isTsv ? "\t" : ",";
  const rows = parseCsv(raw, delimiter);
  const truncated = rows.length > MAX_ROWS;
  const visibleRows = truncated ? rows.slice(0, MAX_ROWS) : rows;
  const [headerRow, ...dataRows] = visibleRows;
  const columnCount = visibleRows.reduce(
    (maxColumns, row) => Math.max(maxColumns, row.length),
    0,
  );

  const startColumnResize = (
    columnIndex: number,
    clientX: number,
    headerCell: HTMLTableCellElement | null,
  ): void => {
    if (!headerCell) {
      return;
    }

    resizeStateRef.current = {
      columnIndex,
      startX: clientX,
      startWidth: headerCell.getBoundingClientRect().width,
    };
    document.body.classList.add("file-preview-csv--resizing");
  };

  return (
    <div className="file-preview file-preview--csv">
      <div className="file-preview-csv__toolbar">
        <span className="file-preview-csv__meta">
          {rows.length.toLocaleString()} row{rows.length !== 1 ? "s" : ""}
          {headerRow
            ? ` · ${headerRow.length.toLocaleString()} col${headerRow.length !== 1 ? "s" : ""}`
            : ""}
          {truncated ? ` · showing first ${MAX_ROWS.toLocaleString()}` : ""}
        </span>
        <button
          className="file-preview-csv__toggle"
          onClick={() => setRawMode((v) => !v)}
        >
          {rawMode ? "Table view" : "Raw text"}
        </button>
      </div>

      {rawMode ? (
        <pre className="file-preview__code file-preview-csv__raw">
          <code>{raw}</code>
        </pre>
      ) : (
        <div className="file-preview-csv__scroll">
          <table className="file-preview-csv__table">
            <colgroup>
              <col className="file-preview-csv__row-num-col" />
              {Array.from({ length: columnCount }, (_, ci) => (
                <col
                  key={ci}
                  style={
                    columnWidths[ci] !== undefined
                      ? { width: columnWidths[ci] }
                      : undefined
                  }
                />
              ))}
            </colgroup>
            {headerRow && (
              <thead>
                <tr>
                  <th className="file-preview-csv__row-num" aria-label="Row" />
                  {headerRow.map((cell, ci) => (
                    <th
                      key={ci}
                      title={cell}
                      style={
                        columnWidths[ci] !== undefined
                          ? {
                              width: columnWidths[ci],
                              minWidth: columnWidths[ci],
                              maxWidth: columnWidths[ci],
                            }
                          : undefined
                      }
                    >
                      {cell}
                      <div
                        className="file-preview-csv__resize-handle"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startColumnResize(
                            ci,
                            event.clientX,
                            event.currentTarget.parentElement instanceof
                              HTMLTableCellElement
                              ? event.currentTarget.parentElement
                              : null,
                          );
                        }}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${cell || `column ${ci + 1}`}`}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {dataRows.map((rowCells, ri) => (
                <tr key={ri}>
                  <td className="file-preview-csv__row-num">{ri + 1}</td>
                  {rowCells.map((cell, ci) => (
                    <td
                      key={ci}
                      title={cell}
                      style={
                        columnWidths[ci] !== undefined
                          ? {
                              width: columnWidths[ci],
                              minWidth: columnWidths[ci],
                              maxWidth: columnWidths[ci],
                            }
                          : undefined
                      }
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
