# What happens to the 2026-09-28 feedback, in order

Eighteen reports, all Mr. Pina's, triaged in `TRIAGE.md`; his answers are decisions 42 to 45
(`docs/decisions/entries/42-*` to `45-*`). The 2026-09-25 round's queue joins this one below:
ledger 0298 shipped everything from it that needed no migration, so what is left of it is the
two SQL proposals and the FRC build that waits on his approval of the brief.

Run one ultracode session at a time. They share one container and working tree. Write each
later session's brief after the one before it lands, from the tree as it is then.

| # | Session | Reports | Migration | Model | Status |
|---|---|---|---|---|---|
| 1 | **Round 1 (2026-09-28)**, ledger 0347: the grading console redesign (decision 43) and every other fix that needs no migration | R16 R17 R14 R15 R12 R02 R03 R05 R06 R01 R11 R04 R08 R09 R10 R13 | none | Opus 5.5, ultracode | brief and prompt written: `ROUND1_BRIEF.md`, `ROUND1_PROMPT.md` |
| 2 | **Promote the 2026-09-25 SQL proposals**: 0228 (answer revision history, decision 37) and 0229 (IdeaCAD class edit grant, decision 38), then the lock change split out of 0228 | carried: 2026-09-25 R27 R18 R34 | 0228, 0229, and 0232 for the lock change | Opus 5.5 at high, no workflow | write after 1 lands; first check `migrate.yml`'s last run authenticated |
| 3 | **Teams after posting** (decision 44): a manager-gated move RPC and an edited stamp on the draw, drag between team cards with a Move to control on every member, the team rename the style RPC already allows | R18 | 0230 (reserved) | Opus 5.5 at high, no workflow | write after 2 |
| 4 | **Class themes by class vote** (decision 45): theme features on the course, a section accent, a vote table with definer RPCs, the banner, card and strip key painted from the live tally | R07 | 0231 (reserved) | Opus 5.5, ultracode | write after 3 |
| waits on him | **FRC training build**: `docs/frc/REDESIGN_BRIEF.md` is written and needs his approval before a build prompt exists | carried: 2026-09-25 R35 | none known | Fable 5.1 to write the build prompt | his read of the brief |

**Migration numbers.** 0225 to 0227 were allocated to other ledgers and hold no file; 0228 and
0229 are the proposals under `docs/feedback/2026-09-25/overnight/proposed/`; this round reserves
0230 (teams), 0231 (class themes) and 0232 (the lock change split out of 0228). Every one of them
is ADDITIVE, because `migrate.yml` applies it on the same push that deploys the client, and each
session's report says it checked that.

## Every session ships straight to `main`

Mr. Pina's standing approval (2026-09-25, restated for the grading redesign in decision 43):
each session pushes to `main` tier by tier as each goes green, in solo mode, never waiting on the
`integration` sweep. A push that breaks something a class uses is reverted on `main` first
(`git revert`, never a force-push) and investigated second.

## Mark the export seen

`MARK_SEEN.sql` in this folder marks these 18 reports seen, so the next `status: new` export holds
only new ones. Paste it once into the Supabase SQL editor.
