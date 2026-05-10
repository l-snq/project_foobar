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
  | { type: "requestMapChange"; targetMapId: string }
  | { type: "placeObject"; url: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number; hitboxes?: HitboxDef[] }
  | { type: "moveObject"; id: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number; hitboxes?: HitboxDef[] }
  | { type: "deleteObject"; id: string }
  | { type: "saveGroundPaint"; groundPaintData: string[][] }
  | { type: "placeStoreItem"; itemId: string; x: number; z: number; rotY: number; scale: number; hitboxShape: "cylinder" | "box"; hitboxRadius: number; hitboxOffsetX: number; hitboxOffsetZ: number; hitboxes?: HitboxDef[] }
  | { type: "refreshInventory" }
  | { type: "kickPlayer"; targetId: ClientId }
  | { type: "invitePlayer"; targetName: string }

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
  | { type: "mapChangeError"; reason: string }
  | { type: "profileSync"; xp: number; currency: number; level: number }
  | { type: "levelUp"; newLevel: number; currencyAwarded: number }
  | { type: "kicked" }
  | { type: "inviteReceived"; fromOwnerName: string; homeRoomId: string }
  | { type: "inviteError"; reason: string }
