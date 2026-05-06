import * as THREE from 'three';
import RAPIER from "@dimforge/rapier3d-compat";

export const Game = {
	scene: new THREE.Scene(),
	mouse: new THREE.Vector2(0, 0),
	groundHit: new THREE.Vector3(),
	groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
	inputSendAccum: 0,
	raycaster: new THREE.Raycaster(),
	rapierWorld: RAPIER.World,
}
