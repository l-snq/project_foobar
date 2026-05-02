export type ClientId = string;

export type Weapon = "none" | "pistol";

export interface PlacedObject {
  id: string;
  url: string;        // e.g. "/uploads/uuid.glb"
  placedBy: ClientId;
  x: number;
  z: number;
  rotY: number;
  scale: number;
  hitboxShape: "cylinder" | "box";
  hitboxRadius: number; // circle radius, or half-extent of square box
  hitboxOffsetX: number;
  hitboxOffsetZ: number;
}

export interface PlayerState {
  id: ClientId;
  name: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  moving: boolean;
  weapon: Weapon;
  health: number;
  maxHealth: number;
  dancing: boolean;
  ammo: number;
  reloading: boolean;
  onRampage: boolean;
}

export interface ProjectileState {
  id: string;
  ownerId: ClientId;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
}

// Client → Server
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "input"; x: number; z: number; rotY: number; weapon: Weapon; dancing: boolean }
  | { type: "shoot"; dirX: number; dirZ: number }
  | { type: "reload" }
  | { type: "chat"; text: string }
  | { type: "placeObject"; url: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number }
  | { type: "moveObject"; id: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number }
  | { type: "deleteObject"; id: string }

export interface ScoreEntry {
  id: ClientId;
  name: string;
  kills: number;
  deaths: number;
}

// Server → Client
export type ServerMessage =
  | { type: "handshake"; yourId: ClientId; tick: number }
  | { type: "snapshot"; tick: number; players: PlayerState[]; projectiles: ProjectileState[]; scores: ScoreEntry[] }
  | { type: "playerLeft"; id: ClientId }
  | { type: "hit"; targetId: ClientId; health: number }
  | { type: "died"; targetId: ClientId }
  | { type: "rampage"; playerId: ClientId; playerName: string }
  | { type: "chat"; fromId: ClientId; fromName: string; text: string }
  | { type: "objectList"; objects: PlacedObject[] }
  | { type: "objectPlaced"; object: PlacedObject }
  | { type: "objectMoved"; object: PlacedObject }
  | { type: "objectDeleted"; id: string }
