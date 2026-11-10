import * as THREE from 'three/webgpu';
import { pickQuality } from './quality.js';
import { EARTH } from './data/bodies.js';
import { resolveScale } from './data/scale.js';
import { SimClock, SPEED_PRESETS } from './sim/clock.js';
import { CameraRig } from './sim/camera-rig.js';
import { centuriesSinceJ2000, heliocentricPosition, cometPosition } from './sim/orbit.js';
import { createPlanet, planetTextureBytes } from './scene/planet.js';
import { createSolarSystem } from './scene/solar-system.js';
import { createStarfield } from './scene/starfield.js';
import { pickBody } from './scene/picker.js';
import { createControls } from './controls.js';
import { createUI } from './ui/ui.js';

const params = new URLSearchParams(location.search);

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const loaderSubEl = document.getElementById('loader-sub');
const qualityEl = document.getElementById('quality');
const clockEl = document.getElementById('clock');

const MODE = params.has('earth') ? 'earth' : 'system';

function formatHours(h) {
  const abs = Math.abs(h);
  const text = abs < 72 ? `${abs.toFixed(1)} 小时` : `${(abs / 24).toFixed(1)} 天`;
  return h < 0 ? `${text}（逆行）` : text;
}

async function main() {
  const tier = await pickQuality(params);
  loaderSubEl.textContent = `${tier.label} · ${tier.backend.toUpperCase()}`;

  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: params.has('webgl'),
    reversedDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  await renderer.init();

  // The probe may find navigator.gpu while the adapter still refuses a device,
  // in which case WebGPURenderer silently drops to WebGL2. Report what actually
  // ended up running, not what we hoped for.
  const backend = (() => {
    try {
      const b = renderer.backend;
      if (b?.isWebGPUBackend) return 'WebGPU';
      if (b?.isWebGLBackend) return 'WebGL2';
    } catch {
      /* fall through */
    }
    return tier.backend === 'webgpu' ? 'WebGPU' : 'WebGL2';
  })();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  let anisotropy = 16;
  try {
    anisotropy = renderer.getMaxAnisotropy?.() ?? 16;
  } catch {
    /* keep the default */
  }

  const mode = MODE === 'earth' ? buildEarthView() : buildSystemView();

  function buildEarthView() {
    const camera = new THREE.PerspectiveCamera(
      25,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.set(4.5, 2, 3);

    const SUN_DIRECTION = new THREE.Vector3(0.9, 0.25, -0.5).normalize();

    const sun = new THREE.DirectionalLight('#ffffff', 2.8);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(10);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.015));

    const controls = createControls(camera, renderer.domElement, {
      minDistance: 1.35,
      maxDistance: 12,
    });

    let body;
    let earthJd = 2461350.5;
    // Earth view has no time-bar UI; its spacebar state is local to this view.
    let playing = true;

    return {
      togglePlay() { playing = !playing; },
      get playing() { return playing; },
      camera,
      controls,
      ready: (async () => {
        body = await createPlanet(EARTH, { tier, anisotropy, sunDirection: SUN_DIRECTION });
        scene.add(body.group);
      })(),
      update(dt, active) {
        if (playing) earthJd += dt * 0.0831;
        if (body) body.update(dt, camera, SUN_DIRECTION, earthJd);
      },
      memory: () => (body ? planetTextureBytes(body) : 0),
      hud: '',
    };
  }

  function buildSystemView() {
    const camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.01,
      backend === 'WebGL2' ? 40000 : 100000,
    );
    const scale = resolveScale(params.get('scale'));
    // `true` is linear, so framing is arithmetic, not taste. Pluto's aphelion is
    // 39.5 AU = 2369 units. A tilted circle does not project to a circle: its near
    // side is closer to the camera and therefore magnified, so the binding case
    // is not d·tan(fov/2) but max over θ of R·cosθ / (d − R·cosφ·sinθ). At d=5000
    // and 26° elevation that peaks at 0.52 against a 0.582 half-extent — an 11%
    // margin. Framing at 4400 puts the outer orbit through the frame edge.
    if (scale.id === 'true') camera.position.set(0, 2200, 4490);
    else camera.position.set(0, 200, 380);
    const clock = new SimClock(new Date());

    const controls = createControls(camera, renderer.domElement, {
      minDistance: 0.05,
      maxDistance: 30000,
    });

    const rig = new CameraRig({
      camera,
      controls,
      home: { position: camera.position.clone(), target: new THREE.Vector3(0, 0, 0) },
    });

    let system = null;
    let ui = null;
    let selectedId = null;
    let shownLevel = null;
    let lastDate = '';
    let distanceTimer = 0;

    function togglePlay() {
      clock.playing = !clock.playing;
      ui?.setPlaying(clock.playing);
    }

    function updateDistance(focusable) {
      if (focusable?.body.kind === 'comet') {
        ui.setDistance(`${cometPosition(focusable.body, clock.julianDate).r.toFixed(3)} AU`);
        return;
      }
      if (!focusable?.el) return;
      const r = heliocentricPosition(focusable.el, centuriesSinceJ2000(clock.julianDate)).r;
      ui.setDistance(`${r.toFixed(3)} AU`);
    }

    function buildInfo(focusable) {
      const spec = focusable.body;
      if (spec.kind === 'comet') {
        const period = spec.e < 1 ? `${Math.pow(spec.q / (1 - spec.e), 1.5).toFixed(2)} 年` : '非周期/双曲线';
        return { nameZh: spec.nameZh || spec.name, name: spec.name, sub: spec.name, lines: [
          ['近日点距离', `${spec.q.toFixed(4)} AU`], ['偏心率', `${spec.e.toFixed(6)}`],
          ['轨道倾角', `${spec.i.toFixed(2)}°`], ['周期', period],
          ['当前日心距', `${cometPosition(spec, clock.julianDate).r.toFixed(3)} AU`],
        ] };
      }
      if (spec.parent) {
        const parent = system.focusables.find((f) => f.id === spec.parent);
        return { nameZh: spec.nameZh, name: spec.name, sub: spec.name, lines: [
          ['半径', `${spec.radiusKm.toLocaleString('en-US')} km`],
          ['轨道半长轴', `${spec.aKm.toLocaleString('en-US')} km`],
          ['周期', `${spec.periodDays} 天`], ['偏心率', `${spec.e}`],
          ['倾角', `${spec.i}°`], ['母星', parent?.label ?? spec.parent],
        ] };
      }
      const lines = [
        ['半径', `${spec.radiusKm.toLocaleString('en-US')} km`],
        ['自转周期', formatHours(spec.rotationHours)],
        ['转轴倾角', `${spec.axialTilt.toFixed(2)}°`],
      ];

      if (focusable.el) {
        const a = Array.isArray(focusable.el.a) ? focusable.el.a[0] : focusable.el.a;
        const r = heliocentricPosition(
          focusable.el,
          centuriesSinceJ2000(clock.julianDate),
        ).r;
        lines.push(['轨道半长轴', `${a.toFixed(3)} AU`]);
        lines.push(['公转周期', `${Math.pow(a, 1.5).toFixed(2)} 年`]);
        lines.push(['当前日心距', `${r.toFixed(3)} AU`]);
      }
      lines.push(['贴图档位', focusable.level?.toUpperCase() ?? '—']);

      return {
        nameZh: spec.nameZh,
        name: spec.name,
        sub: spec.name,
        lines,
      };
    }

    function select(id) {
      if (!system || !ui) return;

      if (!id) {
        system.selectSatellite(null);
        selectedId = null;
        rig.reset();
        ui.hideInfo();
        ui.markSelected(null);
        return;
      }

      const focusable = system.focusables.find((f) => f.id === id);
      if (!focusable) return;

      selectedId = id;
      system.selectSatellite(id);
      rig.focus(focusable);
      ui.showInfo(buildInfo(focusable));
      ui.setSatellites(system.focusables.filter((f) => f.body.parent === id));
      ui.markSelected(id);
      shownLevel = focusable.level ?? null;
    }

    // ------------------------------------------------------------- interaction

    let downX = 0;
    let downY = 0;

    canvas.addEventListener('pointerdown', (event) => {
      downX = event.clientX;
      downY = event.clientY;
    });

    canvas.addEventListener('pointerup', (event) => {
      if (!system) return;
      // Ignore drags: rotating the view should never select something.
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;

      const hit = pickBody(event, camera, canvas, system.focusables);
      select(hit?.id ?? null);
    });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') select(null);
    });

    return {
      camera,
      controls,
      togglePlay,
      get playing() { return clock.playing; },
      ready: (async () => {
        system = await createSolarSystem({ tier, anisotropy, clock, scale });
        scene.add(system.root);

        // Star background. Dimmed: at full brightness the Milky Way competes
        // with the planets for attention.
        const starfield = await createStarfield({ tier, anisotropy });
        scene.background = starfield;
        scene.backgroundIntensity = 0.5;

        // Dev-only handle for the browser console and the automated tests.
        if (import.meta.env.DEV) window.__solar = system;

        ui = createUI({
          speeds: SPEED_PRESETS,
          on: {
            select,
            home: () => select(null),
            clear: () => select(null),
            togglePlay,
            speed: (index) => {
              clock.daysPerSecond = SPEED_PRESETS[index].daysPerSecond;
            },
            date: (iso) => {
              // No trailing Z: a picked calendar date means local midnight, the
              // same frame the display uses. Parsing it as UTC midnight would
              // show the previous date west of Greenwich.
              clock.setDate(new Date(`${iso}T00:00:00`));
              if (selectedId) {
                const focusable = system.focusables.find((f) => f.id === selectedId);
                updateDistance(focusable);
              }
            },
          },
        });
        ui.setPlaying(clock.playing);

        ui.setBodies(system.focusables.filter((f) => !f.body.parent && f.body.kind !== 'comet')
          .map((f) => ({
            id: f.id,
            label: f.label,
            moons: system.focusables.filter((m) => m.body.parent === f.id)
              .sort((a, b) => (a.body.aKm ?? 0) - (b.body.aKm ?? 0))
              .map((m) => ({ id: m.id, label: m.label })),
          })));
        ui.setComets(system.focusables.filter((f) => f.body.kind === 'comet'));
        ui.setDate(clock.isoDate);

        // ?look=... is still honoured, now through the same code path the UI uses.
        const lookId = params.get('look');
        if (lookId) {
          select(lookId);
          // Skip the flight animation when the page opens directly on a body.
          rig.update(10);
        }
      })(),
      update(dt, active) {
        if (!system) return;

        system.update(dt, camera);
        rig.update(dt);
        active.date = clock.isoDate;

        if (ui && clock.isoDate !== lastDate) {
          lastDate = clock.isoDate;
          ui.setDate(lastDate);
        }

        distanceTimer += dt;
        if (distanceTimer >= 0.5) {
          distanceTimer = 0;
          if (ui && selectedId) updateDistance(system.focusables.find((f) => f.id === selectedId));
        }

        // The LOD upgrade lands a beat after the flight starts; refresh the
        // panel so the texture level it reports is not stale.
        if (ui && selectedId) {
          const focusable = system.focusables.find((f) => f.id === selectedId);
          if (focusable && (focusable.level ?? null) !== shownLevel) {
            shownLevel = focusable.level ?? null;
            ui.showInfo(buildInfo(focusable));
          }
        }
      },
      memory: () => (system ? system.textureBytes() : 0),
      // The note is a full sentence; on the HUD it used to run under the planet
      // and collide with the controls hint. Label only, sentence in the tooltip.
      hud: scale.label,
      hudNote: scale.note,
    };
  }

  const gpu = tier.gpuName
    ? (() => {
        const cleaned = tier.gpuName
          .replace(/^ANGLE \(/, '')
          .replace(/\)$/, '')
          .replace(/\s+/g, ' ')
          .trim();
        return cleaned.length > 44 ? `${cleaned.slice(0, 44)}…` : cleaned;
      })()
    : 'GPU 未知';

  const formatBytes = (n) =>
    n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${Math.round(n / 1024 ** 2)} MB`;

  function refreshHud() {
    const mem = mode.memory ? ` · 贴图 ${formatBytes(mode.memory())}` : '';
    qualityEl.textContent =
      `${tier.label} · ${backend} · ${gpu}${mode.hud ? ` · ${mode.hud}` : ''}${mem}`;
    // Everything that did not fit, on hover.
    qualityEl.title = [mode.hudNote, `贴图上限 ${tier.label}`].filter(Boolean).join(' · ');
  }

  const state = { date: '' };

  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.textContent = MODE === 'earth' ? 'Earth' : 'Solar System';
  document.title = `${MODE === 'earth' ? 'Earth' : 'Solar System'} · three.js WebGPU + TSL`;

  await mode.ready;
  refreshHud();

  // The LOD system swaps textures at runtime, so the memory readout has to be
  // polled rather than computed once.
  let hudTimer = 0;
  let lastMem = -1;

  const timer = new THREE.Timer();
  timer.connect(document);

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);

    mode.update(dt, state);
    mode.controls.update();

    if (clockEl) {
      clockEl.textContent = state.date ? `${state.date}${mode.playing ? '' : ' · 已暂停'}` : '';
    }

    hudTimer += dt;
    if (hudTimer > 1) {
      hudTimer = 0;
      const mem = mode.memory ? mode.memory() : 0;
      if (mem !== lastMem) {
        lastMem = mem;
        refreshHud();
      }
    }

    renderer.render(scene, mode.camera);
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      mode.togglePlay();
    }
  });

  window.addEventListener('resize', () => {
    mode.camera.aspect = window.innerWidth / window.innerHeight;
    mode.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  loaderEl.classList.add('done');
  setTimeout(() => loaderEl.remove(), 700);
}

main().catch((error) => {
  console.error(error);
  loaderEl.classList.add('error');
  loaderEl.querySelector('.loader-ring')?.remove();
  loaderSubEl.textContent =
    error?.message?.includes('WEBGPU') || error?.message?.includes('GPU')
      ? 'WebGPU 初始化失败，试试在地址后加 ?webgl'
      : String(error?.message ?? error);
});
