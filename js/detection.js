/* Shared by the static dashboard and Node tests. Evaluates one daily check-in. */
(function () {
  'use strict';

  const defaults = Object.freeze({
    // MedlinePlus pulse oximetry: https://www.medlineplus.gov/lab-tests/pulse-oximetry/
    oxygenWarning: 92,
    oxygenCritical: 88,
    // RCP NEWS2 Chart 3 (pulse extremes) and AHA resting pulse reference.
    // https://www.rcp.ac.uk/media/eczf5mvm/news2-chart-3_news-observation-chart_2022_0_0.pdf
    // https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse
    pulseLow: 50,
    pulseHigh: 100,
    pulseCriticalLow: 40,
    pulseCriticalHigh: 131,
    // Prototype settings for daily check-ins.
    persistenceDays: 2,
    baselineDays: 30,
    baselineMinimum: 7,
    anomalyScore: 3.5,
    oxygenScaleFloor: 1,
    pulseScaleFloor: 3
  });

  const sourceLabels = Object.freeze({
    measured: 'Measured',
    digitized: 'Digitized · historical replay',
    simulated: 'Simulated · demonstration',
    unknown: 'Unspecified provenance'
  });
  const metrics = {
    spo2: { label: 'SpO₂', unit: '%', minimum: 1, maximum: 100 },
    heartRate: { label: 'Heart rate', unit: ' bpm', minimum: 1, maximum: 300 }
  };

  function provenance(value) {
    return Object.hasOwn(sourceLabels, value) ? value : 'unknown';
  }

  function reading(entry, key) {
    const value = entry.values?.[key];
    const metric = metrics[key];
    if (entry.quality?.[key] === 'invalid') return { state: 'sensor flagged' };
    if (value === null || value === undefined) return { state: 'missing' };
    if (!Number.isFinite(value) || value < metric.minimum || value > metric.maximum) {
      return { state: 'invalid' };
    }
    return { state: 'usable', value };
  }

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return (sorted[middle] + sorted[Math.ceil(sorted.length / 2) - 1]) / 2;
  }

  function band(key, value, activity, config) {
    if (!Number.isFinite(value)) return null;
    if (key === 'spo2') {
      if (value <= config.oxygenCritical) return { severity: 'CRITICAL', limit: '≤ ' + config.oxygenCritical + '%' };
      if (value <= config.oxygenWarning) return { severity: 'WARNING', limit: '≤ ' + config.oxygenWarning + '%' };
    } else if (activity === 'rest') {
      if (value <= config.pulseCriticalLow || value >= config.pulseCriticalHigh) {
        return { severity: 'CRITICAL', limit: '≤ ' + config.pulseCriticalLow + ' or ≥ ' + config.pulseCriticalHigh + ' bpm' };
      }
      if (value < config.pulseLow || value > config.pulseHigh) {
        return { severity: 'WARNING', limit: '< ' + config.pulseLow + ' or > ' + config.pulseHigh + ' bpm' };
      }
    }
    return null;
  }

  function personalBaseline(key, prior, config) {
    const samples = prior.filter(entry => entry.activity === 'rest')
      .map(entry => reading(entry, key).value)
      .filter(value => Number.isFinite(value) && !band(key, value, 'rest', config));
    if (samples.length < config.baselineMinimum) return { count: samples.length };
    const center = median(samples);
    const mad = median(samples.map(value => Math.abs(value - center)));
    const floor = key === 'spo2' ? config.oxygenScaleFloor : config.pulseScaleFloor;
    return { count: samples.length, median: center, scale: Math.max(1.4826 * mad, floor) };
  }

  function anomaly(key, value, baseline, config) {
    if (!Number.isFinite(value) || baseline.scale === undefined) return false;
    const delta = value - baseline.median;
    return (key === 'spo2' ? -delta : Math.abs(delta)) / baseline.scale >= config.anomalyScore;
  }

  function evaluate(current, history = [], overrides = {}) {
    const config = { ...defaults, ...overrides };
    const source = provenance(current.source);
    const activity = ['rest', 'exercise'].includes(current.activity) ? current.activity : 'unknown';
    const prior = new Map();
    const duplicateDays = new Set();
    for (const entry of history) {
      if (!Number.isInteger(current.day) || !Number.isInteger(entry.day) || entry.day >= current.day ||
          entry.day < current.day - Math.max(config.baselineDays, config.persistenceDays - 1) ||
          source === 'unknown' || provenance(entry.source) !== source ||
          !current.crew || entry.crew !== current.crew) continue;
      if (prior.has(entry.day)) duplicateDays.add(entry.day);
      prior.set(entry.day, entry);
    }
    for (const day of duplicateDays) prior.delete(day);

    function consecutive(key, condition) {
      let count = 1;
      for (let day = current.day - 1; count < config.persistenceDays && prior.has(day); day--) {
        const entry = prior.get(day);
        if (!condition(reading(entry, key).value, entry.activity)) break;
        count++;
      }
      return count;
    }

    const quality = {};
    const baselines = {};
    const samples = [...prior.values()].filter(entry => entry.day >= current.day - config.baselineDays);
    const reasons = [];
    const findings = [];
    const persistent = new Set();
    let critical = false;
    let warning = false;
    let incomplete = activity === 'unknown' || !Number.isInteger(current.day);
    if (activity === 'unknown') reasons.push('Activity is unspecified. Resting heart-rate checks require a resting reading.');
    if (activity === 'exercise') reasons.push('Exercise context skips resting heart-rate and personal baseline checks.');

    for (const [key, metric] of Object.entries(metrics)) {
      const sample = reading(current, key);
      quality[key] = sample.state;
      if (sample.state !== 'usable') {
        incomplete = true;
        reasons.push(metric.label + ' is ' + sample.state + '.');
        continue;
      }
      const display = metric.label + ' ' + sample.value + metric.unit;
      const hit = band(key, sample.value, activity, config);
      if (hit) {
        const count = consecutive(key, (value, context) => Boolean(band(key, value, context, config)));
        if (count >= config.persistenceDays) persistent.add(key);
        critical ||= hit.severity === 'CRITICAL';
        warning = true;
        findings.push({ metric: key, value: sample.value, kind: 'threshold' });
        reasons.push(display + ' meets the ' + hit.severity.toLowerCase() + ' threshold (' +
          hit.limit + '). Consecutive flagged days: ' + count + '.');
      }

      if (activity !== 'rest') continue;
      const baseline = personalBaseline(key, samples, config);
      baselines[key] = baseline;
      if (baseline.median === undefined) {
        reasons.push(metric.label + ' baseline is warming up (' + baseline.count + '/' + config.baselineMinimum + ' resting check-ins).');
      } else if (anomaly(key, sample.value, baseline, config)) {
        const count = consecutive(key, (value, context) => context === 'rest' && anomaly(key, value, baseline, config));
        warning ||= count >= config.persistenceDays;
        if (!hit) findings.push({ metric: key, value: sample.value, kind: 'change' });
        reasons.push(display + ' departs from the resting median (' + baseline.median + metric.unit +
          '). Consecutive flagged days: ' + count + '.');
      }
    }

    // Only sustained absolute thresholds on two distinct signals can fuse to critical.
    if (persistent.has('spo2') && persistent.has('heartRate')) {
      critical = true;
      reasons.push('Low oxygen and out-of-range resting heart rate both crossed safety thresholds on consecutive days.');
    }

    const severity = critical ? 'CRITICAL' : warning ? 'WARNING' : incomplete ? 'UNKNOWN' : 'NORMAL';
    if (severity === 'NORMAL') reasons.unshift('No alert threshold was reached for this activity.');
    return { severity, source, activity, quality, baselines, reasons, findings };
  }

  function guidance(severity) {
    switch (severity) {
      case 'CRITICAL':
        return {
          priority: 'Urgent flight surgeon review',
          advice: 'Alert the crew medical officer and use the mission’s approved private medical channel to contact the flight surgeon now. Follow the mission emergency checklist. Do not wait for this report or a repeat reading to contact the crew.'
        };
      case 'WARNING':
        return {
          priority: 'Flight surgeon review if concern persists',
          advice: 'Check sensor placement and activity context, then repeat the reading if safe. If the finding persists or symptoms are present, contact the crew medical officer or flight surgeon through the approved private channel.'
        };
      case 'UNKNOWN':
        return {
          advice: 'Check sensor quality, enter any missing readings, and record the activity. If the crew member feels unwell, contact the crew medical officer without waiting for readings.'
        };
      default:
        return {
          advice: 'Continue the scheduled check-ins. Report new symptoms through the mission’s usual medical process.'
        };
    }
  }

  function reviewReport(day, assessment) {
    const { priority } = guidance(assessment.severity);
    if (!priority) return '';
    const heading = assessment.source === 'measured'
      ? 'ASTROGUARD | Draft for crew review'
      : 'ASTROGUARD | Demonstration or unverified data — do not use for operational reporting';
    return [
      heading,
      priority,
      'Flight day ' + (Number.isInteger(day) ? day : 'unspecified'),
      'Source: ' + sourceLabels[assessment.source],
      'Activity: ' + assessment.activity,
      'Prototype detection status: ' + assessment.severity,
      ...assessment.reasons.map(reason => '- ' + reason)
    ].join('\n');
  }

  function crewSuggestion(assessment, resources = {}, symptoms = []) {
    const chestPain = symptoms.includes('chestPain');
    const severity = chestPain ? 'CRITICAL' : assessment.severity;
    const statements = [];
    const findingCodes = [];
    function addObservation(text, kind, metric) {
      statements.push(text);
      findingCodes.push({ kind, metric });
    }
    if (chestPain) addObservation('Chest pain or pressure was reported.', 'chest_pain');
    const concerning = new Set();
    for (const finding of assessment.findings) {
      concerning.add(finding.metric);
      const oxygen = finding.metric === 'spo2';
      const label = oxygen ? 'Blood oxygen' : 'Resting heart rate';
      const unit = oxygen ? '%' : ' beats per minute';
      const reason = finding.kind === 'change' ? ' That differs from your usual readings.' : ' That crossed an alert limit.';
      addObservation(label + ' is ' + finding.value + unit + '.' + reason,
        finding.kind === 'change' ? 'baseline_change' : 'alert', finding.metric);
    }
    for (const [key, label] of [['spo2', 'blood oxygen'], ['heartRate', 'heart rate']]) {
      if (assessment.quality[key] === 'usable') continue;
      concerning.add(key);
      addObservation('There is no usable ' + label + ' reading.', 'missing', key);
    }
    if (assessment.activity === 'unknown') addObservation('The activity during the reading is unknown.', 'activity_unknown');
    if (!statements.length) addObservation(assessment.activity === 'exercise'
      ? 'Blood oxygen did not trigger an alert. Heart rate was recorded during exercise.'
      : 'The available readings did not trigger an alert.', assessment.activity === 'exercise' ? 'exercise' : 'no_alert');

    let next;
    let resource = '';
    if (severity === 'CRITICAL') {
      next = 'Tell the crew medical officer and contact the flight surgeon now. Follow the mission emergency checklist. Do not wait to take another reading.';
      resource = resources.medicalChannel
        ? 'Listed private medical channel: ' + resources.medicalChannel
        : 'Use the mission’s approved private medical channel.';
    } else if (severity === 'NORMAL') {
      next = 'Keep taking your scheduled readings. Tell the crew medical officer if you feel unwell.';
    } else {
      next = severity === 'WARNING'
        ? 'If it is safe, take another reading at rest. Tell the crew medical officer if the reading still looks unusual or you feel unwell.'
        : 'Record what you were doing and fill in any missing readings. If you feel unwell, tell the crew medical officer without waiting for a reading.';
      const tools = [];
      if (concerning.has('spo2') && resources.pulseOximeter === 'available') tools.push('pulse oximeter');
      if (concerning.has('heartRate') && resources.heartRateMonitor === 'available') tools.push('heart-rate monitor');
      if (tools.length) resource = 'For the recheck, use the listed ' + tools.join(' and ') + ' and follow its instructions.';
      if (!tools.length && concerning.size) resource = 'If a suitable sensor is unavailable, tell the crew medical officer and record what you could measure.';
    }
    if (severity === 'CRITICAL' || severity === 'WARNING') {
      if (resources.medical || resources.procedures) resource += (resource ? ' ' : '') + 'Share the onboard medical inventory and checklist references with the medical officer.';
      if (resources.food || resources.water) resource += (resource ? ' ' : '') + 'Have the food and water inventory ready if the medical officer asks about intake.';
    }
    return { severity, situation: statements.join(' '), next, resource, observations: statements, findingCodes };
  }

  const engine = { evaluate, defaults, sourceLabels, provenance, reading, guidance, reviewReport, crewSuggestion };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  else window.CC_DETECTION = engine;
})();
