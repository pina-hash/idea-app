---
title: "Ledger 0263: the parts panel reaches ledger 0255's model layer, and the two mounts that would make it visible are named"
date: 2026-09-14
branches: [claude/gifted-volta-sfz8zo]
migrations: []
subsystems: [ideacad, ui, blade-model]
---

`0255` built an additive part collection for the blade editor -- `blade/parts.ts` and
six operations in `blade/ops.ts`: `addPart`, `deletePart`, `duplicatePart`,
`reorderPart`, `movePart`, `rotatePart` -- and **nothing under `src/` called any of
them**. This bundle is the interface that does.

## What `blade/parts.ts` actually exposes, which is not what the prompt assumed

Reported first because it changes where the work went. `parts.ts` exports **no
operations at all**. It is types plus two functions:

- `upgradeBladeParts(tree)` -- derives a `parts` array from a stored schema-1
  document's features, changing no stored byte, and is idempotent over a tree that
  already has one.
- `validatePartCollection(tree)` -- the rules, returning `PartProblem[]`.
- The types `PartPlacement`, `BodyPart`, `BladePart`, `BladePartDefinition`,
  `BladePartsTree`, `PartProblem`.

**The six operations live in `blade/ops.ts`**, alongside the older feature-tree
operations, and each answers `{ ok: true, tree } | { ok: false, code, message }` over
the union `BladePartRefusalCode = 'invalid-tree' | 'part-not-found' | 'duplicate-id' |
'structural-part' | 'invalid-position' | 'invalid-part'`. Both files were read and
imported; neither was modified.

**There is no default-part factory in either file.** `addPart` takes a fully formed
`BladePartDefinition` as a parameter, so a surface offering "add a part" has to supply
one. Rather than type four numbers into the panel -- which would be exactly the second
implementation this bundle exists to avoid -- the seed is
`upgradeBladeParts(DEFAULT_BLADE_TREE).parts`, which yields one valid body and one
valid blade row from the model layer itself. The panel overrides only the id, the name,
the placement, and the material/stock, which it takes from **the design being edited**
rather than from the default config: a new part made of something nobody chose is a
mass figure that is wrong and looks right.

## What was surfaced

A `Shape` region inside `PartsPanel`, below the assembly list, rendered whenever the
caller hands down a `bladeTree`. Reading how a design is put together is not a write;
what `onbladetree` gates is changing it.

- **Add** (a body, a blade row), **Duplicate**, **Delete**, **Move up/Move down**
  (`reorderPart`), and two number fields -- height along the hex core (`movePart`) and
  clocking about it (`rotatePart`). Every one of the six calls the model function. A
  mutant that reimplemented `reorderPart` inline was killed by the suite.
- **A refusal is the model layer's own sentence, rendered verbatim**, with
  `data-reason` carrying the refusal code so a sweep keys on the decision and not the
  wording. One `apply()` unpacks every answer, so there is one statement of what
  happens to a refusal rather than six.
- **Selection is one id**, `selectedPartId` in and `onselect` out, reflected by BOTH
  lists so a selection made anywhere is marked wherever that id is rendered. With no
  `onselect` the panel keeps its own, because selection is also what opens a row's
  controls and a mount that does not care about a viewport must still be able to use
  them.

### Two decisions that reversed during the bundle, both because of looking

**The kind word was being said twice.** A seeded part is named "Blade row" and the meta
line printed the kind as well, so the row read `Blade row · Blade row · 1.25 in up · 0°
round`. Every measured number on that row was correct and no assertion could have said
it; it was caught by rasterizing the panel and reading it. `meta()` now drops the kind
word only when the name already starts with it, so the word is never lost -- it is
dropped precisely where the line above it is the word. The test asserts the row
contains `Blade row` exactly once, and a second test renames a piece to "Outer set" and
asserts the word comes back.

**`aria-disabled` on the end-of-list arrows was wrong and is gone.** The first draft
marked Move up on the first piece `aria-disabled` and let the press through, on
`CLAUDE.md`'s rule that a control which must explain itself is never genuinely
`disabled`. Two things killed it. The sentence it would have shown is `reorderPart`'s
`Choose a position inside the parts collection.` -- written for a programmatic caller,
and it tells a student nothing about the row in front of them. And the state is
inconsistent: **measured**, Playwright refused to click the control as "not enabled"
while the same press reached the handler through `.click()`, so assistive tech and
tooling read as unavailable a control the browser dispatches to. The arrow is now
ABSENT at each end, which is this panel's own opening rule (a control whose only
possible outcome is a refusal is not offered) applied one region down. A refusal is
still rendered wherever one is genuinely informative, which is what deleting the last
body and an unparseable number are.

## The owner's four decisions, against what `assembly.ts` and `checkout.ts` support

| Decision | Supported today | Where |
| --- | --- | --- |
| An assembly belongs to its CREATOR | **Yes** | `IdeacadAssembly.isOwner`; the `owner` role in `sharing.ts` |
| Permissions differ per member | **Yes** | `IdeacadGrantRole` = `viewer` \| `editor`, per grant row; `canWrite` projected per caller |
| A manager role held by an agreed person | **Partly, and not as described** | `manager` exists in `IdeacadDocumentRole` but is **derived** -- a teacher of record, holding no grant -- and `CAPABILITIES.manager` is `canWrite: false`. There is no way to APPOINT a manager for one assembly, and the person appointed could not edit if there were. |
| Ownership is transferable | **No** | Nothing in `assembly.ts`, `checkout.ts`, `sharing.ts` or any migration transfers a document's owner. Grepped `supabase/migrations/` for `transfer`, `change_owner`, `set_owner`: zero hits. |

Two further gaps found while reading, neither of them this bundle's to close:

- **`IdeacadAssemblyTransports` declares `addPart`, `updatePartMeta`, `newPartConcept`
  and `setPartActive` as OPTIONAL, and `IdeacadCheckout` exposes none of them.** The
  controller's interface is `open`, `refresh`, `claim`, `release`, `assign`,
  `clearNotice`, `destroy`. So adding or renaming an ASSEMBLY part (as opposed to a
  shape piece) has an RPC binding and no controller method and no surface.
- **The shape collection and the assembly parts share no id space**, and must not be
  joined. A shape edit writes the tree of the assembly part the viewer is working in,
  and `_ideacad_part_writer` refuses that write from anybody but its holder, so the
  hold is enforced one level up. The panel gates the controls on `onbladetree` being
  present and `assembly.canWrite`, and the database remains the boundary.

Switching who holds what was already two clicks and stayed that way: one primary
control per assembly row whose word is the state, and the owner's reassign picker
beside it. Nothing in that list changed except that it now reflects the selection.

## Verified

- **`npm test`: 7 failed, 9143 passed, 6 skipped, across 482 files (5 files failed).**
  Read off the summary line, never the exit code. **All 7 failures are pre-existing**:
  the same five files and the same seven test names fail on a clean `git worktree` at
  the branch point (`eabed627`) with none of this bundle's changes in it -- the two
  failure lists diff to nothing but timing digits. They are
  `tests/apply-migration-guard.test.ts`, `tests/apply-migration-trace.test.ts`,
  `tests/db/migrations-applied-record.test.ts` (three about the applied-migration
  record, which wants a `0215` entry under `docs/migrations-applied/`),
  `tests/dom/ideacad-ui-mount.test.ts` (four, in the FeatureManager tree) and
  `tests/ideacad-tree-ops.test.ts` (one, station bounds). **The suite is red on
  arrival**, which is the condition `CLAUDE.md` names as the expensive one: a standing
  failure makes a real regression indistinguishable from the known-red files.
- **`npx svelte-check`: 2 errors, 37 warnings in 22 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`.
  **Identical to the baseline measured in the clean worktree**, so this bundle adds
  neither an error nor a warning, and none of the new CSS is unused. Both errors are
  pre-existing and in files this bundle does not own
  (`src/lib/ideacad/viewport/picking.ts:80`, `tests/ideacad-tree-ops.test.ts:51`).
  **`CLAUDE.md`'s verification line still reads "0 errors, 37 warnings in 20 files"**
  and the tree measures 2 in 22; that line is not this ledger's to edit, and it is the
  sixth recorded drift.
- **23 assertions in `tests/dom/ideacad-shape-panel.test.ts`, all passing**, and the
  instrument was proved rather than trusted: **7 mutants, 7 killed, 0 survivors** --
  the refusal re-toned to a generic sentence (2 tests), the accepted tree never handed
  up (8), a refused press genuinely `disabled` (2, before that draft was dropped),
  delete on one press (3), `reorderPart` reimplemented locally (2), selection ignoring
  the parent (1), the controls ignoring `canWrite` (1). The mutation script restores
  from an in-memory copy, never `git checkout --`, and judges by the summary line over
  stdout AND stderr concatenated; the panel was confirmed byte-identical afterwards.
- **Rasterized and looked at, in the preinstalled Chromium (141.0.7390.37), at a 416px
  pane in a 1440 viewport and a 343px pane in a 375 one** -- the two widths the panel's
  own container-query comment records for its real mount. Measured: **0 controls under
  44px** (smallest 44.0), **0 of 33 hit-test points covered** at either width, **0px
  horizontal document overflow**, contrast composited to a canvas at **17.85** (part
  name, op word) and **9.92** (meta line, field label). The armed delete reads
  `Delete "Blade row 2"`; the refusal renders `A blade design needs one body part, so
  the last body cannot be deleted.` at `data-reason="structural-part"`, two lines, with
  the `×` mark on the first line (`markTop === sentenceTop`) and no overflow past the
  pane.
- The narrow arrangement was **measured rather than chosen**: four full-width buttons
  cost 190px of height, so the container rule puts them two up at a 40% basis (~145px
  each at a 343px panel, comfortably past "Move down"'s min-content), taking the block
  to 94px. The basis is not a cap, so the armed delete, which carries the piece's name,
  still takes the whole row rather than breaking a word.

### The instrument, and one artefact it produced

`/dev/ideacad-team` mounts `PartsPanel` without a `bladeTree`, and that route is under
`src/routes/`, which this ledger forbids -- so `npm run verify:browser` cannot reach
the new region at all. The panel was instead mounted, unmodified, from a scratch Vite
entry outside the repository, driven with playwright-core against the same Chromium.

**The first measurement off it was wrong, and the tell was that it accused code this
bundle never touched.** It reported every control overflowing its row by ~13px --
including the pre-existing reassign `<select>`. The scratch page was missing
`src/app.css`'s global `box-sizing: border-box` reset, so every padded control measured
content-box. With the reset added the overflow is zero everywhere. A harness that does
not mirror the whole mechanism makes a passing drive prove nothing, and it also makes a
failing one accuse the wrong file. The one genuine CSS fix that survived the correction
is `min-width: 0` on `.ops` and `.ops .row` -- a grid item's automatic minimum is its
min-content, which a number input and a four-word button both push past a narrow pane.

## NOT verified

- **Nothing was run against the live Supabase project.** No RPC, no session, no applied
  state. This container reaches production on no port but 443 and holds no credential.
- **No signed-in surface was driven.** The classroom item page mounts this panel behind
  a Bosco Tech Google session that no automated run here holds.
- `prefers-reduced-motion` was `no-preference` throughout; nothing in this region
  animates, so that path is unexercised rather than untested.
- The scratch mount is not a committed harness. It proved the rendering; it is not a
  regression tool and nothing in the repository points at it.

## What is still invisible, and the exact lines that fix it

**The controls this bundle built are not yet reachable from any mounted surface**, and
saying so plainly is the point: shipping more unreachable work is the failure this
ledger was written to end, and the ownership boundary is what stopped it being closed
here. `PartsPanel` has exactly two mounts, both outside this ledger:

- `src/lib/classroom/ItemDetail.svelte` (~line 2243)
- `src/routes/dev/ideacad-team/+page.svelte` (~line 385) -- under `routes/`, forbidden

Each needs four props added to the existing `<PartsPanel ... />`:

```svelte
  bladeTree={<the concept's feature tree>}
  selectedPartId={<the surface's selected part>}
  onselect={(id) => <set it>}
  onbladetree={(tree) => <save it>}
```

Absence is the mechanism, so both mounts render exactly as they do today until somebody
adds them: `onbladetree` absent removes every write control, and a mount that passes
`bladeTree` alone gets a readable list of the design plus `IDEACAD_SHAPE_VIEW_ONLY`.
The dev harness is the cheaper of the two to do first, because it is the one a browser
pass can drive.
