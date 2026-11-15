(function () {
  'use strict';

  const field = id => document.getElementById(id);
  const local = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(location.origin);
  // The mission snapshot ships inside the build, so it is available over file://, a local
  // server and the hosted site alike. The server API stays in front when it is running.
  const bundled = window.CC_I4_OFFLINE || null;
  const collections = {
    cabin: {
      label: 'Published chart day',
      source: 'Digitized cabin environment estimates. The paper’s flight-day chart clock is separate from the UTC timeline above.',
      links: [['Published cabin figure', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11357997/figure/Fig13/']],
      group: row => 'FD ' + row.timeRef.split('FD').at(-1),
      time: row => 'Plot hour ' + row.time + '–' + (row.time + 0.5)
    },
    labs: {
      label: 'Sample time',
      source: 'Original reported laboratory measurements with study crew codes. The database contains preflight and postflight samples in these collections.',
      links: [['OSD-569 whole blood', 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569'],
        ['OSD-575 blood serum', 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575']],
      group: row => row.timeRef === 'launch' ? 'L' + row.time : 'R+' + row.time,
      time: row => row.timeRef === 'launch' ? 'Launch − ' + Math.abs(row.time) + ' days' : 'Return + ' + row.time + ' days'
    },
    comparisons: {
      label: 'Published comparison',
      source: 'Published phase-level contrasts, including modeled estimates and crew-level comparisons.',
      links: [['Inspiration4 study and supplementary tables', 'https://doi.org/10.1038/s41586-024-07648-x']],
      group: row => row.comparison || 'Reported contrast',
      time: row => row.comparison || 'Reported contrast'
    }
  };
  const metrics = {
    cabin_pressure: 'Cabin pressure', cabin_temperature: 'Cabin temperature',
    carbon_dioxide_partial_pressure: 'Cabin CO₂ partial pressure',
    oxygen_partial_pressure: 'Cabin oxygen partial pressure', relative_humidity: 'Cabin relative humidity'
  };
  const units = { degC: '°C', percent_rh: '% RH' };
  const replayNotes = [
    'Start with the launch milestone. Use the cabin charts to see conditions inside Dragon, and look under Blood tests for measurements taken before launch.',
    'Compare patterns across chart days. Cabin oxygen pressure describes the spacecraft environment. To assess a person, look for their own blood oxygen or other vital signs.',
    'The first postflight blood samples in this database are labeled Return +1 day. Use those sample times when comparing preflight and recovery records.'
  ];
  const cache = new Map();
  const pending = new Map();
  const pageSize = 25;
  let category;
  let records = [];
  let page = 0;
  let replayDay = 1;
  let replayCheck;
  let replayHistory = [];

  async function getRows(name) {
    if (cache.has(name)) return cache.get(name);
    if (!pending.has(name)) {
      const request = (async () => {
        if (local) {
          try {
            const response = await fetch('/api/i4-records?category=' + name, { signal: AbortSignal.timeout(8000) });
            if (response.ok) {
              const rows = (await response.json()).records;
              if (Array.isArray(rows)) return rows;
            }
          } catch {
            // The local server is optional - the bundled snapshot answers the same request.
          }
        }
        if (bundled && Array.isArray(bundled[name])) return bundled[name];
        throw new Error('I4 records unavailable');
      })();
      pending.set(name, request.then(rows => {
        if (!Array.isArray(rows)) throw new Error('I4 collection unavailable');
        cache.set(name, rows);
        return rows;
      }).finally(() => pending.delete(name)));
    }
    return pending.get(name);
  }

  function plot(host, { points, ticks, unit, title, maximum, connect = true }) {
    const valid = points.filter(point => Number.isFinite(point.value));
    if (!valid.length) { host.textContent = 'No reported value for this selection.'; return; }
    const values = valid.map(point => point.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const padding = (hi - lo || Math.abs(lo) || 1) * .12;
    const lower = lo - padding, upper = hi + padding;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    function add(tag, attrs, contents) {
      const node = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (contents !== undefined) node.textContent = contents;
      svg.append(node);
    }
    const x = value => 63 + value / Math.max(1, maximum) * 674;
    const y = value => 163 - (value - lower) / (upper - lower) * 126;
    const format = n => String(Number(n.toPrecision(5)));
    svg.setAttribute('viewBox', '0 0 760 205');
    svg.setAttribute('class', 'i4-axis-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title + '. ' + valid.length + ' values, range ' + lo + ' to ' + hi + ' ' + unit);
    add('text', { x: 63, y: 19 }, unit || 'Reported value');
    for (const value of new Set([lo, (lo + hi) / 2, hi])) {
      const height = y(value);
      add('line', { x1: 63, x2: 737, y1: height, y2: height, stroke: '#31465b' });
      add('text', { x: 57, y: height + 4, 'text-anchor': 'end' }, format(value));
    }
    ticks.forEach(({ at, label }) => add('text', { x: x(at), y: 190, 'text-anchor': 'middle' }, label));
    if (connect) {
      let previous;
      let line = '';
      for (const point of points) {
        if (!Number.isFinite(point.value)) { previous = undefined; continue; }
        line += (previous && previous.segment === point.segment ? ' L' : ' M') + x(point.at) + ',' + y(point.value);
        previous = point;
      }
      add('path', { d: line, fill: 'none', stroke: '#39d0ff', 'stroke-width': 2 });
    }
    if (!connect || valid.length <= 20) valid.forEach(point => add('circle', { cx: x(point.at), cy: y(point.value), r: 4, fill: '#39d0ff' }));
    host.replaceChildren(svg);
  }

  function renderCabinTrend() {
    const metric = field('i4TrendMetric').value;
    const selected = cache.get('cabin').filter(row => row.metric === metric);
    plot(field('i4CabinTrend'), {
      points: selected.map(row => ({ at: row.time, value: row.value })),
      ticks: [0, 12, 24, 36, 48, 60, 72].map(at => ({ at, label: at + ' h' })),
      unit: units[selected[0]?.unit] || selected[0]?.unit || '', title: metrics[metric], maximum: 72
    });
  }

  const labKey = row => JSON.stringify([row.dataset, row.metric, row.unit]);
  const labTime = ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'];
  function setOptions(id, options, preferred) {
    const control = field(id);
    const selection = control.value;
    control.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
    if (options.some(([value]) => value === selection)) control.value = selection;
    else if (options.some(([value]) => value === preferred)) control.value = preferred;
  }

  function renderLabTrend() {
    const rows = cache.get('labs').filter(row => row.crew === field('i4LabCrew').value);
    const choices = [...new Map(rows.map(row => [labKey(row), row.metric + ' · ' + row.dataset.toUpperCase()]))];
    setOptions('i4LabMetric', choices, JSON.stringify(['osd-575', 'GLUCOSE', 'mg/dL']));
    const sampleByTime = new Map(rows.filter(row => labKey(row) === field('i4LabMetric').value)
      .map(row => [collections.labs.group(row), row]));
    plot(field('i4LabTrend'), {
      points: labTime.map((label, at) => ({ at, value: sampleByTime.get(label)?.value, segment: label[0] })),
      ticks: labTime.map((label, at) => ({ at, label })),
      unit: [...sampleByTime.values()][0]?.unit || '', title: 'Reported laboratory samples', maximum: 6
    });
  }

  function renderComparisons() {
    const selected = cache.get('comparisons').filter(row => row.metric === field('i4CompareMetric').value);
    const phases = [...new Set(selected.map(row => collections.comparisons.group(row)))];
    setOptions('i4ComparePhase', phases.map(value => [value, value]));
    const rows = selected.filter(row => collections.comparisons.group(row) === field('i4ComparePhase').value);
    plot(field('i4CompareTrend'), {
      points: rows.map((row, at) => ({ at, value: row.value })),
      ticks: rows.map((row, at) => ({ at, label: row.crew || 'Crew model' })),
      unit: rows[0]?.unit || '', title: 'Published ' + field('i4CompareMetric').value + ' estimates',
      maximum: Math.max(1, rows.length - 1), connect: false
    });
  }

  function renderHazards(cabin, labs, comparisons) {
    const available = (rows, metric) => rows.filter(row => row.metric === metric && Number.isFinite(row.value));
    const range = (values, digits) => Math.min(...values).toFixed(digits) + '–' + Math.max(...values).toFixed(digits);
    const inFlight = comparisons.filter(row => row.comparison === 'In-flight relative to pre-flight');
    const survey = [['Sleep Quality', 'poor sleep quality'], ['Sleepiness', 'sleepiness'], ['Stress', 'stress']].flatMap(([metric, label]) => {
      const row = available(inFlight, metric)[0];
      if (!row) return [];
      const direction = row.value < 0 ? ' lower' : row.value > 0 ? ' higher' : '';
      return [label + ' ' + Math.abs(row.value).toFixed(2) + ' points' + direction];
    });
    const activity = available(comparisons, 'Active energy burned').filter(row => row.comparison === 'Pre-flight relative to in-flight');
    const activityFinding = activity.length && activity.every(row => row.value > 0)
      ? 'Watch estimates of active energy expenditure were ' + range(activity.map(row => row.value), 1) + ' cal/h lower in flight than before launch.'
      : 'The available activity comparisons do not show a consistent decrease.';
    const whiteCells = available(labs, 'WHITE BLOOD CELL COUNT');
    const before = new Map(whiteCells.filter(row => row.crew && row.timeRef === 'launch' && row.time === -3)
      .map(row => [row.crew, row.value]));
    const pairs = whiteCells.filter(row => row.timeRef === 'return' && row.time === 1 && before.has(row.crew))
      .map(row => ({ before: before.get(row.crew), after: row.value }));
    const bloodFinding = pairs.length
      ? 'White blood cell counts were ' + (pairs.every(pair => pair.after < pair.before) ? 'lower at return +1 day for every matched crew member. ' : 'compared at matching crew sample times. ') +
        'The range was ' + range(pairs.map(pair => pair.before), 1) + ' before launch (L−3) and ' +
        range(pairs.map(pair => pair.after), 1) + ' after return (R+1), in thousand/µL.'
      : 'No matched white blood cell results are available for L−3 and R+1.';
    const temperature = available(cabin, 'cabin_temperature');
    const cabinFinding = temperature.length
      ? 'The published cabin chart shows approximately ' + range(temperature.map(row => row.value), 1) + ' °C across the flight.'
      : 'No cabin temperature estimate is available.';
    const cards = [
      {
        title: 'Radiation exposure', status: 'Dose unavailable',
        evidence: 'No individual I4 dosimeter readings are available in this replay.',
        action: 'Record each crew member’s dosimeter readings and cumulative dose. Review readings against the mission’s radiation procedures.'
      },
      {
        title: 'Isolation and confinement', status: 'Research comparisons',
        evidence: survey.length ? 'The study’s estimated in-flight ratings versus preflight were ' + survey.join(', ') +
          ' on a 0–10 scale. These are comparisons across phases.' : 'No in-flight survey comparison is available.',
        action: 'Use daily sleep, fatigue and mood check-ins to track changes over time.',
        button: 'View sleep quality comparisons', selection: { comparison: 'Sleep Quality' }
      },
      {
        title: 'Altered gravity and bone loss', status: 'Bone density unavailable',
        evidence: activityFinding + ' The supplied data cannot quantify bone loss because it has no bone-density measurements.',
        action: 'Track scheduled exercise and coordinate preflight and postflight bone assessments through the mission medical plan.',
        button: 'View activity comparisons', selection: { comparison: 'Active energy burned' }
      },
      {
        title: 'Closed environment and immune changes', status: 'Cabin and lab data',
        evidence: cabinFinding + ' ' + bloodFinding + ' These results alone cannot establish immune impairment or its cause.',
        action: 'Review cabin sensor trends with environmental procedures. Compare blood counts at matching sample times with the crew medical team.',
        button: 'View cabin CO₂ and blood counts', selection: {
          cabin: 'carbon_dioxide_partial_pressure', lab: labs.find(row => row.metric === 'WHITE BLOOD CELL COUNT')
        }
      }
    ];
    field('i4HazardCards').replaceChildren(...cards.map(card => {
      const article = document.createElement('article');
      article.className = 'i4-hazard';
      const heading = document.createElement('h5');
      heading.textContent = card.title;
      const status = document.createElement('span');
      status.className = 'chip';
      status.textContent = card.status;
      const evidence = document.createElement('p');
      evidence.textContent = card.evidence;
      const action = document.createElement('p');
      action.textContent = card.action;
      article.append(heading, status, evidence, action);
      if (card.button) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn';
        button.textContent = card.button;
        button.addEventListener('click', async () => {
          await showView('trends', card.selection);
          if (!field('i4Trends').hidden) field(card.selection.lab ? 'i4LabMetric' : 'i4CompareMetric').focus();
        });
        article.append(button);
      }
      return article;
    }));
  }

  function renderPlan() {
    const assessment = window.CC_DETECTION.evaluate(replayCheck || { source: 'unknown', values: {} }, replayHistory);
    field('i4PlanStatus').textContent = assessment.severity;
    field('i4PlanAssessment').textContent = replayCheck ? assessment.reasons.join(' ') :
      'This date has no individual in-flight vital-sign check-in in the supplied records. ' +
      'The detector cannot assess crew pulse or blood oxygen from cabin readings or study summaries.';
    const cabin = cache.get('cabin'), labs = cache.get('labs'), comparisons = cache.get('comparisons');
    const co2 = cabin.filter(row => row.metric === 'carbon_dioxide_partial_pressure' && Number.isFinite(row.value));
    const peak = co2.reduce((highest, row) => !highest || row.value > highest.value ? row : highest, null);
    const findings = [
      peak ? 'Cabin CO₂ reached its highest visible chart estimate of ' + peak.value + ' ' + peak.unit + ' on ' + collections.cabin.group(peak) + '.' : 'No cabin CO₂ estimate is available.'
    ];
    const missing = [...new Set(cabin.filter(row => row.value === null).map(collections.cabin.group))];
    if (missing.length) findings.push('The cabin chart has gaps on ' + missing.join(', ') + '. See Trends for the available trace.');
    field('i4PlanEvidence').replaceChildren(...findings.map(text => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
    field('i4PlanNext').textContent = replayNotes[replayDay - 1] +
      ' For a repeatable crew check, record the crew member’s own timestamped pulse, blood oxygen and activity.';
    renderHazards(cabin, labs, comparisons);
  }

  async function showView(view, selection = {}) {
    const panes = { overview: 'i4Overview', trends: 'i4Trends', plan: 'i4Plan' };
    for (const [id, pane] of Object.entries(panes)) field(pane).hidden = id !== view;
    field('i4Hazards').hidden = view !== 'plan';
    document.querySelectorAll('[data-i4-view]').forEach(button => {
      const active = button.dataset.i4View === view;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });
    if (view === 'overview') return;
    try {
      await Promise.all(Object.keys(collections).map(getRows));
      if (view === 'trends') {
        setOptions('i4TrendMetric', Object.entries(metrics), 'carbon_dioxide_partial_pressure');
        setOptions('i4LabCrew', [...new Set(cache.get('labs').map(row => row.crew).filter(Boolean))].map(value => [value, value]));
        setOptions('i4CompareMetric', [...new Set(cache.get('comparisons').map(row => row.metric))].map(value => [value, value]), 'Heart rate');
        if (selection.cabin) field('i4TrendMetric').value = selection.cabin;
        if (selection.comparison) field('i4CompareMetric').value = selection.comparison;
        renderCabinTrend();
        renderLabTrend();
        if (selection.lab) {
          const key = labKey(selection.lab);
          if (cache.get('labs').some(row => row.crew === field('i4LabCrew').value && labKey(row) === key)) {
            field('i4LabMetric').value = key;
            renderLabTrend();
          }
        }
        renderComparisons();
      } else renderPlan();
    } catch {
      field('i4RecordsStatus').textContent = 'Some replay records could not be loaded.';
    }
  }

  function renderCabin() {
    const day = field('i4CabinDay').value;
    const rows = cache.get('cabin').filter(row => collections.cabin.group(row) === day);
    const missing = rows.some(row => row.value === null);
    const cards = Object.entries(metrics).map(([metric, label]) => {
      const samples = rows.filter(row => row.metric === metric && Number.isFinite(row.value));
      const values = samples.map(row => row.value);
      const card = document.createElement('div');
      card.className = 'i4-metric';
      const name = document.createElement('span');
      const range = document.createElement('strong');
      name.textContent = label;
      range.textContent = samples.length
        ? Math.min(...values) + '–' + Math.max(...values) + ' ' + (units[samples[0].unit] || samples[0].unit)
        : 'No chart estimate';
      card.append(name, range);
      if (samples.length && window.CC_CHARTS) {
        const chart = document.createElement('div');
        chart.innerHTML = window.CC_CHARTS.sparkline({
          label: label + ' over ' + day, height: 45, width: 150,
          points: samples.map(row => ({ day: row.time, value: row.value }))
        });
        card.append(chart);
      }
      return card;
    });
    field('i4CabinCards').replaceChildren(...cards);
    field('i4CabinNote').textContent = missing
      ? day + ' has gaps in the cabin chart. The ranges summarize the visible trace.'
      : day + ' ranges summarize the visible cabin traces. Open View source records to check the half-hour estimates.';
  }

  function render() {
    const collection = collections[category];
    const group = field('i4RecordGroup').value;
    const filtered = records.filter(row => !group || collection.group(row) === group);
    const from = page * pageSize;
    field('i4RecordsBody').replaceChildren(...filtered.slice(from, from + pageSize).map(row => {
      const tr = document.createElement('tr');
      const value = row.value === null ? 'Missing' : row.value + (row.unit ? ' ' + (units[row.unit] || row.unit) : '');
      const quality = row.quality === 'reported' || row.quality === 'visible_trace' ? '' : ' (' + row.quality.replaceAll('_', ' ') + ')';
      for (const content of [collection.time(row), row.crew || row.scope.replaceAll('_', ' '),
        metrics[row.metric] || row.metric, value + quality, row.dataset + ' · ' + row.locator]) {
        const td = document.createElement('td');
        td.textContent = content;
        tr.append(td);
      }
      return tr;
    }));
    field('i4PrevRecords').disabled = page === 0;
    field('i4NextRecords').disabled = from + pageSize >= filtered.length;
    field('i4TableStatus').textContent = filtered.length
      ? 'Showing ' + (from + 1) + '–' + Math.min(from + pageSize, filtered.length) + ' of ' + filtered.length + ' historical records.'
      : 'No records in this collection.';
  }

  async function load(next) {
    category = next;
    if (!cache.has('cabin')) field('i4RecordsStatus').textContent = 'Loading cabin chart estimates…';
    field('i4TableStatus').textContent = 'Loading source records…';
    field('i4RecordsBody').replaceChildren();
    for (const id of ['i4RecordGroup', 'i4PrevRecords', 'i4NextRecords']) field(id).disabled = true;
    try {
      await getRows(next);
      if (next === 'cabin') {
        renderCabin();
        field('i4RecordsStatus').textContent = '';
      }
      if (category !== next) return;
      const collection = collections[next];
      records = cache.get(next);
      page = 0;
      const groups = [...new Set(records.map(collection.group))];
      field('i4RecordGroupLabel').textContent = collection.label;
      field('i4RecordGroup').replaceChildren(new Option('All periods', ''), ...groups.map(group => new Option(group)));
      field('i4RecordGroup').disabled = false;
      const source = field('i4RecordsSource');
      source.textContent = collection.source + ' ';
      for (const [label, url] of collection.links) {
        const link = document.createElement('a');
        link.href = url;
        link.textContent = label;
        source.append(link, ' ');
      }
      render();
    } catch {
      if (category !== next) return;
      category = undefined;
      const status = 'Could not load the database. Check the connection and try again.';
      if (!cache.has('cabin')) field('i4RecordsStatus').textContent = status;
      field('i4TableStatus').textContent = status;
    }
  }

  function open() {
    if (!local && !bundled) {
      field('i4RecordsStatus').textContent = 'The historical records are not available in this build.';
      return;
    }
    field('i4RecordsControls').hidden = false;
    if (!cache.has('cabin')) load('cabin');
  }

  field('i4Collection').addEventListener('change', event => load(event.target.value));
  field('i4CabinDay').addEventListener('change', () => { if (cache.has('cabin')) renderCabin(); });
  field('i4RecordGroup').addEventListener('change', () => { page = 0; render(); });
  field('i4PrevRecords').addEventListener('click', () => { page--; render(); });
  field('i4NextRecords').addEventListener('click', () => { page++; render(); });
  field('i4TrendMetric').addEventListener('change', renderCabinTrend);
  field('i4LabCrew').addEventListener('change', renderLabTrend);
  field('i4LabMetric').addEventListener('change', renderLabTrend);
  field('i4CompareMetric').addEventListener('change', renderComparisons);
  field('i4ComparePhase').addEventListener('change', renderComparisons);
  document.querySelectorAll('[data-i4-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.i4View)));
  document.querySelectorAll('[data-i4-collection]').forEach(button => button.addEventListener('click', () => {
    const collection = field('i4Collection');
    collection.value = button.dataset.i4Collection;
    field('i4SourceRecords').open = true;
    collection.focus();
    load(collection.value);
  }));
  window.CC_SET_I4_REPLAY_DAY = (day, check, history = []) => {
    replayDay = day;
    replayCheck = check;
    replayHistory = history;
    field('i4ReplayNote').textContent = replayNotes[day - 1] || '';
    if (!field('i4Plan').hidden && cache.has('comparisons') && cache.has('labs') && cache.has('cabin')) renderPlan();
  };
  window.CC_OPEN_I4_RECORDS = open;
}());
