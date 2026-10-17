import { invoke } from "./runtime";
import type { ContentScriptSpec } from "./types";

export function register(spec: ContentScriptSpec): Promise<void> {
  return invoke("content_scripts_register", spec as unknown as Record<string, unknown>);
}

export function execute(
  tabId: string,
  code: string,
  frameId = 0
): Promise<unknown> {
  return invoke("content_scripts_execute", { tabId, code, frameId });
}