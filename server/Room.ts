import type { WebSocket } from "ws";
import type { ClientId, PlayerState, ServerMessage, ClientMessage } from "./types";

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const SPEED = 4;
const BOUNDS = 19.5;
const MAX_CHAT_LEN = 200;

interface Client {
  id: ClientId;
  ws: WebSocket;
  name: string;
  inputX: number;
  inputZ: number;
  rotY: number;
  joined: boolean;
}

export class Room {
  private clients = new Map<ClientId, Client>();
  private states = new Map<ClientId, PlayerState>();
  private tick = 0;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(readonly id: string) {
    this.interval = setInterval(() => this.update(), TICK_MS);
  }

  add(id: ClientId, ws: WebSocket) {
    this.clients.set(id, { id, ws, name: "Player", inputX: 0, inputZ: 0, rotY: 0, joined: false });

    const handshake: ServerMessage = { type: "handshake", yourId: id, tick: this.tick };
    ws.send(JSON.stringify(handshake));
    // State is not added until the client sends a "join" with their name
  }

  remove(id: ClientId) {
    this.clients.delete(id);
    this.states.delete(id);
    const msg: ServerMessage = { type: "playerLeft", id };
    this.broadcast(msg);
  }

  handleMessage(id: ClientId, raw: string) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const client = this.clients.get(id);
    if (!client) return;

    if (msg.type === "join") {
      const name = msg.name.trim().slice(0, 24) || "Player";
      client.name = name;
      client.joined = true;
      this.states.set(id, { id, name, x: 0, y: 0, z: 0, rotY: 0, moving: false });
      return;
    }

    if (!client.joined) return;

    if (msg.type === "input") {
      const len = Math.sqrt(msg.x * msg.x + msg.z * msg.z);
      if (len > 1) {
        client.inputX = msg.x / len;
        client.inputZ = msg.z / len;
      } else {
        client.inputX = msg.x;
        client.inputZ = msg.z;
      }
      client.rotY = msg.rotY;
    }

    if (msg.type === "chat") {
      const text = msg.text.trim().slice(0, MAX_CHAT_LEN);
      if (!text) return;
      const chatMsg: ServerMessage = { type: "chat", fromId: id, fromName: client.name, text };
      this.broadcast(chatMsg);
    }
  }

  private update() {
    this.tick++;
    const dt = TICK_MS / 1000;

    for (const [id, client] of this.clients) {
      if (!client.joined) continue;
      const state = this.states.get(id)!;
      const moving = client.inputX !== 0 || client.inputZ !== 0;
      state.moving = moving;
      state.rotY = client.rotY;

      if (moving) {
        state.x = Math.max(-BOUNDS, Math.min(BOUNDS, state.x + client.inputX * SPEED * dt));
        state.z = Math.max(-BOUNDS, Math.min(BOUNDS, state.z + client.inputZ * SPEED * dt));
      }
    }

    const snapshot: ServerMessage = {
      type: "snapshot",
      tick: this.tick,
      players: Array.from(this.states.values()),
    };
    this.broadcast(snapshot);
  }

  private broadcast(msg: ServerMessage) {
    const raw = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(raw);
      }
    }
  }

  get size() {
    return this.clients.size;
  }

  destroy() {
    if (this.interval) clearInterval(this.interval);
  }
}
