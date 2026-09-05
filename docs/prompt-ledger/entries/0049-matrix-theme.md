# 0049 The Matrix theme, the last unbuilt item on the feedback list
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `src/lib/design-system/themes/**` (new), the theme mechanism wherever the audit finds or places it, the theme control in `ProfileMenu.svelte`, `src/routes/dev/themes/**`, `tests/theme*`, `tools/browser-verify/routes/theme*.mjs`, the generated regions of its README, one migration only if persistence proves to need one, `docs/prompt-ledger/entries/0049-*`, and its own `docs/history/` entry.
- Migration permitted: only if A3 proved it. Highest on origin/main at issue: 0180. NONE WRITTEN: A3 found the repository already has this kind of setting and it is per BROWSER (`notebook-theme.svelte.ts`, localStorage, whose own header gives the argument), so the preference follows it and needs no schema.
- Status: pushed
- Branch: `claude/matrix-theme-n7un4r`
- Notes: A student asked for a Matrix theme. It is the last item on the
  September feedback list with nothing built against it, and every other item
  on that list is now shipped, declined with a reason, or raised to Mr. Pina.

  It is not a joke request. The IDEA palette is already green on black and the
  pathway's identity is `#00FF41`; a Matrix theme is the thing the product
  already half looks like, asked for by someone who noticed.

  The reason it is not trivial: `colors.css` and `effects.css` are the token
  source of truth, and the launcher gives GAUNTLET, VANGUARD, GREENLINE,
  Foundry, FRC, maps and the admin cards their own accents on purpose. A theme
  that repaints everything green destroys the one thing those accents do,
  which is let a person tell twelve cards apart at a glance.

  So the design question is what a theme is allowed to touch, and the answer
  is a rule rather than a palette.

  Also load-bearing: `prefers-reduced-motion`. Anything that rains characters
  down a screen is motion, and this repository has shipped GIF and animated
  WebP into assignment specs with no gate, which is a known defect. A theme
  that animates must respect the preference or it is a worse version of that.

  Deliberately excluded: the token files themselves; per-app accents, which
  are settled and deliberate; and any theme other than this one.
