/* ============================================================
   CREW CHECK — storage.js
   The crew member's own record: identity, personal preflight
   baseline, and every check they have run.

   Storage is localStorage on the device that ran the check, plus
   a plain-JSON export/import so a record can be carried between
   devices or handed to the ground. Nothing is transmitted.

   v2 is deliberately NOT a migration of v1. v1 held a generated
   demo mission; importing it would put invented readings into a
   real crew member's record, so it is ignored. If a v1 record is
   still on the device it is left untouched.
   ============================================================ */
window.CC_STORAGE = (function () {
  'use strict';

  var KEY = 'crewcheck.record.v2';
  var VERSION = 2;
  var LEGACY_KEY = 'crewcheck.mission.v1';

  /* Everything in here differs from flight to flight, so it is stored
     with the record and editable from the Mission tab. */
  var DEFAULT_PROFILE = {
    destination: 'low-earth-orbit',
    plannedDays: 180,
    crewSize: 4,
    commDelaySeconds: 0,
    sleepTargetHours: 7.5,
    instruments: { vitals: true, daily: true, exposure: true, labs: true }
  };

  function cloneProfile(p) {
    var out = {};
    Object.keys(DEFAULT_PROFILE).forEach(function (k) {
      out[k] = DEFAULT_PROFILE[k];
    });
    if (p && typeof p === 'object') {
      if (typeof p.destination === 'string') out.destination = p.destination;
      if (isFiniteNum(p.plannedDays)) out.plannedDays = clamp(p.plannedDays, 1, 3000);
      if (isFiniteNum(p.crewSize)) out.crewSize = clamp(Math.round(p.crewSize), 1, 20);
      if (isFiniteNum(p.commDelaySeconds)) out.commDelaySeconds = clamp(p.commDelaySeconds, 0, 3600);
      if (isFiniteNum(p.sleepTargetHours)) out.sleepTargetHours = clamp(p.sleepTargetHours, 4, 10);
      if (p.instruments && typeof p.instruments === 'object') {
        ['vitals', 'daily', 'exposure', 'labs'].forEach(function (k) {
          if (typeof p.instruments[k] === 'boolean') out.instruments[k] = p.instruments[k];
        });
      }
    }
    return out;
  }

  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function emptyRecord() {
    return {
      version: VERSION,
      crewId: '',
      mission: '',
      missionStart: null,
      missionProfile: cloneProfile(null),
      baseline: null,
      baselineMeta: null,
      entries: []
    };
  }

  function hasRecord(record) {
    return !!record && typeof record.crewId === 'string' && record.crewId.trim().length > 0;
  }

  function safeParse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function newId() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /* Keep only finite numbers; a blank field must stay blank, never 0. */
  function cleanValues(values) {
    var out = {};
    if (!values || typeof values !== 'object') return out;
    Object.keys(values).forEach(function (k) {
      if (isNum(values[k])) out[k] = values[k];
    });
    return out;
  }

  function validEntry(e) {
    return e && typeof e === 'object' && typeof e.at === 'string' && e.values && typeof e.values === 'object';
  }

  function normalizeEntry(e) {
    return {
      id: typeof e.id === 'string' && e.id ? e.id : newId(),
      at: e.at,
      day: isNum(e.day) ? e.day : null,
      phase: e.phase === 'preflight' ? 'preflight' : 'flight',
      values: cleanValues(e.values),
      symptoms: Array.isArray(e.symptoms) ? e.symptoms.filter(function (s) { return typeof s === 'string'; }) : [],
      note: typeof e.note === 'string' ? e.note.slice(0, 400) : '',
      confirm: e.confirm && typeof e.confirm === 'object' ? e.confirm : {},
      pending: Array.isArray(e.pending) ? e.pending.filter(function (s) { return typeof s === 'string'; }) : [],
      savedAt: typeof e.savedAt === 'string' ? e.savedAt : e.at
    };
  }

  function migrate(raw) {
    var r = emptyRecord();
    if (!raw || typeof raw !== 'object') return r;

    r.crewId = typeof raw.crewId === 'string' ? raw.crewId.trim().slice(0, 32) : '';
    r.mission = typeof raw.mission === 'string' ? raw.mission.trim().slice(0, 48) : '';
    r.missionStart = typeof raw.missionStart === 'string' && !isNaN(Date.parse(raw.missionStart))
      ? new Date(raw.missionStart).toISOString()
      : null;
    r.missionProfile = cloneProfile(raw.missionProfile);

    if (raw.baseline && typeof raw.baseline === 'object') {
      var base = cleanValues(raw.baseline);
      r.baseline = Object.keys(base).length ? base : null;
    }
    if (raw.baselineMeta && typeof raw.baselineMeta === 'object') {
      r.baselineMeta = {
        source: typeof raw.baselineMeta.source === 'string' ? raw.baselineMeta.source : 'manual',
        setAt: typeof raw.baselineMeta.setAt === 'string' ? raw.baselineMeta.setAt : null,
        from: isNum(raw.baselineMeta.from) ? raw.baselineMeta.from : null
      };
    }

    r.entries = Array.isArray(raw.entries)
      ? raw.entries.filter(validEntry).map(normalizeEntry)
      : [];
    r.entries.sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
    r.version = VERSION;
    return r;
  }

  function load() {
    var text = null;
    try { text = window.localStorage.getItem(KEY); } catch (e) { /* private mode / file:// */ }
    if (!text) return null;
    return migrate(safeParse(text));
  }

  function save(record) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(migrate(record)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  /** True when an older, generated demo record is still on the device. */
  function hasLegacy() {
    try { return !!window.localStorage.getItem(LEGACY_KEY); } catch (e) { return false; }
  }

  function toJSON(record) {
    return JSON.stringify(migrate(record), null, 2);
  }

  function fromJSON(text) {
    var parsed = safeParse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Not valid JSON.');
    if (!Array.isArray(parsed.entries)) throw new Error('Missing an "entries" array.');
    if (!parsed.crewId) throw new Error('Missing a "crewId" — this is not a crew record.');
    return migrate(parsed);
  }

  /** Trigger a file download without any network round-trip. */
  function download(record) {
    var text = toJSON(record);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var who = (record.crewId || 'crew').replace(/[^A-Za-z0-9_-]+/g, '-');
    a.href = url;
    a.download = 'crewcheck-' + who + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /** Whole days from mission start to an instant; negative before launch. */
  function dayOffset(missionStart, at) {
    if (!missionStart) return null;
    var t0 = Date.parse(missionStart);
    var t1 = Date.parse(at);
    if (isNaN(t0) || isNaN(t1)) return null;
    return Math.floor((t1 - t0) / 86400000);
  }

  /**
   * Flight day label for an entry.
   * Launch day counts as flight day 1. Anything before launch is a
   * preflight check and is labelled by how many days before launch it
   * was taken.
   */
  function dayLabel(entry, missionStart) {
    if (entry.phase === 'preflight') {
      var off = dayOffset(missionStart, entry.at);
      if (off === null) return 'Before launch';
      if (off < 0) {
        var n = Math.abs(off);
        return 'Launch minus ' + n + (n === 1 ? ' day' : ' days');
      }
      return 'Before launch';
    }
    if (typeof entry.day === 'number') return 'Flight day ' + entry.day;
    return 'Flight day \u2014';
  }

  return {
    KEY: KEY,
    VERSION: VERSION,
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    cloneProfile: cloneProfile,
    load: load,
    save: save,
    clear: clear,
    hasLegacy: hasLegacy,
    emptyRecord: emptyRecord,
    hasRecord: hasRecord,
    newId: newId,
    dayOffset: dayOffset,
    dayLabel: dayLabel,
    toJSON: toJSON,
    fromJSON: fromJSON,
    download: download
  };
})();
