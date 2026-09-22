# 34 Gate 4, and what may satisfy it

- Raised: 2026-09-21  By: the feedback-triage router chat
- Status: DECIDED 2026-09-21 by Mr. Pina, who said of the question "i dont know
  what you are talking about. use your best judgement", so the answer below is
  this assistant's and is recorded as such rather than as his words.
- Build: CLOSED, by this bundle -- ledger 0279, docs only. The answer is the
  build: it edits `IDEA_instructions.md` item 4 and nothing in `src/`, `tools/`
  or `tests/` needed to change for the decision itself to take effect.

**No decision entry anywhere covered this before now.** Confirmed by reading
every file under `docs/decisions/entries/`: none names "gate 4" or the deploy
probe. The claim handed to this bundle also said the project instructions
attribute the question to "decision 31" -- **that half does not hold.** Decision
31 (`ideacad-purpose-and-application-boundary`) is real, is titled "What is
IdeaCAD, and where does it run?", and is DECIDED, but it is about IdeaCAD's
scope and application boundary and says nothing about gate 4 or migrations.
Grepping `IDEA_instructions.md`, `CLAUDE.md` and every decision entry for
"decision 31" beside "gate" turns up nothing; the only two hits for "decision
31" anywhere are `docs/ideacad/legacy-product-record.md` and decision 32, both
citing it for the technical-drawings boundary. Wherever that attribution came
from, it is not in this tree, and this entry does not repeat it.

**What IS in this tree, and is the real precedent this decision generalizes:**
ledger 0114's "GATE 4 SUBSTITUTION" (`docs/prompt-ledger/entries/0114-overnight-landing.md`),
reused by name in at least a dozen later ledger and history entries
(`grep -rl "gate 4" docs/history docs/prompt-ledger/entries` finds them). That
substitution is narrower than this one: it applies only when
`git diff --name-only origin/main...origin/integration -- supabase/migrations/`
is EMPTY, on the reasoning that an empty range leaves nothing for gate 4 to
prove. It has never covered the case this decision is written for -- a
non-empty range, checked from committed records rather than from production
itself.

## The decision

**Item 4 is satisfied either by the probe exiting 0, or, where the probe
cannot run, by every migration file present on `origin/integration` having a
committed applied record under `docs/migrations-applied/`, reported by
number, with the missing set printed rather than summarized.** A session
taking the second route says which route it took, prints the number set it
checked and the number set it found, and never reports the substitute as the
probe having passed.

**Why the substitute is not a weakening**, because a future session will test
it: item 4's real job is not to confirm this bundle's own migrations, which is
item 5's job. It is to refuse a merge that would deploy code depending on a
migration somebody else added and nobody applied. A record set with no gaps
answers that question from a real verification someone actually ran, rather
than from asking production directly. What it cannot answer, and a session
must not claim, is that a backfill did the right thing -- which the probe
could never answer either; `IDEA_VERIFICATION_ADDENDA.md`'s own line on the
probe says so ("an object exists, never that a backfill did the right thing").

**The two holes, and why they are not gaps.** `0190` and `0191` are numbers
that were claimed and declined; `supabase/migrations/` has no `0190_*.sql` or
`0191_*.sql` file at all (confirmed: `ls supabase/migrations/ | grep -E
"^019[01]_"` returns nothing), and `tools/migration-claims.mjs` already prints
them as "HOLES A LANE IN FLIGHT ACCOUNTS FOR" rather than as free numbers. A
session scanning the numeric sequence for a missing record must not read the
gap in the SEQUENCE (0189 to 0192) as a missing FILE -- there is no file to
have a record, and the two are permanent, not pending work.

**The boundary this entry does not touch:** a bundle that adds its own
migration still returns to Mr. Pina, who applies the SQL by hand in the
Supabase SQL editor before the push. That is his standing rule of 2026-09-01
and nothing here changes it. This decision is about how a MERGE confirms
somebody else's migration was applied, never about who applies one.

## What the checked window actually is, found by measuring rather than assumed

The decision text above says "every migration file present on
`origin/integration`" and leaves open how far back that reaches. Measured
against the tree at this bundle's branch point (`origin/main` and
`origin/integration` both at `3793ea2c`, identical):

- **215 migration files exist, numbered 0001 through 0217** (two numeric
  holes: 0190, 0191, both explained above).
- **`docs/migrations-applied/` carries 25 records, contiguous from `0193`
  through `0217`, and nothing below `0193`.** Every migration from `0001`
  through `0189`, plus `0192`, predates `tools/record-applied.mjs`, which
  `docs/history/zen-edison-jpgz4s.md` records as backfilling `0193` onward
  and no further.
- `tools/deploy-probe.mjs` itself defaults to `--since 151`, a separate,
  older watermark set for a different reason (a floor below which an object
  probe cannot be derived, per `docs/history/pipeline-automation-probe-ln83ek.md`),
  not the same boundary as the committed-record backfill.

**So a literal, unbounded reading of "every migration file present" would
print roughly 190 numbers as missing on every single run, today, forever,
until somebody backfills records for migrations that landed before this
mechanism existed.** That is not this decision's job to fix (the backfill is
its own bundle, exactly as decision-line retrofits are not this bundle's to
do), and reporting that noise as if it meant something new is worse than not
running the substitute at all.

**The sensible scope, and the one a session should actually check:** the
migration files a merge into `main` would newly deploy -- in ordinary
operation this is the DELTA, `git diff --name-only
origin/main...origin/integration -- supabase/migrations/`, which is exactly
the set ledger 0114's own "migration check" already computes and is empty far
more often than not, because `main` is never supposed to fall behind
`integration` on migrations for long. Checking the delta for committed
records answers the same question the probe would answer about that range,
without re-litigating history the probe itself does not re-litigate on every
run either (its own default floor stops at 151, not at 1).

Where a session has reason to check further back than the delta -- the first
run under this decision, exactly as this bundle's own is below -- it widens
the window, says so, and reports the pre-existing `0151`-`0192` gap (0190/191
excepted, as explained) as a known finding rather than as something this
bundle broke. **A session must never present a wider check's noise as a new
regression, and must never narrow the window without saying it did.**

## This bundle's own run, both routes, reported per the ending's instruction

- **Probe:** `node tools/deploy-probe.mjs --ref origin/integration` exits
  `1` (`cannotRun`) -- `DEPLOY_PROBE_URL` is unset in this container, exactly
  as claim 5 said it would be. `EXIT.cannotRun` is `1` in the tool's own
  export, not `2` or `3`; `IDEA_instructions.md`'s existing item 4 text names
  only "2 or 3" as a stop, which is imprecise (1 is also not 0), and the edit
  below corrects it.
- **Delta:** `git diff --name-only origin/main...origin/integration --
  supabase/migrations/` prints nothing. `origin/main` and `origin/integration`
  are the same commit. There is no migration this merge would newly deploy,
  so under the sensible (delta) scope there is nothing for the substitute to
  check, matching ledger 0114's own precedent exactly.
- **The wider window, reported anyway because this is the first run under
  this decision:** `0193` through `0217` all carry committed records (25 of
  25, confirmed by listing `docs/migrations-applied/*.md` front matter).
  `0151` through `0189` and `0192` (40 numbers) carry none, which is the
  pre-existing gap named above and not a finding about this bundle's own
  work.
- **The two routes do not disagree about anything this bundle is responsible
  for**: neither the probe nor the record set names a migration that is
  present, unrecorded, and actually part of what this merge would deploy,
  because nothing is.

## Context

- `docs/prompt-ledger/entries/0114-overnight-landing.md` -- the original,
  narrower substitution.
- `docs/history/zen-edison-jpgz4s.md` -- `tools/record-applied.mjs`, and the
  backfill that stops at `0193`.
- `docs/history/pipeline-automation-probe-ln83ek.md` -- the probe's own
  `--since 151` default and why it exists.
- `tools/migration-claims.mjs` -- the tool that already prints `0190`/`0191`
  as holes, from a different angle (claimed-but-declined ledger entries
  rather than committed records).
- `docs/standards/IDEA_instructions.md`, item 4 of the canned lane ending --
  amended by this same bundle to carry this answer.
