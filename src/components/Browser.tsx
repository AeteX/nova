import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
// ── Changed: Import Logical instead of Physical ──
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import SettingsPage from "./Settings";
import DownloadsPage from "./DownloadsPage";
import HomePage from "./HomePage";
import AIPanel from "./AIPanel";
import ZoomMenu from "./ZoomMenu";
import ExtensionFrame from "../extension-host/ExtensionFrame";
import { useSettings, BROWSER_NAME } from "../hooks/useSettings";
import { useExtensions } from "../hooks/useExtensions";
import { useDownloads } from "../hooks/useDownloads";
import { buildToolset } from "../hooks/useAITools";

interface Tab {
  id: string;
  title: string;
  url: string;
  zoom: number;
  history: string[];
  historyIndex: number;
}

type ContextAction =
  | "back"
  | "forward"
  | "reload"
  | "copy"
  | "paste"
  | "select-all"
  | "open-link-new-tab"
  | "copy-link"
  | "save-link"
  | "open-image-new-tab"
  | "copy-image-address"
  | "save-image-as"
  | "reload-frame";

let tabCounter = 0;

const SETTINGS_URL = "nova://settings";
const DOWNLOADS_URL = "nova://downloads";
const HOME_URL = "nova://home";
const POPOVER_WIDTH = 320;

function isInternalUrl(url: string): boolean {
  return url.startsWith("nova://");
}

function internalPageTitle(url: string): string {
  const path = url.replace(/^nova:\/\//, "").replace(/\/+$/, "");
  if (path === "settings") return "Settings";
  if (path === "downloads") return "Downloads";
  if (path === "home" || path === "") return "New Tab";
  return "Nova";
}

export default function Browser() {
  const { settings, update, reset, getSearchUrl } = useSettings();
  const { extensions } = useExtensions();
  const { activeCount: activeDownloads } = useDownloads();

  const createNewTab = useCallback(
    (url?: string): Tab => {
      tabCounter += 1;
      const finalUrl = url ?? (settings.homepage || HOME_URL);
      const title = isInternalUrl(finalUrl)
        ? internalPageTitle(finalUrl)
        : finalUrl;
      return {
        id: `tab-${tabCounter}`,
        title,
        url: finalUrl,
        zoom: 1.0,
        history: [finalUrl],
        historyIndex: 0,
      };
    },
    [settings.homepage]
  );

  const [tabs, setTabs] = useState<Tab[]>(() => [createNewTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [addressBar, setAddressBar] = useState(tabs[0].url);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);

  const [webviewInstance, setWebviewInstance] = useState<Webview | null>(null);

  const webviewLabelRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressTimerRef = useRef<number | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const downloadsAnchorRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const requestedUrlRef = useRef<Record<string, string>>({});
  const tabsRef = useRef(tabs);

  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTab = tabs.find((t) => t.id === activeTabId)!;
  const activeIsInternal = isInternalUrl(activeTab.url);
  const canGoBack = activeTab.historyIndex > 0;
  const canGoForward = activeTab.historyIndex < activeTab.history.length - 1;

  useEffect(() => {
    getCurrentWindow().setTitle(BROWSER_NAME).catch(() => {});
  }, []);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    listen<{ label: string; event: string; url: string }>(
      "browser://load",
      (e) => {
        const { label, event, url } = e.payload;
        const currentActiveTabId = activeTabIdRef.current;

        if (
          url &&
          url !== "about:blank" &&
          !url.startsWith("data:") &&
          !url.startsWith("blob:")
        ) {
          requestedUrlRef.current[label] = url;

          if (event === "started") {
            setTabs((prev) => {
              const idx = prev.findIndex((t) => t.id === label);
              if (idx === -1) return prev;
              const t = prev[idx];
              if (t.url === url) return prev;

              const truncated = t.history.slice(0, t.historyIndex + 1);
              const next =
                truncated[truncated.length - 1] === url
                  ? truncated
                  : [...truncated, url].slice(-100);

              const copy = [...prev];
              copy[idx] = {
                ...t,
                url,
                title: isInternalUrl(url) ? internalPageTitle(url) : url,
                history: next,
                historyIndex: next.length - 1,
              };
              return copy;
            });

            if (
              label === currentActiveTabId &&
              document.activeElement !== addressInputRef.current
            ) {
              setAddressBar(url);
            }
          }
        }

        if (label !== currentActiveTabId) return;

        if (event === "started") {
          setIsLoading(true);
          setLoadProgress(8);
          if (progressTimerRef.current)
            window.clearInterval(progressTimerRef.current);
          progressTimerRef.current = window.setInterval(() => {
            setLoadProgress((p) => {
              if (p >= 92) return p;
              return p + Math.max(0.4, (92 - p) * 0.06);
            });
          }, 120);
        } else if (event === "finished") {
          if (progressTimerRef.current) {
            window.clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }
          setLoadProgress(100);
          window.setTimeout(() => {
            setIsLoading(false);
            setLoadProgress(0);
          }, 340);
        }
      }
    ).then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) unlistenFn();
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!settings.customContextMenu) return;
    let unlisten: (() => void) | null = null;
    listen<{ label: string; event: string }>("browser://load", async (e) => {
      if (e.payload.event !== "finished") return;
      if (e.payload.label !== activeTabId) return;
      try {
        const script = await invoke<string>("get_context_menu_script");
        await invoke("inject_js", {
          label: e.payload.label,
          js: script,
        });
      } catch (err) {
        console.error("Failed to inject context menu script:", err);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [activeTabId, settings.customContextMenu]);

  useEffect(() => {
    const previousLabel = webviewLabelRef.current;

    if (
      previousLabel === activeTab.id &&
      requestedUrlRef.current[activeTab.id] === activeTab.url
    ) {
      return;
    }

    webviewLabelRef.current = null;
    if (previousLabel) {
      invoke("close_tab_webview", { label: previousLabel }).catch(() => {});
      setWebviewInstance(null);
    }

    if (activeIsInternal) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const label = activeTab.id;
    const zoom = activeTab.zoom;

    requestedUrlRef.current[label] = activeTab.url;

    let cancelled = false;

    (async () => {
      try {
        await invoke("create_tab_webview", {
          label,
          url: activeTab.url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          zoom,
        });
        if (cancelled) return;
        webviewLabelRef.current = label;

        const { Webview: WebviewClass } = await import(
          "@tauri-apps/api/webview"
        );
        const handle = await WebviewClass.getByLabel(label);
        if (handle && !cancelled) setWebviewInstance(handle);
      } catch (e) {
        console.error("Failed to create tab webview:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.id, activeTab.url, activeIsInternal]);

  useEffect(() => {
    return () => {
      const label = webviewLabelRef.current;
      if (label) {
        invoke("close_tab_webview", { label }).catch(() => {});
        webviewLabelRef.current = null;
      }
    };
  }, []);

  // ── Changed: Logical sizing loop ────────────────────────
  useEffect(() => {
    if (!webviewInstance) return;
    let cancelled = false;
    let rafId = 0;
    let lastX = -1;
    let lastY = -1;
    let lastW = -1;
    let lastH = -1;

    const tick = () => {
      if (cancelled) return;
      const node = containerRef.current;
      if (node) {
        const rect = node.getBoundingClientRect();
        
        // Use logical pixels directly, no flooring.
        const x = rect.left;
        const y = rect.top;
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        
        if (x !== lastX || y !== lastY) {
          lastX = x;
          lastY = y;
          webviewInstance
            .setPosition(new LogicalPosition(x, y))
            .catch(() => {});
        }
        if (w !== lastW || h !== lastH) {
          lastW = w;
          lastH = h;
          webviewInstance
            .setSize(new LogicalSize(w, h))
            .catch(() => {});
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [webviewInstance]);

  useEffect(() => {
    if (!webviewInstance) return;
    if (tabsMenuOpen) {
      webviewInstance.hide().catch(() => {});
    } else {
      webviewInstance.show().catch(() => {});
    }
  }, [tabsMenuOpen, webviewInstance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomMenuOpen) setZoomMenuOpen(false);
      else if (tabsMenuOpen) setTabsMenuOpen(false);
      else if (aiOpen) setAiOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiOpen, tabsMenuOpen, zoomMenuOpen]);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      } else if (e.deltaX !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaX;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const check = () => {
      setTabsOverflowing(el.scrollWidth > el.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [tabs]);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(".nova-tab--active");
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    if (left < viewLeft) {
      el.scrollTo({ left, behavior: "smooth" });
    } else if (right > viewRight) {
      el.scrollTo({ left: right - el.clientWidth, behavior: "smooth" });
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!tabsMenuOpen) return;
    const onClick = () => setTabsMenuOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [tabsMenuOpen]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const anchor = zoomAnchorRef.current;
      if (anchor && anchor.contains(e.target as Node)) return;
      setZoomMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [zoomMenuOpen]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    listen("downloads-popover-opened", () => setDownloadsOpen(true)).then(
      (fn) => unlisteners.push(fn)
    );
    listen("downloads-popover-closed", () => setDownloadsOpen(false)).then(
      (fn) => unlisteners.push(fn)
    );
    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!downloadsOpen) return;
    const onDown = (e: MouseEvent) => {
      const anchor = downloadsAnchorRef.current;
      if (anchor && anchor.contains(e.target as Node)) return;
      invoke("hide_downloads_popover").catch(() => {});
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [downloadsOpen]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ url: string }>("browser://open-tab", (e) => {
      if (e.payload?.url) openInNewTab(e.payload.url);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ url: string; filename?: string; source_page_url?: string }>(
      "browser://download",
      (e) => {
        if (!e.payload?.url) return;
        invoke("start_download", {
          url: e.payload.url,
          suggestedFilename: e.payload.filename ?? null,
          sourcePageUrl: e.payload.source_page_url ?? null,
        }).catch((err) => console.error("Download failed:", err));
      }
    ).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ action: string; payload: string | null }>(
      "browser://context-action",
      (e) => {
        if (!e.payload?.action) return;
        handleContextAction(
          e.payload.action as ContextAction,
          e.payload.payload ?? undefined
        );
      }
    ).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyZoom = useCallback(
    async (label: string, action: "in" | "out" | "reset" | number) => {
      const tab = tabsRef.current.find((t) => t.id === label);
      if (!tab) return;

      let next = tab.zoom;
      if (typeof action === "number") {
        next = Math.min(5.0, Math.max(0.25, action));
      } else if (action === "in") {
        next = Math.min(5.0, Math.round((tab.zoom + 0.1) * 100) / 100);
      } else if (action === "out") {
        next = Math.max(0.25, Math.round((tab.zoom - 0.1) * 100) / 100);
      } else {
        next = 1.0;
      }

      if (Math.abs(next - tab.zoom) < 0.001) return;

      tabsRef.current = tabsRef.current.map((t) =>
        t.id === label ? { ...t, zoom: next } : t
      );

      try {
        await invoke("set_webview_zoom", { label, zoom: next });
        setTabs((prev) =>
          prev.map((t) => (t.id === label ? { ...t, zoom: next } : t))
        );
      } catch (err) {
        console.error("Zoom failed:", err);
      }
    },
    []
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ label: string; action: string }>("browser://zoom", (e) => {
      const a = e.payload.action;
      if (a === "in" || a === "out" || a === "reset") {
        applyZoom(e.payload.label, a);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [applyZoom]);

  const navigate = useCallback(
    (raw: string) => {
      let url = raw.trim();
      if (!url) return;

      if (isInternalUrl(url)) {
        url = url.replace(/^nova:\/\//, "nova://");
      } else if (!/^https?:\/\//i.test(url)) {
        if (/^[\w-]+(\.[\w-]+)+/.test(url) && !url.includes(" ")) {
          url = `https://${url}`;
        } else {
          url = getSearchUrl(url);
        }
      }

      const title = isInternalUrl(url) ? internalPageTitle(url) : url;

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTabId) return t;
          const truncated = t.history.slice(0, t.historyIndex + 1);
          if (truncated[truncated.length - 1] === url) {
            return { ...t, url, title };
          }
          const next = [...truncated, url].slice(-100);
          return {
            ...t,
            url,
            title,
            history: next,
            historyIndex: next.length - 1,
          };
        })
      );
      setAddressBar(url);
    },
    [activeTabId, getSearchUrl]
  );

  const goBack = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t;
        if (t.historyIndex <= 0) return t;
        const idx = t.historyIndex - 1;
        const target = t.history[idx];
        setAddressBar(target);
        return { ...t, url: target, historyIndex: idx };
      })
    );
  }, [activeTabId]);

  const goForward = useCallback(() => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t;
        if (t.historyIndex >= t.history.length - 1) return t;
        const idx = t.historyIndex + 1;
        const target = t.history[idx];
        setAddressBar(target);
        return { ...t, url: target, historyIndex: idx };
      })
    );
  }, [activeTabId]);

  const reload = useCallback(async () => {
    if (activeIsInternal) return;
    try {
      await invoke("reload_webview", { label: activeTabId });
    } catch (err) {
      console.error("Reload failed:", err);
    }
  }, [activeTabId, activeIsInternal]);

  const addTab = useCallback(() => {
    const newTab = createNewTab();
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setAddressBar(newTab.url);
    return newTab;
  }, [createNewTab]);

  const openInNewTab = useCallback(
    (url: string) => {
      const newTab = createNewTab(url);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      setAddressBar(newTab.url);
      return newTab;
    },
    [createNewTab]
  );

  const openSettings = useCallback(() => {
    const existing = tabs.find((t) => t.url === SETTINGS_URL);
    if (existing) {
      setActiveTabId(existing.id);
      setAddressBar(existing.url);
      return;
    }
    const newTab = createNewTab(SETTINGS_URL);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setAddressBar(newTab.url);
  }, [tabs, createNewTab]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          const fresh = createNewTab();
          setActiveTabId(fresh.id);
          setAddressBar(fresh.url);
          return [fresh];
        }
        if (id === activeTabId) {
          const idx = prev.findIndex((t) => t.id === id);
          const next = remaining[Math.min(idx, remaining.length - 1)];
          setActiveTabId(next.id);
          setAddressBar(next.url);
        }
        return remaining;
      });
      delete requestedUrlRef.current[id];
    },
    [activeTabId, createNewTab]
  );

  const selectTab = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab) {
      setActiveTabId(id);
      setAddressBar(tab.url);
    }
  };

  const handleClose = () => getCurrentWindow().close();
  const handleMinimize = () => getCurrentWindow().minimize();
  const handleToggleMaximize = () => getCurrentWindow().toggleMaximize();

  const toggleDownloads = useCallback(async () => {
    const anchor = downloadsAnchorRef.current;
    if (!anchor) return;
    try {
      const win = getCurrentWindow();
      const scaleFactor = await win.scaleFactor();
      const outerPos = await win.outerPosition();
      const logical = outerPos.toLogical(scaleFactor);
      const rect = anchor.getBoundingClientRect();
      const x = Math.round(logical.x + rect.right - POPOVER_WIDTH);
      const y = Math.round(logical.y + rect.bottom + 8);
      await invoke("toggle_downloads_popover", { x, y });
    } catch (err) {
      console.error("Toggle downloads popover failed:", err);
    }
  }, []);

  const handleContextAction = useCallback(
    async (action: ContextAction, payload?: string) => {
      const currentLabel = activeTabId;

      const copyText = async (text: string) => {
        try {
          await navigator.clipboard.writeText(text);
          return;
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
          } catch {
            // ignore
          }
          document.body.removeChild(ta);
        }
      };

      const evalInPage = async (js: string) => {
        try {
          await invoke("inject_js", { label: currentLabel, js });
        } catch (err) {
          console.error("inject_js failed:", err);
        }
      };

      const startDownload = async (url: string, suggested?: string) => {
        try {
          await invoke("start_download", {
            url,
            suggestedFilename: suggested ?? null,
            sourcePageUrl: activeTab.url,
          });
        } catch (err) {
          console.error("Download failed:", err);
        }
      };

      switch (action) {
        case "back":
          goBack();
          break;
        case "forward":
          goForward();
          break;
        case "reload":
          reload();
          break;
        case "copy":
          if (payload) await copyText(payload);
          break;
        case "paste":
          await evalInPage("try{document.execCommand('paste')}catch(e){}");
          break;
        case "select-all":
          await evalInPage(
            "try{document.execCommand('selectAll')}catch(e){}"
          );
          break;
        case "open-link-new-tab":
          if (payload) openInNewTab(payload);
          break;
        case "copy-link":
          if (payload) await copyText(payload);
          break;
        case "save-link":
          if (payload) await startDownload(payload);
          break;
        case "open-image-new-tab":
          if (payload) openInNewTab(payload);
          break;
        case "copy-image-address":
          if (payload) await copyText(payload);
          break;
        case "save-image-as":
          if (payload) await startDownload(payload);
          break;
        case "reload-frame":
          reload();
          break;
        default:
          break;
      }
    },
    [activeTabId, goBack, goForward, reload, openInNewTab, activeTab.url]
  );

  const aiToolset = useMemo(
    () =>
      buildToolset({
        navigate: (url) => navigate(url),
        openInNewTab: (url) => openInNewTab(url),
        search: (q) => navigate(getSearchUrl(q)),
        newTab: () => addTab(),
        closeCurrentTab: () => closeTab(activeTabId),
        getOpenTabs: () =>
          tabs.map((t) => ({
            title: t.title,
            url: t.url,
            active: t.id === activeTabId,
          })),
        getCurrentTab: () => ({
          title: activeTab.title,
          url: activeTab.url,
        }),
        setSearchEngine: (id) => update({ searchEngine: id }),
        setAccentColor: (hex) => update({ accentColor: hex }),
        setHomepage: (url) => update({ homepage: url }),
      }),
    [
      navigate,
      openInNewTab,
      getSearchUrl,
      addTab,
      closeTab,
      activeTabId,
      tabs,
      activeTab,
      update,
    ]
  );

  return (
    <div className="nova-root">
      {extensions.map((ext) => (
        <ExtensionFrame key={ext.manifest.id} extension={ext} />
      ))}

      <div
        className={`nova-loadbar ${isLoading ? "nova-loadbar--active" : ""}`}
        aria-hidden="true"
      >
        <div
          className="nova-loadbar-fill"
          style={{ width: `${loadProgress}%` }}
        />
        <div
          className="nova-loadbar-glow"
          style={{ left: `${loadProgress}%` }}
        />
      </div>

      <header className="nova-toolbar">
        <div className="nova-window-controls">
          <button
            className="nova-dot nova-dot--close"
            onClick={handleClose}
            title="Close"
            aria-label="Close"
          />
          <button
            className="nova-dot nova-dot--min"
            onClick={handleMinimize}
            title="Minimize"
            aria-label="Minimize"
          />
          <button
            className="nova-dot nova-dot--max"
            onClick={handleToggleMaximize}
            title="Maximize"
            aria-label="Maximize"
          />
        </div>

        <div className="nova-nav-buttons">
          <button
            className="nova-btn"
            onClick={goBack}
            disabled={!canGoBack}
            title="Back"
            aria-label="Back"
          >
            ◀
          </button>
          <button
            className="nova-btn"
            onClick={goForward}
            disabled={!canGoForward}
            title="Forward"
            aria-label="Forward"
          >
            ▶
          </button>
          <button
            className="nova-btn"
            onClick={reload}
            disabled={activeIsInternal}
            title="Reload"
            aria-label="Reload"
          >
            ⟳
          </button>
        </div>

        <div
          className={`nova-address-wrap ${
            isLoading ? "nova-address-wrap--loading" : ""
          }`}
        >
          <div className="nova-address-glow" />
          <input
            ref={addressInputRef}
            className="nova-address"
            value={addressBar}
            onChange={(e) => setAddressBar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate(addressBar);
            }}
            placeholder={`Search with ${BROWSER_NAME} or enter address`}
            spellCheck={false}
          />
        </div>

        {!activeIsInternal && (
          <div className="nova-zoom-anchor" ref={zoomAnchorRef}>
            <button
              className={`nova-btn nova-btn--zoom ${
                Math.abs(activeTab.zoom - 1.0) > 0.001
                  ? "nova-btn--zoom-active"
                  : ""
              }`}
              onClick={() => setZoomMenuOpen((v) => !v)}
              title={`Zoom: ${Math.round(activeTab.zoom * 100)}%`}
              aria-label="Zoom"
            >
              {Math.round(activeTab.zoom * 100)}%
            </button>
            {zoomMenuOpen && (
              <ZoomMenu
                zoom={activeTab.zoom}
                onChange={(z) => applyZoom(activeTabId, z)}
                onClose={() => setZoomMenuOpen(false)}
              />
            )}
          </div>
        )}

        {settings.aiEnabled && (
          <button
            className={`nova-btn nova-btn--ai ${
              aiOpen ? "nova-btn--ai-active" : ""
            }`}
            onClick={() => setAiOpen((v) => !v)}
            title="AI Assistant"
            aria-label="AI Assistant"
          >
            ◈
          </button>
        )}

        <div className="nova-dl-anchor" ref={downloadsAnchorRef}>
          <button
            className={`nova-btn nova-btn--downloads ${
              downloadsOpen ? "nova-btn--downloads-active" : ""
            }`}
            onClick={toggleDownloads}
            title="Downloads"
            aria-label="Downloads"
          >
            ↓
            {activeDownloads > 0 && (
              <span className="nova-dl-badge">{activeDownloads}</span>
            )}
          </button>
        </div>

        <button
          className="nova-btn nova-btn--new-tab"
          onClick={addTab}
          title="New tab"
          aria-label="New tab"
        >
          +
        </button>
        <button
          className="nova-btn nova-btn--settings"
          onClick={openSettings}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </header>

      <div className="nova-tabs-wrap">
        <div className="nova-tabs" ref={tabsScrollRef}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`nova-tab ${
                tab.id === activeTabId ? "nova-tab--active" : ""
              }`}
              onClick={() => selectTab(tab.id)}
            >
              <span className="nova-tab-title">{tab.title}</span>
              <button
                className="nova-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label="Close tab"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {tabsOverflowing && (
          <div
            className="nova-tabs-overflow-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="nova-tabs-overflow"
              onClick={() => setTabsMenuOpen((v) => !v)}
              title="All tabs"
              aria-label="All tabs"
            >
              ⋯
            </button>

            {tabsMenuOpen && (
              <div className="nova-tabs-menu">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`nova-tabs-menu-item ${
                      tab.id === activeTabId
                        ? "nova-tabs-menu-item--active"
                        : ""
                    }`}
                    onClick={() => {
                      selectTab(tab.id);
                      setTabsMenuOpen(false);
                    }}
                  >
                    <span className="nova-tabs-menu-item-title">
                      {tab.title}
                    </span>
                    <button
                      className="nova-tabs-menu-item-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      aria-label="Close tab"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`nova-main ${aiOpen ? "nova-main--ai-open" : ""}`}>
        <div
          ref={containerRef}
          className="nova-content"
          style={{ visibility: activeIsInternal ? "hidden" : "visible" }}
        />

        {activeIsInternal && (
          <div className="nova-internal-page">
            {activeTab.url === SETTINGS_URL ? (
              <SettingsPage
                settings={settings}
                onUpdate={update}
                onReset={reset}
                onClose={() => closeTab(activeTabId)}
              />
            ) : activeTab.url === DOWNLOADS_URL ? (
              <DownloadsPage onClose={() => closeTab(activeTabId)} />
            ) : activeTab.url === HOME_URL ||
              activeTab.url === "nova://home/" ||
              activeTab.url === "nova://" ? (
              <HomePage
                quickLinks={settings.quickLinks}
                onUpdateQuickLinks={(links) => update({ quickLinks: links })}
                getSearchUrl={getSearchUrl}
                onNavigate={navigate}
                onOpenNewTab={openInNewTab}
                onOpenAi={() => setAiOpen(true)}
                onOpenSettings={openSettings}
                onOpenDownloads={toggleDownloads}
              />
            ) : (
              <div className="nova-internal-404">
                <div className="nova-internal-404-glyph">◈</div>
                <div className="nova-internal-404-title">Page not found</div>
                <div className="nova-internal-404-sub">{activeTab.url}</div>
              </div>
            )}
          </div>
        )}

        <aside className="nova-ai-sidebar">
          <AIPanel
            settings={settings}
            tools={aiToolset}
            onClose={() => setAiOpen(false)}
          />
        </aside>
      </div>
    </div>
  );
}