/* ============================================================
   ASTROGUARD — sample-mission.js
   A deterministic 30-day demonstration mission so the console has
   something to plot before real crew data exists.

   Replace this with your teammate's dataset; the shape is:
     { name, crew, flightDay, entries:[ {day, values, symptoms, note} ] }
   ============================================================ */
window.CC_SAMPLE = (function () {
  'use strict';

  var START_DAY = 40;
  var DAYS = 30;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function build() {
    var entries = [];
    var seed = 20251114;

    function rnd() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    function jitter(amount) { return (rnd() * 2 - 1) * amount; }

    for (var i = 0; i < DAYS; i++) {
      var day = START_DAY + i;
      /* last 6 days degrade into a deconditioning episode */
      var stress = i >= DAYS - 6 ? (i - (DAYS - 7)) / 6 : 0;

      var values = {
        systolic: Math.round(clamp(114 + i * 0.14 + jitter(2.5) + stress * 12, 70, 220)),
        diastolic: Math.round(clamp(71 + i * 0.1 + jitter(2) + stress * 9, 40, 140)),
        heartRate: Math.round(clamp(62 + i * 0.22 + jitter(2.2) + stress * 18, 40, 180)),
        glucose: Math.round(clamp(88 + i * 0.35 + jitter(4) + stress * 24, 30, 400)),
        temperature: r1(clamp(36.5 + i * 0.004 + jitter(0.08) + stress * 0.85, 33, 42)),
        sleepHours: r1(clamp(7.6 - i * 0.02 + jitter(0.55) - stress * 2.7, 0, 14)),
        mood: Math.round(clamp(4 - stress * 2 + jitter(0.4), 1, 5)),
        spo2: Math.round(clamp(98 - jitter(0.6) - stress * 3.2, 80, 100)),
        exerciseMinutes: Math.round(clamp(50 - i * 0.22 + jitter(7) - stress * 30, 0, 180)),
        radiationDose: Math.round(108 + i * 0.45),
        boneDensityPct: r2(clamp(-0.4 - i * 0.085 - stress * 0.7, -8, 1))
      };

      var symptoms = [];
      if (stress > 0.7) symptoms = ['fatigue', 'headache', 'insomnia'];
      else if (stress > 0.35) symptoms = ['fatigue'];

      entries.push({
        day: day,
        crew: 'CDR-1',
        source: 'simulated',
        activity: 'rest',
        values: values,
        symptoms: symptoms,
        note: stress > 0.7 ? 'Reported poor sleep and headache after EVA.' : '',
        savedAt: null
      });
    }

    return {
      version: 1,
      name: 'ARTEMIS VII',
      crew: 'CDR-1',
      flightDay: START_DAY + DAYS - 1,
      entries: entries
    };
  }

  return { build: build };
})();
