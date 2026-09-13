# The production deploy is throttled, and nothing in the repo knew it

- **Date:** 2026-09-13
- **Branch:** `claude/beautiful-archimedes-a3lqme`
- **Ledger:** `docs/prompt-ledger/entries/0204-vercel-deploy-throttle.md`
- **Scope:** the deploy pipeline. One configuration file changed (`vercel.json`).
  No file under `src/`. No migration.

Production serves code from 2026-09-12 21:22Z. Two landings have gone to `main`
since and neither reached a student. The cause is not a broken build: it is a
Vercel account quota that pauses deploying, and the repository had no record of
it anywhere, so every session since has been landing work into a queue it could
not see.

---

## 1. What is actually live

| Measured | Value |
| --- | --- |
| `https://ideabosco.com/` | **HTTP 200**, 21,095 bytes, 0.57s |
| Version string served | **`v1.1514`** |
| Deploy sha served | **`247dfc4`** |
| That commit | `Merge integration into main: ledger 0188, four lanes and the cross-merge collision they produced` |
| Its commit date | **2026-09-12T21:22:27Z** |

Both strings were read out of the served HTML, not inferred. `deploy.sha` is the
commit the deployment was built FROM, which is the field that answers "what code
is live" (`CLAUDE.md`, the build-identifier rule).

**`main` has moved twice since, and neither move is serving:**

| Commit | Date | Subject |
| --- | --- | --- |
| `85543209` | 2026-09-12T22:47:22Z | Merge integration into main: ledger 0191 (material densities) and ledger 0193 (branch audit) |
| `ee4a1c42` | 2026-09-13T02:01:29Z | Merge integration into main: IdeaCAD history and team surfaces, the notebook grid, the draft-mirror hold, and the material citation model |

Ledger 0200's own landing is `ee4a1c42`. So production was already stuck before
0200 ran, and 0200's landing is one of the two that never shipped. **A session
that lands work today changes nothing a student can see.**

## 2. What is throttled, and what is not

Reported from the Vercel dashboard on 2026-09-13:

- The GitHub check reads **`Vercel - Deployment rate limited - retry in 24 hours`**,
  beside a **green `CI / test`**. The suite passed. The deploy was refused.
- Usage reads **Deployment Storage 262.5 GB / 10 GB**. Every other resource is
  under 20 percent.
- Per project: `idea-app` **29.99 GB**, and the account's other three projects at
  **0 B**, **14.56 MB** and **9.75 MB**.
- The account is **Hobby**, which has **no overage billing** and pauses the
  affected feature instead of charging for it. Its deployment retention is
  already hard-capped at 30 days with no setting to change.

**THROTTLED: deploying.** New production and preview builds are refused.

**NOT THROTTLED: serving.** Transfer, edge requests and function invocations are
all under 20 percent, so `ideabosco.com` stays up and keeps serving `247dfc4`.
That is why nothing looked broken: a throttled deploy is invisible from the
outside, because the last good deployment carries on answering. The site being up
is not evidence the pipeline is working, and for the last two landings it has been
evidence of the opposite.

**The two storage figures do not reconcile and this audit does not reconcile
them.** 29.99 + 0.0146 + 0.0098 GB is about 30 GB against an account total of
262.5 GB. Nothing readable from this container explains the remaining ~232 GB;
it is plausibly retained deployments of deleted projects or build cache, and that
is a guess, stated as one. What the per-project number does support is the
proportional argument below: whatever the account total is made of, `idea-app` is
the only project of the four generating deployments at all.

## 3. Three independent causes

Each of these produces retained deployments on its own. Removing one does not fix
the others.

**a. Agent-branch previews nobody can open.** Every push to a `claude/**` or
`codex/**` branch builds a preview deployment. Those previews cannot be used for
what previews are for: every production surface behind the landing page needs a
signed-in Bosco Tech Google session, which no automated run holds and which a
preview host does not carry. `CLAUDE.md` already says the verification path for a
signed-in surface is `/dev/login` against a local stack. So the preview is built,
retained for 30 days, and opened by nobody. Deleting the branch does not delete
its deployments — `integrate.yml` deletes merged branches, and 51 `claude/**` and
`codex/**` refs are alive right now, which is the count of branches, not of the
deployments they have already produced.

**b. `integrate.yml` sweeps pushing `integration`.** Every merge the workflow
makes pushes `integration`, and every push builds another preview.
`origin/integration` took **585 first-parent tips in the last 30 days** — the same
order of magnitude as production itself.

**c. The classroom GitHub export.** Measured below. This is the one worth fixing
first, and the one the repository can fix by itself.

## 4. The export, measured

`src/lib/server/classroom-export.ts` pushes a commit to `main` on every item save,
with no human involved. Each push is a production deploy.

Over the last 7 days on `origin/main`:

- **794 commits**, of which **59** have a subject beginning `classroom:`.
- **155 first-parent tips** — the sequence of states `main` actually took, which is
  the figure that approximates deploy count, since a merge of many commits is one
  push and one build.
- **47 of those 155 (30%) touch `materials/` and nothing else.**

Over the 30-day retention window, which is the window that decides storage:

- **565 first-parent tips on `main`.**
- **242 of them (43%) change nothing outside `materials/`.**

**One assignment, one day.** `Shop Trophy: Presentation and Defense` produced seven
separate commits on 2026-09-09, each its own push and its own production build:

| Commit | Time (local) | Subject |
| --- | --- | --- |
| `7cf1ea6d` | 00:43:57 | ... (assignment) r1 |
| `74db7ba4` | 00:43:59 | ... (assignment) r1 |
| `036be855` | 00:44:01 | ... (assignment) r1 |
| `456f340f` | 01:02:08 | ... (assignment) r2 |
| `92b8f1de` | 01:02:12 | ... (assignment) r3 |
| `91f4b996` | 01:21:26 | ... (assignment) r4 |
| `c69f348a` | 01:21:29 | ... (assignment) r5 |

**The prompt that commissioned this audit said `IDEA-BLADE` produced r3 through r9
as seven commits on 2026-09-09. That is not what the history holds and the
corrected reading is above.** `IDEA-BLADE | PART 1` has four revision commits in
the window (r6 on 09-09; r7, r8, r9 on 09-10) and `IDEA-BLADE | PART I` one more
(r10 on 09-11). The seven-in-one-day case is `Shop Trophy: Presentation and
Defense`, and it is a worse example than the one claimed, not a milder one: the
first three commits are **the same revision r1**, pushed at 00:43:57, :59 and
:01 — one save fanned out into three builds because the item is posted to more
than one section. Two more pairs (r2/r3 four seconds apart, r4/r5 three seconds
apart) have the same shape.

**Each of the seven touches `materials/` only**, verified per commit. One of them,
`74db7ba4`, is `1 file changed, 1 insertion(+), 1 deletion(-)` — a full production
build for a one-line change to an export.

**And the build it triggers is byte-identical.** `materials/` is not in the build
graph: there is no `static/materials`, no `import.meta.glob` reaches outside
`src/` (the two that exist resolve to `src/lib/legacy/assignments/` and
`src/lib/marks/`), and every one of the ~16 references to `materials/` under
`src/` is a prose comment or a fixture string in a dev harness. Nothing imports
the directory, so a commit that touches only `materials/` cannot change a single
byte of the emitted site.

**Is the export the dominant cause?** For **production** deploys, yes and by a
wide margin: it is 43% of them over the retention window, and it is the only
category that is 100% waste. Across **all** deployments it is not dominant —
565 production tips against 585 integration tips plus an unmeasured agent-branch
preview count means the lane workflow produces more deployments in total than the
export does. The honest statement is the narrower one: **the export is the largest
single removable cause, and the only one whose removal costs nothing at all**,
because the build it skips could not have differed from the one before it.

## 5. The fix is in the repo now

Mr. Pina is setting Vercel's Ignored Build Step to the rule below by hand today. A
setting that exists only in a dashboard is invisible to every future session and
to `tools/idea-status.py`, which is the same failure this audit is about: the
throttle itself was a dashboard fact nothing in the tree recorded.

**`vercel.json` supports it.** The key is **`ignoreCommand`**, and that is
confirmed rather than remembered: the file already declares
`"$schema": "https://openapi.vercel.sh/vercel.json"`, and fetching that schema
(HTTP 200, 420,507 bytes) shows `ignoreCommand` among its 42 top-level properties,
typed `string | null` with **`maxLength: 256`**. The whole of `vercel.json` still
validates against that schema afterwards, which matters because the schema sets
`additionalProperties: false`.

The rule, as one POSIX-shell line, 145 characters:

```
if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then exit 0; fi; git diff --quiet HEAD^ HEAD -- . ':(exclude)materials/' 2>/dev/null && exit 0; exit 1
```

`[ ]` rather than `[[ ]]`, because the Ignored Build Step is not guaranteed a bash.

**EXIT 0 SKIPS THE BUILD. That is backwards from the intuition** and is the single
most likely thing to be got wrong by someone editing this later. The command is
asked "should I ignore this build?", so success means ignore. A rule that reads
like a test for "is this worth building" and returns 0 for yes would skip exactly
the commits it meant to build and build exactly the ones it meant to skip, and the
symptom would be a site that stops updating — which is indistinguishable from the
throttle this rule exists to relieve.

Replayed over the real history, `HEAD` substituted per commit:

| Case | Commit | Result | Wanted |
| --- | --- | --- | --- |
| export, materials-only | `7cf1ea6d` | exit 0, skip | skip |
| export, one-line | `74db7ba4` | exit 0, skip | skip |
| export | `c69f348a` | exit 0, skip | skip |
| real landing | `ee4a1c42` | exit 1, build | build |
| real landing | `85543209` | exit 1, build | build |
| real landing | `247dfc4a` | exit 1, build | build |
| non-`main` ref | any | exit 0, skip | skip |
| root commit (no `HEAD^`) | `5c2bc96b` | exit 1, build | build |

Over the full 30-day window on `origin/main` first-parent: **242 skipped, 323
built, 565 total — a 43% reduction in production builds**, with every skipped one
provably byte-identical to its predecessor.

**The fail-safe direction is deliberate.** `git diff` against a missing `HEAD^` —
a root commit, or a shallow clone — exits non-zero, `&&` does not fire, and the
rule falls through to `exit 1` and BUILDS. Every unknown case builds. The rule can
cost a redundant build; it cannot skip a real one.

**What it does not do:** it does not reduce preview deployments at all. The first
clause skips every non-`main` ref, which is the *opposite* of what causes (a) and
(b) need, and is correct here only because this is the rule Mr. Pina asked for and
its job is production. Turning off previews for agent branches is a separate
decision with a separate cost, and it is not made here.

## 6. What the throttle has already cost: part C of the realtime verification

This is the clearest evidence of the price, and it is not hypothetical.

`0211_ideacad_realtime_policy.sql` was applied by hand on 2026-09-13. Its
verification file, `supabase/data/0203-ideacad-realtime-verification.sql`, has
three parts. Part B answered correctly: the three functions exist and carry
exactly the grants `0211` names. **Part C — the behavioural probe, the only part
that can tell a policy that filters from a policy that permits everything —
returned `NO DOCUMENT EXAMINED`.**

That is not a policy failure. Part C selects a row out of `ideacad_documents` to
test against, and **that table holds zero rows in production**. It holds zero rows
because the IdeaCAD surfaces that would let a student create one are in
`ee4a1c42`, and production serves `247dfc4`. So:

> the deploy throttle kept the surfaces off production → no student could open an
> IdeaCAD document → the table stayed empty → the behavioural half of the
> verification could not run → `0211` is applied with its ACL proven and its
> **behaviour unverified**.

Three landings' worth of consequence from one dashboard quota. The record at
`docs/migrations-applied/0211-lucid-dirac-8b6m2f.md` says this on its face rather
than letting `outcome: applied` imply more than part B earned.

**And the failure was harder to see than it needed to be.** Part C was a `do`
block reporting through `raise notice` and `raise warning`. **The Supabase SQL
editor displays neither**, and it shows only the last statement's result set — so
a correct, passing run and a run that examined nothing produced the same empty
pane. That cost an hour on 2026-09-13.

### 6a. And part C could never have passed anyway

Rewriting it surfaced a **second, independent defect, and a worse one**: part C
had a bug that made a PASS unreachable on any database, with or without a
document in it.

`current_user_email()` (0067) **does not read the claim's `email`.** It looks
`auth.uid()` up in `auth.users`, and `auth.uid()` reads the claim's **`sub`**.
Part C set only `email`. So `current_user_email()` returned the **empty string**,
which is the first branch `_ideacad_document_role` tests, the owner resolved to
no role, and all eight answers came back false.

Measured against the **deployed** block's own identity sequence, on the real
migration chain on an embedded Postgres:

```
CONTROL owner=oc.owner@boscotech.net current_user_email=[]
        frame_read=f frame_send=f ping_read=f ping_send=f
```

The verdict ladder reads that as **`FAIL -- REFUSING THE OWNER`** — an accusation
against `0211` for a fault entirely inside the verification file. So the first
person to run part C against a database with a document in it would have gone
hunting a policy bug that does not exist.

**A third thing fell out of the rewrite.** The obvious modern shape — one big
`SELECT` returning rows — **cannot work here, and that is a measured property
rather than a style preference.** `current_user_email()` is `STABLE` and takes no
arguments, so Postgres may evaluate it **once per statement** and reuse the
answer. Measured: inside a single statement that signs the owner in, reads, then
signs a stranger in and reads again, the stranger's read came back **as the
owner** (`str_seen` = the owner's address, `str_fr` = true), while the identical
sequence split across two statements answered correctly (`''`, false). A
single-statement probe therefore cannot test two identities at all, and one that
tried would have reported `PERMITTING EVERYTHING` against a working policy —
swapping a false acquittal for a false conviction. plpgsql is the correct shape
because each assignment inside a block is its own statement.

### 6b. What part C is now

It keeps the block, fills a **temporary table**, and a plain `select` after it
returns the rows. Same controls, same ladder, same refusals, and `set_config`
still transaction-local with the clearing call kept. Changes beyond returning
rows, each stated because none was asked for:

- **The owner is signed in by `sub`**, resolved from `auth.users`. Without this
  the probe cannot decide anything.
- **A new refusal, `OWNER NOT RESOLVABLE`**, for a document whose owner has no
  `auth.users` row — the instrument admitting it cannot tell a refusal from a
  caller who was never there, rather than blaming the policy.
- **A second stranger.** The planted address is in no `auth.users` row, so it is
  only a **signed-out** control. The **classmate** is a real signed-in account
  enrolled in a section the item is posted to, holding no grant, and confirmed
  not to manage the item — the adversary a roster-shaped predicate would wrongly
  have admitted. When none is found the verdict says `PASS (PARTIAL)` and states
  that the signed-in adversary was never asked.
- **A `NULL` rung, read first.** A `NULL` answer fell through every test in the
  old ladder into the `PASS` arm.

Proven on the real chain, all eight branches, including a **mutation proof in the
permissive direction** (`_ideacad_realtime_can_read` replaced with `select true`):

| Case | Verdict |
| --- | --- |
| real policies, document present | `PASS -- ENFORCING` (owner read/send **true**, planted stranger **false**, classmate **false**) |
| `can_read` mutated to `select true` | `FAIL -- PERMITTING EVERYTHING` |
| no document | `NO DOCUMENT EXAMINED` |
| parser broken | `INSTRUMENT BROKEN` |
| owner not in `auth.users` | `OWNER NOT RESOLVABLE` |
| no classmate available | `PASS (PARTIAL)` naming what was not asked |

The claim is cleared afterwards (`request.jwt.claims` reads empty).

**`0211`'s policies are, on this evidence, correct** — the owner reads and sends,
and neither stranger gets anything. That is measured against the real migration
chain, **not** against production, which still has no document to probe.

## 7. What is not verified here

- **Every Vercel dashboard figure in section 2 is Mr. Pina's report**, relayed
  through the ledger 0204 prompt. No process in this repository can reach the
  Vercel API, and none tried. The git measurements in sections 1, 4 and 5 are this
  container's own and were re-derived rather than taken from the prompt — which is
  how the r3-r9 correction in section 4 was found.
- **`ignoreCommand` has not been observed taking effect.** It is confirmed against
  the published schema and the rule is replayed against real commits locally; that
  the deployed platform honours the key on the next push is not something this
  container can watch. The first production landing after this one is the test.
- **The 262.5 GB account total is not reconciled** against the per-project figures,
  as section 2 says plainly.
- **No browser pass.** This bundle touches no mounted surface.
- **The rewritten part C is proven against the real migration chain on an
  embedded Postgres**, across all six branches in the table above including the
  permissive mutation. It has **NOT** been run against production, and it still
  cannot return a `probed` verdict there until a document exists — which needs a
  deploy. The `PASS -- ENFORCING` above is evidence about `0211` on a test
  database, not about the live one.
- **The classmate selection is not exercised against a real roster.** On the test
  fixture the classmate is a seeded student; production rosters carry
  self-enrolled instructors (0138), which the probe excludes by asking
  `_classroom_manages_item` as that caller. That exclusion is proven to run, not
  proven against a real mixed roster.
