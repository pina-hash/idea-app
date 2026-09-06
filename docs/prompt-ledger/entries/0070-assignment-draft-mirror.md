# 0070 A student's answers have no mirror, so a discarded tab takes them
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `AssignmentEngine.svelte`, `src/lib/classroom/assignment-draft-mirror.ts` (new), `SaveIndicator.svelte`, `src/routes/dev/assignment-mirror/**`, `tests/classroom-assignment-mirror*`, `tests/dom/assignment-mirror*`, `tools/browser-verify/routes/assignment-mirror*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0070-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0184
- Status: pushed
- Branch: claude/assignment-draft-mirror-zpzkzd
- Notes: Prompt 0061 was sent after two reports, "infinite copies of that
  draft" and "Homework progress didn't save". It found the first, fixed it,
  and reported that the second had no silent-failure path on the student
  side: every refusal and every transport failure reaches `SaveIndicator` in
  words, and in-app navigation is flushed and re-issued.
  
  It found ONE real gap and could not take it, because the file was outside
  its ownership. `AssignmentEngine` writes on an 800ms debounce and has NO
  draft mirror. A tab the browser discards inside that window loses whatever
  was typed, with nothing dispatched at all -- so nothing fails, nothing is
  reported, and the student simply finds their answer gone.
  
  On a phone that is the ordinary case rather than an edge one. A student
  types an answer, switches apps, and the browser reclaims the tab.
  
  The notebook already solved this. `src/lib/notebook/draft-mirror.ts` keys
  `notebook_draft_mirror:<viewer>:<record>` with `new` for an unsaved one,
  and it is the pattern to copy rather than a second design.
  
  Deliberately excluded: `ContentComposer`, fixed by 0061 and the instructor
  half; the notebook mirror itself; and the 800ms debounce, which is a
  separate trade and is not obviously wrong.
