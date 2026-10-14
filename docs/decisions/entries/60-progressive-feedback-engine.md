# 60 Progressive feedback: notes on work in progress, in place and in one list

- Raised: 2026-10-08  By: Mr. Pina, report 6b814ca1 (long-term idea): "an engine ... to provide progressive feedback for assignments. When a student is working on an assignment an instructor can pull it up and provide live feedback ... embedding itself within the HTML assignments themselves. Even including things like image notes ... drawing tools to draw on an image with a few different colors ... Not only should it be live but it's supposed to be a grading feature."
- Status: DECIDED 2026-10-14 by Mr. Pina's answers in the building session (ledger 0381); built in migration 0238 and `src/lib/classroom/feedback/`.
- Decision, placement: In place AND in a list. A note shows as a worded pin beside the answer it is about inside the worksheet (where the worksheet reports where its answers sit) and in a list beside the worksheet, which always holds every note.
- Decision, the conversation: Back and forth (either side replies), a "Fixed it" button for the student (which the student can take back), Resolve and Reopen for the instructor, and "seen" receipts both ways.
- Decision, one place: An instructor manages every note from one page, `/classroom/student-feedback`: views for what needs them, what students say is fixed, what is waiting on a student, resolved and all, filtered by class and assignment and searchable.
- Decision, scope: Ported HTML worksheets first. A spec assignment, a notebook entry and a plain hand-in get none yet.
- Decision, drawings: Pen, arrow, box, circle and label, in six colours and three widths, drawn on the student's own handed-in picture and kept as shapes rather than pixels, so they land in the same place at every size.
- Defaults chosen in the session (each one line to change): a student may send up to sixty messages an hour; a resolved note's drawing comes off the picture and stays in its thread; a student with no notes sees no feedback section at all; a field whose notes are all resolved has no pin.
- Context: CLAUDE.md "PROGRESSIVE FEEDBACK"; `docs/history/clever-feynman-tl6bst.md`.
