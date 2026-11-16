(function () {
  'use strict';

  const tests = {
    reaction: { label: 'Reaction time', rounds: 5, hint: 'Press Respond as soon as GO appears. Early presses and missed signals are counted.' },
    choice: { label: 'Choice reaction', rounds: 6, hint: 'When LEFT or RIGHT appears, choose the matching button as quickly as you can.' },
    memory: { label: 'Digit recall', rounds: 3, hint: 'Memorize the displayed digits and enter them in the same order when they disappear.' }
  };

  function summarize(kind, trials) {
    const hits = trials.filter(trial => trial.outcome === 'correct');
    const time = hits.map(trial => trial.ms).filter(Number.isFinite).sort((a, b) => a - b);
    const middle = Math.floor(time.length / 2);
    const median = !time.length ? null : time.length % 2 ? time[middle] : (time[middle - 1] + time[middle]) / 2;
    const counts = ['early', 'wrong', 'missed'].map(outcome => trials.filter(trial => trial.outcome === outcome).length);
    const [early, wrong, missed] = counts;
    return tests[kind].label + ': ' + hits.length + '/' + trials.length + ' correct' +
      (median === null ? '' : ', median ' + Math.round(median) + ' ms') +
      (early ? ', ' + early + ' early' : '') + (wrong ? ', ' + wrong + ' incorrect' : '') +
      (missed ? ', ' + missed + ' missed' : '') + '.';
  }

  function mount(host, sessionKey, addNote) {
    const find = selector => host.querySelector(selector);
    const select = find('[data-cognitive-test]');
    const hint = find('[data-cognitive-hint]');
    const cue = find('[data-cognitive-cue]');
    const start = find('[data-cognitive-start]');
    const respond = find('[data-cognitive-respond]');
    const left = find('[data-cognitive-left]');
    const right = find('[data-cognitive-right]');
    const recall = find('[data-cognitive-recall]');
    const digits = find('[data-cognitive-digits]');
    const summary = find('[data-cognitive-summary]');
    const save = find('[data-cognitive-save]');
    let run;
    let timer;
    let lastResult;

    function cancel() {
      clearTimeout(timer);
      run = null;
      lastResult = null;
      start.textContent = 'Start test';
      select.disabled = false;
      respond.hidden = true;
      left.hidden = true;
      right.hidden = true;
      recall.hidden = true;
      save.hidden = true;
      cue.textContent = '';
      summary.textContent = '';
      hint.textContent = tests[select.value].hint;
    }

    function next() {
      if (!run) return;
      if (run.context !== sessionKey()) { cancel(); return; }
      const { kind, trials } = run;
      if (trials.length === tests[kind].rounds) {
        const text = summarize(kind, trials);
        const context = run.context;
        cancel();
        lastResult = { text, context };
        summary.textContent = text;
        save.hidden = false;
        start.focus();
        return;
      }
      const round = trials.length + 1;
      const label = 'Round ' + round + ' of ' + tests[kind].rounds + '. ';
      run.phase = 'waiting';
      if (kind === 'memory') {
        run.target = Array.from({ length: round + 2 }, () => Math.floor(Math.random() * 10)).join('');
        cue.textContent = label + 'Remember: ' + run.target;
        timer = setTimeout(() => {
          if (!run) return;
          cue.textContent = label + 'Enter the digits.';
          run.phase = 'active';
          recall.hidden = false;
          digits.value = '';
          digits.focus();
        }, 2500);
        return;
      }
      cue.textContent = label + 'Wait for the signal.';
      timer = setTimeout(() => {
        if (!run) return;
        run.target = kind === 'reaction' ? 'respond' : Math.random() < 0.5 ? 'left' : 'right';
        cue.textContent = run.target === 'respond' ? 'GO' : run.target.toUpperCase();
        run.started = performance.now();
        run.phase = 'active';
        timer = setTimeout(() => record('missed'), 2500);
      }, 1000 + Math.random() * 1800);
    }

    function record(outcome, ms) {
      if (!run || run.phase === 'between') return;
      clearTimeout(timer);
      run.trials.push({ outcome, ms });
      run.phase = 'between';
      recall.hidden = true;
      if (run.kind === 'memory') start.focus();
      cue.textContent = { correct: 'Recorded.', wrong: 'Incorrect response.', early: 'Too early.', missed: 'No response recorded.' }[outcome];
      timer = setTimeout(next, 650);
    }

    function reaction(answer) {
      if (!run || run.phase === 'between') return;
      if (run.phase === 'waiting') return record('early');
      const correct = run.target === answer;
      record(correct ? 'correct' : 'wrong', correct ? performance.now() - run.started : undefined);
    }

    select.addEventListener('change', cancel);
    start.addEventListener('click', () => {
      if (run) { cancel(); return; }
      cancel();
      const kind = select.value;
      run = { kind, context: sessionKey(), trials: [] };
      start.textContent = 'Stop test';
      select.disabled = true;
      respond.hidden = kind !== 'reaction';
      left.hidden = right.hidden = kind !== 'choice';
      next();
      if (kind === 'reaction') respond.focus();
      if (kind === 'choice') left.focus();
    });
    respond.addEventListener('click', () => reaction('respond'));
    left.addEventListener('click', () => reaction('left'));
    right.addEventListener('click', () => reaction('right'));
    recall.addEventListener('submit', event => {
      event.preventDefault();
      if (run?.kind === 'memory' && run.phase === 'active') record(digits.value === run.target ? 'correct' : 'wrong');
    });
    save.addEventListener('click', () => {
      if (lastResult?.context === sessionKey() && addNote(lastResult.text)) save.hidden = true;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && run) {
        cancel();
        summary.textContent = 'Test stopped because the page was hidden. Start again for a new result.';
      }
    });
    cancel();
    return cancel;
  }

  const cognitiveCheck = { summarize, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = cognitiveCheck;
  else window.CC_COGNITIVE_CHECK = cognitiveCheck;
}());
