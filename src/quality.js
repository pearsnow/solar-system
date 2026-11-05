/**
 * Quality tiers and GPU probing.
 *
 * The texture sets are built by tools/build-textures.py. Every tier ships the
 * same five maps, only the resolution changes. We never upscale a tier: an 8K
 * source stretched to 16K costs 4x the VRAM and looks identical, so the tier
 * is always a hard ceiling derived from the actual source material.
 */

export const TIERS = {
  '8k': { dir: 'textures/8k', width: 8192, segments: 256, label: '8K · 8192×4096' },
  '4k': { dir: 'textures/4k', width: 4096, segments: 160, label: '4K · 4096×2048' },
  '2k': { dir: 'textures/2k', width: 2048, segments: 128, label: '2K · 2048×1024' },
};

const ORDER = ['8k', '4k', '2k'];

/** Hard cap: we never exceed what a single texture can hold anyway. */
const HARD_CAP = 16384;

/**
 * Choose the best texture level both the GPU tier and the source material allow.
 *
 * The source site's `8k_` filenames are unreliable: 8k_sun, 8k_jupiter and
 * 8k_saturn are actually 4096x2048. Only bodies whose sources are genuinely
 * 8192 may report `8k` here, otherwise the loader would request a directory
 * that was never written.
 */
export function resolveTextureLevel(tierKey, nativeKey) {
  const a = ORDER.indexOf(tierKey);
  const b = ORDER.indexOf(nativeKey);
  return ORDER[Math.max(a < 0 ? 0 : a, b < 0 ? 0 : b)];
}

async function probeMaxTextureSize() {
  // WebGPU exposes the real adapter limit (RTX 50xx reports 32768).
  try {
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        const limit = adapter.limits?.maxTextureDimension2D;
        const info = adapter.info ?? {};
        const name = info.description || info.device || '';
        if (limit) return { limit, backend: 'webgpu', gpuName: name };
      }
    }
  } catch {
    /* fall through to WebGL2 */
  }

  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (limit) return { limit, backend: 'webgl2', gpuName: String(name ?? '') };
    }
  } catch {
    /* fall through */
  }

  return { limit: 2048, backend: 'unknown', gpuName: '' };
}

/**
 * A 610M-class iGPU can technically allocate an 8K texture but will drop to a
 * slideshow doing it. Laptops with hybrid graphics hand the browser whichever
 * adapter Windows prefers, so this guard is not theoretical.
 */
const WEAK_GPU = /610M|620M|UHD Graphics|Iris|Vega \d|Integrated|SwiftShader|llvmpipe/i;

/**
 * @param {URLSearchParams} params
 * @returns {Promise<{key: string, dir: string, width: number, segments: number,
 *   label: string, backend: string, maxTextureSize: number, forced: boolean}>}
 */
export async function pickQuality(params) {
  const { limit, backend, gpuName } = await probeMaxTextureSize();

  // Hard ceiling: what the texture unit can actually hold.
  const cap = Math.min(limit, HARD_CAP);

  // Softer ceiling used only for *automatic* selection. A forced tier is an
  // explicit instruction and is honoured as long as the hardware can take it.
  const weak = WEAK_GPU.test(gpuName);
  const autoCap = weak ? Math.min(cap, 4096) : cap;

  const requested = (params.get('q') || '').toLowerCase();
  const forced = ORDER.includes(requested);

  let key = forced
    ? requested
    : ORDER.find((k) => TIERS[k].width <= autoCap) ?? '2k';

  // Forcing a tier the GPU literally cannot allocate would fail at texture
  // upload with a confusing error, so that case still gets clamped.
  if (TIERS[key].width > cap) key = ORDER.find((k) => TIERS[k].width <= cap) ?? '2k';

  return {
    key,
    ...TIERS[key],
    backend,
    gpuName,
    weak,
    maxTextureSize: limit,
    forced,
  };
}
