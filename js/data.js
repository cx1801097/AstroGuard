/* ============================================================
   CREW CHECK — data.js
   Indicator catalogue, clinical bands, body systems,
   countermeasures and demo scenarios.

   Bands are ordered by ascending upper bound (hi). A value is
   assigned to the FIRST band where value <= hi. Level scale:
     0 OPTIMAL | 1 NOMINAL | 2 WATCH | 3 ABNORMAL | 4 CRITICAL
   Thresholds follow clinical reference ranges, adjusted for the
   known spaceflight deviations documented by NASA HRP (fluid
   shift, cardiac deconditioning, bone loss, SANS/VIIP).
   ============================================================ */
window.CC_DATA = (function () {
  'use strict';

  var LEVELS = ['OPTIMAL', 'NOMINAL', 'WATCH', 'ABNORMAL', 'CRITICAL'];

  /* NASA Human Research Program — five hazards of human spaceflight */
  var HAZARDS = {
    radiation: { label: 'Space radiation', detail: 'Galactic cosmic rays and solar particle events. No atmosphere or magnetosphere shielding in transit; cumulative dose raises cancer, CNS and cardiovascular risk.' },
    isolation: { label: 'Isolation & confinement', detail: 'Small crew, no escape, delayed contact with home. Drives sleep disruption, mood decline, fatigue and crew conflict.' },
    distance: { label: 'Distance from Earth', detail: 'Communication delay of minutes to 22 min. Crew must self-assess and act without real-time help from flight surgeons.' },
    gravity: { label: 'Gravity fields', detail: 'Microgravity unloads bone and muscle, shifts fluid headward (SANS/VIIP) and deconditions the cardiovascular system; planetary gravity re-loads it abruptly.' },
    closed: { label: 'Hostile closed environment', detail: 'Recycled air and water, high CO2, noise, limited hygiene. Elevates infection and immune-dysregulation risk.' }
  };

  var METRICS = [
    {
      id: 'systolic', label: 'Systolic BP', short: 'SYS', unit: 'mmHg',
      system: 'cardiovascular', min: 70, max: 220, step: 1, def: 118, precision: 0, weight: 1,
      bands: [
        { hi: 84, level: 3, label: 'Severe hypotension' },
        { hi: 89, level: 3, label: 'Hypotension' },
        { hi: 99, level: 1, label: 'Low-normal' },
        { hi: 129, level: 0, label: 'Optimal' },
        { hi: 139, level: 1, label: 'Elevated' },
        { hi: 159, level: 2, label: 'Stage 1 hypertension' },
        { hi: 179, level: 3, label: 'Stage 2 hypertension' },
        { hi: Infinity, level: 4, label: 'Hypertensive crisis' }
      ]
    },
    {
      id: 'diastolic', label: 'Diastolic BP', short: 'DIA', unit: 'mmHg',
      system: 'cardiovascular', min: 40, max: 140, step: 1, def: 74, precision: 0, weight: 1,
      bands: [
        { hi: 49, level: 3, label: 'Severe hypotension' },
        { hi: 59, level: 2, label: 'Hypotension' },
        { hi: 64, level: 1, label: 'Low-normal' },
        { hi: 79, level: 0, label: 'Optimal' },
        { hi: 89, level: 1, label: 'Elevated' },
        { hi: 99, level: 2, label: 'Stage 1 hypertension' },
        { hi: 109, level: 3, label: 'Stage 2 hypertension' },
        { hi: Infinity, level: 4, label: 'Hypertensive crisis' }
      ]
    },
    {
      id: 'heartRate', label: 'Heart rate', short: 'HR', unit: 'bpm',
      system: 'cardiovascular', min: 40, max: 180, step: 1, def: 68, precision: 0, weight: 1,
      bands: [
        { hi: 44, level: 4, label: 'Severe bradycardia' },
        { hi: 49, level: 3, label: 'Bradycardia' },
        { hi: 59, level: 2, label: 'Low resting rate' },
        { hi: 69, level: 1, label: 'Low-normal (flight typical)' },
        { hi: 79, level: 0, label: 'Optimal' },
        { hi: 89, level: 1, label: 'High-normal' },
        { hi: 99, level: 2, label: 'Tachycardia (mild)' },
        { hi: 119, level: 3, label: 'Tachycardia' },
        { hi: Infinity, level: 4, label: 'Severe tachycardia' }
      ]
    },
    {
      id: 'glucose', label: 'Blood glucose', short: 'GLU', unit: 'mg/dL',
      system: 'metabolic', min: 30, max: 400, step: 1, def: 92, precision: 0, weight: 1,
      bands: [
        { hi: 53, level: 4, label: 'Severe hypoglycemia' },
        { hi: 69, level: 3, label: 'Hypoglycemia' },
        { hi: 99, level: 0, label: 'Optimal' },
        { hi: 125, level: 1, label: 'Impaired fasting' },
        { hi: 179, level: 2, label: 'Hyperglycemia' },
        { hi: 249, level: 3, label: 'Marked hyperglycemia' },
        { hi: Infinity, level: 4, label: 'Critical hyperglycemia' }
      ]
    },
    {
      id: 'temperature', label: 'Core temperature', short: 'TEMP', unit: '\u00b0C',
      system: 'immune', min: 33, max: 42, step: 0.1, def: 36.6, precision: 1, weight: 1,
      bands: [
        { hi: 35.5, level: 3, label: 'Hypothermia' },
        { hi: 35.9, level: 2, label: 'Hypothermia risk' },
        { hi: 37.2, level: 0, label: 'Optimal' },
        { hi: 37.7, level: 1, label: 'Elevated' },
        { hi: 38.2, level: 2, label: 'Low-grade fever' },
        { hi: 38.9, level: 3, label: 'Fever' },
        { hi: Infinity, level: 4, label: 'High fever' }
      ]
    },
    {
      id: 'sleepHours', label: 'Sleep (last 24 h)', short: 'SLEEP', unit: 'h',
      system: 'neuro', min: 0, max: 14, step: 0.5, def: 7.5, precision: 1, weight: 1,
      bands: [
        { hi: 3.9, level: 3, label: 'Severe sleep restriction' },
        { hi: 5.4, level: 2, label: 'Sleep restricted' },
        { hi: 6.4, level: 1, label: 'Below requirement' },
        { hi: 9.0, level: 0, label: 'Optimal' },
        { hi: 10.0, level: 1, label: 'Extended sleep' },
        { hi: Infinity, level: 2, label: 'Hypersomnia / circadian drift' }
      ]
    },
    {
      id: 'mood', label: 'Mood (1\u20135)', short: 'MOOD', unit: '/5',
      system: 'neuro', min: 1, max: 5, step: 1, def: 4, precision: 0, weight: 1,
      bands: [
        { hi: 1, level: 4, label: 'Severe distress' },
        { hi: 2, level: 3, label: 'Low mood' },
        { hi: 3, level: 2, label: 'Flat affect' },
        { hi: 4, level: 1, label: 'Acceptable' },
        { hi: Infinity, level: 0, label: 'Optimal' }
      ]
    },
    {
      id: 'spo2', label: 'Blood oxygen (SpO\u2082)', short: 'SPO2', unit: '%',
      system: 'respiratory', min: 80, max: 100, step: 1, def: 98, precision: 0, weight: 1,
      bands: [
        { hi: 87, level: 4, label: 'Severe hypoxemia' },
        { hi: 89, level: 3, label: 'Hypoxemia' },
        { hi: 92, level: 2, label: 'Low saturation' },
        { hi: 94, level: 1, label: 'Borderline' },
        { hi: Infinity, level: 0, label: 'Optimal' }
      ]
    },
    {
      id: 'exerciseMinutes', label: 'Exercise (last 24 h)', short: 'EXER', unit: 'min',
      system: 'musculoskeletal', min: 0, max: 180, step: 5, def: 45, precision: 0, weight: 1,
      bands: [
        { hi: 4, level: 3, label: 'No countermeasure load' },
        { hi: 14, level: 2, label: 'Under target' },
        { hi: 24, level: 1, label: 'Below target' },
        { hi: 100, level: 0, label: 'On target' },
        { hi: 140, level: 1, label: 'High volume' },
        { hi: Infinity, level: 2, label: 'Overreaching' }
      ]
    },
    {
      id: 'radiationDose', label: 'Cumulative dose', short: 'DOSE', unit: 'mSv',
      system: 'radiation', min: 0, max: 700, step: 1, def: 108, precision: 0, weight: 1,
      bands: [
        { hi: 99, level: 0, label: 'Within nominal band' },
        { hi: 249, level: 1, label: 'Elevated exposure' },
        { hi: 399, level: 2, label: 'Approaching planning limit' },
        { hi: 549, level: 3, label: 'Near career limit' },
        { hi: Infinity, level: 4, label: 'Career limit exceeded' }
      ]
    },
    {
      id: 'boneDensityPct', label: 'Bone density change', short: 'BMD', unit: '%',
      system: 'musculoskeletal', min: -8, max: 1, step: 0.1, def: -0.6, precision: 1, weight: 1,
      bands: [
        { hi: -5, level: 4, label: 'Severe loss' },
        { hi: -3, level: 3, label: 'Marked loss' },
        { hi: -2, level: 2, label: 'Accelerated loss' },
        { hi: -1, level: 1, label: 'Expected flight loss' },
        { hi: Infinity, level: 0, label: 'Preserved' }
      ]
    }
  ];

  var METRIC_BY_ID = {};
  METRICS.forEach(function (m) { METRIC_BY_ID[m.id] = m; });

  /* ------------------------------------------------------------
     Body systems. `dot` positions the hotspot on the SVG figure
     (viewBox 0 0 320 520). `weight` drives the readiness score.
     ------------------------------------------------------------ */
  var SYSTEMS = [
    {
      id: 'neuro', name: 'Neurobehavioral', short: 'NEURO', region: 'Head',
      dot: { x: 160, y: 62 }, weight: 1.2,
      metrics: ['sleepHours', 'mood'],
      symptoms: ['headache', 'fatigue'],
      hazards: ['isolation', 'radiation', 'closed'],
      summary: 'Sleep, mood and cognitive performance. The isolation & confinement hazard appears here first: shortened sleep, irritability, degraded reaction time and crew friction.',
      context: { sleepDebt: 0.55, flightDay: 0.15 }
    },
    {
      id: 'vision', name: 'Vision / Ocular (SANS)', short: 'SANS', region: 'Eyes',
      dot: { x: 178, y: 80 }, weight: 0.6,
      metrics: [], symptoms: ['visionChanges'],
      hazards: ['gravity'],
      summary: 'Spaceflight Associated Neuro-ocular Syndrome: headward fluid shift flattens the globe, folds the choroid and can shift refraction. Managed with OCT imaging and vision self-tests \u2014 no continuous sensor exists, so risk here is modelled from flight day and pressure load.',
      derived: true,
      context: { flightDay: 0.7 }
    },
    {
      id: 'immune', name: 'Immune / Thermoregulation', short: 'IMMUNE', region: 'Thymus',
      dot: { x: 160, y: 150 }, weight: 1.0,
      metrics: ['temperature'], symptoms: ['congestion'],
      hazards: ['closed', 'radiation', 'isolation'],
      summary: 'Spaceflight dysregulates immune function (latent virus reactivation, reduced T-cell response) while the closed environment concentrates pathogens. Core temperature is the practical fever screen.',
      context: { flightDay: 0.2 }
    },
    {
      id: 'cardiovascular', name: 'Cardiovascular', short: 'CARDIO', region: 'Heart',
      dot: { x: 145, y: 178 }, weight: 1.3,
      metrics: ['systolic', 'diastolic', 'heartRate'],
      symptoms: ['chestPain', 'dizziness'],
      hazards: ['gravity', 'radiation'],
      summary: 'Fluid shifts headward in microgravity, reducing plasma volume and deconditioning the heart; orthostatic intolerance appears on return to gravity. Radiation adds long-term cardiovascular risk.',
      context: { flightDay: 0.35 }
    },
    {
      id: 'respiratory', name: 'Respiratory', short: 'RESP', region: 'Lungs',
      dot: { x: 176, y: 178 }, weight: 1.1,
      metrics: ['spo2'], symptoms: ['congestion'],
      hazards: ['closed', 'gravity'],
      summary: 'Closed-loop air with elevated CO2 and airborne particulates; fluid shift alters lung volumes. SpO\u2082 plus symptom review screens for hypoxemia and cabin-environment problems.',
      context: { flightDay: 0.1 }
    },
    {
      id: 'metabolic', name: 'Metabolic / Nutrition', short: 'METAB', region: 'Gut',
      dot: { x: 160, y: 242 }, weight: 1.0,
      metrics: ['glucose'], symptoms: ['nausea'],
      hazards: ['closed', 'gravity'],
      summary: 'Altered nutrition, reduced appetite and changed insulin sensitivity in flight. Blood glucose catches both hypo- and hyper-glycemic drift before performance degrades.',
      context: { flightDay: 0.15 }
    },
    {
      id: 'musculoskeletal', name: 'Musculoskeletal', short: 'MSK', region: 'Bone / Muscle',
      dot: { x: 132, y: 344 }, weight: 1.2,
      metrics: ['exerciseMinutes', 'boneDensityPct'], symptoms: ['jointPain'],
      hazards: ['gravity'],
      summary: 'Unloading costs roughly 1\u20131.5% of weight-bearing bone mineral density per month plus muscle atrophy. Exercise volume is the primary controllable countermeasure; DXA tracks the actual loss.',
      context: { flightDay: 0.45, exerciseDeficit: 0.4 }
    },
    {
      id: 'radiation', name: 'Radiation Burden', short: 'RAD', region: 'Whole body',
      dot: { x: 160, y: 296 }, weight: 1.0,
      metrics: ['radiationDose'], symptoms: [],
      hazards: ['radiation', 'distance'],
      summary: 'Cumulative dose from galactic cosmic rays and solar particle events. Career limits drive shielding decisions and EVA planning; acute symptoms are uncommon but SEPA events can escalate fast.',
      context: { flightDay: 0.3 }
    }
  ];

  var SYSTEM_BY_ID = {};
  SYSTEMS.forEach(function (s) { SYSTEM_BY_ID[s.id] = s; });

  /* Self-reported symptoms. Severity 0-4 feeds the owning systems. */
  var SYMPTOMS = [
    { id: 'headache', label: 'Headache', severity: 1, systems: ['neuro'] },
    { id: 'fatigue', label: 'Unusual fatigue', severity: 1, systems: ['neuro', 'cardiovascular'] },
    { id: 'dizziness', label: 'Dizziness / light-headed', severity: 2, systems: ['cardiovascular'] },
    { id: 'chestPain', label: 'Chest pain or pressure', severity: 4, systems: ['cardiovascular', 'respiratory'] },
    { id: 'visionChanges', label: 'Vision change', severity: 3, systems: ['vision'] },
    { id: 'nausea', label: 'Nausea / poor appetite', severity: 1, systems: ['metabolic'] },
    { id: 'jointPain', label: 'Joint or back pain', severity: 1, systems: ['musculoskeletal'] },
    { id: 'congestion', label: 'Congestion / cough', severity: 1, systems: ['respiratory', 'immune'] },
    { id: 'insomnia', label: 'Insomnia', severity: 2, systems: ['neuro'] }
  ];

  var SYMPTOM_BY_ID = {};
  SYMPTOMS.forEach(function (s) { SYMPTOM_BY_ID[s.id] = s; });

  /* ------------------------------------------------------------
     Countermeasures / clinical actions, indexed by level 0-4.
     Level 0 text is the preventive baseline, 4 is an emergency.
     ------------------------------------------------------------ */
  var COUNTERMEASURES = {
    neuro: {
      0: ['Hold a consistent sleep window; dim lights 1 h before sleep.', 'Keep the crew check-in habit daily \u2014 early change detection is the point.'],
      1: ['Blue-light hygiene and caffeine cutoff 6 h before sleep.', 'Schedule private time and a family comm call this week.'],
      2: ['Review actigraphy and sleep log with the crew; consider a sleep-promotion protocol.', 'Shorten shift intensity, protect the sleep window.'],
      3: ['Behavioral health check-in with the crew surgeon; treat as a real finding, not a mood.', 'Screen for conflict, workload and confinement stress.'],
      4: ['Immediate behavioral health assessment with the flight surgeon.', 'Consider command-level mission impact review; do not leave the crew member isolated.']
    },
    vision: {
      0: ['Baseline OCT and visual acuity on the standard schedule.'],
      1: ['Weekly self-administered acuity and Amsler grid test.'],
      2: ['Report any vision change the same day; schedule OCT within 7 days.'],
      3: ['Flight surgeon consult; consider increased lower-body negative pressure and fluid-shift countermeasures.'],
      4: ['Urgent ground review \u2014 acute acuity change is a mission-planning event.']
    },
    immune: {
      0: ['Standard hygiene, surface cleaning, and food/water handling discipline.'],
      1: ['Increase hand hygiene; log temperature twice daily.'],
      2: ['Fever watch: hydrate, rest, recheck in 4 h; review cabin air and CO\u2082 readings.'],
      3: ['Draw blood for immune panel and viral reactivation; notify the crew surgeon.'],
      4: ['Treat as a medical event: isolate, notify the flight surgeon, begin the infection response checklist.']
    },
    cardiovascular: {
      0: ['Maintain daily aerobic + resistance exercise per the countermeasure prescription.', 'Log orthostatic symptoms honestly, especially after EVA or before return.'],
      1: ['Increase exercise volume slightly; review salt and fluid intake.'],
      2: ['Repeat BP after 5 min seated rest; confirm cuff and technique.', 'Escalate to the crew surgeon if it persists past 48 h.'],
      3: ['Alert the flight surgeon; run an orthostatic stand test and a rhythm check.', 'Suspend EVA until reviewed; consider IV fluid bolus per CMO guidance.'],
      4: ['Emergency: chest pain or crisis-range BP \u2014 stop activity, alert crew, contact the flight surgeon now.', 'Prepare for medical evacuation planning if the mission profile allows.']
    },
    respiratory: {
      0: ['No action; continue routine monitoring.'],
      1: ['Repeat SpO\u2082 at rest and verify sensor placement.'],
      2: ['Rest 10 min and re-measure; check cabin pressure and CO\u2082 levels.'],
      3: ['Supplemental O\u2082 and crew surgeon notification; abort the current EVA.'],
      4: ['Emergency O\u2082, abort activity, alert crew and the flight surgeon.']
    },
    metabolic: {
      0: ['Balanced intake and hydration; log meals.'],
      1: ['Review caloric and carbohydrate intake for the week.'],
      2: ['Glucose log 4x/day, adjust diet, check for illness.'],
      3: ['Follow the hypo/hyper protocol; notify the crew surgeon and repeat in 30 min.'],
      4: ['Emergency protocol: treat immediately, alert crew, contact the flight surgeon.']
    },
    musculoskeletal: {
      0: ['Resistance training 6 days/week on the ARED-class device; target all major groups.'],
      1: ['Add 20 min of lower-body loading; review protein intake (~1.2 g/kg).'],
      2: ['Increase loading volume; schedule DXA scan and review with the surgeon.'],
      3: ['Bone loss exceeds the flight expectation: flight surgeon review, discuss antiresorptive therapy.'],
      4: ['Restrict ambulation and loading tasks; immediate MSK and flight surgeon consult.']
    },
    radiation: {
      0: ['Continue personal dosimetry; sleep in the most shielded compartment.'],
      1: ['Review shielding use and EVA exposure budget for the next 30 days.'],
      2: ['Reduce EVA exposure; move sleep and work to higher-shielding mass.'],
      3: ['Approaching limit \u2014 mission-planning review with the radiation officer.'],
      4: ['Career limit exceeded: radiation officer and CMO review before any further EVA.']
    }
  };

  /* One-click demo conditions for judging / briefing. */
  var SCENARIOS = {
    nominal: {
      label: 'Nominal day',
      hint: 'Everything in band \u2014 baseline for comparison.',
      symptoms: [],
      values: { systolic: 118, diastolic: 74, heartRate: 68, glucose: 92, temperature: 36.6, sleepHours: 7.5, mood: 4, spo2: 98, exerciseMinutes: 45, radiationDose: 108, boneDensityPct: -0.6 }
    },
    degraded: {
      label: 'Deconditioning',
      hint: 'Sleep debt, rising HR, mild fever \u2014 the subtle case crews miss.',
      symptoms: ['fatigue'],
      values: { systolic: 128, diastolic: 84, heartRate: 88, glucose: 118, temperature: 37.5, sleepHours: 5, mood: 3, spo2: 96, exerciseMinutes: 15, radiationDose: 142, boneDensityPct: -2.2 }
    },
    critical: {
      label: 'Medical event',
      hint: 'Chest pain + fever + hypoxemia during a solar particle event.',
      symptoms: ['chestPain', 'dizziness', 'headache'],
      values: { systolic: 148, diastolic: 96, heartRate: 112, glucose: 146, temperature: 38.6, sleepHours: 3.5, mood: 2, spo2: 92, exerciseMinutes: 5, radiationDose: 236, boneDensityPct: -3.4 }
    }
  };

  return {
    LEVELS: LEVELS,
    HAZARDS: HAZARDS,
    METRICS: METRICS,
    METRIC_BY_ID: METRIC_BY_ID,
    SYSTEMS: SYSTEMS,
    SYSTEM_BY_ID: SYSTEM_BY_ID,
    SYMPTOMS: SYMPTOMS,
    SYMPTOM_BY_ID: SYMPTOM_BY_ID,
    COUNTERMEASURES: COUNTERMEASURES,
    SCENARIOS: SCENARIOS
  };
})();
