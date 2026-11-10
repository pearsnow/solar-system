import * as THREE from 'three/webgpu';
import { length, positionLocal, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import catalog from '../data/catalog/asteroids.json';
import { positionFromOsculating, toSceneFrame } from '../sim/orbit.js';

export function createAsteroidBelt({ scale, clock }) {
  const group = new THREE.Group();
  group.name = 'asteroid-belt';
  const inner = scale.orbit(2.06), outer = scale.orbit(3.32);
  const dustGeometry = new THREE.RingGeometry(inner, outer, 256, 1);
  dustGeometry.rotateX(-Math.PI / 2);
  const dustMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const u = length(positionLocal.xz).sub(inner).div(outer - inner);
  dustMaterial.outputNode = vec4(vec3(0.30, 0.28, 0.26), smoothstep(0, 0.4, u).mul(smoothstep(1, 0.55, u)).mul(uniform(0.04)));
  const dust = new THREE.Mesh(dustGeometry, dustMaterial);
  dust.name = 'belt-dust'; dust.renderOrder = -1; group.add(dust);

  const { columns: c, count, epoch, names } = catalog;
  const elements = names.map((_, j) => ({ a: c.a[j], e: c.e[j], i: c.i[j], om: c.om[j], w: c.w[j], ma: c.ma[j], epoch, n: 0.9856076686 / Math.pow(c.a[j], 1.5) }));
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6a6056, roughness: 1, flatShading: true }), count);
  rocks.name = 'belt-rocks'; rocks.frustumCulled = false;
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(rocks);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), size = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), axis = new THREE.Vector3();
  const positions = new Array(count);
  function updateRange(start, stride, camera) {
    for (let j = start; j < count; j += stride) {
      const p = positionFromOsculating(elements[j], clock.julianDate);
      const v = toSceneFrame(p);
      const factor = scale.orbit(p.r) / p.r;
      position.set(v.x * factor, v.y * factor, v.z * factor);
      positions[j] = { ...p };
      axis.set(Math.sin(j * 2.1), Math.cos(j * 1.7), Math.sin(j * 0.9)).normalize();
      rotation.setFromAxisAngle(axis, j * 1.618 + (clock.julianDate - epoch) * 0.01);
      const distance = camera ? camera.position.distanceTo(position) : Infinity;
      const near = 0.02 + 0.98 * THREE.MathUtils.smoothstep(distance, 2, 14);
      matrix.compose(position, rotation, size.setScalar(Math.min(scale.radius(c.d[j] / 2), 0.32) * near));
      rocks.setMatrixAt(j, matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
  }
  updateRange(0, 1, null);
  let frame = 0;
  group.userData.update = (_dt, camera) => { updateRange(frame, 6, camera); frame = (frame + 1) % 6; };
  group.userData.count = count;
  group.userData.catalog = catalog;
  group.userData.positions = positions;
  return group;
}
