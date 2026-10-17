import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../hooks/useSettings";

interface AdBlockerState {
  enabled: boolean;
  rule_count: number;
}

interface DiagnoseResult {
  url: string;
  source_url: string;
  request_type: string;
  parse_error: string | null;
  has_filter: boolean;
  has_exception: boolean;
  important: boolean;
  blocked: boolean;
}

export default function AdBlockerSettings() {
  const { settings, update } = useSettings();
  const [backend, setBackend] = useState<AdBlockerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [testUrl, setTestUrl] = useState(
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
  );
  const [testSource, setTestSource] = useState(
    "https://adblocktester.pages.dev/"
  );
  const [testType, setTestType] = useState("script");
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    invoke<AdBlockerState>("get_adblocker_settings")
      .then((s) => {
        setBackend(s);
        if (s.enabled !== settings.adBlockerEnabled) {
          update({ adBlockerEnabled: s.enabled });
        }
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    if (!backend) return;
    const next = !backend.enabled;
    try {
      await invoke("set_adblocker_enabled", { enabled: next });
      setBackend({ ...backend, enabled: next });
      update({ adBlockerEnabled: next });
    } catch (e) {
      setError(String(e));
    }
  };

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const count = await invoke<number>("load_bundled_easylist");
      const refreshed = await invoke<AdBlockerState>("get_adblocker_settings");
      setBackend(refreshed);
      console.log(`[adblock] loaded ${count} rules`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const r = await invoke<DiagnoseResult>("diagnose_url", {
        url: testUrl,
        sourceUrl: testSource,
        requestType: testType,
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  };

  if (error) {
    return (
      <section className="nova-settings-section">
        <h2 className="nova-section-title">Ad Blocker</h2>
        <div className="nova-field-hint" style={{ color: "#ff8fa0" }}>
          {error}
        </div>
      </section>
    );
  }

  if (!backend) {
    return (
      <section className="nova-settings-section">
        <h2 className="nova-section-title">Ad Blocker</h2>
        <div className="nova-field-hint">Loading…</div>
      </section>
    );
  }

  return (
    <section className="nova-settings-section">
      <h2 className="nova-section-title">Ad Blocker</h2>

      <label className="nova-toggle-row">
        <div>
          <div className="nova-field-label">Enable ad blocker</div>
          <div className="nova-field-hint">
            {backend.rule_count > 0
              ? `${backend.rule_count.toLocaleString()} rules loaded`
              : "No rules loaded"}
          </div>
        </div>
        <input
          type="checkbox"
          className="nova-toggle"
          checked={backend.enabled}
          onChange={toggle}
        />
      </label>

      {backend.rule_count === 0 && (
        <button
          className="nova-settings-btn nova-settings-btn--primary"
          onClick={loadRules}
          disabled={loading}
          style={{ marginTop: 12 }}
        >
          {loading ? "Loading…" : "Load EasyList"}
        </button>
      )}

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="nova-field-label" style={{ marginBottom: 12 }}>
          Test a URL against the engine
        </div>

        <label className="nova-field">
          <span className="nova-field-hint">Request URL</span>
          <input
            className="nova-input"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="nova-field">
          <span className="nova-field-hint">Source page URL</span>
          <input
            className="nova-input"
            value={testSource}
            onChange={(e) => setTestSource(e.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="nova-field">
          <span className="nova-field-hint">Request type</span>
          <input
            className="nova-input"
            value={testType}
            onChange={(e) => setTestType(e.target.value)}
            spellCheck={false}
            placeholder="script"
          />
        </label>

        <button
          className="nova-settings-btn nova-settings-btn--ghost"
          onClick={runTest}
          disabled={testing}
          style={{ marginTop: 8 }}
        >
          {testing ? "Testing…" : "Test"}
        </button>

        {result && (
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: "rgba(0,0,0,0.3)",
              borderRadius: 8,
              fontSize: 11,
              color: result.blocked ? "#00e676" : "#ff8fa0",
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
{JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}