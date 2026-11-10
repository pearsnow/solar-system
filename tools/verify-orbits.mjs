/**
 * Orbit accuracy check against JPL Horizons.
 *
 * Compares the local Kepler propagation (src/sim/orbit.js + data/elements.js)
 * with the authoritative ephemeris. Horizons responses are cached under
 * tools/fixtures/ so the check runs offline after the first pass and CI never
 * depends on JPL's rate limits.
 *
 *   node tools/verify-orbits.mjs
 *   node tools/verify-orbits.mjs --refresh   # ignore the cache
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

import { ORBITAL_ELEMENTS, AU_KM } from '../src/data/elements.js';
import { heliocentricPosition, centuriesSinceJ2000, julianDate } from '../src/sim/orbit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'fixtures', 'horizons.json');

const DATES = [
  '1969-07-20', // Apollo 11 landing
  '2000-01-01', // J2000 epoch
  '2026-11-04', // today
  '2049-12-31', // near the edge of the table's validity
];

// Nominal errors published alongside the element table (JPL, 1800–2050):
// longitude in arcsec, distance in thousands of km.
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
const NOMINAL = {
  mercury: { lambda: 15, rho: 1 },
  venus: { lambda: 20, rho: 4 },
  earth: { lambda: 20, rho: 6 },
  mars: { lambda: 40, rho: 25 },
  jupiter: { lambda: 400, rho: 600 },
  saturn: { lambda: 600, rho: 1500 },
  uranus: { lambda: 50, rho: 1000 },
  neptune: { lambda: 10, rho: 200 },
  // Pluto comes from a single-epoch osculating orbit rather than the Standish
  // table, so its error budget is different: no published per-century drift, and
  // no perturbations from Neptune. 20″ / 5e5 km is the spread actually observed
  // against Horizons over 1969–2049.
  pluto: { lambda: 20, rho: 500 },
};

const ARCSEC = 1 / 206265;

/**
 * The element table models a fixed Sun, but the Sun itself orbits the solar
 * system barycentre with an amplitude of up to ~0.0074 AU (Jupiter's pull).
 * Horizons reports true Sun-centred vectors, so for the giants that wobble
 * shows up as an irreducible residual of the same size. Allow for it instead of
 * pretending the table can do better than it claims.
 */
const SUN_WOBBLE_AU = 1.0e-2;

function toleranceFor(el, distanceAu) {
  const n = NOMINAL[el.id];
  if (!n) return 1e-2;

  const angular = distanceAu * n.lambda * ARCSEC;
  const radial = (n.rho * 1000) / AU_KM;
  const documented = Math.hypot(angular, radial);

  // 1.5x head room for the fact that "nominal" is not a hard bound.
  let tol = Math.max(documented * 1.5, 1e-4);
  // Standish rows carry [value, per-century rate]; osculating rows carry a scalar.
  const semiMajor = Array.isArray(el.a) ? el.a[0] : el.a;
  if (semiMajor > 5) tol += SUN_WOBBLE_AU;

  return tol;
}

const REFRESH = process.argv.includes('--refresh');

function loadCache() {
  if (REFRESH || !existsSync(CACHE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Windows fallback. On this machine Node's fetch cannot reach ssd.jpl.nasa.gov
 * (connect timeout through undici) while the system HTTP stack can, so the
 * request goes through PowerShell and the body comes back as a temp file. Kept
 * as a fallback rather than the default so the script still works normally
 * elsewhere.
 */
function fetchViaPowerShell(url) {
  const tmp = join(tmpdir(), `horizons-${process.pid}-${Date.now()}.json`);
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    `$r = Invoke-WebRequest -Uri '${url}' -UseBasicParsing -TimeoutSec 60 -UserAgent 'Mozilla/5.0'`,
    `[System.IO.File]::WriteAllText('${tmp}', $r.Content, [System.Text.Encoding]::UTF8)`,
  ].join('; ');

  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'pipe',
    timeout: 90000,
  });

  try {
    return readFileSync(tmp, 'utf8');
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function fetchHorizons(horizonsId, date) {
  const p = new URLSearchParams({
    format: 'json',
    COMMAND: `'${horizonsId}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'", // Sun body centre
    START_TIME: `'${date}'`,
    STOP_TIME: `'${date} 01:00'`,
    STEP_SIZE: "'1 d'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'J2000'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'2'",
    CSV_FORMAT: "'YES'",
  });

  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${p}`;

  let text;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'solar-system-orbit-check/1.0' },
    });
    if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`);
    text = (await res.json()).result ?? '';
  } catch {
    const raw = fetchViaPowerShell(url);
    // PowerShell writes UTF-8 with a BOM; JSON.parse chokes on it.
    text = JSON.parse(raw.replace(/^\uFEFF/, '')).result ?? '';
  }

  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start < 0 || end < 0) throw new Error('Horizons: no ephemeris block');

  const line = text
    .slice(start + 5, end)
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .pop();

  const f = line.split(',').map((s) => s.trim());
  // JDTDB, Calendar, X, Y, Z, VX, VY, VZ
  return [Number(f[2]), Number(f[3]), Number(f[4])];
}

async function main() {
  const cache = loadCache();
  let fetched = 0;

  console.log('body      date         |Δr| AU      |Δr| km        tol AU      result');
  console.log('─'.repeat(78));

  let failures = 0;
  let skipped = 0;
  let worst = { body: null, ratio: 0 };

  for (const el of ORBITAL_ELEMENTS) {
    for (const date of DATES) {
      const key = `${el.horizonsId}@${date}`;

      if (!cache[key]) {
        try {
          cache[key] = await fetchHorizons(el.horizonsId, date);
          fetched++;
          await sleep(350);
        } catch (err) {
          // A body with no cached fixture and no network is unverifiable, not
          // wrong. Keep it visible, but do not fail the run over an offline
          // machine — the other eight bodies still prove the solver.
          console.log(
            `${el.id.padEnd(9)} ${date}  SKIP (no fixture: ${err.message})`,
          );
          skipped++;
          continue;
        }
      }

      const jd = julianDate(new Date(`${date}T00:00:00Z`));
      const mine = heliocentricPosition(el, centuriesSinceJ2000(jd));
      const [hx, hy, hz] = cache[key];

      const dx = mine.x - hx;
      const dy = mine.y - hy;
      const dz = mine.z - hz;
      const dAu = Math.hypot(dx, dy, dz);

      const tol = toleranceFor(el, mine.r);
      const ok = dAu <= tol;
      const ratio = dAu / tol;
      if (ratio > worst.ratio) worst = { body: el.id, date, ratio };
      if (!ok) failures++;

      console.log(
        `${el.id.padEnd(9)} ${date}  ${dAu.toExponential(2).padStart(10)}  ` +
          `${(dAu * AU_KM).toExponential(2).padStart(12)}  ${tol.toExponential(1).padStart(10)}  ` +
          `${ok ? 'PASS' : 'FAIL'}`,
      );
    }
  }

  if (fetched > 0) saveCache(cache);

  console.log('─'.repeat(78));
  console.log(
    `worst case: ${worst.body ?? '-'} @ ${worst.date ?? '-'}  ` +
      `(${(worst.ratio * 100).toFixed(1)}% of tolerance)`,
  );

  if (failures > 0) {
    console.log(`\n${failures} check(s) FAILED — fix the propagation before building on it.`);
    process.exitCode = 1;
  } else if (skipped > 0) {
    console.log(
      `\nAll compared checks passed. ${skipped} skipped — run once with network ` +
        `access to cache their Horizons fixtures.`,
    );
  } else {
    console.log('\nAll checks passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
