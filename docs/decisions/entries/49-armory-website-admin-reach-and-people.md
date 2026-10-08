# 49 IDEA Armory on the website: admin reach, people from site accounts, and the project page in views

- Raised: 2026-10-07  By: feedback round 2026-10-07 (ledger 0368), reports R16, R17, R18, and Armory website requests v0.3 items 2, 3 and 5.
- Status: DECIDED 2026-10-07 by default (straight to main at Mr. Pina's instruction); a correction is one line.
- Decision:
  - **A site admin can open every Armory project on the website**, Force check in any file, archive a project, add and remove members, and Delete forever an archived project (type-the-name confirm). `armory_my_projects` stays membership-only, so an admin's own computer never starts syncing projects they are not on.
  - **People search** finds signed-in school accounts by the name they show and the first part of their school address, never by a full name a chosen display name replaced. It is offered to site admins and to a project's teacher mentors; everyone else adds by email, which also covers someone with no account yet.
  - **The website's "Take back" is now "Force check in"**, the word v0.3 uses.
  - **The project page is a header with readouts and five views** (Files, Checked out, Team, Activity, Project) instead of one long page; it opens on Files. The Feedback control is docked into the Armory header.
  - **Team status** is shown to project members: each person's computers say "Armory open" or "Last heard from", never "offline".
  - **Storage is cleaned only of bytes nothing else names**: files are stored once by content across all projects, so a purge queues only hashes no surviving version uses, and the website deletes those after the purge commits.
- Why it is his: it widens who can read every team's files and who can find student accounts.
- Context: migration 0233 part `armory-core`; `docs/ARMORY.md`; decision 41 (armory-file-vault-scope) item 3.
