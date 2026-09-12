# `tools/browser-verify/measured/` -- one file per route spec

The measured half of the counts block in `../README.md` is derived from this
directory. **One JSON file per route spec, named exactly as its spec file
under `../routes/` is**, with `.json` for `.mjs`. `_`-prefixed files are
metadata and are not specs, the same escape hatch `routes/_shared.mjs` uses.

## Why this is a directory and not a line

It used to be one JSON blob on one line inside `../README.md`, and that line
was a SINGLE SHARED WRITE POINT THAT LOST RACES. Two lanes that each add a
route spec are the ordinary case here, and it failed in the shape nothing
warns about:

* **Neither lane re-measures.** Both regenerate the cheap static region
  correctly for their own tree, both write the same number, git takes the
  identical edit with NO CONFLICT, and the merged tree holds one more spec
  than the region claims. Green parents, red merge.
* **Both lanes re-measure.** The date, the sha and the covered list all
  differ, so the one line conflicts, and `integrate.yml`'s resolver takes the
  TARGET's side inside the markers -- which throws one lane's measurement
  away. On 2026-09-11 two sessions each spent about seventeen minutes of
  browser time on the same staleness and one of them was discarded.

Ledger 0147 named the second one: each merge resolved that block to whichever
side git picked, so `integration` sat at a measurement claiming zero outside
threshold over a set missing first one spec and then two.

**A file per spec makes the merge ADDITIVE.** Two lanes measuring two
different specs write two different files and share no line, so the merged
tree's store is the union and describes the merged tree by construction --
the same answer `docs/history/` reached when one 35,000-line record blocked
four consecutive batches, and the same answer `../routes/` itself reached
when one array's closing bracket forced three hand resolutions in a day.

## The three properties that make it work

1. **A spec's filename is its identity.** `routes.mjs` derives it from the
   spec's own `path` with `slugify` and refuses a file whose name does not
   match, so two specs can never share one and two lanes adding two specs
   always produce two different files. The store reuses that exact function;
   it does not carry a second copy of the rule.
2. **A file carries no value that moves when nothing moved.** Re-measuring a
   spec whose numbers did not change rewrites the same bytes, apart from the
   measurement instant it deliberately records. `_selftest.json` carries no
   clock and no sha at all, so two lanes running the identical instrument
   write byte-identical files and cannot conflict.
3. **The rendered block is a pure function of this directory plus
   `../routes/`.** `npm run verify:counts` -- a tree read, no browser, under
   a second -- writes both regions, so a merge here is resolved by one cheap
   command on the merged tree and never by choosing a side and never by
   finding a browser. `tests/derived-numbers.test.ts` reddens when the block
   and this directory disagree.

## What a file holds

    {
      "schema": 1,
      "spec": "marks.mjs",          the spec file this measures, and this file's own name
      "date": "2026-09-11T...Z",    when THIS spec was measured
      "sha": "<40 hex>",            the commit it was measured on
      "dirty": false,
      "widths": [375, 1440],        every width the pass ran it at
      "runs": 2,
      "measurements": 35,
      "outsideRows": [ ... ],       the findings on THIS spec, with their checks
      "ms": 5290                    this spec's share of that pass's wall clock
    }

`ms` is the pass's wall clock divided by the number of specs it covered. It is
an ATTRIBUTION, not a stopwatch on one route: `run.mjs` reports one wall clock
for the whole pass, so the only honest per-spec number derivable from it is an
equal share, and the sum over a store written by a single full pass is that
pass's wall clock exactly. The block's row says "summed" for that reason.

## Writing it

    npm run verify:readme                       every spec; a browser, ~17 min
    npm run verify:readme -- --route marks      just the specs matching `marks`

**The second form is the one this directory exists for.** Adding a route spec
used to make the measured half stale and cost a full pass to fix, because the
writer refused any report that was not a full pass of the tree. It now writes
only the files for the specs the report covered and leaves every other file
alone, so the fix for a newly added spec is that spec's own measurement --
seconds -- and the result is a new file no merge can discard.

What is still refused is a report that ran a spec at SOME of the widths: a
file claiming two widths from a one-width run is the same lie in a smaller
costume, so every spec in a report must carry a run at every width.

A spec deleted from `../routes/` leaves its file here until somebody removes
it; `npm run verify:counts` says which files those are, and they are reported
rather than failed on, exactly as the old `removed` set was.
