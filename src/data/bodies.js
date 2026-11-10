/**
 * Celestial body catalogue.
 *
 * Static facts only. Nothing here knows about three.js or pixels: orbital
 * elements live in elements.js, scale compression lives in scale.js, and the
 * renderer turns these numbers into geometry.
 *
 * radiusKm      mean radius, used by the radius compression curve
 * rotationHours signed sidereal rotation period
 * pole IAU north pole [right ascension, declination] in ICRF/J2000 degrees;
 *      determines rendering orientation, while axialTilt remains an informational value
 * w0 IAU prime meridian [degrees at J2000, degrees per day]
 * axialTilt     obliquity in degrees, 0 = axis aligned with ecliptic north
 * textures      filenames inside textures/<level>/<id>/
 * textureLevel  highest level the *source material* supports. Uranus and
 *               Neptune top out at 2k on solarsystemscope; upscaling them would
 *               cost 4x the VRAM for zero extra information.
 * features      which shader branches to build; omitted entries cost nothing
 * color         tint for the orbit line
 */

export const SUN = {
  id: 'sun',
  name: 'Sun',
  nameZh: '太阳',
  radiusKm: 696340,
  rotationHours: 609.12,
  axialTilt: 7.25,
  pole: [286.13, 63.87],
  w0: [84.176, 14.1844],
  color: '#ffcc66',
  textures: { day: 'day.jpg' },
  textureLevel: '4k',
  features: {
    surface: { tint: [1.02, 0.94, 0.86], flow: 0.05, contrast: 0.14 },
    glow: { scale: 2.4, strength: 0.85 },
  },
};

export const MERCURY = {
  id: 'mercury',
  name: 'Mercury',
  nameZh: '水星',
  radiusKm: 2439.7,
  rotationHours: 1407.6,
  axialTilt: 0.034,
  pole: [281.0103, 61.4155],
  w0: [329.5988, 6.1385108],
  color: '#8c8279',
  textures: { day: 'day.jpg' },
  textureLevel: '8k',
  features: { roughness: { min: 0.85, max: 1.0 } },
};

export const VENUS = {
  id: 'venus',
  name: 'Venus',
  nameZh: '金星',
  radiusKm: 6051.8,
  rotationHours: -5832.5,
  axialTilt: 177.36,
  pole: [272.76, 67.16],
  w0: [160.20, -1.4813688],
  color: '#e0c196',
  textures: { day: 'day.jpg' },
  textureLevel: '4k',
  features: {
    // Venus is permanently cloud-covered; a thin haze shell sells the glow.
    atmosphere: { day: '#ffd9a0', twilight: '#c98a3c', rim: 0.22 },
    roughness: { min: 0.7, max: 0.95 },
  },
};

export const EARTH = {
  id: 'earth',
  name: 'Earth',
  nameZh: '地球',
  radiusKm: 6371,
  rotationHours: 23.9345,
  axialTilt: 23.44,
  pole: [0, 90],
  w0: [190.147, 360.9856235],
  color: '#4f7fb5',

  textures: {
    day: 'day.jpg',
    night: 'night.jpg',
    normal: 'normal.jpg',
    clouds: 'clouds.jpg',
    rough: 'rough.jpg',
  },
  textureLevel: '8k',

  features: {
    atmosphere: { day: '#4db2ff', twilight: '#bc490b', rim: 0.38 },
    nightLights: { intensity: 1.0 },
    clouds: { opacity: 0.9 },
    normalMap: { scale: 1.0 },
    roughness: { min: 0.32, max: 0.95 },
  },

};

export const MARS = {
  id: 'mars',
  name: 'Mars',
  nameZh: '火星',
  radiusKm: 3389.5,
  rotationHours: 24.6229,
  axialTilt: 25.19,
  pole: [317.6813, 52.8869],
  w0: [176.049, 350.891982443297],
  color: '#c1440e',
  textures: { day: 'day.jpg' },
  textureLevel: '8k',
  features: {
    atmosphere: { day: '#ff9c6b', twilight: '#7a2d12', rim: 0.12 },
    roughness: { min: 0.75, max: 0.98 },
  },
};

export const JUPITER = {
  id: 'jupiter',
  name: 'Jupiter',
  nameZh: '木星',
  radiusKm: 69911,
  rotationHours: 9.925,
  axialTilt: 3.13,
  pole: [268.056595, 64.495303],
  w0: [284.95, 870.536],
  color: '#d8ca9d',
  textures: { day: 'day.jpg' },
  textureLevel: '4k',
  features: { roughness: { min: 0.75, max: 0.95 } },
};

export const SATURN = {
  id: 'saturn',
  name: 'Saturn',
  nameZh: '土星',
  radiusKm: 58232,
  rotationHours: 10.656,
  axialTilt: 26.73,
  pole: [40.589, 83.537],
  w0: [38.90, 810.7939024],
  color: '#ead6b8',
  textures: { day: 'day.jpg', ring: 'ring.png' },
  textureLevel: '4k',
  features: { roughness: { min: 0.75, max: 0.95 } },
  // Radii in Saturn radii: D ring inner edge to F ring outer edge.
  rings: { inner: 1.15, outer: 2.42, opacity: 0.95 },
};

export const URANUS = {
  id: 'uranus',
  name: 'Uranus',
  nameZh: '天王星',
  radiusKm: 25362,
  rotationHours: -17.24,
  axialTilt: 97.77,
  pole: [257.311, -15.175],
  w0: [203.81, -501.1600928],
  color: '#b5e3e3',
  textures: { day: 'day.jpg' },
  textureLevel: '2k',
  features: {
    // Voyager 2 saw a nearly featureless disc and JPL's own texture map is
    // literally one flat colour. The procedural banding supplies the structure
    // the photograph never had, at the correct extremely low contrast.
    bands: { strength: 0.05, speed: 0.004, freq: 5.0 },
    atmosphere: { day: '#a8e0e2', twilight: '#3f7f8c', rim: 0.2 },
    roughness: { min: 0.8, max: 0.95 },
  },
};

export const NEPTUNE = {
  id: 'neptune',
  name: 'Neptune',
  nameZh: '海王星',
  radiusKm: 24622,
  rotationHours: 16.11,
  axialTilt: 28.32,
  pole: [299.36, 43.46],
  w0: [253.18, 536.3128492],
  color: '#4b70dd',
  textures: { day: 'day.jpg' },
  textureLevel: '2k',
  features: {
    bands: { strength: 0.14, speed: 0.006, freq: 7.0 },
    atmosphere: { day: '#6c9bff', twilight: '#2b3f8f', rim: 0.24 },
    roughness: { min: 0.8, max: 0.95 },
  },
};

/**
 * The Moon.
 *
 * Not a planet: it has no atmosphere and no night map, and it is positioned by
 * its own orbital elements rather than the heliocentric set in elements.js.
 */
export const MOON = {
  id: 'moon',
  name: 'Moon',
  nameZh: '月球',
  radiusKm: 1737.4,
  rotationHours: 655.7, // tidally locked: one rotation per orbit
  axialTilt: 6.68,
  pole: [269.9949, 66.5392],
  w0: [38.3213, 13.17635815],
  color: '#bdbdbd',
  textures: { day: 'day.jpg' },
  textureLevel: '8k',
  features: { roughness: { min: 0.9, max: 1.0 } },
};

/** Ordered outward from the Sun, matching ORBITAL_ELEMENTS. */
export const PLUTO = {
  id: 'pluto', name: 'Pluto', nameZh: '冥王星', radiusKm: 1188.3,
  rotationHours: -153.2928, axialTilt: 122.53, pole: [132.993, -6.163], w0: [302.695, 56.3625225], color: '#c7afa0',
  textures: {}, textureLevel: '2k', features: { procedural: 'pluto' },
};

export const SOLAR_BODIES = [  MERCURY,
  VENUS,
  EARTH,
  MARS,
  JUPITER,
  SATURN,
  URANUS,
  NEPTUNE,
  PLUTO,
];

export const BODIES = SOLAR_BODIES;
