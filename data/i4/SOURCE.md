# Inspiration4 reference dataset

Source of the published blood-panel values shown in the Reference tab.

- Study: Inspiration4 (NASA SpaceX Inspiration4), crewed mission, 2021.
- Repository: NASA Open Science Data Repository (OSDR).
- Study pages: <https://science.nasa.gov/osdr/> and the mission study
  record linked from the generated dataset metadata.
- Files used:
  - `raw/osd-569_cbc.csv` — complete blood count (OSD-569).
  - `raw/osd-575_cardiovascular.csv` — cardiovascular panel (OSD-575).
  - `raw/osd-575_cmp.csv` — comprehensive metabolic panel (OSD-575).
  - `raw/osd-575_immune.csv` — immune marker panel (OSD-575).

These are the transformed OSDR exports, not the originals. Only the
analytes NASA actually measured are carried through. Six cells that
failed the repository's own quality flags are excluded, and every
exclusion is labelled in the console with its reason.

## Rebuilding

```
node tools/build-i4.js
```

This regenerates `i4-missions.js`, which exposes `window.CC_I4` with the
study metadata, the reference intervals for each analyte, and one
preflight baseline plus seven samples per crew member.

## Use

This dataset is a labelled reference for expectation-setting only. It is
never scored into a crew member's own assessment, and the vital signs,
sleep and mood that were never released for this mission are reported
as no data rather than being estimated.
