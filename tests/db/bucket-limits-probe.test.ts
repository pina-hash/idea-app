// tests/db/bucket-limits-probe.test.ts
//
// 0185 CAN BE ASKED WHETHER IT IS APPLIED.
//
// WHY THIS FILE EXISTS, AND WHY IT IS A TEST RATHER THAN A MEASUREMENT IN A
// HISTORY ENTRY. `tools/apply-migration.mjs` refuses to send a file it cannot
// first confirm is unapplied, and it gets that confirmation from
// `tools/idea-status.py`, which derives a catalog probe from THE FIRST OBJECT
// THE FILE CREATES. A migration that creates nothing has no probe; its applied
// state reads `unknown` for ever, and `orderVerdict` refuses it -- correctly,
// because cannot-say is never a pass.
//
// The first draft of 0185 was exactly that file. It wrote `storage.buckets`
// rows and created nothing, on an explicit scope rule, and `first_object`
// returned None. Nobody could apply it and nobody could tell whether it had
// been. The fix was to give it one object worth having: the ceiling itself,
// stated by the database.
//
// THAT REGRESSION IS SILENT IN BOTH DIRECTIONS, WHICH IS THE WHOLE ARGUMENT
// FOR A TEST. Delete the function and the file still applies perfectly by hand
// and every other assertion in `bucket-limits.test.ts` stays green -- only the
// TOOL stops working, months later, in front of whoever next tries. Nothing
// type-checks a probe, nothing renders one, and no other test in this repo
// asks whether a migration is probeable at all.
//
// WHAT IT ASSERTS:
//   A. The REAL derivation, driven through `tools/idea-status.py` itself
//      rather than a reimplementation of it, finds an object in 0185.
//   B. The probe it derives ANSWERS. False on a database that has not seen the
//      file -- which is the positive control, since a probe that is true
//      everywhere proves nothing -- and true on the same database after it.
//   C. The function states the same number as `$lib/upload-limits`, so the
//      database and the client cannot drift.
//   D. It is closed to `anon`, which a function created after 0137 is NOT by
//      default on a hosted Supabase project (see CLAUDE.md: the project's
//      default privileges write a direct `anon` grant at creation time, so
//      `revoke ... from public` alone would leave it open).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestDb, type TestDb } from './harness';
import { PORTAL_UPLOAD_MAX_BYTES } from '../../src/lib/upload-limits';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILE_0185 = '0185_bucket_limits_under_the_global.sql';
const SQL_0185 = readFileSync(
	fileURLToPath(new URL(`../../supabase/migrations/${FILE_0185}`, import.meta.url)),
	'utf8'
);

/**
 * THE PROBE, FROM THE REAL TOOL.
 *
 * `tools/deploy-probe.mjs` gets this by running `idea-status.py --json`, which
 * reads every migration from `git show origin/main:` -- so it cannot see a file
 * that has not landed yet, which is every file at the moment somebody is trying
 * to apply it. This calls the SAME `first_object` on the SAME shipped bytes and
 * skips only the git plumbing, so what is under test is the derivation and the
 * SQL it produces, which is the half that can be wrong.
 */
function derivedProbe(): { object: string; sql: string } {
	const out = execFileSync(
		'python3',
		[
			// -B: never write `tools/__pycache__`. It is not gitignored, so a test
			// that left one behind would make every subsequent tree dirty -- which
			// `readme-counts.mjs` records in the measured region, and which a
			// session would then have to explain.
			'-B',
			'-c',
			[
				'import importlib.util, pathlib, json, sys',
				"spec = importlib.util.spec_from_file_location('ist', 'tools/idea-status.py')",
				'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
				`blob = pathlib.Path('supabase/migrations/${FILE_0185}').read_text()`,
				'r = m.first_object(blob)',
				'json.dump(None if r is None else {"object": r[0], "sql": r[1]}, sys.stdout)'
			].join('\n')
		],
		{ cwd: REPO_ROOT, encoding: 'utf8' }
	);
	const parsed = JSON.parse(out);
	if (parsed === null) {
		throw new Error(
			`first_object found nothing in ${FILE_0185}: the migration creates no probeable object, ` +
				'so apply-migration.mjs cannot confirm whether it is applied and will refuse it.'
		);
	}
	return parsed;
}

describe('0185 is probeable, and the probe answers', () => {
	let db: TestDb;
	let probe: { object: string; sql: string };

	beforeAll(async () => {
		probe = derivedProbe();
		// A chain that does NOT include 0185. 0001 alone is enough: the probe
		// asks `pg_proc`, which every database has.
		db = await startTestDb(['0001_profiles.sql']);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	// --- A. the derivation ---

	it('derives an object from the shipped file', () => {
		expect(probe.object).toContain('function');
		expect(probe.object).toContain('portal_upload_max_bytes');
		// A probe must be a catalog question, never a read of application data:
		// `apply-migration.mjs` runs it inside `set transaction read only`.
		expect(probe.sql).toContain('pg_proc');
	});

	// --- B. the probe answers, both ways ---

	/**
	 * THE POSITIVE CONTROL, AND IT COMES FIRST. A probe that answered `true`
	 * against every database would pass the "after" assertion below while
	 * telling the tool nothing, and that is precisely the failure the tool's
	 * `unknown` state exists to avoid. So the FALSE reading is the one that has
	 * to be taken first, on a database that genuinely has not seen the file.
	 */
	it('answers FALSE on a database that has not seen the migration', async () => {
		const { rows } = await db.sql<{ applied: boolean }>(
			`select (${probe.sql}) as applied`
		);
		expect(rows[0].applied).toBe(false);
	});

	it('answers TRUE on the same database once the migration has run', async () => {
		await db.sql(SQL_0185);
		const { rows } = await db.sql<{ applied: boolean }>(
			`select (${probe.sql}) as applied`
		);
		expect(rows[0].applied).toBe(true);
	});

	// --- C. the number ---

	it('states the same ceiling the client preflights against', async () => {
		const { rows } = await db.sql<{ n: string }>(
			'select public.portal_upload_max_bytes()::text as n'
		);
		expect(Number(rows[0].n)).toBe(PORTAL_UPLOAD_MAX_BYTES);
		expect(Number(rows[0].n)).toBe(47185920);
	});

	/**
	 * AND IT IS THE FILE'S ONLY STATEMENT OF THAT NUMBER. The update, the
	 * self-check and the census all read the function, so the literal appears
	 * exactly once in the executable half. A second literal is what lets the
	 * function say one number while the sweep writes another.
	 */
	it('is the only executable statement of 47185920 in the file', () => {
		const executable = SQL_0185.replace(/--.*$/gm, '');
		const hits = executable.match(/47185920/g) ?? [];
		expect(hits.length).toBe(1);
	});

	// --- D. the grant ---

	it('is closed to anon and open to authenticated', async () => {
		const { rows } = await db.sql<{ anon: boolean; auth: boolean; svc: boolean }>(
			`select has_function_privilege('anon', 'public.portal_upload_max_bytes()', 'execute') as anon,
			        has_function_privilege('authenticated', 'public.portal_upload_max_bytes()', 'execute') as auth,
			        has_function_privilege('service_role', 'public.portal_upload_max_bytes()', 'execute') as svc`
		);
		expect(rows[0].anon).toBe(false);
		expect(rows[0].auth).toBe(true);
		expect(rows[0].svc).toBe(true);
	});
});
