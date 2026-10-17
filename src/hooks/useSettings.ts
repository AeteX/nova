import { useCallback, useEffect, useState } from "react";

export type SearchEngineId =
  | "duckduckgo"
  | "google"
  | "bing"
  | "brave"
  | "startpage"
  | "ecosia"
  | "custom";

export interface SearchEngine {
  id: SearchEngineId;
  name: string;
  url: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { id: "google", name: "Google", url: "https://www.google.com/search?q=%s" },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q=%s" },
  { id: "brave", name: "Brave Search", url: "https://search.brave.com/search?q=%s" },
  { id: "startpage", name: "Startpage", url: "https://www.startpage.com/sp/search?query=%s" },
  { id: "ecosia", name: "Ecosia", url: "https://www.ecosia.org/search?q=%s" },
  { id: "custom", name: "Custom…", url: "" },
];

export interface QuickLink {
  title: string;
  url: string;
}

export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { title: "GitHub", url: "https://github.com" },
  { title: "YouTube", url: "https://youtube.com" },
  { title: "Reddit", url: "https://reddit.com" },
  { title: "Hacker News", url: "https://news.ycombinator.com" },
  { title: "Wikipedia", url: "https://wikipedia.org" },
  { title: "X", url: "https://x.com" },
];

export const BROWSER_NAME = "Nova";

export interface Settings {
  searchEngine: SearchEngineId;
  customSearchUrl: string;
  homepage: string;
  accentColor: string;
  customContextMenu: boolean;
  adBlockerEnabled: boolean;
  quickLinks: QuickLink[];
  aiEnabled: boolean;
  aiServerUrl: string;
  aiModel: string;
  aiSystemPrompt: string;
  aiTemperature: number;
}

export const DEFAULT_SETTINGS: Settings = {
  searchEngine: "duckduckgo",
  customSearchUrl: "",
  homepage: "nova://home",
  accentColor: "#00e5ff",
  customContextMenu: false,
  adBlockerEnabled: false,
  quickLinks: DEFAULT_QUICK_LINKS,
  aiEnabled: false,
  aiServerUrl: "http://127.0.0.1:8080",
  aiModel: "gpt-3.5-turbo",
  aiSystemPrompt:
    "You are a helpful AI assistant embedded in the Nova browser. Keep answers concise and accurate.",
  aiTemperature: 0.7,
};

const STORAGE_KEY = "nova.settings.v5";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--nova-accent", settings.accentColor);
    root.style.setProperty(
      "--nova-glow",
      `0 0 18px ${settings.accentColor}59`
    );
  }, [settings.accentColor]);

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const getSearchUrl = useCallback(
    (query: string): string => {
      const encoded = encodeURIComponent(query);
      if (settings.searchEngine === "custom") {
        const template = settings.customSearchUrl.trim();
        if (template.includes("%s")) return template.replace("%s", encoded);
        return `https://duckduckgo.com/?q=${encoded}`;
      }
      const engine = SEARCH_ENGINES.find((e) => e.id === settings.searchEngine);
      if (!engine) return `https://duckduckgo.com/?q=${encoded}`;
      return engine.url.replace("%s", encoded);
    },
    [settings.searchEngine, settings.customSearchUrl]
  );

  return { settings, update, reset, getSearchUrl };
}