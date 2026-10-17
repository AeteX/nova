import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDownloads, type DownloadEntry } from "./hooks/useDownloads";

const MAX_VISIBLE = 4;

function formatBytes(n?: number): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function compactStatus(d: DownloadEntry): string {
  switch (d.status) {
    case "downloading": {
      const s = formatBytes(d.downloaded_bytes);
      return d.total_bytes ? `${s} / ${formatBytes(d.total_bytes)}` : s;
    }
    case "paused":
      return "Paused";
    case "completed":
      return formatBytes(d.total_bytes ?? d.downloaded_bytes);
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Starting…";
  }
}

export default function DownloadsPopover() {
  const {
    downloads,
    pause,
    resume,
    cancel,
    clearFinished,
    openFile,
  } = useDownloads();

  const close = useCallback(() => {
    invoke("hide_downloads_popover").catch(() => {});
  }, []);

  const showAll = useCallback(() => {
    invoke("open_downloads_page").catch(() => {});
  }, []);

  const visible = downloads.slice(0, MAX_VISIBLE);
  const overflow = downloads.length - visible.length;
  const hasFinished = downloads.some(
    (d) =>
      d.status === "completed" ||
      d.status === "failed" ||
      d.status === "cancelled"
  );

  return (
    <div className="nova-pop-root">
      <div className="nova-pop-beam" aria-hidden="true" />

      <header className="nova-pop-header">
        <div className="nova-pop-title">Downloads</div>
        <div className="nova-pop-actions">
          {hasFinished && (
            <button
              className="nova-pop-textbtn"
              onClick={clearFinished}
              title="Clear finished"
            >
              Clear
            </button>
          )}
          <button
            className="nova-pop-iconbtn"
            onClick={close}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>
      </header>

      <div className="nova-pop-body">
        {downloads.length === 0 && (
          <div className="nova-pop-empty">
            <div className="nova-pop-empty-glyph">↓</div>
            <div className="nova-pop-empty-text">No downloads yet</div>
          </div>
        )}

        {visible.map((d) => {
          const pct =
            d.total_bytes && d.total_bytes > 0
              ? Math.min(100, (d.downloaded_bytes / d.total_bytes) * 100)
              : null;
          return (
            <div
              key={d.id}
              className={`nova-pop-item nova-pop-item--${d.status}`}
            >
              <div className="nova-pop-item-head">
                <span className="nova-pop-item-name" title={d.filename}>
                  {d.filename}
                </span>
                <span className="nova-pop-item-status">
                  {compactStatus(d)}
                </span>
              </div>

              {(d.status === "downloading" || d.status === "paused") && (
                <div className="nova-pop-progress">
                  <div
                    className="nova-pop-progress-fill"
                    style={{ width: pct !== null ? `${pct}%` : "100%" }}
                  />
                </div>
              )}

              <div className="nova-pop-item-actions">
                {d.status === "downloading" && (
                  <>
                    <button onClick={() => pause(d.id)}>Pause</button>
                    <button onClick={() => cancel(d.id)}>Cancel</button>
                  </>
                )}
                {d.status === "paused" && (
                  <>
                    <button onClick={() => resume(d.id)}>Resume</button>
                    <button onClick={() => cancel(d.id)}>Cancel</button>
                  </>
                )}
                {d.status === "completed" && d.path && (
                  <button onClick={() => openFile(d.path!)}>Open</button>
                )}
                {d.status === "failed" && (
                  <button onClick={clearFinished}>Dismiss</button>
                )}
                {d.status === "cancelled" && (
                  <button onClick={clearFinished}>Dismiss</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="nova-pop-footer">
        <button className="nova-pop-showall" onClick={showAll}>
          {overflow > 0
            ? `Show all ${downloads.length} downloads →`
            : "Show all downloads →"}
        </button>
      </footer>
    </div>
  );
}