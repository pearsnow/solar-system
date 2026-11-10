import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  dot,
  mix,
  mx_fractal_noise_float,
  normalWorldGeometry,
  normalize,
  positionWorld,
  texture,
  time,
  uv,
  vec3,
} from 'three/tsl';

import { createGlow } from './glow.js';
import { resolveTextureLevel } from '../quality.js';

/**
 * The Sun.
 *
 * Unlit by design: it is the light source, so a lit material would only make it
 * depend on itself. The photosphere texture supplies the granulation, a slow
 * fractal noise layer supplies the churn, and a view-dependent term supplies
 * limb darkening — the real optical effect that makes the solar disc read as a
 * sphere rather than a flat orange coin.
 */
export async function createSun({ spec, tier, anisotropy }) {
  const loader = new THREE.TextureLoader();
  const level = resolveTextureLevel(tier.key, spec.textureLevel ?? '8k');
  const base = `${import.meta.env.BASE_URL}textures/${level}/${spec.id}/`;

  const map = await loader.loadAsync(base + spec.textures.day);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = anisotropy;
  map.wrapS = THREE.RepeatWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;

  const f = spec.features?.surface ?? {};
  const tint = f.tint ?? [1.5, 1.15, 0.8];
  const contrast = f.contrast ?? 0.28;

  const material = new THREE.MeshBasicNodeMaterial();

  // Slow churn. The third noise axis is time, so the pattern evolves instead of
  // scrolling — scrolling would betray the seam.
  const flow = mx_fractal_noise_float(
    vec3(uv().mul(16.0), time.mul(f.flow ?? 0.05)),
    4,
    2.0,
    0.5,
  )
    .mul(contrast)
    .add(1.0 - contrast);

  // Limb darkening: the line of sight exits the photosphere at a shallower
  // angle near the edge, so the disc dims towards the rim.
  const viewDir = normalize(positionWorld.sub(cameraPosition));
  const facing = abs(dot(viewDir, normalWorldGeometry));
  const limb = facing.pow(0.35).mul(0.45).add(0.55);

  material.colorNode = mix(
    texture(map)
      .rgb.mul(vec3(tint[0], tint[1], tint[2]))
      .mul(flow)
      .mul(limb),
    vec3(1.0),
    0.25,
  );

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), material);
  mesh.name = 'sun';

  const glow = createGlow({
    color: spec.color ?? '#ff9d3c',
    scale: spec.features?.glow?.scale ?? 3.4,
    strength: spec.features?.glow?.strength ?? 0.85,
  });
  mesh.add(glow);
  mesh.userData.glow = glow;
  mesh.userData.map = map;
  mesh.userData.level = level;

  return mesh;
}
