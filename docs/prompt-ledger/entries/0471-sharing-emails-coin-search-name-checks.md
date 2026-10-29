# 0471 IdeaCAD sharing shows name and email, a coin record search, and the classmate-name check on tournaments and the market

- Issued: 2026-10-28
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List". Queue: `docs/feedback/2026-10-28/QUEUE-0471.md`
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: the IdeaCAD sharing reads and `ShareModelPanel.svelte` (lane 0470's, landed), `src/lib/ui/PersonPicker.svelte` and `src/lib/ui/person-picker.ts` for showing an email line, the IdeaCAD launch card's owner line, one new staff coin read and its connector entry (additive in `src/lib/server/connector/registry/`), the tournament entry and IDEA Market listing save paths only where they call `_idea_roster_name_hits`, new migration files for these, their tests, `docs/subsystems/ideacad.md` sharing lines, `docs/subsystems/coins.md` for the new read, one decision entry under `docs/decisions/entries/`, one `classroom-updates.json` entry, its `docs/history/` entry, this entry.
- Does not touch: anything lane 0458 (HTML assignments) or 0465 (color tokens) owns, coin page layout, the frozen Coin Ledger page.
- Migration permitted: yes, as many as needed, each under the next free migration number at landing. Claims: none yet
- Status: issued
- Mode: solo (beside 0458 and 0465, which own none of these files)
- Branch: main (solo)
