---
title: "Ledger 0146: landing `integration` into `main` by way of a stranded 0143, and a README conflict resolved by measuring instead of choosing (`claude/gallant-bell-stq5lb`, migration 0198 carried)"
date: 2026-09-11
branches: [claude/gallant-bell-stq5lb, claude/serene-franklin-2zw56t]
migrations: ["0198"]
subsystems: ["Workflow", "Deploys", "Browser verification", "Classroom", "HTML assignments"]
---

A landing bundle with no source change of its own, which turned out to be two
merges rather than one and one genuinely interesting conflict.

## The shape: 0143 was stranded, so this bundle owned two merges

`claude/serene-franklin-2zw56t` was standing five commits ahead of
`integration`, carrying migration `0198` and a ledger reading `Status: pushed`
with `Lands on: its own branch. NOT merged to main, because it carries a
migration`. That is exactly the state `integrate.yml` sweeps -- a green,
finished `claude/**` branch -- and it had not swept it. So the order was:
merge 0143 into `integration` by hand, then `integration` into `main` with
0144 already sitting on it.

Nothing about the second merge was unusual. `git merge-tree --write-tree
--messages origin/main origin/integration` exited 0 with a single tree oid and
no conflict messages, and it merged clean in fact. The first merge is where
the work was.

## `ItemDetail.svelte`: two hunks, two regions, keep both

Both sides had edited the same file for the same feature a day apart. The
import block took `Progress` and `htmlManifestShaped` from 0142 and
`assignmentLockState` from 0143; the slot between the not-live branch's
`{:else}` and `<HtmlAssignmentFrame>` took 0142's progress-rail block and
0143's comment about why a worksheet is shut. Neither side deleted or rewrote
a line of the other's, so the resolution is mechanical: 0142's block, then
0143's comment, then the frame.

**The reason this is written down rather than just done is the case it is not.**
Two edits in two regions of one file is a merge artefact and keeping both is
correct. Two edits to the SAME lines would have been a genuine content
conflict and a stop -- a landing bundle is not the place to decide which of two
authors' logic survives. The distinction is what made "keep both" a safe
instruction here and would have made it a dangerous one one hunk over.

## The README: neither side was right, and that is the argument for regenerating

`tools/browser-verify/README.md` carries two generated regions. Ledger 0142 had
regenerated them on `main` and ledger 0143 had regenerated them on its own
branch from an older base, so the merge produced a four-hunk conflict in which
both sides were internally consistent and both were wrong about the merged
tree:

| | specs | routes | /dev pages | runs | measured at |
| --- | --- | --- | --- | --- | --- |
| `integration` side | 185 | 75 | 103 | 370 | `e508157` |
| `serene-franklin` side | 186 | 74 | 102 | 372 | `afd5a27` |
| **the merged tree** | **187** | **75** | **103** | **374** | `74757ef` |

187 is 0142's `html-progress.mjs` plus the two specs 0143 added
(`html-assignment-grading-live-stalled.mjs`,
`html-assignment-grading-state-closed.mjs`). Taking either side would have left
a measured region reporting `Measurements outside threshold: 0` over a set of
routes this tree does not have -- which is precisely the failure
`readme-counts.mjs`'s own header describes at length: a stale measurement's
commit is still an ancestor of HEAD and reads as perfectly plausible, and the
one place a reader consults says there is nothing there.

### Two regions, two regenerations, in that order and for a reason

The static half went first, on its own, with `npm run verify:counts`. It is a
tree read -- no browser, under a second -- and committing it alone meant the
measured run that followed had a **clean committed tree** under it and recorded
a real sha rather than a dirty one. The measured half then came from one full
run of `tools/browser-verify/run.mjs` against a Vite dev server started by hand
on 5199 and warmed, with nothing else running:

- **374** route/width runs
- **6538** measurements
- **0** outside threshold
- **983.4s** wall clock
- **70** selftest controls (36 negative, 34 positive), **0** instrument failures
- measured on `74757ef`

`Route specs the run covered` is 187 and matches `Route specs` in the static
region above it, which is the comparison the region's own prose tells a reader
to make. Regenerated once, at the end, not per-attempt.

## The README was the only thing between the merge and green, measured both ways

This is worth recording because it is a clean positive control on the
regeneration rather than an assertion that it worked.

- `npm test` over the merged tree **before** the regeneration: 377 of 378 files
  pass, 7447 of 7454 tests, with `tests/derived-numbers.test.ts` red on **7**
  assertions -- every one of them the measured region failing to cover
  `html-progress.mjs` while claiming zero findings.
- `npm test` over the same tree **after**: **378 of 378 files, 7454 of 7454
  tests**, zero failures.

So the test that exists to catch exactly this conflict caught exactly this
conflict, and the regeneration is what cleared it. Nothing else moved.

`npx svelte-check` is **0 errors and 37 warnings in 20 files** on the merged
tree -- the documented baseline, re-derived rather than read off `CLAUDE.md`.
It needs `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported before
`svelte-kit sync`; without them a fresh cloud checkout reports the phantom
`$env/static/public` errors the verification section warns about, and this
session hit that count before setting them.

## CI, read the way `ci.yml` requires

Dispatched with `inputs.ref` set to the full forty characters,
`a6022784c39709bb2e757e927533bcf355a4ab6f`. Run **34576131896**, 07:48:41 to
07:53:59 UTC -- 5m18s, with the `Test suite` step alone at 4m22s. The duration
is the discriminator the prompt named: a sub-minute run is `actions/checkout`
failing on a short sha with the later `if: always()` steps reporting success
against an empty workspace.

`ci.yml` sets `continue-on-error: true` on all four checks, so the rolled-up
conclusion is not the signal. The aggregator's own echoed lines were read out
of the job log instead: `check`, `test`, `vanguard-changelog` and
`history-verify` all `success`, under
`ref tested: a6022784c39709bb2e757e927533bcf355a4ab6f (HEAD)`.

## Gate 4 stayed a substitution; Gate 5 stopped being one

`node tools/deploy-probe.mjs` cannot pass here -- `DEPLOY_PROBE_URL` is unset,
and `CANNOT SAY` is never a pass. Its exit 1 is not a stop, per ledger 0115's
substitution, and Gate 4 rests on `0193` through `0198` being hand-applied to
production and reported verified. **Those values were not verified by this
session and the ledger says so plainly**; no session in this container reaches
the production database, and the local `.env` is the placeholder project.

**Gate 5 is the one that changed.** Ledger 0140 landed with it unmet: its
container's egress proxy answered 403 to CONNECT for `ideabosco.com`, so it
could confirm only that Vercel said it had built, and it asked a later session
to read the footer stamp. This container reaches production.
`https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2` answered 200 with
a 596,725-byte body before the landing, stamped `04693df` -- `main`'s tip at
that moment, which is the positive control that the stamp tracks `main` rather
than being a cached constant -- and `3d825b2` after it, which is this bundle's
own merge commit. So the deploy was confirmed by reading production, not from
push output.

**Egress is a property of the container and not of the repository**, which is
the transferable part: a session that finds `ideabosco.com` refused should
report the blocked host, and a session that finds it reachable should not
assume the prior report still holds.

## What was NOT verified

- **Nothing about production's applied migration set.** `0198`'s reported
  verification values (`close_arities` 1, `close_defaults` 2, `auth_can_close`
  true, `anon_can_close` false, `service_can_close` false, `unsubmit_guarded`
  true, `closed_rows` 0) were taken as given.
- **No signed-in production surface was opened.** The footer stamp is a public
  page; nothing behind a session was read, so nothing here says the close
  control works against the real database.
- **`prefers-reduced-motion` is `no-preference` in the harness**, and every
  non-loopback request is blocked (the proxy resets `fonts.googleapis.com`), so
  all 6538 measurements were taken in the fallback font stack. Both limits
  apply to the numbers quoted above.

## What remains standing

`origin/claude/notebook-ui-theme-overhaul-0gnx0f`, five commits ahead of
`integration`, ledger 0119 reading `Status: pushed` and `Lands on: the branch.
Merge is not granted by this prompt's ending.` It is outside this bundle's
ownership and was not touched. Why `integrate.yml` has not swept it is not
established here; a session that owns it should read the workflow's own job
summary rather than assume.
