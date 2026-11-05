import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import SettingsPage from "./Settings";
import DownloadsPage from "./DownloadsPage";
import HomePage from "./HomePage";
import HistoryPage from "./HistoryPage";
import BookmarksPage from "./BookmarksPage";
import CommandPalette from "./CommandPalette";
import BookmarksBar from "./BookmarksBar";
import AIPanel from "./AIPanel";
import ExtensionFrame from "../extension-host/ExtensionFrame";
import ExtensionPanelView from "./ExtensionPanelView";
import ExtensionPanelsMenu from "./ExtensionPanelsMenu";
import {
  useSettings,
  BROWSER_NAME,
  type ToolbarItemId,
} from "../hooks/useSettings";
import { useExtensions } from "../hooks/useExtensions";
import { useDownloads } from "../hooks/useDownloads";
import { useBookmarks } from "../hooks/useStorage";
import { buildToolset } from "../hooks/useAITools";

interface Tab {
  id: string;
  title: string;
  url: string;
  history: string[];
  historyIndex: number;
}

interface SessionTabPayload {
  id: string;
  url: string;
  title: string;
  history: string[];
  history_index: number;
}

interface SessionPayload {
  tabs: SessionTabPayload[];
  active_tab_id: string | null;
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
const HISTORY_URL = "nova://history";
const BOOKMARKS_URL = "nova://bookmarks";
const HOME_URL = "nova://home";
const POPOVER_WIDTH = 320;
const MAX_CLOSED_TABS = 20;

function isInternalUrl(url: string): boolean {
  return url.startsWith("nova://");
}

function internalPageTitle(url: string): string {
  const path = url.replace(/^nova:\/\//, "").replace(/\/+$/, "");
  if (path === "settings") return "Settings";
  if (path === "downloads") return "Downloads";
  if (path === "history") return "History";
  if (path === "bookmarks") return "Bookmarks";
  if (path === "home" || path === "") return "New Tab";
  return "Nova";
}

interface ShortcutHandlers {
  toggleBookmark: () => void;
  commandPalette: () => void;
  newTab: () => void;
  closeTab: () => void;
  reopenClosedTab: () => void;
  nextTab: () => void;
  prevTab: () => void;
  jumpToTab: (n: number) => void;
  focusAddress: () => void;
  reload: () => void;
  back: () => void;
  forward: () => void;
  toggleBookmarksBar: () => void;
}

export default function Browser() {
  const { settings, update, reset, getSearchUrl } = useSettings();
  const { extensions } = useExtensions();
  const { activeCount: activeDownloads } = useDownloads();
  const { bookmarks, refresh: refreshBookmarks } = useBookmarks();

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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [extMenuOpen, setExtMenuOpen] = useState(false);
  const [activeExtensionPanelId, setActiveExtensionPanelId] = useState<
    string | null
  >(null);
  const [isCurrentBookmarked, setIsCurrentBookmarked] = useState(false);

  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);

  const [webviewInstance, setWebviewInstance] = useState<Webview | null>(null);

  const webviewLabelRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressTimerRef = useRef<number | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const downloadsAnchorRef = useRef<HTMLDivElement>(null);
  const extMenuAnchorRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const requestedUrlRef = useRef<Record<string, string>>({});
  const tabsRef = useRef(tabs);
  const sessionRestoredRef = useRef(false);
  const initialSessionRestoreRef = useRef<boolean>(settings.sessionRestore);
  const closedTabsRef = useRef<Tab[]>([]);

  const shortcutHandlersRef = useRef<ShortcutHandlers>({
    toggleBookmark: () => {},
    commandPalette: () => {},
    newTab: () => {},
    closeTab: () => {},
    reopenClosedTab: () => {},
    nextTab: () => {},
    prevTab: () => {},
    jumpToTab: () => {},
    focusAddress: () => {},
    reload: () => {},
    back: () => {},
    forward: () => {},
    toggleBookmarksBar: () => {},
  });

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
  const sidebarOpen = aiOpen || activeExtensionPanelId !== null;

  const extensionsWithUI = useMemo(
    () => extensions.filter((e) => e.manifest.ui?.panel || e.manifest.ui?.popup),
    [extensions]
  );

  const activeExtensionPanel = useMemo(
    () =>
      extensions.find((e) => e.manifest.id === activeExtensionPanelId) ?? null,
    [extensions, activeExtensionPanelId]
  );

  // ── Session restore on mount ────────────────────────────
  useEffect(() => {
    if (sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;

    if (!initialSessionRestoreRef.current) return;

    (async () => {
      try {
        const session = await invoke<SessionPayload>("session_get");
        if (session.tabs.length === 0) return;
        tabCounter = session.tabs.length;
        const restored: Tab[] = session.tabs.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          history: t.history,
          historyIndex: t.history_index,
        }));
        setTabs(restored);
        const activeId = session.active_tab_id ?? restored[0].id;
        setActiveTabId(activeId);
        const active = restored.find((t) => t.id === activeId) ?? restored[0];
        setAddressBar(active.url);
      } catch (e) {
        console.error("session restore failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clear saved session when disabled ───────────────────
  useEffect(() => {
    if (!settings.sessionRestore) {
      invoke("session_save", {
        session: { tabs: [], active_tab_id: null },
      }).catch(() => {});
    }
  }, [settings.sessionRestore]);

  // ── Save session on tab changes (debounced) ─────────────
  useEffect(() => {
    if (!sessionRestoredRef.current) return;
    if (!settings.sessionRestore) return;
    const t = window.setTimeout(() => {
      const payload: SessionPayload = {
        tabs: tabs.map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          history: tab.history.slice(-100),
          history_index: Math.min(tab.historyIndex, 99),
        })),
        active_tab_id: activeTabId,
      };
      invoke("session_save", { session: payload }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(t);
  }, [tabs, activeTabId, settings.sessionRestore]);

  // ── Track current page bookmark state ───────────────────
  useEffect(() => {
    if (activeIsInternal) {
      setIsCurrentBookmarked(false);
      return;
    }
    invoke<boolean>("bookmarks_is_bookmarked", { url: activeTab.url })
      .then(setIsCurrentBookmarked)
      .catch(() => setIsCurrentBookmarked(false));
  }, [activeTab.url, activeIsInternal, bookmarks]);

  // ── Window title ────────────────────────────────────────
  useEffect(() => {
    getCurrentWindow().setTitle(BROWSER_NAME).catch(() => {});
  }, []);

  // ── Page load events ────────────────────────────────────
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

          if (
            url &&
            !url.startsWith("nova://") &&
            !url.startsWith("about:") &&
            !url.startsWith("data:")
          ) {
            invoke("inject_js", {
              label,
              js: `try {
                var t = document.title || '';
                var u = window.location.href;
                window.location.href = 'https://nova-action.local/page-title?title=' +
                  encodeURIComponent(t) + '&page_url=' + encodeURIComponent(u);
              } catch(e) {}`,
            }).catch(() => {});
          }
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

  // ── Page title capture → update tab + record history ────
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ label: string; title: string | null; url: string }>(
      "browser://page-title",
      (e) => {
        const { label, title, url } = e.payload;
        const finalTitle = title || url;

        setTabs((prev) =>
          prev.map((t) => (t.id === label ? { ...t, title: finalTitle } : t))
        );

        if (url && !url.startsWith("nova://")) {
          invoke("history_record", { url, title: finalTitle }).catch(() => {});
        }
      }
    ).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // ── Inject context menu script ──────────────────────────
  useEffect(() => {
    if (!settings.customContextMenu) return;
    let unlisten: (() => void) | null = null;
    listen<{ label: string; event: string }>("browser://load", async (e) => {
      if (e.payload.event !== "finished") return;
      if (e.payload.label !== activeTabId) return;
      try {
        const script = await invoke<string>("get_context_menu_script");
        await invoke("inject_js", { label: e.payload.label, js: script });
      } catch (err) {
        console.error("Failed to inject context menu script:", err);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [activeTabId, settings.customContextMenu]);

  // ── Mount webview for active tab ────────────────────────
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

  // ── Resize webview to container ─────────────────────────
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
          webviewInstance.setSize(new LogicalSize(w, h)).catch(() => {});
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

  // ── Hide webview for tabs overflow menu ─────────────────
  useEffect(() => {
    if (!webviewInstance) return;
    if (tabsMenuOpen) {
      webviewInstance.hide().catch(() => {});
    } else {
      webviewInstance.show().catch(() => {});
    }
  }, [tabsMenuOpen, webviewInstance]);

  // ── Global keyboard shortcuts (host focus) ──────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const key = e.key.toLowerCase();
      const h = shortcutHandlersRef.current;

      if (e.key === "Escape") {
        if (commandPaletteOpen) setCommandPaletteOpen(false);
        else if (extMenuOpen) setExtMenuOpen(false);
        else if (tabsMenuOpen) setTabsMenuOpen(false);
        else if (sidebarOpen) {
          setAiOpen(false);
          setActiveExtensionPanelId(null);
        }
        return;
      }

      let matched = true;

      if (ctrl && shift && !alt && key === "t") h.reopenClosedTab();
      else if (ctrl && shift && !alt && e.key === "Tab") h.prevTab();
      else if (ctrl && shift && !alt && key === "b") h.toggleBookmarksBar();
      else if (ctrl && !shift && !alt && e.key === "Tab") h.nextTab();
      else if (ctrl && !shift && !alt && /^[1-9]$/.test(e.key))
        h.jumpToTab(parseInt(e.key, 10));
      else if (ctrl && !shift && !alt && key === "t") h.newTab();
      else if (ctrl && !shift && !alt && key === "w") h.closeTab();
      else if (ctrl && !shift && !alt && key === "l") h.focusAddress();
      else if (ctrl && !shift && !alt && key === "r") h.reload();
      else if (ctrl && !shift && !alt && key === "d") h.toggleBookmark();
      else if (ctrl && !shift && !alt && key === "k") h.commandPalette();
      else if (!ctrl && !shift && !alt && e.key === "F5") h.reload();
      else if (!ctrl && !shift && !alt && e.key === "F6") h.focusAddress();
      else if (alt && !ctrl && !shift && e.key === "ArrowLeft") h.back();
      else if (alt && !ctrl && !shift && e.key === "ArrowRight") h.forward();
      else matched = false;

      if (matched) e.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, extMenuOpen, tabsMenuOpen, sidebarOpen]);

  useEffect(() => {
    if (!tabsMenuOpen) return;
    const onClick = () => setTabsMenuOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [tabsMenuOpen]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    listen("downloads-popover-opened", () => setDownloadsOpen(true)).then(
      (fn) => unlisteners.push(fn)
    );
    listen("downloads-popover-closed", () => setDownloadsOpen(false)).then(
      (fn) => unlisteners.push(fn)
    );
    return () => unlisteners.forEach((fn) => fn());
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

  // ── Tab strip overflow & scroll ─────────────────────────
  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const check = () => setTabsOverflowing(el.scrollWidth > el.clientWidth + 1);
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

  // ── Inter-tab / download / context-menu / shortcut listeners ─
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

  // ── Bookmark toggle ─────────────────────────────────────
  const toggleBookmarkCurrent = useCallback(async () => {
    if (activeIsInternal) return;
    try {
      if (isCurrentBookmarked) {
        const found = bookmarks.find((b) => b.url === activeTab.url);
        if (found) {
          await invoke("bookmarks_remove", { id: found.id });
          await refreshBookmarks();
        }
      } else {
        await invoke("bookmarks_add", {
          url: activeTab.url,
          title: activeTab.title || activeTab.url,
        });
        await refreshBookmarks();
      }
    } catch (err) {
      console.error("Bookmark toggle failed:", err);
    }
  }, [
    activeIsInternal,
    isCurrentBookmarked,
    activeTab.url,
    activeTab.title,
    bookmarks,
    refreshBookmarks,
  ]);

  const navigate = useCallback(
    (raw: string) => {
      let url = raw.trim();
      if (!url) return;

      let isSearch = false;
      if (isInternalUrl(url)) {
        url = url.replace(/^nova:\/\//, "nova://");
      } else if (!/^https?:\/\//i.test(url)) {
        if (/^[\w-]+(\.[\w-]+)+/.test(url) && !url.includes(" ")) {
          url = `https://${url}`;
        } else {
          url = getSearchUrl(url);
          isSearch = true;
        }
      }

      if (isSearch) {
        invoke("search_history_record", { query: raw.trim() }).catch(() => {});
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

  const openInternal = useCallback(
    (targetUrl: string) => {
      const existing = tabs.find((t) => t.url === targetUrl);
      if (existing) {
        setActiveTabId(existing.id);
        setAddressBar(existing.url);
        return;
      }
      const newTab = createNewTab(targetUrl);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      setAddressBar(newTab.url);
    },
    [tabs, createNewTab]
  );

  const openSettings = useCallback(
    () => openInternal(SETTINGS_URL),
    [openInternal]
  );
  const openHistory = useCallback(
    () => openInternal(HISTORY_URL),
    [openInternal]
  );
  const openBookmarks = useCallback(
    () => openInternal(BOOKMARKS_URL),
    [openInternal]
  );

  const closeTab = useCallback(
    (id: string) => {
      const closing = tabsRef.current.find((t) => t.id === id);
      if (closing) {
        closedTabsRef.current.push({ ...closing });
        if (closedTabsRef.current.length > MAX_CLOSED_TABS) {
          closedTabsRef.current.shift();
        }
      }
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

  const reopenClosedTab = useCallback(() => {
    const last = closedTabsRef.current.pop();
    if (!last) return;
    tabCounter += 1;
    const restored: Tab = {
      id: `tab-${tabCounter}`,
      title: last.title,
      url: last.url,
      history: last.history,
      historyIndex: last.historyIndex,
    };
    setTabs((prev) => [...prev, restored]);
    setActiveTabId(restored.id);
    setAddressBar(restored.url);
  }, []);

  const cycleTab = useCallback((direction: 1 | -1) => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length < 2) return;
    const idx = currentTabs.findIndex(
      (t) => t.id === activeTabIdRef.current
    );
    if (idx === -1) return;
    const nextIdx =
      (idx + direction + currentTabs.length) % currentTabs.length;
    const next = currentTabs[nextIdx];
    setActiveTabId(next.id);
    setAddressBar(next.url);
  }, []);

  const jumpToTab = useCallback((n: number) => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length === 0) return;
    let idx: number;
    if (n === 9) {
      idx = currentTabs.length - 1;
    } else {
      idx = n - 1;
    }
    if (idx < 0 || idx >= currentTabs.length) return;
    const tab = currentTabs[idx];
    setActiveTabId(tab.id);
    setAddressBar(tab.url);
  }, []);

  const focusAddressBar = useCallback(() => {
    if (addressInputRef.current) {
      addressInputRef.current.focus();
      addressInputRef.current.select();
    }
  }, []);

  const toggleBookmarksBar = useCallback(() => {
    update({ bookmarksToolbar: !settings.bookmarksToolbar });
  }, [update, settings.bookmarksToolbar]);

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
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
          } catch {}
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
        getCurrentTab: () => ({ title: activeTab.title, url: activeTab.url }),
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

  // ── Sync shortcut handlers ref ──────────────────────────
  useEffect(() => {
    shortcutHandlersRef.current = {
      toggleBookmark: toggleBookmarkCurrent,
      commandPalette: () => setCommandPaletteOpen(true),
      newTab: () => {
        addTab();
      },
      closeTab: () => closeTab(activeTabId),
      reopenClosedTab,
      nextTab: () => cycleTab(1),
      prevTab: () => cycleTab(-1),
      jumpToTab,
      focusAddress: focusAddressBar,
      reload: () => {
        reload();
      },
      back: goBack,
      forward: goForward,
      toggleBookmarksBar,
    };
  });

  // ── Shortcuts routed from page ──────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ key: string }>("browser://shortcut", (e) => {
      const key = e.payload.key;
      const h = shortcutHandlersRef.current;

      if (key === "bookmark") h.toggleBookmark();
      else if (key === "command-palette") h.commandPalette();
      else if (key === "new-tab") h.newTab();
      else if (key === "close-tab") h.closeTab();
      else if (key === "reopen-closed-tab") h.reopenClosedTab();
      else if (key === "next-tab") h.nextTab();
      else if (key === "prev-tab") h.prevTab();
      else if (key.startsWith("tab-")) {
        const n = parseInt(key.slice(4), 10);
        if (!isNaN(n)) h.jumpToTab(n);
      } else if (key === "focus-address") h.focusAddress();
      else if (key === "reload") h.reload();
      else if (key === "back") h.back();
      else if (key === "forward") h.forward();
      else if (key === "toggle-bookmarks-bar") h.toggleBookmarksBar();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // ── Toolbar item renderer ───────────────────────────────
  const renderToolbarItem = (id: ToolbarItemId) => {
    switch (id) {
      case "nav":
        return (
          <div className="nova-nav-buttons" key={id}>
            <button
              className="nova-btn"
              onClick={goBack}
              disabled={!canGoBack}
              title="Back (Alt+←)"
              aria-label="Back"
            >
              ◀
            </button>
            <button
              className="nova-btn"
              onClick={goForward}
              disabled={!canGoForward}
              title="Forward (Alt+→)"
              aria-label="Forward"
            >
              ▶
            </button>
            <button
              className="nova-btn"
              onClick={reload}
              disabled={activeIsInternal}
              title="Reload (F5 / Ctrl+R)"
              aria-label="Reload"
            >
              ⟳
            </button>
          </div>
        );

      case "address-bar":
        return (
          <div
            className={`nova-address-wrap ${
              isLoading ? "nova-address-wrap--loading" : ""
            }`}
            key={id}
          >
            <input
              ref={addressInputRef}
              className="nova-address"
              value={addressBar}
              onChange={(e) => setAddressBar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(addressBar);
                else if (e.key === "Escape") {
                  e.currentTarget.blur();
                  setAddressBar(activeTab.url);
                }
              }}
              placeholder={`Search with ${BROWSER_NAME} or enter address`}
              spellCheck={false}
            />
            {!activeIsInternal && (
              <button
                className={`nova-address-bookmark ${
                  isCurrentBookmarked ? "nova-address-bookmark--active" : ""
                }`}
                onClick={toggleBookmarkCurrent}
                title={
                  isCurrentBookmarked
                    ? "Remove bookmark (Ctrl+D)"
                    : "Bookmark this page (Ctrl+D)"
                }
                aria-label={
                  isCurrentBookmarked
                    ? "Remove bookmark"
                    : "Bookmark this page"
                }
                tabIndex={-1}
              >
                {isCurrentBookmarked ? "★" : "☆"}
              </button>
            )}
          </div>
        );

      case "cmd":
        return (
          <button
            key={id}
            className="nova-btn nova-btn--cmd"
            onClick={() => setCommandPaletteOpen(true)}
            title="Command palette (Ctrl+K)"
            aria-label="Command palette"
          >
            ⌘
          </button>
        );

      case "history":
        return (
          <button
            key={id}
            className="nova-btn nova-btn--history"
            onClick={openHistory}
            title="History"
            aria-label="History"
          >
            ⏱
          </button>
        );

      case "bookmarks":
        return (
          <button
            key={id}
            className="nova-btn nova-btn--bookmarks"
            onClick={openBookmarks}
            title="All bookmarks"
            aria-label="All bookmarks"
          >
            ☰
          </button>
        );

      case "ext":
        if (extensionsWithUI.length === 0) return null;
        return (
          <div className="nova-ext-anchor" ref={extMenuAnchorRef} key={id}>
            <button
              className={`nova-btn nova-btn--ext ${
                activeExtensionPanelId ? "nova-btn--ext-active" : ""
              }`}
              onClick={() => setExtMenuOpen((v) => !v)}
              title="Extension panels"
              aria-label="Extension panels"
            >
              ⬡
            </button>
            {extMenuOpen && (
              <ExtensionPanelsMenu
                extensions={extensionsWithUI}
                onSelect={(eid) => {
                  setActiveExtensionPanelId(eid);
                  setAiOpen(false);
                  setExtMenuOpen(false);
                }}
                onClose={() => setExtMenuOpen(false)}
              />
            )}
          </div>
        );

      case "ai":
        if (!settings.aiEnabled) return null;
        return (
          <button
            key={id}
            className={`nova-btn nova-btn--ai ${
              aiOpen ? "nova-btn--ai-active" : ""
            }`}
            onClick={() => {
              setAiOpen((v) => !v);
              setActiveExtensionPanelId(null);
            }}
            title="AI Assistant"
            aria-label="AI Assistant"
          >
            ◈
          </button>
        );

      case "downloads":
        return (
          <div className="nova-dl-anchor" ref={downloadsAnchorRef} key={id}>
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
        );

      case "new-tab":
        return (
          <button
            key={id}
            className="nova-btn nova-btn--new-tab"
            onClick={addTab}
            title="New tab (Ctrl+T)"
            aria-label="New tab"
          >
            +
          </button>
        );

      case "settings":
        return (
          <button
            key={id}
            className="nova-btn nova-btn--settings"
            onClick={openSettings}
            title="Settings"
            aria-label="Settings"
          >
            ⚙
          </button>
        );

      default:
        return null;
    }
  };

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

      <header
        className={`nova-toolbar nova-toolbar--${settings.windowControlsStyle}`}
      >
        {settings.windowControlsStyle === "macos" && (
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
        )}

        {settings.toolbarLayout
          .filter((item) => !item.hidden)
          .map((item) => renderToolbarItem(item.id))}

        {settings.windowControlsStyle === "windows" && (
          <div className="nova-win-controls">
            <button
              className="nova-win-btn"
              onClick={handleMinimize}
              title="Minimize"
              aria-label="Minimize"
            >
              <svg viewBox="0 0 10 10" width="10" height="10">
                <path d="M 2 5 L 8 5" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
            <button
              className="nova-win-btn"
              onClick={handleToggleMaximize}
              title="Maximize"
              aria-label="Maximize"
            >
              <svg viewBox="0 0 10 10" width="10" height="10">
                <rect
                  x="2.5"
                  y="2.5"
                  width="5"
                  height="5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            </button>
            <button
              className="nova-win-btn nova-win-btn--close"
              onClick={handleClose}
              title="Close"
              aria-label="Close"
            >
              <svg viewBox="0 0 10 10" width="10" height="10">
                <path
                  d="M 2.5 2.5 L 7.5 7.5 M 7.5 2.5 L 2.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            </button>
          </div>
        )}
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
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  closeTab(tab.id);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                }
              }}
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
                    onMouseDown={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        e.stopPropagation();
                        closeTab(tab.id);
                      }
                    }}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                      }
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

      {settings.bookmarksToolbar && (
        <BookmarksBar
          bookmarks={bookmarks}
          onNavigate={navigate}
          onAddCurrentPage={toggleBookmarkCurrent}
          currentUrl={activeTab.url}
          currentIsBookmarked={isCurrentBookmarked}
        />
      )}

      <div className={`nova-main ${sidebarOpen ? "nova-main--ai-open" : ""}`}>
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
            ) : activeTab.url === HISTORY_URL ? (
              <HistoryPage
                onNavigate={navigate}
                onClose={() => closeTab(activeTabId)}
              />
            ) : activeTab.url === BOOKMARKS_URL ? (
              <BookmarksPage
                onNavigate={navigate}
                onClose={() => closeTab(activeTabId)}
              />
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
          {activeExtensionPanel ? (
            <ExtensionPanelView
              extension={activeExtensionPanel}
              onClose={() => setActiveExtensionPanelId(null)}
            />
          ) : (
            <AIPanel
              settings={settings}
              tools={aiToolset}
              onClose={() => setAiOpen(false)}
            />
          )}
        </aside>
      </div>

      {commandPaletteOpen && (
        <CommandPalette
          getSearchUrl={getSearchUrl}
          bookmarks={bookmarks}
          onNavigate={navigate}
          onOpenNewTab={openInNewTab}
          onOpenSettings={openSettings}
          onOpenHistory={openHistory}
          onOpenBookmarks={openBookmarks}
          onOpenDownloads={toggleDownloads}
          onClose={() => setCommandPaletteOpen(false)}
          onToggleBookmark={toggleBookmarkCurrent}
          currentUrl={activeTab.url}
          currentTitle={activeTab.title}
          currentIsBookmarked={isCurrentBookmarked}
        />
      )}
    </div>
  );
}