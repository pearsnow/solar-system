import { localISODate } from '../sim/clock.js';

/**
 * Time-machine and selection UI.
 *
 * Built in JS rather than in index.html so the controls stay next to the code
 * that owns their state; index.html only keeps the title block.
 */

const SPEED_LABELS = ['1时/秒', '1天/秒', '1周/秒', '1月/秒', '1年/秒', '10年/秒'];

export function createUI({ speeds, on }) {
  const root = document.createElement('div');
  root.id = 'ui';
  root.innerHTML = `
    <div id="bodies"></div>
    <details id="comets"><summary>彗星</summary><div id="comet-list"></div></details>

    <aside id="info" class="hidden">
      <button id="info-close" aria-label="关闭">×</button>
      <h2 id="info-name"></h2>
      <p id="info-sub"></p>
      <dl id="info-lines"></dl>
      <div id="satellite-list"></div>
    </aside>

    <div id="timebar">
      <button id="tb-play" class="tb-btn" title="暂停 / 继续">⏸</button>
      <div id="tb-speed" class="tb-speeds"></div>
      <input id="tb-date" type="date" />
      <button id="tb-today" class="tb-btn">今天</button>
      <button id="tb-home" class="tb-btn">全景</button>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (id) => root.querySelector(`#${id}`);

  // ------------------------------------------------------------------- speed

  const speedBox = $('tb-speed');
  speeds.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'speed';
    b.dataset.index = String(i);
    b.textContent = SPEED_LABELS[i] ?? `${i}`;
    b.addEventListener('click', () => {
      markSpeed(i);
      on.speed(i);
    });
    speedBox.appendChild(b);
  });

  function markSpeed(index) {
    speedBox.querySelectorAll('.speed').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
  }
  markSpeed(1);

  // -------------------------------------------------------------- play/pause

  const playBtn = $('tb-play');
  let playing = true;

  playBtn.addEventListener('click', () => {
    on.togglePlay();
  });

  function syncPlay() {
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.classList.toggle('active', !playing);
  }

  // -------------------------------------------------------------------- date

  const dateInput = $('tb-date');
  dateInput.addEventListener('change', () => {
    if (dateInput.value) on.date(dateInput.value);
  });

  $('tb-today').addEventListener('click', () => {
    on.date(localISODate());
  });

  $('tb-home').addEventListener('click', () => on.home());

  // ------------------------------------------------------------------ bodies

  const bodyBox = $('bodies');

  function setBodies(list) {
    bodyBox.innerHTML = '';
    const groups = [];
    for (const item of list) {
      if (item.moons?.length) {
        const group = document.createElement('details');
        group.className = 'body-group';
        const summary = document.createElement('summary');
        summary.className = 'chip';
        summary.dataset.id = item.id;
        summary.textContent = item.label;
        const caret = document.createElement('span');
        caret.className = 'caret';
        caret.textContent = '▾';
        summary.appendChild(caret);
        summary.addEventListener('click', () => on.select(item.id));
        group.appendChild(summary);
        const menu = document.createElement('div');
        menu.className = 'moon-menu';
        const head = document.createElement('p');
        head.className = 'moon-menu-head';
        head.textContent = `${item.label} · ${item.moons.length} 颗卫星`;
        menu.appendChild(head);
        for (const moon of item.moons) {
          const button = document.createElement('button');
          button.className = 'chip';
          button.dataset.id = moon.id;
          button.textContent = moon.label;
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            group.open = false;
            on.select(moon.id);
          });
          menu.appendChild(button);
        }
        group.appendChild(menu);
        group.addEventListener('toggle', () => {
          if (group.open) for (const other of groups) if (other !== group) other.open = false;
        });
        groups.push(group);
        bodyBox.appendChild(group);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.id = item.id;
      b.textContent = item.label;
      b.addEventListener('click', () => on.select(item.id));
      bodyBox.appendChild(b);
    }
  }

  document.addEventListener('pointerdown', (event) => {
    if (!bodyBox.contains(event.target)) {
      bodyBox.querySelectorAll('details.body-group').forEach((group) => { group.open = false; });
    }
  });

  function markSelected(id) {
    bodyBox.querySelectorAll('.chip').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === id);
    });
    if (!id) return;
  }

  // -------------------------------------------------------------------- info

  const infoEl = $('info');

  function showInfo({ nameZh, name, sub, lines }) {
    $('info-name').textContent = nameZh ?? name;
    $('info-sub').textContent = sub ?? '';
    const dl = $('info-lines');
    dl.innerHTML = '';
    for (const [k, v] of lines) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      if (k === '当前日心距') dd.dataset.heliocentricDistance = '';
      dl.append(dt, dd);
    }
    infoEl.classList.remove('hidden');
  }

  function hideInfo() {
    infoEl.classList.add('hidden');
  }

  $('info-close').addEventListener('click', () => on.clear());

  return {
    setBodies,
    setComets(entries) {
      const box = $('comet-list');
      for (const entry of entries) {
        const button = document.createElement('button');
        button.className = 'chip'; button.textContent = entry.label;
        button.addEventListener('click', () => { $('comets').open = false; on.select(entry.id); });
        box.append(button);
      }
    },
    markSelected,
    showInfo,
    hideInfo,
    setSatellites(entries) {
      const box = $('satellite-list');
      box.replaceChildren();
      if (!entries.length) return;
      const makeButton = (entry) => {
        const button = document.createElement('button');
        button.className = 'chip';
        button.textContent = entry.label;
        button.addEventListener('click', () => on.select(entry.id));
        return button;
      };
      const largest = [...entries].sort((a, b) => b.body.radiusKm - a.body.radiusKm);
      for (const entry of largest.slice(0, 8)) box.append(makeButton(entry));
      if (entries.length > 8) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = `全部 ${entries.length} 颗`;
        details.append(summary);
        for (const entry of [...entries].sort((a, b) => a.body.aKm - b.body.aKm)) details.append(makeButton(entry));
        box.append(details);
      }
    },
    setDistance(value) {
      const dd = infoEl.querySelector('[data-heliocentric-distance]');
      if (dd) dd.textContent = value;
    },
    setDate(iso) {
      if (document.activeElement !== dateInput) dateInput.value = iso;
    },
    setPlaying(value) {
      playing = value;
      syncPlay();
    },
  };
}
