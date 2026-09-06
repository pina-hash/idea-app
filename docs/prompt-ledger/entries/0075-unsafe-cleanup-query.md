# 0075 0061's cleanup query would delete a student's hand-in, and nothing says so
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `docs/history/duplicate-drafts-production-ru7pag.md` (new), ONE pointer line at the top of `docs/history/draft-duplication-homework-progress-65qxgf.md` and nothing else in that file, and `docs/prompt-ledger/entries/0075-*`.
- Migration permitted: no.
- Status: pushed
- Branch: `claude/duplicate-drafts-production-ru7pag`
- Notes: This session was issued prompt 0074 and stood down from its surface.
  Two sessions were issued 0074 within three seconds of each other --
  `claude/duplicate-drafts-production-ru7pag` (this one, ledger committed
  07:17:44 UTC) and `claude/duplicate-drafts-count-wzworl` (07:17:47 UTC) --
  both parented on `origin/integration` at `13d1747`, both writing a
  byte-identical ledger entry. That is precisely the case
  `docs/prompt-ledger/README.md` already says the ledger does not catch:
  "two chats that both write a prompt in the same minute, before either
  records an entry". The check is not broken and neither session erred.
  `wzworl` is building the surface; this one carries the finding out of the
  collision instead, so the audit is not lost with the branch.

  THE FINDING. Both sessions audited 0061's history entry independently and
  reached the same four conclusions, which is corroboration rather than one
  session's reading. The load-bearing one: **0061's committed cleanup query
  is unsafe.** Its safety query checks six item-keyed tables and misses two
  that hold student work -- `classroom_submissions`, with
  `classroom_submission_files` behind it, and `classroom_module_approvals`.
  A draft carrying a hand-in but no response passes that query, reads as a
  surplus copy, and is deleted with the hand-in inside it, because every one
  of the 18 item-keyed child tables is `on delete cascade`.

  WHY THIS IS URGENT AND A CODE CHANGE IS NOT. The query is committed, it is
  addressed to whoever has SQL editor access, and it is the ONLY written
  record of how to do this cleanup. The repo writes a history entry once and
  never edits it, so the correction is a NEW entry -- and a superseding
  record nobody can find from the stale one corrects nothing, which is why
  the one pointer line at the top of 0061 is half the bundle rather than a
  courtesy.

  Deliberately excluded: the duplicates surface itself, owned by `wzworl`;
  any edit to 0061's entry beyond the single pointer line, because an entry
  is a dated record and is not rewritten to match what was learned later;
  and any migration, because nothing here is a schema change.
