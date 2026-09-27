---
title: "Ledger 0338: the applied-state probe judged a function body a later migration replaced as the earlier migration missing, so Migrate refused on every push; a superseded body now reads applied when its own or any later definer's body is live (`claude/upbeat-wozniak-vcjpzo`, no migration)"
date: 2026-09-27
branches: [claude/upbeat-wozniak-vcjpzo]
migrations: []
subsystems: [Tooling, CI, Database]
---

Migrate could not apply anything from 2026-09-25, because the applied-state probe
judged a function body that a later migration replaced as if the earlier migration were missing.

## The defect, measured

Migrate run 36350843846 on `1c5a1848` ended exit 2, "REFUSING: at least one
migration in range is not applied". Its own log, read in full, has exactly two
false probes among 116 findings, both body markers:

- `0166  row  NOT APPLIED  function public._app_short_link_reserved carries 0166's body`,
  with a CONFLICT, because the history table holds 0166's row.
- `0214  no row  NOT APPLIED  function public._ideacad_part_owner carries 0214's body`.

In the same run the later definers of both functions read APPLIED:
`0215 ... _app_short_link_reserved carries 0215's body` and
`0216 ... _ideacad_part_owner carries 0216's body`. So production holds the
latest bodies, and the probe was asking each earlier migration for a line only
its own body had.

## Audit, from the tree

`tools/idea-status.py` gives every definer after the first a marker: the
longest line of its body absent from every EARLIER body. Nothing looked at
LATER bodies. Checked against the last definer's body for every marker whose
function is redefined later in range (`--since 151`):

| migration | function | last definer | own marker in last body |
| --- | --- | --- | --- |
| 0166 | `_app_short_link_reserved` | 0215 | **no** |
| 0196 | `_app_short_link_reserved` | 0215 | yes |
| 0214 | `_ideacad_can_write_document` | 0216 | yes |
| 0214 | `_ideacad_part_owner` | 0216 | **no** |
| 0214 | `ideacad_open_shared_document` | 0216 | yes |
| 0214 | `ideacad_roster` | 0216 | yes |

The two "no" rows are exactly the two the run reported. The four "yes" rows
were passing by luck: their chosen line happened to survive the rewrite. The
non-function collisions (`view gauntlet_leaderboard` 0154/0194, `policy
maps_media_public_read` 0163/0186, `trigger ideacad_preserve_direct_document`
0216/0217) are probed by existence only, which a redefinition cannot falsify, so
none of them is misjudged this way. Nothing in the run or the tree suggests either
migration is genuinely unapplied: both later bodies are live, and
`docs/migrations-applied/0214-youthful-lovelace-kg9482.md` exists.

## The fix

`probes()` in `tools/idea-status.py`: a definer that is NOT the last in range is
now `kind: 'superseded'`. Its SQL asks whether the live `prosrc` carries a line
from this body OR from any later definer's body, each line told apart from the
bodies BEFORE this migration only. True means the live body is this one's or a
later one's. The last definer keeps its plain `marker` probe. If any later body
has no line that tells it apart, the probe gets no SQL, so the history record
answers, and with no row it stays CANNOT SAY.

**Not the literal "last definition" check the prompt described, and why.**
Judging a superseded migration by the last body ALONE breaks the one case
`migrate.yml` exists for: a new migration that redefines a function has landed
and not run, so the last body is absent, and every earlier definer of that
function would read NOT APPLIED with it. `migrate.yml` applies the LOWEST
unapplied migration, which would then be an old one that is already applied.
The OR keeps the older one applied and names the new one, which the test pins.
The later definers come from `origin/main`, which can be more than the probed
ref. That is harmless: a later body being live only means production is ahead,
which never makes an earlier migration less applied.

**False still means NOT APPLIED.** If the function is absent, or carries a body
from before this migration, the migration is genuinely not live, and a record
row claiming otherwise is still a CONFLICT. The prompt's "never answered NOT
APPLIED" is read as "never NOT APPLIED while a later definition is live". Its
own third test case, CONFLICT with the latest definition absent, needs exactly
that reading.

`tools/deploy-probe.mjs`: the header states the rule, and a CONFLICT on a
superseded probe now says what was actually checked. Exit codes, the `--json`
shape and the verdict table are unchanged. `tools/apply-migration.mjs` calls
`verdicts` with no history and gets the same correction through the derivation.

`.github/workflows/integrate.yml`: the checkout no longer uses `fetch-depth: 0`.
Instead a step fetches `main` with `--unshallow` and then `integration`, the shape
`ci.yml` took in ledger 0335. Every ref the sweep reads is read after its own
`git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'`. Before that line
the step only defines functions, which was checked by listing every non-comment
line above it. So the merges, deletes, gates and merged suite still have every
agent branch. That also means the merged suite still pays `idea-status.py`'s
per-branch ledger cost. It is testing the tree those branches were just merged
into, so this is correct, and it is not a place ledger 0335's saving applies.
`tests/workflows.test.ts` pins the shape, with the all-branch fetch ahead of the
first merge as the positive control.

`tests/git-refs-precondition.ts`: its message no longer says `ci.yml` uses
`fetch-depth: 0`, and it now names the step that fetches the two refs.

## Measured

- `tests/db/deploy-probe-superseded.test.ts`, a constructed chain in a
  throwaway git repo (`fx()` written three times, `fy()` once), derived by the
  real `idea-status.py` and run through the real `psql` against a real Postgres:
  latest body live reads applied, with and without a record; a newer redefinition
  still unapplied leaves 0002 applied and names 0003 as the lowest; function
  absent or carrying an earlier body reads NOT APPLIED; a record plus the function
  absent reads CONFLICT. 5 of 5 pass.
- Mutant 1, the superseded probe reverted to own-body only: "reads APPLIED when
  the LATEST body is live" failed, 1 failed, 4 passed.
- Mutant 2, superseded probe SQL `true`: "genuinely missing" and "CONFLICT"
  failed, 2 failed, 3 passed.
- Both were restored from a copy, and the md5 matched before and after
  (`cf12f107...`).
- On the live tree the new derivation's markers for 0166 and 0214's four
  functions are each present in the last definer's body, which is the body the
  run showed live.

## Not verified

- Production was not probed from here, because no session holds
  `DEPLOY_PROBE_URL`. The first Migrate run after this push is the measurement.
- `integrate.yml` was not run. Its fetch shape is asserted structurally only.
