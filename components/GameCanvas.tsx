"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { ServerMessage, ClientMessage, PlayerState, ProjectileState, Weapon } from "../server/types";

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
  const [weapon, setWeapon] = useState<Weapon>("none");
  const [isDead, setIsDead] = useState(false);
  const [showHitFlash, setShowHitFlash] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [ammo, setAmmo] = useState(8);
  const [isReloading, setIsReloading] = useState(false);
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
      if (e.key === "Enter") {
        setChatOpen((prev) => {
          if (!prev) setTimeout(() => chatInputRef.current?.focus(), 0);
          return !prev;
        });
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
      }

      if (msg.type === "snapshot") {
        const seen = new Set<string>();
        for (const p of msg.players) {
          seen.add(p.id);
          if (p.id === myId) {
            serverPos.set(p.x, p.y, p.z);
            setHealth(p.health);
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
      }

      if (msg.type === "playerLeft") removeRemote(msg.id);

      if (msg.type === "hit" && msg.targetId === myId) {
        setHealth(msg.health);
        setShowHitFlash(true);
        setTimeout(() => setShowHitFlash(false), 200);
      }

      if (msg.type === "died") {
        if (msg.targetId === myId) {
          setIsDead(true);
          setHealth(0);
          // Server respawns us after 3s; mirror that on the client
          setTimeout(() => {
            setIsDead(false);
            setHealth(MAX_HEALTH);
            if (characterRoot) characterRoot.position.set(0, 0, 0);
            serverPos.set(0, 0, 0);
          }, 3000);
        }
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
        localUnarmed.visible = !wantPistol;
        localPistol.visible = wantPistol;
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

  const healthPct = Math.max(0, health / MAX_HEALTH);

  return (
    <div ref={mountRef} className="w-full h-full relative">

      {/* Crosshair — follows cursor when pistol equipped */}
      {weapon === "pistol" && !isDead && (
        <div
          className="absolute pointer-events-none"
          style={{ left: cursorPos.x, top: cursorPos.y, transform: "translate(-50%, -50%)" }}
        >
          <div className="relative w-6 h-6">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-2 bg-white opacity-90" />
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-0.5 h-2 bg-white opacity-90" />
            <div className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-2 bg-white opacity-90" />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 h-0.5 w-2 bg-white opacity-90" />
          </div>
        </div>
      )}

      {/* Health bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
        <div className="w-48 h-3 rounded-full bg-gray-800/70 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{
              width: `${healthPct * 100}%`,
              backgroundColor: healthPct > 0.5 ? "#22c55e" : healthPct > 0.25 ? "#eab308" : "#ef4444",
            }}
          />
        </div>
        <span className="text-white text-xs font-semibold drop-shadow">{health} / {MAX_HEALTH}</span>
      </div>

      {/* Weapon slot HUD */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1 pointer-events-none">
        {weapon === "pistol" && (
          <div className="text-sm font-bold tracking-wider">
            {isReloading
              ? <span className="text-yellow-300 animate-pulse">RELOADING…</span>
              : <span className={ammo === 0 ? "text-red-400" : "text-white"}>{ammo} / 8</span>
            }
          </div>
        )}
        <div className={`w-12 h-12 rounded border-2 flex items-center justify-center text-xs font-bold
          ${weapon === "pistol" ? "border-yellow-400 bg-yellow-400/20 text-yellow-300" : "border-gray-600 bg-gray-800/50 text-gray-500"}`}>
          <span className="flex flex-col items-center gap-0.5">
            <span>GUN</span>
            <span className="text-[9px] opacity-70">[1]</span>
          </span>
        </div>
      </div>

      {/* Hit flash */}
      {showHitFlash && (
        <div className="absolute inset-0 pointer-events-none bg-red-600/30 animate-pulse" />
      )}

      {/* Death screen */}
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <div className="text-center">
            <p className="text-red-400 text-4xl font-bold drop-shadow-lg">YOU DIED</p>
            <p className="text-white text-sm mt-2 opacity-70">Respawning…</p>
          </div>
        </div>
      )}

      {/* Chat UI */}
      <div className="absolute bottom-4 left-4 w-80 flex flex-col gap-1 pointer-events-none">
        {chatOpen && (
          <div ref={chatBoxRef} className="max-h-48 overflow-y-auto flex flex-col gap-0.5 pointer-events-auto">
            {chatMessages.map((m) => (
              <div key={m.id} className="text-sm leading-snug">
                <span className="font-semibold text-blue-300">{m.fromName}: </span>
                <span className="text-white drop-shadow">{m.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pointer-events-auto">
          <input
            ref={chatInputRef}
            className={`flex-1 px-3 py-1.5 rounded text-sm bg-black/60 text-white placeholder-gray-400 outline-none transition-opacity ${chatOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            placeholder="Press Enter to chat…"
            maxLength={200}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { submitChat(); setChatOpen(false); }
              if (e.key === "Escape") { setChatOpen(false); setChatInput(""); }
            }}
          />
          {!chatOpen && (
            <button
              className="px-3 py-1.5 rounded text-xs bg-black/50 text-gray-300 hover:bg-black/70 pointer-events-auto"
              onClick={() => { setChatOpen(true); setTimeout(() => chatInputRef.current?.focus(), 0); }}
            >
              Chat [Enter]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
