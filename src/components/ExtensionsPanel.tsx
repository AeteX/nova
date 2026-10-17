import { useState } from "react";
import { useExtensions } from "../hooks/useExtensions";

export default function ExtensionsPanel() {
  const { extensions, dir, loading, error, refresh, uninstall } =
    useExtensions();
  const [busy, setBusy] = useState<string | null>(null);

  const handleUninstall = async (id: string) => {
    if (!confirm(`Uninstall ${id}?`)) return;
    setBusy(id);
    try {
      await uninstall(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="nova-ext-manager">
      <header className="nova-ext-header">
        <div>
          <div className="nova-ext-eyebrow">AeteX Extensions</div>
          <h2 className="nova-ext-title">Installed</h2>
        </div>
        <button className="nova-ext-refresh" onClick={refresh} title="Refresh">
          ⟳
        </button>
      </header>

      <div className="nova-ext-dir">
        <span className="nova-ext-dir-label">Install directory</span>
        <code className="nova-ext-dir-path">{dir || "…"}</code>
      </div>

      {loading && <div className="nova-ext-empty">Loading…</div>}
      {error && <div className="nova-ext-error">{error}</div>}

      {!loading && !error && extensions.length === 0 && (
        <div className="nova-ext-empty">
          No extensions installed. Drop a folder with a{" "}
          <code>manifest.json</code> into the directory above and click
          refresh.
        </div>
      )}

      <div className="nova-ext-list">
        {extensions.map((ext) => (
          <div key={ext.manifest.id} className="nova-ext-card">
            <div className="nova-ext-icon">
              {ext.manifest.icon ? (
                <img
                  src={`nova-ext://${ext.manifest.id}/${ext.manifest.icon}`}
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span>◆</span>
              )}
            </div>
            <div className="nova-ext-info">
              <div className="nova-ext-name">
                {ext.manifest.name}{" "}
                <span className="nova-ext-version">v{ext.manifest.version}</span>
              </div>
              {ext.manifest.description && (
                <div className="nova-ext-desc">{ext.manifest.description}</div>
              )}
              <div className="nova-ext-perms">
                {ext.manifest.permissions.map((p) => (
                  <span key={p} className="nova-ext-perm">
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="nova-ext-uninstall"
              onClick={() => handleUninstall(ext.manifest.id)}
              disabled={busy === ext.manifest.id}
              title="Uninstall"
              aria-label="Uninstall"
            >
              {busy === ext.manifest.id ? "…" : "×"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}