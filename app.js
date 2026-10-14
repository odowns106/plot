(function () {
  const $ = (s) => document.querySelector(s);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = ([m, d]) => `${d} ${MONTHS[m - 1]}`;

  // ?date=2027-04-20 previews another day (the forecast rules only apply to the real today)
  const param = new URLSearchParams(location.search).get('date');
  const today = param ? new Date(param + 'T12:00') : new Date();
  const todayStr = ymd(today);
  const year = today.getFullYear();

  const STORE = 'plot-v1';
  let state = { done: {}, overrides: {} };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(STORE)) }; } catch {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} };

  let wx = null;
  let wxNote = '';
  let plotYear = year < BASE_YEAR ? BASE_YEAR : year;

  // ---- weather -------------------------------------------------------------
  async function loadWeather(force) {
    const cacheKey = 'plot-wx';
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch {}
    if (!force && cached && Date.now() - cached.at < 3600e3) {
      wx = parseWeather(cached.json); wxNote = ''; return;
    }
    const q = new URLSearchParams({
      latitude: LOCATION.lat, longitude: LOCATION.lon, timezone: 'Europe/London', forecast_days: 10,
      wind_speed_unit: 'mph',
      daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum,wind_gusts_10m_max,weather_code',
      hourly: 'soil_temperature_6cm',
    });
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q);
      if (!r.ok) throw new Error(r.status);
      const json = await r.json();
      try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), json })); } catch {}
      wx = parseWeather(json); wxNote = '';
    } catch {
      if (cached) { wx = parseWeather(cached.json); wxNote = 'Offline: showing the last saved forecast.'; }
      else { wx = null; wxNote = 'No forecast available. Weather checks are off.'; }
    }
  }

  // ---- helpers -------------------------------------------------------------
  const layout = (y) => layoutFor(y, state.overrides);
  const doneFor = (y) => state.done[y] || (state.done[y] = {});
  const cropName = (id) => CROPS[id].name;

  function bedText(t) {
    const beds = bedsFor(t.crop, layout(year + (t.offset || 0)));
    const where = { indoors: 'Indoors', greenhouse: 'Greenhouse', anywhere: 'Any gap', bed: '' }[t.place];
    if (t.place === 'bed' && !beds.length) return 'Choose a bed on the Plot tab';
    if (t.place === 'indoors' && beds.length) return `Indoors, for ${beds.join(' + ')}`;
    return [where, t.place === 'bed' && beds.length ? 'Bed ' + beds.join(' + ') : ''].filter(Boolean).join(' · ');
  }

  function taskCard(t, st) {
    const id = taskId(t);
    const kind = kindOf(t);
    const chips = { go: 'Good to go', now: 'In season', wait: 'Hold off', later: `In ${st.days} day${st.days === 1 ? '' : 's'}` };
    const harvest = kind === 'harvest';
    return `<article class="task ${st.state} ${kind}">
      <div class="head"><strong>${t.verb} ${cropName(t.crop).toLowerCase()}</strong>
        <span class="chip ${st.state}">${chips[st.state]}</span></div>
      <div class="meta">${bedText(t)} · ${fmt(t.from)} – ${fmt(t.to)}</div>
      ${st.why ? `<p class="why">${st.why.join('; ')}.</p>` : ''}
      ${t.tip && !harvest ? `<p>${t.tip}</p>` : ''}
      ${harvest || st.state === 'later' ? '' : `<div class="actions"><button data-done="${id}" data-season="${seasonYear(t, today)}">Done</button></div>`}
    </article>`;
  }

  // ---- Today ---------------------------------------------------------------
  function renderToday() {
    const statuses = TASKS.map((t) => ({ t, st: taskStatus(t, today, wx, doneFor(seasonYear(t, today))) }));
    const active = statuses.filter((x) => ['go', 'now', 'wait'].includes(x.st.state));
    const upcoming = statuses.filter((x) => x.st.state === 'later' && x.st.days <= 21 && kindOf(x.t) !== 'harvest')
      .sort((a, b) => a.st.days - b.st.days);
    const group = (k) => active.filter((x) => kindOf(x.t) === k);
    const order = { wait: 1, go: 0, now: 0 };
    const sorted = (xs) => xs.sort((a, b) => order[a.st.state] - order[b.st.state]);
    const doneCount = statuses.filter((x) => x.st.state === 'done').length;

    let html = '';
    const ahead = wx ? wx.days.filter((x) => x.date >= todayStr) : [];
    const month = today.getMonth() + 1;
    const frost = ahead.slice(0, 5).filter((x) => x.min <= 1);
    if (frost.length && month >= 4 && month <= 10)
      html += `<div class="alert"><b>Frost forecast ${frost.map((x) => dayName(x.date) + ' (' + Math.round(x.min) + '°C)').join(', ')}.</b>
        Fleece or bring in tender plants: beans, squash, courgettes, sunflower seedlings, chillies.</div>`;
    const windy = ahead.slice(0, 4).filter((x) => x.gust >= 40);
    if (windy.length)
      html += `<div class="alert info"><b>Gusts to ${Math.round(Math.max(...windy.map((x) => x.gust)))} mph on ${windy.map((x) => dayName(x.date)).join(', ')}.</b>
        Check the greenhouse door and any bean supports.</div>`;
    if (wxNote) html += `<p class="muted">${wxNote}</p>`;
    if (param) html += `<p class="muted">Previewing ${todayStr}. Weather checks use the real forecast, so ignore them here.</p>`;

    if (ahead.length) {
      html += '<div class="days">' + ahead.slice(0, 7).map((x) => `<div class="day ${x.min <= 1 ? 'frost' : ''}">
        <b>${dayName(x.date)}</b>${Math.round(x.max)}° / ${Math.round(x.min)}°<small>${x.rain >= 0.5 ? x.rain.toFixed(0) + 'mm' : '–'}</small></div>`).join('') + '</div>';
      if (ahead[0].soil != null) html += `<p class="muted">Soil at 6cm: ${ahead[0].soil.toFixed(1)}°C</p>`;
    }

    const sow = sorted(group('sow')), care = sorted(group('care')), harvest = group('harvest');
    html += '<h2>Sow &amp; plant</h2>' + (sow.length ? sow.map((x) => taskCard(x.t, x.st)).join('') : '<p class="muted">Nothing in season right now.</p>');
    if (care.length) html += '<h2>Jobs</h2>' + care.map((x) => taskCard(x.t, x.st)).join('');
    if (upcoming.length) html += '<h2>Coming up (3 weeks)</h2>' + upcoming.map((x) => taskCard(x.t, x.st)).join('');
    if (harvest.length) html += `<details><summary>Harvest now (${harvest.length})</summary>${harvest.map((x) => taskCard(x.t, x.st)).join('')}</details>`;
    if (doneCount) html += `<p class="muted">${doneCount} task${doneCount === 1 ? '' : 's'} ticked off this season.</p>`;
    $('#tab-today').innerHTML = html;
  }

  // ---- Plot ----------------------------------------------------------------
  function renderPlot() {
    const lay = layout(plotYear);
    const years = [0, 1, 2, 3].map((i) => BASE_YEAR + i);
    let svg = '<svg class="map" viewBox="-20 -50 930 1010" role="img" aria-label="Plot layout">';
    svg += '<text x="445" y="-22" text-anchor="middle" class="small">N ↑ (greenhouse end)</text>';
    for (const [bed, r] of Object.entries(BED_RECTS)) {
      const crops = lay[bed] || [];
      const group = crops.length ? CROPS[crops[0]].group : 'perennial';
      const fixed = bed === '2a' || bed === '2b';
      svg += `<g data-bed="${bed}"><rect class="bed ${fixed ? 'fixed' : ''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="12" style="fill:var(--${group})"/>`;
      const label = r.label || bed;
      svg += `<text class="id" x="${r.x + 14}" y="${r.y + 42}">${label}</text>`;
      const cx = r.label && r.w > 300 ? r.x + 14 : r.x + 14;
      crops.forEach((c, i) => {
        const base = r.label ? r.y + 78 + (r.h <= 120 ? 0 : 0) : r.y + 90;
        const x = r.label && r.h <= 120 && i ? r.x + 14 + 200 * i : cx;
        const y = r.label && r.h <= 120 ? base : base + i * 32;
        svg += `<text class="crop" x="${x}" y="${y}">${CROPS[c].short}</text>`;
      });
      svg += '</g>';
    }
    svg += '<text x="445" y="985" text-anchor="middle" class="small">S</text></svg>';

    const used = [...new Set(Object.values(lay).flat().map((c) => CROPS[c].group))];
    const note = plotYear === BASE_YEAR ? '' :
      ' Contents moved on clockwise from the year before; squash stays put. Tap a bed to change it.';
    $('#tab-plot').innerHTML = `
      <div class="years">${years.map((y) => `<button data-year="${y}" class="${y === plotYear ? 'on' : ''}">${y}</button>`).join('')}</div>
      ${svg}
      <div class="legend">${used.map((g) => `<span><i style="background:var(--${g})"></i>${GROUPS[g]}</span>`).join('')}</div>
      <p class="muted">Bed sizes are approximate.${note || ' Tap a bed to change what is in it.'}
      Garlic and sunflowers aren't in the rotation: add garlic to a bed for next year's layout.</p>`;
  }

  function openBed(bed) {
    const lay = layout(plotYear);
    $('#bedTitle').textContent = `${BED_RECTS[bed].label || 'Bed ' + bed} · ${plotYear}`;
    $('#bedSub').textContent = 'What is growing here this year?';
    $('#bedChecks').innerHTML = Object.entries(CROPS).map(([id, c]) =>
      `<label><input type="checkbox" value="${id}" ${lay[bed].includes(id) ? 'checked' : ''}> ${c.name}</label>`).join('');
    $('#bedDialog').dataset.bed = bed;
    $('#bedDialog').showModal();
  }

  // ---- Calendar ------------------------------------------------------------
  function renderCalendar() {
    const pos = ([m, d]) => ((m - 1) + (d - 1) / 31) / 12 * 100;
    const segs = (t) => (wraps(t) ? [[pos(t.from), 100], [0, pos(t.to) + 100 / 12 / 31]]
      : [[pos(t.from), pos(t.to) + 100 / 12 / 31]]);
    const nowPos = pos([today.getMonth() + 1, today.getDate()]);
    let html = `<p class="legend"><span><i style="background:var(--accent)"></i>Sow</span><span><i style="background:var(--plant)"></i>Plant out</span>
      <span><i style="background:var(--soon)"></i>Jobs</span><span><i style="background:var(--cucurbit)"></i>Harvest</span></p>` +
      '<div class="cal"><div class="months"><div></div><div>' + MONTHS.map((m) => `<span>${m[0]}</span>`).join('') + '</div></div>';
    for (const crop of Object.keys(CROPS)) {
      const ts = TASKS.filter((t) => t.crop === crop);
      if (!ts.length) continue;
      html += `<div class="crop">${cropName(crop)}</div>`;
      for (const t of ts) {
        html += `<div class="bar"><span>${t.verb}</span><div class="track">` +
          segs(t).map(([a, b]) => `<div class="seg ${/^Plant/.test(t.verb) ? 'plant' : kindOf(t)}" style="left:${a}%;width:${b - a}%"></div>`).join('') +
          `<div class="today" style="left:${nowPos}%"></div></div></div>`;
      }
    }
    $('#tab-calendar').innerHTML = html + '</div>';
  }

  // ---- Log -----------------------------------------------------------------
  function renderLog() {
    const rows = [];
    for (const [y, m] of Object.entries(state.done))
      for (const [id, date] of Object.entries(m)) rows.push({ y, id, date });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const name = (id) => { const t = TASKS.find((t) => taskId(t) === id); return t ? `${t.verb} ${cropName(t.crop).toLowerCase()}` : id; };
    $('#tab-log').innerHTML = `<h2>Done</h2>` + (rows.length ? rows.map((r) =>
      `<div class="logrow"><span>${name(r.id)}<br><span class="muted">${r.date}</span></span>
       <button class="plain" data-undo="${r.id}" data-season="${r.y}">Undo</button></div>`).join('')
      : '<p class="muted">Nothing logged yet. Tick tasks off on the Today tab.</p>') +
      `<h2>Backup</h2><p class="muted">Data lives in this browser only.</p>
       <div class="row"><button class="plain" id="export">Export</button>
       <label class="plain" style="display:inline-block;padding:8px 14px;border:1px solid var(--line);border-radius:8px;cursor:pointer">Import
       <input type="file" id="import" accept="application/json" hidden></label></div>`;
  }

  // ---- wiring --------------------------------------------------------------
  function render() {
    $('#dateLabel').textContent = today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    renderToday(); renderPlot(); renderCalendar(); renderLog();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, g[data-bed]');
    if (!b) return;
    if (b.dataset.tab) {
      document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== 'tab-' + b.dataset.tab));
      document.querySelectorAll('nav button').forEach((n) => n.classList.toggle('on', n === b));
    } else if (b.dataset.done) {
      (state.done[b.dataset.season] ||= {})[b.dataset.done] = todayStr; save(); render();
    } else if (b.dataset.undo) {
      delete state.done[b.dataset.season][b.dataset.undo]; save(); render();
    } else if (b.dataset.year) {
      plotYear = +b.dataset.year; renderPlot();
    } else if (b.dataset.bed && !['2a', '2b'].includes(b.dataset.bed)) {
      openBed(b.dataset.bed);
    } else if (b.id === 'bedReset') {
      const bed = $('#bedDialog').dataset.bed;
      if (state.overrides[plotYear]) delete state.overrides[plotYear][bed];
      save(); $('#bedDialog').close(); render();
    } else if (b.id === 'export') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: 'plot-backup.json' }).click();
      URL.revokeObjectURL(url);
    }
  });
  $('#bedDialog').addEventListener('close', () => {
    if ($('#bedDialog').returnValue !== 'save') return;
    const bed = $('#bedDialog').dataset.bed;
    const picked = [...$('#bedChecks').querySelectorAll('input:checked')].map((i) => i.value);
    (state.overrides[plotYear] ||= {})[bed] = picked; save(); render();
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'import' || !e.target.files[0]) return;
    try {
      const data = JSON.parse(await e.target.files[0].text());
      state = { done: data.done || {}, overrides: data.overrides || {} }; save(); render();
    } catch { alert('That file is not a valid backup.'); }
  });
  $('#refresh').addEventListener('click', async () => { await loadWeather(true); render(); });

  render();
  loadWeather(false).then(render);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
})();
