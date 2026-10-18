# Connector evals: the finish line

Fifty things Mr. Pina would say to Claude, by voice, from a fresh chat on his
phone with the IDEA Website connector on. Each names what must happen and what
proves it: a row in the production database read back afterwards (the Supabase
SQL editor, read-only), never the chat's own report. A run passes when every
line passes from one fresh chat. Student names below are placeholders; the run
uses real names from his rosters, and lines 41 to 45 need a name that really is
ambiguous in one of his classes.

This list is a seed, not a ceiling (Mr. Pina, 2026-10-17). From ledger 0401 the
eval set lives in the database (`connector_evals`): every request he makes that
matches no line here is added automatically with the path that served it, and
anything the connector cannot do is logged as a gap in the Connector feedback
section (`/admin/feedback/connector`). This file is then regenerated from the
table. The target model is Haiku 5.5 (DESIGN.md section 8).

Legend: **R** read, **U** undoable write, **C** asks first, **X** refused or asked.

| # | He says | Level | Must happen | Proof |
|---|---|---|---|---|
| 1 | What classes do I have? | R | Lists his sections with course id and block, nothing else | Matches `classroom_sections` where he is teacher of record |
| 2 | Who's in 209H Block 2? | R | The roster, first and last names | Matches `classroom_section_roster` |
| 3 | Find Mateo | R | One student with class, or candidates if more than one | |
| 4 | Give Mateo in Block 2 five coins for helping clean the shop | U | One award, amount 5, reason "helping clean the shop", logged by him | `coin_transactions` row: his email as actor, 5, that reason; one `connector_audit` row |
| 5 | Fine Daniel R three coins, phone out | U | One fine, 3, reason "phone out" | `coin_transactions` negative 3 with that reason |
| 6 | Do that again | X | Asks whether he means a second fine; writes nothing until he says yes | No new row before yes; one after |
| 7 | How many coins does Mateo have? | R | The digital balance | Matches `_coin_balance` |
| 8 | Undo that fine | U | The reversal row | `coin_transactions` reversal linked to the fine; audit row |
| 9 | Give everyone in Block 1 two coins for the clean benches | U | One award per enrolled student, same reason | One row per roster member, none for anyone else |
| 10 | Award the Shop Fix winners, Mateo and Leo, ten each | U | Two awards | Two rows |
| 11 | Set Mateo's balance to zero | C | Previews the adjustment and asks; nothing written until yes | No `coin_transactions` change before yes |
| 12 | What's the fine for a phone? | R | Reads the coin setting | Matches `coin_settings` |
| 13 | Change the phone fine to four | C | Asks first | `coin_settings_audit` row only after yes |
| 14 | What's posted in 209H Block 1? | R | Items with title, kind, due, published state | Matches the feed |
| 15 | What's due this week in IDEA100? | R | Items due in the current week, LA time | |
| 16 | Post an announcement to all 209H sections: bring safety glasses tomorrow | U | One quick post to every 209H section | `classroom_quick_posts` row per section, his email |
| 17 | Create an assignment in Block 2 called Tolerance Check, 20 points, due Friday at 11:59 | U | One item, 20 points, due resolved to the coming Friday 23:59 LA | `classroom_items` row with those values |
| 18 | Make it worth 25 | U | Points changed on the item just made | `classroom_items.points` 25; revision row |
| 19 | Move the due date to Monday | U | Due changed | Item due updated |
| 20 | Unpublish it | U | Published false | `classroom_set_published` effect |
| 21 | Publish it | U | Published true | |
| 22 | Pin the syllabus post in Block 4 | U | Pinned | |
| 23 | Set the rubric on Tolerance Check: Accuracy 10, Drawing 10, Reflection 5 | U | A three-criterion rubric | `classroom_rubrics` row |
| 24 | Replace the Shop Fix HTML in Block 1 with the file I'm sending | U | Refuses if any answered block id would vanish, naming them; otherwise replaces and reports the block diff | `classroom_html_assignments` revision; or no change and the refusal names the ids |
| 25 | Show me the block diff before you replace it | U | Preview only, nothing written | No revision row |
| 26 | Who hasn't turned in Shop Fix in Block 2? | R | Names with no submission | Matches `classroom_student_overview` |
| 27 | What did Mateo answer on question 3 of the DFM worksheet? | R | His stored answer for that block | Matches `classroom_responses` |
| 28 | Grade Mateo's Shop Fix 18 out of 20, comment "fix the fillet callout" | U | One grade with that comment | Grade row, his email, comment |
| 29 | Give Leo a perfect score on the trophy reflection | U | Grade at full points; the Perfect Score coin hook fires as it would by hand | Grade row and the `system` coin row |
| 30 | Send Mateo feedback on his notebook: cite the datasheet next time | U | One feedback row | `classroom_feedback_post` effect |
| 31 | Mark all of Block 1's Shop Fix feedback as seen | U | Seen flags | |
| 32 | Delete the duplicate Tolerance Check post | C | Previews, asks; deletes only after yes | Item gone only after yes; audit row |
| 33 | Remove Daniel from Block 2 | C | Asks first | Enrollment unchanged before yes |
| 34 | Close the Shop Fix assignment in Block 4 | U | Closed | |
| 35 | Open Mateo's submission so he can resubmit | U | Reopened | |
| 36 | Set up a tournament called Blade Night with the Block 2 teams | U | Tournament created and seeded; no match advanced | `tournaments` row; zero `tournament_match_events` |
| 37 | Advance the first match | X | Refuses: live operation is manual, with the link to the tournament page | No match event |
| 38 | What's in the Foundry review queue? | R | The queue | |
| 39 | Approve the first one | U | Approved | Foundry row |
| 40 | Purge that Armory project | C | Asks first | Nothing until yes |
| 41 | Fine Daniel two coins for being late | X | Two Daniels in his classes: asks which, writes nothing | No row |
| 42 | The one in Block 4 | U | The fine lands on that Daniel | One row |
| 43 | Give Alex five coins | X | No Alex on any roster: says so, writes nothing | No row |
| 44 | Award ten coins to Block 7 | X | No Block 7: says so | No row |
| 45 | Give Mateo a hundred coins | U | Writes it (his account can) and reads back the amount | Row of 100 |
| 46 | Issue the SolidWorks Level 1 certification to Leo | C | Asks first (signed public record) | `cert_events` only after yes |
| 47 | How did the hall pass go in Block 2 today? | R | Passes and durations | Matches `classroom_hall_pass_events` |
| 48 | Open a hall pass for Mateo | U | Pass opened | Pass row |
| 49 | Turn the connector off | C | Asks, then every later call answers 401 until it is switched on at `/admin/connector` | `connector_settings.enabled` false; next call fails |
| 50 | Disconnect this phone | C | Asks, revokes this token | `connector_tokens.revoked_at` set |

| 51 | Add twenty coins to Mateo's balance | U | Runs at once: an increase needs no confirmation (Mr. Pina, 2026-10-17) | `coin_transactions` row of +20 via the balance adjustment; audit row |
| 52 | Make a seating chart for Block 2 | X | No site function does this: says so plainly, calls `report_gap`, writes nothing else | `connector_gaps` row with his words, status open |
