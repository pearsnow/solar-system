import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @param {object} [options]
 * @param {number} [options.minDistance]
 * @param {number} [options.maxDistance]
 */
export function createControls(camera, domElement, options = {}) {
  const controls = new OrbitControls(camera, domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.7;

  // Panning an orbit view off-centre only ever produces a broken composition:
  // the Sun is the anchor and it should stay in the middle.
  controls.enablePan = false;

  controls.minDistance = options.minDistance ?? 1.35;
  controls.maxDistance = options.maxDistance ?? 12;

  return controls;
}
