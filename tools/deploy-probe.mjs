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
 * repository records applied state, and CI runs against an embedded Postgres
 * with every migration file applied, so a branch whose migration has never
 * touched production is green. Decision 0010 declined an unattended deploy on
 * exactly that. Mr. Pina approved a READ-ONLY Postgres role on 2026-09-03;
 * this reads production's own catalog with it and answers the question that
 * was being asked of him.
 *
 * ---------------------------------------------------------------------------
 * IT READS THE MIGRATION HISTORY TABLE FIRST NOW, AND THE OBJECT PROBES ARE
 * STILL THE EVIDENCE.
 *
 * Until 2026-09-13 production had no `supabase_migrations.schema_migrations`
 * table at all, so this tool had nothing to read but the catalog, object by
 * object -- and `tools/idea-status.py` cannot derive a probe from every
 * migration. A data-only fix, a policy-only change, a tombstone: each of those
 * produced a row this tool had to answer CANNOT SAY, which is exit 3, which is
 * not a pass. SIX lanes stopped at that gate. Mr. Pina pasted
 * `supabase/data/0209-seed-migration-history.sql` on 2026-09-13 and the
 * verification came back EQUAL: 209 rows, 0001 through 0211.
 *
 * So the order is: read the table, then run the object probes, then combine
 * per migration. `tools/apply-migration.mjs` inserts a row inside each apply's
 * own transaction, which is what keeps the record from going stale again.
 *
 * WHICH ONE IS TRUSTED WHEN THEY DISAGREE: THE OBJECT PROBE, ALWAYS.
 *
 * A HISTORY ROW IS A CLAIM. Somebody wrote it -- the seed wrote 209 of them
 * from a list a person compiled, and a future `apply-migration.mjs` run writes
 * one because it believes its own apply committed. AN OBJECT PROBE IS
 * EVIDENCE: it asks production's own `pg_catalog` whether the thing the
 * migration creates is there. A row can be wrong in the one direction that
 * matters -- claiming an apply that never happened -- and the object probe is
 * the only check in this repository that catches it. So:
 *
 *   row says applied, probe says NOT applied  -> NOT APPLIED (exit 2).
 *       The claim loses. This is the failure the seed made possible and it is
 *       reported as a CONFLICT, by name, rather than quietly resolved.
 *   row says applied, probe says applied      -> applied. Both agree.
 *   row says applied, NO probe exists         -> applied. Nothing contradicts
 *       the row and nothing else can speak for the migration at all. This is
 *       the case that unblocks the six lanes, and it is the ONLY case in which
 *       a row decides anything on its own.
 *   NO row, probe says applied                -> applied. Evidence outranks a
 *       record that is merely behind (a migration applied by hand before the
 *       table existed, or applied without recording).
 *   NO row, probe says NOT applied            -> NOT APPLIED (exit 2).
 *   NO row, NO probe                          -> CANNOT SAY (exit 3).
 *   no table at all                           -> exactly the pre-seed
 *       behaviour: the object probes alone, and exit 3 wherever one is missing.
 *
 * EXIT 3 THEREFORE STILL EXISTS AND STILL MEANS CANNOT CONFIRM. What the table
 * removed is the case where a migration had no probe AND nothing else to ask;
 * it did not remove the status, and a row is never read as evidence against a
 * probe that ran.
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
 *   3  every probe that ran said applied, but at least one migration has NO
 *      probe AND no history row, so the machine cannot speak for it. NOT a
 *      pass.
 *   1  the probe could not run at all: no connection string, no `psql`, an
 *      unreachable database, a query error, `idea-status.py` unreadable. NOT
 *      a pass either.
 *
 * An unknown is never reported as applied, in any of those.
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
 * @param {string} sql
 * @param {string} url
 * @returns {{ ok: true, rows: Map<number, boolean> } | { ok: false, why: string }}
 */
export function runSql(sql, url) {
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
	/** @type {Map<number, boolean>} */
	const rows = new Map();
	for (const line of psql.stdout.split('\n')) {
		const m = /^(\d+)\|([tf])$/.exec(line.trim());
		if (m) rows.set(Number(m[1]), m[2] === 't');
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
/* The migration history table.                                              */
/* ------------------------------------------------------------------------ */

/**
 * The Supabase CLI's own record of which migration files a database has had
 * applied. Written here by `supabase/data/0209-seed-migration-history.sql`
 * (once, by hand) and kept current by `tools/apply-migration.mjs`, which
 * inserts one row inside each apply's own transaction.
 *
 * The name is spelled once, here. `tools/apply-migration.mjs` has its own
 * `HISTORY_TABLE` for its INSERT; these are two different statements about the
 * same table rather than one rule written twice, and neither imports the
 * other's copy because a read and a write need nothing from each other.
 */
export const HISTORY_TABLE = 'supabase_migrations.schema_migrations';

/** Its two halves, split once, because the catalog lookup needs them apart. */
const [HISTORY_SCHEMA, HISTORY_NAME] = HISTORY_TABLE.split('.');

/**
 * IS THE TABLE THERE, AND MAY THIS ROLE READ IT. Asked separately, and asked
 * FIRST, because a `select` naming a relation this role cannot reach fails
 * before any row is produced -- so it cannot be guarded inside the same
 * statement, and under `--single-transaction` with `ON_ERROR_STOP=1` it would
 * abort the object probes with it.
 *
 * IT ASKS `pg_catalog` RATHER THAN `to_regclass`, AND THAT IS A MEASUREMENT
 * RATHER THAN A PREFERENCE. `to_regclass` resolves a NAME, and resolving a
 * qualified name needs USAGE on its schema. It does NOT answer null for a
 * schema the role cannot reach -- **it RAISES**. Measured on a real Postgres,
 * as a role holding CONNECT and nothing else, against a database where this
 * table exists with 208 rows in it:
 *
 *   to_regclass('supabase_migrations.schema_migrations')
 *     -> ERROR: permission denied for schema supabase_migrations
 *   the pg_class lookup below
 *     -> present: true
 *
 * That role is not a hypothetical, it is the one this whole file is built for
 * (see the `information_schema` section: "A role created for this job holds
 * nothing but CONNECT"). Through `to_regclass` the presence query raises, the
 * read fails, and `readHistory` correctly reports `cannotRun` -- so the tool
 * exits 1 and EVERY DEPLOY STOPS, on a database that is perfectly reachable
 * and perfectly correct. `pg_class` and `pg_namespace` are readable by PUBLIC
 * and are filtered by neither privilege, which is the same fact the
 * `information_schema` section above turns on.
 *
 * READABLE IS TWO PRIVILEGES, NOT ONE, and it is asked here rather than
 * discovered by the read failing. `has_table_privilege` answers about the
 * TABLE's own ACL and says nothing about the schema, so a role granted SELECT
 * on the table and nothing on `supabase_migrations` would pass a table-only
 * check and then fail the real select with `permission denied for schema`.
 * Both are asked, and `readable` is the conjunction.
 *
 * A SCALAR SUBQUERY, NOT A JOINED ONE: a derived table that matches nothing
 * contributes NO ROW, so on a pre-seed database the whole statement would come
 * back empty and `readHistory` would report that it could not tell -- which is
 * `cannotRun` -- instead of the ordinary `absent` it is.
 *
 * ABSENT IS A SUPPORTED STATE, not a failure: it is what every database in
 * this project answered before 2026-09-13, and what a fresh local stack
 * answers today. So is UNREADABLE.
 */
export const HISTORY_PRESENCE_SQL =
	'set transaction read only;\n' +
	"select 'history-table' as k,\n" +
	"       case when t.oid is null then 'absent'\n" +
	`            when pg_catalog.has_schema_privilege(current_user, '${HISTORY_SCHEMA}', 'usage')\n` +
	"             and pg_catalog.has_table_privilege(current_user, t.oid, 'select') then 'present'\n" +
	"            else 'unreadable' end as v\n" +
	'from (select (select c.oid from pg_catalog.pg_class c\n' +
	'              join pg_catalog.pg_namespace n on n.oid = c.relnamespace\n' +
	`              where n.nspname = '${HISTORY_SCHEMA}' and c.relname = '${HISTORY_NAME}'\n` +
	"                and c.relkind in ('r','p','v','m','f') limit 1) as oid) as t;" ;

/**
 * Every version the table records. `version` is the four-digit migration
 * number as text, which is the same string `idea-status.py` puts in a probe's
 * `num` -- so the join needs no parsing on either side.
 */
export const HISTORY_VERSIONS_SQL =
	'set transaction read only;\n' +
	`select 'v' as k, version from ${HISTORY_TABLE} group by version order by version;`;

/**
 * EVERY ANSWER IS READ BACK BESIDE THE KEY IT WAS SENT UNDER, and that is not
 * decoration. `psql` prints a COMMAND TAG for a statement that returns no rows
 * -- `set transaction read only;` emits a bare `SET` line, and `--tuples-only`
 * does not suppress it. Taking the first non-empty line as the answer therefore
 * read `SET` and reported that the tool could not tell whether the table exists,
 * which measured as `cannotRun` on a database that was perfectly reachable.
 *
 * It was invisible to a stubbed transport and caught by
 * `tests/db/deploy-probe-history-live.test.ts` against a real Postgres. It is
 * also why `runSql` has never had the problem: it has always matched
 * `^<index>|<t|f>$`, so a tag cannot be mistaken for a row. These do the same.
 */
const PRESENCE_ROW = /^history-table\|(present|absent|unreadable)$/;
const VERSION_ROW = /^v\|(.+)$/;

/**
 * @typedef {{ present: boolean, versions: Set<string> }} History
 */

/**
 * Read the history table, in at most two round trips and never more.
 *
 * A QUERY ERROR IS `cannotRun`, NOT "no table". The presence check already
 * distinguishes a missing table from an unreachable database, so anything that
 * fails AFTER it said `present` is an anomaly, and answering it by silently
 * falling back to the object probes would turn a broken credential into a
 * quieter verdict rather than a reported one.
 *
 * A THIRD OUTCOME: `ok` with a NULL history, which is "the table is there and
 * this role cannot read it". See the branch below for why that is a degrade
 * rather than a failure.
 *
 * @param {string} url
 * @param {(sql: string, url: string) => ReturnType<typeof runRows>} [run]
 * @returns {{ ok: true, history: History | null, why?: string } | { ok: false, why: string }}
 */
export function readHistory(url, run = runRows) {
	const presence = run(HISTORY_PRESENCE_SQL, url);
	if (!presence.ok) return { ok: false, why: presence.why };
	const answer = presence.rows
		.map((r) => PRESENCE_ROW.exec(r.trim()))
		.find((m) => m !== null)?.[1];
	if (answer !== 'present' && answer !== 'absent' && answer !== 'unreadable') {
		return { ok: false, why: `could not tell whether ${HISTORY_TABLE} exists` };
	}
	if (answer === 'absent') return { ok: true, history: { present: false, versions: new Set() } };

	// PRESENT AND NOT READABLE IS A DEGRADE, NOT A FAILURE, AND THE DIFFERENCE
	// IS EVERY DEPLOY. `null` is this file's own word for "the table was not
	// consulted", so every finding below comes out byte for byte as it did
	// before the table existed -- which is a working answer. Reporting it as
	// `cannotRun` instead would mean that the moment the seed is pasted, a
	// read-only role holding CONNECT and no grant on one new table stops every
	// deploy this repository can make, having previously answered fine.
	//
	// It is NOT collapsed into `{ present: false }`: that would say the table
	// is absent, which is a claim about the database rather than about this
	// role's reach, and it is the sentence an operator would act on by pasting
	// a seed that is already applied.
	if (answer === 'unreadable') {
		return {
			ok: true,
			history: null,
			why: `${HISTORY_TABLE} is there and this role may not select from it, so every answer below is the object probe's. A grant of USAGE on ${HISTORY_SCHEMA} and SELECT on the table is what this role is missing.`
		};
	}

	const versions = run(HISTORY_VERSIONS_SQL, url);
	if (!versions.ok) return { ok: false, why: versions.why };
	return {
		ok: true,
		history: {
			present: true,
			versions: new Set(
				versions.rows
					.map((r) => VERSION_ROW.exec(r.trim()))
					.filter((m) => m !== null)
					.map((m) => m[1].trim())
					.filter((v) => v !== '')
			)
		}
	};
}

/**
 * `runSql`'s sibling for a query whose answer is a list of scalars rather than
 * an indexed boolean map. Same `psql` invocation, same redaction, same "the URL
 * is an argument and there is no shell anywhere on the path".
 *
 * @param {string} sql
 * @param {string} url
 * @returns {{ ok: true, rows: string[] } | { ok: false, why: string }}
 */
export function runRows(sql, url) {
	const psql = spawnSync(
		'psql',
		[url, '--no-psqlrc', '--tuples-only', '--no-align', '--field-separator=|',
		 '--set=ON_ERROR_STOP=1', '--single-transaction', '--command', sql],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	);
	if (psql.error) {
		const e = /** @type {Error & { code?: string }} */ (psql.error);
		return { ok: false, why: `psql could not be run (${e.code ?? e.message})` };
	}
	if (psql.status !== 0) {
		return { ok: false, why: `psql exited ${psql.status}: ${redact(psql.stderr, url)}` };
	}
	return { ok: true, rows: psql.stdout.split('\n') };
}

/* ------------------------------------------------------------------------ */
/* The verdict.                                                              */
/* ------------------------------------------------------------------------ */

/**
 * `history` is what the table said about this migration: `true` a row is there,
 * `false` the table was read and has none, `null` the table was not consulted
 * at all (no credential, or it does not exist). `evidence` is what the object
 * probe said on its own, before the two were combined, so a reader can always
 * see which half produced the state.
 *
 * @typedef {{ num: string, file: string, object: string,
 *             state: 'applied'|'not-applied'|'unknown', why: string,
 *             history: boolean | null,
 *             evidence: 'applied'|'not-applied'|'unknown',
 *             conflict: boolean }} Finding
 */

/**
 * Combine the object probes with the history table, per migration.
 *
 * THE THIRD ARGUMENT IS OPTIONAL AND ITS DEFAULT IS THE PRE-SEED BEHAVIOUR.
 * `null` means the table was not consulted, and every finding then comes out
 * byte for byte as it did before the table existed -- which is what
 * `tools/apply-migration.mjs` calls, with two arguments, and must keep getting.
 *
 * See this file's header for the full table of which half wins. The short of
 * it: a probe that RAN always decides, a row decides only where no probe
 * exists, and a row contradicted by a probe is reported as a conflict.
 *
 * @param {Probe[]} probes
 * @param {Map<number, boolean>} rows
 * @param {History | null} [history]
 * @returns {Finding[]}
 */
export function verdicts(probes, rows, history = null) {
	return probes.map((p, i) => {
		/** @type {boolean | null} */
		const recorded = history && history.present ? history.versions.has(p.num) : null;

		/** @type {'applied'|'not-applied'|'unknown'} */
		let evidence;
		let why = '';
		if (!p.sql) {
			evidence = 'unknown';
			why = p.refused ?? 'no probeable object could be derived from this migration';
		} else if (!rows.has(i)) {
			evidence = 'unknown';
			why = 'the probe was sent and no row came back for it';
		} else {
			evidence = rows.get(i) ? 'applied' : 'not-applied';
		}

		const base = { num: p.num, file: p.file, object: p.object, history: recorded, evidence };

		// A PROBE THAT RAN IS EVIDENCE AND IT DECIDES, in both directions. The
		// only thing the row changes here is the sentence: a row asserting an
		// apply the catalog cannot see is the exact failure the seed made
		// possible, and it is named rather than absorbed.
		if (evidence === 'not-applied') {
			return {
				...base,
				state: /** @type {const} */ ('not-applied'),
				conflict: recorded === true,
				why:
					recorded === true
						? `CONFLICT: ${HISTORY_TABLE} records ${p.num} as applied and this object is not in production's catalog. The row is a claim; the catalog is the evidence.`
						: ''
			};
		}
		if (evidence === 'applied') {
			return { ...base, state: /** @type {const} */ ('applied'), conflict: false, why: '' };
		}

		// NO PROBE RAN. This is the one place a row decides anything, and it is
		// the case the seed exists for.
		if (recorded === true) {
			return {
				...base,
				state: /** @type {const} */ ('applied'),
				conflict: false,
				why: `${why}; ${HISTORY_TABLE} records it applied`
			};
		}
		return {
			...base,
			state: /** @type {const} */ ('unknown'),
			conflict: false,
			why:
				recorded === false
					? `${why}, and ${HISTORY_TABLE} has no row for it`
					: why
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
 * IT NAMES WHICH HALF ANSWERED EACH ROW. `catalog` is an object probe that ran,
 * `history` is a row carrying a migration no probe covers, and `--` is neither.
 * A verification result that does not say what it read is a result nobody can
 * audit, which is the same rule as "never a bare count" one paragraph up.
 *
 * @param {Finding[]} findings
 * @param {number} code
 * @param {History | null} [history]
 */
function reportText(findings, code, history = null, unreadableWhy = '') {
	const lines = [];
	if (history) {
		lines.push(
			history.present
				? `${HISTORY_TABLE}: present, ${history.versions.size} version(s) recorded.`
				: `${HISTORY_TABLE}: ABSENT. Every answer below is an object probe alone.`
		);
		lines.push('');
	} else if (unreadableWhy) {
		// THE THIRD STATE SAYS SO HERE TOO. Absent already gets a line, and
		// unreadable is the same kind of statement -- it changes what every
		// verdict below is worth -- so leaving it on stderr alone would make a
		// degraded run and a full one look identical in the job summary.
		lines.push(`${HISTORY_TABLE}: UNREADABLE. ${unreadableWhy}`);
		lines.push('');
	}
	lines.push('migration  state        read from  object');
	for (const f of findings) {
		const state = { applied: 'APPLIED', 'not-applied': 'NOT APPLIED', unknown: 'CANNOT SAY' }[f.state];
		const from = f.evidence !== 'unknown' ? 'catalog' : f.state === 'applied' ? 'history' : '--';
		lines.push(
			`${f.num.padEnd(9)}  ${state.padEnd(11)}  ${from.padEnd(9)}  ${f.object}${f.why ? `  -- ${f.why}` : ''}`
		);
	}
	const n = (/** @type {string} */ s) => findings.filter((f) => f.state === s).length;
	const conflicts = findings.filter((f) => f.conflict).length;
	lines.push('');
	lines.push(
		`${findings.length} migration(s) in range: ${n('applied')} applied, ` +
			`${n('not-applied')} NOT applied, ${n('unknown')} the probe cannot speak for.`
	);
	if (conflicts > 0) {
		lines.push(
			`${conflicts} CONFLICT(S): ${HISTORY_TABLE} claims an apply production's catalog cannot see.`
		);
	}
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
		// BOTH QUERIES, IN THE ORDER THEY RUN. A person pasting this into the
		// Supabase SQL editor is asking the same two questions this tool asks,
		// and printing only half of them would hide the one that now answers
		// most of the range.
		process.stdout.write(
			`-- 1. is the history table there?\n${HISTORY_PRESENCE_SQL}\n\n` +
				`-- 2. what does it record? (only if the answer above is 'present')\n${HISTORY_VERSIONS_SQL}\n\n` +
				'-- 3. the object probes, which are the evidence.\n' +
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

	// THE TABLE FIRST. It is the cheaper question and it is the one that can
	// speak for a migration no object probe covers; the probes then run
	// regardless, because a row is never taken as evidence against one.
	const h = readHistory(url);
	if (!h.ok) {
		console.error(`deploy-probe: ${h.why}`);
		return EXIT.cannotRun;
	}
	const history = h.history;
	// A DEGRADE IS SAID OUT LOUD. It is not an error and does not change the
	// exit status, but a run whose verdicts all came from the object probes is
	// a weaker answer than one that had the record, and nothing else on screen
	// would distinguish them.
	if (history === null && h.why) console.error(`deploy-probe: ${h.why}`);

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
					// THREE STATES, NOT TWO. `unreadable` is neither `present`
					// nor `absent` and must not be reported as either: one
					// would claim the table is missing and the other would
					// claim its rows were read.
					history: history
						? { table: history.present ? 'present' : 'absent', versions: history.versions.size }
						: { table: 'unreadable', versions: null },
					findings
				},
				null,
				2
			) + '\n'
		);
	} else {
		process.stdout.write(reportText(findings, code, history, history === null ? (h.why ?? '') : '') + '\n');
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
