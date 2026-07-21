export type ClientId = string;

export interface StoreItem {
  id: string;
  name: string;
  model_url: string;
  price: number;
  thumbnail_url: string | null;
  category: string;
}

export type Weapon = "none" | "pistol";

export interface StaticObject {
  url: string;
  x: number;
  z: number;
  rotY: number;
  scale?: number;
  hitboxShape: "cylinder" | "box" | "capsule";
  hitboxRadius: number;
  hitboxDepth?: number;   // Z half-extent for box; defaults to hitboxRadius (square)
  hitboxHeight?: number;  // full collider height; defaults to 1.0
  hitboxes?: HitboxDef[]; // multi-box hitboxes from GLTF; when present, overrides hitboxShape/hitboxRadius
  collisionOnly?: boolean; // if true, hitbox is registered but no GLTF is rendered
}

export interface DoorConfig {
  x: number;
  z: number;
  rotY: number;
  triggerRadius: number;
  targetMapId: string;
  label: string;
  requiredRole: string | null; // TODO: enforce when auth is added
}

export interface WaterZone {
  x: number;  // center x
  z: number;  // center z
  width: number;  // x extent
  height: number; // z extent
}

export interface MapEnvironment {
  sky: { top: string; mid: string; horizon: string };
  fog: { color: string; near: number; far: number };
  sun: { x: number; y: number; z: number; color: string; intensity: number };
  ambientLight: { color: string; intensity: number };
  groundColor: string;
}

export interface MapConfig {
  id: string;
  name: string;
  bounds: number;
  groundSize: number;
  hideGround?: boolean;
  environment: MapEnvironment;
  spawnPoints: { x: number; z: number }[];
  staticObjects: StaticObject[];
  placedObjects?: PlacedObject[]; // user-placed objects; stored alongside the map, no separate bake step needed
  doors: DoorConfig[];
  waterZones: WaterZone[];
  groundPaintData?: string[][];  // per-tile hex colors, [row][col], dimensions = groundSize × groundSize
  logic?: LogicGraph;            // data-driven trigger→action behavior graph, run server-side each tick
}

// ---- Logic graph (visual node-wiring behavior system) ----
// A room's interactive behavior is a graph of nodes connected by wires, evaluated
// in the server tick loop. Trigger nodes emit pulses, logic nodes transform them,
// action nodes perform effects. See server/logic.ts for the runtime.

export type LogicNodeKind =
  | "zoneEnter"   // trigger: pulse when a player enters a circular zone
  | "zoneExit"    // trigger: pulse when a player leaves a circular zone
  | "counter"     // logic: count pulses, fire onward every {threshold} pulses
  | "teleport"    // action: move the triggering player to {x, z}
  | "changeMap"   // action: send the triggering player to another map
  | "setVisible"  // action: show/hide a placed object for everyone
  | "giveReward"; // action: grant {xp, currency} to the triggering player

export interface LogicNode {
  id: string;
  kind: LogicNodeKind;
  ex: number;   // node position in the 2D editor graph
  ey: number;
  // Node configuration. World-anchored kinds carry world coords here:
  //   zoneEnter/zoneExit → { x, z, radius }
  //   teleport           → { x, z }
  //   changeMap          → { targetMapId }
  //   counter            → { threshold }
  //   setVisible         → { visible }
  //   giveReward         → { xp, currency }
  params: Record<string, number | string | boolean>;
  objectId?: string; // link to a PlacedObject (e.g. setVisible target)
}

export interface LogicWire {
  id: string;
  from: string; // source node id
  to: string;   // destination node id
}

export interface LogicGraph {
  nodes: LogicNode[];
  wires: LogicWire[];
}

// One collider shape extracted from GLTF "hitbox" group geometry.
// Offsets are in model-local space at scale=1, rotY=0.
export interface HitboxDef {
  shape: "box" | "cylinder";
  offsetX: number;
  offsetZ: number;
  halfW: number; // box: x half-extent; cylinder: radius
  halfD: number; // box: z half-extent; unused for cylinder
}

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
  // When present, overrides hitboxShape/hitboxRadius with per-mesh shapes
  // extracted from the GLTF "hitbox" group at placement time.
  hitboxes?: HitboxDef[];
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
  emote: string | null;
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
  | { type: "join"; name: string; userId: string; token: string }
  | { type: "input"; x: number; z: number; rotY: number; weapon: Weapon; emote: string | null }
  | { type: "shoot"; dirX: number; dirZ: number }
  | { type: "reload" }
  | { type: "chat"; text: string }
  | { type: "placeObject"; url: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number; hitboxes?: HitboxDef[] }
  | { type: "moveObject"; id: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number; hitboxes?: HitboxDef[] }
  | { type: "deleteObject"; id: string }
  | { type: "saveGroundPaint"; groundPaintData: string[][] }
  | { type: "placeStoreItem"; itemId: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number; hitboxes?: HitboxDef[] }
  | { type: "refreshInventory" }
  | { type: "kickPlayer"; targetId: ClientId }
  | { type: "invitePlayer"; targetName: string }
  | { type: "saveLogic"; logic: LogicGraph }

export interface ScoreEntry {
  id: ClientId;
  name: string;
  kills: number;
  deaths: number;
}

// Server → Client
export type ServerMessage =
  | { type: "handshake"; yourId: ClientId; tick: number; map: MapConfig }
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
  | { type: "changeMap"; targetMapId: string }
  | { type: "profileSync"; xp: number; currency: number; level: number }
  | { type: "levelUp"; newLevel: number; currencyAwarded: number }
  | { type: "kicked" }
  | { type: "inviteReceived"; fromOwnerName: string; homeRoomId: string }
  | { type: "inviteError"; reason: string }
  // Logic-graph effects. `teleport` targets one client so it can snap its local
  // prediction across the jump; `logicEffect` carries world-visible effects.
  | { type: "teleport"; x: number; z: number }
  | { type: "logicEffect"; effect: "setVisible"; objectId: string; visible: boolean }
