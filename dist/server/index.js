"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const rapier3d_compat_1 = __importDefault(require("@dimforge/rapier3d-compat"));
const Room_1 = require("./Room");
const db_1 = require("./db");
const storeCache_1 = require("./storeCache");
const PORT = Number(process.env.PORT ?? 3001);
// Initialized once in main() before any Room is constructed
let rooms;
function makeRegistry() {
    const players = new Map();
    return {
        register(id, ws, name) { players.set(id, { ws, name }); },
        unregister(id) { players.delete(id); },
        deliver(targetName, msg) {
            const lower = targetName.toLowerCase();
            for (const [, p] of players) {
                if (p.name.toLowerCase() === lower) {
                    try {
                        p.ws.send(JSON.stringify(msg));
                        return true;
                    }
                    catch {
                        return false;
                    }
                }
            }
            return false;
        },
    };
}
const pendingHomeRooms = new Map();
async function getOrCreateHomeRoom(userId, registry) {
    const mapId = `home_${userId}`;
    if (rooms.has(mapId))
        return rooms.get(mapId);
    if (pendingHomeRooms.has(mapId))
        return pendingHomeRooms.get(mapId);
    const promise = (async () => {
        const existing = await (0, db_1.loadHomeData)(userId);
        let room;
        if (existing) {
            room = new Room_1.Room(mapId, existing.map, registry);
            console.log(`[home] Loaded home for ${userId}`);
        }
        else {
            const template = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(Room_1.MAP_DIR, "home_template.json"), "utf8"));
            const homeMap = { ...template, id: mapId };
            await (0, db_1.insertHome)(userId, homeMap);
            room = new Room_1.Room(mapId, homeMap, registry);
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
    const wasmBuf = (0, fs_1.readFileSync)((0, path_1.join)(process.cwd(), "node_modules/@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm"));
    await rapier3d_compat_1.default.init(wasmBuf);
    console.log("[server] Rapier WASM initialized");
    await (0, storeCache_1.initStoreCache)();
    // Pre-load all static map rooms from disk (exclude templates and home instances)
    const mapIds = (0, fs_1.readdirSync)(Room_1.MAP_DIR)
        .filter((f) => f.endsWith(".json") && !f.endsWith(".placed.json"))
        .map((f) => f.replace(".json", ""))
        .filter((id) => id !== "home_template" && !id.startsWith("home_"));
    const registry = makeRegistry();
    rooms = new Map(mapIds.map((id) => [id, new Room_1.Room(id, undefined, registry)]));
    console.log(`[server] Loaded maps: ${mapIds.join(", ")}`);
    const wss = new ws_1.WebSocketServer({ port: PORT });
    wss.on("connection", async (ws, req) => {
        const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
        const mapId = params.get("map") ?? "forest";
        // Buffer any messages that arrive while we load a home room asynchronously
        const messageBuffer = [];
        const bufferMsg = (data) => messageBuffer.push(data.toString());
        ws.on("message", bufferMsg);
        let room;
        if (mapId.startsWith("home_")) {
            const userId = mapId.replace("home_", "");
            try {
                room = await getOrCreateHomeRoom(userId, registry);
            }
            catch (e) {
                console.error(`[home] Failed to load room for ${mapId}:`, e);
                ws.close();
                return;
            }
        }
        else {
            room = rooms.get(mapId) ?? rooms.get("forest");
        }
        ws.removeListener("message", bufferMsg);
        const id = (0, crypto_1.randomUUID)();
        room.add(id, ws);
        // Replay any buffered messages (e.g. join sent before room was ready)
        for (const msg of messageBuffer)
            room.handleMessage(id, msg);
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
