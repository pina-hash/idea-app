# 0077 The tournament surface runs a live bracket on Tuesday and looks like a settings page
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `src/lib/tournaments/**`, `src/routes/tournaments/**`, the tournaments entry in `src/lib/site-manifest.ts`, `src/routes/dev/tournaments/**`, `tests/tournament*`, `tests/dom/tournament*`, `tools/browser-verify/routes/tournament*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0077-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0185
- Status: issued
- Branch: assigned by the harness
- Notes: DEADLINE: Tuesday 2026-09-08, the IDEA100 Hook Design Competition
  bracket, run live in class on this surface for the first time.
  
  The surface is not thin. It already carries a `/tv` projector stage, a host
  console, `BracketView`, `PoolsView`, match and entry pages, QR codes, push
  alerts, reward rules and per-entry styling. What it lacks is an IDENTITY:
  `site-manifest.ts` gives `tournaments` no accent, unlike GAUNTLET,
  GREENLINE, the Foundry and FRC, so it inherits portal chrome and reads as a
  generic page.
  
  That is the actual gap and it is why "it just looks like the standard
  website" is the right diagnosis.
  
  THE HARD CONSTRAINT: per-app accents exist so a person can tell twelve
  launcher cards apart at a glance, and prompt 0049's theme rule made that a
  written rule -- identity colours name a THING and are never repainted,
  semantic colours name a STATE and are never repainted, chrome is
  everything else. An accent for tournaments must be distinguishable from
  every accent already in use, and the audit lists them before choosing.
  
  The pathway is green and the identity is `#00FF41`. "IDEA green brand
  identity, unique design" means the surface must read as IDEA and not as
  the classroom. That is a composition problem rather than a hue problem.
  
  Deliberately excluded: the token files; the thumbnail bucket work, which
  prompt 0076 holds and which must not be raced; and any schema change.
