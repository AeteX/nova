import { useCallback, useEffect, useState } from "react";
import {
  extensionManager,
  type LoadedExtension,
} from "../extension-host/ExtensionManager";
import { ExtensionIpcRouter } from "../extension-host/ExtensionIpcRouter";

let globalRouter: ExtensionIpcRouter | null = null;

export function useExtensions() {
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);
  const [dir, setDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await extensionManager.refresh();
        if (cancelled) return;
        setExtensions(list);
        setDir(extensionManager.dir);

        if (!globalRouter) {
          globalRouter = new ExtensionIpcRouter(extensionManager);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await extensionManager.refresh();
      setExtensions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const uninstall = useCallback(
    async (id: string) => {
      await extensionManager.uninstall(id);
      await refresh();
    },
    [refresh]
  );

  const install = useCallback(
    async (sourcePath: string) => {
      await extensionManager.install(sourcePath);
      await refresh();
    },
    [refresh]
  );

  return { extensions, dir, loading, error, refresh, uninstall, install };
}