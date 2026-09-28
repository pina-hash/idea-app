# What happens to the 2026-09-28 feedback

Eighteen reports, all Mr. Pina's, triaged in `TRIAGE.md`; his answers are decisions 42 to 45
(`docs/decisions/entries/42-*` to `45-*`).

**All eighteen ship in ONE session and ONE push to `main`** (Mr. Pina, 2026-09-28: "I want all of
these fixes pushed in one go. Just directly to main."). This queue first split them into four
sessions; that split is withdrawn.

| # | Session | Reports | Migration | Model | Status |
|---|---|---|---|---|---|
| 1 | **Ledger 0347**: every fix, including the grading console redesign (decision 43), team edits after posting (decision 44) and class themes by class vote (decision 45) | all 18 | ONE file, 0230, holding both the teams and the class-theme SQL | Opus 5.5, ultracode | brief and prompt written: `ROUND1_BRIEF.md`, `ROUND1_PROMPT.md` |
| later | **Promote the 2026-09-25 SQL proposals** 0228 (answer revision history, decision 37) and 0229 (IdeaCAD class edit grant, decision 38), then the lock change split out of 0228 | carried from 2026-09-25 | 0228, 0229, and a number for the lock change | Opus 5.5 at high | not this export's; write after 0347 lands |
| waits on him | **FRC training build**: `docs/frc/REDESIGN_BRIEF.md` needs his approval before a build prompt exists | carried from 2026-09-25 | none known | Fable 5.1 to write the build prompt | his read of the brief |

**Why one migration file.** `.github/workflows/migrate.yml` applies the LOWEST unapplied migration,
one file per push. Two new files in one push would leave the second unapplied while the deployed
client calls it, so the teams SQL and the class-theme SQL share 0230. It is additive, and the client
degrades on `PGRST202` for the few seconds the apply and the deploy race.

## Mark the export seen

`MARK_SEEN.sql` in this folder marks these 18 reports seen. Mr. Pina reported applying it on
2026-09-28.
