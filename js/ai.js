/* ============================================================
   CREW CHECK — ai.js
   Optional assistant layer: one scoped question channel and one
   second-opinion request.

   Design constraints, in order of priority:

   1. NEVER required. The rule engine above produces a complete,
      auditable verdict with zero network access. If the assistant
      is unavailable, the check is unaffected.

   2. No open-ended channel. The client can send exactly two things:
      a structured summary of the check on screen, or one
      mission-health question with that same summary. There is no
      conversation history, no tool access, and no way to make it do
      anything else. Every response is validated against a fixed
      schema before it is rendered.

   3. The key is never in the browser. Requests go to a local proxy
      (`/api/ai`) that holds the credential server-side. This file
      contains no secret and never reads one.

   The crew member's note and question are the only free text that
   leaves the device, and both are sent as data — the server prompt
   tells the model to ignore instructions inside them.

   Model choice is the server's job: only free OpenRouter models are
   used, picked per request and failed over automatically. The browser
   cannot name a model, so it cannot route around the free-only rule.
   ============================================================ */
window.CC_AI = (function () {
  'use strict';

  var ENDPOINT = (typeof window.CC_AI_ENDPOINT === 'string' && window.CC_AI_ENDPOINT)
    ? window.CC_AI_ENDPOINT.replace(/\/+$/, '')
    : '/api/ai';

  var MAX_NOTE = 240;
  var MAX_QUESTION = 400;

  /* The server may sweep several free models before answering, so the
     client waits longer than any single upstream call. The request is
     aborted only if the whole exchange stalls. */
  var TIMEOUT_MS = 95000;

  /* Politeness cap so a stuck button cannot burn free-tier quota.
     A transparent retry does not count as a new question. */
  var WINDOW_MS = 10 * 60 * 1000;
  var MAX_PER_WINDOW = 8;
  var recent = [];

  var status = {
    checked: false,
    available: false,
    model: null,
    label: null,
    models: [],
    reason: null,
    checkedAt: null
  };

  function trimText(s, max) {
    if (typeof s !== 'string') return '';
    return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, max);
  }

  function round(v, precision) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    var p = typeof precision === 'number' ? precision : 1;
    var f = Math.pow(10, p);
    return Math.round(v * f) / f;
  }

  function rateLimited() {
    var now = Date.now();
    recent = recent.filter(function (t) { return now - t < WINDOW_MS; });
    return recent.length >= MAX_PER_WINDOW;
  }

  /** Is the proxy running and configured? Never throws. */
  function probe() {
    if (status.checked && status.checkedAt && Date.now() - status.checkedAt < 60000) {
      return Promise.resolve(status);
    }
    return fetch(ENDPOINT + '/health', { method: 'GET', headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        status = {
          checked: true,
          available: !!(d && d.available),
          model: (d && d.model) || null,
          label: (d && d.label) || (d && d.model) || null,
          models: (d && Array.isArray(d.models)) ? d.models : [],
          reason: (d && d.reason) || null,
          checkedAt: Date.now()
        };
        return status;
      })
      .catch(function () {
        status = {
          checked: true,
          available: false,
          model: null,
          label: null,
          models: [],
          reason: 'No assistant proxy reachable. The rule-based verdict is complete without it.',
          checkedAt: Date.now()
        };
        return status;
      });
  }

  function statusNow() { return status; }

  /* ------------------------------------------------------------
     Payload construction
     Everything is derived from the scored result, not from arbitrary
     input. Numbers are rounded to the metric's own precision and only
     measured findings are sent, which keeps the prompt small enough
     for a light free model. The note and question are the only free
     text; both are length-capped and labelled untrusted on the server.
     ------------------------------------------------------------ */
  function collectFindings(result) {
    var D = window.CC_DATA;
    var findings = [];
    D.ALL_METRICS.forEach(function (m) {
      var r = result.results[m.id];
      if (!r || r.absent) return;
      findings.push({
        label: m.label,
        value: round(r.value, m.precision),
        unit: m.unit,
        level: r.level,
        band: r.levelName,
        deltaFromBaseline: r.delta === null || r.delta === undefined ? null : round(r.delta, m.precision),
        baseline: r.baseline === null || r.baseline === undefined ? null : round(r.baseline, m.precision),
        basis: r.rule === 'baseline' ? 'personal'
          : r.rule === 'both' ? 'both'
          : r.rule === 'population' ? 'clinical'
          : 'none'
      });
    });
    return findings;
  }

  function collectNotAssessed(result) {
    var D = window.CC_DATA;
    var out = [];
    D.SYSTEMS.forEach(function (s) {
      var sr = result.systems[s.id];
      if (sr && !sr.assessed) out.push(s.name);
    });
    return out.slice(0, 8);
  }

  function context(record, entry, result) {
    var D = window.CC_DATA;
    var hasEntry = !!(entry && result);
    var p = (window.CC_STORAGE && record.missionProfile) || {};

    return {
      version: 1,
      crew: {
        callsign: trimText(record.crewId, 32),
        mission: trimText(record.mission, 40)
      },
      mission: {
        destination: typeof p.destination === 'string' ? p.destination : null,
        plannedDays: typeof p.plannedDays === 'number' ? p.plannedDays : null,
        crewSize: typeof p.crewSize === 'number' ? p.crewSize : null,
        commDelaySeconds: typeof p.commDelaySeconds === 'number' ? p.commDelaySeconds : null,
        sleepTargetHours: typeof p.sleepTargetHours === 'number' ? p.sleepTargetHours : null
      },
      check: hasEntry ? {
        phase: entry.phase === 'preflight' ? 'preflight' : 'in-flight',
        flightDay: typeof entry.day === 'number' ? entry.day : null,
        at: entry.at
      } : null,
      baseline: {
        available: !!(record.baseline && Object.keys(record.baseline).length),
        source: record.baselineMeta ? record.baselineMeta.source : null,
        metrics: record.baseline ? Object.keys(record.baseline).length : 0
      },
      verdict: hasEntry ? {
        status: result.triage,
        readiness: result.readiness,
        assessedSystems: result.assessedCount,
        totalSystems: D.SYSTEMS.length
      } : null,
      symptoms: hasEntry ? (entry.symptoms || []).map(function (id) {
        var s = D.SYMPTOM_BY_ID[id];
        return s ? s.label : id;
      }) : [],
      findings: hasEntry ? collectFindings(result) : [],
      notAssessed: hasEntry ? collectNotAssessed(result) : [],
      crewNote: trimText((entry && entry.note) || '', MAX_NOTE)
    };
  }

  function buildPayload(record, entry, result) {
    var base = context(record, entry, result);
    base.kind = 'check-review';
    return base;
  }

  function buildQuestion(record, entry, result, question) {
    var base = context(record, entry, result);
    base.kind = 'crew-question';
    base.question = trimText(question, MAX_QUESTION);
    return base;
  }

  /* ------------------------------------------------------------
     Response validation
     Reject anything that is not exactly the reviewed-check shape.
     This is what stops the assistant becoming a general-purpose text
     generator rendered into the console.
     ------------------------------------------------------------ */
  function validateReview(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.scope !== 'mission-health') return null;

    var headline = trimText(d.headline, 160);
    var assessment = trimText(d.assessment, 1400);
    if (!headline || !assessment) return null;

    function strList(v, maxItems, maxLen) {
      if (!Array.isArray(v)) return [];
      return v.map(function (s) { return trimText(s, maxLen); })
        .filter(function (s) { return s.length > 0; })
        .slice(0, maxItems);
    }

    var confidence = ['low', 'moderate', 'high'].indexOf(d.confidence) >= 0 ? d.confidence : 'low';

    return {
      headline: headline,
      assessment: assessment,
      watch: strList(d.watch, 4, 220),
      questions: strList(d.questions, 3, 220),
      confidence: confidence
    };
  }

  function validateAnswer(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.scope !== 'mission-health') return null;

    var answer = trimText(d.answer, 1200);
    if (!answer) return null;

    return {
      answer: answer,
      escalate: d.escalate === true,
      confidence: ['low', 'moderate', 'high'].indexOf(d.confidence) >= 0 ? d.confidence : 'low'
    };
  }

  /* ------------------------------------------------------------
     One request, one validator. The proxy always answers with a
     result envelope; a clean refusal arrives as `refused: true`.

     Free models fail transiently often (rate-limited, empty body,
     timeout). The proxy already sweeps the model pool, so a failure
     here is worth one more try before the crew member is told the
     assistant is unavailable.

     Each attempt gets its own controller and timer: a retry must not
     inherit an already-aborted signal from the attempt before it.
     ------------------------------------------------------------ */
  function attempt(payload, validateFn, isRetry) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (body) {
          if (!r.ok) {
            var msg = body && body.error ? String(body.error) : 'Assistant returned HTTP ' + r.status;
            throw new Error(msg);
          }
          return body;
        });
      })
      .then(function (body) {
        if (body && body.refused) {
          return {
            ok: false,
            refused: true,
            error: 'That request is outside the assistant\u2019s scope, so it was refused.'
          };
        }
        var data = validateFn(body && body.result ? body.result : body);
        if (!data) {
          return {
            ok: false,
            error: 'The assistant answered outside its scope, so the reply was discarded.'
          };
        }
        return { ok: true, data: data, model: (body && body.model) || null };
      })
      .catch(function (err) {
        var msg = err && err.name === 'AbortError'
          ? 'Assistant timed out. The rule-based verdict stands.'
          : (err && err.message) || 'Assistant unavailable.';
        return { ok: false, error: msg };
      })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        return res;
      });
  }

  function send(payload, validateFn) {
    if (rateLimited()) {
      return Promise.resolve({
        ok: false,
        error: 'Assistant limit reached for now. Try again later \u2014 the rule-based verdict is unaffected.'
      });
    }

    recent.push(Date.now());

    return attempt(payload, validateFn, false).then(function (res) {
      /* One transparent retry when the upstream was merely
         unavailable. A refusal or a scope failure is never retried. */
      if (res.ok || res.refused || /outside its scope/.test(res.error || '')) return res;

      return attempt(payload, validateFn, true).then(function (second) {
        if (second.ok) return second;
        if (second.refused) return second;
        /* Prefer the most specific explanation available. The server
           knows when the daily free quota is the cause; the first
           attempt may only have seen a generic rate limit. */
        var first = res.error || '';
        var again = second.error || '';
        var msg = /quota/i.test(again) ? again : (/quota/i.test(first) ? first : again);
        return { ok: false, error: msg };
      });
    });
  }

  /** Second opinion on one saved check. */
  function review(payload) {
    if (!payload || payload.kind !== 'check-review') {
      return Promise.resolve({ ok: false, error: 'Unsupported request.' });
    }
    return send(payload, validateReview);
  }

  /** One mission-health question, with the current check as context. */
  function ask(payload) {
    if (!payload || payload.kind !== 'crew-question' || !payload.question) {
      return Promise.resolve({ ok: false, error: 'Unsupported request.' });
    }
    return send(payload, validateAnswer);
  }

  /** Fixed scope statement shown in the UI, so the limits are not a secret. */
  var SCOPE = [
    'Answers mission-health questions about this crew member and the current check.',
    'Refuses anything off-topic: general knowledge, writing, coding, admin, or unrelated medical advice.',
    'Treats the crew note and the question as data, never as instructions.',
    'Never diagnoses, prescribes, gives a dose, or overrides the rule engine.',
    'Sends one question at a time and never includes earlier turns.',
    'Uses free OpenRouter models only, chosen per request with automatic fallback.',
    'Runs only when a local proxy holds the credential; the browser never sees a key.'
  ];

  return {
    ENDPOINT: ENDPOINT,
    SCOPE: SCOPE,
    probe: probe,
    status: statusNow,
    buildPayload: buildPayload,
    buildQuestion: buildQuestion,
    review: review,
    ask: ask
  };
})();
