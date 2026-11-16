(function () {
  'use strict';

  const groups = [
    { title: 'Pulse and blood oxygen', hint: 'Use the mission-approved pulse oximeter or heart-rate sensor. Record the activity at the time of measurement and leave an unstable reading blank.', metrics: ['heartRate', 'spo2'] },
    { title: 'Blood pressure and temperature', hint: 'Use the spacecraft’s approved cuff and thermometer. Follow the equipment and mission measurement procedures.', metrics: ['systolic', 'diastolic', 'temperature'] },
    { title: 'Sleep and mood', hint: 'Enter actual sleep in the last 24 hours and rate how you feel from 1 (very low) to 5 (good).', metrics: ['sleepHours', 'mood'] }
  ];
  const metricIds = groups.flatMap(group => group.metrics);

  function read(form, definitions) {
    const values = {};
    for (const id of metricIds) {
      const raw = form.get(id);
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const value = Number(raw);
      const metric = definitions.METRIC_BY_ID[id];
      if (!Number.isFinite(value) || value < metric.min || value > metric.max) {
        throw new Error('Enter ' + metric.label + ' within the supported input range or leave it blank.');
      }
      values[id] = value;
    }
    const symptoms = [...new Set(form.getAll('symptoms'))].filter(id => Object.hasOwn(definitions.SYMPTOM_BY_ID, id));
    if (!Object.keys(values).length && !symptoms.length) throw new Error('Enter at least one real reading or select a symptom.');
    const activity = form.get('activity');
    return { values, symptoms, activity: ['rest', 'exercise'].includes(activity) ? activity : 'unknown' };
  }

  const selfCheck = { groups, read };
  if (typeof module !== 'undefined' && module.exports) module.exports = selfCheck;
  else window.CC_SELF_CHECK = selfCheck;
}());
