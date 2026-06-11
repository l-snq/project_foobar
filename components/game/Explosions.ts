import * as THREE from "three";

const SPARK_COLORS = [0xff6600, 0xffaa00, 0xffff00, 0xff3300, 0xffffff, 0xff9900];
const PARTICLE_COUNT = 30;
const DURATION = 1.4;
const GRAVITY = 14;

interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3 }
interface Burst { particles: Particle[]; age: number }

// Spark-burst death explosions.
export class Explosions {
  private bursts: Burst[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  spawn(x: number, y: number, z: number) {
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
        new THREE.MeshBasicMaterial({
          color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
          transparent: true,
          opacity: 1,
        }),
      );
      mesh.position.set(x, y + 0.8, z);
      const speed = 2 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        1.5 + Math.random() * 5,
        Math.sin(angle) * speed,
      );
      this.scene.add(mesh);
      particles.push({ mesh, vel });
    }
    this.bursts.push({ particles, age: 0 });
  }

  update(dt: number) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.age += dt;
      const t = burst.age / DURATION;
      if (t >= 1) {
        this.disposeBurst(burst);
        this.bursts.splice(i, 1);
        continue;
      }
      for (const p of burst.particles) {
        p.vel.y -= GRAVITY * dt;
        p.mesh.position.x += p.vel.x * dt;
        p.mesh.position.y += p.vel.y * dt;
        p.mesh.position.z += p.vel.z * dt;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      }
    }
  }

  dispose() {
    for (const burst of this.bursts) this.disposeBurst(burst);
    this.bursts = [];
  }

  private disposeBurst(burst: Burst) {
    for (const p of burst.particles) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.MeshBasicMaterial).dispose();
      this.scene.remove(p.mesh);
    }
  }
}
