import { invoke } from "@tauri-apps/api/core";
import type { ExtensionManifest } from "../extension-sdk/types";

export interface LoadedExtension {
  manifest: ExtensionManifest;
  root_path: string;
  enabled: boolean;
}

export interface ExtensionsInfo {
  dir: string;
  extensions: LoadedExtension[];
}

class Manager {
  private cache: LoadedExtension[] = [];
  private dirPath = "";

  async refresh(): Promise<LoadedExtension[]> {
    const info = await invoke<ExtensionsInfo>("extensions_list");
    this.cache = info.extensions;
    this.dirPath = info.dir;
    return this.cache;
  }

  get all(): LoadedExtension[] {
    return this.cache;
  }

  get dir(): string {
    return this.dirPath;
  }

  get(id: string): LoadedExtension | undefined {
    return this.cache.find((e) => e.manifest.id === id);
  }

  async install(sourcePath: string): Promise<LoadedExtension> {
    const ext = await invoke<LoadedExtension>("extensions_install", {
      sourcePath,
    });
    await this.refresh();
    return ext;
  }

  async uninstall(id: string): Promise<void> {
    await invoke("extensions_uninstall", { id });
    await this.refresh();
  }

  async readFile(id: string, relPath: string): Promise<string> {
    return invoke<string>("extensions_read_file", { id, relPath });
  }
}

export const extensionManager = new Manager();
export type { Manager as ExtensionManager };