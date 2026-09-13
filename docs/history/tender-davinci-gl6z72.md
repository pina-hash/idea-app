---
title: "Prompt 0198: the draft mirror was discarding a student's whole restored draft, and the shape version was never what would have caught it (`claude/tender-davinci-gl6z72`)"
date: 2026-09-13
branches: ["claude/tender-davinci-gl6z72"]
migrations: []
subsystems: ["Notebook", "Documentation"]
---

Ledger 0192 measured this and pinned it in a test it could not fix, because
`src/lib/notebook/draft-mirror.ts` was outside its surface. This bundle owns that
file and closes it.

## The defect, reproduced before anything was changed

`draft-mirror.ts` is shape-versioned and was believed to fail cleanly on anything
it did not understand. **It does not**, and the reason is a distinction that is
easy to get backwards: `v` versions the MIRROR'S OWN FIELD SET, and `doc` is
stored and handed back OPAQUELY. So a document naming a node the running editor
has never heard of passes every check in `readMirrorAt` and reaches Tiptap
intact.

Reproduced through the module's own read path -- `writeMirror` -> `latestMirror`
-> `planMirrorRestore` -> a real editor configured exactly as `NoteEditor.svelte`
configures one -- rather than through a hand-built plan object, because the
defect lives in the seam between those calls and not in any one of them:

```
RESTORED TEXT: ""
RESTORED JSON: {"type":"doc","content":[{"type":"paragraph"}]}
```

**29 characters to 0.** `latestMirror` returned the mirror, `planMirrorRestore`
said `restore`, and the paragraph sitting BEFORE the offending block came back
gone with it. Tiptap does not throw: it catches the `RangeError` internally and
logs it, so `NoteEditor.svelte`'s `catch { failed = true }` never fires and no
surface reports anything.

## It is wider than 0192 found, and the extra half is the argument for the fix

0192 measured an unknown BLOCK. Probing the same editor for three more shapes
found the same total discard for an unknown **INLINE node** and an unknown
**MARK**, and no harm at all from an unrecognised **attr** on a known node:

| shape | restored text |
| --- | --- |
| unknown block (`notebookGrid`) | `""` |
| unknown block nested in a list item | `""` |
| unknown inline node (`mention`) | `""` |
| unknown **mark** (`highlight`) | `""` |
| unknown attr on a known node | `"keep me"` |

The mark row is the one that matters for the future. `underline`, `strike` and
`code` are all switched off in `NOTE_SCHEMA_OPTIONS` today, so a build that turns
one on and is rolled back reaches this through the MARK vocabulary and not the
node vocabulary -- and a guard that checked only node types would wave it
straight through while looking correct. That is why the vocabulary is two lists.

## What happens instead: HOLD. And what was rejected

The property the prompt made non-negotiable is that no path silently returns less
than it was given. Three policies were considered.

**Rejected -- refuse the mirror whole and drop the slot.** Loud, and still total
loss. The slot is the ONLY copy: the tab that was typing into it is gone and
nothing was ever dispatched, so deleting it turns a recoverable state into an
unrecoverable one for the sake of tidiness.

**Rejected -- restore the blocks it does understand.** This is the tempting one,
and it destroys the part it could not show about four hundred milliseconds later.
The restored box IS what the composer mirrors next, so the very next debounce
writes the stripped document back over the slot and the unknown block is gone
from the only place it existed. It also restates
`$lib/server/rich-text-normalize.ts`'s whitelist drop on the READ path, which is
the "content disappears" failure that module's own header describes.

**Taken -- hold.** `planMirrorRestore` answers `{ action: 'hold', unknown }`, the
composer restores nothing and clears nothing, and the writing sits in
`localStorage` untouched for the rest of its ordinary 24-hour life. The
overwhelmingly likely resolution of this situation -- a rollback rolled forward,
a stale tab reloaded -- then restores it WHOLE. The student reads a sentence that
says where the writing is, why it is not on screen, and that nothing was deleted.

**Holding is only correct if every write path steers around the held key**, and
three of them had to be told:

- `clearComposerMirrors`, which runs beside every acknowledgement. That
  acknowledgement is about THIS session's writing and says nothing about a slot
  this build could not open.
- the debounced write, which would otherwise mirror an empty box over it. The
  pending timer is cleared BEFORE the guard, so a timer armed for a key that has
  since become held cannot fire.
- **`writeMirror`'s own quota sweep**, which drops every other slot regardless of
  age. This was the one that would actually have eaten it. It now takes a
  `protect` list, and a genuinely full storage reports `'full'` and the composer
  says the net is not there -- loud, against silently destroying a backup.

The age cap still bounds a held slot, deliberately: the exposure window that cap
exists for outranks holding somebody's writing on a shared lab machine.

## The version bump, which is real and is the smaller half

`mirrorVersionFor(doc)` derives the version from the document: `1` while every
type in it is one a deployed build can render, `2` the moment it is not. The
literal `v: 1` pinned at the call site in `NotebookView.svelte` was the other
half of the defect and is gone.

**Bumping unconditionally was refused.** It would make every ordinary prose draft
unreadable to the build currently running -- the loss this bundle is preventing,
inverted.

**The bump arms itself.** `V1_MIRROR_VOCABULARY` is FROZEN and
`NOTE_MIRROR_VOCABULARY` moves, so the bundle that wires a node into the editor
adds one name and the version behaviour follows with no second edit to forget.
The two are equal today, which is correct and is asserted.

**What the bump cannot do, stated rather than papered over:** it only helps
builds that already know to look. A `v: 2` slot reaching a build deployed before
today is dropped by `readMirrorAt` and then, if it occupies the same key the
composer is writing, cleared -- so for already-deployed builds this converts a
blanked draft into a silently dropped one, which is better and is not good. There
is no lever over an already-deployed build except the one field it checks.

`KNOWN_MIRROR_VERSIONS` is `[1, 2]` and both are read back. **A known older
version is READ, not dropped** -- a slot written twenty minutes before a deploy
is still somebody's unsaved writing. An unknown one is still dropped.

## The vocabulary is pinned against the real schema, in both directions

A hand-written list that drifts from the editor is the whole failure the fix now
rests on. A name missing from it holds every ordinary draft; a name in it the
editor does not have restores the blank document. So the test builds
`getSchema([StarterKit.configure(NOTE_SCHEMA_OPTIONS)])` and reconciles both
lists against it both ways. Measured: nodes `bulletList, doc, listItem,
orderedList, paragraph, text`; marks `bold, italic, link`.

## Measured

- **Suite, branch point (`origin/integration` at `843b3860`, measured in a clean
  `git worktree` and not on the tree under test): 446 files / 8518 tests / 0
  failures.** The prompt's `443 / 8,463` was stale by 3 files and 55 tests.
- **Suite, this tree: 447 files / 8541 tests / 0 failures.** Exactly +1 file and
  +23 tests, which is this bundle's one test file and nothing else.
- **`svelte-check`: 0 errors, 37 warnings in 20 files, 31/5/1** -- identical at
  the branch point and on this tree, so `CLAUDE.md`'s figure is CORRECT and
  needed no correction. The prompt's warning that it was "already stale" did not
  hold at this branch point.
- **`verify:readme --route notebook --no-selftest`: 26 route/width runs, 428
  measurements, 0 outside threshold.** The regenerated `README.md` and thirteen
  `measured/*.json` files were **restored rather than committed**: the diff was
  timestamp, sha and wall-clock churn only (`outsideRows: []` on both sides,
  measurement counts unchanged), they are outside this bundle's Owns, and that
  file blocked five merges in one day when lanes each regenerated it.
- **`node tools/claude-md-check.mjs`: agrees with the tree**, before and after
  the `CLAUDE.md` edit.

## Mutation proof, both directions, restored from a saved copy

Never `git checkout --`: both files were copied to a scratch directory first and
restored FROM THAT COPY, with md5 verified identical afterwards
(`a44b9d9dca2e...` for `draft-mirror.ts`, `39634f4e54f5...` for
`NotebookView.svelte`).

Seven permissive mutants of the module, all red: never hold; marks waved through;
top-level only, no recursion; version never bumps; quota sweep eats a held slot;
depth cap answers empty instead of reporting; unknown version coerced. Six of the
caller, all red: the literal comes back; hold branch deleted; acknowledgement
sweep eats the held slot; the debounced write stops steering; the quota sweep is
told nothing; the sentence is never rendered.

**And the OTHER direction**, which is the one a guard like this fails silently: an
over-strict mutant that holds EVERYTHING reddens two tests -- the new build's
round trip and the ordinary prose draft. A guard that held everything would be as
much of a defect as one that held nothing, and invisible in exactly the same way.

The character-count assertion is the one the real defect fails: under the
"never hold" mutant, *"so the restored character count never drops to zero on a
document that had content"* goes red.

## What is NOT verified

- **Production is unreachable from this container**: `403` on CONNECT from the
  egress proxy for both `ideabosco.com` and `apps.ideabosco.com`, and
  `DEPLOY_PROBE_URL` is unset so `tools/deploy-probe.mjs` answers `CANNOT SAY`.
- **No signed-in surface was driven.** The composer's held-slot behaviour is
  asserted on the module for real and on `NotebookView.svelte` by SOURCE SWEEP,
  which this repo already does for that component (`tests/notebook-shell.test.ts`)
  rather than standing up its whole transport surface. The sweep cannot see that
  the branches execute, or in what order; it is there for the one regression a
  correct module cannot overrule, which is the literal coming back to the call
  site. A positive control asserts it read the file it claims to.
- **The `hold` sentence has not been measured on screen.** It renders through the
  same `.feedback` element as the restore note beside it, but no width, contrast
  or tap-target claim is made about it here -- `happy-dom` has no layout engine
  and would read zero.

## Findings reported rather than fixed

- **`tests/dom/notebook-sheet-undo.test.ts`'s comment is now historical.** It
  says *"THE NEXT BUNDLE OWES A VERSION BUMP"* and *"THIS BUNDLE CANNOT MAKE THE
  BUMP"*. That debt is paid. The file is ledger 0192's and is landing, so it was
  not touched; its assertions are about Tiptap's behaviour, which has not moved,
  and it still passes.
- **The two sibling mirrors do NOT share this hole, and neither needs the
  check.** `assignment-draft-mirror.ts` carries `ResponseValue`, which is
  `{text?, rows?, checked?}` -- strings and booleans; `shelf-mirror.ts` carries
  `MapsShelfDraft`, plain fields. Neither payload is schema-bound, so neither is
  handed to something that validates it and can refuse. A mirror that starts
  carrying a document acquires the obligation that day.

## `CLAUDE.md`

Two rules were edited IN PLACE, because both had become false in a load-bearing
way about a mechanism a student's writing depends on. `CLAUDE.md` is not in this
bundle's Owns and is the most conflict-prone file in the repo with three lanes in
flight; the edit was kept to one paragraph and its list, and is flagged in the
ledger entry so the router can see it.

- *"A stored SHAPE VERSION older or unknown is DROPPED"* -> an UNKNOWN one is
  dropped; a known older one is READ, with the reason.
- The third-mirror obligation list went from SEVEN properties to EIGHT, the new
  one being the refusal to hand back a document this build cannot render, scoped
  to a mirror whose payload is schema-bound.
