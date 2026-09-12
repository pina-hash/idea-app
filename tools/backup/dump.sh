#!/usr/bin/env bash
# tools/backup/dump.sh
#
# WHAT A BACKUP OF THIS DATABASE IS, WRITTEN DOWN ONCE. `backup.yml` calls this
# and `tools/backup/roundtrip.sh` calls this, so the artefact the round trip
# proves restorable is byte-for-byte the artefact the nightly run uploads. Two
# spellings of "what do we dump" is the pair that stops agreeing, and the way it
# stops agreeing here is that the thing nobody has restored turns out to be
# missing a schema.
#
#   usage: dump.sh <connection> <out.sql.gz>
#
# <connection> is anything psql understands: a bare database name (with PGHOST
# and friends in the environment) or a full postgresql:// URL.
#
# ---------------------------------------------------------------------------
# IT IS TWO DUMPS IN ONE FILE, IN RESTORE ORDER, AND THE ORDER IS FORCED.
#
#   1. auth + storage, DATA ONLY.  A fresh Supabase project already owns that
#      DDL; what it does not have is WHO YOUR STUDENTS ARE. `profiles.id`
#      references `auth.users(id)` (0001 line 17), so every row in `public`
#      that is keyed to a person depends on these rows existing FIRST.
#      `auth.identities` is in here too and is the half that is easy to miss:
#      it is the row that says "this Google account is that uuid", so without
#      it a returning student signs in and is issued a NEW uuid, and their
#      notebook, their coins and their Foundry apps stay behind pointing at a
#      user nobody is any more.
#
#   2. public, SCHEMA AND DATA.  The whole app: 201 migrations' worth of
#      tables, RLS policies, SECURITY DEFINER functions, grants and composite
#      keys. OWNERSHIP IS KEPT DELIBERATELY (no --no-owner): a SECURITY
#      DEFINER function executes as its OWNER, so a dump that discarded owners
#      would restore a database whose every write RPC runs as whoever ran the
#      restore.
#
# `--schema=public` SILENTLY DROPS THE EXTENSIONS THAT LIVE IN public, AND THE
# ONLY SYMPTOM IS A RESTORE THAT STOPS PART-WAY. Measured on a throwaway
# Postgres 16: a whole-database `pg_dump --schema-only` emits
# `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;` and the SAME
# dump narrowed with `--schema=public` emits no extension line at all -- while
# still emitting the index that uses it, so the restore dies on
# `ERROR: operator class "public.gin_trgm_ops" does not exist`. `0162` runs
# `create extension if not exists pg_trgm` with no schema, so this repo has
# exactly that shape and this was the round trip's own first red.
# `--extension=<name>` puts it back, in the right position (measured: the
# CREATE EXTENSION lands above the CREATE INDEX that needs it).
#
# THE NAMES ARE READ FROM THE SOURCE AND NOT PASSED AS `*`. A wildcard would
# also drag in every extension SUPABASE manages in its own `extensions` schema
# -- `pgsodium`, `supabase_vault`, `pg_graphql` -- several of which need
# privileges a restore may not have, to recreate something a fresh project
# already has. Only the ones sitting in `public` are ours to carry.
#
# WHAT IS DELIBERATELY NOT IN HERE, because no pg_dump can reach it:
# SUPABASE STORAGE OBJECTS. `storage.objects` rows are metadata -- a key, a
# size, an owner -- and the BYTES they name live on another service. Restoring
# this file gives you a database that knows about every Foundry bundle,
# classroom attachment and notebook photo and cannot serve one. That gap is
# named at the top of docs/BACKUP.md rather than buried here.
# ---------------------------------------------------------------------------

set -euo pipefail

CONN="${1:?usage: dump.sh <connection> <out.sql.gz>}"
OUT="${2:?usage: dump.sh <connection> <out.sql.gz>}"
PGD="${PG_DUMP:-${PG_BIN:+$PG_BIN/}pg_dump}"
PGD="${PGD:-pg_dump}"

# WHAT PART 1 LEAVES OUT, IN TWO GROUPS.
#
# The first group is tables a FRESH project has already populated for itself.
# Restoring our copy over them is a primary-key collision, which under
# `psql -v ON_ERROR_STOP=1 --single-transaction` ends the WHOLE restore having
# written nothing -- so they are excluded here rather than explained to somebody
# reading an error at 7am.
#
# The second is session state and an audit log, which are not the record. Stale
# sessions and refresh tokens restored into a new project are at best pointless
# (the project's JWT secret is different, so none of them would validate) and
# `auth.audit_log_entries` is routinely the largest table in a Supabase project
# -- an operational log that would dominate the artefact's size while being the
# one thing nobody would ever want back. `auth.identities` is NOT in here and
# must never be: it is the row saying which Google account a uuid is.
#
# NAMING A TABLE THAT DOES NOT EXIST IS SAFE HERE AND IS MEASURED: `pg_dump
# --exclude-table=nope.nothing` exits 0, where `--table=nope.nothing` errors.
# So an exclusion for a table a future Supabase version drops costs nothing.
# THE SCHEMA LIST BELOW DOES NOT HAVE THAT PROPERTY -- `--schema=auth` against a
# database with no `auth` schema is a non-zero exit -- which is why it names
# exactly the two schemas every Supabase project has and is not open-ended.
EXCLUDE=(
	--exclude-table=auth.schema_migrations
	--exclude-table=storage.migrations
	--exclude-table=supabase_migrations.schema_migrations
	--exclude-table=auth.audit_log_entries
	--exclude-table=auth.refresh_tokens
	--exclude-table=auth.sessions
	--exclude-table=auth.flow_state
)

TMP="$(mktemp -d "${TMPDIR:-/tmp}/idea-dump-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# 1. Identities and object metadata, data only.
"$PGD" --dbname="$CONN" \
	--data-only --no-owner --no-privileges \
	--schema=auth --schema=storage \
	"${EXCLUDE[@]}" \
	--file="$TMP/1-auth-storage-data.sql"

# The extensions installed INTO public on the source, one --extension per name.
PSQL="${PSQL:-${PG_BIN:+$PG_BIN/}psql}"
PSQL="${PSQL:-psql}"
EXTFLAGS=()
while read -r ext; do
	# `if` and not `[ ... ] && ...`: under `set -e` an AND-list whose test fails
	# is itself a failing statement, so one blank line out of psql would end the
	# script here rather than skip an iteration.
	if [ -n "$ext" ]; then EXTFLAGS+=("--extension=$ext"); fi
done < <("$PSQL" -At -d "$CONN" -c "
	select e.extname
	from pg_extension e join pg_namespace n on n.oid = e.extnamespace
	where n.nspname = 'public' and e.extname <> 'plpgsql'
	order by 1")

# 2. The application, schema and data.
"$PGD" --dbname="$CONN" \
	--schema=public \
	"${EXTFLAGS[@]}" \
	--file="$TMP/2-public.sql"

{
	printf -- '-- idea-app logical backup\n'
	printf -- '-- generated %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	printf -- '-- restore: see docs/BACKUP.md. Order below is load-bearing.\n'
	printf -- '-- part 1 of 2: auth + storage, data only\n'
	cat "$TMP/1-auth-storage-data.sql"
	printf -- '\n-- part 2 of 2: public, schema and data (extensions carried: %s)\n' "${EXTFLAGS[*]:-none}"
	cat "$TMP/2-public.sql"
} | gzip -9 > "$OUT"
