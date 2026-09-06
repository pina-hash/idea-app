# 0090 The Matrix theme is a green tint and a moving hatch
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `src/lib/design-system/themes/**`, `src/lib/theme.ts`, `src/lib/theme.svelte.ts`, a rain component if the design needs one, `src/routes/dev/themes/**`, `tests/theme*`, `tests/dom/theme*`, `tools/browser-verify/routes/theme*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0090-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: issued
- Branch: assigned by the harness
- Notes: Mr. Pina looked at the Matrix theme on 2026-09-06 and reported it
  himself: it tints everything an unpleasant green and there are no falling
  letters anywhere. A student had said the same thing more bluntly a day
  earlier.
  
  The code agrees. `matrix.css` line 168 animates `.bg-fx`'s
  `background-position` on a seven-second loop over a 17px-wide
  `repeating-linear-gradient`. **There are no glyphs.** It is a striped
  hatch sliding downward, plus two radial washes and a set of retinted
  tokens. Every contrast figure prompt 0049 reported is correct and every one
  of them was measured on something nobody had looked at -- which its own
  report named as the open question: "nobody has looked at it."
  
  So this is not a tuning pass. The rain does not exist and has to be built.
  
  WHAT MUST NOT CHANGE. Prompt 0049 established the rule and it is now in
  `IDEA_INTERFACE_STANDARDS`: a theme may repaint CHROME only. IDENTITY
  colours name a thing -- every app's accent on the launcher -- and SEMANTIC
  colours name a state -- success, warning, error, in progress. Neither is
  themeable, because twelve launcher cards are told apart by colour and six
  states are told apart by hue. Mr. Pina's own screenshots show the launcher
  with GAUNTLET green, the Foundry orange and FRC red, which is the property
  at risk.
  
  Also unchanged: the reduced-motion contract, the signed-out behaviour (the
  theme is per-browser and the control lives in the profile menu, so a
  signed-out visitor gets the standard palette), and the clean-off
  guarantee that turning it off leaves no residue.
  
  Deliberately excluded: the token files; any other theme; and the launcher
  accents.
