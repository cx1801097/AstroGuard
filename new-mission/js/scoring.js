/* ============================================================
   ASTROGUARD — scoring.js
   Transparent rule engine: metric band -> system severity ->
   overall readiness -> GO / CAUTION / NO-GO.

   No black box on purpose: a crew member (and a judge) can trace
   every recommendation back to a measured value and a threshold.
   ============================================================ */
window.CC_SCORING = (function () {
  'use strict';

  var D = window.CC_DATA;

  /* Severity weight for each band level. */
  var SEV = [0, 14, 40, 72, 100];

  /* Status floors so a single abnormal reading can never be hidden
     behind a good average. */
  var CAUTION_FLOOR = 50;
  var NOGO_FLOOR = 80;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ------------------------------------------------------------
     Banding
     ------------------------------------------------------------
     Three sources, in priority order:

     1. `baseline` mode — assay markers (CRP, fibrinogen, IL-6,
        IL-10, TNF-a) have no universal clinical cutoff, so a value
        is expressed as fold-change of that crew member's own
        preflight median. 1.0 = their normal.

     2. The lab's own reference interval, shipped with the NASA
        OSDR data (`ctx.refs`). A value inside the interval is
        level 0. Outside, severity scales with how far it is
        expressed as a fraction of the interval's own width, so
        narrow ranges (potassium) are not treated like wide ones
        (platelets).

     3. Static clinical bands declared in data.js, used by
        hand-entered readings where no lab interval exists.

     A metric with no value at all is NOT scored: it returns
     `absent: true` and is excluded from every average. This is the
     difference between "normal" and "not measured", and the console
     refuses to blur it.
     ------------------------------------------------------------ */
  var REF_EXCURSION = [0.10, 0.30, 0.70];   /* excursion/width -> level 1,2,3 */

  function bandFromRef(value, ref) {
    if (value >= ref.lo && value <= ref.hi) {
      return { level: 0, label: 'In reference range' };
    }
    var span = ref.hi - ref.lo;
    if (!(span > 0)) span = Math.abs(ref.hi) || Math.abs(ref.lo) || 1;
    var low = value < ref.lo;
    var dev = low ? (ref.lo - value) / span : (value - ref.hi) / span;
    var level = dev < REF_EXCURSION[0] ? 1
              : dev < REF_EXCURSION[1] ? 2
              : dev < REF_EXCURSION[2] ? 3 : 4;
    return {
      level: level,
      label: (low ? 'Below' : 'Above') + ' reference range',
      ref: ref
    };
  }

  function bandFromBaseline(value, base) {
    var fold = value / base;
    var bands = D.BASELINE_BANDS;
    for (var i = 0; i < bands.length; i++) {
      if (fold <= bands[i].hi) {
        return { level: bands[i].level, label: bands[i].label, fold: fold, base: base };
      }
    }
    var last = bands[bands.length - 1];
    return { level: last.level, label: last.label, fold: fold, base: base };
  }

  function bandFromStatic(metric, value) {
    for (var i = 0; i < metric.bands.length; i++) {
      if (value <= metric.bands[i].hi) return metric.bands[i];
    }
    return metric.bands[metric.bands.length - 1];
  }

  /* ------------------------------------------------------------
     Personal-baseline delta banding
     ------------------------------------------------------------
     The population band answers "is this value normal for a human".
     This answers "is this value normal for THIS crew member", which
     is the question that actually matters on orbit: a systolic of
     132 is unremarkable until the person's own preflight value was
     108.

     A metric declares its own significance rule in data.js:
       delta.abs  change in the metric's unit
       delta.pct  change as a percentage of the personal baseline
       delta.dir  'both' | 'down' | 'up'

     The change counts when it meets EITHER criterion. `dir` encodes
     clinical direction: losing two hours of sleep matters, gaining
     two does not; a rising CRP matters, a falling one does not.

     Returns null when there is no baseline for this metric, so the
     layer is honestly absent rather than silently neutral.
     ------------------------------------------------------------ */
  function deltaBand(metric, value, personal) {
    var d = metric.delta;
    if (!d || !personal) return null;

    var base = personal[metric.id];
    if (typeof base !== 'number' || !isFinite(base) || base === 0) return null;

    var diff = value - base;
    if (d.dir === 'down' && diff >= 0) {
      return { level: 0, diff: diff, base: base, ratio: 0, direction: 'up' };
    }
    if (d.dir === 'up' && diff <= 0) {
      return { level: 0, diff: diff, base: base, ratio: 0, direction: 'down' };
    }

    var ratio = 0;
    if (d.abs) ratio = Math.max(ratio, Math.abs(diff) / d.abs);
    if (d.pct) {
      var pctAbs = Math.abs(base) * d.pct / 100;
      if (pctAbs > 0) ratio = Math.max(ratio, Math.abs(diff) / pctAbs);
    }

    return {
      level: ratio < 1 ? 0 : ratio < 1.5 ? 1 : ratio < 2.5 ? 2 : ratio < 4 ? 3 : 4,
      diff: diff,
      base: base,
      ratio: Math.round(ratio * 100) / 100,
      direction: diff > 0 ? 'up' : 'down'
    };
  }

  /**
   * Band one metric value.
   * @param {Object} metric catalogue entry
   * @param {number} value
   * @param {Object} ctx    { refs, baseline } — optional
   */
  function bandFor(metric, value, ctx) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return { level: -1, label: 'Not measured', absent: true };
    }
    ctx = ctx || {};

    if (metric.mode === 'baseline') {
      var base = ctx.baseline && ctx.baseline[metric.id];
      if (typeof base === 'number' && base > 0) return bandFromBaseline(value, base);
      return { level: -1, label: 'No personal baseline', absent: true };
    }

    var ref = ctx.refs && ctx.refs[metric.id];
    if (ref && typeof ref.lo === 'number' && typeof ref.hi === 'number') {
      return bandFromRef(value, ref);
    }

    if (metric.bands && metric.bands.length) return bandFromStatic(metric, value);
    return { level: -1, label: 'No reference range', absent: true };
  }

  function levelLabel(level) { return D.LEVELS[level] || 'UNKNOWN'; }

  function statusFromSeverity(sev) {
    if (sev >= NOGO_FLOOR) return 'NO-GO';
    if (sev >= CAUTION_FLOOR) return 'CAUTION';
    return 'GO';
  }

  /** Floors that turn a single bad reading into a real status. */
  function enforceFloors(sev, worstLevel) {
    if (worstLevel >= 4) return Math.max(sev, NOGO_FLOOR);
    if (worstLevel >= 3) return Math.max(sev, CAUTION_FLOOR);
    return sev;
  }

  /**
   * Rolling sleep debt for the 7 days leading up to (and including)
   * an entry. The requirement comes from the mission profile, so a
   * crew member on a 6-hour sleep plan is not scored against someone
   * else's 7.5 hours.
   * Entries without a numeric day (preflight checks) are ignored.
   */
  function sleepDebt(entries, day, targetHours) {
    var target = typeof targetHours === 'number' && isFinite(targetHours) ? targetHours : 7.5;
    var recent = entries
      .filter(function (e) {
        return typeof e.day === 'number' && e.day <= day && e.day > day - 7;
      })
      .slice(-7);
    var debt = 0;
    recent.forEach(function (e) {
      var s = e.values && e.values.sleepHours;
      if (typeof s === 'number') debt += Math.max(0, target - s);
    });
    return debt;
  }

  /** Days since the last logged check-in, as a compliance signal. */
  function daysSinceCheckIn(entries, day) {
    var prior = entries.filter(function (e) {
      return typeof e.day === 'number' && e.day < day;
    });
    if (!prior.length) return 0;
    return day - prior[prior.length - 1].day;
  }

  /**
   * Evaluate one check-in.
   * @param {Object} values    metric id -> number
   * @param {Object} ctx       { flightDay, exposureDays, entries, refs, baseline }
   * @param {Array}  symptoms  symptom ids
   */
  function evaluate(values, ctx, symptoms) {
    ctx = ctx || {};
    symptoms = symptoms || [];
    var entries = ctx.entries || [];
    var flightDay = typeof ctx.flightDay === 'number' ? ctx.flightDay : 0;

    /* Days actually spent in microgravity. For a live check this is
       the flight day; for the reference dataset it is supplied, since
       a sample drawn at R+194 is not 194 days of exposure. */
    var exposureDays = typeof ctx.exposureDays === 'number' ? ctx.exposureDays : Math.max(0, flightDay);

    var bandCtx = { refs: ctx.refs, baseline: ctx.baseline };
    var personal = ctx.personal || null;

    /* ---- 1. Metric bands: population, then personal baseline ---- */
    var results = {};
    var worstBySystem = {};
    var absent = [];
    var escalations = [];
    var baselineUsed = false;

    D.ALL_METRICS.forEach(function (m) {
      var v = values[m.id];
      var band = bandFor(m, v, bandCtx);

      if (band.absent) {
        absent.push(m.id);
        results[m.id] = {
          value: typeof v === 'number' ? v : null,
          level: -1,
          label: band.label,
          levelName: 'NO DATA',
          severity: 0,
          absent: true,
          populationLevel: null,
          deltaLevel: null,
          rule: 'none'
        };
        return;
      }

      /* Two independent judgements. The final level is the worse of
         the two: a personal-baseline change can never mask a value
         that is already outside the population range, and a normal
         population value can never mask a large change from baseline. */
      var dband = deltaBand(m, v, personal);
      var level = band.level;
      var rule = m.mode === 'baseline' ? 'baseline'
               : (band.level > 0 ? 'population' : 'none');

      if (dband) baselineUsed = true;
      if (dband && dband.level > 0) {
        if (dband.level > band.level) { level = dband.level; rule = 'baseline'; }
        else if (dband.level === band.level) rule = 'both';
      }

      results[m.id] = {
        value: v,
        level: level,
        populationLevel: band.level,
        deltaLevel: dband ? dband.level : null,
        delta: dband ? dband.diff : null,
        deltaRatio: dband ? dband.ratio : null,
        direction: dband ? dband.direction : null,
        baseline: dband ? dband.base : null,
        rule: rule,
        label: band.label,
        levelName: levelLabel(level),
        severity: SEV[level],
        absent: false,
        fold: typeof band.fold === 'number' ? Math.round(band.fold * 100) / 100 : null,
        ref: band.ref || null,
        metric: m
      };

      if (level >= 3) escalations.push(m.id);
      worstBySystem[m.system] = Math.max(worstBySystem[m.system] || 0, level);
    });

    /* ---- 2. Symptom severity per system ---- */
    var symptomSeverity = {};
    var symptomHits = {};
    symptoms.forEach(function (id) {
      var s = D.SYMPTOM_BY_ID[id];
      if (!s) return;
      s.systems.forEach(function (sysId) {
        symptomSeverity[sysId] = Math.max(symptomSeverity[sysId] || 0, s.severity);
        (symptomHits[sysId] = symptomHits[sysId] || []).push(s.label);
      });
    });

    /* ---- 3. Context risk (flight exposure, sleep debt, exercise) ---- */
    var debt = sleepDebt(entries, flightDay, ctx.sleepTargetHours);
    var daysSince = daysSinceCheckIn(entries, flightDay);

    /* Context risk is normalised against the planned mission length, so
       the same flight day is a different fraction of a 30-day and a
       900-day mission. */
    var plannedDays = typeof ctx.plannedDays === 'number' && ctx.plannedDays > 0
      ? ctx.plannedDays : 240;

    function contextSeverity(system) {
      var c = system.context || {};
      var total = 0;
      if (c.flightDay) total += clamp(exposureDays / plannedDays, 0, 1) * 100 * c.flightDay;
      if (c.sleepDebt) total += clamp(debt / 8, 0, 1) * 100 * c.sleepDebt;
      if (c.exerciseDeficit) {
        var v = values.exerciseMinutes;
        if (typeof v === 'number') {
          total += clamp(1 - v / 30, 0, 1) * 100 * c.exerciseDeficit;
        }
      }
      return clamp(total, 0, 100);
    }

    /* ---- 4. Systems ---- */
    var systems = {};
    D.SYSTEMS.forEach(function (sys) {
      var metricSev = 0;
      var weightSum = 0;
      var labCount = 0;
      var instCount = 0;
      var selfCount = 0;
      var findings = [];

      sys.metrics.forEach(function (mid) {
        var m = D.METRIC_BY_ID[mid];
        var r = results[mid];
        if (!m || !r) return;
        /* A metric counts as a lab result when its provenance says so,
           or when the mission shipped a reference interval for it —
           true for the shared `glucose` id in the I4 dataset only. */
        var fromLab = m.provenance === 'measured' || !!(ctx.refs && ctx.refs[mid]);
        findings.push({
          id: mid,
          metric: m.label,
          value: r.value,
          unit: m.unit,
          precision: m.precision,
          level: r.level,
          levelName: r.levelName,
          label: r.label,
          absent: r.absent,
          provenance: fromLab ? 'measured' : m.provenance,
          mode: m.mode || 'reference',
          fold: r.fold,
          ref: r.ref,
          baseline: r.baseline,
          delta: r.delta,
          deltaLevel: r.deltaLevel,
          populationLevel: r.populationLevel,
          rule: r.rule
        });
        if (r.absent) return;
        metricSev += r.severity * m.weight;
        weightSum += m.weight;
        if (fromLab) labCount++;
        else if (m.provenance === 'self-report') selfCount++;
        else instCount++;
      });
      metricSev = weightSum ? metricSev / weightSum : 0;

      /* Coverage says which kind of evidence stands behind a system,
         so the console can show "no data" instead of inventing a
         normal reading. */
      var coverage;
      if (sys.derived) coverage = 'modelled';
      else if (labCount && !instCount && !selfCount) coverage = 'measured';
      else if (labCount || (instCount && selfCount)) coverage = 'mixed';
      else if (instCount) coverage = 'instrument';
      else if (selfCount) coverage = 'self-reported';
      else coverage = 'none';

      var ctxSev = contextSeverity(sys);
      var sev;

      if (sys.derived) {
        /* Vision has no continuous sensor: model fluid-shift load
           from flight day plus pressure, then let symptoms override. */
        var sysBp = values.systolic;
        var bpLoad = typeof sysBp === 'number' ? clamp((sysBp - 120) / 40, 0, 1) * 35 : 0;
        sev = clamp(ctxSev * 0.7 + bpLoad, 0, 100);
      } else if (weightSum === 0) {
        sev = ctxSev;
      } else {
        sev = metricSev * 0.78 + ctxSev * 0.22;
      }

      var symptomSev = SEV[symptomSeverity[sys.id] || 0];
      if (symptomSev > sev) sev = symptomSev;

      sev = enforceFloors(sev, worstBySystem[sys.id] || 0);
      sev = Math.round(clamp(sev, 0, 100));

      /* A system with no measurement and no symptom is not assessed.
         It must not contribute a perfect score to readiness. */
      var assessed = coverage !== 'none' || !!symptomHits[sys.id];

      if (symptomHits[sys.id]) {
        symptomHits[sys.id].forEach(function (h) {
          findings.push({ symptom: h, level: symptomSeverity[sys.id], levelName: levelLabel(symptomSeverity[sys.id]), label: 'Reported symptom' });
        });
      }

      systems[sys.id] = {
        id: sys.id,
        name: sys.name,
        severity: assessed ? sev : 0,
        assessed: assessed,
        coverage: coverage,
        status: assessed ? statusFromSeverity(sev) : 'NO DATA',
        findings: findings,
        contextRisk: Math.round(ctxSev),
        /* Actions follow the worst band seen in the system, not the
           averaged severity: one stage-2 BP must unlock the level-3
           action set even when the other metrics dilute the average. */
        level: Math.max(worstBySystem[sys.id] || 0, symptomSeverity[sys.id] || 0),
        actions: D.COUNTERMEASURES[sys.id][Math.min(4, Math.max(
          severityToLevel(sev),
          worstBySystem[sys.id] || 0,
          symptomSeverity[sys.id] || 0
        ))] || []
      };
    });

    /* ---- 5. Readiness ----
       Mission readiness is gated by the weakest system, the same way
       flight rules work: one failing system can scrub a mission even
       when everything else is nominal. Unassessed systems are skipped
       rather than counted as healthy. */
    var wSum = 0, sevSum = 0, worstSev = 0, assessedCount = 0;
    D.SYSTEMS.forEach(function (sys) {
      var s = systems[sys.id];
      if (!s.assessed) return;
      assessedCount++;
      wSum += sys.weight;
      sevSum += s.severity * sys.weight;
      /* low-weight informational systems (SANS) inform but don't gate */
      worstSev = Math.max(worstSev, s.severity * Math.min(1, sys.weight));
    });
    var avgSeverity = wSum ? sevSum / wSum : 0;
    var gatedSeverity = avgSeverity * 0.6 + worstSev * 0.4;
    var readiness = Math.round(clamp(100 - gatedSeverity, 0, 100));

    /* No measurement and no symptom is not a clean bill of health.
       With nothing assessed there is no verdict to give, so refuse
       to emit GO rather than reporting a hollow perfect score. */
    var triage;
    if (assessedCount === 0) {
      readiness = 0;
      triage = 'NO DATA';
    } else {
      triage = readiness >= 80 ? 'GO' : readiness >= 55 ? 'CAUTION' : 'NO-GO';
    }

    /* ---- 6. Alerts ---- */
    var alerts = [];
    D.ALL_METRICS.forEach(function (m) {
      var r = results[m.id];
      if (r && !r.absent && r.level >= 3) {
        var valueText = typeof r.value === 'number' ? trimNum(r.value, m.precision) : '\u2014';
        var why = r.rule === 'baseline' || r.rule === 'both'
          ? deltaText(r, m)
          : r.label;
        alerts.push({
          type: 'metric',
          metric: m.id,
          system: m.system,
          level: r.level,
          rule: r.rule,
          provenance: m.provenance,
          text: m.label + ' ' + valueText + ' ' + m.unit + ' \u2014 ' + why
        });
      }
    });
    symptoms.forEach(function (id) {
      var s = D.SYMPTOM_BY_ID[id];
      if (s && s.severity >= 3) {
        alerts.push({ type: 'symptom', system: s.systems[0], level: s.severity, text: 'Reported: ' + s.label });
      }
    });
    if (alerts.some(function (a) { return a.level >= 4; })) triage = 'NO-GO';

    /* A severity-4 symptom (chest pain) is an emergency on the human
       sensor alone. No number can talk it down, and no amount of
       missing instrumentation can defer it. */
    var emergency = symptoms.some(function (id) {
      var s = D.SYMPTOM_BY_ID[id];
      return !!s && s.severity >= 4;
    });
    if (emergency) {
      triage = 'NO-GO';
      readiness = Math.min(readiness, 15);
    }

    return {
      values: values,
      symptoms: symptoms,
      results: results,
      systems: systems,
      readiness: readiness,
      triage: triage,
      alerts: alerts,
      escalations: escalations,
      emergency: emergency,
      sleepDebt: Math.round(debt * 10) / 10,
      sleepTargetHours: typeof ctx.sleepTargetHours === 'number' ? ctx.sleepTargetHours : 7.5,
      plannedDays: plannedDays,
      daysSinceCheckIn: daysSince,
      absent: absent,
      assessedCount: assessedCount,
      exposureDays: exposureDays,
      hasBaseline: baselineUsed,
      worstSystem: worstSystem(systems)
    };
  }

  /** "+22 mmHg vs your baseline of 118" */
  function deltaText(r, metric) {
    var p = typeof metric.precision === 'number' ? metric.precision : 1;
    var diff = Number(r.delta);
    var sign = diff > 0 ? '+' : '';
    var dir = diff > 0 ? 'above' : 'below';
    return sign + diff.toFixed(p) + ' ' + metric.unit + ' ' + dir +
      ' your baseline of ' + Number(r.baseline).toFixed(p);
  }

  function trimNum(v, precision) {
    var p = typeof precision === 'number' ? precision : 1;
    return Number(v).toFixed(p);
  }

  function severityToLevel(sev) {
    if (sev >= 80) return 4;
    if (sev >= 62) return 3;
    if (sev >= 38) return 2;
    if (sev >= 15) return 1;
    return 0;
  }

  function worstSystem(systems) {
    var worst = null;
    Object.keys(systems).forEach(function (k) {
      if (!systems[k].assessed) return;
      if (!worst || systems[k].severity > worst.severity) worst = systems[k];
    });
    return worst;
  }

  /**
   * Evaluate a series of entries, oldest first. Used by the flight
   * reference tab, where the dataset ships its own day offsets.
   * @param {Array}  entries
   * @param {Object} ctx  { refs, baseline, personal, exposureFor(entry) }
   */
  function evaluateMission(entries, ctx) {
    ctx = ctx || {};
    var sorted = entries.slice().sort(function (a, b) { return a.day - b.day; });
    return sorted.map(function (e) {
      var exposure = typeof ctx.exposureFor === 'function' ? ctx.exposureFor(e) : e.day;
      return {
        entry: e,
        result: evaluate(e.values, {
          flightDay: e.day,
          exposureDays: exposure,
          entries: sorted,
          refs: ctx.refs,
          baseline: ctx.baseline,
          personal: ctx.personal
        }, e.symptoms || [])
      };
    });
  }

  /** Extract a numeric series for charting. */
  function series(entries, metricId) {
    return entries
      .slice()
      .sort(function (a, b) { return a.day - b.day; })
      .map(function (e) {
        var v = e.values ? e.values[metricId] : undefined;
        return { day: e.day, value: typeof v === 'number' ? v : null };
      })
      .filter(function (p) { return p.value !== null; });
  }

  return {
    SEV: SEV,
    bandFor: bandFor,
    deltaBand: deltaBand,
    deltaText: deltaText,
    evaluate: evaluate,
    evaluateMission: evaluateMission,
    series: series,
    sleepDebt: sleepDebt,
    statusFromSeverity: statusFromSeverity,
    severityToLevel: severityToLevel,
    levelLabel: levelLabel
  };
})();
