---
title: "A cloud session cannot reach the production database: the relay accepts CONNECT to 5432 and then carries nothing, measured at the TCP level. 0185 gains the probe it could not be applied without, and the 0-error svelte-check baseline 0072 left red is restored (`claude/database-migration-probe-dnxvth`, migration 0185, NOT APPLIED)"
date: 2026-09-06
branches: [claude/database-migration-probe-dnxvth, claude/upload-limit-fiction-jv9w43]
migrations: ["0185"]
subsystems: ["Toolchain", "Storage", "Foundry"]
---

Prompt 0072 wrote 0185 and could not apply it, for two reasons it established
precisely. This bundle was issued to finish both. One of them is fixed. The
other turned out to be a property of the container that no amount of code in
this repository can change, and saying so plainly is the most valuable thing
this session produced.

## THE ANSWER: NO. A CLOUD SESSION CANNOT REACH THE PRODUCTION DATABASE.

This is the sentence the bundle existed to produce, and it decides whether
future migrations apply themselves or Mr Pina keeps pasting them. He keeps
pasting them.

The environment DID change, exactly as the prompt said it had, and that half is
worth recording because it removes a false explanation. `registry.npmjs.org`
answers `HTTP/2 200`, `npm ci` completes in 12 seconds, `node_modules` is
populated and `tools/apply-migration.mjs` loads `pg` without complaint. Prompt
0072's blocker is genuinely gone. It stopped before opening a socket; this
session opened one.

What it found is a failure ONE LAYER DEEPER than the one 0072 was blocked at,
and it is a failure that looks exactly like success for the first 39 bytes.

**THE PROXY ANSWERS `200 Connection Established` FOR PORT 5432 AND THE ANSWER
IS OPTIMISTIC.** `apply-migration.mjs`'s own header says the proxy "DOES answer
`200 Connection Established` for a CONNECT to 5432, so this tunnels through it".
That sentence is still TRUE and it is not enough. Measured directly, with a raw
socket rather than through the tool:

    1. CONNECT aws-1-us-east-1.pooler.supabase.com:5432
       -> HTTP/1.1 200 Connection Established          (39 bytes, immediately)
    2. Postgres SSLRequest sent                        (8 bytes: len 8, code 80877103)
    3. awaiting the one byte the server owes ('S' or 'N')
       -> TimeoutError after 30.0s. Nothing. Ever.

The relay's own log, read from `$HTTPS_PROXY/__agentproxy/status`, agrees and
is the better witness because it counts bytes from the other side:

    kind:   ws_closed_mid_exchange
    detail: tunnel closed (code 1006, Connection ended) after 36s;
            8 B sent, 39 B received, client reading, 0 B still queued
    host:   aws-1-us-east-1.pooler.supabase.com:5432

**THE `39 B received` IS THE TELL, AND IT IS WHY THIS IS WORTH WRITING DOWN
RATHER THAN JUST REPORTING "IT FAILED".** It reads at a glance like the database
answered. It did not. `HTTP/1.1 200 Connection Established\r\n\r\n` is EXACTLY 39
bytes, so that count is the proxy's own CONNECT header and nothing else: zero
bytes have ever arrived from the pooler. Every other failed host in the same log
-- `accounts.google.com:443`, `android.clients.google.com:443`,
`redirector.gvt1.com:443`, all Chromium's own background traffic from the
browser harness -- shows the identical `39 B received`, which is the control
that settles what the number means.

So the relay accepts the CONNECT unconditionally, forwards the 8 bytes upstream,
never delivers a byte back, and drops the WebSocket with code 1006 after 36s.
`pg` surfaces that as `read ECONNRESET`, and the tool reports
`apply-migration: could not connect (read ECONNRESET)`.

**WHAT THE TOOL DID WITH THAT IS THE ONE PIECE OF GOOD NEWS: IT FAILED CLOSED.**
Not one byte of SQL was sent, on either attempt. The connect failure happens
before the probe, which happens before the ordering verdict, which happens
before `applyInTransaction`. There is no state in which this leaves the
production database half-changed, and the migration's own idempotence never had
to be relied on. Both attempts took 36.2s and ended identically.

**WHAT WAS NOT TRIED, DELIBERATELY.** The prompt forbade changing the connection
string, reaching for another client, and working around it, and none of that
happened. In particular port 6543 (Supavisor transaction mode) was NOT tried:
it is a different connection string, it is exactly the "work around it" the
prompt refused, and a session that got in through a door the sanctioned tool
does not use would have proved something nobody can rely on next time. Two
attempts were made and both are transcribed in the session report.

**WHAT WOULD HAVE TO CHANGE.** Nothing in this repository. The egress relay
would have to actually carry TCP to `aws-1-us-east-1.pooler.supabase.com:5432`,
the way it already bypasses the relay entirely for `registry.npmjs.org` (which
is in `NO_PROXY`, which is why `npm ci` works and why the two facts are not in
tension). Until that host is carried, `tools/apply-migration.mjs` is a tool for
a laptop and not for a cloud session, and every migration this repo writes is
applied by hand.

## 0185 NOW HAS A PROBE, AND IT IS LOAD-BEARING RATHER THAN A MARKER

The second of 0072's two blockers was real and is fixed.

`tools/idea-status.py` derives a migration's applied-state probe from the FIRST
OBJECT the file creates. 0072 was told its migration should write
`storage.buckets` rows "and nothing else. No policy, no table, no function."
A file that creates nothing has no probe; its state reads `unknown` for ever and
`orderVerdict` refuses it, correctly, because cannot-say is never a pass.
Measured on 0072's file as shipped: `first_object(0185) -> None`.

Measured after this bundle: `first_object(0185) -> function
public.portal_upload_max_bytes`, with the probe
`exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'portal_upload_max_bytes')`.

**THE OBJECT IS THE CEILING ITSELF, AND EVERYTHING ELSE IN THE FILE READS IT.**
`public.portal_upload_max_bytes()` returns 47185920 and the update, the
self-check and the census all call it, so **47185920 appears exactly once in the
executable half of the file** (asserted, not claimed). That was the design
decision worth making: a probe object nothing else uses is a thing a later
session deletes as dead weight, and this one cannot be dropped without the file
ceasing to run. It also does something useful in its own right -- the database
now states the number instead of only the app.

It is IMMUTABLE, it is NOT `security definer`, and it carries no `search_path`
pin. Both of those exist to stop a caller's schema resolution reaching an object
the function did not mean, and this body names no object at all, so a pin would
be cargo. That reasoning is written in the file beside the function.

**IT REVOKES FOR ITSELF, NAMING THE ROLES**, because a function created after
0137 arrives with a fresh `anon` grant from the hosted project's default
privileges and `revoke ... from public` alone would not remove it.
`anon` is refused on the merits and not by reflex: no anonymous caller has an
upload path, since the one public write (anonymous feedback) goes through
`service_role`. Asserted from `has_function_privilege` rather than from the
migration's own text: anon false, authenticated true, service_role true.

`--allow-dml` is still required, and the refusal is worth quoting for whoever
applies this by hand, because it happens OFFLINE, before any socket:

    NOTE line 191: top-level DML -- ...
    REFUSING: 1 top-level DML statement(s). Re-run with --allow-dml if that is
    deliberate. Nothing was sent.

## 0072'S WORK WAS RED, AND FOUR OF THE FIVE ERRORS WERE THE TRIPWIRES

0072 ran no test suite, no `svelte-check` and no browser pass. This session ran
all three, which is how the following was found.

**FIVE `svelte-check` ERRORS AGAINST A 0-ERROR BASELINE, ALL IN 0072'S OWN
FILES**, all reading `Property 'id' does not exist on type 'never'`. The cause
is a genuinely interesting one and worth the paragraph: 0072 gave EVERY row in
the ceiling table a numeric `maxBytes`, and `CEILINGS` is declared
`as const`, so each `maxBytes` became an exact numeric literal. TypeScript could
then prove every `maxBytes == null` branch unreachable and narrowed the row to
`never` inside it. **The errors landed on the deliberate TRIPWIRES, not on a
mistake** -- the page literally says "kept as a tripwire" and the test says "the
guard rule stays either way", because this table has carried nulls before.

Deleting those branches to satisfy the checker would have deleted the guard, so
the TYPE gave way instead. `UPLOAD_CEILING_LIST` is now
`readonly (UploadCeiling & { readonly id: UploadPathId })[]`, which keeps `id`
narrow (the reason it was `typeof CEILINGS` in the first place -- a caller
iterating the list passes `row.id` straight into `uploadTooLargeMessage` with no
cast) while reading `maxBytes` as the `number | null` the interface declares.
Back to **0 errors, 37 warnings, 31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`**, breakdown intact.

**AND ONE REGRESSION THIS SESSION CAUSED ITSELF, CAUGHT BY 0072'S OWN TEST.**
Making the update call the function broke `tests/upload-limits.test.ts`'s static
chain parser, which matched two numeric literals inside the `least(coalesce(...))`
form. That parser is a second implementation of SQL and is only safe because the
database half reddens when it disagrees -- which is exactly what happened, and
is worth recording as the mechanism working rather than as an inconvenience. It
now resolves a ceiling stated as a constant-returning function the same file
defines, and `resolveCeiling` **THROWS** on anything it cannot resolve rather
than returning a default: a resolver that quietly answered null would make the
cap sweep parse as nothing, every bucket would keep whatever it had, and the two
assertions reading it would pass over a chain nobody had modelled. Proved by
mutation -- renaming the call site to `public.renamed_ceiling()` reddens 2
assertions with that exact sentence, and the migration was restored from a `cp`
copy and md5-verified identical (`d19d0eabeaaf4e5d90e72cd780a0baca` both sides).

## WHAT WAS MEASURED

Full suite, `npm test`, at the start of the session: **292 files, 2 failed /
290 passed; 5947 tests, 4 failed / 5943 passed**. At the end: **292 files, 1
failed / 291 passed; 5953 tests, 2 failed / 5951 passed**.

**THE 4 STARTING FAILURES ARE PRE-EXISTING ON `origin/main` AND ARE NOT THIS
BUNDLE'S OR 0072'S.** That is not inferred from reading them: both files were
run in a worktree at the merge-base `13d1747`, where they fail identically --
4 failed / 30 passed. Doing that first was what stopped a session spending its
time fixing somebody else's red.

The 2 that remain are `tests/gauntlet-doc.test.ts`: `docs/GAUNTLET.md` has no
migration-table row for `0184`, which landed on `main` without one. That file is
outside this bundle's ownership and is reported rather than fixed. The other 2
were `tests/derived-numbers.test.ts`, and this session fixed them by
regenerating the measured region, below. The +8 in the passing count is the six
assertions of the new `tests/db/bucket-limits-probe.test.ts` plus the two
`derived-numbers` cases that went green.

`npx svelte-check`: **0 errors, 37 warnings** (31/5/1), re-derived after
`svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported, per
the standing note about a checkout with no `.env`.

**BROWSER PASS ON `/dev/upload-limits` AT 375 AND 1440: 2 route/width runs, 52
measurements, 0 outside threshold.** Run 2026-09-05 23:37 PDT. This is the FIRST
TIME that surface has ever been measured -- 0072 created it and could run
nothing. Measured values rather than ticks: 0px horizontal overflow at both
widths (scrollWidth 1440 vs clientWidth 1440, and the same at 375); contrast
14.66:1 for the refusal sentences, 6.91:1 for the global/portal figures, 5.62:1
for the stated tags against the 3:1 non-text floor; 13 ceilings present and
visible, 0 aria-hidden; "0 of 13" paths still stating nothing; 0 console errors.

**AND THE FULL MEASURED REGION IS REGENERATED, WHICH IS WHAT FIXED
`derived-numbers`.** `npm run verify:readme` on a clean tree at `9d47b27`:
**232 route/width runs, 3420 measurements, 2 outside threshold, 553.3s**,
selftest 70 controls (36 negative, 34 positive), **0 instrument failures**.
Coverage went **107 -> 116 route specs**: all nine specs the block had never
measured are now measured, `upload-limits.mjs` among them. The 2 outside
threshold are UNCHANGED and are still the two `/dev/notebook` `tap-reach` rows
that decision 12 owns with an owner against them -- so the count staying at 2
across a 278-measurement widening is the result, not a coincidence to explain
away.

## NOT VERIFIED, EXPLICITLY

- **The migration has NOT been applied.** Nothing in this session reached the
  production database, so every claim 0185 makes about what fifteen live
  `storage.buckets` rows currently hold is still 0072's reading of a dashboard
  screenshot, unverified against the database. The file's own BEFORE/AFTER
  notices and its census are what will settle that, at apply time, in front of
  whoever applies it.
- **The census has never run**, so the question 0072's prompt asked -- what a
  real student app bundle actually weighs, and whether 45 MiB has ever been
  approached -- is still open and will be answered by the notice the file
  prints.
- **No signed-in surface was verified.** The browser harness covers `/dev`
  routes only. Web fonts do not load in it (`fonts.googleapis.com` is blocked),
  so all text was measured in the fallback stack, and
  `prefers-reduced-motion` was `no-preference` throughout, so that path was not
  exercised.
- **No changelog entry was added, deliberately.** 0072 already wrote a
  student-facing entry for the Foundry ceiling drop, which is the only
  student-visible thing in the two bundles combined. Everything this session
  changed -- a probe function, a TypeScript type, a test parser -- is invisible
  to a student, and CLAUDE.md is explicit that a change with no student-visible
  effect needs no entry and that an entry naming internals "is a commit message
  that wandered into the wrong file".

## LEFT UNDONE, FOR SOMEBODY ELSE

- **`docs/GAUNTLET.md` needs a migration-table row for `0184`.** Two tests have
  been red on `main` since it landed. Outside this bundle's ownership.
- **`tools/apply-migration.mjs`'s header should say what this session
  measured.** It currently records that the proxy answers 200 for a CONNECT to
  5432 and reads as though that settles it; it does not, and the next session to
  try will spend the same 36 seconds twice discovering so. The honest amendment
  is one paragraph: the CONNECT is accepted, no upstream byte ever arrives, and
  the tool fails closed. Not written here because that file is outside what this
  bundle owns.
