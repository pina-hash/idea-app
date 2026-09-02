# IDEA Repo Workflow Standard
**Version 1.0 - 2026-09-02**

One development workflow across the three repositories this project ships from:
`pina-hash/idea-app`, `pina-hash/fll-app`, and `FRC-Team-5669-Techmen/frc-app`.
`idea-app` is the reference implementation. The other two conform to it, and where a
repo cannot conform, its `CLAUDE.md` says so at the point of difference and this file
records the gap in the conformance table below.

This file owns the shape. `IDEA_instructions.md` owns how a prompt is written and how a
session behaves; it applies to all three repos unchanged. Each repo's own `CLAUDE.md` owns
what is true inside that repo only, above all its migration apply path, and a rule in
`CLAUDE.md` is never carried from one repo to another.

---

## 1. Why one workflow

Established 2026-09-02, from the audit that opened this file. Three repos had three
workflows. `idea-app` had CI, an integrate branch, a per-bundle history directory, a prompt
ledger, a status tool and two harnesses. `fll-app` had a strong `CLAUDE.md` and a real test
suite and nothing that runs without a person. `frc-app` had an integrate workflow keyed on
a CI workflow that did not exist, so it had never merged anything, zero committed tests,
and a `CLAUDE.md` whose "Last reviewed" line had become the repo's entire history in one
paragraph. Every rule earned in `idea-app` between 2026-08-19 and 2026-09-02 was earned by
a failure that the other two repos are still able to have.

A session that moves between repos should find the same directories, the same scripts,
the same prompt shape, and the same three facts on `CLAUDE.md`'s first screen. What
differs between repos is declared, in one place, so that the difference is read rather
than assumed.

---

## 2. What every repo carries

The reference path is `idea-app`'s. A repo either has the item at that path, or its
`CLAUDE.md` names where it is instead and why.

### 2.1 `CLAUDE.md`

The first thing every session reads. Required sections, in this order, so a session finds
them by position:

1. **What this repo is**, in ten lines or fewer.
2. **Commands**: dev, build, check, test, verify:browser, history:verify, and the repo's
   status command.
3. **Verification standard**: a pointer to `IDEA_VERIFICATION_ADDENDA.md` plus the
   repo's own instruments.
4. **Database conventions**, opening with **the migration apply path**, stated in one
   paragraph a session can act on: where files live, how they are numbered, who applies
   them, by what command, what records applied state, and what a session does when it
   cannot apply. This paragraph is the one thing that legitimately differs per repo.
5. **Branches and merging**: a pointer to section 3 below and any repo-specific note.
6. **History**: a pointer to `docs/history/` and the front-matter rule.
7. **Self-maintenance**: what triggers an edit to this file.

`CLAUDE.md` carries no history log, no applied-migration list, and no count. A "Last
reviewed" line is a date and one sentence. Anything that reads like a record of what
happened goes to `docs/history/`; anything that reads like a measurement is generated or
carries its instrument and date.

### 2.2 `.github/workflows/`

- `ci.yml`: check, test, `history:verify`, and any repo-specific audit (`ds:audit` in
  `frc-app`). Runs on every push. Carries a `schedule` and a `workflow_dispatch` that test
  `integration`, because the integrate workflow's own pushes cannot trigger CI.
- `integrate.yml`: sweeps green `claude/**` branches into `integration` and deletes them.
  Never pushes `main`. Byte-identical across repos except the CI workflow filename it keys
  on, which must exist.
- `deploy.yml`: `workflow_dispatch` only. Runs CI's checks on `integration`'s exact tip,
  requires a typed confirmation that every migration on `integration` is applied to that
  repo's production, then merges `integration` into `main` with `--no-ff`. This is the
  one path that writes `main`.

### 2.3 `docs/`

- `docs/history/`: one file per bundle, front matter first (`title`, `date`, `branches`,
  `migrations`, `subsystems`), no retyped `##` heading. `npm run history:verify` runs in
  CI. A single append-only `HISTORY.md` is the contested file that blocked merges three
  times in one day in `idea-app` and is retired everywhere.
- `docs/prompt-ledger/entries/`: one file per Claude Code prompt in flight, keyed on owned
  file surface. The session writes its own entry as its first commit.
- `docs/decisions/entries/`: one file per decision owed to Mr. Pina, with a `Status` line
  and the default this assistant would pick.
- `docs/audits/`: standing read-only audit records.
- `docs/standards/` exists in `idea-app` only. It is the freshness authority for every
  standards file including this one and the two FRC design documents, which are also
  committed to `frc-app` at `src/lib/design-system/docs/` for sessions in that repo. No
  third home.

### 2.4 `tools/` and `scripts/`

- The status tool. `tools/idea-status.py` in `idea-app` takes `--repo <owner/name>` and
  reads any of the three; it needs no copy in the other repos. Each repo's `CLAUDE.md`
  Commands section states the invocation for that repo.
- `tools/browser-verify/`: a real browser against a real dev server, measuring `/dev`
  (SvelteKit) or `/_ds` and equivalent dev-only routes (Vite/React), one spec file per
  route, `--selftest` negative controls, `npm run verify:browser`. A harness written for
  one bundle and deleted after it is not verification; it is a demo. It stays committed.
- Migration landing scripts stay in the repo they serve and are named in that repo's
  apply-path paragraph.

### 2.5 `tests/`

A suite `npm test` runs to completion in CI with no secrets and no external service. Where
the repo has a database, a `tests/db/` harness runs the real migration chain against a
database the runner can start itself (`idea-app` uses embedded Postgres; a repo may use
the Supabase CLI's local stack in CI if the runner can start it, and says which). A test
that cannot fail is not a control; `IDEA_VERIFICATION_ADDENDA.md` governs.

### 2.6 `supabase/migrations/`

Numbered `NNNN_<area>_<what>.sql`, one lane produces them, the number is taken from the
highest on `origin/main` at the moment of writing, and the apply path is the repo's own.
Two migrations never redefine one object. A migration and the test that pins its
behaviour ship in one commit. Existing unnumbered SQL in a repo that adopts this is not
renumbered; it is frozen as the foundation and every new file is numbered above it.

---

## 3. Branches and merging, identical across repos

Sessions push `claude/**` branches. `integrate.yml` merges `main` into `integration`,
then every green branch into `integration`, and deletes what it merged. `main` moves only
through `deploy.yml`, pressed by a person who has typed that the migrations are applied.
Migrations that a session can apply commit straight to `main` with their test; migrations
a session cannot apply ride their branch and are landed by the repo's own path first.
`IDEA_instructions.md` owns the full rules; nothing here overrides them.

---

## 4. The prompt is the same prompt

The canned opening block, the audit phase, the claims sentence, the duplicate check, the
ledger entry text, the canned ending, and the routing header are identical for all three
repos. The only per-repo content in a prompt is the file surface it owns and a sentence
naming the repo's migration apply path, copied from that repo's `CLAUDE.md` rather than
from memory.

---

## 5. Conformance, audited 2026-09-02

Read from shallow clones of all three repos on 2026-09-02. A row is a claim about that
date; a session verifies it against the tree before building on it.

| Item | `idea-app` | `fll-app` | `frc-app` |
|---|---|---|---|
| `CLAUDE.md` in the section order of 2.1 | partial: carries a stale applied-migration paragraph (retired by prompt 0005) | strong; no branches or history sections; Windows/WSL specifics belong under Commands | 128 lines plus a "Last reviewed" line that is the whole history log; "Run via the Claude Desktop App" is retired |
| `ci.yml` | yes | none | none, and `integrate.yml` keys on it, so nothing has ever merged |
| `integrate.yml` | yes | none | yes, inert |
| `deploy.yml` | prompt 0005 | none | none |
| `docs/history/` per bundle | yes, 168 entries, verified in CI | `docs/HISTORY.md`, 4,697 lines, single file; two merged bundles owe entries | none; the log is inside `CLAUDE.md` |
| `docs/prompt-ledger/` | yes | none | none |
| `docs/decisions/` | prompt 0005 | none | none |
| Status tool | `tools/idea-status.py` | via `--repo` after prompt 0005 | via `--repo` after prompt 0005; migrations section reports unnumbered SQL |
| `tools/browser-verify/` | yes, 63 specs over 35 routes as of 2026-08-30 | `src/routes/dev/route-planner` exists; no harness | `/_ds` specimen route and `ds:capture` via `playwright-core`; per-bundle harnesses deleted after use |
| `tests/` runnable in CI | yes, embedded Postgres | 47 files, need a running local Supabase stack | none committed |
| Numbered migrations | 0001 to 0169 | 0001 to 0025, 0026 on a branch | none; `supabase/*.sql` and `sql/*.sql`, applied by hand in the SQL editor |
| Migration apply path declared | hand-apply, no ledger, `db push` forbidden | `db push` with CLI ledger; `scripts/land-migration.sh` on a branch, never run end to end | hand-apply; not written as a paragraph |
| Standing branches | none at audit | four: two unmerged (`merge-branches-migration-script-0w3t1u`, `notebook-write-permissions-sbwtjq`), two already merged and deletable | none |

Two conformance prompts were issued the same day, one per repo, each opening with its
own audit phase because every row above is a claim.

---

## 6. What stays different, deliberately

- **The migration apply path.** `idea-app` hand-applies because its remote has no ledger
  and `db push` would replay everything; `fll-app` pushes through the CLI because its
  ledger has already desynced three times from hand application; `frc-app` declares its
  own once it adopts numbering. A session reads the paragraph and never infers one repo's
  path from another's.
- **The framework.** `idea-app` and `fll-app` are SvelteKit; `frc-app` is Vite and React
  with no `svelte-check`. Its CI gate is `npm run build` plus its test suite.
- **The design system.** `frc-app` carries the FRC design system as React at
  `src/lib/design-system/`, audited by `ds:audit`, which is its own instrument with its
  own numbering and is never cross-referenced with the pre-delivery checks by number.
- **The Supabase account.** `fll-app` runs on a secondary account and pins
  `SUPABASE_ACCESS_TOKEN` per command from its own `.env`; a cloud session holds none of
  the three tokens, in any repo.

---

## Changelog

- **1.0 (2026-09-02)** - Created. Mr. Pina asked that `fll-app` and `frc-app` share the
  structure, capability and workflow of `idea-app`. The audit that opened this file
  found three workflows in three repos: `idea-app` with CI, integrate, per-bundle
  history, a ledger, a status tool and two harnesses; `fll-app` with a strong `CLAUDE.md`
  and forty-seven tests that need a WSL stack, and nothing that runs without a person;
  `frc-app` with an integrate workflow keyed on a CI file that does not exist, zero
  committed tests, unnumbered hand-applied SQL, and a `CLAUDE.md` whose "Last reviewed"
  line had become the repo's history. Names `idea-app` as the reference, lists what every
  repo carries, states what differs on purpose, and carries the conformance table as
  dated claims. Two conformance prompts, `FLL_App_Conformance_CC_PROMPT.txt` and
  `FRC_App_Conformance_CC_PROMPT.txt`, were issued with it.
