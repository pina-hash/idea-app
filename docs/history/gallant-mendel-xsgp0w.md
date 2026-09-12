---
title: "Prompt 0193: reading back over ledgers 0103 through 0192 -- five questions, and the eight open items that had already shipped (`claude/gallant-mendel-xsgp0w`)"
date: 2026-09-12
branches: ["claude/gallant-mendel-xsgp0w"]
migrations: []
subsystems: ["records", "migrations", "testing", "workflows"]
---

Forty-odd bundles landed in three days and nobody had read back over any of them. This
bundle reads, measures and writes one document: `docs/audits/2026-09-12-ledgers-0103-0192-read-back.md`.
It changed no file under `src/`, no test, no migration, no workflow and no decision entry.
Every finding is reported with a file and a line and none is fixed.

## What the audit answers, and where the evidence came from

The five questions and their answers are in the audit itself and are not restated here.
What belongs in the record is the METHOD, because two of the five answers depend on it.

**Question 1's whole value was the re-check, and the prompt was right to demand it.** 82
phrase hits across the 75 in-window entries narrowed to about thirty entries carrying an
explicit "Reported, not fixed" or "Left undone" section. Putting each item to the tree
produced **eight still open and eight already shipped** -- a fifty percent stale rate, which
is worse than the "four of eight" the prompt braced for. Copying that list forward
unchecked would have handed Mr. Pina a to-do list half of which was done, and the two most
embarrassing entries would have been `student_app_plays` (closed by `0204:396`, with
`CLAUDE.md:602` already carrying the corrected sentence) and decision 04, whose own
`Build: OPEN` line names `FoundryGallery.svelte` line 127 while
`src/lib/foundry/telemetry.ts:192` has read `FOUNDRY_GALLERY_DEFAULT_SORT = 'played'` for a
day.

**Question 2 came back empty and that is the reported result.** The six instrument failures
the prompt lists were all found in this window, and the durable thing to record is that the
sweeps written AFTER them carry the controls: `tests/db/ideacad-grants-anon-execute-surface.test.ts`
has eleven separate non-vacuity floors, `classroom-spec-text-surfaces.test.ts` asserts both
`specs.length >= 10` and `checked > 500` over a directory the app writes, and
`tools/run-tests.mjs` pairs `--reporter=json` with `--outputFile` and fails closed when no
report exists. Four negative probes came back clean and are worth naming so the next audit
does not repeat them: no `.skip`/`.todo`/`skipIf` anywhere in `tests/`; no `git checkout --`
inside any test or tool (the five hits are comments citing the rule); one `existsSync` early
return, and it sits above a `files.length > 100` control; no test asserting a migration
property by regex where the regex could match nothing.

**A single-line grep for the revoke shape reports three migrations as broken that are not.**
`0205`, `0207` and `0208` all write `revoke all on function` with the function list on the
following lines and `from public, anon, authenticated;` at the end, so
`grep 'revoke all on function.*anon'` misses every one of them and a reader concludes they
repeated `0201`'s defect. They do not. Read the statement, not the line.

## The one finding that outranks the rest, and why no tool was going to say so

`docs/decisions/entries/21-*` is `decided 2026-09-12. YES, BLOCK` with `- Build: OPEN`, and
`.github/workflows/integrate.yml` still merges, pushes and deletes before `merged_suite`
runs. **`tools/idea-status.py:188` filters `Status: open` and never reads `Build:`**, so a
decision Mr. Pina has already answered whose build has not happened appears in no list this
repository prints. Two entries sit in that state. That is the structural half of question
5's answer: a `docs/history/` entry is a dated record that is never edited, so an item
parked in one has no state to advance and no reader; a decision entry has a `Status` a tool
prints. Teaching that tool to read `Build:` would have surfaced both without anybody reading
75 history files.

## Measured

- **Full suite on the clean committed tree: 433 files, 8318 tests, 0 failures**, `npm test`,
  exit 0, 453.9s. Identical to ledger 0188's merged-tree figure.
- **`svelte-check`: 0 errors, 37 warnings in 20 files** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`). This **agrees with `CLAUDE.md`** and
  needed no correction -- the second consecutive lane for which that is true, after five
  straight corrections. `npm ci` then `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
  values exported first, per the phantom-error rule.
- **`npm ci` rewrote nothing**: `git diff --stat package-lock.json package.json` empty.
- **Duplicate check for 0193, three ways, all clear**: `git ls-tree` on `origin/main`; a
  sweep of every `refs/remotes/origin/*` (60+ agent branches, `integration` included) for
  `/0193-`; and a live GitHub API directory listing of `docs/prompt-ledger/entries` at
  `refs/heads/main`, 168 entries, highest `0188`. `tools/migration-claims.mjs`: highest
  landed `0208`, next free `0209`, `0190`/`0191` held by a lane -- consistent with
  `Claims: none`.
- **Three live fetches, all 200**: `docs/standards/REGISTER.md` (8536 bytes,
  byte-identical to `origin/main`, so no protocol-following delivery is newer), a known
  ledger entry blob, and `docs/decisions/README.md`.
- **Identity**: `get_session` reports `session_context.model` and
  `external_metadata.last_served_model` both `claude-opus-5`, effort `high`. No fallback.

## Not verified

- **Production.** `https://ideabosco.com/` and `https://idea-app-sage.vercel.app/` are both
  refused by this container's proxy: `CONNECT tunnel failed, response 403`, code `000`. No
  URL was substituted, so the audit's item 3 (`deploy.date` stamping `local build`) rests on
  the arithmetic in `site-versions.ts` and `vite.config.ts` plus ledger 0192's own
  production reading, not on a fresh one.
- **`npm run verify:browser` was not run.** This bundle touches no file under `src/`.
- **`verify:readme` was not run**, on the prompt's own instruction.
- **The `-03`/`-04` export doubling** is a runtime property. The base64 literal does not
  appear in the source files, so it could not be confirmed statically and is reported as
  unverified rather than asserted.
- **`0202`'s re-apply raise** is `0206`'s own quoted measurement against production, not one
  this bundle took. It cannot be reproduced from a chain, because in a fresh chain `0202`
  applies when exactly `0201`'s ten functions exist and its guard passes.

## Left undone, by name

- **Every finding in the audit.** That is the bundle's shape, not an omission.
- **`classroom-updates.json` takes no entry**: nothing a class sees changes.
- The audit is a report, so it creates no decision entry and no ledger item for the things
  it says should become one. Item 1 and question 5 name what those would be; deciding to
  write them is Mr. Pina's.
