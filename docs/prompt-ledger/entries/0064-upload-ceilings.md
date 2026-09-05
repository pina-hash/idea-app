# 0064 Two students hit an upload ceiling nobody can name
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `src/lib/upload-limits.ts` (new, conditional), the two `photo-prepare.ts` modules, the feedback screenshot path, upload refusal messages under `src/routes/api/**`, `src/routes/dev/upload-limits/**`, `tests/upload-limit*`, `tools/browser-verify/routes/upload-limits*.mjs`, the generated regions of its README, at most one migration, `docs/prompt-ledger/entries/0064-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, conditional, number taken at commit time. Highest on origin/main at issue: 0182 (measured on integration at fdf8c688: highest file is 0181; NONE was taken, see below)
- Status: pushed
- Branch: claude/upload-ceiling-investigation-jkwucn
- Notes: Two reports from the 2026-09-05 feedback pull, both `portal/bug`,
  both about an upload that did not work:

    "file size limit at 25 mb"
    "failed upload"

  NO 25 MB LIMIT EXISTS IN THIS REPOSITORY. Swept 2026-09-05: the classroom
  buckets are 209715200 (200 MB), GREENLINE decals are 1048576 (1 MB), and
  `FOUNDRY_LIMITS` is 75 MB zipped and 110 MB unpacked. Every "25 MB" in the
  tree is prose in a comment, several of them stale by their own admission.

  So one of two things is true and the audit decides which. Either a ceiling
  outside this repository is biting -- Supabase Storage's project-wide upload
  limit, a serverless request body cap, a browser -- and nothing on screen
  names it. Or a message told a student 25 MB and was wrong.

  Both are the same defect underneath: a student cannot find out why their
  upload failed. "Failed upload" with no detail is the second report and it
  is what the first one looks like when the number is not even mentioned.

  This bundle's deliverable is not a bigger limit. It is that every upload
  path in the portal refuses with a sentence naming the actual ceiling, the
  actual file, and what to do -- and that the ceilings are stated in one
  place rather than discovered.

  Deliberately excluded: `FOUNDRY_LIMITS`, set deliberately by prompt 0014
  with measured arithmetic; `src/lib/classroom/**`, which prompt 0061 may
  still hold; and raising any limit, which is a separate decision with a cost.

  OUTCOME: no migration. Five buckets carry no `file_size_limit` at all
  (`foundry-uploads`, `foundry-covers`, `avatars`, `tournament-thumbs`, the
  `gauntlet*` set), so their ceiling is the Supabase project-wide limit, which
  nothing in this repository can read. Setting one is CHOOSING a number, which
  is raising or lowering a ceiling, which the prompt excluded. The 25 was not
  found in the tree: all nine occurrences under `src/` are comment prose.
