/**
 * J2000 Keplerian elements, valid 1800 AD – 2050 AD.
 *
 * Source: E. M. Standish, "Keplerian Elements for Approximate Positions of the
 * Major Planets" (JPL), table 1. Each element is `[value at J2000, rate per
 * Julian century]`. Angles in degrees, semi-major axis in AU.
 *
 * Accuracy is arcminute-class across the validity window, which is ~1e-4 AU for
 * the inner planets and a few 1e-3 AU for the giants. That is the *data* floor;
 * anything worse than that in tools/verify-orbits.mjs is an implementation bug.
 *
 * `peri` is the longitude of perihelion (ϖ), `node` the longitude of the
 * ascending node (Ω). Earth's entry is the Earth–Moon barycentre, not the
 * Earth's own centre — they differ by up to ~4700 km.
 */

export const AU_KM = 149597870.7;
export const J2000_JD = 2451545.0;

export const ORBITAL_ELEMENTS = [
  {
    id: 'mercury',
    horizonsId: '199',
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    i: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    peri: [77.45779628, 0.16047689],
    node: [48.33076593, -0.12534081],
  },
  {
    id: 'venus',
    horizonsId: '299',
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    i: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    peri: [131.60246718, 0.00268329],
    node: [76.67984255, -0.27769418],
  },
  {
    id: 'earth',
    horizonsId: '3', // Earth–Moon barycentre
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    i: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    peri: [102.93768193, 0.32327364],
    node: [0.0, 0.0],
  },
  {
    id: 'mars',
    horizonsId: '499',
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    i: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    peri: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
  },
  {
    id: 'jupiter',
    horizonsId: '599',
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    i: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    peri: [14.72847983, 0.21252668],
    node: [100.47390909, 0.20469106],
  },
  {
    id: 'saturn',
    horizonsId: '699',
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    i: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    peri: [92.59887831, -0.41897216],
    node: [113.66242448, -0.28867794],
  },
  {
    id: 'uranus',
    horizonsId: '799',
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    i: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    peri: [170.9542763, 0.40805281],
    node: [74.01692503, 0.04240589],
  },
  {
    id: 'neptune',
    horizonsId: '899',
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    i: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    peri: [44.96476227, -0.32241464],
    node: [131.78422574, -0.00508664],
  },
];
