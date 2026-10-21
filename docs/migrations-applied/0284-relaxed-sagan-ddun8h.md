---
migration: "0284"
file: 0284_html_assignment_show_title.sql
sha256: 0d444992a1982e1e42be716e7cd41b4fc301cfbd427a2077403bbf47e6b35b69
sha256_covers: repo bytes at commit 19044160654b9791036717a1089f9f64e13ed7d6
applied_at: 2026-10-21
recorded_at: 2026-10-21T04:29:44.166Z
source: report
attested_by: Alejandro Pina (pasted by hand in the Supabase SQL editor)
evidence: report-only
ledger: "0420"
recorded_by_ledger: "0420"
branch: claude/relaxed-sagan-ddun8h
commit: 19044160654b9791036717a1089f9f64e13ed7d6
outcome: reported
---

# 0284 applied by hand

**This record rests on Alejandro Pina (pasted by hand in the Supabase SQL editor)'s report of 2026-10-21, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0284_html_assignment_show_title.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0420-feedback-round-2026-10-21.md`
- `Migration permitted: yes, four files, each applied by hand by Mr. Pina in this order. Claims: 0283, 0284, 0285, 0286. Highest on origin/main at issue: 0282.`
- Written on `claude/relaxed-sagan-ddun8h`.
- Recorded, later and separately, by ledger `0420`. That bundle did not write this migration and did not apply it.

## What was reported back

**No verification output was supplied.** The whole of the evidence is the report that the file was pasted and applied. This record says the migration is live; it does not say that any object the file names was seen afterwards.

Reported by the person who pasted it. For 0284 and 0285 a catalog query was run afterwards and returned both new columns (classroom_html_assignments.show_title, classroom_quick_posts.important). pg_cron was enabled only after 0283 was pasted, so 0283 needs one more paste to schedule the every-minute job.

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
