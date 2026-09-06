---
title: "Landing the number-allocation bundle over a standards conflict: both 4.21 rules survive, the file goes to 4.22, and the contiguity change has nothing to bite on today (`claude/number-allocation-standards-oe4utb`, no migration)"
date: 2026-09-06
branches: [claude/number-allocation-standards-oe4utb, claude/number-allocation-ledger-c30ms5]
migrations: []
subsystems: ["Tooling", "Migrations", "Testing", "Standards"]
---

Prompt 0087. Started from `origin/main` at `5b3e14b`, in `/home/user/idea-app`.
`origin/integration` was 86 behind and 0 ahead, as the prompt said, so `main` is
the trunk and nothing was taken from `integration`. Git identity was ALREADY
configured in the container (`Claude <noreply@anthropic.com>`), so the "Please
tell me who you are" failure the prompt warns about never arose and nothing was
set. No migration was written and none was applied; production was not reached.

This bundle exists only because prompt 0085 stopped correctly. 0084 built the
claim tool and the contiguity fix on `claude/number-allocation-ledger-c30ms5`;
0085 tried to land it, hit a conflict in a file outside its permitted
resolution set, aborted, and left the branch standing. Everything below is the
resolution of that conflict plus the landing of the rest of the branch
unchanged.

## A1: the conflicts, and the claim that was wrong

Test-merged `origin/claude/number-allocation-ledger-c30ms5` into `origin/main`
in a detached scratch worktree. **TWO paths conflict, not one.** 0085's claim
-- that it conflicts on `docs/standards/IDEA_instructions.md` and nothing else
-- is FALSE as stated:

    Auto-merging docs/standards/IDEA_instructions.md
    CONFLICT (content): Merge conflict in docs/standards/IDEA_instructions.md
    Auto-merging docs/standards/REGISTER.md
    CONFLICT (content): Merge conflict in docs/standards/REGISTER.md

The second one is small and is the same conflict wearing a different hat -- the
`REGISTER.md` row is a restatement of the file's own version and summary -- but
a prompt that had been written to permit resolving only `IDEA_instructions.md`
would still have aborted on it. The other six paths the branch touches
(`docs/history/`, `docs/prompt-ledger/README.md`, the 0084 entry,
`tests/db/migration-0177-tombstone.test.ts`, `tests/migration-claims.test.ts`,
`tools/migration-claims.mjs`) merged clean.

## A2: what each side was saying

**One conflicting hunk in `IDEA_instructions.md`, and it is the CHANGELOG
only.** Both body edits auto-merged, because they are hundreds of lines apart:
`main`'s addition sits in the canned lane ending at ~1205 (the apply clause),
the branch's at ~976 and ~1169 (the migration-number rule). What could not
merge is that both lanes wrote a new top changelog entry at the same anchor,
and -- silently, with no conflict at all -- both bumped the header to the SAME
number:

| | header before | header after | newest changelog entry |
|---|---|---|---|
| merge base | 4.20 (2026-09-05) | -- | 4.20 |
| `origin/main` | 4.20 | **4.21 (2026-09-06)** | 4.21, the migration-APPLY clause |
| the branch | 4.20 | **4.21 (2026-09-06)** | 4.21, the migration-NUMBER rule |

The header line is byte-identical on both sides, so git took it without a
murmur. That is the more interesting half of this conflict: the thing that
would have shipped a document carrying two different 4.21s is the line git was
happiest about.

`main`'s 4.21 says: `tools/apply-migration.mjs` now reads the bundle's own
ledger entry and refuses unless `Migration permitted:` permits one, and a
successful apply writes a committed trace under `docs/migrations-applied/`.

The branch's 4.21 says: a migration number is ALLOCATED IN THE PROMPT and
CLAIMED IN THE SESSION'S FIRST COMMIT, from `node tools/migration-claims.mjs`;
the instruction it replaces (fetch the highest number on `origin/main`) was
measured false rather than merely improved.

**`REGISTER.md`**: one row, same version (4.21) and same date on both sides,
differing only in the summary cell -- `main`'s names the apply clause and the
`docs/migrations-applied/` record, the branch's names the migration-number
rule.

## A3: what the tool does, and what already did part of it

`tools/migration-claims.mjs` (736 lines) reads git and nothing else -- no
database, no browser, no network beyond a fetch the caller already did. It
cannot write and cannot apply. `collect()` builds an inventory from the working
tree, the landed refs, and every `refs/remotes/origin/claude/*`; `classify()`
is pure and takes one, which is what makes it testable against fixtures rather
than against whatever the remote holds this afternoon. It reports LANDED,
CLAIMED-NOT-LANDED (by branch, and by whether the claim came from a `[file]` or
a `[ledger]` line), CONTESTED, holes of both kinds, and the entries that permit
a migration while naming no number -- the shape every collision to date was
written in.

**Measured: 0.708s cold in a scratch worktree, 0.386s user.** Output on the
merged tree: highest landed `0189`, next free `0190`, nothing claimed, eleven
finished entries permitting without naming a number.

**Something on `main` already does part of it, and it arrived after the branch
was cut.** `tools/apply-migration.mjs` (the 4.21 change) has
`permissionLine()` / `ledgerPermission()`, which parse the same
`- Migration permitted:` line, strip the same `Highest on origin/main at issue`
clause, and pull a four-digit number out of the permitting half. So there are
now two readers of that line in the tree. They are not the same question --
`ledgerPermission` gates ONE bundle's own entry on `^no\b` and treats the
number as advisory, while `parsePermitted` ranks five shapes across 81 entries
to answer which numbers are held -- and `tools/apply-migration.mjs` is outside
this bundle's ownership, so nothing was changed there. **It is written down
here because it is exactly the duplication CLAUDE.md warns about, produced by
the same blindness between parallel lanes that this bundle is about**, and
whoever next owns `apply-migration.mjs` should consider having it call
`parsePermitted` rather than keeping a second spelling.

## A4: the contiguity change has NOTHING TO BITE ON TODAY

The change asks `claimMap(classify(collect()))` which kind each hole is: a hole
nothing claims still FAILS, by number, exactly as before; a hole a `claude/**`
branch accounts for passes and names the branch. A git read that throws for any
ordinary reason (shallow clone, tarball, no `git`) yields an empty claim map,
which is the STRICT reading -- so CI, which checks out shallow with no remote
branch refs, is unchanged.

**And the live series is contiguous: `0001` through `0189`, no holes.** So on
this tree the `gaps` assertion answers `[]` whether or not the claim lookup
runs at all, and the change is inert against real data. That is not a defect,
it is the ordinary state -- the hole it was written for (`[186, 187]`, both
held by lanes in flight on 2026-09-06) closed when those lanes landed.

**Which is exactly why it needs a control that does not depend on a hole
existing, and it has one.** The branch's own control constructs the hole: it
walks the contiguous PREFIX of the real series, removes `0177`, and asserts
BOTH halves flip together -- `unexplainedHoles` reports `[177]` and
`inFlightHoles` reports `[]`; then the same hole with
`{177: ['claude/example-lane-abc123']}` reports `[]` and
`[{number: 177, branches: ['claude/example-lane-abc123']}]`. The prefix, rather
than the whole listing, is load-bearing: 0084 measured a whole-listing control
answering `[177, 186, 187, 188]` against an expected `[177]`, which is the same
noise the change removes reappearing one line down. `tests/migration-claims.test.ts`
covers the same two directions as pure unit cases in the `node` project, with
no database. I re-ran the end-to-end version anyway; see the controls below.

## A5: the counts block

`tools/browser-verify/README.md`'s measured region is schema 2, dated
`2026-09-06T10:15:27.901Z` at sha `3a24d2372508d0d908a19562699ed2ba48b6d42f`,
`dirty: false`. **`covered` holds 131 route specs and the static region says
131 route specs**, so the measurement was taken over this tree's set.
`runsMeasured` 262, `measurements` 3932, `outside` 2, selftest 70 controls (36
negative, 34 positive), 0 failures.

**The two outside rows, by identity**, both the same decision and neither a
finding:

    /dev/notebook  375   tap-reach  toolbar text controls (under the floor on width -- decision 12, with the owner)
    /dev/notebook  1440  tap-reach  toolbar text controls (under the floor on width -- decision 12, with the owner)

`tests/derived-numbers.test.ts` passes 18/18 both before and after the merge,
so nothing was regenerated and nothing needed to be.

## B1: the merged clause

The resolution keeps BOTH rules and takes neither side wholesale. The BODIES
needed no work -- they had already auto-merged -- and both were verified
present afterwards by name: `THE NUMBER IS ALLOCATED IN THE PROMPT AND CLAIMED
IN THE SESSION'S FIRST COMMIT` at line 980, `A prompt that permits no migration
writes \`Claims: none\`` at 1008, the corrected "already closes" sentence at
1173, `The tool will refuse unless your own ledger entry permits a migration`
at 1241, and `A successful apply writes \`docs/migrations-applied/...\`` at
1248.

What had to be decided is the VERSION. `main`'s 4.21 is a landed, delivered
record and is not this bundle's to rewrite; the branch's 4.21 never landed
anywhere. So **4.21 stays verbatim as `main` wrote it, the number rule becomes
4.22, and the header goes to 4.22** -- which is also the only arrangement
`tests/standards-version-header.test.ts` will accept, since it compares the
header against `REGISTER.md` (`IDEA_instructions.md` is exempt from the
header-vs-changelog half, because its changelog is date-keyed and
`ENTRY_VERSION` cannot read a version out of `- **2026-09-06 (4.22)**`).

The new entry, verbatim:

> - **2026-09-06 (4.22)** - Two lanes bumped this file to 4.21 on the same day without
>   seeing each other, and the resolution keeps BOTH rules rather than either version
>   number. 4.21 below is the migration-APPLY clause and is untouched. This entry carries
>   the migration-NUMBER rule, which the second lane wrote and could not land: five number
>   collisions in two days, every one of them produced by a session that had verified
>   correctly. Two decision entries numbered `15` six and a half minutes apart; prompt
>   `0074` taken by two sessions three seconds apart and prompt `0075` by two more ten
>   seconds apart; `0077` taken while a renumbered entry already held it; and THREE
>   migrations claiming `0186` inside four and a half minutes, which then produced a fourth
>   pair on `0187` that is still unresolved. The migration-number rule is rewritten: the
>   number is ALLOCATED IN THE PROMPT and CLAIMED IN THE SESSION'S FIRST COMMIT, from
>   `node tools/migration-claims.mjs` (new, in `idea-app`), which reads every ref for landed
>   files, branch files and ledger claims. The instruction it replaces -- fetch the highest
>   number on `origin/main` before choosing one -- is not merely improved but was measured
>   FALSE, and the paragraph that said doing so "already closes" the hazard is corrected in
>   place with the measurement beside it. The ledger entry's `Migration permitted` line
>   gains a `Claims: <NNNN | none>` field so that "no migration" and "a migration whose
>   number nobody has stated" stop reading the same, and the ledger README's pre-issue check
>   gains the tool as its fourth step. Stated plainly in both documents: this does not close
>   the window (two sessions starting seconds apart still collide) and a claim that never
>   lands burns a number until its entry goes terminal. **The two clauses are adjacent and
>   independent**: 4.21's `tools/apply-migration.mjs` reads the ledger entry to decide
>   whether a migration was PERMITTED at all, and this one decides which NUMBER it takes.
>   The version collision that produced this entry is itself the shape both rules exist for.

The `REGISTER.md` row is one cell and cannot hold two summaries, so it was
merged by content rather than by side: 4.22, and the summary now names the
apply clause with its `docs/migrations-applied/` record AND the
migration-number rule, in that order.

## B3: three controls, all re-run here rather than inherited

Every mutation was backed up with `cp` and restored from that copy, with `md5`
checked afterwards. **`git checkout --` was never run.**

**1. A claimed-but-unlanded number reads as claimed and names the branch.**
Run against the real tool, real refs and the real working tree. Before: `next
free 0190`, `CLAIMED, NOT LANDED (0) none`. With `Claims: 0190` written into
this branch's own ledger entry:

    next free           0191
    CLAIMED, NOT LANDED (1)
      0190  claude/number-allocation-standards-oe4utb  [ledger] 0087-land-number-allocation.md

Restored from the `cp` copy -- md5 `a8a5da6b93db5ec24c8b7a88752b9767`, matching
the pre-mutation hash, `git diff` empty -- and `next free` returns to `0190`
with `CLAIMED, NOT LANDED (0)`.

**2. A hole with no claim fails; the same hole with a claim passes and says
which branch.** Driven through the real test file, not through the unit
fixtures.

**The first attempt at this control was the WRONG MUTATION and is worth
recording.** I removed `0188_song_spotify_and_feedback_spam.sql` from the
working tree to make the hole, then added a claim on `0188` -- and the claim
was ignored, because `claimMap` is built from `result.claimed`, which is
CLAIMED-NOT-LANDED, and `0188` is landed on `origin/main` whatever the working
tree says. A number cannot be both landed and claimed, so a hole manufactured
by deleting a landed file can never be excused. The control has to make the
hole ABOVE the landed series.

Redone that way -- a scratch `0191_control_hole_scratch.sql` in the working
tree, leaving `0190` a hole:

    2a, no claim:  AssertionError: the migration series has a hole nothing accounts for.
                   Holes a branch IS holding: none. ... expected [ 190 ] to deeply equal []
                   Tests  1 failed | 3 passed (4)

    2b, with `Claims: 0190` in this branch's ledger entry:
                   CLAIMED, NOT LANDED (2)
                     0190  claude/number-allocation-standards-oe4utb  [ledger] 0087-land-number-allocation.md
                     0191  claude/number-allocation-standards-oe4utb  [file] 0191_control_hole_scratch.sql
                   HOLES A LANE IN FLIGHT ACCOUNTS FOR (2)
                     0190 0191
                   Tests  4 passed (4)

Both mutations removed, ledger entry restored to md5
`a8a5da6b93db5ec24c8b7a88752b9767`, tree clean, the file green again at 4/4.

**3. The standards version test refuses a header disagreeing with its newest
changelog entry, and names both halves.** `IDEA_instructions.md` is structurally
exempt from that comparison, so the control was put to a version-keyed document.
`IDEA_RUBRIC_STANDARDS.md`'s newest changelog entry was moved from `1.3` to
`1.4` against an unchanged `1.3` header:

    AssertionError: IDEA_RUBRIC_STANDARDS.md: the header says 1.3, but the newest
    changelog entry is 1.4. The header has fallen behind its own changelog. ...
    Tests  1 failed | 20 passed (21)

Both halves named. Restored from the `cp` copy (`md5sum -c` OK, hash
`b324a8546a989ad264a413022d5e1cf6`) and green again at 21/21.

## B4: the suite, against a zero baseline

    npm run check   0 errors, 37 warnings, 20 files
                    31 state_referenced_locally / 5 css_unused_selector / 1 perf_avoid_nested_class

Re-derived rather than read off `CLAUDE.md`: `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` were exported as placeholders before
`svelte-kit sync`, per the file's own missing-`.env` rule, so none of the 13
phantom errors appeared.

    npm test   309 files, 6274 tests, 0 failed
               ran 2026-09-06 03:51:10 to 03:55:16 America/Los_Angeles (244.92s)

Against the 308 files / 6,248 tests prompt 0085 left green: **+1 file and +26
tests, and both are `tests/migration-claims.test.ts`**, which reports exactly
26 on its own. Nothing else moved.

## B5: no counts regeneration

No route spec was added and none was needed. `tests/derived-numbers.test.ts`
passes 18/18 (1.51s before the merge, 1.78s after), so the recorded measurement
still covers this tree's 131 specs.

## B6: 0084's sweep-time change, carried forward for whoever owns `integrate.yml`

`.github/workflows/**` was read-only for 0084 and is read-only here, so this is
still UNBUILT. It is copied forward verbatim because a specification that lives
only in a bundle's own history entry is a specification nobody finds. Prompt
0075's branch owns that file.

**Why it matters, and it is the one thing this bundle genuinely does not
close.** `integration` has no opinion about migration numbers, so sweeping BOTH
branches that hold a contested number gives it two files with one number; the
tombstone test's `expect(new Set(nums).size).toBe(nums.length)` then fires and
`integration` goes red for a reason neither author can fix alone. The sweep is
the first moment in the system where two branches are in the same process at
the same time, which is why **this cannot be a test instead**: no branch's own
CI can see the other branch.

### 1. `integrate.yml` -- refuse to sweep a branch whose number another branch holds

One step before "Merge main, then every green claude/** branch", after the
git-identity step (`fetch-depth: 0` is already set, so every ref is local):

```yaml
      # WHICH MIGRATION NUMBERS TWO UNMERGED BRANCHES BOTH HOLD. Sweeping both
      # sides of a contested number gives `integration` two files with one
      # number, which reddens the contiguity assertion in
      # tests/db/migration-0177-tombstone.test.ts for a reason neither author
      # can fix alone. Read once, here, because `fetch-depth: 0` above means
      # every ref is already local.
      - name: Read contested migration numbers
        id: claims
        run: |
          node tools/migration-claims.mjs --json > /tmp/claims.json
          node -e '
            const r = JSON.parse(require("fs").readFileSync("/tmp/claims.json", "utf8"));
            const held = new Set();
            for (const row of r.contested) for (const h of row.holders) held.add(h.branch);
            require("fs").appendFileSync(process.env.GITHUB_OUTPUT,
              `contested_branches=${[...held].join(" ")}\n`);
          '
```

and one gate inside the per-branch loop, immediately AFTER the `ledger_gate`
skip and before the containment check, so its reason lands in the same
`skipped` array and therefore in the job summary under "Left alone":

```bash
            # CONTESTED NUMBER? Leave it alone, and leave the OTHER side alone
            # too. Neither branch is wrong and there is no rule here for
            # picking one; what there is, is a reason a person needs to read.
            case " ${CONTESTED_BRANCHES:-} " in
              *" $branch "*)
                skipped+=("$branch -- holds a migration number another unmerged branch also holds; run \`node tools/migration-claims.mjs\`")
                continue
                ;;
            esac
```

with `CONTESTED_BRANCHES: ${{ steps.claims.outputs.contested_branches }}` added
to that step's `env:` block beside `CI_WORKFLOW_FILE`.

**It fails toward MERGING, deliberately, which is the opposite direction from
`ledger_gate`.** If the tool throws, `contested_branches` is empty and every
branch sweeps exactly as it does today: this gate can only ever ADD a skip.
Holding a branch open costs somebody a look; refusing to sweep on a broken read
would stall the queue on a tool nobody has to have.

**One line of that has moved since 0084 wrote it and must be re-read rather
than pasted blind:** 0084 named "line 1108" for the `ledger_gate` skip.
`integrate.yml` is not this bundle's to touch and its line numbers are not
stable across the edits it has taken since; find the `ledger_gate` skip by
name, not by number.

### 2. `ci.yml` -- let the contiguity assertion see claims (optional)

`ci.yml` checks out shallow with no branch refs, so on a branch legitimately
sitting below a number another lane holds, the contiguity assertion fails with
a hole its author cannot close. One line before the test step:

```yaml
      - name: Fetch claude/** refs so migration claims are visible
        continue-on-error: true
        run: git fetch --depth=1 origin '+refs/heads/claude/*:refs/remotes/origin/claude/*'
```

`continue-on-error` because a failed fetch must degrade to the strict reading
(no claims, every hole fails), never to a red job about a fetch.

**The first is not optional and the second is.** Without the `ci.yml` fetch, CI
is merely stricter than a local run.

## What this closes, and what it does not

**Closes:** the standards conflict that stopped 0085, with both rules intact
and one version number each; and it puts 0084's tool, its 26 tests, its ledger
format, its README and its contiguity change on `main`'s line of descent for
the first time.

**Does NOT close, using 0084's own arithmetic rather than a better-sounding
one:** the mechanism prevents **two of the six** collisions 0084 reconstructed,
not all six. `0187` outright, because that claim sat in git for 29 minutes and
the tool answers in 0.708 seconds. `0186` only because the number came from the
prompt -- all three of those first commits landed sixteen seconds apart, and no
claim mechanism separates commits sixteen seconds apart. Two of the six were
PROMPT numbers rather than migration numbers, and nothing here touches those.
A lane that claims a number and is abandoned still burns it until its entry is
given a terminal status.

## Not verified

- **The live Supabase project was not reached and no migration was applied.**
  This bundle wrote no SQL.
- **`.github/workflows/**` was not edited and neither workflow was run.** The
  sweep-time gate above is a specification, unbuilt and unexercised. Its three
  anchors were re-read from the file, read-only: `fetch-depth: 0` at line 127,
  `CI_WORKFLOW_FILE: ci.yml` in the env block at 154, and `ledger_gate` between
  its own markers at 223-427. That the pasted steps would then WORK is not
  verified and cannot be from here.
- **No browser pass.** `npm run verify:browser` was not run: nothing here
  renders, and `tests/derived-numbers.test.ts` confirms the recorded
  measurement still matches the tree's 131 specs.
- **The tool was not exercised against a CONTESTED number arising from two real
  branches**, only against a claim this branch made about itself. The contested
  path is covered by `tests/migration-claims.test.ts`'s fixtures
  ("two branches holding one number is reported as CONTESTED"), not by a live
  reading.
- **This bundle's own ledger entry does not carry a `Claims:` field.** It reads
  `Migration permitted: no. Highest on origin/main at issue: 0189`, which the
  new format would spell `... no. Claims: none. ...`. It was left as issued
  because an entry is a dated record of what was handed over, and because
  `parsePermitted` resolves it as `refused` either way -- the ambiguity
  `Claims:` removes is on PERMITTING entries, not refusing ones. The README's
  own rule that historical entries are not rewritten to the new format is the
  same argument one day earlier.
