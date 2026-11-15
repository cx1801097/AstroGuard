/* ============================================================
   CREW CHECK — app.js
   Controller: builds the check-in form, runs the scoring engine on
   every edit, and paints the body map, trends, action plan and log.
   ============================================================ */
(function () {
  'use strict';

  var D = window.CC_DATA;
  var S = window.CC_SCORING;
  var Ch = window.CC_CHARTS;
  var Body = window.CC_BODYMAP;
  var Store = window.CC_STORAGE;
  var Detection = window.CC_DETECTION;

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function cloneObj(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { out[k] = o[k]; });
    return out;
  }

  var STATUS_CLASS = { 'GO': 'is-go', 'CAUTION': 'is-caution', 'NO-GO': 'is-nogo' };
  var STATUS_ICON = { 'GO': '\u25CF', 'CAUTION': '\u25B2', 'NO-GO': '\u25A0' };

  var state = {
    mission: null,
    scope: '',
    mode: 'simulator',
    wearable: null,
    draft: {},
    activity: 'unknown',
    source: 'measured',
    quality: {},
    symptoms: [],
    note: '',
    selected: 'cardiovascular',
    tab: 'body',
    result: null
  };

  /* ---------------- model helpers ---------------- */
  function defaultValues() {
    var v = {};
    D.METRICS.forEach(function (m) { v[m.id] = m.def; });
    return v;
  }

  function entryForDay(day) {
    var found = null;
    state.mission.entries.forEach(function (e) { if (e.day === day) found = e; });
    return found;
  }

  function lastEntry() {
    var sorted = state.mission.entries.slice().sort(function (a, b) { return a.day - b.day; });
    return sorted.length ? sorted[sorted.length - 1] : null;
  }

  function setDraft(entry, sourceIfEmpty) {
    state.draft = entry ? cloneObj(entry.values) : {};
    state.activity = entry ? entry.activity || 'unknown' : 'unknown';
    state.source = entry ? Detection.provenance(entry.source) : sourceIfEmpty;
    state.quality = entry ? cloneObj(entry.quality) : {};
    state.symptoms = entry ? (entry.symptoms || []).slice() : [];
    state.note = entry ? entry.note || '' : '';
    state.wearable = entry ? entry.wearable || null : null;
  }

  function detectionInput() {
    return {
      day: state.mission.flightDay,
      crew: state.mission.crew,
      values: state.draft,
      activity: state.activity,
      source: state.source,
      quality: state.quality
    };
  }

  function persist() { return state.mode !== 'replay' && Store.save(state.mission, state.scope); }

  function fmtVal(metric, v) {
    if (typeof v !== 'number' || isNaN(v)) return '\u2014';
    return v.toFixed(metric.precision);
  }

  /** Contiguous clinical "normal" window, used to shade charts. */
  function normalBand(metric) {
    var prevHi = metric.min;
    for (var i = 0; i < metric.bands.length; i++) {
      var b = metric.bands[i];
      if (b.level === 0) {
        return { lo: prevHi, hi: isFinite(b.hi) ? b.hi : metric.max };
      }
      prevHi = b.hi;
    }
    return null;
  }

  function levelClass(level) {
    return 'lv' + clamp(level, 0, 4);
  }

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var node = $('#toast');
    node.textContent = msg;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, 2600);
  }

  /* ============================================================
     CHECK-IN FORM
     ============================================================ */
  function buildCheckin() {
    var host = $('#metricList');
    var html = '';

    D.METRICS.forEach(function (m) {
      html += '<div class="metric" data-metric="' + m.id + '">' +
        '<div class="metric-top">' +
          '<span class="metric-name">' + esc(m.label) + '</span>' +
          '<span class="band-chip" data-role="band">\u2014</span>' +
        '</div>' +
        '<div class="metric-inputs">' +
          '<input type="range" data-role="range" min="' + m.min + '" max="' + m.max + '" step="' + m.step + '" aria-label="' + esc(m.label) + '">' +
          '<div class="num-wrap">' +
            '<input type="number" data-role="num" min="' + m.min + '" max="' + m.max + '" step="' + m.step + '" inputmode="decimal" aria-label="' + esc(m.label) + ' value">' +
            '<span class="unit">' + esc(m.unit) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    });

    host.innerHTML = html;

    D.METRICS.forEach(function (m) {
      var row = $('.metric[data-metric="' + m.id + '"]', host);
      var range = $('[data-role="range"]', row);
      var num = $('[data-role="num"]', row);

      range.addEventListener('input', function () {
        setMetric(m.id, parseFloat(range.value), 'range');
      });

      num.addEventListener('input', function () {
        var v = parseFloat(num.value);
        setMetric(m.id, Number.isFinite(v) ? v : null, 'num');
      });

      num.addEventListener('blur', function () {
        var v = parseFloat(num.value);
        if (!Number.isFinite(v) || m.id === 'spo2' || m.id === 'heartRate') return;
        v = clamp(v, m.min, m.max);
        setMetric(m.id, v, 'both');
      });
    });

    /* symptoms */
    $('#symptomList').innerHTML = D.SYMPTOMS.map(function (s) {
      return '<button type="button" class="symptom-chip" data-symptom="' + s.id + '">' + esc(s.label) + '</button>';
    }).join('');

    /* scenarios */
    $('#scenarioRow').innerHTML = Object.keys(D.SCENARIOS).map(function (key) {
      var sc = D.SCENARIOS[key];
      return '<button type="button" class="scenario-btn" data-scenario="' + key + '">' +
        '<strong>' + esc(sc.label) + '</strong><span>' + esc(sc.hint) + '</span></button>';
    }).join('');
  }

  var metricInputSyncs = {};

  function setMetric(id, value, source) {
    if (id === 'heartRate') state.wearable = null;
    if (value === null) delete state.draft[id];
    else state.draft[id] = value;
    delete state.quality[id];
    var m = D.METRIC_BY_ID[id];
    var row = $('.metric[data-metric="' + id + '"]');
    if (row) {
      var range = $('[data-role="range"]', row);
      var num = $('[data-role="num"]', row);
      if (source === 'range') num.value = value;
      else if (source === 'num') range.value = value === null ? m.def : clamp(value, m.min, m.max);
      else { range.value = value; num.value = value; }
    }
    refresh(false);
  }

  function syncMetricInput(m) {
    var row = $('.metric[data-metric="' + m.id + '"]');
    if (!row) return;
    var v = state.draft[m.id];
    $('[data-role="range"]', row).value = Number.isFinite(v) ? v : m.def;
    $('[data-role="num"]', row).value = Number.isFinite(v) ? v : '';
  }

  function syncCheckin() {
    $('#readingSource').value = state.source;
    $('#readingActivity').value = state.activity;
    D.METRICS.forEach(syncMetricInput);
    $$('#symptomList .symptom-chip').forEach(function (btn) {
      var on = state.symptoms.indexOf(btn.getAttribute('data-symptom')) >= 0;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#noteInput').value = state.note || '';
    $('#crewName').value = state.mission.crew || '';
    $('#dayLabel').textContent = 'FD ' + state.mission.flightDay;
  }

  /* ============================================================
     HEADER
     ============================================================ */
  var RING_CIRCUMFERENCE = 2 * Math.PI * 42;

  function renderHeader() {
    var r = state.result;
    $('#missionName').textContent = state.mission.name || 'MISSION';
    $('#flightDayOut').textContent = 'FD ' + state.mission.flightDay;

    var dose = state.draft.radiationDose;
    $('#doseOut').textContent = (typeof dose === 'number' ? Math.round(dose) : '\u2014') + ' mSv';

    $('#sleepDebtOut').textContent = r.sleepDebt.toFixed(1) + ' h';

    var value = r.readiness;
    var color = r.triage === 'GO' ? 'var(--go)' : r.triage === 'CAUTION' ? 'var(--caution)' : 'var(--nogo)';

    var ring = $('#readinessRing');
    ring.style.stroke = color;
    ring.setAttribute('stroke-dasharray', RING_CIRCUMFERENCE.toFixed(1));
    ring.setAttribute('stroke-dashoffset', (RING_CIRCUMFERENCE * (1 - value / 100)).toFixed(1));

    $('#readinessValue').textContent = value;
    $('#readinessValue').style.color = color;

    var chip = $('#statusChip');
    chip.textContent = r.triage;
    chip.className = 'status-chip ' + STATUS_CLASS[r.triage];
  }

  /* ============================================================
     BODY MAP + SYSTEM LIST + DETAIL
     ============================================================ */
  function renderBodyMap() {
    Body.render($('#bodyMap'), {
      systems: state.result.systems,
      selected: state.selected,
      onSelect: selectSystem
    });
    renderSystemList();
  }

  function renderSystemList() {
    $('#systemList').innerHTML = D.SYSTEMS.map(function (sys) {
      var r = state.result.systems[sys.id];
      return '<button type="button" class="system-card ' + STATUS_CLASS[r.status] +
        (sys.id === state.selected ? ' is-selected' : '') + '" data-system="' + sys.id + '">' +
        '<span class="sys-dot" aria-hidden="true"></span>' +
        '<span class="sys-main">' +
          '<span class="sys-name">' + esc(sys.name) + '</span>' +
          '<span class="sys-region">' + esc(sys.region) + ' \u00b7 ' + esc(r.status) + '</span>' +
        '</span>' +
        '<span class="sys-sev">' +
          '<span class="sev-bar"><i style="width:' + r.severity + '%"></i></span>' +
          '<span class="sev-num">' + r.severity + '</span>' +
        '</span>' +
      '</button>';
    }).join('');
  }

  function renderSystemDetail() {
    var sys = D.SYSTEM_BY_ID[state.selected];
    var r = state.result.systems[state.selected];
    if (!sys || !r) return;

    var findings = r.findings.length ? r.findings.map(function (f) {
      if (f.symptom) {
        return '<tr class="is-symptom"><td>' + esc(f.symptom) + '</td><td>\u2014</td>' +
          '<td><span class="chip-lv ' + levelClass(f.level) + '">' + esc(f.levelName) + '</span></td></tr>';
      }
      return '<tr><td>' + esc(f.metric) + '</td>' +
        '<td class="num">' + fmtVal(D.METRIC_BY_ID[f.id] || D.METRICS[0], f.value) + ' ' + esc(f.unit) + '</td>' +
        '<td><span class="chip-lv ' + levelClass(f.level) + '">' + esc(f.label) + '</span></td></tr>';
    }).join('') : '<tr><td colspan="3" class="muted">No instrumented indicator for this system \u2014 risk is modelled from flight context.</td></tr>';

    var hazards = sys.hazards.map(function (h) {
      return '<li><strong>' + esc(D.HAZARDS[h].label) + '</strong><span>' + esc(D.HAZARDS[h].detail) + '</span></li>';
    }).join('');

    var actions = r.actions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');

    $('#systemDetail').innerHTML =
      '<div class="detail-head">' +
        '<div>' +
          '<h3>' + esc(sys.name) + ' <span class="muted">\u00b7 ' + esc(sys.region) + '</span></h3>' +
          '<p class="detail-summary">' + esc(sys.summary) + '</p>' +
        '</div>' +
        '<div class="detail-score ' + STATUS_CLASS[r.status] + '">' +
          '<span class="detail-chip">' + STATUS_ICON[r.status] + ' ' + esc(r.status) + '</span>' +
          '<span class="detail-sev">' + r.severity + '<small>/100 severity</small></span>' +
        '</div>' +
      '</div>' +

      '<div class="detail-grid">' +
        '<div class="card">' +
          '<h4>Measured indicators</h4>' +
          '<table class="mini-table"><thead><tr><th>Indicator</th><th>Value</th><th>Band</th></tr></thead>' +
          '<tbody>' + findings + '</tbody></table>' +
          '<p class="detail-note">Context load from flight day, sleep debt and exercise deficit: <strong>' + r.contextRisk + '/100</strong></p>' +
        '</div>' +
        '<div class="card">' +
          '<h4>Recommended actions</h4>' +
          '<ul class="action-list">' + actions + '</ul>' +
        '</div>' +
      '</div>' +

      '<div class="card hazard-card">' +
        '<h4>Why this system is at risk in space</h4>' +
        '<ul class="hazard-list">' + hazards + '</ul>' +
      '</div>';
  }

  function selectSystem(id) {
    state.selected = id;
    renderBodyMap();
    renderSystemDetail();
    var detail = $('#systemDetail');
    if (detail && detail.scrollIntoView) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ============================================================
     TRENDS
     ============================================================ */
  function missionEntriesWithDraft() {
    var list = state.mission.entries.slice().sort(function (a, b) { return a.day - b.day; });
    var hasToday = list.some(function (e) { return e.day === state.mission.flightDay; });
    if (!hasToday) {
      list.push({
        ...detectionInput(),
        symptoms: state.symptoms.slice(),
        note: state.note,
        live: true
      });
      list.sort(function (a, b) { return a.day - b.day; });
    }
    return list;
  }

  function renderTrends() {
    var list = missionEntriesWithDraft();
    var evaluated = S.evaluateMission(list);

    var points = evaluated.map(function (x) {
      return { day: x.entry.day, value: x.result.readiness };
    });

    $('#readinessChart').innerHTML = Ch.readinessChart({ points: points });

    var avg = points.length ? Math.round(points.reduce(function (a, p) { return a + p.value; }, 0) / points.length) : 0;
    var first = points.length ? points[0].value : 0;
    var last = points.length ? points[points.length - 1].value : 0;
    var delta = last - first;
    var arrow = delta > 0 ? '\u25B2' : delta < 0 ? '\u25BC' : '\u25AC';

    $('#trendSummary').innerHTML =
      esc(list.length + ' check-in' + (list.length === 1 ? '' : 's') + ' \u00b7 mean readiness ' + avg) +
      ' \u00b7 <span class="' + (delta < 0 ? 'neg' : 'pos') + '">' + arrow + ' ' + (delta > 0 ? '+' : '') + delta +
      ' since FD ' + (points.length ? points[0].day : '\u2014') + '</span>';

    var cards = D.METRICS.map(function (m) {
      var series = S.series(list, m.id);
      var lastPoint = series.length ? series[series.length - 1] : null;
      var band = S.bandFor(m, lastPoint ? lastPoint.value : null);
      var color = band.level >= 3 ? 'var(--nogo)' : band.level >= 2 ? 'var(--caution)' : '#39d0ff';
      return '<div class="card trend-card">' +
        '<div class="trend-top">' +
          '<span class="trend-name">' + esc(m.label) + '</span>' +
          '<span class="trend-value">' + (lastPoint ? lastPoint.value.toFixed(m.precision) : '\u2014') +
            '<small>' + esc(m.unit) + '</small></span>' +
        '</div>' +
        Ch.sparkline({
          points: series,
          band: normalBand(m),
          color: color,
          label: m.label,
          showDots: series.length <= 40
        }) +
        '<div class="trend-foot">' +
          '<span class="chip-lv ' + levelClass(band.level) + '">' + esc(band.label) + '</span>' +
          '<span class="muted">normal ' + (normalBand(m) ? normalBand(m).lo + '\u2013' + normalBand(m).hi : '\u2014') + ' ' + esc(m.unit) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    $('#trendGrid').innerHTML = cards;
  }

  /* ============================================================
     ACTION PLAN
     ============================================================ */
  function renderPlan() {
    var r = state.result;
    var detection = Detection.evaluate(detectionInput(), state.mission.entries);
    var guidance = Detection.guidance(detection.severity);
    var tones = { NORMAL: 'is-go', WARNING: 'is-caution', CRITICAL: 'is-nogo' };
    $('#healthDetection').innerHTML =
      '<h4>Vital-sign detection <span class="chip ' + (tones[detection.severity] || '') + '">' +
      esc(detection.severity) + '</span></h4><p>' + esc(Detection.sourceLabels[detection.source]) +
      '</p><ul>' + detection.reasons.map(function (reason) {
        return '<li>' + esc(reason) + '</li>';
      }).join('') + '</ul>' + (state.mode === 'replay'
        ? '<p>Historical playback · ' + esc(Detection.sourceLabels[detection.source]) + '</p>'
        : '<p><strong>Crew guidance</strong> ' + esc(guidance.advice) + '</p>');
    var report = state.mode === 'replay' ? '' : Detection.reviewReport(state.mission.flightDay, detection);
    $('#groundReview').hidden = !report;
    if (!report) $('#groundReview').open = false;
    $('#groundReport').value = report;
    var sorted = D.SYSTEMS.slice().sort(function (a, b) {
      return r.systems[b.id].severity - r.systems[a.id].severity;
    });

    var attention = sorted.filter(function (s) { return r.systems[s.id].status !== 'GO'; });

    $('#planSummary').innerHTML =
      '<div class="plan-hero ' + STATUS_CLASS[r.triage] + '">' +
        '<div class="hero-status">' + STATUS_ICON[r.triage] + ' ' + esc(r.triage) + '</div>' +
        '<div class="hero-body">' +
          '<p class="hero-line">' + (r.triage === 'GO'
            ? 'The mission readiness score is in the GO band.'
            : r.triage === 'CAUTION'
              ? 'One or more systems are drifting. Act now — most flight issues are reversible if caught at this stage.'
              : 'A finding requires immediate crew action and flight-surgeon notification.') + '</p>' +
          '<p class="hero-meta">Mission readiness <strong>' + r.readiness + '/100</strong> \u00b7 ' +
            attention.length + ' system' + (attention.length === 1 ? '' : 's') + ' needing attention \u00b7 sleep debt ' +
            r.sleepDebt.toFixed(1) + ' h \u00b7 check-in gap ' + r.daysSinceCheckIn + ' d</p>' +
        '</div>' +
      '</div>';

    $('#alertBlock').innerHTML = r.alerts.length
      ? '<div class="card alert-card"><h4>Findings outside limits</h4><ul>' +
        r.alerts.map(function (a) {
          return '<li class="' + levelClass(a.level) + '">' + esc(a.text) + '</li>';
        }).join('') + '</ul></div>'
      : '<div class="card alert-card is-clear"><h4>No readings outside limits</h4><p class="muted">Keep logging daily \u2014 trend change is the early-warning signal.</p></div>';

    $('#planList').innerHTML = sorted.map(function (sys) {
      var sr = r.systems[sys.id];
      var why = sr.findings.filter(function (f) { return f.level >= 2; })
        .map(function (f) { return f.symptom ? f.symptom : f.metric + ' ' + f.value + ' ' + f.unit + ' (' + f.label + ')'; });
      return '<div class="card plan-card ' + STATUS_CLASS[sr.status] + '">' +
        '<div class="plan-card-head">' +
          '<h4>' + esc(sys.name) + '</h4>' +
          '<span class="chip ' + STATUS_CLASS[sr.status] + '">' + esc(sr.status) + ' \u00b7 ' + sr.severity + '</span>' +
        '</div>' +
        (why.length ? '<p class="plan-why"><span class="muted">Drivers:</span> ' + esc(why.join('; ')) + '</p>'
                    : '<p class="plan-why muted">No indicator outside nominal; context load ' + sr.contextRisk + '/100.</p>') +
        '<ul class="action-list">' + sr.actions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' +
      '</div>';
    }).join('');
  }

  /* ============================================================
     MISSION LOG
     ============================================================ */
  function renderLog() {
    var entries = state.mission.entries.slice().sort(function (a, b) { return b.day - a.day; });
    var evaluated = S.evaluateMission(state.mission.entries);
    var byDay = {};
    evaluated.forEach(function (x) { byDay[x.entry.day] = x.result; });

    $('#logCount').textContent = entries.length
      ? entries.length + ' check-in' + (entries.length === 1 ? '' : 's') + ' on record \u00b7 saved on this device'
      : 'No check-ins yet. Fill the form and press Save.';

    if (!entries.length) {
      $('#logBody').innerHTML = '<tr><td colspan="9" class="empty-row">Nothing logged yet.</td></tr>';
      return;
    }

    $('#logBody').innerHTML = entries.map(function (e) {
      var r = byDay[e.day];
      var v = e.values || {};
      return '<tr class="' + STATUS_CLASS[r.triage] + '">' +
        '<td class="num">FD ' + e.day + '</td>' +
        '<td><span class="chip ' + STATUS_CLASS[r.triage] + '">' + esc(r.triage) + '</span></td>' +
        '<td class="num">' + r.readiness + '</td>' +
        '<td class="num">' + esc(v.systolic != null ? v.systolic : '\u2014') + '/' + esc(v.diastolic != null ? v.diastolic : '\u2014') + '</td>' +
        '<td class="num">' + esc(v.heartRate != null ? v.heartRate : '\u2014') + '</td>' +
        '<td class="num">' + (v.temperature != null ? Number(v.temperature).toFixed(1) : '\u2014') + '</td>' +
        '<td class="num">' + (v.sleepHours != null ? Number(v.sleepHours).toFixed(1) : '\u2014') + '</td>' +
        '<td class="num">' + esc(v.spo2 != null ? v.spo2 : '\u2014') + '</td>' +
        '<td class="row-actions">' +
          '<button type="button" class="mini-btn" data-act="load" data-day="' + e.day + '">Load</button>' +
          '<button type="button" class="mini-btn danger" data-act="del" data-day="' + e.day + '" aria-label="Delete flight day ' + e.day + '">\u00d7</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  /* ============================================================
     REFRESH
     ============================================================ */
  function refresh() {
    var ctx = {
      flightDay: state.mission.flightDay, entries: state.mission.entries,
      activity: state.activity, quality: state.quality
    };
    state.result = S.evaluate(state.draft, ctx, state.symptoms);

    renderHeader();
    renderBodyMap();
    renderSystemDetail();
    renderTrends();
    renderPlan();
    updateBandChips();
    updateSaveState();
  }

  function updateBandChips() {
    D.METRICS.forEach(function (m) {
      var row = $('.metric[data-metric="' + m.id + '"]');
      if (!row) return;
      var band = S.bandFor(m, S.readinessReading(detectionInput(), m.id));
      var chip = $('[data-role="band"]', row);
      chip.textContent = band.label;
      chip.className = 'band-chip ' + levelClass(band.level);
      row.setAttribute('data-level', band.level);
    });
  }

  function updateSaveState() {
    var saved = entryForDay(state.mission.flightDay);
    var node = $('#saveState');
    if (!saved) {
      node.textContent = 'No saved check-in for flight day ' + state.mission.flightDay + '.';
      node.className = 'save-state is-unsaved';
      return;
    }
    var same = JSON.stringify(saved.values) === JSON.stringify(sanitizeDraft());
    var sameSym = JSON.stringify(saved.symptoms) === JSON.stringify(state.symptoms.slice().sort());
    if (same && sameSym && saved.source === state.source && saved.activity === state.activity &&
        saved.crew === state.mission.crew && saved.note === state.note &&
        JSON.stringify(saved.quality) === JSON.stringify(state.quality)) {
      node.textContent = 'Saved for flight day ' + state.mission.flightDay + '.';
      node.className = 'save-state is-saved';
    } else {
      node.textContent = 'Unsaved edits on flight day ' + state.mission.flightDay + '.';
      node.className = 'save-state is-unsaved';
    }
  }

  function sanitizeDraft() {
    var out = {};
    D.METRICS.forEach(function (m) {
      var v = state.draft[m.id];
      if (v !== undefined) out[m.id] = v;
    });
    return out;
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  function saveEntry() {
    if (state.mode === 'replay') return;
    var day = state.mission.flightDay;
    var values = sanitizeDraft();
    var entry = Object.assign(detectionInput(), {
      values: values,
      symptoms: state.symptoms.slice().sort(),
      note: state.note || '',
      wearable: state.wearable,
      savedAt: new Date().toISOString()
    });
    var replaced = false;
    state.mission.entries = state.mission.entries.map(function (e) {
      if (e.day === day) { replaced = true; return entry; }
      return e;
    });
    if (!replaced) state.mission.entries.push(entry);
    state.mission.entries.sort(function (a, b) { return a.day - b.day; });

    if (!persist()) toast('Saved in memory only \u2014 storage is unavailable here.');
    else toast('Check-in saved for flight day ' + day + '.');

    refresh();
    renderLog();
  }

  function nextDay() {
    state.mission.flightDay += 1;
    persist();
    var entry = entryForDay(state.mission.flightDay);
    setDraft(entry && (!entry.crew || entry.crew === state.mission.crew) ? entry : null, state.source);
    syncCheckin();
    refresh();
    renderLog();
    toast('Advancing to flight day ' + state.mission.flightDay + '.');
  }

  function applyScenario(key) {
    var sc = D.SCENARIOS[key];
    if (!sc) return;
    setDraft(null, 'simulated');
    state.draft = defaultValues();
    state.activity = 'rest';
    D.METRICS.forEach(function (m) {
      if (typeof sc.values[m.id] === 'number') state.draft[m.id] = sc.values[m.id];
    });
    state.symptoms = sc.symptoms.slice();
    syncCheckin();
    refresh();
    toast('Loaded demo condition: ' + sc.label);
  }

  function loadEntry(day) {
    var e = entryForDay(day);
    if (!e) return;
    state.mission.flightDay = day;
    if (e.crew) state.mission.crew = e.crew;
    setDraft(e);
    persist();
    syncCheckin();
    refresh();
    renderLog();
    toast('Loaded flight day ' + day + '.');
  }

  function deleteEntry(day) {
    state.mission.entries = state.mission.entries.filter(function (e) { return e.day !== day; });
    persist();
    refresh();
    renderLog();
    toast('Deleted flight day ' + day + '.');
  }

  function loadDemo() {
    state.mission = window.CC_SAMPLE.build();
    setDraft(entryForDay(state.mission.flightDay), 'simulated');
    persist();
    syncCheckin();
    refresh();
    renderLog();
    toast('30-day demo mission loaded.');
  }

  function resetMission() {
    if (!window.confirm('Clear the local mission log and start a fresh mission?')) return;
    Store.clear();
    state.mission = Store.emptyMission();
    state.mission.flightDay = 1;
    setDraft(null, 'measured');
    persist();
    syncCheckin();
    refresh();
    renderLog();
    toast('Mission log cleared.');
  }

  function importFile(file) {
    var reader = new FileReader();
    var targetMission = state.mission;
    reader.onload = function () {
      if (state.mode !== 'simulator' || state.mission !== targetMission) return;
      try {
        var mission = Store.fromJSON(String(reader.result));
        state.mission = mission;
        var last = lastEntry();
        var today = entryForDay(mission.flightDay);
        setDraft(today && (!today.crew || today.crew === mission.crew) ? today : null,
          last ? Detection.provenance(last.source) : 'measured');
        persist();
        syncCheckin();
        refresh();
        renderLog();
        toast('Imported ' + mission.entries.length + ' check-ins.');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function bindEvents() {
    /* tabs */
    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.tab = tab.getAttribute('data-tab');
        $$('.tab').forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        $$('.pane').forEach(function (p) {
          p.classList.toggle('is-active', p.getAttribute('data-pane') === state.tab);
        });
      });
    });

    /* system list */
    $('#systemList').addEventListener('click', function (ev) {
      var card = ev.target.closest ? ev.target.closest('.system-card') : null;
      if (!card) {
        var node = ev.target;
        while (node && node !== this) {
          if (node.classList && node.classList.contains('system-card')) { card = node; break; }
          node = node.parentNode;
        }
      }
      if (card) selectSystem(card.getAttribute('data-system'));
    });

    /* symptom chips */
    $('#symptomList').addEventListener('click', function (ev) {
      var btn = ev.target;
      while (btn && btn !== this && !(btn.getAttribute && btn.getAttribute('data-symptom'))) btn = btn.parentNode;
      if (!btn || !btn.getAttribute || !btn.getAttribute('data-symptom')) return;
      var id = btn.getAttribute('data-symptom');
      var i = state.symptoms.indexOf(id);
      if (i >= 0) state.symptoms.splice(i, 1);
      else state.symptoms.push(id);
      syncCheckin();
      refresh();
    });

    /* scenarios */
    $('#scenarioRow').addEventListener('click', function (ev) {
      var btn = ev.target;
      while (btn && btn !== this && !(btn.getAttribute && btn.getAttribute('data-scenario'))) btn = btn.parentNode;
      if (btn && btn.getAttribute && btn.getAttribute('data-scenario')) {
        applyScenario(btn.getAttribute('data-scenario'));
      }
    });

    $('#saveBtn').addEventListener('click', saveEntry);
    $('#nextDayBtn').addEventListener('click', nextDay);
    $('#demoBtn').addEventListener('click', loadDemo);
    $('#resetBtn').addEventListener('click', resetMission);

    $('#exportBtn').addEventListener('click', function () {
      if (state.mode === 'simulator') saveEntry();
      Store.download(state.mission);
      toast('Mission log exported as JSON.');
    });

    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (file) importFile(file);
      ev.target.value = '';
    });

    $('#noteInput').addEventListener('input', function (ev) {
      state.note = ev.target.value;
      updateSaveState();
    });

    $('#readingSource').addEventListener('change', function (ev) {
      setDraft(null, ev.target.value);
      syncCheckin();
      refresh();
    });

    $('#readingActivity').addEventListener('change', function (ev) {
      state.activity = ev.target.value;
      refresh();
    });

    $('#crewName').addEventListener('change', function (ev) {
      state.mission.crew = ev.target.value.trim();
      setDraft(null, state.source);
      syncCheckin();
      persist();
      refresh();
    });

    /* log table */
    $('#logBody').addEventListener('click', function (ev) {
      var btn = ev.target;
      while (btn && btn !== this && !(btn.getAttribute && btn.getAttribute('data-act'))) btn = btn.parentNode;
      if (!btn || !btn.getAttribute) return;
      var act = btn.getAttribute('data-act');
      var day = parseInt(btn.getAttribute('data-day'), 10);
      if (state.mode === 'replay') return;
      if (act === 'load') loadEntry(day);
      else if (act === 'del') deleteEntry(day);
    });

    /* keyboard: saved entry navigation is enough for now */
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { $('#importFile').value = ''; }
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    buildCheckin();
    bindEvents();
  }

  function open(mode, mission, scope) {
    if (mode !== 'replay' && state.mode === mode && state.scope === scope && state.mission) return;
    state.mode = mode;
    state.scope = scope;
    state.mission = mission;
    var today = entryForDay(state.mission.flightDay);
    var last = lastEntry();
    setDraft(today && (!today.crew || today.crew === state.mission.crew) ? today : null,
      last ? Detection.provenance(last.source) : mode === 'simulator' ? 'simulated' : 'measured');
    $('.checkin-panel').inert = mode === 'replay';
    $('.checkin-panel').toggleAttribute('aria-disabled', mode === 'replay');
    syncCheckin();
    refresh();
    renderLog();
  }

  function useWearable(sample) {
    if (state.mode !== 'mission' || !sample) return;
    setMetric('heartRate', sample.value, 'both');
    state.wearable = { heartRate: sample };
    updateSaveState();
    toast('Wearable heart rate added to this check-in. Save to keep it.');
  }

  window.CC_CONSOLE = { open: open, useWearable: useWearable };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
