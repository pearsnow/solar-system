import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  color,
  dot,
  mix,
  normalMap,
  normalWorldGeometry,
  normalize,
  output,
  positionWorld,
  sin,
  texture,
  time,
  uniform,
  uv,
  vec4,
} from 'three/tsl';

import { createClouds } from './clouds.js';
import { createAtmosphere } from './atmosphere.js';
import { createRings } from './rings.js';
import { resolveTextureLevel } from '../quality.js';

/**
 * Generic planet factory.
 *
 * Every shader branch is driven by `spec.features`: a body without an
 * atmosphere never compiles the rim blend, a body without a night map never
 * samples one. That keeps GPU cost proportional to what a body actually has.
 *
 * Note on the terminator: it and the fresnel rim use the *geometric* normal,
 * never the perturbed one. A normal map shifts shading detail; it must not move
 * the day/night line, or coastlines get a glowing halo at sunset.
 */
export async function createPlanet(spec, { tier, anisotropy, sunDirection, level: levelOverride }) {
  const loader = new THREE.TextureLoader();
  const level = resolveTextureLevel(levelOverride ?? tier.key, spec.textureLevel ?? '8k');
  const base = `${import.meta.env.BASE_URL}textures/${level}/${spec.id}/`;

  const load = async (file, colorSpace = THREE.NoColorSpace, levelOverride = null, aniso = anisotropy) => {
    const dir = levelOverride
      ? `${import.meta.env.BASE_URL}textures/${levelOverride}/${spec.id}/`
      : base;
    const tex = await loader.loadAsync(dir + file);
    tex.colorSpace = colorSpace;
    tex.anisotropy = aniso;
    tex.wrapS = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
  };

  const paths = spec.textures ?? {};
  const f = spec.features ?? {};

  const [dayMap, nightMap, normalTex, cloudsMap, roughMap, ringMap] = await Promise.all([
    load(paths.day, THREE.SRGBColorSpace),
    paths.night ? load(paths.night, THREE.SRGBColorSpace) : null,
    paths.normal ? load(paths.normal) : null,
    paths.clouds ? load(paths.clouds) : null,
    paths.rough ? load(paths.rough) : null,
    // The ring strip aliases badly under high anisotropy: its own periodic
    // ripple beats against the filter's sample spacing and produces a visible
    // dither. A low anisotropy plus a low-resolution strip is both cleaner and
    // cheaper.
    paths.ring ? load(paths.ring, THREE.SRGBColorSpace, '2k', 2) : null,
  ]);

  // ---------------------------------------------------------------- uniforms

  const uniforms = {
    sunDirection: uniform(sunDirection.clone().normalize()),
    normalScale: uniform(f.normalMap?.scale ?? 1.0),
  };

  if (f.nightLights) uniforms.nightIntensity = uniform(f.nightLights.intensity ?? 1.0);
  if (f.clouds) uniforms.cloudOpacity = uniform(f.clouds.opacity ?? 0.9);
  if (f.atmosphere) {
    uniforms.atmosphereDay = uniform(color(f.atmosphere.day ?? '#4db2ff'));
    uniforms.atmosphereTwilight = uniform(color(f.atmosphere.twilight ?? '#bc490b'));
  }

  // ------------------------------------------------------------ shared nodes

  const N = normalWorldGeometry;
  const viewDir = normalize(positionWorld.sub(cameraPosition));

  const fresnel = abs(dot(viewDir, N)).oneMinus().toVar();
  const sunOrientation = dot(N, uniforms.sunDirection).toVar();
  const dayStrength = sunOrientation.smoothstep(-0.2, 0.35).toVar();

  // ------------------------------------------------------------------- globe

  const material = new THREE.MeshStandardNodeMaterial({
    metalness: 0,
    roughness: 0.8,
  });

  let baseColor = texture(dayMap);

  if (f.bands) {
    // Ice giants have almost no visible structure from Voyager's single flyby.
    // A very low-amplitude swept sine gives the limb something to break up
    // without inventing detail the planet does not have.
    const wave = sin(uv().y.mul(f.bands.freq ?? 6.0).add(time.mul(f.bands.speed * 24.0)))
      .mul(0.5)
      .add(0.5);
    const gain = wave.mul(f.bands.strength).add(1.0 - f.bands.strength * 0.5);
    baseColor = baseColor.mul(gain);
  }

  material.colorNode = baseColor;

  if (roughMap && f.roughness) {
    // Source is an inverted specular mask: 0 = water, 1 = land. Water is kept
    // off the mirror end so the sun does not burn a white dot into the ocean.
    material.roughnessNode = texture(roughMap).r.remap(
      0,
      1,
      f.roughness.min ?? 0.32,
      f.roughness.max ?? 0.95,
    );
  } else if (f.roughness) {
    material.roughness = (f.roughness.min + f.roughness.max) / 2;
  }

  if (normalTex) {
    material.normalNode = normalMap(texture(normalTex), uniforms.normalScale);
  }

  // Composite: PBR output, optionally swapped for the night pass, optionally
  // blended into the atmospheric rim.
  let surface = output.rgb;

  if (nightMap) {
    const nightColor = texture(nightMap).rgb.mul(uniforms.nightIntensity);
    surface = mix(nightColor, surface, dayStrength);
  }

  if (f.atmosphere) {
    const atmosphereColor = mix(
      uniforms.atmosphereTwilight,
      uniforms.atmosphereDay,
      sunOrientation.smoothstep(-0.25, 0.75),
    );
    const atmosphereMix = sunOrientation
      .smoothstep(-0.5, 1.0)
      .mul(fresnel.pow(3.5))
      .mul(f.atmosphere.rim ?? 0.38)
      .clamp(0, 1);

    surface = mix(surface, atmosphereColor, atmosphereMix);
  }

  material.outputNode = vec4(surface, 1.0);

  // ---------------------------------------------------------------- assembly

  const segments = spec.segments ?? tier.segments;
  const geometry = new THREE.SphereGeometry(1, segments, segments / 2);

  const globe = new THREE.Mesh(geometry, material);
  globe.name = spec.id;

  const group = new THREE.Group();
  group.name = `${spec.id}-system`;

  // Axial tilt lives on its own node so the globe can spin about its own axis
  // while the equator stays tilted relative to the orbital plane.
  const tilt = new THREE.Group();
  tilt.name = `${spec.id}-tilt`;
  tilt.rotation.z = THREE.MathUtils.degToRad(spec.axialTilt ?? 0);
  group.add(tilt);
  tilt.add(globe);

  let clouds = null;
  if (f.clouds && cloudsMap) {
    clouds = createClouds({ geometry, cloudsMap, uniforms });
    tilt.add(clouds);
  }

  let rings = null;
  if (ringMap && spec.rings) {
    rings = createRings({ spec: spec.rings, map: ringMap });
    tilt.add(rings);
  }

  let atmosphere = null;
  if (f.atmosphere) {
    // The glow is a camera-facing billboard, so it must stay outside the tilted
    // node: a tilted parent would rotate the quad away from the camera.
    atmosphere = createAtmosphere({ uniforms });
    group.add(atmosphere);
  }

  return {
    id: spec.id,
    spec,
    level,
    group,
    globe,
    clouds,
    atmosphere,
    uniforms,
    geometry,
    maps: { dayMap, nightMap, normalTex, cloudsMap, roughMap },

    /**
     * @param {number} dt seconds
     * @param {THREE.Camera} camera
     * @param {THREE.Vector3} sunWorld normalized sun direction in world space
     */
    update(dt, camera, sunWorld) {
      if (spec.spinSpeed) globe.rotation.y += dt * spec.spinSpeed;
      if (clouds && spec.cloudDrift) clouds.rotation.y += dt * spec.cloudDrift;

      if (sunWorld) uniforms.sunDirection.value.copy(sunWorld);

      if (atmosphere) {
        atmosphere.quaternion.copy(camera.quaternion);
        camera.updateMatrixWorld();
        sunViewMatrix.copy(camera.matrixWorld).invert();
        sunViewDir
          .copy(sunWorld ?? uniforms.sunDirection.value)
          .transformDirection(sunViewMatrix);
        atmosphere.userData.sunView.value.copy(sunViewDir);
      }
    },
  };
}

// Scratch objects shared by every planet instance; update() is single-threaded
// and runs once per frame, so reusing them is safe.
const sunViewMatrix = new THREE.Matrix4();
const sunViewDir = new THREE.Vector3();

/**
 * Release everything a planet instance owns.
 *
 * Textures are counted here because a level swap builds a whole new instance:
 * without this the old 8k set would stay resident and the "upgrade" would just
 * double the memory.
 */
export function disposePlanet(planet) {
  planet.group.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m?.dispose?.();
    }
  });

  for (const tex of Object.values(planet.maps)) {
    tex?.dispose?.();
  }

  // The shared sphere geometry is referenced by the globe, the cloud shell and
  // the atmosphere quad's parent; dispose it explicitly once.
  planet.geometry?.dispose?.();
}

/** Byte cost of one planet's textures, mipmaps included. */
export function planetTextureBytes(planet) {
  let bytes = 0;
  for (const tex of Object.values(planet.maps)) {
    const img = tex?.image;
    if (!img?.width) continue;
    const px = img.width * img.height;
    const channels = tex.format === THREE.RedFormat ? 1 : 4;
    bytes += px * channels * 1.34; // +1/3 for the mip chain
  }
  return bytes;
}
