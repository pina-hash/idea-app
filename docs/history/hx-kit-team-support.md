---
title: "hx-kit: team posts (box locks, owned boxes, a teammate's edit live, the tracker)"
date: 2026-10-26
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---
The assignment-building kit had no support for the team documents ledger 0436 shipped. The Unit 4 authoring chat wrote `tools/hx-kit/kit/team.js` and checked it in Chromium against the 0436 contract, but its container could not push, so it left a patch; the IDEA & FRC chat applied it unchanged on 2026-10-26.

What changed:
- `kit/team.js` (new, inlined after `kit.js` by `build.mjs`): sends `idea:field-focus` and `idea:field-blur` so the portal takes and releases a box's lock; on `idea:team-state` draws a box a teammate holds, a box another member owns, an unowned box and a past-due box as read only with the words beside it ("Jake is editing"); lets a teammate's saved answer replace this page's value in a shared box once this page's own save has landed; marks `[data-role]` panels and fills `[data-role-owner]` and `[data-team-name]`; draws `idea:team-tracker` into `#hx-team-tracker`. Inert in a worksheet the portal never sends team messages to.
- `host.html` accepts the two focus notices instead of dropping them; `kit.css` adds the team styles; `test.mjs` expects every row of a multi-row table to be stored.
- `starter.html` rebuilt so it carries `team.js`.

Measured (2026-10-26, this container, Chromium 1243): `node tools/hx-kit/test.mjs` on the rebuilt starter: 0 FAIL, 0 WARN, 30 PASS, no sideways scroll at 1440, 960 and 375.

Not verified here: the team behaviour itself in a real team post (the starter is not a team post, so `team.js` stays inert in this run); the authoring chat's own Chromium check is the evidence for it, and the first Unit 4 post is the live one.
