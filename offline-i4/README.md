# CREW CHECK — I4 Offline Build

Standalone, fully offline build of the CREW CHECK in-flight health self-assessment
console, with the Inspiration4 (I4) mission playback included.

> **Not a medical device.** Rule-based decision support for a prototype; every
> threshold is a published reference range, and every recommendation is a prompt
> to consult a flight surgeon, not a diagnosis.

## Run it

No install, no build step, no dependencies:

- **Windows:** double-click `Open-I4-Offline.cmd`, or
- **Any OS:** open `index.html` in a browser.

Everything runs locally in the browser. The only optional network call is the
simulated cloud review endpoint, which is configured in
`data/cloud-ai-config.js`; an empty value hides the button entirely.

## Layout

| Path | What it is |
|---|---|
| `index.html` | CREW CHECK home screen. Opens the dashboard, the I4 playback, the mission console and the wearable import. |
| `new-mission/` | The crew-operated mission console, embedded by the home screen in an iframe. See `new-mission/UPSTREAM.md`. |
| `js/` | Application logic for the portal, the mission console and the analyzers. |
| `css/` | Styling for both screens. |
| `data/i4/` | Inspiration4 reference dataset and its provenance notes. See `data/i4/SOURCE.md`. |
| `data/cloud-ai-config.js` | Optional URL for the simulated cloud review. Empty hides the button. |

## What the console does

1. **Health Monitoring System** — a simulated 30-day mission dashboard with 11
   indicators, a clickable body map, trend charts and a ranked action plan.
2. **I4 mission playback** — browse Inspiration4 by mission day. Readings are
   read-only and run through the same detector.
3. **New mission** — the crew-operated console with onboard resource fields, a
   Crew Suggestion column and the wearable intake bridge.
4. **Connect wearable device** — Bluetooth live capture or import of readings
   exported from a watch app.

## Data provenance

The reference values come from NASA's Open Science Data Repository (OSDR),
study Inspiration4 (2021, NASA SpaceX Inspiration4), files `osd-569` and
`osd-575`. These are transformed OSDR exports, not the originals. Every file is
cited in `data/i4/SOURCE.md`, along with the rebuild command for
`data/i4/i4-missions.js`.

The dataset is a labelled reference for expectation-setting only. It is never
scored into a crew member's own assessment, and vitals that were never released
for the mission are reported as no data rather than estimated.

## Upstream

Derived from
[`cx1801097/NasaSpaceAppChallangeCCC`](https://github.com/cx1801097/NasaSpaceAppChallangeCCC),
which is licensed under the Mozilla Public License 2.0. `new-mission/` is based
on upstream commit `2068e56` — see `new-mission/UPSTREAM.md` and
`new-mission/LICENSE` for the details of that snapshot.

## License

Mozilla Public License 2.0, inherited from the upstream project.
