"use client";

import { useRef } from "react";

// Admin-only: GLB import and floor painting.
interface Props {
  isUploading: boolean;
  inFloorPaintMode: boolean;
  onFileSelected: (file: File) => Promise<void>;
  onToggleFloorPaint: () => void;
}

export default function AdminTools({ isUploading, inFloorPaintMode, onFileSelected, onToggleFloorPaint }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="retro-section">
      <span className="retro-section-label">Admin</span>
      <div className="flex flex-col gap-1">
        <button
          className="retro-btn"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? "UPLOADING…" : "IMPORT MODEL…"}
        </button>
        <button className="retro-btn" data-pressed={inFloorPaintMode} onClick={onToggleFloorPaint}>
          {inFloorPaintMode ? "EXIT PAINT" : "PAINT FLOOR"}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".gltf,.glb"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          await onFileSelected(file);
        }}
      />
    </div>
  );
}
