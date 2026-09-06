# 0081 Three surfaces are built, tested and reachable only by typing the URL
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `src/lib/classroom/nav.ts`, `ClassroomShell.svelte`, `src/routes/classroom/+layout.svelte`, the tab lists in the two `/dev` classroom harnesses, the GREENLINE dashboard card, `tests/classroom-nav*`, `tests/dom/classroom-nav*`, `tools/browser-verify/routes/classroom-nav*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0081-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0186
- Status: pushed
- Branch: `claude/classroom-nav-surfaces-v958ub`
- Notes: Three bundles have now built a working surface and been unable to
  link to it, each correctly declining to reach outside its ownership.
  
  1. Prompt 0074 built the duplicate-drafts page at
     `/classroom/[sectionId]/duplicates`, with a migration, tests, three
     mutation controls and a browser pass. It reported: "the page has no link
     to it and is reachable only by typing the URL", because the section tabs
     come from `sectionTabs()` in `nav.ts` and `SectionTabId`,
     `locateClassroom` and `activeTab` would all have to move together. The
     exact four-line patch is in its history entry.
  
  2. Prompt 0058 made GREENLINE tell a student their track is waiting on a
     teacher, and gave teachers one page showing tracks and decals together.
     It reported the only link to it is a `/dashboard` card with NO COUNT and
     copy describing 0057's superseded publish-then-moderate model. It called
     that "the single highest-value remaining fix" and could not reach the
     file. `loadGreenlinePending` is already written.
  
  3. Prompt 0031 found a complete check-in manager mounted at
     `/notebook/review` and reported the classroom, where check-ins are
     created, has no path to any of it -- and that `ItemDetail` tells an
     instructor to "edit the existing one" without saying where. It named the
     cause as four sites in `nav.ts`.
  
  Measured 2026-09-06: `nav.ts` is 250 lines and `sectionTabs`,
  `SectionTabId`, `activeTab` and `locateClassroom` are referenced 38 times
  across five files. That breadth is exactly why every bundle stopped, and it
  is why this is its own lane rather than a line in someone else's.
  
  Deliberately excluded: every surface being linked to. This bundle adds
  doors and changes no room.
