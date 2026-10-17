import { invoke } from "./runtime";
import type { UiSurface } from "./types";

export function show(surface: UiSurface): Promise<void> {
  return invoke("ui_show", { surface });
}

export function hide(surface: UiSurface): Promise<void> {
  return invoke("ui_hide", { surface });
}

export function setBadgeText(text: string): Promise<void> {
  return invoke("ui_badge_text", { text });
}

export function setBadgeColor(color: string): Promise<void> {
  return invoke("ui_badge_color", { color });
}