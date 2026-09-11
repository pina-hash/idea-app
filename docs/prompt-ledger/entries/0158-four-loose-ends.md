# 0158 Four loose ends: the update log, a test that reads as a rule, the template's alt line, and the README

- Issued: 2026-09-11
- By: router chat
- Owns: `classroom-updates.json` AT THE REPO ROOT,
  `src/lib/legacy/assignments/idea100-blade-01.html`,
  `tests/html-assignment-port.test.ts`,
  `src/routes/dev/html-assignment/fixtures/+page.svelte`, `README.md`,
  `docs/prompt-ledger/entries/0158-*`, and its own `docs/history/` entry
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0198
- Status: issued
- Branch: `claude/dreamy-keller-8ggrbi`, branched from `origin/integration` at `10565935`
- Notes: Four ends each left deliberately by the lane that found it and each named in a
  history entry. (1) The classroom update log, which four lanes declined to write into
  because the root JSON was a shared write point, plus the one entry that was left to a
  person to word: sketch order and captions were repaired today but WORK ALREADY SAVED IS
  NOT REPAIRED, because `loadData` pushes images in stored order. (2) Ledger 0153's
  finding that `tests/html-assignment-port.test.ts` asserts the sandbox tokens of a second
  literal in the fixtures harness that does not read `HX_SANDBOX_FLAGS` -- green, stricter
  than the real frame, and reading as a rule about the feature while being merely true of
  one file. (3) The third of ledger 0137's template fixes, `img.alt`, which ledger 0150
  deliberately left because a third change to a live file wanted its own decision.
  (4) `README.md`, which still describes the project as foundation-only.
  **NO MIGRATION.** Ledgers 0156 and 0145 run in parallel and own
  `src/lib/classroom/html-assignment/**` and the IdeaCAD tree; neither is touched.
  `STORAGE_KEY` in the Blade assignment does not move. `verify:readme` deliberately not
  run: no route spec is added.
