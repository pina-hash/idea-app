# Queue 0458: HTML assignment program, site side

Issued 2026-10-28 from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List".
Mr. Pina's words: "go ahead and run breaks classes week items, HTML program items, and then also do 11, 12, 13, 14, 15, 16, 17, 18, 19, and 20."
This lane is items 22 to 28 and item 3 of that list, plus the upload-time halves of 17 and 19. It starts after lanes 0455 and 0456 land, because it shares the item page, the importer and the export with them.

Umbrella report 038e0599 (Oct 28): "TOP PRIORITY: HTML assignments at their full potential, as soon as possible (Mr. Pina: 'put that in big time')." The kit, the standard and the research are owned by the HTML standards chat, https://claude.ai/code/session_01AhbdScnRCcFy5idt3AfdXy. State on Oct 28: standard 2.14, kit on the live classroom's parts, per-theme named colors, zoom and phone checks, sources in assignment-sources/ (FRC 2026/27 and IDEA100 Rotation 2 sources landed Oct 28). Read docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md, IDEA_HTML_ASSIGNMENT_SPEC.md and tools/hx-kit/ before building. Kit edits stay minimal and are announced in your history entry, because that chat edits the kit too.

Report ids are the first 8 characters; the connector's list_site_feedback returns full text.

## Item 22: store the source and rebuild on the current kit (013c83d0)

Upload and replace accept the .src.html beside the built file and store it with the item (the export writes it to assignment-sources/<course>/<slug>.src.html). A staff "Rebuild on the current kit" button runs tools/hx-kit/build.mjs on the stored source and opens the existing replace screen (blocks kept, removed, added) before anything changes. Answers stay safe because the replace screen refuses to drop an answered block. Sources already in assignment-sources/ attach to their live posts.

## Item 23: kit-health list (3bf69806)

Staff page listing every HTML post in every class: kit version it was built on (the built page's hx-kit-css comment; hand-built pages have none), whether its source is stored, its last automatic test result (FAIL and WARN counts), and a Rebuild key where the kit is older than main. Sorted oldest kit first.

## Item 24: CI retests every assignment (23b3776c)

On any push touching tools/hx-kit/ or assignment-sources/, build each assignment-sources/**/*.src.html and run tools/hx-kit/test.mjs on it; write a table (page, FAIL, WARN, failing checks) to the job summary. Needs Chromium in CI (tools/browser-verify/browser.mjs finds it wherever Playwright installed it). On Oct 27 a one-line kit change moved a live page 14px and only a manual rerun caught it.

## Item 25: one header and one progress rail (4930ba0e)

The item page draws its title bar and Progress.svelte rail, and a kit document draws its own title bar and step track under them, so students see the title twice and two progress bars counting differently. The document reports its steps over the bridge (idea:steps: titles, done, current, phase color); the portal rail draws those steps (clickable, sends idea:go-step back) and the kit hides its own track and title when the portal says it took over. A document that reports nothing keeps today's behavior.

## Item 26: "any one of these" groups (3d205727)

The kit (standard 2.11) lets a step ask for any one of several boxes (data-any-one), but the manifest only marks each box optional, so the rail, completion and grading count the group as nothing owed. An anyOf group in the manifest, validated by the importer (every member optional, at least two), counted as one requirement met by any member, shown in Answers as one row.

## Item 27: replace safety and re-export (aa9ce822, gap cdb5eb34)

- aa9ce822: a replace can silently undo newer edits. The repo export of IDEA-Blade 01 was older than the live page, so a rebuild from it would have erased the Oct 26 edits. The replace refuses when the post changed since the copy it was built from, and the connector gets a "read the live HTML" action that works on drafts too (drafts cannot be downloaded today).
- gap cdb5eb34: replacing an HTML assignment does not re-export it to the repo (Launcher: Design was at revision 4 on the site while materials/ held revision 3). Every document replace re-exports, or the post shows its export is stale.

## Item 28: kit parts and small pieces

- 88ad281b (bug): optional steps count toward progress (Rotation 2 Survey shows "0 of 10 done" with 5 required). Progress counts required steps only; the kit test skips intentionally optional steps.
- 6c5c7cc8: allow a 0-point module for optional "go deeper" material (today every module needs a scored criterion).
- 569a1891: allow an ungraded HTML post, 0 points and no due date (FRC library pages went up as 3-point posts as a workaround; create_post refuses 0 points too).
- 123aad84: a dropdown part in the kit (picking one of 24 activities took three steps of buttons).
- b63b8966: the kit build fetches each video's real YouTube frame for its thumbnail (his rule: thumbnails are real frames, never made-up title cards).
- f6ae4be7: the class Videos button also lists videos embedded in HTML assignments.
- f8c1b1d8, kit half: the kit's class strip draws its days from the calendar pacing the site already sends, instead of typed dates.

## Upload-time halves of 17 and 19

- ccecb3b9: on upload and replace, if the post's points are unset or differ from the manifest's points total, the replace screen says so and offers "Set points to <total>" or keep; the grading console shows the mismatch until resolved (lane 0457 owns scaling in grading).
- c9d7efc3: the importer flags any rubric line whose requirement is not visible in its step without opening a disclosure, and flags the same evidence scored on two posts.

## Item 3: IDEA100 posts before copy-forward (f2ba055d)

IDEA-Blade 01 - Design is still a hand-built page, not on the kit, and fails 13 kit checks (no Take photo button on phones for its 8 photo boxes, 10 boxes a student cannot fill, 4.4 screens of scrolling). Run the kit test on every IDEA100 post (Dogtag, Solidworks Day, Hook 01 to 03, IDEA-Blade 01 and 02, Rotation 2 Survey) and record the results on the kit-health list. Rebuilding a page's content is authoring work for its course chat; do not rewrite student-facing content here. Report the failures in your history entry.

## Added 2026-10-28 11:01 by Mr. Pina (fold-in)

Kit ownership: tools/hx-kit/ belongs to the HTML standards chat (https://claude.ai/code/session_01AhbdScnRCcFy5idt3AfdXy). This lane may edit tools/hx-kit/kit/bridge.js and tools/hx-kit/kit/kit.js ONLY for the bridge halves of item 25 (idea:steps and idea:go-step) and f8c1b1d8 (the plan strip's days from the calendar pacing the site sends). Rebase on main first, run `node tools/hx-kit/test.mjs tools/hx-kit/starter.html` to 0 FAIL, and say in the ledger entry what changed there. Nothing else in tools/hx-kit. That replaces every earlier line in this file allowing kit edits: b63b8966 (real YouTube frames in the kit build) is the HTML standards chat's, not this lane's.

Already done in the kit (standard 2.16 on main), so build only the site half:
- 123aad84 dropdown: built in the kit (a select with data-field); marked resolved on the feedback list. Nothing to build.
- 88ad281b: the kit counts required steps only and its test skips data-optional steps. Still owed: Progress.svelte counting required steps only.
- 3d205727 anyOf: the kit's data-any-one is done. Still owed: the manifest group, the importer, Progress and Answers.
- 23b3776c CI retest: test.mjs now also draws the thumbnail in every slot and runs a team pass, and still needs Chromium only (tools/browser-verify/browser.mjs finds it).

Item 23 (kit-health list): since standard 2.16 every built page carries `<meta name="hx-kit" content="<sha> <date>">` and `<meta name="hx-standard" content="2.16">`. Read those tags; do not parse the CSS comment. Pages without them are pre-2.16 or hand-built.

569a1891 (ungraded HTML post): the kit already has `<html data-graded="no">`, which turns "counts toward your grade" into "not graded". The site half is 0 points, no due date, and no grade row.

New items:
- 84cf8690 (bug): every one of 16 FRC 2026/27 replaces on Oct 28 reported "revision 1", with nothing pointing back to the earlier document, while Launcher: Design reported revisions 2, 3 and 4 on Oct 26. Check whether a replace on a post first created from a non-HTML post, or created and replaced in one session, restarts the count or overwrites the earlier revision. Every replace keeps the earlier document as a numbered revision a teacher can read and roll back to.
- 3147afb1: "Replace with an HTML assignment" on any post keeps its id, its place in the unit order, its classes, its files and its due date, and opens the normal upload and replace screen (today: new draft, copy files by hand, file it, drag it from the bottom, publish, hide the old one, class by class for a shared post). Also: a new post lands where the teacher filed it in the unit's order, not at the bottom.
- f3a3a687: the thumbnail shell (thumbnailDocument in src/lib/classroom/html-assignment/thumbnail.ts) carries no fonts and no color tokens. Inline Rajdhani and Share Tech Mono (font-src data: is already allowed) and the kit's tokens for the current theme, so a template uses var(--accent) and the site's faces. The upload or replace screen previews the thumbnail in all four slots (48px and 34px tiles, the 56px banner, the 16:9 card) in both themes and warns on text under 11px (the check tools/hx-kit/test.mjs runs since 2.16; the kit's own starter failed it at 6.7px).
- 0a569932 with gap 02743baf: report_gap merges separate gaps that share the same said (three of four Unit 4 gaps were lost on Oct 28). Dedupe on request_id, never on said. replace_html_assignment returns a SHA-256 of the stored document, and the connector can read back a post's stored document (or at least size, SHA-256 and last replaced), drafts included. This is part of item 27.
- 4d0ddefe: a staged upload lives until it is confirmed or discarded, or 24 hours; a confirm token lives 30 minutes (today 30 and 10, so an upload waiting on his yes expires; the FRC chat uploaded five part models twice).
- gap b4c9ae73: files listed in get_post, and a copy-files action (post to post, every file or the ones named) that asks once.
- gap 154c8fb3: a read that lists a course's units with their ids, and get_post and grading_packet showing which unit a post is filed under (classroom_set_item_unit needs a unit id no tool returns).
- fb08d358: (1) a CI check or commit-msg hook refusing a first line over about 90 characters or one carrying " - " joined clauses, and src/lib/site-versions.ts splitting such subjects into a title and bullets for commits already landed (two Oct 28 commits show as one long title); (2) a test holding every docs/prompt-ledger/entries number to one file, the way apply-migration-claimants holds migration numbers (0453 was taken twice on Oct 28).

## Note 2026-10-28 14:15
Lane 0456 owns the assignment frame's camera permission (src/lib/hx/ and the item page) for one fix, ed0b584e (Take photo opens a black camera on a phone). Rebase on it before touching the frame.
