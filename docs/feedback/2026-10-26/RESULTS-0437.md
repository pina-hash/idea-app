# Results 0437: IDEA Armory 0.5.0

Built, not published. Publishing is yours (steps at the bottom).

- idea-armory: `e761c89` on main
- idea-app (these docs only): the commit that carries this file, on main
- No migration, no website change.

## What the audit found already built, and what was built

Already there and kept: a sign-in per person on a shared computer, the sign-in moving rather than being copied, the old person's sync stopping for good before the next one starts, check outs sealed read-only, devices per sign-in, each save recording who made it, Windows thumbnails, the window's icon set.

Built in 0.5.0:

1. **No setup.** The computer becomes shared the moment a second person signs in. The "This computer is shared" switch is gone.
2. **One click to switch, no PIN.** PINs stay on only on a computer where a mentor turned them on.
3. **One folder per project per computer.** `C:\IDEA\Armory-<name>` folders are never made again.
4. **Waiting work stays its owner's.** A check out or an unsent save is held in place, read-only for the next person, and Home says whose it is. It is sent only when its owner picks their name again, under their own sign-in.
5. **Files open in SolidWorks are not touched** by a switch or by the folder move.
6. **Icons for every lab file type**, and a real Windows preview still wins.
7. **Robotics work is safe from freshmen** (your report of Oct 25). See the next section.
8. **A second Windows account** gets a plain message and Armory starts by itself once the other one quits.

## Robotics work and freshmen on the same computer

The audit found half of this already true and built the other half.

Already true, and proved by test: a freshman signed in on a robotics computer never sees the robotics project in Armory, Armory never sends anything of theirs in it (the server would refuse them anyway), and every robotics file is read-only for them from the moment they pick their name, so SolidWorks refuses their save. If they clear the read-only box by hand, Armory sets it again on its next pass.

The gap, now fixed: a freshman who cleared the read-only box and saved anyway left their bytes on disk. When a robotics student came back, Armory would have held that file "for the freshman" (blocking the robotics student from it) or, for a file that was the robotics student's own waiting work, sent the freshman's bytes as the robotics student's save. Now:

- A change or new file someone makes in a project they're not in is nobody's: never sent, never held for them, never the next person's.
- When a member is back, those bytes move to `C:\IDEA\Armory\.armory\recovery` (moved, never deleted) and the team's version comes back.
- A member's waiting work that anyone else wrote over comes back as the member's own save, and the other person's copy goes to the same recovery folder.
- A file still open in SolidWorks waits, untouched and read-only, until it is closed.

Proof: three end-to-end tests against a real database (`ProjectSafetyTests`): a freshman's save over a robotics part, over a robotics student's checked-out work, and a new part they add there change nothing the robotics student owns, and nothing of the freshman's is on the server afterward. Each of the four new guards was broken on purpose and the tests went red; the file was restored byte for byte.

Not covered: a freshman who copies robotics files out of the folder can still read them (Windows can't stop that under one shared sign-in), and someone who deletes and re-saves files while the robotics student is signed in acts as that student.

## How each computer state is carried forward

| The computer today | What 0.5.0 does |
| --- | --- |
| One student, 0.3.x or 0.4.x | Nothing changes until someone else signs in, then it becomes shared by itself |
| Shared, PINs on by default | PINs turn off |
| Shared, PINs a mentor turned on | PINs stay on |
| Shared mode was being turned on or off when it crashed | Finishes what it was doing, from what is on disk |
| Has `C:\IDEA\Armory-<name>` folders | Folded into `C:\IDEA\Armory` at first start: identical copies removed, the rest moved in, waiting work held for its owner, anything replaced kept in `C:\IDEA\Armory\.armory\folded\` |
| A file in one of those folders is open in SolidWorks | That file stays put and moves at a later start |
| Power cut in the middle of the move | The next start finishes it |
| Folder was taken over in 0.3.2 | Used as the shared folder as is |
| Shared mode was turned off while a student used their own folder | Pointed back at `C:\IDEA\Armory` and folded |

Nothing downloads again. Nothing is deleted unless the same bytes are already in the shared folder. If two copies both have work, both are kept and Home says where.

## File icons (22)

Part, Assembly, Drawing, Drawing template, Library feature, Block, eDrawings, CAD exchange (STEP, IGES, Parasolid), Mesh (STL, 3MF, OBJ), Print file (G-code), Drawing for cutting (DXF, DWG, SVG, AI), Laser job (LightBurn, xTool), PDF, Document, Spreadsheet, Slides, Text, Code, Picture, Video, Archive (ZIP), and a plain page for anything else. Sheet: `docs/agent/screens/file-icons.svg` in idea-armory.

## Checks (2026-10-26)

- Build with warnings as errors: 0 warnings.
- Linux, full suite with a real database: 1,404 passed, 0 failed, 116 skipped (Windows-only tests). Two host tests could time out under load (one of them also on GitHub, and before this work); both were races in the tests themselves and both now wait for what they check.
- Window checks: 88 flows pass, 0 layout differences.
- GitHub CI on the final code (draft pull request idea-armory #9, closed, never merged): Windows 1,164 passed, 0 failed, 365 skipped (the tests that need a database skip there); Linux 1,404 passed, 0 failed; installers built; window checks passed. The three new real-disk fold tests passed on Windows: read-only files and Explorer's own files, a file another program holds open, and a power cut at every step.
- Mutation checks: removing the guard that keeps held files out of sending, the check on who made a save, or any of the four new robotics-safety guards turns the guarding tests red.

## Not verified

A real lab computer; a freshman and a robotics student on one real lab computer; SolidWorks holding a file during a switch; two Windows accounts on real hardware; the move on a real lab's folders; what Explorer itself draws for the new file types.

## Put 0.5.0 on the lab

1. Open https://github.com/pina-hash/idea-armory/releases/new
2. Click **Choose a tag**, type `v0.5.0`, click **Create new tag: v0.5.0 on publish**. Leave Target on `main`.
3. Release title: `IDEA Armory v0.5.0`. Leave the description empty; the workflow writes it.
4. Leave **Set as the latest release** checked, then click **Publish release**. About 40 minutes later the release lists `IDEAArmory-win-Setup.exe`.
5. Computers on 0.4.1 or newer download it within four hours and run it the next time Armory opens. Computers on 0.3.x: run `IDEAArmory-win-Setup.exe` from the release once (flash drive; if Windows warns, **More info**, then **Run anyway**).
6. On one lab computer, have two students sign in one after the other. Expected: both faces on the picker, one click switches, one `C:\IDEA\Armory` folder, and if old `Armory-<name>` folders existed, one sentence on Home saying what moved.
7. On a robotics computer, have a freshman sign in. Expected: no robotics project in their Armory, robotics parts open read-only in SolidWorks, and their save is refused.

## Decisions for you

1. **One computer, one line on the website?** Today each sign-in shows as its own device. Fixing that needs a small website change (a computer id on Armory devices). Written up in `docs/ARMORY.md`; not built.
2. **No way to turn shared mode off.** A computer that becomes shared stays shared. Fine for the lab; say if you want a mentor switch back.
3. **Going back to 0.4.x** on a computer that was shared under 0.5.0 makes Armory refuse to run there (on purpose, so nobody's held work goes out as someone else). Reinstall 0.5.0 to fix it.
