#!/usr/bin/env bash
# tools/backup/roundtrip.sh
#
# THE PROOF THAT THE BACKUP IS A BACKUP. A dump nobody has restored is a file.
#
# It boots a throwaway Postgres, applies the REAL migration chain to a SOURCE
# database, seeds rows through the shapes the app really stores, runs the SAME
# two `pg_dump` invocations `backup.yml` runs, gzips them into one artefact,
# restores that artefact into a SECOND database, and compares the two
# databases row for row. It prints the dump's byte size, which is the figure
# `docs/BACKUP.md` extrapolates a production dump from.
#
# IT USES THE REAL MIGRATIONS AND NOT A FIXTURE SCHEMA, for the reason
# `tests/db/harness.ts` gives about itself: a dump over a hand-written schema
# proves the dump can carry a hand-written schema. What has to survive here is
# 201 migrations' worth of RLS policies, SECURITY DEFINER functions, grants and
# composite keys, and only the real files have those.
#
# WHAT IT DOES NOT PROVE, stated here rather than discovered later:
#   * It restores into a BARE database, where `backup.yml`'s artefact restores
#     into a fresh SUPABASE project that already has `auth`, `storage`, the
#     extensions and the client roles. `docs/BACKUP.md` step 4 is where that
#     difference lives, and it is why the auth/storage half is dumped
#     --data-only: a fresh project already owns that DDL.
#   * It cannot reach Supabase Storage. No `pg_dump` can: the bucket OBJECTS
#     are bytes on another service and only their ROWS are in the database.
#     That gap is named in `docs/BACKUP.md` and is not closed by this script.
#
# Usage:  bash tools/backup/roundtrip.sh
# Exit 0 only if every comparison matched.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# POSTGRES REFUSES TO RUN AS ROOT, and this repo's cloud containers run as root
# while a GitHub runner does not. Re-exec once as an unprivileged account rather
# than make the caller remember; `IDEA_ROUNDTRIP_DEMOTED` is what stops that
# being a loop when the `su` lands somewhere still privileged.
if [ "$(id -u)" = "0" ] && [ -z "${IDEA_ROUNDTRIP_DEMOTED:-}" ]; then
	AS="${PG_RUN_AS:-postgres}"
	if ! id "$AS" >/dev/null 2>&1; then
		echo "running as root and no unprivileged account '$AS' to demote to; set PG_RUN_AS" >&2
		exit 1
	 fi
	RUNDIR="$(mktemp -d /tmp/idea-backup-run-XXXXXX)"
	chmod 0777 "$RUNDIR"
	echo "root: re-running as $AS (postgres refuses to run as root)"
	exec su -s /bin/bash "$AS" -c \
		"IDEA_ROUNDTRIP_DEMOTED=1 TMPDIR='$RUNDIR' PG_BIN='${PG_BIN:-}' bash '$REPO/tools/backup/roundtrip.sh'"
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/idea-backup-roundtrip-XXXXXX")"
PGDIR="$WORK/cluster"
SOCK="$WORK/sock"
OUT="$WORK/dump.sql.gz"

# The client MUST be at least the server's major version or `pg_dump` refuses
# outright -- that refusal is the single likeliest way `backup.yml` fails, so
# this harness runs both from ONE bin directory and can never disagree with
# itself. `backup.yml` gets the same guarantee a different way: it asks the
# server its version first and installs the matching client.
BIN="${PG_BIN:-}"
if [ -z "$BIN" ]; then
	for candidate in /usr/lib/postgresql/*/bin; do
		[ -x "$candidate/postgres" ] && [ -x "$candidate/pg_dump" ] && BIN="$candidate"
	done
fi
if [ -z "$BIN" ] || [ ! -x "$BIN/postgres" ]; then
	echo "no Postgres server+client pair found; set PG_BIN to a directory holding both" >&2
	exit 1
fi

cleanup() {
	"$BIN/pg_ctl" -D "$PGDIR" -m immediate stop >/dev/null 2>&1 || true
	rm -rf "$WORK"
}
trap cleanup EXIT

say() { printf '\n== %s\n' "$1"; }

say "server and client, from one bin directory"
"$BIN/postgres" --version
"$BIN/pg_dump" --version

say "boot a throwaway cluster"
mkdir -p "$SOCK"
"$BIN/initdb" -D "$PGDIR" -U postgres --auth=trust --no-sync >/dev/null
"$BIN/pg_ctl" -D "$PGDIR" -o "-k $SOCK -h '' -c fsync=off" -w start >/dev/null
export PGHOST="$SOCK" PGUSER=postgres

psql() { "$BIN/psql" -v ON_ERROR_STOP=1 -q "$@"; }

say "apply the stub and all $(ls "$REPO"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations to SOURCE"
"$BIN/createdb" source
psql -d source -f "$REPO/tests/db/supabase-stub.sql" >/dev/null
psql -d source -f "$REPO/tools/backup/roundtrip-stub-extra.sql" >/dev/null
for f in "$REPO"/supabase/migrations/*.sql; do
	psql -d source -f "$f" >/dev/null 2>>"$WORK/migrate.log" || {
		echo "migration failed: $(basename "$f")" >&2
		tail -20 "$WORK/migrate.log" >&2
		exit 1
	}
done
echo "applied"

say "seed rows of the kinds this backup exists to protect"
psql -d source -f "$REPO/tools/backup/roundtrip-seed.sql" >/dev/null

# OPTIONAL BULK, SO THE SIZE FIGURE CAN BE EXTRAPOLATED RATHER THAN GUESSED.
# `ROUNDTRIP_SCALE=n` adds n more coin rows and n more notebook entries on top
# of the seed. Running the harness at two scales gives marginal bytes per row
# COMPRESSED, which is the only number that answers "what will a real dump
# cost" -- the base figure is almost entirely the 201-migration SCHEMA and says
# nothing at all about data volume.
SCALE="${ROUNDTRIP_SCALE:-0}"
if [ "$SCALE" -gt 0 ]; then
	psql -d source -c "
		insert into public.coin_transactions (student_email, category_id, amount, note, actor_email)
		select 'student' || (g % 300) || '\''@boscotech.net', 'shop_safety_violation', -((g % 12) + 1),
		       'bulk row ' || g, 'apina@boscotech.edu'
		from generate_series(1, $SCALE) g;
		insert into public.notebook_entries (student_id, custom_label, status, instructor_comment)
		select '11111111-1111-4111-8111-111111111111', 'bulk entry ' || g, 'compliant',
		       case when '${ROUNDTRIP_FAT:-0}' = '0' then null
		            else repeat('the quick brown fox jumps over the lazy dog. ', ${ROUNDTRIP_FAT:-0}) end
		from generate_series(1, $SCALE) g;" >/dev/null
	echo "bulk: +$SCALE coin rows, +$SCALE notebook entries (fat=${ROUNDTRIP_FAT:-0})"
fi

psql -d source -At -c "
select 'auth.users        ' || count(*) from auth.users
union all select 'profiles          ' || count(*) from public.profiles
union all select 'coin_transactions ' || count(*) from public.coin_transactions
union all select 'notebook_entries  ' || count(*) from public.notebook_entries;"

say "dump exactly as backup.yml dumps"
# PG_BIN is handed on explicitly so `dump.sh` uses the SAME pair this harness
# booted the server from. Letting it fall through to whatever is on PATH is how
# the comment above about one bin directory would quietly stop being true.
PG_BIN="$BIN" bash "$REPO/tools/backup/dump.sh" source "$OUT"
BYTES=$(wc -c < "$OUT")
PLAIN=$(gzip -dc "$OUT" | wc -c)
printf 'dump.sql.gz  %s bytes (%s uncompressed, ratio %s)\n' \
	"$BYTES" "$PLAIN" "$(awk -v a="$PLAIN" -v b="$BYTES" 'BEGIN{printf "%.1fx", a/b}')"

# ---------------------------------------------------------------------------
# THE CREDENTIAL THE WORKFLOW WILL ACTUALLY HOLD IS READ-ONLY, AND THAT IS
# MEASURED HERE RATHER THAN HOPED FOR. `docs/BACKUP.md` tells Mr. Pina to make
# a `backup_dumper` role with `pg_read_all_data` instead of pasting the
# `postgres` superuser string into a repository secret on a PUBLIC repo. That
# advice is worth nothing if `pg_dump` cannot actually complete as such a role,
# and the way it would fail is PARTIAL: a dump that runs, exits 0, and is
# missing whatever the role could not read.
#
# So the same dump is taken twice, as the owner and as the read-only role, and
# the two are compared BYTE FOR BYTE with their generation stamps removed.
#
# THE ROLE NEEDS `bypassrls` AS WELL AS `pg_read_all_data`, AND THAT IS
# MEASURED HERE. `pg_read_all_data` grants SELECT on every table and USAGE on
# every schema and DOES NOT confer BYPASSRLS, so `pg_dump` -- which issues
# `SET row_security = off` before it copies anything -- stops on the first
# table with RLS enabled:
#
#   pg_dump: error: query failed: ERROR: query would be affected by row-level
#   security policy for table "objects"
#
# That refusal is the good outcome and is why the flag is not optional: the
# ALTERNATIVE spelling, `pg_dump --enable-row-security`, does not error. It
# dumps whatever the policies let that role see, which for a role no policy
# names is NOTHING, and produces a valid, uploadable, empty backup. Do not
# reach for that flag to make this go away.
# ---------------------------------------------------------------------------
say "take the same dump as a read-only backup_dumper role"
psql -d source -c "
	do \$\$
	begin
		if not exists (select 1 from pg_roles where rolname = 'backup_dumper') then
			create role backup_dumper login nosuperuser nocreatedb nocreaterole bypassrls;
		end if;
	end
	\$\$;
	grant connect on database source to backup_dumper;
	grant pg_read_all_data to backup_dumper;" >/dev/null

# THE ROLE IS ALSO PROVEN UNABLE TO WRITE, because "read-only" is the whole
# reason for preferring it to the `postgres` string and nothing else here
# checks it. Three statements, each of which must be REFUSED.
for stmt in \
	"insert into public.coin_transactions (student_email, category_id, amount, actor_email) values ('x@boscotech.net','shop_safety_violation',-1,'y@boscotech.edu')" \
	"delete from public.notebook_entries" \
	"drop table if exists public.coin_transactions"; do
	if "$BIN/psql" -q -U backup_dumper -d source -c "$stmt" >/dev/null 2>&1; then
		echo "  READ-ONLY ROLE ACCEPTED A WRITE: $stmt"
		FAIL_RO=1
	else
		echo "  refused, correctly: $(echo "$stmt" | cut -c1-46)..."
	fi
done
RO_OUT="$WORK/dump-readonly.sql.gz"
if PGUSER=backup_dumper PG_BIN="$BIN" bash "$REPO/tools/backup/dump.sh" source "$RO_OUT" 2>"$WORK/ro.log"; then
	RO_BYTES=$(wc -c < "$RO_OUT")
	# TWO KINDS OF LINE ARE PER-RUN RANDOM AND ARE REMOVED BEFORE COMPARING,
	# OR NO TWO DUMPS EVER MATCH AND THIS CHECK QUIETLY MEANS NOTHING: the
	# header's own generation timestamp, and pg_dump's `\restrict` /
	# `\unrestrict` nonces -- a psql meta-command carrying a fresh random
	# token on every invocation, which is why the artefact has to be restored
	# BY psql and by a psql at least as new as the pg_dump that wrote it.
	# `docs/BACKUP.md` says so where it gives the restore command.
	strip() { gzip -dc "$1" | grep -vE '^-- generated |^\\(un)?restrict '; }
	a=$(strip "$OUT"    | md5sum | cut -d' ' -f1)
	b=$(strip "$RO_OUT" | md5sum | cut -d' ' -f1)
	if [ "$a" = "$b" ]; then
		echo "read-only dump is byte-identical to the owner's ($RO_BYTES bytes, md5 $a)"
	else
		echo "READ-ONLY DUMP DIFFERS FROM THE OWNER'S: $a vs $b"
		strip "$OUT"    > "$WORK/a.sql"
		strip "$RO_OUT" > "$WORK/b.sql"
		diff "$WORK/a.sql" "$WORK/b.sql" | head -20
		FAIL_RO=1
	fi
else
	echo "pg_dump FAILED as backup_dumper:"; tail -10 "$WORK/ro.log"; FAIL_RO=1
fi

say "restore into a SECOND database"
"$BIN/createdb" restored
# The stub plus the extra IS the fresh project: a real Supabase project already
# has the client roles, the auth schema, the storage schema and the realtime
# publication before any restore touches it.
psql -d restored -f "$REPO/tests/db/supabase-stub.sql" >/dev/null
psql -d restored -f "$REPO/tools/backup/roundtrip-stub-extra.sql" >/dev/null
# AND THEN THE DOCUMENTED STEP, RUN RATHER THAN DESCRIBED. `docs/BACKUP.md`
# step 4 tells a person to drop the public schema before restoring, because
# part 2 of the artefact opens with `CREATE SCHEMA public` and a fresh project
# already has one -- measured: without this the restore stops at
# `ERROR: schema "public" already exists` having written nothing. Running the
# instruction here is what keeps the document and the proof the same thing.
psql -d restored -c 'drop schema if exists public cascade' >/dev/null
# THE COMMAND IS THE ONE `docs/BACKUP.md` STEP 5 GIVES, VERBATIM, INCLUDING
# --single-transaction: a restore that stops half way through 127 tables and
# leaves the rest behind is a database somebody then has to reason about at the
# worst possible moment. All or nothing.
# `ROUNDTRIP_STRIP_SCHEMA_OWNER=1` runs the artefact through the filter
# `docs/BACKUP.md` offers for `ERROR: must be member of role
# "pg_database_owner"`. Offering a workaround nobody has run is how a person
# ends up following a broken instruction at the worst moment, so the harness can
# take the same path and every comparison below still has to pass.
if [ "${ROUNDTRIP_STRIP_SCHEMA_OWNER:-0}" = "1" ]; then
	echo "restoring through the documented ALTER SCHEMA OWNER filter"
fi
gzip -dc "$OUT" | { if [ "${ROUNDTRIP_STRIP_SCHEMA_OWNER:-0}" = "1" ]; then grep -v 'OWNER TO pg_database_owner'; else cat; fi; } \
	| "$BIN/psql" -v ON_ERROR_STOP=1 --single-transaction -q -d restored >/dev/null 2>"$WORK/restore.log" || {
	echo "RESTORE FAILED" >&2
	tail -40 "$WORK/restore.log" >&2
	exit 1
}
echo "restored"

say "compare the two databases"
FAIL="${FAIL_RO:-0}"

# 1. Every table in `public`, by row count, both directions. A table present in
#    one and absent in the other is a mismatch and not a skipped comparison.
"$BIN/psql" -At -d source -c "
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1" > "$WORK/tables.src"
"$BIN/psql" -At -d restored -c "
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1" > "$WORK/tables.dst"
if ! diff -q "$WORK/tables.src" "$WORK/tables.dst" >/dev/null; then
	echo "TABLE SET DIFFERS:"; diff "$WORK/tables.src" "$WORK/tables.dst" || true; FAIL=1
fi
NTABLES=$(wc -l < "$WORK/tables.src" | tr -d ' ')
echo "public tables compared: $NTABLES"

counts() {
	while read -r t; do
		printf '%s %s\n' "$t" "$("$BIN/psql" -At -d "$1" -c "select count(*) from public.\"$t\"")"
	done < "$WORK/tables.src"
}
counts source > "$WORK/counts.src"
counts restored > "$WORK/counts.dst"
if diff -q "$WORK/counts.src" "$WORK/counts.dst" >/dev/null; then
	echo "row counts: IDENTICAL across all $NTABLES tables"
else
	echo "ROW COUNTS DIFFER:"; diff "$WORK/counts.src" "$WORK/counts.dst" || true; FAIL=1
fi

# 2. CONTENT, not just counts. A restore that produced the right number of
#    wrong rows would pass a count comparison, so the tables the seed wrote are
#    compared value for value.
for t in "auth.users" "auth.identities" "storage.objects" "public.profiles" "public.coin_transactions" "public.notebook_entries"; do
	a=$("$BIN/psql" -At -d source -c "select md5(string_agg(x,'|' order by x)) from (select (t.*)::text x from $t t) s")
	b=$("$BIN/psql" -At -d restored -c "select md5(string_agg(x,'|' order by x)) from (select (t.*)::text x from $t t) s")
	if [ "$a" = "$b" ]; then echo "content $t: MATCH ($a)"; else echo "content $t: DIFFERS ($a vs $b)"; FAIL=1; fi
done

# 3. The things a backup of THIS database is worth nothing without. Row counts
#    and content say the data came back; these say the RULES came back. A
#    restore that dropped every RLS policy would pass every check above and
#    hand the next signed-in student the whole school's notebooks.
for q in \
	"select count(*) from pg_policies where schemaname='public'" \
	"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" \
	"select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity" \
	"select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'" \
	"select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal" \
	; do
	a=$("$BIN/psql" -At -d source -c "$q"); b=$("$BIN/psql" -At -d restored -c "$q")
	label=$(echo "$q" | sed -e 's/select count(\*) from //' -e 's/ .*//')
	if [ "$a" = "$b" ] && [ "$a" -gt 0 ]; then echo "catalog $label: $a = $b"
	else echo "CATALOG MISMATCH ($label): $a vs $b"; FAIL=1; fi
done

# 4. The ACL surface, exactly. `0137`/`0166`/`0202` are migrations whose whole
#    content is who may EXECUTE what, so a restore that lost a grant is a
#    restore that silently re-opens every function those files closed.
a=$("$BIN/psql" -At -d source -c "
select md5(string_agg(p.proname||':'||coalesce(array_to_string(p.proacl,','),'-'),'|' order by p.proname,p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
b=$("$BIN/psql" -At -d restored -c "
select md5(string_agg(p.proname||':'||coalesce(array_to_string(p.proacl,','),'-'),'|' order by p.proname,p.oid))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
if [ "$a" = "$b" ]; then echo "function ACLs: MATCH ($a)"; else echo "FUNCTION ACLs DIFFER: $a vs $b"; FAIL=1; fi

# 5. NEGATIVE CONTROL. Every comparison above is an equality over two things
#    this script built, so all of them would also pass if both sides were
#    empty or if the comparison read the wrong thing. Break the restored copy
#    on purpose and confirm the SAME comparisons go red.
say "negative control: break the restored copy and re-run the comparisons"
"$BIN/psql" -q -d restored -c "delete from public.coin_transactions where amount = -8" >/dev/null
# THE POLICY IS READ RATHER THAN NAMED. A hardcoded policy name that does not
# exist makes `drop policy if exists` a no-op, the control then reports that
# the comparison "did not notice" damage nobody did, and the honest-looking
# failure is in the instrument. Measured: `profiles_select_own` is not a policy
# in this schema, and that is exactly how this control first went red.
VICTIM=$("$BIN/psql" -At -d restored -c "
	select policyname from pg_policies
	where schemaname='public' and tablename='profiles' order by policyname limit 1")
if [ -z "$VICTIM" ]; then
	echo "NEGATIVE CONTROL CANNOT RUN: no policy on public.profiles to break"; FAIL=1
fi
"$BIN/psql" -q -d restored -c "drop policy \"$VICTIM\" on public.profiles" >/dev/null
echo "  broke: 3 coin rows deleted, policy \"$VICTIM\" dropped"
ctl=0
c1=$("$BIN/psql" -At -d source -c "select count(*) from public.coin_transactions")
c2=$("$BIN/psql" -At -d restored -c "select count(*) from public.coin_transactions")
[ "$c1" != "$c2" ] && ctl=$((ctl+1)) && echo "  count check bites: $c1 vs $c2"
p1=$("$BIN/psql" -At -d source -c "select count(*) from pg_policies where schemaname='public'")
p2=$("$BIN/psql" -At -d restored -c "select count(*) from pg_policies where schemaname='public'")
[ "$p1" != "$p2" ] && ctl=$((ctl+1)) && echo "  policy check bites: $p1 vs $p2"
if [ "$ctl" -ne 2 ]; then echo "NEGATIVE CONTROL FAILED: only $ctl of 2 comparisons noticed"; FAIL=1
else echo "both comparisons noticed the damage"; fi

say "verdict"
if [ "$FAIL" -eq 0 ]; then
	echo "ROUND TRIP OK -- dump.sql.gz $BYTES bytes over $NTABLES public tables"
	exit 0
fi
echo "ROUND TRIP FAILED"
exit 1
