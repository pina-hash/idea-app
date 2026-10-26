# Ledger 0437: Armory shared lab computers and file icons

Gathered by the IDEA & FRC chat on 2026-10-26. A session needs nothing outside this file, `docs/ARMORY.md` ("Several people on one computer: what the next update must do") and the two trees.

## Mr. Pina's words, 2026-10-26

> "On each student computer, students share one "IDEA" windows sign in. Make sure to also make considerations for existing armory files and folders upon updating to this new version. lets go ahead and start the armory update. and file icons must support all the types of files we use"

So:
1. **The open question in `docs/ARMORY.md` is answered:** every IDEA lab computer uses one shared Windows sign-in named "IDEA". That is the case to build and prove. Fast User Switching (one Windows account per person) must not break or lose work, but it is the secondary case: if a full build of it costs much, keep it working at today's level, make it safe, and record what is left.
2. **Existing Armory files and folders.** Lab computers today run 0.3.2, 0.3.3, 0.4.x. The update must carry every one of them forward with nothing lost, nothing sent as the wrong person, and no second download. See "Carrying existing computers forward" below.
3. **File icons for every type the lab uses**, see below.

## Already decided (from docs/ARMORY.md, Mr. Pina 2026-10-25)

- No setup step: a computer becomes shared the first time a second person signs in. No PIN by default; a mentor may turn PINs on for a computer.
- Switching is one click or none: the window opens on the faces of people who have used this computer, most recent first.
- One folder per project per computer, never one per person. Remove "a folder of your own" (`C:\IDEA\Armory-<name>`) from the picker and the rules.
- Waiting work stays with its person, inside the same folder: a file checked out by someone else is read-only for the next person; their unsent saves are sent under their own sign-in, never as someone else.
- A switch never closes or moves a document SolidWorks has open.
- No server migration expected. If one computer must read as one device on the website, that is a server change that comes back to him first; do not make it.

## Carrying existing computers forward

Audit every state a lab computer can be in today and handle each on first start of the new version, automatically, with no question to the student:
- A computer with one person in `C:\IDEA\Armory` (the common case).
- 0.3.3+ shared-computer profiles turned on, with a PIN, several people signed in.
- One or more `C:\IDEA\Armory-<name>` folders of their own, with or without waiting work (checkouts, unsent saves, local edits). These fold into the one shared folder: identical content (same hash) is simply removed from the extra folder once it is safely in the shared one; a file whose content differs is never overwritten or deleted, it keeps its owner's waiting work and is sent under that owner's sign-in, or kept side by side and surfaced plainly when two edits genuinely conflict. Nothing is deleted until its bytes are proven present elsewhere.
- A folder state document bound to a person and device (the Phase A identity binding in `docs/agent/ENGINE.md`) moving to the computer-bound shape with per-file owners.
- A stored PIN from shared mode: keep it as the computer's PIN-on setting only if a mentor set it deliberately; otherwise a student-chosen PIN must not start blocking switches. Decide from the tree what is knowable and record the reasoning.
- An interrupted first start (power off mid-fold): the next start resumes, never half-applies twice.
- Downgrade or reinstall of the old version after this one ran: say plainly what happens; it must not destroy work.
Write the fold as a tested, idempotent step with a log line per action, and a one-screen summary the next person sees ("Moved 3 projects into C:\IDEA\Armory, kept 2 saves waiting for Maria"), with no student name in the repo.

## File icons for every type

Today `ShellThumbnails` asks Windows for a real thumbnail only and the window keeps "its own glyph" otherwise. He wants every file type the lab uses to show a proper icon (and a thumbnail where one can be made). Types the lab is known to use, at minimum: SolidWorks part, assembly, drawing, drawing template, library feature, block (`.sldprt .sldasm .slddrw .slddrt .sldlfp .sldblk`), eDrawings (`.eprt .easm .edrw`), neutral CAD (`.step .stp .iges .igs .x_t .x_b`), mesh and print (`.stl .3mf .obj .gcode .bgcode`), laser and 2D (`.dxf .dwg .svg .ai .lbrn .lbrn2 .xcs`), documents (`.pdf .docx .xlsx .pptx .txt .md .csv`), images (`.png .jpg .jpeg .gif .bmp .webp`), video (`.mp4 .mov`), archives (`.zip`), and a clear generic icon for anything else. Census the types actually present from everything the tree can see (test fixtures, telemetry samples, server schema, docs) and add any missing. Icons are drawn in the Armory look (`tools/agent-icon/`), legible at row size and at 192, with a test that every listed extension maps to an icon and an unknown one to the generic. A thumbnail Windows can make still wins over the icon.

## Owed to the lab before it ships (record, do not claim)

One person leaves a file checked out and a second opens the same assembly; two people on one project with nothing checked out (no download starts); a switch while SolidWorks has a part open; a computer with an existing `Armory-<name>` folder updating in place; Fast User Switching between two Windows accounts.
