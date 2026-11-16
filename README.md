# AstroGuard

An offline in-flight health self-assessment console for long-duration space missions, with the Inspiration4 (I4) mission playback included.

Standalone, fully offline build of the AstroGuard in-flight health self-assessment
console, with the Inspiration4 (I4) mission playback included.

> **Not a medical device.** Rule-based decision support for a prototype; every
> threshold is a published reference range, and every recommendation is a prompt
> to consult a flight surgeon, not a diagnosis.

## Run it

No install, no build step, no dependencies:

- **Windows:** double-click `Open-I4-Offline.cmd`, or
- **Any OS:** open `index.html` in a browser.

Everything runs locally in the browser. The console makes two optional network
calls: the simulated cloud review endpoint, configured in
`data/cloud-ai-config.js` (an empty value hides the button), and the live NASA
environment feed described under **Live environment data**.

## Layout

| Path | What it is |
|---|---|
| `index.html` | ASTROGUARD landing page. Opens the dashboard, the I4 playback, the mission console and the wearable import. |
| `new-mission/` | The crew-operated mission console, embedded by the landing page in an iframe. See `new-mission/UPSTREAM.md`. |
| `js/` | Application logic for the portal, the mission console and the analyzers. |
| `css/` | Styling. `style.css` for the console, `home.css` for the landing page. |
| `assets/` | Local images for the landing page, including the hero background. |
| `data/i4/` | Inspiration4 reference dataset and its provenance notes. See `data/i4/SOURCE.md`. |
| `data/cloud-ai-config.js` | Optional URL for the simulated cloud review. Empty hides the button. |

## Landing page

`index.html` opens on a landing page: a space backdrop, a primary navigation bar
(Home, Mission, Health, Devices, Playback) and four large entry cards that open the
Health Monitoring System, the I4 playback, the New mission console and the wearable
import. The gear button opens a small settings panel with a *reduce motion* toggle
and a link to the saved mission records.

Everything on that page is local — the hero background is a bundled image and the
icons are inline SVG — so the landing page renders identically with no network.

The landing chrome belongs to the landing page only. Inside the console the
workspace keeps its own brand bar and navigation, so the two never stack.

## What the console does

1. **Health Monitoring System** — a simulated 30-day mission dashboard with 11
   indicators, a clickable body map, trend charts, a ranked action plan and an
   **Environment** view that pulls live NASA ground conditions and natural events.
2. **I4 mission playback** — browse Inspiration4 by mission day. Readings are
   read-only and run through the same detector.
3. **New mission** — the crew-operated console with onboard resource fields, a
   Crew Suggestion column and the wearable intake bridge.
4. **Connect wearable device** — Bluetooth live capture or import of readings
   exported from a watch app.

## Live environment data

The **Environment** tab of the Health Monitoring System reads two keyless NASA
open APIs straight from the browser. Both send CORS headers, so the hosted site
works without a proxy and without an API key.

| Source | What it returns | Update rate |
|---|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) | Satellite-derived surface conditions for the selected ground site: air temperature, surface pressure, relative humidity, dew point, wind, precipitation | Hourly analysis, published with a 2–3 day lag |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Natural events still open, with their position and distance from the selected site | Posted as they are detected |

Three things the console is careful about:

- **POWER publishes with a lag.** The panel shows the observation time of the
  latest published analysis instead of presenting it as the current hour.
- **POWER marks a missing observation as `-999`, not `null`.** Each parameter is
  filtered on its own, so one missing hour does not blank out the rest.
- **EONET still lists events open since 2002.** The feed asks for a 90-day window
  so the list reflects what is genuinely current.

If the network is unavailable, the console shows the last reading it saved on the
device and marks it as saved rather than live. The feed is ground context for
crew and ground support: it never feeds the health assessment and never replaces
a mission-approved source.

## Data provenance

The reference values come from NASA's Open Science Data Repository (OSDR),
study Inspiration4 (2021, NASA SpaceX Inspiration4), files `osd-569` and
`osd-575`. These are transformed OSDR exports, not the originals. Every file is
cited in `data/i4/SOURCE.md`, along with the rebuild command for
`data/i4/i4-missions.js`.

The dataset is a labelled reference for expectation-setting only. It is never
scored into a crew member's own assessment, and vitals that were never released
for the mission are reported as no data rather than estimated.

## Branch map

| Branch | Commit | What it holds |
|---|---|---|
| `main` | — | Release branch. Everything below is merged here in the order listed. |
| `feat/scoring-baseline` | `feat: score against the crew member's own preflight baseline` | Personal preflight baseline and change detection. Two independent judgements per reading — the clinical band for the population and change against this crew member's own median — keeping the worse of the two. Expanded indicator catalogue with every visible label spelled out in full. Version 2 record holding the per-flight mission profile: destination, planned duration, crew size, communication delay, sleep target, instrument groups. The generated demo record is deliberately not imported, so no invented readings can enter a real crew member's record. Sleep debt and flight exposure scale with the mission profile. |
| `feat/checkin-console` | `feat: crew-operated check-in console` | The console rebuilt around the crew member as the operator: enter your own readings, get a verdict with specific actions, confirm anything about to be escalated, produce a handover report that stands alone in a delayed communication loop. The generated demo mission is deleted — nothing on screen is a simulation. Mission tab carries the per-flight configuration; the check-in form follows the instrument groups that vehicle actually carries. Flight day numbering starts at flight day 1, driven by the launch date. |
| `feat/ai-assistant` | `feat: scoped mission-health assistant on free models` | The Assistant tab: one mission-health question at a time, answered from the check on screen, plus a second opinion on that check. Scope enforced at three layers — the client sends only two request shapes and never any conversation history, the server holds two locked prompts that treat the crew note and the question as untrusted data, and every response is validated against a fixed schema before rendering. Free models only, sized per request, with cooldown and automatic fallback. The credential lives in a gitignored `.env.local` read only by the server; the browser never sees it. |
| `feat/i4-reference` | `feat: NASA Inspiration4 reference dataset and builder` | Published Inspiration4 blood panels from the NASA Open Science Data Repository, as a clearly labelled reference section. Only the analytes NASA actually measured are carried through; the six cells excluded by the repository's own quality flags are surfaced with their reason. Microgravity exposure uses the actual flight duration from the study metadata. The raw transformed extracts are committed on purpose so the dataset can be rebuilt and checked. |
| `feat/nasa-standards` | `feat: cite the NASA tools and standards this tool follows` | The Reference tab names the real NASA instruments and standards the tool is aligned to, and what each one contributed: NASA-STD-3001 for crew health, sleep, exercise and radiation limits; the Human Research Program's five hazards for the risk frame behind the eight body systems; the International Space Station Medical Checklist for the assess, act, hand over sequence; ISS Daily Health Report practice for the repeated short self-report; the Open Science Data Repository for the published panels; Exploration Medical Capability and the Integrated Medical Model for treating a missing reading as no data. States plainly that this is not a simulator and not certified by NASA. |
| `docs/branch-map` | `docs: replace the readme with the branch map` | The branch map itself. |
| `fix/assistant-availability` | `fix: make the assistant reachable, recoverable and honest` | Makes the assistant usable. The Assistant tab now explains that a static host cannot run the credential proxy, and how to start it locally, instead of leaving a dead Ask button. The router sweeps up to five candidates then makes a second pass, the client makes one transparent retry with its own timeout, a thinking indicator shows while a reply is in flight, and the daily free-model quota is detected and named so the crew member knows it is a quota and not a fault in the tool. |
| `chore/rename-astrogurad` | `chore: rename the project to AstroGuard` | The rename. The brand, the page titles, the handover report, the footer, the assistant prompts, the exported filenames, the launcher scripts and the saved record key all move to AstroGuard. A record saved under the previous key is adopted on first run rather than discarded, so a rename never erases a crew member's own readings. |

## Upstream

Derived from
[`cx1801097/NasaSpaceAppChallangeCCC`](https://github.com/cx1801097/NasaSpaceAppChallangeCCC),
which is licensed under the Mozilla Public License 2.0. `new-mission/` is based
on upstream commit `2068e56` — see `new-mission/UPSTREAM.md` and
`new-mission/LICENSE` for the details of that snapshot.

## License

Mozilla Public License 2.0, inherited from the upstream project.

## New Mission ground and equipment interfaces

In **Mission → Spacecraft and onboard resources**, set the mission-approved
HTTPS ground gateway. In a saved assessment, review **Handover report** and
choose **Send reviewed report to ground**. The browser asks for confirmation
with the destination. The JSON payload includes the reviewed report (including
any crew note), callsign, mission, triage, check-in timestamp and flight day.
A matching gateway receipt is recorded on the check. The receipt acknowledges
gateway acceptance. Ground operator acknowledgement is a separate process.

The endpoint accepts a JSON POST with schema `astroguard.handover.v1` and
returns JSON such as `{"packetId":"e123","receiptId":"ground-456"}`.
Configure CORS for the app's HTTPS origin and Content-Type. Use a
mission-managed access boundary and deduplicate by packetId. The browser sends
without credentials, follows no redirects and performs no automatic retries.
Use the existing Copy or Download report options when the gateway is offline
or when your mission uses a different transport.

Equipment bridges can export a JSON file for **Import one mission equipment
reading**. The console validates it and fills one enabled check-in field.
Review and select **Run check** to store the reading and device provenance.

```json
{
  "schema": "astroguard.observation.v1",
  "reading": {
    "metric": "cabinCo2Avg",
    "value": 2.1,
    "unit": "mmHg",
    "quality": "usable",
    "timestamp": "2026-11-15T12:00:00Z",
    "deviceId": "cabin-monitor-01",
    "averagingSeconds": 3600
  }
}
```

Supported metric IDs and units are listed in
`new-mission/js/mission-interfaces.js`. Equipment bridges must map their
vendor format into this contract. Physical device and mission-network
qualification require tests with the equipment and gateway used on the mission.

## Data and validation priorities

Collect timestamped, consented original and repeat readings with units,
device or instrument, signal quality and activity at measurement. Where
available, retain a simultaneous reference instrument measurement. Add
sleep duration, recent exertion and symptom timing as context. For hazards,
collect the exposure or averaging window and the mission or lab reference
used (for example, a verified one-hour cabin CO₂ average or a same-site bone
measurement). Historical, measured and synthetic observations need distinct
provenance. Keep private observations outside the public demo and repository.

For each iteration, keep independently labeled cases covering stable checks,
post-exercise pulse, unreliable sensors, boundary values, multiple-day
deterioration, and recovery after recheck. Use the same cases across both
consoles and the cloud review pipeline. Before publishing a measured accuracy
claim, use a held-out set with independent review and report counts for
missed alerts, false alerts and unassessable cases by condition and source.
The cloud review receives simulated finding codes and ranks them. Safety
thresholds, quality exclusions and urgent guidance run locally.
