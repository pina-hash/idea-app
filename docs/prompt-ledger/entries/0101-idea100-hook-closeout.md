# 0101 IDEA100 hook phase closeout: standards mirror 4.24
- Issued: 2026-09-09
- By: the closing chat "IDEA100 Hook Phase, Days 10 to 15", which wrote its own closeout kickoff prompt per `IDEA_Chat_Handoff_Standard.md` 1.3
- Owns: `docs/standards/IDEA_instructions.md`, `docs/standards/REGISTER.md`, `tools/validate-assignment-spec.py` (new), `docs/prompt-ledger/entries/0101-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: pushed
- Branch: `claude/idea100-hook-closeout-f6ow10`
- Notes: `IDEA_instructions.md` 4.23 to 4.24, applied as four surgical edits
  against the mirror rather than by copying the delivered file in, because the
  delivering chat authored them against this mirror at 4.23 and named each
  CURRENT block for exact match. All four matched uniquely on the first read.

  4.24 re-lands the American spelling rule, first delivered as 4.10 on
  2026-08-30 and lost when a parallel chat carried 4.9 to 4.23 without it, and
  adds two rules from the hook close: verify against the exported artifact on
  the server rather than a local reconstruction, and a vendor document
  answering an adjacent question is not an answer to yours. It also stops
  stating the print trigger count, which now comes from
  `IDEA_MATERIALS_PROCESS.md` alone.

  THE ID WAS ALLOCATED BY THIS SESSION, NOT BY A ROUTER CHAT, which is a
  deviation from `docs/prompt-ledger/README.md`: allocation is the issuing
  chat's and this closeout prompt arrived with no entry written for it. 0101 is
  the next free id read across `origin/main`, `origin/integration` and all 34
  `origin/claude/**` refs. An entry written after the fact records history
  rather than preventing a collision, and the README says so; it is written
  anyway because the surface grew mid-session and an undeclared surface is
  worse than a late entry.

  THE FILE SURFACE GREW MID-SESSION, on Mr. Pina's instruction, from the two
  standards files to include `tools/validate-assignment-spec.py`. Checked
  before landing it: six `claude/**` branches touch `tools/`, and not one
  declares `tools/` as a prefix -- each names `tools/apply-migration.mjs`,
  `tools/gauntlet-doc-check.mjs`, or a specific
  `tools/browser-verify/routes/*.mjs`. No intersection with this file.

  Deliberately excluded: `materials/`, which the app writes and which carries
  findings this bundle reports rather than edits; the D14 v7 spec, which is
  Mr. Pina's to publish; every other standards file, `IDEA_MATERIALS_PROCESS.md`
  included, left at 3.1 under the one-standards-delivery-per-chat rule; and the
  four other Python instruments the closing chat delivered, each unlanded for
  its own reason recorded in the history entry.
