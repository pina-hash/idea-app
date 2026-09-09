# 0110 Tournaments: the surface, the entry model, and a scroll a student could not reach

- Issued: 2026-09-09
- By: Mr. Pina, from the 2026-09-09 feedback export, seven reports.
- Owns: `src/lib/tournaments/**`, `src/routes/tournaments/**`,
  `src/routes/api/tournament-push/**`, `supabase/migrations/0192_*.sql`,
  `src/routes/dev/tournaments/**`, `src/routes/dev/tournament-thumbs/**`,
  `tests/tournament*`, `tests/db/tournament*`,
  `tools/browser-verify/routes/tournaments*.mjs` and the generated regions of its
  README, `docs/prompt-ledger/entries/0110-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one. Claims: 0192.
- Lands on: `integration`. The migration is applied by Mr. Pina, so this bundle does
  not merge to `main`.
- Status: pushed
- Branch: `claude/tournaments-surface-scroll-yqplco`
- Notes: prompts 0077 and 0091 already landed work here. Read their `docs/history/`
  entries before building; roughly half of any open list on this codebase turns out
  already shipped.

  WHAT MR. PINA ASKED FOR, in his words, with what I measured beside it.

  1. A student on the TV route during a live tournament could not scroll to see all
     the teams. `TvStage.svelte` carries `overflow: hidden` in several places and a
     comment near line 759 about a horizontal-scroll check reading 0px. The TV route
     is projected and read across a room, so whatever you do must work without a
     mouse and must not break the fullscreen presentation.

  2. "tournament page must utilize the whole screen. currently the bracket is getting
     cut off and looks squished." He runs 2844x1450. Fix the width across every
     tournament route. `src/lib/tournaments/fullscreen.ts` already exists at 99
     lines; find out what it does and whether the bracket page uses it before writing
     anything new.

  3. "the tournaments view here is lackluster. boring." Redesign the list page. This
     is the judgment item and the reason this bundle is on Fable. Decide the
     direction against `src/lib/design-system/`, and say in your report what you
     chose and what you rejected. Hard constraints: a glance must distinguish live
     from open-for-registration from complete, and a signed-out spectator must still
     be able to watch.

  4. "greatly improve the ui and visual design of the interface across the entirety
     of the tournaments pages." Same latitude, same reporting obligation. Leave any
     FIRST branding alone if you find it; it is not stylable.

  5. An admin must manage, edit and delete any tournament regardless of who hosts it.
     This is the security-relevant half: gate it server-side, never only in the
     client, and prove a non-admin non-host is refused with a `tests/db/` test.

  6. A contender must be able to change their entry name while the tournament has not
     started, and not after. Find the state that means "not started" and gate on it.

  7. Registration must support more than one person under a single entry. The Hook
     Tournament ran teams of two as free text: "Azad + Diego", "Hunter + Matthew".
     Design the real thing. An entry holds one or more registrants, the bracket shows
     the entry, and the rewards panel pays every registrant. If the rewards path
     cannot be made correct inside this bundle, leave it and say so rather than
     half-building it.

  MIGRATION 0192. The number is allocated here; do not renumber it and do not derive
  one. Write no migration if the work needs no schema change. DO NOT APPLY IT: this
  container cannot reach the production database, the proxy accepts a CONNECT to
  5432 and then carries no bytes. Do not run `tools/apply-migration.mjs` or
  `supabase db push`. Report the verification query Mr. Pina should run in the SQL
  editor.

  AGENTS SPLIT BY FILE SURFACE, never by topic. One agent owns the generated regions
  of `tools/browser-verify/README.md` and writes them last. Nothing runs
  `verify:readme` until the tree is committed. Serialise the full suite; parallel
  vitest perturbs the db tests.

  Pull `main` in and resolve here, never on main; the counts block hunk by hunk,
  never whole-file. Your last change is your ledger `- Status:` set to `pushed`.
  Push the branch, never force-push, do not try to delete a remote branch. Because
  this carries a migration Mr. Pina must apply, stop at your branch and do not merge
  to `main`. Name the preview URL and the checks to run on it. Put anything a person
  must act on in your `docs/history/` entry, not only in your report.
