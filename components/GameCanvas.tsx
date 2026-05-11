"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { ServerMessage, ClientMessage, PlayerState, ProjectileState, Weapon, ScoreEntry, PlacedObject, MapConfig, StaticObject, DoorConfig, HitboxDef } from "../server/types";
import { extractHitboxes, hideHitboxGroup } from "./utils/hitboxUtils";
import { supabase } from "@/lib/supabase";
import RAPIER from "@dimforge/rapier3d-compat";
import GameHUD from "./GameHUD";
import HomeManagement from "./HomeManagement";
import HUDProfile from "./HUDProfile";
import StoreOverlay from "./StoreOverlay";
import InventoryPicker from "./InventoryPicker";
import { buildGround, makeNameLabel, makeGhost, isOccluded, makeProjectileLine } from "./utils/threeHelpers";
import { FloorPainter } from "./FloorPainter";
import { updateLocalPlayer } from "./GameLoopUtils";
import { Game } from "./GameManager";
import type { StoreItem } from "../server/types";
import { LocalCharacter } from "./LocalCharacter";
import type { GltfTemplate } from "./LocalCharacter";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "ws://localhost:3001";
const LERP_FACTOR = 0.2;
const MAX_HEALTH = 100;
const BULLET_LENGTH = 0.6; // world units

interface RemotePlayer {
  rootUnarmed: THREE.Object3D;
  rootPistol: THREE.Object3D;
  label: CSS2DObject;
  mixerUnarmed: THREE.AnimationMixer;
  mixerPistol: THREE.AnimationMixer;
  walkActionUnarmed: THREE.AnimationAction;
  walkActionPistol: THREE.AnimationAction;
  danceAction: THREE.AnimationAction | null;
  breakdanceAction: THREE.AnimationAction | null;
  reloadAction: THREE.AnimationAction | null;
  emote: string | null;
  reloading: boolean;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetRotY: number;
  moving: boolean;
  weapon: Weapon;
  health: number;
  dead: boolean;
  ghost: THREE.Mesh;
}

export interface ChatMessage {
  fromName: string;
  text: string;
  id: number;
}

interface Props {
  playerName: string;
  userId: string;
}

// ---------------------------------------------------------------------------
export default function GameCanvas({ playerName, userId }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [maxHealth, setMaxHealth] = useState(MAX_HEALTH);
  const [onRampage, setOnRampage] = useState(false);
  const [weapon, setWeapon] = useState<Weapon>("none");
  const [isDead, setIsDead] = useState(false);
  const [showHitFlash, setShowHitFlash] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [ammo, setAmmo] = useState(8);
  const [isReloading, setIsReloading] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [rampageAnnouncement, setRampageAnnouncement] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [inPlacementMode, setInPlacementMode] = useState(false);
  const [currentMapId, setCurrentMapId] = useState("hub");
  const [emoteWheelOpen, setEmoteWheelOpen] = useState(false);
  const [mapReloadToken, setMapReloadToken] = useState(0);
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const [selectedObjScale, setSelectedObjScale] = useState(1);
  const [selectedObjRotY, setSelectedObjRotY] = useState(0);
  const [selectedObjHitboxShape, setSelectedObjHitboxShape] = useState<"cylinder" | "box">("cylinder");
  const [selectedObjHitboxRadius, setSelectedObjHitboxRadius] = useState(1);
  const [selectedObjHitboxOffsetX, setSelectedObjHitboxOffsetX] = useState(0);
  const [selectedObjHitboxOffsetZ, setSelectedObjHitboxOffsetZ] = useState(0);
  const [xp, setXp] = useState(0);
  const [currency, setCurrency] = useState(0);
  const [level, setLevel] = useState(1);
  const [storeOpen, setStoreOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [inEditMode, setInEditMode] = useState(false);
  const [inFloorPaintMode, setInFloorPaintMode] = useState(false);
  const [brushColor, setBrushColor] = useState("#3a7d44");
  const [brushSize, setBrushSize] = useState(1);
  const [pendingInvite, setPendingInvite] = useState<{ fromOwnerName: string; homeRoomId: string } | null>(null);

  const placementStoreItemIdRef = useRef<string | null>(null);
  const enterStoreItemPlacementModeRef = useRef<((item: StoreItem) => void) | null>(null);
  const inEditModeRef = useRef(false);
  const floorPainterRef = useRef<FloorPainter | null>(null);

  const chatIdRef = useRef(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const enterPlacementModeRef = useRef<((url: string, preset?: Partial<PlacedObject>) => void) | null>(null);
  const exitPlacementModeRef = useRef<(() => void) | null>(null);
  const applyTransformRef = useRef<((id: string, scale: number, rotY: number, hitboxShape: "cylinder" | "box", hitboxRadius: number, hitboxOffsetX: number, hitboxOffsetZ: number) => void) | null>(null);
  const applyHitboxOffsetRef = useRef<((id: string, offsetX: number, offsetZ: number) => void) | null>(null);
  const deleteObjRef = useRef<((id: string) => void) | null>(null);
  const placementUrlRef = useRef<string | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      setCursorPos({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  // Refs that the Three.js loop reads — avoids stale closures
  const weaponRef = useRef<Weapon>("none");
  const isReloadingRef = useRef(false);
  const myIdRef = useRef<string | null>(null);

  const sendChat = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: ClientMessage = { type: "chat", text };
    ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.tabIndex = -1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ---- CSS2D label renderer ----
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
    labelRenderer.domElement.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
    mount.appendChild(labelRenderer.domElement);

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd4eeff, 30, 60);

    // ---- Camera ----
    const aspect = mount.clientWidth / mount.clientHeight;
    const frustum = 8;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2, (frustum * aspect) / 2,
      frustum / 2, -frustum / 2,
      0.1, 200
    );
    const d = 10;
    camera.position.set(d, d * 0.816, d);
    camera.lookAt(0, 0.8, 0);

    // Lights and ground are applied when the map config arrives via handshake.
    // Declare mutable holders so applyMap can replace them on reconnect.
    let mapLights: THREE.Object3D[] = [];
    let mapGround: THREE.Group | null = null;
    let mapStaticRoots: THREE.Object3D[] = [];
    let mapWaterRoots: THREE.Object3D[] = [];
    let mapDoorRoots: THREE.Object3D[] = [];
    let applyMapGen = 0;

    const floorPainter = new FloorPainter(scene);
    floorPainterRef.current = floorPainter;

    // ---- Transform gizmo ----
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode("translate");
    transformControls.setSpace("world");
    transformControls.showY = false; // ground-plane only
    scene.add(transformControls.getHelper());

    // Track when the gizmo captures a pointer-down so onMouseDown can ignore it
    let gizmoPointerDown = false;
    transformControls.addEventListener("mouseDown", () => { gizmoPointerDown = true; });
    transformControls.addEventListener("mouseUp", () => {
      gizmoPointerDown = false;
      // Send final position to server after drag ends
      if (!currentSelectedId) return;
      const entry = placedObjects.get(currentSelectedId);
      if (!entry) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "moveObject",
        id: currentSelectedId,
        x: entry.data.x,
        z: entry.data.z,
        rotY: entry.data.rotY,
        scale: entry.data.scale,
        hitboxShape: entry.data.hitboxShape,
        hitboxRadius: entry.data.hitboxRadius,
        hitboxOffsetX: entry.data.hitboxOffsetX,
        hitboxOffsetZ: entry.data.hitboxOffsetZ,
        hitboxes: entry.data.hitboxes,
      } satisfies ClientMessage));
    });

    // Live-update hitbox and selection box while dragging
    transformControls.addEventListener("objectChange", () => {
      if (!currentSelectedId) return;
      const entry = placedObjects.get(currentSelectedId);
      if (!entry) return;
      entry.data.x = entry.root.position.x;
      entry.data.z = entry.root.position.z;
      // Regenerate hitbox visual so world-space positions stay correct
      disposeHitboxMesh(entry.hitboxMesh);
      scene.remove(entry.hitboxMesh);
      entry.hitboxMesh = makeHitboxMesh(entry.data);
      entry.hitboxMesh.visible = true;
      scene.add(entry.hitboxMesh);
      const col = placedColliders.get(currentSelectedId);
      if (col) { col.x = entry.data.x; col.z = entry.data.z; }
      removeRapierPlacedBody(currentSelectedId);
      addRapierPlacedBody(entry.data);
      refreshSelectionBox(entry.root);
    });


    // ---- Reload ----
    function triggerReload() {
      if (isReloadingRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const started = character.triggerReload(() => {
        isReloadingRef.current = false;
        setIsReloading(false);
      });
      if (started) {
        isReloadingRef.current = true;
        setIsReloading(true);
        ws.send(JSON.stringify({ type: "reload" } satisfies ClientMessage));
      }
    }

    // ---- Debug wireframes ----
    let debugVisible = false;
    let debugMeshes: THREE.Mesh[] = [];

    // ---- Rapier client-side prediction ----
    const RAPIER_PHH = 0.5; // player half-height
    const RAPIER_PR = 0.25; // player radius
    const RAPIER_OHH = 0.5; // object half-height
    let rapierWorld: RAPIER.World | null = null;
    let rapierPlayerBody: RAPIER.RigidBody | null = null;
    let rapierPlayerCollider: RAPIER.Collider | null = null;
    let rapierController: RAPIER.KinematicCharacterController | null = null;
    const rapierPlacedBodies = new Map<string, RAPIER.RigidBody[]>();
    let rapierBounds = 40;
    let rapierReady = false;
    let pendingMapForRapier: MapConfig | null = null;

    function buildRapierWorld(map: MapConfig) {
      if (!rapierReady) { pendingMapForRapier = map; return; }
      // Clean up old world
      if (rapierController && rapierWorld) {
        rapierWorld.removeCharacterController(rapierController);
        rapierController = null;
      }
      rapierPlayerBody = null;
      rapierPlayerCollider = null;
      rapierPlacedBodies.clear();
      rapierBounds = map.bounds;
      rapierWorld = new RAPIER.World({ x: 0, y: 0, z: 0 });
      for (const obj of map.staticObjects) {
        if (obj.hitboxRadius <= 0) continue;
        const hh = (obj.hitboxHeight ?? 1.0) / 2;
        const body = rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(obj.x, 0, obj.z));
        if (obj.hitboxShape === "cylinder") {
          rapierWorld.createCollider(RAPIER.ColliderDesc.cylinder(hh, obj.hitboxRadius), body);
        } else if (obj.hitboxShape === "capsule") {
          rapierWorld.createCollider(RAPIER.ColliderDesc.capsule(hh, obj.hitboxRadius), body);
        } else {
          const hw = obj.hitboxRadius;
          const hd = obj.hitboxDepth ?? obj.hitboxRadius;
          rapierWorld.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hd), body);
        }
      }
      // Any placed objects that arrived before the world was ready get their bodies added now
      for (const entry of placedObjects.values()) addRapierPlacedBody(entry.data);
    }

    function addRapierPlacedBody(obj: PlacedObject) {
      if (!rapierWorld) return;
      const bodies: RAPIER.RigidBody[] = [];

      if (obj.hitboxes && obj.hitboxes.length > 0) {
        const cos = Math.cos(obj.rotY);
        const sin = Math.sin(obj.rotY);
        for (const hb of obj.hitboxes) {
          const wx = obj.x + (hb.offsetX * cos + hb.offsetZ * sin) * obj.scale;
          const wz = obj.z + (-hb.offsetX * sin + hb.offsetZ * cos) * obj.scale;
          const body = rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wx, 0, wz));
          if (hb.shape === "cylinder") {
            rapierWorld.createCollider(RAPIER.ColliderDesc.cylinder(RAPIER_OHH, hb.halfW * obj.scale), body);
          } else {
            rapierWorld.createCollider(RAPIER.ColliderDesc.cuboid(hb.halfW * obj.scale, RAPIER_OHH, hb.halfD * obj.scale), body);
          }
          bodies.push(body);
        }
      } else {
        const hx = obj.x + (obj.hitboxOffsetX ?? 0);
        const hz = obj.z + (obj.hitboxOffsetZ ?? 0);
        const body = rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hx, 0, hz));
        if (obj.hitboxShape === "box") {
          rapierWorld.createCollider(RAPIER.ColliderDesc.cuboid(obj.hitboxRadius, RAPIER_OHH, obj.hitboxRadius), body);
        } else {
          rapierWorld.createCollider(RAPIER.ColliderDesc.cylinder(RAPIER_OHH, obj.hitboxRadius), body);
        }
        bodies.push(body);
      }

      rapierPlacedBodies.set(obj.id, bodies);
    }

    function removeRapierPlacedBody(id: string) {
      const bodies = rapierPlacedBodies.get(id);
      if (bodies && rapierWorld) {
        for (const body of bodies) rapierWorld.removeRigidBody(body);
        rapierPlacedBodies.delete(id);
      }
    }

    function addRapierPlayer(x: number, z: number) {
      if (!rapierWorld || !rapierReady) return;
      if (rapierController) {
        rapierWorld.removeCharacterController(rapierController);
        rapierController = null;
      }
      if (rapierPlayerBody) {
        rapierWorld.removeRigidBody(rapierPlayerBody);
        rapierPlayerBody = null;
        rapierPlayerCollider = null;
      }
      const ctrl = rapierWorld.createCharacterController(0.01);
      ctrl.setSlideEnabled(true);
      ctrl.setApplyImpulsesToDynamicBodies(false);
      const body = rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0, z));
      const col = rapierWorld.createCollider(RAPIER.ColliderDesc.cylinder(RAPIER_PHH, RAPIER_PR), body);
      rapierController = ctrl;
      rapierPlayerBody = body;
      rapierPlayerCollider = col;
    }

    RAPIER.init().then(() => {
      rapierReady = true;
      if (pendingMapForRapier) {
        buildRapierWorld(pendingMapForRapier);
        pendingMapForRapier = null;
      }
    });

    // ---- Input ----
    const keys = { w: false, a: false, s: false, d: false, q: false, e: false };
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab") {
        e.preventDefault();
        setShowScoreboard(true);
        return;
      }
      if (e.key === "x" || e.key === "X") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        debugVisible = !debugVisible;
        for (const m of debugMeshes) m.visible = debugVisible;
        for (const [id, entry] of placedObjects) {
          entry.hitboxMesh.visible = debugVisible || currentSelectedId === id;
        }
        return;
      }
      if (e.key === "b" || e.key === "B") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        setStoreOpen((v) => !v);
        return;
      }
      if (e.key === "2" && !rHeld) {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        if (currentMapId !== `home_${userId}`) return;
        const next = !inEditModeRef.current;
        inEditModeRef.current = next;
        setInEditMode(next);
        if (!next) { selectObject(null); }
        return;
      }
      if (e.key === "t" || e.key === "T") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        e.preventDefault();
        setChatOpen(true);
        setTimeout(() => chatInputRef.current?.focus(), 0);
        return;
      }
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      // Escape — cancel placement mode
      if (e.key === "Escape") {
        if (placementUrlRef.current) { e.preventDefault(); exitPlacementMode(); }
        return;
      }

      // Delete/Backspace — delete selected object in edit mode
      if ((e.key === "Delete" || e.key === "Backspace") && inEditModeRef.current && currentSelectedId) {
        e.preventDefault();
        deleteObjRef.current?.(currentSelectedId);
        selectObject(null);
        return;
      }


      // Ctrl+C / Ctrl+V — copy/paste placed objects
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (currentSelectedId) {
          const entry = placedObjects.get(currentSelectedId);
          if (entry) clipboardObj = { ...entry.data };
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (!clipboardObj) return;
        enterPlacementMode(clipboardObj.url, clipboardObj);
        return;
      }

      const k = e.key.toLowerCase();
      if (k in keys && !e.repeat) (keys as Record<string, boolean>)[k] = true;

      // Emote selection while holding R
      if (rHeld && weaponRef.current !== "pistol") {
        if (k === "1") {
          if (character.triggerEmote("dance")) { rHeld = false; setEmoteWheelOpen(false); }
          return;
        }
        if (k === "2") {
          if (character.triggerEmote("breakdance")) { rHeld = false; setEmoteWheelOpen(false); }
          return;
        }
      }

      if (k === "1") {
        const next: Weapon = weaponRef.current === "pistol" ? "none" : "pistol";
        weaponRef.current = next;
        setWeapon(next);
      }
      if (k === "r") {
        if (weaponRef.current === "pistol") {
          triggerReload();
        } else if (!character.currentEmote) {
          rHeld = true;
          setEmoteWheelOpen(true);
        }
      }
			if (k === "q") {
				rHeld = true;
				setEmoteWheelOpen(true);
			}
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Tab") {
        setShowScoreboard(false);
        return;
      }
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k in keys) (keys as Record<string, boolean>)[k] = false;
      if (k === "r") {
        rHeld = false;
        setEmoteWheelOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ---- Mouse ----
    const mouse = new THREE.Vector2(0, 0);
		Game.mouse = mouse;
    const raycaster = new THREE.Raycaster();
		Game.raycaster = raycaster;
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		Game.groundPlane = groundPlane;
    const groundHit = new THREE.Vector3();
		Game.groundHit = groundHit;
    function onMouseMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    window.addEventListener("mousemove", onMouseMove);

    // Shoot on left-click
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (e.target !== renderer.domElement) return;
      if (gizmoPointerDown) return;

      // Floor paint mode — painting is driven by tick(); just arm the flag here
      if (floorPainter.isActive) {
        floorPainter.onMouseDown();
        return;
      }

      // Placement mode — click confirms placement
      if (placementUrlRef.current) {
        confirmPlacement();
        return;
      }

      raycaster.setFromCamera(mouse, camera);

      if (inEditModeRef.current) {
        // Edit mode — click to select (gizmo handles translation), click ground to deselect
        // Use recursive raycasting on roots so hidden hitbox meshes don't interfere,
        // then walk up the parent chain to find which root was hit.
        const placedRoots = Array.from(placedRootToId.keys());
        const hits = placedRoots.length > 0 ? raycaster.intersectObjects(placedRoots, true) : [];
        if (hits.length > 0) {
          let hitObj: THREE.Object3D | null = hits[0].object;
          while (hitObj) {
            const hitId = placedRootToId.get(hitObj);
            if (hitId) { selectObject(hitId); return; }
            hitObj = hitObj.parent;
          }
        }
        if (currentSelectedId) selectObject(null);
        return;
      }

      // Shoot
      if (weaponRef.current !== "pistol") return;
      if (isReloadingRef.current) return;
      const ws = wsRef.current;
			console.log("shot");
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return

			if (!character.root) return;
      const dx = hit.x - character.root.position.x;
      const dz = hit.z - character.root.position.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) return;
      ws.send(JSON.stringify({ type: "shoot", dirX: dx / len, dirZ: dz / len } satisfies ClientMessage));
    }
    window.addEventListener("mousedown", onMouseDown);
    function onMouseUp() { floorPainter.onMouseUp(); }
    window.addEventListener("mouseup", onMouseUp);

    // ---- Local character ----
    const character = new LocalCharacter(scene, playerName);
    let rHeld = false;

    const serverPos = new THREE.Vector3();
    let myId: string | null = null;
    const pendingRemoteStates: PlayerState[] = [];

    // ---- Placed objects ----
    interface PlacedEntry { data: PlacedObject; root: THREE.Object3D; hitboxMesh: THREE.Object3D }
    const placedObjects = new Map<string, PlacedEntry>();
    const gltfCache = new Map<string, THREE.Group>();
    const placedRootToId = new Map<THREE.Object3D, string>();
    let placementGhost: THREE.Object3D | null = null;
    let placementPreset: Partial<PlacedObject> | null = null;
    let placementHitboxes: HitboxDef[] = [];
    let currentSelectedId: string | null = null;
    let selectionBox: THREE.Box3Helper | null = null;

    // Dynamic client-side colliders for placed objects (mirroring server)
    interface DynCollider { x: number; z: number; shape: "cylinder" | "box"; radius: number; offsetX: number; offsetZ: number }
    const placedColliders = new Map<string, DynCollider>();

    // Clipboard for Ctrl+C / Ctrl+V
    let clipboardObj: PlacedObject | null = null;

    const loader = new GLTFLoader();

    character.load(() => {
      for (const p of pendingRemoteStates) applyRemoteState(p);
      pendingRemoteStates.length = 0;
    });

    // Static objects are spawned by applyMap when the server sends the map config.

function applyMap(map: MapConfig) {
	const mount = mountRef.current;
	if (!mount) return;
	const gen = ++applyMapGen;

	// Clean up previous call's scene objects so applyMap is safely re-entrant
	for (const root of mapStaticRoots) scene.remove(root);
	mapStaticRoots = [];
	for (const root of mapWaterRoots) scene.remove(root);
	mapWaterRoots = [];
	for (const root of mapDoorRoots) scene.remove(root);
	mapDoorRoots = [];
	for (const m of debugMeshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); scene.remove(m); }
	debugMeshes = [];

	// Sky gradient
	mount.style.background = `linear-gradient(180deg, ${map.environment.sky.top} 0%, ${map.environment.sky.mid} 40%, ${map.environment.sky.horizon} 100%)`;

	// Fog
	scene.fog = new THREE.Fog(new THREE.Color(map.environment.fog.color), map.environment.fog.near, map.environment.fog.far);

	// Replace lights
	for (const l of mapLights) scene.remove(l);
	mapLights = [];

	const ambient = new THREE.AmbientLight(new THREE.Color(map.environment.ambientLight.color), map.environment.ambientLight.intensity);
	scene.add(ambient);
	mapLights.push(ambient);

	const sunLight = new THREE.DirectionalLight(new THREE.Color(map.environment.sun.color), map.environment.sun.intensity);
	sunLight.position.set(map.environment.sun.x, map.environment.sun.y, map.environment.sun.z);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.set(2048, 2048);
	sunLight.shadow.camera.near = 0.5;
	sunLight.shadow.camera.far = 80;
	sunLight.shadow.camera.left = -28;
	sunLight.shadow.camera.right = 28;
	sunLight.shadow.camera.top = 28;
	sunLight.shadow.camera.bottom = -28;
	sunLight.shadow.bias = -0.001;
	scene.add(sunLight);
	mapLights.push(sunLight);

	// Ground
	if (mapGround) { scene.remove(mapGround); mapGround = null; }
	if (!map.hideGround) {
		const result = buildGround(map.groundSize, map.environment.groundColor, map.groundPaintData);
		mapGround = result.group;
		floorPainter.applyMap(result, map.groundSize, map.groundPaintData, map.environment.groundColor);
		scene.add(mapGround);
	} else {
		floorPainter.applyMap(null, 0);
	}

	// Static objects — group by URL so each GLTF is fetched once (skip collisionOnly)
	const occluders: THREE.Object3D[] = [];
	const byUrl = new Map<string, StaticObject[]>();
	for (const obj of map.staticObjects) {
		if (obj.collisionOnly) continue;
		const list = byUrl.get(obj.url) ?? [];
		list.push(obj);
		byUrl.set(obj.url, list);
	}
	for (const [url, objs] of byUrl) {
		loader.load(url, (gltf) => {
			if (gen !== applyMapGen) return; // stale — map was re-applied while this was loading
			for (const obj of objs) {
				const mesh = gltf.scene.clone(true);
				hideHitboxGroup(mesh);
				mesh.position.set(obj.x, 0, obj.z);
				mesh.rotation.y = obj.rotY;
				scene.add(mesh);
				mapStaticRoots.push(mesh);
				mesh.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						occluders.push(child);
						child.castShadow = true;
						child.receiveShadow = true;
					}
				});
			}
		});
	}

	// Water zones
	for (const zone of map.waterZones) {
		const waterGeo = new THREE.PlaneGeometry(zone.width, zone.height);
		const waterMat = new THREE.MeshBasicMaterial({
			color: 0x1a7bbf,
			transparent: true,
			opacity: 0.55,
			side: THREE.DoubleSide,
		});
		const waterMesh = new THREE.Mesh(waterGeo, waterMat);
		waterMesh.rotation.x = -Math.PI / 2;
		waterMesh.position.set(zone.x, 0.02, zone.z);
		scene.add(waterMesh);
		mapWaterRoots.push(waterMesh);
	}

	// Door trigger zones — glowing ring on ground + floating label
	for (const door of map.doors) {
		const ringGeo = new THREE.RingGeometry(door.triggerRadius - 0.12, door.triggerRadius + 0.12, 40);
		const ringMat = new THREE.MeshBasicMaterial({
			color: 0x44ffcc,
			transparent: true,
			opacity: 0.7,
			side: THREE.DoubleSide,
		});
		const ring = new THREE.Mesh(ringGeo, ringMat);
		ring.rotation.x = -Math.PI / 2;
		ring.position.set(door.x, 0.03, door.z);
		scene.add(ring);
		mapDoorRoots.push(ring);

		const labelDiv = document.createElement("div");
		labelDiv.textContent = `→ ${door.label}`;
		labelDiv.style.cssText = `
			color: #44ffcc;
			font-size: 13px;
			font-family: sans-serif;
			font-weight: 700;
			text-shadow: 0 0 8px rgba(0,255,200,0.9), 0 1px 3px rgba(0,0,0,0.8);
			pointer-events: none;
			white-space: nowrap;
			user-select: none;
		`;
		const doorLabel = new CSS2DObject(labelDiv);
		doorLabel.position.set(door.x, 2.2, door.z);
		scene.add(doorLabel);
		mapDoorRoots.push(doorLabel);
	}

	// Debug wireframes for static colliders
	for (const obj of map.staticObjects) {
		const h = obj.hitboxHeight ?? 1.0;
		const depth = obj.hitboxDepth ?? obj.hitboxRadius;
		let geo: THREE.BufferGeometry;
		if (obj.hitboxShape === "box") {
			geo = new THREE.BoxGeometry(obj.hitboxRadius * 2, h, depth * 2);
		} else if (obj.hitboxShape === "capsule") {
			geo = new THREE.CapsuleGeometry(obj.hitboxRadius, h, 4, 8);
		} else {
			geo = new THREE.CylinderGeometry(obj.hitboxRadius, obj.hitboxRadius, h, 16);
		}
		const color = obj.hitboxShape === "box" ? 0xff4400 : obj.hitboxShape === "capsule" ? 0xffaa00 : 0x00ff88;
		const mat = new THREE.MeshBasicMaterial({ color, wireframe: true });
		const dbMesh = new THREE.Mesh(geo, mat);
		dbMesh.position.set(obj.x, h / 2, obj.z);
		dbMesh.visible = debugVisible;
		scene.add(dbMesh);
		debugMeshes.push(dbMesh);
	}

	buildRapierWorld(map);
}

    // ---- Placed object helpers ----
    function loadGltfCached(url: string): Promise<THREE.Group> {
      return new Promise((resolve, reject) => {
        if (gltfCache.has(url)) { resolve(gltfCache.get(url)!.clone(true)); return; }
        loader.load(url, (gltf) => {
          gltfCache.set(url, gltf.scene.clone(true));
          resolve(gltf.scene.clone(true));
        }, undefined, (err) => {
          console.error(`[gltf] failed to load "${url}":`, err);
          reject(err);
        });
      });
    }

    function applyPlacedTransform(data: PlacedObject, root: THREE.Object3D) {
      root.position.set(data.x, 0, data.z);
      root.rotation.y = data.rotY;
      root.scale.setScalar(data.scale);
    }

    function refreshSelectionBox(root: THREE.Object3D) {
      if (selectionBox) { scene.remove(selectionBox); selectionBox = null; }
      const box = new THREE.Box3().setFromObject(root);
      selectionBox = new THREE.Box3Helper(box, 0x44ff88);
      scene.add(selectionBox);
    }

    function selectObject(id: string | null) {
      // Hide hitbox wireframe on previously selected
      if (currentSelectedId) {
        const prev = placedObjects.get(currentSelectedId);
        if (prev) prev.hitboxMesh.visible = false;
      }
      if (selectionBox) { scene.remove(selectionBox); selectionBox = null; }
      currentSelectedId = id;
      setSelectedObjId(id);
      if (id) {
        const entry = placedObjects.get(id);
        if (entry) {
          refreshSelectionBox(entry.root);
          entry.hitboxMesh.visible = true;
          setSelectedObjScale(entry.data.scale);
          setSelectedObjRotY(entry.data.rotY);
          setSelectedObjHitboxShape(entry.data.hitboxShape);
          setSelectedObjHitboxRadius(entry.data.hitboxRadius);
          setSelectedObjHitboxOffsetX(entry.data.hitboxOffsetX);
          setSelectedObjHitboxOffsetZ(entry.data.hitboxOffsetZ);
          transformControls.attach(entry.root);
        }
      } else {
        transformControls.detach();
      }
    }

    function makeHitboxMesh(data: PlacedObject): THREE.Object3D {
      const group = new THREE.Group();
      group.visible = false;
      const wireMat = () => new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 });

      if (data.hitboxes && data.hitboxes.length > 0) {
        // Multi-hitbox: one wireframe per HitboxDef, positions computed in world space
        const cos = Math.cos(data.rotY);
        const sin = Math.sin(data.rotY);
        for (const hb of data.hitboxes) {
          const wx = data.x + (hb.offsetX * cos + hb.offsetZ * sin) * data.scale;
          const wz = data.z + (-hb.offsetX * sin + hb.offsetZ * cos) * data.scale;
          const hw = hb.halfW * data.scale;
          const hd = hb.halfD * data.scale;
          const geo = hb.shape === "cylinder"
            ? new THREE.CylinderGeometry(hw, hw, 2, 16)
            : new THREE.BoxGeometry(hw * 2, 2, hd * 2);
          const mesh = new THREE.Mesh(geo, wireMat());
          mesh.position.set(wx, 1, wz);
          group.add(mesh);
        }
      } else {
        // Single hitbox fallback
        const r = data.hitboxRadius;
        const geo = data.hitboxShape === "box"
          ? new THREE.BoxGeometry(r * 2, 2, r * 2)
          : new THREE.CylinderGeometry(r, r, 2, 24);
        const mesh = new THREE.Mesh(geo, wireMat());
        mesh.position.set(data.x + (data.hitboxOffsetX ?? 0), 1, data.z + (data.hitboxOffsetZ ?? 0));
        group.add(mesh);
      }

      // Disable raycasting on all children — Three.js r184 doesn't skip invisible
      // objects during intersection, so these wireframe meshes would intercept clicks.
      group.traverse((child) => { child.raycast = () => {}; });
      return group;
    }

    function disposeHitboxMesh(obj: THREE.Object3D) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }

    function updateHitboxMesh(entry: PlacedEntry) {
      disposeHitboxMesh(entry.hitboxMesh);
      scene.remove(entry.hitboxMesh);
      entry.hitboxMesh = makeHitboxMesh(entry.data);
      scene.add(entry.hitboxMesh);
      entry.hitboxMesh.visible = currentSelectedId === entry.data.id;
    }

    async function addPlacedObject(rawData: PlacedObject) {
      if (placedObjects.has(rawData.id)) return;
      // Migrate objects saved before hitbox fields were added
      const data: PlacedObject = {
        ...rawData,
        hitboxShape: rawData.hitboxShape ?? "cylinder",
        hitboxRadius: rawData.hitboxRadius ?? 1.0,
        hitboxOffsetX: rawData.hitboxOffsetX ?? 0,
        hitboxOffsetZ: rawData.hitboxOffsetZ ?? 0,
      };
      const root = await loadGltfCached(data.url);
      hideHitboxGroup(root);
      applyPlacedTransform(data, root);
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      scene.add(root);
      const hitboxMesh = makeHitboxMesh(data);
      scene.add(hitboxMesh);
      placedObjects.set(data.id, { data, root, hitboxMesh });
      placedRootToId.set(root, data.id);
      placedColliders.set(data.id, { x: data.x, z: data.z, shape: data.hitboxShape, radius: data.hitboxRadius, offsetX: data.hitboxOffsetX, offsetZ: data.hitboxOffsetZ });
      addRapierPlacedBody(data);
    }

    function removePlacedObject(id: string) {
      const entry = placedObjects.get(id);
      if (!entry) return;
      placedRootToId.delete(entry.root);
      scene.remove(entry.root);
      disposeHitboxMesh(entry.hitboxMesh);
      scene.remove(entry.hitboxMesh);
      placedObjects.delete(id);
      placedColliders.delete(id);
      removeRapierPlacedBody(id);
      if (currentSelectedId === id) selectObject(null);
    }

    function enterPlacementMode(url: string, preset?: Partial<PlacedObject>) {
      if (placementGhost) { scene.remove(placementGhost); placementGhost = null; }
      placementUrlRef.current = url;
      placementPreset = preset ?? null;
      placementHitboxes = preset?.hitboxes ?? [];
      setInPlacementMode(true);
      loadGltfCached(url).then((root) => {
        // Extract hitboxes BEFORE applying scale/rotation so offsets are in model-local space
        if (!preset?.hitboxes) {
          placementHitboxes = extractHitboxes(root);
        }
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = Array.isArray(child.material)
              ? child.material.map((m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.45; return c; })
              : (() => { const c = (child.material as THREE.Material).clone(); (c as THREE.MeshStandardMaterial).transparent = true; (c as THREE.MeshStandardMaterial).opacity = 0.45; return c; })();
            child.material = mat;
          }
        });
        if (preset?.scale) root.scale.setScalar(preset.scale);
        if (preset?.rotY !== undefined) root.rotation.y = preset.rotY;
        placementGhost = root;
        scene.add(root);
      });
    }

    function exitPlacementMode() {
      if (placementGhost) { scene.remove(placementGhost); placementGhost = null; }
      placementUrlRef.current = null;
      placementStoreItemIdRef.current = null;
      placementPreset = null;
      placementHitboxes = [];
      setInPlacementMode(false);
      renderer.domElement.focus();
    }

    function confirmPlacement() {
      if (!placementGhost || !placementUrlRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const storeItemId = placementStoreItemIdRef.current;
      const shared = {
        x: placementGhost.position.x,
        z: placementGhost.position.z,
        rotY:          placementGhost.rotation.y,
        scale:         placementPreset?.scale         ?? 1,
        hitboxShape:   placementPreset?.hitboxShape   ?? "cylinder" as const,
        hitboxRadius:  placementPreset?.hitboxRadius  ?? 1.0,
        hitboxOffsetX: placementPreset?.hitboxOffsetX ?? 0,
        hitboxOffsetZ: placementPreset?.hitboxOffsetZ ?? 0,
        hitboxes:      placementHitboxes.length > 0 ? placementHitboxes : undefined,
      };
      if (storeItemId) {
        ws.send(JSON.stringify({ type: "placeStoreItem", itemId: storeItemId, ...shared } satisfies ClientMessage));
      } else {
        ws.send(JSON.stringify({ type: "placeObject", url: placementUrlRef.current, ...shared } satisfies ClientMessage));
      }
      exitPlacementMode();
    }

    enterPlacementModeRef.current = enterPlacementMode;
    exitPlacementModeRef.current = exitPlacementMode;

    enterStoreItemPlacementModeRef.current = (item: StoreItem) => {
      placementStoreItemIdRef.current = item.id;
      enterPlacementMode(item.model_url);
    };

    applyTransformRef.current = (id, scale, rotY, hitboxShape, hitboxRadius, hitboxOffsetX, hitboxOffsetZ) => {
      const entry = placedObjects.get(id);
      if (!entry) return;
      entry.data.scale = scale;
      entry.data.rotY = rotY;
      entry.data.hitboxShape = hitboxShape;
      entry.data.hitboxRadius = hitboxRadius;
      entry.data.hitboxOffsetX = hitboxOffsetX;
      entry.data.hitboxOffsetZ = hitboxOffsetZ;
      entry.root.scale.setScalar(scale);
      entry.root.rotation.y = rotY;
      placedColliders.set(id, { x: entry.data.x, z: entry.data.z, shape: hitboxShape, radius: hitboxRadius, offsetX: hitboxOffsetX, offsetZ: hitboxOffsetZ });
      removeRapierPlacedBody(id);
      addRapierPlacedBody(entry.data);
      updateHitboxMesh(entry);
      if (currentSelectedId === id) { refreshSelectionBox(entry.root); if (entry.hitboxMesh) entry.hitboxMesh.visible = true; }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "moveObject", id, x: entry.data.x, z: entry.data.z, rotY, scale, hitboxShape, hitboxRadius, hitboxOffsetX, hitboxOffsetZ, hitboxes: entry.data.hitboxes } satisfies ClientMessage));
      }
    };

    applyHitboxOffsetRef.current = (id, offsetX, offsetZ) => {
      const entry = placedObjects.get(id);
      if (!entry) return;
      entry.data.hitboxOffsetX = offsetX;
      entry.data.hitboxOffsetZ = offsetZ;
      // Update single-hitbox visual (multi-hitbox objects use fixed GLTF-extracted positions)
      if (!entry.data.hitboxes?.length) {
        const child = entry.hitboxMesh.children[0];
        if (child) child.position.set(entry.data.x + offsetX, 1, entry.data.z + offsetZ);
      }
      const col = placedColliders.get(id);
      if (col) { col.offsetX = offsetX; col.offsetZ = offsetZ; }
      removeRapierPlacedBody(id);
      addRapierPlacedBody(entry.data);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "moveObject", id, x: entry.data.x, z: entry.data.z, rotY: entry.data.rotY, scale: entry.data.scale, hitboxShape: entry.data.hitboxShape, hitboxRadius: entry.data.hitboxRadius, hitboxOffsetX: offsetX, hitboxOffsetZ: offsetZ, hitboxes: entry.data.hitboxes } satisfies ClientMessage));
      }
    };

    deleteObjRef.current = (id) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "deleteObject", id } satisfies ClientMessage));
      }
      removePlacedObject(id);
    };

    // ---- Remote players ----
    const remotePlayers = new Map<string, RemotePlayer>();

    function spawnRemote(id: string, state: PlayerState) {
      if (!character.tplUnarmed || !character.tplPistol) return;

      function makeRemoteModel(tpl: GltfTemplate, visible: boolean): {
        root: THREE.Object3D;
        mixer: THREE.AnimationMixer;
        walkAction: THREE.AnimationAction;
      } {
        const model = tpl.scene.clone(true);
        model.scale.setScalar(0.48);
        model.position.set(state.x, state.y, state.z);
        model.rotation.y = state.rotY;
        model.visible = visible;
        model.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
        scene.add(model);
        const mx = new THREE.AnimationMixer(model);
        const clip = tpl.animations[0]?.clone();
        let action!: THREE.AnimationAction;
        if (clip) {
          action = mx.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          action.paused = true;
          action.setEffectiveWeight(0);
        }
        return { root: model, mixer: mx, walkAction: action };
      }

      const unarmed = makeRemoteModel(character.tplUnarmed!, state.weapon !== "pistol");
      const pistol = makeRemoteModel(character.tplPistol!, state.weapon === "pistol");

      const label = makeNameLabel(state.name);
      unarmed.root.add(label);
      pistol.root.add(makeNameLabel(state.name));

      // Set up emote actions on the unarmed mixer
      let remoteDanceAction: THREE.AnimationAction | null = null;
      let remoteBreakdanceAction: THREE.AnimationAction | null = null;
      const remDanceClip = character.tplUnarmed!.animations.find((a) => a.name === "dance");
      const remBreakdanceClip = character.tplUnarmed!.animations.find((a) => a.name === "Breakdance");
      if (remDanceClip) {
        remoteDanceAction = unarmed.mixer.clipAction(remDanceClip.clone());
        remoteDanceAction.setLoop(THREE.LoopOnce, 1);
        remoteDanceAction.clampWhenFinished = true;
        remoteDanceAction.setEffectiveWeight(0);
        const da = remoteDanceAction;
        unarmed.mixer.addEventListener("finished", (e) => {
          if (e.action === da) { da.setEffectiveWeight(0); da.stop(); }
        });
      }
      if (remBreakdanceClip) {
        remoteBreakdanceAction = unarmed.mixer.clipAction(remBreakdanceClip.clone());
        remoteBreakdanceAction.setLoop(THREE.LoopRepeat, Infinity);
        remoteBreakdanceAction.setEffectiveWeight(0);
        const bda = remoteBreakdanceAction;
        unarmed.mixer.addEventListener("finished", (e) => {
          if (e.action === bda) { bda.setEffectiveWeight(0); bda.stop(); }
        });
      }

      // Set up reload on the pistol mixer
      let remoteReloadAction: THREE.AnimationAction | null = null;
      const reloadClip = character.tplPistol!.animations.find((a) => a.name === "reload");
      if (reloadClip) {
        remoteReloadAction = pistol.mixer.clipAction(reloadClip.clone());
        remoteReloadAction.setLoop(THREE.LoopOnce, 1);
        remoteReloadAction.clampWhenFinished = true;
        remoteReloadAction.setEffectiveWeight(0);
        const ra = remoteReloadAction;
        pistol.mixer.addEventListener("finished", (e) => {
          if (e.action === ra) {
            ra.setEffectiveWeight(0);
            ra.stop();
          }
        });
      }

      const remoteGhost = makeGhost();
      unarmed.root.add(remoteGhost);

      remotePlayers.set(id, {
        rootUnarmed: unarmed.root,
        rootPistol: pistol.root,
        label,
        mixerUnarmed: unarmed.mixer,
        mixerPistol: pistol.mixer,
        walkActionUnarmed: unarmed.walkAction,
        walkActionPistol: pistol.walkAction,
        danceAction: remoteDanceAction,
        breakdanceAction: remoteBreakdanceAction,
        reloadAction: remoteReloadAction,
        emote: state.emote,
        reloading: state.reloading,
        targetX: state.x,
        targetY: state.y,
        targetZ: state.z,
        targetRotY: state.rotY,
        moving: state.moving,
        weapon: state.weapon,
        health: state.health,
        dead: false,
        ghost: remoteGhost,
      });
    }

    function applyRemoteState(p: PlayerState) {
      if (!remotePlayers.has(p.id)) {
        spawnRemote(p.id, p);
        return;
      }
      const remote = remotePlayers.get(p.id)!;
      remote.targetX = p.x;
      remote.targetY = p.y;
      remote.targetZ = p.z;
      remote.targetRotY = p.rotY;
      remote.moving = p.moving;
      remote.weapon = p.weapon;
      remote.health = p.health;
      remote.emote = p.emote;
      remote.reloading = p.reloading;
      if (remote.dead && p.health > 0) remote.dead = false;
    }

    function removeRemote(id: string) {
      const remote = remotePlayers.get(id);
      if (remote) {
        remote.mixerUnarmed.stopAllAction();
        remote.mixerPistol.stopAllAction();
        // Remove the label from its parent so CSS2DRenderer drops the DOM element
        remote.rootUnarmed.remove(remote.label);
        scene.remove(remote.rootUnarmed);
        scene.remove(remote.rootPistol);
        remotePlayers.delete(id);
      }
    }

    // ---- Client-side projectiles (visual only, server is authoritative) ----
    const projectileLines = new Map<string, THREE.Line>();

    function syncProjectiles(serverProjectiles: ProjectileState[]) {
      const seen = new Set<string>();
      for (const p of serverProjectiles) {
        seen.add(p.id);
        if (!projectileLines.has(p.id)) {
          const line = makeProjectileLine();
          scene.add(line);
          projectileLines.set(p.id, line);
        }
        const line = projectileLines.get(p.id)!;
        const pos = line.geometry.attributes.position as THREE.BufferAttribute;
        const Y = 0.5;
        // tail (back of bullet)
        pos.setXYZ(0, p.x - p.dirX * BULLET_LENGTH, Y, p.z - p.dirZ * BULLET_LENGTH);
        // head
        pos.setXYZ(1, p.x, Y, p.z);
        pos.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      }
      for (const [id, line] of projectileLines) {
        if (!seen.has(id)) {
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
          scene.remove(line);
          projectileLines.delete(id);
        }
      }
    }

    // ---- Particle explosions ----
    interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3 }
    interface ParticleSystem { particles: Particle[]; age: number; duration: number }
    const particleSystems: ParticleSystem[] = [];
    const SPARK_COLORS = [0xff6600, 0xffaa00, 0xffff00, 0xff3300, 0xffffff, 0xff9900];

    function spawnExplosion(x: number, y: number, z: number) {
      const particles: Particle[] = [];
      for (let i = 0; i < 30; i++) {
        const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
        const mat = new THREE.MeshBasicMaterial({
          color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
          transparent: true,
          opacity: 1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + 0.8, z);
        const speed = 2 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        const vel = new THREE.Vector3(
          Math.cos(angle) * speed,
          1.5 + Math.random() * 5,
          Math.sin(angle) * speed,
        );
        scene.add(mesh);
        particles.push({ mesh, vel });
      }
      particleSystems.push({ particles, age: 0, duration: 1.4 });
    }

    // ---- WebSocket ----
    const ws = new WebSocket(`${SERVER_URL}?map=${currentMapId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        ws.send(JSON.stringify({ type: "join", name: playerName, userId, token: session?.access_token ?? "" } satisfies ClientMessage));
      });
    };

    ws.onmessage = (event: MessageEvent) => {
      const msg: ServerMessage = JSON.parse(event.data as string);

      if (msg.type === "handshake") {
        myId = msg.yourId;
        myIdRef.current = msg.yourId;
        applyMap(msg.map);
      }

      if (msg.type === "snapshot") {
        const seen = new Set<string>();
        for (const p of msg.players) {
          seen.add(p.id);
          if (p.id === myId) {
            serverPos.set(p.x, p.y, p.z);
            if (!rapierPlayerBody) addRapierPlayer(p.x, p.z);
            setHealth(p.health);
            setMaxHealth(p.maxHealth);
            setOnRampage(p.onRampage);
            setAmmo(p.ammo);
            if (!p.reloading && isReloadingRef.current === false) setIsReloading(false);
          } else {
            if (character.tplUnarmed && character.tplPistol) {
              applyRemoteState(p);
            } else {
              const existing = pendingRemoteStates.findIndex((s) => s.id === p.id);
              if (existing >= 0) pendingRemoteStates[existing] = p;
              else pendingRemoteStates.push(p);
            }
          }
        }
        for (const id of remotePlayers.keys()) {
          if (!seen.has(id)) removeRemote(id);
        }
        syncProjectiles(msg.projectiles);
        setScores(msg.scores);
      }

      if (msg.type === "playerLeft") removeRemote(msg.id);

      if (msg.type === "hit" && msg.targetId === myId) {
        setHealth(msg.health);
        setShowHitFlash(true);
        setTimeout(() => setShowHitFlash(false), 200);
      }

      if (msg.type === "died") {
        if (msg.targetId === myId) {
          if (character.root) spawnExplosion(character.root.position.x, character.root.position.y, character.root.position.z);
          character.setDead();
          setIsDead(true);
          setHealth(0);
          setOnRampage(false);
          setTimeout(() => {
            character.setAlive(0, 0);
            setIsDead(false);
            setHealth(MAX_HEALTH);
            setMaxHealth(MAX_HEALTH);
            serverPos.set(0, 0, 0);
            if (rapierPlayerBody) rapierPlayerBody.setNextKinematicTranslation({ x: 0, y: 0, z: 0 });
          }, 3000);
        } else {
          const remote = remotePlayers.get(msg.targetId);
          if (remote) {
            const root = remote.weapon === "pistol" ? remote.rootPistol : remote.rootUnarmed;
            spawnExplosion(root.position.x, root.position.y, root.position.z);
            remote.dead = true;
            remote.rootUnarmed.visible = false;
            remote.rootPistol.visible = false;
          }
        }
      }

      if (msg.type === "objectList") {
        for (const obj of msg.objects) addPlacedObject(obj).catch((e) => console.error("[objectList] addPlacedObject failed:", e));
      }

      if (msg.type === "objectPlaced") {
        addPlacedObject(msg.object).catch((e) => console.error("[objectPlaced] addPlacedObject failed:", e));
      }

      if (msg.type === "objectMoved") {
        const entry = placedObjects.get(msg.object.id);
        if (entry) {
          entry.data = msg.object;
          applyPlacedTransform(msg.object, entry.root);
          placedColliders.set(msg.object.id, { x: msg.object.x, z: msg.object.z, shape: msg.object.hitboxShape, radius: msg.object.hitboxRadius, offsetX: msg.object.hitboxOffsetX ?? 0, offsetZ: msg.object.hitboxOffsetZ ?? 0 });
          removeRapierPlacedBody(msg.object.id);
          addRapierPlacedBody(msg.object);
          updateHitboxMesh(entry);
          if (currentSelectedId === msg.object.id) {
            refreshSelectionBox(entry.root);
            entry.hitboxMesh.visible = true;
          }
        } else {
          addPlacedObject(msg.object);
        }
      }

      if (msg.type === "objectDeleted") {
        removePlacedObject(msg.id);
      }

      if (msg.type === "rampage") {
        const isMe = msg.playerId === myId;
        const text = isMe
          ? "🔥 YOU ARE ON A RAMPAGE!"
          : `🔥 ${msg.playerName} IS ON A RAMPAGE!`;
        setRampageAnnouncement(text);
        setTimeout(() => setRampageAnnouncement(null), 4000);
      }

      if (msg.type === "chat") {
        setChatMessages((prev) => {
          const id = ++chatIdRef.current;
          return [...prev.slice(-49), { fromName: msg.fromName, text: msg.text, id }];
        });
        setChatOpen(true);
      }

      if (msg.type === "changeMap") {
        setCurrentMapId(msg.targetMapId);
      }

      if (msg.type === "kicked") {
        setChatMessages((prev) => [...prev.slice(-49), { fromName: "System", text: "You were kicked from this home.", id: ++chatIdRef.current }]);
        setChatOpen(true);
        setCurrentMapId("forest");
      }

      if (msg.type === "inviteReceived") {
        setPendingInvite({ fromOwnerName: msg.fromOwnerName, homeRoomId: msg.homeRoomId });
      }

      if (msg.type === "inviteError") {
        setChatMessages((prev) => [...prev.slice(-49), { fromName: "System", text: msg.reason, id: ++chatIdRef.current }]);
        setChatOpen(true);
      }

      if (msg.type === "profileSync") {
        setXp(msg.xp);
        setCurrency(msg.currency);
        setLevel(msg.level);
      }

      if (msg.type === "levelUp") {
        setLevel(msg.newLevel);
        setCurrency((c) => c + msg.currencyAwarded);
        setLevelUpMsg(`Level ${msg.newLevel}! +${msg.currencyAwarded} coins`);
        setTimeout(() => setLevelUpMsg(null), 4000);
      }
    };

    // ---- Send input ----
    function sendInput(inputX: number, inputZ: number, rotY: number) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "input", x: inputX, z: inputZ, rotY,
        weapon: weaponRef.current,
        emote: character.currentEmote,
      } satisfies ClientMessage));
    }

    // ---- Animation loop ----
    let prev = performance.now();
    let rafId: number;
    let inputSendAccum = 0;
		Game.inputSendAccum = inputSendAccum;
    const INPUT_SEND_INTERVAL = 1000 / 20;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;

      const currentWeapon = weaponRef.current;

      const input = new THREE.Vector3(
        (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
        0,
        (keys.s ? 1 : 0) - (keys.w ? 1 : 0)
      );
      if (input.lengthSq() > 1) input.normalize();
      input.applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

      let rotY = character.root?.rotation.y ?? 0;
      if (character.root) {
        Game.raycaster.setFromCamera(Game.mouse, camera);
        if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
          const dx = groundHit.x - character.root.position.x;
          const dz = groundHit.z - character.root.position.z;
          if (dx * dx + dz * dz > 0.01) {
            rotY = Math.atan2(dx, dz);
            character.root.rotation.y = rotY;
          }
        }
      }

      inputSendAccum += dt * 1000;
      if (inputSendAccum >= INPUT_SEND_INTERVAL) {
        sendInput(input.x, input.z, rotY);
        inputSendAccum = 0;
      }

      const SPEED = 4;
      const root = character.root;
      if (root) {
        if (rapierController && rapierPlayerBody && rapierPlayerCollider && rapierWorld) {
          const cp = rapierPlayerBody.translation();
          // Blend server correction into the desired movement so it goes through collision detection
          const corrX = (serverPos.x - root.position.x) * 0.1;
          const corrZ = (serverPos.z - root.position.z) * 0.1;
          const desired = { x: input.x * SPEED * dt + corrX, y: 0, z: input.z * SPEED * dt + corrZ };
          rapierController.computeColliderMovement(rapierPlayerCollider, desired);
          const mv = rapierController.computedMovement();
          rapierPlayerBody.setNextKinematicTranslation({
            x: Math.max(-rapierBounds, Math.min(rapierBounds, cp.x + mv.x)),
            y: 0,
            z: Math.max(-rapierBounds, Math.min(rapierBounds, cp.z + mv.z)),
          });
          rapierWorld.step();
          const np = rapierPlayerBody.translation();
          root.position.x = np.x;
          root.position.z = np.z;
        } else {
          if (input.lengthSq() > 0) {
            root.position.x += input.x * SPEED * dt;
            root.position.z += input.z * SPEED * dt;
          }
          root.position.x += (serverPos.x - root.position.x) * 0.1;
          root.position.z += (serverPos.z - root.position.z) * 0.1;
        }
        root.position.y += (serverPos.y - root.position.y) * 0.1;
      }

      const isMoving = input.lengthSq() > 0;
      character.update({
        dt,
        isMoving,
        weapon: currentWeapon,
        inEditMode: inEditModeRef.current,
        isReloading: isReloadingRef.current,
        camera,
      });

      // Remote players
      for (const remote of remotePlayers.values()) {
        if (remote.dead) { remote.ghost.visible = false; continue; }
        // Emoting forces unarmed model
        const isPistol = !remote.emote && remote.weapon === "pistol";
        remote.rootUnarmed.visible = !isPistol;
        remote.rootPistol.visible = isPistol;

        const activeRoot = isPistol ? remote.rootPistol : remote.rootUnarmed;
        const inactiveRoot = isPistol ? remote.rootUnarmed : remote.rootPistol;

        activeRoot.position.x += (remote.targetX - activeRoot.position.x) * LERP_FACTOR;
        activeRoot.position.y += (remote.targetY - activeRoot.position.y) * LERP_FACTOR;
        activeRoot.position.z += (remote.targetZ - activeRoot.position.z) * LERP_FACTOR;
        activeRoot.rotation.y += (remote.targetRotY - activeRoot.rotation.y) * LERP_FACTOR;
        inactiveRoot.position.copy(activeRoot.position);
        inactiveRoot.rotation.copy(activeRoot.rotation);

        if (remote.emote) {
          const emoteAction = remote.emote === "breakdance" ? remote.breakdanceAction : remote.danceAction;
          if (emoteAction && emoteAction.weight === 0) {
            remote.walkActionUnarmed.setEffectiveWeight(0);
            remote.walkActionUnarmed.paused = true;
            emoteAction.reset();
            emoteAction.setEffectiveWeight(1);
            emoteAction.play();
          }
          remote.mixerUnarmed.update(dt);
        } else if (remote.reloading && isPistol) {
          if (remote.reloadAction && remote.reloadAction.weight === 0) {
            remote.walkActionPistol.setEffectiveWeight(0);
            remote.walkActionPistol.paused = true;
            remote.reloadAction.reset();
            remote.reloadAction.setEffectiveWeight(1);
            remote.reloadAction.play();
          }
          remote.mixerPistol.update(dt);
        } else {
          if (remote.danceAction && remote.danceAction.weight > 0) {
            remote.danceAction.setEffectiveWeight(0);
            remote.danceAction.stop();
          }
          if (remote.breakdanceAction && remote.breakdanceAction.weight > 0) {
            remote.breakdanceAction.setEffectiveWeight(0);
            remote.breakdanceAction.stop();
          }
          if (remote.reloadAction && remote.reloadAction.weight > 0) {
            remote.reloadAction.setEffectiveWeight(0);
            remote.reloadAction.stop();
          }
          const rWalk = isPistol ? remote.walkActionPistol : remote.walkActionUnarmed;
          const rMixer = isPistol ? remote.mixerPistol : remote.mixerUnarmed;
          if (rWalk) {
            rWalk.paused = !remote.moving;
            rWalk.setEffectiveWeight(remote.moving ? 1 : 0);
          }
          rMixer.update(dt);
        }

        // Remote player occlusion ghost
        const remoteWorldPos = new THREE.Vector3();
        (isPistol ? remote.rootPistol : remote.rootUnarmed).getWorldPosition(remoteWorldPos);
        remote.ghost.visible = isOccluded(camera, remoteWorldPos);
      }

      // Particle explosions
      for (let i = particleSystems.length - 1; i >= 0; i--) {
        const ps = particleSystems[i];
        ps.age += dt;
        const t = ps.age / ps.duration;
        if (t >= 1) {
          for (const p of ps.particles) {
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.MeshBasicMaterial).dispose();
            scene.remove(p.mesh);
          }
          particleSystems.splice(i, 1);
          continue;
        }
        for (const p of ps.particles) {
          p.vel.y -= 14 * dt;
          p.mesh.position.x += p.vel.x * dt;
          p.mesh.position.y += p.vel.y * dt;
          p.mesh.position.z += p.vel.z * dt;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        }
      }

      // Placement ghost follows cursor, Q/E rotates it
      if (placementGhost) {
        if (keys.q) placementGhost.rotation.y -= Math.PI * dt;
        if (keys.e) placementGhost.rotation.y += Math.PI * dt;
        raycaster.setFromCamera(mouse, camera);
        const ghostHit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, ghostHit)) {
          placementGhost.position.set(ghostHit.x, 0, ghostHit.z);
        }
      }

      floorPainter.update(raycaster, mouse, camera, groundPlane);


      // Follow camera
      if (character.root) {
        const offset = new THREE.Vector3(d, d * 0.816, d);
        camera.position.copy(character.root.position).add(offset);
        camera.lookAt(
          character.root.position.x,
          character.root.position.y + 0.8,
          character.root.position.z
        );
      }

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    }
    tick();

    // ---- Resize ----
    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const a = w / h;
      camera.left = (-frustum * a) / 2;
      camera.right = (frustum * a) / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      ws.close();
      wsRef.current = null;
      if (rapierController && rapierWorld) rapierWorld.removeCharacterController(rapierController);
      rapierWorld = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      character.dispose();
      floorPainter.dispose();
      renderer.dispose();
      for (const remote of remotePlayers.values()) {
        remote.mixerUnarmed.stopAllAction();
        remote.mixerPistol.stopAllAction();
        scene.remove(remote.rootUnarmed);
        scene.remove(remote.rootPistol);
      }
      for (const line of projectileLines.values()) { line.geometry.dispose(); scene.remove(line); }
      for (const m of debugMeshes) { m.geometry.dispose(); scene.remove(m); }
      for (const root of mapStaticRoots) scene.remove(root);
      for (const root of mapWaterRoots) scene.remove(root);
      for (const root of mapDoorRoots) scene.remove(root);
      for (const entry of placedObjects.values()) scene.remove(entry.root);
      if (placementGhost) scene.remove(placementGhost);
      if (selectionBox) scene.remove(selectionBox);
      inEditModeRef.current = false;
      setInEditMode(false);
      transformControls.detach();
      scene.remove(transformControls.getHelper());
      transformControls.dispose();
      for (const ps of particleSystems) {
        for (const p of ps.particles) {
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.MeshBasicMaterial).dispose();
          scene.remove(p.mesh);
        }
      }
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(labelRenderer.domElement)) mount.removeChild(labelRenderer.domElement);
    };
  }, [playerName, currentMapId, mapReloadToken]);

  // Auto-scroll chat
  const chatBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatMessages]);

  function submitChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");

    if (text === "/home") {
      setChatMessages((prev) => [...prev, { fromName: "System", text: "Travelling home...", id: ++chatIdRef.current }]);
      setCurrentMapId(`home_${userId}`);
      return;
    }
    if (text === "/hub") {
      setChatMessages((prev) => [...prev, { fromName: "System", text: "Returning to the hub...", id: ++chatIdRef.current }]);
      setCurrentMapId("forest");
      return;
    }

    sendChat(text);
  }

  const handleToggleFloorPaint = useCallback(() => {
    const painter = floorPainterRef.current;
    if (!painter) return;
    const wasActive = painter.isActive;
    painter.toggle(setInFloorPaintMode);
    // Auto-save ground paint data when exiting paint mode
    if (wasActive && painter.paintData.length > 0) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "saveGroundPaint", groundPaintData: painter.paintData } satisfies ClientMessage));
      }
    }
  }, []);

  const kickPlayer = useCallback((targetId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "kickPlayer", targetId } satisfies ClientMessage));
  }, []);

  const invitePlayer = useCallback((targetName: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "invitePlayer", targetName } satisfies ClientMessage));
  }, []);

  const handleAcceptInvite = useCallback(() => {
    setPendingInvite((inv) => {
      if (inv) setCurrentMapId(inv.homeRoomId);
      return null;
    });
  }, []);

  const handleDeclineInvite = useCallback(() => setPendingInvite(null), []);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      enterPlacementModeRef.current?.(data.url);
    } catch (err) {
      console.error("[upload]", err);
    } finally {
      setIsUploading(false);
    }
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative"
      style={{
        background: "linear-gradient(180deg, #0a3d8f 0%, #1a6ec4 20%, #3b9fef 50%, #80c8f8 78%, #d4eeff 100%)",
      }}
    >
      <GameHUD
        cursorPos={cursorPos}
        health={health}
        maxHealth={maxHealth}
        onRampage={onRampage}
        weapon={weapon}
        ammo={ammo}
        isReloading={isReloading}
        isDead={isDead}
        showHitFlash={showHitFlash}
        showScoreboard={showScoreboard}
        scores={scores}
        myIdRef={myIdRef}
        rampageAnnouncement={rampageAnnouncement}
        emoteWheelOpen={emoteWheelOpen}
        inPlacementMode={inPlacementMode}
        inEditMode={inEditMode}
        isUploading={isUploading}
        selectedObjId={selectedObjId}
        selectedObjScale={selectedObjScale}
        selectedObjRotY={selectedObjRotY}
        selectedObjHitboxShape={selectedObjHitboxShape}
        selectedObjHitboxRadius={selectedObjHitboxRadius}
        selectedObjHitboxOffsetX={selectedObjHitboxOffsetX}
        selectedObjHitboxOffsetZ={selectedObjHitboxOffsetZ}
        chatOpen={chatOpen}
        chatMessages={chatMessages}
        chatInput={chatInput}
        chatBoxRef={chatBoxRef}
        chatInputRef={chatInputRef}
        fileInputRef={fileInputRef}
        applyTransformRef={applyTransformRef}
        applyHitboxOffsetRef={applyHitboxOffsetRef}
        deleteObjRef={deleteObjRef}
        exitPlacementModeRef={exitPlacementModeRef}
        setSelectedObjScale={setSelectedObjScale}
        setSelectedObjRotY={setSelectedObjRotY}
        setSelectedObjHitboxShape={setSelectedObjHitboxShape}
        setSelectedObjHitboxRadius={setSelectedObjHitboxRadius}
        setSelectedObjHitboxOffsetX={setSelectedObjHitboxOffsetX}
        setSelectedObjHitboxOffsetZ={setSelectedObjHitboxOffsetZ}
        setChatInput={setChatInput}
        setChatOpen={setChatOpen}
        onChatSubmit={submitChat}
        onFileSelected={handleFileSelected}
        onOpenStore={() => setStoreOpen(true)}
        onOpenInventory={currentMapId === `home_${userId}` ? () => setInventoryOpen(true) : null}
        isAdmin={new Set((process.env.NEXT_PUBLIC_ADMIN_USER_IDS ?? "").split(",").filter(Boolean)).has(userId)}
        isHomeRoom={currentMapId === `home_${userId}`}
        inFloorPaintMode={inFloorPaintMode}
        onToggleFloorPaint={handleToggleFloorPaint}
        brushColor={brushColor}
        onBrushColorChange={(c) => { setBrushColor(c); if (floorPainterRef.current) floorPainterRef.current.brushColor = c; }}
        brushSize={brushSize}
        onBrushSizeChange={(s) => { setBrushSize(s); if (floorPainterRef.current) floorPainterRef.current.brushSize = s; }}
      />

      <HomeManagement
        isHomeRoom={currentMapId === `home_${userId}`}
        scores={scores}
        myIdRef={myIdRef}
        onKickPlayer={kickPlayer}
        onInvitePlayer={invitePlayer}
        pendingInvite={pendingInvite}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
      />

      <HUDProfile xp={xp} currency={currency} level={level} />

      {levelUpMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div
            className="px-6 py-2.5 rounded-2xl text-sm font-bold animate-bounce"
            style={{
              background: "linear-gradient(160deg, rgba(255,220,60,0.25) 0%, rgba(180,120,0,0.2) 100%)",
              border: "1px solid rgba(255,200,60,0.5)",
              backdropFilter: "blur(14px)",
              color: "rgba(255,230,100,0.95)",
              textShadow: "0 0 12px rgba(200,160,0,0.8)",
              boxShadow: "0 0 24px rgba(200,140,0,0.4)",
            }}
          >
            {levelUpMsg}
          </div>
        </div>
      )}

      <StoreOverlay
        open={storeOpen}
        currency={currency}
        onClose={() => setStoreOpen(false)}
        onPurchaseComplete={(newBalance) => {
          setCurrency(newBalance);
          setInventoryRefreshKey((k) => k + 1);
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "refreshInventory" } satisfies ClientMessage));
          }
        }}
      />

      {currentMapId === `home_${userId}` && (
        <InventoryPicker
          open={inventoryOpen}
          onClose={() => setInventoryOpen(false)}
          refreshKey={inventoryRefreshKey}
          onSelectItem={(item) => { enterStoreItemPlacementModeRef.current?.(item); setInventoryOpen(false); }}
        />
      )}
    </div>
  );
}
