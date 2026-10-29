---
title: "Ledger 0458: HTML assignments at full potential, site side -- any one of these, one header and one rail, replace safety and read-back, ungraded modules (0326), gaps deduped on the request (0327)"
date: 2026-10-28
branches: [html-program-site-side-0458]
migrations: ["0326", "0327"]
subsystems: [Classroom, Connector, HTML assignments]
---

Solo session for ledger 0458, task `docs/feedback/2026-10-28/QUEUE-0458.md` (items 22 to 28 and
item 3 of the Oct 28 feedback pass, the upload-time halves of 17 and 19, and the eight items
Mr. Pina folded in at 11:01). Landed in parts, in the queue's order.

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

## Migrations, and what undoes them

- `supabase/migrations/0326_html_manifest_ungraded_modules.sql`: re-run 0301's
  `_classroom_check_html_manifest`, then drop `_classroom_html_module_ungraded`.
  `tests/db/html-manifest-ungraded-0326.test.ts`: the exported corpus answers the same before
  and after, every ungraded shape refused before and accepted after, the graded shapes refused
  in the same words, and the file re-applies.
- `supabase/migrations/0327_connector_gaps_request_id.sql`: re-run 0272's
  `connector_report_gap`, then drop the five-argument form; the column may stay.

## Verification

- `svelte-check` (after `svelte-kit sync`, `.env.example` copied to `.env`, 4.5 GB heap): 0
  errors, 33 warnings in 18 files.
- Targeted: the new `html-assignment-any-one`, `html-assignment-steps`,
  `html-assignment-replace-safety` and the three db files, plus the progress, manifest,
  answers, bridge, mount, connector-tools, connector-gaps-tools, connector-requests,
  connector-registry and connector-coverage suites, green. `npm run connector:build` rerun.

## Not verified

- Production: nothing here touched the live site. The two migrations apply through
  migrate.yml; the live gate, the live gap table and a live replace were not exercised.
- A signed-in browser session on the real item page: the rail and the frame were measured on
  the dev harness, which mounts the real components, not on `/classroom/.../item/...`.
- Firefox and Safari: Chromium only.
