import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDownloads, type DownloadEntry } from "../hooks/useDownloads";
import type { QuickLink } from "../hooks/useSettings";

interface HomePageProps {
  quickLinks: QuickLink[];
  onUpdateQuickLinks: (links: QuickLink[]) => void;
  getSearchUrl: (query: string) => string;
  onNavigate: (url: string) => void;
  onOpenNewTab: (url: string) => void;
  onOpenAi: () => void;
  onOpenSettings: () => void;
  onOpenDownloads: () => void;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  if (h >= 18 && h < 22) return "Good evening";
  return "Good night";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatBytes(n?: number): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function faviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  } catch {
    return "";
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

function QuickLinkCard({
  link,
  onNavigate,
  onRemove,
}: {
  link: QuickLink;
  onNavigate: (url: string) => void;
  onRemove: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (link.title || "?").charAt(0).toUpperCase();
  const hue = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < link.title.length; i++) {
      hash = link.title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }, [link.title]);

  return (
    <div className="nova-home-link">
      <button
        className="nova-home-link-btn"
        onClick={() => onNavigate(link.url)}
        title={link.url}
      >
        <span className="nova-home-link-icon">
          {failed || !link.url ? (
            <span
              className="nova-home-link-letter"
              style={{
                background: `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 40) % 360}, 70%, 45%))`,
              }}
            >
              {letter}
            </span>
          ) : (
            <img
              src={faviconUrl(link.url)}
              alt=""
              onError={() => setFailed(true)}
            />
          )}
        </span>
        <span className="nova-home-link-title">{link.title}</span>
      </button>
      <button
        className="nova-home-link-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove"
        aria-label={`Remove ${link.title}`}
      >
        ×
      </button>
    </div>
  );
}

export default function HomePage({
  quickLinks,
  onUpdateQuickLinks,
  getSearchUrl,
  onNavigate,
  onOpenNewTab,
  onOpenAi,
  onOpenSettings,
  onOpenDownloads,
}: HomePageProps) {
  const { downloads } = useDownloads();
  const [time, setTime] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const recentDownloads = useMemo(
    (): DownloadEntry[] => downloads.slice(0, 3),
    [downloads]
  );

  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Press "/" to focus the search bar (unless already typing elsewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTyping(e)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = useCallback(
    (raw: string, newTab: boolean) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      let url = trimmed;
      if (!/^https?:\/\//i.test(url)) {
        if (/^[\w-]+(\.[\w-]+)+/.test(url) && !url.includes(" ")) {
          url = `https://${url}`;
        } else {
          url = getSearchUrl(url);
        }
      }
      if (newTab) onOpenNewTab(url);
      else onNavigate(url);
    },
    [getSearchUrl, onNavigate, onOpenNewTab]
  );

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      submit(query, e.ctrlKey || e.metaKey);
    }
  };

  const addQuickLink = () => {
    const t = newTitle.trim();
    const u = newUrl.trim();
    if (!t || !u) return;
    let normalized = u;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    onUpdateQuickLinks([...quickLinks, { title: t, url: normalized }]);
    setNewTitle("");
    setNewUrl("");
    setAddOpen(false);
  };

  return (
    <div className="nova-home">
      <div className="nova-home-grid-bg" aria-hidden="true" />

      <header className="nova-home-header">
        <div className="nova-home-brand">
          <span className="nova-home-brand-dot" />
          <span className="nova-home-brand-name">Nova</span>
        </div>
        <div className="nova-home-clock">
          <div className="nova-home-clock-time">{formatTime(time)}</div>
          <div className="nova-home-clock-date">{formatDate(time)}</div>
        </div>
      </header>

      <main className="nova-home-main">
        <div className="nova-home-greeting">
          <div className="nova-home-greeting-sub">{getGreeting()}</div>
          <h1 className="nova-home-greeting-title">Where to?</h1>
        </div>

        <div className="nova-home-search">
          <div className="nova-home-search-glow" aria-hidden="true" />
          <span className="nova-home-search-icon">⌕</span>
          <input
            ref={searchRef}
            className="nova-home-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Search or enter address"
            spellCheck={false}
          />
          <button
            className="nova-home-search-ai"
            onClick={onOpenAi}
            title="Ask AI"
            aria-label="Ask AI"
          >
            ◈
          </button>
        </div>

        <div className="nova-home-links">
          {quickLinks.map((link, idx) => (
            <QuickLinkCard
              key={`${link.url}-${idx}`}
              link={link}
              onNavigate={onNavigate}
              onRemove={() =>
                onUpdateQuickLinks(quickLinks.filter((_, i) => i !== idx))
              }
            />
          ))}
          <button
            className="nova-home-link nova-home-link-add"
            onClick={() => setAddOpen(true)}
            title="Add shortcut"
          >
            <span className="nova-home-link-icon">
              <span className="nova-home-link-plus">+</span>
            </span>
            <span className="nova-home-link-title">Add</span>
          </button>
        </div>

        {recentDownloads.length > 0 && (
          <div className="nova-home-downloads">
            <div className="nova-home-downloads-header">
              <span className="nova-home-downloads-title">
                Recent downloads
              </span>
              <button
                className="nova-home-downloads-more"
                onClick={onOpenDownloads}
              >
                View all →
              </button>
            </div>
            <div className="nova-home-downloads-list">
              {recentDownloads.map((d) => (
                <div key={d.id} className="nova-home-downloads-item">
                  <span className="nova-home-downloads-icon">↓</span>
                  <span
                    className="nova-home-downloads-name"
                    title={d.filename}
                  >
                    {d.filename}
                  </span>
                  <span
                    className={`nova-home-downloads-status nova-home-downloads-status--${d.status}`}
                  >
                    {d.status === "completed"
                      ? formatBytes(d.total_bytes ?? d.downloaded_bytes)
                      : d.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="nova-home-footer">
        <button className="nova-home-footer-btn" onClick={onOpenSettings}>
          ⚙ Settings
        </button>
        <div className="nova-home-footer-spacer" />
        <div className="nova-home-footer-meta">
          Nova · aeteX product · Press <kbd>/</kbd> to search
        </div>
      </footer>

      {addOpen && (
        <div
          className="nova-home-modal-backdrop"
          onClick={() => setAddOpen(false)}
        >
          <form
            className="nova-home-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              addQuickLink();
            }}
          >
            <h3 className="nova-home-modal-title">Add shortcut</h3>
            <label className="nova-home-modal-field">
              <span>Name</span>
              <input
                className="nova-input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="GitHub"
                autoFocus
                maxLength={32}
              />
            </label>
            <label className="nova-home-modal-field">
              <span>URL</span>
              <input
                className="nova-input"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="github.com"
                spellCheck={false}
              />
            </label>
            <div className="nova-home-modal-actions">
              <button
                type="button"
                className="nova-settings-btn nova-settings-btn--ghost"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="nova-settings-btn nova-settings-btn--primary"
                disabled={!newTitle.trim() || !newUrl.trim()}
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}