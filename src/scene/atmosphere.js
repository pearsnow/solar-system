import * as THREE from 'three/webgpu';
import {
  clamp,
  dot,
  length,
  max,
  mix,
  positionLocal,
  sqrt,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * Atmospheric glow.
 *
 * Learned the hard way: a sphere shell can never produce a soft halo. Its
 * silhouette is a hard circle, and any falloff written against the shell radius
 * collapses into a fraction of a pixel because the surface turns parallel to the
 * view exactly there. The result always reads as a sticker outline.
 *
 * A camera-facing quad solves it: radius varies linearly across the surface, so
 * the gradient is genuinely smooth. The quad sits at the body's centre depth, so
 * the opaque globe occludes the middle and only the ring outside the limb
 * survives. A virtual unit-sphere normal is reconstructed from that radius,
 * which keeps the halo orange near the terminator.
 *
 * The radius is measured in `positionLocal`, not view space, so the whole thing
 * stays correct when the parent group is scaled to the body's display radius.
 */
const GLOW_RADIUS = 1.1;

export function createAtmosphere({ uniforms }) {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // The billboard copies the camera quaternion, which points the quad's +Z
    // away from the camera, so its front face is the one we never see.
    side: THREE.DoubleSide,
  });

  // Sun direction in view space. Cheaper and far more portable than
  // transformNormalByInverseViewMatrix, which broke the WebGL2 backend's
  // uniform buffer layout.
  const uSunView = uniform(new THREE.Vector3(0, 0, -1));

  // Radius in body radii: 0 at the centre, 1 at the limb.
  const p = positionLocal.xy;
  const rr = length(p);
  const rc = clamp(rr, 0, 1);

  // Normal of a unit sphere at this screen position, in view space.
  const nz = sqrt(max(rc.mul(rc).oneMinus(), 0.0));
  const sunDot = dot(vec3(p, nz), uSunView);

  const color = mix(
    uniforms.atmosphereTwilight,
    uniforms.atmosphereDay,
    sunDot.smoothstep(-0.35, 0.6),
  );

  // 0 at the body limb, 1 at the edge of the quad.
  const u = clamp(rr.sub(1).div(GLOW_RADIUS - 1), 0, 1);
  const intensity = u
    .oneMinus()
    .pow(3.5)
    .mul(sunDot.smoothstep(-0.8, 0.35))
    .mul(0.95);

  material.outputNode = vec4(color, intensity);

  const geometry = new THREE.PlaneGeometry(GLOW_RADIUS * 2, GLOW_RADIUS * 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'atmosphere';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;

  mesh.userData.billboard = true;
  mesh.userData.sunView = uSunView;

  return mesh;
}
