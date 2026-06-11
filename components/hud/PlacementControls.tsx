"use client";

import { useRef } from "react";
import { glass } from "../utils/glassStyles";

// Placement-mode banner + admin tools (model import, floor paint toggle).
interface Props {
  inPlacementMode: boolean;
  isUploading: boolean;
  isAdmin: boolean;
  inFloorPaintMode: boolean;
  onExitPlacement: () => void;
  onFileSelected: (file: File) => Promise<void>;
  onToggleFloorPaint: () => void;
}

export default function PlacementControls({
  inPlacementMode, isUploading, isAdmin, inFloorPaintMode,
  onExitPlacement, onFileSelected, onToggleFloorPaint,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="absolute bottom-54 right-4 flex flex-col items-end gap-2 pointer-events-auto">
        {inPlacementMode ? (
          <div className="flex flex-col items-end gap-2">
            <div
              className="px-4 py-2 rounded-xl text-sm font-semibold animate-pulse"
              style={{
                background: "linear-gradient(160deg, rgba(80,220,120,0.22) 0%, rgba(0,140,60,0.18) 100%)",
                border: "1px solid rgba(80,220,120,0.5)",
                backdropFilter: "blur(10px)",
                color: "#a0ffb8",
                textShadow: "0 0 8px rgba(0,220,100,0.6)",
                boxShadow: "0 0 16px rgba(0,200,80,0.3)",
              }}
            >
              Click to place · Q/E to rotate · Esc to cancel
            </div>
            <button
              className="px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: "linear-gradient(160deg, rgba(255,80,80,0.2) 0%, rgba(180,0,0,0.15) 100%)",
                border: "1px solid rgba(255,100,100,0.4)",
                backdropFilter: "blur(10px)",
                color: "#ff9090",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onClick={onExitPlacement}
            >
              Cancel
            </button>
          </div>
        ) : (
          isAdmin && (
            <div className="flex flex-col items-end gap-2">
              <button
                className="px-3 py-2 rounded-xl text-sm font-semibold relative overflow-hidden disabled:opacity-50"
                style={{ ...glass.buttonGreen, color: "rgba(200,255,220,0.9)" }}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                  style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)" }} />
                <span className="relative">{isUploading ? "Uploading…" : "Import Model"}</span>
              </button>
              <button
                className="px-3 py-2 rounded-xl text-sm font-semibold relative overflow-hidden"
                style={{
                  ...glass.buttonPurple,
                  color: inFloorPaintMode ? "#e8c8ff" : "rgba(220,180,255,0.85)",
                  border: `1px solid ${inFloorPaintMode ? "rgba(200,140,255,0.7)" : "rgba(180,120,255,0.42)"}`,
                  boxShadow: inFloorPaintMode ? "0 0 14px rgba(160,80,255,0.5), inset 0 1px 0 rgba(255,255,255,0.18)" : glass.buttonPurple.boxShadow,
                }}
                onClick={onToggleFloorPaint}
              >
                <span className="relative">{inFloorPaintMode ? "Exit Paint" : "Paint Floor"}</span>
              </button>
            </div>
          )
        )}
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
    </>
  );
}
