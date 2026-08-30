---
title: "IDEA Maps is registered as a standards file, and the standards sweep can finally see a delivered document it has never mirrored (`claude/idea-maps-spec-2egixd`, no migration)"
date: 2026-08-30
branches: [claude/idea-maps-spec-2egixd]
migrations: []
subsystems: ["Standards", "Toolchain", "Docs"]
---

Three changes, none of them touching a shipped surface: a new standards document,
its register row, and a real defect in the tool that is supposed to place such a
document at closeout.

Files owned: `docs/standards/IDEA_MAPS_SPEC.md` (new),
`docs/standards/REGISTER.md` (one inserted row), `tools/standards-sweep.py`.

## The document

`IDEA_MAPS_SPEC.md` v1.1 is the scoping outcome for IDEA Maps, a public spatial
index of the IDEA building: descending levels from building directory down to the
drawer an item lives in, with search as a P1 acceptance criterion rather than a
polish item. It authorizes no build by itself. What is in it is the locked
decisions (public read, draft-and-publish with admin-only publish, containment
chain rather than coordinates, inches, no live positioning), the domain model at
contract level, the search matching contract, the phasing, and a section naming
what was deliberately left undecided.

It is mirrored here rather than living only in project knowledge, which is what
makes this directory its freshness authority. That is the whole substance of the
1.1 changelog entry: the 1.0 preamble had planned to move the file to
`docs/MAPS_SPEC.md` once the build started, which would have left one document at
two paths across three build phases. The preamble now names one home and forbids
the second. No scoping decision changed between 1.0 and 1.1.

The schema slot it claims is **0159**, which is a note in the document and not a
migration in this bundle. Nothing here touches `supabase/migrations/`.

## The register row

One insertion, above `IDEA_context.md`. Every other row was already correct
against the file it names, confirmed by a sweep the same day, so nothing else in
the table moved. `tests/standards-version-header.test.ts` reads the version and
date off line 2 of the file and checks the row against it; both the per-file case
and the whole-table case pass.

## The sweep could not see the one file a closeout exists to place

This is the part worth writing down, because it is a defect and not a feature.

`tools/standards-sweep.py` reconciles the mirror, the register, the local copy
and a delivered directory. Its per-file loop iterated
`sorted(set(on_disk) | set(registered))` -- the mirror and the register. A file
that is in neither, which is exactly what a brand new standards document handed
over by a closing chat looks like, matched no iteration and produced **no row and
no finding at all**. Measured on the unpatched tool against a delivered directory
holding one such file: it printed the usual sixteen rows, none of them the
delivered file, and exited 0 with "Nothing needs action. Mirror, register and
local copies agree." A closeout that ran the sweep and believed it would have
concluded there was nothing to do.

`IDEA_MAPS_SPEC.md` was that file. The tool was silent about it.

The fix is two surgical replacements. The delivered directory is listed once, up
front; anything in it that is in neither the mirror nor the register raises a
`NEW` finding naming the decision to make. And the early-return branch for a file
with no mirror text -- which previously emitted a row of dashes and gave up --
now reads the local and delivered copies, reports their version and an
`UNMIRRORED` state, and runs the same header-versus-changelog `SELF` check every
mirrored file already gets. That second half matters because a brand new document
is precisely the one whose changelog nobody has cross-checked yet, and CI refuses
it four minutes into a run on a branch that then cannot merge.

### What was measured

Four runs, plus one positive control for the second replacement, all against a
throwaway fixture with a version header and a changelog under a filename in
neither `docs/standards/` nor `REGISTER.md`:

1. **Unpatched, new file delivered.** No row for it, no finding, exit 0. This is
   the defect, reproduced before the fix rather than argued from the diff.
2. **Patched, same input.** A row reading `1.0 / UNMIRRORED` in the delivered
   columns, one `NEW` finding naming the file, exit 1.
3. **Patched, delivered files that already match the mirror byte for byte**
   (three files taken from `origin/main` and md5-checked against it). Zero `NEW`
   findings, exit 0. A check that fires on everything is not a check, so this run
   is the one that says the new finding is discriminating rather than
   unconditional.
4. **Patched and unpatched with no `--delivered` argument at all.** Output
   diffed: byte-identical, both exit 0. The new code is inert on the invocation
   that does not ask about a delivery.

The `SELF` branch inside the unmirrored path is not exercised by run 2, because
that fixture's header agrees with its changelog. It has its own control: the same
fixture with the header moved to 1.1 and the newest changelog entry left at 1.0
draws `NEW` plus `SELF` from the patched tool (exit 1) and, from the unpatched
tool, "Nothing needs action" again.

## Not verified

The mirror confirmation itself. The sweep clones `main`, and this work is on a
branch, so `IDEA_MAPS_SPEC.md` is legitimately absent from the cloned mirror
throughout -- which is also why runs 1 through 4 were meaningful when they ran.
Whether the file is present at `docs/standards/IDEA_MAPS_SPEC.md` on `main` is
answerable only by fetching the raw file after a merge, and is not claimed here.

Nothing was verified in a browser, because nothing in this bundle renders. No
migration was written, applied or planned. The full test suite was not run for
this bundle beyond the standards file it touches; that is stated rather than
implied.
