// tests/apply-migration-trace.test.ts
//
// Prompt 0066's two controls on `tools/apply-migration.mjs`: the ledger gate
// that asks whether this bundle was permitted a migration at all, and the
// committed trace it leaves behind when one actually applies.
//
// WHY THESE ARE TESTED AT ALL, given that automated tests here are the
// exception. Both regress SILENTLY and both regress in the direction nobody
// looks. A gate that stops refusing looks exactly like a bundle that was
// permitted. A trace that stops being written looks exactly like a bundle that
// applied nothing -- and it is the ONLY artefact that would say otherwise,
// because the tool's whole prior design was to leave nothing behind.
//
// EVERY TEST HERE DRIVES A LOCAL POSTGRES FROM THE HARNESS. None reads
// `IDEA_MIGRATION_URL`, and the last describe in this file is a control that
// says so and would redden if one started to. See its comment for the honest
// limit: this proves the SUITE does not reach production, and it cannot prove a
// session will not point the TOOL there, because that is the tool's job.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './db/harness';
import {
	ledgerPermission,
	permissionLine,
	resolveLedger,
	appliesUnderLedger,
	appliedRecordPath,
	renderAppliedRecord,
	writeAppliedRecord,
	branchSlug,
	sha256,
	applyInTransaction,
	claims,
	LEDGER_DIR,
	APPLIED_DIR
} from '../tools/apply-migration.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** A scratch directory per test, so nothing here writes into the repository. */
function scratch(): string {
	return mkdtempSync(join(tmpdir(), 'apply-trace-'));
}

/* ------------------------------------------------------------------------ */
/* The permission line, against the REAL corpus.                             */
/* ------------------------------------------------------------------------ */

describe('the permission line means one of two things, across every entry in the tree', () => {
	const files = readdirSync(LEDGER_DIR)
		.filter((f) => /^\d{4}-.*\.md$/.test(f) || /^retro-/.test(f))
		.sort();

	it('finds the line in every single entry, which is what makes a missing one a refusal', () => {
		// The gate refuses an entry with no line. That is only a safe default
		// because no entry in the corpus lacks one -- if entries routinely
		// omitted it, "fail closed" would mean "refuse everybody".
		expect(files.length).toBeGreaterThan(60);
		const without = files.filter((f) => permissionLine(readFileSync(join(LEDGER_DIR, f), 'utf8')) === null);
		expect(without).toEqual([]);
	});

	it('partitions the corpus, and both halves are non-empty', () => {
		let permit = 0;
		let refuse = 0;
		for (const f of files) {
			const r = ledgerPermission(readFileSync(join(LEDGER_DIR, f), 'utf8'));
			if (r.permitted) permit += 1;
			else refuse += 1;
		}
		// A sweep whose every case falls on one side proves nothing about the
		// other, so both counts are asserted rather than just the total.
		expect(permit).toBeGreaterThan(10);
		expect(refuse).toBeGreaterThan(10);
		expect(permit + refuse).toBe(files.length);
	});

	it('reads every spelling the corpus actually uses', () => {
		const cases: [string, boolean, string | null][] = [
			['no. Highest on origin/main at issue: 0184', false, null],
			['no. The role file carries a password and is not a migration.', false, null],
			['no. 0171 to 0174 are on main and applied.', false, null],
			['at most one, number taken at commit time. Highest on origin/main at issue: 0180', true, null],
			['exactly one, 0176. Highest on origin/main at issue: 0175', true, '0176'],
			['yes, exactly one, 0170. Highest on origin/main at issue: 0169', true, '0170'],
			['at most one, conditional. Highest on origin/main at issue: 0180', true, null],
			['only if A3 proved it. Highest on origin/main at issue: 0180. NONE WRITTEN: x', true, null],
			[
				'at most one, 0174, only for the hall pass. 0171 taken, 0172 reserved for 0013, 0173 for 0015. Highest on origin/main at issue: 0171',
				true,
				'0174'
			]
		];
		for (const [raw, permitted, number] of cases) {
			const r = ledgerPermission(`- Migration permitted: ${raw}`);
			expect(r.permitted, raw).toBe(permitted);
			expect(r.number, raw).toBe(number);
		}
		expect(cases).toHaveLength(9);
	});

	it('NEVER reads the number out of "Highest on origin/main at issue"', () => {
		// The trap: every entry carries that clause, refusing ones included, so a
		// four-digit scan over the whole line would report 0184 as the permitted
		// number for a bundle permitted nothing.
		const refusing = ledgerPermission('- Migration permitted: no. Highest on origin/main at issue: 0184');
		expect(refusing.permitted).toBe(false);
		expect(refusing.number).toBeNull();
		const permitting = ledgerPermission(
			'- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0180'
		);
		expect(permitting.permitted).toBe(true);
		expect(permitting.number).toBeNull();
		// The positive control: when a number IS in the permitting clause it is read.
		expect(
			ledgerPermission('- Migration permitted: exactly one, 0176. Highest on origin/main at issue: 0175').number
		).toBe('0176');
	});

	it('takes the FIELD line and not a mention of it in the prose', () => {
		const entry = [
			'# 0099 A thing',
			'- Migration permitted: no. Highest on origin/main at issue: 0184',
			'- Status: issued',
			'- Notes: an earlier bundle said `- Migration permitted: at most one, 0999` and that is prose.'
		].join('\n');
		const r = ledgerPermission(entry);
		expect(r.permitted).toBe(false);
		expect(r.raw).toBe('no. Highest on origin/main at issue: 0184');
	});
});

/* ------------------------------------------------------------------------ */
/* B2 CONTROL 1, 2 and 3: the gate.                                          */
/* ------------------------------------------------------------------------ */

describe('B2 control 1: an entry saying "Migration permitted: no" refuses', () => {
	it('refuses, names the entry, and says who can change it', () => {
		const dir = scratch();
		try {
			writeFileSync(
				join(dir, '0099-a-bundle-with-no-migration.md'),
				'# 0099 A bundle\n- Migration permitted: no. Highest on origin/main at issue: 0184\n- Status: issued\n'
			);
			const v = resolveLedger('0099', dir);
			expect(v.ok).toBe(false);
			if (v.ok) throw new Error('unreachable');
			expect(v.why).toContain('0099-a-bundle-with-no-migration.md');
			expect(v.why).toContain('Migration permitted: no.');
			// The refusal has to say what a person does next, or it is a wall.
			expect(v.how).toMatch(/router chat/i);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('POSITIVE CONTROL: the same fixture with a permitting line passes', () => {
		// Without this, the refusal above would pass just as well against a
		// resolveLedger that refused everything.
		const dir = scratch();
		try {
			writeFileSync(
				join(dir, '0099-a-bundle-with-a-migration.md'),
				'# 0099 A bundle\n- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0184\n'
			);
			const v = resolveLedger('0099', dir);
			expect(v.ok).toBe(true);
			if (!v.ok) throw new Error('unreachable');
			expect(v.id).toBe('0099');
			expect(v.number).toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('B2 control 2: an entry permitting one allows exactly one', () => {
	it('allows the first and refuses the second, keyed on the committed trace', () => {
		const ledgerDir = scratch();
		const appliedDir = scratch();
		try {
			writeFileSync(
				join(ledgerDir, '0099-one-migration.md'),
				'# 0099 A bundle\n- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0184\n'
			);
			// FIRST: nothing recorded yet, so the gate is open.
			expect(resolveLedger('0099', ledgerDir).ok).toBe(true);
			expect(appliesUnderLedger('0099', appliedDir)).toEqual([]);

			// The first apply writes its record. That IS the state the second
			// run reads; there is no counter anywhere else.
			writeAppliedRecord(
				{
					migrationNum: '0185',
					migrationFile: '0185_first.sql',
					sha256: sha256('select 1;'),
					branch: 'a-bundle',
					slug: 'a-bundle',
					commit: 'deadbeef',
					ledgerId: '0099',
					ledgerFile: '0099-one-migration.md',
					ledgerRaw: 'at most one, number taken at commit time.',
					numberWarning: null,
					sessionUser: 'postgres',
					database: 'postgres',
					at: '2026-09-06T00:00:00.000Z',
					notices: [],
					objects: [],
					exit: 'applied'
				},
				'',
				appliedDir
			);

			// SECOND: the entry still permits, and the trace says one already went.
			expect(resolveLedger('0099', ledgerDir).ok).toBe(true);
			const already = appliesUnderLedger('0099', appliedDir);
			expect(already).toEqual(['0185-a-bundle.md']);

			// A DIFFERENT ledger entry is unaffected -- the count is per entry,
			// not per directory, which is the whole reason the record carries the
			// ledger id in its front matter.
			expect(appliesUnderLedger('0100', appliedDir)).toEqual([]);
		} finally {
			rmSync(ledgerDir, { recursive: true, force: true });
			rmSync(appliedDir, { recursive: true, force: true });
		}
	});
});

describe('B2 control 3: no entry found at all refuses, and says what to do', () => {
	it('refuses a number with no entry behind it, naming the flag that recovers it', () => {
		const dir = scratch();
		try {
			const v = resolveLedger('0999', dir);
			expect(v.ok).toBe(false);
			if (v.ok) throw new Error('unreachable');
			expect(v.why).toContain('no ledger entry 0999');
			expect(v.how).toContain('docs/prompt-ledger/entries/');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('refuses an entry with no permission line at all', () => {
		const dir = scratch();
		try {
			writeFileSync(join(dir, '0099-no-line.md'), '# 0099 A bundle\n- Status: issued\n');
			const v = resolveLedger('0099', dir);
			expect(v.ok).toBe(false);
			if (v.ok) throw new Error('unreachable');
			expect(v.why).toContain('has no "Migration permitted:" line');
			expect(v.how).toContain('--ledger');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('refuses an ambiguous number rather than picking one', () => {
		const dir = scratch();
		try {
			writeFileSync(join(dir, '0099-one.md'), '- Migration permitted: at most one\n');
			writeFileSync(join(dir, '0099-two.md'), '- Migration permitted: at most one\n');
			const v = resolveLedger('0099', dir);
			expect(v.ok).toBe(false);
			if (v.ok) throw new Error('unreachable');
			expect(v.why).toContain('2 ledger entries claim 0099');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('every refusal carries a recovery, which is what stops fail-closed being unusable', () => {
		const dir = scratch();
		try {
			writeFileSync(join(dir, '0099-no.md'), '- Migration permitted: no.\n');
			writeFileSync(join(dir, '0098-none.md'), '# 0098\n');
			for (const id of ['0099', '0098', '0097']) {
				const v = resolveLedger(id, dir);
				expect(v.ok, id).toBe(false);
				if (v.ok) throw new Error('unreachable');
				expect(v.how.length, id).toBeGreaterThan(20);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

/* ------------------------------------------------------------------------ */
/* B1: the trace.                                                            */
/* ------------------------------------------------------------------------ */

describe('the record is named so two simultaneous applies cannot collide', () => {
	it('keys on the migration number AND the branch slug', () => {
		expect(appliedRecordPath('0185', 'apply-trace-r4kd2p', '/x')).toBe('/x/0185-apply-trace-r4kd2p.md');
		// The race the number alone would lose: two sessions that both saw 0185
		// unapplied and both applied it. Two sessions are two branches.
		expect(appliedRecordPath('0185', 'one-abc', '/x')).not.toBe(appliedRecordPath('0185', 'two-def', '/x'));
	});

	it('takes the branch slug the way docs/history/ does, prefix stripped', () => {
		const slug = branchSlug();
		expect(slug).not.toMatch(/^claude\//);
		expect(slug).not.toMatch(/^lane\//);
		expect(slug).not.toContain('/');
		expect(slug.length).toBeGreaterThan(0);
	});
});

describe('the record carries what a person needs and nothing from the connection string', () => {
	const base = {
		migrationNum: '0185',
		migrationFile: '0185_thing.sql',
		sha256: sha256('create table x();'),
		branch: 'apply-trace-r4kd2p',
		slug: 'apply-trace-r4kd2p',
		commit: 'abc123def456',
		ledgerId: '0066',
		ledgerFile: '0066-apply-trace.md',
		ledgerRaw: 'at most one, number taken at commit time. Highest on origin/main at issue: 0184',
		numberWarning: null,
		sessionUser: 'postgres',
		database: 'postgres',
		at: '2026-09-06T01:02:03.000Z',
		notices: [
			{ severity: 'NOTICE', message: 'thing: created 3 rows' },
			{ severity: 'WARNING', message: 'thing: one row was already there' }
		],
		objects: [
			{ kind: 'table', name: 'public.thing', present: true },
			{ kind: 'function', name: 'public.thing_fn', present: false }
		],
		exit: 'applied'
	};

	it('records every field the prompt asked for', () => {
		const text = renderAppliedRecord(base, '');
		expect(text).toContain('migration: "0185"');
		expect(text).toContain('file: 0185_thing.sql');
		expect(text).toContain(`sha256: ${base.sha256}`);
		expect(text).toContain('applied_at: 2026-09-06T01:02:03.000Z');
		expect(text).toContain('ledger: "0066"');
		expect(text).toContain('branch: apply-trace-r4kd2p');
		expect(text).toContain('commit: abc123def456');
		expect(text).toContain('0066-apply-trace.md');
		// Notices IN ORDER, with severity.
		expect(text.indexOf('created 3 rows')).toBeLessThan(text.indexOf('already there'));
		expect(text).toContain('`NOTICE` thing: created 3 rows');
		expect(text).toContain('`WARNING` thing: one row was already there');
		// Per-object verification, including the one that is missing.
		expect(text).toContain('table `public.thing` | yes');
		expect(text).toContain('function `public.thing_fn` | **NO**');
	});

	it('REDACTS the connection string out of anything that carries it', () => {
		const url = 'postgresql://postgres:hunter2@db.example-ref.supabase.co:5432/postgres';
		const leaky = {
			...base,
			notices: [{ severity: 'NOTICE', message: `could not reach ${url} on the first try` }]
		};
		const text = renderAppliedRecord(leaky, url);
		expect(text).not.toContain(url);
		expect(text).not.toContain('hunter2');
		expect(text).toContain('<connection string>');
		// The positive control on the instrument: WITHOUT redaction the same
		// fixture does leak, so the assertion above is the redaction working
		// rather than the fixture never having had a URL in it.
		expect(renderAppliedRecord(leaky, '')).toContain(url);
	});

	it('never carries a host, a port or a password even when nothing leaked', () => {
		const url = 'postgresql://postgres:hunter2@db.example-ref.supabase.co:5432/postgres';
		const text = renderAppliedRecord(base, url);
		for (const secret of ['hunter2', 'db.example-ref.supabase.co', '5432', 'postgresql://']) {
			expect(text, secret).not.toContain(secret);
		}
		// What it DOES carry, deliberately: the server's own answers, which are
		// what make the record able to say who ran the migration.
		expect(text).toContain('session_user: postgres');
		expect(text).toContain('database: postgres');
	});

	it('carries the number warning when the ledger named a different migration', () => {
		const warned = { ...base, numberWarning: 'the ledger entry names migration 0184 and this is 0185.' };
		expect(renderAppliedRecord(warned, '')).toContain('**WARNING: the ledger entry names migration 0184');
		// And says nothing when there is nothing to say.
		expect(renderAppliedRecord(base, '')).not.toContain('WARNING:');
	});
});

/* ------------------------------------------------------------------------ */
/* B1's required positive control: no record for something that did not      */
/* happen. Driven against a REAL Postgres.                                   */
/* ------------------------------------------------------------------------ */

describe('B1 control: a trace appears only for an apply that actually committed', () => {
	let db: TestDb;
	let url: string;
	let client: pg.Client;
	let appliedDir: string;

	beforeAll(async () => {
		db = await startTestDb([]);
		const cluster = inject('pgCluster');
		url = `postgresql://${cluster.user}:${cluster.password}@${cluster.host}:${cluster.port}/${db.databaseName}?sslmode=disable`;
		client = new pg.Client({ connectionString: url });
		await client.connect();
		appliedDir = scratch();
	}, 120_000);

	afterAll(async () => {
		await client?.end().catch(() => {});
		await db?.stop();
		if (appliedDir) rmSync(appliedDir, { recursive: true, force: true });
	});

	const record = (num: string, notices: { severity: string; message: string }[], objects: { kind: string; name: string; present: boolean }[]) => ({
		migrationNum: num,
		migrationFile: `${num}_probe.sql`,
		sha256: sha256('x'),
		branch: 'probe',
		slug: 'probe',
		commit: 'abc',
		ledgerId: '0099',
		ledgerFile: '0099-probe.md',
		ledgerRaw: 'at most one',
		numberWarning: null,
		sessionUser: 'postgres',
		database: db.databaseName,
		at: new Date().toISOString(),
		notices,
		objects,
		exit: 'applied'
	});

	it('FAILS DURING THE APPLY: the transaction rolls back and no record is written', async () => {
		const before = readdirSync(appliedDir);
		const sql = `create table public.t_during (id int);
			do $$ begin raise exception 'the migration refused itself'; end $$;`;
		const notices: { severity: string; message: string }[] = [];
		const result = await applyInTransaction(client, sql, false, notices);
		expect(result.ok).toBe(false);

		// THE MECHANISM: the write is downstream of `result.ok`, so this branch
		// never reaches it. Nothing is written because nothing calls the writer.
		expect(readdirSync(appliedDir)).toEqual(before);
		// And the database is untouched, which is what the record would have lied about.
		const r = await client.query(`select to_regclass('public.t_during') as t`);
		expect(r.rows[0].t).toBeNull();
	});

	it('FAILS AFTER THE COMMIT, before the write: the apply stands and no record is written', async () => {
		// This is the harder half of the control. The transaction COMMITS, and
		// then something between the commit and the write throws -- here, the
		// verification query, which really does run after the commit in `main`.
		const before = readdirSync(appliedDir);
		const sql = 'create table public.t_after (id int);';
		const result = await applyInTransaction(client, sql, false, []);
		expect(result.ok).toBe(true);

		let threw = false;
		try {
			// The post-apply verification, made to fail the way a broken claim
			// derivation would: an unresolvable catalog question.
			await client.query('select (this_function_does_not_exist()) as o0');
		} catch {
			threw = true;
		}
		expect(threw).toBe(true);
		// No record, because the writer is downstream of the verification too.
		expect(readdirSync(appliedDir)).toEqual(before);
		// The table IS there, which is exactly the state the record would have
		// described -- so this is a real "applied but untraced" moment, and the
		// tool shouts about it rather than writing a record for a run it could
		// not describe. See `main`'s COULD NOT WRITE THE RECORD branch.
		const r = await client.query(`select to_regclass('public.t_after') as t`);
		expect(r.rows[0].t).toBe('t_after');
	});

	it('POSITIVE CONTROL: a run that commits DOES get a record, with the real notices in it', async () => {
		// Without this, the two absences above would pass against a writer that
		// never wrote anything at all.
		const sql = `create table public.t_ok (id int primary key);
			do $$ begin raise notice 'probe: made the table'; end $$;`;
		const notices: { severity: string; message: string }[] = [];
		const collect = (n: pg.Notice) => notices.push({ severity: n.severity ?? 'NOTICE', message: n.message ?? '' });
		client.on('notice', collect);
		const result = await applyInTransaction(client, sql, false, notices);
		client.removeListener('notice', collect);
		expect(result.ok).toBe(true);

		const want = claims(sql);
		const q = 'select ' + want.map((c, i) => `(${c.sql}) as o${i}`).join(', ');
		const r = await client.query(q);
		const objects = want.map((c, i) => ({ kind: c.kind, name: c.name, present: r.rows[0][`o${i}`] === true }));
		expect(objects.every((o) => o.present)).toBe(true);

		const path = writeAppliedRecord(record('0186', notices, objects), url, appliedDir);
		expect(existsSync(path)).toBe(true);
		const text = readFileSync(path, 'utf8');
		expect(text).toContain('probe: made the table');
		expect(text).toContain('table `public.t_ok` | yes');
		// And the real connection string is not in it, redacted through the same
		// call the tool makes.
		expect(text).not.toContain(url);
		expect(text).not.toContain(String(inject('pgCluster').password));
	});
});

/* ------------------------------------------------------------------------ */
/* The whole thing, through the real CLI, against a real Postgres.           */
/* ------------------------------------------------------------------------ */

describe('the real CLI, end to end: gate, apply, record', () => {
	// Everything above tests the pieces. This drives `main()` itself, which is
	// where the pieces are WIRED -- the order of the gate against the connection,
	// the single call site of the writer, the exit code. A unit test of every
	// part passes just as well against a `main` that calls none of them.
	//
	// THE TARGET IS 0042 AND THE REASON IS THE FIXTURE, not the tool. The stub in
	// `tests/db/supabase-stub.sql` supplies only what lives outside
	// `supabase/migrations`, and it has no `auth.jwt()`, which 0043 is the first
	// migration to need -- measured: a chain of everything below 0043 boots, and
	// adding 0043 fails with `function auth.jwt() does not exist`. So the deepest
	// honest end-to-end drive available here is 0042 onto the 41 files below it,
	// which is a real migration, really applied, through the real CLI.
	//
	// `--since 42` puts the probe floor at the target, so the ordering rule is
	// asking only whether 0042 itself is applied. That is the tool's documented
	// behaviour at a floor and is stated rather than smoothed over: what this
	// drive proves is the WIRING of main() -- gate before connection, one call
	// site for the writer, the record's contents, the second-run refusal -- and
	// not the ordering rule, which `tests/apply-migration-guard.test.ts` covers
	// against a chain where it genuinely bites.
	const TARGET = '0042';
	const SINCE = '42';
	let db: TestDb;
	let url: string;
	let appliedDir: string;

	beforeAll(async () => {
		const all = readdirSync(join(REPO_ROOT, 'supabase', 'migrations'))
			.filter((f) => /^\d{4}_.*\.sql$/.test(f))
			.sort();
		const chain = all.filter((f) => f.slice(0, 4) < TARGET);
		expect(chain.length).toBeGreaterThan(30);
		db = await startTestDb(chain);
		const cluster = inject('pgCluster');
		url = `postgresql://${cluster.user}:${cluster.password}@${cluster.host}:${cluster.port}/${db.databaseName}?sslmode=disable`;
		appliedDir = join(REPO_ROOT, 'docs', 'migrations-applied');
	}, 600_000);

	afterAll(async () => {
		await db?.stop();
	});

	/** Run the CLI, always with the credential pinned to the harness. */
	const cli = (args: string[]) =>
		spawnSync(process.execPath, ['tools/apply-migration.mjs', ...args], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			env: { ...process.env, IDEA_MIGRATION_URL: url },
			timeout: 180_000
		});

	it('refuses at the gate for a bundle permitted nothing, before connecting', () => {
		const refusing = readdirSync(LEDGER_DIR)
			.filter((f) => /^\d{4}-.*\.md$/.test(f))
			.sort()
			.find((f) => !ledgerPermission(readFileSync(join(LEDGER_DIR, f), 'utf8')).permitted)!;
		const run = cli([TARGET, '--since', SINCE, '--ref', 'origin/integration', '--ledger', refusing.slice(0, 4)]);
		expect(run.status).toBe(2);
		expect(run.stdout).toMatch(/Migration permitted: no/);
		expect(run.stdout).toMatch(/no connection was opened/);
		expect(run.stdout).not.toMatch(/session_user/);
	}, 180_000);

	it('a DRY RUN passes every check, applies nothing, and writes no record', () => {
		const permitting = readdirSync(LEDGER_DIR)
			.filter((f) => /^\d{4}-.*\.md$/.test(f))
			.sort()
			.find((f) => ledgerPermission(readFileSync(join(LEDGER_DIR, f), 'utf8')).permitted)!;
		const before = readdirSync(appliedDir);
		const run = cli([
			TARGET,
			'--since',
			SINCE,
			'--ref',
			'origin/integration',
			'--ledger',
			permitting.slice(0, 4),
			'--dry-run'
		]);
		expect(run.stdout + run.stderr).toMatch(/DRY RUN|REFUSING/);
		if (run.status !== 0) {
			// The chain, the probe floor and the ref are all real things that can
			// legitimately refuse here. What must never happen is a record.
			expect(run.status).toBe(2);
		}
		// THE ASSERTION THAT MATTERS: a dry run is a path that applied nothing, so
		// it is downstream of nothing and must leave the directory as it found it.
		expect(readdirSync(appliedDir)).toEqual(before);
		// The URL is never echoed. NOT the password on its own: the harness
		// cluster's password is the literal string `postgres`, which is also the
		// role name the tool legitimately prints as `session_user postgres`, so
		// asserting on it here would fail on correct output. The password-leak
		// assertions that ARE meaningful live in the guard suite, whose fixture
		// uses a distinctive password.
		expect(run.stdout + run.stderr).not.toContain(url);
	}, 180_000);

	it('a real apply writes exactly one record, and a second run under the same ledger is refused', () => {
		const permitting = readdirSync(LEDGER_DIR)
			.filter((f) => /^\d{4}-.*\.md$/.test(f))
			.sort()
			.find((f) => ledgerPermission(readFileSync(join(LEDGER_DIR, f), 'utf8')).permitted)!;
		const ledgerId = permitting.slice(0, 4);
		const before = new Set(readdirSync(appliedDir));

		const run = cli([TARGET, '--since', SINCE, '--ref', 'origin/integration', '--ledger', ledgerId]);
		const written = readdirSync(appliedDir).filter((f) => !before.has(f));
		try {
			// NO EARLY RETURN. An earlier draft let a refusal here pass as "a real
			// answer about the chain", which would have let this whole test go
			// green having applied nothing and proved nothing -- the exact shape
			// of a control that certifies its own absence. If the apply does not
			// succeed, that is a failure of this test and it says so.
			expect(
				run.status,
				`the CLI did not apply ${TARGET}. stdout:\n${run.stdout}\nstderr:\n${run.stderr}`
			).toBe(0);
			expect(written).toHaveLength(1);
			const text = readFileSync(join(appliedDir, written[0]), 'utf8');
			expect(text).toContain(`migration: "${TARGET}"`);
			expect(text).toContain(`ledger: "${ledgerId}"`);
			expect(text).toContain('session_user:');
			// Nothing from the connection string, on the real thing rather than a
			// fixture. The URL, not the bare password: see the dry-run test above
			// for why the harness password is not a usable needle.
			expect(text).not.toContain(url);
			expect(text).not.toContain('sslmode');
			expect(text).not.toContain(String(inject('pgCluster').port));

			// THE SECOND RUN, same ledger: refused on the trace this one just wrote.
			const again = cli(['0041', '--since', SINCE, '--ref', 'origin/integration', '--ledger', ledgerId]);
			expect(again.status).toBe(2);
			expect(again.stdout).toMatch(/has already applied a migration/);
			expect(again.stdout).toMatch(/no connection was opened/);
		} finally {
			// This test writes into the REAL directory, because that is the path
			// the tool takes and a fixture directory would not exercise it.
			// Everything it wrote is removed again here.
			for (const f of written) rmSync(join(appliedDir, f), { force: true });
		}
	}, 300_000);
});

/* ------------------------------------------------------------------------ */
/* B4: this suite does not reach production.                                 */
/* ------------------------------------------------------------------------ */

describe('no test in this repository reaches a database it did not create', () => {
	const VAR = 'IDEA_' + 'MIGRATION_URL';

	const testFiles = (() => {
		const dir = join(REPO_ROOT, 'tests');
		const walk = (d: string): string[] =>
			readdirSync(d, { withFileTypes: true }).flatMap((e) =>
				e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]
			);
		return walk(dir).filter((f) => /\.(ts|mjs|js)$/.test(f));
	})();

	it('no test READS the credential out of the environment', () => {
		// MENTIONING the variable is fine and several tests must: one asserts the
		// tool reads that name and no other, one SETS it to the harness URL when
		// it spawns the CLI, one DELETES it to test the no-URL path. What no test
		// may do is take its VALUE, because the only value it can have is the
		// production database.
		expect(testFiles.length).toBeGreaterThan(50);
		const reads = testFiles.filter((f) => {
			const t = readFileSync(f, 'utf8');
			return (
				t.includes('process.env.' + VAR) ||
				t.includes("process.env['" + VAR + "']") ||
				t.includes('process.env[' + 'URL_VAR]')
			);
		});
		expect(reads.map((f) => f.slice(REPO_ROOT.length))).toEqual([]);
	});

	it('every test that spawns the CLI overrides or removes the credential first', () => {
		// THE REAL HAZARD IS `env: { ...process.env }` WITH NO OVERRIDE. A session
		// running this suite may legitimately hold the production credential, and
		// a spawn that inherits it points the real tool at the real database with
		// nothing on screen saying so. Both existing spawns are already careful;
		// this is what keeps the next one careful.
		// The needles are built rather than written, or this file matches itself:
		// a sweep whose search terms are literals in its own source reports the
		// sweep as an offender, which reads exactly like a real finding.
		const CLI = "'tools/apply-" + "migration.mjs'";
		const spawners = testFiles.filter((f) => readFileSync(f, 'utf8').includes(CLI));
		expect(spawners.length).toBeGreaterThan(0);
		for (const f of spawners) {
			const t = readFileSync(f, 'utf8');
			const sets = t.includes(VAR + ': url') || t.includes(VAR + ':url');
			const deletes = t.includes('delete env.' + VAR);
			expect(sets || deletes, `${f.slice(REPO_ROOT.length)} spawns the CLI without pinning ${VAR}`).toBe(true);
		}
		// The positive control on the sweep: it really is reading these files and
		// really does find the pattern, rather than matching nothing and passing.
		const guard = spawners.find((f) => f.endsWith('apply-migration-guard.test.ts'));
		expect(guard).toBeDefined();
		expect(readFileSync(guard!, 'utf8')).toContain('delete env.' + VAR);
	});

	it('names the limit it cannot close, rather than implying there is none', () => {
		// THE HONEST LIMIT. The two sweeps above prove the SUITE does not reach
		// production. Neither can prove a session will not point
		// `tools/apply-migration.mjs` itself at production, because that is
		// exactly what the tool is for: it is handed one URL and has no second
		// source of truth to check it against, so there is no marker on a
		// connection that says "this one is real". A tool that refused the real
		// database would be a tool with no purpose.
		//
		// What stands between a session and an unwanted write is therefore four
		// things, none of them a sandbox: the statement scanner (0065), the
		// ledger gate (0066), the ordering rule, and the committed trace. This
		// assertion exists so that sentence is in the suite rather than only in a
		// history entry nobody re-reads.
		const src = readFileSync(join(REPO_ROOT, 'tools', 'apply-migration.mjs'), 'utf8');
		expect(src).toContain('ONE FILE. NEVER A DIRECTORY, NEVER A LOOP');
		expect(src).toContain('WHO ASKED FOR THIS MIGRATION');
	});
});
