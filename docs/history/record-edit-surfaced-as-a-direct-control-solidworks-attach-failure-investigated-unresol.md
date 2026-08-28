---
title: "Edit surfaced as a direct control; SolidWorks attach failure investigated, unresolved (`claude/classroom-edit-solidworks-yujdug`)"
date: 2026-08-26
branches: [claude/classroom-edit-solidworks-yujdug]
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 151
---

## Edit surfaced as a direct control; SolidWorks attach failure investigated, unresolved (`claude/classroom-edit-solidworks-yujdug`)

**Item 1: Edit was buried.** On an item page, Edit lived only inside the
collapsed "Instructor tools" disclosure (`ItemDetail.svelte`), alongside Pin,
Copy and Delete. It is now a direct control rendered above the disclosure
strip, inside a new `.insp-edit` block gated by the same `editable` (`canManage
&& !!transports`) predicate the old inline button carried -- so the licence to
see it is unchanged, only its position is. Pin, Copy and Delete stay behind the
disclosure exactly as before; only the Edit button, its "also posted to..."
notice and the `ContentComposer` edit form moved out, so opening the editor no
longer requires expanding "Instructor tools" first. The student render path is
untouched: `{#if canManage && hasInspector}` still guards the whole region, and
an SSR diff against the harness (`/dev/classroom-split/s-1/item/i-2`) shows 0
inspector elements for a student render, 1 for a teacher render, with the
`Edit` button appearing before `insp-strip` (the disclosure toggle, still
`aria-expanded="false"` by default). `svelte-check`: 0 errors / 37 warnings
(31/5/1 breakdown), unchanged from baseline. No visual/browser tool was
available in this session (cloud session, no `Claude_Browser`/`claude-in-chrome`
MCP); verification was structural (SSR markup, `svelte-check`, the targeted
test files) rather than a literal 1440px/375px screenshot pass. The new markup
carries no `@media` rule and none of the surrounding file does either, so
nothing about the fix is width-dependent.

**Item 2: the SolidWorks attach failure is still unexplained.** A teacher
reported (2026-08-22, build `d573d21`, route `/classroom/[sectionId]/grades`)
that a SolidWorks file could not be attached. This is a DIFFERENT report from
the one that started the "Any file type, up to 200 MB" bundle (`0133`/`0134`/
`0135`, elsewhere in this file) -- that one is fully shipped and is why every
mime/extension gate this session went looking for is already gone. Checked and
ruled out, by name:

- **The browser picker's `accept` attribute.** `FileUploadPanel.svelte`'s plain
  picker (`<input type="file" multiple ...>`, line ~330) carries no `accept`
  at all. The only `accept` on this path is the separate camera-capture input,
  which sits BESIDE the plain picker and gates nothing.
- **A different upload path on `/grades`.** `GradesPanel.svelte` (mounted by
  `/classroom/[sectionId]/grades/+page.svelte`) contains no file-upload UI of
  any kind -- no `FileUploadPanel`, no reference to upload/attach/file. The
  only classroom attachment UI is on the item detail page (`ContentComposer`
  for a teacher's own attachment, `AssignmentEngine`/`SpecRenderer` for a
  student hand-in). The `/grades` route in the report is most likely where
  `SiteFeedback` (mounted globally, captures the current route at submission
  time) happened to be open when the report was filed, not where the attach
  was attempted.
- **A repo-level type or size gate.** None exists: `file-upload.ts`,
  `classroom-attachments.ts` (at `src/lib/server/`, not
  `src/lib/classroom/` -- see below) and both sign routes (`attachment/sign`,
  `submission-file/sign`) impose only the 200 MiB (209715200 byte) cap, which
  matches the bucket's own configured `file_size_limit`. No mime check, no
  extension check, anywhere on this path.
- **A client-side size limit.** `CLASSROOM_UPLOAD_MAX_BYTES` is 200 MiB,
  matching the bucket. A SolidWorks PART or typical ASSEMBLY is well under
  that; a very large multi-thousand-part assembly could exceed it, but the
  report gives no file size to test that against, and a size refusal would
  have produced the self-explanatory "That file is ___ MB, and the limit is
  200 MB" message from `tooLarge()` -- not a report of unexplained failure.
- **Bucket-level `allowed_mime_types` / `file_size_limit` drift, live on
  Supabase, outside the repo.** THIS IS THE LEADING CANDIDATE AND IS
  UNRESOLVED. Migration `0133` (reasserted by `0135`) sets both buckets to
  `allowed_mime_types = null`, `file_size_limit = 209715200` via
  `on conflict do update`, which only takes effect when the file is (re)applied
  by hand -- migrations here are applied manually, per `CLAUDE.md`. If a bucket
  setting was changed afterward directly in the Supabase Studio dashboard
  (accidentally or otherwise), the repo would show no evidence of it, and no
  migration after `0135` touches either bucket. This session's `.env` is the
  placeholder project (`example-ref`), so nothing here can read the live
  bucket's actual `allowed_mime_types`/`file_size_limit`. **Needs a manual
  check of the `classroom-attachments` and `submission-files` buckets in the
  Supabase dashboard (Storage > bucket > Configuration) against
  `allowed_mime_types = null` and `file_size_limit = 209715200`,** and if
  either has drifted, re-pasting `0133`/`0135` (both idempotent) restores it.

**A file-path discrepancy in the task brief, worth recording:** the brief
named `src/lib/classroom/classroom-attachments.ts` as an owned file; it does
not exist at that path. The write-side module is
`src/lib/server/classroom-attachments.ts`. Read and covered above under that
real path; nothing was written to a nonexistent file.

**Not verified:** the live production Supabase bucket configuration (no
credentials or network path to it from this session); the actual size of the
SolidWorks file in the original report; whether the teacher's browser or OS
imposed its own picker-level restriction (outside this repo's control, cannot
be checked from here); a screenshot/computed-style pass on item 1 at 1440px
and 375px (no browser tool available in this session).
