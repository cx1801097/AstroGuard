/* ============================================================
   CREW CHECK — storage.js
   Mission log persistence. localStorage for the running console,
   plain-JSON export/import so a crew member (or a teammate) can
   carry the record off the device. No network, ever.
   ============================================================ */
window.CC_STORAGE = (function () {
  'use strict';

  var KEY = 'crewcheck.mission.v1';
  var VERSION = 1;

  function emptyMission() {
    return {
      version: VERSION,
      name: 'ARTEMIS VII',
      crew: 'CDR-1',
      flightDay: 1,
      entries: []
    };
  }

  function safeParse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return emptyMission();
    var m = emptyMission();
    m.name = typeof raw.name === 'string' ? raw.name : m.name;
    m.crew = typeof raw.crew === 'string' ? raw.crew : m.crew;
    m.flightDay = typeof raw.flightDay === 'number' ? raw.flightDay : m.flightDay;
    if (raw.details && typeof raw.details === 'object' && !Array.isArray(raw.details)) m.details = raw.details;
    m.entries = Array.isArray(raw.entries) ? raw.entries.filter(validEntry).map(normalizeEntry) : [];
    m.version = VERSION;
    return m;
  }

  function validEntry(e) {
    return e && typeof e === 'object' && typeof e.day === 'number' && e.values && typeof e.values === 'object';
  }

  function normalizeEntry(e) {
    return {
      day: e.day,
      crew: typeof e.crew === 'string' ? e.crew : '',
      source: window.CC_DETECTION.provenance(e.source),
      activity: e.activity === 'rest' || e.activity === 'exercise' ? e.activity : 'unknown',
      quality: e.quality && typeof e.quality === 'object' ? e.quality : {},
      values: e.values,
      symptoms: Array.isArray(e.symptoms) ? e.symptoms : [],
      note: typeof e.note === 'string' ? e.note : '',
      savedAt: e.savedAt || null,
      wearable: e.wearable && typeof e.wearable === 'object' ? e.wearable : null
    };
  }

  function keyFor(scope) { return scope ? KEY + '.' + scope : KEY; }

  function listMissions() {
    try {
      var prefix = keyFor('mission-');
      return Object.keys(window.localStorage).filter(function (key) {
        return key.startsWith(prefix);
      }).map(function (key) {
        var scope = key.slice(KEY.length + 1);
        return { scope: scope, mission: load(scope) };
      }).filter(function (entry) { return entry.mission; });
    } catch (e) {
      return [];
    }
  }

  function load(scope) {
    var text = null;
    try { text = window.localStorage.getItem(keyFor(scope)); } catch (e) { /* private mode / file:// */ }
    if (!text) return null;
    return migrate(safeParse(text));
  }

  function save(mission, scope) {
    try {
      window.localStorage.setItem(keyFor(scope), JSON.stringify(mission));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function toJSON(mission) {
    return JSON.stringify(migrate(mission), null, 2);
  }

  function fromJSON(text) {
    var parsed = safeParse(text);
    if (!parsed) throw new Error('Not valid JSON.');
    if (!parsed.entries) throw new Error('Missing "entries" array.');
    return migrate(parsed);
  }

  /** Trigger a file download without any network round-trip. */
  function download(mission) {
    var text = toJSON(mission);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'crewcheck-mission-fd' + mission.flightDay + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  return {
    KEY: KEY,
    load: load,
    listMissions: listMissions,
    save: save,
    clear: clear,
    emptyMission: emptyMission,
    toJSON: toJSON,
    fromJSON: fromJSON,
    download: download
  };
})();
