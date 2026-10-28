# Queue 0456: team units and sign-offs

Issued 2026-10-28 from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List".
Mr. Pina's words: "go ahead and run breaks classes week items, HTML program items, and then also do 11, 12, 13, 14, 15, 16, 17, 18, 19, and 20."
This lane is items 4 to 10, 29 and 30 of that list. Lanes 0455 (tournaments, copy-forward), 0457 (grading) and 0458 (HTML program) run beside or after it.

Week context: IDEA209H Unit 4 (Launcher: Design, one shared live document per team) runs Oct 26 to Nov 16. Sign-off 2 (Design) is Nov 3 and gates metal cutting. Build week is Nov 4 to 10. Block 4 (Mr. Cosso's section, no Claude access) started two days late, Oct 28. Mr. Pina is away Oct 30 to Nov 1. IDEA100 Rotation 3 starts Oct 29 and uses team draws for IDEA-Blade. His rule (Oct 28): sign-off approval must be very manageable for him.

Report ids are the first 8 characters; the connector's list_site_feedback and list_gaps return full text.

## Item 4: sign-offs need a way in and a teacher override

- gap 87b6bd95 (Oct 28, his words): "I'm not sure how signoffs work. I'm not sure how I accept that. There's not really an interface here. I don't know where that interface would be. Is it below the assignment? But that has to be very manageable for me." Finding: a team's Request sign-off sends a push and lands in /classroom/signoffs, but nothing in the classroom navigation, the home feed or the post itself links there; the only other link is the button on /classroom/board, which is also unlinked. Needed: a "Sign-offs" entry with a waiting count in the instructor classroom nav and home feed, and on a team post's instructor page a teams panel (each team, members, who owns each role, each checkpoint's state, and any open request with its checklist and Approve / Send back right there).
- f10cfa95 (bug): Sign-off 2 cannot be approved while any one teammate has a blank individual box, and the teacher has no override. The automatic "assignment-complete" item checks every member's individual blocks (u4d-rule-test, u4d-rule-box, u4d-idea-method, u4d-idea-line, the u4d-idea-sketch picture), and Approve is refused while it fails (0304_classroom_team_signoffs.sql:262-290, 621-633). Needed: the checklist names which student is missing what, and the teacher can approve anyway with a note (the missing student's own grade still reflects it).
- cd54d2ee (bug): the "New to IDEA Classroom? Show me around" tour banner shows to the site admin on /classroom/signoffs. It should never show to staff.

## Item 5: sign-off fixes (653c3ff6, found on Launcher: Design, Oct 28)

1. Sign-off 1 cannot pass without busywork: "Every task has an owner and a due date" needs a date on every one of the 31 to 37 tasks the site seeds per team, and none come with one. Seeded tasks take their date from the post (the checkpoint date, or the day of the step that holds the box); only tasks a team adds need a typed date.
2. A team of three always reads "uneven": the student who owns two roles carries 14 points to the others' 10 and 10, so "The plan balances" fails, and nothing says why. The Team plan says how to even it out, and the balance rule allows for a team smaller than its number of roles.
3. Teams that finish early have nowhere to go: later phases (Prototype, Detail design) only appear when the whole document is re-uploaded. One post holds every phase, and the next phase opens for a team as soon as its sign-off is approved (or on its date, whichever comes first).

## Item 6: team photos (06061518, bug)

Photos in shared team boxes show only for the student who uploaded them (and in grading). Teammates cannot see each other's role sketches in Launcher: Design (frame, energy, drive, ballpath sketch boxes), yet u4d-interfaces and the Sign-off 2 item "The sketches meet at the named interfaces" require comparing them. Found Oct 26 (docs/subsystems/html-assignments.md:432). Every teammate sees every photo in a shared or role-owned box, read-only where the box is not theirs. Photos in a team's individual boxes stay as the spec decides; state what you chose and why.

## Item 7: team posts follow the newest draw (b27e9544, bug)

(1) Posting any new draw in a class silently moves every team post in that class, including Launcher: Design's documents, sign-offs and grading, to the new teams; old answers stay with the old team ids (0302:292-303). (2) If a draw comes down before a team post is graded, grading answers "That team does not exist" and students see the "Teams are drawn in class" placeholder (0223:299-307, 0305:395-409). The Post-for picker never compares its end date with any team post's due date (PeoplePanel.svelte:1809-1820; connector p_visible_until). Fix: a team post pins its draw when it opens, and a draw used by an ungraded team post cannot end without a warning. Existing team posts (Launcher: Design in three IDEA209H classes, IDEA-Blade 02 in IDEA 100 Block 1) must pin to the draw they use today with every answer kept.

## Item 8: cell locks (gap 2d621bcc)

His words (Oct 27): "multiple student users can't edit the same page at the same time, even if they're on different parts of the like same page. Like for the matrix, for example, two students can't edit two separate boxes at the same time." Finding: a table block is one lock (classroom_team_box_lock keyed by team, item, block; tools/hx-kit/kit/team.js locks the field root), so the 35-cell weighted objectives table u4d-wot locks for the whole team. Needed: cell or row locks for table blocks, the server merging each cell edit into the stored table. Also check whether separate boxes ever lock together; if so that is a separate bug to fix.

## Item 9: team names (gap 7843b71e)

Team documents show a member as the first word of the roster's "Last, First" name, so teammates read "Chavarria," and two students on one Block 2 team both show "Morales,". The team bar, "<name> is editing" and role owners use the first name, or "First L." where two teammates share a first name.

## Item 10: the teams grading page (956f6664, eb053e4e)

- 956f6664: "this page doesnt really work. doesnt make sense how i grade anything manually here. cant even see the assignment or individual work for individual parts of the assignment" (/classroom/[sectionId]/item/[itemId]/teams)
- eb053e4e (has a screenshot): "save, save and return buttons not formatted properly" (same page)
- Needed: the page shows the team's document as students see it, each block with who wrote it, individual blocks per student, the rubric beside it, and a manual score that works. Lane 0457 owns the main grading console; this page is yours.

## Item 29: team unit tools (d23bc63d, from running Unit 4)

1. A teacher dashboard on each team post, one screen per class: every team, who owns each role, how far each role is (boxes filled per step), who checked in today, Blocked tasks, and sign-off requests with Approve right there (this is the panel item 4 asks for; build it once).
2. Class-specific dates on one shared post: one post serves three sections, but Block 4 started two days late. The plan strip and "today" marks follow each section's own start date instead of a "your class started late" table students read.
3. Machine booking for build week: each team's machine plan (machine, part, who, day) becomes a booking on a shared machine calendar, clashes flagged, the teacher sees the whole week.
4. Team box history for students: a box's last few versions, and put one back (today only the teacher can read the change log).
5. A "what my team does today" card on the class home for each student (the report text continues past this point; read it in full with list_site_feedback).

## Item 30: names targeting a classmate (3d4d8b76)

During Oct 28 grading, team names, taglines and a team theme mocking a named student in another class went live with nothing flagging them. Team names, taglines, tournament entries and market listings are checked against the rosters on save, and a match to another student's name is held for his OK before it shows. Rotation 3 team names start Oct 29. (Tournament entry text lives in lane 0455's files; add only the shared check and call it from team text here, and leave a one-line note in your report for the tournament and market call sites.)
