---
title: "The view-as preview catches up with 0108 and 0111 (`0113`)"
date: 2026-08-16
branches: []
migrations: ["0108", "0111", "0113"]
subsystems: ["IDEA Classroom"]
record_order: 48
---

Migration `0113_classroom_view_as_body_doc_units.sql` (apply manually after
`0112`) plus one prop on the view-as class page. **What the payload CONTAINS
changed; who may read it did not.**

### One cause, two symptoms, both live in production

`_classroom_item_json` (`0085`) is a HAND-WRITTEN KEY LIST, and two later
migrations added columns to `classroom_items` without it. A payload that is
merely INCOMPLETE fails silently by construction -- `normalizeItemRow` reads
both of these with an `in`-guard, so an absent key degrades quietly instead of
erroring, which is exactly why this survived two migrations.

- **`0108`'s `body_doc`.** Missing, so `ItemBody` fell through to
  `docFromPlainText` over the plain-text projection -- and `docText` writes ONE
  LINE PER LIST ITEM while `docFromPlainText` splits on BLANK lines only, so a
  bulleted list rendered as one run-on paragraph. The same visible symptom the
  `formatting_dropped` warning exists for, with nothing dropped and nothing to
  warn about: the document was stored the whole time.
- **`0111`'s `unit_id`.** Missing, so every item read as unfiled and
  `classGroups` put the class in one list under no unit header.

### Every caller checked before recreating it

`_classroom_item_json` is defined ONCE (`0085`) and never redefined; it carries
no grant, so it is reachable only from inside the two definer functions that
call it. Both are read-only view-as RPCs, both last recreated in `0109`:

- **`classroom_view_as_section`** -- recreated here, for the units half only;
  its item aggregate is `0109`'s, unchanged.
- **`classroom_view_as_item`** -- deliberately NOT recreated. It returns the
  function's result verbatim, so it picks both keys up the moment `0113` runs,
  which fixes the run-on-paragraph bug on the view-as ITEM page for free.

### The units ride the RPC because a client query would be the wrong read

The page mounted `ClassView` with no `units` prop, and its comment was right:
an admin-side units query is the ADMIN'S OWN read rendered under a student's
name -- the rule that also keeps check-ins and per-student work off that page,
and `0099`'s general rule that a view-as read is ONE admin-gated function, never
an assembled query. So the fix is in the payload, not the client.

**It discloses nothing new either way**, which is worth stating rather than
assuming: `classroom_units` is `grant select to authenticated` under a
`using (true)` policy (`0111` -- a unit is a name in the shared course catalog),
so the student's read of this course's units and the admin's are the same rows.
FAITHFULNESS is what carries this, not secrecy. Scoped to the section's own
course off the row the guard already resolved, so it cannot widen past the one
class being previewed. An older backend omits the key and the view falls back to
one chronological list -- degraded, never wrong.

