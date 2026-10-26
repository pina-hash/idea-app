---
title: "FRC announcements: morning and after school reads, 80% line removed"
date: "2026-10-26"
branches: ["main"]
migrations: []
subsystems: ["frc-announcements"]
---

Mr. Pina asked (2026-10-26) that the automatic FRC announcement drafts drop the 80% attendance line, request a morning AND a separate after school announcement from now on (the 3:05 read is more urgent), and match the team's current schedule.

- `tools/frc-announcements/announce.py`: every request carries a MORNING block and an AFTER SCHOOL (3:05) block; subject `Morning and After School Announcement Request for <Ddd M/D>`. Tuesday morning now states 3:10, 15 minutes, attendance taken, training until 5:00. Fri 10/30 after school read sends Beach Blitz travelers to the front lot. The typed "Mr. Pina" is gone; the draft takes his Gmail signature.
- `EXTRA` holds one-off lines by air date. Tue 10/27: Beach Blitz prep and Paul Calderon's scouting training 3:25 to 4:10 (from the Techmen app schedule).
- Flyers: 80% line removed, time box 3:10 PM, weekly cells "3:10 PM. Mandatory. Train until 5."
- Standard `IDEA_MORNING_ANNOUNCEMENTS.md` 1.7.

Measured: rendered 10/23, 10/27, 10/30, 11/3, 11/6; no "80" in any output; flyers checked visually. Not verified: that the office reads after school announcements at 3:05 (Mr. Pina stated it).
