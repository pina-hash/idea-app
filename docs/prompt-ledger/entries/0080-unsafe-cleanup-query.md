# 0080 0061's cleanup query would delete a student's hand-in, and nothing says so
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `docs/history/duplicate-drafts-production-ru7pag.md` (new), ONE pointer line at the top of `docs/history/draft-duplication-homework-progress-65qxgf.md` and nothing else in that file, and `docs/prompt-ledger/entries/0080-*`.
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

  THIS ENTRY WAS 0075, THEN 0077, AND THE THIRD NUMBER IS THE ONE THAT
  HOLDS BECAUSE IT WAS NOT DERIVED.
  0075 was verified free at 08:03 UTC against every ref tip and against
  `git log --all --diff-filter=A`. Both checks were right and both were
  wrong: `claude/red-merge-green-parents-ft3e57` had already been issued 0075
  and pushed its entry at 08:03:27, ten seconds after this one committed at
  08:03:17. `claude/tournament-thumbs-listing-psuleu` pushed 0076 at 08:06:56.
  Neither was visible to any git command at read time because neither had been
  pushed yet.

  Renumbered to 0077 by the same two checks, with the prediction written down
  beside it that 0077 "carries the identical weakness". **It did.** 0077 had
  been issued to the tournament redesign at 08:11 UTC, four minutes after this
  entry moved into it, and was unpushed and therefore invisible for the third
  time in an hour.

  0080 was not derived. Mr. Pina stated it, and reserved 0078 and 0079 as a
  deliberate gap so a session writing tonight cannot land in one. **That
  sentence is the fix, and the derivation was never going to be.** A number
  verified free is a number nobody has PUSHED, never a number nobody HOLDS,
  and the issuer is the only party that can see the difference -- the same
  read-time gap that produced two decision 15s, two migrations claiming 0146,
  and the 0074 race at 07:17. A session asked to "take the next free number"
  should say what it verified and then ASK, rather than commit into a number
  it can only prove is unpushed.

  Deliberately excluded: the duplicates surface itself, owned by `wzworl`;
  any edit to 0061's entry beyond the single pointer line, because an entry
  is a dated record and is not rewritten to match what was learned later;
  and any migration, because nothing here is a schema change.
