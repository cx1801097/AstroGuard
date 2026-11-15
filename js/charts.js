/* ============================================================
   CREW CHECK — charts.js
   Hand-rolled SVG charts. No Chart.js / D3 / CDN, because the
   console has to render with zero network access.
   ============================================================ */
window.CC_CHARTS = (function () {
  'use strict';

  var DASH = '4 4';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function range(points, band) {
    var vals = points.map(function (p) { return p.value; });
    if (band) { vals.push(band.lo, band.hi); }
    var lo = Math.min.apply(null, vals);
    var hi = Math.max.apply(null, vals);
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-6) { hi = lo + 1; }
    var pad = (hi - lo) * 0.12;
    return { lo: lo - pad, hi: hi + pad };
  }

  /**
   * Sparkline: one metric over the mission timeline.
   * opts: { points:[{day,value}], band:{lo,hi}|null, color, unit,
   *         width, height, showDots }
   */
  function sparkline(opts) {
    var W = opts.width || 300;
    var H = opts.height || 76;
    var pad = { t: 8, r: 8, b: 8, l: 8 };
    var pts = (opts.points || []).filter(function (p) { return p.value !== null; });
    var color = opts.color || '#39d0ff';
    var band = opts.band || null;

    if (!pts.length) {
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart chart-empty" role="img" aria-label="no data">' +
        '<line x1="8" y1="' + (H / 2) + '" x2="' + (W - 8) + '" y2="' + (H / 2) + '" stroke="#1c2c42" stroke-dasharray="' + DASH + '"/>' +
        '<text x="' + (W / 2) + '" y="' + (H / 2 - 8) + '" text-anchor="middle" class="chart-note">no data</text>' +
        '</svg>';
    }

    var r = range(pts, band);
    var days = pts.map(function (p) { return p.day; });
    var dMin = Math.min.apply(null, days);
    var dMax = Math.max.apply(null, days);
    if (dMax === dMin) { dMin -= 0.5; dMax += 0.5; }

    function x(day) { return pad.l + (day - dMin) / (dMax - dMin) * (W - pad.l - pad.r); }
    function y(v) { return H - pad.b - (v - r.lo) / (r.hi - r.lo) * (H - pad.t - pad.b); }

    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(opts.label || 'trend') + '">'];

    /* normal-range shading */
    if (band) {
      var yTop = Math.max(pad.t, Math.min(y(band.hi), H - pad.b));
      var yBot = Math.max(pad.t, Math.min(y(band.lo), H - pad.b));
      svg.push('<rect x="' + pad.l + '" y="' + yTop.toFixed(1) + '" width="' + (W - pad.l - pad.r) +
        '" height="' + Math.max(1, yBot - yTop).toFixed(1) + '" fill="rgba(46,230,168,0.07)"/>');
      svg.push('<line x1="' + pad.l + '" y1="' + yTop.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + yTop.toFixed(1) + '" stroke="rgba(46,230,168,0.22)" stroke-dasharray="' + DASH + '"/>');
      svg.push('<line x1="' + pad.l + '" y1="' + yBot.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + yBot.toFixed(1) + '" stroke="rgba(46,230,168,0.22)" stroke-dasharray="' + DASH + '"/>');
    }

    var path = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + x(p.day).toFixed(1) + ' ' + y(p.value).toFixed(1);
    }).join(' ');

    var area = path + ' L' + x(pts[pts.length - 1].day).toFixed(1) + ' ' + (H - pad.b) +
      ' L' + x(pts[0].day).toFixed(1) + ' ' + (H - pad.b) + ' Z';

    var gid = 'g' + Math.random().toString(36).slice(2, 8);
    svg.push('<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.28"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>');
    svg.push('<path d="' + area + '" fill="url(#' + gid + ')"/>');
    svg.push('<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>');

    var last = pts[pts.length - 1];
    svg.push('<circle cx="' + x(last.day).toFixed(1) + '" cy="' + y(last.value).toFixed(1) + '" r="2.6" fill="' + color + '"/>');

    if (opts.showDots) {
      pts.forEach(function (p) {
        svg.push('<circle cx="' + x(p.day).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="1.4" fill="' + color + '" opacity="0.55"/>');
      });
    }

    svg.push('</svg>');
    return svg.join('');
  }

  /**
   * Readiness over the mission with GO / CAUTION / NO-GO threshold lines.
   * opts: { points:[{day,value}], width, height }
   */
  function readinessChart(opts) {
    var W = opts.width || 900;
    var H = opts.height || 190;
    var pad = { t: 14, r: 14, b: 22, l: 34 };
    var pts = (opts.points || []).filter(function (p) { return typeof p.value === 'number'; });

    if (pts.length < 2) {
      return '<div class="chart-empty-state">Log at least two check-ins to plot the readiness trend.</div>';
    }

    var dMin = pts[0].day;
    var dMax = pts[pts.length - 1].day;
    if (dMax === dMin) dMax = dMin + 1;

    function x(day) { return pad.l + (day - dMin) / (dMax - dMin) * (W - pad.l - pad.r); }
    function y(v) { return H - pad.b - (v / 100) * (H - pad.t - pad.b); }

    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart chart-wide" role="img" aria-label="readiness trend">'];

    /* zone bands */
    svg.push('<rect x="' + pad.l + '" y="' + y(100).toFixed(1) + '" width="' + (W - pad.l - pad.r) + '" height="' + (y(75) - y(100)).toFixed(1) + '" fill="rgba(46,230,168,0.06)"/>');
    svg.push('<rect x="' + pad.l + '" y="' + y(75).toFixed(1) + '" width="' + (W - pad.l - pad.r) + '" height="' + (y(50) - y(75)).toFixed(1) + '" fill="rgba(255,194,75,0.07)"/>');
    svg.push('<rect x="' + pad.l + '" y="' + y(50).toFixed(1) + '" width="' + (W - pad.l - pad.r) + '" height="' + (y(0) - y(50)).toFixed(1) + '" fill="rgba(255,84,112,0.08)"/>');

    [0, 25, 50, 75, 100].forEach(function (v) {
      svg.push('<line x1="' + pad.l + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + y(v).toFixed(1) +
        '" stroke="' + (v === 75 || v === 50 ? 'rgba(125,147,173,0.35)' : 'rgba(28,44,66,0.9)') + '" stroke-width="1"' + (v === 75 || v === 50 ? ' stroke-dasharray="4 4"' : '') + '/>');
      svg.push('<text x="' + (pad.l - 8) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end" class="chart-axis">' + v + '</text>');
    });

    /* day labels */
    svg.push('<text x="' + pad.l + '" y="' + (H - 6) + '" class="chart-axis">FD ' + dMin + '</text>');
    svg.push('<text x="' + (W - pad.r) + '" y="' + (H - 6) + '" text-anchor="end" class="chart-axis">FD ' + dMax + '</text>');

    var path = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + x(p.day).toFixed(1) + ' ' + y(p.value).toFixed(1);
    }).join(' ');
    var area = path + ' L' + x(pts[pts.length - 1].day).toFixed(1) + ' ' + (H - pad.b) + ' L' + x(pts[0].day).toFixed(1) + ' ' + (H - pad.b) + ' Z';

    svg.push('<path d="' + area + '" fill="rgba(57,208,255,0.12)"/>');
    svg.push('<path d="' + path + '" fill="none" stroke="#39d0ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');

    pts.forEach(function (p) {
      var c = p.value >= 75 ? '#2ee6a8' : p.value >= 50 ? '#ffc24b' : '#ff5470';
      svg.push('<circle cx="' + x(p.day).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="2.8" fill="' + c + '"/>');
    });

    svg.push('</svg>');
    return svg.join('');
  }

  return {
    sparkline: sparkline,
    readinessChart: readinessChart
  };
})();
