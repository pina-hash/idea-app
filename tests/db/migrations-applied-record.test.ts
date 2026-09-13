/**
 * The hand-applied migration record, and the decision parser that could not
 * see a decided-but-unbuilt decision.
 *
 * WHY BOTH LIVE IN ONE FILE, AND WHY IT IS UNDER `tests/db/`. Ledger 0197 owns
 * `tests/db/migrations-applied*` and nothing else under `tests/`, so this is
 * the file both halves are allowed to be written in. It boots no database --
 * `tests/db/` is a naming boundary here, not a claim about a fixture -- and the
 * two halves are one bundle's: the record exists because production is
 * unreachable, and the parser fix exists because the decision to do something
 * about that was invisible to every tool that lists what is owed.
 *
 * WHAT IS NOT ASSERTED HERE, deliberately: that any migration is actually
 * applied to production. Nothing in this repository can answer that, which is
 * the whole premise. What IS asserted is that a record cannot claim more than
 * it knows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
	renderReportedRecord,
	scrub,
	slugFor,
	sha256,
	migrationFor,
	authorisingEntry,
	parseArgs
} from '../../tools/record-applied.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const APPLIED_DIR = join(REPO_ROOT, 'docs', 'migrations-applied');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const TOOL = join(REPO_ROOT, 'tools', 'idea-status.py');

/* ---------------------------------------------------------------------- */
/* 1. The tool cannot reach a database, and that is structural.            */
/* ---------------------------------------------------------------------- */

describe('tools/record-applied.mjs opens no socket', () => {
	const source = readFileSync(join(REPO_ROOT, 'tools', 'record-applied.mjs'), 'utf8');

	it('imports no database or socket module', () => {
		// THE LOAD-BEARING PROPERTY. A cloud session's egress proxy accepts a
		// CONNECT to 5432 and then carries no bytes, so a tool that tried would
		// hang rather than fail. It is prevented by there being no client at
		// all, which is checkable from the source and cannot regress quietly.
		const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
		expect(imports.length).toBeGreaterThan(4); // positive control: we read the imports
		for (const spec of imports) {
			expect(spec).not.toMatch(/(^|\/)pg($|\/)|postgres|node:net|node:tls|node:dgram/);
		}
	});

	it('never reads the connection-string variable that apply-migration reads', () => {
		// `IDEA_MIGRATION_URL` is apply-migration's own and must not be read
		// here. It IS named in this file's header, explaining why -- so the
		// assertion is over CODE with the comments cut out, not over prose. A
		// check that swept the whole file would fail on its own explanation.
		const code = source
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.split('\n')
			.filter((l) => !/^\s*(\/\/|\*)/.test(l))
			.join('\n');
		expect(code).toContain('URL_VAR'); // positive control: code survived the cut
		expect(code).not.toContain('IDEA_MIGRATION_URL');
		// And the only environment it reads is the redaction hint.
		const envReads = [...code.matchAll(/process\.env\[?\.?([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
		expect(envReads).toEqual(['URL_VAR']);
	});
});

/* ---------------------------------------------------------------------- */
/* 2. A record cannot claim more than it knows.                            */
/* ---------------------------------------------------------------------- */

const BASE = {
	num: '0299',
	file: '0299_fixture.sql',
	sha256: 'a'.repeat(64),
	ledgerId: '0088',
	ledgerFile: '0088-fixture.md',
	ledgerRaw: 'exactly one. Claims: 0299.',
	slug: 'fixture-branch',
	sourceBranch: 'claude/fixture-branch',
	by: 'Mr. Pina',
	appliedOn: '2026-09-13',
	recordedAt: '2026-09-13T00:00:00.000Z',
	recordedByLedger: '0197',
	commit: 'f'.repeat(40),
	objects: ['object table public.fixture_thing'],
	evidence: null as string | null,
	note: null as string | null
};

describe('renderReportedRecord', () => {
	it('marks a record with evidence as applied, and one without as reported', () => {
		const withEvidence = renderReportedRecord({ ...BASE, evidence: 'grid_ok true\n716 notes' });
		const without = renderReportedRecord({ ...BASE });

		expect(withEvidence).toContain('evidence: verification-output');
		expect(withEvidence).toContain('outcome: applied');
		expect(withEvidence).toContain('716 notes');

		expect(without).toContain('evidence: report-only');
		expect(without).toContain('outcome: reported');
		expect(without).toContain('No verification output was supplied');
	});

	it('always stamps source: report and never claims a server answer', () => {
		// The two directions. `session_user` and `database` are what a MEASURED
		// record carries; their absence is how a reader tells the two apart, so
		// a record that grew either would be silently overclaiming.
		for (const evidence of [null, 'some output']) {
			const out = renderReportedRecord({ ...BASE, evidence });
			expect(out).toContain('source: report');
			expect(out).not.toMatch(/^session_user:/m);
			expect(out).not.toMatch(/^database:/m);
			expect(out).toContain('not on a measurement made by this repository');
		}
	});

	it('names the AUTHORISING ledger and the recording one separately', () => {
		const out = renderReportedRecord({ ...BASE, evidence: 'x' });
		// `apply-migration.mjs`'s `appliesUnderLedger` greps `^ledger:` to ask
		// "has this bundle already applied one", so that field has to name the
		// bundle that wrote the migration, not the bundle writing the record.
		expect(out).toMatch(/^ledger: "0088"$/m);
		expect(out).toMatch(/^recorded_by_ledger: "0197"$/m);
	});

	it('says which commit the sha256 covers, because it is not the applied bytes', () => {
		const out = renderReportedRecord({ ...BASE });
		expect(out).toContain(`sha256_covers: repo bytes at commit ${BASE.commit}`);
	});

	it('does not let pasted evidence break out of its fence', () => {
		const out = renderReportedRecord({ ...BASE, evidence: 'before\n```\nafter' });
		// Three backticks inside the evidence would end the block early and let
		// the rest render as document. Count the fences: exactly two.
		expect(out.split('\n').filter((l) => l.trim() === '```').length).toBe(2);
		expect(out).toContain("'''"); // positive control: the payload was neutralised, not dropped
	});
});

describe('scrub', () => {
	it('masks a connection string it was never told about', () => {
		const masked = scrub('psql postgresql://u:hunter2@db.abc.supabase.co:5432/postgres ok', '');
		expect(masked).not.toContain('hunter2');
		expect(masked).not.toContain('supabase.co');
		expect(masked).toContain('<connection string>');
		expect(masked).toContain('ok'); // positive control: ordinary text survives
	});

	it('leaves output that merely mentions postgres alone', () => {
		expect(scrub('716 notes, 0 with a grid', '')).toBe('716 notes, 0 with a grid');
	});
});

describe('slugFor', () => {
	it('strips the agent prefix and a trailing .md', () => {
		expect(slugFor('claude/determined-albattani-16az27')).toBe('determined-albattani-16az27');
		expect(slugFor('codex/execute-instructions-from-ideacad.md')).toBe('execute-instructions-from-ideacad');
		expect(slugFor('origin/claude/x-1')).toBe('x-1');
		expect(slugFor('')).toBe('');
	});
});

describe('authorisingEntry', () => {
	const inv = (entries: { file: string; text: string }[]) => ({
		refs: [{ ref: 'origin/main', branch: 'origin/main', landed: true, migrations: [], entries }],
		refsVisible: false
	});
	const entry = (id: string, permitted: string, branch = 'claude/b') =>
		`# ${id} A bundle\n- Migration permitted: ${permitted}\n- Branch: \`${branch}\`\n`;

	it('finds the one entry that claims a number', () => {
		const got = authorisingEntry('0299', inv([{ file: '0088-a.md', text: entry('0088', 'exactly one. Claims: 0299.') }]) as never);
		expect(got?.id).toBe('0088');
		expect(got?.branch).toBe('claude/b');
	});

	it('returns null rather than guessing when two entries claim it', () => {
		const got = authorisingEntry(
			'0299',
			inv([
				{ file: '0088-a.md', text: entry('0088', 'exactly one. Claims: 0299.') },
				{ file: '0089-b.md', text: entry('0089', 'exactly one. Claims: 0299.') }
			]) as never
		);
		expect(got).toBeNull();
	});

	it('ignores an entry that took the number and released it unused', () => {
		// The real 0204 case: ledger 0174 claimed it, wrote nothing, released
		// it, and 0177 wrote the file. Recording 0174 would name the wrong bundle.
		const got = authorisingEntry(
			'0299',
			inv([
				{ file: '0174-r.md', text: entry('0174', 'exactly one, 0299. NONE WRITTEN: released unused.') },
				{ file: '0177-w.md', text: entry('0177', 'exactly one. Claims: 0299.', 'claude/w') }
			]) as never
		);
		expect(got?.id).toBe('0177');
	});

	it('returns null when nothing claims it', () => {
		expect(authorisingEntry('0299', inv([]) as never)).toBeNull();
	});
});

describe('parseArgs', () => {
	it('reads the number positionally and the flags by name', () => {
		const { num, opts } = parseArgs(['0209', '--by', 'Mr. Pina', '--on', '2026-09-13', '--query']);
		expect(num).toBe('0209');
		expect(opts.by).toBe('Mr. Pina');
		expect(opts.on).toBe('2026-09-13');
		expect(opts.query).toBe(true);
	});
});

/* ---------------------------------------------------------------------- */
/* 3. The committed directory itself.                                      */
/* ---------------------------------------------------------------------- */

describe('docs/migrations-applied/ as committed', () => {
	const files = readdirSync(APPLIED_DIR).filter((f) => /^\d{4}-.*\.md$/.test(f));
	const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

	it('has a record for every migration from 0193 onward, and no gaps', () => {
		const recorded = new Set(files.map((f) => f.slice(0, 4)));
		const wanted = migrations
			.map((f) => f.slice(0, 4))
			.filter((n) => Number(n) >= 193)
			.sort();
		expect(wanted.length).toBeGreaterThan(10); // positive control: migrations were read
		expect([...recorded].sort()).toEqual(wanted);
	});

	it('every record names a migration file that exists, and hashes it correctly', () => {
		expect(files.length).toBeGreaterThan(10);
		for (const f of files) {
			const text = readFileSync(join(APPLIED_DIR, f), 'utf8');
			const named = /^file:\s*(\S+)$/m.exec(text)?.[1];
			const hash = /^sha256:\s*([0-9a-f]{64})$/m.exec(text)?.[1];
			expect(named, f).toBeTruthy();
			expect(migrations, f).toContain(named);
			const mig = migrationFor(f.slice(0, 4), MIGRATIONS_DIR);
			expect(mig.ok, f).toBe(true);
			if (mig.ok) expect(hash, f).toBe(sha256(mig.sql));
		}
	});

	it('no reported record claims a server answer, and every one names its authoriser', () => {
		for (const f of files) {
			const text = readFileSync(join(APPLIED_DIR, f), 'utf8');
			const source = /^source:\s*(\S+)$/m.exec(text)?.[1];
			expect(source, f).toBeTruthy();
			if (source !== 'report') continue;
			expect(text, f).not.toMatch(/^session_user:/m);
			expect(text, f).not.toMatch(/^database:/m);
			expect(text, f).toMatch(/^ledger: "\d{4}"$/m);
			expect(text, f).toContain('not on a measurement made by this repository');
		}
	});

	it('no record carries anything shaped like a connection string', () => {
		for (const f of files) {
			const text = readFileSync(join(APPLIED_DIR, f), 'utf8');
			expect(text, f).not.toMatch(/postgres(?:ql)?:\/\//);
		}
	});
});

/* ---------------------------------------------------------------------- */
/* 4. idea-status.py reads BOTH shapes.                                    */
/* ---------------------------------------------------------------------- */

let dir = '';
let repo = '';

function git(...args: string[]) {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}
function write(rel: string, body: string) {
	const full = join(repo, rel);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, body);
}
function statusReport(): string {
	const r = spawnSync('python3', [TOOL, '--local', repo], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
	if (r.error) throw r.error;
	if (r.status !== 0 && r.status !== 1) throw new Error(`idea-status.py exited ${r.status}\n${r.stderr}`);
	return r.stdout;
}
function statusJson(): { decisions: { id: string; status: string; build: string }[] } {
	const r = spawnSync('python3', [TOOL, '--local', repo, '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
	if (r.error) throw r.error;
	if (r.status !== 0 && r.status !== 1) throw new Error(`idea-status.py exited ${r.status}\n${r.stderr}`);
	return JSON.parse(r.stdout);
}

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'applied-record-fixture-'));
	repo = join(dir, 'fixture');
	mkdirSync(repo);
	git('init', '--quiet', '--initial-branch=main');
	git('config', 'user.email', 'fixture@example.invalid');
	git('config', 'user.name', 'Fixture');

	// THE THREE SHAPES, one per file, each carrying exactly one of them.
	write(
		'docs/decisions/entries/40-owed.md',
		'# 40 Still his to answer\n' +
			'- Raised: 2026-09-02  By: a chat\n' +
			'- Status: open\n' +
			'- Default this assistant would pick: the default sentence.\n'
	);
	write(
		'docs/decisions/entries/41-decided-unbuilt.md',
		'# 41 Answered, and a lane still owes the build\n' +
			'- Raised: 2026-09-02  By: a chat\n' +
			'- Status: decided 2026-09-12. YES. The DECISION is closed; the BUILD is open.\n' +
			'- Build: OPEN, and it is one file.\n' +
			'- Default this assistant would pick: irrelevant now.\n'
	);
	write(
		'docs/decisions/entries/42-decided-and-built.md',
		'# 42 Answered and finished\n' +
			'- Raised: 2026-09-01  By: a chat\n' +
			'- Status: decided 2026-09-10. YES.\n' +
			'- Build: SHIPPED 2026-09-11.\n'
	);
	write('supabase/migrations/0301_fixture.sql', 'create table if not exists public.fixture_thing (id uuid primary key);\n');
	git('add', '-A');
	git('commit', '--quiet', '-m', 'fixture base');
	const sha = git('rev-parse', 'HEAD');
	git('update-ref', 'refs/remotes/origin/main', sha);
	git('update-ref', 'refs/remotes/origin/integration', sha);
});

afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('tools/idea-status.py reads Status: open AND Build: OPEN', () => {
	it('reads all three fixture decisions at all', () => {
		// THE DENOMINATOR. Every absence below is worthless if the tool read an
		// empty directory, which a wrong --local path produces silently.
		const ids = statusJson().decisions.map((d) => d.id).sort();
		expect(ids).toEqual(['40', '41', '42']);
	});

	it('parses the two fields independently', () => {
		const byId = Object.fromEntries(statusJson().decisions.map((d) => [d.id, d]));
		expect(byId['40'].status).toBe('open');
		expect(byId['40'].build).toBe('');
		expect(byId['41'].status).toBe('decided');
		expect(byId['41'].build).toBe('open');
		expect(byId['42'].status).toBe('decided');
		expect(byId['42'].build).toBe('shipped');
	});

	it('THE FIX BITES: 41 is owed-to-a-lane while its Status is not open', () => {
		// This is the exact defect. A filter on `Status == open` -- which is
		// what the tool did until this bundle -- cannot see 41, because 41's
		// status is `decided`. Asserting both halves at once is what makes this
		// a proof rather than a restatement of the new behaviour.
		const byId = Object.fromEntries(statusJson().decisions.map((d) => [d.id, d]));
		expect(byId['41'].status).not.toBe('open'); // the old filter's answer
		expect(byId['41'].build).toBe('open'); // the new filter's answer
	});

	it('prints two lists with two labels, and puts each decision in exactly one', () => {
		const out = statusReport();
		const owed = out.slice(out.indexOf('[0] DECISIONS OWED'), out.indexOf('[0]  DECIDED, BUILD OPEN'));
		const unbuilt = out.slice(out.indexOf('[0]  DECIDED, BUILD OPEN'), out.indexOf('[0a]'));

		expect(owed).toContain('Still his to answer');
		expect(owed).not.toContain('a lane still owes the build');
		expect(owed).not.toContain('Answered and finished');

		expect(unbuilt).toContain('a lane still owes the build');
		expect(unbuilt).not.toContain('Still his to answer');
		expect(unbuilt).not.toContain('Answered and finished');

		expect(owed).toContain(': 1');
		expect(unbuilt).toContain(': 1');
	});
});
