import { useCallback } from "react";
import type { ToolbarItemId, ToolbarLayoutItem } from "../hooks/useSettings";
import {
  DEFAULT_TOOLBAR_LAYOUT,
  PROTECTED_TOOLBAR_ITEMS,
} from "../hooks/useSettings";

interface ToolbarLayoutEditorProps {
  layout: ToolbarLayoutItem[];
  onChange: (layout: ToolbarLayoutItem[]) => void;
}

const ITEM_META: Record<
  ToolbarItemId,
  { label: string; icon: string; note?: string }
> = {
  nav: {
    label: "Navigation",
    icon: "◀ ▶ ⟳",
    note: "Back / forward / reload",
  },
  "address-bar": {
    label: "Address bar",
    icon: "⌂",
    note: "Search or enter address — includes the bookmark star",
  },
  cmd: { label: "Command palette", icon: "⌘", note: "Ctrl+K" },
  history: { label: "History", icon: "⏱" },
  bookmarks: {
    label: "Bookmarks list",
    icon: "☰",
    note: "Opens nova://bookmarks",
  },
  ext: {
    label: "Extensions",
    icon: "⬡",
    note: "Only shown when extensions have panels",
  },
  ai: {
    label: "AI assistant",
    icon: "◈",
    note: "Only shown when AI is enabled",
  },
  downloads: { label: "Downloads", icon: "↓" },
  "new-tab": { label: "New tab", icon: "+" },
  settings: { label: "Settings", icon: "⚙" },
};

export default function ToolbarLayoutEditor({
  layout,
  onChange,
}: ToolbarLayoutEditorProps) {
  const move = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= layout.length) return;
      const next = [...layout];
      [next[idx], next[target]] = [next[target], next[idx]];
      onChange(next);
    },
    [layout, onChange]
  );

  const toggleVisibility = useCallback(
    (idx: number) => {
      const item = layout[idx];
      if (PROTECTED_TOOLBAR_ITEMS.has(item.id)) return;
      const next = [...layout];
      next[idx] = { ...item, hidden: !item.hidden };
      onChange(next);
    },
    [layout, onChange]
  );

  const reset = useCallback(() => {
    onChange(DEFAULT_TOOLBAR_LAYOUT.map((item) => ({ ...item })));
  }, [onChange]);

  const isCustom =
    layout.length !== DEFAULT_TOOLBAR_LAYOUT.length ||
    layout.some(
      (item, i) =>
        item.id !== DEFAULT_TOOLBAR_LAYOUT[i].id ||
        item.hidden !== DEFAULT_TOOLBAR_LAYOUT[i].hidden
    );

  const hiddenCount = layout.filter((item) => item.hidden).length;

  return (
    <div className="nova-layout-editor">
      <div className="nova-layout-list">
        {layout.map((item, idx) => {
          const meta = ITEM_META[item.id];
          if (!meta) return null;
          const isProtected = PROTECTED_TOOLBAR_ITEMS.has(item.id);
          const isHidden = item.hidden && !isProtected;

          const eyeSymbol = isProtected ? "⊘" : isHidden ? "○" : "◉";
          const eyeTitle = isProtected
            ? "Cannot be hidden — primary navigation"
            : isHidden
            ? "Show in toolbar"
            : "Hide from toolbar";

          return (
            <div
              className={`nova-layout-row ${
                isHidden ? "nova-layout-row--hidden" : ""
              }`}
              key={item.id}
            >
              <button
                className={`nova-layout-eye ${
                  isHidden ? "nova-layout-eye--hidden" : ""
                } ${isProtected ? "nova-layout-eye--protected" : ""}`}
                onClick={() => toggleVisibility(idx)}
                disabled={isProtected}
                title={eyeTitle}
                aria-label={eyeTitle}
              >
                {eyeSymbol}
              </button>
              <span className="nova-layout-icon">{meta.icon}</span>
              <div className="nova-layout-info">
                <div className="nova-layout-label">{meta.label}</div>
                {meta.note && (
                  <div className="nova-layout-note">{meta.note}</div>
                )}
              </div>
              <div className="nova-layout-controls">
                <button
                  className="nova-layout-btn"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  className="nova-layout-btn"
                  onClick={() => move(idx, 1)}
                  disabled={idx === layout.length - 1}
                  title="Move down"
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="nova-layout-footer">
        <span className="nova-layout-summary">
          {hiddenCount > 0
            ? `${hiddenCount} item${hiddenCount === 1 ? "" : "s"} hidden`
            : "All items visible"}
        </span>
        {isCustom && (
          <button
            className="nova-settings-btn nova-settings-btn--ghost"
            onClick={reset}
          >
            Reset to default
          </button>
        )}
      </div>
    </div>
  );
}