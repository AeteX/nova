const CHANNEL = "nova-ext-bridge";

let extensionId = "";
let requestSeq = 0;
const pending = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

const eventListeners = new Map<string, Set<(v: unknown) => void>>();

export function setExtensionId(id: string): void {
  extensionId = id;
}

export function getExtensionId(): string {
  return extensionId;
}

export function invoke<T = unknown>(
  command: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const reqId = `req-${++requestSeq}-${Date.now()}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(reqId, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    const target = window.parent !== window ? window.parent : window;
    target.postMessage(
      {
        channel: CHANNEL,
        extId: extensionId,
        reqId,
        kind: "request",
        command,
        args,
      },
      "*"
    );
  });
}

export function on(event: string, fn: (v: unknown) => void): void {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event)!.add(fn);
}

export function off(event: string, fn: (v: unknown) => void): void {
  eventListeners.get(event)?.delete(fn);
}

let installed = false;
function installHandler() {
  if (installed) return;
  installed = true;
  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data || data.channel !== CHANNEL) return;

    if (data.kind === "response") {
      const entry = pending.get(data.reqId);
      if (!entry) return;
      pending.delete(data.reqId);
      if (data.ok) entry.resolve(data.value);
      else entry.reject(new Error(data.error ?? "unknown error"));
      return;
    }
    if (data.kind === "event") {
      if (data.extId && data.extId !== extensionId) return;
      const set = eventListeners.get(data.event);
      if (!set) return;
      set.forEach((fn) => {
        try {
          fn(data.payload);
        } catch (err) {
          console.error("[nova-ext]", err);
        }
      });
    }
  });
}

// Auto-install on module load
installHandler();