const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('index.html');
const homeCss = read('css/home.css');
const portalJs = read('js/portal.js');

const cardCopy = [
  ['Health Monitoring System', 'Explore the dashboard with a simulated mission.', 'simulator'],
  ['I4 mission playback', 'Review Inspiration4 by mission day.', 'replay'],
  ['New mission', 'Open the crew-operated mission console.', 'missionConsole'],
  ['Connect wearable device', 'Connect live over Bluetooth or import readings from your watch app.', 'wearable']
];

test('the landing page offers the same four entries as before', () => {
  for (const [title, copy, target] of cardCopy) {
    assert.ok(html.includes(`<strong>${title}</strong>`), `missing card title: ${title}`);
    assert.ok(html.includes(copy), `missing card copy: ${copy}`);
    assert.ok(
      new RegExp(`data-open="${target}"[^>]*>[^]*?${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(html),
      `card "${title}" does not open ${target}`
    );
  }
});

test('every landing entry points at a view the portal can show', () => {
  const views = ['home', 'missionConsole', 'mission', 'wearable', 'simulator', 'replay', 'dashboard', 'missionDemo'];
  for (const match of html.matchAll(/data-open="([a-zA-Z]+)"/g)) {
    assert.ok(views.includes(match[1]), `unknown portal view: ${match[1]}`);
  }
  assert.ok(portalJs.includes("'home', 'missionConsole', 'mission', 'wearable', 'missionDemo'"));
});

test('the primary navigation reaches every section of the app', () => {
  const nav = html.match(/<nav class="site-nav-links"[\s\S]*?<\/nav>/)[0];
  const labels = [...nav.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(labels, ['Home', 'Mission', 'Health', 'Devices', 'Playback']);
  for (const target of ['home', 'missionConsole', 'simulator', 'wearable', 'replay']) {
    assert.ok(nav.includes(`data-open="${target}"`), `navigation is missing ${target}`);
  }
});

test('the landing page stays offline: no remote asset or script', () => {
  const landing = html.match(/<header class="site-nav"[\s\S]*?<\/header>/)[0]
    + html.match(/<section id="homeView"[\s\S]*?<\/section>\s*<\/section>/)[0];
  assert.equal(landing.match(/https?:\/\//g), null, 'the landing markup must not load remote resources');
  assert.ok(homeCss.includes('url("../assets/hero-space.jpg")'));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'hero-space.jpg')), 'the hero image is missing');
  assert.ok(html.includes('<link rel="stylesheet" href="css/home.css">'));
});

test('the landing page carries the AstroGuard name, not the old one', () => {
  const landing = html.match(/<header class="site-nav"[\s\S]*?<\/header>/)[0]
    + html.match(/<section id="homeView"[\s\S]*?<\/section>\s*<\/section>/)[0];
  assert.ok(landing.includes('ASTROGUARD'), 'the landing page must show ASTROGUARD');
  assert.equal(landing.includes('CREW CHECK'), false, 'the old name must be gone from the landing page');
  assert.ok(html.includes('<title>ASTROGUARD'), 'the page title must be ASTROGUARD');
});

test('the landing chrome only appears on the landing page', () => {
  assert.ok(portalJs.includes("document.body.classList.toggle('is-landing', next === 'home')"));
  assert.ok(homeCss.includes('body.is-landing .site-nav { display: flex; }'));
  assert.ok(homeCss.includes('body.is-landing .landing-backdrop { display: block; }'));
});

test('the settings popover is reachable and reachable states are wired', () => {
  assert.ok(html.includes('id="siteSettingsBtn"'));
  assert.ok(html.includes('id="siteSettings"'));
  assert.ok(html.includes('id="siteReduceMotion"'));
  assert.ok(portalJs.includes("closeSettings()"));
  assert.ok(portalJs.includes("applyMotion(motionToggle.checked)"));
});
