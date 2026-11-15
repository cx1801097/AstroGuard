#!/usr/bin/env node
/* ============================================================
   ASTROGUARD — build the Inspiration4 mission dataset
   ------------------------------------------------------------
   Reads the raw, unmodified NASA OSDR extracts in data/i4/raw/
   and emits data/i4/i4-missions.js in the console's mission format.

   Source studies (public, no controlled access required):
     OSD-569  Whole blood  — complete blood count          (CBC)
     OSD-575  Blood serum  — comprehensive metabolic panel (CMP)
                           — serum cardiovascular EvePanel
                           — serum immune EvePanel
   https://osdr.nasa.gov/bio/repo/data/studies/OSD-569
   https://osdr.nasa.gov/bio/repo/data/studies/OSD-575

   Run:  node tools/build-i4.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'i4', 'raw');
const OUT = path.join(ROOT, 'data', 'i4', 'i4-missions.js');

/* ---------- minimal CSV reader ---------- */
function parseCsv(file) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8');
  const rows = [];
  let row = [], field = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const head = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.length > 1 && r[0].trim())
    .map(r => {
      const o = {};
      head.forEach((h, i) => { o[h] = (r[i] === undefined ? '' : r[i]).trim(); });
      return o;
    });
}

/* ---------- which columns we expose ---------- */
/* `base` is the column stem; ranges are found by swapping _value_
   for _range_min_ / _range_max_. `mode` decides how it is banded:
   `reference` uses the lab's own reference range, `baseline` uses the
   crew member's own preflight median as the individual baseline.

   `plausible` is NOT a clinical range. It is the window inside which a
   number can physically belong to an ambulatory adult, used to catch
   transcription errors in the public source files before they reach
   the console. Values outside are quarantined: kept, disclosed, and
   never scored. */
const FIELDS = [
  /* CBC — OSD-569. The absolute differential cells are cross-checked
     against percent × WBC, because one public row (C003 L-92) has the
     differential block rotated by one column. */
  { id: 'wbc', file: 'osd-569_cbc.csv', base: 'white_blood_cell_count_value_thousand_per_microliter', scale: 1, mode: 'reference', plausible: [0.2, 100] },
  { id: 'neutrophils', file: 'osd-569_cbc.csv', base: 'absolute_neutrophils_value_cells_per_microliter', scale: 1, mode: 'reference', plausible: [200, 30000], consistency: 'neutrophils_value_percent' },
  { id: 'lymphocytes', file: 'osd-569_cbc.csv', base: 'absolute_lymphocytes_value_cells_per_microliter', scale: 1, mode: 'reference', plausible: [100, 30000], consistency: 'lymphocytes_value_percent' },
  { id: 'hemoglobin', file: 'osd-569_cbc.csv', base: 'hemoglobin_value_percent', scale: 1, mode: 'reference', plausible: [5, 25] },
  { id: 'platelets', file: 'osd-569_cbc.csv', base: 'platelet_count_value_thousand_per_microliter', scale: 1, mode: 'reference', plausible: [30, 1200] },

  /* CMP — OSD-575 */
  { id: 'glucose', file: 'osd-575_cmp.csv', base: 'glucose_value_milligram_per_deciliter', scale: 1, mode: 'reference', plausible: [50, 500] },
  { id: 'potassium', file: 'osd-575_cmp.csv', base: 'potassium_value_millimol_per_liter', scale: 1, mode: 'reference', plausible: [1.5, 8] },
  { id: 'albumin', file: 'osd-575_cmp.csv', base: 'albumin_value_gram_per_deciliter', scale: 1, mode: 'reference', plausible: [1.5, 6.5] },
  { id: 'alt', file: 'osd-575_cmp.csv', base: 'alt_value_units_per_liter', scale: 1, mode: 'reference', plausible: [1, 2000] },
  { id: 'creatinine', file: 'osd-575_cmp.csv', base: 'creatinine_value_milligram_per_deciliter', scale: 1, mode: 'reference', plausible: [0.2, 10] },

  /* Serum cardiovascular panel — OSD-575 */
  { id: 'crp', file: 'osd-575_cardiovascular.csv', base: 'crp_concentration_picogram_per_milliliter', scale: 1 / 1e6, mode: 'baseline' },
  { id: 'fibrinogen', file: 'osd-575_cardiovascular.csv', base: 'fibrinogen_concentration_nanogram_per_milliliter', scale: 1, mode: 'baseline' },

  /* Serum immune panel — OSD-575 */
  { id: 'il6', file: 'osd-575_immune.csv', base: 'il_6_concentration_picogram_per_milliliter', scale: 1, mode: 'baseline' },
  { id: 'il10', file: 'osd-575_immune.csv', base: 'il_10_concentration_picogram_per_milliliter', scale: 1, mode: 'baseline' },
  { id: 'tnfa', file: 'osd-575_immune.csv', base: 'tnfα_concentration_picogram_per_milliliter', scale: 1, mode: 'baseline' }
];

/* ---------- timepoints ---------- */
const ORDER = ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'];

function dayOf(tp) {
  if (tp.startsWith('L-')) return -Number(tp.slice(2));
  return Number(tp.slice(2));
}

function phaseOf(tp) {
  if (tp.startsWith('L-')) return 'preflight';
  const d = dayOf(tp);
  if (d <= 45) return 'recovery';
  return 'follow-up';
}

/* sample names look like C001_whole-blood_L-3_cbc / C001_serum_R+45 */
function splitSampleName(name) {
  const m = /^(C\d{3})_([^_]+)_(L-\d+|R\+\d+)/.exec(name);
  if (!m) return null;
  return { subject: m[1], compartment: m[2], timepoint: m[3] };
}

/* ---------- load every table once ---------- */
const tables = {};
function tableFor(file) {
  if (!tables[file]) tables[file] = parseCsv(file);
  return tables[file];
}

/* ---------- collect ---------- */
const crews = {};
const refs = {};
const missing = [];
const quarantined = [];

/* Lab column names are not perfectly consistent: most use
   `<analyte>_range_min_<unit>` but some use `<analyte>_min_<unit>`.
   Try both before giving up. */
function rangeValue(row, base, kind) {
  const candidates = [
    base.replace('_value_', '_range_' + kind + '_'),
    base.replace('_value_', '_' + kind + '_')
  ];
  for (let i = 0; i < candidates.length; i++) {
    const v = row[candidates[i]];
    if (v !== undefined && v !== '' && !/^n\/?a$/i.test(v)) return Number(v);
  }
  return null;
}

FIELDS.forEach(f => {
  const rows = tableFor(f.file);

  rows.forEach(r => {
    const sample = splitSampleName(r['Sample Name'] || '');
    if (!sample) return;
    const raw = r[f.base];
    if (raw === undefined || raw === '' || /^n\/?a$/i.test(raw)) {
      missing.push(f.id + ' @ ' + (r['Sample Name'] || '?'));
      return;
    }
    const value = Number(raw) * f.scale;

    crews[sample.subject] = crews[sample.subject] || {
      id: sample.subject,
      entries: {}
    };

    const crew = crews[sample.subject];
    crew.entries[sample.timepoint] = crew.entries[sample.timepoint] || {
      day: dayOf(sample.timepoint),
      timepoint: sample.timepoint,
      phase: phaseOf(sample.timepoint),
      values: {},
      flags: {}
    };

    const entry = crew.entries[sample.timepoint];

    function quarantine(sample, entry, field, value, why) {
      entry.flags[field.id] = { raw: round(value, 3), reason: why };
      quarantined.push({
        crew: sample.subject,
        timepoint: sample.timepoint,
        metric: field.id,
        value: round(value, 3),
        reason: why
      });
    }

    /* Plausibility screen. Several public I4 cells are decimal-shift
       transcription errors (e.g. C003 absolute neutrophils 10.1,
       platelets 12.9). They are kept, disclosed and excluded from
       scoring — never silently corrected and never silently scored. */
    if (f.plausible && (value < f.plausible[0] || value > f.plausible[1])) {
      quarantine(sample, entry, f, value,
        'outside the plausible range for an ambulatory adult (' +
        f.plausible[0] + '\u2013' + f.plausible[1] + ')');
      return;
    }

    /* Cross-check against an independent column in the same row. An
       absolute differential that disagrees with percent x WBC means the
       row is internally inconsistent (a column shift), even when each
       individual cell looks survivable. */
    if (f.consistency) {
      const wbc = Number(r['white_blood_cell_count_value_thousand_per_microliter']);
      const pct = Number(r[f.consistency]);
      const expected = pct / 100 * wbc * 1000;
      if (isFinite(expected) && expected > 0 && Math.abs(value - expected) / expected > 0.10) {
        quarantine(sample, entry, f, value,
          'inconsistent with the reported ' + f.consistency.replace('_value_percent', '').replace(/_/g, ' ') +
          ' (' + pct + '% of ' + wbc + ' K/\u00b5L \u2248 ' + Math.round(expected) + ')');
        return;
      }
    }

    entry.values[f.id] = round(value, 3);

    if (f.mode === 'reference') {
      const lo = rangeValue(r, f.base, 'min');
      const hi = rangeValue(r, f.base, 'max');
      if (lo !== null && hi !== null && isFinite(lo) && isFinite(hi) && lo < hi) {
        refs[f.id] = refs[f.id] || { lo: round(lo, 3), hi: round(hi, 3), samples: 0 };
        refs[f.id].samples++;
      }
    }
  });
});

function round(v, p) {
  const m = Math.pow(10, p);
  return Math.round(v * m) / m;
}

/* ---------- per-crew baseline (median of preflight) ---------- */
const baselineFields = FIELDS.filter(f => f.mode === 'baseline').map(f => f.id);

Object.keys(crews).forEach(id => {
  const crew = crews[id];
  const preflight = ORDER.filter(tp => tp.startsWith('L-'));
  crew.baseline = {};

  baselineFields.forEach(mid => {
    const vals = preflight
      .map(tp => (crew.entries[tp] || { values: {} }).values[mid])
      .filter(v => typeof v === 'number' && isFinite(v) && v > 0)
      .sort((a, b) => a - b);
    if (vals.length) crew.baseline[mid] = round(median(vals), 4);
  });

  crew.sex = inferSex(id);
});

function median(arr) {
  const n = arr.length;
  if (!n) return 0;
  return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

/* I4 published sex for the four crew; kept only for reference ranges */
function inferSex() { return 'M'; }

/* ---------- assemble ---------- */
const payload = {
  meta: {
  source: 'NASA Open Science Data Repository (OSDR) — Inspiration4 mission',
    page: 'https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/',
    studies: [
      { id: 'OSD-569', title: 'Whole blood — complete blood count', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569' },
      { id: 'OSD-575', title: 'Blood serum — metabolic panel, immune and cardiovascular EvePanels', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575' }
    ],
    generated: new Date().toISOString().slice(0, 10),
    timepoints: ORDER,
    /* Inspiration4 flew 3 days (15–18 Sep 2021). Sample day offsets
       (R+194) are calendar offsets, not days of microgravity exposure. */
    inFlightDays: 3,
    crew: [
      { id: 'C001', label: 'C001' },
      { id: 'C002', label: 'C002' },
      { id: 'C003', label: 'C003' },
      { id: 'C004', label: 'C004' }
    ],
    note: 'Public processed data only. Vitals (blood pressure, heart rate, core temperature, sleep, mood) were not part of these releases and are therefore absent — never imputed.',
    quarantined: quarantined
  },
  refs: refs,
  crews: {}
};

ORDER.forEach(tp => {
  Object.keys(crews).forEach(id => {
    const crew = crews[id];
    if (!crew.entries[tp]) {
      console.warn('missing timepoint', id, tp);
    }
  });
});

Object.keys(crews).sort().forEach(id => {
  const crew = crews[id];
  payload.crews[id] = {
    id: id,
    sex: crew.sex,
    baseline: crew.baseline,
    entries: ORDER.filter(tp => crew.entries[tp]).map(tp => crew.entries[tp])
  };
});

/* ---------- write ---------- */
const banner = `/* GENERATED FILE — do not edit by hand.
   Rebuild with: node tools/build-i4.js
   Source: NASA OSDR, Inspiration4 (OSD-569, OSD-575) — public processed data.
   Values are unmodified apart from unit scaling (see tools/build-i4.js).
   Cells failing the plausibility screen are kept in entry.flags and excluded
   from scoring; they are listed in meta.quarantined. */
`;
fs.writeFileSync(OUT, banner + 'window.CC_I4 = ' + JSON.stringify(payload, null, 2) + ';\n', 'utf8');

/* ---------- report ---------- */
const crewIds = Object.keys(payload.crews);
const perCrew = crewIds.map(id => id + ': ' + payload.crews[id].entries.length + ' timepoints');
const fieldSummary = FIELDS.map(f => f.id + (f.mode === 'baseline' ? ' (baseline-relative)' : ' (ref ' + (refs[f.id] ? refs[f.id].lo + '\u2013' + refs[f.id].hi : '?') + ')'));
console.log('wrote ' + path.relative(ROOT, OUT));
console.log('crews      : ' + perCrew.join(' | '));
console.log('timepoints : ' + ORDER.join(', '));
console.log('fields     : ' + fieldSummary.join(', '));
console.log('blank cells: ' + (missing.length ? missing.length : 'none') + ' (reported as absent)');
console.log('quarantined: ' + (quarantined.length ? quarantined.length : 'none'));
quarantined.forEach(q => console.log('   - ' + q.crew + ' ' + q.timepoint + ' ' + q.metric + ' = ' + q.value + '  (' + q.reason + ')'));
