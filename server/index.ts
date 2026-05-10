import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import RAPIER from "@dimforge/rapier3d-compat";
import { Room, MAP_DIR } from "./Room";
import type { PlayerRegistry } from "./Room";
import { loadHomeData, insertHome } from "./db";
import { initStoreCache } from "./storeCache";
import type { MapConfig } from "./types";

const PORT = Number(process.env.PORT ?? 3001);

// Initialized once in main() before any Room is constructed
let rooms: Map<string, Room>;

function makeRegistry(): PlayerRegistry {
  const players = new Map<string, { ws: WebSocket; name: string }>();
  return {
    register(id, ws, name) { players.set(id, { ws, name }); },
    unregister(id) { players.delete(id); },
    deliver(targetName, msg) {
      const lower = targetName.toLowerCase();
      for (const [, p] of players) {
        if (p.name.toLowerCase() === lower) {
          try { p.ws.send(JSON.stringify(msg)); return true; } catch { return false; }
        }
      }
      return false;
    },
  };
}
const pendingHomeRooms = new Map<string, Promise<Room>>();

async function getOrCreateHomeRoom(userId: string, registry: PlayerRegistry): Promise<Room> {
  const mapId = `home_${userId}`;
  if (rooms.has(mapId)) return rooms.get(mapId)!;
  if (pendingHomeRooms.has(mapId)) return pendingHomeRooms.get(mapId)!;

  const promise = (async () => {
    const existing = await loadHomeData(userId);
    let room: Room;
    if (existing) {
      room = new Room(mapId, existing.map, registry);
      console.log(`[home] Loaded home for ${userId}`);
    } else {
      const template = JSON.parse(
        readFileSync(join(MAP_DIR, "home_template.json"), "utf8"),
      ) as MapConfig;
      const homeMap = { ...template, id: mapId };
      await insertHome(userId, homeMap);
      room = new Room(mapId, homeMap, registry);
      console.log(`[home] Created new home for ${userId}`);
    }
    rooms.set(mapId, room);
    pendingHomeRooms.delete(mapId);
    return room;
  })();

  pendingHomeRooms.set(mapId, promise);
  return promise;
}

async function main() {
  // Initialize RAPIER WASM before constructing any Room
  const wasmBuf = readFileSync(
    join(process.cwd(), "node_modules/@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm"),
  );
  await (RAPIER as unknown as { init(buf: Buffer): Promise<void> }).init(wasmBuf);
  console.log("[server] Rapier WASM initialized");

  await initStoreCache();

  // Pre-load all static map rooms from disk (exclude templates and home instances)
  const mapIds = readdirSync(MAP_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".placed.json"))
    .map((f) => f.replace(".json", ""))
    .filter((id) => id !== "home_template" && !id.startsWith("home_"));

  const registry = makeRegistry();

  rooms = new Map(mapIds.map((id) => [id, new Room(id, undefined, registry)]));
  console.log(`[server] Loaded maps: ${mapIds.join(", ")}`);

  const wss = new WebSocketServer({ port: PORT });

  wss.on("connection", async (ws, req) => {
    const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
    const mapId = params.get("map") ?? "forest";

    // Buffer any messages that arrive while we load a home room asynchronously
    const messageBuffer: string[] = [];
    const bufferMsg = (data: Buffer) => messageBuffer.push(data.toString());
    ws.on("message", bufferMsg);

    let room: Room;
    if (mapId.startsWith("home_")) {
      const userId = mapId.replace("home_", "");
      try {
        room = await getOrCreateHomeRoom(userId, registry);
      } catch (e) {
        console.error(`[home] Failed to load room for ${mapId}:`, e);
        ws.close();
        return;
      }
    } else {
      room = rooms.get(mapId) ?? rooms.get("forest")!;
    }

    ws.removeListener("message", bufferMsg);

    const id = randomUUID();
    room.add(id, ws);

    // Replay any buffered messages (e.g. join sent before room was ready)
    for (const msg of messageBuffer) room.handleMessage(id, msg);

    ws.on("message", (data) => room.handleMessage(id, data.toString()));
    ws.on("close", () => room.remove(id));
    ws.on("error", (err) => {
      console.error(`[${id}] ws error:`, err.message);
      room.remove(id);
    });
  });

  console.log(`Game server listening on ws://localhost:${PORT}`);
}

main().catch((err) => { console.error("[server] Fatal:", err); process.exit(1); });
