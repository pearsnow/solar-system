/**
 * Keplerian orbit propagation.
 *
 * Deliberately free of any three.js import so Node can run it directly in
 * tools/verify-orbits.mjs, and so the maths is testable without a GPU.
 *
 * Reference frame: heliocentric ecliptic J2000, +X towards the vernal equinox.
 * The renderer converts to Y-up later; this module stays in astronomy space.
 */

import { J2000_JD } from '../data/elements.js';

const DEG = Math.PI / 180;

/** Julian Date from a JS Date (UTC). */
export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since J2000. */
export function centuriesSinceJ2000(jd) {
  return (jd - J2000_JD) / 36525;
}

/** Normalise an angle in degrees to (-180, 180]. */
function wrapDeg(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Solve Kepler's equation M = E - e·sin(E) for the eccentric anomaly.
 *
 * Newton–Raphson with the usual starting guess. Mercury's e = 0.206 is the worst
 * case in the solar system; it converges to 1e-12 in 3–4 iterations there.
 */
export function solveKepler(M, e) {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 12; k++) {
    const dM = E - e * Math.sin(E) - M;
    const dE = dM / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/**
 * Heliocentric ecliptic position in AU.
 *
 * @param {object} el element set from data/elements.js
 * @param {number} T Julian centuries since J2000
 * @returns {{x:number, y:number, z:number, r:number}}
 */
export function heliocentricPosition(el, T) {
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const inc = (el.i[0] + el.i[1] * T) * DEG;
  const L = el.L[0] + el.L[1] * T;
  const peri = el.peri[0] + el.peri[1] * T;
  const node = el.node[0] + el.node[1] * T;

  const M = wrapDeg(L - peri) * DEG;
  const E = solveKepler(M, e);

  // Position in the orbital plane, perihelion along +x'.
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const w = (peri - node) * DEG; // argument of perihelion
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cosN = Math.cos(node * DEG);
  const sinN = Math.sin(node * DEG);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  const x = (cosW * cosN - sinW * sinN * cosI) * xp + (-sinW * cosN - cosW * sinN * cosI) * yp;
  const y = (cosW * sinN + sinW * cosN * cosI) * xp + (-sinW * sinN + cosW * cosN * cosI) * yp;
  const z = sinW * sinI * xp + cosW * sinI * yp;

  return { x, y, z, r: Math.hypot(x, y, z) };
}

/**
 * Convert ecliptic J2000 (Z-up) to the renderer's Y-up frame.
 * Ecliptic X → scene X, ecliptic Y → scene −Z, ecliptic Z → scene Y.
 */
export function toSceneFrame(v) {
  return { x: v.x, y: v.z, z: -v.y };
}

/** Convenience: element set + Date → scene-space position. */
export function positionAt(el, date) {
  return toSceneFrame(heliocentricPosition(el, centuriesSinceJ2000(julianDate(date))));
}

/**
 * Sample one full orbit as an array of ecliptic points.
 *
 * Sampling the eccentric anomaly directly (rather than stepping time) gives a
 * clean closed curve; stepping time would bunch points near perihelion.
 *
 * @param {object} el element set
 * @param {number} T Julian centuries since J2000, fixes the element set
 * @param {number} segments number of points around the ellipse
 * @returns {Array<{x:number,y:number,z:number}>}
 */
export function orbitPath(el, T, segments = 512) {
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const inc = (el.i[0] + el.i[1] * T) * DEG;
  const peri = el.peri[0] + el.peri[1] * T;
  const node = el.node[0] + el.node[1] * T;

  const w = (peri - node) * DEG;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cosN = Math.cos(node * DEG);
  const sinN = Math.sin(node * DEG);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const b = a * Math.sqrt(1 - e * e);

  const points = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * Math.PI * 2;
    const xp = a * (Math.cos(E) - e);
    const yp = b * Math.sin(E);

    points.push({
      x: (cosW * cosN - sinW * sinN * cosI) * xp + (-sinW * cosN - cosW * sinN * cosI) * yp,
      y: (cosW * sinN + sinW * cosN * cosI) * xp + (-sinW * sinN + cosW * cosN * cosI) * yp,
      z: sinW * sinI * xp + cosW * sinI * yp,
    });
  }
  return points;
}
