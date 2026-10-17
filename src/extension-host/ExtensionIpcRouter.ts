import { invoke } from "@tauri-apps/api/core";
import type { ExtensionManager } from "./ExtensionManager";
import { checkPermission } from "./permissions";

const CHANNEL = "nova-ext-bridge";

interface BridgeReady {
  channel: typeof CHANNEL;
  extId: string;
  kind: "ready";
}

interface BridgeRequest {
  channel: typeof CHANNEL;
  extId: string;
  reqId: string;
  kind: "request";
  command: string;
  args: Record<string, unknown>;
}

type BridgeInbound = BridgeReady | BridgeRequest;

export class ExtensionIpcRouter {
  private listeners = new Set<MessageEventSource>();

  constructor(private manager: ExtensionManager) {
    window.addEventListener("message", this.onMessage);
  }

  private onMessage = async (e: MessageEvent) => {
    const data = e.data as BridgeInbound | undefined;
    if (!data || data.channel !== CHANNEL) return;

    if (data.kind === "ready") {
      if (e.source) this.listeners.add(e.source);
      return;
    }

    if (data.kind !== "request") return;
    const { extId, reqId, command, args } = data;
    if (!extId || !reqId || !command) return;

    const ext = this.manager.get(extId);
    if (!ext) {
      this.reply(e.source, reqId, false, undefined, "unknown extension");
      return;
    }

    // Layer 1: frontend permission check
    const check = checkPermission(
      ext.manifest.permissions,
      command,
      args as { surface?: string }
    );
    if (!check.ok) {
      this.reply(e.source, reqId, false, undefined, check.error);
      return;
    }

    // Forward to Rust — Layer 2 enforcement happens there
    try {
      const value = await invoke(`ext_${command}`, {
        extId,
        declaredPermissions: ext.manifest.permissions,
        ...args,
      });
      this.reply(e.source, reqId, true, value);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.reply(e.source, reqId, false, undefined, msg);
    }
  };

  private reply(
    source: MessageEventSource | null,
    reqId: string,
    ok: boolean,
    value?: unknown,
    error?: string
  ) {
    if (!source || !("postMessage" in source)) return;
    (source as Window).postMessage(
      { channel: CHANNEL, reqId, kind: "response", ok, value, error },
      "*"
    );
  }

  broadcast(event: string, payload: unknown, extId?: string) {
    for (const listener of this.listeners) {
      try {
        (listener as Window).postMessage(
          { channel: CHANNEL, kind: "event", event, payload, extId },
          "*"
        );
      } catch {
        // listener may have been garbage collected
      }
    }
  }

  destroy() {
    window.removeEventListener("message", this.onMessage);
    this.listeners.clear();
  }
}