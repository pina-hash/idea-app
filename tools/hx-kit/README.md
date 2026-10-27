# hx-kit: build and test an HTML assignment

The plumbing every IDEA HTML assignment needs, built and tested once, so an author writes the
lesson and nothing else. `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` Part F says why.

```
cp tools/hx-kit/starter.src.html ~/work/IDEA209H_Day08_Caliper.src.html   # start here
node tools/hx-kit/build.mjs ~/work/IDEA209H_Day08_Caliper.src.html        # -> IDEA209H_Day08_Caliper.html
node tools/hx-kit/test.mjs  ~/work/IDEA209H_Day08_Caliper.html            # -> IDEA209H_Day08_Caliper-test/report.md
```

Run `npm ci` in the repo first (the build embeds the site's fonts from `node_modules`, and
the test bundles the real importer check from `src/`).

## What is here

| File | What it is |
|---|---|
| `starter.src.html` | A complete small assignment using every component. Copy it; replace everything under the manifest. |
| `starter.html` | The starter, built. It passes `test.mjs` with no FAIL. |
| `build.mjs` | Inlines the kit at two markers: `<!-- hx:head -->` (fonts, tokens for both themes, the Plate, `kit.css`) and `<!-- hx:script -->` (`bridge.js`, `kit.js`, `team.js`, `camera.js`). Refuses a source that starts the page itself, and reports the size against the 2 MB import cap. |
| `test.mjs` | The automatic test. Serves the built file under the real served policy (bundled from `src/routes/hx/_headers.ts` and `bridge.ts` on every run) inside `host.html`, a stand-in for the classroom item page, and drives it like a student and a grader. Writes `report.md`, `report.json` and screenshots. Exit 1 on any FAIL. |
| `host.html` | The classroom stand-in: the shell's geometry at 1024px and up, and the portal's half of the bridge (echoes with one in three stale, 800 ms saves, read-only, theme, picture boxes). |
| `kit/tokens.json` | The IDEA Design System's tokens, copied from the Design System artifact (its `meta` says which `main` commit it was synced from). Refresh it when the design system changes. |
| `kit/plate.css` | The design system's component classes (`idea-key`, `idea-panel`, `idea-chip`, `idea-well`, ...), as published in the artifact. |
| `kit/kit.css` | The assignment components: the hero, the plan strip, the bar, steps, evidence panels, picks, picture boxes, examples, stretch, tap tips, and the subject palette. |
| `kit/bridge.js` | The bridge client, verbatim from `IDEA_HTML_ASSIGNMENT_BRIEF.md` 6.1 to 6.5. Change both together. |
| `kit/kit.js` | Pages, not one long scroll: one step on screen, the bar, the plan strip, arrival from saved answers, List view for a grader, tap tips, the sentence counter. |
| `kit/team.js` | Team posts (`IDEA_HTML_ASSIGNMENT_SPEC.md` section 16): box focus and blur for the portal's lock, a box a teammate holds or owns drawn read only with the words beside it, a teammate's saved answer replacing this page's in a shared box, role panels and owners, and the team tracker. Inert in a worksheet that is not a team post. |
| `kit/camera.js` | A phone's camera: on a touch screen every picture box gets a Take photo key beside Choose that opens the camera directly, and a photo over 1.5 MB is shrunk to a 2400 px longest side at JPEG 0.85 before it is sent. Hidden on a computer; nothing for an author to write. |

## The source, in brief

- Colors are names, never hexes (standard D3): `"color": "sky"` on each phase in `hx-plan-data`, `data-color="copper"` on anything else, from `kit/colors.json` or the source's own `hx-colors` block (`{"name": {"anchor": "#rrggbb", "means": "..."}}`). `build.mjs` solves each used name separately for each theme (`color.mjs` `solve`) into `--hx-ink`, `--hx-fill`, `--hx-on`, `--hx-line`, `--hx-wash`, and writes the values into `hx-palette-data` for `test.mjs` to judge. The older `data-hue-from`/`data-hue-to` on `<html>` still builds, with a warning.
- `<script type="application/json" id="idea-manifest">` in the head, as always.
- `<nav class="hx-plan idea-panel" id="hx-plan">` and `<div class="hx-bar idea-panel" id="hx-bar">`
  are filled by the kit; `<script type="application/json" id="hx-plan-data">` lists the phases
  and their classes (`{"phases":[{"id","name","days":[{"label","short","date"}]}]}`).
- Each step is `<section class="hx-step idea-panel" id="..." data-phase="<phase id>" data-title="...">`
  with an `hx-step-head` and an `hx-step-body`; the kit adds the number and Back/Next.
- The assignment's own code goes in a `<script id="hx-page-js">` AFTER `<!-- hx:script -->`, so
  `HX` and the helpers exist; push a function onto `HX.onState` to recompute anything derived
  from answers. It never calls `hxStart()`; the kit starts the page.
- Terms: `<span class="it" data-term="tolerance">tolerance</span>`, defined once in
  `<script type="application/json" id="hx-glossary">`; the kit writes the tip and the
  screen-reader text from it.
- A field a student need not fill carries `data-optional` (and `"optional": true` in the
  manifest). `data-min-sentences` on a textarea sets when it counts as done.

## What the test does not cover

The real portal frame and its gate (`npm run verify:browser`, `/dev/html-assignment`), whether
a student understands it cold (the idea-html-test skill's cold open), and facts (Mr. Pina).
