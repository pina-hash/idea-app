#!/usr/bin/env node
/**
 * deploy-probe: ask PRODUCTION which migrations it has actually applied, and
 * answer per migration.
 *
 * IT WRITES NOTHING, EVER. Not to the database (every statement it runs is a
 * `select` over `pg_catalog`, inside one read-only transaction), and not to
 * this repository. It exists to answer one question a workflow could not
 * previously ask, and the answer is printed and returned as an exit status.
 *
 *   node tools/deploy-probe.mjs                     # DEPLOY_PROBE_URL from the env
 *   node tools/deploy-probe.mjs --since 151         # lowest migration to ask about
 *   node tools/deploy-probe.mjs --ref integration   # which ref's migrations
 *   node tools/deploy-probe.mjs --json              # machine-readable
 *   node tools/deploy-probe.mjs --print-sql         # the query, run nothing
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS. `deploy.yml` used to ask a PERSON to type that every
 * migration on `integration` is applied to production, because nothing in this
 * repository recorded applied state, and CI runs against an embedded Postgres
 * with every migration file applied, so a branch whose migration has never
 * touched production is green. Decision 0010 declined an unattended deploy on
 * exactly that. Mr. Pina approved a READ-ONLY Postgres role on 2026-09-03;
 * this reads production's own catalog with it and answers the question that
 * was being asked of him.
 *
 * ---------------------------------------------------------------------------
 * IT ASKS THE DATABASE'S OWN HISTORY FIRST AND THE OBJECTS SECOND, AND THAT
 * ORDER IS THE WHOLE OF WHAT `0209` BOUGHT.
 *
 * Until `supabase/data/0209-seed-migration-history.sql` was pasted, this tool
 * could only INFER an apply: `tools/idea-status.py` derives one catalog probe
 * per migration -- the first object it creates -- and a migration it can
 * derive nothing from got no probe at all, so the answer was status 3, CANNOT
 * SAY. That silence stopped lane after lane at the deploy gate in one week.
 * NO COUNT IS WRITTEN DOWN HERE, deliberately: ledger 0213 said five and
 * ledger 0216 said six, on the same day, from the same tree, and both were
 * counting honestly -- which is the whole argument for pointing at the ledger
 * rather than at a number that decays every time another lane stops. It was
 * unavoidable while nothing recorded what had been applied.
 *
 * `supabase_migrations.schema_migrations` is that record now. This reads it
 * first and asks the objects second, so a migration whose objects cannot be
 * derived is answered by the row instead of by a shrug.
 *
 * WHICH ONE IS BELIEVED WHEN THEY DISAGREE, AND WHY:
 *
 *   A ROW IS A CLAIM. THE OBJECT IS EVIDENCE. THE OBJECT WINS.
 *
 * A row says somebody -- the seed, or `tools/apply-migration.mjs` -- believed
 * a file had been applied. Nothing re-checked it afterwards, and the seed
 * wrote 208 of its rows from the repository's own records rather than from the
 * database. A probe that comes back FALSE is the database itself saying the
 * object is not there. So a row claiming an apply whose object is absent is
 * reported NOT APPLIED (status 2) and the contradiction is named in the output
 * as a CONFLICT, by that word, rather than folded into the NOT APPLIED tally.
 * That is the one failure the seed introduced as a possibility, and keeping
 * the object probes is the only thing that catches it. DO NOT DELETE THEM.
 *
 * AN ABSENT ROW IS SILENCE, NOT A DENIAL, WHICH IS WHY THE ASYMMETRY IS NOT
 * INCONSISTENT. The table is not exhaustive by construction: the seed stops at
 * `0211`, and any migration pasted by hand afterwards leaves no row behind. So
 * a missing row plus a TRUE probe is APPLIED -- with the gap named, because
 * `.github/workflows/migrate.yml` reads that table to decide what to apply
 * next -- while a present row plus a FALSE probe is a contradiction.
 *
 * AND STATUS 3 STILL MEANS CANNOT CONFIRM. A row is not a licence to answer
 * "applied" where nothing was checked, only a licence to answer where the
 * MACHINE previously had nothing to say: no row AND no probe is still 3, and
 * a database with no history table at all answers exactly as it did before
 * this bundle, probe by probe, 3 included.
 *
 * ---------------------------------------------------------------------------
 * READING THAT TABLE IS TWO ROUND TRIPS AND MUST BE, BECAUSE THE ROLE HOLDS NO
 * GRANTS. `supabase_migrations.schema_migrations` is an ordinary table, not a
 * catalog, so a role created for this job with nothing but CONNECT cannot
 * select from it -- and a `select` it may not run raises `permission denied`
 * at executor startup, which aborts the single transaction the object probes
 * ride in and would take the WHOLE answer down with it. A `case` guard does
 * not help: the permission is checked for every range table in the statement,
 * not per branch. So the existence and the privilege are asked of `pg_catalog`
 * FIRST (`buildHistorySql`), and the rows are read only if that came back
 * readable (`buildHistoryVersionsSql`).
 *
 * A FAILURE OF EITHER DEGRADES TO THE OBJECT PROBES RATHER THAN FAILING THE
 * RUN, and says so on stderr. That is the select-ladder shape this repository
 * already uses everywhere else: the widest rung first, one rung narrower on
 * failure, and the narrowest rung is exactly what this tool did before the
 * table existed.
 *
 * THE REJECTED ALTERNATIVE, WRITTEN DOWN BECAUSE IT IS THE REASONABLE ONE.
 * A failure AFTER the preflight said readable is an anomaly rather than an
 * ordinary state, so answering it with `cannotRun` (exit 1) instead of a rung
 * down is defensible and was independently argued for. It is not taken,
 * because the narrowest rung is not a weaker answer -- it is the pre-seed
 * answer, which fails closed by construction: a migration with no probe comes
 * back CANNOT SAY (status 3), which is not a pass, and one whose probe ran is
 * answered by evidence. So exit 1 would refuse runs the object probes can
 * still answer correctly and buys nothing the stderr line does not already
 * say. What the preflight's PRIVILEGE check bought is exactly this: "present
 * but not readable" is now a known state detected before the select, so the
 * ladder is not being used to paper over an unexamined failure.
 *
 * ---------------------------------------------------------------------------
 * EVERY ROW THIS TOOL READS BACK CARRIES A LABEL IN ITS FIRST FIELD, AND THAT
 * IS A GUARD RATHER THAN A CONVENTION. `psql` prints a statement's COMMAND TAG
 * on stdout, and `--tuples-only` does NOT suppress it: `set transaction read
 * only;` contributes a bare line reading `SET` ahead of the rows. The object
 * probes never noticed, because they discard any line that is not
 * `<int>|<t|f>`; the history read had no such shape and silently gained an
 * extra "version" called `SET`, which matched no migration and inflated every
 * count printed.
 *
 * `--quiet` also fixes it and is NOT what is used here. The flag is one edit
 * away from being dropped by somebody tidying an argument list, and nothing
 * would fail loudly when it went; a labelled row cannot be mistaken for a tag
 * whatever flags are passed, which is the same reason `runSql` has never had
 * this problem. So `buildHistorySql` and `buildHistoryVersionsSql` each emit a
 * literal key column and `readHistory` matches on it, and the flag is left off
 * so the guard is exercised by every real run rather than sitting behind a
 * suppressor. Measured against a real Postgres in
 * `tests/db/deploy-probe-history-live.test.ts`, in both directions.
 *
 * ---------------------------------------------------------------------------
 * `information_schema` IS PRIVILEGE-FILTERED AND `pg_catalog` IS NOT, AND THAT
 * ONE FACT DECIDES THE WHOLE SHAPE OF THIS FILE.
 *
 * `information_schema.columns` shows a column only when the querying role
 * holds SOME privilege on the table. A role created for this job holds
 * nothing but CONNECT, so every `information_schema` probe answers FALSE for
 * it -- not an error, not an empty result set anybody would notice, just
 * `false`. A probe built on it therefore reports every migration unapplied and
 * blocks the deploy forever, or (read the other way round) reports the inverse
 * and deploys wrongly. `pg_catalog`'s tables are readable by PUBLIC and are
 * not row-filtered by privilege.
 *
 * `tools/idea-status.py` derives one probe per migration and three of them --
 * every `alter table ... add column` -- read `information_schema.columns`.
 * Those three are TRANSLATED here, in `toCatalogOnly`, from the same three SQL
 * literals the derivation already put in them, into the `pg_attribute`
 * equivalent. Anything else naming `information_schema` in a shape this does
 * not recognise is REFUSED rather than run, because a probe whose answer
 * depends on a grant nobody made is worse than no probe.
 *
 * ---------------------------------------------------------------------------
 * THE DERIVATION IS NOT DUPLICATED HERE. `tools/idea-status.py` already turns
 * a migration file into a catalog probe -- the first object it creates, plus a
 * body marker for a function another migration in the range also defines --
 * and that is the only implementation. This runs it (`--json --local`), reads
 * its `probes` array, translates the three column probes, and executes them. A
 * second derivation is the thing that quietly stops matching.
 *
 * ---------------------------------------------------------------------------
 * IT FAILS CLOSED, and "closed" means an exit status the caller must not read
 * as a pass:
 *
 *   0  every migration in range is APPLIED. Nothing is unknown.
 *   2  at least one migration is NOT applied. The deploy must not run.
 *   3  nothing came back NOT applied, but at least one migration has neither a
 *      history row nor a probe that ran, so the machine cannot speak for it.
 *      NOT a pass.
 *   1  the probe could not run at all: no connection string, no `psql`, an
 *      unreachable database, a query error, `idea-status.py` unreadable. NOT
 *      a pass either.
 *
 * An unknown is never reported as applied, in any of those. Status 2 now has
 * two causes rather than one -- a probe that came back false, and a probe that
 * came back false while a history row claimed otherwise -- and the second is
 * printed in words rather than folded into the first.
 *
 * ---------------------------------------------------------------------------
 * IT PRINTS PER MIGRATION AND NEVER A BARE COUNT, because a verification
 * result names the identity of what it examined. The summary line is a summary
 * of the rows above it, not a substitute for them.
 *
 * ---------------------------------------------------------------------------
 * THE CONNECTION STRING IS READ FROM `DEPLOY_PROBE_URL` AND IS NEVER PRINTED,
 * not in a message, not in an error, not in `--json`. `psql` is invoked with
 * the URL in its ARGUMENT LIST rather than interpolated into a shell string,
 * and there is no shell in the path at all (`execFileSync`, no `shell: true`).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
export const STATUS_TOOL = 'tools/idea-status.py';

/** The environment variable holding the read-only connection string. */
export const URL_VAR = 'DEPLOY_PROBE_URL';

/** Exit statuses, named so `deploy.yml` and the tests read the same words. */
export const EXIT = {
	allApplied: 0,
	cannotRun: 1,
	notApplied: 2,
	cannotConfirm: 3
};

/* ------------------------------------------------------------------------ */
/* The database's own record of what it has applied.                         */
/* ------------------------------------------------------------------------ */

/**
 * The Supabase CLI's own history table, seeded once by
 * `supabase/data/0209-seed-migration-history.sql` and kept current by
 * `tools/apply-migration.mjs`. Written down HERE ONCE and read from this
 * constant by every statement below, so a rename is one edit.
 */
export const HISTORY_TABLE = 'supabase_migrations.schema_migrations';

/**
 * THE LABEL EVERY HISTORY ROW CARRIES IN ITS FIRST FIELD. See this file's
 * header for why this is a label rather than a `--quiet` flag: `psql` prints a
 * bare `SET` command tag that `--tuples-only` does not suppress, and a reader
 * that took the first non-empty line as its answer read the tag. A label
 * cannot be mistaken for one whatever arguments `psql` is given.
 *
 * The two keys are DIFFERENT STRINGS on purpose: the two statements are sent
 * separately, but a single matcher that accepted either would let a versions
 * row satisfy the preflight and vice versa, which is the class of mistake the
 * label exists to close rather than to relocate.
 */
export const HISTORY_KEY = 'history-table';
export const VERSION_KEY = 'history-version';

/**
 * The two readers of that label. They match on the FIELDS `runSqlRaw` already
 * split rather than on a re-joined line, which is strictly stronger: a version
 * string containing a `|` cannot confuse a field comparison, and it can
 * confuse a line-anchored pattern.
 *
 * @param {string[]} f
 */
function presenceRow(f) {
	return f.length === 3 && f[0] === HISTORY_KEY && /^[tf]$/.test(f[1]) && /^[tf]$/.test(f[2]);
}

/** @param {string[]} f */
function versionRow(f) {
	return f.length === 2 && f[0] === VERSION_KEY;
}

/**
 * @typedef {{ present: boolean, readable: boolean, versions: Set<string> | null, why: string }} History
 */

/**
 * What a run with no usable history looks like. `versions: null` is the thing
 * every reader branches on and it means THE RECORD CANNOT SPEAK -- no table,
 * no read privilege, or the read failed -- which is not the same as a table
 * that is there and holds no row for a migration. `verdicts` treats the two
 * completely differently and a caller that collapsed them into an empty Set
 * would report every migration unrecorded on a database that simply refused
 * the select.
 *
 * @returns {History}
 */
export function noHistory(why = 'not read') {
	return { present: false, readable: false, versions: null, why };
}

/**
 * CATALOG ONLY, AND IT HAS TO BE. This asks whether the history table exists
 * and whether this role may select from it, WITHOUT naming it as a range table
 * -- because naming a table a role cannot read raises `permission denied` at
 * executor startup, and this tool's whole point is to run as a role that holds
 * nothing but CONNECT.
 *
 * IT ASKS `pg_class` RATHER THAN `to_regclass`, AND THAT IS A MEASUREMENT
 * RATHER THAN A PREFERENCE. `to_regclass` resolves a NAME, and resolving a
 * qualified name needs USAGE on its schema -- so for exactly the role this
 * tool is built for it answers NULL for a table that is sitting right there,
 * and the tool would report "not on this database, paste the seed" about a
 * database that already has it. Measured: a role with CONNECT and no schema
 * USAGE read `present: false` through `to_regclass` and `present: true`
 * through this. `pg_class` and `pg_namespace` are readable by PUBLIC and are
 * not filtered by either privilege, which is the same fact the
 * `information_schema` section above turns on.
 *
 * READABLE IS TWO PRIVILEGES, NOT ONE. `has_table_privilege` answers about the
 * TABLE's own ACL and says nothing about the schema, so a role granted SELECT
 * on the table and nothing on `supabase_migrations` would read `true` here and
 * then fail the actual select with `permission denied for schema`. Both are
 * asked, and `readable` is the conjunction.
 *
 * @returns {string}
 */
export function buildHistorySql() {
	const [schema, table] = HISTORY_TABLE.split('.');
	// A SCALAR SUBQUERY, NOT A JOINED ONE. A derived table that matches nothing
	// contributes NO ROW, so the whole statement would come back empty on the
	// pre-seed database -- which `readHistory` correctly reads as "the
	// preflight returned no row" and would then report as an instrument fault
	// rather than as the ordinary absence it is. A scalar subquery answers NULL
	// and the statement always returns exactly one row.
	return (
		'set transaction read only;\n' +
		`select ${sqlLit(HISTORY_KEY)} as k,\n` +
		'       (t.oid is not null) as present,\n' +
		'       coalesce(t.oid is not null\n' +
		`                and pg_catalog.has_schema_privilege(current_user, ${sqlLit(schema)}, 'usage')\n` +
		"                and pg_catalog.has_table_privilege(current_user, t.oid, 'select'), false) as readable\n" +
		'from (select (select c.oid from pg_catalog.pg_class c\n' +
		'              join pg_catalog.pg_namespace n on n.oid = c.relnamespace\n' +
		`              where n.nspname = ${sqlLit(schema)} and c.relname = ${sqlLit(table)}\n` +
		"                and c.relkind in ('r','p','v','m','f') limit 1) as oid) as t;"
	);
}

/**
 * The rows, run ONLY after `buildHistorySql` came back readable. One column,
 * because `version` is the only thing any verdict here turns on -- `name` is
 * the CLI's label and `statements` is deliberately null for every row the seed
 * wrote, so reading either would be reading something this tool cannot use.
 *
 * @returns {string}
 */
export function buildHistoryVersionsSql() {
	return (
		'set transaction read only;\n' +
		`select ${sqlLit(VERSION_KEY)} as k, version from ${HISTORY_TABLE}\n` +
		' group by version order by version;'
	);
}

/**
 * A version as the two sides spell it, reduced to one form.
 *
 * The seed and `tools/apply-migration.mjs` both write the four-digit file
 * number (`0100`), and `idea-status.py` derives `num` the same way, so these
 * agree today. They are normalized anyway because the cost of a mismatch is
 * asymmetric and silent: an unmatched row reads as "no row", which is a
 * CANNOT SAY rather than a wrong answer, so nobody would ever see it. An
 * all-digits version loses its leading zeros; anything else (a CLI-style
 * `20260913000000`, which nothing here writes but the table's own convention
 * allows) is compared as it stands.
 *
 * @param {string} v
 * @returns {string}
 */
export function normalizeVersion(v) {
	const t = (v ?? '').trim();
	return /^\d+$/.test(t) ? String(Number(t)) : t;
}

/**
 * Read the record, degrading one rung at a time. EVERY failure below answers
 * `noHistory` with a reason rather than throwing: the object probes are the
 * narrowest rung of this ladder and they are exactly what this tool ran before
 * the table existed, so a database that cannot answer the history question
 * still gets the whole answer it used to get.
 *
 * @param {string} url
 * @param {(sql: string, url: string) => ReturnType<typeof runSqlRaw>} [run]
 * @returns {History}
 */
export function readHistory(url, run = runSqlRaw) {
	const pre = run(buildHistorySql(), url);
	if (!pre.ok) return noHistory(`the history table could not be asked about (${pre.why})`);
	// THE LABEL IS WHAT IS LOOKED FOR, not "the first line with enough fields".
	// psql's bare `SET` command tag is on stdout ahead of this row and
	// `--tuples-only` does not remove it; see the header.
	const line = pre.rows.find(presenceRow);
	if (!line) return noHistory('the history preflight returned no labelled row');
	const present = line[1] === 't';
	const readable = line[2] === 't';
	if (!present) {
		return {
			present: false,
			readable: false,
			versions: null,
			why: `${HISTORY_TABLE} is not on this database, so every answer below is the object probe's. That is the state BEFORE supabase/data/0209-seed-migration-history.sql is pasted, and it is not an error.`
		};
	}
	if (!readable) {
		return {
			present: true,
			readable: false,
			versions: null,
			why: `${HISTORY_TABLE} is there and this role may not select from it, so every answer below is the object probe's.`
		};
	}
	const got = run(buildHistoryVersionsSql(), url);
	if (!got.ok) {
		return {
			present: true,
			readable: true,
			versions: null,
			why: `${HISTORY_TABLE} could not be read (${got.why}), so every answer below is the object probe's.`
		};
	}
	const versions = new Set(
		got.rows
			.filter(versionRow)
			.map((r) => normalizeVersion(r[1]))
			.filter((v) => v !== '')
	);
	return {
		present: true,
		readable: true,
		versions,
		why: `${HISTORY_TABLE} carries ${versions.size} row(s).`
	};
}

/* ------------------------------------------------------------------------ */
/* The one translation: information_schema -> pg_catalog.                    */
/* ------------------------------------------------------------------------ */

/**
 * The shape `idea-status.py` emits for an `alter table ... add column`, with
 * its three SQL literals in a fixed order (schema, table, column). Nothing
 * else in that tool reads `information_schema`, and anything that does not
 * match this exactly is refused rather than rewritten.
 */
const COLUMN_PROBE_RE =
	/^exists \(select 1 from information_schema\.columns where table_schema = '((?:[^']|'')*)' and table_name = '((?:[^']|'')*)' and column_name = '((?:[^']|'')*)'\)$/;

/** @param {string} s */
function sqlLit(s) {
	return "'" + s.replace(/'/g, "''") + "'";
}

/**
 * Rewrite one probe so it reads `pg_catalog` only.
 *
 * `attnum > 0` excludes the system columns and `not attisdropped` excludes a
 * column that was dropped -- neither of which `information_schema.columns`
 * would have shown either, so this is the same question asked of a catalog
 * that answers it for a role with no grants.
 *
 * @param {string} sql
 * @returns {{ ok: true, sql: string, changed: boolean } | { ok: false, why: string }}
 */
export function toCatalogOnly(sql) {
	if (!/information_schema/i.test(sql)) return { ok: true, sql, changed: false };
	const m = COLUMN_PROBE_RE.exec(sql.trim());
	if (!m) {
		return {
			ok: false,
			why: 'names information_schema in a shape this tool does not know how to ask of pg_catalog'
		};
	}
	const [, schema, table, column] = m;
	return {
		ok: true,
		changed: true,
		sql:
			'exists (select 1 from pg_catalog.pg_attribute a ' +
			'join pg_catalog.pg_class c on c.oid = a.attrelid ' +
			'join pg_catalog.pg_namespace n on n.oid = c.relnamespace ' +
			`where n.nspname = ${sqlLit(schema)} and c.relname = ${sqlLit(table)} ` +
			`and a.attname = ${sqlLit(column)} and a.attnum > 0 and not a.attisdropped)`
	};
}

/* ------------------------------------------------------------------------ */
/* Reading the derivation.                                                   */
/* ------------------------------------------------------------------------ */

/**
 * @typedef {{ num: string, file: string, kind: string, object: string, sql: string | null }} RawProbe
 * @typedef {{ num: string, file: string, kind: string, object: string, sql: string | null,
 *             translated: boolean, refused: string | null }} Probe
 */

/**
 * Run `tools/idea-status.py --json` against a local clone and return its probe
 * list. That tool exits 1 when two migrations define one object, which is a
 * FINDING and not a failure, so only a status it does not use (anything above
 * 1) and unparseable output are treated as errors.
 *
 * @param {{ root?: string, since: number, ref: string }} opts
 * @returns {RawProbe[]}
 */
export function readProbes({ root = REPO_ROOT, since, ref }) {
	let out;
	try {
		out = execFileSync(
			'python3',
			[STATUS_TOOL, '--local', root, '--json', '--since', String(since)],
			{ cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
		);
	} catch (err) {
		const e = /** @type {{ status?: number, stdout?: string }} */ (err);
		if (e.status !== 1 || !e.stdout) {
			throw new Error(`${STATUS_TOOL} could not be read (exit ${e.status ?? '?'})`);
		}
		out = e.stdout;
	}
	/** @type {{ probes?: RawProbe[], migrations?: { rows?: { num: string, file: string }[] } }} */
	const data = JSON.parse(out);
	if (!Array.isArray(data.probes)) throw new Error(`${STATUS_TOOL} returned no probe list`);

	// THE REF IS ASSERTED, NOT ASSUMED. `idea-status.py` reads `origin/main`,
	// which is where migrations land by rule (CLAUDE.md: "Never put a migration
	// on a branch"). If the ref under test carries a migration file `main` does
	// not, that rule was broken and this says so rather than probing a set that
	// is missing one.
	const extra = migrationsOnlyOn(root, ref);
	for (const file of extra) {
		data.probes.push({
			num: (/^(\d{4})/.exec(file) ?? [, '????'])[1] ?? '????',
			file,
			kind: 'off-main',
			object: `only on ${ref}, not on origin/main; no probe was derived for it`,
			sql: null
		});
	}
	return data.probes;
}

/**
 * Migration files present on `ref` and absent from `origin/main`.
 * @param {string} root
 * @param {string} ref
 * @returns {string[]}
 */
export function migrationsOnlyOn(root, ref) {
	const ls = (/** @type {string} */ r) => {
		const p = spawnSync('git', ['ls-tree', '-r', '--name-only', r, '--', 'supabase/migrations'], {
			cwd: root,
			encoding: 'utf8'
		});
		if (p.status !== 0) throw new Error(`could not list supabase/migrations on ${r}`);
		return p.stdout.split('\n').filter(Boolean).map((l) => l.replace(/^.*\//, ''));
	};
	const onMain = new Set(ls('origin/main'));
	return ls(ref).filter((f) => /^\d{4}_/.test(f) && !onMain.has(f));
}

/**
 * Translate every probe, marking the ones this tool refuses to run.
 * @param {RawProbe[]} raw
 * @returns {Probe[]}
 */
export function prepare(raw) {
	return raw.map((p) => {
		if (!p.sql) return { ...p, translated: false, refused: null };
		const t = toCatalogOnly(p.sql);
		if (!t.ok) return { ...p, sql: null, translated: false, refused: t.why };
		return { ...p, sql: t.sql, translated: t.changed, refused: null };
	});
}

/* ------------------------------------------------------------------------ */
/* Running them.                                                             */
/* ------------------------------------------------------------------------ */

/**
 * ONE STATEMENT, ONE ROUND TRIP, ONE ROW PER PROBE. A probe is a boolean
 * expression, so this asks all of them at once and reads `true`/`false` back
 * beside the index it was sent under -- rather than a `union all` of only the
 * TRUE ones, which cannot tell a false probe from a probe that was never run.
 *
 * `set transaction read only` is belt to the role's braces: the role has no
 * write privilege anywhere, and this additionally makes a write impossible.
 *
 * @param {Probe[]} probes
 * @returns {string}
 */
export function buildSql(probes) {
	const rows = probes
		.map((p, i) => (p.sql ? `  select ${i} as i, (${p.sql}) as applied` : null))
		.filter((s) => s !== null);
	if (rows.length === 0) return '';
	return (
		'set transaction read only;\n' +
		'select i, applied from (\n' +
		rows.join('\n  union all\n') +
		'\n) as probe order by i;'
	);
}

/**
 * ONE `psql`, ONE STATEMENT STRING, ROWS BACK AS PIPE-SPLIT FIELDS. Every
 * query this tool runs goes through here, so there is exactly one place that
 * knows how the process is spawned and how a failure is worded -- and, more to
 * the point, exactly one place that could ever put the connection string
 * somewhere it is printed.
 *
 * @param {string} sql
 * @param {string} url
 * @returns {{ ok: true, rows: string[][] } | { ok: false, why: string }}
 */
export function runSqlRaw(sql, url) {
	// THERE IS DELIBERATELY NO `--quiet` HERE. psql prints each non-SELECT
	// statement's COMMAND TAG on stdout even under `--tuples-only`, so
	// `set transaction read only;` contributes a bare line reading `SET` ahead
	// of the rows -- measured: `"SET\n0001\n0002\n"` against `"0001\n0002\n"`
	// with the flag. `--quiet` removes it and is not the fix taken, because a
	// flag is one tidy-up away from being dropped with nothing failing loudly
	// when it goes. EVERY CALLER GUARDS ON THE SHAPE OF ITS OWN ROWS INSTEAD:
	// `runSql` has always required `<int>|<t|f>`, and the history statements
	// each carry a literal key column that `presenceRow`/`versionRow` check.
	// The flag is left off so those guards are exercised by every real run.
	const psql = spawnSync(
		'psql',
		[url, '--no-psqlrc', '--tuples-only', '--no-align', '--field-separator=|',
		 '--set=ON_ERROR_STOP=1', '--single-transaction', '--command', sql],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	);
	if (psql.error) {
		// ENOENT here is `psql` not being installed. The message is the tool's,
		// never the URL's. `code` is on the error at runtime and not in
		// `Error`'s type, so it is read through a narrowing cast rather than
		// widened away.
		const e = /** @type {Error & { code?: string }} */ (psql.error);
		return { ok: false, why: `psql could not be run (${e.code ?? e.message})` };
	}
	if (psql.status !== 0) {
		return { ok: false, why: `psql exited ${psql.status}: ${redact(psql.stderr, url)}` };
	}
	const rows = psql.stdout
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '')
		.map((l) => l.split('|'));
	return { ok: true, rows };
}

/**
 * The object probes, read back as `index -> boolean`. A line that does not
 * match the shape sent is DROPPED rather than guessed at, which is what makes
 * "no row came back for this probe" a state `verdicts` can report instead of a
 * value it has to invent.
 *
 * @param {string} sql
 * @param {string} url
 * @returns {{ ok: true, rows: Map<number, boolean> } | { ok: false, why: string }}
 */
export function runSql(sql, url) {
	const raw = runSqlRaw(sql, url);
	if (!raw.ok) return raw;
	/** @type {Map<number, boolean>} */
	const rows = new Map();
	for (const fields of raw.rows) {
		if (fields.length !== 2) continue;
		if (!/^\d+$/.test(fields[0]) || !/^[tf]$/.test(fields[1])) continue;
		rows.set(Number(fields[0]), fields[1] === 't');
	}
	return { ok: true, rows };
}

/**
 * A connection string can appear inside libpq's own error text. Nothing this
 * tool prints may carry it.
 * @param {string} text
 * @param {string} url
 */
export function redact(text, url) {
	let out = (text ?? '').trim();
	if (url) out = out.split(url).join('<connection string>');
	// And the password on its own, in case libpq echoed a rebuilt form.
	const pw = /:\/\/[^:/@]*:([^@]*)@/.exec(url ?? '');
	if (pw && pw[1]) out = out.split(pw[1]).join('<redacted>');
	return out;
}

/* ------------------------------------------------------------------------ */
/* The verdict.                                                              */
/* ------------------------------------------------------------------------ */

/**
 * `record` is what `HISTORY_TABLE` said about this migration and is NOT the
 * verdict: `recorded` a row is there, `unrecorded` the table is there and has
 * none, `unreadable` the record could not speak at all. `agreement` is how the
 * row and the object compare, and `conflict` is the one value that has to be
 * printed rather than counted.
 *
 * `evidence` is what the OBJECT PROBE said on its own, before the two were
 * combined, so a reader of a finding can always see which half produced the
 * state without re-deriving it -- and so the deploy summary can label each row
 * `catalog` or `history row` without a second copy of that rule.
 *
 * @typedef {'recorded'|'unrecorded'|'unreadable'} Record_
 * @typedef {'applied'|'not-applied'|'unknown'} Evidence
 * @typedef {'agree'|'conflict'|'record-only'|'object-only'|'neither'} Agreement
 * @typedef {{ num: string, file: string, object: string,
 *             state: 'applied'|'not-applied'|'unknown',
 *             record: Record_, evidence: Evidence, agreement: Agreement,
 *             why: string }} Finding
 */

/**
 * THE WHOLE DECISION, IN ONE TABLE, AND THE ASYMMETRY IN THE MIDDLE TWO ROWS
 * IS THE POINT (see this file's header for the argument):
 *
 *   row   object   ->  verdict
 *   ---   ------       -------
 *   yes   true         APPLIED           both agree
 *   yes   false        NOT APPLIED       CONFLICT: the row is a claim, the
 *                                        object is evidence, evidence wins
 *   yes   (none)       APPLIED           the row is the only evidence there
 *                                        is, and this is what 0209 bought
 *   no    true         APPLIED           an absent row is silence, not a
 *                                        denial; the gap is named
 *   no    false        NOT APPLIED       both agree
 *   no    (none)       CANNOT SAY        status 3, unchanged
 *   --    true         APPLIED           no readable record: exactly what this
 *   --    false        NOT APPLIED       tool did before the table existed,
 *   --    (none)       CANNOT SAY        probe by probe, 3 included
 *
 * `history` is OPTIONAL and defaults to "the record cannot speak", so
 * `tools/apply-migration.mjs` -- which calls this with two arguments and reads
 * the history table itself, for its own different purpose -- keeps exactly the
 * behaviour it had. Widening this signature additively rather than changing it
 * is what makes that true without editing that file.
 *
 * @param {Probe[]} probes
 * @param {Map<number, boolean>} rows
 * @param {History} [history]
 * @returns {Finding[]}
 */
export function verdicts(probes, rows, history = noHistory()) {
	// THE LOOKUP OWNS THE NORMALIZATION, so no caller can hand this a set it
	// silently fails to match against. `readHistory` already normalizes what it
	// reads and `normalizeVersion` is idempotent, so doing it again here costs
	// one pass over ~200 strings and removes an invariant that would otherwise
	// live in the caller -- where getting it wrong reports every migration
	// unrecorded, which reads as a CANNOT SAY and is therefore never noticed.
	const known =
		history.versions === null ? null : new Set([...history.versions].map(normalizeVersion));
	return probes.map((p, i) => {
		/** Three-valued on purpose: `null` is "the record cannot speak". */
		const claimed = known === null ? null : known.has(normalizeVersion(p.num));
		/** Three-valued on purpose: `null` is "no probe ran". */
		const evidence = !p.sql ? null : rows.has(i) ? rows.get(i) === true : null;

		const noProbeWhy = !p.sql
			? (p.refused ?? 'no probeable object could be derived from this migration')
			: 'the probe was sent and no row came back for it';

		/** @type {Record_} */
		const record = claimed === null ? 'unreadable' : claimed ? 'recorded' : 'unrecorded';
		/** @type {Evidence} */
		const evidenceState =
			evidence === null ? 'unknown' : evidence ? 'applied' : 'not-applied';
		const base = { num: p.num, file: p.file, object: p.object, record, evidence: evidenceState };

		if (evidence === true) {
			// `object-only` covers BOTH a readable record that has no row and a
			// record that could not speak: in each, the object is the only thing
			// that answered. They are told apart by `record`, which is the field
			// that says WHY, and only the first is worth a sentence.
			/** @type {Agreement} */
			const how = claimed === true ? 'agree' : 'object-only';
			return {
				...base,
				state: /** @type {const} */ ('applied'),
				agreement: how,
				why:
					claimed === false
						? `the object is there, and ${HISTORY_TABLE} carries no row for it. An absent row is silence rather than a denial, so this is APPLIED -- but the record is behind, and .github/workflows/migrate.yml reads that table to choose what to apply next.`
						: ''
			};
		}

		if (evidence === false) {
			return claimed === true
				? {
						...base,
						state: /** @type {const} */ ('not-applied'),
						agreement: /** @type {const} */ ('conflict'),
						why: `CONFLICT: ${HISTORY_TABLE} CLAIMS this was applied and the object it creates is NOT there. A row is a claim and the object is evidence, so this is NOT APPLIED. Either the apply did not happen, or a later migration moved the object this probe was derived from.`
					}
				: {
						...base,
						state: /** @type {const} */ ('not-applied'),
						agreement: /** @type {const} */ ('agree'),
						why: ''
					};
		}

		// NO PROBE RAN. The row is now the only thing there is to go on, and
		// where there is no row either this stays the CANNOT SAY it has always
		// been.
		return claimed === true
			? {
					...base,
					state: /** @type {const} */ ('applied'),
					agreement: /** @type {const} */ ('record-only'),
					why: `recorded in ${HISTORY_TABLE}. ${noProbeWhy}, so the row is the only evidence and nothing contradicts it.`
				}
			: {
					...base,
					state: /** @type {const} */ ('unknown'),
					agreement: /** @type {const} */ ('neither'),
					why:
						claimed === false
							? `${noProbeWhy}, and ${HISTORY_TABLE} carries no row for it either.`
							: noProbeWhy
				};
	});
}

/** @param {Finding[]} f */
export function exitFor(f) {
	if (f.some((x) => x.state === 'not-applied')) return EXIT.notApplied;
	if (f.some((x) => x.state === 'unknown')) return EXIT.cannotConfirm;
	return EXIT.allApplied;
}

/* ------------------------------------------------------------------------ */
/* CLI.                                                                      */
/* ------------------------------------------------------------------------ */

/** @param {string[]} argv */
export function parseArgs(argv) {
	const o = { since: 151, ref: 'origin/integration', json: false, printSql: false };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--since') o.since = Number.parseInt(argv[++i], 10);
		else if (a === '--ref') o.ref = argv[++i];
		else if (a === '--json') o.json = true;
		else if (a === '--print-sql') o.printSql = true;
		else throw new Error(`unknown argument: ${a}`);
	}
	if (!Number.isInteger(o.since)) throw new Error('--since needs a whole number');
	return o;
}

/**
 * WHICH HALF ANSWERED THIS ROW, IN ONE PLACE. The text report prints it as a
 * column and `.github/workflows/deploy.yml` prints it in the job summary; both
 * read this rather than each re-deriving "was it the catalog or the row",
 * which is exactly the kind of small rule that stops matching.
 *
 * @param {Finding} f
 * @returns {'catalog'|'history row'|'--'}
 */
export function readFrom(f) {
	if (f.evidence !== 'unknown') return 'catalog';
	return f.state === 'applied' ? 'history row' : '--';
}

/**
 * @param {Finding[]} findings
 * @param {number} code
 * @param {History} history
 */
function reportText(findings, code, history) {
	// THE SOURCE IS NAMED BEFORE THE ROWS, because the same table of verdicts
	// means two different things depending on whether the record was readable,
	// and a reader who cannot tell which will read a wall of APPLIED as
	// stronger evidence than it is.
	// THREE COLUMNS BEFORE THE OBJECT, AND EACH ANSWERS A DIFFERENT QUESTION.
	// `record` is what the table said, `state` is the verdict, and `read from`
	// is which half produced it -- a verdict that does not say what it read is
	// one nobody can audit, which is the same rule as "never a bare count".
	const lines = [
		`record: ${history.why}`,
		'',
		'migration  record      state        read from  object'
	];
	for (const f of findings) {
		const state = { applied: 'APPLIED', 'not-applied': 'NOT APPLIED', unknown: 'CANNOT SAY' }[f.state];
		const rec = { recorded: 'row', unrecorded: 'no row', unreadable: '--' }[f.record];
		const from = readFrom(f);
		lines.push(
			`${f.num.padEnd(9)}  ${rec.padEnd(10)}  ${state.padEnd(11)}  ${from.padEnd(9)}  ${f.object}${f.why ? `  -- ${f.why}` : ''}`
		);
	}
	const n = (/** @type {string} */ k) => findings.filter((f) => f.state === k).length;
	lines.push('');
	lines.push(
		`${findings.length} migration(s) in range: ${n('applied')} applied, ` +
			`${n('not-applied')} NOT applied, ${n('unknown')} the probe cannot speak for.`
	);
	const conflictCount = findings.filter((f) => f.agreement === 'conflict').length;
	if (conflictCount > 0) {
		lines.push(
			`${conflictCount} CONFLICT(S): ${HISTORY_TABLE} claims an apply production's catalog cannot see.`
		);
	}

	// A DISAGREEMENT IS PRINTED, NEVER COUNTED. It is the one finding whose
	// cause somebody has to go and look at, and folding it into the NOT
	// APPLIED tally is how it stops being looked at.
	const conflicts = findings.filter((f) => f.agreement === 'conflict');
	if (conflicts.length > 0) {
		lines.push('');
		lines.push(
			`${conflicts.length} CONFLICT(S): a row in ${HISTORY_TABLE} claims an apply whose object is NOT there:`
		);
		for (const f of conflicts) lines.push(`  ${f.num}  ${f.file}  ${f.object}`);
		lines.push(
			'A row is a claim and the object is evidence. Read each of these before trusting either.'
		);
	}
	const behind = findings.filter((f) => f.agreement === 'object-only' && f.record === 'unrecorded');
	if (behind.length > 0) {
		lines.push('');
		lines.push(
			`${behind.length} migration(s) are applied and have NO row in ${HISTORY_TABLE}: ` +
				behind.map((f) => f.num).join(', ') +
				'. Nothing here is wrong, and the record is behind by that much.'
		);
	}
	const recordOnly = findings.filter((f) => f.agreement === 'record-only');
	if (recordOnly.length > 0) {
		lines.push('');
		lines.push(
			`${recordOnly.length} migration(s) were answered by the record alone, with no object to check: ` +
				recordOnly.map((f) => f.num).join(', ') +
				`. Before ${HISTORY_TABLE} existed every one of these was a CANNOT SAY.`
		);
	}

	lines.push('');
	lines.push(
		code === EXIT.allApplied
			? 'Every migration in range is applied to the probed database.'
			: code === EXIT.notApplied
				? 'REFUSING: at least one migration in range is not applied.'
				: 'REFUSING: the probe cannot confirm every migration in range.'
	);
	return lines.join('\n');
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	/** @type {Probe[]} */
	let probes;
	try {
		probes = prepare(readProbes({ since: opts.since, ref: opts.ref }));
	} catch (err) {
		console.error(`deploy-probe: ${/** @type {Error} */ (err).message}`);
		return EXIT.cannotRun;
	}

	const sql = buildSql(probes);

	if (opts.printSql) {
		// BOTH STATEMENTS, LABELLED, because there are two now and a reader
		// pasting only the second would be pasting the half that was already
		// there. The versions read is shown too, even though it is only sent
		// when the preflight says readable -- what this flag is for is reading
		// the SQL, not predicting the run.
		process.stdout.write(
			`-- 1. is ${HISTORY_TABLE} there, and may this role read it\n` +
				buildHistorySql() +
				`\n\n-- 2. its rows, sent only if the answer above was readable\n` +
				buildHistoryVersionsSql() +
				'\n\n-- 3. the object probes\n' +
				(sql ? sql + '\n' : '-- no probeable migration in range\n')
		);
		return EXIT.allApplied;
	}

	const url = process.env[URL_VAR];
	if (!url) {
		console.error(
			`deploy-probe: ${URL_VAR} is not set, so production's applied set cannot be read. ` +
				'This is "cannot confirm", never "applied".'
		);
		return EXIT.cannotRun;
	}

	// THE WIDEST RUNG FIRST. Every failure inside this degrades to "the record
	// cannot speak" with a reason, never to an exception and never to an empty
	// set of versions -- so the object probes below answer exactly as they did
	// before this table existed.
	const history = readHistory(url);
	if (history.versions === null) console.error(`deploy-probe: ${history.why}`);

	/** @type {Map<number, boolean>} */
	let rows = new Map();
	if (sql) {
		const r = runSql(sql, url);
		if (!r.ok) {
			console.error(`deploy-probe: ${r.why}`);
			return EXIT.cannotRun;
		}
		rows = r.rows;
	}

	const findings = verdicts(probes, rows, history);
	const code = exitFor(findings);
	if (opts.json) {
		process.stdout.write(
			JSON.stringify(
				{
					since: opts.since,
					ref: opts.ref,
					exit: code,
					// The record's STATE travels with the answer. A consumer
					// reading `findings` alone cannot tell a run that had the
					// table from one that did not, and those are two different
					// strengths of the same word.
					history: {
						table: HISTORY_TABLE,
						present: history.present,
						readable: history.readable,
						recorded: history.versions === null ? null : history.versions.size,
						why: history.why
					},
					// `readFrom` IS SERIALIZED RATHER THAN RE-DERIVED BY THE
					// CONSUMER. `.github/workflows/deploy.yml` prints this
					// column in its job summary, and a `jq` expression working
					// it out from `evidence` and `state` would be a second copy
					// of `readFrom`'s rule living in YAML, where nothing type
					// checks it and no test would notice it drifting.
					findings: findings.map((f) => ({ ...f, readFrom: readFrom(f) }))
				},
				null,
				2
			) + '\n'
		);
	} else {
		process.stdout.write(reportText(findings, code, history) + '\n');
	}
	return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then(
		(code) => process.exit(code),
		(err) => {
			console.error(`deploy-probe: ${err?.message ?? err}`);
			process.exit(EXIT.cannotRun);
		}
	);
}
