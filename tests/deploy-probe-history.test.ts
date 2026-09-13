// tests/deploy-probe-history.test.ts
//
// `tools/deploy-probe.mjs` reads production's migration HISTORY TABLE and its
// OBJECT PROBES, and this is the file that pins how the two are combined.
//
// WHY IT EXISTS. Until 2026-09-13 the database had no
// `supabase_migrations.schema_migrations` table, so the probe had nothing to
// read but the catalog, object by object -- and `tools/idea-status.py` cannot
// derive a probe from every migration (measured on this tree: 0202, 0203 and
// 0206 yield none). Each of those answered CANNOT SAY, which is exit 3, which
// is not a pass, and SIX lanes stopped at that gate. Mr. Pina pasted
// `supabase/data/0209-seed-migration-history.sql` and the verification came
// back EQUAL: 209 rows, 0001 through 0211.
//
// WHAT MUST NOT BE LOST IN CLOSING IT. A history row is a CLAIM -- somebody or
// something wrote it. An object probe is EVIDENCE -- production's own
// `pg_catalog`. The row that claims an apply which never happened is exactly
// the failure the seed makes possible, and the object probe is the only check
// in this repository that catches it. So every case below is planted in BOTH
// directions rather than only in the direction that unblocks anything.
//
// THE MATRIX, WHICH IS THE WHOLE POINT OF THE FILE:
//
//   row | probe        | state       | who decided
//   ----+--------------+-------------+---------------------------------------
//   yes | applied      | applied     | both agree
//   yes | NOT applied  | NOT applied | the probe. Reported as a CONFLICT.
//   yes | (no probe)   | applied     | the row -- the only case it decides
//   no  | applied      | applied     | the probe
//   no  | NOT applied  | NOT applied | the probe
//   no  | (no probe)   | CANNOT SAY  | neither -- exit 3 still exists
//   no table at all    | ...         | the probes alone, pre-seed behaviour
//   no credential      | ...         | exit 1, and nothing crashes

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	EXIT,
	HISTORY_PRESENCE_SQL,
	HISTORY_TABLE,
	HISTORY_VERSIONS_SQL,
	exitFor,
	readHistory,
	verdicts
} from '../tools/deploy-probe.mjs';

const TOOL = fileURLToPath(new URL('../tools/deploy-probe.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A probe row as `prepare()` produces one: `sql` set means a probe exists. */
type Probe = {
	num: string;
	file: string;
	kind: string;
	object: string;
	sql: string | null;
	translated: boolean;
	refused: string | null;
};

const probe = (num: string, sql: string | null): Probe => ({
	num,
	file: `${num}_planted.sql`,
	kind: 'table',
	object: `public.thing_${num}`,
	sql,
	translated: false,
	refused: null
});

/** A history reading, as `readHistory` returns one. */
const seeded = (...versions: string[]) => ({ present: true, versions: new Set(versions) });
const noTable = { present: false, versions: new Set<string>() };

describe('the history table and the object probes, combined', () => {
	// ------------------------------------------------------------------
	// A ROW WITH THE OBJECTS PRESENT.
	// ------------------------------------------------------------------
	it('a row AND a probe that says applied is applied, and is read from the catalog', () => {
		const f = verdicts([probe('0209', 'exists (select 1)')], new Map([[0, true]]), seeded('0209'));
		expect(f).toHaveLength(1);
		expect(f[0].state).toBe('applied');
		expect(f[0].history).toBe(true);
		expect(f[0].evidence).toBe('applied');
		expect(f[0].conflict).toBe(false);
		expect(exitFor(f)).toBe(EXIT.allApplied);
	});

	// ------------------------------------------------------------------
	// A ROW WITH THE OBJECTS ABSENT. The failure the seed makes possible.
	// ------------------------------------------------------------------
	it('a row whose objects are ABSENT is NOT applied, and says so as a conflict', () => {
		const f = verdicts([probe('0209', 'exists (select 1)')], new Map([[0, false]]), seeded('0209'));
		expect(f[0].state).toBe('not-applied');
		expect(f[0].history).toBe(true);
		expect(f[0].evidence).toBe('not-applied');
		expect(f[0].conflict, 'a claim contradicted by the catalog was absorbed silently').toBe(true);
		expect(f[0].why).toContain('CONFLICT');
		expect(f[0].why).toContain(HISTORY_TABLE);
		// THE STATUS IS THE HALF THAT MATTERS: a conflict is a STOP, not a
		// note. Exit 2 is what `deploy.yml` refuses on with no typed string
		// able to carry it.
		expect(exitFor(f)).toBe(EXIT.notApplied);
	});

	it('a row does not rescue a sibling probe of the same migration', () => {
		// 0205 derives EIGHT probe rows on this tree. One object missing is one
		// object missing, whatever the other seven and the row say.
		const f = verdicts(
			[probe('0205', 'exists (a)'), probe('0205', 'exists (b)')],
			new Map([
				[0, true],
				[1, false]
			]),
			seeded('0205')
		);
		expect(f.map((x) => x.state)).toEqual(['applied', 'not-applied']);
		expect(exitFor(f)).toBe(EXIT.notApplied);
	});

	// ------------------------------------------------------------------
	// NO ROW, OBJECTS PRESENT. Evidence outranks a record that is behind.
	// ------------------------------------------------------------------
	it('NO row but the objects ARE present is applied, on the catalog alone', () => {
		// This is 0212 and 0213's real shape: applied by hand and verified,
		// with the record not yet carrying them.
		const f = verdicts([probe('0212', 'exists (select 1)')], new Map([[0, true]]), seeded('0209'));
		expect(f[0].state).toBe('applied');
		expect(f[0].history).toBe(false);
		expect(f[0].evidence).toBe('applied');
		expect(exitFor(f)).toBe(EXIT.allApplied);
	});

	it('NO row and the objects absent is NOT applied', () => {
		const f = verdicts([probe('0212', 'exists (select 1)')], new Map([[0, false]]), seeded('0209'));
		expect(f[0].state).toBe('not-applied');
		expect(f[0].conflict, 'nothing claimed this, so nothing conflicts').toBe(false);
		expect(exitFor(f)).toBe(EXIT.notApplied);
	});

	// ------------------------------------------------------------------
	// THE CASE THE SEED EXISTS FOR, and the one that keeps exit 3 alive.
	// ------------------------------------------------------------------
	it('a migration with NO probe is carried by its row -- the one case a row decides', () => {
		const f = verdicts([probe('0202', null)], new Map(), seeded('0202'));
		expect(f[0].state).toBe('applied');
		expect(f[0].evidence, 'a row must never be reported as evidence').toBe('unknown');
		expect(f[0].why).toContain(HISTORY_TABLE);
		expect(exitFor(f)).toBe(EXIT.allApplied);
	});

	it('a migration with NO probe and NO row is still CANNOT SAY, and still exit 3', () => {
		const f = verdicts([probe('0202', null)], new Map(), seeded('0209'));
		expect(f[0].state).toBe('unknown');
		expect(f[0].history).toBe(false);
		expect(f[0].why).toContain('has no row for it');
		expect(exitFor(f), 'status 3 stopped meaning cannot confirm').toBe(EXIT.cannotConfirm);
	});

	it('a probe sent with no row back is CANNOT SAY, and a history row does carry it', () => {
		// The transport failed for this index. Nothing was measured, so this is
		// not evidence either way -- and the row is then the only thing left.
		const withRow = verdicts([probe('0209', 'exists (x)')], new Map(), seeded('0209'));
		expect(withRow[0].evidence).toBe('unknown');
		expect(withRow[0].state).toBe('applied');
		const without = verdicts([probe('0209', 'exists (x)')], new Map(), seeded('0001'));
		expect(without[0].state).toBe('unknown');
		expect(exitFor(without)).toBe(EXIT.cannotConfirm);
	});

	// ------------------------------------------------------------------
	// NO TABLE AT ALL. The pre-seed world, which must still work.
	// ------------------------------------------------------------------
	it('with NO table the answers are the object probes alone, byte for byte', () => {
		const probes = [probe('0209', 'exists (x)'), probe('0202', null)];
		const rows = new Map([[0, true]]);
		const withoutTable = verdicts(probes, rows, noTable);
		expect(withoutTable.map((f) => f.state)).toEqual(['applied', 'unknown']);
		expect(withoutTable.every((f) => f.history === null)).toBe(true);
		expect(exitFor(withoutTable)).toBe(EXIT.cannotConfirm);

		// AND THE TWO-ARGUMENT CALL IS IDENTICAL. `tools/apply-migration.mjs`
		// calls `verdicts(probes, rows)` with two arguments and is not this
		// bundle's to change, so the default has to BE the pre-seed behaviour
		// rather than merely resemble it.
		expect(verdicts(probes, rows)).toEqual(withoutTable);
	});

	// ------------------------------------------------------------------
	// THE POSITIVE CONTROL FOR THE WHOLE FILE. Without it, "every case came
	// back applied" cannot be told from "the combiner answers applied".
	// ------------------------------------------------------------------
	it('positive control: the combiner does not simply answer applied', () => {
		const states = new Set(
			[
				verdicts([probe('0209', 'x')], new Map([[0, true]]), seeded('0209'))[0].state,
				verdicts([probe('0209', 'x')], new Map([[0, false]]), seeded('0209'))[0].state,
				verdicts([probe('0202', null)], new Map(), seeded('0001'))[0].state
			].values()
		);
		expect([...states].sort()).toEqual(['applied', 'not-applied', 'unknown']);
	});
});

describe('readHistory', () => {
	/** A stub standing in for `runRows`, recording what it was asked. */
	const stub = (answers: Array<{ ok: true; rows: string[] } | { ok: false; why: string }>) => {
		const asked: string[] = [];
		let i = 0;
		const run = (sql: string) => {
			asked.push(sql);
			return answers[i++] ?? { ok: false as const, why: 'the stub ran out of answers' };
		};
		return { asked, run: run as never };
	};

	// EVERY STUBBED ROW SET BELOW IS WHAT `psql` ACTUALLY EMITS, TAG INCLUDED.
	// `set transaction read only;` prints a bare `SET` line and `--tuples-only`
	// does not suppress it -- which is exactly what an earlier draft of
	// `readHistory` read as the answer, reporting `cannotRun` against a
	// perfectly reachable database. A stub that emits a tidier shape than the
	// real producer is a stub that cannot reproduce that.
	// `tests/db/deploy-probe-history-live.test.ts` is where the shape is
	// measured rather than asserted.
	it('asks presence FIRST and does not ask for versions when the table is absent', () => {
		// A `select` naming a missing relation fails at PARSE time, so the
		// presence check cannot be folded into the same statement -- and under
		// `--single-transaction` it would abort the object probes with it.
		const s = stub([{ ok: true, rows: ['SET', 'history-table|absent', ''] }]);
		const r = readHistory('postgres://x', s.run);
		expect(r.ok && r.history.present).toBe(false);
		expect(s.asked).toHaveLength(1);
		expect(s.asked[0]).toBe(HISTORY_PRESENCE_SQL);
		// THE CATALOG, NOT THE NAME. `to_regclass` resolves a qualified name and
		// needs USAGE on the schema to do it, so for the role this tool runs as
		// it RAISES instead of answering null -- measured in the live file.
		expect(s.asked[0]).toContain('pg_catalog.pg_class');
		expect(s.asked[0]).not.toContain('to_regclass');
	});

	it('reads the versions when the table is present', () => {
		const s = stub([
			{ ok: true, rows: ['SET', 'history-table|present'] },
			{ ok: true, rows: ['SET', 'v|0001', 'v|0002', 'v|0211', ''] }
		]);
		const r = readHistory('postgres://x', s.run);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.history.present).toBe(true);
		expect([...r.history.versions].sort()).toEqual(['0001', '0002', '0211']);
		expect(s.asked).toEqual([HISTORY_PRESENCE_SQL, HISTORY_VERSIONS_SQL]);
	});

	it('a query error is cannot-run, NEVER "the table is absent"', () => {
		// Falling back to the object probes here would turn a broken credential
		// into a quieter verdict rather than a reported one.
		expect(readHistory('postgres://x', stub([{ ok: false, why: 'psql exited 2' }]).run)).toEqual({
			ok: false,
			why: 'psql exited 2'
		});
		const after = readHistory(
			'postgres://x',
			stub([
				{ ok: true, rows: ['SET', 'history-table|present'] },
				{ ok: false, why: 'permission denied' }
			]).run
		);
		expect(after).toEqual({ ok: false, why: 'permission denied' });
	});

	it('an answer that is neither present nor absent is cannot-run', () => {
		expect(readHistory('postgres://x', stub([{ ok: true, rows: ['', '  '] }]).run).ok).toBe(false);
		// AND A BARE COMMAND TAG IS NOT AN ANSWER. This is the defect that was
		// found against a real Postgres, pinned here in the cheap instrument
		// too: the tag arrives FIRST, so a reader taking the first non-empty
		// line answers `cannotRun` on a database that is perfectly reachable.
		expect(readHistory('postgres://x', stub([{ ok: true, rows: ['SET', ''] }]).run).ok).toBe(
			false
		);
		// A version row must not be read as a presence answer either.
		expect(readHistory('postgres://x', stub([{ ok: true, rows: ['v|0211'] }]).run).ok).toBe(false);
	});

	it('both queries are read-only and neither can write', () => {
		for (const sql of [HISTORY_PRESENCE_SQL, HISTORY_VERSIONS_SQL]) {
			expect(sql).toContain('set transaction read only');
			expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate)\b/i);
		}
	});
});

describe('with no credential at all', () => {
	// `DEPLOY_PROBE_URL` was UNSET as a repository secret when this was
	// written -- ledger 0215 measured `deploy.yml`'s own step log printing it
	// empty on a real runner. The no-credential path is therefore the path
	// production takes today, and it must answer rather than crash.
	const run = (env: NodeJS.ProcessEnv) => {
		try {
			const stdout = execFileSync('node', [TOOL, '--ref', 'HEAD', '--since', '209'], {
				cwd: ROOT,
				encoding: 'utf8',
				env: { ...process.env, ...env }
			});
			return { status: 0, stdout, stderr: '' };
		} catch (err) {
			const e = err as { status?: number; stdout?: string; stderr?: string };
			return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
		}
	};

	it('answers cannot-run, not a crash and never a pass', () => {
		const r = run({ DEPLOY_PROBE_URL: '' });
		expect(r.status).toBe(EXIT.cannotRun);
		expect(r.stderr).toContain('is not set');
		expect(r.stderr).toContain('never "applied"');
		// A CRASH WOULD ALSO EXIT NON-ZERO, so the status alone proves nothing.
		expect(r.stderr).not.toMatch(/TypeError|ReferenceError|is not a function|Cannot read/);
	});

	it('--print-sql prints BOTH questions, in the order they run', () => {
		// A person pasting this into the Supabase SQL editor is asking the same
		// two questions the tool asks. Printing only the object probes would
		// hide the one that now answers most of the range.
		const sql = execFileSync('node', [TOOL, '--print-sql', '--ref', 'HEAD', '--since', '209'], {
			cwd: ROOT,
			encoding: 'utf8',
			env: { ...process.env, DEPLOY_PROBE_URL: '' }
		});
		expect(sql).toContain('pg_catalog.pg_class');
		expect(sql).toContain(HISTORY_TABLE);
		expect(sql).toContain('the object probes, which are the evidence');
		// The history questions come FIRST, which is the order the tool runs
		// them in and the order a person should read them in.
		expect(sql.indexOf('pg_catalog.pg_class')).toBeLessThan(sql.indexOf('the object probes'));
	});
});
