(function () {
  'use strict';

  function assess(scenario, repeat, dependencies) {
    const { detection, scoring, hazards } = dependencies;
    const values = { ...scenario.values };
    if (repeat !== null) values.spo2 = repeat;
    const input = { day: 1, source: 'simulated', activity: 'rest', values };
    const vital = detection.evaluate(input);
    const score = scoring.evaluate(values, { flightDay: input.day, activity: input.activity }, scenario.symptoms);
    const environment = hazards.evaluate({ ...input, sleepTarget: 7.5 });
    const suggestion = detection.crewSuggestion(vital, {}, scenario.symptoms, score.alerts, environment);
    const recheck = repeat === null ? null : { first: scenario.values.spo2, second: repeat };
    const reasons = recheck
      ? suggestion.observations.concat('Simulated blood oxygen recheck: ' + recheck.first + '% → ' + recheck.second + '%.')
      : suggestion.observations;
    return {
      suggestion, recheck,
      report: detection.reviewReport(input.day, { ...vital, severity: suggestion.severity, reasons }, Boolean(recheck))
    };
  }

  function mount(host, scenario, repeat, dependencies) {
    const find = selector => host.querySelector(selector);
    const title = find('[data-demo-status]');
    const findings = find('[data-demo-findings]');
    const next = find('[data-demo-next]');
    const recheck = find('[data-demo-recheck]');
    const compare = find('[data-demo-compare]');
    const handoff = find('[data-demo-handoff]');
    const report = find('[data-demo-report]');

    function render(value) {
      const result = assess(scenario, value, dependencies);
      title.textContent = result.suggestion.severity + ' · ' + (result.recheck ? 'After simulated recheck' : 'Initial simulated check');
      findings.replaceChildren(...result.suggestion.observations.map(text => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      }));
      next.textContent = result.suggestion.next;
      compare.textContent = result.recheck
        ? 'Blood oxygen: ' + result.recheck.first + '% → ' + result.recheck.second +
          '%. The reported chest pain is still flagged.'
        : 'Reported chest pain is part of this case. An urgent alert comes before any recheck.';
      report.textContent = result.report;
      handoff.hidden = !result.recheck;
      handoff.open = false;
      recheck.hidden = Boolean(result.recheck);
    }
    recheck.addEventListener('click', () => {
      render(repeat);
      title.focus();
    });
    find('[data-demo-restart]').addEventListener('click', () => {
      render(null);
      title.focus();
    });
    find('[data-demo-repeat]').textContent = repeat + '%';
    return () => render(null);
  }

  const demo = { assess, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = demo;
  else window.CC_MISSION_DEMO = demo;
}());
