import { useMemo, useState } from "react";
import type { Bookmark } from "../hooks/useStorage";

interface BookmarksBarProps {
  bookmarks: Bookmark[];
  onNavigate: (url: string) => void;
  onAddCurrentPage: () => void;
  currentUrl: string;
  currentIsBookmarked: boolean;
}

function faviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  } catch {
    return "";
  }
}

function BookmarkButton({
  bookmark,
  onNavigate,
}: {
  bookmark: Bookmark;
  onNavigate: (url: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (bookmark.title || bookmark.url).charAt(0).toUpperCase();
  const hue = useMemo(() => {
    let hash = 0;
    const str = bookmark.title || bookmark.url;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }, [bookmark.title, bookmark.url]);

  return (
    <button
      className="nova-bm-chip"
      onClick={() => onNavigate(bookmark.url)}
      title={`${bookmark.title}\n${bookmark.url}`}
    >
      <span className="nova-bm-chip-icon">
        {failed || !bookmark.url ? (
          <span
            className="nova-bm-chip-letter"
            style={{
              background: `hsl(${hue}, 60%, 45%)`,
            }}
          >
            {letter}
          </span>
        ) : (
          <img
            src={faviconUrl(bookmark.url)}
            alt=""
            onError={() => setFailed(true)}
          />
        )}
      </span>
      <span className="nova-bm-chip-title">
        {bookmark.title || bookmark.url}
      </span>
    </button>
  );
}

export default function BookmarksBar({
  bookmarks,
  onNavigate,
  onAddCurrentPage,
  currentUrl,
  currentIsBookmarked,
}: BookmarksBarProps) {
  const canAddCurrent = currentUrl.startsWith("http");
  return (
    <div className="nova-bm-bar">
      {bookmarks.length === 0 ? (
        <div className="nova-bm-empty">
          No bookmarks yet — click the + to save the current page
        </div>
      ) : (
        <div className="nova-bm-scroll">
          {bookmarks.map((b) => (
            <BookmarkButton
              key={b.id}
              bookmark={b}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
      {canAddCurrent && (
        <button
          className={`nova-bm-add ${
            currentIsBookmarked ? "nova-bm-add--active" : ""
          }`}
          onClick={onAddCurrentPage}
          title={
            currentIsBookmarked
              ? "Remove bookmark for this page"
              : "Bookmark this page"
          }
          aria-label={
            currentIsBookmarked
              ? "Remove bookmark for this page"
              : "Bookmark this page"
          }
        >
          {currentIsBookmarked ? "★" : "+"}
        </button>
      )}
    </div>
  );
}