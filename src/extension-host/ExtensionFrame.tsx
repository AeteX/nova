import { useMemo } from "react";
import type { LoadedExtension } from "./ExtensionManager";

interface ExtensionFrameProps {
  extension: LoadedExtension;
}

function extensionUrl(id: string, relPath: string): string {
  const isWindows =
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("windows");
  const base = isWindows
    ? `http://nova-ext.localhost/${id}`
    : `nova-ext://${id}`;
  return `${base}/${relPath}`;
}

export default function ExtensionFrame({ extension }: ExtensionFrameProps) {
  const src = useMemo(() => {
    const page = extension.manifest.background?.page;
    if (!page) return null;
    return extensionUrl(extension.manifest.id, page);
  }, [extension.manifest.background, extension.manifest.id]);

  if (!src) return null;

  return (
    <iframe
      title={`nova-ext:${extension.manifest.id}`}
      src={src}
      className="nova-ext-frame"
      // Cross-origin via nova-ext:// gives us isolation. The iframe
      // can only talk to the host via postMessage.
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}