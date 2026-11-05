import * as THREE from 'three/webgpu';
import {
  abs,
  dot,
  float,
  length,
  max,
  positionLocal,
  smoothstep,
  sqrt,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * Planetary rings.
 *
 * The source map is a 1-D radial strip: every row of `8k_saturn_ring_alpha.png`
 * is identical, so u is radius and v carries nothing.
 *
 * The radial coordinate is computed per fragment from the local position rather
 * than baked into the geometry's UV attribute. Writing it per vertex produced a
 * visible dither: the attribute is interpolated across very long thin triangles
 * and the interpolation error shows up as a lattice once the strip is minified.
 * Deriving it in the shader is exact everywhere and costs two instructions.
 *
 * The planet's shadow is solved analytically instead of using a shadow map. A
 * point light would need a cube shadow map (six passes) for one visual detail;
 * intersecting the shadow ray with the planet sphere gives an exact answer for
 * free. The planet is the unit sphere here, because everything lives in the
 * body's local space.
 */
export function createRings({ spec, map }) {
  const inner = spec.inner ?? 1.15;
  const outer = spec.outer ?? 2.42;
  const segments = spec.segments ?? 256;

  const geometry = new THREE.RingGeometry(inner, outer, segments, 8);
  // RingGeometry is built in the XY plane; lay it down in XZ, which is the
  // planet's equatorial plane once the tilt group does its job.
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const uSunLocal = uniform(new THREE.Vector3(0, 1, 0));
  const uOpacity = uniform(spec.opacity ?? 0.95);

  const p = positionLocal;

  // Radius in body radii → the strip's u coordinate.
  const radial = length(p.xz);
  const u = radial.sub(inner).div(outer - inner).clamp(0, 1);

  const mapNode = texture(map, vec2(u, 0.5));

  // Ray from the ring point toward the sun, intersected with the unit sphere.
  const pDotL = dot(p, uSunLocal);
  const radiusSq = dot(p, p);
  const disc = pDotL.mul(pDotL).sub(radiusSq).add(1.0);
  const root = sqrt(max(disc, 0.0));
  const tNear = pDotL.negate().sub(root);

  // Soft penumbra: the discriminant shrinks to zero right at the shadow edge.
  const inShadow = smoothstep(0.0, 0.12, disc).mul(smoothstep(0.0, 0.08, tNear));
  const shadow = float(1.0).sub(inShadow.mul(0.85));

  // Ring brightness rises with the sun's elevation over the ring plane. The
  // floor keeps the rings visible during the near-edge-on years instead of
  // letting them vanish entirely.
  const elevation = abs(uSunLocal.y).mul(0.5).add(0.68);

  // Slight warm bias: the strip's source colour is neutral grey, real rings are
  // pale gold.
  const tint = vec3(1.16, 1.02, 0.86);

  material.outputNode = vec4(
    mapNode.rgb.mul(tint).mul(elevation).mul(shadow).mul(1.25),
    mapNode.a.mul(uOpacity),
  );

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rings';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.userData.sunLocal = uSunLocal;

  return mesh;
}
