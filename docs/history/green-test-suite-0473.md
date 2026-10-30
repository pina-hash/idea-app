---
title: "A green test suite on main: the clock, two stale assertions and one stale golden (ledger 0473)"
date: 2026-10-29
branches: ["main"]
migrations: []
subsystems: ["Testing", "Classroom", "HTML assignments", "Coins", "Certifications", "Standards"]
---

Mr. Pina sent a screenshot of red CI checks on main. Six causes, four fixed here, one written up for the chat that owns it, and one product finding left for the class page's owner.

**What CI was failing on af159374** (the code-mode run, five shards): `tests/classroom-panel-layout-render.test.ts` (2), `tests/html-assignment-pacing.test.ts` (2), `tests/standards-version-header.test.ts` (1). Every docs-only push failed the docs job on the same standards test. The other files in the queue (`tests/db/cert-0262-exam.test.ts`, `tests/db/cert-flow.test.ts`, `tests/db/feedback-round-0380-foundry.test.ts`, `tests/db/ideacad-feature-graph-storage.test.ts`, and the panel test's other two cases) passed on CI and failed only on a Pacific machine. The two older names in `docs/history/work-0441.md` (`tests/db/coin-stocks-relaunch.test.ts`, `tests/db/html-manifest-team-roles.test.ts`) passed on this tree and needed nothing.

## 1. The suite ran on the machine's time zone (10 local-only failures)

This container's shell exports `TZ=America/Los_Angeles`, as Mr. Pina's machine effectively does. Measured on the unchanged tree with that shell: 15 failed across 6 of the 10 queued files. Two separate effects:

- The embedded Postgres takes `timezone` from `TZ` when initdb writes its config (`embedded-postgres` spawns initdb and postgres with `process.env`). Every `timestamptz` serialized as `-08:00`, so `cert-0262-exam` read `"2030-03-01T14:00:00-08:00"` where it expected `"2030-03-01T22:00:00+00:00"` and cascaded through the file (7), `cert-flow` (1), the Foundry schedule window (1) and the IdeaCAD trash (1).
- A server render of a post first published at 00:00Z said the 19th in Pacific and the 20th in UTC, the "20 against 19 in every case" the panel test's header called its standing failure (2 more cases there).

Fix: `vitest.config.ts` sets `process.env.TZ = 'UTC'` at load, before `tests/db/cluster.ts` boots the cluster or any worker starts. One place, matching production (a UTC server and a UTC database) and CI. Code that means Los Angeles already names `America/Los_Angeles`. After it, with the same Pacific shell, those five files went to 2 failures, exactly CI's 2 (below). Rule written into `docs/subsystems/testing.md`.

## 2. The hall pass test failed in the 35 minutes after midnight Pacific

`tests/db/coin-hallpass-minutes.test.ts` back-dated Dee's purchase 40 minutes and her passes 25 and 35 minutes, each from `now()`. Bought minutes count only on their own Los Angeles day (`on_date`, and `_coin_la_today(opened_at)` in the fine judge), so just after midnight the pass opened "yesterday" while the purchase was stamped "today": no bought minutes, fined, red.

Proved, not argued: a 30-line `LD_PRELOAD` shim over `clock_gettime` and `gettimeofday` shifted node AND Postgres (the shim has to sit where the `postgres` user can read it; under the root-only scratchpad it silently did not load and the old file passed at "midnight", which is how that was caught). Old file at 00:10 Pacific: 2 failed of 7 (the 25 minute and the auto check-in tests), exactly the report. At 00:30: 1 failed.

Fix: the purchase is dated from the pass it belongs to (`created_at = opened_at`, `on_date = _coin_la_today(opened_at)`, a row the purchase RPC can itself write). That alone left one red at 00:30, because Dee's two passes then opened on two different days and one purchase cannot belong to both; moving it re-judged her first pass as unbought. So the auto check-in test now uses its own student (Cal, enrolled in Block 1 through the real roster path) and its own purchase. New file under the shim at 23:58, 00:00:30, 00:10, 00:26, 00:30 and 00:34 Pacific, and unshifted: 7 of 7 every time. The production code was right throughout; this was the fixture.

## 3. The pacing sweep asserted that nobody uses pacing

`tests/html-assignment-pacing.test.ts` was ledger 0439's gate-widening proof, and its step 1 said every stored HTML assignment carries no `pacing` key. True the day it landed; false on 2026-10-29 when the two IDEA209H Launcher posts (`materials/idea209h/launcher-design`, `materials/idea209h/launcher-prototype-and-detail-design`) were given plans. That is the feature working, and an assertion over `materials/`, which the app writes (testing.md: never assert over a directory the app writes).

Validator or content? Neither. Both plans read whole through the real reader (3 of 3 and 4 of 4 steps) with no warnings, and `validateHtmlManifest` gives the identical errors with and without them. The test was stale. The sweep now takes each document with its own plan removed as the "before", and asserts the document as stored has the identical errors and only the warnings its own plan earns, then keeps 0439's well-formed and malformed probes. So the rule (a plan never decides whether a document imports) is checked against every real plan instead of against there being none.

## 4. The panel golden predated two legitimate changes

With the clock fixed, the two teacher cases of `tests/classroom-panel-layout-render.test.ts` still failed, as on CI:

- Ledger 0467 (85a27799) moved class palettes onto the solved identity colours, so the banner's and its pattern layer's `--ct-*` values changed from `hsl()` to the solved values.
- 9b816a6c (ledger 0455, copy forward) put a Copy to class key between New post and the next header key; absent in these cases, it leaves one space more.

Spliced mechanically, the shape the test's header already documents: in the two teacher cases only, every `style` attribute carrying `--ct-` (2 per case) and the whitespace after the New post key were replaced by the current render's, and the whole render was then checked equal under the test's own normalization. 35 changed spans, 121 characters, per teacher case; the student, bare and empty cases were equal whole and are byte-identical. Spliced again after rebasing over lane 0469 (727790ef, which added `data-tap-floor` attributes to the same golden and left these spans stale): golden md5 `678699aa...` to `4f14a764...`, the same two spans and nothing else, and the test 9 of 9 after. The header records the splice.

## 5. Written up, not fixed: the morning announcements header (owned elsewhere)

`docs/standards/IDEA_MORNING_ANNOUNCEMENTS.md` says `**Version 1.6 - 2026-10-21**` while its own changelog's newest entry is `**1.7 (2026-10-26)**`, since 481afb99 (the FRC announcements chat, session `01CQeevErB2p1MWamdnihFqX`, under ledger 0383, which owns this standard and its register row). It is a mirrored standard and the test says correct it upstream, so this bundle does not touch it. The owning chat's correction, two lines:

- `docs/standards/IDEA_MORNING_ANNOUNCEMENTS.md` line 2: `**Version 1.6 - 2026-10-21**` becomes `**Version 1.7 - 2026-10-26**`.
- `docs/standards/REGISTER.md`, its row: `| 1.6 | 2026-10-21 |` becomes `| 1.7 | 2026-10-26 |` (the test compares the register to the header, so both move together), with ", and from 1.7 a morning and a separate after school read, and the 80% line removed" added to the row's summary.

Until then `tests/standards-version-header.test.ts` stays red on that one file, in the code suite and in every docs-only push.

## 6. A finding for the class page's owner, not changed here

`shortWhen` in `src/lib/classroom/classroom.ts` formats a post's date in the VIEWER'S zone (`toLocaleDateString(undefined, ...)`), where its neighbours use `SCHOOL_TIME_ZONE`. The server renders in UTC, so a material posted between 5 PM and midnight Pacific is server-rendered with the next day's date; whether hydration then corrects the text in the browser was not checked. Changing it changes what a class sees, so it is the class page's call. Suggested one-line change: add `timeZone: SCHOOL_TIME_ZONE` to its `opts`, and re-splice the panel golden's dates.

## Measured

- Targeted runs as above, each under the shell's `TZ=America/Los_Angeles`.
- `npx svelte-kit sync && npx svelte-check` with placeholder public env: 0 errors, 33 warnings in 18 files, the baseline, on 6270ce41 plus this change and again after rebasing onto 7aeaa343.
- Full `npm test`, same Pacific shell. On 6270ce41 plus this change: 972 files, 17508 tests, 1 failed. After rebasing onto 7aeaa343 (lanes 0469 and 0472 landed), run once more: 973 files, 17515 tests, 1 failed, 17514 passed. The one failure both times is `tests/standards-version-header.test.ts` on `IDEA_MORNING_ANNOUNCEMENTS.md` (section 5).

## Not verified

- That production Supabase's `timezone` is UTC: this container cannot reach the database. It is Supabase's default and what CI already assumed.
- The midnight shim proves Postgres and node both moved; it was not run on Windows.
