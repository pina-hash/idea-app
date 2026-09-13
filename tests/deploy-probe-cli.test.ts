import { describe, expect, it, afterAll, beforeAll, inject } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';
import { requireProbeRefs } from './git-refs-precondition';
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

/**
 * A commit off `origin/main` carrying ONE extra file under
 * `supabase/migrations/`, returned as a sha. `migrationsOnlyOn` reports that
 * file as off-main and `readProbes` turns it into a probe with NO SQL, which is
 * the shape the record has to answer for.
 *
 * WHY SYNTHESISE RATHER THAN NAME ONE: which real migration lacks a derivable
 * probe is a fact about `tools/idea-status.py` AND about which files
 * `origin/main` carries, and both move. This test named `0211` and the premise
 * died mid-session when `origin/main` picked the file up.
 *
 * NOTHING IS WRITTEN THAT ANYTHING ELSE CAN SEE: a temporary index file, two
 * loose objects and a commit with no ref pointing at it. The working tree, the
 * real index and every branch are untouched.
 */
function synthesizeOffMainMigration(filename: string): string {
	const index = join(tmpdir(), `deploy-probe-fixture-index-${process.pid}`);
	rmSync(index, { force: true });
	const git = (args: string[], extra?: NodeJS.ProcessEnv): string =>
		execFileSync('git', args, {
			cwd: REPO,
			encoding: 'utf8',
			env: { ...process.env, ...extra },
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();
	try {
		git(['read-tree', 'origin/main'], { GIT_INDEX_FILE: index });
		const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
			cwd: REPO,
			encoding: 'utf8',
			input: '-- a migration file that creates nothing a probe can be derived from\n'
		}).trim();
		git(
			['update-index', '--add', '--cacheinfo', `100644,${blob},supabase/migrations/${filename}`],
			{ GIT_INDEX_FILE: index }
		);
		const tree = git(['write-tree'], { GIT_INDEX_FILE: index });
		return git(['commit-tree', tree, '-p', 'origin/main', '-m', 'deploy-probe fixture']);
	} finally {
		rmSync(index, { force: true });
	}
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

// THE SAME PRECONDITION THE APPLY-MIGRATION SUITES USE, for the same reason:
// this file hands the real CLI a `--ref`, and a shallow or single-ref checkout
// makes it answer "the applied set could not be read" -- correct behaviour,
// reported here as a wrong string about the tool. It fails rather than skips.
beforeAll(() => {
	requireProbeRefs('origin/main');
});

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

	it('A ROW IS NEVER A LICENCE WHERE A PROBE ACTUALLY RAN: every claim is refused', async () => {
		// PLANTED, AND PLANTED IN BULK. The seed wrote a row for every migration
		// in this window and NONE of their objects exists on this empty fixture,
		// so every finding here is a row claiming an apply the database denies.
		// That is the failure the seed introduces as a possibility, and the
		// object probes are the only thing that catches it.
		const j = parse(probe(urlFor(db!), WINDOW).out);
		const disagreed = j.findings.filter((f) => f.agreement === 'disagreed');
		// THE CASE COUNT, ASSERTED, so a window that generated nothing cannot
		// pass. If this ever reads zero the fixture stopped planting anything
		// and the loop below was proving nothing -- which is the shape this
		// file already failed once, by naming a migration whose premise moved.
		expect(disagreed.length).toBeGreaterThan(0);
		for (const f of disagreed) {
			expect(f.record).toBe('recorded');
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
		// THE NO-PROBE MIGRATION IS SYNTHESISED RATHER THAN NAMED, AND THE FIRST
		// VERSION OF THIS TEST NAMED ONE. It used `0211`, on the strength of
		// `supabase/data/0209-seed-migration-history.sql`'s own header saying
		// `tools/idea-status.py` derives no probe for it. That was true when it
		// was written and stopped being true mid-session, for a reason nothing
		// in this file could see: `origin/main` moved and picked the file up, so
		// the derivation started answering for it and both directions of this
		// pair inverted at once. **Which migration lacks a probe is a fact about
		// two other tools and a git ref, and a fixture resting on it is a
		// fixture with an expiry date nobody wrote down.**
		//
		// So the fixture is built instead: a commit off `origin/main` carrying
		// ONE extra file under `supabase/migrations/`, which `migrationsOnlyOn`
		// reports as off-main and `readProbes` turns into a probe with no SQL --
		// the shape under test -- and a `--since` above every real migration, so
		// the derivation contributes nothing and this is the ONLY finding. No
		// ref is created and the working tree is untouched.
		const fixture = synthesizeOffMainMigration('9001_probe_fixture.sql');
		const args = ['--since', '9000', '--ref', fixture, '--json'];

		const plant = await startTestDb([]);
		try {
			await plant.sql(SEED_BODY);

			// WITHOUT A ROW: neither source can speak. This is the status 3 that
			// stopped five lanes, reproduced exactly.
			const before = probe(urlFor(plant), args);
			const jb = parse(before.out);
			expect(jb.findings.length).toBe(1);
			expect(jb.findings[0].num).toBe('9001');
			expect(jb.findings[0].state).toBe('unknown');
			expect(jb.findings[0].record).toBe('unrecorded');
			expect(jb.findings[0].agreement).toBe('neither');
			expect(before.code).toBe(EXIT.cannotConfirm);
			expect(probe(urlFor(plant), ['--since', '9000', '--ref', fixture]).out).toContain(
				'REFUSING: the probe cannot confirm every migration in range.'
			);

			// PLANT THE ROW, AND NOTHING ELSE. No object is created, because
			// there is no object to create -- that is what "no derivable probe"
			// means. The row is the only thing that changes.
			await plant.sql(
				"insert into supabase_migrations.schema_migrations (version, name) values ('9001','probe_fixture')"
			);

			const after = probe(urlFor(plant), args);
			const ja = parse(after.out);
			expect(ja.history.recorded).toBe(209);
			expect(ja.findings[0].state).toBe('applied');
			expect(ja.findings[0].record).toBe('recorded');
			expect(ja.findings[0].agreement).toBe('record-only');
			expect(ja.findings[0].why).toContain('the row is the only evidence');
			expect(after.code).toBe(EXIT.allApplied);

			const text = probe(urlFor(plant), ['--since', '9000', '--ref', fixture]).out;
			expect(text).toContain('were answered by the record alone, with no object to check: 9001');
			expect(text).toContain('Every migration in range is applied to the probed database.');
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
