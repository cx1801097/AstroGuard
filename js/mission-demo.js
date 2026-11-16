(function () {
  'use strict';

  function cases(presets) {
    return {
      persistentSymptom: {
        title: 'Urgent symptom persists',
        intro: 'Chest pain was reported. Review the urgent guidance before logging the training recheck.',
        followUp: 'Blood oxygen improved. Chest pain remains part of the check-in.',
        values: presets.critical.values,
        symptoms: presets.critical.symptoms,
        repeat: presets.nominal.values.spo2
      },
      recoveringOxygen: {
        title: 'Oxygen improves on recheck',
        intro: 'The initial resting blood oxygen reading is below the alert threshold. Review the guidance, then log the training recheck.',
        followUp: 'The replacement reading is within the local checks. The original reading stays in the handover.',
        values: { ...presets.nominal.values, spo2: 92 },
        symptoms: [],
        repeat: presets.nominal.values.spo2
      },
      unreliableSensor: {
        title: 'Unreliable sensor reading',
        intro: 'The sensor reported an unreliable blood oxygen reading. Review what the system can assess before logging the verified training recheck.',
        followUp: 'The verified replacement can be assessed. The unreliable first reading stays in the handover.',
        values: { ...presets.nominal.values, spo2: 86 },
        quality: { spo2: 'invalid' },
        symptoms: [],
        repeat: presets.nominal.values.spo2
      }
    };
  }

  function assess(scenario, repeated, dependencies) {
    const { detection, scoring, hazards } = dependencies;
    const values = { ...scenario.values };
    if (repeated) values.spo2 = scenario.repeat;
    const quality = repeated ? {} : scenario.quality || {};
    const input = { day: 1, source: 'simulated', activity: 'rest', values, quality };
    const vital = detection.evaluate(input);
    const score = scoring.evaluate(values, { flightDay: input.day, activity: input.activity, quality }, scenario.symptoms);
    const environment = hazards.evaluate({ ...input, sleepTarget: 7.5 });
    const suggestion = detection.crewSuggestion(vital, {}, scenario.symptoms, score.alerts, environment);
    const recheck = repeated ? {
      first: scenario.values.spo2, second: scenario.repeat, rejected: scenario.quality?.spo2 === 'invalid'
    } : null;
    const comparison = recheck ? 'Simulated blood oxygen recheck: ' + recheck.first + '%' +
      (recheck.rejected ? ' (unreliable)' : '') + ' → ' + recheck.second + '%.' : '';
    return {
      suggestion, recheck, comparison,
      report: detection.reviewReport(input.day, { ...vital, severity: suggestion.severity,
        reasons: comparison ? suggestion.observations.concat(comparison) : suggestion.observations }, Boolean(recheck))
    };
  }

  function mount(host, presets, dependencies) {
    const scenarios = cases(presets);
    const find = selector => host.querySelector(selector);
    const select = find('[data-demo-case]');
    const title = find('[data-demo-status]');
    const findings = find('[data-demo-findings]');
    const next = find('[data-demo-next]');
    const recheck = find('[data-demo-recheck]');
    const compare = find('[data-demo-compare]');
    const handoff = find('[data-demo-handoff]');
    const report = find('[data-demo-report]');

    select.replaceChildren(...Object.entries(scenarios).map(([id, scenario]) => new Option(scenario.title, id)));

    function render(repeated) {
      const scenario = scenarios[select.value];
      const result = assess(scenario, repeated, dependencies);
      title.textContent = result.suggestion.severity + ' · ' + (result.recheck ? 'After simulated recheck' : 'Initial simulated check');
      findings.replaceChildren(...result.suggestion.observations.map(text => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      }));
      next.textContent = result.suggestion.next;
      compare.textContent = result.recheck ? result.comparison + ' ' + scenario.followUp : scenario.intro;
      report.textContent = result.report;
      handoff.hidden = !result.recheck;
      handoff.open = false;
      recheck.hidden = Boolean(result.recheck);
      find('[data-demo-repeat]').textContent = scenario.repeat + '%';
    }
    select.addEventListener('change', () => render(false));
    recheck.addEventListener('click', () => {
      render(true);
      title.focus();
    });
    find('[data-demo-restart]').addEventListener('click', () => {
      render(false);
      title.focus();
    });
    return () => render(false);
  }

  const demo = { assess, cases, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = demo;
  else window.CC_MISSION_DEMO = demo;
}());
