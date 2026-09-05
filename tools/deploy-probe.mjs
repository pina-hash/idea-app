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
 * repository records applied state: the remote has no
 * `supabase_migrations.schema_migrations` table at all (CLAUDE.md, "NEVER RUN
 * `supabase db push`"), and CI runs against an embedded Postgres with every
 * migration file applied, so a branch whose migration has never touched
 * production is green. Decision 0010 declined an unattended deploy on exactly
 * that. Mr. Pina approved a READ-ONLY Postgres role on 2026-09-03; this reads
 * production's own catalog with it and answers the question that was being
 * asked of him.
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
 *      probe, so the machine cannot speak for it. NOT a pass.
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
/* The verdict.                                                              */
/* ------------------------------------------------------------------------ */

/**
 * @typedef {{ num: string, file: string, object: string, state: 'applied'|'not-applied'|'unknown', why: string }} Finding
 */

/**
 * @param {Probe[]} probes
 * @param {Map<number, boolean>} rows
 * @returns {Finding[]}
 */
export function verdicts(probes, rows) {
	return probes.map((p, i) => {
		if (!p.sql) {
			return {
				num: p.num,
				file: p.file,
				object: p.object,
				state: /** @type {const} */ ('unknown'),
				why: p.refused ?? 'no probeable object could be derived from this migration'
			};
		}
		if (!rows.has(i)) {
			return {
				num: p.num,
				file: p.file,
				object: p.object,
				state: /** @type {const} */ ('unknown'),
				why: 'the probe was sent and no row came back for it'
			};
		}
		return {
			num: p.num,
			file: p.file,
			object: p.object,
			state: rows.get(i) ? /** @type {const} */ ('applied') : /** @type {const} */ ('not-applied'),
			why: ''
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
 * @param {Finding[]} findings
 * @param {number} code
 */
function reportText(findings, code) {
	const w = Math.max(6, ...findings.map((f) => f.object.length));
	const lines = ['migration  state        object'];
	for (const f of findings) {
		const state = { applied: 'APPLIED', 'not-applied': 'NOT APPLIED', unknown: 'CANNOT SAY' }[f.state];
		lines.push(`${f.num.padEnd(9)}  ${state.padEnd(11)}  ${f.object}${f.why ? `  -- ${f.why}` : ''}`);
	}
	void w;
	const n = (/** @type {string} */ s) => findings.filter((f) => f.state === s).length;
	lines.push('');
	lines.push(
		`${findings.length} migration(s) in range: ${n('applied')} applied, ` +
			`${n('not-applied')} NOT applied, ${n('unknown')} the probe cannot speak for.`
	);
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
		process.stdout.write(sql ? sql + '\n' : '-- no probeable migration in range\n');
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

	const findings = verdicts(probes, rows);
	const code = exitFor(findings);
	if (opts.json) {
		process.stdout.write(JSON.stringify({ since: opts.since, ref: opts.ref, exit: code, findings }, null, 2) + '\n');
	} else {
		process.stdout.write(reportText(findings, code) + '\n');
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
