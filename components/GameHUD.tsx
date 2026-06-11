"use client";

import React from "react";
import type { Weapon, ScoreEntry } from "../server/types";
import type { SelectedObjectInfo } from "./game/PlacedObjects";
import type { ChatMessage } from "./hud/ChatPanel";
import { glass } from "./utils/glassStyles";
import Crosshair from "./hud/Crosshair";
import HealthBar from "./hud/HealthBar";
import WeaponSlot from "./hud/WeaponSlot";
import EmoteWheel from "./hud/EmoteWheel";
import Scoreboard from "./hud/Scoreboard";
import OverlayEffects from "./hud/OverlayEffects";
import PlacementControls from "./hud/PlacementControls";
import FloorPaintPanel from "./hud/FloorPaintPanel";
import ObjectEditPanel from "./hud/ObjectEditPanel";
import ChatPanel from "./hud/ChatPanel";

export interface GameHUDProps {
  // Player status
  cursorPos: { x: number; y: number };
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
  myId: string | null;
  rampageAnnouncement: string | null;
  levelUpMsg: string | null;
  emoteWheelOpen: boolean;

  // Placement / edit mode
  inPlacementMode: boolean;
  inEditMode: boolean;
  isUploading: boolean;
  isAdmin: boolean;
  selectedObj: SelectedObjectInfo | null;
  onSelectedChange: (next: SelectedObjectInfo) => void;
  onDeleteObject: (id: string) => void;
  onExitPlacement: () => void;
  onFileSelected: (file: File) => Promise<void>;

  // Floor paint
  inFloorPaintMode: boolean;
  onToggleFloorPaint: () => void;
  brushColor: string;
  onBrushColorChange: (c: string) => void;
  brushSize: number;
  onBrushSizeChange: (s: number) => void;

  // Chat
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatBoxRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLInputElement | null>;
  setChatInput: (s: string) => void;
  setChatOpen: (v: boolean) => void;
  onChatSubmit: () => void;
  onOpenStore: () => void;
  onOpenInventory: (() => void) | null;
}

export default function GameHUD(props: GameHUDProps) {
  return (
    <>
      {props.weapon === "pistol" && !props.isDead && (
        <Crosshair x={props.cursorPos.x} y={props.cursorPos.y} />
      )}

      <HealthBar health={props.health} maxHealth={props.maxHealth} onRampage={props.onRampage} />

      <WeaponSlot weapon={props.weapon} ammo={props.ammo} isReloading={props.isReloading} />

      {props.emoteWheelOpen && <EmoteWheel />}

      <OverlayEffects
        showHitFlash={props.showHitFlash}
        rampageAnnouncement={props.rampageAnnouncement}
        levelUpMsg={props.levelUpMsg}
        isDead={props.isDead}
      />

      {props.showScoreboard && <Scoreboard scores={props.scores} myId={props.myId} />}

      <PlacementControls
        inPlacementMode={props.inPlacementMode}
        isUploading={props.isUploading}
        isAdmin={props.isAdmin}
        inFloorPaintMode={props.inFloorPaintMode}
        onExitPlacement={props.onExitPlacement}
        onFileSelected={props.onFileSelected}
        onToggleFloorPaint={props.onToggleFloorPaint}
      />

      {props.inFloorPaintMode && (
        <FloorPaintPanel
          brushColor={props.brushColor}
          brushSize={props.brushSize}
          onBrushColorChange={props.onBrushColorChange}
          onBrushSizeChange={props.onBrushSizeChange}
        />
      )}

      {props.inEditMode && (
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

      {props.inEditMode && props.selectedObj && (
        <ObjectEditPanel
          selected={props.selectedObj}
          onChange={props.onSelectedChange}
          onDelete={props.onDeleteObject}
        />
      )}

      <ChatPanel
        chatOpen={props.chatOpen}
        chatMessages={props.chatMessages}
        chatInput={props.chatInput}
        chatBoxRef={props.chatBoxRef}
        chatInputRef={props.chatInputRef}
        setChatInput={props.setChatInput}
        setChatOpen={props.setChatOpen}
        onChatSubmit={props.onChatSubmit}
        onOpenStore={props.onOpenStore}
        onOpenInventory={props.onOpenInventory}
      />
    </>
  );
}
