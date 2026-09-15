import * as THREE from 'three';
/** Captured-pivot orbit. Upward pointer motion brings the camera under the solid. */
export function orbitCamera(camera: THREE.Camera, target: THREE.Vector3, pivot: THREE.Vector3, dx: number, dy: number, width: number) {
	if(width<=0)return;
	const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
	const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-dx/width*Math.PI)
		.multiply(new THREE.Quaternion().setFromAxisAngle(right,-dy/width*Math.PI));
	camera.position.sub(pivot).applyQuaternion(rotation).add(pivot);
	camera.quaternion.premultiply(rotation);
	target.sub(pivot).applyQuaternion(rotation).add(pivot);
	camera.updateMatrixWorld();
}
