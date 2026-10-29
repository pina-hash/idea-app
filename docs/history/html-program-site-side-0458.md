---
title: "Ledger 0458: HTML assignments at full potential, site side -- any one of these, one header and one rail, replace safety and read-back, ungraded modules (0326), gaps deduped on the request (0327), sources and the health list (0328), the kit retest, commit first lines"
date: 2026-10-28
branches: [html-program-site-side-0458]
migrations: ["0326", "0327", "0328"]
subsystems: [Classroom, Connector, HTML assignments]
---

Solo session for ledger 0458, task `docs/feedback/2026-10-28/QUEUE-0458.md` (items 22 to 28 and
item 3 of the Oct 28 feedback pass, the upload-time halves of 17 and 19, and the eight items
Mr. Pina folded in at 11:01). Landed in parts, in the queue's order: parts 1 to 3 as
`343a0cb0`, `07f0dddc` and `372b5a72`, parts 4 to 6 in the push after. Written as 0325 to 0327;
lane 0470 landed (and applied) 0325 first, so they land as 0326, 0327 and 0328.

## Kit edits (announced for the HTML standards chat)

Only `tools/hx-kit/kit/kit.js` changed; `bridge.js` needed nothing. Two additions, both inert
on a portal that does not use them:

- **Item 25, the bridge half.** After it hears `idea:host { steps, title }` the kit hides its
  own step track and "You are here" line (and its title when `title` is true), and from then on
  sends `idea:steps { steps: [{ title, done, optional, phase, color }], current, next }` after
  every refresh and on a theme change (`color` is the step's computed `--hx-fill`). It shows a
  step on `idea:go-step { index }`. It sends nothing until it hears `idea:host`, which is what
  keeps `tools/hx-kit/host.html` (and an older portal) at 0 drops: the first version sent the
  steps unasked and the kit test failed "Nothing the document sends is dropped by the gate".
- **f8c1b1d8, the kit half.** A day in `hx-plan-data` may carry `"pace": "<pacing step id>"`;
  when `idea:state` carries `schedule.pacing`, that day takes the step's resolved date and shows
  "<label> · <Mon D>" (so an author writes `"label": "Class 5"` and no date). The kit also takes
  `schedule.today` as its today. A day without `pace` is unchanged.
- **Measured.** `node tools/hx-kit/test.mjs tools/hx-kit/starter.html`: 0 FAIL, 1 WARN (the
  existing steel/magenta colorblind pair), 50 PASS. That file is the starter as last built and
  does not carry the edit; the starter rebuilt on the edited kit (`build.mjs` to the scratchpad)
  measured the same, 0 FAIL, 1 WARN, 50 PASS. **`tools/hx-kit/starter.html` was not rebuilt**
  (not this lane's file); the standards chat rebuilds it and documents `idea:host`,
  `idea:steps`, `idea:go-step` and `pace` in the README and the standard.
- A scratch host (`sandbox="allow-scripts"`) on the rebuilt starter: no `idea:steps` before
  `idea:host`; after `idea:host(true, true)` the track, the "You are here" line and the title
  are `display: none`, five steps arrive with `color` `#2f9fd8` on step 1; `idea:go-step 0`
  shows step 1; `idea:host(false, false)` puts all three back. With a `pace: "p1"` day and a
  schedule whose `p1` is 2026-11-03, the plan's first day read "Class 1 · Nov 3".

## Part 1: 88ad281b and the "any one of these" group (3d205727), with ungraded modules

- **3d205727.** A block key `anyOf: "<group id>"` on two or more `optional` blocks of one module.
  `hxBlockAnyOf` reads it; `requiredUnits` in `progress.ts` is the one statement of a module's
  units, so the rail, `hxCompletion`, Answers left, the grading counts and the export's unmet
  list all count a group once, met by any member (the group's row carries `group`, with the
  first answered member's field or the first member's). `validateHtmlManifest` refuses a member
  that is not optional, a group of one, a malformed id and a group spread over two modules.
  `HtmlAnswerList` shows a group as one question ("Any one of these 3", every filled member
  under it, or "None of the 3 answered"). No migration: the database gates never read the key.
  Not changed: the team SQL that counts boxes still reads each member as optional (a team
  post's group owes nothing in the teammate progress line until that SQL learns it).
- **88ad281b, site half.** The rail already left optional blocks out (ledger 0360); measured on
  the real Rotation 2 Survey source, 6 of its 57 blocks count and filling all 51 optional ones
  leaves it at 0%. The step count the rail now draws (item 25) is over required steps only
  (`hxStepsCount`). The kit half was done in the kit.
- **6c5c7cc8 and 569a1891, the manifest half (migration 0326).** A module worth 0 points may
  carry no criteria (absent, null or empty); `_classroom_html_module_ungraded` is the gate's
  test and the validator says the same (with a warning that nothing in it is graded). A whole
  post of such modules is an ungraded HTML post at 0 points. Not done: "no due date and no grade
  row" for such a post (the grading surfaces still list a 0-point assignment), see Deferred.

## Part 2: item 25 (4930ba0e), one header and one rail; f8c1b1d8's kit half

- The frame sends `idea:host` when `hostSteps` (the rail is on screen and full page is shut) or
  `hostTitle` (the item page shows the post title, 0284) is set, and again when either moves.
  `hxReceive` judges `idea:steps` (1 to 60 steps, titles cut at 120, `current` and `next` inside
  the list, a colour only through `hxStepColor`, which drops anything but a hex or a plain
  `rgb`/`hsl`/`oklch` of numbers). `Progress` draws a Steps panel: "Step 3 of 5: <title>", "N of
  M steps done" over required steps, and one 44px key per step (an extra step is dashed with a
  plus), which sends `idea:go-step`. `ItemDetail` wires it for the student's frame; full page
  has no rail, so there the document keeps its own.
- Browser pass, `tools/browser-verify/_hx-steps.mjs` on `/dev/html-assignment-live?doc=kit-starter`
  (the kit starter built on this tree's kit, dev only, `hxKitFixture`), at 375 and 1440: 1 steps
  panel and 5 keys, smallest key 44.0px, the document's track and "You are here" hidden, 1 page
  title and the document's title hidden, pressing step 1 moved the document from step 3 to step
  1, 0px sideways scroll; control `host=0&title=0`: 0 rail panels, the document's track and
  title shown. 14 rows, 0 FAIL. `npm run verify:browser` on html-progress, html-assignment-live,
  its list state and the grading Answers state: 22 runs, 358 measurements, 0 outside threshold.

## Part 3: item 27 (aa9ce822, gap cdb5eb34), 84cf8690, 0a569932, 4d0ddefe

- **aa9ce822.** `htmlBasedOnMatches` (store.ts) is the one rule: a replace names the live copy it
  was made from, by the stored bytes' SHA-256 or by its saved time (an export's
  `documentUpdatedAt`), and a mismatch is refused with `HTML_REPLACE_STALE`. The connector's
  `replace_html_assignment` requires `basis` once the post has a document (`needs_basis`) and
  refuses a stale one (`changed_since`) before the orphan check, the retire or any write. The
  replace screen asks `readSavedAt` (a new optional transport) before anything is retired or
  written, against the saved time the page loaded or its own last save
  (`htmlReplaceStillCurrent`).
- **Read-back (0a569932, aa9ce822).** `get_post` on an HTML assignment now carries `document`:
  filename, bytes, SHA-256, saved time, the live version and every earlier version (with its
  bytes and SHA-256); `document: true` adds the HTML, `version: N` an earlier one. It reads the
  table as him, so drafts come back. `tests/db/html-assignment-document-read-0458.test.ts`
  counts the boundary both ways on one fixture: admin and teacher 1 and 1 (live, draft), a
  student in the class 1 and 0, a student in another class 0 and 0. **Mutation proof:** 0195's
  policy made `using (true)`, the file then reddened 2 of 4 (the two student rows); restored
  from the copy (md5 `2b359aa317612c6f1c279f40ff5a4d04` before and after, `git diff` empty).
- **84cf8690.** Measured, not a bug in storage: `classroom_set_html_assignment` returns the
  number the DISPLACED document is kept as, so the first replace of any post answers 1 (the
  earlier document is version 1 and the live one version 2); a post first created by a replace
  has nothing displaced and answers null; Launcher: Design read 2, 3, 4 because it had been
  replaced that often. Nothing is overwritten: `classroom_content_revisions` keeps every one.
  The replace now answers `stored: { sha256, bytes, matches_what_was_sent, saved, version,
  earlier_kept_as_version, note }`, and `tests/db/connector-tools.test.ts` asserts version 2,
  kept as 1, and that `get_post` version 1 reads back the first document byte for byte.
- **Gap cdb5eb34.** A landed connector replace calls `exportClassroomItem` as him and reports
  `exported`; the site's own upload already pinged the export.
- **0a569932 / gap 02743baf (migration 0327).** `connector_report_gap` gains `p_request_id`
  (`connector_gaps.request_id`), and folds a report into an open gap only for the same request
  id, or the same words with the same missing sentence; four gaps sent under one `said` now
  stay four. The client names `p_request_id` only when given and asks again without it on
  `PGRST202`, so the migration and the deploy may land in either order.
- **4d0ddefe.** A staged upload lives 24 hours (the storage service's signed PUT address is
  still its own two hours, said in `put_url_good_for_minutes`); a confirm token lives 30 minutes
  (`CONFIRM_WINDOW_MS`), with every sentence that said ten minutes changed.

## Part 4: item 22 (013c83d0) and 3147afb1

- **Sources (migration 0328).** `classroom_html_sources` keeps one `.src.html` per post, read
  by whoever manages a class it is posted to (instructor materials' policy) and never by a
  student; `classroom_html_set_source` is the one write (admin this season, a manager of the
  post, a page needs the `hx:head` and `hx:script` markers). The connector's replace takes
  `source` or `sourceUpload`; `get_post` names the stored source and returns it with `source`
  true; the export writes it to `assignment-sources/<course>/<name>.src.html`
  (`sourceExportPath`: the IDEA courses without the hyphen, the uploaded `.src.html` name kept).
  Committed sources attach to their live posts from the health list (one key per post whose
  manifest names the same title and course as exactly one committed source).
  `tests/db/html-assignment-sources-0328.test.ts`: admin, teacher 1 row each, a student in the
  class 0 (while reading the post's page itself: 1), the season gate, the marker refusal, the
  null removal, and the file re-applies.
- **Not built: the "Rebuild on the current kit" key.** `tools/hx-kit/build.mjs` reads the kit
  files and fonts off disk with paths from its own `import.meta.url` and runs `git` for its
  stamp, so it cannot run inside the deployed site, and this lane may not refactor it. The
  health list flags every page the current kit has not reached, and a chat rebuilds one from
  the stored source and replaces it with `basis`. A site-side key needs `build.mjs` split into
  a pure `build(source, assets)` the site can bundle; that is the HTML standards chat's file.
- **3147afb1, partly.** `replace_html_assignment` on an ordinary assignment already converts it
  in place: same id, classes, due date and place in the unit (`tests/db/connector-tools.test.ts`
  asserts id, due, sort order 7, sections and schema 3 after the replace), its files untouched,
  and every answered block on the item (spec answers included) held by the orphan check. Not
  done: the same from the replace screen on the site (the composer's import panel still needs
  a stored document to offer a replacement, and a spec-backed assignment's answers need their
  own decision), a material converted (its kind would change), and "a new post lands where the
  teacher filed it in the unit's order" (top of the unit, or a place he picks, is his to say).

## Part 5: item 23 (3bf69806) and item 24 (23b3776c)

- **The health list, `/admin/html-assignments`** (admin, 404 for anyone else; linked from the
  classroom admin console's Site tools). `classroom_html_health` (0328) reads every post's
  `hx-kit` and `hx-standard` meta tags, an older page's `hx-kit-css` comment, size, saved time,
  source and classes in SQL; `htmlHealth` sorts hand-built first, then older kit, then stamped
  pages by kit date, and flags "Rebuild on the current kit" against `virtual:hx-kit-stamp` (the
  last commit that touched `tools/hx-kit`, gathered at build; a shallow build without that
  commit reads every page as needing a check). It also shows a points mismatch (ccecb3b9). Not
  shown: each page's last automatic test result; the kit test runs in CI and is not stored on
  the site.
- **The retest, `.github/workflows/kit-retest.yml`** on any push touching `tools/hx-kit/`,
  `assignment-sources/` or the tool: `tools/hx-retest/retest.mjs` builds every committed source
  and runs `tools/hx-kit/test.mjs` on it in Chromium (`playwright-core install --with-deps
  chromium`), and writes the table (page, FAIL, WARN, failing checks) to the job summary. It
  reports and does not gate, red only when a source could not be built or tested. Not run on
  GitHub from here; the tool's reading and table are tested (`tests/hx-retest.test.ts`).

## Part 6: everything else

- **f3a3a687, the shell half.** `thumbnailDocument` inlines `THUMB_SHELL_CSS`: Rajdhani 600 and
  Share Tech Mono as data URIs and the kit's own tokens for both themes, from `tokensCss` with
  its switch moved to the shim's `data-idea-scheme` (generated by `tools/hx-thumb-shell.mjs`,
  51 KB; a staleness test). Not done: the four-slot, two-theme preview with the under-11px
  warning on the upload and replace screen (the kit test measures it today).
- **ccecb3b9.** `htmlPointsMismatch` is the one rule; the replace screen says it with a "Set
  points to N" key, the health list shows it, and the connector's replace reports it with the
  sentence to read him. The grading console's own notice was not added (0457's grading
  packet already reports a points and rubric disagreement).
- **c9d7efc3, the first half.** `rubricVisibilityWarnings` warns at upload on a rubric line
  whose words are mostly only in a tooltip or a closed fold. Not done: "the same evidence
  scored on two posts", which needs a read across posts.
- **gap b4c9ae73, the first half.** `get_post` lists the post's files. Not done: a copy-files
  action (a copied file row would share storage with its source, and the delete route's sweep
  would then remove bytes the other post still lists).
- **gap 154c8fb3.** `list_posts` names each post's unit and the class's units with their ids;
  `get_post` and `grading_packet` name the unit.
- **fb08d358.** `src/lib/commit-subject.ts` is the one rule (100 characters, no " - " joints):
  `.github/workflows/commit-subjects.yml` runs `tools/commit-subjects.mjs` on every push to
  `main`, and `splitJoinedSubject` shows a landed one-line message as its first clause with the
  rest as its details. The limit is 100, not "about 90": 13 of the last 100 commits ran 91 to
  114 characters, 8 of them over 100. `tests/prompt-ledger-numbers.test.ts` holds every ledger
  number to one entry file, with the two pairs already landed (0438, 0439) named.
- **f6ae4be7: not done.** The class Videos list is built from the items the page already holds;
  adding the videos inside HTML documents means reading every document of the class on each
  class page view (the per-view document read ledger 0357 retired) or a stored list of video
  ids written at upload, which is a migration of its own.
- **569a1891, the site half beyond the manifest: not done.** A 0-point HTML post can now be
  stored (0326), but the grading surfaces still list it like any assignment and nothing hides
  its grade row.

## Item 3 (f2ba055d): the IDEA100 posts through the kit test

Run on the copies the classroom export wrote under `materials/idea-100/` (the stored HTML on
the site was not reachable from here; IDEA-Blade 01's export is from 2026-10-22, older than the
Oct 26 live edits, which is report aa9ce822's own case) and on the three IDEA100 sources in
`assignment-sources/idea100/` built on the current kit. None of the eleven exported pages
carries the `hx-kit` meta tag.

| Post | Tested | Result |
| --- | --- | --- |
| Dogtag | materials export | test.mjs stopped (no `#hx-page`: a hand-built page), no score |
| Solidworks Day | materials export | stopped the same way |
| Hook 01 Research and Concepts | materials export | stopped the same way |
| Hook 02 V1 Print and Pull | materials export | stopped the same way |
| Hook 03 V2 to the Tournament | materials export | stopped the same way |
| IDEA-Blade 01 Design | materials export (Oct 22) | 15 FAIL, 4 WARN, 26 PASS: 4.4 screens of scrolling, 10 read-only boxes with no keys, the thumbnail banner at 8.7px, squeezed columns at 1152 and 375, no Take photo on its 8 picture boxes |
| IDEA-Blade 02 Build and Fight | materials export | 11 FAIL, 5 WARN, 28 PASS: 10 read-only boxes with no keys, no Take photo on 4 picture boxes |
| IDEA-Blade 02 Build and Fight | source, current kit | 2 FAIL, 1 WARN, 53 PASS: thumbnail banner at 8.7px, 16px sideways scroll at 375 |
| Rotation 2 Survey | source, current kit | 0 FAIL, 0 WARN, 46 PASS |
| Orientation | source, current kit | 0 FAIL, 1 WARN, 51 PASS |
| IDEA-Blade Assembly, Creating the Parts, Group Presentation, Rotation 1 Survey | materials export | stopped (hand-built) |

`tools/hx-kit/test.mjs` throws `TypeError: Cannot read properties of null (reading
'getBoundingClientRect')` at line 377 on a page with no `#hx-page` and prints no results; that
is the kit test's own robustness, for the HTML standards chat. No student-facing content was
changed.

## Migrations, and what undoes them

- `supabase/migrations/0326_html_manifest_ungraded_modules.sql`: re-run 0301's
  `_classroom_check_html_manifest`, then drop `_classroom_html_module_ungraded`.
  `tests/db/html-manifest-ungraded-0326.test.ts`: the exported corpus answers the same before
  and after, every ungraded shape refused before and accepted after, the graded shapes refused
  in the same words, and the file re-applies.
- `supabase/migrations/0327_connector_gaps_request_id.sql`: re-run 0272's
  `connector_report_gap`, then drop the five-argument form; the column may stay.
- `supabase/migrations/0328_html_assignment_sources_and_health.sql`: drop
  `classroom_html_health` and `classroom_html_set_source`, then (a person's paste: the migrator
  refuses a dropped table) `classroom_html_sources`.

## Verification

- `svelte-check` (after `svelte-kit sync`, `.env.example` copied to `.env`, 4.5 GB heap): 0
  errors, 33 warnings in 18 files.
- Targeted: the new `html-assignment-any-one`, `html-assignment-steps`,
  `html-assignment-replace-safety` and the three db files, plus the progress, manifest,
  answers, bridge, mount, connector-tools, connector-gaps-tools, connector-requests,
  connector-registry and connector-coverage suites, green. `npm run connector:build` rerun.

### Parts 4 to 6

- `svelte-check`: 0 errors, 33 warnings in 18 files. Importing the two new `.mjs` tools into a
  test by name made the checker walk `tools/hx-kit/*.mjs` as TypeScript (96 errors); the tests
  import them by a computed address instead.
- **Mutation proof on the source read:** 0328's policy made `using (true)`, the sources file
  reddened 1 of 4 (the student row); restored from the copy (md5
  `4870aad275a4901f824eb12408b998d3` before and after) and green again, 4 of 4.
- `node tools/hx-kit/test.mjs` on the starter rebuilt on this tree (kit.js edits and the new
  thumbnail shell): 0 FAIL, 1 WARN, 50 PASS. IDEA-Blade 02's source built on the kit BEFORE this
  lane's `kit.js` edit fails the same 2 checks as on the edited kit (thumbnail banner 8.7px, 16px
  sideways at 375), so neither is this lane's.
- `tests/workflows.test.ts` learned the two new workflows (no push in either).
- **Full `npm test`**, parts 1 to 3 (before the rebase onto lane 0470): 955 files, 17346 tests, 16
  failed in 7 files. Parts 4 to 6: 965 files, 17412 tests, 19 failed in 9 files; three of those
  files were this lane's (`classroom_html_set_source` had no connector sample and its table was
  not a log table) and pass after the fix (5 connector files, 512 tests). What remains is the
  known set from `docs/history/work-0441.md` (`classroom-panel-layout-render`, `cert-0262-exam`,
  `cert-flow`, `feedback-round-0380-foundry`, `ideacad-feature-graph-storage`; `coin-stocks-relaunch`
  and `html-manifest-team-roles` now pass) plus `tests/standards-version-header.test.ts` on
  `IDEA_MORNING_ANNOUNCEMENTS.md` (header 1.6, changelog 1.7, from commit `481afb99`, not this lane).

## Not verified

- Production: nothing here touched the live site. The two migrations apply through
  migrate.yml; the live gate, the live gap table and a live replace were not exercised.
- A signed-in browser session on the real item page: the rail and the frame were measured on
  the dev harness, which mounts the real components, not on `/classroom/.../item/...`.
- `/admin/html-assignments` in a browser: it needs an admin session this container cannot make,
  so its layout at 375 and 1440 is not measured (its rows are `htmlHealth`'s, held by
  `tests/html-assignment-health.test.ts`, and the SQL half by the 0328 suite).
- `.github/workflows/kit-retest.yml` and `commit-subjects.yml` on GitHub: not run from here.
- The export of a stored source to `assignment-sources/`: `sourceExportPath` and the file list
  were not pushed to GitHub (no token here).
- Firefox and Safari: Chromium only.
