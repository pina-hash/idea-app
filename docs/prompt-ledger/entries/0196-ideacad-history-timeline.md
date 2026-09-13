# 0196 IdeaCAD: the history timeline, and the retirement of the in-memory undo stack

- Issued: 2026-09-13
- By: router chat
- Owns: the history timeline surface under `src/lib/ideacad/`, the history
  region of `src/lib/ideacad/store.ts`, `src/lib/ideacad/ui/undo.ts`,
  `tests/dom/ideacad-timeline*`, `tools/browser-verify/routes/ideacad*.mjs` and
  its measured store entries, `docs/prompt-ledger/entries/0196-*`, and its own
  `docs/history/` entry. Ledgers 0197, 0200 and 0201 ran in parallel; 0200 owns
  the landing and 0201 owns the shared-open path in `store.ts`, and neither was
  touched.
- Migration permitted: no. Claims: none. Highest on `origin/integration` at
  branch time: **0210**; `origin/main` carried through 0208. `0193` through
  `0210` are all applied to production and verified per this prompt.
- Status: pushed
- Branch: `claude/gracious-hopper-a46lec`, branched from `origin/integration` at
  `f4616dca`.
- Notes: 0209 landed the durable action log and said in its own history entry
  that `ui/undo.ts` was still live beside it. So the log was **written and read
  by nothing**: a student's Ctrl+Z still hit fifty in-memory trees the next
  reload threw away. This bundle is the surface over that log and the
  retirement of the stack.

  **Five things were done outside a strict reading of the Owns line and every
  one is named here rather than left to be found.**

  1. `src/lib/ideacad/transports.ts` gained `createIdeacadHistoryTransports`,
     and `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` calls it.
     Without those two lines 0209's RPCs have no caller at all on the real page
     -- `createIdeacadStore` was being called with no `options.history`, which
     is the omission 0178 closed for the editor and 0190 for the team panels.
  2. `src/lib/ideacad/ui/feature-model.ts` gained `FIELD_LABELS`/`fieldLabel`,
     and `panelFor`'s nine `num()` calls read it instead of carrying the label
     as a literal. The timeline names the same parameters; a second copy of
     those nine strings is a control and a history row disagreeing about what
     the student just changed.
  3. `src/lib/classroom/ItemDetail.svelte` forwards three props to
     `BladeEditor`. Three lines, inside the IdeaCAD region.
  4. `tests/dom/ideacad-ui-model.test.ts` and
     `tests/dom/ideacad-ui-mount.test.ts` lost the assertions that drove the
     retired `UndoStack`. Both blocks were REPLACED by a comment saying where
     each rule went and which two did not carry across, rather than deleted.
  5. `tools/browser-verify/run.mjs`'s `BREAKAGE` presets gained `.ideacad`.
     Measured: `--break overflow` and `--break invisible` both came back GREEN
     on this route because neither selector list named the IdeaCAD console's
     root -- so two live controls had been proving nothing on all five existing
     `/dev/ideacad*` specs since they were written. That file's own comment
     already calls this out as the failure mode ("a preset that silently fails
     to inject its defect is a live control that proves nothing"), which is what
     made it a defect to fix rather than a preference.

## Outcome

**Landed on `claude/gracious-hopper-a46lec`, NOT merged to `main`, and item 4 of
the six-item checklist is the stop.** `node tools/deploy-probe.mjs --ref
origin/integration` exits **1** with "DEPLOY_PROBE_URL is not set, so
production's applied set cannot be read. This is 'cannot confirm', never
'applied'." The rule is that it must exit 0 and that `CANNOT SAY` is never a
pass, so the merge is Mr. Pina's. This container is the seventh in a row refused
production: no `.env`, `DEPLOY_PROBE_URL` unset, `IDEA_MIGRATION_URL` unset.

**The range check is NON-EMPTY, and what it holds is not what the prompt
expected.** `node tools/migration-claims.mjs` reports highest landed **0210**,
next free 0211, and **two claimed-not-landed numbers, 0190 and 0191** -- which
are not pending work and not this bundle's. Ledger 0092 says in its own words
"**0190 is unclaimed and stays free** ... Nothing in this bundle touches SQL",
and 0093 is the same shape for 0191. They are permanent holes in the numbering
from two bundles that declined their migration. The tool attributes an in-flight
claim to whatever branch is checked out, which is why they came back labelled
with this one. **This bundle carries no migration and claims no number.**

Items 1 and 6 were checked and pass (`git merge-base --is-ancestor
origin/main origin/integration` exits 0; this entry reads `pushed`). Items 2, 3
and 5 are not reached, because item 4 already stops it.

The full suite, `svelte-check`, the mutation proof and the browser pass are
reported in `docs/history/gracious-hopper-a46lec.md`, along with the three
defects a RASTERIZED screenshot found that every automated check had passed
over, and the two more the full suite found that every scoped run had.
