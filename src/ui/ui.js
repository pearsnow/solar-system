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

    <aside id="info" class="hidden">
      <button id="info-close" aria-label="关闭">×</button>
      <h2 id="info-name"></h2>
      <p id="info-sub"></p>
      <dl id="info-lines"></dl>
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
    playing = !playing;
    syncPlay();
    on.togglePlay(playing);
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
    on.date(new Date().toISOString().slice(0, 10));
  });

  $('tb-home').addEventListener('click', () => on.home());

  // ------------------------------------------------------------------ bodies

  const bodyBox = $('bodies');

  function setBodies(list) {
    bodyBox.innerHTML = '';
    for (const item of list) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.id = item.id;
      b.textContent = item.label;
      b.addEventListener('click', () => on.select(item.id));
      bodyBox.appendChild(b);
    }
  }

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
    markSelected,
    showInfo,
    hideInfo,
    setDate(iso) {
      if (document.activeElement !== dateInput) dateInput.value = iso;
    },
    setPlaying(value) {
      playing = value;
      syncPlay();
    },
  };
}
