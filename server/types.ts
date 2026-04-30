export type ClientId = string;

export interface PlayerState {
  id: ClientId;
  x: number;
  y: number;
  z: number;
  rotY: number;
  moving: boolean;
}

// Client → Server
export type ClientMessage =
  | { type: "input"; x: number; z: number; rotY: number }

// Server → Client
export type ServerMessage =
  | { type: "handshake"; yourId: ClientId; tick: number }
  | { type: "snapshot"; tick: number; players: PlayerState[] }
  | { type: "playerLeft"; id: ClientId }
