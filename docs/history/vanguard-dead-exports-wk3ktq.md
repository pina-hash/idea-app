---
title: "VANGUARD: dead exports removed, CHANGELOG check made real"
date: 2026-08-28
branches: [claude/vanguard-dead-exports-wk3ktq]
migrations: []
subsystems: ["VANGUARD"]
---

Two independent pieces of cleanup in `src/lib/vanguard-save.ts` and the
version/changelog tooling around the VANGUARD build, both scoped by an
explicit file-ownership list (a sibling session owns `CLAUDE.md` and
`src/routes/vanguard/+server.ts` concurrently).

### Three dead exports, confirmed rather than trusted

A prior audit (`docs/VANGUARD_BACKLOG.md`) claimed three exports in
`vanguard-save.ts` had no reader. Re-swept myself across `src/`, `tests/`,
`static/` and `tools/` before touching anything -- every other hit for the
strings `Snapshot` and `PrefBucket` was an unrelated word inside a comment in
`static/fsp/day2/*.js`, `PhotoStager.svelte` or the archived coin-desk
migrator, never the type.

- **`flattenForDevice`** (was `:352`): deleted. Zero callers, and the audit's
  claim that it is also wrong was worth re-checking: it spread `progression`
  and then overwrote from the per-device pref bucket, skipping only `_ts` and
  never `MIGRATED_PREF_KEYS` -- so a caller would have silently let a stale
  per-device pref shadow a synced achievement value. Confirmed correct; not a
  reason to keep it, since `mergeIntoStored` already deletes those keys on
  write and nothing calls this function anyway.
- **`Snapshot`** (was `:23`): deleted, zero references anywhere. Every caller
  already spells the same shape inline as `Record<string, string>`.
- **`PrefBucket`** (was `:26`): kept, `export` dropped. It backs `StoredSave`
  in the same file (`:31`), so it is not dead, only its export was.

### The version/changelog check: made to actually run, and found red

`tools/post-commit-vanguard.js` was written as a local git `post-commit`
hook, but `.git/hooks/post-commit` does not exist and `core.hooksPath` is
unset -- confirmed directly. It could never have run in this project anyway:
every session here is an ephemeral cloud clone with no persistent
`.git/hooks/` to install into. The file's own header already documented
this and the drift it produced (VERSION read `213` with no `CHANGELOG`
entry for it, against a hand-maintained process).

Deleted that file and replaced it with `tools/check-vanguard-changelog.mjs`,
a pure checker (`checkVanguardChangelog(html)`) plus a CLI wrapper that reads
the real build and exits non-zero on a mismatch. Wired into
`.github/workflows/ci.yml` as its own named step (`VANGUARD changelog
check`), `continue-on-error: true` alongside the existing check/test steps so
one push reports every failure, folded into the same final
fail-the-job gate. Not generative: a missing entry fails loudly rather than
being synthesized, because a generated line would describe nothing about
what actually changed.

**Proven both ways**, per `tests/vanguard-changelog.test.ts`: a fixture
VERSION with a matching CHANGELOG entry passes; one without fails, with a
message naming the missing version; a build with no `VERSION` constant at
all fails; a build with no `CHANGELOG` array at all fails. All four run
against small in-memory fixtures, never against the real file, so the test
stays meaningful regardless of the real file's own state.

**It was genuinely red.** `node tools/check-vanguard-changelog.mjs` against
the shipped build reported `VANGUARD VERSION is '213' but CHANGELOG has no
entry with ver:'213'` before any fix. Traced the cause with the repo
unshallowed (the working clone starts shallow and the relevant commits
predate its boundary): `bfe0a52` ("Gate VANGUARD's DEV mode behind the admin
check TUNE already uses...") bumped `VERSION` 211 -> 213 and added a `213`
CHANGELOG entry with that exact sentence, on a branch that forked from the
same base as a sibling branch (`b95478c` + `f7afba5`, the REPORT-a-problem
feature) which independently bumped to `212` with its own entry. The merge
commit `685d6aa` resolved the conflict by keeping `VERSION='213'` but the
`212` entry from the other side, and the `213` entry that gave that number
meaning was lost in the resolution -- not invented here, recovered: the
sentence is `bfe0a52`'s own commit, verified against its diff of this exact
file, not a description of unverified behavior. Restored it as the newest
`CHANGELOG` entry, so `check-vanguard-changelog.mjs` now passes against the
real file too (both fixture-based and real-file checks are asserted
separately: the test suite never touches the real build, and the CI step
never touches a fixture).

`package.json` was swept for any reference to the deleted hook file --
none existed, so nothing there needed cleanup.

### Verification

- `svelte-check`: 0 errors / 37 warnings, matching the documented baseline
  (the new `.mjs` file needed one `@param` JSDoc annotation to satisfy
  `checkJs`, which is on repo-wide).
- `npm test`: 141 files, 3211 tests, all green (includes the four new
  `vanguard-changelog` tests and the three pre-existing VANGUARD test files,
  re-run to confirm the `vanguard-save.ts` deletions didn't regress the
  achievement-merge, admin-gate or feedback-path suites).
- Not verified: a live GitHub Actions run of the new CI step (no CI access
  from this session); the actual VANGUARD game screen in a browser (no UI
  change was made to it, only the served build's own CHANGELOG data).

### Not done, deliberately

Did not touch `src/routes/vanguard/+server.ts`, `docs/VANGUARD_BACKLOG.md`,
`CLAUDE.md`, anything under `src/lib/classroom/`, or any migration, per the
task's explicit ownership boundary -- another session owns `CLAUDE.md`
concurrently. `docs/VANGUARD_BACKLOG.md` still names the three exports as
findings; that file is out of scope here and is left for whoever owns it to
update against this fix.
