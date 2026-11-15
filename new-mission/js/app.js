/* ============================================================
   ASTROGUARD — app.js
   Controller for the crew-operated assessment tool.

   The crew member is the operator, so the flow is deliberately
   linear: enter readings -> get a verdict -> confirm anything that
   is about to be escalated -> hand over a report.

   Nothing on this screen is a simulation. Every value displayed is
   either entered by the crew member or read from the published
   reference dataset in the Flight reference tab, which is clearly
   separated from the assessment.
   ============================================================ */
(function () {
  'use strict';

  var D = window.CC_DATA;
  var S = window.CC_SCORING;
  var Ch = window.CC_CHARTS;
  var Body = window.CC_BODYMAP;
  var Store = window.CC_STORAGE;
  var AI = window.CC_AI || null;
  var I4 = window.CC_I4 || null;

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clone(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { out[k] = o[k]; });
    return out;
  }
  function nowISO() { return new Date().toISOString(); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  var STATUS_CLASS = { 'GO': 'is-go', 'CAUTION': 'is-caution', 'NO-GO': 'is-nogo', 'NO DATA': 'is-nodata' };
  var STATUS_GLYPH = { 'GO': '\u25CF', 'CAUTION': '\u25B2', 'NO-GO': '\u25A0', 'NO DATA': '\u25CB' };

  var COVERAGE_LABEL = {
    measured: 'lab result',
    instrument: 'instrument',
    'self-reported': 'self-report',
    mixed: 'mixed evidence',
    modelled: 'modelled',
    none: 'no data'
  };

  var RING_CIRCUMFERENCE = 2 * Math.PI * 42;

  /* The real NASA instruments and standards this tool is aligned to.
     A link is given only where NASA publishes a stable page. These are
     references for the crew member, not a claim of certification. */
  var NASA_STANDARDS = [
    {
      name: 'NASA Space Flight Human-System Standard (NASA-STD-3001)',
      detail: 'Crew health, sleep, exercise and radiation limits. The clinical bands, the sleep target and the exercise countermeasure schedule are shaped to this standard.',
      url: 'https://standards.nasa.gov/standard/NASA/NASA-STD-3001'
    },
    {
      name: 'NASA Human Research Program \u2014 five hazards of human spaceflight',
      detail: 'Radiation, isolation and confinement, distance from Earth, gravity fields, and the hostile closed environment. This is the risk frame behind the eight body systems scored here.',
      url: 'https://www.nasa.gov/hrp/hazards/'
    },
    {
      name: 'International Space Station Medical Checklist',
      detail: 'The procedure-led model NASA uses on orbit: assess with a defined check, take the listed action, then hand over to the flight surgeon. ASTROGUARD follows that order instead of inventing one.',
      url: null
    },
    {
      name: 'ISS Daily Health Report practice',
      detail: 'A short, repeated self-report at a fixed point in the day. Trend change across checks is the early-warning signal, which is why the record carries a chart and a preflight baseline.',
      url: null
    },
    {
      name: 'NASA Open Science Data Repository (OSDR)',
      detail: 'Source of the published Inspiration4 blood panels in the reference section. Only released values are shown, and every excluded cell is labelled.',
      url: 'https://science.nasa.gov/osdr/'
    },
    {
      name: 'Exploration Medical Capability and the Integrated Medical Model',
      detail: 'NASA Human Research Program work on medical risk for exploration missions. It is why a missing reading is reported as no data rather than as a normal result, and why every escalation ends with the flight surgeon.',
      url: null
    }
  ];



  var state = {
    record: null,
    draft: {},
    wearableDraft: {},
    symptoms: [],
    note: '',
    preflight: false,
    confirm: {},
    tab: 'assessment',
    selected: 'cardiovascular',
    entryId: null,
    formBuilt: false,
    legacy: false,
    aiProbe: null,
    ai: { entryId: null, status: 'idle', data: null, error: null },
    qa: [],
    qaBusy: false,
    refCrew: 'C001',
    refTp: 'R+1'
  };

  /* ============================================================
     MODEL
     ============================================================ */
  function hasRecord() { return Store.hasRecord(state.record); }
  function entries() {
    return (state.record.entries || []).slice().sort(function (a, b) {
      return Date.parse(a.at) - Date.parse(b.at);
    });
  }
  function findEntry(id) {
    var hit = null;
    (state.record.entries || []).forEach(function (e) { if (e.id === id) hit = e; });
    return hit;
  }
  function lastEntry() {
    var list = entries();
    return list.length ? list[list.length - 1] : null;
  }
  function selectedEntry() {
    return (state.entryId && findEntry(state.entryId)) || lastEntry();
  }
  function persist() { return Store.save(state.record); }

  function cleanDraft() {
    var out = {};
    Object.keys(state.draft).forEach(function (k) {
      if (isNum(state.draft[k])) out[k] = state.draft[k];
    });
    return out;
  }

  /* Everything that differs from flight to flight lives in the profile,
     so the same build can serve a 30-day orbital test and a 900-day
     transit without a code change. */
  var DESTINATIONS = [
    { id: 'low-earth-orbit', label: 'Low Earth orbit' },
    { id: 'lunar-orbit', label: 'Lunar orbit' },
    { id: 'lunar-surface', label: 'Lunar surface' },
    { id: 'mars-transit', label: 'Mars transit' },
    { id: 'mars-surface', label: 'Mars surface' },
    { id: 'other', label: 'Other' }
  ];

  function profile() {
    return Store.cloneProfile(state.record && state.record.missionProfile);
  }

  function destinationLabel(id) {
    for (var i = 0; i < DESTINATIONS.length; i++) {
      if (DESTINATIONS[i].id === id) return DESTINATIONS[i].label;
    }
    return 'Not specified';
  }

  function groupEnabled(groupId) {
    var inst = profile().instruments;
    return inst[groupId] !== false;
  }

  function visibleMetrics() {
    return D.METRICS.filter(function (m) { return groupEnabled(m.group); });
  }

  function missingRequired(values) {
    return visibleMetrics().filter(function (m) {
      return m.required && !isNum(values[m.id]);
    });
  }

  function emergencySymptom() {
    return state.symptoms.some(function (id) {
      var s = D.SYMPTOM_BY_ID[id];
      return !!s && s.severity >= 4;
    });
  }

  function canRun() {
    if (!hasRecord()) return false;
    if (!visibleMetrics().length) return false;
    if (emergencySymptom()) return true;
    return missingRequired(cleanDraft()).length === 0;
  }

  function nextFlightDay(phase, at) {
    if (phase === 'preflight') return null;
    if (state.record.missionStart) {
      var off = Store.dayOffset(state.record.missionStart, at);
      if (off !== null) return Math.max(1, off + 1);
    }
    var max = 0;
    entries().forEach(function (e) { if (isNum(e.day)) max = Math.max(max, e.day); });
    return max + 1;
  }

  function evaluateValues(values, entry) {
    var day = entry && isNum(entry.day) ? entry.day : 0;
    var prof = profile();
    return S.evaluate(values, {
      flightDay: day,
      exposureDays: day,
      entries: state.record.entries,
      baseline: state.record.baseline,
      personal: state.record.baseline,
      plannedDays: prof.plannedDays,
      sleepTargetHours: prof.sleepTargetHours
    }, (entry && entry.symptoms) || []);
  }

  function evaluateEntry(entry) {
    return entry ? evaluateValues(entry.values, entry) : null;
  }

  function renderHazardCheck(container, entry) {
    var monitor = window.CC_HAZARDS;
    if (!monitor || !container) return;
    var crew = state.record.crewId;
    var candidate = entry || { values: state.draft, day: nextFlightDay(state.preflight ? 'preflight' : 'flight', nowISO()) };
    monitor.render(container, {
      values: candidate.values, source: 'measured', day: state.record.missionStart ? candidate.day : null, crew: crew,
      sleepTarget: candidate.values.sleepTargetAtCheck ?? profile().sleepTargetHours,
      history: entries().filter(function (previous) { return previous.phase === 'flight'; }).map(function (previous) {
        return { day: previous.day, crew: crew, source: 'measured', values: previous.values };
      })
    });
  }

  function dayLabel(entry) {
    return Store.dayLabel(entry, state.record.missionStart);
  }

  function timeLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function dateLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fmt(metric, v) {
    if (!isNum(v)) return '\u2014';
    return Number(v).toFixed(metric.precision);
  }

  /** Why a metric scored the way it did, in one phrase. */
  function reasonFor(metric, r) {
    if (!r || r.absent) return 'not measured';
    if (r.rule === 'both') return r.label + ' \u00b7 ' + S.deltaText(r, metric);
    if (r.rule === 'baseline') {
      if (metric.mode === 'baseline') {
        return r.fold ? r.fold.toFixed(1) + '\u00d7 your baseline' : r.label;
      }
      return S.deltaText(r, metric);
    }
    if (r.ref) return r.label + ' (' + trim(r.ref.lo) + '\u2013' + trim(r.ref.hi) + ' ' + metric.unit + ')';
    return r.label;
  }

  function trim(n) {
    return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  }

  function levelClass(level) {
    if (level < 0) return 'lv-none';
    return 'lv' + Math.max(0, Math.min(4, level));
  }

  /** Cheap single-metric band for live form feedback. */
  function quickBand(metric, v) {
    if (!isNum(v)) return { level: -1, text: '' };
    var band = S.bandFor(metric, v, { baseline: state.record.baseline });
    var delta = S.deltaBand(metric, v, state.record.baseline);
    var level = band.level;
    var text = band.label;

    if (delta && delta.level > 0 && delta.level >= band.level) {
      level = delta.level;
      text = (delta.diff > 0 ? '+' : '') + delta.diff.toFixed(metric.precision) + ' ' + metric.unit + ' vs baseline';
    }
    return { level: level, text: text, band: band, delta: delta };
  }

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var node = $('#toast');
    node.textContent = msg;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, 3200);
  }

  /* ============================================================
     CHECK-IN FORM
     ============================================================ */
  function metricsForGroup(groupId) {
    var pool = groupId === 'labs' ? D.LAB_METRICS : D.METRICS;
    return pool.filter(function (m) { return m.group === groupId; })
      .sort(function (a, b) {
        return (a.order || 0) - (b.order || 0) || a.label.localeCompare(b.label);
      });
  }

  function metricRow(m) {
    return '<div class="mrow" data-metric="' + m.id + '">' +
      '<div class="mrow-top">' +
        '<label for="f-' + m.id + '">' + esc(m.label) +
          (m.required ? ' <b class="req" aria-hidden="true">*</b>' : '') + '</label>' +
        '<span class="band-chip" data-role="band"></span>' +
      '</div>' +
      '<div class="mrow-input">' +
        '<input id="f-' + m.id + '" data-role="input" type="number" inputmode="decimal"' +
          ' min="' + m.min + '" max="' + m.max + '" step="' + m.step + '"' +
          ' placeholder="\u2014" autocomplete="off">' +
        '<span class="unit">' + esc(m.unit) + '</span>' +
      '</div>' +
      '<div class="mrow-base" data-role="base"></div>' +
    '</div>';
  }

  function buildForm() {
    var html = '';

    D.GROUPS.forEach(function (group) {
      /* A flight that does not carry an instrument group must not be
         asked for readings it cannot take. */
      if (!groupEnabled(group.id)) return;

      var metrics = metricsForGroup(group.id);
      if (!metrics.length) return;

      var inner = metrics.map(metricRow).join('');
      var requiredCount = metrics.filter(function (m) { return m.required; }).length;

      if (group.id === 'labs') {
        html += '<details class="form-group form-group-labs">' +
          '<summary>' +
            '<span class="group-title">' + esc(group.label) + '</span>' +
            '<span class="group-meta">' + metrics.length + ' analytes \u00b7 optional</span>' +
          '</summary>' +
          '<p class="group-hint">' + esc(group.hint) + '</p>' +
          '<div class="group-grid">' + inner + '</div>' +
        '</details>';
        return;
      }

      html += '<fieldset class="form-group">' +
        '<legend class="group-title">' + esc(group.label) +
          (requiredCount ? ' <span class="group-meta">' + requiredCount + ' required</span>' : '') +
        '</legend>' +
        '<p class="group-hint">' + esc(group.hint) + '</p>' +
        '<div class="group-grid">' + inner + '</div>' +
      '</fieldset>';
    });

    $('#formHost').innerHTML = html;

    $('#symptomList').innerHTML = D.SYMPTOMS.map(function (s) {
      return '<button type="button" class="chip-btn' + (s.severity >= 4 ? ' chip-btn-alert' : '') +
        '" data-symptom="' + s.id + '" aria-pressed="false">' + esc(s.label) + '</button>';
    }).join('');

    state.formBuilt = true;
  }

  function buildSetupBaseline() {
    $('#setupBaseline').innerHTML = D.BASELINE_METRICS
      .slice()
      .sort(function (a, b) { return (a.group + a.order).localeCompare(b.group + b.order); })
      .map(function (m) {
        return '<label class="base-field">' +
          '<span>' + esc(m.label) + '</span>' +
          '<input id="setupBase-' + m.id + '" type="number" inputmode="decimal" step="' + m.step +
            '" min="' + m.min + '" max="' + m.max + '" placeholder="\u2014">' +
          '<em>' + esc(m.unit) + '</em>' +
        '</label>';
      }).join('');
  }

  function buildSetupProfile() {
    var host = $('#setupProfile');
    if (host) host.innerHTML = profileFields('setup', false);
  }

  function syncForm() {
    if (!state.formBuilt || !hasRecord()) return;
    window.CC_HAZARDS?.sync($('#missionHazardInputs'), state.draft);
    renderHazardCheck($('#missionHazardPreview'));

    $$('#formHost .mrow').forEach(function (row) {
      var id = row.getAttribute('data-metric');
      var metric = D.METRIC_BY_ID[id];
      var input = $('[data-role="input"]', row);
      if (!metric || !input) return;

      var v = state.draft[id];
      if (document.activeElement !== input) {
        input.value = isNum(v) ? String(v) : '';
      }

      var q = quickBand(metric, v);
      var chip = $('[data-role="band"]', row);
      if (chip) {
        chip.textContent = q.level < 0 ? '\u2014' : (q.level === 0 ? 'in range' : q.text);
        chip.className = 'band-chip ' + levelClass(q.level);
      }
      row.setAttribute('data-level', q.level);

      var base = $('[data-role="base"]', row);
      if (base) {
        var b = state.record.baseline && state.record.baseline[id];
        if (isNum(b)) {
          base.textContent = 'your baseline ' + Number(b).toFixed(metric.precision) + ' ' + metric.unit;
          base.className = 'mrow-base has-baseline';
        } else if (metric.delta) {
          base.textContent = 'no baseline \u2014 change detection off';
          base.className = 'mrow-base';
        } else {
          base.textContent = '';
          base.className = 'mrow-base';
        }
      }
    });

    $$('#symptomList .chip-btn').forEach(function (btn) {
      var on = state.symptoms.indexOf(btn.getAttribute('data-symptom')) >= 0;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var note = $('#noteInput');
    if (document.activeElement !== note) note.value = state.note || '';

    $('#preflightToggle').checked = !!state.preflight;

    var last = lastEntry();
    $('#copyLastBtn').disabled = !last;

    /* required meter */
    var values = cleanDraft();
    var missing = missingRequired(values);
    var requiredMetrics = visibleMetrics().filter(function (m) { return m.required; });
    var total = requiredMetrics.length;
    var have = total - missing.length;
    var meter = $('#reqMeter');

    if (!total) {
      meter.className = 'req-meter is-emergency';
      meter.innerHTML = '<strong>No instrument group is enabled.</strong> Configure the mission instruments in the <strong>Mission</strong> tab before running a check.';
    } else if (emergencySymptom() && missing.length) {
      meter.className = 'req-meter is-emergency';
      meter.innerHTML = '<strong>Emergency entry allowed.</strong> A red-flag symptom is selected, so this check can be logged with incomplete readings.';
    } else if (!missing.length) {
      meter.className = 'req-meter is-ready';
      meter.innerHTML = '<strong>' + total + ' of ' + total + ' required readings.</strong> Ready to run.';
    } else {
      meter.className = 'req-meter';
      meter.innerHTML = '<strong>' + have + ' of ' + total + ' required readings.</strong> Missing: ' +
        esc(missing.map(function (m) { return m.label; }).join(', '));
    }

    $('#runBtn').disabled = !canRun();
  }

  /* ============================================================
     HEADER
     ============================================================ */
  function renderHeader() {
    var entry = selectedEntry();
    var result = entry ? evaluateEntry(entry) : null;

    $('#crewOut').textContent = hasRecord() ? state.record.crewId : '\u2014';
    $('#missionOut').textContent = hasRecord() && state.record.mission ? state.record.mission : '\u2014';

    if (entry) {
      $('#dayOut').textContent = dayLabel(entry);
      $('#dayPill').textContent = dayLabel(entry);
    } else if (hasRecord() && state.record.missionStart) {
      var fd = nextFlightDay('flight', nowISO());
      $('#dayOut').textContent = 'Flight day ' + fd;
      $('#dayPill').textContent = 'Flight day ' + fd;
    } else {
      $('#dayOut').textContent = '\u2014';
      $('#dayPill').textContent = '\u2014';
    }

    var baseCount = state.record && state.record.baseline ? Object.keys(state.record.baseline).length : 0;
    $('#baselineOut').textContent = baseCount ? baseCount + ' metrics' : 'not set';

    var ring = $('#readinessRing');
    var chip = $('#statusChip');
    var sub = $('#statusSub');

    if (!result) {
      ring.style.stroke = 'rgba(125,147,173,0.35)';
      ring.setAttribute('stroke-dasharray', RING_CIRCUMFERENCE.toFixed(1));
      ring.setAttribute('stroke-dashoffset', RING_CIRCUMFERENCE.toFixed(1));
      $('#readinessValue').textContent = '--';
      $('#readinessValue').style.color = '';
      chip.textContent = 'NO DATA';
      chip.className = 'status-chip';
      sub.textContent = hasRecord() ? 'no check logged' : 'record not set up';
      return;
    }

    var color = result.triage === 'GO' ? 'var(--go)'
      : result.triage === 'CAUTION' ? 'var(--caution)' : 'var(--nogo)';

    ring.style.stroke = color;
    ring.setAttribute('stroke-dasharray', RING_CIRCUMFERENCE.toFixed(1));
    ring.setAttribute('stroke-dashoffset', (RING_CIRCUMFERENCE * (1 - result.readiness / 100)).toFixed(1));

    $('#readinessValue').textContent = result.readiness;
    $('#readinessValue').style.color = color;

    chip.textContent = result.triage;
    chip.className = 'status-chip ' + STATUS_CLASS[result.triage];
    sub.textContent = dayLabel(entry) + ' \u00b7 ' + timeLabel(entry.at);
  }

  /* ============================================================
     ASSESSMENT PANE
     ============================================================ */
  function renderAssessment() {
    var host = $('#assessBody');
    var draftCount = Object.keys(cleanDraft()).length;

    if (!hasRecord()) {
      host.innerHTML = onboardCard();
      return;
    }

    var entry = selectedEntry();
    var strip = draftCount
      ? '<div class="draft-strip"><span class="pulse-dot"></span>' +
        '<span><strong>New check in progress</strong> \u2014 ' + draftCount + ' reading' +
        (draftCount === 1 ? '' : 's') + ' entered, not yet run.</span>' +
        '<button type="button" class="btn btn-quiet btn-sm" data-act="focus-form">Go to form</button></div>'
      : '';

    if (!entry) {
      host.innerHTML = strip + emptyRecordCard();
      return;
    }

    var result = evaluateEntry(entry);
    host.innerHTML = strip + '<div class="assessment-columns">' + crewSuggestionCard(entry, result) +
      '<div>' + checkCard(entry, result) + assistantLink() + '</div></div>';
    var evidenceStatus = { 'GO': 'NORMAL', 'CAUTION': 'WARNING', 'NO-GO': 'CRITICAL', 'NO DATA': 'UNKNOWN' };
    window.CC_RENDER_EVIDENCE?.(host.querySelector('.astroguard-evidence'),
      result.emergency ? 'CRITICAL' : evidenceStatus[result.triage] || 'UNKNOWN');
    renderHazardCheck(host.querySelector('.saved-hazard-results'), entry);
  }

  function crewSuggestionCard(entry, result) {
    var alerts = result.alerts.slice().sort(function (a, b) { return b.level - a.level; });
    var situation = result.emergency ? 'A serious symptom was reported.' :
      result.triage === 'NO DATA' ? 'There are not enough usable readings to assess this check.' :
      alerts.length ? 'One or more readings or symptoms need a closer look.' :
      'The available readings did not raise an alert.';
    var next = result.emergency || result.triage === 'NO-GO'
      ? 'Tell the crew medical officer and contact the flight surgeon now. Follow the mission’s emergency checklist.'
      : result.triage === 'CAUTION' ? 'If it is safe, repeat any unusual readings. Tell the crew medical officer if the unusual reading persists or you feel unwell.'
      : result.triage === 'NO DATA' ? 'Enter the readings you can safely collect. Tell the crew medical officer if you feel unwell.'
      : 'Continue scheduled checks. Tell the crew medical officer if you feel unwell.';
    var inventory = profile().resources;
    var gear = [];
    if (result.triage === 'CAUTION' && inventory.pulseOximeter && (entry.pending || []).includes('spo2')) gear.push('pulse oximeter');
    if (result.triage === 'CAUTION' && inventory.heartRateMonitor && (entry.pending || []).includes('heartRate')) gear.push('heart-rate monitor');
    return '<aside class="card crew-suggestion-card"><h3>Crew Suggestion</h3>' +
      '<h4>What is happening now</h4><p>' + esc(situation) + '</p>' +
      (alerts.length ? '<ul>' + alerts.slice(0, 3).map(function (alert) {
        return '<li>' + esc(alert.text) + '</li>';
      }).join('') + '</ul>' : '') +
      '<h4>What to do next</h4><p>' + esc(next) + '</p>' +
      (gear.length ? '<p>For the recheck, use the listed ' + esc(gear.join(' and ')) + '.</p>' : '') +
      ((result.emergency || result.triage === 'NO-GO') && inventory.medicalChannel
        ? '<p>Listed private medical channel: ' + esc(inventory.medicalChannel) + '</p>' : '') +
      '<h4>AI review</h4><p role="status">AI review is limited to the simulated demo. Using ASTROGUARD’s rule-based guidance above.</p>' +
      '<div class="astroguard-evidence" hidden></div><h4>Spaceflight hazard detection</h4>' +
      '<div class="saved-hazard-results"></div></aside>';
  }

  function onboardCard() {
    return '<div class="card onboard">' +
      '<div class="onboard-mark" aria-hidden="true">' + '</div>' +
      '<h2>Set up your record first</h2>' +
      '<p class="lede">ASTROGUARD keeps <strong>one crew member\u2019s</strong> health record on this device. ' +
        'It learns your preflight baseline, then watches for change against it during the mission.</p>' +
      '<ol class="steps">' +
        '<li><span>1</span><div><strong>Enter your callsign.</strong> Optionally add your usual preflight readings \u2014 that is what makes a change visible later.</div></li>' +
        '<li><span>2</span><div><strong>Run a check.</strong> Vitals, sleep, mood, symptoms. Every reading you enter is compared to your own baseline as well as to clinical limits.</div></li>' +
        '<li><span>3</span><div><strong>Act, then hand over.</strong> You get a verdict and specific actions, and a structured report you can read to the ground.</div></li>' +
      '</ol>' +
      '<p class="muted small">The form is in the left panel. Nothing is uploaded and no network is required.</p>' +
      '</div>';
  }

  function emptyRecordCard() {
    return '<div class="card empty-card">' +
      '<h3>No checks logged yet</h3>' +
      '<p>Fill the check-in form on the left and press <strong>Run check</strong>. ' +
        'The first check is saved to this device and becomes part of your record.</p>' +
      (state.record.baseline ? '' :
        '<p class="muted small">You have no personal baseline yet, so the tool can only compare you to clinical limits. ' +
        'Add your preflight values in the <strong>Baseline</strong> tab to turn on change detection.</p>') +
      '</div>';
  }

  function checkCard(entry, result) {
    var pending = entry.pending || [];
    var badges = [];
    if (entry.phase === 'preflight') badges.push('<span class="badge badge-pre">PREFLIGHT</span>');
    if (pending.length) badges.push('<span class="badge badge-pending">PROVISIONAL</span>');
    if (!pending.length && Object.keys(entry.confirm || {}).length) {
      badges.push('<span class="badge badge-confirmed">CONFIRMED</span>');
    }
    var wearableSources = Object.values(entry.wearable || {}).map(function (sample) {
      var label = D.METRIC_BY_ID[sample.metric].label;
      return '<li>' + esc(label + ': ' + sample.value + ' ' + sample.unit + ' · ' + sample.provider + ' · ' + sample.timestamp) + '</li>';
    }).join('');

    return '<article class="check-card">' +
      '<div class="check-meta">' +
        '<div class="check-when"><strong>' + esc(dayLabel(entry)) + '</strong>' +
          '<span>' + esc(dateLabel(entry.at)) + ' \u00b7 ' + esc(timeLabel(entry.at)) + '</span></div>' +
        '<div class="check-badges">' + badges.join('') + '</div>' +
      '</div>' +
      verdictHero(result) +
      driversCard(result) +
      (wearableSources ? '<section class="card"><h4>Wearable readings used</h4><ul class="wearable-sources">' +
        wearableSources + '</ul></section>' : '') +
      (pending.length ? confirmCard(entry, result) : '') +
      actionsCard(result) +
      evidenceCard(result) +
      handoverCard(entry, result) +
    '</article>';
  }

  function verdictLine(result) {
    if (result.emergency) {
      return 'A red-flag symptom is reported. Treat it now and contact the flight surgeon \u2014 do not wait on the numbers.';
    }
    if (result.triage === 'GO') {
      return 'Every assessed system is within its limits. Continue the countermeasure schedule and log again tomorrow.';
    }
    if (result.triage === 'CAUTION') {
      return 'Something is drifting. Act now \u2014 most flight issues are still reversible at this stage.';
    }
    return 'A finding needs crew action and flight-surgeon review. Suspend demanding tasks until it has been reviewed.';
  }

  function verdictHero(result) {
    var cls = STATUS_CLASS[result.triage];
    var note = result.hasBaseline ? '' :
      '<p class="verdict-note">No personal baseline is set, so change detection is off. This verdict is against clinical limits only.</p>';

    return '<section class="verdict ' + cls + '">' +
      '<div class="verdict-row">' +
        '<span class="verdict-glyph" aria-hidden="true">' + STATUS_GLYPH[result.triage] + '</span>' +
        '<span class="verdict-status">' + esc(result.triage) + '</span>' +
        '<span class="verdict-score">' + result.readiness + '<small>/100</small></span>' +
      '</div>' +
      '<p class="verdict-line">' + esc(verdictLine(result)) + '</p>' +
      '<p class="verdict-meta">' + result.assessedCount + ' of ' + D.SYSTEMS.length +
        ' body systems assessed \u00b7 ' + result.alerts.length + ' finding' +
        (result.alerts.length === 1 ? '' : 's') + ' outside limits</p>' +
      note +
    '</section>';
  }

  function driversCard(result) {
    var rows = [];
    D.ALL_METRICS.forEach(function (m) {
      var r = result.results[m.id];
      if (!r || r.absent || r.level < 1) return;
      rows.push({ m: m, r: r });
    });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return b.r.level - a.r.level || a.m.label.localeCompare(b.m.label); });
    rows = rows.slice(0, 5);

    return '<section class="card">' +
      '<h4>What is driving this</h4>' +
      '<ul class="driver-list">' +
        rows.map(function (x) {
          return '<li class="driver ' + levelClass(x.r.level) + '">' +
            '<span class="driver-name">' + esc(x.m.label) + '</span>' +
            '<span class="driver-value num">' + fmt(x.m, x.r.value) + ' <small>' + esc(x.m.unit) + '</small></span>' +
            '<span class="driver-why">' + esc(reasonFor(x.m, x.r)) + '</span>' +
            '<span class="driver-level">' + esc(x.r.levelName) + '</span>' +
          '</li>';
        }).join('') +
      '</ul>' +
    '</section>';
  }

  function confirmCard(entry, result) {
    var pending = entry.pending || [];
    var rows = pending.map(function (id) {
      var m = D.METRIC_BY_ID[id];
      var first = entry.values[id];
      return '<div class="confirm-row" data-metric="' + id + '">' +
        '<div class="confirm-why">' +
          '<strong>' + esc(m.label) + '</strong>' +
          '<span>first reading ' + fmt(m, first) + ' ' + esc(m.unit) +
            ' \u00b7 ' + esc(result.results[id] ? result.results[id].levelName : '') + '</span>' +
        '</div>' +
        '<div class="confirm-input">' +
          '<input type="number" inputmode="decimal" data-confirm="' + id + '"' +
            ' min="' + m.min + '" max="' + m.max + '" step="' + m.step + '" placeholder="re-measure">' +
          '<span class="unit">' + esc(m.unit) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<section class="card confirm-card">' +
      '<h4>Confirm before you escalate</h4>' +
      '<p class="card-lede">' + pending.length + ' reading' + (pending.length === 1 ? '' : 's') +
        ' crossed an escalation threshold. A bad cuff, cold hands or a mis-placed sensor can do that. ' +
        'Re-measure to confirm \u2014 a confirmed reading stands, a cleared one is logged as an artefact.</p>' +
      rows +
      '<div class="confirm-actions">' +
        '<button type="button" class="btn btn-primary" data-act="confirm-readings">Confirm readings</button>' +
        '<button type="button" class="btn btn-quiet" data-act="accept-unverified">Cannot re-measure \u2014 record as unverified</button>' +
      '</div>' +
    '</section>';
  }

  function actionsCard(result) {
    var seen = {};
    var out = [];
    var order = D.SYSTEMS.slice().sort(function (a, b) {
      return (result.systems[b.id].severity || 0) - (result.systems[a.id].severity || 0);
    });

    order.forEach(function (sys) {
      var r = result.systems[sys.id];
      if (!r.assessed || r.status === 'GO') return;
      r.actions.forEach(function (a) {
        if (seen[a]) return;
        seen[a] = true;
        out.push({ text: a, system: sys.name });
      });
    });

    out = out.slice(0, 6);

    var body = out.length
      ? '<ol class="action-list">' + out.map(function (a) {
          return '<li><span class="action-text">' + esc(a.text) + '</span>' +
            '<span class="action-src">' + esc(a.system) + '</span></li>';
        }).join('') + '</ol>'
      : '<p class="muted">Nothing beyond the standard countermeasure schedule. Keep the daily check-in habit \u2014 trend change is the early-warning signal.</p>';

    return '<section class="card">' +
      '<h4>Do this now</h4>' + body +
    '</section>';
  }

  function evidenceCard(result) {
    var missing = D.SYSTEMS.filter(function (sys) {
      var r = result.systems[sys.id];
      return r && !r.assessed;
    });

    var assessed = D.SYSTEMS.filter(function (sys) {
      var r = result.systems[sys.id];
      return r && r.assessed;
    });

    return '<section class="card">' +
      '<h4>How much evidence this is based on</h4>' +
      '<div class="evidence-grid">' +
        assessed.map(function (sys) {
          var r = result.systems[sys.id];
          return '<div class="evidence-row ' + STATUS_CLASS[r.status] + '">' +
            '<span class="evidence-dot" aria-hidden="true"></span>' +
            '<span class="evidence-name">' + esc(sys.name) + '</span>' +
            '<span class="evidence-cov">' + esc(COVERAGE_LABEL[r.coverage] || r.coverage) + '</span>' +
            '<span class="evidence-status">' + esc(r.status) + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      (missing.length
        ? '<p class="evidence-gap"><strong>Not assessed:</strong> ' +
          esc(missing.map(function (s) { return s.name; }).join(', ')) +
          '. No measurement exists for these here, so they are excluded from readiness \u2014 a missing reading is not a normal one.</p>'
        : '') +
    '</section>';
  }

  /* ============================================================
     HANDOVER REPORT
     Situational handover: situation, background, assessment,
     recommendation. Plain words, no abbreviations.
     ============================================================ */
  function ruleLine(ch) {
    return new Array(75).join(ch || '-');
  }

  function buildHandover(entry, result) {
    var rec = state.record;
    var L = [];
    function push(s) { L.push(s === undefined ? '' : s); }

    var pending = entry.pending || [];
    var stateWord = pending.length ? 'PROVISIONAL \u2014 unverified readings' : 'confirmed';
    var p = profile();

    push('ASTROGUARD \u2014 HANDOVER REPORT');
    push(ruleLine('='));
    push('Crew          ' + (rec.crewId || '\u2014'));
    push('Mission       ' + (rec.mission || '\u2014'));
    push('Destination   ' + destinationLabel(p.destination));
    push('Planned       ' + p.plannedDays + ' days \u00b7 crew of ' + p.crewSize);
    push('Comm delay    ' + commDelayLabel(p.commDelaySeconds));
    push('Sleep target  ' + p.sleepTargetHours + ' hours per day');
    push('Check         ' + dayLabel(entry) + ' \u00b7 ' + dateLabel(entry.at) + ' ' + timeLabel(entry.at));
    push('Phase         ' + (entry.phase === 'preflight' ? 'preflight (baseline)' : 'in flight'));
    push('Status        ' + result.triage + ' \u2014 readiness ' + result.readiness + '/100 (' + stateWord + ')');
    push('Baseline      ' + baselineLine());
    push('');

    /* Situation */
    push('SITUATION');
    push(ruleLine());
    push(wrap(verdictLine(result), 72, '   '));
    if (result.alerts.length) {
      push('   Findings outside limits:');
      result.alerts.forEach(function (a) {
        push(wrap('- ' + a.text, 72, '     '));
      });
    } else {
      push('   No reading outside its limits.');
    }
    push('');

    /* Background */
    push('BACKGROUND');
    push(ruleLine());
    var prev = previousEntry(entry);
    if (prev) {
      var pr = evaluateEntry(prev);
      push('   Previous check: ' + dayLabel(prev) + ' \u00b7 ' + pr.triage + ' (' + pr.readiness + '/100)');
    } else {
      push('   Previous check: none on this device.');
    }
    push('   Symptoms: ' + (entry.symptoms.length
      ? entry.symptoms.map(function (id) {
          var s = D.SYMPTOM_BY_ID[id];
          return s ? s.label : id;
        }).join(', ')
      : 'none reported'));
    if (entry.note) push(wrap('Crew note: "' + entry.note + '"', 72, '   '));
    push('');

    /* Assessment */
    push('ASSESSMENT');
    push(ruleLine());
    D.SYSTEMS.forEach(function (sys) {
      var r = result.systems[sys.id];
      if (!r.assessed) return;
      push('   ' + padRight(sys.name, 24) + ' ' + padRight(r.status, 8) +
        String(r.severity).padStart(3) + '/100  [' + (COVERAGE_LABEL[r.coverage] || r.coverage) + ']');

      r.findings.forEach(function (f) {
        if (f.absent || f.level < 1) return;
        if (f.symptom) {
          push('     - reported: ' + f.symptom);
          return;
        }
        var m = D.METRIC_BY_ID[f.id];
        if (!m) return;
        push('     - ' + padRight(m.label, 22) + ' ' + padRight(fmt(m, f.value) + ' ' + m.unit, 14) +
          f.levelName + ' (' + reasonFor(m, result.results[m.id]) + ')');
      });
    });

    var missing = D.SYSTEMS.filter(function (s) { return !result.systems[s.id].assessed; });
    if (missing.length) {
      push('');
      push(wrap('Not assessed: ' + missing.map(function (s) { return s.name; }).join(', ') +
        '. No measurement available in this check.', 72, '   '));
    }

    if (Object.keys(entry.confirm || {}).length) {
      push('');
      push('   Confirmation of escalated readings:');
      Object.keys(entry.confirm).forEach(function (id) {
        var c = entry.confirm[id];
        var m = D.METRIC_BY_ID[id];
        if (!m) return;
        push('     - ' + m.label + ': first ' + fmt(m, c.first) + ', re-measured ' + fmt(m, c.second) +
          ' \u2192 ' + (c.resolved === 'confirmed' ? 'confirmed' : c.resolved));
      });
    }
    push('');

    /* Recommendation */
    push('RECOMMENDATION');
    push(ruleLine());
    var actions = collectActions(result);
    if (actions.length) {
      actions.forEach(function (a, i) { push(wrap((i + 1) + '. ' + a.text, 72, '   ')); });
    } else {
      push('   Continue the countermeasure schedule. Repeat the check tomorrow.');
    }
    push('');
    if (result.triage !== 'GO' || pending.length) {
      push(wrap('Escalate to the flight surgeon per the mission medical plan.', 72, '   '));
      push('');
    }
    push(ruleLine());
    push('Generated by ASTROGUARD \u00b7 rule-based decision support, not a diagnosis.');

    return L.join('\n');
  }

  function padRight(s, n) {
    s = String(s);
    return s.length >= n ? s.slice(0, n - 1) + ' ' : s + new Array(n - s.length + 1).join(' ');
  }

  function wrap(text, width, indent) {
    indent = indent || '';
    var words = String(text).split(/\s+/);
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      if (!line.length) line = w;
      else if ((line + ' ' + w).length <= width - indent.length) line += ' ' + w;
      else { lines.push(indent + line); line = w; }
    });
    if (line.length) lines.push(indent + line);
    return lines.join('\n');
  }

  function collectActions(result) {
    var seen = {};
    var out = [];
    D.SYSTEMS.slice().sort(function (a, b) {
      return (result.systems[b.id].severity || 0) - (result.systems[a.id].severity || 0);
    }).forEach(function (sys) {
      var r = result.systems[sys.id];
      if (!r.assessed || r.status === 'GO') return;
      r.actions.forEach(function (a) {
        if (seen[a]) return;
        seen[a] = true;
        out.push({ text: a, system: sys.name });
      });
    });
    return out.slice(0, 6);
  }

  function baselineLine() {
    var rec = state.record;
    if (!rec.baseline) return 'not set \u2014 clinical limits only';
    var n = Object.keys(rec.baseline).length;
    var meta = rec.baselineMeta || {};
    var source = meta.source === 'preflight-checks' ? 'preflight checks'
      : meta.source === 'first-check' ? 'first check'
      : 'entered';
    return n + ' metrics from ' + source + (meta.setAt ? ', set ' + dateLabel(meta.setAt) : '');
  }

  function previousEntry(entry) {
    var list = entries();
    var idx = -1;
    list.forEach(function (e, i) { if (e.id === entry.id) idx = i; });
    return idx > 0 ? list[idx - 1] : null;
  }

  function handoverCard(entry, result) {
    var text = buildHandover(entry, result);
    return '<section class="card handover-card">' +
      '<div class="card-head">' +
        '<h4>Handover report</h4>' +
        '<div class="card-actions">' +
          '<button type="button" class="btn btn-quiet btn-sm" data-act="copy-report">Copy</button>' +
          '<button type="button" class="btn btn-quiet btn-sm" data-act="download-report">Download .txt</button>' +
          '<button type="button" class="btn btn-quiet btn-sm" data-act="print-report">Print</button>' +
        '</div>' +
      '</div>' +
      '<p class="card-lede">Structured situation \u2192 background \u2192 assessment \u2192 recommendation. ' +
        'Built for a delayed comm loop: it stands alone without a conversation.</p>' +
      '<details class="report-wrap">' +
        '<summary>Show report text</summary>' +
        '<pre class="report" data-role="report">' + esc(text) + '</pre>' +
      '</details>' +
    '</section>';
  }

  /* ============================================================
     ASSISTANT PANE
     Two things live here, both optional and both scoped:
       - one mission-health question at a time, answered from the
         current check on screen;
       - a second opinion on that check.
     Neither can change the rule-based verdict, and neither ever sees
     a credential. Without a proxy the pane simply reports that it is
     off and the rest of the tool is unaffected.
     ============================================================ */
  function aiState() {
    var probe = state.aiProbe;
    if (!probe) return { text: 'checking\u2026', cls: '', ready: false, primary: null };
    var primary = probe.label || probe.model || (probe.models && probe.models[0]) || null;
    return {
      text: probe.available ? ('ready' + (primary ? ' \u00b7 ' + primary : '')) : 'not connected',
      cls: probe.available ? 'is-ready' : 'is-off',
      ready: !!probe.available,
      primary: primary
    };
  }

  function scopeDetails() {
    return '<details class="ai-scope"><summary>What it is and is not allowed to do</summary><ul>' +
      AI.SCOPE.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
    '</ul></details>';
  }

  function assistantLink() {
    if (!AI) return '';
    return '<div class="assist-link">' +
      '<div class="assist-link-text">' +
        '<strong>Questions, or a second opinion?</strong>' +
        '<span>The Assistant tab answers mission-health questions about this check and can review it. ' +
          'It is optional and never changes the verdict.</span>' +
      '</div>' +
      '<button type="button" class="btn btn-quiet btn-sm" data-act="open-assistant">Open Assistant</button>' +
    '</div>';
  }

  function qaBubble(m) {
    if (m.role === 'crew') {
      return '<div class="bubble bubble-crew">' +
        '<span class="bubble-who">You</span>' +
        '<p>' + esc(m.text) + '</p>' +
      '</div>';
    }
    if (m.role === 'thinking') {
      return '<div class="bubble bubble-thinking">' +
        '<span class="bubble-who">Assistant \u00b7 thinking</span>' +
        '<p class="thinking-line"><span class="thinking-dot"></span>' +
          'Working through your readings. Free models can take a little while.</p>' +
      '</div>';
    }
    if (m.role === 'assistant') {
      return '<div class="bubble bubble-ai' + (m.escalate ? ' is-escalate' : '') + '">' +
        '<span class="bubble-who">Assistant' + (m.escalate ? ' \u00b7 escalate now' : '') + '</span>' +
        '<p>' + esc(m.text) + '</p>' +
        '<span class="bubble-foot">Confidence: ' + esc(m.confidence) +
          (m.model ? ' \u00b7 ' + esc(m.model) : '') +
          ' \u00b7 advisory only \u2014 the rule-based verdict stands.</span>' +
      '</div>';
    }
    return '<div class="bubble bubble-note"><p>' + esc(m.text) + '</p></div>';
  }

  function renderAssistant() {
    if (!AI) return;

    var st = aiState();
    var stateEl = $('#assistState');
    if (stateEl) {
      stateEl.textContent = st.text;
      stateEl.className = 'ai-state ' + st.cls;
    }

    var input = $('#askInput');
    var btn = $('#askBtn');
    if (btn) btn.disabled = !st.ready || state.qaBusy || !input || !input.value.trim();

    /* When the assistant is not reachable, say so plainly and say why,
       instead of leaving a disabled button that looks broken. */
    var notice = $('#assistNotice');
    if (notice) {
      if (!AI) {
        notice.innerHTML = '<strong>The assistant is not loaded on this deployment.</strong> ' +
          'The rule-based verdict and every action below are complete without it.';
        notice.hidden = false;
      } else if (state.aiProbe && !state.aiProbe.available) {
        notice.innerHTML = '<strong>The assistant is not connected.</strong> ' +
          'It needs the local proxy that holds the model credential, and this page is being served without it. ' +
          'Run <code>node server.js</code> in the project folder and open the address it prints. ' +
          'The rule-based verdict, the actions and the handover report are complete without it.';
        notice.hidden = false;
      } else if (state.aiProbe && state.aiProbe.available && state.aiProbe.reason) {
        notice.innerHTML = esc(state.aiProbe.reason);
        notice.hidden = false;
      } else {
        notice.hidden = true;
      }
    }

    var thread = $('#askThread');
    if (thread) {
      var recent = state.qa.slice(-6);
      thread.innerHTML = recent.length
        ? recent.map(qaBubble).join('')
        : '<p class="ask-empty">No questions yet. Ask about your own readings, symptoms, sleep, recovery, ' +
          'or what to do next. This is not a general chat \u2014 anything off-topic is refused.</p>';
      thread.scrollTop = thread.scrollHeight;
    }

    var host = $('#assistReview');
    if (host) host.innerHTML = reviewBlock();
  }

  function reviewBlock() {
    var entry = selectedEntry();
    var st = aiState();

    if (!entry) {
      return '<section class="card ai-card">' +
        '<div class="card-head"><h4>Second opinion on a check</h4>' +
          '<span class="ai-state ' + st.cls + '">' + esc(st.text) + '</span></div>' +
        '<p class="muted">Run a check first. The assistant can then cross-check that one check; ' +
          'it has no access to anything else.</p>' +
      '</section>';
    }

    var probe = state.aiProbe;
    var mine = state.ai.entryId === entry.id ? state.ai : null;
    var body;

    if (!probe) {
      body = '<p class="muted">Checking for the assistant proxy\u2026</p>';
    } else if (!probe.available) {
      body = '<p class="ai-offline">The assistant is not connected, so there is no second opinion. ' +
        '<strong>The verdict above is complete without it</strong> \u2014 the assistant only ever adds a second opinion.</p>' +
        (probe.reason ? '<p class="muted small">' + esc(probe.reason) + '</p>' : '') +
        '<p class="muted small">Run <code>node server.js</code> in the project folder and open the address it prints to use it.</p>';
    } else if (!mine || mine.status === 'idle') {
      body = '<button type="button" class="btn" data-act="ask-ai">Review ' + esc(dayLabel(entry)) + '</button>';
    } else if (mine.status === 'busy') {
      body = '<p class="ai-busy">Reviewing the check\u2026</p>';
    } else if (mine.status === 'error') {
      body = '<p class="ai-error">' + esc(mine.error || 'Assistant unavailable.') + '</p>' +
        '<button type="button" class="btn btn-quiet btn-sm" data-act="ask-ai">Try again</button>';
    } else if (mine.status === 'ok' && mine.data) {
      body = aiResult(mine.data, mine.model);
    } else {
      body = '<button type="button" class="btn" data-act="ask-ai">Review ' + esc(dayLabel(entry)) + '</button>';
    }

    return '<section class="card ai-card">' +
      '<div class="card-head">' +
        '<h4>Second opinion on ' + esc(dayLabel(entry)) + '</h4>' +
        '<span class="ai-state ' + st.cls + '">' + esc(st.text) + '</span>' +
      '</div>' +
      '<p class="card-lede">An optional cross-check of this check. It cannot change the verdict ' +
        'and cannot be asked for anything else.</p>' +
      body +
      scopeDetails() +
    '</section>';
  }

  function aiResult(data, model) {
    return '<div class="ai-result">' +
      '<p class="ai-headline">' + esc(data.headline) + '</p>' +
      '<p class="ai-assessment">' + esc(data.assessment) + '</p>' +
      (data.watch.length
        ? '<div class="ai-block"><h5>Worth watching</h5><ul>' +
          data.watch.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>'
        : '') +
      (data.questions.length
        ? '<div class="ai-block"><h5>Ask the crew member</h5><ul>' +
          data.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>'
        : '') +
      '<p class="ai-foot">Confidence: ' + esc(data.confidence) +
        (model ? ' \u00b7 ' + esc(model) : '') +
        ' \u00b7 advisory only \u2014 the rule-based verdict stands.</p>' +
    '</div>';
  }

  function askAI() {
    if (!AI) return;
    var entry = selectedEntry();
    if (!entry) return;
    var result = evaluateEntry(entry);
    state.ai = { entryId: entry.id, status: 'busy', data: null, error: null, model: null };
    renderAssistant();

    AI.review(AI.buildPayload(state.record, entry, result)).then(function (res) {
      if (state.ai.entryId !== entry.id) return;
      state.ai.status = res.ok ? 'ok' : 'error';
      state.ai.data = res.data || null;
      state.ai.error = res.error || null;
      state.ai.model = res.model || null;
      renderAssistant();
    });
  }

  /** One question, no history: the assistant never receives earlier turns. */
  function askQuestion(raw) {
    if (!AI || state.qaBusy) return;
    var question = String(raw || '').trim().slice(0, 400);
    if (question.length < 3) {
      toast('Type a question first.');
      return;
    }
    if (!aiState().ready) {
      toast('The assistant is not connected. The rule-based verdict stands.');
      return;
    }

    var entry = selectedEntry();
    var result = entry ? evaluateEntry(entry) : null;

    state.qaBusy = true;
    state.qa.push({ role: 'crew', text: question });
    state.qa.push({ role: 'thinking' });
    state.qa = state.qa.slice(-6);
    var input = $('#askInput');
    if (input) input.value = '';
    renderAssistant();

    AI.ask(AI.buildQuestion(state.record, entry, result, question)).then(function (res) {
      state.qaBusy = false;
      /* Drop the thinking placeholder. */
      state.qa = state.qa.filter(function (m) { return m.role !== 'thinking'; });
      if (res.ok) {
        state.qa.push({
          role: 'assistant',
          text: res.data.answer,
          model: res.model,
          escalate: !!res.data.escalate,
          confidence: res.data.confidence
        });
      } else if (res.refused) {
        state.qa.push({
          role: 'note',
          text: 'That question was refused. The assistant only answers mission-health questions about this crew member and this check.'
        });
      } else {
        state.qa.push({
          role: 'note',
          text: (res.error || 'The assistant did not answer. The rule-based verdict stands.') +
            ' You can ask again, and the verdict, the actions and the handover report do not depend on it.'
        });
      }
      state.qa = state.qa.slice(-6);
      renderAssistant();
    });
  }

  function clearQuestions() {
    state.qa = [];
    var input = $('#askInput');
    if (input) input.value = '';
    renderAssistant();
  }

  /* ============================================================
     SYSTEMS PANE
     ============================================================ */
  function renderSystems() {
    var entry = selectedEntry();
    if (!entry) {
      $('#bodyMap').innerHTML = '';
      $('#systemList').innerHTML = '';
      $('#systemDetail').innerHTML = '<div class="card empty-card"><p>Run a check to see the body-system breakdown.</p></div>';
      return;
    }
    var result = evaluateEntry(entry);

    Body.render($('#bodyMap'), {
      systems: result.systems,
      selected: state.selected,
      onSelect: selectSystem
    });
    renderSystemList(result);
    renderSystemDetail(entry, result);
  }

  function renderSystemList(result) {
    $('#systemList').innerHTML = D.SYSTEMS.map(function (sys) {
      var r = result.systems[sys.id];
      var cls = STATUS_CLASS[r.status] || 'is-nodata';
      var sev = r.assessed ? r.severity : null;
      return '<button type="button" class="system-card ' + cls +
        (sys.id === state.selected ? ' is-selected' : '') + '" data-system="' + sys.id + '">' +
        '<span class="sys-dot" aria-hidden="true"></span>' +
        '<span class="sys-main">' +
          '<span class="sys-name">' + esc(sys.name) + '</span>' +
          '<span class="sys-region">' + esc(r.status) +
            (r.assessed ? ' \u00b7 ' + esc(COVERAGE_LABEL[r.coverage] || r.coverage) : ' \u00b7 no measurement') + '</span>' +
        '</span>' +
        '<span class="sys-sev">' +
          '<span class="sev-bar"><i style="width:' + (sev === null ? 0 : sev) + '%"></i></span>' +
          '<span class="sev-num">' + (sev === null ? '\u2014' : sev) + '</span>' +
        '</span>' +
      '</button>';
    }).join('');
  }

  function findingRow(f) {
    if (f.symptom) {
      return '<tr class="row-symptom"><td>' + esc(f.symptom) + '</td><td class="num">\u2014</td>' +
        '<td><span class="chip-lv ' + levelClass(f.level) + '">' + esc(f.levelName) + '</span></td></tr>';
    }
    var metric = D.METRIC_BY_ID[f.id];
    if (!metric) return '';

    if (f.absent) {
      return '<tr class="row-absent"><td>' + esc(f.metric) + '</td><td class="num muted">\u2014</td>' +
        '<td><span class="chip-lv lv-none">not measured</span></td></tr>';
    }

    var reason = reasonFor(metric, {
      rule: f.rule, label: f.label, ref: f.ref, fold: f.fold,
      delta: f.delta, baseline: f.baseline, level: f.level
    });

    return '<tr><td>' + esc(f.metric) + '</td>' +
      '<td class="num">' + fmt(metric, f.value) + ' <small>' + esc(metric.unit) + '</small></td>' +
      '<td><span class="chip-lv ' + levelClass(f.level) + '">' + esc(reason) + '</span></td></tr>';
  }

  function renderSystemDetail(entry, result) {
    var sys = D.SYSTEM_BY_ID[state.selected];
    var r = result.systems[state.selected];
    if (!sys || !r) return;

    var findings = r.findings.length
      ? r.findings.map(findingRow).join('')
      : '<tr><td colspan="3" class="muted">No measured indicator for this system in this check.</td></tr>';

    var hazards = sys.hazards.map(function (h) {
      return '<li><strong>' + esc(D.HAZARDS[h].label) + '</strong><span>' + esc(D.HAZARDS[h].detail) + '</span></li>';
    }).join('');

    var actions = r.assessed
      ? '<ul class="action-list">' + r.actions.map(function (a) {
          return '<li><span class="action-text">' + esc(a) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="muted small">No measurement exists for this system here, so no action is recommended from it. ' +
        'Treat the gap as a monitoring gap to close, not as a normal result.</p>';

    var scoreBlock = r.assessed
      ? '<div class="detail-score ' + STATUS_CLASS[r.status] + '">' +
          '<span class="detail-chip">' + esc(r.status) + '</span>' +
          '<span class="detail-sev">' + r.severity + '<small>/100 severity</small></span>' +
        '</div>'
      : '<div class="detail-score is-nodata">' +
          '<span class="detail-chip">NO DATA</span>' +
          '<span class="detail-sev muted">\u2014<small>not assessed</small></span>' +
        '</div>';

    $('#systemDetail').innerHTML =
      '<div class="detail-head">' +
        '<div>' +
          '<h3>' + esc(sys.name) + ' <span class="muted">\u00b7 ' + esc(sys.region) + '</span></h3>' +
          '<p class="detail-summary">' + esc(sys.summary) + '</p>' +
        '</div>' +
        scoreBlock +
      '</div>' +
      '<div class="detail-grid">' +
        '<div class="card">' +
          '<h4>Indicators in this check</h4>' +
          '<table class="mini-table"><thead><tr><th>Indicator</th><th>Value</th><th>Basis</th></tr></thead>' +
          '<tbody>' + findings + '</tbody></table>' +
          '<p class="detail-note">Evidence: <strong>' + esc(COVERAGE_LABEL[r.coverage] || r.coverage) +
            '</strong> \u00b7 context load <strong>' + r.contextRisk + '/100</strong></p>' +
        '</div>' +
        '<div class="card">' +
          '<h4>Recommended actions</h4>' + actions +
        '</div>' +
      '</div>' +
      '<div class="card hazard-card">' +
        '<h4>Why this system is at risk in space</h4>' +
        '<ul class="hazard-list">' + hazards + '</ul>' +
      '</div>';
  }

  function selectSystem(id) {
    state.selected = id;
    renderSystems();
    var detail = $('#systemDetail');
    if (detail && detail.scrollIntoView) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ============================================================
     RECORD PANE
     ============================================================ */
  function renderRecord() {
    if (!hasRecord()) {
      $('#recordSummary').textContent = 'No record yet.';
      $('#recordBody').innerHTML = '<div class="card empty-card"><p>Set up your record in the left panel.</p></div>';
      return;
    }

    var list = entries();
    var pre = list.filter(function (e) { return e.phase === 'preflight'; }).length;

    $('#recordSummary').textContent = list.length
      ? list.length + ' check' + (list.length === 1 ? '' : 's') +
        (pre ? ' \u00b7 ' + pre + ' preflight' : '') +
        ' \u00b7 stored on this device'
      : 'No checks yet.';

    if (!list.length) {
      $('#recordBody').innerHTML = '<div class="card empty-card"><p>Nothing logged yet. Run a check to start the record.</p></div>';
      return;
    }

    var chart = '';
    if (list.length >= 2) {
      var pts = list.map(function (e, i) { return { day: i, value: evaluateEntry(e).readiness }; });
      var labels = list.map(function (e) { return dayLabel(e); });
      chart = '<div class="card chart-card">' +
        '<h4>Readiness across checks</h4>' +
        Ch.readinessChart({
          points: pts,
          formatDay: function (i) { return labels[i] || ''; }
        }) +
      '</div>';
    }

    var rows = list.slice().reverse().map(function (e) {
      var r = evaluateEntry(e);
      var pending = (e.pending || []).length;
      var badges = [];
      if (e.phase === 'preflight') badges.push('<span class="badge badge-pre">PREFLIGHT</span>');
      if (pending) badges.push('<span class="badge badge-pending">PROVISIONAL</span>');

      return '<details class="rec ' + STATUS_CLASS[r.triage] + '" data-entry="' + esc(e.id) + '">' +
        '<summary class="rec-summary">' +
          '<span class="rec-day">' + esc(dayLabel(e)) + '</span>' +
          '<span class="rec-time">' + esc(dateLabel(e.at)) + ' ' + esc(timeLabel(e.at)) + '</span>' +
          '<span class="chip ' + STATUS_CLASS[r.triage] + '">' + esc(r.triage) + '</span>' +
          '<span class="rec-score">' + r.readiness + '</span>' +
          '<span class="rec-badges">' + badges.join('') + '</span>' +
        '</summary>' +
        '<div class="rec-body">' +
          '<table class="mini-table"><thead><tr><th>Indicator</th><th>Value</th><th>Basis</th></tr></thead><tbody>' +
          D.ALL_METRICS.map(function (m) {
            var mr = r.results[m.id];
            if (!mr || mr.absent) return '';
            return '<tr><td>' + esc(m.label) + '</td>' +
              '<td class="num">' + fmt(m, mr.value) + ' <small>' + esc(m.unit) + '</small></td>' +
              '<td><span class="chip-lv ' + levelClass(mr.level) + '">' + esc(reasonFor(m, mr)) + '</span></td></tr>';
          }).join('') +
          '</tbody></table>' +
          (e.note ? '<p class="rec-note">\u201c' + esc(e.note) + '\u201d</p>' : '') +
          '<div class="card-actions">' +
            '<button type="button" class="btn btn-quiet btn-sm" data-act="view-entry">View assessment</button>' +
            '<button type="button" class="btn btn-quiet btn-sm" data-act="entry-report">Copy report</button>' +
            '<button type="button" class="btn btn-quiet btn-sm danger" data-act="delete-entry">Delete</button>' +
          '</div>' +
        '</div>' +
      '</details>';
    }).join('');

    $('#recordBody').innerHTML = chart + '<div class="rec-list">' + rows + '</div>';
  }

  /* ============================================================
     BASELINE PANE
     ============================================================ */
  function renderBaseline() {
    if (!hasRecord()) {
      $('#baselineSummary').textContent = 'No record yet.';
      $('#baselineBody').innerHTML = '<div class="card empty-card"><p>Set up your record first.</p></div>';
      return;
    }

    var base = state.record.baseline || {};
    var n = Object.keys(base).length;
    var meta = state.record.baselineMeta || {};

    $('#baselineSummary').textContent = n
      ? n + ' metrics set \u00b7 ' + baselineLine()
      : 'Not set \u2014 checks are compared to clinical limits only';

    var rows = D.BASELINE_METRICS.map(function (m) {
      var v = base[m.id];
      var q = isNum(v) ? quickBand(m, v) : null;
      return '<div class="base-row" data-metric="' + m.id + '">' +
        '<div class="base-name"><strong>' + esc(m.label) + '</strong>' +
          '<span>' + esc(m.unit) + ' \u00b7 ' + esc(m.system) + '</span></div>' +
        '<div class="base-value">' +
          '<input type="number" inputmode="decimal" id="base-' + m.id + '"' +
            ' min="' + m.min + '" max="' + m.max + '" step="' + m.step + '"' +
            ' value="' + (isNum(v) ? v : '') + '" placeholder="\u2014">' +
          '<span class="unit">' + esc(m.unit) + '</span>' +
        '</div>' +
        '<div class="base-flag">' +
          (isNum(v) ? '<span class="chip-lv ' + levelClass(q.level) + '">' + esc(q.text) + '</span>' : '<span class="muted small">not set</span>') +
        '</div>' +
      '</div>';
    }).join('');

    $('#baselineBody').innerHTML =
      '<div class="card">' +
        '<h4>What the baseline is</h4>' +
        '<p class="card-lede">Your own pre-launch normal. A reading is compared to the clinical range ' +
          '<em>and</em> to this value; whichever is worse decides the level. That is how a change that is ' +
          'still \u201cnormal\u201d for the population gets caught for you.</p>' +
        '<div class="base-list">' + rows + '</div>' +
        '<div class="card-actions">' +
          '<button type="button" class="btn btn-primary" data-act="save-baseline">Save baseline</button>' +
          '<button type="button" class="btn btn-quiet" data-act="baseline-from-preflight">Compute from preflight checks</button>' +
          '<button type="button" class="btn btn-quiet" data-act="baseline-from-first">Use my first check</button>' +
          '<button type="button" class="btn btn-quiet danger" data-act="clear-baseline">Clear</button>' +
        '</div>' +
        '<p class="muted small">A metric with no baseline is still judged against clinical limits; ' +
          'only its change-detection is switched off.</p>' +
      '</div>';
  }

  /* A baseline is data the whole delta layer rests on, so reject values
     outside the metric's own instrument range instead of silently
     accepting a typo that would poison every later comparison. */
  function readBaselineValue(metric, el) {
    if (!el || el.value === '') return null;
    var v = Number(el.value);
    if (!isFinite(v) || v < metric.min || v > metric.max) return NaN;
    return v;
  }

  function saveBaseline(source) {
    var next = {};
    var rejected = [];
    D.BASELINE_METRICS.forEach(function (m) {
      var v = readBaselineValue(m, $('#base-' + m.id));
      if (v === null) return;
      if (isNaN(v)) { rejected.push(m.label); return; }
      next[m.id] = v;
    });
    if (rejected.length) {
      toast('Ignored out-of-range baseline: ' + rejected.join(', ') + '.');
    }
    applyBaseline(next, source || 'entered', 0);
  }

  function applyBaseline(baseline, source, from) {
    if (!Object.keys(baseline).length) {
      toast('No baseline values entered.');
      return;
    }
    state.record.baseline = baseline;
    state.record.baselineMeta = { source: source, setAt: nowISO(), from: from || 0 };
    persist();
    renderAll();
    toast('Baseline saved: ' + Object.keys(baseline).length + ' metrics.');
  }

  function baselineFromPreflight() {
    var pre = entries().filter(function (e) { return e.phase === 'preflight'; });
    if (!pre.length) {
      toast('No preflight checks in the record yet.');
      return;
    }
    var base = {};
    D.BASELINE_METRICS.forEach(function (m) {
      var vals = pre.map(function (e) { return e.values[m.id]; }).filter(isNum).sort(function (a, b) { return a - b; });
      if (!vals.length) return;
      var mid = Math.floor(vals.length / 2);
      base[m.id] = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      base[m.id] = Math.round(base[m.id] * Math.pow(10, m.precision)) / Math.pow(10, m.precision);
    });
    applyBaseline(base, 'preflight-checks', pre.length);
  }

  function baselineFromFirst() {
    var first = entries()[0];
    if (!first) {
      toast('No checks in the record yet.');
      return;
    }
    var base = {};
    D.BASELINE_METRICS.forEach(function (m) {
      if (isNum(first.values[m.id])) base[m.id] = first.values[m.id];
    });
    applyBaseline(base, 'first-check', 1);
  }

  function clearBaseline() {
    state.record.baseline = null;
    state.record.baselineMeta = null;
    persist();
    renderAll();
    toast('Baseline cleared. Checks fall back to clinical limits only.');
  }

  /* ============================================================
     MISSION PANE
     Everything that changes flight to flight. Planned duration
     scales the exposure context, sleep target defines sleep debt,
     and the instrument groups decide what the form asks for.
     ============================================================ */
  function destinationOptions(selected) {
    return DESTINATIONS.map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === selected ? ' selected' : '') + '>' +
        esc(d.label) + '</option>';
    }).join('');
  }

  function instrumentChecks(prefix, inst) {
    return D.GROUPS.map(function (g) {
      var on = inst[g.id] !== false;
      return '<label class="switch switch-block">' +
        '<input type="checkbox" id="' + prefix + 'Inst-' + g.id + '"' + (on ? ' checked' : '') + '>' +
        '<span>' + esc(g.label) + '</span>' +
      '</label>';
    }).join('');
  }

  function profileFields(prefix, includeIdentity) {
    var rec = state.record;
    var p = profile();
    var identity = '';

    if (includeIdentity) {
      identity =
        '<label class="field">' +
          '<span>Mission name</span>' +
          '<input id="' + prefix + 'Mission" type="text" maxlength="48" autocomplete="off" spellcheck="false" value="' +
            esc(rec.mission || '') + '" placeholder="e.g. ARTEMIS VII">' +
        '</label>' +
        '<label class="field">' +
          '<span>Launch date</span>' +
          '<input id="' + prefix + 'Start" type="date" value="' +
            (rec.missionStart ? dateLabel(rec.missionStart) : '') + '">' +
          '<em class="field-hint">Flight day 1 is launch day. Checks dated before it are preflight baseline.</em>' +
        '</label>';
    }

    return '<div class="profile-grid">' + identity +
      '<label class="field">' +
        '<span>Destination</span>' +
        '<select id="' + prefix + 'Destination" class="select">' + destinationOptions(p.destination) + '</select>' +
      '</label>' +
      '<label class="field">' +
        '<span>Planned duration (days)</span>' +
        '<input id="' + prefix + 'PlannedDays" type="number" inputmode="numeric" min="1" max="3000" step="1" value="' +
          p.plannedDays + '">' +
      '</label>' +
      '<label class="field">' +
        '<span>Crew size</span>' +
        '<input id="' + prefix + 'CrewSize" type="number" inputmode="numeric" min="1" max="20" step="1" value="' +
          p.crewSize + '">' +
      '</label>' +
      '<label class="field">' +
        '<span>Two-way communication delay (seconds)</span>' +
        '<input id="' + prefix + 'CommDelay" type="number" inputmode="numeric" min="0" max="3600" step="1" value="' +
          p.commDelaySeconds + '">' +
        '<em class="field-hint">Round trip to the ground. 0 in low Earth orbit, minutes at the Moon, up to 44 minutes at Mars.</em>' +
      '</label>' +
      '<label class="field">' +
        '<span>Sleep target (hours per day)</span>' +
        '<input id="' + prefix + 'SleepTarget" type="number" inputmode="decimal" min="4" max="10" step="0.5" value="' +
          p.sleepTargetHours + '">' +
        '<em class="field-hint">Used for sleep debt. Set the value this flight actually plans for.</em>' +
      '</label>' +
    '</div>' +
    '<fieldset class="profile-instruments">' +
      '<legend class="section-label">Instrument groups carried on this flight</legend>' +
      '<p class="field-hint">Turn off a group this vehicle does not carry. The check-in form and the required-reading count follow this setting.</p>' +
      '<div class="profile-checks">' + instrumentChecks(prefix, p.instruments) + '</div>' +
    '</fieldset>' + resourceFields(prefix, p.resources);
  }

  function resourceFields(prefix, resources) {
    var fields = Store.RESOURCE_FIELDS.map(function (field) {
      var id = prefix + 'Resource-' + field[0];
      var value = esc(resources[field[0]] || '');
      var input = field[2] > 100 ? '<textarea id="' + id + '" maxlength="' + field[2] + '" rows="3">' +
        value + '</textarea>' : '<input id="' + id + '" type="' + (field[0] === 'returnDate' ? 'date' : 'text') +
        '" maxlength="' + field[2] + '" value="' + value + '">';
      return '<label class="field"><span>' + esc(field[1]) + '</span>' + input + '</label>';
    }).join('');
    return '<details class="profile-instruments"><summary>Spacecraft and onboard resources</summary>' +
      '<div class="profile-grid">' + fields + '</div>' +
      '<div class="profile-checks">' + [['pulseOximeter', 'Usable pulse oximeter'], ['heartRateMonitor', 'Usable heart-rate monitor']].map(function (item) {
        return '<label class="switch switch-block"><input type="checkbox" id="' + prefix + 'Resource-' + item[0] + '"' +
          (resources[item[0]] ? ' checked' : '') + '><span>' + item[1] + '</span></label>';
      }).join('') + '</div></details>';
  }

  function readProfileFields(prefix) {
    function val(suffix) {
      var el = $('#' + prefix + suffix);
      return el ? el.value : '';
    }
    function num(suffix) {
      var raw = val(suffix);
      if (raw === '') return null;
      var v = Number(raw);
      return isFinite(v) ? v : null;
    }

    var instruments = {};
    D.GROUPS.forEach(function (g) {
      var el = $('#' + prefix + 'Inst-' + g.id);
      instruments[g.id] = !el || el.checked;
    });

    var resources = {};
    Store.RESOURCE_FIELDS.forEach(function (field) { resources[field[0]] = val('Resource-' + field[0]); });
    ['pulseOximeter', 'heartRateMonitor'].forEach(function (key) {
      resources[key] = $('#' + prefix + 'Resource-' + key)?.checked === true;
    });
    var p = Store.cloneProfile({
      destination: val('Destination') || undefined,
      plannedDays: num('PlannedDays'),
      crewSize: num('CrewSize'),
      commDelaySeconds: num('CommDelay'),
      sleepTargetHours: num('SleepTarget'),
      instruments: instruments,
      resources: resources
    });

    /* A check with no instrument group at all cannot be scored, so keep
       the self-report group on if everything was switched off. */
    if (!p.instruments.vitals && !p.instruments.daily && !p.instruments.exposure && !p.instruments.labs) {
      p.instruments.daily = true;
    }
    return p;
  }

  function renumberEntries() {
    var start = state.record.missionStart;
    (state.record.entries || []).forEach(function (e) {
      if (e.phase === 'preflight') { e.day = null; return; }
      var off = start ? Store.dayOffset(start, e.at) : null;
      if (off !== null) e.day = Math.max(1, off + 1);
    });
  }

  function commDelayLabel(seconds) {
    if (!isNum(seconds) || seconds <= 0) return 'Real time';
    if (seconds < 60) return seconds + ' seconds';
    var minutes = seconds / 60;
    return (Math.round(minutes * 10) / 10) + ' minutes';
  }

  function renderMission() {
    var host = $('#missionBody');
    if (!host) return;

    if (!hasRecord()) {
      host.innerHTML = '<div class="card empty-card"><p>Set up your record first, then the per-flight configuration appears here.</p></div>';
      return;
    }

    var p = profile();
    var enabled = D.GROUPS.filter(function (g) { return p.instruments[g.id] !== false; })
      .map(function (g) { return g.label; });

    host.innerHTML =
      '<div class="card">' +
        '<h4>Per-flight configuration</h4>' +
        '<p class="card-lede">These values differ every flight. Planned duration sets the exposure scale, ' +
          'the sleep target defines sleep debt, and the instrument groups decide which readings the form asks for.</p>' +
        profileFields('prof', true) +
        '<div class="card-actions">' +
          '<button type="button" class="btn btn-primary" data-act="save-mission">Save mission configuration</button>' +
        '</div>' +
        '<p class="muted small">Changing the launch date renumbers every in-flight check from flight day 1. ' +
          'Preflight checks stay preflight.</p>' +
      '</div>' +
      '<div class="card">' +
        '<h4>What this flight is</h4>' +
        '<div class="mission-facts">' +
          fact('Crew member', state.record.crewId) +
          fact('Mission', state.record.mission || 'Not named') +
          fact('Destination', destinationLabel(p.destination)) +
          fact('Planned duration', p.plannedDays + ' days') +
          fact('Crew size', p.crewSize + (p.crewSize === 1 ? ' person' : ' people')) +
          fact('Communication delay', commDelayLabel(p.commDelaySeconds)) +
          fact('Sleep target', p.sleepTargetHours + ' hours per day') +
          fact('Instrument groups', enabled.length ? enabled.join(', ') : 'None') +
        '</div>' +
      '</div>';
  }

  function fact(label, value) {
    return '<div class="fact"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }

  function saveMission() {
    if (!hasRecord()) return;
    var before = JSON.stringify(profile().instruments);
    var p = readProfileFields('prof');

    var startRaw = $('#profStart') ? $('#profStart').value : '';
    var start = null;
    if (startRaw) {
      var d = new Date(startRaw + 'T00:00:00');
      if (!isNaN(d.getTime())) start = d.toISOString();
    }

    state.record.mission = $('#profMission') ? $('#profMission').value.trim().slice(0, 48) : state.record.mission;
    state.record.missionStart = start;
    state.record.missionProfile = p;
    renumberEntries();

    if (JSON.stringify(p.instruments) !== before) buildForm();

    persist();
    renderAll();
    toast('Mission configuration saved.');
  }

  /* ============================================================
     FLIGHT REFERENCE PANE
     ============================================================ */
  function renderReference() {
    if (!I4) {
      $('#refBody').innerHTML = '<div class="card empty-card"><p>The reference dataset is not loaded.</p></div>';
      return;
    }

    var ids = Object.keys(I4.crews).sort();
    if (ids.indexOf(state.refCrew) < 0) state.refCrew = ids[0];
    var crew = I4.crews[state.refCrew];

    if (!crew.entries.some(function (e) { return e.timepoint === state.refTp; })) {
      state.refTp = crew.entries[crew.entries.length - 1].timepoint;
    }
    var entry = crew.entries.filter(function (e) { return e.timepoint === state.refTp; })[0];

    var result = S.evaluate(entry.values, {
      flightDay: entry.day,
      exposureDays: I4.meta.inFlightDays || entry.day,
      entries: crew.entries,
      refs: I4.refs,
      baseline: crew.baseline
    }, []);

    var present = 0;
    var rows = D.LAB_ANALYTES.map(function (m) {
      var r = result.results[m.id];
      var flag = entry.flags && entry.flags[m.id];
      if (r && !r.absent) present++;
      var basis = 'not measured';
      if (flag) basis = 'excluded: ' + flag.reason;
      else if (r && !r.absent) basis = reasonFor(m, r);

      return '<tr>' +
        '<td>' + esc(m.label) + '</td>' +
        '<td class="num">' + (r && !r.absent ? fmt(m, r.value) : (flag ? esc(flag.raw) : '\u2014')) +
          ' <small>' + esc(m.unit) + '</small></td>' +
        '<td><span class="chip-lv ' + (r && !r.absent ? levelClass(r.level) : 'lv-none') + '">' +
          esc(basis) + '</span></td>' +
      '</tr>';
    }).join('');

    $('#refBody').innerHTML =
      '<div class="card ref-controls">' +
        '<label class="ref-field"><span>Crew member</span><select id="refCrew" class="select">' +
          ids.map(function (id) {
            return '<option value="' + esc(id) + '"' + (id === state.refCrew ? ' selected' : '') + '>' +
              esc(id) + '</option>';
          }).join('') +
        '</select></label>' +
        '<div class="ref-tp"><span>Sample</span><div class="chip-row">' +
          crew.entries.map(function (e) {
            return '<button type="button" class="chip-btn' + (e.timepoint === state.refTp ? ' is-on' : '') +
              '" data-tp="' + esc(e.timepoint) + '">' + esc(e.timepoint) + '</button>';
          }).join('') +
        '</div></div>' +
      '</div>' +
      '<div class="card">' +
        '<h4>' + esc(state.refCrew) + ' \u00b7 ' + esc(state.refTp) + ' \u00b7 ' + present + ' of ' +
          D.LAB_ANALYTES.length + ' analytes present</h4>' +
        '<table class="mini-table ref-table"><thead><tr><th>Analyte</th><th>Value</th><th>Basis</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
      '</div>' +
      '<div class="card callout">' +
        '<h4>How to read this</h4>' +
        '<p>These are published Inspiration4 blood panels from the NASA Open Science Data Repository, ' +
          'included so a crew member can sanity-check expectations during the mission. They are ' +
          '<strong>not</strong> your readings and they are not scored into your assessment.</p>' +
        '<p class="muted small">Vitals, sleep and mood were never released for this mission, so those ' +
          'systems report no data here. Microgravity exposure is ' + esc(String(I4.meta.inFlightDays)) +
          ' days \u2014 the actual flight duration, not the day offset of a follow-up sample.</p>' +
        '<p class="muted small">Source: <a href="' + esc(I4.meta.page) + '" target="_blank" rel="noopener">' +
          esc(I4.meta.page) + '</a> \u00b7 snapshot ' + esc(I4.meta.generated) + '</p>' +
      '</div>' +
      standardsCard();
  }

  function standardsCard() {
    return '<div class="card">' +
      '<h4>NASA tools and standards this follows</h4>' +
      '<p class="card-lede">ASTROGUARD is aligned to the instruments and standards NASA uses for crew health. ' +
        'It is not certified by NASA and it is not a medical device. Every escalation ends with the flight surgeon.</p>' +
      '<ul class="standard-list">' +
        NASA_STANDARDS.map(function (s) {
          var name = s.url
            ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>'
            : esc(s.name);
          return '<li><strong>' + name + '</strong><span>' + esc(s.detail) + '</span></li>';
        }).join('') +
      '</ul>' +
      '<p class="muted small">What this tool is not: a simulator, a training scenario, or a source of invented readings. ' +
        'Every number shown is either entered by the crew member or comes from a labelled published dataset.</p>' +
    '</div>';
  }



  /* ============================================================
     RENDER
     ============================================================ */
  function renderAll() {
    var isReady = hasRecord();
    $('#setupForm').hidden = isReady;
    $('#checkForm').hidden = !isReady;
    $('#recordTools').hidden = !isReady;

    if (isReady) {
      $('#panelTitle').textContent = 'Check-in';
      $('#panelSub').textContent = 'Measure, enter, decide.';
    } else {
      $('#panelTitle').textContent = 'Set up';
      $('#panelSub').textContent = 'One crew member, one record.';
    }

    renderHeader();
    if (isReady) syncForm();
    renderAssessment();
    renderSystems();
    renderAssistant();
    renderMission();
    renderRecord();
    renderBaseline();
    renderReference();

    $('#footerSrc').textContent = isReady
      ? 'Offline \u00b7 record stored on this device'
      : 'Offline \u00b7 no account, no upload';
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  function saveSetup(ev) {
    ev.preventDefault();

    var crew = $('#setupCrew').value.trim();
    if (!crew) {
      $('#setupState').textContent = 'A callsign is required.';
      return;
    }

    var startInput = $('#setupStart').value;
    var start = null;
    if (startInput) {
      var d = new Date(startInput + 'T00:00:00');
      if (!isNaN(d.getTime())) start = d.toISOString();
    }

    var baseline = {};
    var rejected = [];
    D.BASELINE_METRICS.forEach(function (m) {
      var v = readBaselineValue(m, $('#setupBase-' + m.id));
      if (v === null) return;
      if (isNaN(v)) { rejected.push(m.label); return; }
      baseline[m.id] = v;
    });
    if (rejected.length) {
      $('#setupState').textContent = 'Ignored out-of-range baseline: ' + rejected.join(', ') + '.';
    }

    state.record = Store.emptyRecord();
    state.record.crewId = crew;
    state.record.mission = $('#setupMission').value.trim().slice(0, 48);
    state.record.missionStart = start;
    state.record.missionProfile = readProfileFields('setup');
    if (Object.keys(baseline).length) {
      state.record.baseline = baseline;
      state.record.baselineMeta = { source: 'entered', setAt: nowISO(), from: 0 };
    }

    persist();
    state.entryId = null;
    state.qa = [];
    buildForm();
    renderAll();
    toast('Record created for ' + crew + '.');
    $('#f-systolic')?.focus();
  }

  function setDraftValue(id, raw) {
    delete state.wearableDraft[id];
    if (raw === '') {
      delete state.draft[id];
    } else {
      var v = Number(raw);
      if (!isFinite(v)) return;
      state.draft[id] = v;
    }
    syncForm();
    renderAssessment();
  }

  function runCheck(ev) {
    if (ev) ev.preventDefault();
    if (!canRun()) return;

    var values = cleanDraft();
    values.sleepTargetAtCheck = profile().sleepTargetHours;
    var at = nowISO();
    var phase = state.preflight ? 'preflight' : 'flight';

    var entry = {
      id: Store.newId(),
      at: at,
      day: nextFlightDay(phase, at),
      phase: phase,
      values: values,
      wearable: clone(state.wearableDraft),
      symptoms: state.symptoms.slice().sort(),
      note: state.note.trim(),
      confirm: {},
      pending: [],
      savedAt: at
    };

    var result = evaluateValues(values, entry);
    entry.pending = result.escalations.slice();

    state.record.entries.push(entry);
    state.record.entries.sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });

    state.entryId = entry.id;
    state.draft = {};
    state.wearableDraft = {};
    state.symptoms = [];
    state.note = '';
    state.preflight = false;
    state.confirm = {};
    state.ai = { entryId: null, status: 'idle', data: null, error: null };
    state.qa = [];

    var saved = persist();
    renderAll();
    selectTab('assessment');

    if (entry.pending.length) {
      toast('Saved provisionally \u2014 ' + entry.pending.length + ' reading' +
        (entry.pending.length === 1 ? '' : 's') + ' to confirm.');
    } else if (saved) {
      toast('Check logged \u00b7 ' + result.triage + ' (' + result.readiness + '/100).');
    } else {
      toast('Logged in memory only \u2014 storage is unavailable here.');
    }
  }

  function confirmReadings() {
    var entry = selectedEntry();
    if (!entry || !(entry.pending || []).length) return;

    var values = clone(entry.values);
    var confirm = clone(entry.confirm || {});
    var still = [];

    entry.pending.forEach(function (id) {
      var second = state.confirm[id];
      if (!isNum(second)) { still.push(id); return; }
      var first = entry.values[id];
      var trial = clone(values);
      trial[id] = second;
      var r = evaluateValues(trial, entry);
      var level = r.results[id] ? r.results[id].level : 0;
      confirm[id] = {
        first: first,
        second: second,
        at: nowISO(),
        resolved: level >= 3 ? 'confirmed' : 'artefact'
      };
      values[id] = second;
      if (entry.wearable) delete entry.wearable[id];
    });

    entry.values = values;
    entry.confirm = confirm;
    entry.pending = still;
    state.confirm = {};
    persist();
    renderAll();

    if (still.length) {
      toast(still.length + ' reading' + (still.length === 1 ? '' : 's') + ' still need a re-measure.');
    } else {
      toast('Readings confirmed.');
    }
  }

  function acceptUnverified() {
    var entry = selectedEntry();
    if (!entry) return;
    var confirm = clone(entry.confirm || {});
    (entry.pending || []).forEach(function (id) {
      confirm[id] = { first: entry.values[id], second: null, at: nowISO(), resolved: 'unverified' };
    });
    entry.confirm = confirm;
    entry.pending = [];
    persist();
    renderAll();
    toast('Recorded as unverified. The handover report will say so.');
  }

  function copyLast() {
    var last = lastEntry();
    if (!last) return;
    state.draft = clone(last.values);
    window.CC_HAZARDS?.observationFields.forEach(function (id) { delete state.draft[id]; });
    delete state.draft.sleepTargetAtCheck;
    Object.keys(last.wearable || {}).forEach(function (id) { delete state.draft[id]; });
    state.wearableDraft = {};
    state.confirm = {};
    syncForm();
    renderAssessment();
    toast('Copied ' + Object.keys(state.draft).length + ' manual readings from ' + dayLabel(last) +
      '. Change what is different.');
  }

  function clearDraft() {
    state.draft = {};
    state.wearableDraft = {};
    state.symptoms = [];
    state.note = '';
    state.preflight = false;
    state.confirm = {};
    syncForm();
    renderAssessment();
    toast('Form cleared.');
  }

  function deleteEntry(id) {
    var entry = findEntry(id);
    if (!entry) return;
    if (!window.confirm('Delete the ' + dayLabel(entry) + ' check? This cannot be undone.')) return;
    state.record.entries = state.record.entries.filter(function (e) { return e.id !== id; });
    if (state.entryId === id) state.entryId = null;
    persist();
    renderAll();
    toast('Check deleted.');
  }

  function copyReport(id) {
    var entry = id ? findEntry(id) : selectedEntry();
    if (!entry) return;
    var text = buildHandover(entry, evaluateEntry(entry));
    copyText(text).then(function (ok) {
      toast(ok ? 'Handover report copied.' : 'Copy blocked by the browser \u2014 select the report text instead.');
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function downloadReport(id) {
    var entry = id ? findEntry(id) : selectedEntry();
    if (!entry) return;
    var text = buildHandover(entry, evaluateEntry(entry));
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'astroguard-handover-' + dayLabel(entry).replace(/[^A-Za-z0-9-]+/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Handover report downloaded.');
  }

  function printReport(id) {
    var entry = id ? findEntry(id) : selectedEntry();
    if (!entry) return;
    var text = buildHandover(entry, evaluateEntry(entry));
    var frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    var doc = frame.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><meta charset="utf-8"><title>ASTROGUARD handover</title>' +
      '<style>body{font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;padding:18px;color:#000}</style>');
    doc.close();
    var pre = doc.createElement('pre');
    pre.textContent = text;
    doc.body.appendChild(pre);

    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(function () { document.body.removeChild(frame); }, 1500);
  }

  function exportRecord() {
    if (!hasRecord()) return;
    Store.download(state.record);
    toast('Record exported as JSON.');
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = Store.fromJSON(String(reader.result));
        if (hasRecord() && !window.confirm('Replace the record on this device with the imported one?')) return;
        state.record = imported;
        state.entryId = null;
        state.draft = {};
        state.wearableDraft = {};
        state.symptoms = [];
        state.note = '';
        state.qa = [];
        buildForm();
        persist();
        renderAll();
        toast('Imported ' + imported.entries.length + ' checks for ' + imported.crewId + '.');
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function selectTab(name) {
    state.tab = name;
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.pane').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-pane') === name);
    });
    if (name === 'systems') renderSystems();
    else if (name === 'assistant') renderAssistant();
    else if (name === 'mission') renderMission();
  }

  function focusForm() {
    var firstMissing = visibleMetrics().filter(function (m) {
      return m.required && !isNum(state.draft[m.id]);
    })[0];
    var el = firstMissing ? $('#f-' + firstMissing.id) : $('#noteInput');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    }
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function bindEvents() {
    window.addEventListener('message', function (event) {
      if (window.parent === window || event.source !== window.parent ||
          event.origin !== (location.protocol === 'file:' ? 'null' : location.origin) ||
          event.data?.type !== 'astroguard:wearable-reading') return;
      var sample = Store.cleanWearable(event.data.sample);
      if (!sample || !hasRecord() || !$('#f-' + sample.metric)) {
        toast('Set up a crew record with the vital signs group enabled before adding a wearable reading.');
        return;
      }
      var readingField = $('#f-' + sample.metric);
      if (sample.value < Number(readingField.min) || sample.value > Number(readingField.max)) {
        toast('The wearable reading is outside the supported input range. Verify the sensor reading before entering it.');
        return;
      }
      setDraftValue(sample.metric, String(sample.value));
      state.wearableDraft[sample.metric] = sample;
      toast('Wearable reading added with its original timestamp. Run check to save it.');
    });
    $('#setupForm').addEventListener('submit', saveSetup);
    $('#checkForm').addEventListener('submit', runCheck);

    $('#formHost').addEventListener('input', function (ev) {
      var input = ev.target;
      if (!input || !input.getAttribute) return;
      if (input.getAttribute('data-role') !== 'input') return;
      var row = input.parentNode.parentNode;
      var id = row && row.getAttribute('data-metric');
      if (!id) return;
      setDraftValue(id, input.value);
      /* the focused input keeps exactly what was typed */
      if (document.activeElement === input) {
        var chip = $('[data-role="band"]', row);
        if (chip) {
          var q = quickBand(D.METRIC_BY_ID[id], state.draft[id]);
          chip.textContent = q.level < 0 ? '\u2014' : (q.level === 0 ? 'in range' : q.text);
          chip.className = 'band-chip ' + levelClass(q.level);
        }
      }
    });

    $('#symptomList').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-symptom]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-symptom');
      var i = state.symptoms.indexOf(id);
      if (i >= 0) state.symptoms.splice(i, 1);
      else state.symptoms.push(id);
      syncForm();
      renderAssessment();
    });

    $('#noteInput').addEventListener('input', function (ev) {
      state.note = ev.target.value;
    });

    $('#preflightToggle').addEventListener('change', function (ev) {
      state.preflight = ev.target.checked;
      if (state.preflight && !state.record.missionStart) {
        toast('Preflight check. Set a launch date in your record so it can be labelled by days before launch.');
      }
    });

    $('#copyLastBtn').addEventListener('click', copyLast);
    $('#clearBtn').addEventListener('click', clearDraft);

    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { selectTab(tab.getAttribute('data-tab')); });
    });

    $('#systemList').addEventListener('click', function (ev) {
      var card = ev.target.closest ? ev.target.closest('[data-system]') : null;
      if (card) selectSystem(card.getAttribute('data-system'));
    });

    $('#assessBody').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'focus-form') focusForm();
      else if (act === 'confirm-readings') confirmReadings();
      else if (act === 'accept-unverified') acceptUnverified();
      else if (act === 'open-assistant') selectTab('assistant');
      else if (act === 'copy-report') copyReport();
      else if (act === 'download-report') downloadReport();
      else if (act === 'print-report') printReport();
    });

    $('#assessBody').addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute || !el.getAttribute('data-confirm')) return;
      var id = el.getAttribute('data-confirm');
      var v = el.value === '' ? null : Number(el.value);
      if (v === null || !isFinite(v)) delete state.confirm[id];
      else state.confirm[id] = v;
    });

    $('#recordBody').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!btn) return;
      var details = btn.closest('.rec');
      var id = details ? details.getAttribute('data-entry') : null;
      var act = btn.getAttribute('data-act');
      if (act === 'delete-entry') deleteEntry(id);
      else if (act === 'copy-report') copyReport(id);
      else if (act === 'view-entry') {
        state.entryId = id;
        state.ai = { entryId: null, status: 'idle', data: null, error: null };
        renderAll();
        selectTab('assessment');
      }
    });

    $('#baselineBody').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'save-baseline') saveBaseline('entered');
      else if (act === 'baseline-from-preflight') baselineFromPreflight();
      else if (act === 'baseline-from-first') baselineFromFirst();
      else if (act === 'clear-baseline') clearBaseline();
    });

    $('#refBody').addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'refCrew') {
        state.refCrew = ev.target.value;
        renderReference();
      }
    });

    $('#refBody').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-tp]') : null;
      if (!btn) return;
      state.refTp = btn.getAttribute('data-tp');
      renderReference();
    });

    /* ---- assistant ---- */
    $('#askForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      askQuestion($('#askInput').value);
    });

    $('#askInput').addEventListener('input', function () {
      var ready = aiState().ready;
      $('#askBtn').disabled = !ready || state.qaBusy || !$('#askInput').value.trim();
    });

    $('#askInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        askQuestion($('#askInput').value);
      }
    });

    $('#askChips').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-question]') : null;
      if (!btn) return;
      var input = $('#askInput');
      input.value = btn.getAttribute('data-question');
      input.focus();
      $('#askBtn').disabled = !aiState().ready || state.qaBusy;
    });

    $('#askClear').addEventListener('click', clearQuestions);

    $('#assistReview').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!btn) return;
      if (btn.getAttribute('data-act') === 'ask-ai') askAI();
    });

    /* ---- mission ---- */
    $('#missionBody').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!btn) return;
      if (btn.getAttribute('data-act') === 'save-mission') saveMission();
    });

    $('#exportBtn').addEventListener('click', exportRecord);
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (file) importFile(file);
      ev.target.value = '';
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') $('#importFile').value = '';
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    var loaded = Store.load();
    state.record = loaded && Store.hasRecord(loaded) ? loaded : Store.emptyRecord();
    state.legacy = Store.hasLegacy();

    buildSetupBaseline();
    buildSetupProfile();
    buildForm();
    window.CC_HAZARDS?.bind($('#missionHazardInputs'), false, function (id, value) {
      setDraftValue(id, value === null ? '' : String(value));
    });
    bindEvents();
    renderAll();

    if (AI) {
      AI.probe().then(function (probe) {
        state.aiProbe = probe;
        renderAssistant();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
