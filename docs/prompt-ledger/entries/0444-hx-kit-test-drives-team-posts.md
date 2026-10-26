# 0444 hx-kit: the automatic test drives a team post

- Issued: 2026-10-26
- By: Mr. Pina, from the IDEA-Blade chat ("can we make the ideablade assignments team assignment like how 209h is currently going"). Mode: solo.
- Repo: `pina-hash/idea-app`
- Branch: none; kit tooling, pushed straight to `main`.
- Owns: `tools/hx-kit/test.mjs` (the team checks), `tools/hx-kit/host.html` (`teamState`, `teammate`, `focusLog` on the stand-in), this entry.
- Does not touch: site code, migrations, `materials/**`, `tools/hx-kit/kit/**`.
- Migration permitted: no.
- Status: pushed
- Notes: `kit/team.js` (ledger 0436 follow-up) had no check in `test.mjs`. For a manifest with `team`, the test now sends `idea:team-state` through the stand-in and asserts both directions: the held box read only with "Alex is editing" and 0 of 10 other shared boxes read only; a teammate's saved answer replaces a box the student left and never the box the student is in; focus and blur reach the portal. Negative control: `team.js` with its owned-box release removed fails the second check (left box stayed "ours").
