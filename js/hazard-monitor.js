(function () {
  'use strict';

  const co2Reference = 'https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/';
  const fields = [
    ['cabinCo2Avg', 'Cabin CO₂, verified one-hour average (mmHg)', 0, 760],
    ['cabinPressure', 'Cabin total pressure (kPa)', 0, 1000],
    ['cabinPressureLow', 'Mission lower cabin pressure limit (kPa)', 0, 1000],
    ['cabinPressureHigh', 'Mission upper cabin pressure limit (kPa)', 0, 1000],
    ['cabinOxygen', 'Cabin oxygen partial pressure (kPa)', 0, 1000],
    ['cabinOxygenLow', 'Mission lower cabin oxygen partial pressure limit (kPa)', 0, 1000],
    ['cabinOxygenHigh', 'Mission upper cabin oxygen partial pressure limit (kPa)', 0, 1000],
    ['radiationLimit', 'Mission cumulative-dose review limit (mSv)', 0.01, 100000],
    ['boneLossLimit', 'Mission bone-density loss review point (%)', 0.01, 100],
    ['wbc', 'White blood cells (thousand/µL)', 0, 1000],
    ['wbcLow', 'Lab’s white blood cell lower limit (thousand/µL)', 0, 1000],
    ['wbcHigh', 'Lab’s white blood cell upper limit (thousand/µL)', 0, 1000]
  ];
  const extraFields = fields.map(([id]) => id);
  const observationFields = ['cabinCo2Avg', 'cabinPressure', 'cabinOxygen', 'radiationDose', 'boneDensityPct', 'sleepHours', 'mood', 'wbc', 'wbcLow', 'wbcHigh'];

  function read(values, quality, key, min, max) {
    const value = values?.[key];
    return quality?.[key] !== 'invalid' && Number.isFinite(value) && value >= min && value <= max ? value : null;
  }

  function evaluate({ values, quality, source, sleepTarget, day, crew, history = [] }) {
    const trusted = source === 'measured' || source === 'simulated';
    const get = (key, min, max) => trusted ? read(values, quality, key, min, max) : null;
    const dose = get('radiationDose', 0, 100000);
    const doseLimit = get('radiationLimit', 0.01, 100000);
    const sleep = get('sleepHours', 0, 24);
    const target = Number.isFinite(sleepTarget) && sleepTarget > 0 && sleepTarget <= 24 ? sleepTarget : null;
    const mood = get('mood', 1, 5);
    const previous = Number.isInteger(day) && day > 1 && crew
      ? history.filter(entry => entry.day === day - 1 && entry.crew === crew && entry.source === source)
      : [];
    const previousSleep = previous.length === 1
      ? read(previous[0].values, previous[0].quality, 'sleepHours', 0, 24) : null;
    const bone = get('boneDensityPct', -100, 100);
    const boneLimit = get('boneLossLimit', 0.01, 100);
    const co2 = get('cabinCo2Avg', 0, 760);
    const wbc = get('wbc', 0, 1000);
    const low = get('wbcLow', 0, 1000);
    const high = get('wbcHigh', 0, 1000);
    const sleepBelow = sleep !== null && target !== null && sleep < target;
    const knownRange = low !== null && high !== null && low < high;
    const result = (id, title, warning, compared, detail, next, url) => ({
      id, title, status: warning ? 'WARNING' : compared ? 'WITHIN CHECK LIMIT' : 'UNKNOWN', detail, next, url
    });
    function environmentRange(id, title, next) {
      const value = get(id, 0, 1000);
      const low = get(id + 'Low', 0, 1000);
      const high = get(id + 'High', 0, 1000);
      const validLimits = low !== null && high !== null && low < high;
      const compared = value !== null && validLimits;
      const detail = value === null ? 'No usable cabin reading.' : value + ' kPa.' +
        (validLimits ? ' Mission limits: ' + low + '–' + high + ' kPa.' :
          ' Enter the mission-approved lower and upper limits for this measurement.');
      return result(id, title, compared && (value < low || value > high), compared, detail, next, co2Reference);
    }
    return [
      result('radiationDose', 'Radiation', dose !== null && doseLimit !== null && dose >= doseLimit, dose !== null && doseLimit !== null,
        dose === null ? 'No usable cumulative personal dose.' : dose + ' mSv cumulative personal dose' +
          (doseLimit === null ? '. Enter the mission review limit for the same dose period.' : ' against a ' + doseLimit + ' mSv mission review limit.'),
        'Verify the dosimeter and review the mission’s radiation procedures when the limit is reached.'),
      result('sleepHours', 'Isolation and confinement', sleepBelow, sleep !== null && target !== null,
        (sleep === null ? 'No usable sleep record.' : sleep + ' h of sleep' +
          (target === null ? '. No sleep target set.' : ' against a ' + target + ' h target.')) +
          (sleepBelow && previousSleep !== null && previousSleep < target ? ' Below target on two consecutive flight days.' : '') +
          (mood === null ? '' : ' Reported mood: ' + mood + '/5.'),
        'Review rest and workload when sleep falls below the mission target. Track mood separately.'),
      result('boneDensityPct', 'Altered gravity and bone loss', bone !== null && boneLimit !== null && bone <= -boneLimit, bone !== null && boneLimit !== null,
        bone === null ? 'No comparable bone-density measurement.' : bone + '% change from baseline' +
          (boneLimit === null ? '. Enter the mission review point for that measurement site.' : ' with a ' + boneLimit + '% loss review point.'),
        'Compare scans from the same site and review scheduled exercise with the mission medical team.'),
      result('cabinCo2', 'Closed environment · cabin CO₂', co2 !== null && co2 > 3, co2 !== null,
        co2 === null ? 'No verified one-hour cabin CO₂ average.' : co2 + ' mmHg over one hour. The nominal NASA limit is 3 mmHg.',
        'Confirm the cabin reading and follow the vehicle’s environmental procedures if it exceeds the limit.', co2Reference),
      environmentRange('cabinPressure', 'Closed environment · cabin total pressure',
        'Confirm cabin pressure and follow the approved vehicle procedure if it is outside the mission range.'),
      environmentRange('cabinOxygen', 'Closed environment · cabin oxygen partial pressure',
        'Confirm cabin oxygen partial pressure and follow the approved vehicle procedure if it is outside the mission range.'),
      result('wbc', 'Immune monitoring · white blood cells', wbc !== null && knownRange && (wbc < low || wbc > high), wbc !== null && knownRange,
        wbc === null ? 'No usable white blood cell count.' : wbc + ' thousand/µL' +
          (knownRange ? ' against the reported lab interval of ' + low + '–' + high + ' thousand/µL.'
            : '. Enter the matching lab report’s lower and upper limits.'),
        'Check the lab report and review any out-of-range count with the crew medical team.')
    ];
  }

  function bind(container, includeWbc, onInput) {
    for (const [id, name, min, max] of fields) {
      if (id === 'wbc' && !includeWbc) continue;
      const label = document.createElement('label');
      label.className = 'field';
      const text = document.createElement('span');
      text.textContent = name;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.min = min;
      input.max = max;
      input.dataset.hazardInput = id;
      input.addEventListener('input', () => onInput(id, input.validity.valid && Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null));
      label.append(text, input);
      container.append(label);
    }
  }

  function sync(container, values) {
    container.querySelectorAll('[data-hazard-input]').forEach(input => {
      if (document.activeElement !== input) input.value = values[input.dataset.hazardInput] ?? '';
    });
  }

  function render(container, input, findings = evaluate(input)) {
    const source = document.createElement('p');
    source.className = 'muted';
    source.textContent = input.source === 'measured' ? 'Measured check-in' : input.source === 'simulated' ?
      'Simulated check-in · demonstration' : 'Select measured or simulated source to assess this check-in.';
    const list = document.createElement('ul');
    for (const finding of findings) {
      const item = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = finding.title + ' · ' + finding.status;
      const detail = document.createElement('p');
      detail.textContent = finding.detail;
      item.append(heading, detail);
      if (finding.status !== 'WITHIN CHECK LIMIT') {
        const next = document.createElement('p');
        next.textContent = finding.next;
        item.append(next);
      }
      if (finding.url) {
        const link = document.createElement('a');
        link.href = finding.url;
        link.textContent = finding.id === 'cabinCo2' ? 'NASA CO₂ standard' : 'NASA cabin environment standard';
        item.append(link);
      }
      list.append(item);
    }
    container.replaceChildren(source, list);
  }

  function applyToMissionAssessment(assessment, findings) {
    const hazardWarnings = findings.filter(finding => finding.status === 'WARNING');
    const healthTriage = assessment.triage;
    const triage = hazardWarnings.length && healthTriage === 'GO' ? 'CAUTION' : healthTriage;
    return { ...assessment, triage, healthTriage, hazardWarnings, hazardFindings: findings };
  }

  const monitor = { evaluate, bind, sync, render, extraFields, observationFields, applyToMissionAssessment };
  if (typeof module !== 'undefined' && module.exports) module.exports = monitor;
  else window.CC_HAZARDS = monitor;
}());
