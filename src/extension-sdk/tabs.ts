import { invoke, on, off } from "./runtime";
import type { EventEmitter, Tab, TabChangeInfo } from "./types";

export function query(filter: Partial<Tab> = {}): Promise<Tab[]> {
  return invoke<Tab[]>("tabs_query", filter);
}

export function get(tabId: string): Promise<Tab | null> {
  return invoke<Tab | null>("tabs_get", { tabId });
}

export function create(url: string, active = true): Promise<Tab> {
  return invoke<Tab>("tabs_create", { url, active });
}

export function update(
  tabId: string,
  changes: { url?: string; active?: boolean }
): Promise<Tab> {
  return invoke<Tab>("tabs_update", { tabId, changes });
}

export function remove(tabId: string): Promise<void> {
  return invoke<void>("tabs_remove", { tabId });
}

export function navigate(tabId: string, url: string): Promise<Tab> {
  return invoke<Tab>("tabs_navigate", { tabId, url });
}

function makeEmitter<T>(name: string): EventEmitter<T> {
  return {
    addListener: (fn) => on(name, fn as (v: unknown) => void),
    removeListener: (fn) => off(name, fn as (v: unknown) => void),
  };
}

export const onCreated: EventEmitter<Tab> = makeEmitter("tabs.onCreated");
export const onRemoved: EventEmitter<string> = makeEmitter("tabs.onRemoved");
export const onActivated: EventEmitter<string> = makeEmitter("tabs.onActivated");
export const onUpdated: EventEmitter<{ tabId: string; changes: TabChangeInfo }> =
  makeEmitter("tabs.onUpdated");