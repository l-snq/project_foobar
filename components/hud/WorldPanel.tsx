"use client";

import type { ScoreEntry } from "../../server/types";
import type { SelectedObjectInfo } from "../game/PlacedObjects";
import Scoreboard from "./Scoreboard";
import HomeTools from "./HomeTools";
import AdminTools from "./AdminTools";
import ObjectEditPanel from "./ObjectEditPanel";
import FloorPaintPanel from "./FloorPaintPanel";

// Right-hand column: who's online, actions, and contextual tool sections.
interface Props {
  scores: ScoreEntry[];
  myId: string | null;
  isHomeRoom: boolean;
  isAdmin: boolean;

  onOpenStore: () => void;
  onOpenInventory: (() => void) | null;
  onGoHome: () => void;
  onGoHub: () => void;

  onKickPlayer: (targetId: string) => void;
  onInvitePlayer: (targetName: string) => void;

  inLogicMode: boolean;
  onToggleLogic: () => void;

  isUploading: boolean;
  onFileSelected: (file: File) => Promise<void>;
  inFloorPaintMode: boolean;
  onToggleFloorPaint: () => void;
  brushColor: string;
  onBrushColorChange: (c: string) => void;
  brushSize: number;
  onBrushSizeChange: (s: number) => void;

  inEditMode: boolean;
  selectedObj: SelectedObjectInfo | null;
  onSelectedChange: (next: SelectedObjectInfo) => void;
  onDeleteObject: (id: string) => void;
}

export default function WorldPanel(props: Props) {
  return (
    <div className="flex flex-col gap-2 p-2 h-full overflow-y-auto retro-scroll" style={{ fontSize: 11 }}>
      <div className="retro-section">
        <span className="retro-section-label">Actions</span>
        <div className="flex flex-col gap-1">
          <button className="retro-btn text-left" onClick={props.onOpenStore}>🛒 STORE [B]</button>
          {props.onOpenInventory && (
            <button className="retro-btn text-left" onClick={props.onOpenInventory}>📦 INVENTORY</button>
          )}
          {props.isHomeRoom
            ? <button className="retro-btn text-left" onClick={props.onGoHub}>🌐 GO TO HUB</button>
            : <button className="retro-btn text-left" onClick={props.onGoHome}>🏠 GO HOME</button>}
          {props.isHomeRoom && (
            <button className="retro-btn text-left" data-pressed={props.inLogicMode} onClick={props.onToggleLogic}>
              🔌 LOGIC EDITOR [3]
            </button>
          )}
        </div>
      </div>

      <Scoreboard scores={props.scores} myId={props.myId} />

      {props.isHomeRoom && (
        <HomeTools
          scores={props.scores}
          myId={props.myId}
          onKickPlayer={props.onKickPlayer}
          onInvitePlayer={props.onInvitePlayer}
        />
      )}

      {props.inEditMode && props.selectedObj && (
        <ObjectEditPanel
          selected={props.selectedObj}
          onChange={props.onSelectedChange}
          onDelete={props.onDeleteObject}
        />
      )}

      {props.inFloorPaintMode && (
        <FloorPaintPanel
          brushColor={props.brushColor}
          brushSize={props.brushSize}
          onBrushColorChange={props.onBrushColorChange}
          onBrushSizeChange={props.onBrushSizeChange}
        />
      )}

      {props.isAdmin && (
        <AdminTools
          isUploading={props.isUploading}
          inFloorPaintMode={props.inFloorPaintMode}
          onFileSelected={props.onFileSelected}
          onToggleFloorPaint={props.onToggleFloorPaint}
        />
      )}
    </div>
  );
}
