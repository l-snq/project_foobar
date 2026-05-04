"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { ServerMessage, ClientMessage, PlayerState, ProjectileState, Weapon, ScoreEntry, PlacedObject, MapConfig, StaticObject, DoorConfig } from "../server/types";
import { supabase } from "@/lib/supabase";
import RAPIER from "@dimforge/rapier3d-compat";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "ws://localhost:3001";
const LERP_FACTOR = 0.2;
const MAX_HEALTH = 100;

// ---------------------------------------------------------------------------
function buildGround(size: number, colorHex: number): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshLambertMaterial({ color: colorHex });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  group.add(plane);
  const grid = new THREE.GridHelper(size, size, 0x2a5d34, 0x2a5d34);
  grid.position.y = 0.005;
  group.add(grid);
  return group;
}

function makeNameLabel(name: string, isLocal = false): CSS2DObject {
  const div = document.createElement("div");
  div.textContent = name;
  div.style.cssText = `
    color: ${isLocal ? "#7dd3fc" : "#ffffff"};
    font-size: 12px;
    font-family: sans-serif;
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6);
    pointer-events: none;
    white-space: nowrap;
    user-select: none;
  `;
  const label = new CSS2DObject(div);
  label.position.set(0, 2.2, 0);
  return label;
}

const BULLET_LENGTH = 0.6; // world units

function makeProjectileLine(): THREE.Line {
  // Two points: tail then head. Updated each frame from server state.
  const positions = new Float32Array(6); // 2 × xyz
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffdd00 });
  return new THREE.Line(geo, mat);
}

interface GltfTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

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
  const [currentMapId, setCurrentMapId] = useState("forest");
  const [emoteWheelOpen, setEmoteWheelOpen] = useState(false);
  const [mapReloadToken, setMapReloadToken] = useState(0);
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const [selectedObjScale, setSelectedObjScale] = useState(1);
  const [selectedObjRotY, setSelectedObjRotY] = useState(0);
  const [selectedObjHitboxShape, setSelectedObjHitboxShape] = useState<"cylinder" | "box">("cylinder");
  const [selectedObjHitboxRadius, setSelectedObjHitboxRadius] = useState(1);
  const [selectedObjHitboxOffsetX, setSelectedObjHitboxOffsetX] = useState(0);
  const [selectedObjHitboxOffsetZ, setSelectedObjHitboxOffsetZ] = useState(0);
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
      } satisfies ClientMessage));
    });

    // Live-update hitbox and selection box while dragging
    transformControls.addEventListener("objectChange", () => {
      if (!currentSelectedId) return;
      const entry = placedObjects.get(currentSelectedId);
      if (!entry) return;
      entry.data.x = entry.root.position.x;
      entry.data.z = entry.root.position.z;
      entry.hitboxMesh.position.set(entry.data.x + entry.data.hitboxOffsetX, 1, entry.data.z + entry.data.hitboxOffsetZ);
      const col = placedColliders.get(currentSelectedId);
      if (col) { col.x = entry.data.x; col.z = entry.data.z; }
      removeRapierPlacedBody(currentSelectedId);
      addRapierPlacedBody(entry.data);
      refreshSelectionBox(entry.root);
    });

    // ---- Occlusion ghost system ----
    // occluders: add wall/level meshes here when level geometry is introduced.
    // Currently empty, so ghosts never show (ready for when maps are added).
    const occluders: THREE.Object3D[] = [];
    const ghostOcclusionRaycaster = new THREE.Raycaster();

    function makeGhost(): THREE.Mesh {
      const geo = new THREE.CylinderGeometry(0.28, 0.28, 1.6, 10);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x44ff88,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.55,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.8;
      mesh.visible = false;
      mesh.name = "__ghost";
      return mesh;
    }

    function isOccluded(worldPos: THREE.Vector3): boolean {
      if (occluders.length === 0) return false;
      const target = worldPos.clone();
      target.y += 0.9;
      const dir = target.clone().sub(camera.position).normalize();
      const dist = camera.position.distanceTo(target);
      ghostOcclusionRaycaster.set(camera.position, dir);
      ghostOcclusionRaycaster.far = dist - 0.2;
      return ghostOcclusionRaycaster.intersectObjects(occluders, true).length > 0;
    }

    // ---- Reload ----
    function triggerReload() {
      if (isReloadingRef.current) return;
      if (!reloadAction || !walkPistol || !mixerPistol) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      isReloadingRef.current = true;
      setIsReloading(true);
      ws.send(JSON.stringify({ type: "reload" } satisfies ClientMessage));

      walkPistol.setEffectiveWeight(0);
      walkPistol.paused = true;
      reloadAction.reset();
      reloadAction.setEffectiveWeight(1);
      reloadAction.play();
    }

    // ---- Debug wireframes ----
    let debugVisible = false;
    const debugMeshes: THREE.Mesh[] = [];

    // ---- Rapier client-side prediction ----
    const RAPIER_PHH = 0.5; // player half-height
    const RAPIER_PR = 0.25; // player radius
    const RAPIER_OHH = 0.5; // object half-height
    let rapierWorld: RAPIER.World | null = null;
    let rapierPlayerBody: RAPIER.RigidBody | null = null;
    let rapierPlayerCollider: RAPIER.Collider | null = null;
    let rapierController: RAPIER.KinematicCharacterController | null = null;
    const rapierPlacedBodies = new Map<string, RAPIER.RigidBody>();
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
    }

    function addRapierPlacedBody(obj: PlacedObject) {
      if (!rapierWorld) return;
      const hx = obj.x + (obj.hitboxOffsetX ?? 0);
      const hz = obj.z + (obj.hitboxOffsetZ ?? 0);
      const body = rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hx, 0, hz));
      if (obj.hitboxShape === "box") {
        rapierWorld.createCollider(RAPIER.ColliderDesc.cuboid(obj.hitboxRadius, RAPIER_OHH, obj.hitboxRadius), body);
      } else {
        rapierWorld.createCollider(RAPIER.ColliderDesc.cylinder(RAPIER_OHH, obj.hitboxRadius), body);
      }
      rapierPlacedBodies.set(obj.id, body);
    }

    function removeRapierPlacedBody(id: string) {
      const body = rapierPlacedBodies.get(id);
      if (body && rapierWorld) {
        rapierWorld.removeRigidBody(body);
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
      if (k in keys) (keys as Record<string, boolean>)[k] = true;

      // Emote selection while holding R
      if (rHeld && weaponRef.current !== "pistol") {
        if (k === "1" && !currentEmote && danceAction && walkUnarmed && mixerUnarmed) {
          currentEmote = "dance";
          rHeld = false;
          setEmoteWheelOpen(false);
          walkUnarmed.setEffectiveWeight(0);
          walkUnarmed.paused = true;
          danceAction.reset();
          danceAction.setEffectiveWeight(1);
          danceAction.play();
          return;
        }
        if (k === "2" && !currentEmote && breakdanceAction && walkUnarmed && mixerUnarmed) {
          currentEmote = "breakdance";
          rHeld = false;
          setEmoteWheelOpen(false);
          walkUnarmed.setEffectiveWeight(0);
          walkUnarmed.paused = true;
          breakdanceAction.reset();
          breakdanceAction.setEffectiveWeight(1);
          breakdanceAction.play();
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
        } else if (!currentEmote) {
          rHeld = true;
          setEmoteWheelOpen(true);
        }
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
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHit = new THREE.Vector3();
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

      // Placement mode — click confirms placement
      if (placementUrlRef.current) {
        confirmPlacement();
        return;
      }

      raycaster.setFromCamera(mouse, camera);

      // Try to select a placed object
      const placedMeshList = Array.from(placedMeshToId.keys());
      if (placedMeshList.length > 0) {
        const hits = raycaster.intersectObjects(placedMeshList, false);
        if (hits.length > 0) {
          const hitId = placedMeshToId.get(hits[0].object);
          if (hitId) { selectObject(hitId); return; }
        }
      }

      // Deselect on ground click
      if (currentSelectedId) { selectObject(null); }

      // Shoot
      if (weaponRef.current !== "pistol") return;
      if (isReloadingRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
      if (!characterRoot) return;
      const dx = hit.x - characterRoot.position.x;
      const dz = hit.z - characterRoot.position.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) return;
      ws.send(JSON.stringify({ type: "shoot", dirX: dx / len, dirZ: dz / len } satisfies ClientMessage));
    }
    window.addEventListener("mousedown", onMouseDown);

    // ---- GLTF templates ----
    let tplUnarmed: GltfTemplate | null = null;
    let tplPistol: GltfTemplate | null = null;

    // Local player roots (one per model, swap visible)
    let localUnarmed: THREE.Object3D | null = null;
    let localPistol: THREE.Object3D | null = null;
    let mixerUnarmed: THREE.AnimationMixer | null = null;
    let mixerPistol: THREE.AnimationMixer | null = null;
    let walkUnarmed: THREE.AnimationAction | null = null;
    let walkPistol: THREE.AnimationAction | null = null;
    let danceAction: THREE.AnimationAction | null = null;
    let breakdanceAction: THREE.AnimationAction | null = null;
    let reloadAction: THREE.AnimationAction | null = null;
    let currentEmote: string | null = null;
    let rHeld = false;
    let localDead = false;
    let localGhostUnarmed: THREE.Mesh | null = null;
    let localGhostPistol: THREE.Mesh | null = null;
    let characterRoot: THREE.Object3D | null = null; // points to whichever model is active

    let serverPos = new THREE.Vector3();
    let myId: string | null = null;
    const pendingRemoteStates: PlayerState[] = [];

    // ---- Placed objects ----
    interface PlacedEntry { data: PlacedObject; root: THREE.Object3D; hitboxMesh: THREE.Mesh }
    const placedObjects = new Map<string, PlacedEntry>();
    const gltfCache = new Map<string, THREE.Group>();
    const placedMeshToId = new Map<THREE.Object3D, string>();
    let placementGhost: THREE.Object3D | null = null;
    let placementPreset: Partial<PlacedObject> | null = null;
    let currentSelectedId: string | null = null;
    let selectionBox: THREE.Box3Helper | null = null;

    // Dynamic client-side colliders for placed objects (mirroring server)
    interface DynCollider { x: number; z: number; shape: "cylinder" | "box"; radius: number; offsetX: number; offsetZ: number }
    const placedColliders = new Map<string, DynCollider>();

    // Clipboard for Ctrl+C / Ctrl+V
    let clipboardObj: PlacedObject | null = null;

    let loadedCount = 0;
    function onBothLoaded() {
      // Called once both GLTFs are ready
      for (const p of pendingRemoteStates) applyRemoteState(p);
      pendingRemoteStates.length = 0;
    }

    const loader = new GLTFLoader();

    loader.load("/lilguy.gltf", (gltf) => {
      tplUnarmed = { scene: gltf.scene.clone(true), animations: gltf.animations };

      const model = gltf.scene;
      model.scale.setScalar(0.48);
      model.visible = true;
      model.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      scene.add(model);
      localUnarmed = model;
      characterRoot = model;

      const localLabel = makeNameLabel(playerName, true);
      model.add(localLabel);
      localGhostUnarmed = makeGhost();
      model.add(localGhostUnarmed);

      mixerUnarmed = new THREE.AnimationMixer(model);
      if (gltf.animations.length > 0) {
        walkUnarmed = mixerUnarmed.clipAction(gltf.animations[0]);
        walkUnarmed.setLoop(THREE.LoopRepeat, Infinity);
        walkUnarmed.play();
        walkUnarmed.paused = true;
        walkUnarmed.setEffectiveWeight(0);
      }
      const danceClip = gltf.animations.find((a) => a.name === "dance");
      const breakdanceClip = gltf.animations.find((a) => a.name === "Breakdance");
      if (mixerUnarmed) {
        if (danceClip) {
          danceAction = mixerUnarmed.clipAction(danceClip);
          danceAction.setLoop(THREE.LoopOnce, 1);
          danceAction.clampWhenFinished = true;
          danceAction.setEffectiveWeight(0);
        }
        if (breakdanceClip) {
          breakdanceAction = mixerUnarmed.clipAction(breakdanceClip);
          breakdanceAction.setLoop(THREE.LoopRepeat, Infinity);
          breakdanceAction.setEffectiveWeight(0);
        }
        mixerUnarmed.addEventListener("finished", (e) => {
          if (e.action === danceAction || e.action === breakdanceAction) {
            currentEmote = null;
            (e.action as THREE.AnimationAction).setEffectiveWeight(0);
            (e.action as THREE.AnimationAction).stop();
            if (walkUnarmed) {
              walkUnarmed.paused = true;
              walkUnarmed.setEffectiveWeight(0);
            }
          }
        });
      }

      if (++loadedCount === 2) onBothLoaded();
    });

    loader.load("/lilguy_holding_pistol.gltf", (gltf) => {
      tplPistol = { scene: gltf.scene.clone(true), animations: gltf.animations };

      const model = gltf.scene;
      model.scale.setScalar(0.48);
      model.visible = false; // hidden until player presses 1
      model.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      scene.add(model);
      localPistol = model;
      model.add(makeNameLabel(playerName, true));
      localGhostPistol = makeGhost();
      model.add(localGhostPistol);

      mixerPistol = new THREE.AnimationMixer(model);
      if (gltf.animations.length > 0) {
        walkPistol = mixerPistol.clipAction(gltf.animations[0]);
        walkPistol.setLoop(THREE.LoopRepeat, Infinity);
        walkPistol.play();
        walkPistol.paused = true;
        walkPistol.setEffectiveWeight(0);
      }
      const reloadClip = gltf.animations.find((a) => a.name === "reload");
      if (reloadClip && mixerPistol) {
        reloadAction = mixerPistol.clipAction(reloadClip);
        reloadAction.setLoop(THREE.LoopOnce, 1);
        reloadAction.clampWhenFinished = true;
        reloadAction.setEffectiveWeight(0);
        mixerPistol.addEventListener("finished", (e) => {
          if (e.action === reloadAction) {
            reloadAction!.setEffectiveWeight(0);
            reloadAction!.stop();
            isReloadingRef.current = false;
            setIsReloading(false);
          }
        });
      }

      if (++loadedCount === 2) onBothLoaded();
    });

    // Static objects are spawned by applyMap when the server sends the map config.

    // ---- Map config application ----
    function applyMap(map: MapConfig) {
      if (!mount) return;
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
        mapGround = buildGround(map.groundSize, parseInt(map.environment.groundColor.slice(1), 16));
        mapGround.traverse((child) => { if (child instanceof THREE.Mesh) child.receiveShadow = true; });
        scene.add(mapGround);
      }

      // Static objects — group by URL so each GLTF is fetched once (skip collisionOnly)
      const byUrl = new Map<string, StaticObject[]>();
      for (const obj of map.staticObjects) {
        if (obj.collisionOnly) continue;
        const list = byUrl.get(obj.url) ?? [];
        list.push(obj);
        byUrl.set(obj.url, list);
      }
      for (const [url, objs] of byUrl) {
        loader.load(url, (gltf) => {
          for (const obj of objs) {
            const mesh = gltf.scene.clone(true);
            mesh.position.set(obj.x, 0, obj.z);
            mesh.rotation.y = obj.rotY;
            scene.add(mesh);
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
      return new Promise((resolve) => {
        if (gltfCache.has(url)) { resolve(gltfCache.get(url)!.clone(true)); return; }
        loader.load(url, (gltf) => {
          gltfCache.set(url, gltf.scene.clone(true));
          resolve(gltf.scene.clone(true));
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

    function makeHitboxMesh(data: PlacedObject): THREE.Mesh {
      const r = data.hitboxRadius;
      const geo = data.hitboxShape === "box"
        ? new THREE.BoxGeometry(r * 2, 2, r * 2)
        : new THREE.CylinderGeometry(r, r, 2, 24);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(data.x + (data.hitboxOffsetX ?? 0), 1, data.z + (data.hitboxOffsetZ ?? 0));
      mesh.visible = false;
      return mesh;
    }

    function updateHitboxMesh(entry: PlacedEntry) {
      scene.remove(entry.hitboxMesh);
      entry.hitboxMesh.geometry.dispose();
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
      applyPlacedTransform(data, root);
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      scene.add(root);
      const hitboxMesh = makeHitboxMesh(data);
      scene.add(hitboxMesh);
      placedObjects.set(data.id, { data, root, hitboxMesh });
      root.traverse((child) => placedMeshToId.set(child, data.id));
      placedColliders.set(data.id, { x: data.x, z: data.z, shape: data.hitboxShape, radius: data.hitboxRadius, offsetX: data.hitboxOffsetX, offsetZ: data.hitboxOffsetZ });
      addRapierPlacedBody(data);
    }

    function removePlacedObject(id: string) {
      const entry = placedObjects.get(id);
      if (!entry) return;
      entry.root.traverse((child) => placedMeshToId.delete(child));
      scene.remove(entry.root);
      scene.remove(entry.hitboxMesh);
      entry.hitboxMesh.geometry.dispose();
      placedObjects.delete(id);
      placedColliders.delete(id);
      removeRapierPlacedBody(id);
      if (currentSelectedId === id) selectObject(null);
    }

    function enterPlacementMode(url: string, preset?: Partial<PlacedObject>) {
      if (placementGhost) { scene.remove(placementGhost); placementGhost = null; }
      placementUrlRef.current = url;
      placementPreset = preset ?? null;
      setInPlacementMode(true);
      loadGltfCached(url).then((root) => {
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
      placementPreset = null;
      setInPlacementMode(false);
      renderer.domElement.focus();
    }

    function confirmPlacement() {
      if (!placementGhost || !placementUrlRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "placeObject",
        url: placementUrlRef.current,
        x: placementGhost.position.x,
        z: placementGhost.position.z,
        rotY:            placementGhost.rotation.y,
        scale:           placementPreset?.scale           ?? 1,
        hitboxShape:     placementPreset?.hitboxShape     ?? "cylinder",
        hitboxRadius:    placementPreset?.hitboxRadius    ?? 1.0,
        hitboxOffsetX:   placementPreset?.hitboxOffsetX   ?? 0,
        hitboxOffsetZ:   placementPreset?.hitboxOffsetZ   ?? 0,
      } satisfies ClientMessage));
      exitPlacementMode();
    }

    enterPlacementModeRef.current = enterPlacementMode;
    exitPlacementModeRef.current = exitPlacementMode;

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
        ws.send(JSON.stringify({ type: "moveObject", id, x: entry.data.x, z: entry.data.z, rotY, scale, hitboxShape, hitboxRadius, hitboxOffsetX, hitboxOffsetZ } satisfies ClientMessage));
      }
    };

    applyHitboxOffsetRef.current = (id, offsetX, offsetZ) => {
      const entry = placedObjects.get(id);
      if (!entry) return;
      entry.data.hitboxOffsetX = offsetX;
      entry.data.hitboxOffsetZ = offsetZ;
      entry.hitboxMesh.position.set(entry.data.x + offsetX, 1, entry.data.z + offsetZ);
      const col = placedColliders.get(id);
      if (col) { col.offsetX = offsetX; col.offsetZ = offsetZ; }
      removeRapierPlacedBody(id);
      addRapierPlacedBody(entry.data);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "moveObject", id, x: entry.data.x, z: entry.data.z, rotY: entry.data.rotY, scale: entry.data.scale, hitboxShape: entry.data.hitboxShape, hitboxRadius: entry.data.hitboxRadius, hitboxOffsetX: offsetX, hitboxOffsetZ: offsetZ } satisfies ClientMessage));
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
      if (!tplUnarmed || !tplPistol) return;

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

      const unarmed = makeRemoteModel(tplUnarmed, state.weapon !== "pistol");
      const pistol = makeRemoteModel(tplPistol, state.weapon === "pistol");

      const label = makeNameLabel(state.name);
      unarmed.root.add(label);
      pistol.root.add(makeNameLabel(state.name));

      // Set up emote actions on the unarmed mixer
      let remoteDanceAction: THREE.AnimationAction | null = null;
      let remoteBreakdanceAction: THREE.AnimationAction | null = null;
      const remDanceClip = tplUnarmed.animations.find((a) => a.name === "dance");
      const remBreakdanceClip = tplUnarmed.animations.find((a) => a.name === "Breakdance");
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
      const reloadClip = tplPistol.animations.find((a) => a.name === "reload");
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
            if (tplUnarmed && tplPistol) {
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
          if (characterRoot) spawnExplosion(characterRoot.position.x, characterRoot.position.y, characterRoot.position.z);
          localDead = true;
          if (localUnarmed) localUnarmed.visible = false;
          if (localPistol) localPistol.visible = false;
          setIsDead(true);
          setHealth(0);
          setOnRampage(false);
          setTimeout(() => {
            localDead = false;
            setIsDead(false);
            setHealth(MAX_HEALTH);
            setMaxHealth(MAX_HEALTH);
            if (characterRoot) characterRoot.position.set(0, 0, 0);
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
        for (const obj of msg.objects) addPlacedObject(obj);
      }

      if (msg.type === "objectPlaced") {
        addPlacedObject(msg.object);
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

      if (msg.type === "mapBaked") {
        setMapReloadToken((t) => t + 1);
      }
    };

    // ---- Send input ----
    function sendInput(inputX: number, inputZ: number, rotY: number) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "input", x: inputX, z: inputZ, rotY,
        weapon: weaponRef.current,
        emote: currentEmote,
      } satisfies ClientMessage));
    }

    // ---- Animation loop ----
    let prev = performance.now();
    let rafId: number;
    let inputSendAccum = 0;
    const INPUT_SEND_INTERVAL = 1000 / 20;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;

      // Weapon model swap for local player
      const currentWeapon = weaponRef.current;
      if (localUnarmed && localPistol) {
        const wantPistol = currentWeapon === "pistol";
        localUnarmed.visible = !localDead && !wantPistol;
        localPistol.visible = !localDead && wantPistol;
        characterRoot = wantPistol ? localPistol : localUnarmed;
        // Keep both roots at the same position
        if (localUnarmed.visible === false && localPistol) {
          localPistol.position.copy(localUnarmed.position);
          localPistol.rotation.copy(localUnarmed.rotation);
        } else if (localPistol.visible === false && localUnarmed) {
          localUnarmed.position.copy(localPistol.position);
          localUnarmed.rotation.copy(localPistol.rotation);
        }
      }

      const input = new THREE.Vector3(
        (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
        0,
        (keys.s ? 1 : 0) - (keys.w ? 1 : 0)
      );
      if (input.lengthSq() > 1) input.normalize();
      input.applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

      let rotY = characterRoot?.rotation.y ?? 0;
      if (characterRoot) {
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
          const dx = groundHit.x - characterRoot.position.x;
          const dz = groundHit.z - characterRoot.position.z;
          if (dx * dx + dz * dz > 0.01) {
            rotY = Math.atan2(dx, dz);
            characterRoot.rotation.y = rotY;
          }
        }
      }

      inputSendAccum += dt * 1000;
      if (inputSendAccum >= INPUT_SEND_INTERVAL) {
        sendInput(input.x, input.z, rotY);
        inputSendAccum = 0;
      }

      const SPEED = 4;
      if (characterRoot) {
        if (rapierController && rapierPlayerBody && rapierPlayerCollider && rapierWorld) {
          // Sync Rapier body to current Three.js position so server corrections carry over
          const rp = rapierPlayerBody.translation();
          if (Math.abs(rp.x - characterRoot.position.x) > 0.001 || Math.abs(rp.z - characterRoot.position.z) > 0.001) {
            rapierPlayerBody.setNextKinematicTranslation({ x: characterRoot.position.x, y: 0, z: characterRoot.position.z });
          }
          // Compute collision-aware movement
          const desired = { x: input.x * SPEED * dt, y: 0, z: input.z * SPEED * dt };
          rapierController.computeColliderMovement(rapierPlayerCollider, desired);
          const mv = rapierController.computedMovement();
          const cp = rapierPlayerBody.translation();
          rapierPlayerBody.setNextKinematicTranslation({
            x: Math.max(-rapierBounds, Math.min(rapierBounds, cp.x + mv.x)),
            y: 0,
            z: Math.max(-rapierBounds, Math.min(rapierBounds, cp.z + mv.z)),
          });
          rapierWorld.step();
          const np = rapierPlayerBody.translation();
          characterRoot.position.x = np.x;
          characterRoot.position.z = np.z;
        } else {
          // Fallback before Rapier is ready: simple movement
          if (input.lengthSq() > 0) {
            characterRoot.position.x += input.x * SPEED * dt;
            characterRoot.position.z += input.z * SPEED * dt;
          }
        }
        // Server correction (lerp toward authoritative position; Y handles water depth)
        characterRoot.position.x += (serverPos.x - characterRoot.position.x) * 0.1;
        characterRoot.position.y += (serverPos.y - characterRoot.position.y) * 0.1;
        characterRoot.position.z += (serverPos.z - characterRoot.position.z) * 0.1;
      }

      // Sync inactive local model position so the swap is seamless
      if (localUnarmed && localPistol) {
        const active = characterRoot!;
        const inactive = active === localUnarmed ? localPistol : localUnarmed;
        inactive.position.copy(active.position);
        inactive.rotation.copy(active.rotation);
      }

      // Local player occlusion ghost
      if (characterRoot && !localDead) {
        const worldPos = new THREE.Vector3();
        characterRoot.getWorldPosition(worldPos);
        const occluded = isOccluded(worldPos);
        if (localGhostUnarmed) localGhostUnarmed.visible = occluded && weaponRef.current !== "pistol";
        if (localGhostPistol) localGhostPistol.visible = occluded && weaponRef.current === "pistol";
      } else {
        if (localGhostUnarmed) localGhostUnarmed.visible = false;
        if (localGhostPistol) localGhostPistol.visible = false;
      }

      // Walk / dance / reload animation — drive whichever local model is active
      const isMoving = input.lengthSq() > 0;
      if (currentEmote === "breakdance" && isMoving) {
        currentEmote = null;
        if (breakdanceAction) { breakdanceAction.setEffectiveWeight(0); breakdanceAction.stop(); }
        if (walkUnarmed) { walkUnarmed.paused = false; walkUnarmed.setEffectiveWeight(1); }
      }

      if (currentEmote !== null) {
        if (mixerUnarmed) mixerUnarmed.update(dt);
      } else if (isReloadingRef.current && currentWeapon === "pistol") {
        if (mixerPistol) mixerPistol.update(dt);
      } else {
        const activeWalk = currentWeapon === "pistol" ? walkPistol : walkUnarmed;
        const activeMixer = currentWeapon === "pistol" ? mixerPistol : mixerUnarmed;
        if (activeWalk) {
          activeWalk.paused = !isMoving;
          activeWalk.setEffectiveWeight(isMoving ? 1 : 0);
        }
        if (activeMixer) activeMixer.update(dt);
      }

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
        remote.ghost.visible = isOccluded(remoteWorldPos);
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

      // Follow camera
      if (characterRoot) {
        const offset = new THREE.Vector3(d, d * 0.816, d);
        camera.position.copy(characterRoot.position).add(offset);
        camera.lookAt(
          characterRoot.position.x,
          characterRoot.position.y + 0.8,
          characterRoot.position.z
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
      window.removeEventListener("resize", onResize);
      mixerUnarmed?.stopAllAction();
      mixerPistol?.stopAllAction();
      renderer.dispose();
      for (const remote of remotePlayers.values()) {
        remote.mixerUnarmed.stopAllAction();
        remote.mixerPistol.stopAllAction();
        scene.remove(remote.rootUnarmed);
        scene.remove(remote.rootPistol);
      }
      for (const line of projectileLines.values()) { line.geometry.dispose(); scene.remove(line); }
      for (const m of debugMeshes) { m.geometry.dispose(); scene.remove(m); }
      for (const entry of placedObjects.values()) scene.remove(entry.root);
      if (placementGhost) scene.remove(placementGhost);
      if (selectionBox) scene.remove(selectionBox);
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

  const healthPct = Math.max(0, health / maxHealth);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative"
      style={{
        background: "linear-gradient(180deg, #0a3d8f 0%, #1a6ec4 20%, #3b9fef 50%, #80c8f8 78%, #d4eeff 100%)",
      }}
    >

      {/* Crosshair — follows cursor when pistol equipped */}
      {weapon === "pistol" && !isDead && (
        <div
          className="absolute pointer-events-none"
          style={{ left: cursorPos.x, top: cursorPos.y, transform: "translate(-50%, -50%)" }}
        >
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full"
              style={{ background: "#a0ffb8", boxShadow: "0 0 5px rgba(80,255,140,0.9), 0 0 10px rgba(0,200,80,0.5)" }} />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-px h-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-px h-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
            <div className="absolute top-1/2 left-0 -translate-y-1/2 h-px w-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 h-px w-2.5"
              style={{ background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" }} />
          </div>
        </div>
      )}

      {/* Health bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
        {onRampage && (
          <span
            className="text-xs font-bold tracking-widest uppercase animate-pulse"
            style={{ color: "#ffb347", textShadow: "0 0 10px rgba(255,140,0,0.8)" }}
          >
            ⚡ RAMPAGE ⚡
          </span>
        )}
        <div
          className="w-52 h-3.5 rounded-full overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(0,30,10,0.7) 0%, rgba(0,50,20,0.6) 100%)",
            border: `1px solid ${onRampage ? "rgba(255,160,50,0.55)" : "rgba(80,220,120,0.4)"}`,
            boxShadow: onRampage
              ? "0 0 10px rgba(255,120,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 0 10px rgba(0,200,80,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-150 relative overflow-hidden"
            style={{
              width: `${healthPct * 100}%`,
              background: onRampage
                ? "linear-gradient(180deg, #ffb347 0%, #e06800 100%)"
                : healthPct > 0.5
                ? "linear-gradient(180deg, #5ef5b0 0%, #00b87a 100%)"
                : healthPct > 0.25
                ? "linear-gradient(180deg, #ffe066 0%, #d4a000 100%)"
                : "linear-gradient(180deg, #ff8080 0%, #c00000 100%)",
              boxShadow: onRampage
                ? "0 0 8px rgba(255,140,0,0.7)"
                : healthPct > 0.5
                ? "0 0 8px rgba(0,220,130,0.6)"
                : "0 0 8px rgba(255,80,80,0.6)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)" }} />
          </div>
        </div>
        <span
          className="text-xs font-semibold"
          style={{
            color: onRampage ? "#ffb347" : "rgba(200,255,220,0.9)",
            textShadow: "0 1px 3px rgba(0,0,0,0.7)",
          }}
        >
          {health} / {maxHealth}
        </span>
      </div>

      {/* Weapon slot HUD */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
        {weapon === "pistol" && (
          <div
            className="px-3 py-1 rounded-xl text-sm font-bold tracking-wider"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(80,200,120,0.08) 100%)",
              border: "1px solid rgba(80,220,120,0.35)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 2px 10px rgba(0,160,60,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          >
            {isReloading
              ? <span className="animate-pulse" style={{ color: "#ffe066", textShadow: "0 0 8px rgba(255,220,0,0.7)" }}>RELOADING…</span>
              : <span style={{ color: ammo === 0 ? "#ff8080" : "rgba(200,255,220,0.95)" }}>{ammo} / 8</span>
            }
          </div>
        )}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-xs font-bold relative overflow-hidden"
          style={{
            background: weapon === "pistol"
              ? "linear-gradient(160deg, rgba(80,220,120,0.22) 0%, rgba(0,140,60,0.18) 100%)"
              : "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(40,80,50,0.08) 100%)",
            border: `1px solid ${weapon === "pistol" ? "rgba(80,220,120,0.5)" : "rgba(80,150,100,0.22)"}`,
            backdropFilter: "blur(10px)",
            boxShadow: weapon === "pistol"
              ? "0 0 16px rgba(0,200,80,0.35), inset 0 1px 0 rgba(255,255,255,0.35)"
              : "inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }}
          />
          <span
            className="relative flex flex-col items-center gap-0.5"
            style={{ color: weapon === "pistol" ? "#a0ffb8" : "rgba(150,200,160,0.45)" }}
          >
            <span>GUN</span>
            <span className="text-[9px] opacity-70">[1]</span>
          </span>
        </div>
      </div>

      {/* Emote wheel */}
      {emoteWheelOpen && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div
            className="flex gap-4 px-6 py-4 rounded-2xl"
            style={{
              background: "linear-gradient(160deg, rgba(0,20,10,0.82) 0%, rgba(0,40,20,0.75) 100%)",
              border: "1px solid rgba(80,220,120,0.35)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            {([
              { key: "1", label: "Dance" },
              { key: "2", label: "Breakdance" },
            ] as const).map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                  style={{
                    background: "linear-gradient(180deg, rgba(80,220,120,0.3) 0%, rgba(30,120,60,0.3) 100%)",
                    border: "1px solid rgba(80,220,120,0.5)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                    color: "#a0ffb8",
                  }}
                >
                  {key}
                </div>
                <span className="text-xs font-semibold" style={{ color: "rgba(180,255,200,0.8)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rampage announcement */}
      {rampageAnnouncement && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <div
            className="font-black text-xl px-7 py-3 rounded-2xl tracking-wide animate-bounce text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(255,180,50,0.28) 0%, rgba(200,80,0,0.22) 100%)",
              border: "1px solid rgba(255,180,50,0.5)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 0 30px rgba(255,140,0,0.5), inset 0 1px 0 rgba(255,255,255,0.35)",
              color: "#ffe0a0",
              textShadow: "0 0 15px rgba(255,160,0,0.8)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
            <span className="relative">{rampageAnnouncement}</span>
          </div>
        </div>
      )}

      {/* Hit flash */}
      {showHitFlash && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 25%, rgba(220,0,0,0.5) 100%)" }}
        />
      )}

      {/* Scoreboard — hold Tab */}
      {showScoreboard && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="rounded-3xl px-7 py-5 min-w-72 relative overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(255,255,255,0.18) 0%, rgba(60,180,100,0.1) 100%)",
              border: "1px solid rgba(255,255,255,0.3)",
              backdropFilter: "blur(22px)",
              boxShadow: "0 8px 40px rgba(0,120,50,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-3xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
            <h2
              className="relative text-center text-lg font-bold mb-3 tracking-widest uppercase"
              style={{ color: "#a0ffb8", textShadow: "0 0 15px rgba(0,220,100,0.6)" }}
            >
              Scoreboard
            </h2>
            <table className="relative w-full text-sm">
              <thead>
                <tr style={{ color: "rgba(150,230,180,0.7)", borderBottom: "1px solid rgba(80,200,120,0.25)" }}>
                  <th className="text-left pb-1 font-semibold">Player</th>
                  <th className="text-center pb-1 font-semibold w-16">Kills</th>
                  <th className="text-center pb-1 font-semibold w-16">Deaths</th>
                </tr>
              </thead>
              <tbody>
                {[...scores]
                  .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
                  .map((s) => (
                    <tr key={s.id} style={{ color: s.id === myIdRef.current ? "#7effc0" : "rgba(220,255,235,0.9)" }}>
                      <td className="py-0.5">{s.name}</td>
                      <td className="text-center font-bold" style={{ color: "#5ef5a0" }}>{s.kills}</td>
                      <td className="text-center" style={{ color: "#ff8080" }}>{s.deaths}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="relative text-xs text-center mt-3" style={{ color: "rgba(150,220,170,0.5)" }}>Hold Tab to view</p>
          </div>
        </div>
      )}

      {/* Death screen */}
      {isDead && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,30,0.72) 100%)" }}
        >
          <div
            className="text-center px-10 py-7 rounded-3xl relative overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(200,30,30,0.22) 0%, rgba(80,0,0,0.32) 100%)",
              border: "1px solid rgba(255,100,100,0.35)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 0 50px rgba(200,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-3xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />
            <p
              className="relative text-4xl font-bold"
              style={{ color: "#ff8080", textShadow: "0 0 25px rgba(255,80,80,0.8), 0 2px 6px rgba(0,0,0,0.7)" }}
            >
              YOU DIED
            </p>
            <p className="relative text-sm mt-2" style={{ color: "rgba(200,255,220,0.6)" }}>Respawning…</p>
          </div>
        </div>
      )}

      {/* Import model button + placement mode + bake */}
      <div className="absolute bottom-54 right-4 flex flex-col items-end gap-2 pointer-events-auto">
        {inPlacementMode ? (
          <div className="flex flex-col items-end gap-2">
            <div
              className="px-4 py-2 rounded-xl text-sm font-semibold animate-pulse"
              style={{
                background: "linear-gradient(160deg, rgba(80,220,120,0.22) 0%, rgba(0,140,60,0.18) 100%)",
                border: "1px solid rgba(80,220,120,0.5)",
                backdropFilter: "blur(10px)",
                color: "#a0ffb8",
                textShadow: "0 0 8px rgba(0,220,100,0.6)",
                boxShadow: "0 0 16px rgba(0,200,80,0.3)",
              }}
            >
              Click to place · Q/E to rotate · Esc to cancel
            </div>
            <button
              className="px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: "linear-gradient(160deg, rgba(255,80,80,0.2) 0%, rgba(180,0,0,0.15) 100%)",
                border: "1px solid rgba(255,100,100,0.4)",
                backdropFilter: "blur(10px)",
                color: "#ff9090",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onClick={() => exitPlacementModeRef.current?.()}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-2">
            <button
              className="px-3 py-2 rounded-xl text-sm font-semibold relative overflow-hidden disabled:opacity-50"
              style={{
                background: "linear-gradient(160deg, rgba(255,255,255,0.15) 0%, rgba(60,180,100,0.1) 100%)",
                border: "1px solid rgba(80,220,120,0.35)",
                backdropFilter: "blur(10px)",
                color: "rgba(200,255,220,0.9)",
                boxShadow: "0 2px 10px rgba(0,160,60,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)" }} />
              <span className="relative">{isUploading ? "Uploading…" : "Import Model"}</span>
            </button>
            <button
              className="px-3 py-2 rounded-xl text-sm font-semibold relative overflow-hidden"
              style={{
                background: "linear-gradient(160deg, rgba(255,220,80,0.18) 0%, rgba(180,120,0,0.12) 100%)",
                border: "1px solid rgba(255,200,60,0.4)",
                backdropFilter: "blur(10px)",
                color: "rgba(255,230,120,0.95)",
                boxShadow: "0 2px 10px rgba(200,140,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
              onClick={() => {
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "bakeMap" } satisfies ClientMessage));
                }
              }}
            >
              <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />
              <span className="relative">Bake to Map</span>
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gltf,.glb"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
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
        }}
      />

      {/* Object selection panel */}
      {selectedObjId && (
        <div
          className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-3 p-4 rounded-2xl w-52 pointer-events-auto overflow-hidden"
          style={{
            background: "linear-gradient(160deg, rgba(255,255,255,0.16) 0%, rgba(60,180,100,0.09) 100%)",
            border: "1px solid rgba(255,255,255,0.28)",
            backdropFilter: "blur(18px)",
            boxShadow: "0 8px 30px rgba(0,120,50,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
          }}
        >
          <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-2xl pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)" }} />

          <p className="relative text-xs font-bold tracking-widest uppercase"
            style={{ color: "#a0ffb8", textShadow: "0 0 8px rgba(0,220,100,0.5)" }}>
            Object
          </p>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Scale: {selectedObjScale.toFixed(2)}x
            </label>
            <input
              type="range" min="0.1" max="5" step="0.05"
              value={selectedObjScale}
              className="w-full accent-green-400"
              onChange={(e) => {
                const s = parseFloat(e.target.value);
                setSelectedObjScale(s);
                applyTransformRef.current?.(selectedObjId, s, selectedObjRotY, selectedObjHitboxShape, selectedObjHitboxRadius, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Rotation: {Math.round(((selectedObjRotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI)}°
            </label>
            <input
              type="range" min="0" max="360" step="1"
              value={Math.round(((selectedObjRotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI)}
              className="w-full accent-green-400"
              onChange={(e) => {
                const r = parseFloat(e.target.value) * Math.PI / 180;
                setSelectedObjRotY(r);
                applyTransformRef.current?.(selectedObjId, selectedObjScale, r, selectedObjHitboxShape, selectedObjHitboxRadius, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox shape
            </label>
            <div className="flex gap-2">
              {(["cylinder", "box"] as const).map((shape) => (
                <button
                  key={shape}
                  className="flex-1 py-1 rounded-lg text-xs font-bold capitalize"
                  style={{
                    background: selectedObjHitboxShape === shape ? "rgba(80,220,120,0.3)" : "rgba(80,220,120,0.08)",
                    border: `1px solid ${selectedObjHitboxShape === shape ? "rgba(80,220,120,0.7)" : "rgba(80,220,120,0.25)"}`,
                    color: selectedObjHitboxShape === shape ? "#a0ffb8" : "rgba(200,255,220,0.6)",
                  }}
                  onClick={() => {
                    setSelectedObjHitboxShape(shape);
                    applyTransformRef.current?.(selectedObjId, selectedObjScale, selectedObjRotY, shape, selectedObjHitboxRadius, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
                  }}
                >
                  {shape}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox size: {selectedObjHitboxRadius.toFixed(2)}
            </label>
            <input
              type="range" min="0.1" max="8" step="0.05"
              value={selectedObjHitboxRadius}
              className="w-full accent-yellow-400"
              onChange={(e) => {
                const r = parseFloat(e.target.value);
                setSelectedObjHitboxRadius(r);
                applyTransformRef.current?.(selectedObjId, selectedObjScale, selectedObjRotY, selectedObjHitboxShape, r, selectedObjHitboxOffsetX, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox offset X: {selectedObjHitboxOffsetX.toFixed(2)}
            </label>
            <input
              type="range" min="-5" max="5" step="0.1"
              value={selectedObjHitboxOffsetX}
              className="w-full accent-yellow-400"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSelectedObjHitboxOffsetX(v);
                applyHitboxOffsetRef.current?.(selectedObjId, v, selectedObjHitboxOffsetZ);
              }}
            />
          </div>

          <div className="relative flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
              Hitbox offset Z: {selectedObjHitboxOffsetZ.toFixed(2)}
            </label>
            <input
              type="range" min="-5" max="5" step="0.1"
              value={selectedObjHitboxOffsetZ}
              className="w-full accent-yellow-400"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSelectedObjHitboxOffsetZ(v);
                applyHitboxOffsetRef.current?.(selectedObjId, selectedObjHitboxOffsetX, v);
              }}
            />
          </div>

          <button
            className="relative py-1.5 rounded-xl text-sm font-bold mt-1"
            style={{
              background: "linear-gradient(180deg, rgba(255,80,80,0.25) 0%, rgba(180,0,0,0.2) 100%)",
              border: "1px solid rgba(255,100,100,0.4)",
              color: "#ff9090",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            onClick={() => deleteObjRef.current?.(selectedObjId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Chat UI */}
      <div className="absolute bottom-4 left-4 w-80 flex flex-col gap-1.5 pointer-events-none">
        {chatOpen && (
          <div
            ref={chatBoxRef}
            className="max-h-48 overflow-y-auto flex flex-col gap-0.5 rounded-2xl px-3 py-2 pointer-events-auto"
            style={{
              background: "linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(60,180,100,0.07) 100%)",
              border: "1px solid rgba(255,255,255,0.2)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 4px 20px rgba(0,120,50,0.3), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {chatMessages.map((m) => (
              <div key={m.id} className="text-sm leading-snug">
                <span className="font-semibold" style={{ color: "#7effc0" }}>{m.fromName}: </span>
                <span style={{ color: "rgba(220,255,235,0.9)" }}>{m.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pointer-events-auto">
          <input
            ref={chatInputRef}
            className={`flex-1 px-3 py-1.5 rounded-xl text-sm outline-none transition-opacity ${chatOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{
              background: "linear-gradient(180deg, rgba(0,30,10,0.6) 0%, rgba(0,50,20,0.5) 100%)",
              border: "1px solid rgba(80,220,120,0.35)",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.1)",
              color: "rgba(220,255,235,0.95)",
            }}
            placeholder="Press T to chat…"
            maxLength={200}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.nativeEvent.stopImmediatePropagation(); submitChat(); setChatOpen(false); chatInputRef.current?.blur(); }
              if (e.key === "Escape") { e.nativeEvent.stopImmediatePropagation(); setChatOpen(false); setChatInput(""); chatInputRef.current?.blur(); }
            }}
          />
          {!chatOpen && (
            <button
              className="px-3 py-1.5 rounded-xl text-xs pointer-events-auto relative overflow-hidden"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(60,180,100,0.1) 100%)",
                border: "1px solid rgba(80,220,120,0.35)",
                backdropFilter: "blur(10px)",
                color: "rgba(200,255,220,0.8)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
              onClick={() => { setChatOpen(true); setTimeout(() => chatInputRef.current?.focus(), 0); }}
            >
              Chat [T]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
