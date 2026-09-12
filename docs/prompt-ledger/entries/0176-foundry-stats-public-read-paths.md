# 0176 Foundry telemetry: decision 07 answered public, in two layers

- Issued: 2026-09-12
- By: router chat
- Owns: the Foundry telemetry read paths and stats surfaces, `tests/db/foundry-stats*`,
  `tests/dom/foundry-stats*`, `docs/prompt-ledger/entries/0176-*`, and its own
  `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. Highest landed migration at issue: 0202
- Status: pushed
- Branch: `claude/inspiring-dirac-wtoe9z`, branched from `origin/integration` at `eef6e851`
- Runs in parallel with: ledgers 0171 through 0175. 0175 owns the Foundry CARD and gallery
  components and neither is touched here.
- Notes: DECISION 07 IS ANSWERED, against the default this assistant would have picked.
  Mr. Pina wants Foundry stats FULLY PUBLIC in two layers -- every student sees their OWN
  stats for any app they played ("if I play twenty hours of cookie clicker I should see my
  playstats"), and totals aggregated across everyone are public. AUDIT FIRST: does
  per-player playtime exist in the database at all, or is only an aggregate stored? That
  question decides whether this is a read-path change or a data-collection change. If the
  data is not collected, STOP and report what is missing and what collecting it would
  cost; do not start collecting telemetry in a bundle scoped to exposing it. If it exists,
  widen the read path and prove the boundary: A STUDENT MUST NOT SEE ANOTHER NAMED
  STUDENT'S PLAYTIME, with a signed-in peer control the way ledger 0152 proved presence
  isolation.

## Outcome

**STOPPED AT THE AUDIT, WHICH IS THE PROMPT'S OWN ENDING FOR A CASE IT DID NOT
QUITE ANTICIPATE.** The gate asked whether per-player playtime exists or only
an aggregate is stored, and read the answer as deciding between a read-path
change and a data-collection change. The measured answer is a third thing: the
DATA exists and the READ PATH cannot be widened without a migration. So the
`NO MIGRATION ... rather than allocating one` line governs and no number was
taken.

**Duplicate check, three ways, all clear.** (1) `git log --oneline
origin/main..origin/integration` at branch time: four subjects, all ledger 0172
and its merge. (2) A `git ls-tree` scan of every remote ref for a `0176` ledger
entry, plus a live GitHub contents listing of `entries?ref=main` (159 entries,
highest numbered `0170`): **no ledger 0176 anywhere.** `0176` exists only as a
MIGRATION number, `0176_classroom_item_images.sql`, landed 2026-09-04 under
ledger 0030's claim; this entry claims none, so there is no collision. (3)
`tools/idea-status.py` across `main`, `integration` and every `claude/**` and
`codex/**`: 152 prompts in flight, exactly ONE `Status: issued`
(`claude/pensive-turing-inj1ih`, ledger 0171, IdeaCAD), and every entry whose
`Owns` names Foundry reads `pushed`. 0175 is on no ref, so its card and gallery
surface was untouched by construction.

**The three fetches and the identity check.** `tools/idea-status.py` from raw
(722 lines, md5 `e044d18ba0c9`, identical to the local mirror);
`docs/standards/REGISTER.md` from raw (51 lines, md5 `bda5ad4d6d9a`,
identical); the ledger directory live from the GitHub contents API on `main`.
Container fetches: the clone WAS shallow and `--unshallow` took it to 2209
commits, `origin/integration` was a new ref, and the identity was already set.
Identity read from the session rather than asserted: configured
`claude-opus-5`, last served `claude-opus-5`, effort `high`, permission mode
`auto`.

**The audit.** `student_app_plays` (0139) stores `player uuid`, `started_at`
and `last_seen_at` per SESSION, with `(player, app_id, last_seen_at desc)`
indexed -- so a caller's own playtime is already recorded exactly and nothing
here needs collecting. But the table answers nobody (`anon` false,
`authenticated` false, RLS on with no policy), every door is a definer
function, and the census is four with NONE caller-scoped: the two that name
`auth.uid()` use it as a signed-in gate and as the owner gate, and both
aggregate across every player. Layer 2 needs SQL too, because the two counts
`foundry_play_counts` returns are already public to a signed-in caller and
already on the gallery cards -- what "make the totals public" asks for is the
metrics behind the owner gate. Three no-migration routes were considered and
all three refused; `docs/history/inspiring-dirac-wtoe9z.md` carries the
measurements, the four-function table and the reasoning.

**Two things back to Mr. Pina with decision 07.** Its title says "the two
owner-only metrics" and there are THREE (`players`, `seconds_played`,
`last_played_at`). And the n=1 case is where a straight gate widening fails the
boundary this prompt asked to be proven: 0139 already records that `players` is
1 on a one-player app and `last_played_at` is then when that one person played,
which was accepted owner-and-admin and is a named person's play time inferred
from an aggregate once it is public. The entry at
`docs/decisions/entries/07-*` still reads `Status: open` with the old default
and is not this bundle's surface.

**Found on the way, reported not fixed.** `service_role` HOLDS SELECT on
`student_app_plays` (measured `true` on the real fixture), against 0139's own
comment that it "gets nothing either, and that is deliberate": the table revoke
names only `anon, authenticated` while all five of the file's FUNCTION revokes
name `service_role`, and the self-check tests only the two client roles. It is
the `0201` defect one table over. No `src/` reader would break -- all four call
sites use the RPCs.

**Measured.** Full suite on the committed tree: **405 files, 7819 tests, 0
failures**, 387.15s. `svelte-check` off `origin/integration` at `eef6e851`: **0
errors, 38 warnings in 21 files** (32 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`) -- `CLAUDE.md`'s baseline
says 40 in 22, stale by two at the branch point and not this bundle's surface.
No browser pass: no mounted surface was touched. `npm run history:verify` and
`node tools/claude-md-check.mjs` both clean.

**Production reachability**, checked before the merge: `https://ideabosco.com/`
**200** in 0.65s, `https://apps.ideabosco.com/` **200** in 0.53s. The
production DATABASE is unreachable -- `IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` are all unset and the local `.env` is the
placeholder ref -- so no migration could have been applied here in any case,
and ledger 0114's gate 4 substitution applies with the range carrying none.

**What the follow-up bundle owes.** A migration number from the router chat,
Mr. Pina's answer on the n=1 question above, one caller-scoped definer
(`foundry_my_play_stats(p_app_id uuid)`, no identity parameter, so the
boundary is a property of the signature), the gate decision on
`foundry_app_play_stats`, the `0166` revoke shape on both, and the signed-in
peer control this prompt asked for -- which cannot be written yet, because
against today's functions it would only re-assert what
`tests/foundry-telemetry.test.ts` already proves. `tests/db/foundry-stats*`
and `tests/dom/foundry-stats*` were therefore NOT created.
