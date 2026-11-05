import * as THREE from 'three/webgpu';

import { ORBITAL_ELEMENTS } from '../data/elements.js';
import { SUN, SOLAR_BODIES, MOON } from '../data/bodies.js';
import { createPlanet, disposePlanet, planetTextureBytes } from './planet.js';
import { createSun } from './sun.js';
import { createAsteroidBelt } from './asteroid-belt.js';
import { resolveTextureLevel } from '../quality.js';
import {
  centuriesSinceJ2000,
  heliocentricPosition,
  orbitPath,
  toSceneFrame,
} from '../sim/orbit.js';

/**
 * Solar system assembly.
 *
 * Positions are radially compressed: the direction of each position vector is
 * preserved and its length is remapped by the scale curve. That keeps a planet
 * exactly on its drawn orbit line, at the cost of distorting the ellipse shape.
 * The alternative — scaling each axis independently — would move planets off
 * their own paths.
 *
 * Level of detail: every body starts at BASE_LEVEL and only the body being
 * inspected is rebuilt at its native level. Rebuilding instead of swapping
 * texture handles keeps one code path and leaves no stale shader state; the
 * cost is a shader recompile on focus, which is invisible next to the download.
 */

const BASE_LEVEL = '2k';

function compress(vec, scale) {
  const r = Math.hypot(vec.x, vec.y, vec.z);
  if (r === 0) return { x: 0, y: 0, z: 0 };
  const k = scale.orbit(r) / r;
  return { x: vec.x * k, y: vec.y * k, z: vec.z * k };
}

export async function createSolarSystem({ tier, anisotropy, clock, scale }) {
  const root = new THREE.Group();
  root.name = 'solar-system';

  const elementsById = new Map(ORBITAL_ELEMENTS.map((el) => [el.id, el]));
  const T0 = centuriesSinceJ2000(clock.julianDate);

  // ------------------------------------------------------------------- sun

  const sunRadius = scale.radius(SUN.radiusKm);
  const sun = await createSun({ spec: SUN, tier, anisotropy });
  sun.scale.setScalar(sunRadius);
  root.add(sun);

  // A point light with zero decay: brightness is constant across the system, so
  // Neptune is not 900x darker than Mercury. Physically wrong, visually right.
  const sunLight = new THREE.PointLight(0xffffff, 3.2, 0, 0);
  sunLight.position.set(0, 0, 0);
  root.add(sunLight);
  root.add(new THREE.AmbientLight(0xffffff, 0.08));

  // --------------------------------------------------------------- planets

  const planets = [];
  const orbitLines = [];

  for (const body of SOLAR_BODIES) {
    const el = elementsById.get(body.id);
    if (!el) continue;

    const radius = scale.radius(body.radiusKm);

    const visual = await createPlanet(body, {
      tier,
      anisotropy,
      sunDirection: new THREE.Vector3(1, 0, 0),
      level: BASE_LEVEL,
    });
    visual.group.scale.setScalar(radius);
    visual.group.name = `${body.id}-group`;

    root.add(visual.group);
    planets.push({
      id: body.id,
      label: body.nameZh,
      body,
      el,
      radius,
      group: visual.group,
      planet: visual,
      level: visual.level,
    });

    // --- orbit curve --------------------------------------------------------

    const pts = orbitPath(el, T0, 720);
    const positions = new Float32Array(pts.length * 3);

    for (let i = 0; i < pts.length; i++) {
      const p = compress(toSceneFrame(pts[i]), scale);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const line = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({
        color: body.color ?? '#6f7d8c',
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    line.name = `${body.id}-orbit`;
    root.add(line);
    orbitLines.push(line);
  }

  // ------------------------------------------------------------------ moon

  // The real Earth–Moon distance is 0.00257 AU, which at this compression is
  // far below one pixel. Satellites are always drawn at an exaggerated orbit
  // radius; 5 Earth radii keeps the pair readable without swallowing Mercury's
  // orbit.
  const MOON_ORBIT_RADII = 5;

  const earthEntry = planets.find((p) => p.body.id === 'earth');
  // Satellites keep their true size relative to the parent instead of using the
  // planet radius curve, which deliberately exaggerates small bodies.
  const moonRadius = earthEntry
    ? earthEntry.radius * (MOON.radiusKm / earthEntry.body.radiusKm)
    : scale.radius(MOON.radiusKm);
  const moonSunDir = new THREE.Vector3(1, 0, 0);
  let moonAngle = 0;
  const moon = await createPlanet(MOON, {
    tier,
    anisotropy,
    sunDirection: new THREE.Vector3(1, 0, 0),
    level: BASE_LEVEL,
  });
  moon.group.scale.setScalar(moonRadius);
  moon.group.name = 'moon-group';
  root.add(moon.group);

  const moonEntry = {
    id: 'moon',
    label: MOON.nameZh,
    body: MOON,
    group: moon.group,
    planet: moon,
    radius: moonRadius,
    level: moon.level,
    el: null,
  };

  /** Everything that carries a texture level. */
  const lodTargets = [...planets, moonEntry];

  // --------------------------------------------------------- asteroid belt

  const belt = createAsteroidBelt({ scale });
  root.add(belt);

  // ---------------------------------------------------------------- layout

  /**
   * Position every body for a given instant. Kept separate from the per-frame
   * update so the initial placement also happens before the first render — the
   * camera focus code needs real positions, not zeros.
   */
  function layout(T) {
    for (const entry of planets) {
      const helio = heliocentricPosition(entry.el, T);
      const scene = toSceneFrame(helio);
      const p = compress(scene, scale);

      entry.group.position.set(p.x, p.y, p.z);

      // Sun sits at the origin, so the incident light direction is simply the
      // reverse of the planet's own position vector.
      entry.sunDir ??= new THREE.Vector3();
      entry.sunDir.set(-scene.x, -scene.y, -scene.z).normalize();
    }

    // The Moon orbits the Earth, not the Sun: its position comes from the mean
    // lunar longitude rather than the heliocentric element set.
    if (earthEntry) {
      const degrees = 218.3164477 + 481267.88123421 * T;
      moonAngle = THREE.MathUtils.degToRad(degrees % 360);

      const d = MOON_ORBIT_RADII * earthEntry.radius;
      const e = earthEntry.group.position;

      // 5.145° inclination to the ecliptic, applied as a tilt about the x axis.
      const inc = THREE.MathUtils.degToRad(5.145);
      const sinA = Math.sin(moonAngle);

      moon.group.position.set(
        e.x + Math.cos(moonAngle) * d,
        e.y + sinA * d * Math.sin(inc),
        e.z - sinA * d * Math.cos(inc),
      );

      // Tidally locked: the near side always faces the Earth.
      moonEntry.planet.globe.rotation.y = -moonAngle;

      moonSunDir.set(-e.x, -e.y, -e.z).normalize();
    }
  }

  layout(T0);

  // ------------------------------------------------------------------- LOD

  /**
   * Rebuild a body at a given texture level.
   * Rebuilding instead of swapping texture handles keeps one code path and
   * leaves no stale shader state.
   */
  async function setLevel(entry, target) {
    if (entry.level === target || entry.pending) return entry;

    entry.pending = true;
    try {
      const next = await createPlanet(entry.body, {
        tier,
        anisotropy,
        sunDirection: entry.sunDir ?? new THREE.Vector3(1, 0, 0),
        level: target,
      });

      next.group.scale.copy(entry.group.scale);
      next.group.position.copy(entry.group.position);
      next.globe.rotation.copy(entry.planet.globe.rotation);
      next.group.name = entry.group.name;

      root.remove(entry.group);
      disposePlanet(entry.planet);
      root.add(next.group);

      entry.group = next.group;
      entry.planet = next;
      entry.level = next.level;
    } finally {
      entry.pending = false;
    }

    return entry;
  }

  async function focus(id) {
    const entry = lodTargets.find((e) => e.id === id);
    if (!entry) return null;
    const target = resolveTextureLevel(tier.key, entry.body.textureLevel ?? '8k');
    return setLevel(entry, target);
  }

  // Distance thresholds in body radii. Deliberately tight: at system scale a
  // loose threshold (25 radii) meant focusing Earth also upgraded Mercury,
  // because the inner planets are all within a few dozen units of each other.
  // The gap between the two is hysteresis — without it a body hovering on the
  // boundary would rebuild its material every few frames.
  const LOD_UPGRADE = 8;
  const LOD_DOWNGRADE = 18;

  let lodAccum = 0;

  function updateLod(dt, camera) {
    lodAccum += dt;
    if (lodAccum < 0.4) return;
    lodAccum = 0;

    const camPos = camera.position;

    for (const entry of lodTargets) {
      if (entry.pending) continue;

      const native = resolveTextureLevel(tier.key, entry.body.textureLevel ?? '8k');
      const dist = camPos.distanceTo(entry.group.position) / entry.radius;

      if (dist < LOD_UPGRADE && entry.level !== native) {
        setLevel(entry, native);
      } else if (dist > LOD_DOWNGRADE && entry.level !== BASE_LEVEL) {
        setLevel(entry, BASE_LEVEL);
      }
    }
  }

  // ---------------------------------------------------------------- update

  function update(dt, camera) {
    clock.update(dt);

    // The sun's glow is a camera-facing quad.
    sun.userData.glow?.quaternion.copy(camera.quaternion);

    layout(centuriesSinceJ2000(clock.julianDate));

    // The belt rotates as one body at the mean motion of a 4.6-year orbit.
    // Individual rocks carrying their own Kepler rate would need 7000 matrix
    // updates per frame for an effect that is invisible at any real zoom.
    const years = (clock.julianDate - 2451545.0) / 365.25;
    belt.rotation.y = -(years / 4.6) * Math.PI * 2;

    for (const entry of planets) {
      entry.planet.update(dt, camera, entry.sunDir);
    }

    moonEntry.planet.update(dt, camera, moonSunDir);

    updateLod(dt, camera);
  }

  function textureBytes() {
    let bytes = 0;
    for (const entry of lodTargets) bytes += planetTextureBytes(entry.planet);

    const sunMap = sun.userData.map;
    if (sunMap?.image?.width) {
      bytes += sunMap.image.width * sunMap.image.height * 4 * 1.34;
    }
    return bytes;
  }

  return {
    root,
    sun,
    sunRadius,
    planets,
    orbitLines,
    update,
    focus,
    textureBytes,
    /** Everything the UI can select, in a uniform shape. */
    focusables: [
      { id: 'sun', label: SUN.nameZh, body: SUN, group: sun, radius: sunRadius, el: null },
      ...planets,
      moonEntry,
    ],
    /** Farthest orbit radius in display units, for framing the camera. */
    extent: scale.orbit(30.07),
    /** Per-body LOD state, for debugging and the automated tests. */
    lodState: () =>
      planets.map((e) => ({
        id: e.id,
        level: e.level,
        radius: e.radius,
        pending: !!e.pending,
      })),
  };
}
