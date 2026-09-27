# 0320 Fold two standing docs-only branches into main; close decision 39's Build line

- Issued: 2026-09-26
- By: router chat, closeout of the IdeaCAD 9.21, Classroom overhaul and triage chats
- Owns: `docs/history/new-session-avpli9.md`, `docs/history/new-session-zsum4t.md`,
  `docs/prompt-ledger/entries/0292-portal-voice-loc-and-coin-tiles.md`,
  `docs/decisions/entries/39-foundry-gallery-one-sort-control.md`, this entry
- Does not touch: `src/**`, `supabase/**`, `tests/**`, `.github/**`, `materials/**`,
  `vercel.json`, `docs/standards/**`
- Migration permitted: no. Claims: none
- Status: pushed
- Branch: `claude/upbeat-pascal-p9krgk`
- Notes: Merged `claude/new-session-avpli9` (72+/1- to its own history entry, plus 12 lines
  added to the 0292 ledger entry) and `claude/new-session-zsum4t` (25 lines, its own history
  entry only) into main, both `--no-ff`, both clean with no conflicts, both touching only
  `docs/history/` as claimed. Decision 39's Build line now reads
  "CLOSED 2026-09-25 by ledger 0298 (20426fe5, a29b4ebd, f1349783)", confirmed all three
  commits are ancestors of origin/main and touch the Foundry gallery
  (20426fe5/a29b4ebd/f1349783 per docs/history/upbeat-pascal-p9krgk-0298-overnight.md's own
  "Deferred and open" note). `npm run history:verify` reports the split lossless (168 entries,
  reassembled sha256 matches reference). Ledger 0285 (lane E: integrate.yml fix plus eight
  classroom requests) was allocated in chat on 2026-09-22 and never issued; its migration
  number 0225 holds no file, and 0226 and 0227 (allocated to 0296 and 0297) hold none either.
  The integrate.yml fix remains decision 21; the classroom requests were overtaken by 0297
  and 0298.
