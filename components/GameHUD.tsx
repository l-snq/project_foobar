"use client";

import React from "react";
import type { Weapon, ScoreEntry } from "../server/types";
import type { SelectedObjectInfo } from "./game/PlacedObjects";
import type { ChatMessage } from "./hud/ChatBar";
import TitleBar from "./hud/TitleBar";
import PlayerPanel from "./hud/PlayerPanel";
import WorldPanel from "./hud/WorldPanel";
import ChatBar from "./hud/ChatBar";
import ViewportOverlays from "./hud/ViewportOverlays";
import InviteDialog from "./hud/InviteDialog";

export interface GameHUDProps {
  // The Three.js renderer mounts into this element
  mountRef: React.RefObject<HTMLDivElement | null>;

  // Identity / session
  playerName: string;
  mapId: string;
  isHomeRoom: boolean;
  isAdmin: boolean;
  myId: string | null;
  onSignOut: () => void;

  // Player status
  cursorPos: { x: number; y: number } | null;
  health: number;
  maxHealth: number;
  onRampage: boolean;
  weapon: Weapon;
  ammo: number;
  isReloading: boolean;
  isDead: boolean;
  xp: number;
  currency: number;
  level: number;

  // Overlays
  showHitFlash: boolean;
  rampageAnnouncement: string | null;
  levelUpMsg: string | null;
  logicMessage: string | null;
  emoteWheelOpen: boolean;

  // World / scores
  scores: ScoreEntry[];
  onOpenStore: () => void;
  onOpenInventory: (() => void) | null;
  onGoHome: () => void;
  onGoHub: () => void;
  onKickPlayer: (targetId: string) => void;
  onInvitePlayer: (targetName: string) => void;
  pendingInvite: { fromOwnerName: string; homeRoomId: string } | null;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;

  // Placement / edit mode
  inPlacementMode: boolean;
  inEditMode: boolean;
  isUploading: boolean;
  selectedObj: SelectedObjectInfo | null;
  onSelectedChange: (next: SelectedObjectInfo) => void;
  onDeleteObject: (id: string) => void;
  onExitPlacement: () => void;
  onFileSelected: (file: File) => Promise<void>;

  // Logic editor
  inLogicMode: boolean;
  onToggleLogic: () => void;

  // Floor paint
  inFloorPaintMode: boolean;
  onToggleFloorPaint: () => void;
  brushColor: string;
  onBrushColorChange: (c: string) => void;
  brushSize: number;
  onBrushSizeChange: (s: number) => void;

  // Chat
  chatMessages: ChatMessage[];
  chatInput: string;
  chatBoxRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLInputElement | null>;
  setChatInput: (s: string) => void;
  onChatSubmit: () => void;
}

// The retro game-client chrome. The 3D world renders inside a sunken
// viewport cell; all status and tools live in the frame around it.
export default function GameHUD({
  mountRef, playerName, mapId, isHomeRoom, isAdmin, myId, onSignOut,
  cursorPos, health, maxHealth, onRampage, weapon, ammo, isReloading, isDead,
  xp, currency, level,
  showHitFlash, rampageAnnouncement, levelUpMsg, logicMessage, emoteWheelOpen,
  scores, onOpenStore, onOpenInventory, onGoHome, onGoHub,
  onKickPlayer, onInvitePlayer, pendingInvite, onAcceptInvite, onDeclineInvite,
  inPlacementMode, inEditMode, isUploading,
  selectedObj, onSelectedChange, onDeleteObject, onExitPlacement, onFileSelected,
  inLogicMode, onToggleLogic,
  inFloorPaintMode, onToggleFloorPaint, brushColor, onBrushColorChange, brushSize, onBrushSizeChange,
  chatMessages, chatInput, chatBoxRef, chatInputRef, setChatInput, onChatSubmit,
}: GameHUDProps) {
  return (
    <div className="retro-desktop w-full h-full p-2 select-none">
      <div
        className="bevel-out relative w-full h-full grid"
        style={{
          gridTemplateRows: "24px 1fr 148px",
          gridTemplateColumns: "208px 1fr 232px",
          gridTemplateAreas: `"title title title" "left view right" "chat chat chat"`,
          padding: 3,
          gap: 3,
        }}
      >
        <div style={{ gridArea: "title" }}>
          <TitleBar
            mapId={mapId}
            playerName={playerName}
            onlineCount={scores.length}
            onSignOut={onSignOut}
          />
        </div>

        <div className="bevel-out min-h-0" style={{ gridArea: "left" }}>
          <PlayerPanel
            playerName={playerName}
            health={health}
            maxHealth={maxHealth}
            onRampage={onRampage}
            weapon={weapon}
            ammo={ammo}
            isReloading={isReloading}
            xp={xp}
            currency={currency}
            level={level}
          />
        </div>

        {/* Game viewport — the world is embedded here */}
        <div
          ref={mountRef}
          className="bevel-in relative overflow-hidden min-h-0 min-w-0"
          style={{
            gridArea: "view",
            background: "linear-gradient(180deg, #0a3d8f 0%, #3b9fef 50%, #d4eeff 100%)",
            cursor: weapon === "pistol" && !isDead ? "none" : "default",
          }}
        >
          <ViewportOverlays
            cursorPos={cursorPos}
            weapon={weapon}
            isDead={isDead}
            showHitFlash={showHitFlash}
            rampageAnnouncement={rampageAnnouncement}
            levelUpMsg={levelUpMsg}
            logicMessage={logicMessage}
            emoteWheelOpen={emoteWheelOpen}
            inEditMode={inEditMode}
            inPlacementMode={inPlacementMode}
            onExitPlacement={onExitPlacement}
          />
        </div>

        <div className="bevel-out min-h-0" style={{ gridArea: "right" }}>
          <WorldPanel
            scores={scores}
            myId={myId}
            isHomeRoom={isHomeRoom}
            isAdmin={isAdmin}
            onOpenStore={onOpenStore}
            onOpenInventory={onOpenInventory}
            onGoHome={onGoHome}
            onGoHub={onGoHub}
            onKickPlayer={onKickPlayer}
            onInvitePlayer={onInvitePlayer}
            inLogicMode={inLogicMode}
            onToggleLogic={onToggleLogic}
            isUploading={isUploading}
            onFileSelected={onFileSelected}
            inFloorPaintMode={inFloorPaintMode}
            onToggleFloorPaint={onToggleFloorPaint}
            brushColor={brushColor}
            onBrushColorChange={onBrushColorChange}
            brushSize={brushSize}
            onBrushSizeChange={onBrushSizeChange}
            inEditMode={inEditMode}
            selectedObj={selectedObj}
            onSelectedChange={onSelectedChange}
            onDeleteObject={onDeleteObject}
          />
        </div>

        <div className="bevel-out min-h-0" style={{ gridArea: "chat" }}>
          <ChatBar
            chatMessages={chatMessages}
            chatInput={chatInput}
            chatBoxRef={chatBoxRef}
            chatInputRef={chatInputRef}
            setChatInput={setChatInput}
            onChatSubmit={onChatSubmit}
          />
        </div>

        {pendingInvite && (
          <InviteDialog
            fromOwnerName={pendingInvite.fromOwnerName}
            onAccept={onAcceptInvite}
            onDecline={onDeclineInvite}
          />
        )}
      </div>
    </div>
  );
}
