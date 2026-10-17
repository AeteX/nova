import type { ToolCallRecord } from "../hooks/useAI";

const TOOL_META: Record<
  string,
  { icon: string; label: string; verb: string }
> = {
  navigate: { icon: "→", label: "Navigate", verb: "Navigating" },
  open_in_new_tab: { icon: "⊕", label: "Open in new tab", verb: "Opening" },
  search: { icon: "⌕", label: "Search", verb: "Searching" },
  new_tab: { icon: "＋", label: "New tab", verb: "Opening tab" },
  close_current_tab: { icon: "×", label: "Close tab", verb: "Closing" },
  list_tabs: { icon: "≣", label: "List tabs", verb: "Reading tabs" },
  get_current_page: { icon: "◉", label: "Read page", verb: "Reading" },
  set_search_engine: {
    icon: "⌘",
    label: "Set search engine",
    verb: "Updating",
  },
  set_accent_color: { icon: "◈", label: "Set accent", verb: "Recoloring" },
  set_homepage: { icon: "⌂", label: "Set homepage", verb: "Updating" },
};

interface ToolCardProps {
  record: ToolCallRecord;
}

export default function ToolCard({ record }: ToolCardProps) {
  const meta = TOOL_META[record.name] ?? {
    icon: "◆",
    label: record.name,
    verb: "Running",
  };

  const argEntries = Object.entries(record.arguments ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );

  return (
    <div className={`nova-tool nova-tool--${record.state}`}>
      <span className="nova-tool-beam" aria-hidden="true" />

      <div className="nova-tool-icon">
        <span className="nova-tool-icon-glyph">{meta.icon}</span>
      </div>

      <div className="nova-tool-body">
        <div className="nova-tool-header">
          <span className="nova-tool-label">{meta.label}</span>
          <span className="nova-tool-state">
            {record.state === "running" && (
              <>
                <span className="nova-tool-dot" />
                {meta.verb.toUpperCase()}
              </>
            )}
            {record.state === "success" && "COMPLETE"}
            {record.state === "error" && "FAILED"}
          </span>
        </div>

        {argEntries.length > 0 && (
          <div className="nova-tool-args">
            {argEntries.map(([k, v]) => (
              <div className="nova-tool-arg" key={k}>
                <span className="nova-tool-arg-key">{k}</span>
                <span className="nova-tool-arg-value">
                  {typeof v === "string" ? v : JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>
        )}

        {record.result && (
          <div className="nova-tool-result">{record.result.message}</div>
        )}
      </div>
    </div>
  );
}