import * as THREE from 'three/webgpu';
import { clamp, length, pow, positionLocal, uniform, vec4 } from 'three/tsl';

/**
 * Generic camera-facing glow.
 *
 * Same lesson as the planetary atmosphere: a sphere shell gives a hard circular
 * rim because its falloff compresses into a sub-pixel band at the silhouette. A
 * quad whose radius varies linearly in local space produces a genuinely smooth
 * gradient, and the emitter itself occludes the middle.
 *
 * `scale` is in the emitter's own radii, so the caller can size the quad once
 * and let the parent group handle the physical size.
 */
export function createGlow({ color = '#ff9d3c', scale = 4, strength = 1, power = 3 }) {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const uColor = uniform(new THREE.Color(color));
  const uStrength = uniform(strength);

  const rr = clamp(length(positionLocal.xy).div(scale), 0, 1);
  const intensity = pow(rr.oneMinus(), power).mul(uStrength);

  material.outputNode = vec4(uColor, intensity);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale * 2, scale * 2), material);
  mesh.name = 'glow';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  return mesh;
}
