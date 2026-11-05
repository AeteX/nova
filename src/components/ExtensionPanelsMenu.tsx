import { useEffect, useRef } from "react";
import type { LoadedExtension } from "../extension-host/ExtensionManager";

interface ExtensionPanelsMenuProps {
  extensions: LoadedExtension[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function ExtensionPanelsMenu({
  extensions,
  onSelect,
  onClose,
}: ExtensionPanelsMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div className="nova-ext-menu" ref={ref}>
      <div className="nova-ext-menu-header">Extensions</div>
      {extensions.length === 0 && (
        <div className="nova-ext-menu-empty">No extensions with UI</div>
      )}
      {extensions.map((ext) => {
        const isPanel = !!ext.manifest.ui?.panel;
        return (
          <button
            key={ext.manifest.id}
            className="nova-ext-menu-item"
            onClick={() => onSelect(ext.manifest.id)}
          >
            <span className="nova-ext-menu-item-icon">◆</span>
            <span className="nova-ext-menu-item-text">
              <span className="nova-ext-menu-item-name">
                {ext.manifest.name}
              </span>
              <span className="nova-ext-menu-item-type">
                {isPanel ? "Side panel" : "Popup"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}