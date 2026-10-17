export interface ExtensionManifest {
  manifest_version: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  icon?: string;
  permissions: NovaPermission[];
  background?: { page: string };
  content_scripts?: ContentScriptSpec[];
  ui?: { popup?: string; panel?: string };
  commands?: CommandSpec[];
}

export type NovaPermission =
  | "tabs.read"
  | "tabs.write"
  | "tabs.navigate"
  | "storage.local"
  | "storage.sync"
  | "messaging"
  | "contentScripts"
  | "ui.popup"
  | "ui.panel"
  | "notifications"
  | "webRequest";

export interface ContentScriptSpec {
  matches: string[];
  js: string[];
  run_at?: "document_start" | "document_end" | "document_idle";
}

export interface CommandSpec {
  id: string;
  title: string;
  shortcut?: string;
}

export interface Tab {
  id: string;
  title: string;
  url: string;
  active: boolean;
}

export interface TabChangeInfo {
  status?: "loading" | "complete";
  url?: string;
  title?: string;
}

export interface RuntimeMessage {
  type: string;
  payload?: unknown;
}

export interface MessageSender {
  tabId?: string;
  url?: string;
  frameId?: number;
}

export type UiSurface = "popup" | "panel";

export type Listener<T> = (value: T) => void;

export interface EventEmitter<T> {
  addListener(fn: Listener<T>): void;
  removeListener(fn: Listener<T>): void;
}