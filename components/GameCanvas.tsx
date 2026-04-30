"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ServerMessage, ClientMessage, PlayerState } from "../server/types";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "ws://localhost:3001";
const LERP_FACTOR = 0.2;

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

interface RemotePlayer {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  walkAction: THREE.AnimationAction;
  targetX: number;
  targetZ: number;
  targetRotY: number;
  moving: boolean;
}

// ---------------------------------------------------------------------------
export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 30, 60);

    // ---- Camera ----
    const aspect = mount.clientWidth / mount.clientHeight;
    const frustum = 8;
    const camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      200
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

    // ---- Input ----
    const keys = { w: false, a: false, s: false, d: false };
    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k in keys) (keys as Record<string, boolean>)[k] = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k in keys) (keys as Record<string, boolean>)[k] = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ---- Mouse → ground direction ----
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

    // ---- GLTF loader — shared, loaded once ----
    // We keep a reference to the loaded GLTF so remote players can clone it.
    let gltfTemplate: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let walkAction: THREE.AnimationAction | null = null;
    let characterRoot: THREE.Object3D | null = null;
    let serverPos = new THREE.Vector3();
    let myId: string | null = null;

    // Queued remote states that arrived before the GLTF finished loading
    const pendingRemoteStates: PlayerState[] = [];

    const loader = new GLTFLoader();
    loader.load("/lilguy.gltf", (gltf) => {
      gltfTemplate = { scene: gltf.scene, animations: gltf.animations };

      // Local player
      const model = gltf.scene;
      model.scale.setScalar(0.48);
      scene.add(model);
      characterRoot = model;

      if (gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        walkAction = mixer.clipAction(gltf.animations[0]);
        walkAction.setLoop(THREE.LoopRepeat, Infinity);
        walkAction.play();
        walkAction.paused = true;
        walkAction.setEffectiveWeight(0);
      }

      // Flush any remote states that arrived while we were loading
      for (const p of pendingRemoteStates) {
        applyRemoteState(p);
      }
      pendingRemoteStates.length = 0;
    });

    // ---- Remote players ----
    const remotePlayers = new Map<string, RemotePlayer>();

    function spawnRemote(id: string, state: PlayerState) {
      if (!gltfTemplate) return;

      const model = gltfTemplate.scene.clone(true);
      model.scale.setScalar(0.48);
      model.position.set(state.x, state.y, state.z);
      model.rotation.y = state.rotY;
      scene.add(model);

      const remoteMixer = new THREE.AnimationMixer(model);
      // Clone the clip so it runs independently of the local player's mixer
      const clip = gltfTemplate.animations[0].clone();
      const action = remoteMixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.paused = true;
      action.setEffectiveWeight(0);

      remotePlayers.set(id, {
        root: model,
        mixer: remoteMixer,
        walkAction: action,
        targetX: state.x,
        targetZ: state.z,
        targetRotY: state.rotY,
        moving: state.moving,
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
    }

    function removeRemote(id: string) {
      const remote = remotePlayers.get(id);
      if (remote) {
        remote.mixer.stopAllAction();
        scene.remove(remote.root);
        remotePlayers.delete(id);
      }
    }

    // ---- WebSocket ----
    const ws = new WebSocket(SERVER_URL);

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
          } else {
            if (gltfTemplate) {
              applyRemoteState(p);
            } else {
              // Buffer until the model is ready; overwrite duplicates
              const existing = pendingRemoteStates.findIndex((s) => s.id === p.id);
              if (existing >= 0) pendingRemoteStates[existing] = p;
              else pendingRemoteStates.push(p);
            }
          }
        }
        for (const id of remotePlayers.keys()) {
          if (!seen.has(id)) removeRemote(id);
        }
      }

      if (msg.type === "playerLeft") {
        removeRemote(msg.id);
      }
    };

    // ---- Send input to server ----
    function sendInput(inputX: number, inputZ: number, rotY: number) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const msg: ClientMessage = { type: "input", x: inputX, z: inputZ, rotY };
      ws.send(JSON.stringify(msg));
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

      // WASD → world-space input, camera-relative via applyAxisAngle (matches original)
      const input = new THREE.Vector3(
        (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
        0,
        (keys.s ? 1 : 0) - (keys.w ? 1 : 0)
      );
      if (input.lengthSq() > 1) input.normalize();
      input.applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

      // Facing direction from mouse
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

      // Send input at 20Hz
      inputSendAccum += dt * 1000;
      if (inputSendAccum >= INPUT_SEND_INTERVAL) {
        sendInput(input.x, input.z, rotY);
        inputSendAccum = 0;
      }

      // Client-side prediction + server reconciliation
      const SPEED = 4;
      if (characterRoot) {
        if (input.lengthSq() > 0) {
          characterRoot.position.x += input.x * SPEED * dt;
          characterRoot.position.z += input.z * SPEED * dt;
        }
        characterRoot.position.x += (serverPos.x - characterRoot.position.x) * 0.1;
        characterRoot.position.z += (serverPos.z - characterRoot.position.z) * 0.1;
      }

      // Local walk animation
      const isMoving = input.lengthSq() > 0;
      if (walkAction) {
        walkAction.paused = !isMoving;
        walkAction.setEffectiveWeight(isMoving ? 1 : 0);
      }
      if (mixer) mixer.update(dt);

      // Remote players: lerp position/rotation, drive animation
      for (const remote of remotePlayers.values()) {
        remote.root.position.x += (remote.targetX - remote.root.position.x) * LERP_FACTOR;
        remote.root.position.z += (remote.targetZ - remote.root.position.z) * LERP_FACTOR;
        remote.root.rotation.y += (remote.targetRotY - remote.root.rotation.y) * LERP_FACTOR;

        remote.walkAction.paused = !remote.moving;
        remote.walkAction.setEffectiveWeight(remote.moving ? 1 : 0);
        remote.mixer.update(dt);
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
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      ws.close();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      mixer?.stopAllAction();
      renderer.dispose();
      for (const remote of remotePlayers.values()) {
        remote.mixer.stopAllAction();
        scene.remove(remote.root);
      }
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
