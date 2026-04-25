import { useState, useEffect, useCallback, useRef } from "react";

import { useWorldStore } from "@/store/worldStore";
import { FilePreview } from "@/components/FilePreview";

import "./ResourceWallOverlay.css";

type FileEntry = {
  name: string;
  type: "file" | "dir";
};

type FilesResponse = {
  path: string;
  entries: FileEntry[];
};

const API_BASE = "";

async function fetchEntries(relPath: string): Promise<FilesResponse> {
  const res = await fetch(
    `${API_BASE}/api/files?path=${encodeURIComponent(relPath)}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<FilesResponse>;
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 780;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 320;
const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 22;

/**
 * ResourceWallOverlay
 *
 * Full-screen modal opened when the user clicks the resource-wall object.
 * Provides breadcrumb navigation through .openclaw/shared and previews files.
 * Panel size is adjustable via a bottom-right drag handle.
 * Font size is adjustable via − / + buttons in the header.
 */
export function ResourceWallOverlay(): JSX.Element | null {
  const selection = useWorldStore((s) => s.inspectorSelection);
  const setSelection = useWorldStore((s) => s.setInspectorSelection);

  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Panel dimensions
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);

  // Font size
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);

  // Resize drag state
  const resizeOrigin = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const isOpen = selection?.type === "resource-wall";

  const loadDirectory = useCallback(async (relPath: string): Promise<void> => {
    setLoading(true);
    setError(null);
    setSelectedFile(null);

    try {
      const data = await fetchEntries(relPath);
      setCurrentPath(data.path);
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load root on open
  useEffect(() => {
    if (isOpen) {
      void loadDirectory("");
    }
  }, [isOpen, loadDirectory]);

  // Pointer-move / pointer-up handlers for resize
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (!resizeOrigin.current) return;
      const dx = e.clientX - resizeOrigin.current.x;
      const dy = e.clientY - resizeOrigin.current.y;
      setPanelWidth(Math.max(MIN_WIDTH, resizeOrigin.current.w + dx));
      setPanelHeight(Math.max(MIN_HEIGHT, resizeOrigin.current.h + dy));
    };
    const onUp = (): void => {
      resizeOrigin.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!isOpen) return null;

  const breadcrumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const navigateTo = (pathParts: string[]): void => {
    void loadDirectory(pathParts.join("/"));
  };

  const handleEntryClick = (entry: FileEntry): void => {
    const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.type === "dir") {
      void loadDirectory(fullPath);
    } else {
      setSelectedFile(fullPath);
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent): void => {
    e.preventDefault();
    resizeOrigin.current = {
      x: e.clientX,
      y: e.clientY,
      w: panelWidth,
      h: panelHeight,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const decreaseFontSize = (): void =>
    setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 1));
  const increaseFontSize = (): void =>
    setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 1));
  const resetFontSize = (): void => setFontSize(DEFAULT_FONT_SIZE);

  return (
    <div className="resource-wall-overlay" role="dialog" aria-modal="true">
      <div
        className="resource-wall-overlay__backdrop"
        onClick={() => setSelection(null)}
      />
      <div
        className="resource-wall-overlay__panel"
        style={
          {
            width: panelWidth,
            height: panelHeight,
            "--rw-font-size": `${fontSize}px`,
          } as React.CSSProperties
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="resource-wall-overlay__header">
          <h2 className="resource-wall-overlay__title">Shared Files</h2>

          <div className="resource-wall-overlay__controls">
            {/* Font size control */}
            <div
              className="resource-wall-overlay__font-ctrl"
              aria-label="Font size"
            >
              <button
                className="resource-wall-overlay__font-btn"
                onClick={decreaseFontSize}
                disabled={fontSize <= MIN_FONT_SIZE}
                aria-label="Decrease font size"
                title="Decrease font size"
              >
                A−
              </button>
              <button
                className="resource-wall-overlay__font-size"
                onClick={resetFontSize}
                title="Reset font size"
                aria-label={`Font size: ${fontSize}px, click to reset`}
              >
                {fontSize}
              </button>
              <button
                className="resource-wall-overlay__font-btn"
                onClick={increaseFontSize}
                disabled={fontSize >= MAX_FONT_SIZE}
                aria-label="Increase font size"
                title="Increase font size"
              >
                A+
              </button>
            </div>

            <button
              className="resource-wall-overlay__close"
              onClick={() => setSelection(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <nav
          className="resource-wall-overlay__breadcrumb"
          aria-label="File path"
        >
          <button
            onClick={() => navigateTo([])}
            className="resource-wall-overlay__crumb"
          >
            shared
          </button>
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              <span className="resource-wall-overlay__crumb-sep">/</span>
              <button
                onClick={() => navigateTo(breadcrumbs.slice(0, i + 1))}
                className="resource-wall-overlay__crumb"
              >
                {crumb}
              </button>
            </span>
          ))}
        </nav>

        {/* Body */}
        <div className="resource-wall-overlay__body">
          {/* File list */}
          <div className="resource-wall-overlay__file-list">
            {loading && (
              <p className="resource-wall-overlay__status">Loading…</p>
            )}
            {error && <p className="resource-wall-overlay__error">{error}</p>}
            {!loading && !error && entries.length === 0 && (
              <p className="resource-wall-overlay__status">Empty directory</p>
            )}
            {!loading &&
              !error &&
              entries.map((entry) => {
                const fullPath = currentPath
                  ? `${currentPath}/${entry.name}`
                  : entry.name;
                return (
                  <div
                    key={entry.name}
                    className="resource-wall-overlay__entry-row"
                  >
                    <button
                      className={`resource-wall-overlay__entry resource-wall-overlay__entry--${entry.type} ${
                        selectedFile === fullPath
                          ? "resource-wall-overlay__entry--active"
                          : ""
                      }`}
                      onClick={() => handleEntryClick(entry)}
                    >
                      <span className="resource-wall-overlay__entry-icon">
                        {entry.type === "dir" ? "📁" : "📄"}
                      </span>
                      {entry.name}
                    </button>
                    {entry.type === "file" && (
                      <a
                        className="resource-wall-overlay__entry-download"
                        href={`/api/file?path=${encodeURIComponent(fullPath)}`}
                        download={entry.name}
                        title={`Download ${entry.name}`}
                        aria-label={`Download ${entry.name}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↓
                      </a>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Preview pane */}
          <div className="resource-wall-overlay__preview">
            {selectedFile ? (
              <FilePreview filePath={selectedFile} />
            ) : (
              <p className="resource-wall-overlay__status">
                Select a file to preview
              </p>
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="resource-wall-overlay__resize-handle"
          onPointerDown={handleResizePointerDown}
          aria-hidden="true"
          title="Drag to resize"
        />
      </div>
    </div>
  );
}
