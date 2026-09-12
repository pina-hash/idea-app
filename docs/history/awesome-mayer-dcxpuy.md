---
title: "Prompt 0184: a scheduled logical backup of the production database, and the restore path that is the actual deliverable (`claude/awesome-mayer-dcxpuy`, no migration)"
date: 2026-09-12
branches: [claude/awesome-mayer-dcxpuy]
migrations: []
subsystems: ["Infrastructure", "Database", "Workflows", "Documentation"]
---

`pina-hash/idea-app` runs on the Supabase free plan, which has no automated
backups and no point-in-time recovery, and that database holds every student's
coins, notebooks, Foundry apps, tournament records and IdeaCAD work. This bundle
adds a nightly `pg_dump` to Google Drive, and -- the part that matters -- a
restore path that has been executed rather than described.

Nothing here touches `src/`. No migration.

### What landed

- `tools/backup/dump.sh` -- the one statement of what a backup of this database
  IS, called by the workflow and by the round trip so the artefact that was
  proven restorable is the artefact that gets uploaded.
- `tools/backup/roundtrip.sh` (+ `roundtrip-seed.sql`,
  `roundtrip-stub-extra.sql`) -- boots a throwaway Postgres, applies all 201
  real migrations, seeds, dumps, restores into a second database, and compares.
- `tools/backup/drive-upload.mjs` -- resumable upload and the retention rule,
  with `--selftest`.
- `.github/workflows/backup.yml` -- 09:00 UTC daily plus `workflow_dispatch`.
- `docs/BACKUP.md` -- the restore, numbered, for somebody who knows nothing.

### The restore path is the deliverable, so it was run

A backup nobody has restored is a file. `tools/backup/roundtrip.sh` needs no
credential and no network: PostgreSQL 16.13, the stub plus all 201 migration
files, rows seeded in `auth.users`, `auth.identities`, `storage.objects`,
`profiles`, `coin_transactions` and `notebook_entries`, dumped through
`dump.sh`, restored into a second database **with the exact command
`docs/BACKUP.md` step 5 gives**, including `--single-transaction`. Running the
document's own instruction rather than an equivalent is what keeps the two from
drifting; the same trick is used for step 4's `drop schema public cascade`,
which is in the harness because the restore genuinely fails without it.

What it compares: all **127** `public` tables present on both sides with
identical row counts; content value for value on six tables spanning both halves
of the artefact; **201** RLS policies, **545** functions, **634** constraints,
**25** triggers and the entire function ACL hash. The catalog half is not
decoration -- a restore that dropped every policy would pass every row-count
comparison and hand the next signed-in student the whole school's notebooks.

And a **negative control**, because every one of those is an equality over two
things the script itself built: rows are deleted and a real policy dropped from
the restored copy, and both comparisons must notice. That control found its own
defect first. It named `profiles_select_own`, which is not a policy in this
schema, so `drop policy if exists` was a no-op and the control reported that the
comparison had failed to notice damage nobody had done. It now reads the policy
name out of `pg_policies`. The real one is `select own profile`.

**Size: 261,886 bytes gzipped**, 1,681,727 uncompressed, 6.4x, for the schema
and six rows. Marginal cost measured at two scales -- 28.9 gzipped bytes per row
at +4,000 rows and 28.6 at +40,000 -- so it is linear and a million-row database
projects to about 29 MB. The extrapolation in `docs/BACKUP.md` is built from
those two readings and not from a guess; production's real size is unknown
because nothing here can reach it.

### Three things the round trip found that reading would not have

**`pg_dump --schema=public` silently drops the extensions living in `public`.**
`0162` runs `create extension if not exists pg_trgm` with no schema. The
narrowed dump omits the `CREATE EXTENSION` and still emits the index that uses
it, so the restore died on `operator class "public.gin_trgm_ops" does not exist`.
Measured both ways on a throwaway cluster: a whole-database `--schema-only` dump
emits the line, the same dump with `--schema=public` does not. The fix is
`--extension=<name>`, with the names **read off the source catalog** rather than
passed as `*` -- a wildcard would also carry Supabase's own managed extensions
(`pgsodium`, `supabase_vault`, `pg_graphql`), several of which need privileges a
restore may not have, to recreate something a fresh project already has.

**`pg_read_all_data` does not confer `BYPASSRLS`, and the obvious fix is much
worse than the error.** The recommendation was a read-only `backup_dumper` role
rather than the `postgres` superuser string in a public repository's secret
store. With `pg_read_all_data` alone, `pg_dump` -- which issues
`SET row_security = off` -- stops on the first RLS table:
`query would be affected by row-level security policy for table "objects"`. That
refusal is the good outcome. The alternative spelling,
`pg_dump --enable-row-security`, does **not** error: it dumps whatever the
policies let that role see, which for a role no policy names is nothing at all,
and produces a valid, uploadable, empty backup. Both `dump.sh`'s header and
`docs/BACKUP.md` say so at the point where somebody would reach for it. With
`bypassrls` added, the role's dump is byte-identical to the owner's, and the
harness additionally proves it is refused on `insert`, `delete` and
`drop table` -- because "read-only" is the entire reason for preferring it and
nothing else here was checking it.

**The two halves of the artefact have a forced order.** `profiles.id references
auth.users(id)` (0001 line 17), so identities must restore before `public`. The
seed's `notebook_entries` insert is deliberately the cross-part join, so a dump
assembled the other way round fails in the harness rather than in front of
somebody at 7am.

A fourth, smaller one: `pg_dump` 16.13 wraps its output in `\restrict` /
`\unrestrict` psql meta-commands carrying a **fresh random token per
invocation**, so a byte-for-byte comparison of two dumps has to strip them along
with the generation timestamp. That is also why the file must be restored by a
`psql` at least as new as the `pg_dump` that wrote it, which `docs/BACKUP.md`
states where it gives the command.

### Where it goes, and what was rejected

Mr. Pina asked about Google Drive. It is the right answer, and three of the
alternatives were measured rather than argued about.

**The repository is PUBLIC.** The unauthenticated GitHub API answers
`"private": false` from this container with no credential of any kind. That
disqualifies committing a dump here outright -- git history does not forget, and
the file is student emails, coin ledgers and notebook writing.

**GitHub Actions artifacts: three independent strikes.** Retention caps at 90
days, which does not cover a school year. Getting a file back means the Actions
UI or the API, and this prompt is explicit that Mr. Pina is never routed through
the Actions UI for anything but the first run. And the same anonymous request
that read the repository's visibility also got **HTTP 200** from
`/repos/pina-hash/idea-app/actions/artifacts`. The download endpoint could not
be tested -- `total_count` is 0, this repo publishes no artifact -- and is
therefore **not claimed either way**; a store that cannot be shown to be private
is not where a school's student data goes.

**Drive wins on the thing that actually matters, which is not any of the four
criteria in isolation: you can SEE the file.** A restore starts with opening a
folder in a browser somebody is already signed into and pressing Download. No
CLI, no token, no run id. And it needs no new vendor: this repo has already
established that a Google *service account* cannot work against the school's
Workspace (the domain policy blocks it) and that OAuth on behalf of a real
account can, so the credential is a shape already proven here rather than one
that fails at 2am.

The runner-up, named as such, is a second PRIVATE GitHub repository. Rejected
for two reasons rather than one: a fine-grained PAT expires and has to be
re-minted on a schedule nobody remembers, and a PAT in a public repository's
secret store has a wider blast radius than a Drive refresh token scoped to one
folder. S3/R2/B2 were rejected for being a new vendor and a new billing
relationship in exchange for being worse at a person finding the file.

### Retention: 30 daily, 12 monthly, computed from the filenames

There is no manifest and no label -- the folder IS the record, so the rule can be
checked by eye. The two windows answer the two loss modes separately and neither
covers the other: a mistaken SQL-editor statement is noticed in days (the daily
window), and a free project paused over a ten-week summer is noticed in months
(the monthly chain).

The monthly keeper is the **earliest surviving copy in the month**, not the 1st.
A month whose run did not happen on the 1st -- a failed night, an expired secret
-- would otherwise silently have no monthly copy at all. A file this tool did
not write is never deleted; it is reported and left alone. `--selftest` puts all
of that to a fixture, with two negative controls (the rule does delete
something; a narrower window deletes more), because retention is the one part of
this that can destroy data.

### Decisions inside the workflow worth keeping

- **The triggers are `schedule` and `workflow_dispatch`, and the absence of
  `pull_request` is the security property.** Public repo, anybody may open a PR.
  GitHub withholds secrets from a fork's PR run, but a workflow that cannot run
  on a PR at all needs no reasoning. `permissions: {}`.
- **09:00 UTC is one hour before `deploy.yml`'s nightly**, so every deploy --
  the only scheduled event that changes production's code -- is preceded by a
  copy of the database as it was before it. It is deliberately not `ci.yml`'s
  08:00, whose hour is chosen for the day-boundary window.
- **A missing secret makes the run RED, not skipped.** The tempting
  `if: secrets.X != ''` turns an unconfigured backup into a green run that does
  nothing, which is precisely how nobody finds out until they need the file.
- **A too-small dump is refused before upload.** A credential that connects and
  reads nothing produces a valid, uploadable, worthless file. The floor is the
  measured schema size, and `gzip -t` plus `pg_dump`'s own completion marker
  catch a truncated write.
- **The credential is `BACKUP_GOOGLE_*`, not the app's `GOOGLE_OAUTH_*`.**
  `CLAUDE.md` requires one reader per secret and for Drive that reader is
  `src/lib/server/notebook-drive.ts`. Distinct names mean the backup's access is
  revocable without touching notebook photos. Mr. Pina may paste the same values
  he already has; the names are what matter.
- The upload is **resumable, not multipart** -- the app's `uploadDriveFile`
  builds one body in memory, which is right for a photo and wrong for a database.

### What is NOT covered, said loudly rather than discovered

**Supabase Storage objects.** `pg_dump` reads a database; the bytes of every
Foundry bundle, classroom attachment, hand-in, answer key, map photo and
notebook photo are on another service. Restoring gives a database that knows
about every file and can serve none. It is the first section of
`docs/BACKUP.md`, the workflow header says it, and the job summary repeats it on
every run. Closing it is separate work of a different order of magnitude.

### Three files outside the owned surface

Each forced, each minimal, each named here because a boundary crossed silently
is the problem.

- `tests/workflows.test.ts` -- `pushLinesPerFile` is an exhaustive per-file
  `toEqual` map, so a fourth workflow reddens it necessarily. The added entry is
  `'backup.yml': 0`, the honest value (it makes no git push), which preserves
  exactly the per-file property that assertion's own comment exists for.
- `CLAUDE.md` -- the svelte-check baseline, corrected under that file's own
  standing rule. See below.
- `.github/workflows/README.md` -- its first sentence read "Three workflows",
  which this bundle makes false, plus a short section pointing at
  `docs/BACKUP.md`.

### The svelte-check baseline moved again, for the fifth time

Measured on `origin/integration` at `b0a8101d` before any edit: **0 errors, 37
warnings in 20 files**, breaking down 31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`. `CLAUDE.md` said 38 in 21
with 32/5/1. **The warning that moved is `state_referenced_locally`, 32 down to
31**, and the file count with it -- the fifth drift, the second downwards, and
the second inside a single day (ledger 0180 corrected 40-in-22 to 38-in-21 that
morning). `CLAUDE.md` is corrected in this bundle, as its own rule requires.

### Verification

- `npm test` on `integration` at branch time: **410 files, 7935 tests, all
  passing**, 321.85s. After the change: re-run, reported in the session's final
  message.
- `svelte-check`: above, unchanged by this bundle (it touches no Svelte).
- `tools/backup/roundtrip.sh`: green, five times over, at three data scales.
- `node tools/backup/drive-upload.mjs --selftest`: 17 assertions green,
  including two negative controls.
- `node tools/backup/drive-upload.mjs --selftest-transport`: 13 green. The
  network half -- token exchange, the two-step resumable handshake, 3 MB
  arriving byte-identical at the session URL, paging followed to the end, and
  exactly the chosen deletes -- driven against a loopback server that asserts
  what it receives rather than answering blindly.
- The workflow's two shell gates were extracted and driven against fixtures,
  since a workflow cannot be rehearsed here: the secret-presence check answers
  1/0/1 for none set, all set and one missing, naming only the missing one; and
  the dump validation refuses a 21-byte file, refuses a large file with no
  completion marker, refuses a truncated gzip, and accepts a large file with the
  marker. `permissions` is `contents: read` rather than `{}` for the same
  untestable-first-run reason, and the marker is read out of a variable rather
  than piped into `grep -q`, which under `pipefail` can fail a step for finding
  what it was looking for.
- `node tools/claude-md-check.mjs`: agrees with the tree.

### What was NOT verified

- **Nothing here has run against the production database.** The egress proxy
  accepts a CONNECT to 5432 and carries no bytes; `https://ideabosco.com/` and
  `https://apps.ideabosco.com/` both answer `CONNECT tunnel failed, response
  403` from this container, so no claim is made about the live site either way.
  `DEPLOY_PROBE_URL` and `IDEA_MIGRATION_URL` are unset.
- **Nothing here has talked to Google Drive.** The token refresh, the resumable
  upload and the delete have never been executed against the live API. The
  retention rule has, via `--selftest`.
- **The workflow has never run.** It is written, committed and unfired; the
  first run is Mr. Pina's, and `docs/BACKUP.md` ends with the numbered steps.
- **The round trip restores into a bare database, not a fresh Supabase
  project.** That difference is what steps 4 and 8 of the document are about,
  and is why the first restore should be a rehearsal.
- **It ran on PostgreSQL 16.13**, which is what this container has. Supabase may
  be on 15 or 17. The workflow asks the server its version and installs a
  matching client for that reason, and that step has not run -- PGDG is blocked
  by this container's proxy, so it could not even be rehearsed here.
- **Supabase dashboard labels** in the restore steps were written from how the
  console is laid out today. Where one matters, the identifying property is
  given beside it (the pooler is "the one on port 5432") so a rename does not
  strand anybody.
