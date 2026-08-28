---
title: "Classroom bundle 3: canonical items + postings (`0085`)"
date: 2026-08-11
branches: []
migrations: ["0085"]
subsystems: ["IDEA Classroom"]
record_order: 58
---

## Classroom bundle 3: canonical items + postings (`0085`)

Migration `0085_classroom_canonical_items.sql` (apply manually after 0084).
0082's one rule is untouched: ZERO client write grants on any classroom table,
every write a SECURITY DEFINER RPC that re-checks the caller inside its own
body. The ONE new student write path is shaped so it cannot be anything else.

- **THE STRUCTURAL CHANGE, and why it had to be structural.** 0082 modelled a
  multi-section publish as N INDEPENDENT ROWS sharing a `group_id` -- one
  `classroom_posts` row per section, one `classroom_assignments` row per
  section, one attachment row per section against one Drive file. "Author once,
  publish to three classes" was therefore true only at the instant of
  publishing: an edit afterwards touched ONE section's row and the copies
  drifted apart SILENTLY. Nothing broke; the other two classes just quietly
  still had the typo. `group_id` correlated siblings, it did not keep them
  equal. There is now ONE canonical record (`classroom_items`) carrying every
  authored field, and a POSTING (`classroom_postings`) is nothing but "this
  item appears in this class" -- it carries no state of its own ON PURPOSE,
  since the moment a posting could be independently published or pinned the
  copies could drift again.
- **`classroom_posts`, `classroom_assignments` and
  `classroom_assignment_resources` are DROPPED**, not left in place: two
  sources of truth for "what did the teacher write" is exactly the drift this
  ends, and the lingering one is the one nobody updates. Everything that read
  them was recreated (`classroom_can_read_item` replaces the two
  `classroom_can_read_*`, the view-as RPCs are item-based, and
  `classroom_delete_section` counts POSTINGS). **SQL ORDERING TRAP, learned
  here:** an RLS policy records a real dependency on every function AND column
  its expression names, so 0083's attachment policy had to be dropped before
  `classroom_can_read_post` or `classroom_attachments.post_id` could be; and
  0083's `one_owner` CHECK had to go BEFORE the data migration, which writes
  item-owned rows it would have rejected.
- **The data migration reunifies by `group_id` -- but ONLY across rows that
  still AGREE on every authored field.** Since 0082 rows were independently
  editable, two siblings can legitimately differ by now, and collapsing them
  would discard one teacher's edit. Divergent siblings become separate items,
  each with its own posting. Attachments and resources are unioned and
  de-duplicated across the rows that reunify (they were duplicated per section
  by construction). Naive timestamps, published state and authorship all carry
  over; `first_published_at` is seeded from `created_at` for anything already
  published, and `edited_at` only where `updated_at` genuinely moved past it.
- **MATERIALS** are a third `kind` on the same record (title, body,
  attachments, links; no points, no due date, no submission), not a third
  table -- the sync, duplicate, pin, order and edit rules are identical for all
  three kinds, and a third table would be three copies of every one of them. A
  CHECK keeps points and a due date to assignments, so the data model cannot
  quietly disagree with the UI about what a kind is. Materials live in
  Classwork (their own shelf) and deliberately NOT in the Stream: a syllabus
  re-surfacing at the top of a feed is what pinning is for.
- **PINNING + MANUAL ORDER live on the ITEM**, so a pinned or reordered item
  reads the same way in every class. Order is set by handing
  `classroom_set_item_order` the FULL visible list rather than nudging one row:
  the server would otherwise have to reconstruct the exact list the teacher was
  looking at (which depends on due dates, pins and "now"), and taking the list
  means the stored order is always precisely what somebody saw. `sort_order` 0
  means "never placed by hand" and sorts BEHIND anything positioned, so a
  partly-ordered group still reads sensibly.
- **EDIT VISIBILITY.** `edited_at` is stamped ONLY by a content change to an
  already-published item -- publishing a draft is not an edit, and neither is a
  pin or a reorder (both test-pinned). That is what makes an "Updated" badge
  worth trusting. `classroom_item_views` is the per-student last-viewed row and
  the badge is `edited_at > viewed_at` (never viewed counts as unseen).
- **`classroom_mark_item_viewed` is the FIRST student write path in this
  module, and it TAKES NO EMAIL PARAMETER.** The caller is resolved from
  `current_user_email()`, so "a student can only ever touch their own row" is a
  property of the signature rather than a check that could be got wrong -- the
  suite asserts the identity argument list is exactly `p_item_id uuid`. It also
  refuses an item the caller cannot read, so it cannot probe for foreign ids.
  There is still no client write grant on any classroom table.
- **Who may edit: the caller must manage EVERY class the item is posted to**
  (`_classroom_manages_item`), because an edit changes what all of them see.
  UNLINKING one class is the deliberately weaker action (manage THAT section
  only) -- taking your own class off somebody's shared handout is a decision
  about your class and changes nothing for anyone else. The LAST posting is
  refused with a structured `{ok:false, reason:'last_posting'}` rather than
  orphaning an item nobody, including its author, could read.
- **Duplicate** (`classroom_duplicate_item`) makes a new INDEPENDENT DRAFT --
  always a draft, since a copy is a starting point, not something to put in
  front of a class the instant it is made. Attachments are carried over by
  referencing the SAME Drive file with new rows (no re-upload), which is why
  0083's orphan rule still matters: deleting a copy reports nothing orphaned
  while the original's row survives (test-pinned).
- **Attachments** moved onto the canonical record: `classroom_add_attachment`
  takes ONE `p_item_id` (0083's plural-owner signature existed only because a
  multi-section publish made N content rows), and `/api/classroom/attachment`
  posts `item_id` instead of `owner_kind` + `owner_ids`.
  `/api/classroom/delete-content` takes `{ id }` and calls
  `classroom_delete_item`.
- **Link previews are fetched SERVER-SIDE and never from the student's
  browser** (`src/lib/server/link-preview.ts`, `/api/classroom/link-preview`).
  CORS makes reading another origin's `<head>` impossible client-side anyway,
  and routing it through the app keeps the class's reading list off a
  third-party unfurler. 4s timeout, 256 KiB read cap (streamed, stops at
  `</head>`), an in-memory per-instance cache (6h ok / 10min failure)
  deliberately rather than a table -- a preview is derived data with no owner,
  and a cache writable by anything a signed-in user can reach is a cache anyone
  can poison; the cost is that a cold instance re-fetches. Loopback and private
  address ranges are refused (a mistyped internal link is the realistic case,
  not an attacker). **EVERY failure is `{ok:false}` and the card degrades to a
  plain link** -- a dead host, a timeout, a 500, a non-HTML response, a page
  with no metadata at all. `allowPrivateHosts` on `fetchLinkPreview` is a
  TEST SEAM only (the suite has to point it at a loopback server it started);
  the route never passes it.
- **Staged image attachments preview immediately**, before any save: a filename
  says nothing about whether the right page is in frame (the notebook's
  staged-thumbnail lesson). `object-fit: contain`, never `cover` -- cropping to
  fill would hide the cut-off edge the preview exists to catch. Object URLs
  live in a plain NON-reactive Map (the effect that fills it reads `staged` and
  writes there; routing them through reactive state as well would have it
  re-trigger on its own writes) and are revoked on removal and unmount.
- **Feedback reuses 0053's `app_feedback`, extended rather than duplicated.**
  The classroom control is the SHARED `FeedbackBox` behind a quiet footer
  trigger (`ClassroomFeedback.svelte`) that attaches the page context
  automatically -- the one thing someone reporting a problem reliably forgets
  is where they were. The insert stays 0053's direct RLS-scoped self-write (a
  note about yourself has nothing to forge). 0085 adds a moderation `status`
  (new/seen/resolved) plus `app_feedback_set_status` and
  `app_feedback_admin_list`, both gated on `is_admin()` INSIDE the function.
  **This does not break 0053's append-only stance:** that stance is about the
  AUTHOR -- nobody edits what a student wrote, and there is still no UPDATE or
  DELETE grant for anyone. Triaging a note is not rewriting it. Console at
  `/classroom/feedback`, admin-only with a **404** (the `/admin` rule) so
  probing the URL reveals nothing.
- **Routes:** `/classroom/[sectionId]/item/[itemId]` replaces
  `.../assignment/[assignmentId]` (one page serves all three kinds; the
  differences are which chips render, not three layouts), plus
  `/classroom/updates` and `/classroom/feedback`. `AssignmentDetail.svelte` is
  gone, replaced by `ItemDetail.svelte`.
- **A REAL BUG the browser found and `svelte-check` could not.** The class page
  froze the WHOLE app's interactivity with no visible error: a `$effect` called
  a transport whose body runs synchronously up to its first await, and in the
  dev harness that write landed while Svelte was still settling the render --
  `state_unsafe_mutation`, thrown as an unhandled rejection, after which no
  click handler in the tree fired again. Every such call (the mark-viewed
  effects in `ClassPage`/`ItemDetail`, the loader in `LinkPreviewCard`) is now
  `queueMicrotask`-deferred out of the effect body. Worth remembering: the
  symptom was silent dead buttons, not an error banner.
- **Verified.** `tests/classroom-canonical-migration.test.ts` (8 assertions)
  seeds 0082-era content through the REAL 0082 RPCs on a database brought up at
  0083, then executes 0085 over it: a clean 3-section publish reunifies to one
  item with 3 postings and ONE attachment row (three went in, one file), a
  group edited apart survives as two items with one posting each, links
  de-duplicate, draft state and authorship survive, the totals are exactly
  4 items / 6 postings / 1 attachment, the old tables are gone, and re-applying
  is a no-op. `tests/classroom-canonical.test.ts` (18) pins the behaviour the
  model exists for: an edit in one class read back by the OTHER class's student
  account, publish-everywhere, `edited_at` only on a real post-publish content
  change, pin and reorder stamping nothing, add/remove linkage with the
  last-posting refusal, an independent duplicate carrying its attachment by
  reference, the view-tracking RPC's argument list, and feedback insert/read
  scoping plus admin-only triage. `tests/classroom-security.test.ts` (43) is
  the boundary suite rebuilt on items -- including that the POSTINGS table is
  scoped too, so there is no back door to what exists. `tests/classroom-link-preview.test.ts`
  (10) drives the fetcher against a real HTTP server. MUTATION-CHECKED BOTH
  WAYS: the postings policy at `using (true)` reddens the postings-scoping and
  un-publish assertions, at `using (false)` it reddens the edit-sync,
  publish-everywhere, linkage and admin-reach assertions; migration restored
  byte-identical. `npm run check`: 0 errors, no new warnings. `npm test`:
  289/289. Browser-verified in `/dev/classroom` by driving the REAL components:
  the multi-class sync loop end to end (edited the shared announcement in
  Period 1, Period 2's student read the new text), linkage add then unlink with
  the content surviving in the class that still holds it and the last-posting
  refusal rendering, duplicate producing a `(copy)` draft with the composer
  opened on it, pin moving an item into the Pinned group and up/down calling
  `setOrder` with swapped ids and re-rendering in the new order, the Classwork
  groups (Pinned / Upcoming / Materials / No due date / Past due), a link
  rendering as a RICH card (title, site name, image, description) beside one
  DEGRADED to a plain link, the Updated badge clearing on view (a stream
  announcement auto-marked, an assignment marked on its own page) while "Last
  updated" stays, a staged PNG previewing as a real decoded 64x64 image before
  any save, and the feedback loop from a class page into the admin console with
  the page context attached and the status flow moving the row between filters.
  375px width on every surface with zero overflow, and an armed `window.onerror`
  trap caught ZERO errors across a sweep of all 18 harness views.
  **NOT verified: the live Supabase project** -- the local `.env` is the
  placeholder project, so 0085 has never been applied anywhere; apply it by
  hand in the SQL editor after 0084 and spot-check the multi-class edit with
  two real accounts before real classes depend on it.

