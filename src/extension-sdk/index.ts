import * as tabs from "./tabs";
import * as storage from "./storage";
import * as runtime from "./messaging";
import * as contentScripts from "./content-scripts";
import * as ui from "./ui";
import { setExtensionId } from "./runtime";

export { tabs, storage, runtime, contentScripts, ui };

export type {
  ExtensionManifest,
  NovaPermission,
  ContentScriptSpec,
  CommandSpec,
  Tab,
  TabChangeInfo,
  RuntimeMessage,
  MessageSender,
  UiSurface,
} from "./types";

const api = { tabs, storage, runtime, contentScripts, ui };

export type NovaApi = typeof api;

/**
 * Register an extension with the Nova host.
 *
 * @example
 * ```ts
 * import { defineExtension } from "@aetex/nova-ext-sdk";
 *
 * defineExtension("com.example.my-ext", (nova) => {
 *   nova.runtime.onMessage.addListener((msg, sender) => {
 *     if (msg.type === "ping") return { type: "pong" };
 *   });
 * });
 * ```
 */
export function defineExtension(
  id: string,
  setup?: (nova: NovaApi) => void
): void {
  setExtensionId(id);
  const target = window.parent !== window ? window.parent : window;
  target.postMessage(
    { channel: "nova-ext-bridge", extId: id, kind: "ready" },
    "*"
  );
  if (setup) setup(api);
}