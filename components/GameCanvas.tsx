"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { ServerMessage, ClientMessage, PlayerState, ProjectileState, Weapon, ScoreEntry } from "../server/types";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "ws://localhost:3001";
const LERP_FACTOR = 0.2;
const MAX_HEALTH = 100;

// ---------------------------------------------------------------------------
function buildGround(): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(40, 40);
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a7d44 });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  group.add(plane);
  const grid = new THREE.GridHelper(40, 40, 0x2a5d34, 0x2a5d34);
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
  reloadAction: THREE.AnimationAction | null;
  dancing: boolean;
  reloading: boolean;
  targetX: number;
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
}

// ---------------------------------------------------------------------------
export default function GameCanvas({ playerName }: Props) {
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
  const chatIdRef = useRef(0);
  const chatInputRef = useRef<HTMLInputElement>(null);

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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // ---- CSS2D label renderer ----
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
    labelRenderer.domElement.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
    mount.appendChild(labelRenderer.domElement);

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 30, 60);

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

    // ---- Lights ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(8, 16, 8);
    scene.add(sun);

    scene.add(buildGround());

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

    // ---- Input ----
    const keys = { w: false, a: false, s: false, d: false };
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab") {
        e.preventDefault();
        setShowScoreboard(true);
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
      const k = e.key.toLowerCase();
      if (k in keys) (keys as Record<string, boolean>)[k] = true;
      if (k === "1") {
        const next: Weapon = weaponRef.current === "pistol" ? "none" : "pistol";
        weaponRef.current = next;
        setWeapon(next);
      }
      if (k === "r") {
        if (weaponRef.current === "pistol") {
          triggerReload();
        } else if (!isDancing && danceAction && walkUnarmed && mixerUnarmed) {
          isDancing = true;
          walkUnarmed.setEffectiveWeight(0);
          walkUnarmed.paused = true;
          danceAction.reset();
          danceAction.setEffectiveWeight(1);
          danceAction.play();
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
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (weaponRef.current !== "pistol") return;
      if (isReloadingRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      raycaster.setFromCamera(mouse, camera);
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
    let reloadAction: THREE.AnimationAction | null = null;
    let isDancing = false;
    let localDead = false;
    let localGhostUnarmed: THREE.Mesh | null = null;
    let localGhostPistol: THREE.Mesh | null = null;
    let characterRoot: THREE.Object3D | null = null; // points to whichever model is active

    let serverPos = new THREE.Vector3();
    let myId: string | null = null;
    const pendingRemoteStates: PlayerState[] = [];

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
      if (danceClip && mixerUnarmed) {
        danceAction = mixerUnarmed.clipAction(danceClip);
        danceAction.setLoop(THREE.LoopOnce, 1);
        danceAction.clampWhenFinished = true;
        danceAction.setEffectiveWeight(0);
        // Listen for the animation finishing so we can return to idle
        mixerUnarmed.addEventListener("finished", (e) => {
          if (e.action === danceAction) {
            isDancing = false;
            danceAction!.setEffectiveWeight(0);
            danceAction!.stop();
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

    // ---- Static objects ----
    function spawnGltf(url: string, positions: [number, number][], rotations?: number[]) {
      loader.load(url, (gltf) => {
        positions.forEach(([ox, oz], i) => {
          const obj = gltf.scene.clone(true);
          obj.position.set(ox, 0, oz);
          if (rotations) obj.rotation.y = rotations[i] ?? 0;
          scene.add(obj);
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh) occluders.push(child);
          });
        });
      });
    }

    spawnGltf("/tree.gltf", [
      [-8, -8], [8, -8], [-8, 8], [8, 8],
      [0, -14], [0, 14], [-14, 0], [14, 0],
      [-12, 12], [12, -12],
    ]);

    spawnGltf("/house.gltf", [
      // Outer corners
      [-16, -16], [0, -16], [16, -16],
      [-16,   0],            [16,   0],
      [-16,  16], [0,  16], [16,  16],
      // Mid ring
      [-10, -10], [10, -10], [-10, 10], [10, 10],
      // Inner cluster
      [ -5,  -5], [ 5,  -5], [ -5,  5], [ 5,  5],
      // Corridor blockers
      [-10,   0], [10,   0], [0, -10], [0,  10],
    ], [
      0, 0, Math.PI / 2,
      Math.PI / 2, Math.PI / 2,
      Math.PI, Math.PI, Math.PI * 1.5,
      Math.PI / 4, Math.PI * 1.25, Math.PI * 0.75, Math.PI * 1.75,
      0, Math.PI / 2, Math.PI, Math.PI * 1.5,
      0, Math.PI, Math.PI / 2, Math.PI * 1.5,
    ]);

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

      // Set up dance on the unarmed mixer (only unarmed model has the clip)
      let remoteDanceAction: THREE.AnimationAction | null = null;
      const danceClip = tplUnarmed.animations.find((a) => a.name === "dance");
      if (danceClip) {
        remoteDanceAction = unarmed.mixer.clipAction(danceClip.clone());
        remoteDanceAction.setLoop(THREE.LoopOnce, 1);
        remoteDanceAction.clampWhenFinished = true;
        remoteDanceAction.setEffectiveWeight(0);
        const da = remoteDanceAction;
        unarmed.mixer.addEventListener("finished", (e) => {
          if (e.action === da) {
            da.setEffectiveWeight(0);
            da.stop();
          }
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
        reloadAction: remoteReloadAction,
        dancing: state.dancing,
        reloading: state.reloading,
        targetX: state.x,
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
      remote.targetZ = p.z;
      remote.targetRotY = p.rotY;
      remote.moving = p.moving;
      remote.weapon = p.weapon;
      remote.health = p.health;
      remote.dancing = p.dancing;
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
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", name: playerName } satisfies ClientMessage));
    };

    ws.onmessage = (event: MessageEvent) => {
      const msg: ServerMessage = JSON.parse(event.data as string);

      if (msg.type === "handshake") {
        myId = msg.yourId;
        myIdRef.current = msg.yourId;
      }

      if (msg.type === "snapshot") {
        const seen = new Set<string>();
        for (const p of msg.players) {
          seen.add(p.id);
          if (p.id === myId) {
            serverPos.set(p.x, p.y, p.z);
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
    };

    // ---- Send input ----
    function sendInput(inputX: number, inputZ: number, rotY: number) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "input", x: inputX, z: inputZ, rotY,
        weapon: weaponRef.current,
        dancing: isDancing,
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
        if (input.lengthSq() > 0) {
          characterRoot.position.x += input.x * SPEED * dt;
          characterRoot.position.z += input.z * SPEED * dt;
        }
        characterRoot.position.x += (serverPos.x - characterRoot.position.x) * 0.1;
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
      if (isDancing) {
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
        // Dancing forces unarmed model
        const isPistol = !remote.dancing && remote.weapon === "pistol";
        remote.rootUnarmed.visible = !isPistol;
        remote.rootPistol.visible = isPistol;

        const activeRoot = isPistol ? remote.rootPistol : remote.rootUnarmed;
        const inactiveRoot = isPistol ? remote.rootUnarmed : remote.rootPistol;

        activeRoot.position.x += (remote.targetX - activeRoot.position.x) * LERP_FACTOR;
        activeRoot.position.z += (remote.targetZ - activeRoot.position.z) * LERP_FACTOR;
        activeRoot.rotation.y += (remote.targetRotY - activeRoot.rotation.y) * LERP_FACTOR;
        inactiveRoot.position.copy(activeRoot.position);
        inactiveRoot.rotation.copy(activeRoot.rotation);

        if (remote.dancing) {
          if (remote.danceAction && remote.danceAction.weight === 0) {
            remote.walkActionUnarmed.setEffectiveWeight(0);
            remote.walkActionUnarmed.paused = true;
            remote.danceAction.reset();
            remote.danceAction.setEffectiveWeight(1);
            remote.danceAction.play();
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
  }, [playerName]);

  // Auto-scroll chat
  const chatBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatMessages]);

  function submitChat() {
    const text = chatInput.trim();
    if (!text) return;
    sendChat(text);
    setChatInput("");
  }

  const healthPct = Math.max(0, health / maxHealth);

  return (
    <div ref={mountRef} className="w-full h-full relative">

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
