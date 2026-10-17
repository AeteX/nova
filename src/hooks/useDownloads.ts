import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadEntry {
  id: string;
  url: string;
  source_page_url?: string;
  filename: string;
  path?: string;
  total_bytes?: number;
  downloaded_bytes: number;
  status: DownloadStatus;
  error?: string;
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const initial = await invoke<DownloadEntry[]>("list_downloads");
        if (!cancelled) setDownloads(initial);
      } catch {
        // ignore
      }
    })();

    listen<DownloadEntry>("download://updated", (e) => {
      setDownloads((prev) => {
        const idx = prev.findIndex((d) => d.id === e.payload.id);
        if (idx === -1) return [e.payload, ...prev];
        const copy = [...prev];
        copy[idx] = e.payload;
        return copy;
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const pause = useCallback(
    (id: string) => invoke("pause_download", { id }),
    []
  );
  const resume = useCallback(
    (id: string) => invoke("resume_download", { id }),
    []
  );
  const cancel = useCallback(
    (id: string) => invoke("cancel_download", { id }),
    []
  );
  const clearFinished = useCallback(
    () =>
      invoke("clear_finished_downloads").then(() => {
        setDownloads((prev) =>
          prev.filter(
            (d) =>
              d.status === "downloading" ||
              d.status === "paused" ||
              d.status === "pending"
          )
        );
      }),
    []
  );
  const openFolder = useCallback(
    (path: string) => invoke("open_download_folder", { path }),
    []
  );
  const openFile = useCallback(
    (path: string) => invoke("open_downloaded_file", { path }),
    []
  );

  const activeCount = downloads.filter(
    (d) => d.status === "downloading" || d.status === "pending"
  ).length;

  return {
    downloads,
    activeCount,
    pause,
    resume,
    cancel,
    clearFinished,
    openFolder,
    openFile,
  };
}