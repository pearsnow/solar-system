import * as THREE from 'three/webgpu';

/**
 * Procedural surface for the large moons.
 *
 * There are no public images for these bodies at usable resolution, so every
 * map here is generated: it is an impression of the terrain class (sulphur
 * plains, icy lineae, dark cratered highlands), not a reconstruction.
 *
 * Sampling is 3-D on the unit sphere, so longitude seams and poles are continuous
 * by construction — an equirect 2-D noise would pinch at both poles.
 */

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Integer lattice hash. The previous version used three `Math.sin` calls per
// corner — 8 corners per noise sample, a dozen samples per pixel — which made
// the generator stall for a noticeable beat when a moon was selected.
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smoothstep(0, 1, x - xi), v = smoothstep(0, 1, y - yi), w = smoothstep(0, 1, z - zi);
  const lerp = (p, q, t) => p + (q - p) * t;
  const plane = (k) =>
    lerp(
      lerp(hash3(xi, yi, zi + k), hash3(xi + 1, yi, zi + k), u),
      lerp(hash3(xi, yi + 1, zi + k), hash3(xi + 1, yi + 1, zi + k), u),
      v,
    );
  return lerp(plane(0), plane(1), w);
}

function fbm(p, frequency, octaves) {
  let sum = 0, amplitude = 0.5, norm = 0, f = frequency;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise3(p.x * f + 17.3 * o, p.y * f + 31.7 * o, p.z * f + 11.9 * o);
    norm += amplitude;
    amplitude *= 0.5;
    f *= 2.07;
  }
  return sum / norm;
}

// 1 on the ridge of the field, 0 in the troughs: gives thin lineae and crater rims.
function ridged(p, frequency, octaves) {
  return 1 - Math.abs(fbm(p, frequency, octaves) * 2 - 1);
}

const STYLES = {
  // Sulphur plains with dark volcanic patches and darkened poles.
  'jupiter-io': {
    light: [243, 206, 118],
    dark: [92, 48, 27],
    accent: [252, 246, 205],
    shade(p, lat) {
      const broad = fbm(p, 2.2, 3);
      const mid = fbm(p, 7.0, 4);
      const fine = fbm(p, 22.0, 2);
      let amount = 0.14 + (broad - 0.5) * 1.15 + (mid - 0.5) * 0.5;
      amount += Math.max(0, fine - 0.66) * 1.9;
      amount += smoothstep(0.55, 0.99, Math.abs(lat)) * 0.5;
      return clamp01(amount);
    },
    // A handful of fresh sulphur deposits read as bright speckles.
    accentAt(p) {
      return Math.pow(smoothstep(0.7, 0.93, fbm(p, 30.0, 2)), 2) * 0.7;
    },
  },

  // Almost white ice cut by reddish-brown fractures.
  'jupiter-europa': {
    light: [233, 231, 222],
    dark: [138, 96, 74],
    shade(p) {
      const line = ridged(p, 5.0, 4);
      const mottle = fbm(p, 3.0, 2);
      return clamp01(0.05 + (mottle - 0.5) * 0.25 + Math.pow(smoothstep(0.72, 0.96, line), 2) * 0.6);
    },
  },

  // Dark cratered terrain broken up by brighter grooved bands.
  'jupiter-ganymede': {
    light: [176, 161, 143],
    dark: [74, 67, 62],
    shade(p, lat) {
      const broad = fbm(p, 3.4, 4);
      const fine = fbm(p, 13.0, 3);
      let amount = 0.3 + (broad - 0.5) * 0.9 + (fine - 0.5) * 0.35;
      // Bright polar frost caps.
      amount -= smoothstep(0.72, 0.99, Math.abs(lat)) * 0.3;
      return clamp01(amount);
    },
  },

  // Callisto is the most heavily cratered body in the system: bright ejecta dots.
  'jupiter-callisto': {
    light: [138, 126, 114],
    dark: [58, 53, 49],
    accent: [214, 208, 198],
    shade(p) {
      const broad = fbm(p, 4.0, 4);
      return clamp01(0.45 + (broad - 0.5) * 0.7);
    },
    accentAt(p) {
      return Math.pow(smoothstep(0.74, 0.95, fbm(p, 26.0, 2)), 2) * 0.85;
    },
  },

  // Orange haze, deliberately low contrast: the surface is not visible at all.
  'saturn-titan': {
    light: [214, 156, 78],
    dark: [150, 96, 48],
    shade(p) {
      return clamp01(0.2 + (fbm(p, 2.2, 3) - 0.5) * 0.4);
    },
  },

  'saturn-enceladus': {
    light: [238, 241, 244],
    dark: [176, 186, 196],
    shade(p) {
      return clamp01(0.08 + (fbm(p, 4.5, 3) - 0.5) * 0.35);
    },
  },

  'neptune-triton': {
    light: [214, 205, 198],
    dark: [120, 112, 116],
    shade(p, lat) {
      // Triton's southern cap is frostier than the rest.
      return clamp01(0.2 + (fbm(p, 5.0, 3) - 0.5) * 0.5 - smoothstep(0.3, 0.95, -lat) * 0.25);
    },
  },
};

export function createMoonTexture(moon) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);

  const style = STYLES[moon.id];
  const base = new THREE.Color(moon.color || '#aaaaaa');
  const to255 = (c) => [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];

  const light = style?.light ?? to255(base);
  const dark = style?.dark ?? light.map((v) => v * 0.72);
  const accent = style?.accent ?? null;

  const p = new THREE.Vector3();

  for (let y = 0; y < canvas.height; y++) {
    const lat = Math.PI * (0.5 - y / (canvas.height - 1));
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);

    for (let x = 0; x < canvas.width; x++) {
      const lon = (2 * Math.PI * x) / (canvas.width - 1);
      p.set(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon));

      const amount = style ? style.shade(p, sinLat) : 0.35 + (fbm(p, 4, 3) - 0.5) * 0.8;
      const glow = style?.accentAt ? style.accentAt(p) : 0;

      const offset = (y * canvas.width + x) * 4;
      for (let k = 0; k < 3; k++) {
        let value = light[k] * (1 - amount) + dark[k] * amount;
        if (accent && glow > 0) value += (accent[k] - value) * glow;
        image.data[offset + k] = value;
      }
      image.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
