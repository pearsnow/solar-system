import * as THREE from 'three/webgpu';
import catalog from '../data/catalog/moons.json';
import { satelliteOrbit } from '../data/scale.js';
import { createMoonTexture } from './moon-texture.js';

// Display distances use a continuous piecewise power law, not physical scale.
export function createSatellites({ planets, scale, moonEntry, clock }) {
  const groups = new Map();
  const focusables = [moonEntry];
  const records = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const size = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let selected = null;
  let selectedVisual = null;

  function select(id) {
    if (selectedVisual) {
      selectedVisual.parent.remove(selectedVisual);
      selectedVisual.geometry.dispose();
      selectedVisual.material.map.dispose();
      selectedVisual.material.dispose();
      selectedVisual = null;
    }
    selected = records.find((r) => r.entry.id === id && r.m.radiusKm >= 200) ?? null;
    if (!selected) return;
    const map = createMoonTexture(selected.m);
    selectedVisual = new THREE.Mesh(new THREE.SphereGeometry(selected.radius, 32, 16),
      new THREE.MeshStandardMaterial({ map, roughness: 1 }));
    selected.anchor.add(selectedVisual);
  }

  for (const parent of planets) {
    const list = catalog.filter((m) => m.parent === parent.id && m.parent !== 'earth');
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(
      // Detail 3 rather than 1: Charon is large enough on screen at Pluto's
      // distance that 80 flat facets read as a low-poly ball. 210 instances at
      // 1280 triangles each is still only ~270k — cheaper than the rock belt.
      new THREE.IcosahedronGeometry(1, 3),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), list.length,
    );
    mesh.frustumCulled = false;
    parent.tilt.add(mesh);
    groups.set(parent.id, mesh);
    list.forEach((m, index) => {
      const anchor = new THREE.Group();
      parent.tilt.add(anchor);
      const radius = parent.radius * Math.max(0.006, Math.pow(m.radiusKm / parent.body.radiusKm, 0.65));
      const body = { ...m, axialTilt: 0, rotationHours: m.periodDays * 24 };
      const entry = { id: m.id, label: m.nameZh || m.name, body, group: anchor, radius, el: null, level: null };
      focusables.push(entry);
      records.push({ m, index, mesh, anchor, radius, parent, entry });
      mesh.setColorAt(index, new THREE.Color(m.color || '#aaaaaa'));
    });
  }

  // Earth’s Moon remains in the ecliptic frame, not Earth's tilted equator;
  // solar-system.js retains its mean lunar longitude and 5.145° inclination.
  function update() {
    for (const record of records) {
      const { m, index, mesh, anchor, radius, parent } = record;
      const ratio = m.aKm / parent.body.radiusKm;
      const d = parent.radius * satelliteOrbit(ratio);
      const a = (clock.julianDate - 2451545) * 2 * Math.PI / m.periodDays + THREE.MathUtils.degToRad(m.peri || 0);
      const inc = THREE.MathUtils.degToRad(m.i || 0);
      const node = THREE.MathUtils.degToRad(m.node || 0);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      position.set(x * Math.cos(node) - z * Math.cos(inc) * Math.sin(node), z * Math.sin(inc), -(x * Math.sin(node) + z * Math.cos(inc) * Math.cos(node)));
      anchor.position.copy(position);
      matrix.compose(position, rotation, size.setScalar(record === selected ? 0 : radius));
      mesh.setMatrixAt(index, matrix);
    }
    for (const mesh of groups.values()) mesh.instanceMatrix.needsUpdate = true;
  }
  update();
  return { focusables, update, select };
}
