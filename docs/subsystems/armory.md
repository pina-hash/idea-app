# IDEA Armory

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Immutable history and purge, and the website side: views, people, presence, force check in, the mirror. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

**IDEA ARMORY'S HISTORY IS IMMUTABLE, AND THE ONE WAY THROUGH IS A PURGE RUN AS
THE TABLES' OWNER (0233, v0.3).** Versions, side versions and their release rows
refuse every UPDATE and DELETE (`armory_refuse_version_mutation`). Delete forever
(`armory_purge_project`, archived first and the name typed exactly, site admin;
`armory_purge_folder`, removed files only, site admin or mentor) gets through
only because the trigger passes a DELETE when the row's file carries
`purging_at` AND the deleting role is a member of the table's owner.
  - **THE OWNER TEST IS THE HALF THAT MATTERS.** `service_role` holds DELETE on
    those tables and UPDATE on `armory_files` by the hosted default privileges,
    so a marker alone is a door any server with the key could open, and a custom
    setting was refused because any role can set one. 0233's self-check refuses
    to apply where the purge function's owner is not a member of their owner.
    **TRUNCATE never fires a row trigger**, so it is the one statement past the
    trigger with no marker and no owner test; 0233 revokes it on the three
    history tables from `service_role` (no client role ever held it), and its
    self-check refuses an apply that leaves it there.
  - **EVERY ARMORY WRITER TAKES ITS PROJECT ROW FIRST.** Folder operations and
    purges hold `armory_projects` FOR UPDATE; every per-file writer takes it FOR
    KEY SHARE before any other row lock. The other way round (the file first,
    the project later through the change feed's foreign key) a folder rename
    crossing a check out measured 40P01. A new Armory write that touches a file
    keeps this order or brings the deadlock back.
  - **STORED CONTENT IS SHARED, SO A PURGE QUEUES BYTES AND NEVER DELETES
    THEM.** A file's bytes are keyed by their hash, so one object can back files
    in several projects. A purge queues, in `armory_orphaned_blobs`, only hashes
    no surviving version names; the website removes them with a DELETE and then
    a HEAD and marks a hash swept only on a 404, and `armory_orphans_pending`
    re-checks first, keeping any hash a version names again.
  - **A PURGED PROJECT LEAVES A RECEIPT, NOT A FEED ROW**: the feed's project key
    and member policy die with the project. `armory_project_purged` answers from
    `armory_purged_projects`, which keeps no member address.
  - **ARMORY REFUSES BY RAISING A SQLSTATE WITH A JSON DETAIL**, never an
    `{ok:false}` return, because the Windows app reads it that way; never
    `54000`, which PostgREST answers with HTTP 500. Too large is 22023, a rate
    limit `PT429`.
  - **`armory_my_projects` IS MEMBERSHIP-ONLY**: it is what a computer syncs. A
    site admin's wider READ is `armory_can_view`, behind the ten member-read
    policies and the website's read functions, each keeping its own refusal. A
    site admin's wider WRITES (Force check in, archive, Delete forever, adding
    and removing people with a mentor's reach) leave every member's answer
    byte-identical, which the 0.2.x corpus in `tests/db/armory-v3.test.ts`
    holds.
  - **`armory_people_search` IS A DIRECTORY, SO A ROLE ALONE DOES NOT OPEN IT.**
    It names every school account by its shown name, and a mentor can grant
    mentor to a student address, so it admits a site admin or a mentor whose own
    address is a teacher's (`role_for_email`); everyone else adds by email.

### IDEA ARMORY ON THE WEBSITE -- one view at a time, people linked to accounts, rows before objects

**THE PROJECT PAGE IS A HEADER AND ONE VIEW (round of 2026-10-07, Mr. Pina's
"it scrolls on for way too long").** `ArmoryProjectView` is the header
(notices, the live line, recessed readouts) and the tab strip Files | Checked
out | Team | Activity | Project; `$lib/armory/nav.ts` is the router.
- **THE VIEW LIVES IN `?view=` AND THE COMPONENT READS IT.** The route reads
  `page.url` and hands `view` down; the project load reads no url, so a tab
  reruns nothing. Only the view goes in the address: the Checked out view's
  holder filter is component state, because a reload would carry a student's
  school address into the request logs.
- **ONE NAME MAP, `teamNames`**, for every name on the page; the team's names
  come from `armory_team_status`, which links the address to the site account
  at read time (display name, else full name, never both; the Google photo
  withheld behind a chosen avatar). A big project's folders arrive closed
  (`$lib/Disclosure`, latched past 40 live files).
- **THE PEOPLE SEARCH IS OFFERED BY ONE PREDICATE, `peopleSearchOffered`**
  in `$lib/armory/team.ts`, which mirrors the database's gate (the "IS A
  DIRECTORY" rule in the Armory history paragraph above), so nobody is offered
  a search whose only answer is a refusal, and it also says why the paste box
  is the way in. It runs from the input handler with a debounce and a request
  counter, never from an `$effect`. A site admin manages people on any project
  as a mentor would once 0233 is in (`memberManagerRole`).
- **AN ADD IS NEVER A ROLE CHANGE.** `armory_add_member` (0231) overwrites an
  existing member's role and answers true, so a batch added "As Student" would
  demote a mentor in it and call that "Added". `addPeople`, the one loop under
  the picker and the paste box, never sends somebody `members` already holds
  (it lists them in `otherRole`, with their role, in words), and the picker
  never trays a row marked "Already a ...". A role moves only on the member's
  own row: staged in its select and written by its "Change to" key, for the
  reason the classroom teams' Move to is a worded button.
- **A REFUSAL IS READ FROM ITS SQLSTATE AND `DETAIL.reason`, NEVER ITS HTTP
  STATUS**: PostgREST answers 23505 as 409 and 55000, 55006 and P0002 as 500,
  which say nothing about what happened (`purgeRefusalWords`,
  `memberErrorWords`). 0231's own P0001 and 42501 texts are read by the
  Windows app too, so those stay matched as text.
- **PRESENCE NEVER SAYS OFFLINE** (`devicePresence` in `$lib/armory/team.ts`):
  "Armory open" inside `ARMORY_ONLINE_MS`, "Last heard from <time>" after, "No
  status" with no heartbeat. The heartbeat writes no change-feed row, so the
  Team view ages its own clock and re-reads through `startPoller` while open.
- **FORCE CHECK IN** (`VERBS.takeBack`, renamed from "Take back") is
  `armory_break_lock` for a mentor, a CAD lead, an instructor or a site admin;
  the site sends `p_device: null` only when `v033Ready` (the summaries rung)
  says 0233 is in. **WHO MAY TAKE BACK IS ONE SQL FUNCTION,
  `armory_can_take_back` (0236)**: `armory_my_projects`' `can_take_back`,
  `armory_break_lock` (so `armory_break_locks`), `armory_remove_empty_file` and
  the lead path of `armory_move_file` and `armory_rename_folder` all ask it,
  and so does the project page (`canTakeBack`, null before 0236). A role list
  written anywhere else is the second copy. Because an instructor holds it,
  only a mentor makes or changes an instructor.
- **A COMPUTER IS ITS TOKEN WHEN IT HAS ONE, AND ITS NAME ONLY WHEN IT DOES NOT
  (ledger 0441, migration 0310).** Every sign-in registers a device of its own,
  so one lab computer five people use is five devices with one name. Armory
  0.5.1 sends its per-computer hash with each heartbeat
  (`armory_devices.computer_key`, written by the additive four-argument
  `armory_heartbeat` and `armory_register_device`; the 0233 and 0231 forms are
  thin wrappers), and `armory_team_status` hands each project an opaque
  12-character `computer` token per device (an md5 of the project id and the
  key), never the key, so nothing links a computer across projects.
  `computerKey` in `$lib/armory/team.ts` is the one statement of the grouping:
  the token, else the name, never a keyed and a keyless device together.
  `presenceDevices` (one member's lines), `teamComputers` (the Team view's
  Computers list, everyone on each computer, most recent first) and
  `labelProjectDevices` (the Files and Checked out labels) all go through it.
  **TWO COMPUTERS WITH ONE NAME ARE STILL LABELED, NEVER MERGED**: a keyed
  computer is "NAME (abcd)" from its token wherever two computers in a project
  share a name, and a keyless device keeps the start of its device id, the
  label the app writes.
- **DELETE FOREVER IS ROWS, THEN THE QUEUE, THEN OBJECTS** (`POST
  /api/armory/purge`, `handlePurge`): the RPC runs on the caller's client, `ok`
  is true the moment it returns, and the sweep (`sweepArmoryOrphans`) deletes
  only the hashes the queue hands over (what is queued, and when a hash counts
  as swept, is the "STORED CONTENT IS SHARED" rule above). One residual race is
  known: an app whose HEAD saw the object between the re-check and the DELETE
  could skip its upload. Every storage request is cut short at the sweep's
  deadline (`ARMORY_SWEEP_BUDGET`), and an answer that never arrived is said as
  `PURGE_ANSWER_LOST`, never as "nothing was deleted", because the rows go
  first. The type-the-name key is one predicate (`purgeCanSend`, NFC and
  trimmed, as the RPC compares), `aria-disabled` and never `disabled`, and the
  acknowledgement is shown on `/armory` through `page.state`.
- **A PROJECT IS ON ONE SOLIDWORKS VERSION, CHOSEN AT CREATION AND ONLY EVER
  MOVED UP (ledger 0404, 0273, decision 41 item 7).** The pin is what
  `armory_check_release` refuses a newer save against, so lowering it would
  strand every file saved in the newer release; there is no way down, and the
  Project tab says why. Create offers 2025 (the 0231 default) or 2026 and names
  `p_release` ONLY for a release that is not the default, so a 2025 project
  goes through the deployed three-argument `armory_create_project`, which the
  Windows app calls too; the four-argument form is its additive pair (no
  defaults on either). `armory_raise_pinned_release` admits a mentor or a site
  admin (the 0233 shape), two presses with the cost said before the second.
  `_armory_release_ceiling()` (the Los Angeles year plus one) is the one
  statement of the newest release, and `newestRelease` in
  `$lib/armory/solidworks-version.ts` mirrors it to choose what is offered.
- **THE NIGHTLY SHARED DRIVE MIRROR IS A COPY, AND IT NEVER DELETES (ledger
  0404, decision 41 item 2).** `.github/workflows/armory-drive-mirror.yml` runs
  `tools/armory-drive-mirror.mjs` at 11:07 UTC; `tools/armory-drive-mirror-plan.mjs`
  is every decision (copy what is missing, skip a matching hash, update in place,
  move a file Armory no longer has to `_removed/<its path>`), over injected
  adapters, so the tests drive it with a fake store and a fake Drive. It reads
  Drive to know what is there and remembers nothing else, so a second run copies
  nothing and a run cut off is finished by the next. It reads the bucket by the
  website's own key rule (`contentObjectKey`, in `object-key.ts` so plain Node
  can load it) and checks every download against its hash before uploading.
  Unset secrets are a GREEN "not set up" summary, not a red run.

---
