---
title: "Four lanes merged into `integration` and landed on `main`: the cross-merge collision was ideacad tests that each enumerate the surface, and every one of them passed alone (`claude/modest-lovelace-purl4k`, ledger 0188)"
date: 2026-09-12
branches: [claude/modest-lovelace-purl4k]
migrations: []
subsystems: ["Process", "IdeaCAD", "Foundry", "Testing", "Documentation"]
---

A landing bundle with no feature in it. What it owns is the merges of
`claude/great-bell-ppysbn` (0205, IdeaCAD document sharing),
`claude/amazing-bohr-qxhly9` (0207, assembly parts and checkout),
`claude/vibrant-brown-mgym02` (0208, IdeaCAD materials) and
`claude/busy-newton-trto6y` (0204, Foundry description optional and public play
stats) into `integration`, and `integration` onto `main`.

## Production was unreachable from this container, and that is reported rather than routed around

`curl -sS -o /dev/null -w '%{http_code}' https://ideabosco.com/` answered
`curl: (56) CONNECT tunnel failed, response 403` and `000`. The proxy refuses
that host. **No Vercel URL was substituted** and the bundle landed anyway, so
the deploy is UNCONFIRMED from here and has to be read by Mr. Pina. Worth
recording that the same proxy allows `raw.githubusercontent.com` and
`api.github.com` freely -- all three fetches succeeded -- so "the container has
no network" is the wrong diagnosis and the right one is host-specific refusal.

## The real work was a cross-merge collision no lane could have seen

Every one of the four branches was green on its own. The merged tree was not:
**16 tests failed across 5 files**, and the shape is worth writing down because
it will recur every time two lanes touch one subsystem.

0205, 0207 and 0208 each add ideacad functions. Three of 0205's test files
assert the ideacad surface by ENUMERATION -- `expect(names).toEqual([...fifteen
names])`, `expect(rows).toHaveLength(19)`, `expect(privateHelpers).toHaveLength(4)`.
0207 adds fourteen functions and 0208 four, so every one of those assertions is
broken by another lane's legitimate work, and NONE of it is visible from either
lane.

**Generalized to the rule rather than deleted, per `CLAUDE.md`, and each
re-mutated afterwards to confirm it still bites.** The split that made it
tractable is between a UNIVERSAL property and a FACT ABOUT TODAY'S POPULATION,
which is 0206's own distinction and it transfers exactly:

* **Universal, and still swept by prefix over the whole surface:** no ideacad
  function is anon-executable; every public ideacad RPC holds `authenticated`.
  Those are true of every ideacad function there will ever be.
* **A fact about a population, and now scoped to the migration that owns it:**
  the counts and the exact lists. `ideacad-sharing-{stranger,grant-surface,instructor-path}`
  ask their questions about 0205's own functions, by name, so a later migration
  cannot redden a file that is not about it.

**`ideacad-grants-anon-execute-surface` took the other half**, and 0206's header
is what decided it: an unclassified ideacad function "RAISES A NOTICE, NOT AN
EXCEPTION ... The strict half of that decision lives in [that test], which DOES
fail on an unclassified ideacad function -- a test is editable in the same commit
that adds the function, and an applied migration is not. That asymmetry is
deliberate and it is the point." So 0207's fourteen and 0208's four were
CLASSIFIED there, `client` or `definer`, each read off its own migration's grant
block rather than guessed:

* 0207's nine parts RPCs are client; `_ideacad_part_reader` is client because
  0207 line 551 names it in an RLS `using` clause and its grant block hands that
  one alone to `authenticated`; the other four private helpers hold
  `service_role` only and are definer.
* 0208's three materials RPCs are client; `_ideacad_clean_thicknesses` holds
  `service_role` only and is definer.

**Section F, the seam between that file and 0206's own guard, could not stay an
equality** -- 0206 is applied and immutable, so it can never classify a function
written after it. It now compares over 0206's own scope (`GUARD_MIGRATIONS`),
and asserts in the OTHER direction that no later migration's function appears in
the guard, with a positive control that the scoped cut is non-empty. Both
directions, because a scoped comparison that quietly stopped covering anything
would look identical to one that passes.

**`ideacad-assembly-claim-ladder` was a different failure and a better one.** Its
rung 2 asserts `_ideacad_can_write_document` is ABSENT, which was simply true of
the tree it was written on: 0205 sat on an unmerged lane. Merged, 0205 is in the
chain and the predicate is really there, so the narrow rung had to be
CONSTRUCTED rather than inherited. **Only the write predicate is dropped, and
that is forced rather than chosen**: `_ideacad_can_read_document` is named in
0205's own RLS policies, and a policy records a real dependency on every function
its expression names, so `drop function` on it is REFUSED rather than quietly
degrading. The write predicate is the one `_ideacad_part_writer`'s ladder
consults, so it is the whole of what has to go.

### Mutation-proved, in the permissive direction

Per `CLAUDE.md`, on grant boundaries, and restoring from a COPY rather than
`git checkout --` (which is a discard-to-HEAD and would have taken the session's
own uncommitted work with it):

* `grant execute on function public.ideacad_assembly(uuid) to anon` appended to
  0208 -- **2 files failed**, both sweeps. Restored, md5 `OK`.
* a classified function absent from the catalog -- **1 failed**. Restored, md5 `OK`.
* `_ideacad_clean_thicknesses` dropped from the classification -- **1 failed**.
* `_ideacad_part_reader` misclassified as definer -- **2 failed**.

## The four textual conflicts

* **`docs/decisions/entries/24-*`** -- two additive sections, one per lane.
  **Kept both**, which is what the incoming side's own text instructs: "This
  section is additive and does not replace ledger 0179's ... if both sections
  arrive in one merge, keep both."
* **`classroom-updates.json`** -- both lanes appended an entry at the tail, and
  the shared `"date"` prefix and `]`/`}` suffix sit OUTSIDE the conflict, so the
  two sides are entry BODIES rather than entries. Resolved textually to two
  complete objects; JSON re-parsed, **157 entries**, tab indentation preserved.
* **`docs/decisions/entries/05-*` and `07-*`** -- NOT additive. Two states of one
  decision block: HEAD's says `Build: OPEN`, and `busy-newton`'s says closed BY
  `0204`, which is the migration that same merge brings in. Resolved to the built
  side, and that is not picking a side -- it is picking the side that is TRUE of
  the merged tree. Verified first: `0204` is present, defines
  `foundry_my_play_stats` nine times, and `foundryPublishBlockers`/`foundryCanSubmit`
  survive only as comments explaining their deletion. Keeping HEAD's would have
  left the tree claiming work is open in the same commit that closes it.
* **`CLAUDE.md`** -- the `svelte-check` baseline, three hunks. **RE-DERIVED on the
  merged tree rather than picked**, which is the only honest move on a line six
  lanes have now measured. Both sides recorded the SAME fifth drift (38 in 21 ->
  37 in 20 at `b0a8101d`) measured INDEPENDENTLY, ledger 0184 and ledger 0186,
  which is why two statements of one fact arrived as a conflict; the resolution
  names both and folds in `busy-newton`'s argument about why a DOWNWARD drift is
  the dangerous direction (a figure written too high is a budget a session can
  spend without noticing).

## Measured

* **Baseline off `integration` at branch time, `096aa371`**: `npm test`
  **418 files, 8099 tests, 0 failures**, 409.79s. `svelte-check` **0 errors, 37
  warnings in 20 files** (31 `state_referenced_locally`, 5 `css_unused_selector`,
  1 `perf_avoid_nested_class`).
* **Merged tree, final**: `npm test` **433 files, 8318 tests, 0 failures**,
  426.99s. `svelte-check` **0 errors, 37 warnings in 20 files**, same 31/5/1 --
  measured three times (branch point, mid-merge, final) and identical each time,
  so `CLAUDE.md`'s line needed no correction this round. **That is the first time
  in six lanes it has held.**
* **Browser pass.** Chromium 141.0.7390.37 at `/opt/pw-browsers`; probe reports
  screenshots, rAF, `IntersectionObserver`, `ResizeObserver`, canvas readback and
  `color-mix()` all working, `animationMidpointOpacity` 0.5. The merge changed
  twelve Foundry and IdeaCAD source files plus `src/routes/dev/ideacad`, so the
  **sixteen** `foundry-*` and `ideacad-*` specs were re-measured on the merged
  tree -- Vite by hand on 5199, clean committed tree at `9ee01100`, nothing else
  running, stopped by explicit PID and never `pkill -f`. **32 route/width runs,
  708 measurements, 0 outside threshold.** Store now **202 specs, 404 runs, 7184
  measurements, 0 outside threshold**; selftest 70 controls, 36 negative, 34
  positive, 0 failures. **No row outside threshold, so there is none to name.**
  The README's conflict was the union sum, which is a TREE READ -- every spec
  including 0208's `ideacad-role-student-state-materials` already had a
  measurement file, so no browser was needed to RENDER the region, only to take
  a fresh one.
* Harness limits that qualify those numbers: web fonts are blocked
  (`fonts.googleapis.com`), so text is measured in the fallback stack, and
  `prefers-reduced-motion` is `no-preference`, so that path is not exercised.

## Not verified

* **Production.** The container cannot reach `ideabosco.com` (proxy 403). The
  deploy is unconfirmed from here.
* **The applied database.** Nothing in this container can reach the production
  Supabase project. `0205` through `0208` are taken as applied on Mr. Pina's
  statement in the prompt, not measured.
* **Signed-in surfaces.** The browser harness covers `/dev` routes only.

## What remains standing

`claude/notebook-ui-theme-overhaul-0gnx0f` is still on the remote. It was
archived by ledger 0182 at `refs/heads/archive/notebook-theme-0gnx0f`, and that
ref was confirmed present here by `git ls-remote` at `30adfd77`, **byte-identical
to the branch tip**. It was not merged and not deleted: a container cannot delete
it, the proxy returns 403 and git reports success over the failure, so a deletion
from here would be a claim rather than an act.
