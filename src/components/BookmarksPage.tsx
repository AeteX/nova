import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Bookmark } from "../hooks/useStorage";

interface BookmarksPageProps {
  onNavigate: (url: string) => void;
  onClose: () => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function BookmarksPage({ onNavigate, onClose }: BookmarksPageProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<Bookmark[]>("bookmarks_list");
      setBookmarks(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return bookmarks;
    const q = search.toLowerCase();
    return bookmarks.filter(
      (b) =>
        b.url.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
    );
  }, [bookmarks, search]);

  const handleRemove = async (id: string) => {
    await invoke("bookmarks_remove", { id });
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="nova-listpage">
      <div className="nova-listpage-inner">
        <header className="nova-listpage-header">
          <div>
            <div className="nova-listpage-eyebrow">AeteX</div>
            <h1 className="nova-listpage-title">Bookmarks</h1>
            <div className="nova-listpage-sub">
              {bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="nova-listpage-actions">
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
          placeholder="Search bookmarks…"
          spellCheck={false}
        />

        {loading && <div className="nova-listpage-empty">Loading…</div>}

        {!loading && filtered.length === 0 && (
          <div className="nova-listpage-empty">
            {search.trim() ? "No matches" : "No bookmarks yet"}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="nova-listpage-list">
            {filtered.map((b) => (
              <div key={b.id} className="nova-listpage-item">
                <button
                  className="nova-listpage-item-main"
                  onClick={() => onNavigate(b.url)}
                >
                  <div className="nova-listpage-item-title">
                    {b.title || hostOf(b.url)}
                  </div>
                  <div className="nova-listpage-item-meta">
                    <span className="nova-listpage-item-host">
                      {hostOf(b.url)}
                    </span>
                  </div>
                </button>
                <button
                  className="nova-listpage-item-del"
                  onClick={() => handleRemove(b.id)}
                  title="Remove bookmark"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}