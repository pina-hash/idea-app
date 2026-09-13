import { describe, expect, it, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { startTestDb, type TestDb } from './db/harness';
import {
	EXIT,
	HISTORY_KEY,
	HISTORY_TABLE,
	VERSION_KEY,
	buildHistorySql,
	buildHistoryVersionsSql,
	exitFor,
	noHistory,
	normalizeVersion,
	readFrom,
	readHistory,
	verdicts
} from '../tools/deploy-probe.mjs';

/**
 * `tools/deploy-probe.mjs` used to INFER an apply from one catalog object per
 * migration, so a migration it could derive nothing from answered status 3 --
 * CANNOT SAY -- and that silence stopped five lanes at the deploy gate in one
 * week. `supabase/data/0209-seed-migration-history.sql` gave the database a
 * record of its own, and the probe now reads it first.
 *
 * WHAT IS ACTUALLY AT RISK HERE, and why this file exists rather than a
 * harness drive: every wrong answer in the table below is SILENT. A row that
 * is believed over an absent object deploys code against a schema that does
 * not have it; a status 3 quietly downgraded to 0 removes the gate outright;
 * and a database with no history table answering differently from before would
 * change the behaviour of a tool nobody is watching at 2am. None of that is
 * visible on any screen.
 *
 * FOUR PLANTED CONTROLS, NAMED IN THE PROMPT AND DRIVEN IN BOTH DIRECTIONS:
 * a row present with the objects present, a row present with the objects
 * ABSENT, no row with the objects present, and no table at all.
 */

/** A probe with a runnable SQL expression, as `prepare()` would hand one over. */
function probe(num: string, sql: string | null = 'exists (select 1)') {
	return {
		num,
		file: `${num}_x.sql`,
		kind: 'table',
		object: `public.t_${num}`,
		sql,
		translated: false,
		refused: null
	};
}

/** The record, as `readHistory` would answer it, for a table that IS readable. */
function record(...versions: string[]) {
	return { present: true, readable: true, versions: new Set(versions), why: 'fixture' };
}

describe('the record and the objects, one verdict', () => {
	// ---------------------------------------------------------------------
	// CONTROL 1: a row, and the object is there.
	// ---------------------------------------------------------------------
	it('a row present and the object present is APPLIED, and both are said to agree', () => {
		const f = verdicts([probe('0212')], new Map([[0, true]]), record('0212'));
		expect(f[0].state).toBe('applied');
		expect(f[0].record).toBe('recorded');
		expect(f[0].agreement).toBe('agree');
		expect(exitFor(f)).toBe(EXIT.allApplied);
	});

	// ---------------------------------------------------------------------
	// CONTROL 2: a row, and the object is NOT there. THE FAILURE THE SEED
	// INTRODUCED AS A POSSIBILITY, and the reason the object probes are kept.
	// ---------------------------------------------------------------------
	it('a row present and the object ABSENT is NOT APPLIED, never applied, and is named a CONFLICT', () => {
		const f = verdicts([probe('0212')], new Map([[0, false]]), record('0212'));
		expect(f[0].state).toBe('not-applied');
		expect(f[0].record).toBe('recorded');
		expect(f[0].agreement).toBe('conflict');
		expect(f[0].why).toContain(HISTORY_TABLE);
		expect(f[0].why).toContain('CLAIMS');
		expect(f[0].why).toContain('CONFLICT');
		// The exit is the hard refusal, which no typed confirmation overrides.
		expect(exitFor(f)).toBe(EXIT.notApplied);
	});

	it('and the conflict does not become applied just because the row is there, at any count', () => {
		// Five rows, four objects. The one missing object decides the exit for
		// all of them: a single false probe is a machine-read fact.
		const probes = ['0205', '0206', '0207', '0208', '0209'].map((n) => probe(n));
		const rows = new Map([
			[0, true],
			[1, true],
			[2, false],
			[3, true],
			[4, true]
		]);
		const f = verdicts(probes, rows, record('0205', '0206', '0207', '0208', '0209'));
		expect(f.map((x) => x.state)).toEqual([
			'applied',
			'applied',
			'not-applied',
			'applied',
			'applied'
		]);
		expect(f.filter((x) => x.agreement === 'conflict').map((x) => x.num)).toEqual(['0207']);
		expect(exitFor(f)).toBe(EXIT.notApplied);
	});

	// ---------------------------------------------------------------------
	// CONTROL 3: no row, and the object IS there.
	// ---------------------------------------------------------------------
	it('no row with the object present is APPLIED, because an absent row is silence and not a denial', () => {
		const f = verdicts([probe('0212')], new Map([[0, true]]), record('0211'));
		expect(f[0].state).toBe('applied');
		expect(f[0].record).toBe('unrecorded');
		expect(f[0].agreement).toBe('object-only');
		// And the gap is REPORTED rather than swallowed: migrate.yml reads that
		// table to choose what to apply next.
		expect(f[0].why).toContain('the record is behind');
		expect(exitFor(f)).toBe(EXIT.allApplied);
	});

	it('no row with the object ABSENT is NOT APPLIED, with both sources agreeing', () => {
		const f = verdicts([probe('0212')], new Map([[0, false]]), record('0211'));
		expect(f[0].state).toBe('not-applied');
		expect(f[0].agreement).toBe('agree');
		expect(exitFor(f)).toBe(EXIT.notApplied);
	});

	// ---------------------------------------------------------------------
	// THE POINT OF THE WHOLE BUNDLE: a row where no probe could be derived.
	// ---------------------------------------------------------------------
	it('a row with NO probe is APPLIED, which is exactly the status 3 that stopped lane after lane', () => {
		const noProbe = probe('0213', null);
		const before = verdicts([noProbe], new Map(), noHistory());
		expect(before[0].state).toBe('unknown');
		expect(exitFor(before)).toBe(EXIT.cannotConfirm);

		const after = verdicts([noProbe], new Map(), record('0213'));
		expect(after[0].state).toBe('applied');
		expect(after[0].agreement).toBe('record-only');
		expect(after[0].why).toContain(HISTORY_TABLE);
		expect(exitFor(after)).toBe(EXIT.allApplied);
	});

	// ---------------------------------------------------------------------
	// AND STATUS 3 SURVIVES. This is the assertion the prompt names.
	// ---------------------------------------------------------------------
	it('no row AND no probe is still CANNOT SAY, and a readable record does not make it a pass', () => {
		const f = verdicts([probe('0213', null)], new Map(), record('0212'));
		expect(f[0].state).toBe('unknown');
		expect(f[0].record).toBe('unrecorded');
		expect(f[0].agreement).toBe('neither');
		expect(exitFor(f)).toBe(EXIT.cannotConfirm);
	});

	it('a probe that was sent and answered nothing is CANNOT SAY, row or no row', () => {
		// A row came back for no index at all. The probe ran and said nothing,
		// which is not the same as saying false.
		const withRow = verdicts([probe('0212')], new Map(), record('0212'));
		expect(withRow[0].state).toBe('applied');
		expect(withRow[0].agreement).toBe('record-only');
		const withoutRow = verdicts([probe('0212')], new Map(), record('0211'));
		expect(withoutRow[0].state).toBe('unknown');
		expect(exitFor(withoutRow)).toBe(EXIT.cannotConfirm);
	});

	// ---------------------------------------------------------------------
	// CONTROL 4: no table at all. THE PRE-SEED WORLD, WHICH MUST NOT MOVE.
	// ---------------------------------------------------------------------
	it('with no readable record every verdict is the object probe’s, exactly as before', () => {
		const probes = [probe('0212'), probe('0213'), probe('0214', null)];
		const rows = new Map([
			[0, true],
			[1, false]
		]);
		const f = verdicts(probes, rows, noHistory());
		expect(f.map((x) => x.state)).toEqual(['applied', 'not-applied', 'unknown']);
		for (const x of f) {
			expect(x.record).toBe('unreadable');
			expect(x.why).not.toContain(HISTORY_TABLE);
		}
		expect(exitFor(f)).toBe(EXIT.notApplied);

		// And with nothing false, it is still the 3 it always was.
		const quiet = verdicts([probe('0212'), probe('0214', null)], new Map([[0, true]]), noHistory());
		expect(exitFor(quiet)).toBe(EXIT.cannotConfirm);
	});

	it('the default third argument IS "no readable record", so a two-argument caller is unchanged', () => {
		// `tools/apply-migration.mjs` calls `verdicts(probes, rows)` with two
		// arguments and must keep the behaviour it had. Asserted as EQUALITY
		// against the explicit form rather than by reading the default.
		const probes = [probe('0212'), probe('0213'), probe('0214', null)];
		const rows = new Map([
			[0, true],
			[1, false]
		]);
		expect(verdicts(probes, rows)).toEqual(verdicts(probes, rows, noHistory()));
	});

	it('an unreadable record and an empty one are different, and are not collapsed', () => {
		// THE TRAP THIS GUARDS: a caller that answered "could not read it" with
		// an empty Set would turn every CANNOT SAY into a NOT APPLIED and
		// refuse every deploy forever, from a query that merely lacked a grant.
		const unreadable = verdicts([probe('0212', null)], new Map(), noHistory());
		const empty = verdicts([probe('0212', null)], new Map(), record());
		expect(unreadable[0].state).toBe('unknown');
		expect(empty[0].state).toBe('unknown');
		expect(unreadable[0].record).toBe('unreadable');
		expect(empty[0].record).toBe('unrecorded');
		// Same verdict here, different reported cause, which is the half a
		// reader acts on.
		expect(empty[0].why).toContain(HISTORY_TABLE);
		expect(unreadable[0].why).not.toContain(HISTORY_TABLE);
	});

	it('normalizes the set it is HANDED, not just the one readHistory built', () => {
		// FOUND BY THIS FILE FAILING. `verdicts` used to assume its caller had
		// already normalized, which is an invariant living in the wrong place:
		// get it wrong and every migration reports `unrecorded`, which reads as
		// a CANNOT SAY and is therefore never investigated. The raw four-digit
		// spelling is exactly what a caller reading the column would pass.
		const raw = { present: true, readable: true, versions: new Set(['0212']), why: 'raw' };
		expect(verdicts([probe('0212', null)], new Map(), raw)[0].state).toBe('applied');
		expect(verdicts([probe('0212', null)], new Map(), raw)[0].record).toBe('recorded');
	});

	// ---------------------------------------------------------------------
	// FROM LEDGER 0216, WHICH FOUND IT INDEPENDENTLY: a migration derives more
	// than one probe row on this tree, and a row must not carry the siblings.
	// ---------------------------------------------------------------------
	it('a row does not rescue a sibling probe of the same migration', () => {
		const f = verdicts(
			[probe('0205', 'exists (a)'), probe('0205', 'exists (b)')],
			new Map([
				[0, true],
				[1, false]
			]),
			record('0205')
		);
		expect(f.map((x) => x.state)).toEqual(['applied', 'not-applied']);
		expect(f[1].agreement).toBe('conflict');
		expect(exitFor(f)).toBe(EXIT.notApplied);
	});

	// A POSITIVE CONTROL FOR THE WHOLE MATRIX, also from ledger 0216: every
	// assertion above is an equality against one expected state, so a combiner
	// that answered the SAME state for everything would satisfy a subset of
	// them. This one cannot pass unless all three states are reachable.
	it('positive control: the combiner does not simply answer one state', () => {
		const states = [
			verdicts([probe('0209')], new Map([[0, true]]), record('0209'))[0].state,
			verdicts([probe('0209')], new Map([[0, false]]), record('0209'))[0].state,
			verdicts([probe('0202', null)], new Map(), record('0001'))[0].state
		];
		expect([...new Set(states)].sort()).toEqual(['applied', 'not-applied', 'unknown']);
	});

	// `evidence` IS THE OBJECT PROBE'S OWN ANSWER, kept beside the combined
	// verdict so `readFrom` -- and therefore the deploy job summary -- can say
	// which half decided without re-deriving it. Ledger 0216's find; asserted
	// here in all three of its values plus the one case where it and `state`
	// deliberately differ.
	it('carries the probe’s own answer beside the combined verdict', () => {
		const applied = verdicts([probe('0212')], new Map([[0, true]]), record('0212'))[0];
		const absent = verdicts([probe('0212')], new Map([[0, false]]), record('0212'))[0];
		const carried = verdicts([probe('0213', null)], new Map(), record('0213'))[0];
		expect([applied.evidence, absent.evidence, carried.evidence]).toEqual([
			'applied',
			'not-applied',
			'unknown'
		]);
		// The one that matters: the row carried it, so the STATE is applied and
		// the EVIDENCE is not, and a reader can tell which produced the answer.
		expect(carried.state).toBe('applied');
		expect(readFrom(carried)).toBe('history row');
		expect(readFrom(applied)).toBe('catalog');
		expect(readFrom(verdicts([probe('0213', null)], new Map(), record())[0])).toBe('--');
	});

	it('matches a four-digit file number against an unpadded row, and leaves a CLI version alone', () => {
		expect(normalizeVersion('0100')).toBe('100');
		expect(normalizeVersion('100')).toBe('100');
		expect(normalizeVersion(' 0007 ')).toBe('7');
		expect(normalizeVersion('20260913000000')).toBe('20260913000000');
		expect(verdicts([probe('0100', null)], new Map(), record('100'))[0].state).toBe('applied');
	});
});

/* ------------------------------------------------------------------------ */
/* The SQL, against a REAL Postgres.                                         */
/*                                                                           */
/* The matrix above is arithmetic. THIS is the half that cannot be reasoned  */
/* about: whether the two statements the tool sends actually answer on a     */
/* database with no history table, and on one whose role holds no grant on   */
/* it. Both of those fail SILENTLY in the dangerous direction -- the first   */
/* by raising inside the transaction the object probes ride in, the second   */
/* by making every run report "unreadable" forever.                          */
/* ------------------------------------------------------------------------ */

const SEED = readFileSync(
	new URL('../supabase/data/0209-seed-migration-history.sql', import.meta.url),
	'utf8'
);
/** Everything before the verification, which is the last statement. */
const SEED_BODY = SEED.slice(0, SEED.lastIndexOf('\nwith expected(version, name) as ('));

let db: TestDb | null = null;
afterAll(async () => {
	if (db) await db.stop();
});

/**
 * Run a statement AS a named role, on the pooled connection, and put the role
 * back afterwards.
 *
 * TWO THINGS HERE ARE NOT DECORATION. `reset role` is in the SAME batch,
 * because `set role` persists on a pooled connection -- without it the next
 * test in this file failed with `permission denied to create role`, which
 * reads as a broken fixture and is this helper leaking. And a multi-statement
 * batch makes `pool.query` answer an ARRAY of results, so the row-bearing one
 * is picked out rather than `.rows` being read off the batch (which is
 * `undefined`, and throws one line later on something unrelated).
 */
async function asRole<T extends object>(role: string, sql: string): Promise<{ rows: T[] }> {
	const res = (await db!.sql(`set role ${role};\n${sql}\nreset role;`)) as unknown;
	const all = (Array.isArray(res) ? res : [res]) as { rows?: T[] }[];
	const withRows = all.filter((r) => Array.isArray(r.rows) && r.rows.length > 0);
	expect(withRows.length, `no row came back for a statement run as ${role}`).toBeGreaterThan(0);
	return withRows[withRows.length - 1] as { rows: T[] };
}

describe('the two statements the tool sends, on a real database', () => {
	it('answers present=false on a database that has never seen the seed, without raising', async () => {
		db = await startTestDb([]);
		// THE PRE-SEED WORLD. `to_regclass` on a name whose SCHEMA does not
		// exist must answer NULL rather than raise -- if it raised, the
		// preflight would fail on every unseeded database and the tool would
		// degrade where it should simply say "no table".
		const r = await db.sql<{ present: boolean; readable: boolean }>(
			buildHistorySql().replace('set transaction read only;\n', '')
		);
		expect(r.rows[0].present).toBe(false);
		expect(r.rows[0].readable).toBe(false);
	});

	it('answers present=true and readable=true once the seed is applied, and lists its versions', async () => {
		await db!.sql(SEED_BODY);
		const r = await db!.sql<{ present: boolean; readable: boolean }>(
			buildHistorySql().replace('set transaction read only;\n', '')
		);
		expect(r.rows[0].present).toBe(true);
		expect(r.rows[0].readable).toBe(true);

		const v = await db!.sql<{ version: string }>(
			buildHistoryVersionsSql().replace('set transaction read only;\n', '')
		);
		// 208: the seed lists 0001 to 0210 and withholds 0211, whose probe
		// object is not on this fixture. The number is the seed's own and is
		// pinned by `tests/db/migration-history-seed.test.ts`; it is read here
		// only to prove this statement returns the rows rather than none.
		expect(v.rows.length).toBe(208);
		const versions = new Set(v.rows.map((x) => normalizeVersion(x.version)));
		expect(versions.has('100')).toBe(true);
		expect(versions.has('211')).toBe(false);
	});

	it('answers present=TRUE for a role with no schema USAGE, which to_regclass did not', async () => {
		// THE MISREPORT THIS FILE FOUND. The preflight used to resolve the NAME
		// with `to_regclass`, and resolving a qualified name needs USAGE on its
		// schema -- so for exactly the role this tool is built for it answered
		// NULL for a table sitting right there, and the tool would have told an
		// operator to paste a seed the database already had. `pg_class` is
		// readable by PUBLIC and is not filtered by either privilege.
		//
		// IT IS RUN UNDER `set role`, AND THE FIRST VERSION OF THIS TEST WAS
		// NOT. It only substituted the role NAME into `has_*_privilege`, so the
		// statement still EXECUTED as the owning role -- under which
		// `to_regclass` resolves perfectly well. The merged mutation proof
		// found that: swapping `pg_class` back for `to_regclass` SURVIVED, so
		// the headline find was not pinned by the test that claimed it. The
		// executing role has to be the one without USAGE.
		await db!.sql('create role probe_nousage nologin');
		const presence = buildHistorySql().replace('set transaction read only;\n', '');
		const asNoUsage = <T extends object>(sql: string) => asRole<T>('probe_nousage', sql);

		const r = await asNoUsage<{ present: boolean; readable: boolean }>(presence);
		expect(r.rows[0].present).toBe(true);
		expect(r.rows[0].readable).toBe(false);

		// THE NEGATIVE CONTROL FOR THE CHOICE ITSELF, as the same role in the
		// same breath: `to_regclass` cannot see the table the statement above
		// just found, which is the whole reason the preflight reads `pg_class`.
		//
		// AND IT IS WORSE THAN THE HEADER USED TO SAY. Ledger 0213 recorded
		// `to_regclass` "answering NULL" for such a role -- which is what the
		// TOOL reports, because a raising statement makes `psql` exit non-zero
		// and `readHistory` degrades to `present: false`. Measured here at the
		// SQL layer it does not answer null at all: it RAISES `permission
		// denied for schema`, and under `--single-transaction` with
		// `ON_ERROR_STOP=1` that aborts the object probes riding in the same
		// batch. Same conclusion, a worse failure than the one on record.
		await expect(
			asNoUsage(`select (to_regclass('${HISTORY_TABLE}') is null) as absent;`)
		).rejects.toThrow(/permission denied for schema/i);

		// AND `readable` IS TWO PRIVILEGES, NOT ONE, IN BOTH DIRECTIONS.
		// First: SELECT on the table with no USAGE on the schema still cannot
		// read it -- `has_table_privilege` answers about the table's own ACL
		// and says nothing about the schema.
		await db!.sql(`grant select on ${HISTORY_TABLE} to probe_nousage`);
		expect(
			(await asNoUsage<{ present: boolean; readable: boolean }>(presence)).rows[0].readable
		).toBe(false);

		// SECOND, AND THE MUTATION PROOF FOUND THIS ONE MISSING: USAGE on the
		// schema with NO select on the table must ALSO read false. It is the
		// dangerous direction -- a `readable: true` here sends the versions
		// select, which raises `permission denied` and aborts the transaction
		// the object probes ride in, taking the whole answer down. Dropping
		// `has_table_privilege` from the conjunction survived every assertion
		// this file had, because no case exercised this half.
		await db!.sql('create role probe_schemaonly nologin');
		await db!.sql('grant usage on schema supabase_migrations to probe_schemaonly');
		const schemaOnly = await asRole<{ present: boolean; readable: boolean }>(
			'probe_schemaonly',
			presence
		);
		expect(schemaOnly.rows[0].present).toBe(true);
		expect(schemaOnly.rows[0].readable, 'schema USAGE alone is not readable').toBe(false);

		// The positive control: give the first role the schema too and it flips.
		await db!.sql('grant usage on schema supabase_migrations to probe_nousage');
		expect(
			(await asNoUsage<{ present: boolean; readable: boolean }>(presence)).rows[0].readable
		).toBe(true);
	});

	it('answers present=true and readable=FALSE for a role that holds no grant on it', async () => {
		// THE ONE THAT DECIDES THE WHOLE SHAPE OF THE FILE. The deploy role
		// holds nothing but CONNECT, and a `select` it may not run raises
		// `permission denied` at executor startup, aborting the transaction the
		// object probes ride in. So the privilege is asked FIRST -- and this
		// proves the preflight genuinely answers false for such a role, rather
		// than answering true because the test happened to run as the owner.
		await db!.sql('create role probe_reader nologin');
		const r = await db!.sql<{ present: boolean; readable: boolean }>(
			buildHistorySql()
				.replace('set transaction read only;\n', '')
				.replaceAll('current_user', "'probe_reader'::name")
		);
		expect(r.rows[0].present).toBe(true);
		expect(r.rows[0].readable).toBe(false);

		// THE POSITIVE CONTROL, on the same database and the same role: grant
		// the select and the same statement answers true. Without this, a
		// preflight that answered false for EVERY input would pass above.
		await db!.sql('grant usage on schema supabase_migrations to probe_reader');
		await db!.sql(`grant select on ${HISTORY_TABLE} to probe_reader`);
		const after = await db!.sql<{ present: boolean; readable: boolean }>(
			buildHistorySql()
				.replace('set transaction read only;\n', '')
				.replaceAll('current_user', "'probe_reader'::name")
		);
		expect(after.rows[0].readable).toBe(true);
	});

	it('and the read the tool would refuse genuinely raises, which is what the preflight is for', async () => {
		// Not a hypothetical: this is the exact statement `readHistory` would
		// send if it skipped the preflight, run as a role with no grant. It
		// must throw -- if it did not, the preflight would be ceremony.
		const other = await startTestDb([]);
		try {
			await other.sql(SEED_BODY);
			await other.sql('create role probe_norights login password \'x\'');
			await expect(
				other.sql(`set role probe_norights; select version from ${HISTORY_TABLE};`)
			).rejects.toThrow(/permission denied/i);
		} finally {
			await other.stop();
		}
	});
});

describe('readHistory degrades one rung at a time and never throws', () => {
	/** A runner that answers whatever the case under test needs. */
	type Run = (sql: string, url: string) => { ok: true; rows: string[][] } | { ok: false; why: string };

	it('a failed preflight is "cannot speak", not an exception', () => {
		const run: Run = () => ({ ok: false, why: 'psql exited 2' });
		const h = readHistory('postgres://x', run);
		expect(h.versions).toBeNull();
		expect(h.present).toBe(false);
		expect(h.why).toContain('psql exited 2');
	});

	it('a preflight with no LABELLED row is "cannot speak"', () => {
		const run: Run = () => ({ ok: true, rows: [] });
		expect(readHistory('postgres://x', run).versions).toBeNull();
	});

	// ---------------------------------------------------------------------
	// LEDGER 0216'S FIND, IN THE CHEAP INSTRUMENT. `psql` prints a bare `SET`
	// command tag ahead of the rows and `--tuples-only` does not remove it, so
	// a reader taking the first line -- or the first line with enough fields --
	// answers about the tag. `--quiet` also fixes it and is deliberately NOT
	// used (see the tool's header): the label is what is relied on, so the
	// label is what is tested, in both directions.
	// ---------------------------------------------------------------------
	it('a bare command tag is never mistaken for the preflight answer', () => {
		const tagOnly: Run = () => ({ ok: true, rows: [['SET']] });
		expect(readHistory('postgres://x', tagOnly).versions).toBeNull();
		expect(readHistory('postgres://x', tagOnly).present).toBe(false);

		// A VERSIONS ROW MUST NOT SATISFY THE PREFLIGHT EITHER, which is why
		// the two keys are different strings.
		const wrongKey: Run = () => ({ ok: true, rows: [[VERSION_KEY, 't', 'f']] });
		expect(readHistory('postgres://x', wrongKey).versions).toBeNull();

		// THE POSITIVE CONTROL, same shape with the tag in FRONT of a real
		// labelled row: without it, a reader that answered null for every input
		// would pass the two assertions above.
		let call = 0;
		const tagThenRow: Run = () =>
			++call === 1
				? { ok: true, rows: [['SET'], [HISTORY_KEY, 't', 't']] }
				: { ok: true, rows: [['SET'], [VERSION_KEY, '0210']] };
		const h = readHistory('postgres://x', tagThenRow);
		expect(h.present).toBe(true);
		expect(h.readable).toBe(true);
		// AND THE TAG IS NOT COUNTED AS A VERSION. This is the exact inflation
		// the defect produced: one extra "version" called SET.
		expect([...h.versions!]).toEqual(['210']);

		// A ROW THAT IS THE RIGHT SHAPE AND THE WRONG KIND IS ALSO DROPPED, and
		// the merged mutation proof is why this second half is here: opening
		// `versionRow` to accept ANY row SURVIVED the assertion above, because
		// a bare `SET` tag splits to one field and its missing second field was
		// already being filtered as empty. So the guard was passing for the
		// wrong reason. A two-field row carrying the PRESENCE key is the input
		// that tells the label check apart from the emptiness check.
		let n = 0;
		const wrongKind: Run = () =>
			++n === 1
				? { ok: true, rows: [[HISTORY_KEY, 't', 't']] }
				: {
						ok: true,
						rows: [
							[HISTORY_KEY, 'stray'],
							[VERSION_KEY, '0210']
						]
					};
		expect([...readHistory('postgres://x', wrongKind).versions!]).toEqual(['210']);
	});

	it('present and not readable is "cannot speak", and says which of the two it was', () => {
		const run: Run = () => ({ ok: true, rows: [[HISTORY_KEY, 't', 'f']] });
		const h = readHistory('postgres://x', run);
		expect(h.present).toBe(true);
		expect(h.readable).toBe(false);
		expect(h.versions).toBeNull();
		expect(h.why).toMatch(/may not select/);
	});

	it('absent is "cannot speak", and names the seed rather than reading as a fault', () => {
		const run: Run = () => ({ ok: true, rows: [[HISTORY_KEY, 'f', 'f']] });
		const h = readHistory('postgres://x', run);
		expect(h.present).toBe(false);
		expect(h.versions).toBeNull();
		expect(h.why).toContain('0209-seed-migration-history.sql');
		expect(h.why).toContain('not an error');
	});

	it('a readable table whose row read FAILS is "cannot speak", not an empty record', () => {
		// The direction that matters: an empty Set here would report every
		// migration unrecorded and refuse the deploy on a transient error.
		let call = 0;
		const run: Run = () =>
			++call === 1 ? { ok: true, rows: [[HISTORY_KEY, 't', 't']] } : { ok: false, why: 'connection reset' };
		const h = readHistory('postgres://x', run);
		expect(h.present).toBe(true);
		expect(h.readable).toBe(true);
		expect(h.versions).toBeNull();
		expect(h.why).toContain('connection reset');
	});

	it('a readable table reads its versions, normalized, and drops an empty field', () => {
		let call = 0;
		const run: Run = () =>
			++call === 1
				? { ok: true, rows: [[HISTORY_KEY, 't', 't']] }
				: {
						ok: true,
						rows: [
							[VERSION_KEY, '0001'],
							[VERSION_KEY, '0210'],
							[VERSION_KEY, '']
						]
					};
		const h = readHistory('postgres://x', run);
		expect(h.versions).not.toBeNull();
		expect([...h.versions!].sort()).toEqual(['1', '210']);
		expect(h.why).toContain('2 row(s)');
	});

	it('sends the versions query ONLY after a readable answer', () => {
		const sent: string[] = [];
		const run: Run = (sql) => {
			sent.push(sql);
			return { ok: true, rows: [[HISTORY_KEY, 'f', 'f']] };
		};
		readHistory('postgres://x', run);
		expect(sent.length).toBe(1);
		expect(sent[0]).not.toContain('select version from');
	});
});
