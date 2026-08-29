---
title: "Classroom Phase 2: revision history, one importer, GitHub export (`0110`)"
date: 2026-08-15
branches: []
migrations: ["0110"]
subsystems: ["IDEA Classroom"]
record_order: 45
---

Migration `0110_classroom_content_revisions.sql` (apply manually after `0109`)
plus a consolidated spec importer and a server-side export of every authored
spec to this repo. `0082`'s rule is untouched: ZERO client write grants on any
classroom table, every write a SECURITY DEFINER RPC re-checking the caller.

### Attaching a spec stops being destructive

Since `0086`/`0092`/`0095` the four content tables have been single-row heads
written with `on conflict (item_id) do update`. Importing a spec over an
existing one OVERWROTE it, with no copy and no way back -- a teacher who pasted
the wrong file lost the previous document outright. **The head stays the head**
(no view, no `is_current` flag, no join to work out what is live); what changed
is that BEFORE a write that displaces content, the content being displaced is
copied into `classroom_content_revisions`. No read path moved.

- **ONE ROW PER REVISION, NEVER AN UPDATE** -- `notebook_entry_notes` (`0078`)
  applied to teacher-authored content. No UPDATE or DELETE grant or policy
  exists at all; the only column any function rewrites is `restored_from_id`,
  on a row it inserted moments earlier in the same transaction.
- **The chain is keyed by the PAIR `(item_id, target)`**, where 0078's was
  keyed by a logical note. So `unique (item_id, target, revision)` is 0078's
  `unique (note_id, revision)`, `supersedes_id` is UNIQUE so a chain cannot
  fork, and the same two CHECKs keep the pointer and the triple agreeing
  (revision 1 <=> no predecessor). **`supersedes_id` cascades rather than
  nulling on delete, and that is forced rather than chosen:** the CHECK
  requires it non-null above revision 1, so `set null` would violate the row's
  own constraint.
- **WHAT A ROW MEANS, because the obvious reading is the wrong one.** A row
  holds the payload that was DISPLACED, and its `author_email` / `author_name`
  / `created_at` describe THE WRITE THAT DISPLACED IT -- who replaced this
  content, and when -- not who originally authored it. That is the only
  attribution reliably knowable at snapshot time (`classroom_items.author_email`
  is the item's CREATOR, not its last editor), and mixing "the payload's
  author" for the two tables that record one with "the displacing author" for
  the two that do not would be worse than either. Every label says **"Replaced
  by"**, never "By".
- **The head is NOT in the table, so its own version number is DERIVED:** one
  more than the highest recorded for its `(item, target)` pair, which is what
  `classroom_item_revisions` returns as `head_revisions` and what lets a row
  read "r1 of 3".
- **A NO-OP SAVE WRITES NO REVISION.** For an item that is `0104`'s existing
  `v_changed`, REUSED rather than re-derived -- binding the history to the same
  predicate the student-facing Updated badge uses is what stops the two ever
  disagreeing, and it already excludes publishing and rescheduling. For the
  three jsonb heads, which have never carried such a predicate, it is a plain
  `is distinct from`. **The rubric's guard compares the NORMALIZED criteria**,
  never the raw parameter, since `_classroom_normalize_rubric` re-derives
  `points` and stamps `incomplete` itself.
- **Removal snapshots too**, so "Remove" is recoverable rather than final.

### Restore never rewinds

`classroom_restore_revision` applies a recorded payload as the new head
THROUGH THE ORDINARY SETTER for its target. That is the whole design --
restoring is a normal write whose content happens to come from the history --
and four things follow for free rather than being remembered: the head it
displaces is snapshotted like any other write; every validator runs again (a
payload a later migration would now refuse fails with THAT validator's message
instead of landing content the schema no longer accepts); the edit-visibility
rule applies unchanged; and authorization is the setter's own, reached through
a nested SECURITY DEFINER call reading the same session claims (the
`coin_bulk_log_section` pattern).

`restored_from_id` on the snapshot names the revision that was restored, so the
panel says so rather than leaving a reader to infer it from two payloads
happening to match. **LINKS AND ATTACHMENTS ARE NOT RESTORED** and an item
revision does not carry them: `p_resources` is passed null, which `0085`
defines as "leave them alone". Restoring a body is a content decision;
silently reverting a teacher's link list is not, and there is no way to express
"revert this half" a reader would predict correctly.

### Who may read, and who may restore -- deliberately different

READING is `classroom_can_read_instructor_material` (`0090`), the manager-only
half of `classroom_can_read_item`, already granted to `authenticated` and
already the answer to "may this caller see this item's teacher-facing
material". An earlier draft is exactly that. It is deliberately NOT
`_classroom_manages_item`, which has NO grant to `authenticated` at all -- so
naming it in a policy would fail with `permission denied for function` the
moment a real client read the table (the `0070` lesson).

RESTORING is the stricter `_classroom_manages_item` (every posted class),
because putting old content in front of a class is a write. **A test matching
the obvious wording would not have caught a regression here:** "teacher of
record for every class" is shared with the setter this function calls, so the
assertion names `can restore it`, which is the restore RPC's own message and
nothing else's. Found by mutation -- swapping the guard for the read bar
reddened nothing until the assertion was tightened.

### One importer, and the flow it replaced

`SpecImport` and `ReferenceTools` were near-identical files -- the same paste
box, upload control, validate step, error list, summary line, remove confirm,
and about a hundred lines of the same CSS each -- differing only in which
validator they called and which RPC they wrote through. They had already
started to drift. Both are DELETED; `src/lib/classroom/SpecImporter.svelte`
takes `kind: 'assignment' | 'reference'`, and that switches only the validator,
the RPC, the renderer and the vocabulary.

- **ONE ACTION, NOT THREE.** Validation runs on its own after a 250ms debounce,
  problems list inline as you type, a live preview renders below, and Publish
  commits. The old flow made you press Validate and then -- the part that made
  it hostile -- **disabled the commit button again on the next keystroke**, so
  fixing a typo you noticed after validating meant pressing Validate a second
  time before you could save at all. There is no Validate button and no such
  state. Publish flushes the debounce first, so pasting and pressing
  immediately is not told there is nothing to publish.
- **THE PREVIEW IS THE REAL RENDERER**: `SpecRenderer` in `readonly` mode for
  an assignment, `ReferenceDoc` in a new `preview` mode for a document. Anything
  else would agree with the real page right up until it did not. `preview`
  turns off the two things correct for a document that owns its page and wrong
  for one embedded in another: the location hash (it must not rewrite the host's
  URL or answer its back button) and the scroll management (`holdRail` and
  `reveal` move the WINDOW, which from inside a panel yanks the editor out from
  under whoever is typing).
- **A server refusal renders into the SAME inline problem list**, so a teacher
  never has to learn which kind of problem shows up where. Server-side
  re-validation is unchanged and still the boundary.
- Every attached-state affordance is kept: green dot, meta id, module/section
  counts, per-section deep links, Open reader, Remove, and the public toggle
  with its enumerated confirm (whose copy is unchanged).
- **The duplicated CSS moved to `classroom.css`** (`.spec-line`, `.ok-dot`,
  `.spec-meta`, `.paste`, `.problem-list`, `.tool-actions`, `.tool-rule`) rather
  than being copied a third time -- and the two copies that were already
  elsewhere went with it (`ItemDetail`'s `.tool-rule`, `DeckStager`'s
  `.ok-dot`). The shared dot adds `align-self: center`, which is a NO-OP for
  DeckStager because its `.line` is already `align-items: center` -- checked
  rather than assumed, and measured afterwards at 8x8 green centred.

### GitHub export

`src/lib/server/classroom-export.ts` is the ONE egress point;
`GITHUB_EXPORT_TOKEN` is read there and nowhere else, and never reaches a
caller, a message or a log line. Only an item carrying an assignment spec or a
reference spec is exported -- a plain announcement has nothing to export, and a
material with only a written body is not a spec.

- **ONE COMMIT, NOT ONE PER FILE.** The Contents API writes a file at a time
  and would land three commits for one save, all with the same message. The Git
  Data API builds a tree and commits it once -- six requests whatever the file
  count, because a tree entry may carry its `content` inline. Path
  `materials/<courseId>/<item-slug>/`, `_shared` when postings span more than
  one course; message `classroom: <title> (<kind>) r<revision>`.
- **MAIN IS SHARED, AND THE EXPORT IS NOT ITS ONLY WRITER** (the `422` fix).
  People commit to this repo all day and the export is itself a burst writer --
  saving a spec, then its rubric, then publishing fires three exports at one
  item -- so the branch moving between the head read and the ref update is the
  ORDINARY case here, not a rare race. A push that read the head once and hoped
  lost that race often, came back `GitHub 422: Reference cannot be updated`, and
  looked permanent because Retry was one more single-shot attempt that lost it
  again. **Retry was never rebuilding on a stale parent** -- it re-read the head
  every time, measured against the pre-fix code; what it could not do was
  survive losing the race twice. So each attempt now re-reads the head, re-bases
  the tree on it, re-decides idempotency against it and commits with THAT head
  as parent, up to **`EXPORT_MAX_ATTEMPTS` = 4** (one try, three rebuilds; each
  attempt is six sequential round trips, so four fits a serverless invocation
  and the patience of someone who just pressed Retry). The ref is also re-read
  immediately before the update, which catches the common case a round trip
  early but is NOT the guarantee -- only the update is atomic, so the 422 from
  the PATCH is still what is handled. Backoff between rebuilds is jittered so
  two exports of one item do not retry in step.
- **`force` APPEARS NOWHERE IN THIS PATH AND MUST NOT.** These commits are
  written unattended to a branch whose history exists nowhere else; an export
  losing a race is never a reason to discard the commit that beat it. A test
  asserts no request body in the whole sequence carries it.
- **THE CHIP NAMES THE FAILURE CLASS**, because "GitHub 422: Reference cannot be
  updated" reads to a teacher like their own content was rejected. A `collision`
  says nothing was lost and to press Retry; a `refused` (branch protection, a
  token without access) says retrying will not change it; a `network` says
  neither; an `unknown` refusal is shown verbatim rather than confidently
  mislabelled. Branch protection and a lost race are BOTH 422 from the same
  endpoint and are told apart by GitHub's own words (`PROTECTION_MARKERS`),
  checked before the status code -- a protection refusal must not be absorbed as
  a race and retried three more times. `classroom_record_export` stores one text
  column, so the class is encoded in the WORDS (`exportFailureMessage`) and read
  back out of them (`classifyExportError`); a `kind` field alongside would not
  survive the page reload that the chip has to.
- **IDEMPOTENT AGAINST THE HEAD IT ENDED UP WITH**: the new tree is compared to
  the base commit's and an identical one is not committed at all, re-decided on
  every attempt -- the writer that beat us may have written exactly this content
  (a duplicate export of the same item), and committing anyway would add an
  empty commit per collision. Measured, not asserted -- the mock GitHub returns
  a real tree sha derived from content. **CAVEAT, and it is a real one:** across
  SEPARATE export invocations this almost never fires, because `material.json`
  carries `exportedAt` and every export stamps it fresh, so the tree always
  differs. `git log` shows the consequence -- six identical
  `classroom: AI Levels: Live Verification (assignment) r1` commits in a row.
  Within one push the files are fixed, so the rebuild loop above cannot multiply
  commits; the duplication is per-save and predates it. Dropping `exportedAt`,
  or moving it out of the committed file, would make Retry genuinely free --
  deliberately NOT done here, since it changes the exported file format.
- **The slug is ASSIGNED ONCE.** `classroom_record_export` refuses to overwrite
  an existing `export_slug`, so retitling a material does not move its folder
  and leave the old one behind as a second copy with nothing linking them.
- **`revision` in the commit message is the item's own version count** (total
  revisions + 1) -- "the Nth version of this material", the number a commit
  message wants, not a per-column counter a reader of the repo could not
  interpret. Per-target numbers exist separately and are what the panel shows.
- **THE CLIENT FIRES IT, AND DOES NOT WAIT.** `pingClassroomExport` is called
  after every successful content write and ignores the result. Its own request
  rather than work tacked onto the write, because a serverless function is torn
  down once it has responded -- a background task started inside the save may
  simply never run. `/api/classroom/export` never 500s on a failed export:
  answering 200 with `status: 'failed'` is what lets the client tell "the export
  did not land" from "this request did not arrive".
- **Best-effort, always.** A refusal, an unset token or a network failure costs
  the export and nothing else. **An unset token is SILENT** -- no attempt, no
  recorded failure, no chip -- so local development behaves normally.
- Outcome recorded on the item (`last_export_at` / `_sha` / `_error`) and shown
  as a quiet amber chip with Retry in the manage console, on the row and only
  when something is wrong. A success clears the error; a failure LEAVES THE LAST
  GOOD SHA alone, because "it exported cleanly at 14:02 and the attempt at 14:40
  failed" is two facts and the chip needs both.
- **The export status is a LOADER CALLBACK, not a prop map** (the
  `loadNotebookGrid` shape): the console loads a section's content lazily, so
  nothing up front knows which items to ask about. Its own query rather than
  columns on `ITEM_SELECT`, for the deploy-ordering reason that constant
  documents -- naming 0110's columns there would blank every classroom read
  until 0110 landed.

### Verified

- **`tests/classroom-revisions.test.ts` (29 tests**, the classroom chain plus
  `0110` on real embedded Postgres): the non-destructive attach and the chain's
  shape (including the two CHECKs and the unique that stops a fork, asserted
  with RLS out of the way); a no-op save writing nothing for all four targets;
  removal snapshotting; restore extending the chain, round-tripping,
  re-validating, and leaving links alone; the read/restore asymmetry; no client
  write path for student, teacher OR admin; no anon grant; the export
  bookkeeping's assign-once slug and its two-facts behaviour; and **the file
  re-applying twice** with the constraints and overload counts re-checked
  (0088's lesson, learned in the field).
- **MUTATION-CHECKED FOUR WAYS.** Making the snapshot a no-op reddens **12**;
  removing the no-op guards so every save snapshots reddens **5**; opening the
  read policy to `using (true)` reddens **2**; swapping restore's guard for the
  weaker read bar reddens **1** -- and reddened **0** until the assertion was
  tightened, which is why that test now names the restore's own message.
  Migration restored byte-identical (md5-checked) each time.
- **`tests/classroom-export.test.ts` (43 tests, pure)**: NO network and NO
  token -- the GitHub API is a mock that answers the Git Data endpoints the way
  GitHub does, including returning an unchanged tree sha for unchanged content,
  so the idempotency test is a measurement rather than an assertion about our
  own code agreeing with itself. Covers the slug rules, `_shared`, the file
  layout, the commit format, one-commit-for-three-files, no blob round trip,
  the bearer auth, **the token never appearing in an error message or stack**,
  the skip rules, and that a failure RESOLVES rather than throwing.
- **THE MOCK NOW REFUSES A NON-FAST-FORWARD, and did not before.** Its PATCH
  handler used to accept whatever sha it was handed and move the head to it, so
  every test passed against a branch that could not move -- and the one
  condition this repo produces constantly was the one the suite could not
  express. A mock more permissive than the real thing does not fail loudly; it
  certifies a bug. It now answers `422 Reference cannot be updated`, verbatim,
  when a commit's parent is no longer the head, and `collide: {at, times}` is a
  concurrent writer landing either inside the window (`trees`) or at the last
  instant (`patch`, so the update itself is what 422s).
- **REPRODUCED BEFORE IT WAS FIXED.** With the fix stashed, the collision case
  threw `GitHub 422: Reference cannot be updated` from the PATCH -- the reported
  string exactly. The same measurement settled what Retry was actually doing:
  after ONE collision the pre-fix retry SUCCEEDED (commit parents `head-sha-0`
  then `outside-sha-1` -- a fresh parent, not a remembered one), while against a
  branch that moved on every attempt all four retries failed identically, each
  on its own fresh parent. The defect was never stale state; it was one shot per
  press.
- **MUTATION-CHECKED TWELVE WAYS**, every new assertion earning its place:
  removing the retry reddens 6; removing the pre-write re-read reddens 1;
  deciding idempotency once instead of per attempt reddens 2; classifying a race
  as a refusal reddens 2 and the reverse reddens 2; wording every failure alike
  reddens 5; adding `force` reddens 1; throwing instead of recording reddens 6;
  making the attach await the export reddens 1; misclassifying a dropped
  connection reddens 1. Changing `EXPORT_MAX_ATTEMPTS` reddened **0** until the
  bound was pinned to a literal -- the test had asserted the count against the
  constant, so it agreed with any bound at all, including none.
- **NOT VERIFIED AGAINST THE REAL API.** There is no `GITHUB_EXPORT_TOKEN` in
  this environment, so the write path was never exercised against
  api.github.com. Read-only calls WERE: `GET /git/ref/heads/main` and the commit
  list confirm the repo, the branch, and 15 commits to main in one day from both
  people and the app (two of them 10s apart). `GET /branches/main/protection`
  needs auth and answered 401, so **whether main carries a protection rule is
  unknown from here** -- if it does, the `refused` path is what a teacher will
  see, and no amount of retrying is the answer. Also unproven: that the retry
  loop recovers against a real concurrent writer, and GitHub's exact 422 body
  for a non-fast-forward (the mock uses `Reference cannot be updated`, which is
  the string the failure was reported with, and the exporter classifies any
  unmarked 422 on the ref endpoint as a race regardless of wording).
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **956/956 across 40 files** (was 899/38 -- the two new suites are the
  difference exactly). Run DB suites with `--no-file-parallelism`, per the
  standing note.
- **Browser-verified over CDP** (the Chrome extension was unavailable) through
  `/dev/classroom-phase1`, extended with three views. The importer: **zero
  Validate buttons**; an invalid paste listing five real problems from the REAL
  validator with Publish disabled and no preview; a valid one clearing them,
  rendering the REAL `SpecRenderer` (module titles, points, sentence counters)
  with **0 textareas and 0 inputs**, and enabling Publish; **Publish staying
  enabled through a keystroke, immediately and after the debounce settled** --
  the exact regression the old flow had; a server refusal landing in the same
  problem list with the editor still open; a success closing it with a notice;
  and the reference kind rendering the REAL `ReferenceDoc` tabs with the
  public toggle, deep links and Open reader, **leaving the host URL and scroll
  untouched** on a tab click. The history panel: collapsed by default behind a
  real `<button>` with `aria-expanded`/`aria-controls`, four entries across
  THREE targets in one chronological list newest-first, the restore entry
  reading "Replaced by a restore of r1", payload expansion, a two-step restore
  naming its consequence, and confirming GROWING the chain 4 -> 5. The export
  chip: exactly 1 of 5 rows, naming the reason, a failing Retry replacing the
  reason and a succeeding one clearing the chip with no reload. In situ on
  `ItemDetail`: a teacher gets the panel and the importer, **a student gets
  neither**. 375px with no overflow, and the chevron transition off under
  reduced motion. **Zero console errors throughout.**
- **A PRE-EXISTING 375px OVERFLOW FOUND AND FIXED while verifying**, and it was
  not mine: `.sched-chip` (Phase 1) carries `white-space: nowrap` and measures
  ~200px with a whole timestamp in it, pushing the manage console's content row
  4px past a 375px viewport and giving the page a horizontal scrollbar.
  Measured with the export chip hidden, which changed nothing. It wraps below
  32rem now: 379 -> 360 against a 375 viewport, zero offending elements.
- **A HARNESS BUG FOUND AND FIXED**: the Phase 1 harness's reference transport
  declared `setSpec` where the interface is `setReferenceSpec`, hidden by its
  `as unknown as` cast -- so that control had simply done nothing when pressed.
- **Deliberately NO student-facing changelog entry.** Every part of Phase 2 is
  teacher tooling; nothing a class sees changed, and an entry about revision
  history or a GitHub export would be a commit message in the wrong file (see
  the standing directive).
- **NOT verified: the live Supabase project, a real GitHub push, and no
  screenshots.** The local `.env` is the placeholder project, so `0110` has
  never been applied anywhere and no commit has ever reached the real repo.
  **Apply `0110` by hand after `0109` BEFORE deploying** -- the client calls
  `classroom_item_revisions` and `classroom_record_export`, and the manage
  console reads the four export columns; without it the history panel reports
  its error and the chips never appear, which is degraded rather than broken.
  Then set `GITHUB_EXPORT_TOKEN` and check that publishing a spec lands one
  commit under `materials/`, and that pressing Retry twice does not add a
  second. CDP gives measured DOM and computed-style reads, not an eyeball.

