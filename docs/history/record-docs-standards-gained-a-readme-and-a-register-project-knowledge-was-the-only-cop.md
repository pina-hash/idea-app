---
title: "`docs/standards/` gained a README and a REGISTER: project knowledge was the only copy"
date: 2026-08-26
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 148
---

**The failure this fixes:** on 2026-08-23, two chats each edited the same
standards document starting from the same base version -- because project
knowledge was the *only* copy of any governing standards document, with no
history and no second location, neither chat had any way to know the other was
editing it, and the two independently produced two different next versions of
the same file. There was no mechanism to detect this had happened: a
re-uploaded file simply replaces the one in project knowledge, silently, and
is invisible to any chat that already has an older copy open in its own
context. Project knowledge cannot be checked against anything, because nothing
else exists to check it against.

**The fix is not a merge of those two versions** -- that is a separate,
content-level problem for whoever holds both drafts. This bundle adds the
missing second location: `docs/standards/` in this repo, fetchable by any chat
at a stable raw URL, so a chat can compare what it is holding against what is
committed and know whether it is behind.

`docs/standards/README.md` and `docs/standards/REGISTER.md` are new;
`docs/standards/` itself already existed (four files: `IDEA_INTERFACE_STANDARDS.md`
v2.8/2026-08-21, `IDEA_MATERIAL_SPEC_v2.md` v2.3/2026-08-20,
`IDEA_RUBRIC_STANDARDS.md` v1.2/2026-08-19, `IDEA_VERIFICATION_ADDENDA.md`
v1.2/2026-08-21 -- unchanged by this bundle, their content was not touched).
The README states the directory's role (freshness authority; project
knowledge is the working copy chats read by default; this directory is
updated in the same turn a new version is delivered, before re-upload; a file
here found behind project knowledge is a defect in that delivery, not
something to hand-edit here) and the fetch URL pattern
(`https://raw.githubusercontent.com/pina-hash/idea-app/main/docs/standards/<FILENAME>`).
The REGISTER is a sixteen-row table -- filename, version, date, one-line
ownership -- covering the full registered set including twelve files not yet
mirrored here, each left as `not yet mirrored` in both the version and date
cells rather than guessed. **No standards file content was fabricated**: the
four present files' version/date came from their own headers, and the twelve
absent rows carry only a name-derived one-line description of what the file
is for, nothing about its actual current rules. `FRC_Design_System.md` and
`FRC_CLAUDE_DESIGN_STANDARDS.md` are noted as also living in
`FRC-Team-5669-Techmen/frc-app` at `src/lib/design-system/docs/`, with this
directory named as the freshness authority for both regardless of which repo
a session reads them from.

**Not verified:** the raw URL was not fetched over the network from this
session (no proof step was requested and none is needed to author the
directory's own files); whether the two divergent 2026-08-23 drafts have since
been reconciled is unknown and out of this bundle's scope.

---

