# 0091 Fullscreen on the tournament board, and no way back
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `TvStage.svelte`, `src/routes/tournaments/[id]/tv/**`, a fullscreen module if the design needs one, `src/routes/dev/tournaments/**`, `tests/tournament-tv*`, `tests/dom/tournament-tv*`, `tools/browser-verify/routes/tournament*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0091-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: pushed
- Branch: claude/tournament-fullscreen-nav-jnzb4d
- Notes: Mr. Pina reported it himself on 2026-09-06, from the tournaments
  surface: "ullscreen ormatting is poor. missing button to go back to last
  page". The dropped leading letters are a keystroke swallowed by the page,
  which may itself be a finding.
  
  Prompt 0077 rebuilt `/tv` two days earlier and sized it for a room: up-next
  names 24.8px to 57.6px, round labels 17.6 to 27.2, a match clock that did
  not exist, and an F key to enter fullscreen. It measured all of it at 1920
  in a headless browser. What it could not do is look at a projector, and its
  own checklist said so.
  
  So this is the first report from the real thing, and it says two separate
  things: the layout is wrong IN fullscreen specifically -- not at 1920 in a
  window, which was measured and passed -- and once you are in it there is no
  way out that a person can find.
  
  The second half is the sharper one. The Fullscreen API's own exit is the
  Escape key and browsers deliberately give no chrome, so a page that offers
  fullscreen and no visible way back has handed a projector to somebody who
  must know a keyboard shortcut. On a machine driving a class that is a
  person stuck in front of a room.
  
  Deliberately excluded: the host console and the public page, settled by
  0077; and anything about how a match advances.
