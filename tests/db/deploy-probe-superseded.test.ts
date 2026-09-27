// tests/db/deploy-probe-superseded.test.ts
//
// A FUNCTION BODY A LATER MIGRATION REPLACED MUST NOT READ AS THE EARLIER
// MIGRATION MISSING (ledger 0338).
//
// Migrate run 36350843846 refused with exit 2 on production, which holds every
// migration: 0166's body marker for `_app_short_link_reserved` was gone because
// 0196 and 0215 rewrote the function, and 0214's for `_ideacad_part_owner`
// because 0216 did. The probe asked for each migration's OWN line.
//
// THE CHAIN IS CONSTRUCTED, NEVER READ OFF THE LIVE TREE
// (IDEA_VERIFICATION_ADDENDA rule 43): a throwaway git repository carries four
// migrations -- one function written three times, and one ordinary object --
// and the REAL `tools/idea-status.py` derives the probes from it, the REAL
// `prepare`/`buildSql`/`runSql` send them through the real `psql` to a real
// Postgres, and the REAL `verdicts` judges them. What differs between the
// cases is only which body the database holds and what the record says.
//
//   0001  creates fx() with body A
//   0002  replaces it with body B     <- the superseded one, like 0166 / 0214
//   0003  replaces it with body C     <- the last definer
//   0004  creates fy()                <- an ordinary object, for "missing"

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './harness';
import {
	EXIT,
	buildSql,
	exitFor,
	noHistory,
	prepare,
	runSql,
	verdicts
} from '../../tools/deploy-probe.mjs';

const TOOL = fileURLToPath(new URL('../../tools/idea-status.py', import.meta.url));

const SHARED = "v_note := 'a statement every one of the three bodies carries, word for word';";
const LINE = {
	A: "v_note := 'alpha: written only by the first migration';",
	B: "v_note := 'bravo: written only by the second migration';",
	C: "v_note := 'charlie: written only by the third migration';"
};

const fx = (line: string) => `
create or replace function public.fx() returns text
language plpgsql as $$
declare v_note text;
begin
	${SHARED}
	${line}
	return v_note;
end;
$$;
`;

const MIGRATIONS: Record<string, string> = {
	'0001_fx.sql': fx(LINE.A),
	'0002_fx_again.sql': fx(LINE.B),
	'0003_fx_third.sql': fx(LINE.C),
	'0004_fy.sql': 'create or replace function public.fy() returns int language sql as $$ select 1 $$;\n'
};

let dir: string;
let db: TestDb;
let url: string;
let probes: ReturnType<typeof prepare>;
let sql: string;

type History = Parameters<typeof verdicts>[2];
const recorded = (...nums: string[]): History => ({
	present: true,
	readable: true,
	versions: new Set(nums.map((n) => String(Number(n)))),
	why: 'constructed'
});

function psql(statement: string) {
	execFileSync('psql', [url, '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--quiet', '--command', statement], {
		encoding: 'utf8',
		env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' }
	});
}

/** Put the database in a state, run every probe, and judge it. */
function judge(state: { fx: keyof typeof LINE | null; fy: boolean }, history: History = noHistory()) {
	psql('drop function if exists public.fx(); drop function if exists public.fy();');
	if (state.fx) psql(fx(LINE[state.fx]));
	if (state.fy) psql(MIGRATIONS['0004_fy.sql']);
	const r = runSql(sql, url);
	if (!r.ok) throw new Error(r.why);
	const findings = verdicts(probes, r.rows, history);
	const of = (num: string, kind: string) => {
		const i = probes.findIndex((p) => p.num === num && p.kind === kind);
		expect(i, `no ${kind} probe for ${num}`).toBeGreaterThanOrEqual(0);
		return findings[i];
	};
	return { findings, of, exit: exitFor(findings) };
}

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), 'probe-superseded-'));
	const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
	git('init', '--quiet', '--initial-branch=main');
	git('config', 'user.email', 'fixture@example.invalid');
	git('config', 'user.name', 'Fixture');
	mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true });
	for (const [name, body] of Object.entries(MIGRATIONS)) {
		writeFileSync(join(dir, 'supabase', 'migrations', name), body);
	}
	git('add', '-A');
	git('commit', '--quiet', '-m', 'constructed chain');
	git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));

	const out = spawnSync('python3', [TOOL, '--local', dir, '--json', '--since', '1'], {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024
	});
	// 1 is the tool's "two files define one object" FINDING, which this chain
	// has on purpose; anything else is the tool failing.
	if (out.status !== 0 && out.status !== 1) throw new Error(`idea-status.py exited ${out.status}\n${out.stderr}`);
	probes = prepare(JSON.parse(out.stdout).probes);
	sql = buildSql(probes);

	db = await startTestDb([]);
	const c = inject('pgCluster') as { host: string; port: number; user: string; password: string };
	url = `postgresql://${c.user}:${c.password}@${c.host}:${c.port}/${db.databaseName}`;
}, 120_000);

afterAll(async () => {
	await db?.stop();
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('a function body a later migration replaced', () => {
	it('is derived as superseded for 0002 and as a plain marker for the last definer', () => {
		// The denominator: every migration has at least one probe that runs,
		// so no case below can pass on a probe that was never sent.
		for (const n of ['0001', '0002', '0003', '0004']) {
			expect(probes.some((p) => p.num === n && p.sql), n).toBe(true);
		}
		const sup = probes.find((p) => p.num === '0002' && p.kind === 'superseded') as any;
		expect(sup?.superseded_by).toEqual(['0003']);
		expect(probes.find((p) => p.num === '0003' && p.kind === 'marker')).toBeTruthy();
		// The fixture's own premise: the last body does NOT carry 0002's line,
		// so an own-body check genuinely cannot pass the first case below.
		expect(MIGRATIONS['0003_fx_third.sql']).not.toContain(sup.marker);
	});

	it('reads APPLIED when the LATEST body is live, record or no record', () => {
		for (const history of [noHistory(), recorded('0001', '0002', '0003', '0004')]) {
			const r = judge({ fx: 'C', fy: true }, history);
			expect(r.of('0002', 'superseded').state).toBe('applied');
			expect(r.of('0002', 'superseded').agreement).not.toBe('conflict');
			expect(r.of('0003', 'marker').state).toBe('applied');
			expect(r.exit).toBe(EXIT.allApplied);
		}
	});

	it('reads APPLIED while a NEWER redefinition is still unapplied, and the new one is what is named', () => {
		// The case migrate.yml exists for: 0003 has landed and not run. Judging
		// 0002 by the LAST body alone would read it NOT APPLIED too, and the
		// lowest unapplied migration would be 0002 -- already applied.
		const r = judge({ fx: 'B', fy: true }, recorded('0001', '0002', '0004'));
		expect(r.of('0002', 'superseded').state).toBe('applied');
		expect(r.of('0003', 'marker').state).toBe('not-applied');
		const lowest = r.findings.filter((f) => f.state === 'not-applied').map((f) => f.num).sort()[0];
		expect(lowest).toBe('0003');
	});

	it('reads NOT APPLIED when the object is genuinely missing, or carries an EARLIER body', () => {
		const missing = judge({ fx: null, fy: false });
		expect(missing.of('0002', 'superseded').state).toBe('not-applied');
		expect(missing.of('0004', 'object').state).toBe('not-applied');
		expect(missing.exit).toBe(EXIT.notApplied);

		const earlier = judge({ fx: 'A', fy: true });
		expect(earlier.of('0002', 'superseded').state).toBe('not-applied');
		expect(earlier.of('0001', 'object').state).toBe('applied'); // positive control
	});

	it('still reads CONFLICT when the record says applied and the latest definition is absent', () => {
		const r = judge({ fx: null, fy: true }, recorded('0001', '0002', '0003', '0004'));
		const f = r.of('0002', 'superseded');
		expect(f.state).toBe('not-applied');
		expect(f.agreement).toBe('conflict');
		expect(r.of('0004', 'object').agreement).toBe('agree'); // positive control
		expect(r.exit).toBe(EXIT.notApplied);
	});
});
