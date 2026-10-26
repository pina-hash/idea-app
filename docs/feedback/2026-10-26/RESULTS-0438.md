# Results 0438: the assignment header, HTML gaps, connector grading, slow profiles, presentation check-off

All six items are on main and live on ideabosco.com (it served `60dbf23` at 09:10 PT on 2026-10-26). Both database changes are applied to production.

- idea-app, in push order: `f4063212` (item 6, the post edit migration), `20a64e5b` (item 1), `3373a09b` (item 2), `eb2b5d4e` (item 4), `f289e07b` (item 3), `502b2b39` (item 6, connector), `b74dc689` (item 5, its migration), `60dbf23f` (item 5, the page and connector entries), `72c8bdd1` (item 5, the connector suites and starting a list asks first).
- Migrations, in apply order: `supabase/migrations/0311_classroom_update_item_named_fields.sql`, then `supabase/migrations/0312_classroom_presentations.sql`. Applied by Migrate (records `1b49d743`, `a2b15924`; notices "82 posts in the table" and "0 presentation lists").

## 1. The assignment header with the title hidden (3ac88030, 36198988)

- With the title hidden the decal bar and its empty stripe are gone; kind, Updated, due date and points share one line.
- Show title and Hide title moved into the edit options under This post.
- Measured by the first session with `npm run verify:browser` on `/dev/item-header` (both states) at 375 and 1440: 34 measurements, none outside threshold (`tools/browser-verify/measured/item-header-*.json`). The header's height before and after was not recorded, so that number is not reported.

## 2. Three HTML assignment gaps (4fbab5ca)

- A document that reloads in place gets its team messages again (progress, state and tracker), not only once per frame.
- Cross-class grading lists retired questions in Answers and Answers by question, as the exports already did.
- Grading exports (JSON, workbook, answers CSV) carry teacher notes; the Grades tab has Download grades (CSV), one row per student and one column per assignment.

## 3. Full grading from the connector (6db4fbe5, gap 8fd1c0bb)

- `grading_packet`: one read per assignment with the questions (retired ones marked), rubric, optionally the worksheet HTML, and every student's answers, file and picture links (short-lived signed links), status, grade and notes. Team assignments list each team.
- `read_answers` now includes links to handed-in files and pictures. Gap 8fd1c0bb is built; his chat flips its status.
- `grade` takes a whole class at once, held for review, and returns everything held in one call. Teams are graded by team.
- Found on landing: a type error in the packet's question list (0 errors before it reached main, fixed in `f289e07b`).

## 4. Slow student profiles (a5f80fd7)

- Cause: the student page waited on its reads one after another (layout, roster, six reads, worksheet, notebook entries, pictures, profile).
- Measured on the fixture with every read delayed by the same fixed amount: 6 round trips after the layout before, 3 after, 14 calls either way (`tests/classroom-student-page.test.ts`). Every refusal is still the same 404 before anything returns.
- The class layout also waits on fewer round trips.
- Not measured: real page time on production.

## 5. Presentation check-off from the phone (68d4780e, replaces fc83019d)

- `/classroom/<class>/present` (palette command and a key on the Live tab): who is up, who is next, who is done. Start a list in roster order, random order, or by the class's posted teams; one open list per class.
- Presented, Absent, Redo, Start, Undo and move earlier. Notes while they talk land as instructor notes on that student's work for the list's assignment (for a team, on each member's). The rubric is scored by tapping levels; the score is held until he returns it.
- **Found and fixed before it shipped**: both grade writes replace a student's whole grade, so a live score of two rows would have wiped the rows scored elsewhere and the written comment. The page now reads what is stored and sends it back under the tapped rows; a team whose members already have different comments is refused with "Score it on the Teams screen" rather than overwritten (`tests/presentations-scoring.test.ts`).
- No poll, no channel, nothing the projector reads.
- Browser pass, 4 states at 375 and 1440: 0 measurements outside threshold, no horizontal scroll, every key at least 44px (marks 52px tall at 375, 56px at 1440). Present and absent both counted: the start form is present only with no list (1 against 0), the notes box only with a notes transport (1 against 0).
- Database: only a class's manager reads or changes a list; a student, a teacher of another class and a signed-out caller are refused and the tables answer no client. Mutation proof: opening the read and entry gates turns that test red (1 of 5), restored byte-identical (md5), green again.
- Connector: hand entries for show, start, mark, move, close and reopen. Starting a list asks first (it closes the open one, so it has no clean undo); every other change has an undo.

## 6. Editing a post through the connector (gaps 4353a482, c602486a)

- `classroom_update_item` takes the names of the fields an edit changes; given, every other field keeps what is stored. Left out, the call is a full edit as before, so the post editor and revision restore are unchanged.
- The connector names the fields on every path: site_call sends what was said, `set_points` and `set_due` name only their own field.
- Proven on seeded pre-migration data: the bug reproduced through the real old function, then after the file (applied twice), one field changed and every other column read back unchanged, for a category, a title plus category (the 2026-10-26 call), a due date cleared, `set_points` and `set_due` (`tests/db/classroom-update-item-named-fields-0311.test.ts`, `tests/db/connector-edit-post.test.ts`).
- `create_post` takes an optional category.
- "set a post's grading category" now finds the edit.
- c602486a was already closed as wrong by the chat.

### Could any other post have been hit?

Only one path sent partial edits: the connector's site_call to the post edit, reachable since 2026-10-18 (ledger 0400). The post editor always sent every field, and `set_points` and `set_due` always sent the stored values. So any post edited by a chat through site_call between 2026-10-18 and the deploy of `502b2b39` on 2026-10-26 could have lost fields that call did not name. Every such edit saved the post's previous version first, so each one can be put back from that post's revision history.

## The full test suite

Run once at the end on this machine: 925 files, 16,997 passed, 32 failed. Of the 32: 13 were this bundle's (the connector's permission, undo and practice suites had no sample for the new presentation actions, the presentation tables were not on the connector's list of tables it reads, and the browser pass README counts were stale), all fixed and green after (`tests/db/connector-permissions.test.ts`, `connector-levels.test.ts`, `connector-requests.test.ts`, `tests/derived-numbers.test.ts`). 1 is the coin market test below. The other 14, in five files (class page layout render, two certification exam files, a Foundry feedback round, an IdeaCAD storage file), fail identically on a tree from before this bundle on this machine and pass on CI, so they are this container, not the code.

## Not verified

- No signed-in session on production: the `/present` page, the grading packet and the connector edits were exercised on the local database and the dev harness, not against live data.
- Which posts site_call actually edited since 2026-10-18 (this container cannot read production).
- The two pre-existing CI failures named below were not caused or fixed by this bundle except where stated.

## Other findings

- `tests/db/html-manifest-team-roles.test.ts` went red when the Launcher: Design worksheet (which uses team roles) was exported to `materials/`: it held every stored manifest to the pre-0301 gate, which rightly refuses team roles. The comparison now covers the manifests stored before 0301; the newer ones are counted, not compared.
- `tests/db/coin-stocks-relaunch.test.ts` is red on main from before this bundle (all five seeded prices come out flat at 10). Untouched; it needs the coin subsystem's owner.
- The ledger's Owns names `src/lib/connector/**`; the connector lives at `src/lib/server/connector/**`, which is what was changed.

## Connector sentences

Grading: "get the grading packet for Launcher: Design in Block 2", "score everyone on the Launcher rubric and hold it", "return the held grades on Launcher: Design", "put the Launcher post in the Design category".

Presentations: "start team presentations for Launcher: Design in Block 2", "who is up for presentations in Block 2", "mark that team presented", "move them to first", "close the presentation list".
