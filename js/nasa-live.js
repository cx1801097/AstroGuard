/* ============================================================
   CREW CHECK — nasa-live.js
   Live ground context from NASA open APIs:
     NASA POWER — satellite-derived surface conditions for any point
     NASA EONET — natural events seen from space, posted as they happen
   Both are keyless and answer with CORS headers, so the hosted
   site can read them straight from the browser with no server.

   Two honest limits are built in:
     - POWER publishes with a 2-3 day lag, so the panel always shows
       the observation time instead of pretending to be current.
     - POWER marks "no observation" as -999, not null. Night-time
       solar irradiance is legitimately -999, so every parameter is
       filtered on its own.

   This is ground context for crew and ground support. It never
   feeds the health assessment and never replaces a
   mission-approved source.
   ============================================================ */
(function () {
  'use strict';

  const POWER_HOURLY = 'https://power.larc.nasa.gov/api/temporal/hourly/point';
  const EONET_EVENTS = 'https://eonet.gsfc.nasa.gov/api/v3/events';
  const MISSING = -999;
  const CACHE_KEY = 'crewcheck.nasa-live.v1';
  const SITE_KEY = 'crewcheck.nasa-live.site.v1';
  const REFRESH_MS = 5 * 60 * 1000;
  const TIMEOUT_MS = 12000;
  const STALE_MS = 10 * 60 * 1000;
  /* EONET still lists events open since 2002. A 90-day window keeps the
     list to what is genuinely current without dropping long events. */
  const EONET_DAYS = 90;
  /* ALLSKY_SFC_SW_DWN is not published hourly, so it is not requested. */
  const POWER_PARAMETERS = ['T2M', 'PS', 'RH2M', 'T2MDEW', 'WS2M', 'WD2M', 'PRECTOTCORR'];

  /* Ground sites a crew operation actually depends on. */
  const SITES = [
    { id: 'ksc', short: 'KSC', label: 'Kennedy Space Center', lat: 28.5729, lon: -80.649, role: 'Launch and recovery' },
    { id: 'ccafs', short: 'CCSFS', label: 'Cape Canaveral Space Force Station', lat: 28.3874, lon: -80.6048, role: 'Launch and recovery' },
    { id: 'jsc', short: 'JSC', label: 'Johnson Space Center', lat: 29.559, lon: -95.09, role: 'Mission control' },
    { id: 'vafb', short: 'VSFB', label: 'Vandenberg Space Force Base', lat: 34.742, lon: -120.5724, role: 'Launch and recovery' },
    { id: 'baikonur', short: 'Baikonur', label: 'Baikonur Cosmodrome', lat: 45.92, lon: 63.342, role: 'Launch and recovery' },
    { id: 'kourou', short: 'CSG', label: 'Guiana Space Centre', lat: 5.236, lon: -52.768, role: 'Launch and recovery' },
    { id: 'starbase', short: 'Starbase', label: 'Starbase', lat: 25.997, lon: -97.156, role: 'Launch and recovery' },
    { id: 'svalbard', short: 'Svalbard', label: 'Svalbard Satellite Station', lat: 78.2297, lon: 15.4072, role: 'Ground station' }
  ];

  /* What each EONET category means for a crew operation. */
  const EVENT_IMPACT = {
    wildfires: 'Smoke and particulates can degrade air quality for ground crews and a recovery site.',
    severeStorms: 'Storm weather can affect recovery operations, range safety and ground support.',
    volcanoes: 'Ash and aerosols can affect air quality and flight operations.',
    floods: 'Flooding can cut ground transport routes and support infrastructure.',
    dustAndHaze: 'Dust and haze degrade air quality for ground crews and a recovery site.',
    droughts: 'Drought raises wildfire and heat exposure risk for ground crews.',
    earthquakes: 'Earthquake activity can affect ground infrastructure and recovery routes.',
    snow: 'Snow and ice affect ground transport and landing-site availability.',
    seaIce: 'Sea ice conditions affect polar route planning.',
    landslides: 'Landslides can block ground transport and support routes.',
    marineEvents: 'Marine events can affect recovery operations at sea.',
    manmade: 'Man-made incidents can affect ground support and range operations.',
    exoticSpecies: 'Invasive species are a long-term environmental concern, not an immediate flight risk.'
  };

  /* ---- helpers ---- */

  function siteById(id) {
    return SITES.find(site => site.id === id) || null;
  }

  function clampLat(value) { return Math.max(-90, Math.min(90, value)); }
  function clampLon(value) { return Math.max(-180, Math.min(180, value)); }

  function isUsableLatitude(value) { return Number.isFinite(value) && value >= -90 && value <= 90; }
  function isUsableLongitude(value) { return Number.isFinite(value) && value >= -180 && value <= 180; }

  /** POWER hourly keys look like 2026111223. */
  function keyToMillis(key) {
    return Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), +key.slice(8, 10));
  }

  function keyToIso(key) {
    return key.slice(0, 4) + '-' + key.slice(4, 6) + '-' + key.slice(6, 8) +
      'T' + key.slice(8, 10) + ':00:00Z';
  }

  function isoToUtcStamp(iso) {
    if (!iso) return '—';
    return iso.slice(0, 10) + ' ' + iso.slice(11, 16) + ' UTC';
  }

  function compass(degrees) {
    if (!Number.isFinite(degrees)) return '';
    const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return points[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
  }

  function distanceText(km) {
    if (!Number.isFinite(km)) return '';
    return km < 1000 ? Math.round(km) + ' km away' : Math.round(km).toLocaleString('en-US') + ' km away';
  }

  /** Great-circle distance in kilometres. */
  function haversineKm(from, to) {
    if (!from || !to) return null;
    if (!isUsableLatitude(from.lat) || !isUsableLongitude(from.lon)) return null;
    if (!isUsableLatitude(to.lat) || !isUsableLongitude(to.lon)) return null;
    const radius = 6371;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(to.lat - from.lat);
    const dLon = toRad(to.lon - from.lon);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* ---- request builders ---- */

  function powerUrl(site, start, end, parameters) {
    const params = parameters || POWER_PARAMETERS;
    const query = new URLSearchParams({
      parameters: params.join(','),
      community: 'RE',
      longitude: String(site.lon),
      latitude: String(site.lat),
      start,
      end,
      format: 'JSON'
    });
    return POWER_HOURLY + '?' + query.toString();
  }

  function eonetUrl(options) {
    const query = new URLSearchParams({ status: 'open' });
    if (options && options.days) query.set('days', String(options.days));
    if (options && options.category) query.set('category', options.category);
    return EONET_EVENTS + '?' + query.toString();
  }

  /* ---- parsers ---- */

  /**
   * Normalise a POWER hourly payload.
   * Returns the latest usable hour, the 24 hours leading to it, and
   * the derived totals the console shows.
   */
  function parsePower(payload) {
    const parameter = (payload && payload.properties && payload.properties.parameter) || {};
    const keys = Object.keys(parameter.T2M || parameter.PS || {}).sort();
    const read = (id, key) => {
      const raw = parameter[id] ? parameter[id][key] : undefined;
      return typeof raw === 'number' && raw !== MISSING ? raw : null;
    };

    let latestKey = null;
    for (const key of keys) {
      if (read('T2M', key) !== null || read('PS', key) !== null) latestKey = key;
    }
    if (!latestKey) {
      return { observedAt: null, lagHours: null, hours: [], latest: {}, precipitation24h: null };
    }

    const latestMillis = keyToMillis(latestKey);
    const window = keys.filter(key => {
      const millis = keyToMillis(key);
      return millis <= latestMillis && millis > latestMillis - 24 * 3600 * 1000;
    });

    const hours = window.map(key => {
      const hour = { key, iso: keyToIso(key) };
      for (const id of Object.keys(parameter)) hour[id] = read(id, key);
      return hour;
    });

    const latest = {};
    for (const id of Object.keys(parameter)) latest[id] = read(id, latestKey);

    let precipitation24h = null;
    const rain = hours.map(hour => hour.PRECTOTCORR).filter(v => v !== null);
    if (rain.length) precipitation24h = rain.reduce((sum, value) => sum + value, 0);

    return {
      observedAt: keyToIso(latestKey),
      lagHours: Math.round((Date.now() - latestMillis) / 3600),
      hours,
      latest,
      precipitation24h
    };
  }

  /** Centroid of an EONET geometry, whatever shape it arrives in. */
  function geometryPoint(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    const coordinates = geometry.coordinates;
    if (geometry.type === 'Point') {
      const [lon, lat] = coordinates;
      return { lat, lon };
    }
    const ring = Array.isArray(coordinates[0]) ? coordinates[0] : coordinates;
    if (!Array.isArray(ring) || !ring.length) return null;
    let lat = 0;
    let lon = 0;
    for (const point of ring) {
      if (!Array.isArray(point)) continue;
      lon += point[0];
      lat += point[1];
    }
    return { lat: lat / ring.length, lon: lon / ring.length };
  }

  /**
   * Normalise an EONET payload into open events, nearest first.
   * Closed events are dropped: an event that has ended is not a
   * current condition.
   */
  function parseEonet(payload, origin) {
    const events = ((payload && payload.events) || [])
      .filter(event => !event.closed)
      .map(event => {
        const geometry = (event.geometry || [])[0] || {};
        const point = geometryPoint(geometry);
        const category = (event.categories || [])[0] || {};
        return {
          id: event.id,
          title: event.title || event.id,
          categoryId: category.id || 'other',
          categoryTitle: category.title || 'Other',
          date: geometry.date || null,
          lat: point ? point.lat : null,
          lon: point ? point.lon : null,
          distanceKm: point ? haversineKm(origin, point) : null,
          sourceUrl: (event.sources || [])[0] && (event.sources[0].url || null)
        };
      })
      .sort((a, b) => {
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });

    const counts = {};
    for (const event of events) counts[event.categoryId] = (counts[event.categoryId] || 0) + 1;

    const updatedAt = events.reduce((latest, event) => {
      if (!event.date) return latest;
      return !latest || event.date > latest ? event.date : latest;
    }, null);

    return { events, counts, updatedAt, nearest: events[0] || null };
  }

  /* ---- operational notes ---- */

  /**
   * Turn live conditions into short ground-support statements.
   * These describe operations, not a person's health.
   */
  function conditionNotes(power) {
    const notes = [];
    if (!power || !power.latest) return notes;
    const latest = power.latest;
    if (Number.isFinite(latest.WS2M) && latest.WS2M >= 15) {
      notes.push('Surface wind is ' + latest.WS2M.toFixed(1) + ' m/s — relevant to recovery and range operations.');
    }
    if (Number.isFinite(power.precipitation24h) && power.precipitation24h >= 10) {
      notes.push('Precipitation of ' + power.precipitation24h.toFixed(1) + ' mm in the last 24 h may affect ground transport.');
    }
    if (Number.isFinite(latest.T2M) && (latest.T2M >= 35 || latest.T2M <= -15)) {
      notes.push('Air temperature of ' + latest.T2M.toFixed(1) + ' °C is an exposure concern for ground crews.');
    }
    if (Number.isFinite(latest.RH2M) && latest.RH2M >= 90) {
      notes.push('Relative humidity of ' + Math.round(latest.RH2M) + ' % — high heat stress potential for ground crews.');
    }
    return notes;
  }

  function eventNotes(events, limit) {
    const notes = [];
    const seen = new Set();
    for (const event of events) {
      if (seen.has(event.categoryId)) continue;
      seen.add(event.categoryId);
      const impact = EVENT_IMPACT[event.categoryId];
      if (!impact) continue;
      notes.push(event.categoryTitle + ': ' + impact);
      if (notes.length >= (limit || 3)) break;
    }
    return notes;
  }

  /* ---- data access ---- */

  async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  function utcDayStamp(date) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  /**
   * Fetch both NASA feeds for one site.
   * Each feed fails on its own: a working EONET response must still
   * reach the console when POWER is unavailable.
   */
  async function load(site, options) {
    const now = new Date();
    const start = new Date(now.getTime() - 8 * 86400 * 1000);
    const result = { site, power: null, eonet: null, errors: {}, fetchedAt: now.toISOString() };
    const jobs = [
      { key: 'power', run: async () => parsePower(await fetchJson(powerUrl(site, utcDayStamp(start), utcDayStamp(now)))) },
      { key: 'eonet', run: async () => parseEonet(await fetchJson(eonetUrl({ days: (options && options.days) || EONET_DAYS })), site) }
    ];
    await Promise.all(jobs.map(async job => {
      try {
        result[job.key] = await job.run();
      } catch (error) {
        result.errors[job.key] = error && error.message ? error.message : 'request failed';
      }
    }));
    return result;
  }

  function readCache() {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      return cached && cached.site && cached.data ? cached : null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(site, data) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ site, data, savedAt: new Date().toISOString() }));
    } catch (error) {
      /* private mode or a full store: live data still works without the cache */
    }
  }

  function readSavedSite() {
    try {
      const raw = window.localStorage.getItem(SITE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeSavedSite(site) {
    try {
      window.localStorage.setItem(SITE_KEY, JSON.stringify(site));
    } catch (error) {
      /* the selection simply will not be remembered */
    }
  }

  /* ---- rendering ---- */

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function metricCard(label, value, unit, note) {
    const card = element('div', 'live-metric');
    card.append(element('span', 'live-metric-label', label));
    const strong = element('strong', 'live-metric-value', value);
    if (unit) strong.append(element('small', 'live-metric-unit', ' ' + unit));
    card.append(strong);
    card.append(element('span', 'live-metric-note', note || ''));
    return card;
  }

  function formatNumber(value, precision) {
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(precision);
  }

  /**
   * Paint the live panel. `data` is the result of load(); a cached
   * result is marked stale so the crew always knows how old it is.
   */
  function render(root, data, options) {
    const settings = options || {};
    const stale = Boolean(settings.stale);
    root.replaceChildren();

    if (!data) {
      root.append(element('p', 'muted', 'Live environment data is not available. Open the console with a network connection and refresh.'));
      return;
    }

    const power = data.power;
    const eonet = data.eonet;

    /* --- ground conditions --- */
    const conditions = element('section', 'card live-section');
    const head = element('div', 'live-section-head');
    head.append(element('h4', null, 'Ground conditions'));
    const observed = power && power.observedAt
      ? 'Latest analysis ' + isoToUtcStamp(power.observedAt)
      : 'No analysis available';
    head.append(element('span', 'pill', observed));
    conditions.append(head);
    conditions.append(element('p', 'muted',
      'NASA POWER · satellite analysis of the selected point. POWER publishes with a 2–3 day lag, so this is the latest published analysis, not the current hour.'));

    if (power && power.hours.length) {
      const grid = element('div', 'live-grid');
      const latest = power.latest;
      grid.append(metricCard('Air temperature', formatNumber(latest.T2M, 1), '°C'));
      grid.append(metricCard('Surface pressure', formatNumber(latest.PS, 1), 'kPa'));
      grid.append(metricCard('Relative humidity', formatNumber(latest.RH2M, 0), '%'));
      grid.append(metricCard('Dew point', formatNumber(latest.T2MDEW, 1), '°C'));
      grid.append(metricCard('Wind speed', formatNumber(latest.WS2M, 1), 'm/s',
        Number.isFinite(latest.WD2M) ? 'from ' + compass(latest.WD2M) : ''));
      grid.append(metricCard('Precipitation, last 24 h', formatNumber(power.precipitation24h, 1), 'mm'));
      conditions.append(grid);

      const charts = element('div', 'live-charts');
      const chart = window.CC_CHARTS && window.CC_CHARTS.sparkline;
      if (chart) {
        const temperature = element('div', 'live-chart');
        temperature.append(element('span', 'live-chart-label', 'Air temperature · last 24 h (°C)'));
        temperature.append(Object.assign(document.createElement('div'), { innerHTML: chart({
          points: power.hours.map((hour, index) => ({ day: index, value: hour.T2M })),
          color: '#39d0ff', label: 'Air temperature over the last 24 hours', width: 520, height: 92, showDots: true
        }) }));
        const pressure = element('div', 'live-chart');
        pressure.append(element('span', 'live-chart-label', 'Surface pressure · last 24 h (kPa)'));
        pressure.append(Object.assign(document.createElement('div'), { innerHTML: chart({
          points: power.hours.map((hour, index) => ({ day: index, value: hour.PS })),
          color: '#2ee6a8', label: 'Surface pressure over the last 24 hours', width: 520, height: 92, showDots: true
        }) }));
        charts.append(temperature, pressure);
        conditions.append(charts);
      }
    } else {
      conditions.append(element('p', 'muted', 'NASA POWER did not return an analysis for this point.'));
    }

    for (const note of conditionNotes(power)) conditions.append(element('p', 'live-note', note));
    root.append(conditions);

    /* --- active natural events --- */
    const events = element('section', 'card live-section');
    const eventHead = element('div', 'live-section-head');
    eventHead.append(element('h4', null, 'Active natural events'));
    const count = eonet ? eonet.events.length : 0;
    eventHead.append(element('span', 'pill', count + (count === 1 ? ' event open' : ' events open')));
    events.append(eventHead);
    events.append(element('p', 'muted',
      'NASA EONET · natural events that are still open and were observed from space in the last ' +
      EONET_DAYS + ' days. Posted as they are detected, so this list is current.'));

    if (eonet && eonet.events.length) {
      const list = element('ul', 'live-events');
      for (const event of eonet.events.slice(0, 12)) {
        const item = element('li', 'live-event');
        item.append(element('span', 'chip live-event-category', event.categoryTitle));
        item.append(element('strong', 'live-event-title', event.title));
        const details = [];
        if (event.date) details.push(event.date.slice(0, 10));
        if (Number.isFinite(event.distanceKm)) details.push(distanceText(event.distanceKm));
        if (details.length) item.append(element('span', 'muted live-event-meta', details.join(' · ')));
        if (event.sourceUrl) {
          const link = element('a', 'live-event-link', 'source');
          link.href = event.sourceUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.append(link);
        }
        list.append(item);
      }
      events.append(list);
      for (const note of eventNotes(eonet.events)) events.append(element('p', 'live-note', note));
    } else {
      events.append(element('p', 'muted', 'No natural events are currently open in EONET.'));
    }
    root.append(events);

    /* --- provenance --- */
    const provenance = element('p', 'muted live-provenance');
    provenance.append(document.createTextNode('Sources: '));
    const powerLink = element('a', null, 'NASA POWER');
    powerLink.href = 'https://power.larc.nasa.gov/';
    powerLink.target = '_blank';
    powerLink.rel = 'noopener noreferrer';
    const eonetLink = element('a', null, 'NASA EONET');
    eonetLink.href = 'https://eonet.gsfc.nasa.gov/';
    eonetLink.target = '_blank';
    eonetLink.rel = 'noopener noreferrer';
    provenance.append(powerLink, document.createTextNode(' and '), eonetLink);
    provenance.append(document.createTextNode('. Ground context only — not a mission-approved source and not a health input.'));
    root.append(provenance);

    if (stale) {
      root.append(element('p', 'live-stale',
        'Showing the last reading saved on this device' + (data.fetchedAt ? ' (' + isoToUtcStamp(data.fetchedAt) + ')' : '') +
        '. Live refresh did not succeed.'));
    }
  }

  /* ---- view wiring ---- */

  function boot() {
    const body = document.getElementById('nasaLiveBody');
    if (!body) return;

    const select = document.getElementById('nasaLiveSite');
    const custom = document.getElementById('nasaLiveCustom');
    const latInput = document.getElementById('nasaLiveLat');
    const lonInput = document.getElementById('nasaLiveLon');
    const refreshButton = document.getElementById('nasaLiveRefresh');
    const stamp = document.getElementById('nasaLiveStamp');
    const summary = document.getElementById('groundEnvOut');
    const tab = document.getElementById('nasaLiveTab');

    let site = siteById('ksc');
    let current = null;
    let inFlight = false;

    function paintStatus(text) { if (stamp) stamp.textContent = text; }

    function paintSummary() {
      if (!summary) return;
      const power = current && current.power;
      if (!power || !power.latest || !Number.isFinite(power.latest.T2M)) {
        summary.textContent = '—';
        return;
      }
      summary.textContent = site.short + ' · ' + power.latest.T2M.toFixed(1) + ' °C';
    }

    function currentSite() {
      if (!custom || custom.hidden) return site;
      const lat = Number(latInput && latInput.value);
      const lon = Number(lonInput && lonInput.value);
      if (!isUsableLatitude(lat) || !isUsableLongitude(lon)) return site;
      return { id: 'custom', short: 'Custom', label: 'Custom point', lat: clampLat(lat), lon: clampLon(lon), role: 'Selected point' };
    }

    async function refresh(force) {
      if (inFlight) return;
      inFlight = true;
      if (refreshButton) refreshButton.disabled = true;
      paintStatus('Fetching NASA data…');
      const target = currentSite();
      let data = null;
      try {
        data = await load(target);
      } catch (error) {
        data = { site: target, power: null, eonet: null, errors: { live: 'request failed' }, fetchedAt: new Date().toISOString() };
      }
      inFlight = false;
      if (refreshButton) refreshButton.disabled = false;

      const failed = Object.keys(data.errors || {}).length;
      if (!failed) {
        current = data;
        writeCache(target, data);
        paintStatus('Updated ' + isoToUtcStamp(data.fetchedAt));
      } else {
        const cached = readCache();
        if (cached) {
          current = cached.data;
          paintStatus('Live refresh failed — showing the saved reading from ' + isoToUtcStamp(cached.data.fetchedAt));
        } else {
          current = data;
          paintStatus('Live data is unavailable: ' + Object.values(data.errors).join('; '));
        }
      }
      render(body, current, { stale: Boolean(failed) });
      paintSummary();
    }

    function fillSites() {
      if (!select) return;
      const saved = readSavedSite();
      select.replaceChildren(...SITES.map(item => new Option(item.label + ' · ' + item.role, item.id)));
      const customOption = new Option('Custom coordinates', 'custom');
      select.append(customOption);
      const chosen = saved && (siteById(saved.id) || saved.id === 'custom') ? saved : siteById('ksc');
      select.value = chosen.id;
      if (chosen.id === 'custom' && custom) {
        custom.hidden = false;
        if (latInput) latInput.value = String(chosen.lat);
        if (lonInput) lonInput.value = String(chosen.lon);
      }
      site = siteById(select.value) || siteById('ksc');
    }

    if (select) {
      select.addEventListener('change', () => {
        const isCustom = select.value === 'custom';
        if (custom) custom.hidden = !isCustom;
        site = siteById(select.value) || siteById('ksc');
        if (!isCustom) writeSavedSite(site);
        refresh(true);
      });
    }
    if (refreshButton) refreshButton.addEventListener('click', () => refresh(true));
    if (tab) tab.addEventListener('click', () => {
      const stale = !current || (current.fetchedAt && Date.now() - Date.parse(current.fetchedAt) > STALE_MS);
      if (stale) refresh(true);
    });

    fillSites();
    window.CC_OPEN_NASA_LIVE = function () { refresh(true); };
    const cached = readCache();
    if (cached) {
      current = cached.data;
      render(body, current, { stale: true });
      paintSummary();
      paintStatus('Saved reading from ' + isoToUtcStamp(cached.data.fetchedAt) + ' — refreshing…');
    } else {
      render(body, null);
    }
    refresh(true);

    window.setInterval(() => {
      const pane = document.querySelector('[data-pane="environment"]');
      if (pane && pane.classList.contains('is-active') && document.visibilityState === 'visible') refresh(true);
    }, REFRESH_MS);
  }

  const api = {
    SITES,
    EVENT_IMPACT,
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
    load,
    render,
    boot,
    compass,
    distanceText,
    isoToUtcStamp
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.CC_NASA_LIVE = api;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    }
  }
}());
