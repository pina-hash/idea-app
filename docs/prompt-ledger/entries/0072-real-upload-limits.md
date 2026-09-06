# 0072 Every stated upload limit in this project is fiction
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: exactly one migration (number taken at commit time), the upload-limit registry, the Foundry size ceiling in `preflight.ts`, `src/routes/dev/upload-limits/**`, `tests/upload-limit*`, `tests/db/bucket-limits*`, `tools/browser-verify/routes/upload-limits*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0072-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one, number taken at commit time. Highest on origin/main at issue: 0184. TAKEN: 0185 (`0185_bucket_limits_under_the_global.sql`), verified free across every remote ref and across `git log --all --diff-filter=A` at commit time. NOT APPLIED: `tools/apply-migration.mjs` cannot start in this container (`pg` is not installed, npm registry blocked by egress policy) and, independently, `idea-status.py` derives no probe from a migration that creates no object, so the tool refuses it. See the history entry.
- Status: pushed
- Branch: claude/upload-limit-fiction-jv9w43
- Notes: Mr. Pina read the Supabase dashboard on 2026-09-05 and it settles
  what prompt 0064 could not reach:
  
    Global file size limit: 50 MB, FIXED, because the project is on the
    Free plan. "Free Plan has a fixed upload file size limit of 50 MB."
  
  Every bucket limit above that is fiction. The dashboard shows
  `classroom-attachments`, `submission-files` and `instructor-attachments`
  at 200 MB; nine buckets read "Unset (50 MB)"; `maps-media` 20 MB,
  `feedback-media` 8 MB and `greenline-decals` 1 MB are the only three
  telling the truth.
  
  THE LIVE DEFECT IS THE FOUNDRY. `FOUNDRY_LIMITS` permits a 75 MB zip and
  `foundry-uploads` has no limit of its own, so the global 50 MB refuses it
  at the far end. A student with a 60 MB app transfers the whole thing over
  school wifi and is refused after the wait, every time, with an upstream
  sentence nobody wrote. That is the best explanation in the tree for the
  "failed upload" report.
  
  0064 built the registry and made refusals name their ceiling. It could not
  make them name the RIGHT ceiling, because the number was in a dashboard.
  
  ONE CORRECTION TO 0057's SWEEP: it reported `maps-media`'s `image/*`
  wildcard as admitting SVG. The dashboard shows an explicit list -- jpeg,
  png, webp, heic, heif, avif -- and no SVG. Verify which is true in the
  tree and say so; a wrong finding repeated is worse than none.
  
  Deliberately excluded: raising the ceiling, which is a Pro plan decision
  and Mr. Pina's; the refusal wording, which 0064 settled; and the public
  bucket questions, which prompt 0071 owns.
