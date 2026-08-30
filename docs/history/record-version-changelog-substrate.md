---
title: "Version + changelog substrate"
date: 2026-07-01
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 79
---

The site changelog AND every page's version are **auto-generated from git
history** and never hand-edited. `vite.config.ts` exposes a
`virtual:site-versions` module: at build / dev-server start it runs `git log
--name-only` and, using the route-to-path manifest in
`src/lib/site-manifest.ts` (the `APPS` list: gauntlet, vanguard, coins,
assignments, archive, dashboard, portal as catch-all), maps each commit to the
app(s) it touched and classifies a change type from its subject
(feature/fix/visual/content/docs/update).

- **THE RULES LIVE IN `src/lib/site-versions.ts`, NOT IN THE BUILD CONFIG.**
  `vite.config.ts` only gathers: it runs the two git commands, reads
  `VERCEL_GIT_COMMIT_SHA`, and hands both to `buildSiteVersions`. Everything
  deciding what the numbers MEAN -- parsing, whether a count is a version, which
  sha names the build, how the line is assembled -- is pure and covered by
  `tests/site-versions.test.ts`. A build config is the one file in the repo a
  test cannot reach, so it holds nothing worth testing.
- **A VERSION IS A COMMIT COUNT, SO IT IS ONLY TRUE OVER A COMPLETE HISTORY.**
  Over a shallow clone the count is a window sliding along the history, and it
  moves BACKWARDS as unrelated commits land: commits touching the app fall off
  the back faster than new ones touching it arrive. So every build asks `git
  rev-parse --is-shallow-repository`, and when the history is truncated it emits
  `version: null` for EVERY app -- the stamp then reads `CLASSROOM · 462C79C ·
  AUG 18, 2026`, with no number, and the build warns loudly each time it
  withholds one. A number that can go backwards is worse than no number, because
  it is trusted. Measured on this repo at a depth-10 clone (Vercel's default):
  the pre-fix code produced `CLASSROOM V1.4 · 59DA3EA` and then `CLASSROOM V1.3
  · 7DC192A` on two successive deploys -- the exact pair seen live, six minutes
  apart, that set off this investigation.
- **THE SHA IS THE PART THAT IS ALWAYS TRUE.** It comes from
  `VERCEL_GIT_COMMIT_SHA` when the platform sets it, because that names the
  commit the deployment was built from whatever the clone depth turned out to
  be; otherwise from the log's head. The date is taken from the log ONLY when
  the log's head IS that commit.
- **ONE ASSEMBLER FOR THE LINE.** Both surfaces call `stampParts` / `stampText`;
  neither builds the string itself any more. They used to, and two formatters is
  two chances for one build to describe itself two ways. The test
  server-renders the badge and compares it character for character with
  `versionLine()`.
- **A shallow clone's boundary commit is not a diff.** git grafts it to have no
  parent, so `--name-only` prints its whole TREE, which would attribute one
  commit to every app at once. Its file attribution is dropped when the history
  is truncated; its subject stays, because the subject is real.
- **Per-app versions:** `v1.N` where N is the count of commits touching that
  app's paths, so a version bumps automatically whenever a deploy includes
  commits for that app. `src/lib/VersionBadge.svelte` renders the chip
  (`<label> v1.N · <deploy short SHA> · <deploy date>`) on every SvelteKit page
  (homepage/archive footers, dashboard, auth error, the GAUNTLET layout,
  VANGUARD history). Endpoint-served legacy HTML (assignments, VANGUARD, coin
  entry) gets the same chip injected at serve time by
  `src/lib/version-badge.ts` (the established serve-time injection convention;
  legacy sources on disk stay untouched). Known gap: `static/coins/index.html`
  is served straight from `static/` (never through an endpoint), so it cannot
  show a badge without editing frozen legacy internals.
- **Homepage changelog:** newest-first over the full history, with filters by
  page/app, change type, and date range. Renders from `virtual:site-versions`.
  **GROUPED BY MONTH, and there is NO cap anywhere in the chain** -- not in the
  `git log` call, not in the emitted module, not in the render. `logMonths` is a
  single pass over `filteredLog` inserting headings; because git log already
  returns newest-first, both the months and the entries inside them come out in
  order for free. The filters still run over the whole array and the `X / Y`
  count still measures all of it (verified: 413 / 413 unfiltered, 24 / 413 for
  one app, 0 / 413 with the empty-state row). The month heading is
  `position: sticky` inside the scroll box with an opaque `--bg1` fill and
  negative side margins, so entries scroll behind it rather than through it, and
  it is deliberately QUIETER than the entries (0.6rem dim uppercase against the
  entries' 0.72rem and their cyan dates). The box is `max-height: max(420px,
  70vh)`, not the old flat 360px.
- **Vercel:** set `VERCEL_DEEP_CLONE=true` in the project env so builds clone
  the full git history. **Until that is set, production carries no version
  numbers at all** -- only the app label, the sha and the date. That is the
  intended outcome, not a degradation: it is the shallow clone that cannot
  support a version, and the sha still identifies the build exactly. The
  homepage changelog is likewise only as deep as the clone.
- **THE DEPLOY RATE IS ITS OWN HAZARD.** `src/lib/server/classroom-export.ts`
  pushes a commit to `main` every time a classroom item is saved, and each push
  is a production deploy. Saving a spec, then its rubric, then publishing is
  three commits at one item. So two pages opened minutes apart can genuinely
  come from two different deployments, and their shas will differ -- correctly.
  Different shas on two routes mean different deploys, NOT a broken build; the
  service worker (`static/push-sw.js`) has no fetch handler and caches nothing,
  so it is never the explanation.

Implication: **commit subjects are user-facing changelog copy.** Write them as
readable changelog lines (the first line of every commit shows up on `/`). There
is no changelog file to update; making a commit is the update.

