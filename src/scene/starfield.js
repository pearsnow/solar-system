import * as THREE from 'three/webgpu';
import { resolveTextureLevel } from '../quality.js';

/**
 * Milky Way background.
 *
 * Used as `scene.background` rather than a sky sphere: one texture, always
 * behind everything, and nothing to keep in sync with the camera's far plane.
 */
export async function createStarfield({ tier, anisotropy }) {
  const level = resolveTextureLevel(tier.key, '8k');
  const loader = new THREE.TextureLoader();

  const texture = await loader.loadAsync(
    `${import.meta.env.BASE_URL}textures/${level}/sky/milkyway.jpg`,
  );

  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;

  return texture;
}
