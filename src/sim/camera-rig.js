import * as THREE from 'three/webgpu';

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Camera rig: smooth focus flights plus a follow mode.
 *
 * Focusing keeps the current viewing direction and only changes distance — a
 * straight-line fly-to would swing the camera through the scene and lose the
 * user's sense of where they are.
 *
 * Once the flight ends the rig rides along with the body: every frame it applies
 * the body's own displacement to both the camera and the orbit target, so a
 * planet orbiting the Sun does not slide out of frame at high time speeds.
 */
export class CameraRig {
  constructor({ camera, controls, home, duration = 1.3 }) {
    this.camera = camera;
    this.controls = controls;
    this.home = { position: home.position.clone(), target: home.target.clone() };
    this.duration = duration;

    this.mode = 'idle'; // idle | flight | follow
    this.entry = null;
    this.elapsed = 0;

    this.fromPosition = new THREE.Vector3();
    this.fromTarget = new THREE.Vector3();
    this.endOffset = new THREE.Vector3();
    this.lastTargetPosition = new THREE.Vector3();

    this._target = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._delta = new THREE.Vector3();
  }

  /** Start a flight toward an entry (`{ group, radius }`). */
  focus(entry, { distanceFactor = 5.5, minDistance = 0.9 } = {}) {
    const target = entry.group.getWorldPosition(this._target);
    const distance = Math.max(entry.radius * distanceFactor, minDistance);

    this.entry = entry;
    this.fromPosition.copy(this.camera.position);
    this.fromTarget.copy(this.controls.target);
    this.endOffset.copy(this.camera.position).sub(target).normalize().multiplyScalar(distance);
    this.lastTargetPosition.copy(target);
    this.elapsed = 0;
    this.mode = 'flight';
  }

  /** Fly back to the system overview. */
  reset() {
    this.entry = null;
    this.fromPosition.copy(this.camera.position);
    this.fromTarget.copy(this.controls.target);
    this.endOffset.copy(this.home.position).sub(this.home.target);
    this.elapsed = 0;
    this.mode = 'flight';
  }

  get focusedId() {
    return this.entry?.id ?? null;
  }

  update(dt) {
    if (this.mode === 'flight') {
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      const k = easeInOutCubic(this.elapsed / this.duration);

      const target = this.entry
        ? this.entry.group.getWorldPosition(this._target)
        : this._target.copy(this.home.target);

      this._desired.copy(target).add(this.endOffset);

      this.camera.position.lerpVectors(this.fromPosition, this._desired, k);
      this.controls.target.lerpVectors(this.fromTarget, target, k);
      this.lastTargetPosition.copy(target);

      if (this.elapsed >= this.duration) {
        this.mode = this.entry ? 'follow' : 'idle';
      }
      return;
    }

    if (this.mode === 'follow' && this.entry) {
      const target = this.entry.group.getWorldPosition(this._target);
      this._delta.copy(target).sub(this.lastTargetPosition);

      if (this._delta.lengthSq() > 0) {
        this.camera.position.add(this._delta);
        this.controls.target.add(this._delta);
      }
      this.lastTargetPosition.copy(target);
    }
  }
}
