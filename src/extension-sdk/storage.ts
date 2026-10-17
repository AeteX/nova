import { invoke } from "./runtime";

export const local = {
  get<T = unknown>(key: string | string[]): Promise<Record<string, T>> {
    return invoke("storage_get", { scope: "local", key });
  },
  set(items: Record<string, unknown>): Promise<void> {
    return invoke("storage_set", { scope: "local", items });
  },
  remove(key: string | string[]): Promise<void> {
    return invoke("storage_remove", { scope: "local", key });
  },
  clear(): Promise<void> {
    return invoke("storage_clear", { scope: "local" });
  },
};

/** Reserved for future cloud sync. Same shape as `local` for now. */
export const sync = local;