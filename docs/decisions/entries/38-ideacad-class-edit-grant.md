# 38 A class may be granted EDIT on an IdeaCAD document, evaluated live against the roster

- Raised: 2026-09-25  By: feedback report R34 of the 2026-09-25 archive
  (`docs/feedback/2026-09-25/TRIAGE.md`).
- Status: DECIDED 2026-09-25 by Mr. Pina, choosing "live class edit grant" over "bulk
  per-person editor grants" and "live sync only". **This reverses part of decision 29 and
  migration 0214**: "a class grant is always a viewer", "only an ARCHIVED document may be
  shared this way", and `ideacad_section_grants` having no role column so that write is
  unrepresentable. His words: "I want to be able to share an idea CAD part with many other
  people very quickly ... my entire class ... they can all work on it ... I would like to
  see changes happen as quickly as possible and in an Ideal World instantaneously."
- Build: OPEN. Its own session (`docs/feedback/2026-09-25/QUEUE.md`, session 3), with a
  migration. Not in round 1.

## What was decided

- A document can be shared with a class section as EDITORS, evaluated LIVE against
  `classroom_enrollments`: a student who joins later gains access, and one deactivated
  loses it in the same statement. A snapshot fan-out into `ideacad_grants` stays rejected
  for the reason 0214 gave (enrollment drift).
- It applies to LIVE documents, not only archived ones. The archived-only viewer share
  from 0214 stays as it is.
- Live sync is part of the same build: a change by one editor appears for the others
  without a refresh. Realtime stays the speed layer and the database poll the floor, and
  no broadcast frame writes state (unchanged rule).

## Defaults taken where he did not specify

- The role lives in a NEW column or table, not by reinterpreting existing
  `ideacad_section_grants` rows. Every existing class grant stays a viewer.
- Overlap control is optimistic: revision-checked writes, and a conflict tells the loser
  in words and offers a reload of the winner's state. Nobody holds locks.
- Both write predicates (`_ideacad_can_write_document` AND `_ideacad_part_owner` /
  `_ideacad_part_writer`, per CLAUDE.md's IdeaCAD rule) must admit the class editor, or
  five assembly writes silently stay closed.
- `CLAUDE.md`'s "A CLASS GRANT IS A SECOND TABLE AND IS ALWAYS A VIEWER" paragraph is
  edited in place in the same change that builds this, naming this entry.
