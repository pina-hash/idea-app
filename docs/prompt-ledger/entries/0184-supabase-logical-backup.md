# 0184 A scheduled logical backup of the production database, and a restore path

- Issued: 2026-09-12T18:50:00Z
- By: router chat
- Owns: `tools/backup/**` (new), `.github/workflows/backup.yml` (new),
  `docs/BACKUP.md` (new), `docs/prompt-ledger/entries/0184-*`, and its own
  `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0203
- Status: pushed
- Branch: claude/awesome-mayer-dcxpuy (cut from origin/integration b0a8101d)
- Notes: NO FILE UNDER `src/`. The Supabase FREE plan has no automated backups and
  no point-in-time recovery, and the two real loss modes are a mistaken statement
  in the SQL editor (every migration here is applied by hand there) and a free
  project paused over a long break. Destination was to be evaluated rather than
  assumed -- Mr. Pina named Google Drive -- against GitHub Actions artifacts and
  anything else, on credential, size, retention and restore difficulty. THE
  RESTORE PATH IS THE DELIVERABLE. The credential is Mr. Pina's and no container
  reaches production, so the workflow is written, committed and never run by this
  session. Ledgers 0181, 0182 and 0183 run in parallel; none of their files are
  touched.

## Outcome

**DUPLICATE CHECK, THREE WAYS, ALL CLEAR.** (1) `git log --oneline
origin/main..origin/integration` at branch time: **zero commits** -- the two refs
are the SAME sha, `b0a8101d`, so nothing at all was in flight between them and
branching from `integration` was branching from `main`. (2) A `git ls-tree` sweep
of all **54** remote refs for any `docs/prompt-ledger/entries/018[1-9]*` file:
`0184` exists on none of them, and the only entries in that range anywhere are
`0182` on `claude/affectionate-newton-xkuftf` and `0183` on
`claude/amazing-bohr-qxhly9`, both named by the prompt as parallel lanes. A live
GitHub contents listing of `entries?ref=main` returned **161** entries with
`0180` the highest. (3) The SUBSTANTIVE check, which is the one that would have
caught this work under another number: every one of the 54 refs was swept for
`tools/backup/`, `.github/workflows/backup*` and `docs/BACKUP*` -- **none exists
on any ref** -- and then for the string `pg_dump` across every tracked file on
every ref, which also returns nothing. Nobody had started this, and nothing in
this repository has ever dumped a database. `node tools/migration-claims.mjs`:
highest landed 0203, next free 0206, with 0204 held by `claude/busy-newton-trto6y`
and 0205 by `claude/great-bell-ppysbn`; this entry claims none.

**The three fetches and the identity check.** `tools/idea-status.py` from raw
(722 lines, md5 `e044d18ba0c9`, identical to the local mirror);
`docs/standards/REGISTER.md` from raw (51 lines, md5 `bda5ad4d6d9a`, identical);
the ledger directory live from the GitHub contents API on `main`. Container
fetches: the clone WAS shallow (`is-shallow-repository` true) and
`git fetch --unshallow origin` took it to **2268** commits; `origin/integration`
was a new ref; the identity was already set (`Claude` /
`noreply@anthropic.com`), so nothing had to be configured. Identity read from
the session rather than asserted: configured `claude-opus-5`, last served
`claude-opus-5`, effort `high`, permission mode `auto`.

**Baselines read off `integration` at branch time**, `b0a8101d`, before any edit:
`npm test` **410 files, 7935 tests, all passing**, 321.85s. `svelte-check`
**0 errors, 37 warnings in 20 files** (31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`), against `CLAUDE.md`'s
stated 38 in 21 -- a FIFTH drift, on the same day as the fourth, again entirely
`state_referenced_locally` and again downwards. `CLAUDE.md` is corrected in this
bundle as its own rule requires.

**THE DESTINATION IS GOOGLE DRIVE, AND THREE OF THE ALTERNATIVES WERE MEASURED
RATHER THAN REASONED ABOUT.** `pina-hash/idea-app` is PUBLIC -- the
unauthenticated GitHub API answers `"private": false` from this container with no
credential -- which disqualifies committing a dump to it outright, and its
Actions artifacts listing answers **HTTP 200 anonymously** on the same
no-credential request. The artifact download endpoint could not be tested (this
repo publishes no artifact, `total_count: 0`) and is therefore not claimed either
way; a store that cannot be proven private is not where student data goes.
Artifacts also cap at 90 days and are reachable only through the Actions UI,
which this prompt forbids routing Mr. Pina through. The runner-up is a second,
PRIVATE GitHub repository, rejected for a fine-grained PAT that expires and a
wider blast radius than a folder-scoped Drive token. The full table is in
`docs/BACKUP.md`.

**THE ROUND TRIP IS PROVEN, over the REAL 201-migration schema.**
`tools/backup/roundtrip.sh` boots a throwaway PostgreSQL 16.13, applies the stub
and all 201 migration files, seeds `auth.users`, `auth.identities`,
`storage.objects`, `profiles`, `coin_transactions` and `notebook_entries`, dumps
with the same `tools/backup/dump.sh` the workflow calls, and restores into a
second database with the exact command `docs/BACKUP.md` step 5 gives. All **127**
`public` tables present both sides with identical row counts; content compared
value for value on six tables across both halves of the artefact; **201** RLS
policies, **545** functions, **634** constraints, **25** triggers and the whole
function ACL set identical; and a negative control that deletes rows and drops a
real policy from the restored copy, which both comparisons catch.

**THE DUMP IS 261,886 BYTES GZIPPED** (1,681,727 uncompressed, 6.4x) for the
schema and six rows. Marginal cost measured at two scales, 28.9 and 28.6 gzipped
bytes per narrow row, so a million-row database projects to about 29 MB and the
whole 42-file retained set to the low hundreds of megabytes.

**THREE THINGS THE ROUND TRIP FOUND THAT NO AMOUNT OF READING WOULD HAVE.**
`pg_dump --schema=public` silently omits the extensions living in `public` while
still emitting the index that needs one, so the restore died on
`operator class "public.gin_trgm_ops" does not exist` (0162 installs `pg_trgm`
with no schema); the fix reads the extension names off the source catalog rather
than passing `*`, which would drag in Supabase's own managed extensions.
`pg_read_all_data` does NOT confer `BYPASSRLS`, so a read-only dumper stops on
the first RLS table -- and the tempting fix, `--enable-row-security`, does not
error at all: it would produce a valid, uploadable, EMPTY backup. And the two
halves of the artefact have a forced order, because `profiles.id` references
`auth.users(id)`. With `bypassrls` added, the read-only role's dump is
byte-identical to the owner's and that role is refused on `insert`, `delete` and
`drop table`, all three proven in the harness.

**THREE FILES OUTSIDE THE OWNED SURFACE WERE EDITED, each forced and each
minimal.** `tests/workflows.test.ts`: its `pushLinesPerFile` assertion is an
exhaustive per-file map and a fourth workflow necessarily reddens it; the entry
added is `'backup.yml': 0`, which is the honest value (it makes no git push) and
preserves the per-file property the test's own comment exists for. `CLAUDE.md`:
the svelte-check baseline, which that file's own standing rule requires a session
to correct in the same change. `.github/workflows/README.md`: its first sentence
read "Three workflows", which this bundle makes false.

**Production reachability, checked before the merge: NOT REACHABLE FROM THIS
CONTAINER.** `https://ideabosco.com/` and `https://apps.ideabosco.com/` both
answer `CONNECT tunnel failed, response 403` from the egress proxy, so no
statement about the live site is made here either way. A CONNECT to 5432 is
reset, exactly as the prompt says. `DEPLOY_PROBE_URL` and `IDEA_MIGRATION_URL`
are both UNSET, so the applied set is "cannot confirm" and never "applied" --
ledger 0114's gate 4 substitution applies, the range carrying no migration.

**NEVER RUN AGAINST ANYTHING REAL.** No production database and no Google Drive
API call. The workflow is committed and unfired. `docs/BACKUP.md` ends with the
numbered steps for Mr. Pina to add the five secrets and press Run workflow once.
