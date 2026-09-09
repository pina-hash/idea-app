# 0111 The feedback widget: IDEA theme, voice to text, and out of the shell chunk

- Issued: 2026-09-09
- By: Mr. Pina, two requests from him and one from ledger 0107's loading audit.
- Owns: `src/lib/feedback/**`, `src/routes/dev/feedback/**`, `tests/feedback*`,
  `tests/dom/feedback*`, `tools/browser-verify/routes/feedback*.mjs` and the
  generated regions of its README, `docs/prompt-ledger/entries/0111-*`, and its
  own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: issued
- Branch: `claude/feedback-widget-theme-voice-zik6hw`
- Notes: three items. ONE, the report window takes an IDEA theme through the
  component's own override mechanism, never a fork, and must still look right
  inside GREENLINE, FRC and GAUNTLET. TWO, voice to text for writing a report:
  the browser's own speech service only, degrade to the plain textarea where
  unsupported, never overwrite typed text. THREE, `FeedbackBox` and the
  screenshot uploader leave the shell chunk through a dynamic import with a
  preload, unless the import measurably delays the panel, in which case it is
  reported and dropped. Five lanes are live elsewhere (0106 rubric, 0108 root
  layout / `vite.config.ts` / `ThemeRoot.svelte` / `profile.ts`, 0109 `docs/`,
  0110 tournaments, 0112 maps); nothing outside the owned paths is changed.
