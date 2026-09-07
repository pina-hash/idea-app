# 0099 The last four things
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: the GAUNTLET sub-30-second pass, the FRC quiz distractor lengths, decision 06's Status line, the two defects prompt 0098's sweep found, migrations 0190 and 0191 if needed, and its own `docs/history/` entry.
- Migration permitted: at most two, 0190 and 0191. Claims: 0190, 0191. Highest on origin/main at issue: 0189
- Status: pushed
- Branch: claude/prompt-0099-last-four-2dbr68
- Notes: The last four items, all decided by Mr. Pina on 2026-09-06.
  
  ONE. **A sub-30-second GAUNTLET pass must count.** Prompt 0098 found the
  30-second floor is `0154`'s deliberate forgery control and reported that
  such a run is recorded but read as NOT CLEARED by the `/gauntlet` home page
  and by `nextUncleared`. Mr. Pina's ruling: students must be allowed to
  submit sub-30-second times, and those times must count. The forgery control
  and the clearance test are two different questions and the code conflates
  them.
  
  TWO. **The FRC quiz answer key is recoverable from option length.** Across
  140 items the longest option is correct 67.9% of the time against 25% at
  chance, and a student who knows nothing and always picks the longest clears
  MDM-10 in 1.75 attempts. Prompt 0059 measured it, built the instrument and
  the guard, and left the content to Mr. Pina.
  
  He has delegated it, and the delegation comes with a constraint that keeps
  it out of teaching judgement: **DO NOT INVENT NEW WRONG ANSWERS. Make the
  EXISTING distractors longer without changing what makes them wrong.** Same
  wrong idea, more words. That removes the length signal by editing rather
  than authoring, and a distractor's wrongness is preserved by construction
  because nobody changed it.
  
  THREE. Decision 06 reads `Status: open` with an empty Decision line
  although `0173` shipped it. A tree check already says so.
  
  FOUR. Two defects prompt 0098's `aria-disabled` sweep found and did not
  own: typing in the feedback box during SENDING inserts a second row, and
  twelve controls carry `aria-disabled` where a real `disabled` belongs, one
  of them in `ReviewConsole` carrying both.
  
  Deliberately excluded: deleting any `claude/**` branch, which the proxy
  refuses with a 403 and the integrate workflow reaps; and inventing any quiz
  content.
