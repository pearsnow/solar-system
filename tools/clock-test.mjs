/**
 * Clock correctness tests. No browser, no three.js — `src/sim/clock.js` has no
 * rendering dependencies, so the date logic can be pinned down exactly.
 *
 * The bug this guards against: `isoDate` used `toISOString()`, i.e. the UTC
 * calendar date. In UTC+8 that shows "yesterday" between 00:00 and 08:00 local.
 */

import assert from 'node:assert/strict';
import { SimClock, localISODate } from '../src/sim/clock.js';

const pad = (n) => String(n).padStart(2, '0');
const localParts = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let checks = 0;

// 1. isoDate follows the viewer's timezone, not UTC.
//    Sampled every 3 hours so at least one instant straddles a date boundary
//    for any whole-hour offset.
let sawDifference = false;

for (let hour = 0; hour < 24; hour += 3) {
  const instant = new Date(Date.UTC(2026, 10, 5, hour, 30));
  const clock = new SimClock(instant, 0);

  assert.equal(
    clock.isoDate,
    localParts(instant),
    `isoDate must be the local date at ${instant.toISOString()}`,
  );
  checks++;

  if (clock.isoDate !== instant.toISOString().slice(0, 10)) sawDifference = true;
}

assert.ok(
  sawDifference,
  'expected at least one instant where the local and UTC dates differ',
);
checks++;

// 2. A picked calendar date round-trips unchanged.
//    This is what the date input does: parse local midnight, format back.
const picked = new Date('1969-07-20T00:00:00');
const clock = new SimClock(picked, 0);
assert.equal(clock.isoDate, '1969-07-20');
checks++;

// 3. Julian Date anchor. J2000.0 is 2000-01-01T12:00:00Z == JD 2451545.0.
const j2000 = new SimClock(new Date('2000-01-01T12:00:00Z'), 0);
assert.ok(
  Math.abs(j2000.julianDate - 2451545.0) < 1e-9,
  `J2000 must be 2451545.0, got ${j2000.julianDate}`,
);
checks++;

// 4. Advancing is exact: one day of simulated time moves JD by exactly 1.
const running = new SimClock(new Date('2026-11-05T00:00:00Z'), 1);
const before = running.julianDate;
running.update(1); // 1 real second × 1 day/second
assert.ok(Math.abs(running.julianDate - before - 1) < 1e-9, 'JD must advance by 1 per simulated day');
checks++;

// 5. A paused clock does not move.
running.playing = false;
const frozen = running.julianDate;
running.update(100);
assert.equal(running.julianDate, frozen);
checks++;

// 6. localISODate default argument is "right now", zero-padded.
const now = new Date();
assert.equal(localISODate(), localParts(now));
assert.match(localISODate(new Date(2026, 0, 5)), /^2026-01-05$/);
checks += 2;

console.log(`clock: ${checks} checks passed`);
console.log(`  timezone offset: UTC${-new Date().getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-new Date().getTimezoneOffset() / 60}`);
