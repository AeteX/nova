export const KNOWN_PERMISSIONS = [
  "tabs.read",
  "tabs.write",
  "tabs.navigate",
  "storage.local",
  "storage.sync",
  "messaging",
  "contentScripts",
  "ui.popup",
  "ui.panel",
  "notifications",
  "webRequest",
] as const;

export type NovaPermission = (typeof KNOWN_PERMISSIONS)[number];

const COMMAND_PERMISSION: Record<string, NovaPermission> = {
  tabs_query: "tabs.read",
  tabs_get: "tabs.read",
  tabs_create: "tabs.write",
  tabs_update: "tabs.write",
  tabs_remove: "tabs.write",
  tabs_navigate: "tabs.navigate",
  storage_get: "storage.local",
  storage_set: "storage.local",
  storage_remove: "storage.local",
  storage_clear: "storage.local",
  runtime_send_message: "messaging",
  content_scripts_register: "contentScripts",
  content_scripts_execute: "contentScripts",
  ui_show: "ui.popup",
  ui_hide: "ui.popup",
  ui_badge_text: "ui.popup",
  ui_badge_color: "ui.popup",
  notify: "notifications",
};

export type PermissionCheck =
  | { ok: true }
  | { ok: false; error: string };

export function checkPermission(
  declared: string[],
  command: string,
  args?: { surface?: string }
): PermissionCheck {
  const required = COMMAND_PERMISSION[command];
  if (!required) return { ok: true };

  if (command.startsWith("ui_") && args?.surface === "panel") {
    return declared.includes("ui.panel")
      ? { ok: true }
      : { ok: false, error: "missing permission 'ui.panel'" };
  }

  return declared.includes(required)
    ? { ok: true }
    : { ok: false, error: `missing permission '${required}'` };
}