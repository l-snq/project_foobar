import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { Room } from "./Room";

const PORT = Number(process.env.PORT ?? 3001);

const wss = new WebSocketServer({ port: PORT });

// Single default room for now; extend to a room map keyed by roomId for matchmaking
const defaultRoom = new Room("default");

wss.on("connection", (ws) => {
  const id = randomUUID();
  defaultRoom.add(id, ws);

  ws.on("message", (data) => {
    defaultRoom.handleMessage(id, data.toString());
  });

  ws.on("close", () => {
    defaultRoom.remove(id);
  });

  ws.on("error", (err) => {
    console.error(`[${id}] ws error:`, err.message);
    defaultRoom.remove(id);
  });
});

console.log(`Game server listening on ws://localhost:${PORT}`);
