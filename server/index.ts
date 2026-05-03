import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { readdirSync } from "fs";
import { Room, MAP_DIR } from "./Room";

const PORT = Number(process.env.PORT ?? 3001);

const wss = new WebSocketServer({ port: PORT });

// Create one room per map file found in maps/
const mapIds = readdirSync(MAP_DIR)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".placed.json"))
  .map((f) => f.replace(".json", ""));

const rooms = new Map<string, Room>(mapIds.map((id) => [id, new Room(id)]));
console.log(`[server] Loaded maps: ${mapIds.join(", ")}`);

wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
  const mapId = params.get("map") ?? "forest";
  const room = rooms.get(mapId) ?? rooms.get("forest")!;

  const id = randomUUID();
  room.add(id, ws);

  ws.on("message", (data) => {
    room.handleMessage(id, data.toString());
  });

  ws.on("close", () => {
    room.remove(id);
  });

  ws.on("error", (err) => {
    console.error(`[${id}] ws error:`, err.message);
    room.remove(id);
  });
});

console.log(`Game server listening on ws://localhost:${PORT}`);
