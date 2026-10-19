---
id: 2026-10-18-armory-part-numbers
repo: pina-hash/idea-app
chat: Morning ops routine (decision 41 answers)
ledger: 0405
migration: 0286
model: opus-5.5
effort: high
size: M
owns: src/lib/armory/part-numbers*, src/lib/armory/Armory*Part*.svelte, src/lib/armory/ArmoryCots*.svelte, src/routes/armory/**, src/routes/dev/armory-parts*/**, tests/armory-part-numbers*.test.ts, tests/db/armory-part-numbers*.test.ts, supabase/migrations/0286_*.sql, docs/ARMORY.md, docs/prompt-ledger/entries/0405-*, its own docs/history/ entry, db:idea-supabase
after: 2026-10-18-armory-sw-version-drive-backup, 2026-10-18-migration-chain-repair
needs_go: no
go: no
status: running
started_at: 2026-10-19T02:25:01Z
queued_at: 2026-10-17T23:57:36-07:00
---
Before doing anything else: `git fetch origin main`, check out `origin/main` on a working branch, and confirm the committer identity is `Claude <noreply@anthropic.com>` (set it if empty). This is a solo session: rebase on `origin/main` and push `HEAD:main` once at the end, with the ledger entry in the same push.

Every statement below about the repo is a claim; check each one in the tree before relying on it.

You are building ledger 0405 in pina-hash/idea-app: IDEA Armory's part number registry and COTS library, on the server and the website, so the SolidWorks add-in (a later lane in pina-hash/idea-armory) has something to ask for a number. Read CLAUDE.md first (IDEA Armory section, write path, migration rules, "revoke from anon by name", the signature trap).

OWNS: src/lib/armory/part-numbers*, src/lib/armory/Armory*Part*.svelte, src/lib/armory/ArmoryCots*.svelte, src/routes/armory/**, src/routes/dev/armory-parts*/**, tests/armory-part-numbers*.test.ts, tests/db/armory-part-numbers*.test.ts, supabase/migrations/0286_*.sql, docs/ARMORY.md, docs/prompt-ledger/entries/0405-*, its own docs/history/ entry. Nothing else.

NUMBERS: ledger 0405. Migration: one, under the next free migration number at landing (never a fixed or reserved number): write the file under the next free number, take the next free number again when you rebase to land, rename it (and every test and doc naming it) if someone landed first, and state the final number on the ledger entry's Claims: line (CLAUDE.md, "A MIGRATION NUMBER IS TAKEN AT LANDING"). Wherever this prompt says 0286, read your final number.

THE RULE (Mr. Pina chose scheme A on 2026-10-18; the full text is in docs/decisions/entries/41-armory-file-vault-scope.md under "Part numbers, as answered"):
- Made part or assembly: 5669-YY-SS-AAPP. Team, two-digit season, two-letter subsystem code (DT, SH, IN, EL, AR, CL, FR, EE, MS), two-digit assembly, two-digit part; an assembly ends 00. Class projects use the course (IDEA100-27-...).
- Revision is a letter beside the number, never in it. A number is assigned once and never reused, even after deletion.
- COTS parts get no team number: vendor prefix plus the vendor's part number plus a short description, in one shared COTS library projects reference and nobody edits in place. Hardware is named by spec (HW-SHCS-10-32x0.75). A modified COTS part becomes a made part with a "made from" property. Raw stock is a material, not a part.

AUDIT FIRST: does any part number, COTS or subsystem table or code already exist (grep supabase/migrations and src/lib/armory)? How are project membership and roles checked (reuse those predicates, never a second role list)? What does a project carry that gives the team prefix and season (armory_projects.season)? Write the answers in the history entry and gate the build on them.

BUILD
- 0286: a registry that hands out the next number atomically per (project, subsystem, assembly), never reuses one, records who took it and for which file, and refuses a malformed number with a sentence. The subsystem list is data a mentor can extend, not a CHECK constraint. A COTS library table (vendor prefix, vendor part number, description, optional link and file) that every project reads; only mentors and site admins add or correct rows, nothing deletes, retire with a flag. Every write is a SECURITY DEFINER function taking no identity parameter; RLS on, no client write grant; revoke from anon by name (0166's shape). Test over seeded pre-migration Armory data.
- Website: on a project, a Parts view listing assigned numbers by subsystem and assembly, and a COTS library page searchable by vendor and number. Run the idea-design skill; it wears the site plate like the rest of /armory and works at 375 and 1440.
- One pure module (src/lib/armory/part-numbers.ts) is the only spelling of the format, its parser and its validator, used by the website and pinned by tests against the SQL validator on one corpus.
- Write the add-in's contract for asking for a number into docs/ARMORY.md (which function, which arguments, which refusals), so the add-in lane can build against it.

CHECKS: the targeted test files above; a concurrency test that two callers asking at once get two different numbers; a mutation proof on the never-reuse rule and the role gate in the permissive direction, restored byte-identically; npm run verify:browser on the new specs at 375 and 1440; npm run check with placeholder PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY exported first; one full npm test at the end, reading the summary line and stderr.

LANDING: rebase on origin/main, push HEAD:main once. Never force-push. A real content conflict is a stop.

REPORT: pushed sha, audit answers, what was built, that migrate.yml applies 0286 on push, the live footer sha if reachable, and anything a person must do, also in the history entry.

LEDGER ENTRY: docs/prompt-ledger/entries/0405-armory-part-numbers.md in the shape of its neighbors: Issued 2026-10-18; By the morning ops routine, from Mr. Pina's decision 41 answers; Mode solo; Owns copied from above; Migration permitted: yes, 0286; Claims: 0286; Status: pushed.
