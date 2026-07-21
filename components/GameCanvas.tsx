"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { ServerMessage, ClientMessage, Weapon, ScoreEntry, StoreItem, LogicGraph } from "../server/types";
import { supabase } from "@/lib/supabase";
import GameHUD from "./GameHUD";
import StoreOverlay from "./StoreOverlay";
import InventoryPicker from "./InventoryPicker";
import LogicPanel from "./hud/LogicPanel";
import { FloorPainter } from "./FloorPainter";
import { LocalCharacter } from "./LocalCharacter";
import { ClientPhysics } from "./game/ClientPhysics";
import { MapView } from "./game/MapView";
import { LogicView } from "./game/LogicView";
import { PlacedObjects, type SelectedObjectInfo } from "./game/PlacedObjects";
import { RemotePlayers } from "./game/RemotePlayers";
import { Projectiles } from "./game/Projectiles";
import { Explosions } from "./game/Explosions";
import type { ChatMessage } from "./hud/ChatBar";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "ws://localhost:3001";
const MAX_HEALTH = 100;
const PLAYER_SPEED = 4;
const CAMERA_FRUSTUM = 8;
const CAMERA_DIST = 10;
const INPUT_SEND_INTERVAL = 1000 / 20;

interface Props {
  playerName: string;
  userId: string;
  onSignOut: () => void;
}

export default function GameCanvas({ playerName, userId, onSignOut }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const placedRef = useRef<PlacedObjects | null>(null);
  const floorPainterRef = useRef<FloorPainter | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [health, setHealth] = useState(MAX_HEALTH);
  const [maxHealth, setMaxHealth] = useState(MAX_HEALTH);
  const [onRampage, setOnRampage] = useState(false);
  const [weapon, setWeapon] = useState<Weapon>("none");
  const [isDead, setIsDead] = useState(false);
  const [showHitFlash, setShowHitFlash] = useState(false);
  // Cursor position relative to the game viewport; null while outside it
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [ammo, setAmmo] = useState(8);
  const [isReloading, setIsReloading] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [rampageAnnouncement, setRampageAnnouncement] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [inPlacementMode, setInPlacementMode] = useState(false);
  const [currentMapId, setCurrentMapId] = useState("hub");
  const [emoteWheelOpen, setEmoteWheelOpen] = useState(false);
  const [selectedObj, setSelectedObj] = useState<SelectedObjectInfo | null>(null);
  const [xp, setXp] = useState(0);
  const [currency, setCurrency] = useState(0);
  const [level, setLevel] = useState(1);
  const [storeOpen, setStoreOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null);
  const [logicMessage, setLogicMessage] = useState<string | null>(null);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [inEditMode, setInEditMode] = useState(false);
  const [inLogicMode, setInLogicMode] = useState(false);
  const [logicGraph, setLogicGraph] = useState<LogicGraph>({ nodes: [], wires: [] });
  const [inFloorPaintMode, setInFloorPaintMode] = useState(false);
  const [brushColor, setBrushColor] = useState("#3a7d44");
  const [brushSize, setBrushSize] = useState(1);
  const [pendingInvite, setPendingInvite] = useState<{ fromOwnerName: string; homeRoomId: string } | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const chatIdRef = useRef(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const inEditModeRef = useRef(false);
  const inLogicModeRef = useRef(false);
  const logicViewRef = useRef<LogicView | null>(null);
  // One-shot: while set, the next viewport ground-click reports its world x/z here.
  const pendingWorldCaptureRef = useRef<((x: number, z: number) => void) | null>(null);
  const logicSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs that the Three.js loop reads — avoids stale closures
  const weaponRef = useRef<Weapon>("none");
  const isReloadingRef = useRef(false);

  const isHomeRoom = currentMapId === `home_${userId}`;
  const isAdmin = new Set((process.env.NEXT_PUBLIC_ADMIN_USER_IDS ?? "").split(",").filter(Boolean)).has(userId);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      setCursorPos(inside ? { x, y } : null);
    }
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const pushSystemMessage = useCallback((text: string) => {
    setChatMessages((prev) => [...prev.slice(-49), { fromName: "System", text, id: ++chatIdRef.current }]);
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

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
    labelRenderer.domElement.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
    mount.appendChild(labelRenderer.domElement);

    // ---- Scene & camera ----
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd4eeff, 30, 60);

    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.OrthographicCamera(
      (-CAMERA_FRUSTUM * aspect) / 2, (CAMERA_FRUSTUM * aspect) / 2,
      CAMERA_FRUSTUM / 2, -CAMERA_FRUSTUM / 2,
      0.1, 200
    );
    camera.position.set(CAMERA_DIST, CAMERA_DIST * 0.816, CAMERA_DIST);
    camera.lookAt(0, 0.8, 0);

    // ---- Subsystems ----
    const loader = new GLTFLoader();
    const floorPainter = new FloorPainter(scene);
    floorPainterRef.current = floorPainter;
    const mapView = new MapView(scene, loader, floorPainter, mount);
    const logicView = new LogicView(scene);
    logicViewRef.current = logicView;
    const character = new LocalCharacter(scene, playerName);
    const remotes = new RemotePlayers(scene, character);
    const projectiles = new Projectiles(scene);
    const explosions = new Explosions(scene);
    const physics: ClientPhysics = new ClientPhysics(() => placed.allData());
    const placed: PlacedObjects = new PlacedObjects({
      scene,
      loader,
      physics,
      camera,
      domElement: renderer.domElement,
      send,
      onSelectionChange: setSelectedObj,
      onPlacementModeChange: setInPlacementMode,
    });
    placedRef.current = placed;

    character.load(() => remotes.flushPending());

    const serverPos = new THREE.Vector3();
    let localPlayerId: string | null = null;
    let debugVisible = false;
    let rHeld = false;

    // Asset-free blip for the logic `playSound` effect.
    let audioCtx: AudioContext | null = null;
    function playBlip(freq: number) {
      try {
        audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const ctx = audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } catch { /* audio unavailable */ }
    }

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
        send({ type: "reload" });
      }
    }

    // ---- Keyboard ----
    const keys = { w: false, a: false, s: false, d: false, q: false, e: false };
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab") {
        // Scoreboard is always visible in the side panel; just stop focus jumps
        e.preventDefault();
        return;
      }
      if (e.key === "x" || e.key === "X") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        debugVisible = !debugVisible;
        mapView.setDebugVisible(debugVisible);
        placed.setDebugVisible(debugVisible);
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
        if (!next) placed.select(null);
        return;
      }
      if (e.key === "3" && !rHeld) {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        if (currentMapId !== `home_${userId}`) return;
        const next = !inLogicModeRef.current;
        inLogicModeRef.current = next;
        setInLogicMode(next);
        if (next) { inEditModeRef.current = false; setInEditMode(false); placed.select(null); }
        else pendingWorldCaptureRef.current = null;
        return;
      }
      if (e.key === "t" || e.key === "T") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        e.preventDefault();
        chatInputRef.current?.focus();
        return;
      }
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      if (e.key === "Escape") {
        if (placed.isPlacing) { e.preventDefault(); placed.exitPlacement(); }
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && inEditModeRef.current && placed.currentSelectedId) {
        e.preventDefault();
        placed.requestDelete(placed.currentSelectedId);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        placed.copySelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        placed.pasteClipboard();
        return;
      }

      const k = e.key.toLowerCase();
      if (k in keys && !e.repeat) (keys as Record<string, boolean>)[k] = true;

      // Emote selection while the wheel is open
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
      if (k === "f") {
        // Interact with the nearest placed object (fires its objectUsed logic triggers)
        if (!inEditModeRef.current && !inLogicModeRef.current && !placed.isPlacing) {
          send({ type: "useObject" });
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
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

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (e.target !== renderer.domElement) return;
      if (placed.isGizmoActive) return;

      // Logic-edit mode consumes viewport clicks: the only action is capturing a
      // world point for a pending node location. No shooting/selecting here.
      if (inLogicModeRef.current) {
        const capture = pendingWorldCaptureRef.current;
        if (capture) {
          raycaster.setFromCamera(mouse, camera);
          const hit = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlane, hit)) {
            pendingWorldCaptureRef.current = null;
            capture(hit.x, hit.z);
          }
        }
        return;
      }

      // Floor paint mode — painting is driven by tick(); just arm the flag here
      if (floorPainter.isActive) {
        floorPainter.onMouseDown();
        return;
      }

      if (placed.isPlacing) {
        placed.confirmPlacement();
        return;
      }

      raycaster.setFromCamera(mouse, camera);

      if (inEditModeRef.current) {
        placed.handleEditClick(raycaster);
        return;
      }

      // Shoot
      if (weaponRef.current !== "pistol") return;
      if (isReloadingRef.current) return;
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
      if (!character.root) return;
      const dx = hit.x - character.root.position.x;
      const dz = hit.z - character.root.position.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) return;
      send({ type: "shoot", dirX: dx / len, dirZ: dz / len });
    }
    window.addEventListener("mousedown", onMouseDown);
    function onMouseUp() { floorPainter.onMouseUp(); }
    window.addEventListener("mouseup", onMouseUp);

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

      switch (msg.type) {
        case "handshake":
          localPlayerId = msg.yourId;
          setMyId(msg.yourId);
          mapView.apply(msg.map);
          physics.buildWorld(msg.map);
          setLogicGraph(msg.map.logic ?? { nodes: [], wires: [] });
          break;

        case "snapshot": {
          const seen = new Set<string>();
          for (const p of msg.players) {
            seen.add(p.id);
            if (p.id === localPlayerId) {
              serverPos.set(p.x, p.y, p.z);
              if (!physics.hasPlayer) physics.addPlayer(p.x, p.z);
              setHealth(p.health);
              setMaxHealth(p.maxHealth);
              setOnRampage(p.onRampage);
              setAmmo(p.ammo);
              if (!p.reloading && isReloadingRef.current === false) setIsReloading(false);
            } else {
              remotes.applyState(p);
            }
          }
          remotes.removeAbsent(seen);
          projectiles.sync(msg.projectiles);
          setScores(msg.scores);
          break;
        }

        case "playerLeft":
          remotes.remove(msg.id);
          break;

        case "hit":
          if (msg.targetId === localPlayerId) {
            setHealth(msg.health);
            setShowHitFlash(true);
            setTimeout(() => setShowHitFlash(false), 200);
          }
          break;

        case "died":
          if (msg.targetId === localPlayerId) {
            if (character.root) explosions.spawn(character.root.position.x, character.root.position.y, character.root.position.z);
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
              physics.teleportPlayer(0, 0);
            }, 3000);
          } else {
            const pos = remotes.markDead(msg.targetId);
            if (pos) explosions.spawn(pos.x, pos.y, pos.z);
          }
          break;

        case "objectList":
          for (const obj of msg.objects) placed.add(obj).catch((e) => console.error("[objectList] add failed:", e));
          break;

        case "objectPlaced":
          placed.add(msg.object).catch((e) => console.error("[objectPlaced] add failed:", e));
          break;

        case "objectMoved":
          placed.applyServerMove(msg.object);
          break;

        case "objectDeleted":
          placed.remove(msg.id);
          break;

        case "rampage": {
          const text = msg.playerId === localPlayerId
            ? "🔥 YOU ARE ON A RAMPAGE!"
            : `🔥 ${msg.playerName} IS ON A RAMPAGE!`;
          setRampageAnnouncement(text);
          setTimeout(() => setRampageAnnouncement(null), 4000);
          break;
        }

        case "chat":
          setChatMessages((prev) => [...prev.slice(-49), { fromName: msg.fromName, text: msg.text, id: ++chatIdRef.current }]);
          break;

        case "changeMap":
          setCurrentMapId(msg.targetMapId);
          break;

        case "teleport":
          // A logic action moved us — snap local prediction across the jump.
          serverPos.set(msg.x, serverPos.y, msg.z);
          physics.teleportPlayer(msg.x, msg.z);
          if (character.root) {
            character.root.position.x = msg.x;
            character.root.position.z = msg.z;
          }
          break;

        case "logicEffect":
          if (msg.effect === "setVisible") placed.setVisible(msg.objectId, msg.visible);
          else if (msg.effect === "message") {
            setLogicMessage(msg.text);
            setTimeout(() => setLogicMessage(null), 4000);
          } else if (msg.effect === "sound") playBlip(msg.freq);
          break;

        case "kicked":
          pushSystemMessage("You were kicked from this home.");
          setCurrentMapId("hub");
          break;

        case "inviteReceived":
          setPendingInvite({ fromOwnerName: msg.fromOwnerName, homeRoomId: msg.homeRoomId });
          break;

        case "inviteError":
          pushSystemMessage(msg.reason);
          break;

        case "profileSync":
          setXp(msg.xp);
          setCurrency(msg.currency);
          setLevel(msg.level);
          break;

        case "levelUp":
          setLevel(msg.newLevel);
          setCurrency((c) => c + msg.currencyAwarded);
          setLevelUpMsg(`Level ${msg.newLevel}! +${msg.currencyAwarded} coins`);
          setTimeout(() => setLevelUpMsg(null), 4000);
          break;
      }
    };

    // ---- Animation loop ----
    let prev = performance.now();
    let rafId: number;
    let inputSendAccum = 0;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;

      const input = new THREE.Vector3(
        (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
        0,
        (keys.s ? 1 : 0) - (keys.w ? 1 : 0)
      );
      if (input.lengthSq() > 1) input.normalize();
      input.applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

      // Face the cursor
      let rotY = character.root?.rotation.y ?? 0;
      if (character.root) {
        raycaster.setFromCamera(mouse, camera);
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
        send({ type: "input", x: input.x, z: input.z, rotY, weapon: weaponRef.current, emote: character.currentEmote });
        inputSendAccum = 0;
      }

      // Movement: predicted through client physics, blending in the server correction;
      // falls back to direct movement until the physics world is ready.
      const root = character.root;
      if (root) {
        const corrX = (serverPos.x - root.position.x) * 0.1;
        const corrZ = (serverPos.z - root.position.z) * 0.1;
        const moved = physics.movePlayer(input.x * PLAYER_SPEED * dt + corrX, input.z * PLAYER_SPEED * dt + corrZ);
        if (moved) {
          root.position.x = moved.x;
          root.position.z = moved.z;
        } else {
          if (input.lengthSq() > 0) {
            root.position.x += input.x * PLAYER_SPEED * dt;
            root.position.z += input.z * PLAYER_SPEED * dt;
          }
          root.position.x += corrX;
          root.position.z += corrZ;
        }
        root.position.y += (serverPos.y - root.position.y) * 0.1;
      }

      character.update({
        dt,
        isMoving: input.lengthSq() > 0,
        weapon: weaponRef.current,
        inEditMode: inEditModeRef.current,
        isReloading: isReloadingRef.current,
        camera,
      });

      remotes.update(dt, camera);
      explosions.update(dt);
      placed.update(dt, keys.q, keys.e, raycaster, mouse, camera, groundPlane);
      floorPainter.update(raycaster, mouse, camera, groundPlane);

      // Follow camera
      if (character.root) {
        const offset = new THREE.Vector3(CAMERA_DIST, CAMERA_DIST * 0.816, CAMERA_DIST);
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
      camera.left = (-CAMERA_FRUSTUM * a) / 2;
      camera.right = (CAMERA_FRUSTUM * a) / 2;
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
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      physics.dispose();
      character.dispose();
      floorPainter.dispose();
      floorPainterRef.current = null;
      remotes.dispose();
      projectiles.dispose();
      explosions.dispose();
      placed.dispose();
      placedRef.current = null;
      mapView.dispose();
      logicView.dispose();
      logicViewRef.current = null;
      audioCtx?.close().catch(() => {});
      pendingWorldCaptureRef.current = null;
      inLogicModeRef.current = false;
      setInLogicMode(false);
      renderer.dispose();
      inEditModeRef.current = false;
      setInEditMode(false);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(labelRenderer.domElement)) mount.removeChild(labelRenderer.domElement);
    };
  }, [playerName, userId, currentMapId, send, pushSystemMessage]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatMessages]);

  // Reflect the logic graph into in-world zone/teleport markers (shown only while editing)
  useEffect(() => {
    const view = logicViewRef.current;
    if (!view) return;
    view.sync(logicGraph);
    view.setVisible(inLogicMode);
  }, [logicGraph, inLogicMode]);

  const toggleLogicMode = useCallback(() => {
    const next = !inLogicModeRef.current;
    inLogicModeRef.current = next;
    setInLogicMode(next);
    if (next) { inEditModeRef.current = false; setInEditMode(false); placedRef.current?.select(null); }
    else pendingWorldCaptureRef.current = null;
  }, []);

  const closeLogicMode = useCallback(() => {
    inLogicModeRef.current = false;
    setInLogicMode(false);
    pendingWorldCaptureRef.current = null;
  }, []);

  // Update the graph and debounce-persist it to the server (owner-gated saveLogic).
  const updateLogicGraph = useCallback((next: LogicGraph) => {
    setLogicGraph(next);
    if (logicSaveTimerRef.current) clearTimeout(logicSaveTimerRef.current);
    logicSaveTimerRef.current = setTimeout(() => { send({ type: "saveLogic", logic: next }); }, 400);
  }, [send]);

  const captureWorldPoint = useCallback((cb: (x: number, z: number) => void) => {
    pendingWorldCaptureRef.current = cb;
  }, []);

  const listPlacedObjects = useCallback(() => placedRef.current?.listObjects() ?? [], []);

  const goHome = useCallback(() => {
    pushSystemMessage("Travelling home...");
    setCurrentMapId(`home_${userId}`);
  }, [pushSystemMessage, userId]);

  const goHub = useCallback(() => {
    pushSystemMessage("Returning to the hub...");
    setCurrentMapId("hub");
  }, [pushSystemMessage]);

  function submitChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");

    if (text === "/home") { goHome(); return; }
    if (text === "/hub") { goHub(); return; }

    send({ type: "chat", text });
  }

  const handleSelectedChange = useCallback((next: SelectedObjectInfo) => {
    setSelectedObj(next);
    placedRef.current?.applyTransform(next);
  }, []);

  const handleDeleteObject = useCallback((id: string) => {
    placedRef.current?.requestDelete(id);
  }, []);

  const handleExitPlacement = useCallback(() => {
    placedRef.current?.exitPlacement();
  }, []);

  const handleToggleFloorPaint = useCallback(() => {
    const painter = floorPainterRef.current;
    if (!painter) return;
    const wasActive = painter.isActive;
    painter.toggle(setInFloorPaintMode);
    // Auto-save ground paint data when exiting paint mode
    if (wasActive && painter.paintData.length > 0) {
      send({ type: "saveGroundPaint", groundPaintData: painter.paintData });
    }
  }, [send]);

  const kickPlayer = useCallback((targetId: string) => {
    send({ type: "kickPlayer", targetId });
  }, [send]);

  const invitePlayer = useCallback((targetName: string) => {
    send({ type: "invitePlayer", targetName });
  }, [send]);

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
      placedRef.current?.enterPlacement(data.url);
    } catch (err) {
      console.error("[upload]", err);
    } finally {
      setIsUploading(false);
    }
  }, []);

  return (
    <div className="w-full h-full relative">
      <GameHUD
        mountRef={mountRef}
        playerName={playerName}
        mapId={currentMapId}
        isHomeRoom={isHomeRoom}
        isAdmin={isAdmin}
        myId={myId}
        onSignOut={onSignOut}
        cursorPos={cursorPos}
        health={health}
        maxHealth={maxHealth}
        onRampage={onRampage}
        weapon={weapon}
        ammo={ammo}
        isReloading={isReloading}
        isDead={isDead}
        xp={xp}
        currency={currency}
        level={level}
        showHitFlash={showHitFlash}
        rampageAnnouncement={rampageAnnouncement}
        levelUpMsg={levelUpMsg}
        logicMessage={logicMessage}
        emoteWheelOpen={emoteWheelOpen}
        scores={scores}
        onOpenStore={() => setStoreOpen(true)}
        onOpenInventory={isHomeRoom ? () => setInventoryOpen(true) : null}
        onGoHome={goHome}
        onGoHub={goHub}
        onKickPlayer={kickPlayer}
        onInvitePlayer={invitePlayer}
        pendingInvite={pendingInvite}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
        inPlacementMode={inPlacementMode}
        inEditMode={inEditMode}
        isUploading={isUploading}
        selectedObj={selectedObj}
        onSelectedChange={handleSelectedChange}
        onDeleteObject={handleDeleteObject}
        onExitPlacement={handleExitPlacement}
        onFileSelected={handleFileSelected}
        inLogicMode={inLogicMode}
        onToggleLogic={toggleLogicMode}
        inFloorPaintMode={inFloorPaintMode}
        onToggleFloorPaint={handleToggleFloorPaint}
        brushColor={brushColor}
        onBrushColorChange={(c) => { setBrushColor(c); if (floorPainterRef.current) floorPainterRef.current.brushColor = c; }}
        brushSize={brushSize}
        onBrushSizeChange={(s) => { setBrushSize(s); if (floorPainterRef.current) floorPainterRef.current.brushSize = s; }}
        chatMessages={chatMessages}
        chatInput={chatInput}
        chatBoxRef={chatBoxRef}
        chatInputRef={chatInputRef}
        setChatInput={setChatInput}
        onChatSubmit={submitChat}
      />

      <StoreOverlay
        open={storeOpen}
        currency={currency}
        onClose={() => setStoreOpen(false)}
        onPurchaseComplete={(newBalance) => {
          setCurrency(newBalance);
          setInventoryRefreshKey((k) => k + 1);
          send({ type: "refreshInventory" });
        }}
      />

      {isHomeRoom && (
        <InventoryPicker
          open={inventoryOpen}
          onClose={() => setInventoryOpen(false)}
          refreshKey={inventoryRefreshKey}
          onSelectItem={(item: StoreItem) => { placedRef.current?.enterStoreItemPlacement(item); setInventoryOpen(false); }}
        />
      )}

      <LogicPanel
        open={inLogicMode}
        graph={logicGraph}
        onChange={updateLogicGraph}
        onClose={closeLogicMode}
        onCaptureWorldPoint={captureWorldPoint}
        listObjects={listPlacedObjects}
      />
    </div>
  );
}
