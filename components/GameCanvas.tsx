"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

enum PlayerWeapon {
	Pistol,
	Rifle,
	Smg,
	Shotgun,
}
// ---------------------------------------------------------------------------
// Ground grid
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

// ---------------------------------------------------------------------------
export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 30, 60);

    // Isometric orthographic camera
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

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(8, 16, 8);
    scene.add(sun);

    // Ground
    scene.add(buildGround());

    // WASD input
    const keys = { w: false, a: false, s: false, d: false};
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

    // Mouse → ground plane direction
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

    // GLTF character + animation mixer
    let mixer: THREE.AnimationMixer | null = null;
    let walkAction: THREE.AnimationAction | null = null;
    let characterRoot: THREE.Object3D | null = null;

		let velocity = new THREE.Vector3();
		const speed = 4;

    const loader = new GLTFLoader();
    loader.load("/lilguy.gltf", (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(0.48);
      scene.add(model);
      characterRoot = model;

      if (gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        walkAction = mixer.clipAction(gltf.animations[0]);
        walkAction.setLoop(THREE.LoopRepeat, Infinity);
        // Start paused — will play only while WASD is held
        walkAction.play();
        walkAction.paused = true;
				walkAction.setEffectiveWeight(0);
      }
    });

    // Animation loop
    let prev = performance.now();
    let rafId: number;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;

      const isMoving = keys.w || keys.a || keys.s || keys.d;

      // Drive walk animation only while moving
			const input = new THREE.Vector3(
				(keys.d ? 1 : 0) - (keys.a ? 1 : 0),
				0,
				(keys.s ? 1 : 0) - (keys.w ? 1 : 0),
			)

			if (input.lengthSq() > 0) {
				input.normalize();

				//make hte movement relative to camera
				input.applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);

				// velocity smoothing
				const targetVelocity = input.multiplyScalar(speed);
				velocity.lerp(targetVelocity, 10 * dt);

				// apply the movement
				if (characterRoot) {
					characterRoot.position.addScaledVector(velocity, dt);
				}

				// animation blending
				if (walkAction) {
					if (isMoving) {
						walkAction.paused = false;
						walkAction.setEffectiveWeight(1);
					} else {
						walkAction.setEffectiveWeight(0);
						walkAction.paused = true;
					}
				}

				if (mixer) {
					mixer.update(dt);
				}
			}

      // Face cursor
      if (characterRoot) {
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
          const dx = groundHit.x - characterRoot.position.x;
          const dz = groundHit.z - characterRoot.position.z;
          if (dx * dx + dz * dz > 0.01) {
            characterRoot.rotation.y = Math.atan2(dx, dz);
          }
        }
      }

      renderer.render(scene, camera);
    }
    tick();

    // Resize
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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      mixer?.stopAllAction();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
