import { useState } from "react";
import {
  Settings as SettingsType,
  SEARCH_ENGINES,
  BROWSER_NAME,
} from "../hooks/useSettings";
import ExtensionsPanel from "./ExtensionsPanel";
import AdBlockerSettings from "./AdBlockerSettings";

interface SettingsPageProps {
  settings: SettingsType;
  onUpdate: (partial: Partial<SettingsType>) => void;
  onReset: () => void;
  onClose: () => void;
}

const ACCENT_PRESETS = [
  { name: "Cyan", value: "#00e5ff" },
  { name: "Violet", value: "#7c4dff" },
  { name: "Magenta", value: "#ff2fd6" },
  { name: "Emerald", value: "#00e676" },
  { name: "Amber", value: "#ffb300" },
  { name: "Crimson", value: "#ff3d5a" },
];

export default function SettingsPage({
  settings,
  onUpdate,
  onReset,
  onClose,
}: SettingsPageProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="nova-settings-page">
      <div className="nova-settings-page-inner">
        <header className="nova-settings-page-header">
          <div>
            <div className="nova-settings-eyebrow">AeteX</div>
            <h1 className="nova-settings-title">Settings</h1>
          </div>
          <button
            className="nova-settings-page-close"
            onClick={onClose}
            aria-label="Close settings"
            title="Close tab"
          >
            ×
          </button>
        </header>

        <div className="nova-settings-body">
          {/* ── Search ─────────────────────────────── */}
          <section className="nova-settings-section">
            <h2 className="nova-section-title">Search</h2>
            <label className="nova-field">
              <span className="nova-field-label">Default search engine</span>
              <select
                className="nova-input nova-select"
                value={settings.searchEngine}
                onChange={(e) =>
                  onUpdate({
                    searchEngine:
                      e.target.value as SettingsType["searchEngine"],
                  })
                }
              >
                {SEARCH_ENGINES.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </label>

            {settings.searchEngine === "custom" && (
              <label className="nova-field">
                <span className="nova-field-label">Custom search URL</span>
                <input
                  className="nova-input"
                  type="text"
                  value={settings.customSearchUrl}
                  onChange={(e) =>
                    onUpdate({ customSearchUrl: e.target.value })
                  }
                  placeholder="https://example.com/search?q=%s"
                />
                <span className="nova-field-hint">
                  Use <code>%s</code> where the search query should be
                  inserted.
                </span>
              </label>
            )}
          </section>

          {/* ── Homepage ───────────────────────────── */}
          <section className="nova-settings-section">
            <h2 className="nova-section-title">Homepage</h2>
            <label className="nova-field">
              <span className="nova-field-label">Home URL</span>
              <input
                className="nova-input"
                type="text"
                value={settings.homepage}
                onChange={(e) => onUpdate({ homepage: e.target.value })}
                placeholder="https://duckduckgo.com"
              />
              <span className="nova-field-hint">
                Opened whenever a new tab is created.
              </span>
            </label>
          </section>

          {/* ── Appearance ─────────────────────────── */}
          <section className="nova-settings-section">
            <h2 className="nova-section-title">Appearance</h2>
            <div className="nova-field">
              <span className="nova-field-label">Accent color</span>
              <div className="nova-swatches">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className={`nova-swatch ${
                      settings.accentColor.toLowerCase() ===
                      preset.value.toLowerCase()
                        ? "nova-swatch--active"
                        : ""
                    }`}
                    style={{ background: preset.value }}
                    title={preset.name}
                    onClick={() => onUpdate({ accentColor: preset.value })}
                    aria-label={preset.name}
                  />
                ))}
                <label className="nova-swatch nova-swatch--custom">
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) =>
                      onUpdate({ accentColor: e.target.value })
                    }
                  />
                  <span>Custom</span>
                </label>
              </div>
            </div>
          </section>

          {/* ── Behavior ───────────────────────────── */}
          <section className="nova-settings-section">
            <h2 className="nova-section-title">Behavior</h2>

            <label className="nova-toggle-row">
              <div>
                <div className="nova-field-label">Custom context menu</div>
                <div className="nova-field-hint">
                  Use Nova's futuristic right-click menu instead of the system
                  one. Takes effect on newly opened tabs.
                </div>
              </div>
              <input
                type="checkbox"
                className="nova-toggle"
                checked={settings.customContextMenu}
                onChange={(e) =>
                  onUpdate({ customContextMenu: e.target.checked })
                }
              />
            </label>
          </section>

          {/* ── Ad Blocker ─────────────────────────── */}
          <AdBlockerSettings />

          {/* ── AI Assistant ───────────────────────── */}
          <section className="nova-settings-section">
            <h2 className="nova-section-title">AI Assistant</h2>

            <label className="nova-toggle-row">
              <div>
                <div className="nova-field-label">Enable AI assistant</div>
                <div className="nova-field-hint">
                  Requires a running llama.cpp server.
                </div>
              </div>
              <input
                type="checkbox"
                className="nova-toggle"
                checked={settings.aiEnabled}
                onChange={(e) => onUpdate({ aiEnabled: e.target.checked })}
              />
            </label>

            {settings.aiEnabled && (
              <>
                <label className="nova-field">
                  <span className="nova-field-label">Server URL</span>
                  <input
                    className="nova-input"
                    type="text"
                    value={settings.aiServerUrl}
                    onChange={(e) =>
                      onUpdate({ aiServerUrl: e.target.value })
                    }
                    placeholder="http://127.0.0.1:8080"
                  />
                  <span className="nova-field-hint">
                    Default llama.cpp port is <code>8080</code>.
                  </span>
                </label>

                <label className="nova-field">
                  <span className="nova-field-label">Model name</span>
                  <input
                    className="nova-input"
                    type="text"
                    value={settings.aiModel}
                    onChange={(e) => onUpdate({ aiModel: e.target.value })}
                    placeholder="gpt-3.5-turbo"
                  />
                  <span className="nova-field-hint">
                    llama.cpp ignores this value — the loaded model is used —
                    but the API requires it.
                  </span>
                </label>

                <label className="nova-field">
                  <span className="nova-field-label">System prompt</span>
                  <textarea
                    className="nova-input nova-textarea"
                    value={settings.aiSystemPrompt}
                    onChange={(e) =>
                      onUpdate({ aiSystemPrompt: e.target.value })
                    }
                    rows={3}
                  />
                </label>

                <label className="nova-field">
                  <span className="nova-field-label">
                    Temperature — {settings.aiTemperature.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    className="nova-range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={settings.aiTemperature}
                    onChange={(e) =>
                      onUpdate({
                        aiTemperature: parseFloat(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
          </section>

          {/* ── Extensions ─────────────────────────── */}
          <section className="nova-settings-section">
            <h2 className="nova-section-title">Extensions</h2>
            <ExtensionsPanel />
          </section>

          {/* ── About ──────────────────────────────── */}
          <section className="nova-settings-section">
            <h2 className="nova-section-title">About</h2>
            <div className="nova-about-card">
              <div className="nova-about-logo">A</div>
              <div className="nova-about-text">
                <div className="nova-about-name">{BROWSER_NAME}</div>
                <div className="nova-about-meta">
                  A <span className="nova-about-brand">AeteX</span> product ·
                  v0.1.0
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="nova-settings-footer">
          {showResetConfirm ? (
            <>
              <span className="nova-reset-warning">
                Reset all settings to defaults?
              </span>
              <button
                className="nova-settings-btn nova-settings-btn--ghost"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="nova-settings-btn nova-settings-btn--danger"
                onClick={() => {
                  onReset();
                  setShowResetConfirm(false);
                }}
              >
                Reset
              </button>
            </>
          ) : (
            <>
              <button
                className="nova-settings-btn nova-settings-btn--ghost"
                onClick={() => setShowResetConfirm(true)}
              >
                Reset to defaults
              </button>
              <div className="nova-settings-spacer" />
              <button
                className="nova-settings-btn nova-settings-btn--primary"
                onClick={onClose}
              >
                Done
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}