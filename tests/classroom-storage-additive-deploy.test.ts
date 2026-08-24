// tests/classroom-storage-additive-deploy.test.ts
//
// 0133 AND 0134 MUST BE APPLICABLE WITH NO DEPLOY WINDOW, AND RE-APPLICABLE.
//
// WHAT WENT WRONG, AND WHY THIS FILE EXISTS. 0133 as first written widened
// `classroom_add_attachment` and `classroom_add_submission_file` and DROPPED
// the arities the deployed client calls. That makes the migration and the
// deploy mutually blocking: applying the SQL breaks every upload in production
// until the storage client ships, and shipping the client first breaks every
// upload until the SQL is applied. There is no ordering that avoids an outage,
// which is the property this file pins shut.
//
// The fix is additive: both arities exist afterwards. The trap that makes
// "additive" harder than it sounds is the PostgREST one in CLAUDE.md -- two
// overloads differing only by a DEFAULTED trailing parameter cannot be
// resolved at all, so a surviving old arity BREAKS the client rather than
// quietly serving it. What separates the pair here is that the WIDE form
// declares no defaults, so:
//
//   * the 5-key (7-key) payload the deployed client sends binds only to the
//     narrow form -- the wide one needs p_storage_key and cannot default it;
//   * the 6-key (8-key) payload the storage client sends binds only to the
//     wide form -- the narrow one has no p_storage_key to bind.
//
// Every call resolves to exactly one candidate, under any resolution rule
// rather than under a particular one.
//
// RE-APPLY IS NOT DECORATION HERE. These files are pasted into the Supabase SQL
// editor by hand, so a half-finished first attempt gets retried as a matter of
// course -- and the specific hazard is real: Postgres REFUSES to remove a
// parameter default through `create or replace` ("cannot remove parameter
// defaults from existing function"), so a machine that took 0133's earlier
// draft would reject the amended one without the guarded drop of the wide
// form. This file applies the chain, then applies both files a second time
// over the top, and asserts the arities are unchanged.
//
// WHAT THIS FILE CANNOT DO is put a real PostgREST in front of the database
// and watch it choose. There is no PostgREST in this fixture (and no Docker on
// this machine), so the ambiguity claim is taken from CLAUDE.md, where it is
// recorded as having bitten this repo twice. What is asserted here instead is
// the STRUCTURAL property that makes the question moot: no payload is callable
// by both overloads, so there is nothing for any resolver to get wrong.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestDb, type TestDb } from './db/harness';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql'
] as const;

/** The two files this bundle re-applies, in apply order. */
const REAPPLIED = ['0133_classroom_storage_attachments.sql', '0134_classroom_submission_open_race.sql'] as const;

interface Arity {
	args: string;
	nargs: number;
	ndefaults: number;
}

const WIDENED = ['classroom_add_attachment', 'classroom_add_submission_file'] as const;

/** What the deployed client on `main` names, and what the storage client names. */
const EXPECTED: Record<string, { narrow: string; wide: string }> = {
	classroom_add_attachment: {
		narrow:
			'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text, p_size_bytes bigint',
		wide: 'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text, p_size_bytes bigint, p_storage_key text'
	},
	classroom_add_submission_file: {
		narrow:
			'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text, p_size_bytes bigint, p_block_id text, p_caption text',
		wide: 'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text, p_size_bytes bigint, p_block_id text, p_caption text, p_storage_key text'
	}
};

let db: TestDb;

const arities = async (name: string): Promise<Arity[]> => {
	const { rows } = await db.sql<Arity>(
		`select pg_get_function_identity_arguments(p.oid) as args,
		        p.pronargs::int as nargs,
		        p.pronargdefaults::int as ndefaults
		 from pg_proc p
		 join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public' and p.proname = $1
		 order by p.pronargs`,
		[name]
	);
	return rows;
};

const report = async (label: string) => {
	for (const name of WIDENED) {
		for (const row of await arities(name)) {
			// PRINTED, not merely compared: the point of the exercise is to be
			// able to read what the catalog actually holds.
			console.log(
				`[0133 arities] ${label}  public.${name}(${row.args})  nargs=${row.nargs} ndefaults=${row.ndefaults}`
			);
		}
	}
};

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	await report('after first apply ');
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('the widened attachment RPCs are additive', () => {
	test('both arities of each RPC exist after the first apply', async () => {
		for (const name of WIDENED) {
			const rows = await arities(name);
			expect(rows.map((r) => r.args), `${name} arities`).toEqual([
				EXPECTED[name].narrow,
				EXPECTED[name].wide
			]);
		}
	});

	test('the wide form declares no defaults, so no payload binds to both', async () => {
		for (const name of WIDENED) {
			const rows = await arities(name);
			const [narrow, wide] = rows;

			// The wide form requires every argument. This is the whole
			// disambiguation: a payload without p_storage_key cannot reach it.
			expect(wide.ndefaults, `${name} wide defaulted parameters`).toBe(0);

			// The narrow form keeps 0085's/0086's trailing defaults, so a caller
			// that omits p_size_bytes still resolves -- to it, and only to it,
			// since the wide form needs strictly more arguments than the narrow
			// form can even accept.
			expect(narrow.ndefaults, `${name} narrow defaulted parameters`).toBeGreaterThan(0);
			expect(wide.nargs - narrow.nargs, `${name} widened by`).toBe(1);

			// The structural statement of "no payload binds to both": the
			// smallest call the wide form accepts is larger than the largest
			// call the narrow form accepts.
			const narrowMax = narrow.nargs;
			const wideMin = wide.nargs - wide.ndefaults;
			expect(wideMin, `${name}: wide minimum vs narrow maximum`).toBeGreaterThan(narrowMax);
		}
	});

	test('re-applying 0133 and 0134 over the top changes nothing', async () => {
		const before = new Map<string, Arity[]>();
		for (const name of WIDENED) before.set(name, await arities(name));

		for (const file of REAPPLIED) {
			const text = readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8');
			// A throw here IS the failure: these are pasted by hand and get
			// retried, so a file that only works once fails exactly then.
			await db.sql(text);
		}
		await report('after re-apply  ');

		for (const name of WIDENED) {
			expect(await arities(name), `${name} after re-apply`).toEqual(before.get(name));
		}
	});

	test('0133 refuses to finish if the pair is ever made ambiguous again', async () => {
		// MUTATION, IN THE PERMISSIVE DIRECTION. Put a default back on the wide
		// form -- the exact regression the migration's own guard exists to
		// catch -- and re-apply 0134, whose closing check must raise. Without
		// this, the guard could be silently broken and every test here would
		// still pass, because the guard is the only thing that reads it.
		await db.sql(
			`create or replace function public.classroom_add_submission_file(
				p_item_id uuid,
				p_drive_file_id text,
				p_filename text,
				p_mime_type text,
				p_size_bytes bigint,
				p_block_id text,
				p_caption text,
				p_storage_key text default null
			) returns jsonb language plpgsql security definer set search_path = ''
			as $mutant$ begin return jsonb_build_object('ok', false); end; $mutant$;`
		);

		const text = readFileSync(
			join(process.cwd(), 'supabase', 'migrations', '0134_classroom_submission_open_race.sql'),
			'utf8'
		);
		// 0134 drops the 8-arg form and rebuilds it without defaults, so the
		// guard passes again -- which is the correct behaviour and means this
		// re-apply REPAIRS the mutation rather than reporting it. What is
		// asserted is the repair: after the file runs, the pair is unambiguous
		// again, byte for byte.
		await db.sql(text);
		const rows = await arities('classroom_add_submission_file');
		expect(rows.map((r) => r.args)).toEqual([
			EXPECTED.classroom_add_submission_file.narrow,
			EXPECTED.classroom_add_submission_file.wide
		]);
		expect(rows[1].ndefaults, 'wide defaulted parameters after repair').toBe(0);

		// And the guard genuinely bites when the file CANNOT repair it: drop
		// the narrow form and re-apply, which must raise rather than pass.
		await db.sql(
			'drop function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text)'
		);
		await expect(db.sql(text)).rejects.toThrow(/expected 2/i);

		// Put it back, so nothing after this file inherits a broken catalog.
		await db.sql(
			readFileSync(
				join(process.cwd(), 'supabase', 'migrations', '0133_classroom_storage_attachments.sql'),
				'utf8'
			)
		);
		await db.sql(text);
		expect((await arities('classroom_add_submission_file')).length).toBe(2);
	});
});
