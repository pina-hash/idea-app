# 0190 IdeaCAD: the sharing control, the parts list, and one-tap checkout

- Issued: 2026-09-12
- By: router chat
- Owns: the sharing and checkout surfaces under `src/lib/ideacad/`, the
  transports region of `src/lib/ideacad/transports.ts`,
  `tests/dom/ideacad-sharing*`, `tests/dom/ideacad-checkout*`,
  `tools/browser-verify/routes/ideacad*.mjs` and its measured store entries,
  `docs/prompt-ledger/entries/0190-*`, and its own `docs/history/` entry.
  Ledger 0189 owns `history.ts` and 0188 owns the landing; neither is touched.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208.
  `0205` through `0208` are all applied and landed; this bundle renders what
  `0205` and `0207` already give and adds no database object.
- Status: pushed
- Branch: `claude/eager-dijkstra-ewfopc`, branched from `origin/integration` at
  `7f5ca8f0`.
- Notes: the pure layers exist and are untouched -- `src/lib/ideacad/sharing.ts`
  (ledger 0179) and `src/lib/ideacad/assembly.ts` (ledger 0183) were both shipped
  with NO UI, which is the gap this bundle closes. A new dev route
  `/dev/ideacad-team` is created rather than editing
  `src/routes/dev/ideacad/+page.svelte`, which belongs to ledger 0171: a
  browser-verify spec needs a page to drive and a new URL collides with nobody.
  A last adversarial read of the diff after the status flip found one real
  wrinkle and it is fixed in that same commit: `ideacad_release_part` accepts
  the assembly OWNER freeing somebody else's part, and the controller cleared
  its own hold on every successful release. The follow-up read re-derived it,
  so it recovered by accident -- and the first test written for it passed on
  the broken code for exactly that reason. It bites now with the re-read made
  to fail, which is the one case where recovering by accident stops working.

## Outcome

**Landed on `integration` at `62ef6bc7`; NOT merged to `main`, and the reason is
another lane's migration.** The six-item checklist stops on three items and the
work is reported rather than routed around:

1. `git merge-base --is-ancestor origin/main origin/integration` -- **PASS**, exit 0.
2. This branch contained in `origin/integration` -- **PASS** (`3a32eed8`, swept by
   `integrate.yml`, which then deleted the branch). CI green on its tip, run
   34724432244. But CI on `integration`'s CURRENT tip `62ef6bc7` -- **UNMET**: no
   run exists for that sha, and `ci.yml` gives `integration` no push-triggered
   run by design.
3. `git merge-tree --write-tree origin/main origin/integration` -- **PASS**, clean,
   exit 0. No merge was performed.
4. `node tools/deploy-probe.mjs --ref origin/integration` -- **UNMET**, exit 1:
   `DEPLOY_PROBE_URL is not set, so production's applied set cannot be read.`
   `CANNOT SAY` is never a pass.
5. **UNMET, and this is the one that matters.** The range carries
   `supabase/migrations/0209_ideacad_history.sql`, from ledger 0189's lane. This
   bundle added no migration, but the range is what item 5 is about --
   and ledger 0189's own history entry says of `0209`: *"Not applied anywhere.
   This container cannot reach production and did not try."* There is no
   `docs/migrations-applied/` record for it. Merging would deploy
   `ideabosco.com` with `src/lib/ideacad/history.ts` calling functions the
   database does not have.
6. Every ledger entry newly on `integration` reads `Status: pushed` -- **PASS**:
   0189, 0190, 0193.

**Ledger 0114's gate-4 substitution deliberately does NOT apply here.** It is
available only while the migration check comes back empty, and its own text says
so: *"If the migration check ever comes back non-empty, the stop rule fires first
and the substitution never applies."* It came back non-empty.

**What unblocks the merge:** `0209` applied to production, then `deploy.yml` --
which holds the read-only credential this container does not and runs CI on
`integration`'s exact tip, so it can answer items 2, 4 and 5 for real.

**Production was unreachable from this container throughout**:
`curl https://ideabosco.com/` answered `curl: (56) CONNECT tunnel failed,
response 403` and `000`, as did `apps.ideabosco.com`. The same proxy served
`raw.githubusercontent.com` and `api.github.com` freely, so this is host-specific
refusal rather than a container with no network -- the identical finding ledger
0188 recorded the day before.

