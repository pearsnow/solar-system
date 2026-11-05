import * as THREE from 'three/webgpu';
import { dot, normalWorldGeometry, texture, vec3 } from 'three/tsl';

/**
 * Cloud layer as its own shell.
 *
 * The official three.js example bakes clouds into the surface colour, which
 * pins them to the ground. A separate shell can drift at its own rate and picks
 * up the sun light from behind, giving the limb an actual edge.
 */
export function createClouds({ geometry, cloudsMap, uniforms }) {
  const material = new THREE.MeshStandardNodeMaterial({
    transparent: true,
    depthWrite: false,
    metalness: 0,
    roughness: 0.95,
  });

  const density = texture(cloudsMap).r;
  const sunFacing = dot(normalWorldGeometry, uniforms.sunDirection)
    .smoothstep(-0.15, 0.35);

  material.colorNode = vec3(1.0);
  material.opacityNode = density.mul(uniforms.cloudOpacity);

  // Clouds on the night side should not glow, only catch a faint ambient.
  material.emissiveNode = vec3(0.02).mul(sunFacing.oneMinus());

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(1.004);
  mesh.name = 'clouds';
  mesh.renderOrder = 1;

  return mesh;
}
