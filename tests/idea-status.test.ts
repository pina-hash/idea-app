// tests/idea-status.test.ts
//
// `tools/idea-status.py` is read-only and most of what it prints fails
// visibly: a wrong branch list or a wrong delta is wrong on screen, in front
// of the person who ran it. ONE PART OF IT DOES NOT, and that part is why
// this file exists.
//
// The applied-state probe block ([3a]) is pasted into the Supabase SQL editor
// and its result is read as "these migrations are applied". A generator that
// silently omits a migration produces a shorter answer that looks exactly
// like a correct one, and every omitted migration reads as NOT APPLIED --
// which is the safe direction only until somebody applies it twice, or spends
// a night believing a gate is closed that is open. That failure has already
// happened once, in the tool this section supersedes:
// `docs/prompt-ledger/entries/0003-migrations-ledger-and-tool.md` records
// "deduping objects by first creator silently dropped five migrations from
// the probe ... and nothing said so", plus a marker generated with an
// unescaped quote that was a syntax error on paste. Both are invisible to
// every reader and both are asserted here.
//
// THE FIXTURE IS A REAL GIT REPOSITORY, built in a temp directory, with real
// `refs/remotes/origin/*` refs -- which is what the tool reads. `--local`
// points it at that repo instead of cloning, so this runs offline in
// milliseconds and touches no network and no working checkout. The expected
// values come from the FIXTURE FILES, not from the tool: the body marker is
// checked by looking for it in the two SQL bodies directly, which is an
// oracle outside the implementation rather than a value pinned from a run.
//
// python3 is a hard requirement, deliberately not skipped around. It is
// present on ubuntu-latest and in this container, and a test that skips
// itself when its subject is unavailable is a test that reports success for
// never having run.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOL = join(REPO_ROOT, 'tools', 'idea-status.py');

/** 0154 replaces 0151's function. This line is what tells the two bodies apart,
 *  and it carries an apostrophe on purpose: an unescaped one is a syntax error
 *  on paste, which is the second defect entry 0003 recorded. */
const MARKER_LINE = "raise exception 'it''s the second body';";

/** A line BOTH bodies carry, and LONGER than the marker line, so it is the
 *  first thing a longest-first search reaches. It is what makes this fixture
 *  able to tell a correct marker picker from one that has stopped checking
 *  the other bodies: without a shared candidate ranked above the real marker,
 *  both pickers return the same line and the mutation is inert. Measured:
 *  removing the absence check reddens the oracle assertion only once this
 *  line is here. */
const SHARED_LINE = "v_shared := 'this identical statement appears in both bodies of the fixture function';";

const MIGRATIONS: Record<string, string> = {
	// A plain function: probed by pg_proc.
	'0151_fixture_alpha.sql': `
create or replace function public.fixture_alpha() returns int
language plpgsql as $$
declare v_shared text;
begin
	${SHARED_LINE}
	return 1;
end;
$$;
`,
	// A table: probed by pg_class.
	'0152_fixture_thing.sql': `
create table if not exists public.fixture_thing (id uuid primary key);
`,
	// NOTHING PROBEABLE. It only updates rows, exactly as the real 0153 does.
	// It must appear in the probe list as `no probe`, never be dropped.
	'0153_fixture_data_only.sql': `
update public.fixture_thing set id = id where false;
`,
	// REPLACES 0151's function. Existence proves nothing here, so this one
	// must get a BODY MARKER as well as (or instead of) an existence probe.
	'0154_fixture_alpha_again.sql': `
create or replace function public.fixture_alpha() returns int
language plpgsql as $$
declare v_shared text;
begin
	${SHARED_LINE}
	${MARKER_LINE}
	return 2;
end;
$$;
`,

	// --- THE RETIREMENT FIXTURES (ledger 0391). All numbered BELOW 0151 so the
	// `--since 151` and `--since 153` assertions above keep their ranges; they
	// are read only by `--since 141`. The shape is the real 0239/0251 one:
	// 0251 retired `coin_public_sections`, which 0239 had redefined, so 0239's
	// body marker asked the catalog for a function that is gone BY DESIGN and
	// read NOT APPLIED against the record, and migrate.yml, which applies the
	// lowest unapplied migration, targeted 0239 on every push (runs 205 to
	// 207) and was refused as already recorded; nothing above it could land.

	// A function, defined once...
	'0141_fixture_beta.sql': `
create or replace function public.fixture_beta() returns int
language plpgsql as $$
begin
	return 1;
end;
$$;
`,
	// ...redefined (so it would ordinarily earn a body marker)...
	'0142_fixture_beta_again.sql': `
create or replace function public.fixture_beta() returns int
language plpgsql as $$
begin
	raise notice 'the second beta body';
	return 2;
end;
$$;
`,
	// ...and DROPPED DYNAMICALLY, 0251's exact shape: a list of quoted
	// signatures, a caller guard, `execute 'drop function ' || v_sig`. Nothing
	// here is created, so this file itself has no probe.
	'0143_fixture_retire_beta.sql': `
do $drop$
declare
	v_sigs text[] := array[
		'public.fixture_beta()'
	];
	v_sig text;
begin
	foreach v_sig in array v_sigs loop
		if to_regprocedure(v_sig) is null then
			continue;
		end if;
		execute 'drop function ' || v_sig;
	end loop;
end
$drop$;
`,
	// A table created by one file and statically dropped by the next.
	'0144_fixture_gamma.sql': `
create table if not exists public.fixture_gamma (id uuid primary key);
`,
	'0145_fixture_drop_gamma.sql': `
drop table if exists public.fixture_gamma;
`,
	// THE NEGATIVE CONTROL: a drop followed by a create of the same function
	// in the SAME file is a re-signing, not a retirement. 0147 must keep an
	// ordinary body marker and 0146 an ordinary object probe.
	'0146_fixture_delta.sql': `
create or replace function public.fixture_delta() returns int
language plpgsql as $$
begin
	return 1;
end;
$$;
`,
	'0147_fixture_delta_resigned.sql': `
drop function if exists public.fixture_delta();
create function public.fixture_delta(p_times int) returns int
language plpgsql as $$
begin
	raise notice 'the re-signed delta body';
	return 2 * p_times;
end;
$$;
`
};

let dir: string;
let repo: string;

function git(...args: string[]) {
	return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function write(path: string, body: string) {
	const full = join(repo, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, body);
}

/**
 * THE EXIT CODE IS PART OF THE CONTRACT, so this returns it rather than
 * throwing on it: the tool exits 1 when an object in the migration range is
 * defined by two files, which is a FINDING and not a failure -- that is the
 * 0151/0148 collision it was written to surface. `execFileSync` throws on a
 * non-zero exit, which would have made every collision fixture below look
 * like a broken tool.
 */
function run(...args: string[]): { data: any; status: number } {
	const r = spawnSync('python3', [TOOL, '--local', repo, '--json', ...args], {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024
	});
	if (r.error) throw r.error;
	if (r.status !== 0 && r.status !== 1) {
		throw new Error(`idea-status.py exited ${r.status}\n${r.stderr}`);
	}
	return { data: JSON.parse(r.stdout), status: r.status ?? -1 };
}

function runTool(...args: string[]) {
	return run(...args).data;
}

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'idea-status-fixture-'));
	repo = join(dir, 'fixture');
	mkdirSync(repo);
	git('init', '--quiet', '--initial-branch=main');
	git('config', 'user.email', 'fixture@example.invalid');
	git('config', 'user.name', 'Fixture');

	for (const [name, body] of Object.entries(MIGRATIONS)) {
		write(`supabase/migrations/${name}`, body);
	}

	write(
		'docs/decisions/entries/01-open-one.md',
		'# 01 An open decision\n' +
			'- Raised: 2026-09-02  By: a chat\n' +
			'- Status: open\n' +
			'- Decision:\n' +
			'- Default this assistant would pick: the default sentence.\n' +
			'- What it unblocks: a lane.\n'
	);
	write(
		'docs/decisions/entries/02-decided-one.md',
		'# 02 A decided decision\n' +
			'- Raised: 2026-09-01  By: a chat\n' +
			'- Status: decided\n' +
			'- Decision: yes, 2026-09-02.\n' +
			'- Default this assistant would pick: irrelevant now.\n'
	);
	write(
		'docs/prompt-ledger/entries/0001-done.md',
		'# 0001 Already deployed\n' +
			'- Issued: 2026-09-01 01:05 UTC\n' +
			'- By: a session\n' +
			'- Owns: `docs/nothing/**`\n' +
			'- Migration permitted: no. Highest on origin/main at issue: 0154\n' +
			'- Status: deployed\n' +
			'- Branch: `claude/gone`\n'
	);
	git('add', '-A');
	git('commit', '--quiet', '-m', 'fixture base');
	const mainSha = git('rev-parse', 'HEAD');
	git('update-ref', 'refs/remotes/origin/main', mainSha);
	git('update-ref', 'refs/remotes/origin/integration', mainSha);

	// AN ENTRY THAT EXISTS ONLY ON A BRANCH. This is the whole point of
	// reading every ref: a session pushes its entry as its first commit and
	// `main` will not carry it until the branch is swept and deployed.
	git('checkout', '--quiet', '-b', 'claude/in-flight');
	write(
		'docs/prompt-ledger/entries/0002-in-flight.md',
		'# 0002 Work in flight on a branch\n' +
			'- Issued: 2026-09-02 08:00 UTC\n' +
			'- By: a chat\n' +
			'- Owns: `src/lib/somewhere/**`\n' +
			'- Migration permitted: yes, exactly one, 0155. Highest on origin/main at issue: 0154\n' +
			'- Status: pushed\n' +
			'- Branch: `claude/in-flight`\n'
	);
	git('add', '-A');
	git('commit', '--quiet', '-m', 'entry on a branch');
	git('update-ref', 'refs/remotes/origin/claude/in-flight', git('rev-parse', 'HEAD'));
	git('checkout', '--quiet', 'main');

	git('checkout', '--quiet', '-b', 'codex/in-flight');
	write(
		'docs/prompt-ledger/entries/0003-codex-in-flight.md',
		'# 0003 Codex work in flight\n' +
			'- Issued: 2026-09-11\n' +
			'- By: a Codex task\n' +
			'- Owns: `tools/example`\n' +
			'- Migration permitted: none.\n' +
			'- Status: pushed\n' +
			'- Branch: `codex/in-flight`\n'
	);
	git('add', '-A');
	git('commit', '--quiet', '-m', 'entry on a codex branch');
	git('update-ref', 'refs/remotes/origin/codex/in-flight', git('rev-parse', 'HEAD'));
	git('checkout', '--quiet', 'main');
});

afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('tools/idea-status.py against a fixture repository', () => {
	it('reads the fixture at all', () => {
		const d = runTool('--since', '151');
		// The denominator. Every absence assertion below is worthless if the
		// tool read an empty repository, which is what a wrong --local path or
		// a missing origin ref would produce.
		expect(d.migrations.numbered).toBe(true);
		expect(d.migrations.rows.map((r: { num: string }) => r.num)).toEqual(['0151', '0152', '0153', '0154']);
		expect(d.decisions.length).toBe(2);
	});

	it('gives EVERY migration in range a verdict, and names the ones out of reach', () => {
		const d = runTool('--since', '151');
		const inRange = d.migrations.rows.map((r: { num: string }) => r.num);
		const probed = new Set(d.probes.map((p: { num: string }) => p.num));
		// THE 0003 DEFECT, ASSERTED AS A PROPERTY RATHER THAN AS A LIST: no
		// migration in the range may be missing from the probe output. A
		// generator that attributes a shared object to its first creator drops
		// the later ones here.
		expect([...probed].sort()).toEqual(inRange.sort());

		// A migration with nothing probeable is REPORTED as such, not invented
		// and not omitted.
		const dataOnly = d.probes.filter((p: { num: string }) => p.num === '0153');
		expect(dataOnly).toHaveLength(1);
		expect(dataOnly[0].kind).toBe('none');
		expect(dataOnly[0].sql).toBeNull();
	});

	it('gives the replacing migration a body marker, because existence proves nothing', () => {
		const d = runTool('--since', '151');
		const markers = d.probes.filter((p: { kind: string }) => p.kind === 'marker');
		expect(markers).toHaveLength(1);
		const m = markers[0];
		expect(m.num).toBe('0154');
		expect(m.object).toContain('fixture_alpha');

		// THE ORACLE IS THE FIXTURE, NOT THE TOOL: whatever line it picked must
		// genuinely be in 0154's body and genuinely absent from 0151's. A
		// marker that appears in both distinguishes nothing and would report a
		// reverted function as applied.
		expect(MIGRATIONS['0154_fixture_alpha_again.sql']).toContain(m.marker);
		expect(MIGRATIONS['0151_fixture_alpha.sql']).not.toContain(m.marker);
		// And the shared line is a longer, earlier candidate than the real
		// marker, so this assertion is reached rather than satisfied by there
		// being only one line to pick.
		expect(m.marker).not.toBe(SHARED_LINE);
		expect(SHARED_LINE.length).toBeGreaterThan(MARKER_LINE.length);

		// And the collision it came from is reported in its own right.
		expect(Object.keys(d.two_authors)).toContain('function public.fixture_alpha');
	});

	it('escapes a quote in a marker, which was a syntax error on paste', () => {
		const d = runTool('--since', '151');
		const sql: string = d.probe_sql;
		expect(sql).toContain("it''''s"); // '' inside a '...' literal that itself doubles
		// Every literal in the block is balanced: an odd number of unescaped
		// quotes on a line is what breaks the paste.
		for (const line of sql.split('\n')) {
			if (!line.includes("'")) continue;
			expect((line.match(/'/g) ?? []).length % 2, `unbalanced quotes: ${line}`).toBe(0);
		}
		// It reads the catalog and never a migrations table, which production
		// does not have.
		expect(sql).toMatch(/pg_proc|pg_class|pg_policies|information_schema|pg_extension/);
		expect(sql).not.toContain('schema_migrations');
	});

	it('lists an open decision and not a decided one', () => {
		const d = runTool('--since', '151');
		const open = d.decisions.filter((r: { status: string }) => r.status === 'open');
		expect(open).toHaveLength(1);
		expect(open[0].id).toBe('01');
		expect(open[0].default).toBe('the default sentence.');
		// Positive control beside the absence: the decided one was READ, it is
		// simply not open. An empty directory would satisfy "no decided entry
		// is open" perfectly.
		expect(d.decisions.map((r: { id: string }) => r.id).sort()).toEqual(['01', '02']);
	});

	it('finds an in-flight entry that exists only on a claude/** branch', () => {
		const d = runTool('--since', '151');
		const ids = d.prompts_in_flight.map((r: { id: string }) => r.id);
		// The entry on the branch is in flight...
		expect(ids).toContain('0002');
		// ...and the deployed one on main is not, though it WAS read.
		expect(ids).not.toContain('0001');
		expect(d.prompts_all.map((r: { id: string }) => r.id).sort()).toEqual(['0001', '0002', '0003']);

		const row = d.prompts_in_flight.find((r: { id: string }) => r.id === '0002');
		expect(row.ref).toBe('origin/claude/in-flight');
		expect(row.owns).toBe('`src/lib/somewhere/**`');
		expect(row.migration).toContain('yes, exactly one, 0155');
	});

	it('finds an in-flight entry that exists only on a codex/** branch', () => {
		const d = runTool('--since', '151');
		const row = d.prompts_in_flight.find((r: { id: string }) => r.id === '0003');
		expect(row.ref).toBe('origin/codex/in-flight');
		expect(row.branch).toContain('codex/in-flight');
		expect(d.branches.map((b: { name: string }) => b.name)).toContain('codex/in-flight');
	});

	it('exits 1 when an object in range has two authors, and 0 when it does not', () => {
		// The one thing in this tool that is a VERDICT rather than a report,
		// and the two directions are measured on the same fixture at two
		// ranges rather than asserted from the code.
		const withCollision = run('--since', '151');
		expect(Object.keys(withCollision.data.two_authors)).toHaveLength(1);
		expect(withCollision.status).toBe(1);

		const without = run('--since', '153');
		expect(without.data.two_authors).toEqual({});
		expect(without.status).toBe(0);
	});

	it('honours --since rather than reporting the whole directory', () => {
		const d = runTool('--since', '153');
		expect(d.migrations.rows.map((r: { num: string }) => r.num)).toEqual(['0153', '0154']);
		// With 0151 out of range there is no second author for the function, so
		// no marker is generated -- the collision is a property of the RANGE.
		expect(d.two_authors).toEqual({});
		expect(d.probes.filter((p: { kind: string }) => p.kind === 'marker')).toHaveLength(0);
	});
});

/**
 * AN OBJECT A LATER MIGRATION DROPS IS NO EVIDENCE ABOUT THE EARLIER ONE
 * (ledger 0391). The real case: 0251 retired `coin_public_sections`, which
 * 0239 had redefined. 0239's body marker then asked the catalog for a
 * function that is gone BY DESIGN, read FALSE against a history row that said
 * applied, and the deploy probe called that a CONFLICT and NOT APPLIED. That
 * is the one verdict `migrate.yml` acts on -- it applies the LOWEST
 * not-applied migration -- so every push targeted 0239, was refused as
 * already recorded, and nothing numbered above it could land (Migrate runs
 * 205, 206 and 207, 2026-10-15). Silent in every direction: the tool ran
 * green, the summary read sensibly, and the migrations simply never applied.
 *
 * The rule under test: a probe, object OR marker, whose object a LATER file in
 * range drops without creating it again is handed to the record (`kind:
 * dropped`, `sql: null`), the path a migration with nothing probeable already
 * takes. Both directions are driven on one fixture: the retired function and
 * the retired table go to the record; a drop-and-recreate in the same file is
 * a re-signing and keeps its catalog probe; and the untouched fixtures above
 * (0152's table, 0154's marker) answer exactly as they did.
 */
describe('a probe whose object a later migration dropped is handed to the record', () => {
	const probesFor = (num: string) => runTool('--since', '141').probes.filter((p: { num: string }) => p.num === num);

	it('reads the whole retirement range', () => {
		const d = runTool('--since', '141');
		expect(d.migrations.rows.map((r: { num: string }) => r.num)).toEqual([
			'0141', '0142', '0143', '0144', '0145', '0146', '0147', '0151', '0152', '0153', '0154'
		]);
		// Every migration in range still gets a verdict, retirements included.
		const probed = new Set(d.probes.map((p: { num: string }) => p.num));
		expect([...probed].sort()).toEqual(d.migrations.rows.map((r: { num: string }) => r.num).sort());
	});

	it('a function body marker whose function a later file drops dynamically goes to the record', () => {
		// 0142 carries TWO probes, as any redefining migration does: its own
		// object probe (the shared function) and the body marker. Both go to
		// the record, because both would ask the catalog for the gone function.
		const all = probesFor('0142');
		expect(all).toHaveLength(2);
		for (const q of all) {
			expect(q.kind).toBe('dropped');
			expect(q.sql).toBeNull();
			expect(q.dropped_by).toEqual(['0143']);
			expect(q.object).toContain('fixture_beta');
			expect(q.object).toContain('dropped by 0143');
			expect(q.object).toContain('answered by the record');
			expect(q.refused).toContain('0143');
		}
		expect(all.filter((q: { object: string }) => q.object.includes("carries 0142's body"))).toHaveLength(1);
		// The collision itself is still reported: the drop changes the probe,
		// not the fact that two files defined the function.
		expect(Object.keys(runTool('--since', '141').two_authors)).toContain('function public.fixture_beta');
	});

	it("the first definer's object probe goes to the record too, because the object is gone", () => {
		const [p] = probesFor('0141');
		expect(p.kind).toBe('dropped');
		expect(p.sql).toBeNull();
		expect(p.dropped_by).toEqual(['0143']);
		expect(p.object).toContain('fixture_beta');
	});

	it('a table a later file drops statically goes to the record, and the dropping file has no probe of its own', () => {
		const [gamma] = probesFor('0144');
		expect(gamma.kind).toBe('dropped');
		expect(gamma.sql).toBeNull();
		expect(gamma.dropped_by).toEqual(['0145']);
		expect(gamma.object).toContain('table public.fixture_gamma');
		const [dropper] = probesFor('0145');
		expect(dropper.kind).toBe('none');
		expect(dropper.sql).toBeNull();
		const [retirer] = probesFor('0143');
		expect(retirer.kind).toBe('none');
	});

	it('a drop followed by a create of the same function in ONE file is a re-signing and keeps its catalog probes', () => {
		// 0147 drops `fixture_delta()` and creates `fixture_delta(int)`: the
		// function is still there, under a new signature, so 0147 earns an
		// ordinary body marker and 0146 an ordinary (shared-object) probe.
		const markers = probesFor('0147').filter((p: { kind: string }) => p.kind === 'marker');
		expect(markers).toHaveLength(1);
		expect(markers[0].sql).toBeTruthy();
		expect(MIGRATIONS['0147_fixture_delta_resigned.sql']).toContain(markers[0].marker);
		expect(MIGRATIONS['0146_fixture_delta.sql']).not.toContain(markers[0].marker);
		const [delta] = probesFor('0146');
		expect(delta.kind).toBe('object');
		expect(delta.sql).toBeTruthy();
		expect(delta.object).toContain('fixture_delta');
		expect(probesFor('0146').some((p: { kind: string }) => p.kind === 'dropped')).toBe(false);
		expect(probesFor('0147').some((p: { kind: string }) => p.kind === 'dropped')).toBe(false);
	});

	it('leaves every probe the retirements do not touch exactly as it was', () => {
		// Negative controls: the fixtures the earlier block measured answer the
		// same with the retirement files in range.
		const [thing] = probesFor('0152');
		expect(thing.kind).toBe('object');
		expect(thing.object).toBe('table public.fixture_thing');
		const alphaMarkers = probesFor('0154').filter((p: { kind: string }) => p.kind === 'marker');
		expect(alphaMarkers).toHaveLength(1);
		expect(alphaMarkers[0].marker).toBe(MARKER_LINE);
		// Exactly the four above (0141's object, 0142's object and marker,
		// 0144's table) and nothing else.
		const dropped = runTool('--since', '141').probes.filter((p: { kind: string }) => p.kind === 'dropped');
		expect(dropped.map((p: { num: string }) => p.num).sort()).toEqual(['0141', '0142', '0142', '0144']);
	});

	it('a dropped probe contributes no SQL to the pasted block, so nothing can read FALSE for it', () => {
		const d = runTool('--since', '141');
		const sql: string = d.probe_sql;
		expect(sql).not.toContain('fixture_beta');
		expect(sql).not.toContain('fixture_gamma');
		// Positive control beside the absences: the block is not empty, the
		// re-signed function and the untouched table are still in it.
		expect(sql).toContain('fixture_delta');
		expect(sql).toContain('fixture_thing');
	});

	it('does not read a drop that is only named in a comment', () => {
		// `0152_fixture_thing.sql` is the untouched table above; a comment in
		// another file naming `drop table public.fixture_thing` must not retire
		// it. Driven on a second fixture repo rather than by mutating this one.
		const dir2 = mkdtempSync(join(tmpdir(), 'idea-status-fixture-comment-'));
		const repo2 = join(dir2, 'fixture');
		try {
			mkdirSync(repo2);
			const g = (...a: string[]) => execFileSync('git', ['-C', repo2, ...a], { encoding: 'utf8' }).trim();
			g('init', '--quiet', '--initial-branch=main');
			g('config', 'user.email', 'fixture@example.invalid');
			g('config', 'user.name', 'Fixture');
			mkdirSync(join(repo2, 'supabase', 'migrations'), { recursive: true });
			writeFileSync(join(repo2, 'supabase/migrations/0152_fixture_thing.sql'), MIGRATIONS['0152_fixture_thing.sql']);
			writeFileSync(
				join(repo2, 'supabase/migrations/0153_fixture_prose.sql'),
				'-- a later bundle may drop table public.fixture_thing; this one does not.\n' +
					'update public.fixture_thing set id = id where false;\n'
			);
			g('add', '-A');
			g('commit', '--quiet', '-m', 'fixture');
			g('update-ref', 'refs/remotes/origin/main', g('rev-parse', 'HEAD'));
			const r = spawnSync('python3', [TOOL, '--local', repo2, '--json', '--since', '151'], {
				encoding: 'utf8',
				maxBuffer: 32 * 1024 * 1024
			});
			if (r.error) throw r.error;
			const d = JSON.parse(r.stdout);
			const [thing] = d.probes.filter((p: { num: string }) => p.num === '0152');
			expect(thing.kind).toBe('object');
			expect(thing.sql).toBeTruthy();
		} finally {
			rmSync(dir2, { recursive: true, force: true });
		}
	});
});
