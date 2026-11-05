import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry, SearchEntry } from "../hooks/useStorage";

interface HistoryPageProps {
  onNavigate: (url: string) => void;
  onClose: () => void;
}

function formatDateKey(ms: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: today.getFullYear() !== d.getFullYear() ? "numeric" : undefined,
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function HistoryPage({ onNavigate, onClose }: HistoryPageProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [searches, setSearches] = useState<SearchEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        invoke<HistoryEntry[]>("history_list"),
        invoke<SearchEntry[]>("search_history_list", { limit: 10 }),
      ]);
      setEntries(list);
      setSearches(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!search.trim()) return;
    const t = window.setTimeout(() => {
      invoke<HistoryEntry[]>("history_search", { query: search.trim() })
        .then(setEntries)
        .catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [search]);

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of entries) {
      const key = formatDateKey(e.visited_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  const handleDelete = async (url: string) => {
    await invoke("history_delete", { url });
    setEntries((prev) => prev.filter((e) => e.url !== url));
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all browsing history?")) return;
    await invoke("history_clear");
    setEntries([]);
  };

  const handleClearSearches = async () => {
    if (!confirm("Clear all search history?")) return;
    await invoke("search_history_clear");
    setSearches([]);
  };

  return (
    <div className="nova-listpage">
      <div className="nova-listpage-inner">
        <header className="nova-listpage-header">
          <div>
            <div className="nova-listpage-eyebrow">AeteX</div>
            <h1 className="nova-listpage-title">History</h1>
            <div className="nova-listpage-sub">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            </div>
          </div>
          <div className="nova-listpage-actions">
            {searches.length > 0 && (
              <button
                className="nova-listpage-btn nova-listpage-btn--ghost"
                onClick={handleClearSearches}
              >
                Clear searches
              </button>
            )}
            {entries.length > 0 && (
              <button
                className="nova-listpage-btn nova-listpage-btn--danger"
                onClick={handleClearAll}
              >
                Clear all
              </button>
            )}
            <button
              className="nova-listpage-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        <input
          className="nova-listpage-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search history…"
          spellCheck={false}
        />

        {searches.length > 0 && !search.trim() && (
          <section className="nova-listpage-section">
            <h2 className="nova-listpage-sec-title">Recent searches</h2>
            <div className="nova-listpage-chips">
              {searches.map((s) => (
                <button
                  key={s.query + s.searched_at}
                  className="nova-listpage-chip"
                  onClick={() => onNavigate(
                    `https://duckduckgo.com/?q=${encodeURIComponent(s.query)}`
                  )}
                >
                  ⌕ {s.query}
                </button>
              ))}
            </div>
          </section>
        )}

        {loading && <div className="nova-listpage-empty">Loading…</div>}

        {!loading && entries.length === 0 && !search.trim() && (
          <div className="nova-listpage-empty">
            No browsing history yet
          </div>
        )}

        {!loading && entries.length === 0 && search.trim() && (
          <div className="nova-listpage-empty">No matches</div>
        )}

        {groups.map(([date, items]) => (
          <section key={date} className="nova-listpage-section">
            <h2 className="nova-listpage-sec-title">{date}</h2>
            <div className="nova-listpage-list">
              {items.map((e) => (
                <div
                  key={e.url + e.visited_at}
                  className="nova-listpage-item"
                >
                  <button
                    className="nova-listpage-item-main"
                    onClick={() => onNavigate(e.url)}
                  >
                    <div className="nova-listpage-item-title">
                      {e.title || hostOf(e.url)}
                    </div>
                    <div className="nova-listpage-item-meta">
                      <span className="nova-listpage-item-host">
                        {hostOf(e.url)}
                      </span>
                      <span className="nova-listpage-item-time">
                        {formatTime(e.visited_at)}
                      </span>
                    </div>
                  </button>
                  <button
                    className="nova-listpage-item-del"
                    onClick={() => handleDelete(e.url)}
                    title="Remove from history"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}