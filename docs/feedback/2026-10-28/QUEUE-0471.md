# Queue 0471: IdeaCAD sharing emails, a coin record search, classmate-name checks

Issued 2026-10-28 22:23 PT by Mr. Pina in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List".

## 1. IdeaCAD sharing shows name and email (his decision)

His words, answering lane 0470's two questions: "Idea can search is fine. You can already search for anyone using the Gmail. Since it's an organization, you can search by anyone, for anyone by name or by their email. So that is completely fine. I think it should show name and email in any case. I really don't know why you would hide the email. Everyone knows everyone's email already."

- Keep the school-wide search as lane 0470 built it (any signed-in Bosco Tech account).
- Search by name OR email, partial matches on either, including for someone who chose a display name.
- Every person in the picker results, the "who has it" list and the launch card's owner line shows their name and their school email address, everywhere.
- Lane 0470 withheld email and limited matches behind a chosen display name to follow CLAUDE.md "A chosen public identity replaces the account identity completely". This decision is his exception for IdeaCAD sharing: record it as a decision entry under `docs/decisions/entries/` with his words, and update `docs/subsystems/ideacad.md` and the 0325 header notes (in a new migration, never by editing 0325). Do not widen any other surface's payload. Ask nothing about pictures: a chosen picture still replaces the Google photo.
- Update lane 0470's mutation-proof tests so they hold the new rule both ways: email present for a school account, still nothing returned to a caller who does not own the model, still no visitors (non-school accounts) listed.

## 2. A coin record search for staff, so past records can be corrected

He approved re-typing about 72 Weekly Pay rows logged on 2026-10-19 under Contract Completion (notes beginning "Weekly pay, week of Oct 19") to the Weekly Pay category (`weekly_pay`, from 0322). `coin_transactions_relabel` needs each record's id, and no connector read returns record ids by category and date (`coin_public_transactions` has no ids; `coin_autopay_recent` lists only automatic pay).

Build a read for a full coin admin: records filtered by category, date range, and note text, with id, student name and email, amount, category, note, date, and reversed state, capped and paged. Reach it through the connector (additive registry entry). Do NOT run any relabel yourself: the chat runs it after reading it back.

## 3. Classmate-name check on tournament entries and market listings (3d4d8b76)

Lane 0456 built `_idea_roster_name_hits` and calls it from team names and taglines, holding a hit for his OK on the sign-offs page. Call the same function from tournament entry names and taglines and from IDEA Market listing titles and text, holding a hit the same way and showing it where he already approves held team text. One check, never a second copy.
