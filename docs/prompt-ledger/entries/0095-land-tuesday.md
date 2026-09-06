# 0095 Land the Tuesday work and deploy once
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: the merge of finished `claude/**` branches into `main`, and one push. Changes no file's content beyond conflict resolution.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: issued
- Branch: assigned by the harness
- Notes: Six branches finished on 2026-09-06 and none is merged. One of them
  matters tomorrow: prompt 0091 found that `src/app.css` caps every `main` at
  880px and the tournament TV stage IS a `<main>`, so at 1920 the projector
  showed 880px of content with 520px of dead black each side, and the two
  competitor names the room exists to read were laid out at ZERO pixels wide
  and ellipsised out of existence. The IDEA100 Hook bracket runs on that
  screen on Tuesday 2026-09-08.
  
  The others: prompt 0090 rebuilt the Matrix theme with real falling glyphs
  on a canvas; 0092 fixed the grades list reordering itself by a live count
  of other people's actions; 0093 turned the maps editor into a three-region
  workspace with a live drawing; 0094 fixed CI's shallow checkout, which is
  why `main` is currently red; and 0089's own record.
  
  All six merged clean against `main` in a survey on 2026-09-06. `main` was
  measured green at 311 files and 6,301 tests by prompt 0089 before its push,
  and is red in CI only for 0094's cause.
  
  Deliberately excluded: applying any migration, which no cloud container can
  do and none of these needs; repairing anything a merge reveals; and
  `integration`, which catches up afterwards.
