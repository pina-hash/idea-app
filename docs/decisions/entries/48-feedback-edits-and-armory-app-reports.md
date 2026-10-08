# 48 Admins can correct a filed report, and the Windows app's reports get their own two tabs

- Raised: 2026-10-07  By: feedback round 2026-10-07 (ledger 0368), report R13, and Armory website requests v0.3 items 4 and 4b.
- Status: DECIDED 2026-10-07 by default (straight to main at Mr. Pina's instruction); a correction is one line.
- Decision:
  - **Editing a report** is a site admin's act. Kind, message and "what you tried" can be corrected; route, app, build, viewport, screenshot and who filed it are captured facts and stay as filed. Every edit is a numbered revision in `app_feedback_edits`; the reporter's original stays and is one tap away, and every export carries both. The append-only rule holds: nothing the reporter sent is overwritten.
  - **The Armory app's notes and incidents** are their own two tables (`armory_app_feedback`, `armory_app_incidents`), exactly as v0.3 specifies, shown as two tabs on `/admin/feedback`. CLAUDE.md's "`app_feedback` is the ONE queue" now reads "for every website surface".
  - **Incidents are deleted after 90 days**, on each new incident submit (no scheduled job exists). This is the one named exception to "Archive, never delete". Notes are kept like site feedback.
  - **Statuses** are the site queue's four: New, Seen, Resolved, Spam.
  - **An incident kind is checked for shape, not against a closed list**, so a kind a later app release adds still lands.
- Why it is his: it relaxes the append-only shape of a student-record table and adds a deletion.
- Context: migration 0233 parts `armory-reports` and `feedback-edits`; `docs/ARMORY.md` "The v0.3 server contract".
