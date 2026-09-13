// tests/db/deploy-probe-history-live.test.ts
//
// `tools/deploy-probe.mjs`'s TWO HISTORY QUERIES, run against a real Postgres
// through the real `psql` the tool shells out to.
//
// WHY THIS IS SEPARATE FROM `tests/deploy-probe-history.test.ts`. That file
// pins how a history reading and an object probe are COMBINED, with the
// transport stubbed -- it would pass against SQL that does not parse. This one
// proves the SQL itself: that the presence query answers `absent` for a schema
// that is not there rather than raising (a plain `select` on a missing relation
// fails outright and, under `--single-transaction` with `ON_ERROR_STOP=1`,
// would take the object probes down with it), that the versions read comes back
// in the shape `readHistory` expects, and that neither statement can write.
//
// THAT QUERY USED `to_regclass` AND NO LONGER DOES, because `to_regclass`
// resolves a NAME and resolving a qualified name needs USAGE on its schema --
// so for a role holding CONNECT and nothing else, which is exactly the role
// this tool is built for, it RAISES rather than answering null. Controls 6 and
// 7 below are that measurement.
//
// THE FIVE PLANTED CONTROLS, all against the same real cluster:
//   1. no table at all                        -> `absent`, and nothing raises
//   2. a row WITH the object present          -> applied, from the catalog
//   3. a row WITH the object ABSENT           -> NOT applied, reported as a
//                                                CONFLICT. The failure the seed
//                                                makes possible.
//   4. NO row with the object present         -> applied, on the catalog alone
//   5. no credential                          -> cannot-run (in the sibling
//                                                file, which owns the CLI path)
//
// It uses the harness's own cluster and a database of its own, so the schema it
// creates and drops is visible to nothing else.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { startTestDb, type TestDb } from './harness';
import {
	EXIT,
	HISTORY_PRESENCE_SQL,
	HISTORY_TABLE,
	exitFor,
	readHistory,
	runRows,
	verdicts
} from '../../tools/deploy-probe.mjs';

let db: TestDb;
let url: string;

beforeAll(async () => {
	// The shortest chain there is: this file asserts nothing about the app's
	// schema, only about a catalog table the probe reads.
	db = await startTestDb([]);
	const c = inject('pgCluster') as { host: string; port: number; user: string; password: string };
	url = `postgresql://${c.user}:${c.password}@${c.host}:${c.port}/${db.databaseName}`;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/** The object probe the tool would derive for a table, verbatim in shape. */
const tableProbe = (name: string) =>
	`exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace ` +
	`where n.nspname = 'public' and c.relname = '${name}' and c.relkind in ('r','p'))`;

const probe = (num: string, sql: string | null) => ({
	num,
	file: `${num}_planted.sql`,
	kind: 'table',
	object: sql ? `table public.thing_${num}` : 'no probe',
	sql,
	translated: false,
	refused: null
});

describe('the history queries against a real Postgres', () => {
	it('psql is the transport the tool actually uses, and it can reach this database', () => {
		// THE POSITIVE CONTROL FOR THE WHOLE FILE. Every "absent" below would
		// look identical if psql simply could not connect.
		const r = runRows('select 1;', url);
		expect(r.ok, r.ok ? '' : r.why).toBe(true);
		if (r.ok) expect(r.rows.map((x) => x.trim()).filter(Boolean)).toEqual(['1']);
	});

	// -- 1. NO TABLE AT ALL -------------------------------------------------
	it('control 1: with no table at all the presence query answers absent and does not raise', () => {
		const r = runRows(HISTORY_PRESENCE_SQL, url);
		expect(r.ok, r.ok ? '' : r.why).toBe(true);
		if (r.ok) {
			// PSQL PRINTS A COMMAND TAG, AND `--tuples-only` DOES NOT SUPPRESS
			// IT. `set transaction read only;` emits a bare `SET` line ahead of
			// the answer. This assertion pins that it is THERE, because the
			// defect it caused was reading it AS the answer -- and a reader
			// that stopped seeing the tag would make the guard below vacuous.
			const lines = r.rows.map((x) => x.trim()).filter(Boolean);
			expect(lines).toContain('SET');
			expect(lines).toContain('history-table|absent');
			expect(lines[0], 'the tag comes FIRST, which is what made it dangerous').toBe('SET');
		}

		const h = readHistory(url);
		expect(h.ok, h.ok ? '' : h.why).toBe(true);
		if (h.ok) expect(h.history).toEqual({ present: false, versions: new Set() });
	});

	it('the command tag is never mistaken for the answer, in either direction', () => {
		// The regression pin for the defect this file found. A tag-shaped line
		// carries no `history-table|` prefix, so it cannot match; and a reader
		// that matched anything non-empty would answer `cannotRun` here on a
		// database that is perfectly reachable, which is what it did.
		const h = readHistory(url);
		expect(h.ok).toBe(true);
		const stubbedTagOnly = readHistory(url, (() => ({ ok: true, rows: ['SET', ''] })) as never);
		expect(stubbedTagOnly.ok, 'a bare tag must not read as present or absent').toBe(false);
	});

	it('a plain select on the missing relation DOES raise, which is why presence is asked first', () => {
		// The negative control for the guard itself: without asking the catalog
		// first this is what the probe would have done, and under
		// `--single-transaction` it aborts everything sent with it.
		const r = runRows(`select version from ${HISTORY_TABLE};`, url);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.why).toMatch(/does not exist/);
	});

	it('a migration with no probe and no table is CANNOT SAY, the pre-seed answer', () => {
		const h = readHistory(url);
		expect(h.ok).toBe(true);
		if (!h.ok) return;
		const f = verdicts([probe('0202', null)], new Map(), h.history);
		expect(f[0].state).toBe('unknown');
		expect(exitFor(f)).toBe(EXIT.cannotConfirm);
	});

	describe('once the table is there', () => {
		beforeAll(async () => {
			// Seeded the way the real file seeds it: schema, table, rows.
			await db.sql(`create schema if not exists supabase_migrations`);
			await db.sql(
				`create table if not exists supabase_migrations.schema_migrations (
					version text not null primary key, statements text[], name text)`
			);
			await db.sql(
				`insert into supabase_migrations.schema_migrations (version, name) values
					('0202','tournament_dry_run'),
					('0209','ideacad_history'),
					('0211','ideacad_realtime_policy')
				 on conflict do nothing`
			);
			// The object for 0209 exists; the object for 0211 deliberately does
			// NOT. That pair is controls 2 and 3.
			await db.sql(`create table if not exists public.thing_0209 (id int)`);
		});

		it('the presence query flips to present, and the versions come back', () => {
			const h = readHistory(url);
			expect(h.ok, h.ok ? '' : h.why).toBe(true);
			if (!h.ok) return;
			expect(h.history.present).toBe(true);
			expect([...h.history.versions].sort()).toEqual(['0202', '0209', '0211']);
		});

		// -- 2. A ROW WITH THE OBJECT PRESENT -----------------------------
		it('control 2: a row whose object IS present is applied, read from the catalog', () => {
			const h = readHistory(url);
			if (!h.ok) throw new Error(h.why);
			const probes = [probe('0209', tableProbe('thing_0209'))];
			const rows = runObjectProbes(probes);
			const f = verdicts(probes, rows, h.history);
			expect(f[0].evidence).toBe('applied');
			expect(f[0].state).toBe('applied');
			expect(f[0].conflict).toBe(false);
			expect(exitFor(f)).toBe(EXIT.allApplied);
		});

		// -- 3. A ROW WITH THE OBJECT ABSENT ------------------------------
		it('control 3: a row whose object is ABSENT is NOT applied, and is a CONFLICT', () => {
			// THE FAILURE THE SEED MAKES POSSIBLE. `0211` has a row and no
			// object; the row is a claim and the catalog is the evidence.
			const h = readHistory(url);
			if (!h.ok) throw new Error(h.why);
			const probes = [probe('0211', tableProbe('thing_0211_never_created'))];
			const rows = runObjectProbes(probes);
			const f = verdicts(probes, rows, h.history);
			expect(f[0].history).toBe(true);
			expect(f[0].evidence).toBe('not-applied');
			expect(f[0].state).toBe('not-applied');
			expect(f[0].conflict).toBe(true);
			expect(exitFor(f), 'a conflict must be a STOP, not a note').toBe(EXIT.notApplied);
		});

		// -- 4. NO ROW, OBJECT PRESENT ------------------------------------
		it('control 4: NO row but the object IS present is applied, on the catalog alone', () => {
			// 0212 and 0213's real shape: applied and verified by hand, with the
			// record not yet carrying them.
			const h = readHistory(url);
			if (!h.ok) throw new Error(h.why);
			expect(h.history.versions.has('0212')).toBe(false);
			const probes = [probe('0212', tableProbe('thing_0209'))];
			const rows = runObjectProbes(probes);
			const f = verdicts(probes, rows, h.history);
			expect(f[0].history).toBe(false);
			expect(f[0].state).toBe('applied');
			expect(exitFor(f)).toBe(EXIT.allApplied);
		});

		it('the case the seed exists for: no probe, but a row carries it', () => {
			const h = readHistory(url);
			if (!h.ok) throw new Error(h.why);
			const f = verdicts([probe('0202', null)], new Map(), h.history);
			expect(f[0].state).toBe('applied');
			expect(f[0].evidence).toBe('unknown');
			expect(exitFor(f), 'this is the exit 3 that stopped six lanes').toBe(EXIT.allApplied);
		});

		it('and exit 3 still happens for a migration with neither', () => {
			const h = readHistory(url);
			if (!h.ok) throw new Error(h.why);
			const f = verdicts([probe('0206', null)], new Map(), h.history);
			expect(f[0].state).toBe('unknown');
			expect(exitFor(f)).toBe(EXIT.cannotConfirm);
		});

		// -- 6, 7 and 8. THE ROLE THIS TOOL IS ACTUALLY BUILT FOR -------------
		//
		// The `information_schema` section of `tools/deploy-probe.mjs` says it
		// in words: "A role created for this job holds nothing but CONNECT."
		// Every control above runs as the cluster owner, which can read
		// anything -- so none of them says what happens to the role that will
		// really run this in CI, and both of the next two measured differently.

		/** The presence query without its `set transaction read only;` line. */
		const presenceBody = HISTORY_PRESENCE_SQL.split('\n').slice(1).join('\n');
		/** Run something as the CONNECT-only role, through the real psql. */
		const asRole = (sql: string) => runRows(`set local role probe_connect_only;\n${sql}`, url);

		it('control 6: to_regclass RAISES for that role, and the catalog lookup does not', async () => {
			// THE DEFECT THIS FIX EXISTS FOR, measured rather than argued.
			// `to_regclass` resolves a NAME and needs USAGE on the schema to do
			// it. It does not answer null for a schema the role cannot reach --
			// it RAISES. Under `--single-transaction` with `ON_ERROR_STOP=1`
			// that fails the presence query, `readHistory` reports it, and the
			// tool exits 1: EVERY DEPLOY STOPS, on a database that is perfectly
			// reachable and perfectly correct.
			await db.sql('create role probe_connect_only nologin');

			const viaName = asRole(
				`select case when to_regclass('${HISTORY_TABLE}') is null then 'absent' else 'present' end as v;`
			);
			expect(viaName.ok, 'to_regclass no longer raises for a role with no schema USAGE').toBe(
				false
			);
			if (!viaName.ok) expect(viaName.why).toMatch(/permission denied for schema/);

			// The shipped query, same role, same database, same transaction
			// shape: it answers.
			const viaCatalog = asRole(presenceBody);
			expect(viaCatalog.ok, viaCatalog.ok ? '' : viaCatalog.why).toBe(true);
			if (viaCatalog.ok) {
				// UNREADABLE, and neither `absent` nor `present`. The table IS
				// there and this role cannot select from it; calling that
				// "absent" would tell an operator to paste a seed the database
				// already has.
				expect(viaCatalog.rows.map((x) => x.trim())).toContain('history-table|unreadable');
			}
		});

		it('control 7: readable is TWO privileges, and NEITHER alone is enough', async () => {
			// SELECT on the table, nothing on the schema. `has_table_privilege`
			// answers about the table's own ACL and says nothing about the
			// schema, so a table-only check would read this as readable and the
			// real select would then fail with `permission denied for schema`.
			await db.sql(`grant select on ${HISTORY_TABLE} to probe_connect_only`);
			const tableOnly = asRole(presenceBody);
			expect(tableOnly.ok, tableOnly.ok ? '' : tableOnly.why).toBe(true);
			if (tableOnly.ok) {
				expect(tableOnly.rows.map((x) => x.trim())).toContain('history-table|unreadable');
			}

			// AND THE MIRROR CASE, ON A ROLE OF ITS OWN: USAGE on the schema and
			// nothing on the table. FOUND BY THE MUTATION PROOF -- dropping the
			// table-privilege half of the conjunction survived, because the
			// sequence above grants the table first and then the schema, so it
			// never once asks a role that has the schema and not the table.
			// Without this the two halves are not independently pinned and
			// either could be deleted silently.
			await db.sql('create role probe_schema_only nologin');
			await db.sql('grant usage on schema supabase_migrations to probe_schema_only');
			const schemaOnly = runRows(
				`set local role probe_schema_only;\n${presenceBody}`,
				url
			);
			expect(schemaOnly.ok, schemaOnly.ok ? '' : schemaOnly.why).toBe(true);
			if (schemaOnly.ok) {
				expect(schemaOnly.rows.map((x) => x.trim())).toContain('history-table|unreadable');
			}

			// THE POSITIVE CONTROL: add the schema and it flips. Without this, a
			// query answering `unreadable` for every input would pass every
			// assertion above.
			await db.sql('grant usage on schema supabase_migrations to probe_connect_only');
			const both = asRole(presenceBody);
			expect(both.ok, both.ok ? '' : both.why).toBe(true);
			if (both.ok) expect(both.rows.map((x) => x.trim())).toContain('history-table|present');

			// And the same for the schema-only role once it gains the table, so
			// BOTH halves are proven necessary from BOTH directions.
			await db.sql(`grant select on ${HISTORY_TABLE} to probe_schema_only`);
			const schemaThenTable = runRows(
				`set local role probe_schema_only;\n${presenceBody}`,
				url
			);
			expect(schemaThenTable.ok, schemaThenTable.ok ? '' : schemaThenTable.why).toBe(true);
			if (schemaThenTable.ok) {
				expect(schemaThenTable.rows.map((x) => x.trim())).toContain('history-table|present');
			}
		});

		it('control 8: an UNREADABLE table degrades to the object probes, it does not stop the run', () => {
			// The other half of the fix, and the half that is about the deploy
			// rather than about SQL. `readHistory` answers ok with a NULL
			// history, which is this tool's own word for "the table was not
			// consulted" -- so every verdict is the object probe's, exactly as
			// before the table existed. Reporting `cannotRun` instead would mean
			// that pasting the seed stops every deploy made by a role missing
			// one grant, having previously answered fine.
			const stubbed = readHistory(
				'postgres://x',
				(() => ({ ok: true, rows: ['SET', 'history-table|unreadable'] })) as never
			);
			expect(stubbed.ok).toBe(true);
			if (!stubbed.ok) return;
			expect(stubbed.history, 'unreadable must not be collapsed into absent').toBeNull();
			expect(stubbed.why).toMatch(/may not select from it/);

			// And the verdicts are the pre-seed ones: a probe that ran decides,
			// and a migration with neither is still CANNOT SAY.
			const f = verdicts(
				[probe('0209', tableProbe('thing_0209')), probe('0203', null)],
				new Map([[0, true]]),
				stubbed.history
			);
			expect(f[0].state).toBe('applied');
			expect(f[1].state).toBe('unknown');
			expect(exitFor(f)).toBe(EXIT.cannotConfirm);
		});

		it('neither history query can write, proven by trying', () => {
			// `set transaction read only` is belt to the role's braces. Asserted
			// by running a write in the same shape and watching it refuse.
			const r = runRows(
				'set transaction read only;\ncreate table public.probe_should_never_create (id int);',
				url
			);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.why).toMatch(/read-only transaction/i);
			const after = runRows(
				`select case when to_regclass('public.probe_should_never_create') is null then 'absent' else 'present' end;`,
				url
			);
			expect(after.ok && after.rows.map((x) => x.trim()).filter(Boolean)).toEqual(['absent']);
		});
	});
});

/** Run the real object-probe statement the tool builds, through the real psql. */
function runObjectProbes(probes: { sql: string | null }[]): Map<number, boolean> {
	const rows = probes
		.map((p, i) => (p.sql ? `  select ${i} as i, (${p.sql}) as applied` : null))
		.filter((s): s is string => s !== null);
	const out = execFileSync(
		'psql',
		[url, '--no-psqlrc', '--tuples-only', '--no-align', '--field-separator=|',
		 '--set=ON_ERROR_STOP=1', '--single-transaction', '--command',
		 'set transaction read only;\nselect i, applied from (\n' + rows.join('\n  union all\n') + '\n) as probe order by i;'],
		{ encoding: 'utf8' }
	);
	const map = new Map<number, boolean>();
	for (const line of out.split('\n')) {
		const m = /^(\d+)\|([tf])$/.exec(line.trim());
		if (m) map.set(Number(m[1]), m[2] === 't');
	}
	return map;
}
