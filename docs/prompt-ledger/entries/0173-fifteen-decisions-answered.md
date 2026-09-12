# 0173 Fifteen decisions answered on 2026-09-12, recorded

- Issued: 2026-09-12
- By: router chat
- Owns: `docs/decisions/entries/**`, `docs/prompt-ledger/entries/0173-*`, and its own
  `docs/history/` entry. NO MIGRATION. NO FILE UNDER `src/`, no test, no workflow.
- Migration permitted: no. Claims: none.
- Status: pushed
- Branch: `claude/charming-noether-orxz1v`, branched from `origin/integration` at `eef6e85`
- Notes: Mr. Pina answered fifteen open decisions on 2026-09-12. This bundle RECORDS
  them: `- Status:` set and `- Decision:` written in HIS words, not the session's, with
  no relitigating, no softening and no conditions he did not state. Where he decided
  against the predecessor's stated default, the entry says so plainly.

  **TWELVE CLOSE AS DECIDED OR WITHDRAWN**: 04 gallery order to MOST PLAYED (against
  the shipped newest-first default), 07 Foundry stats FULLY PUBLIC in two layers, 14
  profile photos KEEP, 17 tournament thumbnails KEEP PUBLIC, 18 map photos PUBLIC
  including drafts, 20 the maps guesser game ON HOLD gated on CONTENT not a date, 01
  Foundry class disable ALREADY SHIPPED (closed as already-done, not as decided), 05
  publishing requires a description NO (decided-against), 02 the coin ledger test RLS
  policy REMOVE IT (decision recorded, build left to ledger 0174), 23 link-preview DNS
  pinning LEAVE AS IS, 11 the Cosso Unit 1 checkpoint image STALE, 21 the blocking
  merge gate YES BLOCK.

  **THREE ARE BUILDS, NOT DECISIONS**, rewritten as scoped build items measured with
  file and line: 03 the Foundry gallery as a thumbnail mosaic, 08 a real spreadsheet
  engine inside a note, and 07's per-user layer.

  **ONE IS A CONTRADICTION AND WAS MEASURED RATHER THAN RECORDED**: 13 says the spec
  table lost drag-to-reorder; Mr. Pina reports it works for him now. No code was to be
  changed either way.

## Outcome

**Duplicate check, three ways, all clear.** (1) `git log --oneline
origin/main..origin/integration` returned FOUR subjects, all ledger 0172 and the
presence heartbeat -- nothing about decisions. (2) The ledger entry directories on
`main` and `integration` were fetched LIVE from the GitHub API rather than read from
the mount: neither carries a `0173-*`, and the highest on either is `0172`. (3) Every
`refs/remotes/origin/*` was swept for a ledger entry numbered 0170 through 0179: only
`0170` (main, integration, two branches), `0171` (`claude/pensive-turing-inj1ih`) and
`0172` (integration) exist, none of them this work.
`node tools/migration-claims.mjs` reports highest landed `0203`, next free `0204`, two
claimed-not-landed (`0190`, `0191`); this bundle claims none.

**The three fetches and the identity check.** `git fetch --unshallow origin` completed
and `.git/shallow` is gone (2209 commits on `origin/main`); `git fetch origin
integration` exit 0; `git fetch origin main` exit 0. The identity was already set --
`user.name` `Claude`, `user.email` `noreply@anthropic.com` -- so nothing had to be
configured.

**Branch-slug collision check.** `origin/claude/charming-noether-orxz1v` already
existed, pointing at `main`'s tip `d578826` with no commits of its own, and no
`docs/history/` entry carries this slug on any ref. So the slug is free and needs no
suffix.

**Production reachability**, checked before the merge: `https://ideabosco.com/`
**200** in 0.68s; `https://ideabosco.com/coins/` **308** and
`https://idea-app-sage.vercel.app/` **308**, both of which are the documented
redirects. `DEPLOY_PROBE_URL` is UNSET in this container, so the applied set is CANNOT
SAY and never "applied"; this bundle carries no migration, so gates 4 and 5 have
nothing to confirm and ledger 0114's gate-4 substitution applies as written.

**Baselines, read off `origin/integration` at branch time**, before any edit: full
suite **405 files / 7819 tests / 0 failures** in 365.8s, and `svelte-check` **0 errors
/ 38 warnings / 21 files** (32 `state_referenced_locally`, 5 `css_unused_selector`,
1 `perf_avoid_nested_class`). Both re-run after the edits: suite **405 / 7819 / 0** in
374.2s, `svelte-check` **0 / 38 / 21** with the same 32/5/1 breakdown. Unchanged in
both, which is the expected answer since nothing outside `docs/` was touched.

**`main` and `integration` went level at `01723427` while this bundle ran** -- ledger
0172's presence heartbeat landed on `main` -- so the branch point `eef6e85` is now an
ancestor of both and `git diff --name-only eef6e85 origin/main` is EMPTY. There is no
overlap of any kind with what moved.

**Outcome.** Fifteen entries written. Open decisions go from 8 to 4: 13, and the three
IdeaCAD entries 24, 25 and 26. Two findings came out of the measuring and are the part
worth reading:

- **DECISION 05 HAD ALREADY BEEN BUILT ON THE DEFAULT HE JUST REVERSED.** Prompt 0015
  shipped the required description on 2026-09-02 in
  `0173_foundry_section_gate_description_and_trust.sql` section 2 while entry 05 was
  still `open` with a blank Decision line. So a reversal is now owed in three places,
  and whether it is urgent turns on whether that migration is applied -- which no file
  in this repo records and this container cannot ask.
- **DECISION 13 WAS RIGHT AND MR. PINA IS USING A DIFFERENT SCREEN.** The spec table
  has two row controls and no `moveRow`, at every width and on `main`. Five other
  classroom surfaces still reorder, `ClassView`'s class stream being the one an
  instructor actually rearranges.

**Reported, not fixed.** `CLAUDE.md`'s `svelte-check` baseline says 40 warnings in 22
files (34/5/1); this tree measures 38 in 21 (32/5/1). Ledgers 0168 and 0172 each
reported the same gap for the same reason and `CLAUDE.md` is outside this bundle's
owned surface, so it is reported a third time rather than edited. Also reported: entry
17's `Status` line began with the word `open` while its body said ANSWERED, so it had
been printing as an owed decision since 2026-09-06; and `RubricBuilder.svelte`'s
reorder arrows measure 28px on a desktop, which is decision 09/12's shape and is noted
in entry 13 rather than acted on. Per the prompt, `verify:readme` was NOT run.
