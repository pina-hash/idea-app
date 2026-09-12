# 0172 Mount the presence heartbeat: nothing writes a presence row in production

- Issued: 2026-09-12
- By: router chat
- Owns: the presence region of
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` AND NOTHING ELSE IN
  THAT FILE, `tests/dom/presence-heartbeat-mount*`, `tests/dom/presence-console-mount*`,
  `tools/browser-verify/routes/presence*.mjs`, `docs/prompt-ledger/entries/0172-*`, and
  its own `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. `0200` is applied and
  `src/lib/classroom/presence/**` is on `main`.
- Status: pushed
- Branch: `claude/epic-mayer-48zzho`, branched from `origin/integration` at `3728698`
- Runs in parallel with: ledger 0171, which owns the IDEACAD region of the SAME route
  file. The presence region is this bundle's and nothing of theirs is touched.
- Notes: **LEDGER 0152 BUILT THE WHOLE PRESENCE SYSTEM AND DELIBERATELY LEFT ONE WIRE
  UNMADE.** `PresenceHeartbeat` is not mounted on the student's item page, so nothing
  writes a `classroom_presence` row in production today: the migration, both RPCs, the
  retention, the pure modules, the instructor surface and the component itself are all
  built and proved, and the console reads an empty table. 0152's own history entry names
  the file and the expression verbatim and says why it could not make the edit -- ledgers
  0147 through 0151 held that file in parallel.

  **DO NOT ADD A CLIENT THROTTLE.** `_classroom_presence_min_gap()` is 20 seconds and
  the component beats at 30, so the client is already the wider of the two. Confirm by
  reading, then MEASURE the client write rate. 0152 measured the database half at 100
  beats to 1 write; the client half has never been measured.

  **A STUDENT MUST NEVER SEE ANOTHER STUDENT'S PRESENCE.** 0152 proved that at the
  database with a signed-in peer control. The client half is proved separately here, with
  a control that would redden.

  **AND THIS BUNDLE OWES THE `classroom-updates.json` ENTRY** 0152 deliberately did not
  write: the moment the heartbeat mounts is the moment students start being measured.

## Outcome

**Duplicate check, three ways, all clear.** (1) `git log --oneline
origin/main..origin/integration` returned ZERO subjects -- `origin/main` and
`origin/integration` are the same commit, `3728698`, so nothing is in flight
between them. (2) Every `refs/remotes/origin/*` was swept for a ledger entry
numbered 0169 through 0172: none exists anywhere, on `main`, on `integration`,
or on any `claude/**` or `codex/**` branch, and `tools/idea-status.py` lists 149
prompts in flight with none of them this one. (3) The SUBSTANTIVE check, which
is the one that would have caught a bundle doing this work under another number:
every remote ref's copy of
`src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` was grepped for
`presence`, and not one of them mentions it. Nobody had started this.

**The three fetches and the identity check.** `git fetch --unshallow origin`
(the clone was already complete: `is-shallow-repository` false, 2207 commits),
`git fetch origin integration` (new ref created), and the identity, which was
already set -- `user.name` `Claude`, `user.email` `noreply@anthropic.com` -- so
nothing had to be configured.

**Production reachability**, checked before the merge: `https://ideabosco.com/`
**200** in 0.59s and `https://apps.ideabosco.com/` **200** in 0.49s.
`DEPLOY_PROBE_URL` and `IDEA_MIGRATION_URL` are both UNSET in this container, so
the applied set is CANNOT SAY and never "applied"; this bundle carries no
migration, so gates 4 and 5 have nothing to confirm and ledger 0114's gate-4
substitution applies.

**Outcome.** `PresenceHeartbeat` is mounted, gated on `data.engine` (the
database's own population, spelled in the payload) and keyed on the item id
(which 0152's own expression did not have, and without which a client-side
navigation beats under the previous assignment's id). The client write rate is
measured for the first time, in both directions and against a real Postgres:
480 keystrokes over two simulated minutes produce 4 beats, 4 row writes and 0
throttled, against 480 requests and 7 writes for a client with no rate rule. No
client throttle was added. The client half of "a student never sees another
student's presence" is proved with the real `GradingConsole` on the identical
peer rows as the control, and three permissive mutants each redden. Both
presence browser specs now wait for the roster, which was the flake ledger 0168
DOM-probed and the ONLY outside-threshold row in the whole measured store.

Full suite 403 files / 7813 tests / 0 failures. `svelte-check` 0 errors / 38
warnings / 21 files, unchanged from the branch point. One
`verify:readme -- --route presence`: 4 runs, 52 measurements, 0 outside
threshold. `docs/history/epic-mayer-48zzho.md` carries the measurements.

**Reported, not fixed.** `CLAUDE.md`'s `svelte-check` baseline says 40 warnings
in 22 files (34/5/1); the tree measures 38 in 21 (32/5/1) both with and without
this bundle's change. Ledger 0168 reported the same gap for the same reason and
that file is outside this bundle's surface. And the
`classroom-updates.json` entry is DRAFTED AND NOT COMMITTED, per the prompt: it
is in the session report, with the two caveats it must not overstate -- retention
is opportunistic (it rides a heartbeat that writes) rather than scheduled, and
there is no student-facing read surface, so the entry promises none.
