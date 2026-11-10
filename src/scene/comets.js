import * as THREE from 'three/webgpu';
import catalog from '../data/catalog/comets.json';
import { cometPosition, toSceneFrame } from '../sim/orbit.js';

export function createComets({ scale, clock }) {
  const root = new THREE.Group();
  root.name = 'comets';
  const focusables = [];
  const records = [];
  const tailCanvas = document.createElement('canvas');
  tailCanvas.width = tailCanvas.height = 128;
  const ctx = tailCanvas.getContext('2d');
  const pixels = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = (x - 63.5) / 63.5;
      const across = Math.exp(-3 * u * u) * (1 - u * u);
      const t = y / 127;
      const ramp = Math.min(1, (1 - t) / 0.05);
      const soften = ramp * ramp * (3 - 2 * ramp);
      const along = Math.pow(t, 1.6) * soften;
      const i = (y * 128 + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = Math.round(255 * along * across);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const tailMap = new THREE.CanvasTexture(tailCanvas);
  const comaCanvas = document.createElement('canvas');
  comaCanvas.width = comaCanvas.height = 64;
  const comaContext = comaCanvas.getContext('2d');
  const comaGradient = comaContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  comaGradient.addColorStop(0, 'rgba(255,255,255,0.7)');
  comaGradient.addColorStop(1, 'rgba(255,255,255,0)');
  comaContext.fillStyle = comaGradient; comaContext.fillRect(0, 0, 64, 64);
  const comaMap = new THREE.CanvasTexture(comaCanvas);
  function scenePoint(p) {
    const v = toSceneFrame(p), k = scale.orbit(p.r) / p.r;
    return new THREE.Vector3(v.x * k, v.y * k, v.z * k);
  }
  function tail(color, offset) {
    const material = new THREE.SpriteMaterial({ color, map: tailMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0);
    const start = new THREE.Vector3(), end = new THREE.Vector3();
    // Sprite shaders ignore object quaternion: orient its screen-space material
    // angle from the projected anti-solar vector for the current camera.
    sprite.onBeforeRender = (_renderer, _scene, camera) => {
      sprite.getWorldPosition(start);
      end.copy(start).add(sprite.userData.outward);
      start.project(camera); end.project(camera);
      const dx = (end.x - start.x) * camera.aspect;
      const dy = end.y - start.y;
      if (dx * dx + dy * dy > 1e-12) material.rotation = Math.atan2(-dx, dy) + offset;
    };
    sprite.userData.outward = new THREE.Vector3(0, 1, 0);
    return sprite;
  }
  for (const comet of catalog) {
    const group = new THREE.Group();
    group.name = comet.id;
    const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), new THREE.MeshStandardMaterial({ color: 0x6b6259, emissive: 0x241d18, emissiveIntensity: 1.6, roughness: 1, flatShading: true }));
    group.add(nucleus);
    const coma = new THREE.Sprite(new THREE.SpriteMaterial({ map: comaMap, color: 0xaacfff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    coma.scale.setScalar(0.03 * 2.5);
    group.add(coma);
    const ion = tail(0x4f86c9, 0), dust = tail(0xd8b98a, 0.12);
    group.add(ion, dust); root.add(group);
    const entry = { id: comet.id === '1p' ? '1p-halley' : comet.id, label: comet.nameZh || comet.name, body: { ...comet, kind: 'comet' }, group, radius: 0.045, focusAxis: new THREE.Vector3(), el: null, level: null };
    focusables.push(entry);
    records.push({ comet, group, ion, dust, coma, entry });

    // Ellipses are closed; hyperbolae are sampled only while r <= 120 AU.
    let span;
    if (comet.e < 1) {
      span = Math.PI * Math.pow(comet.q / (1 - comet.e), 1.5) / 0.01720209895;
    } else {
      span = 1;
      while (cometPosition(comet, comet.tp + span).r < 120 && span < 1e8) span *= 2;
      let lo = 0, hi = span;
      for (let k = 0; k < 45; k++) {
        const mid = (lo + hi) / 2;
        if (cometPosition(comet, comet.tp + mid).r < 120) lo = mid; else hi = mid;
      }
      span = lo;
    }
    const points = [];
    for (let j = 0; j <= 256; j++) points.push(scenePoint(cometPosition(comet, comet.tp + span * (2 * j / 256 - 1))));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x72869e, transparent: true, opacity: 0.12, depthWrite: false }));
    line.visible = false;
    root.add(line); entry.orbitLine = line;
  }
  function update() {
    for (const { comet, group, ion, dust, coma, entry } of records) {
      const p = cometPosition(comet, clock.julianDate);
      const point = scenePoint(p);
      group.position.copy(point);
      const outward = point.clone().normalize();
      entry.focusAxis.copy(outward);
      const activity = 1 - THREE.MathUtils.smoothstep(p.r, 1.5, 6);
      const length = THREE.MathUtils.clamp(10 / Math.pow(p.r, 1.2), 1.5, 26);
      entry.focusDistance = THREE.MathUtils.clamp(length * 2.4, 3, 60);
      ion.userData.outward.copy(outward);
      dust.userData.outward.copy(outward);
      ion.scale.set(length * 0.30, length, 1);
      dust.scale.set(length * 0.30, length, 1);
      ion.material.opacity = dust.material.opacity = 0.50 * activity;
      coma.scale.setScalar(0.08 + length * 0.045);
      coma.material.opacity = activity;
    }
  }
  function select(id) { for (const entry of focusables) entry.orbitLine.visible = entry.id === id; }
  update();
  return { root, focusables, update, select };
}
