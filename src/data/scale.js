/**
 * Scale compression.
 *
 * True scale is unviewable: at a size where Mercury is visible, Neptune is four
 * kilometres away; at a size where Neptune fits on screen, Mercury is a
 * sub-pixel dot. Every solar system visualisation picks a lie, so this one names
 * its lies explicitly instead of hiding them.
 *
 * `visual` is the default. Exponents chosen so the inner planets stay
 * distinguishable (the classic failure mode of log scales) while the whole
 * system fits in one frame.
 */

const EARTH_RADIUS_KM = 6371;

export const SCALE_MODES = {
  visual: {
    id: 'visual',
    label: '压缩比例',
    note: '距离与半径都做了幂律压缩，不是真实比例',
    orbit: (au) => 34 + 15 * Math.pow(au, 0.62),
    radius: (km) => 1.3 * Math.pow(km / EARTH_RADIUS_KM, 0.4),
  },

  log: {
    id: 'log',
    label: '对数比例',
    note: '距离取对数，内外行星间距被压得更均匀',
    // Fitted so Mercury lands at ~30 and Neptune at ~168, same endpoints as
    // `visual` but with a gentler falloff near the Sun.
    orbit: (au) => 60 + 31.7 * Math.log(Math.max(au, 0.05)),
    radius: (km) => 1.3 * Math.pow(km / EARTH_RADIUS_KM, 0.4),
  },

  real: {
    id: 'real',
    label: '真实距离',
    note: '距离为真实比例，半径仍然放大，否则行星不可见',
    orbit: (au) => 30 * au,
    radius: (km) => 1.3 * Math.pow(km / EARTH_RADIUS_KM, 0.4),
  },
};

export function resolveScale(name) {
  return SCALE_MODES[name] ?? SCALE_MODES.visual;
}
