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
const GAUSSIAN_K = 0.01720209895;

/** Universal-variable propagation from perihelion; q in AU, angles in degrees, JD in days. */
export function cometPosition(el, jd) {
  const { q, e } = el;
  if (!(q > 0) || !(e >= 0)) throw new RangeError('Invalid comet elements');
  const alpha = (1 - e) / q;
  let dt = jd - el.tp;
  if (alpha > 0) {
    const period = 2 * Math.PI / (GAUSSIAN_K * Math.pow(alpha, 1.5));
    dt = ((dt + period / 2) % period + period) % period - period / 2;
  }
  const stumpff = (z) => {
    if (Math.abs(z) < 1e-5) return { C: 0.5 - z / 24 + z * z / 720, S: 1 / 6 - z / 120 + z * z / 5040 };
    if (z > 0) { const t = Math.sqrt(z); return { C: (1 - Math.cos(t)) / z, S: (t - Math.sin(t)) / (t * t * t) }; }
    const t = Math.sqrt(-z);
    if (t > 700) return { C: Infinity, S: Infinity };
    return { C: (Math.cosh(t) - 1) / (-z), S: (Math.sinh(t) - t) / (t * t * t) };
  };
  const target = Math.abs(GAUSSIAN_K * dt);
  let lo = 0, hi = 1;
  const equation = (x) => q * x + e * x * x * x * stumpff(alpha * x * x).S;
  while (equation(hi) < target) hi *= 2;
  for (let k = 0; k < 64; k++) {
    const mid = (lo + hi) / 2;
    if (equation(mid) < target) lo = mid; else hi = mid;
  }
  const chi = (lo + hi) / 2 * Math.sign(dt);
  const z = alpha * chi * chi;
  const { C, S } = stumpff(z);
  const xp = q - chi * chi * C;
  const yp = Math.sqrt(q * (1 + e)) * chi * (1 - z * S);
  const w = el.w * DEG, n = el.om * DEG, i = el.i * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(n), sn = Math.sin(n), ci = Math.cos(i), si = Math.sin(i);
  const x = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  const y = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  const zpos = sw * si * xp + cw * si * yp;
  return { x, y, z: zpos, r: Math.hypot(x, y, zpos) };
}

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
  if (el.type === 'osculating') return positionFromOsculating(el, 2451545 + T * 36525);
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

/** Elliptical osculating elements: angles in degrees, epoch JD, n degrees/day. */
export function positionFromOsculating(el, jd) {
  if (el.e < 0 || el.e >= 1 || el.a <= 0) throw new RangeError('Only elliptical orbits are supported');
  const E = solveKepler(wrapDeg(el.ma + el.n * (jd - el.epoch)) * DEG, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const w = el.w * DEG, n = el.om * DEG, i = el.i * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(n), sn = Math.sin(n), ci = Math.cos(i), si = Math.sin(i);
  const x = (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp;
  const y = (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp;
  const z = sw * si * xp + cw * si * yp;
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
  if (el.type === 'osculating') {
    return Array.from({ length: segments + 1 }, (_, k) =>
      positionFromOsculating({ ...el, ma: k * 360 / segments, n: 0 }, el.epoch));
  }
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
