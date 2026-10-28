# Queue 0463: IDEA 100 class Armory projects

Issued 2026-10-28 11:56 PT by Mr. Pina, relayed from the IDEA100-3 chat, to the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List". Needed by 8:00 a.m. 2026-10-29 if possible (IDEA100 Rotation 3, Section 3, starts that day).

His words, in full:

1. Link an Armory project to a class: "Link to a class" on a project. Members follow that section's active roster: students as Student, the section teacher as Instructor. A student who leaves loses access and their files stay. One confirmation for the whole roster. Never demote an existing member (armory.md, "An add is never a role change").

2. Personal folders: on joining a linked project, each student gets a top-level folder named Last_First from the roster, with spaces and punctuation removed ("Vanden Dries, Emma Maria" becomes VandenDries_Emma). A name clash adds the middle initial. Only that student creates or checks in files there; everyone in the project can read it; mentors, instructors and admins keep Force check in. Empty folders become real: created, listed and synced in the Windows app and on the site before any file is in them.

3. Team folders: "Make team folders from class teams" makes Teams/<team name>/ from the class's teams. Only that team writes there; everyone in the project reads. Re-running after a team change updates who can write, and never moves or deletes a file.

4. Connector: link, unlink, make personal folders, make team folders, and list folders with who can write, all reachable through the IDEA Website connector.

5. Bug: classroom_import_roster refused all 21 rows with course_not_found when each row named the class by id (IDEA 100 Section 3, 2026-10-28). Make it accept the class id or name, like add_student does.

Done when: linking IDEA 100 Section 3 adds all 21 students in one confirmation; each student sees their own empty folder in Armory on a lab computer; a student cannot check a file into a classmate's folder; a team folder is writable by its team only. Every check is shown on the live site and in the Windows app.

Standing Armory facts (his, from project memory): on every IDEA lab computer students share one Windows sign-in named "IDEA"; several people on one computer must be thoughtless and automatic (setting up a new person and switching needs no manual folder setup); two people on one computer on one project share one project folder, never downloaded twice; Armory updates carry existing files and folders forward; file icons support every file type the lab uses; no code signing while Armory is internal.

Release path: the Windows app ships through a GitHub release on pina-hash/idea-armory (README "Publishing a release"); the Agent release workflow builds about 40 minutes, then running Armory apps update within four hours and run the new version on next open. Whether this lane publishes that release itself is Mr. Pina's call; until he says yes, prepare it (version bumped, release notes in docs/agent/release-notes/) and stop short of creating the release.
