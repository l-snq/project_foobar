"use client";

import type { Weapon } from "../../server/types";

// Everything that renders on top of the 3D viewport itself: crosshair,
// hit flash, death/respawn dialog, banners and the emote menu.
// All positions are relative to the viewport cell, not the window.
interface Props {
  cursorPos: { x: number; y: number } | null; // viewport-relative, null when outside
  weapon: Weapon;
  isDead: boolean;
  showHitFlash: boolean;
  rampageAnnouncement: string | null;
  levelUpMsg: string | null;
  logicMessage: string | null;
  emoteWheelOpen: boolean;
  inEditMode: boolean;
  inPlacementMode: boolean;
  onExitPlacement: () => void;
}

export default function ViewportOverlays({
  cursorPos, weapon, isDead, showHitFlash,
  rampageAnnouncement, levelUpMsg, logicMessage, emoteWheelOpen,
  inEditMode, inPlacementMode, onExitPlacement,
}: Props) {
  return (
    <>
      {/* Crosshair */}
      {weapon === "pistol" && !isDead && cursorPos && (
        <div
          className="absolute pointer-events-none z-20"
          style={{ left: cursorPos.x, top: cursorPos.y, transform: "translate(-50%, -50%)" }}
        >
          <div className="relative w-5 h-5">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[2px] h-1.5 bg-white" style={{ outline: "1px solid black" }} />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[2px] h-1.5 bg-white" style={{ outline: "1px solid black" }} />
            <div className="absolute top-1/2 left-0 -translate-y-1/2 h-[2px] w-1.5 bg-white" style={{ outline: "1px solid black" }} />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 h-[2px] w-1.5 bg-white" style={{ outline: "1px solid black" }} />
          </div>
        </div>
      )}

      {/* Hit flash — chunky red border, not a soft vignette */}
      {showHitFlash && (
        <div className="absolute inset-0 pointer-events-none z-10" style={{ border: "6px solid rgba(255,0,0,0.8)" }} />
      )}

      {/* Rampage banner */}
      {rampageAnnouncement && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div className="bevel-out px-4 py-1.5 font-bold retro-blink" style={{ color: "#b00000", fontSize: 13 }}>
            {rampageAnnouncement.replace(/🔥/g, "!!")}
          </div>
        </div>
      )}

      {/* Level-up toast */}
      {levelUpMsg && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div className="bevel-out px-4 py-1.5 font-bold" style={{ color: "#000080", fontSize: 12 }}>
            ★ {levelUpMsg} ★
          </div>
        </div>
      )}

      {/* Logic message toast (from a showMessage node) */}
      {logicMessage && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div className="bevel-out px-5 py-2 font-bold text-center" style={{ color: "#004000", fontSize: 15, maxWidth: 360 }}>
            {logicMessage}
          </div>
        </div>
      )}

      {/* Mode strips */}
      {inEditMode && (
        <div
          className="absolute top-0 inset-x-0 text-center font-bold pointer-events-none z-20 py-0.5"
          style={{ background: "#806000", color: "#ffe080", fontSize: 10, letterSpacing: 1 }}
        >
          EDIT MODE — click to select · drag gizmo to move · Del to delete · [2] to exit
        </div>
      )}
      {inPlacementMode && (
        <div
          className="absolute top-0 inset-x-0 flex items-center justify-center gap-3 z-20 py-0.5"
          style={{ background: "#004000", color: "#a0ffb8", fontSize: 10, letterSpacing: 1 }}
        >
          <span className="font-bold">PLACEMENT — click to place · Q/E rotate · Esc cancel</span>
          <button className="retro-btn pointer-events-auto" style={{ fontSize: 9, padding: "1px 5px" }} onClick={onExitPlacement}>
            CANCEL
          </button>
        </div>
      )}

      {/* Emote menu */}
      {emoteWheelOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div className="bevel-out p-0.5" style={{ minWidth: 160 }}>
            <div className="retro-titlebar px-2 py-0.5">EMOTE</div>
            <div className="p-2 flex flex-col gap-1" style={{ fontSize: 11 }}>
              <p><b className="bevel-in px-1.5" style={{ background: "#fff" }}>1</b> Dance</p>
              <p><b className="bevel-in px-1.5" style={{ background: "#fff" }}>2</b> Breakdance</p>
            </div>
          </div>
        </div>
      )}

      {/* Death dialog */}
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bevel-out p-0.5" style={{ minWidth: 260 }}>
            <div className="retro-titlebar px-2 py-0.5 flex items-center justify-between">
              <span>FATAL ERROR</span>
              <span>✕</span>
            </div>
            <div className="p-4 flex items-center gap-3">
              <span style={{ fontSize: 28 }}>💀</span>
              <div>
                <p className="font-bold" style={{ fontSize: 13, color: "#b00000" }}>YOU DIED</p>
                <p style={{ fontSize: 11 }}>Respawning<span className="retro-blink">…</span></p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
