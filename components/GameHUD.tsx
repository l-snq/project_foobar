"use client";

import React from "react";
import type { Weapon, ScoreEntry, PlacedObject } from "../server/types";
import type { ChatMessage } from "./GameCanvas";
import { glass } from "./utils/glassStyles";

export interface GameHUDProps {
  // Cursor
  cursorPos: { x: number; y: number };

  // Player status
  health: number;
  maxHealth: number;
  onRampage: boolean;
  weapon: Weapon;
  ammo: number;
  isReloading: boolean;
  isDead: boolean;

  // Overlays
  showHitFlash: boolean;
  showScoreboard: boolean;
  scores: ScoreEntry[];
  myIdRef: React.RefObject<string | null>;
  rampageAnnouncement: string | null;
  emoteWheelOpen: boolean;

  // Placement / objects
  inPlacementMode: boolean;
  inEditMode: boolean;
  isUploading: boolean;
  selectedObjId: string | null;
  selectedObjScale: number;
  selectedObjRotY: number;
  selectedObjHitboxShape: "cylinder" | "box";
  selectedObjHitboxRadius: number;
  selectedObjHitboxOffsetX: number;
  selectedObjHitboxOffsetZ: number;

  // Chat
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;

  // Refs
  chatBoxRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLInputElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  applyTransformRef: React.RefObject<((id: string, scale: number, rotY: number, hitboxShape: "cylinder" | "box", hitboxRadius: number, hitboxOffsetX: number, hitboxOffsetZ: number) => void) | null>;
  applyHitboxOffsetRef: React.RefObject<((id: string, offsetX: number, offsetZ: number) => void) | null>;
  deleteObjRef: React.RefObject<((id: string) => void) | null>;
  exitPlacementModeRef: React.RefObject<(() => void) | null>;

  // Callbacks
  setSelectedObjScale: (s: number) => void;
  setSelectedObjRotY: (r: number) => void;
  setSelectedObjHitboxShape: (s: "cylinder" | "box") => void;
  setSelectedObjHitboxRadius: (r: number) => void;
  setSelectedObjHitboxOffsetX: (v: number) => void;
  setSelectedObjHitboxOffsetZ: (v: number) => void;
  setChatInput: (s: string) => void;
  setChatOpen: (v: boolean) => void;
  onChatSubmit: () => void;
  onBakeMap: () => void;
  onFileSelected: (file: File) => Promise<void>;
  onOpenStore: () => void;
  onOpenInventory: (() => void) | null;
  isAdmin: boolean;
  isHomeRoom: boolean;
  inFloorPaintMode: boolean;
  onToggleFloorPaint: () => void;
  brushColor: string;
  onBrushColorChange: (c: string) => void;
  brushSize: number;
  onBrushSizeChange: (s: number) => void;
}

export default function GameHUD({
  cursorPos, health, maxHealth, onRampage, weapon, ammo, isReloading, isDead,
  showHitFlash, showScoreboard, scores, myIdRef, rampageAnnouncement, emoteWheelOpen,
  inPlacementMode, inEditMode, isUploading, selectedObjId,
  selectedObjScale, selectedObjRotY, selectedObjHitboxShape, selectedObjHitboxRadius,
  selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ,
  chatOpen, chatMessages, chatInput,
  chatBoxRef, chatInputRef, fileInputRef,
  applyTransformRef, applyHitboxOffsetRef, deleteObjRef, exitPlacementModeRef,
  setSelectedObjScale, setSelectedObjRotY, setSelectedObjHitboxShape,
  setSelectedObjHitboxRadius, setSelectedObjHitboxOffsetX, setSelectedObjHitboxOffsetZ,
  setChatInput, setChatOpen, onChatSubmit, onBakeMap, onFileSelected,
  onOpenStore, onOpenInventory, isAdmin, isHomeRoom,
  inFloorPaintMode, onToggleFloorPaint, brushColor, onBrushColorChange, brushSize, onBrushSizeChange,
}: GameHUDProps) {
  const healthPct = Math.max(0, health / maxHealth);

  return (
    <>
      {/* Crosshair — follows cursor when pistol equipped */}
      {weapon === "pistol" && !isDead && (
        <div
          className="absolute pointer-events-none"
          style={{ left: cursorPos.x, top: cursorPos.y, transform: "translate(-50%, -50%)" }}
        >
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full"
              style={{ background: "#a0ffb8", boxShadow: "0 0 5px rgba(80,255,140,0.9), 0 0 10px rgba(0,200,80,0.5)" }} />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-px h-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-px h-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
            <div className="absolute top-1/2 left-0 -translate-y-1/2 h-px w-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 h-px w-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
          </div>
        </div>
      )}

      {/* Health bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
        {onRampage && (
          <span
            className="text-xs font-bold tracking-widest uppercase animate-pulse"
            style={{ color: "#ffb347", textShadow: "0 0 10px rgba(255,140,0,0.8)" }}
          >
            ⚡ RAMPAGE ⚡
          </span>
        )}
        <div
          className="w-52 h-3.5 rounded-full overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(0,30,10,0.7) 0%, rgba(0,50,20,0.6) 100%)",
            border: `1px solid ${onRampage ? "rgba(255,160,50,0.55)" : "rgba(80,220,120,0.4)"}`,
            boxShadow: onRampage
              ? "0 0 10px rgba(255,120,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 0 10px rgba(0,200,80,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-150 relative overflow-hidden"
            style={{
              width: `${healthPct * 100}%`,
              background: onRampage
                ? "linear-gradient(180deg, #ffb347 0%, #e06800 100%)"
                : healthPct > 0.5
                ? "linear-gradient(180deg, #5ef5b0 0%, #00b87a 100%)"
                : healthPct > 0.25
                ? "linear-gradient(180deg, #ffe066 0%, #d4a000 100%)"
                : "linear-gradient(180deg, #ff8080 0%, #c00000 100%)",
              boxShadow: onRampage
                ? "0 0 8px rgba(255,140,0,0.7)"
                : healthPct > 0.5
                ? "0 0 8px rgba(0,220,130,0.6)"
                : "0 0 8px rgba(255,80,80,0.6)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)" }} />
          </div>
        </div>
        <span
          className="text-xs font-semibold"
          style={{
            color: onRampage ? "#ffb347" : "rgba(200,255,220,0.9)",
            textShadow: "0 1px 3px rgba(0,0,0,0.7)",
          }}
        >
          {health} / {maxHealth}
        </span>
      </div>

      {/* Weapon slot HUD */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
        {weapon === "pistol" && (
          <div
            className="px-3 py-1 rounded-xl text-sm font-bold tracking-wider"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(80,200,120,0.08) 100%)",
              border: "1px solid rgba(80,220,120,0.35)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 2px 10px rgba(0,160,60,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          >
            {isReloading
              ? <span className="animate-pulse" style={{ color: "#ffe066", textShadow: "0 0 8px rgba(255,220,0,0.7)" }}>RELOADING…</span>
              : <span style={{ color: ammo === 0 ? "#ff8080" : "rgba(200,255,220,0.95)" }}>{ammo} / 8</span>
            }
          </div>
        )}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-xs font-bold relative overflow-hidden"
          style={{
            background: weapon === "pistol"
              ? "linear-gradient(160deg, rgba(80,220,120,0.22) 0%, rgba(0,140,60,0.18) 100%)"
              : "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(40,80,50,0.08) 100%)",
            border: `1px solid ${weapon === "pistol" ? "rgba(80,220,120,0.5)" : "rgba(80,150,100,0.22)"}`,
            backdropFilter: "blur(10px)",
            boxShadow: weapon === "pistol"
              ? "0 0 16px rgba(0,200,80,0.35), inset 0 1px 0 rgba(255,255,255,0.35)"
              : "inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }}
          />
          <span
            className="relative flex flex-col items-center gap-0.5"
            style={{ color: weapon === "pistol" ? "#a0ffb8" : "rgba(150,200,160,0.45)" }}
          >
            <span>GUN</span>
            <span className="text-[9px] opacity-70">[1]</span>
          </span>
        </div>
      </div>

      {/* Emote wheel */}
      {emoteWheelOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div
            className="flex gap-4 px-6 py-4 rounded-2xl"
            style={{
              background: "linear-gradient(160deg, rgba(0,20,10,0.82) 0%, rgba(0,40,20,0.75) 100%)",
              border: "1px solid rgba(80,220,120,0.35)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            {([
              { key: "1", label: "Dance" },
              { key: "2", label: "Breakdance" },
            ] as const).map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                  style={{
                    background: "linear-gradient(180deg, rgba(80,220,120,0.3) 0%, rgba(30,120,60,0.3) 100%)",
                    border: "1px solid rgba(80,220,120,0.5)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                    color: "#a0ffb8",
                  }}
                >
                  {key}
                </div>
                <span className="text-xs font-semibold" style={{ color: "rgba(180,255,200,0.8)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rampage announcement */}
      {rampageAnnouncement && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <div
            className="font-black text-xl px-7 py-3 rounded-2xl tracking-wide animate-bounce text-center relative overflow-hidden"
            style={{
              ...glass.panelAmber,
              color: "#ffe0a0",
              textShadow: "0 0 15px rgba(255,160,0,0.8)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
            <span className="relative">{rampageAnnouncement}</span>
          </div>
        </div>
      )}

      {/* Hit flash */}
      {showHitFlash && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 25%, rgba(220,0,0,0.5) 100%)" }}
        />
      )}

      {/* Scoreboard — hold Tab */}
      {showScoreboard && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="rounded-3xl px-7 py-5 min-w-72 relative overflow-hidden"
            style={glass.panelGreen}
          >
            <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-3xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
            <h2
              className="relative text-center text-lg font-bold mb-3 tracking-widest uppercase"
              style={{ color: "#a0ffb8", textShadow: "0 0 15px rgba(0,220,100,0.6)" }}
            >
              Scoreboard
            </h2>
            <table className="relative w-full text-sm">
              <thead>
                <tr style={{ color: "rgba(150,230,180,0.7)", borderBottom: "1px solid rgba(80,200,120,0.25)" }}>
                  <th className="text-left pb-1 font-semibold">Player</th>
                  <th className="text-center pb-1 font-semibold w-16">Kills</th>
                  <th className="text-center pb-1 font-semibold w-16">Deaths</th>
                </tr>
              </thead>
              <tbody>
                {[...scores]
                  .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
                  .map((s) => (
                    <tr key={s.id} style={{ color: s.id === myIdRef.current ? "#7effc0" : "rgba(220,255,235,0.9)" }}>
                      <td className="py-0.5">{s.name}</td>
                      <td className="text-center font-bold" style={{ color: "#5ef5a0" }}>{s.kills}</td>
                      <td className="text-center" style={{ color: "#ff8080" }}>{s.deaths}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="relative text-xs text-center mt-3" style={{ color: "rgba(150,220,170,0.5)" }}>Hold Tab to view</p>
          </div>
        </div>
      )}

      {/* Death screen */}
      {isDead && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,30,0.72) 100%)" }}
        >
          <div
            className="text-center px-10 py-7 rounded-3xl relative overflow-hidden"
            style={glass.panelRed}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-3xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />
            <p
              className="relative text-4xl font-bold"
              style={{ color: "#ff8080", textShadow: "0 0 25px rgba(255,80,80,0.8), 0 2px 6px rgba(0,0,0,0.7)" }}
            >
              YOU DIED
            </p>
            <p className="relative text-sm mt-2" style={{ color: "rgba(200,255,220,0.6)" }}>Respawning…</p>
          </div>
        </div>
      )}

      {/* Import model button + placement mode + bake */}
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
              onClick={() => exitPlacementModeRef.current?.()}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-2">
            {isAdmin && (
              <button
                className="px-3 py-2 rounded-xl text-sm font-semibold relative overflow-hidden disabled:opacity-50"
                style={{
                  ...glass.buttonGreen,
                  color: "rgba(200,255,220,0.9)",
                }}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                  style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)" }} />
                <span className="relative">{isUploading ? "Uploading…" : "Import Model"}</span>
              </button>
            )}
            {isAdmin && (
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
            )}
            {isAdmin && (
              <button
                className="px-3 py-2 rounded-xl text-sm font-semibold relative overflow-hidden"
                style={{
                  ...glass.buttonYellow,
                  color: "rgba(255,230,120,0.95)",
                }}
                onClick={onBakeMap}
              >
                <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                  style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />
                <span className="relative">Bake to Map</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
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

      {/* Floor paint controls */}
      {inFloorPaintMode && (
        <div
          className="absolute top-4 right-4 flex flex-col gap-3 p-4 rounded-2xl pointer-events-auto w-48"
          style={glass.panelPurple}
        >
          <p className="text-xs font-bold tracking-widest uppercase"
            style={{ color: "#d8aaff", textShadow: "0 0 8px rgba(180,80,255,0.6)" }}>
            Floor Paint
          </p>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(220,190,255,0.8)" }}>
              Brush colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brushColor}
                className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                onChange={(e) => onBrushColorChange(e.target.value)}
              />
              <span className="text-xs font-mono" style={{ color: "rgba(200,170,255,0.7)" }}>
                {brushColor}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(220,190,255,0.8)" }}>
              Brush size
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 5].map((s) => (
                <button
                  key={s}
                  className="flex-1 py-1 rounded-lg text-xs font-bold"
                  style={{
                    background: brushSize === s ? "rgba(180,100,255,0.4)" : "rgba(180,100,255,0.1)",
                    border: `1px solid ${brushSize === s ? "rgba(200,140,255,0.7)" : "rgba(180,100,255,0.25)"}`,
                    color: brushSize === s ? "#e0b8ff" : "rgba(200,160,255,0.5)",
                  }}
                  onClick={() => onBrushSizeChange(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px]" style={{ color: "rgba(200,160,255,0.5)" }}>
            Click or drag to paint · Bake to Map to save
          </p>
        </div>
      )}

      {/* Edit mode badge */}
      {inEditMode && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full text-sm font-bold tracking-widest uppercase pointer-events-none"
          style={{
            ...glass.panelAmber,
            color: "#ffe080",
            textShadow: "0 0 10px rgba(255,160,0,0.6)",
          }}
        >
          Edit Mode · Click to select · Drag gizmo to move · Del to delete · 2 to exit
        </div>
      )}

      {/* Object selection panel */}
      {inEditMode && selectedObjId && (
        <div
          className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-3 p-4 rounded-2xl w-52 pointer-events-auto overflow-hidden"
          style={glass.panelGreen}
        >
          <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-2xl pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)" }} />

          <p className="relative text-xs font-bold tracking-widest uppercase"
            style={{ color: "#a0ffb8", textShadow: "0 0 8px rgba(0,220,100,0.5)" }}>
            Object
          </p>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Scale: {selectedObjScale.toFixed(2)}x
            </label>
            <input
              type="range" min="0.1" max="5" step="0.05"
              value={selectedObjScale}
              className="w-full accent-green-400"
              onChange={(e) => {
                const s = parseFloat(e.target.value);
                setSelectedObjScale(s);
                applyTransformRef.current?.(selectedObjId, s, selectedObjRotY, selectedObjHitboxShape, selectedObjHitboxRadius, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Rotation: {Math.round(((selectedObjRotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI)}°
            </label>
            <input
              type="range" min="0" max="360" step="1"
              value={Math.round(((selectedObjRotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI)}
              className="w-full accent-green-400"
              onChange={(e) => {
                const r = parseFloat(e.target.value) * Math.PI / 180;
                setSelectedObjRotY(r);
                applyTransformRef.current?.(selectedObjId, selectedObjScale, r, selectedObjHitboxShape, selectedObjHitboxRadius, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox shape
            </label>
            <div className="flex gap-2">
              {(["cylinder", "box"] as const).map((shape) => (
                <button
                  key={shape}
                  className="flex-1 py-1 rounded-lg text-xs font-bold capitalize"
                  style={{
                    background: selectedObjHitboxShape === shape ? "rgba(80,220,120,0.3)" : "rgba(80,220,120,0.08)",
                    border: `1px solid ${selectedObjHitboxShape === shape ? "rgba(80,220,120,0.7)" : "rgba(80,220,120,0.25)"}`,
                    color: selectedObjHitboxShape === shape ? "#a0ffb8" : "rgba(200,255,220,0.6)",
                  }}
                  onClick={() => {
                    setSelectedObjHitboxShape(shape);
                    applyTransformRef.current?.(selectedObjId, selectedObjScale, selectedObjRotY, shape, selectedObjHitboxRadius, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
                  }}
                >
                  {shape}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox size: {selectedObjHitboxRadius.toFixed(2)}
            </label>
            <input
              type="range" min="0.1" max="8" step="0.05"
              value={selectedObjHitboxRadius}
              className="w-full accent-yellow-400"
              onChange={(e) => {
                const r = parseFloat(e.target.value);
                setSelectedObjHitboxRadius(r);
                applyTransformRef.current?.(selectedObjId, selectedObjScale, selectedObjRotY, selectedObjHitboxShape, r, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox offset X: {selectedObjHitboxOffsetX.toFixed(2)}
            </label>
            <input
              type="range" min="-5" max="5" step="0.1"
              value={selectedObjHitboxOffsetX}
              className="w-full accent-yellow-400"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSelectedObjHitboxOffsetX(v);
                applyHitboxOffsetRef.current?.(selectedObjId, v, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox offset Z: {selectedObjHitboxOffsetZ.toFixed(2)}
            </label>
            <input
              type="range" min="-5" max="5" step="0.1"
              value={selectedObjHitboxOffsetZ}
              className="w-full accent-yellow-400"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSelectedObjHitboxOffsetZ(v);
                applyHitboxOffsetRef.current?.(selectedObjId, selectedObjHitboxOffsetX, v);
              }}
            />
          </div>

          <button
            className="relative py-1.5 rounded-xl text-sm font-bold mt-1"
            style={{
              background: "linear-gradient(180deg, rgba(255,80,80,0.25) 0%, rgba(180,0,0,0.2) 100%)",
              border: "1px solid rgba(255,100,100,0.4)",
              color: "#ff9090",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            onClick={() => deleteObjRef.current?.(selectedObjId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Chat UI */}
      <div className="absolute bottom-4 left-4 w-80 flex flex-col gap-1.5 pointer-events-none">
        {chatOpen && (
          <div
            ref={chatBoxRef}
            className="max-h-48 overflow-y-auto flex flex-col gap-0.5 rounded-2xl px-3 py-2 pointer-events-auto"
            style={glass.panelGreen}
          >
            {chatMessages.map((m) => (
              <div key={m.id} className="text-sm leading-snug">
                <span className="font-semibold" style={{ color: "#7effc0" }}>{m.fromName}: </span>
                <span style={{ color: "rgba(220,255,235,0.9)" }}>{m.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pointer-events-auto">
          <input
            ref={chatInputRef}
            className={`flex-1 px-3 py-1.5 rounded-xl text-sm outline-none transition-opacity ${chatOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{
              background: "linear-gradient(180deg, rgba(0,30,10,0.6) 0%, rgba(0,50,20,0.5) 100%)",
              border: "1px solid rgba(80,220,120,0.35)",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.1)",
              color: "rgba(220,255,235,0.95)",
            }}
            placeholder="Press T to chat…"
            maxLength={200}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.nativeEvent.stopImmediatePropagation(); onChatSubmit(); setChatOpen(false); chatInputRef.current?.blur(); }
              if (e.key === "Escape") { e.nativeEvent.stopImmediatePropagation(); setChatOpen(false); setChatInput(""); chatInputRef.current?.blur(); }
            }}
          />
          {!chatOpen && (
            <>
              <button
                className="px-3 py-1.5 rounded-xl text-xs pointer-events-auto relative overflow-hidden"
                style={{ ...glass.buttonGreen, color: "rgba(200,255,220,0.8)" }}
                onClick={() => { setChatOpen(true); setTimeout(() => chatInputRef.current?.focus(), 0); }}
              >
                Chat [T]
              </button>
              <button
                className="px-3 py-1.5 rounded-xl text-xs pointer-events-auto relative overflow-hidden"
                style={{ ...glass.buttonYellow, color: "rgba(255,225,120,0.9)" }}
                onClick={onOpenStore}
              >
                Store [B]
              </button>
              {onOpenInventory && (
                <button
                  className="px-3 py-1.5 rounded-xl text-xs pointer-events-auto relative overflow-hidden"
                  style={{ ...glass.buttonBlue, color: "rgba(180,210,255,0.9)" }}
                  onClick={onOpenInventory}
                >
                  Inventory
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
