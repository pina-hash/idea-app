---
title: "A prepare step's `until` did nothing, and the tree said so in a number nobody had counted: the defect was real, latent, and zero specs were relying on it (`claude/inert-until-step-wcw884`, no migration)"
date: 2026-09-06
branches: [claude/inert-until-step-wcw884]
migrations: []
subsystems: ["Browser harness", "Testing"]
---

Prompt 0082. An instrument fix with no `src/` change, no migration, and no
student-visible effect -- so no `classroom-updates.json` entry, said here rather
than left as silence.

Started from `eec8151` on `origin/main`, in `/home/user/idea-app`. The prompt
said to start from `origin/integration` and merge `origin/main` in early;
`origin/integration` at `13d1747` is a strict ANCESTOR of `origin/main` at
`eec8151` (`git merge-base --is-ancestor` confirms it, and
`git rev-list --left-right --count origin/main...origin/integration` reads
`4 0`), so the merge the prompt asks for was already done -- the branch contains
every commit `integration` has. No merge commit was written because there was
nothing to merge. The container's git identity was already set
(`Claude <noreply@anthropic.com>`), so the "Please tell me who you are" failure
the prompt warns about did not arise.

## The defect is real, and it is exactly as described

`tools/browser-verify/run.mjs` ran an `evaluate` prepare step and judged it on
one thing: whether it threw.

```js
const out = await page
	.evaluate(`(${step.evaluate})()`)
	.then((v) => ({ ok: true, v }))
	.catch((e) => ({ ok: false, err: e.message.split('\n')[0] }));
results.push(prepareEvalResult(step, out));
```

`step.until` is read nowhere in it. Beside it, at line 216, the click branch
passes the same field through and honours it:

```js
const r = await clickUntil(page, step.click, step.until, {
	attempts: step.attempts ?? 12,
	gapMs: step.gapMs ?? 300,
	force: step.force ?? false
});
```

So an `until` written on an `evaluate` was discarded in silence: no error, no
warning, no row, and a green `prepare-eval` line whose threshold sentence read
`the step runs without throwing`. In the spec source it reads like a guarantee.

## The blast radius is ZERO, and that number is the finding

The prompt's ledger note says **71 spec files use that step**, and asks for
every inert `until` by file and by step. Loaded rather than grepped -- every
spec under `tools/browser-verify/routes/` imported and its `prepare` array
walked -- the tree answers:

| | |
| --- | --- |
| route specs (`_`-prefixed excluded) | 116 |
| specs with a `prepare` block | 74 |
| `evaluate` prepare steps | **43, across 30 files** |
| `click` prepare steps | 68 |
| `waitFor` prepare steps | 37 |
| **`evaluate` steps carrying an `until`** | **0** |
| `until` on any other non-click step | **0** |

**The 71 is a grep count, not a step count.** 71 files contain the string
`evaluate` and 70 contain `evaluate:` -- but most of those are `orderResult`
entries, which take an `evaluate` field of their own and are a CHECK rather
than a prepare step (`attach-reach.mjs` carries one of each, four lines apart).
The prepare-step population is 43 in 30 files.

**So the defect is LATENT, not active.** Nothing in this tree has been passing
on a discarded `until`, because nothing in this tree has written one. What was
broken was the ability to write one at all: an author reaching for the
guarantee the click branch offers got silence. That changes what this bundle
is -- a guard against the next author rather than a repair of 71 files -- and
it means **B2 fixed nothing, because there was nothing to fix.** Saying so is
worth more than a fix would have been: a session that reported "all 71 repaired"
would have been reporting on a set that does not exist.

**The documentation was not wrong, which is the one mercy here.**
`routes/README.md` documented `until` only under `click`, and described
`evaluate` as "runs a page-side function SOURCE and reports its return value" --
true, and silent about `until`. So the defect contradicted no written claim; it
simply left a plausible thing to write with nothing anywhere to say it did not
work.

## What the fix does

`evaluateUntil` in `run.mjs` re-runs the step until its own predicate holds, up
to `attempts` (12) with `gapMs` (300) between, both defaulting exactly as the
click branch's do, and reports the attempt count AND the elapsed time. A step
with no `until` takes the untouched `prepareEvalResult` path, byte for byte.

Four decisions worth keeping:

- **The predicate is invoked through `waitUntil`, not through a second poll loop
  written here.** `waitUntil` already carries the `page.evaluate(string)`
  expression workaround -- an arrow-function source handed over bare becomes a
  function OBJECT and is never `=== true` -- and a second copy of that is
  precisely the thing that stops matching. Each attempt gets `gapMs` of
  `waitUntil`, which is the gap and the poll in one primitive.
- **A THROW stops immediately** rather than being retried into a count.
  Retrying measures the same exception twelve times; the author needs the
  message.
- **A predicate that ALREADY HELD is annotated, not failed** -- deliberately the
  opposite verdict from `prepareClickResult`'s. A click whose predicate held at
  rest never physically fired and reached no state; an evaluate DID run. What is
  left to say is that the predicate could not have told the difference, so the
  row says `[the predicate ALREADY HELD before the step ran -- it does not
  discriminate]` and stays green.
- **A failed `until` prints the predicate in full** on its own line, because the
  label carries the step (truncated) and the predicate is the half that did not
  hold.

**And an `until` no branch consumes is now a measurement rather than a shrug.**
`prepareStepShapeResults` reports two shapes that were previously silent: an
`until` on a `waitFor` step (whose predicate is its own `waitFor`), and a step
with **no action key at all** -- which is what a mistyped `evaulate:` produces,
and which today is a 200ms wait wearing a spec's clothes. A route spec is a
plain object literal, so nothing type-checks either. Neither fires on this tree
(0 `prepare-step` rows in a full 232-run pass), which is what makes them a
tripwire rather than a repair.

### One deviation from the brief, stated rather than smuggled

The brief says a timed-out step must **THROW** "rather than continuing". It does
not throw; it pushes a failed measurement, exactly as `prepare-click` and
`prepare-wait` do. A throw from inside `runRoute` propagates to `main`'s
`.catch` and exits 2, **abandoning the whole pass** -- on the measured run
below, 232 route/width runs and 3,410 measurements would be lost to one route's
bad predicate. That is the opposite of the change this file's own header
describes as the fix for this class of defect: prepare steps were promoted FROM
narration TO measurements precisely so a bad step is counted rather than acted
on. What the brief's control actually asks for is met in full: the step does not
pass, does not merely warn, is counted in the summary, and **`--strict` exits
1** -- measured below.

### `run.mjs` no longer calls `main()` at module scope

It called it unconditionally, so merely IMPORTING the module -- which any test
of the exports above must do -- booted a vite dev server and a Chromium and
started a full pass. Measured: it did exactly that on the first attempt. It is
guarded on being the entry point now; the CLI behaves identically.

## The four controls

**All four ran, on the real instrument, at 375px, against `/dev/marks` through a
temporary spec created for the controls and DELETED afterwards** (the bundle
owns `routes/**` only to fix an `until` it proves inert, and it proved none).

1. **A predicate false at first and true later is WAITED for.** The step
   increments a counter and the predicate wants it at 3.
   `3 attempt(s), 449ms, predicate satisfied -- ran 3`. Attempts greater than
   one, which is the whole claim.
2. **A predicate that is never true FAILS.** Same step, predicate `>= 999999`:
   `>>> prepare-eval ... 12 attempt(s), 2483ms, predicate never satisfied in 12
   attempt(s) -- ran 12`, with `until: () => (window.__bv ?? 0) >= 999999` printed
   beneath it, `1 outside threshold` in the summary, and **`--strict` exit code
   1**. It does not pass and it does not merely warn.
3. **A step with no `until` is unchanged.** Three real routes carrying five
   `evaluate` steps between them (`/dev/check-in-manage`,
   `/dev/classroom-images`, `/dev/composer-attach`), run at both widths on the
   reverted harness and again on the fixed one: **12 `prepare-eval` rows,
   identical after normalising run-to-run timing noise**, all 12 still reading
   the old threshold sentence `the step runs without throwing` and none reading
   the new one, and both runs reporting `6 route/width run(s), 78
   measurement(s), 0 outside threshold`.
4. **Reverted, the control stops proving the fixture.** `run.mjs` restored from
   a `cp` copy (md5 `599c1e85719b14ae432de3516479190f`, byte-identical to HEAD)
   and control 1's spec re-run unchanged: `ok prepare-eval ... returned -- ran 1`,
   threshold `the step runs without throwing`, `0 outside threshold`, exit 0.
   **`ran 1`** is the measurement: the step ran once and the `until` was
   discarded, exactly as diagnosed. The fix was then restored from its own `cp`
   copy (md5 `9558a181df61ad31dc613dbb2d876e2f`).

`tests/browser-verify-prepare-until.test.ts` carries all four durably (9 tests),
plus the throw case, the already-held annotation, the shape guard both ways, and
a positive control sweeping every shipped prepare step so "0 bad steps" cannot
be confused with "the sweep found no steps". It lives in `npm test` rather than
in `--selftest` because this harness is deliberately outside CI, and the defect
it guards prints `ok` and costs nothing -- the repository's own bar for a test
is a regression that would be SILENT, and this one is silent by construction.

**It imports `run.mjs` through a COMPUTED URL, and that is load-bearing.** A
static `import ... from '../tools/browser-verify/run.mjs'` pulls the whole
`tools/browser-verify` JS tree into `svelte-check`'s program: measured in this
container, the baseline went **from 0 errors / 37 warnings to 356 errors / 37
warnings**, 348 of them in six harness modules this bundle does not own. A
computed URL is not statically resolvable, so the harness stays a tool.

## Cold and warm: the full pass, twice, and TWO ROUTES MOVED

| | cold (`node_modules/.vite` removed first) | warm (immediately after) |
| --- | --- | --- |
| route/width runs | 232 | 232 |
| measurements | 3,410 | 3,410 |
| **outside threshold** | **12** | **2** |
| wall clock | 597.1s | 555.6s |
| `prepare-step` rows (the new guard) | 0 | 0 |

**Stable across both: the two known `/dev/notebook` `tap-reach` rows**, the ones
the committed counts block already carries ("under the floor on width --
decision 12, with the owner"). **Exactly two route/width runs moved, and both
moved the same way -- five findings cold, none warm:**

- **`/dev/foundry-submit` @1440** -- `contrast [refusal sentence on its panel]`,
  `tap-target [per-issue and copy-all controls]` (`0 matched`), and three
  `presence` rows at `present 0` (the drive note, the two issues panels, the
  refusal + warning sentences). **Its prepare step PASSED at both widths**
  (`prepare-click [data-drive="zip-bad"] -- 1 matched, 2 attempt(s), predicate
  satisfied`), so the step's own predicate held and the panels the checks then
  looked for were not there yet. And it failed at **1440**, the warm width,
  which the width-order explanation below does not cover.
- **`/dev/classroom-inspector?case=assignment&open=1` @375** -- two `contrast`
  rows at `no match` and three `presence` rows at `present 0` (the three groups).
  **This spec has NO `prepare` block at all**, so there is no predicate anywhere
  in it and nothing that could have waited.

**Neither is this bundle's doing, and that is measured rather than argued.**
`run.mjs` was restored from its `cp` copy to the HEAD byte-image, the vite cache
cleared, and those two routes run alone: `/dev/classroom-inspector?case=assignment&open=1`
@375 reproduced the identical five findings **plus two more**
(`order-result [empty groups / total groups] [0,0]` against `[0,3]`, and the
block-label row) -- a colder reading still. `/dev/foundry-submit` did not fire in
that small run, consistent with needing the deeper coldness of a full pass.
The fix was then restored from its own `cp` copy, md5 verified.

**So two route/width runs in this harness have been passing on incidental
timing rather than on a predicate.** Both are REPORTED and neither is fixed
here: `/dev/classroom-inspector`'s answer is a `waitFor` prepare step in its own
route spec, and `/dev/foundry-submit`'s is a predicate over the panels its
checks read -- and this bundle owns `routes/**` only to repair an `until` it
proves inert, of which there are none. Neither is a defect in `src/`, which was
read-only throughout and is untouched.

Hydration medians were flat between the two passes (cold 466ms @375 / 507ms
@1440; warm 498ms / 482ms), so `waitForApp`'s own number does not see whatever
these two routes are waiting on -- which is the same thing the `waitFor` section
of the harness README already says about `/dev/notebook-review`.

## The 375-only asymmetry is explained, and there is no second cause under it

0070 saw its flake "always at 375". **`WIDTHS` is `[375, 1440]` and `main`'s
loop is spec-outer, width-inner** -- so 375 is by construction the FIRST visit to
every route and the one that pays vite's module-graph compile, and 1440 is
always the warm second visit of the same page. It is not that a narrower
viewport renders sooner; it is that 375 is where "cold" lands. This harness
already had the measurement written down for a different route: on
`/dev/notebook-review` the cold 375 pass measured **0 cells** and the warm 1440
pass measured **30**, "which reads exactly like a console that renders no grid
at phone width and is nothing of the kind."

So "always at 375, always on the first run after a cold `vite dev` boot" is one
cause counted twice, not two causes. Nothing in this bundle's readings needs a
second one.

## The suite and the type check

Run in this container on 2026-09-06, times in **America/Los_Angeles**:

- **`npx svelte-kit sync && npx svelte-check`, 02:08:11 to 02:09:02 PDT: 0
  errors, 37 warnings**, breakdown **31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`** -- the baseline
  `CLAUDE.md` states, re-derived rather than trusted, with
  `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` exported as placeholders
  before the sync so the eleven phantom `$env/static/public` errors a
  `.env`-less checkout reports do not land.
- **`npm test`, 02:03:31 to 02:07:35 PDT: 291 test files, 289 passed, 2 failed;
  5,936 tests, 5,932 passed, 4 failed. 241.6s.** Both failing FILES are RED AT
  BASE and are named under "Not verified" below: `tests/derived-numbers.test.ts`
  (2) and `tests/gauntlet-doc.test.ts` (2). Nothing this branch wrote fails, and
  the new `tests/browser-verify-prepare-until.test.ts` is among the 289 passing
  files.

## Not verified

- **Nothing was run against the live Supabase project**, no migration was
  written and none was applied. `MIGRATION PERMITTED: NO` was honoured.
- **Production was not reached**, per the brief.
- **No signed-in surface was measured.** The harness covers `/dev` routes only;
  a real route needs a Bosco Tech Google session no automated run holds.
- **Web fonts do not load** (the harness blocks every non-loopback request), so
  every text measurement in both passes is in the fallback stack, and
  `prefers-reduced-motion` is `no-preference` throughout, so that path is not
  exercised.
- **The README's measured counts block was NOT regenerated, deliberately.** It
  records `107` covered against `116` in the tree, so nine specs added since
  2026-09-05 are unmeasured: `composer-draft`, `upload-limits`, and the seven
  `greenline-portal*`. That staleness is the block's own supported state ("a
  stale-but-honest measured half"), and it is why **`tests/derived-numbers.test.ts`
  is RED at base** -- proved by running it against HEAD's own README, 2 failed /
  16 passed, byte-identically to with this branch's changes, and this branch
  touches neither counts data comment. Regenerating it needs a decision this
  bundle should not make alone: `--from` the COLD report writes 12 findings that
  belong to other surfaces into a shared generated region, and `--from` the WARM
  one writes 2 and hides the ten -- which is exactly the green-for-an-unchecked-
  reason this file is about. Both full-run JSON reports exist; whoever regenerates
  it should say which they used and why.
- **`tests/gauntlet-doc.test.ts` is RED at base too**, and it is not
  `integration`-only as the brief expected: on `origin/main` at `eec8151`,
  `supabase/migrations/0184_gauntlet_run_event_bounds.sql` is in the tree and
  `docs/GAUNTLET.md`'s migration table has no row for `0184`, so both of that
  file's real-tree assertions fail. The three remote branches are `main`,
  `integration` and this one -- prompt 0067's fix branch is gone, and whatever it
  did has not reached `main`. `docs/GAUNTLET.md` is outside this bundle's
  ownership and was not touched.
