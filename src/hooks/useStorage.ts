import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface HistoryEntry {
  url: string;
  title: string;
  visited_at: number;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  created_at: number;
}

export interface SearchEntry {
  query: string;
  searched_at: number;
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<Bookmark[]>("bookmarks_list");
      setBookmarks(list);
    } catch (e) {
      console.error("bookmarks_list failed:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    async (url: string, title: string) => {
      await invoke("bookmarks_add", { url, title });
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await invoke("bookmarks_remove", { id });
      await refresh();
    },
    [refresh]
  );

  return { bookmarks, add, remove, refresh };
}