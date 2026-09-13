import { describe, expect, it, afterAll, inject } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';
import { EXIT, HISTORY_TABLE } from '../tools/deploy-probe.mjs';

/**
 * THE WHOLE TOOL, THROUGH `psql`, AGAINST A REAL POSTGRES.
 *
 * `tests/deploy-probe-history.test.ts` drives the decision matrix directly,
 * which is the half that can be reasoned about. This drives the CLI: argument
 * parsing, `tools/idea-status.py`'s derivation, the two history statements, the
 * object probes, the exit status and the rendered report, in one process, with
 * a connection string that points at a database this file planted state into.
 *
 * WHY IT IS WORTH THE SECOND FILE: every seam between those pieces is a place a
 * correct matrix produces a wrong answer, and every one of them is silent. A
 * preflight whose output `readHistory` parses wrongly reports "cannot speak"
 * forever, which reads as the pre-seed world and is exactly what somebody would
 * expect to see. Nothing on any screen distinguishes it from the real thing.
 *
 * The connection string here is a LOCAL EMBEDDED POSTGRES the harness booted.
 * Nothing in this repository can reach production and this file does not try.
 */

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SEED = readFileSync(new URL('../supabase/data/0209-seed-migration-history.sql', import.meta.url), 'utf8');
const SEED_BODY = SEED.slice(0, SEED.lastIndexOf('\nwith expected(version, name) as ('));

function urlFor(db: TestDb): string {
	const c = inject('pgCluster');
	return `postgres://${c.user}:${c.password}@${c.host}:${c.port}/${db.databaseName}`;
}

/** Run the real CLI. The exit status is the contract, so it is READ, not thrown on. */
function probe(url: string, args: string[]): { code: number; out: string; err: string } {
	try {
		const out = execFileSync('node', ['tools/deploy-probe.mjs', ...args], {
			cwd: REPO,
			encoding: 'utf8',
			env: { ...process.env, DEPLOY_PROBE_URL: url },
			maxBuffer: 64 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		return { code: 0, out, err: '' };
	} catch (e) {
		const x = e as { status?: number; stdout?: string; stderr?: string };
		return { code: x.status ?? -1, out: x.stdout ?? '', err: x.stderr ?? '' };
	}
}

let db: TestDb | null = null;
afterAll(async () => {
	if (db) await db.stop();
});

/**
 * Each `probe()` spawns node, which spawns `tools/idea-status.py` over the
 * whole migration directory, which is seconds rather than milliseconds. The
 * default 30s timeout is not a budget these fit in and a timeout here reads as
 * a hang rather than as the slow-but-correct run it is.
 */
const SLOW = 240_000;

// A window small enough that the whole report is readable, and high enough
// that every migration in it is recent. `--since`/`--ref` are the tool's own.
const WINDOW = ['--since', '205', '--ref', 'HEAD', '--json'];

function parse(out: string) {
	return JSON.parse(out) as {
		exit: number;
		history: { table: string; present: boolean; readable: boolean; recorded: number | null };
		findings: { num: string; state: string; record: string; agreement: string; why: string }[];
	};
}

describe('the CLI, end to end, against a real database', () => {
	it('with NO history table it answers exactly as it did before 0209 existed', async () => {
		db = await startTestDb([]);
		const r = probe(urlFor(db), WINDOW);
		const j = parse(r.out);

		expect(j.history.present).toBe(false);
		expect(j.history.readable).toBe(false);
		expect(j.history.recorded).toBeNull();
		// Nothing is applied on an empty database, so every probe that ran said
		// false and the exit is the hard refusal. That is the pre-seed answer.
		expect(j.findings.length).toBeGreaterThan(0);
		for (const f of j.findings) expect(f.record).toBe('unreadable');
		expect(r.code).toBe(EXIT.notApplied);
		// And it says WHY on stderr rather than silently degrading.
		expect(r.err).toContain('0209-seed-migration-history.sql');
		expect(r.err).toContain('not an error');
	}, SLOW);

	it('reads the seeded table, and reports the record on its own first line', async () => {
		await db!.sql(SEED_BODY);
		const r = probe(urlFor(db!), ['--since', '205', '--ref', 'HEAD']);
		expect(r.out.split('\n')[0]).toMatch(new RegExp(`^record: ${HISTORY_TABLE} carries 208 row\\(s\\)\\.$`));
		// The per-migration rows carry the record column, so a reader can tell
		// which source answered each line.
		expect(r.out).toContain('migration  record      state        object');
		expect(r.err).toBe('');
	}, SLOW);

	it('a row with no object is APPLIED and says the record alone answered it', async () => {
		// PLANTED: a migration whose object is absent from this database gets a
		// row, and its probe is removed by asking about a range where the file
		// exists but nothing it creates does. The tool must not call this
		// applied -- the object probe contradicts the row.
		const j = parse(probe(urlFor(db!), WINDOW).out);
		const disagreed = j.findings.filter((f) => f.agreement === 'disagreed');
		// Every 0205+ migration has a row from the seed except 0211+; none of
		// their objects exist on this empty fixture. So every one of them is a
		// planted disagreement, which is the control that the row does NOT win.
		expect(disagreed.length).toBeGreaterThan(0);
		for (const f of disagreed) {
			expect(f.state).toBe('not-applied');
			expect(f.why).toContain('CLAIMS');
		}
		expect(probe(urlFor(db!), WINDOW).code).toBe(EXIT.notApplied);
	}, SLOW);

	it('names every disagreement in the text report rather than counting it', () => {
		const r = probe(urlFor(db!), ['--since', '205', '--ref', 'HEAD']);
		expect(r.out).toMatch(/migration\(s\) have a row in supabase_migrations\.schema_migrations whose object is NOT there:/);
		expect(r.out).toContain('A row is a claim and the object is evidence.');
		expect(r.out).toContain('REFUSING: at least one migration in range is not applied.');
	}, SLOW);

	it('ENDS STATUS 3: a migration with no derivable probe answers from its row, and exits 0', async () => {
		// THE WHOLE POINT OF THE BUNDLE, DRIVEN END TO END THROUGH THE REAL CLI.
		//
		// The window `--since 209` is chosen because of what the derivation can
		// and cannot do with it, which is the property under test rather than a
		// convenience: `tools/idea-status.py` derives a probe for 0209
		// (`public.ideacad_history`) and for 0210 (`_notebook_note_grid_len`)
		// and derives NOTHING for 0211 -- the seed's own header says so in
		// words. So 0211 is a migration this tool could only ever have answered
		// CANNOT SAY about, and it is the one the row now answers.
		//
		// The objects are planted by hand rather than by applying the files:
		// the harness chain is a curated subset and does not carry 0205 and up,
		// so applying them would mean applying their dependencies too. What is
		// being measured is the TOOL, and the tool reads exactly these three
		// catalog facts.
		const plant = await startTestDb([]);
		try {
			await plant.sql('create table public.ideacad_history (id int)');
			await plant.sql(
				"create function public._notebook_note_grid_len(d jsonb) returns int language sql as 'select 0'"
			);
			await plant.sql(
				"create function public._ideacad_realtime_topic_id(p_topic text, p_prefix text) returns uuid language sql as 'select null::uuid'"
			);
			// The seed writes 0211's row only because that last function is
			// there. That conditional is the seed's, and this is the state it
			// produces.
			await plant.sql(SEED_BODY);

			const r = probe(urlFor(plant), ['--since', '209', '--ref', 'HEAD', '--json']);
			const j = parse(r.out);
			expect(j.history.present).toBe(true);
			expect(j.history.readable).toBe(true);
			// 209 and not 208: the seed lists 0001 to 0210 and adds 0211 here,
			// because the object it asks about was planted above. And the count
			// is EXACTLY the rows -- psql's own `SET` command tag used to land
			// in this set as a 209th "version" on an unseeded-by-0211 database,
			// which is why `--quiet` is on the invocation.
			expect(j.history.recorded).toBe(209);

			const byNum = new Map(j.findings.map((f) => [f.num, f]));
			expect(byNum.get('0209')!.state).toBe('applied');
			expect(byNum.get('0209')!.agreement).toBe('agree');
			expect(byNum.get('0210')!.state).toBe('applied');
			expect(byNum.get('0210')!.agreement).toBe('agree');

			// THE ONE THAT USED TO STOP THE DEPLOY.
			expect(byNum.get('0211')!.state).toBe('applied');
			expect(byNum.get('0211')!.agreement).toBe('record-only');
			expect(byNum.get('0211')!.record).toBe('recorded');
			expect(r.code).toBe(EXIT.allApplied);

			const text = probe(urlFor(plant), ['--since', '209', '--ref', 'HEAD']).out;
			expect(text).toContain('were answered by the record alone, with no object to check: 0211');
			expect(text).toContain('Every migration in range is applied to the probed database.');
		} finally {
			await plant.stop();
		}
	}, SLOW);

	it('AND STATUS 3 SURVIVES: the same window with no row for 0211 is still CANNOT SAY', async () => {
		// THE NEGATIVE CONTROL FOR THE TEST ABOVE, and the assertion the prompt
		// names. Identical fixture minus the one function, so the seed withholds
		// 0211's row: every probe that ran says applied, 0211 has neither a row
		// nor a probe, and the tool refuses with 3 rather than calling it a pass.
		const plant = await startTestDb([]);
		try {
			await plant.sql('create table public.ideacad_history (id int)');
			await plant.sql(
				"create function public._notebook_note_grid_len(d jsonb) returns int language sql as 'select 0'"
			);
			await plant.sql(SEED_BODY);

			const r = probe(urlFor(plant), ['--since', '209', '--ref', 'HEAD', '--json']);
			const j = parse(r.out);
			expect(j.history.recorded).toBe(208);
			const f = j.findings.find((x) => x.num === '0211')!;
			expect(f.state).toBe('unknown');
			expect(f.record).toBe('unrecorded');
			expect(f.agreement).toBe('neither');
			expect(j.findings.filter((x) => x.state === 'not-applied')).toEqual([]);
			expect(r.code).toBe(EXIT.cannotConfirm);
			expect(probe(urlFor(plant), ['--since', '209', '--ref', 'HEAD']).out).toContain(
				'REFUSING: the probe cannot confirm every migration in range.'
			);
		} finally {
			await plant.stop();
		}
	}, SLOW);

	it('degrades to the object probes when the role may not read the record, and says so', async () => {
		// The deploy role holds nothing but CONNECT. This is that role, made
		// real: the preflight answers "not readable", the tool says why on
		// stderr, and every verdict below is the object probe's.
		const c = inject('pgCluster');
		await db!.sql("create role probe_cli login password 'probe_cli_pw'");
		await db!.sql(`grant connect on database "${db!.databaseName}" to probe_cli`);
		await db!.sql('grant usage on schema public to probe_cli');
		const asRole = `postgres://probe_cli:probe_cli_pw@${c.host}:${c.port}/${db!.databaseName}`;

		const r = probe(asRole, WINDOW);
		const j = parse(r.out);
		expect(j.history.present).toBe(true);
		expect(j.history.readable).toBe(false);
		expect(j.history.recorded).toBeNull();
		for (const f of j.findings) expect(f.record).toBe('unreadable');
		expect(r.err).toMatch(/may not select from it/);

		// THE POSITIVE CONTROL, same role, same database: grant the select and
		// the record speaks. Without it, a preflight that answered "unreadable"
		// for every input would pass the assertions above.
		await db!.sql('grant usage on schema supabase_migrations to probe_cli');
		await db!.sql(`grant select on ${HISTORY_TABLE} to probe_cli`);
		const after = parse(probe(asRole, WINDOW).out);
		expect(after.history.readable).toBe(true);
		expect(after.history.recorded).toBe(208);
	}, SLOW);

	it('prints all three statements under --print-sql and runs nothing', () => {
		const r = probe('postgres://unused', ['--print-sql', '--since', '205', '--ref', 'HEAD']);
		expect(r.code).toBe(0);
		expect(r.out).toContain('pg_catalog.pg_class');
		expect(r.out).toContain('has_schema_privilege');
		expect(r.out).toContain(`select version from ${HISTORY_TABLE}`);
		expect(r.out).toContain('set transaction read only;');
		expect(r.out).toContain('-- 3. the object probes');
	}, SLOW);

	it('never puts the connection string in its output, on any path', () => {
		const url = urlFor(db!);
		for (const args of [WINDOW, ['--since', '205', '--ref', 'HEAD']]) {
			const r = probe(url, args);
			expect(r.out).not.toContain(url);
			expect(r.out).not.toContain('probe_cli_pw');
			expect(r.err).not.toContain(url);
		}
		// And on the failure path, where libpq's own text is what gets printed.
		const bad = probe('postgres://nobody:nope@127.0.0.1:1/none', ['--since', '205', '--ref', 'HEAD']);
		expect(bad.code).toBe(EXIT.cannotRun);
		expect(bad.err + bad.out).not.toContain('nope');
	}, SLOW);
});
