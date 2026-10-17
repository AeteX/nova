import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDownloads, type DownloadEntry } from "../hooks/useDownloads";

function formatBytes(n?: number): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function statusLabel(d: DownloadEntry): string {
  switch (d.status) {
    case "downloading": {
      const s = formatBytes(d.downloaded_bytes);
      return d.total_bytes ? `${s} / ${formatBytes(d.total_bytes)}` : s;
    }
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "failed":
      return d.error || "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Starting…";
  }
}

function hostFrom(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface Props {
  onClose: () => void;
}

export default function DownloadsPage({ onClose }: Props) {
  const {
    downloads,
    pause,
    resume,
    cancel,
    clearFinished,
    openFolder,
    openFile,
  } = useDownloads();

  const hasFinished = useMemo(
    () =>
      downloads.some(
        (d) =>
          d.status === "completed" ||
          d.status === "failed" ||
          d.status === "cancelled"
      ),
    [downloads]
  );

  const openSource = (url: string) => {
    invoke("open_new_tab", { url }).catch(() => {});
  };

  return (
    <div className="nova-dlp">
      <div className="nova-dlp-inner">
        <header className="nova-dlp-header">
          <div>
            <div className="nova-dlp-eyebrow">AeteX</div>
            <h1 className="nova-dlp-title">Downloads</h1>
            <div className="nova-dlp-sub">
              {downloads.length === 0
                ? "No downloads yet"
                : `${downloads.length} item${downloads.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className="nova-dlp-header-actions">
            {hasFinished && (
              <button
                className="nova-dlp-btn nova-dlp-btn--ghost"
                onClick={clearFinished}
              >
                Clear finished
              </button>
            )}
            <button
              className="nova-dlp-close"
              onClick={onClose}
              aria-label="Close"
              title="Close tab"
            >
              ×
            </button>
          </div>
        </header>

        {downloads.length === 0 ? (
          <div className="nova-dlp-empty">
            <div className="nova-dlp-empty-glyph">↓</div>
            <div className="nova-dlp-empty-title">No downloads yet</div>
            <div className="nova-dlp-empty-sub">
              Files you download will appear here.
            </div>
          </div>
        ) : (
          <div className="nova-dlp-list">
            {downloads.map((d) => {
              const pct =
                d.total_bytes && d.total_bytes > 0
                  ? Math.min(100, (d.downloaded_bytes / d.total_bytes) * 100)
                  : null;
              return (
                <div
                  key={d.id}
                  className={`nova-dlp-item nova-dlp-item--${d.status}`}
                >
                  <div className="nova-dlp-item-main">
                    <div className="nova-dlp-item-head">
                      <div
                        className="nova-dlp-item-name"
                        title={d.filename}
                      >
                        {d.filename}
                      </div>
                      <div className="nova-dlp-item-status">
                        {statusLabel(d)}
                      </div>
                    </div>

                    {(d.status === "downloading" ||
                      d.status === "paused") && (
                      <div className="nova-dlp-progress">
                        <div
                          className="nova-dlp-progress-fill"
                          style={{
                            width: pct !== null ? `${pct}%` : "100%",
                          }}
                        />
                      </div>
                    )}

                    <div className="nova-dlp-item-meta">
                      {d.source_page_url && (
                        <div className="nova-dlp-meta-row">
                          <span className="nova-dlp-meta-label">From</span>
                          <button
                            className="nova-dlp-meta-link"
                            onClick={() =>
                              openSource(d.source_page_url!)
                            }
                            title={d.source_page_url}
                          >
                            {hostFrom(d.source_page_url)}
                          </button>
                        </div>
                      )}
                      <div className="nova-dlp-meta-row">
                        <span className="nova-dlp-meta-label">URL</span>
                        <button
                          className="nova-dlp-meta-link"
                          onClick={() => openSource(d.url)}
                          title={d.url}
                        >
                          {hostFrom(d.url)}
                        </button>
                      </div>
                      {d.path && (
                        <div className="nova-dlp-meta-row">
                          <span className="nova-dlp-meta-label">Saved to</span>
                          <span
                            className="nova-dlp-meta-path"
                            title={d.path}
                          >
                            {d.path}
                          </span>
                        </div>
                      )}
                      {d.error && (
                        <div className="nova-dlp-meta-row nova-dlp-meta-row--error">
                          <span className="nova-dlp-meta-label">Error</span>
                          <span className="nova-dlp-meta-error">
                            {d.error}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="nova-dlp-item-actions">
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
                      <>
                        <button onClick={() => openFile(d.path!)}>
                          Open
                        </button>
                        <button onClick={() => openFolder(d.path!)}>
                          Show in folder
                        </button>
                      </>
                    )}
                    {d.status === "failed" && d.path && (
                      <button onClick={() => openFolder(d.path!)}>
                        Show in folder
                      </button>
                    )}
                    {d.status === "cancelled" && (
                      <button onClick={clearFinished}>Dismiss</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}