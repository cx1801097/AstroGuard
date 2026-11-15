'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SITES,
  EONET_DAYS,
  POWER_PARAMETERS,
  parsePower,
  parseEonet,
  geometryPoint,
  haversineKm,
  powerUrl,
  eonetUrl,
  conditionNotes,
  eventNotes,
  compass
} = require('../js/nasa-live');

/** POWER marks "no observation" as -999, not null. */
const powerPayload = {
  properties: {
    parameter: {
      T2M: { '2026111200': 20.1, '2026111201': -999, '2026111202': 20.4 },
      PS: { '2026111200': 100.5, '2026111201': 100.6, '2026111202': 100.7 },
      RH2M: { '2026111200': 70, '2026111201': 71, '2026111202': 72 },
      T2MDEW: { '2026111200': 15.2, '2026111201': 15.4, '2026111202': 15.6 },
      WS2M: { '2026111200': 3, '2026111201': 3.1, '2026111202': 3.2 },
      WD2M: { '2026111200': 90, '2026111201': 91, '2026111202': 92 },
      PRECTOTCORR: { '2026111200': 0, '2026111201': 0.5, '2026111202': 1 }
    }
  }
};

const eonetPayload = {
  events: [
    {
      id: 'E1',
      title: 'Wildfire A',
      categories: [{ id: 'wildfires', title: 'Wildfires' }],
      geometry: [{ type: 'Point', date: '2026-11-14T10:00:00Z', coordinates: [-80.5, 28.6] }],
      sources: [{ url: 'https://example.org/a' }]
    },
    {
      id: 'E2',
      title: 'Typhoon B',
      categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
      geometry: [{ type: 'Polygon', date: '2026-11-15T00:00:00Z', coordinates: [[[100, 10], [110, 10], [105, 20], [100, 10]]] }]
    },
    {
      id: 'E3',
      title: 'Already closed',
      closed: '2026-11-01T00:00:00Z',
      categories: [{ id: 'wildfires', title: 'Wildfires' }],
      geometry: [{ type: 'Point', date: '2026-10-01T00:00:00Z', coordinates: [-80, 29] }]
    }
  ]
};

test('the POWER request names the selected point, community and window', () => {
  const url = new URL(powerUrl({ lat: 28.5729, lon: -80.649 }, '20261107', '20261115'));
  assert.equal(url.origin + url.pathname, 'https://power.larc.nasa.gov/api/temporal/hourly/point');
  assert.equal(url.searchParams.get('latitude'), '28.5729');
  assert.equal(url.searchParams.get('longitude'), '-80.649');
  assert.equal(url.searchParams.get('start'), '20261107');
  assert.equal(url.searchParams.get('end'), '20261115');
  assert.equal(url.searchParams.get('community'), 'RE');
  assert.equal(url.searchParams.get('format'), 'JSON');
  assert.ok(url.searchParams.get('parameters').split(',').includes('T2M'));
});

test('EONET is queried for open events only', () => {
  const url = new URL(eonetUrl({ days: 7 }));
  assert.equal(url.origin + url.pathname, 'https://eonet.gsfc.nasa.gov/api/v3/events');
  assert.equal(url.searchParams.get('status'), 'open');
  assert.equal(url.searchParams.get('days'), '7');
});

test('POWER -999 reads as no observation and each parameter is judged on its own', () => {
  const power = parsePower(powerPayload);
  assert.equal(power.observedAt, '2026-11-12T02:00:00Z');
  assert.equal(power.latest.T2M, 20.4);
  const missing = power.hours.find(hour => hour.key === '2026111201');
  assert.equal(missing.T2M, null, 'a -999 temperature is missing, not -999 degrees');
  assert.equal(missing.PS, 100.6, 'surface pressure is still usable in that hour');
  assert.equal(missing.T2MDEW, 15.4);
});

test('POWER totals ignore missing hours and keep the latest usable hour', () => {
  const power = parsePower(powerPayload);
  assert.equal(power.precipitation24h, 1.5);
  assert.equal(power.hours.length, 3);

  const empty = parsePower({ properties: { parameter: { T2M: { '2026111200': -999 } } } });
  assert.equal(empty.observedAt, null);
  assert.deepEqual(empty.hours, []);
  assert.equal(empty.precipitation24h, null);
});

test('only parameters POWER publishes hourly are requested', () => {
  const requested = powerUrl({ lat: 0, lon: 0 }, '20261107', '20261115');
  const asked = new URL(requested).searchParams.get('parameters').split(',');
  assert.deepEqual(asked, POWER_PARAMETERS);
  assert.ok(!asked.includes('ALLSKY_SFC_SW_DWN'), 'solar irradiance is not published hourly');
  assert.ok(asked.includes('T2MDEW'));
});

test('the EONET window keeps stale open events out of the list', () => {
  assert.ok(EONET_DAYS >= 30 && EONET_DAYS <= 180, 'a current-but-not-ephemeral window');
  const url = new URL(eonetUrl({ days: EONET_DAYS }));
  assert.equal(url.searchParams.get('days'), String(EONET_DAYS));
});

test('the POWER window covers the 24 hours that lead to the latest observation', () => {
  const parameter = { T2M: {}, PS: {} };
  const start = Date.UTC(2026, 10, 8, 0, 0, 0);
  for (let hour = 0; hour < 30; hour += 1) {
    const stamp = new Date(start + hour * 3600 * 1000);
    const key = stamp.toISOString().slice(0, 10).replace(/-/g, '') + String(stamp.getUTCHours()).padStart(2, '0');
    parameter.T2M[key] = 10 + hour / 10;
    parameter.PS[key] = 100 + hour / 100;
  }
  const power = parsePower({ properties: { parameter } });
  assert.equal(power.hours.length, 24);
  assert.equal(power.hours[power.hours.length - 1].key, '2026110905');
  assert.equal(power.hours[0].key, '2026110806');
});

test('EONET keeps open events, drops closed ones and orders them by distance', () => {
  const site = { lat: 28.5729, lon: -80.649 };
  const eonet = parseEonet(eonetPayload, site);
  assert.equal(eonet.events.length, 2);
  assert.equal(eonet.events[0].id, 'E1', 'the closest event leads');
  assert.ok(eonet.events[0].distanceKm > 14 && eonet.events[0].distanceKm < 16);
  assert.equal(eonet.events[0].sourceUrl, 'https://example.org/a');
  assert.equal(eonet.events[1].categoryId, 'severeStorms');
  assert.equal(eonet.counts.wildfires, 1);
  assert.equal(eonet.updatedAt, '2026-11-15T00:00:00Z');
  assert.equal(eonet.nearest.id, 'E1');
});

test('EONET polygons are reduced to their centre point', () => {
  const point = geometryPoint({ type: 'Polygon', coordinates: [[[100, 10], [110, 10], [105, 20], [100, 10]]] });
  assert.equal(point.lat, 12.5);
  assert.equal(point.lon, 103.75);
  assert.deepEqual(geometryPoint({ type: 'Point', coordinates: [-80.5, 28.6] }), { lat: 28.6, lon: -80.5 });
  assert.equal(geometryPoint(null), null);
});

test('great-circle distance matches an independent calculation', () => {
  const ksc = { lat: 28.5729, lon: -80.649 };
  const jsc = { lat: 29.559, lon: -95.09 };
  assert.ok(Math.abs(haversineKm(ksc, jsc) - 1406.9025) < 1);
  assert.ok(Math.abs(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.1949) < 0.5);
  assert.equal(haversineKm(null, jsc), null);
  assert.equal(haversineKm({ lat: 200, lon: 0 }, jsc), null);
});

test('operational notes describe ground support, never a crew health finding', () => {
  const notes = conditionNotes({
    latest: { T2M: 22, WS2M: 18, RH2M: 92 },
    precipitation24h: 14
  });
  const text = notes.join(' ');
  assert.match(text, /wind/i);
  assert.match(text, /precipitation/i);
  assert.doesNotMatch(text, /diagnos|blood oxygen|heart rate/i);
  assert.deepEqual(conditionNotes({ latest: { T2M: 20, WS2M: 3, RH2M: 50 }, precipitation24h: 0 }), []);
});

test('event notes explain each open category once', () => {
  const events = [
    { categoryId: 'wildfires', categoryTitle: 'Wildfires' },
    { categoryId: 'wildfires', categoryTitle: 'Wildfires' },
    { categoryId: 'severeStorms', categoryTitle: 'Severe Storms' }
  ];
  const notes = eventNotes(events);
  assert.equal(notes.length, 2);
  assert.match(notes[0], /Wildfires/);
  assert.match(notes[1], /Severe Storms/);
});

test('wind direction reads as a compass point', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(180), 'S');
  assert.equal(compass(270), 'W');
  assert.equal(compass(360), 'N');
});

test('every ground site has usable coordinates', () => {
  assert.ok(SITES.length >= 5);
  for (const site of SITES) {
    assert.ok(Number.isFinite(site.lat) && site.lat >= -90 && site.lat <= 90, site.id + ' latitude');
    assert.ok(Number.isFinite(site.lon) && site.lon >= -180 && site.lon <= 180, site.id + ' longitude');
    assert.ok(site.label && site.short && site.role);
  }
});
