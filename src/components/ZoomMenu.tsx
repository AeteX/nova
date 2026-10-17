const PRESETS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

interface ZoomMenuProps {
  zoom: number;
  onChange: (zoom: number) => void;
  onClose: () => void;
}

export default function ZoomMenu({ zoom, onChange, onClose }: ZoomMenuProps) {
  const pct = Math.round(zoom * 100);

  return (
    <div className="nova-zoom-menu" onClick={(e) => e.stopPropagation()}>
      <div className="nova-zoom-menu-header">
        <div className="nova-zoom-menu-title">Zoom</div>
        <div className="nova-zoom-menu-value">{pct}%</div>
      </div>

      <div className="nova-zoom-menu-actions">
        <button
          className="nova-zoom-menu-step"
          onClick={() => onChange(Math.max(0.25, Math.round((zoom - 0.1) * 100) / 100))}
          title="Zoom out"
        >
          −
        </button>
        <div className="nova-zoom-menu-track">
          <div
            className="nova-zoom-menu-track-fill"
            style={{ width: `${Math.min(100, ((zoom - 0.25) / 4.75) * 100)}%` }}
          />
        </div>
        <button
          className="nova-zoom-menu-step"
          onClick={() => onChange(Math.min(5.0, Math.round((zoom + 0.1) * 100) / 100))}
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="nova-zoom-menu-presets">
        {PRESETS.map((p) => {
          const active = Math.abs(zoom - p) < 0.01;
          return (
            <button
              key={p}
              className={`nova-zoom-menu-preset ${active ? "nova-zoom-menu-preset--active" : ""}`}
              onClick={() => {
                onChange(p);
                onClose();
              }}
            >
              {Math.round(p * 100)}%
            </button>
          );
        })}
      </div>

      <button
        className="nova-zoom-menu-reset"
        onClick={() => {
          onChange(1.0);
          onClose();
        }}
      >
        Reset to 100%
      </button>
    </div>
  );
}