---
title: "A migration number is CLAIMED before the work, not chosen after it: five collisions reconstructed, `tools/migration-claims.mjs`, and a contiguity assertion that tells a skipped number from a held one (`claude/number-allocation-ledger-c30ms5`, no migration)"
date: 2026-09-06
branches: [claude/number-allocation-ledger-c30ms5]
migrations: []
subsystems: ["Tooling", "Migrations", "Testing", "Standards"]
---

Prompt 0084. Started from `origin/integration` (`13d1747`), which is a strict
ANCESTOR of `origin/main` -- four commits behind, zero ahead -- so merging
`origin/main` fast-forwarded to `eec8151` and the two starting points are the
same tree. Git identity was already configured in the container
(`Claude <noreply@anthropic.com>`), so no "Please tell me who you are" arose.
No migration written; none claimed.

## The five collisions, reconstructed from git

Every timestamp is the commit's own author date, in UTC, read off the branch.
Three of the prompt's five claims were WRONG IN DETAIL and the tree is what
corrected them; the fifth turned out to be bigger than stated, and a sixth is
live right now.

### 1. Two decision entries numbered 15 -- 6m 31s apart

| when (UTC) | what | branch |
| --- | --- | --- |
| 2026-09-05 19:37:51 | `docs/decisions/entries/15-scoped-migration-role.md` added (`bfd01ab`) | `full-auto-migration-deploy-w9w48f` |
| 2026-09-05 19:44:22 | `docs/decisions/entries/15-tournament-thumbs-stay-public.md` added (`4ecf48f`) | the foundry-covers lane |

Resolved 2h 33m later by `4aaab23` (2026-09-05 22:17:40), which renamed the
second to `17-tournament-thumbs-stay-public.md`. Both sessions had read
`docs/decisions/entries/` correctly; neither could see the other.

### 2. Two migrations claiming `0146` -- interval NOT RECOVERABLE

`claude/gauntlet-modeling-modes-reveal-75aeej` and
`claude/gauntlet-modeling-modes-reveal-pftzc2` both wrote
`0146_gauntlet_reveal_all_modeling_modes.sql` with materially different SQL on
2026-08-29. **This one cannot be reconstructed from this clone and the report
says so rather than estimating**: `integration` was rebuilt and force-pushed to
drop the duplicate (`docs/history/reconcile-integration-main-lzqcu7.md`), so
`pftzc2`'s commits are unreachable from every ref, `git log --all` finds
nothing, and no history entry for that branch survives. What is left is the date
and the reconciliation account. The interval is unknown; it is not zero and it
is not claimed to be.

### 3. Prompt `0074` taken by two sessions -- 3 seconds apart

| when (UTC) | ledger commit | branch |
| --- | --- | --- |
| 2026-09-06 07:17:44 | `9f4b42a` "Ledger: 0074 duplicate drafts in production" | `duplicate-drafts-production-ru7pag` |
| 2026-09-06 07:17:47 | `8d7aff8` "Ledger 0074: duplicate drafts, and the count nobody has" | `duplicate-drafts-count-wzworl` |

Byte-identical entry files, both parented on `origin/integration` at `13d1747`.
**The prompt said this pair was ten seconds apart. It was three**, and entry
0080's own Notes already say so -- the ten seconds belongs to the NEXT
collision, below.

### 4. `0075` and `0077` taken while the router held them -- 10 seconds and 3m 59s

`ru7pag` stood down from 0074's surface and was re-issued, and its ledger entry
was renumbered three times. Each renumber walked into the next collision:

| when (UTC) | event |
| --- | --- |
| 07:17:44 | `ru7pag` commits `0074-duplicate-drafts.md` |
| 08:03:17 | `ru7pag` renames it to `0075-unsafe-cleanup-query.md` (`2bae581`) |
| 08:03:27 | `red-merge-green-parents-ft3e57` commits `0075-red-merge-green-parents.md` (`3586f9c`) -- **10 seconds later** |
| 08:06:56 | `tournament-thumbs-listing-psuleu` commits `0076-tournament-thumbs-listing.md` (`deb2b55`) |
| 08:09:05 | `ru7pag` renames 0075 -> `0077-unsafe-cleanup-query.md` (`fe109c6`) |
| 08:13:04 | `tournament-bracket-surface-jf28qc` commits `0077-tournament-identity.md` (`c21b440`) -- **3m 59s later** |
| 08:13:29 | `ru7pag` renames 0077 -> `0080-unsafe-cleanup-query.md` (`c06e5ed`), 25 seconds after |

**`0076` shows NO rival in git.** No other ref carries an `0076-*` entry, at any
commit. The prompt's claim that 0075, 0076 and 0077 were "each taken by a
session while the router chat held them unpushed" is true of 0075 and 0077 and
unverifiable for 0076: a number held in an unpushed draft leaves no trace a
repository can be asked about, which is the whole shape of the problem.

### 5. THREE migrations claiming `0186`, not two -- 4m 28s end to end

| when (UTC) | file | branch |
| --- | --- | --- |
| 2026-09-06 07:41:45 | `0186_song_spotify_and_feedback_spam.sql` (`d28f68d`) | `instructor-requests-surfaces-j2dfjc` |
| 2026-09-06 07:44:01 | `0186_classroom_duplicate_drafts.sql` (`f4c30ad`) | `duplicate-drafts-count-wzworl` |
| 2026-09-06 07:46:13 | `0186_maps_media_no_anon_listing.sql` (`495eae0`) | `maps-media-bucket-he0wnn` |

The prompt named two of the three. `wzworl` was in it as well, and renumbered
0186 -> 0187 at 08:19:15; `j2dfjc` renumbered 0186 -> 0188 at 08:42:06;
`he0wnn` kept 0186. Every one of the three had fetched `origin/main`, whose
highest was `0185`.

### 6. AND A SIXTH, LIVE AND UNRESOLVED AT THE TIME OF WRITING: `0187`

`wzworl` renumbered INTO `0187` at 08:19:15. `psuleu` then added
`0187_tournament_thumbs_no_anon_listing.sql` at **08:48:21** -- twenty-nine
minutes after `0187` was already a pushed file on another branch. Both branches
hold `0187` right now. This is the one that matters most for what was built:
the collision did not happen in a blind window at all. The claim was visible in
git for half an hour and the second session had no reason to look, because the
thing it was told to look at is `origin/main`.

### The distribution, which is what justifies the bundle

Of the four intervals that can be measured: **3 seconds, 10 seconds, 3m 59s,
4m 28s (three-way), and 29 minutes**, plus 6m 31s for the decision entries.
So it is not "four of five were minutes or hours apart" -- it is a spread, with
two under fifteen seconds that nothing short of a lock catches, and four
spanning minutes to half an hour that a visible claim does catch.

## The mechanism the claim rests on, verified rather than assumed (A3)

The canned lane ending says the ledger entry is the first commit, pushed alone.
**Measured against real branches rather than the instruction, it is.** Of the 24
`origin/claude/**` refs, 16 carry their own commits past their merge base, and
in **16 of 16** the first such commit adds a `docs/prompt-ledger/entries/*.md`
file. Six of those also wrote a migration -- five distinct lanes, since
`upload-limit-fiction-jv9w43` is an ancestor of `database-migration-probe-dnxvth`
and the two share the first commit `afac3ad` -- and in every one the file landed
well after the entry:

| branch | first commit (ledger) | migration added | gap |
| --- | --- | --- | --- |
| `upload-limit-fiction-jv9w43` -> `...-dnxvth` (one lane) | 05:46:29 | 06:15:15 | 28m 46s |
| `instructor-requests-surfaces-j2dfjc` | 07:17:42 | 07:41:45 | 24m 03s |
| `duplicate-drafts-count-wzworl` | 07:17:47 | 07:44:01 | 26m 14s |
| `maps-media-bucket-he0wnn` | 07:17:58 | 07:46:13 | 28m 15s |
| `tournament-thumbs-listing-psuleu` | 08:06:56 | 08:48:21 | 41m 25s |

**Median 28m 15s.** That window is the whole of what moving the claim buys,
and it is real. The mechanism this bundle rests on exists.

**AND THE MEASUREMENT ALSO BOUNDS IT.** The three branches that took `0186`
pushed their first commits at 07:17:42, 07:17:47 and 07:17:58 -- sixteen
seconds end to end. A claim in the first commit would NOT have separated those
three, because they all made their first commit at once. What separates them is
that the number comes from the PROMPT, allocated by the router chat that issued
all three, rather than being derived by each session independently later.

## What the ledger already said about numbers (A2)

81 distinct entries across every ref, each with exactly one `Migration
permitted` line and no drift between refs. 50 refuse, 1 says a bare `yes`, and
30 use other shapes.

**Eleven already name a specific number BEFORE the work** -- `0011`, `0013`,
`0014`, `0015`, `0016`, `0022`, `0030`, `0031`, `0032`, `0033`, `0034` -- and
seven of those carry an explicit RESERVED clause naming another prompt's number
("`0171` is RESERVED for prompt `0011`"). **Fifteen later ones read "number
taken at commit time"**, which is the shape being replaced. So naming the number
in advance is a practice this ledger HAD and dropped after 0034, not something
invented here; nothing in the format had to change to allow it, and what was
added is only a machine-readable spelling.

Five entries record the outcome after the fact (`TAKEN:`, `TOOK`, `NONE
TAKEN:`), which is the claim arriving after the work, written into the line
that was supposed to prevent it.

Two pairs of committed entries claim the same number and always have -- `0014`
and `0015` both name `0173`, `0031` and `0034` both name `0177` -- and both were
harmless: a conditional claim the lane did not exercise costs nothing, and
`0177` was later filled by 0034's tombstone precisely BECAUSE 0031 reserved it
and never wrote it. That measurement is why the new corpus assertion is scoped
to entries at `issued` and says so in its own comment.

## What the contiguity assertion did with a hole (A4), and what it does now

It read the working-tree directory listing, walked min to max, and asserted the
gap list was empty. It never touched git, so it had **no way whatsoever** to
tell a number a landed migration skipped from a number a branch is holding.
Verified by listing each branch's own directory: `j2dfjc` reports holes
`[186, 187]` (both held by other lanes), `wzworl` reports `[185, 186]` -- where
`185` is a third kind again, a stale base that simply has not merged `main`.

Now `unexplainedHoles(nums, claims)` fails by number and `inFlightHoles` passes
and names the branch. **The assertion is not loosened**: claims come from
`origin/claude/**` refs, CI checks out shallow with none of them, so in CI the
claim map is empty and every hole fails -- which is exactly the reading that
existed before. What the claims buy is a session with a full clone getting a
true answer instead of a puzzle.

## What `tools/idea-status.py` already knew (A5)

More than half of it. `ledger_refs()` already sweeps `origin/main`,
`origin/integration` and every `origin/claude/**`; `prompts()` already parses
every entry, dedupes by id preferring the most advanced status, and **already
captures `fields.get("Migration permitted")` into `row["migration"]`**, printing
it verbatim in the PROMPTS IN FLIGHT section (line 597).

It could not answer "which numbers are claimed but unlanded" for two reasons,
and only one of them is code: `migrations()` reads `origin/main` ALONE
(line 252), so a file on a branch is invisible to it; and the line it already
carries had no parseable number in it, because 15 entries said "number taken at
commit time". The second is what this bundle fixed. Folding the first into
`idea-status.py` rather than writing a new tool was considered and rejected --
that tool's output is a status briefing a person reads, and this one answers a
single question a session asks mid-work and needs to be able to pipe
(`--next`, `--json`).

## What was built

**`tools/migration-claims.mjs`.** `collect()` runs git and returns a plain
inventory; `classify()` is pure and takes one. A number is LANDED if a
migration file carries it on `origin/main` or `origin/integration`; CLAIMED if a
`claude/**` branch carries the file, or a non-terminal ledger entry on any ref
names it; free otherwise. It also reports CONTESTED (two lanes, one number) and
"permitted but naming no number", which is the shape every collision was written
in.

- **It reads git and nothing else** -- no database, no browser, no network
  beyond whatever fetch the caller already did.
- **The parser reads the corpus as written, not a format nobody has used yet.**
  `Claims:` wins where present; then a recorded outcome (`TAKEN`/`TOOK`/`NONE
  TAKEN`); then `exactly one, NNNN`; then a refusal; then `unspecified`. The
  `Highest on origin/main at issue: NNNN` clause is stripped FIRST, or every
  refusing entry claims the top of the series. The digits must follow the comma
  IMMEDIATELY, because entry 0083 reads "exactly one, the file 0069 wrote" and
  `0069` is a PROMPT number whose migration landed months ago.
- **Two git invocations per ref, not one per file.** The first draft used
  `git show <ref>:<path>` per ledger entry -- 27 refs times ~70 entries, about
  1,500 process spawns, measured at **5.36s**, too slow to sit inside a test
  that also boots Postgres. `ls-tree` long-format plus one `cat-file --batch`
  per ref: **0.27s**, 20x.
- **AND THAT REWRITE SHIPPED A SILENT BUG FOR ONE RUN, WHICH IS WORTH THE
  PARAGRAPH.** `execFileSync(..., { encoding: 'buffer' })` is rejected outright
  by this Node ("Unknown encoding: buffer"); the call sat inside a
  `try { } catch { return []; }`, so the tool reported **zero ledger entries on
  every ref** and simply lost one of its two claim sources. It came back fast
  and looked right, and the only tell was `0186` losing its `+ledger` marker in
  a report nobody would have compared. The catch is gone: a missing REF is an
  ordinary answer that `ls-tree` already returns nothing for, but a `cat-file`
  that fails on blobs `ls-tree` just listed is a broken read, and swallowing it
  under-reports claims -- which is the dangerous direction, since a claim the
  tool cannot see reads as a free number.

**`tests/migration-claims.test.ts`**, 26 assertions. Fixtures for the parser and
the classifier, plus a sweep of every committed `Migration permitted` line
through the parser. The fixtures are the test and the live refs are not: a test
reading `origin/claude/**` would pass or fail on whatever is in flight that
afternoon, which is a ratchet.

**The contiguity assertion in `tests/db/migration-0177-tombstone.test.ts`**, per
A4 above.

## The controls

**B2 control 1 (live, on the real tree).** Added `Claims: 0189` to this
bundle's own ledger entry:

    0189  claude/number-allocation-ledger-c30ms5  [ledger] 0084-number-allocation.md
    next free: 0189 -> 0190

Removed it again and `next free` returned to `0189` with `0189` absent from the
claimed list. The file was restored from a `cp` copy and re-checked:
`68743cea248f3b7cfbbc515a90a54396` before and after, identical.

**B2 control 2 (live).** Changed the same line to `Claims: 0185`, which IS
landed on `origin/main`: `0185` appears **once** in `landed`, is absent from
`claimed`, `contested` is empty, and `next free` stays `0189`.

**B2, in the suite.** Both controls again as fixtures, so they stay true when
the live branches are gone.

**B3 control (live, using the real collision).** Wrote a throwaway
`0189_control_only.sql` into `supabase/migrations/`, opening holes at 186, 187
and 188 -- numbers three real branches are holding right now:

| reading | `unexplainedHoles` (fails) | `inFlightHoles` (passes, named) |
| --- | --- | --- |
| claims visible | `[]` | 186 `he0wnn`; 187 `wzworl` + `psuleu`; 188 `j2dfjc` |
| claims empty (the CI reading) | `[186, 187, 188]` | `[]` |

The real test file was then run under both readings: **4 passed** with the
`origin/claude/**` refs present, and **1 failed / 3 passed** with those 24 refs
temporarily deleted and restored, the failure reading

    the migration series has a hole nothing accounts for. Holes a branch IS
    holding: none. Run `node tools/migration-claims.mjs` for the full picture.
    expected [ 186, 187, 188 ] to deeply equal []

The mutation flips exactly that and nothing else. The control file was removed
and all 24 refs restored by sha.

**A defect in the first draft of that control, found by running it.** The
"NOT VACUOUS" half took the LIVE directory listing, removed `0177`, and expected
exactly `[177]`. With the mutation present it answered `[177, 186, 187, 188]` --
so on a branch legitimately sitting below numbers other lanes hold, the control
itself would have gone red while the assertion it guards passed. That is the
same noise this change exists to remove, reappearing one line down. It now runs
over the CONTIGUOUS PREFIX of the real series, which is real committed data and
contiguous by construction, so the only hole it can ever have is the one put
there.

## Verification

- **`npx svelte-check`: 0 errors, 37 warnings**, breakdown **31**
  `state_referenced_locally` / **5** `css_unused_selector` / **1**
  `perf_avoid_nested_class` -- the documented baseline exactly. Re-derived with
  `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported as placeholders
  and `svelte-kit sync` run first, per CLAUDE.md's phantom-error note. The new
  `.mjs` needed a full JSDoc pass to get there: untyped, it contributed **77**
  errors on its own, which is `checkJs` doing its job.
- **`npm test`: 291 files, 5953 tests, 5949 passed, 4 failed**, in 235.72s,
  started **2026-09-06 02:20:11 PDT** (America/Los_Angeles). All four failures
  are the INHERITED red set and none is caused by this bundle: two in
  `tests/gauntlet-doc.test.ts` (`docs/GAUNTLET.md` has no row for `0184`) and
  two in `tests/derived-numbers.test.ts` (nine route specs never measured by the
  recorded browser-verify run). `claude/four-red-integration-tests-62a7ba`
  (prompt 0067) fixes exactly these four -- it edits `docs/GAUNTLET.md` and
  `tools/browser-verify/README.md`, the only inputs those assertions read -- and
  is still unmerged.
- **B6, no counts regeneration.** `tests/derived-numbers.test.ts`: 16 passed, 2
  failed, both the inherited pair above. This bundle adds no route spec, and
  `tools/browser-verify/` and `src/routes/dev/` are byte-identical to
  `origin/main` on this branch (`git diff --quiet`, both).
- **`node tools/migration-claims.mjs`** run repeatedly against the real tree
  throughout; its live finding is the unresolved `0187` pair.

## NOT verified

- **The live Supabase project was not reached, deliberately and by
  instruction.** No migration was written, applied or claimed.
- **No browser pass.** This bundle ships no surface; `npm run verify:browser`
  would measure nothing it changed.
- **The `0146` interval**, per section 2 above -- the evidence was force-pushed
  away in August and is not recoverable from this clone.
- **Whether `0076` had a rival**, per section 4 -- git has one `0076` entry and
  an unpushed draft leaves no trace.
- **The tool has never run in CI**, because `.github/workflows/**` is read-only
  for this bundle. What it does with no `origin/claude/**` refs was measured by
  deleting them locally, which is the same input, not the same environment.

## B4: the sweep-time check, specified and LEFT UNBUILT

`.github/workflows/**` is read-only here; `integrate.yml` belongs to prompt
0075's open branch and a second edit would race it. Two changes are wanted, in
this order of value.

### 1. `integrate.yml` -- refuse to sweep a branch whose number another branch holds

This is the one that prevents real damage. `integration` currently has no
opinion about migration numbers, so sweeping BOTH branches that hold `0187`
gives it two files numbered `0187`; the tombstone test's
`expect(new Set(nums).size).toBe(nums.length)` then fires, and `integration`
goes red for a reason that is nobody's branch's fault and that neither author
can fix alone. The check is cheap because `integrate.yml` already checks out
with `fetch-depth: 0`, so every ref the tool needs is already on disk.

Add one step before "Merge main, then every green claude/** branch", after the
git-identity step:

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

and one gate inside the per-branch loop, placed immediately AFTER the
`ledger_gate` skip at line 1108 and before the containment check, so its reason
lands in the same `skipped` array and therefore in the job summary under "Left
alone":

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

**It fails toward MERGING, deliberately, and that is the opposite direction from
`ledger_gate`.** If the tool throws or the node step fails, `contested_branches`
is empty and every branch sweeps exactly as it does today: this gate can only
ever ADD a skip. Holding a branch open costs somebody a look; refusing to sweep
on a broken read would stall the queue on a tool nobody has to have.

**It cannot be a test instead**, and that is worth stating so it is not
re-proposed: no branch's own CI can see the other branch, which is the whole
subject of this bundle. The sweep is the first moment in the system where two
branches are in the same process at the same time.

### 2. `ci.yml` -- let the contiguity assertion see claims

Smaller, and only removes noise. `ci.yml`'s checkout is shallow with no branch
refs, so on a branch legitimately sitting below a number another lane holds, the
contiguity assertion fails with a hole its author cannot close. One line before
the test step:

```yaml
      - name: Fetch claude/** refs so migration claims are visible
        continue-on-error: true
        run: git fetch --depth=1 origin '+refs/heads/claude/*:refs/remotes/origin/claude/*'
```

`continue-on-error` because a failed fetch must degrade to the strict reading
(no claims, every hole fails), never to a red job about a fetch.

**This second one is optional and the first is not.** Without the `ci.yml`
fetch, CI is merely stricter than a local run, which is a defensible place for
CI to be.

## What this does NOT fix, stated where it will be read

- **Two sessions started inside the same few seconds still collide.** The three
  `0186` branches made their first commits sixteen seconds apart, end to end.
  Nothing short of a lock catches that and a lock is not worth building for a
  two-person workflow.
- **A claim that never lands burns a number.** A lane that claims `0190` and is
  abandoned holds it until its entry is given a terminal status. That is why an
  abandoned entry gets `withdrawn` rather than being deleted: a terminal entry
  stops claiming, and a deleted one takes its history with it.
- **Historical entries were not rewritten** to the new format, and must not be.
  An entry is a dated record of what was issued; editing one to match a later
  rule falsifies it. The tool reads all 81 shapes and the test pins them.

## How many of the five this would have prevented

**Two of the five, honestly counted, and a third that was never a blind window
at all.**

- `0146`, `0186` (three-way) and `0187` are MIGRATION numbers, which is what the
  claim addresses. Of those: the `0186` three-way is NOT prevented by
  claim-at-first-commit, because all three first commits landed inside sixteen
  seconds; it IS prevented by the number coming from the prompt, since one
  router chat issued all three. `0187` is prevented outright and was already
  preventable -- the claim sat in git for 29 minutes and the tool would have
  reported it in 0.27 seconds. `0146` cannot be assessed, because its interval
  is unrecoverable.
- The decision-15 pair and the `0074`/`0075`/`0077` prompt collisions are NOT
  migration numbers and this bundle does not touch them. `0074` at three seconds
  and `0075` at ten would defeat any claim mechanism; both are already addressed
  by prompt numbers being stated rather than derived, which is what the router
  chat now does.

So: `0187` prevented by the claim, `0186` prevented by the allocator, `0146`
unknown, and the three prompt-number collisions out of scope. What remains open
is the sixteen-second window, the burned-number case, and the sweep-time check
above -- which is the only one of the three that is somebody's next bundle
rather than a limit.
