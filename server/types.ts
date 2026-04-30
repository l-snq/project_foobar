export type ClientId = string;

export type Weapon = "none" | "pistol";

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
  dancing: boolean;
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
  | { type: "chat"; text: string }

// Server → Client
export type ServerMessage =
  | { type: "handshake"; yourId: ClientId; tick: number }
  | { type: "snapshot"; tick: number; players: PlayerState[]; projectiles: ProjectileState[] }
  | { type: "playerLeft"; id: ClientId }
  | { type: "hit"; targetId: ClientId; health: number }
  | { type: "died"; targetId: ClientId }
  | { type: "chat"; fromId: ClientId; fromName: string; text: string }
