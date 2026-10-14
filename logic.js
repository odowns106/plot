// Pure logic: dates, rotation, weather rules. No DOM, so it can be tested in node.
(function (root) {
  // Browser: crops.js declares these as globals. Node: require them.
  const data = typeof module !== 'undefined' ? require('./crops.js')
    : { CROPS: root.__crops.CROPS, BASE_LAYOUT: root.__crops.BASE_LAYOUT, BASE_YEAR: root.__crops.BASE_YEAR, ROTATION: root.__crops.ROTATION };
  const { CROPS, BASE_LAYOUT, BASE_YEAR, ROTATION } = data;

  const ymd = (date) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  };
  const dayKey = (date) => (date.getMonth() + 1) * 100 + date.getDate();
  const key = ([m, day]) => m * 100 + day;
  const wraps = (t) => key(t.from) > key(t.to);
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayName = (str) => new Date(str + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short' });

  const taskId = (t) => `${t.crop}:${t.verb.toLowerCase().replace(/\s+/g, '-')}`;
  const kindOf = (t) => (t.verb === 'Harvest' ? 'harvest'
    : /^(Sow|Plant|Chit|Pot)/.test(t.verb) ? 'sow' : 'care');

  function inWindow(t, date) {
    const k = dayKey(date);
    return wraps(t) ? k >= key(t.from) || k <= key(t.to) : k >= key(t.from) && k <= key(t.to);
  }
  function daysUntilStart(t, date) {
    const today = startOfDay(date);
    const start = new Date(today.getFullYear(), t.from[0] - 1, t.from[1]);
    if (start < today) start.setFullYear(start.getFullYear() + 1);
    return Math.round((start - today) / 864e5);
  }
  // Year a task's window "belongs to" (a Oct–Mar window seen in January belongs to last year)
  const seasonYear = (t, date) =>
    wraps(t) && dayKey(date) <= key(t.to) ? date.getFullYear() - 1 : date.getFullYear();

  function rotateStep(layout) {
    const next = {};
    for (const bed in layout) {
      const crops = layout[bed].filter((c) => CROPS[c].carry !== false);
      const dest = ROTATION[bed[0]] ? ROTATION[bed[0]] + bed.slice(1) : bed;
      next[dest] = crops;
    }
    return next;
  }
  function layoutFor(year, overrides = {}) {
    let layout = JSON.parse(JSON.stringify(BASE_LAYOUT));
    Object.assign(layout, overrides[BASE_YEAR]);
    for (let y = BASE_YEAR + 1; y <= year; y++) {
      layout = rotateStep(layout);
      Object.assign(layout, overrides[y]);
    }
    return layout;
  }
  const bedsFor = (crop, layout) => Object.keys(layout).filter((b) => layout[b].includes(crop));

  function parseWeather(json) {
    const dl = json.daily;
    const soil = {};
    json.hourly.time.forEach((t, i) => {
      const v = json.hourly.soil_temperature_6cm[i];
      if (v != null) (soil[t.slice(0, 10)] ||= []).push(v);
    });
    const days = dl.time.map((date, i) => ({
      date, min: dl.temperature_2m_min[i], max: dl.temperature_2m_max[i],
      rain: dl.precipitation_sum[i], gust: dl.wind_gusts_10m_max[i], code: dl.weather_code[i],
      soil: soil[date] ? soil[date].reduce((a, b) => a + b, 0) / soil[date].length : null,
    }));
    return { days };
  }

  // Returns a list of reasons to wait; empty means the weather is fine.
  function checkRules(rules, wx, todayStr) {
    const why = [];
    if (!rules || !wx) return why;
    const ahead = wx.days.filter((x) => x.date >= todayStr);
    if (!ahead.length) return why;
    if (rules.minNight != null) {
      const win = ahead.slice(0, rules.days || 5);
      const low = win.reduce((a, x) => (x.min < a.min ? x : a), win[0]);
      if (low.min < rules.minNight)
        why.push(`${dayName(low.date)} night dips to ${Math.round(low.min)}°C (want ${rules.minNight}°C+)`);
    }
    if (rules.minSoil != null && ahead[0].soil != null && ahead[0].soil < rules.minSoil)
      why.push(`soil is ${ahead[0].soil.toFixed(1)}°C (want ${rules.minSoil}°C+)`);
    if (rules.dry) {
      const wet = ahead.slice(0, 2).reduce((a, x) => a + (x.rain || 0), 0);
      if (wet > 10) why.push(`${Math.round(wet)}mm rain due in the next 2 days`);
    }
    return why;
  }

  function taskStatus(t, date, wx, doneMap) {
    const done = doneMap && doneMap[taskId(t)];
    if (inWindow(t, date)) {
      if (done) return { state: 'done' };
      const why = checkRules(t.rules, wx, ymd(date));
      if (why.length) return { state: 'wait', why };
      return { state: t.rules ? 'go' : 'now' };
    }
    return { state: 'later', days: daysUntilStart(t, date) };
  }

  const api = { ymd, dayKey, key, wraps, dayName, taskId, kindOf, inWindow, daysUntilStart,
    seasonYear, rotateStep, layoutFor, bedsFor, parseWeather, checkRules, taskStatus };
  if (typeof module !== 'undefined') module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
