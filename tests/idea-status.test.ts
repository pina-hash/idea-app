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
		expect(d.prompts_all.map((r: { id: string }) => r.id).sort()).toEqual(['0001', '0002']);

		const row = d.prompts_in_flight.find((r: { id: string }) => r.id === '0002');
		expect(row.ref).toBe('origin/claude/in-flight');
		expect(row.owns).toBe('`src/lib/somewhere/**`');
		expect(row.migration).toContain('yes, exactly one, 0155');
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
