---
id: 2026-10-18-armory-sw-version-drive-backup
repo: pina-hash/idea-app
chat: Morning ops routine (decision 41 answers)
ledger: 0404
migration: 0285
model: opus-5.5
effort: high
size: L
owns: src/lib/armory/**, src/routes/armory/**, src/routes/api/armory/**, src/lib/server/armory/**, src/routes/dev/armory*/**, tools/browser-verify/routes/armory*.mjs, tests/armory*.test.ts, tests/db/armory*.test.ts, supabase/migrations/0285_*.sql, .github/workflows/armory-drive-mirror.yml, tools/armory-drive-mirror*, docs/ARMORY.md, the IDEA ARMORY and service-role census lines of CLAUDE.md, docs/prompt-ledger/entries/0404-*, its own docs/history/ entry, db:idea-supabase
after:
needs_go: no
go: no
status: running
started_at: 2026-10-18T22:17:26Z
trigger_id: trig_01B6nwDk8Fn1CcLCvgpJ7iUj
queued_at: 2026-10-17T23:57:36-07:00
---
Before doing anything else: `git fetch origin main`, check out `origin/main` on a working branch, and confirm the committer identity is `Claude <noreply@anthropic.com>` (set it if empty). This is a solo session: rebase on `origin/main` and push `HEAD:main` once at the end, with the ledger entry in the same push.

Every statement below about the repo is a claim; check each one in the tree before relying on it.

You are building ledger 0404 in pina-hash/idea-app. Read CLAUDE.md first, especially the IDEA Armory section, the service-role census, "ONE MODULE KNOWS EACH CREDENTIAL", the migration rules and the signature trap.

OWNS: src/lib/armory/**, src/routes/armory/**, src/routes/api/armory/**, src/lib/server/armory/**, src/routes/dev/armory*/**, tools/browser-verify/routes/armory*.mjs, tests/armory*.test.ts, tests/db/armory*.test.ts, supabase/migrations/0285_*.sql, .github/workflows/armory-drive-mirror.yml, tools/armory-drive-mirror*, docs/ARMORY.md, the IDEA ARMORY and service-role census lines of CLAUDE.md, docs/prompt-ledger/entries/0404-*, its own docs/history/ entry. Nothing else.

NUMBERS: ledger 0404. Migration 0285, only if part A needs one. 0270 through 0284 belong to the website connector and the coin market; never use them.

CONTEXT (Mr. Pina, 2026-10-18; docs/decisions/entries/41-armory-file-vault-scope.md):
- He tested saving from SolidWorks 2026 and the back-save to 2025 works.
- He wants an ordinary 2026 project to be an option and could not find any way to make one.
- He wants the nightly readable Google Shared Drive backup that docs/ARMORY.md promised and nobody built.

AUDIT FIRST, AND GATE THE BUILD ON IT. Answer each from the tree and write the answers in your history entry:
1. armory_projects.pinned_release defaults to 2025 (0231). armory_raise_pinned_release is mentor-only and only raises. Is there any caller in src/ that raises it? Is a site admin who creates a project made a mentor of it?
2. How is a project created today (which route or component calls armory_create_project), and does it take a release?
3. Does the Windows app (docs/agent/CONTRACT.md in pina-hash/idea-armory, if you can read it; say so if you cannot) read pinned_release from armory_my_projects? Never claim what the app does without reading it.
4. For the mirror: which credentials already exist (src/lib/server/notebook-drive.ts and its Google OAuth refresh token, src/lib/server/armory/storage.ts and the R2 variables), and where can a job run that moves gigabytes nightly? Vercel Hobby functions have a duration limit and both cron slots are taken (vercel.json); .github/workflows/cert-jobs.yml is the precedent for a scheduled workflow.

A. ONE PROJECT, ONE SOLIDWORKS VERSION, CHOSEN ON PURPOSE
- On a project's Project tab, a mentor or site admin sees the project's SolidWorks version and can move it up (2025 to 2026, and later releases), with a two-step confirm that says in words what changes: once anyone saves in 2026, those files will not open in 2025. Never lower a pin; say why there is no way down.
- Whoever creates a project picks 2025 or 2026 at creation, default 2025. If armory_create_project must take a release, write 0285 with the additive-pair pattern from CLAUDE.md's signature trap (the deployed Windows app keeps calling the old arity), revoke from anon by name (0166's shape), and test it over seeded pre-migration data.
- A site admin's reach uses the predicate the rest of Armory uses; never a second role list.
- The change feed already words 'pinned_release_raised' (src/lib/armory/view.ts). Reuse it.
- Run the idea-design skill for the control's look; it wears the site plate like the rest of /armory.

B. THE NIGHTLY SHARED DRIVE BACKUP
- Goal: if R2, Supabase or Armory disappears, Mr. Pina opens a Google Shared Drive and finds every project's current files as ordinary SolidWorks files in their folders, plus a manifest (project, path, version, author, saved release, hash, date) readable without Armory.
- Incremental: skip a file whose hash already matches. A removed file moves to a _removed folder and is never deleted. The job never writes to R2 or the database.
- Nightly, after school hours in Los Angeles time, from a scheduled GitHub workflow running a script, unless the audit measures something better. Safe to run twice and safe to stop halfway.
- Name every secret it needs. A new reader of the service-role key or the R2 keys changes CLAUDE.md's census; update it in the same change and say why. Read Armory's data as narrowly as the job allows.
- Unset secrets: the job writes "not set up" in its summary and exits green.
- A dry-run mode, exercised against a fixture. This container cannot reach production storage; say so.
- Write in the history entry the exact numbered steps for Mr. Pina: the URL https://github.com/pina-hash/idea-app/settings/secrets/actions, each secret's exact name, where each value comes from, and what a correct first run's summary looks like. Never send him to the Actions tab; the schedule makes the first run.

CHECKS
- Targeted: the armory test files you touch, tests/db/armory*.test.ts for any migration, and a test of the mirror's planning logic (copy, skip, move to _removed) over a fake store and a fake Drive.
- Mutation proof on the pin's raise-only rule and its role gate, against that single test file, in the permissive direction; restore byte-identically (md5) and say so.
- npm run verify:browser on the armory route specs you touch, 375 and 1440, numbers reported.
- npm run check, with placeholder PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY exported before the sync.
- One full npm test at the end. Read the summary line and stderr, never the exit code.

LANDING: rebase on origin/main, push HEAD:main once. Never force-push, never delete a remote branch. A real content conflict is a stop.

REPORT: the pushed sha; the audit answers; what was built and what was already there; whether 0285 exists (migrate.yml applies it on push); the live footer sha at https://ideabosco.com/ if reachable; every step a person must take, also in the history entry.

LEDGER ENTRY: docs/prompt-ledger/entries/0404-armory-sw-version-and-drive-backup.md, in the shape of the entries beside it: Issued 2026-10-18; By the morning ops routine, from Mr. Pina's decision 41 answers; Mode solo; Owns copied from above; Migration permitted: yes, 0285 only, only for a release choice at creation; Claims: 0285 if used; Status: pushed.
