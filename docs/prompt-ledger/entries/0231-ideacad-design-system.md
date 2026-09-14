# 0231 IdeaCAD gets a design system of its own

- Issued: 2026-09-14
- By: router chat
- Owns: `src/lib/ideacad/ideacad.css` (new), `src/lib/ideacad/ui/**`,
  `src/lib/ideacad/BladeEditor.svelte`, `src/lib/ideacad/viewport/**`,
  `docs/prompt-ledger/entries/0231-*`, and its own `docs/history/` entry.
- Forbidden: `src/routes/**`, `src/lib/classroom/**`, `transports.ts`,
  `store.ts`, `workspaces.ts`, any `blade/*.ts`, any migration. Two other
  lanes hold those.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/vigilant-feynman-aa3onu`, branched from `main` at `2bb8b56`.
- Notes: a scoped design system for IdeaCAD -- CSS custom properties on one
  root class (`.ic-root`), applied to the editor components. SolidWorks'
  structure with IDEA green where SolidWorks spends red; a type scale that
  tells a label, a number and a sentence apart at a glance; panel headers,
  dividers and rails as separate surfaces; selected, active, suppressed,
  error and pass/fail states that carry a word and a shape as well as a hue.
  No markup structure and no component logic change. The 44px tap floor
  holds everywhere a student taps; the 24px density floor is a declared
  class (`.ic-dense`) carried by no element today.
