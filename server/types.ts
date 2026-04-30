export type ClientId = string;

export interface PlayerState {
  id: ClientId;
  name: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  moving: boolean;
}

// Client → Server
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "input"; x: number; z: number; rotY: number }
  | { type: "chat"; text: string }

// Server → Client
export type ServerMessage =
  | { type: "handshake"; yourId: ClientId; tick: number }
  | { type: "snapshot"; tick: number; players: PlayerState[] }
  | { type: "playerLeft"; id: ClientId }
  | { type: "chat"; fromId: ClientId; fromName: string; text: string }
