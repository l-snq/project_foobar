import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Room, MAP_DIR } from "./Room";
import { loadHomeData, insertHome } from "./db";
import type { MapConfig } from "./types";

const PORT = Number(process.env.PORT ?? 3001);

const wss = new WebSocketServer({ port: PORT });

// Pre-load all static map rooms from disk
const mapIds = readdirSync(MAP_DIR)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".placed.json"))
  .map((f) => f.replace(".json", ""));

const rooms = new Map<string, Room>(mapIds.map((id) => [id, new Room(id)]));
console.log(`[server] Loaded maps: ${mapIds.join(", ")}`);

// Home rooms are created on demand and cached here after first load
const pendingHomeRooms = new Map<string, Promise<Room>>();

async function getOrCreateHomeRoom(userId: string): Promise<Room> {
  const mapId = `home_${userId}`;
  if (rooms.has(mapId)) return rooms.get(mapId)!;
  if (pendingHomeRooms.has(mapId)) return pendingHomeRooms.get(mapId)!;

  const promise = (async () => {
    const existing = await loadHomeData(userId);
    let room: Room;
    if (existing) {
      room = new Room(mapId, existing.map, existing.placedObjects);
      console.log(`[home] Loaded home for ${userId}`);
    } else {
      const template = JSON.parse(
        readFileSync(join(MAP_DIR, "home_template.json"), "utf8"),
      ) as MapConfig;
      const homeMap = { ...template, id: mapId };
      await insertHome(userId, homeMap);
      room = new Room(mapId, homeMap, []);
      console.log(`[home] Created new home for ${userId}`);
    }
    rooms.set(mapId, room);
    pendingHomeRooms.delete(mapId);
    return room;
  })();

  pendingHomeRooms.set(mapId, promise);
  return promise;
}

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
      room = await getOrCreateHomeRoom(userId);
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
