(function () {
  'use strict';

  const local = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(location.origin);
  // The standard references ship inside the build, so they resolve on the hosted site too.
  const bundled = window.CC_ASTROGUARD_EVIDENCE || null;
  const requests = new Map();

  function lookup(severity) {
    if (bundled && Array.isArray(bundled[severity])) return Promise.resolve(bundled[severity]);
    if (!local) return Promise.resolve([]);
    return fetch('/api/astroguard-evidence?severity=' + encodeURIComponent(severity), {
      cache: 'no-store', signal: AbortSignal.timeout(5000)
    }).then(async response => {
      if (!response.ok) throw new Error('Evidence lookup failed');
      return (await response.json()).evidence;
    }).catch(() => []);
  }

  window.CC_RENDER_EVIDENCE = async function (container, severity) {
    if (!container || container.dataset.evidenceSeverity === severity) return;
    container.dataset.evidenceSeverity = severity;
    container.hidden = false;
    container.textContent = 'Looking up AstroGuard references…';
    if (!requests.has(severity)) requests.set(severity, lookup(severity));
    const evidence = await requests.get(severity);
    if (!container.isConnected || container.dataset.evidenceSeverity !== severity) return;
    if (!evidence.length) {
      container.textContent = 'No AstroGuard reference available for this check.';
      return;
    }
    const label = document.createElement('h4');
    label.textContent = 'AstroGuard evidence';
    const list = document.createElement('ul');
    for (const item of evidence) {
      const entry = document.createElement('li');
      entry.textContent = item.guidance + ' ';
      const source = document.createElement('a');
      source.href = item.url === 'https://standards.nasa.gov/node/238' ? item.url : 'https://standards.nasa.gov/node/238';
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = item.title + ', ' + item.version + ', p. ' + item.page + ' (' + item.requirement + ')';
      entry.append(source);
      list.append(entry);
    }
    container.replaceChildren(label, list);
  };
}());
