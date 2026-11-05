import * as THREE from 'three/webgpu';

const projected = new THREE.Vector3();

/**
 * Screen-space picking.
 *
 * Raycasting against a planet works, but at system scale the planets are a few
 * pixels wide and hitting one is pure luck. Projecting each body centre and
 * accepting anything within a generous radius makes the targets feel like the
 * cursor does: forgiving.
 *
 * @param {{clientX:number, clientY:number}} event
 * @param {THREE.Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{id:string, group:THREE.Object3D, radius:number}>} entries
 * @param {number} [threshold] pixel radius
 */
export function pickBody(event, camera, canvas, entries, threshold = 30) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  let best = null;
  let bestDistance = Infinity;

  for (const entry of entries) {
    entry.group.getWorldPosition(projected);
    projected.project(camera);

    // Behind the camera or outside the depth range.
    if (projected.z < -1 || projected.z > 1) continue;

    const dx = ((projected.x - nx) * rect.width) / 2;
    const dy = ((projected.y - ny) * rect.height) / 2;
    const distance = Math.hypot(dx, dy);

    if (distance < threshold && distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }

  return best;
}
