---
title: "hx-kit: nine gaps the first visual overhauls found"
date: 2026-10-27
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

The IDEA 100 Section 2 chat (Rotation 2 Survey, IDEA-Blade 02) and the IDEA209H chat (Launcher: Design) overhauled their pages onto authoring 2.10 the same morning and reported nine gaps, each carried as a local fix in those pages.

Kit: the Next and Still-to-do keys inherited `white-space: nowrap` from `.idea-key`, so a long step title pushed the page sideways at 375; they wrap now. New parts: `.hx-scale` (a rating, flex row of keys, five across under 480px), `data-any-one` (kit.js `kitAnyGroups`, `kitGroupDone`; a group is one requirement of its step and its boxes are excluded from `kitRequired`), `data-keys-for`, `.hx-full` and `data-layout="full"`, `#hx-page a.idea-key` keeping the key ink against `#hx-page a`'s accent, and `[data-role].is-mine` drawn (team.js already set the class; nothing drew it).

Test: the filler typed one sentence into every box and only the first row of every table, so a `data-min-sentences="2"` box always held back the finish line; it now types as many sentences as asked, a number where a box asks for one, and every row. A readonly or hidden text box is set through its `data-keys-for` keys, and FAILS with what to do when it has none. Every box in a `data-any-one` group must be optional in the manifest. An early `finish()` (the importer refusing the file) crashed on `shots` before its declaration; it is declared first now.

`tools/browser-verify/browser.mjs` (shared with `npm run verify:browser`) now also asks the full `playwright` package for its executable and scans `PLAYWRIGHT_BROWSERS_PATH`, `~/.cache/ms-playwright`, `/opt/pw-browsers` and `/ms-playwright` for the newest installed chromium, since a new workspace keeps it at another path and revision.

Not verified: the two overhaul chats' pages themselves (their chats remove their local fixes and rebuild); a real team session drawing `.is-mine` (the stand-in host's team state was not driven for a tile).
