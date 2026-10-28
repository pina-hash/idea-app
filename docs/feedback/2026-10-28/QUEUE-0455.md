# Queue 0455: tournaments and rotation copy-forward

Issued 2026-10-28 from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List".
Mr. Pina's words: "go ahead and run breaks classes week items, HTML program items, and then also do 11, 12, 13, 14, 15, 16, 17, 18, 19, and 20."
This lane is items 1 and 2 of that list. Lanes 0456 (team units), 0457 (grading) and 0458 (HTML program) run beside or after it.

Week context (live Bosco Tech calendar, read 2026-10-28): IDEA100 Rotation 2 ended Oct 28, Rotation 3 starts Oct 29. No Rotation 3 class existed on the site at 08:15 PT Oct 28. Mr. Pina is at FRC Beach Blitz Oct 30 to Nov 1.

Every report below is on the live site feedback list (ids are the first 8 characters; the connector's list_site_feedback returns the full text).

## Item 1: tournaments (Rotation 3 Hook and Blade tournaments come next)

- 6aa5ba19 (bug, Oct 28, /tournaments/[id]/host): "Oh. A seeding to a tournament is completely broken. I don't know if this has been logged yet but it's a big problem and it needs to be fixed immediately."
- c940fc00 (bug, Oct 28, /tournaments/[id]/host): Generate bracket fails with "update requires a where clause." It broke the IDEA-Blade Rotation 2 finals live in class on Oct 27 (tournament 2b5723ca); the chat that reproduced it promised a fix, but nothing had landed on main as of Oct 28 (2ac7ed3). Fix the bracket generator and add a test that generates a bracket for a seeded tournament.
- 544604c9 (idea): a tournament's format locks the moment the bracket is generated. On Oct 27 he changed best of 1 to best of 3, then wanted a best-of-5 or 7 final, and had to rebuild the tournament twice, leaving an orphan bracket. Allow match format (and a different format for the final) to be edited until the first result is entered.
- c6830880 (idea, has a screenshot, /tournaments/[id]/host): "I want to be able to select from a list of users instead of having to type in the email manually every single time."
- d4c2b43e (bug, connector): the connector refused tournament reads with a permission check on Oct 27 (tournament reward settlement, twice) while setting up IDEA-Blade seeding, so the setup was finished by hand in Chrome. Every tournament read and setup action he can do as admin should work through the connector.
- Standing rule (idea-website-connector memory): live tournament operation (advancing matches, entering scores) stays manual on the site; creating and setting up tournaments is in scope for the connector.

## Item 2: copy a rotation forward

- 3a549386 (idea): "Copying a rotation forward: duplicate works one post at a time. For the next IDEA100 rotation, there should be a one-step copy of all of a rotation's posts into the new section, with due dates shifted to the new dates (check first whether one already exists)."
- 64441b57 (bug): duplicating a post does not carry its moved pacing days or its edited sign-off checklists. The duplicate (0298) predates pacing (0308) and sign-off checkpoints (0304), which are stored per post, so any pacing move or checklist edit stays on the source. Duplicate, and the whole-rotation copy, should copy pacing and checkpoints too.
- f8c1b1d8 (idea), the site half only: dates are typed into every HTML assignment ("Class 5 · Oct 26" on IDEA-Blade 02). The copy should shift every due date and pacing day by the new section's start, counted in school days from the IDEA calendar. (The kit's class strip drawing from pacing is lane 0458's.)
- Wanted shape: from a class (or the connector), "copy this class's posts into <new class>, first class day <date>": a preview listing every post with its old and new due date, then one confirm. Drafts stay drafts; published posts arrive as drafts unless he says otherwise; no student answers, grades or team draws are copied.

## Added 2026-10-28 11:01 by Mr. Pina (fold-in)

- 3bcf3c90 (bug, coins through the connector): IDEA Coin awards through the connector stored his spoken words ("also go ahead all") as the note on all 17 tournament awards (Oct 27 to 28, IDEA 100 tournament), instead of the reason the chat passed separately. The award's note comes from the reason field; `said` is the request's own words for the connector audit log only and is never written onto a student-facing record. Fix the code path, add a test that a coin write's note is the reason and never the said text, and prepare the correction of the 17 notes (list each award: student, amount, current note, proposed note from its reason) but DO NOT write it: the correction runs only after Mr. Pina's yes, through the chat that started this lane.
