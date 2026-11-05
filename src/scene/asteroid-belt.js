import * as THREE from 'three/webgpu';
import {
  float,
  length,
  positionLocal,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * Main asteroid belt.
 *
 * Two layers, because one cannot do both jobs:
 *
 * - Instanced rocks give parallax and silhouette when the camera is inside or
 *   near the belt. They are deliberately oversized: a real 100 km asteroid at
 *   this scale is far below one pixel, and an invisible belt is not a feature.
 * - A translucent dust annulus keeps the belt readable from the system
 *   overview, where individual rocks are sub-pixel. Without it the belt simply
 *   disappears at the default camera distance.
 */

const AU_INNER = 2.06;
const AU_OUTER = 3.32;

function createDust({ inner, outer }) {
  const geometry = new THREE.RingGeometry(inner, outer, 256, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const u = length(positionLocal.xz).sub(inner).div(outer - inner);
  const alpha = smoothstep(0, 0.4, u)
    .mul(smoothstep(1.0, 0.55, u))
    .mul(uniform(0.04));

  material.outputNode = vec4(vec3(0.30, 0.28, 0.26), alpha);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'belt-dust';
  mesh.renderOrder = -1;
  return mesh;
}

export function createAsteroidBelt({ scale, count = 5000 }) {
  const inner = scale.orbit(AU_INNER);
  const outer = scale.orbit(AU_OUTER);

  const group = new THREE.Group();
  group.name = 'asteroid-belt';
  group.add(createDust({ inner, outer }));

  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4e4740,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });

  const rocks = new THREE.InstancedMesh(geometry, material, count);
  rocks.name = 'belt-rocks';
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rocks.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const size = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Slightly biased outward: the belt is denser past 2.5 AU.
    const au = AU_INNER + Math.pow(Math.random(), 0.85) * (AU_OUTER - AU_INNER);
    const radius = scale.orbit(au);
    const theta = Math.random() * Math.PI * 2;

    position.set(
      Math.cos(theta) * radius,
      (Math.random() - 0.5) * radius * 0.03,
      Math.sin(theta) * radius,
    );

    euler.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    quaternion.setFromEuler(euler);

    // Most rocks tiny, a few large: matches the real size distribution's shape.
    // Sizes stay modest because the belt sits only a few display units outside
    // Mars: boulders would read as a second moon system.
    const s = 0.025 + Math.pow(Math.random(), 3.2) * 0.16;
    size.set(
      s * (0.7 + Math.random() * 0.6),
      s * (0.7 + Math.random() * 0.6),
      s * (0.7 + Math.random() * 0.6),
    );

    matrix.compose(position, quaternion, size);
    rocks.setMatrixAt(i, matrix);
  }

  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);

  return group;
}
