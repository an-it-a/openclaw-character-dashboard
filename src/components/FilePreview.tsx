import { useState, useEffect } from "react";

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
  | "text"
  | "unknown";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "aac"];
const VIDEO_EXTS = ["mp4", "webm", "mov", "avi"];
const PDF_EXTS = ["pdf"];
const MARKDOWN_EXTS = ["md", "markdown"];
const CSV_EXTS = ["csv", "tsv"];
const TEXT_EXTS = [
  "txt",
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
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
        <pre className="file-preview__code file-preview-md__raw">
          <code>{content}</code>
        </pre>
      ) : (
        <ReactMarkdown>{content}</ReactMarkdown>
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

  useEffect(() => {
    setRaw(null);
    setError(null);
    setRawMode(false);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setRaw)
      .catch((err: unknown) => setError(String(err)));
  }, [url]);

  if (error) return <p className="file-preview__error">{error}</p>;
  if (raw === null) return <p className="file-preview__loading">Loading…</p>;

  const isTsv = filePath.toLowerCase().endsWith(".tsv");
  const delimiter = isTsv ? "\t" : ",";
  const rows = parseCsv(raw, delimiter);
  const truncated = rows.length > MAX_ROWS;
  const visibleRows = truncated ? rows.slice(0, MAX_ROWS) : rows;
  const [headerRow, ...dataRows] = visibleRows;

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
            {headerRow && (
              <thead>
                <tr>
                  <th className="file-preview-csv__row-num" aria-label="Row" />
                  {headerRow.map((cell, ci) => (
                    <th key={ci} title={cell}>
                      {cell}
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
                    <td key={ci} title={cell}>
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
