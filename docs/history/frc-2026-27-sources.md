---
title: "FRC 2026/27 assignment sources committed under 2.14"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

Sixteen sources for the FRC 2026/27 class (Block 5) go to `assignment-sources/frc-2026-27/`. Thirteen were named in the request: Start Here, Techmen App, SolidWorks Design Projects, Tracks 1 to 8, Machine Training and Inspection Training. The other three are the pages that replaced the old reading posts the same day: Shop Safety, The Shop Trophy and Important Links. The eleven library pages (the tracks, Start Here, Techmen App and SolidWorks Design Projects) carry `<html data-post="library">`, which changes only the test's post-size line. Every page was live before the attribute was added, and none was re-uploaded for it.

Measured 2026-10-28: each committed source, built with `tools/hx-kit/build.mjs`, matches the built page uploaded at 15:03 UTC byte for byte (16 of 16 `cmp` equal). The sources carry no serial number and no email address.

Not verified: that the live documents still match after this commit. The match is to the file that was uploaded, and the live copy was not downloaded again. The Library C copy was skipped because the Drive connector cannot take files this size. Machine Training's points are still unset, which is Mr. Pina's call.
