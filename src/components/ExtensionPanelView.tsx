import { useEffect, useMemo, useRef } from "react";
import type { LoadedExtension } from "../extension-host/ExtensionManager";

interface ExtensionPanelViewProps {
  extension: LoadedExtension;
  onClose: () => void;
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

export default function ExtensionPanelView({
  extension,
  onClose,
}: ExtensionPanelViewProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const manifest = extension.manifest;

  const panelFile = manifest.ui?.panel ?? manifest.ui?.popup;
  const src = useMemo(
    () => (panelFile ? extensionUrl(manifest.id, panelFile) : null),
    [manifest.id, panelFile]
  );

  useEffect(() => {
    if (!src) {
      onClose();
    }
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div className="nova-ext-panel">
      <header className="nova-ext-panel-header">
        <div className="nova-ext-panel-brand">
          <div className="nova-ext-panel-icon">◆</div>
          <div>
            <div className="nova-ext-panel-eyebrow">Extension</div>
            <div className="nova-ext-panel-title">{manifest.name}</div>
          </div>
        </div>
        <button
          className="nova-ext-panel-close"
          onClick={onClose}
          aria-label="Close extension panel"
        >
          ×
        </button>
      </header>
      <iframe
        ref={ref}
        className="nova-ext-panel-frame"
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={`Extension: ${manifest.name}`}
      />
    </div>
  );
}