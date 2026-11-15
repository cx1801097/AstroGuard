/* ============================================================
   ASTROGUARD — data.js
   Indicator catalogue, clinical bands, baseline delta rules,
   body systems and countermeasures.

   This file is the clinical contract of the tool. Everything a
   crew member is scored on, and every action they are told to
   take, is declared here so a flight surgeon can review it without
   reading any application code.

   Bands are ordered by ascending upper bound (hi). A value is
   assigned to the FIRST band where value <= hi. Level scale:
     0 OPTIMAL | 1 NOMINAL | 2 WATCH | 3 ABNORMAL | 4 CRITICAL
   Thresholds follow clinical reference ranges, adjusted for the
   known spaceflight deviations documented by NASA HRP (fluid
   shift, cardiac deconditioning, bone loss, spaceflight-associated neuro-ocular syndrome).
   ============================================================ */
window.CC_DATA = (function () {
  'use strict';

  var LEVELS = ['OPTIMAL', 'NOMINAL', 'WATCH', 'ABNORMAL', 'CRITICAL'];

  /* NASA Human Research Program — five hazards of human spaceflight */
  var HAZARDS = {
    radiation: { label: 'Space radiation', detail: 'Galactic cosmic rays and solar particle events. No atmosphere or magnetosphere shielding in transit; cumulative dose raises cancer, central nervous system and cardiovascular risk.' },
    isolation: { label: 'Isolation & confinement', detail: 'Small crew, no escape, delayed contact with home. Drives sleep disruption, mood decline, fatigue and crew conflict.' },
    distance: { label: 'Distance from Earth', detail: 'Communication delay of minutes to 22 minutes. Crew must self-assess and act without real-time help from flight surgeons.' },
    gravity: { label: 'Gravity fields', detail: 'Microgravity unloads bone and muscle, shifts fluid toward the head, which affects the eyes and raises intracranial pressure, and deconditions the cardiovascular system; planetary gravity re-loads it abruptly.' },
    closed: { label: 'Hostile closed environment', detail: 'Recycled air and water, high carbon dioxide, noise, limited hygiene. Elevates infection and immune-dysregulation risk.' }
  };

  var METRICS = [
    {
      id: 'systolic', label: 'Systolic blood pressure', unit: 'mmHg',
      system: 'cardiovascular', min: 70, max: 220, step: 1, precision: 0, weight: 1,
      group: 'vitals', required: true, order: 1, provenance: 'instrument',
      delta: { abs: 20, pct: 15, dir: 'both' },
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
      id: 'diastolic', label: 'Diastolic blood pressure', unit: 'mmHg',
      system: 'cardiovascular', min: 40, max: 140, step: 1, precision: 0, weight: 1,
      group: 'vitals', required: true, order: 2, provenance: 'instrument',
      delta: { abs: 12, pct: 15, dir: 'both' },
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
      id: 'heartRate', label: 'Heart rate', unit: 'bpm',
      system: 'cardiovascular', min: 40, max: 180, step: 1, precision: 0, weight: 1,
      group: 'vitals', required: true, order: 3, provenance: 'instrument',
      delta: { abs: 15, pct: 18, dir: 'both' },
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
      id: 'glucose', label: 'Blood glucose', unit: 'mg/dL',
      system: 'metabolic', min: 30, max: 400, step: 1, precision: 0, weight: 1,
      group: 'daily', required: false, order: 4, provenance: 'instrument',
      delta: { abs: 30, pct: 30, dir: 'both' },
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
      id: 'temperature', label: 'Core temperature', unit: '\u00b0C',
      system: 'immune', min: 33, max: 42, step: 0.1, precision: 1, weight: 1,
      group: 'vitals', required: true, order: 5, provenance: 'instrument',
      delta: { abs: 0.5, pct: 1.5, dir: 'both' },
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
      id: 'sleepHours', label: 'Sleep in the last 24 hours', unit: 'h',
      system: 'neuro', min: 0, max: 14, step: 0.5, precision: 1, weight: 1,
      group: 'daily', required: true, order: 1, provenance: 'self-report',
      delta: { abs: 2, pct: 25, dir: 'down' },
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
      id: 'mood', label: 'Mood score (1 to 5)', unit: '/5',
      system: 'neuro', min: 1, max: 5, step: 1, precision: 0, weight: 1,
      group: 'daily', required: true, order: 2, provenance: 'self-report',
      delta: { abs: 1, pct: 20, dir: 'down' },
      bands: [
        { hi: 1, level: 4, label: 'Severe distress' },
        { hi: 2, level: 3, label: 'Low mood' },
        { hi: 3, level: 2, label: 'Flat affect' },
        { hi: 4, level: 1, label: 'Acceptable' },
        { hi: Infinity, level: 0, label: 'Optimal' }
      ]
    },
    {
      id: 'spo2', label: 'Blood oxygen saturation', unit: '%',
      system: 'respiratory', min: 80, max: 100, step: 1, precision: 0, weight: 1,
      group: 'vitals', required: true, order: 4, provenance: 'instrument',
      delta: { abs: 3, pct: 3, dir: 'down' },
      bands: [
        { hi: 87, level: 4, label: 'Severe hypoxemia' },
        { hi: 89, level: 3, label: 'Hypoxemia' },
        { hi: 92, level: 2, label: 'Low saturation' },
        { hi: 94, level: 1, label: 'Borderline' },
        { hi: Infinity, level: 0, label: 'Optimal' }
      ]
    },
    {
      id: 'exerciseMinutes', label: 'Exercise in the last 24 hours', unit: 'min',
      system: 'musculoskeletal', min: 0, max: 180, step: 5, precision: 0, weight: 1,
      group: 'daily', required: false, order: 3, provenance: 'self-report',
      delta: { abs: 20, pct: 40, dir: 'down' },
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
      id: 'radiationDose', label: 'Cumulative dose', unit: 'mSv',
      system: 'radiation', min: 0, max: 700, step: 1, precision: 0, weight: 1,
      group: 'exposure', required: false, order: 1, provenance: 'instrument',
      bands: [
        { hi: 99, level: 0, label: 'Within nominal band' },
        { hi: 249, level: 1, label: 'Elevated exposure' },
        { hi: 399, level: 2, label: 'Approaching planning limit' },
        { hi: 549, level: 3, label: 'Near career limit' },
        { hi: Infinity, level: 4, label: 'Career limit exceeded' }
      ]
    },
    {
      id: 'boneDensityPct', label: 'Bone density change', unit: '%',
      system: 'musculoskeletal', min: -8, max: 1, step: 0.1, precision: 1, weight: 1,
      group: 'exposure', required: false, order: 2, provenance: 'instrument',
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
     Measured indicators — real Inspiration4 lab values from NASA
     OSDR (OSD-569 whole blood, OSD-575 serum). Never entered by
     hand: they arrive with the mission dataset.

     `mode` selects how a value is banded:
       reference — against the lab's own reference range from the
                   source CSV (intervals travel with the data)
       baseline  — against that crew member's preflight median,
                   for assay markers with no universal cutoff
     ------------------------------------------------------------ */
  var LAB_METRICS = [
    { id: 'wbc', label: 'White blood cells', unit: 'K/\u00b5L',
      system: 'immune', mode: 'reference', precision: 1, weight: 1.0, study: 'OSD-569',
      note: 'Total white blood cells. Falls with immune suppression, rises with infection or inflammation.' },
    { id: 'neutrophils', label: 'Absolute neutrophils', unit: 'cells/\u00b5L',
      system: 'immune', mode: 'reference', precision: 0, weight: 1.0, study: 'OSD-569',
      note: 'First responders to bacterial challenge; the main driver of a raised white blood cell count.' },
    { id: 'lymphocytes', label: 'Absolute lymphocytes', unit: 'cells/\u00b5L',
      system: 'immune', mode: 'reference', precision: 0, weight: 1.1, study: 'OSD-569',
      note: 'Adaptive immunity. A sustained fall is the classic spaceflight immune signature.' },
    { id: 'platelets', label: 'Platelet count', unit: 'K/\u00b5L',
      system: 'immune', mode: 'reference', precision: 0, weight: 0.6, study: 'OSD-569',
      note: 'Coagulation and wound repair; relevant to spacewalk injury risk.' },
    { id: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL',
      system: 'respiratory', mode: 'reference', precision: 1, weight: 1.0, study: 'OSD-569',
      note: 'Oxygen carrying capacity. Spaceflight causes a real anaemia of ~1\u20132 g/dL.' },
    { id: 'potassium', label: 'Potassium', unit: 'mmol/L',
      system: 'metabolic', mode: 'reference', precision: 1, weight: 1.0, study: 'OSD-575',
      note: 'Electrolyte balance; excursions alter cardiac rhythm.' },
    { id: 'albumin', label: 'Albumin', unit: 'g/dL',
      system: 'metabolic', mode: 'reference', precision: 1, weight: 1.0, study: 'OSD-575',
      note: 'Nutritional and oncotic status; tracks fluid shift and intake.' },
    { id: 'alt', label: 'Alanine aminotransferase', unit: 'U/L',
      system: 'metabolic', mode: 'reference', precision: 0, weight: 0.8, study: 'OSD-575',
      note: 'Liver injury marker; also confounded by muscle damage in flight.' },
    { id: 'creatinine', label: 'Creatinine', unit: 'mg/dL',
      system: 'metabolic', mode: 'reference', precision: 2, weight: 1.0, study: 'OSD-575',
      note: 'Renal filtration; rises with dehydration and muscle breakdown.' },
    { id: 'crp', label: 'C-reactive protein', unit: 'mg/L',
      system: 'immune', mode: 'baseline', precision: 1, weight: 1.2, study: 'OSD-575',
      note: 'Systemic inflammation. Post-flight spikes are a consistent spaceflight finding.' },
    { id: 'fibrinogen', label: 'Fibrinogen', unit: 'ng/mL',
      system: 'cardiovascular', mode: 'baseline', precision: 0, weight: 0.9, study: 'OSD-575',
      note: 'Clotting factor and acute-phase protein; part of the cardiovascular panel.' },
    { id: 'il6', label: 'Interleukin-6', unit: 'pg/mL',
      system: 'immune', mode: 'baseline', precision: 2, weight: 1.1, study: 'OSD-575',
      note: 'The pyrogenic cytokine \u2014 drives fever, fatigue and muscle catabolism.' },
    { id: 'il10', label: 'Interleukin-10', unit: 'pg/mL',
      system: 'immune', mode: 'baseline', precision: 2, weight: 0.8, study: 'OSD-575',
      note: 'Anti-inflammatory brake; rises alongside IL-6 in a counter-regulatory response.' },
    { id: 'tnfa', label: 'Tumor necrosis factor alpha', unit: 'pg/mL',
      system: 'immune', mode: 'baseline', precision: 1, weight: 0.9, study: 'OSD-575',
      note: 'Chronic low-grade inflammation marker linked to muscle loss and immune aging.' }
  ];

  LAB_METRICS.forEach(function (m) {
    m.group = 'labs';
    m.required = false;
    m.provenance = 'measured';
    METRIC_BY_ID[m.id] = m;
  });

  var ALL_METRICS = METRICS.concat(LAB_METRICS);

  /* `glucose` deliberately keeps a SINGLE id shared by both modes: it is
     reference-banded against the lab interval when the mission ships one
     (Inspiration4) and falls back to the static clinical bands for a
     hand-entered reading. This list is the 15 analytes that NASA actually
     measured, in the order the console displays them. */
  var LAB_ANALYTES = LAB_METRICS.slice();
  var afterIndex = -1;
  LAB_ANALYTES.forEach(function (m, i) { if (m.id === 'creatinine') afterIndex = i; });
  LAB_ANALYTES.splice(afterIndex >= 0 ? afterIndex + 1 : LAB_ANALYTES.length, 0, METRIC_BY_ID.glucose);


  /* ------------------------------------------------------------
     Body systems. `dot` positions the hotspot on the SVG figure
     (viewBox 0 0 320 520). `weight` drives the readiness score.
     ------------------------------------------------------------ */
  var SYSTEMS = [
    {
      id: 'neuro', name: 'Neurobehavioral', region: 'Head',
      dot: { x: 160, y: 62 }, weight: 1.2,
      metrics: ['sleepHours', 'mood'],
      symptoms: ['headache', 'fatigue'],
      hazards: ['isolation', 'radiation', 'closed'],
      summary: 'Sleep, mood and cognitive performance. The isolation & confinement hazard appears here first: shortened sleep, irritability, degraded reaction time and crew friction.',
      context: { sleepDebt: 0.55, flightDay: 0.15 }
    },
    {
      id: 'vision', name: 'Vision and eye changes', region: 'Eyes',
      dot: { x: 178, y: 80 }, weight: 0.6,
      metrics: [], symptoms: ['visionChanges'],
      hazards: ['gravity'],
      summary: 'Spaceflight-associated neuro-ocular syndrome: fluid shifting toward the head can flatten the globe, fold the choroid layer and shift refraction. Managed with retinal imaging and vision self-tests \u2014 no continuous sensor exists, so risk here is modelled from flight day and pressure load.',
      derived: true,
      context: { flightDay: 0.7 }
    },
    {
      id: 'immune', name: 'Immune / Thermoregulation', region: 'Thymus',
      dot: { x: 160, y: 150 }, weight: 1.0,
      metrics: ['temperature', 'wbc', 'neutrophils', 'lymphocytes', 'platelets', 'crp', 'il6', 'il10', 'tnfa'], symptoms: ['congestion'],
      hazards: ['closed', 'radiation', 'isolation'],
      summary: 'Spaceflight dysregulates immune function (latent virus reactivation, reduced T-cell response) while the closed environment concentrates pathogens. Core temperature is the practical fever screen.',
      context: { flightDay: 0.2 }
    },
    {
      id: 'cardiovascular', name: 'Cardiovascular', region: 'Heart',
      dot: { x: 145, y: 178 }, weight: 1.3,
      metrics: ['systolic', 'diastolic', 'heartRate', 'fibrinogen', 'crp'],
      symptoms: ['chestPain', 'dizziness'],
      hazards: ['gravity', 'radiation'],
      summary: 'Fluid shifts headward in microgravity, reducing plasma volume and deconditioning the heart; orthostatic intolerance appears on return to gravity. Radiation adds long-term cardiovascular risk.',
      context: { flightDay: 0.35 }
    },
    {
      id: 'respiratory', name: 'Respiratory', region: 'Lungs',
      dot: { x: 176, y: 178 }, weight: 1.1,
      metrics: ['spo2', 'hemoglobin'], symptoms: ['congestion'],
      hazards: ['closed', 'gravity'],
      summary: 'Closed-loop air with elevated carbon dioxide and airborne particles; fluid shift alters lung volumes. Blood oxygen saturation plus symptom review screens for low blood oxygen and cabin-environment problems.',
      context: { flightDay: 0.1 }
    },
    {
      id: 'metabolic', name: 'Metabolic / Nutrition', region: 'Gut',
      dot: { x: 160, y: 242 }, weight: 1.0,
      metrics: ['glucose', 'potassium', 'albumin', 'alt', 'creatinine'], symptoms: ['nausea'],
      hazards: ['closed', 'gravity'],
      summary: 'Altered nutrition, reduced appetite and changed insulin sensitivity in flight. Blood glucose catches both hypo- and hyper-glycemic drift before performance degrades.',
      context: { flightDay: 0.15 }
    },
    {
      id: 'musculoskeletal', name: 'Musculoskeletal', region: 'Bone / Muscle',
      dot: { x: 132, y: 344 }, weight: 1.2,
      metrics: ['exerciseMinutes', 'boneDensityPct'], symptoms: ['jointPain'],
      hazards: ['gravity'],
      summary: 'Unloading costs roughly 1\u20131.5% of weight-bearing bone mineral density per month plus muscle atrophy. Exercise volume is the primary controllable countermeasure; a bone density scan tracks the actual loss.',
      context: { flightDay: 0.45, exerciseDeficit: 0.4 }
    },
    {
      id: 'radiation', name: 'Radiation Burden', region: 'Whole body',
      dot: { x: 160, y: 296 }, weight: 1.0,
      metrics: ['radiationDose'], symptoms: [],
      hazards: ['radiation', 'distance'],
      summary: 'Cumulative dose from galactic cosmic rays and solar particle events. Career limits drive shielding decisions and spacewalk planning; acute symptoms are uncommon, but a solar particle event can escalate fast.',
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
      0: ['Baseline retinal imaging and visual acuity on the standard schedule.'],
      1: ['Weekly self-administered visual acuity and Amsler grid test.'],
      2: ['Report any vision change the same day; schedule retinal imaging within 7 days.'],
      3: ['Flight surgeon consult; consider increased lower-body negative pressure and fluid-shift countermeasures.'],
      4: ['Urgent ground review \u2014 acute acuity change is a mission-planning event.']
    },
    immune: {
      0: ['Standard hygiene, surface cleaning, and food/water handling discipline.'],
      1: ['Increase hand hygiene; log temperature twice daily.'],
      2: ['Fever watch: hydrate, rest, recheck in 4 hours; review cabin air and carbon dioxide readings.'],
      3: ['Draw blood for immune panel and viral reactivation; notify the crew surgeon.'],
      4: ['Treat as a medical event: isolate, notify the flight surgeon, begin the infection response checklist.']
    },
    cardiovascular: {
      0: ['Maintain daily aerobic + resistance exercise per the countermeasure prescription.', 'Log orthostatic symptoms honestly, especially after a spacewalk or before return.'],
      1: ['Increase exercise volume slightly; review salt and fluid intake.'],
      2: ['Repeat blood pressure after 5 minutes seated rest; confirm cuff and technique.', 'Escalate to the crew surgeon if it persists past 48 h.'],
      3: ['Alert the flight surgeon; run an orthostatic stand test and a heart rhythm check.', 'Suspend spacewalk activity until reviewed; consider an intravenous fluid bolus per the chief medical officer\u2019s guidance.'],
      4: ['Emergency: chest pain or crisis-range blood pressure \u2014 stop activity, alert crew, contact the flight surgeon now.', 'Prepare for medical evacuation planning if the mission profile allows.']
    },
    respiratory: {
      0: ['No action; continue routine monitoring.'],
      1: ['Repeat blood oxygen saturation at rest and verify sensor placement.'],
      2: ['Rest 10 min and re-measure; check cabin pressure and carbon dioxide levels.'],
      3: ['Supplemental oxygen and crew surgeon notification; abort the current spacewalk.'],
      4: ['Emergency oxygen, abort activity, alert crew and the flight surgeon.']
    },
    metabolic: {
      0: ['Balanced intake and hydration; log meals.'],
      1: ['Review caloric and carbohydrate intake for the week.'],
      2: ['Glucose log four times a day, adjust diet, check for illness.'],
      3: ['Follow the hypo/hyper protocol; notify the crew surgeon and repeat in 30 minutes.'],
      4: ['Emergency protocol: treat immediately, alert crew, contact the flight surgeon.']
    },
    musculoskeletal: {
      0: ['Resistance training 6 days a week on the advanced resistive exercise device; target all major groups.'],
      1: ['Add 20 min of lower-body loading; review protein intake (~1.2 g/kg).'],
      2: ['Increase loading volume; schedule a bone density scan and review with the surgeon.'],
      3: ['Bone loss exceeds the flight expectation: flight surgeon review, discuss antiresorptive therapy.'],
      4: ['Restrict walking and loading tasks; immediate musculoskeletal and flight surgeon consult.']
    },
    radiation: {
      0: ['Continue personal dosimetry; sleep in the most shielded compartment.'],
      1: ['Review shielding use and spacewalk exposure budget for the next 30 days.'],
      2: ['Reduce spacewalk exposure; move sleep and work to higher-shielding mass.'],
      3: ['Approaching limit \u2014 mission-planning review with the radiation officer.'],
      4: ['Career limit exceeded: radiation officer and chief medical officer review before any further spacewalk.']
    }
  };

  /* Baseline-relative banding for assay markers that have no
     universal clinical cutoff. Expressed as fold-change of the
     crew member's own preflight median, so 1.0 = their normal.

     Deliberately asymmetric: for acute-phase markers a value BELOW
     personal baseline is not a risk signal (a low CRP is good), so it
     can never exceed mild. Only rises escalate. */
  var BASELINE_BANDS = [
    { hi: 0.40, level: 1, label: 'Below personal baseline' },
    { hi: 1.50, level: 0, label: 'At personal baseline' },
    { hi: 2.00, level: 1, label: 'Above personal baseline' },
    { hi: 3.00, level: 2, label: 'Markedly elevated' },
    { hi: 5.00, level: 3, label: 'Strongly elevated' },
    { hi: Infinity, level: 4, label: 'Extreme elevation' }
  ];

  /* ------------------------------------------------------------
     Check-in form groups. The order here is the order the crew
     moves through the form: vitals, then today’s self-report,
     then anything slow-moving, and last the blood panel, which
     is only filled in when a sample was actually analysed.
     ------------------------------------------------------------ */
  var GROUPS = [
    { id: 'vitals', label: 'Vital signs', hint: 'Taken with the ship’s own cuff, oximeter and thermometer.' },
    { id: 'daily', label: 'Since the last check', hint: 'Self-report. Honest numbers here are the early-warning signal.' },
    { id: 'exposure', label: 'Exposure & body composition', hint: 'Slow-moving. Log only when a new reading exists.' },
    { id: 'labs', label: 'Blood panel', hint: 'Only when a sample was run. Leave blank otherwise — blank is not zero.' }
  ];

  /* Metrics with a `delta` can be compared against the crew
     member’s own preflight baseline, which is the core of this
     tool: population ranges miss the person who is abnormal for
     them but still inside the reference interval. */
  var BASELINE_METRICS = METRICS.filter(function (m) { return !!m.delta; });

  return {
    LEVELS: LEVELS,
    HAZARDS: HAZARDS,
    METRICS: METRICS,
    METRIC_BY_ID: METRIC_BY_ID,
    LAB_METRICS: LAB_METRICS,
    LAB_ANALYTES: LAB_ANALYTES,
    ALL_METRICS: ALL_METRICS,
    BASELINE_BANDS: BASELINE_BANDS,
    SYSTEMS: SYSTEMS,
    SYSTEM_BY_ID: SYSTEM_BY_ID,
    SYMPTOMS: SYMPTOMS,
    SYMPTOM_BY_ID: SYMPTOM_BY_ID,
    COUNTERMEASURES: COUNTERMEASURES,
    GROUPS: GROUPS,
    BASELINE_METRICS: BASELINE_METRICS
  };
})();
