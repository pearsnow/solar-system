/**
 * Simulation clock.
 *
 * Holds a wall-clock instant and advances it at a configurable rate. Decoupled
 * from rendering so a 10x speed-up or a jump to 1969 costs nothing but a number.
 */

const MS_PER_DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');

/**
 * Calendar date in the viewer's own timezone, as YYYY-MM-DD.
 *
 * `toISOString()` would give the UTC date instead: at 00:30 in UTC+8 that is
 * still "yesterday", so the HUD and the date picker disagreed with the user's
 * calendar. The orbit maths stays on absolute instants; only the label and the
 * picker round-trip through a calendar date.
 */
export function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class SimClock {
  /**
   * @param {Date} [date] initial instant
   * @param {number} [daysPerSecond] simulated days per real second
   */
  constructor(date = new Date(), daysPerSecond = 1) {
    this.time = date;
    this.daysPerSecond = daysPerSecond;
    this.playing = true;
  }

  /** Advance by `dt` real seconds. */
  update(dt) {
    if (!this.playing || this.daysPerSecond === 0) return;
    this.time = new Date(this.time.getTime() + dt * this.daysPerSecond * MS_PER_DAY);
  }

  setDate(date) {
    this.time = date instanceof Date ? date : new Date(date);
  }

  /** Signed Julian Date, for the orbit solver. */
  get julianDate() {
    return this.time.getTime() / MS_PER_DAY + 2440587.5;
  }

  get isoDate() {
    return localISODate(this.time);
  }
}

/** Speed presets, in simulated days per real second. */
export const SPEED_PRESETS = [
  { label: '1 秒 = 1 小时', daysPerSecond: 1 / 24 },
  { label: '1 秒 = 1 天', daysPerSecond: 1 },
  { label: '1 秒 = 1 周', daysPerSecond: 7 },
  { label: '1 秒 = 1 月', daysPerSecond: 30 },
  { label: '1 秒 = 1 年', daysPerSecond: 365 },
  { label: '1 秒 = 10 年', daysPerSecond: 3650 },
];
