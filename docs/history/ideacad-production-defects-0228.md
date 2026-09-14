---
title: IdeaCAD production width and document open defects
date: 2026-09-14
branches: ["codex/ideacad-production-defects-0228"]
migrations: []
subsystems: ["ideacad"]
---

The standalone IdeaCAD route was still constrained by `src/app.css`'s global
`main { max-width: 880px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }` rule.
The route layout now resets those three page-content properties specifically on
the IdeaCAD application main. At a 1900px viewport its outer workspace therefore
moves from the 880px maximum to the full 1900px viewport width.

The document chooser used the item-keyed `ideacad_open_document` call for both
new and existing work. That RPC first calls `_classroom_engine_student`, whose
actual refusal for an owner who is no longer actively enrolled is “Only a student
enrolled in this class can work on this assignment.” Existing rows now open by
document id through the already-deployed, non-writing
`ideacad_open_shared_document` read transport; it resolves the owner role and
retains editing only when the database's current document-write predicate permits
it. Creating the first row still uses `ideacad_open_document`, as it must.

The chooser no longer replaces database failures with “This document could not
be opened. Nothing was changed.” It renders the transport error's own message,
so any remaining refusal names the gate that actually rejected the call.

No migration was written. The schema still prevents a genuinely standalone
IdeaCAD document: `ideacad_documents.item_id` is a non-null foreign key to
`classroom_items`, its owner uniqueness is `(item_id, student_email)`, and editor
configuration is stored in the item-keyed `ideacad_editors` table. Removing that
assignment dependency requires a schema and RPC design outside this no-migration
bundle; “New document” therefore continues to mean creating a document from an
available assignment-backed editor registration.

Browser verification was attempted against the existing development-only
`/ideacad/preview` harness at a 1900px viewport. The installed Playwright
Chromium could not launch because its host libraries are absent, and the Ubuntu
package mirrors returned HTTP 403 through this environment's proxy, so no
screenshot or live DOM width measurement was produced. The before/after figures
above are the resolved CSS constraints: the removed `max-width` is exactly
880px and the application itself declares `width: 100vw`, which is 1900px for
the requested viewport.
