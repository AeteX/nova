import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Bookmark, HistoryEntry, SearchEntry } from "../hooks/useStorage";

interface CommandPaletteProps {
  getSearchUrl: (q: string) => string;
  bookmarks: Bookmark[];
  onNavigate: (url: string) => void;
  onOpenNewTab: (url: string) => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenDownloads: () => void;
  onClose: () => void;
  onToggleBookmark: () => void;
  currentUrl: string;
  currentTitle: string;
  currentIsBookmarked: boolean;
}

type ResultType =
  | "nav"
  | "search"
  | "history"
  | "bookmark"
  | "search-history"
  | "action";

interface Result {
  id: string;
  type: ResultType;
  icon: string;
  label: string;
  sublabel?: string;
  action: () => void;
  newTabAction?: () => void;
}

export default function CommandPalette({
  getSearchUrl,
  bookmarks,
  onNavigate,
  onOpenNewTab,
  onOpenSettings,
  onOpenHistory,
  onOpenBookmarks,
  onOpenDownloads,
  onClose,
  onToggleBookmark,
  currentUrl,
  currentTitle,
  currentIsBookmarked,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [historyMatches, setHistoryMatches] = useState<HistoryEntry[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    invoke<SearchEntry[]>("search_history_list", { limit: 5 })
      .then(setRecentSearches)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setHistoryMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      invoke<HistoryEntry[]>("history_search", {
        query: query.trim(),
        limit: 8,
      })
        .then(setHistoryMatches)
        .catch(() => {});
    }, 100);
    return () => window.clearTimeout(t);
  }, [query]);

  const bookmarkMatches = useMemo(() => {
    if (!query.trim()) return bookmarks.slice(0, 5);
    const q = query.toLowerCase();
    return bookmarks.filter(
      (b) =>
        b.url.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
    );
  }, [bookmarks, query]);

  const results = useMemo((): Result[] => {
    const out: Result[] = [];
    const trimmed = query.trim();
    const trimmedLower = trimmed.toLowerCase();

    // ── Bookmark action always appears first if the current page is a
    // real URL and the query is empty or mentions "bookmark" ──
    const matchesBookmarkQuery =
      !trimmed ||
      "bookmark".includes(trimmedLower) ||
      "bookmark this page".includes(trimmedLower) ||
      "remove bookmark".includes(trimmedLower) ||
      "star".includes(trimmedLower);

    if (matchesBookmarkQuery && currentUrl.startsWith("http")) {
      out.push({
        id: "a-bookmark",
        type: "bookmark",
        icon: currentIsBookmarked ? "★" : "☆",
        label: currentIsBookmarked
          ? `Remove bookmark — ${currentTitle || currentUrl}`
          : `Bookmark this page — ${currentTitle || currentUrl}`,
        sublabel: currentIsBookmarked ? "Already bookmarked" : currentUrl,
        action: onToggleBookmark,
      });
    }

    if (trimmed) {
      const isUrl =
        /^https?:\/\//i.test(trimmed) ||
        (/^[\w-]+(\.[\w-]+)+/.test(trimmed) && !trimmed.includes(" "));

      if (isUrl) {
        const url = /^https?:\/\//i.test(trimmed)
          ? trimmed
          : `https://${trimmed}`;
        out.push({
          id: "go",
          type: "nav",
          icon: "→",
          label: `Go to ${trimmed}`,
          action: () => onNavigate(url),
          newTabAction: () => onOpenNewTab(url),
        });
      }

      const searchUrl = getSearchUrl(trimmed);
      out.push({
        id: "search",
        type: "search",
        icon: "⌕",
        label: `Search for "${trimmed}"`,
        action: () => onNavigate(searchUrl),
        newTabAction: () => onOpenNewTab(searchUrl),
      });
    }

    for (const h of historyMatches.slice(0, 6)) {
      const url = h.url;
      out.push({
        id: `h-${h.url}`,
        type: "history",
        icon: "⏱",
        label: h.title || h.url,
        sublabel: h.url,
        action: () => onNavigate(url),
        newTabAction: () => onOpenNewTab(url),
      });
    }

    for (const b of bookmarkMatches.slice(0, 5)) {
      const url = b.url;
      out.push({
        id: `b-${b.id}`,
        type: "bookmark",
        icon: "★",
        label: b.title || b.url,
        sublabel: b.url,
        action: () => onNavigate(url),
        newTabAction: () => onOpenNewTab(url),
      });
    }

    if (!trimmed) {
      for (const s of recentSearches) {
        const searchUrl = getSearchUrl(s.query);
        out.push({
          id: `s-${s.query}`,
          type: "search-history",
          icon: "⌕",
          label: s.query,
          sublabel: "Recent search",
          action: () => onNavigate(searchUrl),
          newTabAction: () => onOpenNewTab(searchUrl),
        });
      }
    }

    out.push({
      id: "a-settings",
      type: "action",
      icon: "⚙",
      label: "Open Settings",
      action: onOpenSettings,
    });
    out.push({
      id: "a-history",
      type: "action",
      icon: "⏱",
      label: "Open History",
      action: onOpenHistory,
    });
    out.push({
      id: "a-bookmarks",
      type: "action",
      icon: "☰",
      label: "Open Bookmarks",
      action: onOpenBookmarks,
    });
    out.push({
      id: "a-downloads",
      type: "action",
      icon: "↓",
      label: "Open Downloads",
      action: onOpenDownloads,
    });

    return out;
  }, [
    query,
    historyMatches,
    bookmarkMatches,
    recentSearches,
    getSearchUrl,
    onNavigate,
    onOpenNewTab,
    onOpenSettings,
    onOpenHistory,
    onOpenBookmarks,
    onOpenDownloads,
    onToggleBookmark,
    currentUrl,
    currentTitle,
    currentIsBookmarked,
  ]);

  useEffect(() => {
    setSelected(0);
  }, [query, results.length]);

  const run = useCallback(
    (r: Result, newTab = false) => {
      if (newTab && r.newTabAction) {
        r.newTabAction();
      } else {
        r.action();
      }
      onClose();
    },
    [onClose]
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selected]) {
        run(results[selected], e.ctrlKey || e.metaKey);
      }
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${selected}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="nova-cmd-backdrop" onClick={onClose}>
      <div
        className="nova-cmd"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
        role="dialog"
        aria-modal="true"
      >
        <div className="nova-cmd-input-wrap">
          <span className="nova-cmd-search-icon">⌘</span>
          <input
            ref={inputRef}
            className="nova-cmd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search history, bookmarks, or type a URL…"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="nova-cmd-kbd">esc</kbd>
        </div>

        <div className="nova-cmd-list" ref={listRef}>
          {results.length === 0 && (
            <div className="nova-cmd-empty">No results</div>
          )}
          {results.map((r, idx) => (
            <button
              key={r.id}
              data-idx={idx}
              className={`nova-cmd-item ${
                idx === selected ? "nova-cmd-item--active" : ""
              }`}
              onClick={() => run(r)}
              onMouseEnter={() => setSelected(idx)}
            >
              <span
                className={`nova-cmd-item-icon nova-cmd-item-icon--${r.type}`}
              >
                {r.icon}
              </span>
              <span className="nova-cmd-item-text">
                <span className="nova-cmd-item-label">{r.label}</span>
                {r.sublabel && (
                  <span className="nova-cmd-item-sub">{r.sublabel}</span>
                )}
              </span>
              {r.newTabAction && idx === selected && (
                <span className="nova-cmd-item-hint">⌘↵ new tab</span>
              )}
            </button>
          ))}
        </div>

        <div className="nova-cmd-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
          <span>
            <kbd>⌘</kbd>
            <kbd>↵</kbd> open in new tab
          </span>
        </div>
      </div>
    </div>
  );
}