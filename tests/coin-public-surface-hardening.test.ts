// tests/coin-public-surface-hardening.test.ts
//
// 0157, over seeded PRE-migration data.
//
// The bundle recorded in `docs/history/anon-coin-public-projections-mrlg0d.md`
// drove the Ledger's five public boards as a signed-out visitor and pinned
// every projection. It FOUND three things and fixed none of them, because a
// migration was out of that bundle's scope:
//
//   1. an unnamed student was published as the local part of their address, by
//      TWO separate fall-throughs, both reachable by an anonymous caller;
//   2. `coin_public_sections` was `distinct on (...)` with no `order by`, so a
//      duplicate label resolved to an arbitrary colour;
//   3. `coin_role_quiz_questions.options` was constrained to a jsonb array of
//      2-8 elements and to nothing about what is IN them.
//
// This file is the migration's proof, and it is written the way CLAUDE.md asks
// a migration to be tested: **the chain boots SHORT of 0157, the world is
// seeded through the REAL pre-migration RPCs, the deployed behaviour is
// MEASURED, and only then is 0157 applied over the top and the same questions
// asked again.** A test that only ever saw the post-migration chain could not
// tell a fix from a fixture that never had the problem.
//
// EVERY READ IS AS `anon`, through the shared PostgREST shim with a null
// caller, because that is the caller these three defects were about. The shim
// being genuinely anon is asserted, not assumed.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * The same coin chain the sibling anon-projection files carry, with 0157 held
 * BACK: `applyMigration` below pastes it in after the world is seeded, exactly
 * as an operator will paste it into the SQL editor.
 */
const CHAIN_BEFORE = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	'0072_coin_my_eating_pass_status.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0077_coin_contracts.sql',
	'0079_coin_bulk_payout.sql',
	'0080_coin_category_admin.sql',
	'0081_coin_debt_payment.sql',
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql',
	'0096_coin_medium.sql',
	'0103_coin_public_medium_display.sql',
	'0107_coin_public_adjustment_bucket.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION = '0157_coin_public_surface_hardening.sql';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Pastes 0157 into the database the way an operator pastes it into the SQL
 * editor: the file's own bytes, unmodified, as one statement batch.
 *
 * NOTHING RE-RUNS 0137 AFTER IT, deliberately, and that is an assertion rather
 * than an omission. `coin-medium.test.ts` has to re-apply the sweep after
 * hand-applying 0096, because a `create or replace` under this project's
 * default privileges hands the replaced function a fresh `anon` grant. 0157
 * states its own end state instead -- `revoke ... from public, anon,
 * authenticated, service_role` then grant back only what should hold it -- so
 * the grants below are 0157's own work and not the sweep's.
 */
function applyMigration(): Promise<unknown> {
	return db.sql(readFileSync(join(REPO_ROOT, 'supabase', 'migrations', MIGRATION), 'utf8'));
}

const SECTION = 'eng1h-sophomore';
const SECTION_LABEL = 'Engineering I Honors, Sophomore';

/** The word 0157 publishes for a student with no name recorded anywhere. */
const GENERIC = 'Student';

let db: TestDb;
let owner: SeededUser;
let ada: SeededUser; // named: a real profiles.full_name
let noName: SeededUser; // on the roster, named NOWHERE -- the roster's 4th rung
let offRoster: SeededUser; // no roster row at all -- the contracts function's own arm
let anon: ReturnType<typeof createPostgrestShim>;
let adminClient: ReturnType<typeof createPostgrestShim>;
let contractSectioned: string;
let contractOffRoster: string;

/** What the world looked like BEFORE 0157, measured rather than assumed. */
const before: Record<string, unknown> = {};

async function ok<T>(
	call: Promise<{ data: unknown; error: { message: string } | null }>
): Promise<T> {
	const res = await call;
	if (res.error) throw new Error(res.error.message);
	return res.data as T;
}

function readPublic<T = Record<string, unknown>>(
	fn: string,
	args?: Record<string, unknown>
): Promise<T[]> {
	return ok<T[]>(anon.rpc(fn, args));
}

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as Error).message };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN_BEFORE);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	ada = await createUser(db, 'ada.lovelace@boscotech.net', 'Ada Lovelace');
	// Named NOWHERE: no coin_students row, no profiles.display_name, and an
	// empty full_name, so `nullif(btrim(...), '')` empties all three rungs and
	// the FOURTH is what answers. This is the student the whole bundle is about.
	noName = await createUser(db, 'quiet.claimant@boscotech.net', '');
	// On NO roster and with NO ledger row, so `_coin_public_roster` does not
	// carry her at all and the LEFT JOIN inside coin_public_contracts misses --
	// which is the SECOND, independent copy of the fallback.
	offRoster = await createUser(db, 'no.roster@boscotech.net', '');

	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			SECTION,
			SECTION_LABEL,
			'#00FF41',
			null,
			true
		]);
		await q(`select public.coin_admin_assign_section_students($1, $2::text[])`, [
			SECTION,
			[ada.email, noName.email]
		]);

		// TWO ACTIVE SECTIONS SHARING ONE LABEL, with different colours. This is
		// the duplicate-label case defect 2 is about, and it has to be built
		// through the real RPC rather than asserted from a comment.
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			'twin-old',
			'Engineering II, Junior',
			'#111111',
			null,
			true
		]);
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			'twin-new',
			'Engineering II, Junior',
			'#222222',
			null,
			true
		]);

		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Rebuild the shop cart',
			'Needs two people.',
			20,
			2,
			SECTION
		]);
		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Deburr the plate stock',
			null,
			12,
			1,
			null
		]);
	});

	// `twin-new` must be strictly NEWER than `twin-old`. Both were written in
	// separate transactions above, but `now()` is transaction time and the
	// harness is fast, so the two can land on the same timestamp -- which is
	// exactly the tie the migration's `s.id` tiebreak exists for. Pinning the
	// two apart here means the `created_at desc` half is what the assertion
	// measures; the tie itself gets its own test below.
	await db.sql(`update public.coin_sections set created_at = now() - interval '1 year' where id = 'twin-old'`);

	const byTitle = async (title: string) =>
		(await db.sql<{ id: string }>(`select id from public.coin_contracts where title = $1`, [title]))
			.rows[0].id;
	contractSectioned = await byTitle('Rebuild the shop cart');
	contractOffRoster = await byTitle('Deburr the plate stock');

	await db.asUser(ada.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractSectioned]);
	});
	await db.asUser(noName.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractSectioned]);
	});
	await db.asUser(offRoster.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractOffRoster]);
	});

	// A real mc question and a written one, both legal under 0076 AND under
	// 0157, so the narrowing is proven not to strand ordinary content.
	await db.sql(
		`insert into public.coin_role_quiz_questions
		   (role_id, type, question_text, sequence, options, correct_option_index)
		 values ('safety_officer', 'mc', 'Where is the shop eyewash station?', 1,
		         '["By the door", "Behind the mill", "There isn''t one"]'::jsonb, 0)`
	);
	await db.sql(
		`insert into public.coin_role_quiz_questions (role_id, type, question_text, sequence)
		 values ('safety_officer', 'written', 'Describe a time you stopped unsafe work.', 2)`
	);

	const fks = await loadForeignKeys(db);
	anon = createPostgrestShim(db, fks, null);
	adminClient = createPostgrestShim(db, fks, owner.id);

	// ------------------------------------------------------------------
	// MEASURE THE DEPLOYED WORLD, before 0157 exists.
	// ------------------------------------------------------------------
	before.roster = (
		await db.sql<{ display_name: string }>(
			`select display_name from public._coin_public_roster() where student_email = $1`,
			[noName.email]
		)
	).rows[0]?.display_name;
	before.contractors = (
		await readPublic('coin_public_contracts')
	).map((r) => ({ title: r.title, contractors: r.contractors }));
	before.leaderboardNames = (await readPublic('coin_public_leaderboard')).map((r) => r.name);
	before.sectionsSrc = (
		await db.sql<{ prosrc: string }>(
			`select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_public_sections'`
		)
	).rows[0].prosrc;
	before.optionsConstraint = (
		await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint c
			   join pg_class t on t.oid = c.conrelid
			  where t.relname = 'coin_role_quiz_questions'
			    and c.conname = 'coin_role_quiz_questions_options_are_option_strings'`
		)
	).rows[0].n;
	// An option carrying an answer key is REPRESENTABLE before 0157. Written
	// and then removed, so it cannot pollute the post-migration world -- the
	// point is only that 0076 accepted it.
	before.smuggledKeyAccepted = await (async () => {
		try {
			await db.sql(
				`insert into public.coin_role_quiz_questions
				   (role_id, type, question_text, sequence, options, correct_option_index)
				 values ('safety_officer', 'mc', 'Which lever is the estop?', 9,
				         '["Left", {"text": "Right", "correct": true}]'::jsonb, 1)`
			);
			await db.sql(`delete from public.coin_role_quiz_questions where sequence = 9`);
			return true;
		} catch {
			return false;
		}
	})();

	// ------------------------------------------------------------------
	// APPLY 0157 OVER THE TOP, the way an operator will.
	// ------------------------------------------------------------------
	await applyMigration();
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
// The world 0157 was written against really was the broken one.
// ===========================================================================

describe('PRE-MIGRATION CONTROLS: all three defects were real on the deployed chain', () => {
	test('an unnamed student WAS published as the local part, by both paths', () => {
		expect(before.roster).toBe('quiet.claimant');
		const rows = before.contractors as { title: string; contractors: string }[];
		expect(rows.find((r) => r.title === 'Rebuild the shop cart')!.contractors.split(' | ')).toContain(
			'quiet.claimant'
		);
		expect(rows.find((r) => r.title === 'Deburr the plate stock')!.contractors).toBe('no.roster');
		// And through the roster into the leaderboard, which is the third
		// surface the same rung feeds.
		expect(before.leaderboardNames).toContain('quiet.claimant');
	});

	test('coin_public_sections HAD no order by', () => {
		expect(before.sectionsSrc as string).not.toMatch(/order\s+by/i);
		expect(before.sectionsSrc as string).toMatch(/distinct on/i);
	});

	test('an option carrying an answer key WAS accepted by 0076 alone', () => {
		expect(before.optionsConstraint).toBe('0');
		expect(before.smuggledKeyAccepted).toBe(true);
	});
});

// ===========================================================================
// The shim really is anon.
// ===========================================================================

describe('the caller these three defects were about', () => {
	test('THE SHIM ITSELF IS ANON: the same client is refused what an admin is given', async () => {
		const refused = await anon.rpc('coin_role_admin_list_role_questions', {
			p_role_id: 'safety_officer'
		});
		// 42501 is Postgres' own SQLSTATE for a permission denial, which is what
		// this claim is actually about: anon is refused BY GRANT, not by hitting
		// a function that does not exist (that would be PGRST202, the shim's
		// old blanket answer for every RPC failure, this one included).
		expect(refused.error?.code).toBe('42501');
		expect(refused.error?.message ?? '').toMatch(/permission denied/i);
		expect(refused.data).toBeNull();
		const allowed = await adminClient.rpc('coin_role_admin_list_role_questions', {
			p_role_id: 'safety_officer'
		});
		expect(allowed.error).toBeNull();
		expect((allowed.data as unknown[]).length).toBeGreaterThan(0);
	});

	test('0157 moved no grant: the two public reads still answer anon, the helpers do not', async () => {
		const { rows } = await db.sql<{ name: string; anon_x: boolean }>(
			`select p.proname as name, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = any($1::text[]) order by 1`,
			[
				[
					'coin_public_contracts',
					'coin_public_sections',
					'_coin_public_roster',
					'_coin_public_name_fallback'
				]
			]
		);
		expect(rows.filter((r) => r.anon_x).map((r) => r.name)).toEqual([
			'coin_public_contracts',
			'coin_public_sections'
		]);
		// THE NEW HELPER IS THE ONE THAT WOULD HAVE ARRIVED OPEN. A function
		// created after 0137 is granted to anon by the project's default
		// privileges and the sweep does not cover it, so 0157 revoking for
		// itself is what this pins.
		expect(rows.find((r) => r.name === '_coin_public_name_fallback')!.anon_x).toBe(false);
	});
});

// ===========================================================================
// 1. The name.
// ===========================================================================

describe('after 0157, an unnamed student is not published as an address', () => {
	test('the roster resolves the generic word instead of the local part', async () => {
		const { rows } = await db.sql<{ display_name: string }>(
			`select display_name from public._coin_public_roster() where student_email = $1`,
			[noName.email]
		);
		expect(rows[0].display_name).toBe(GENERIC);
		expect(rows[0].display_name).not.toContain('quiet');
	});

	test('and so does the contracts board, by BOTH paths', async () => {
		const rows = await readPublic('coin_public_contracts');
		const cart = rows.find((r) => r.title === 'Rebuild the shop cart')!;
		// The roster's fourth rung, reached through the join.
		expect((cart.contractors as string).split(' | ')).toContain(GENERIC);
		// The function's OWN arm, reached when the roster carries no row.
		const deburr = rows.find((r) => r.title === 'Deburr the plate stock')!;
		expect(deburr.contractors).toBe(GENERIC);
		// Its positive control: she really is absent from the roster, so this
		// really is the function's own branch and not the roster's.
		const { rows: rosterRows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public._coin_public_roster() r where r.student_email = $1`,
			[offRoster.email]
		);
		expect(rosterRows[0].n).toBe('0');
	});

	test('A STUDENT WITH A NAME IS UNAFFECTED, which is the half that must not break', async () => {
		const rows = await readPublic('coin_public_contracts');
		const cart = rows.find((r) => r.title === 'Rebuild the shop cart')!;
		expect((cart.contractors as string).split(' | ')).toContain('Ada Lovelace');
		const board = await readPublic('coin_public_leaderboard');
		expect(board.map((r) => r.name)).toContain('Ada Lovelace');
	});

	test('THE EARLIER RUNGS STILL RESOLVE IN THE SAME ORDER, all three of them', async () => {
		// The migration replaced the fourth rung only. Each of the first three
		// is proven to still WIN over the ones below it, which is the assertion
		// that a careless rewrite of the coalesce would break.
		const rung3 = await createUser(db, 'rung.three@boscotech.net', 'Rung Three Fullname');
		const rung2 = await createUser(db, 'rung.two@boscotech.net', 'Rung Two Fullname');
		const rung1 = await createUser(db, 'rung.one@boscotech.net', 'Rung One Fullname');
		await db.sql(`update public.profiles set display_name = 'Rung Two Chosen' where id = $1`, [
			rung2.id
		]);
		await db.sql(`update public.profiles set display_name = 'Rung One Chosen' where id = $1`, [
			rung1.id
		]);
		// coin_students is the FIRST rung and outranks both profile fields.
		await db.sql(
			`insert into public.coin_students (student_email, display_name, source)
			 values ($1, 'Rung One, Imported', 'test')`,
			[rung1.email]
		);
		await db.asUser(owner.id, async (q) => {
			await q(`select public.coin_admin_assign_section_students($1, $2::text[])`, [
				SECTION,
				[rung1.email, rung2.email, rung3.email]
			]);
		});
		const { rows } = await db.sql<{ student_email: string; display_name: string }>(
			`select student_email, display_name from public._coin_public_roster()
			  where student_email = any($1::text[]) order by student_email`,
			[[rung1.email, rung2.email, rung3.email]]
		);
		const named = Object.fromEntries(rows.map((r) => [r.student_email, r.display_name]));
		expect(named[rung1.email]).toBe('Rung One, Imported'); // 1 beats 2 and 3
		expect(named[rung2.email]).toBe('Rung Two Chosen'); // 2 beats 3
		expect(named[rung3.email]).toBe('Rung Three Fullname'); // 3 beats the generic
	});

	test('NO PUBLIC PAYLOAD CARRIES AN ADDRESS OR ANY PART OF ONE', async () => {
		const payloads = {
			contracts: await readPublic('coin_public_contracts'),
			leaderboard: await readPublic('coin_public_leaderboard'),
			transactions: await readPublic('coin_public_transactions', { p_limit: 5000 }),
			sections: await readPublic('coin_public_sections')
		};
		const text = JSON.stringify(payloads);
		expect(text).not.toMatch(/@boscotech\.(net|edu)/);
		// The local part on its own is the whole point of the migration, so it
		// is swept for by NAME rather than by the presence of an `@`.
		for (const local of ['quiet.claimant', 'no.roster', 'rung.one', 'rung.two', 'rung.three']) {
			expect(text, `${local} reached a public payload`).not.toContain(local);
		}
		// POSITIVE CONTROL: those addresses really are in the tables behind it,
		// so the sweep is looking at a world that has something to leak.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_contract_claims where student_email like '%@boscotech.net'`
		);
		expect(Number(rows[0].n)).toBeGreaterThan(0);
	});

	test('THE WORD IS WRITTEN DOWN ONCE, and both callers reach it', async () => {
		// SQL line comments stripped, for the reason 0157's own self-check
		// strips them: both bodies deliberately record what the rung USED to
		// be, prosrc keeps a comment verbatim, and a raw match would fire on
		// the documentation rather than on the code.
		const { rows } = await db.sql<{ name: string; src: string }>(
			`select p.proname as name,
			        regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') as src
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname in ('_coin_public_roster', 'coin_public_contracts')
			  order by 1`
		);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.src, `${row.name} still derives a name from the address`).not.toContain(
				'split_part'
			);
			expect(row.src, `${row.name} does not call the one definition`).toContain(
				'_coin_public_name_fallback()'
			);
			// A second literal copy of the word is what the function exists to
			// prevent, so neither body may spell it out.
			expect(row.src, `${row.name} inlines the word instead of calling for it`).not.toContain(
				`'${GENERIC}'`
			);
		}
	});

	test("coin_me IS LEFT ALONE, deliberately: it names the CALLER from their OWN address", async () => {
		// Own-identity only and `authenticated`-granted, so it discloses
		// nothing -- and blanking it would make a signed-in student's own
		// header read as a stranger's. Asserted so a later sweep for
		// `split_part` does not "finish the job" and break it.
		const { rows } = await db.sql<{ src: string; anon_x: boolean }>(
			`select p.prosrc as src, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_me'`
		);
		expect(rows[0].src).toContain('split_part');
		expect(rows[0].anon_x).toBe(false);
		const me = await ok<Record<string, unknown>>(adminClient.rpc('coin_me'));
		expect(me.signed_in).toBe(true);
	});
});

// ===========================================================================
// 2. The colour map.
// ===========================================================================

describe('after 0157, a duplicate label resolves the same way every time', () => {
	test('POSITIVE CONTROL: two ACTIVE sections really do share one label', async () => {
		const { rows } = await db.sql<{ id: string; color: string }>(
			`select id, color from public.coin_sections
			  where active and label = 'Engineering II, Junior' order by id`
		);
		expect(rows.map((r) => r.id)).toEqual(['twin-new', 'twin-old']);
		expect(rows.map((r) => r.color)).toEqual(['#222222', '#111111']);
	});

	test('the label appears ONCE, and carries the NEWEST active section colour', async () => {
		const rows = await readPublic('coin_public_sections');
		const twins = rows.filter((r) => r.section === 'Engineering II, Junior');
		expect(twins).toHaveLength(1);
		expect(twins[0].color).toBe('#222222');
	});

	test('THE ORDER IS TOTAL, read off the catalog: label, then newest, then the key', async () => {
		// THIS IS THE GUARD, AND THE REASON IT IS STRUCTURAL IS A MEASUREMENT
		// RATHER THAN A PREFERENCE.
		//
		// `distinct on` with no matching sort is UNSPECIFIED, not random: which
		// row survives depends on the plan, and the plan is stable for a given
		// table. So running the query repeatedly cannot detect the defect --
		// verified by mutation, three ways. With the whole `order by` removed,
		// with only the label expression left, and with the `s.id` tiebreak
		// dropped over a forced `created_at` tie, twelve consecutive runs
		// agreed every time and NOT ONE behavioural assertion in this file
		// reddened. A test that cannot fail on the defect is not a test of it.
		//
		// Determinism is a property of the ORDER BY clause, so the clause is
		// what gets pinned -- normalized for whitespace, and with SQL comments
		// stripped for the same reason the name guard strips them.
		const { rows } = await db.sql<{ src: string }>(
			`select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') as src
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'coin_public_sections'`
		);
		const src = rows[0].src;
		const at = src.toLowerCase().lastIndexOf('order by');
		expect(at, 'coin_public_sections has no order by at all').toBeGreaterThan(-1);
		const clause = src.slice(at).replace(/\s+/g, ' ').trim();
		expect(clause).toBe(
			"order by coalesce(nullif(btrim(s.label), ''), s.id), s.created_at desc, s.id;"
		);
		// The leading expression MUST be the distinct-on expression, or
		// Postgres refuses the query outright -- so this half is enforced by
		// the engine and the pin above only has to police the tiebreak.
		const distinctAt = src.toLowerCase().indexOf('distinct on');
		expect(distinctAt).toBeGreaterThan(-1);
		expect(distinctAt).toBeLessThan(at);
	});

	test('WEAK CONTROL: repeated runs agree (they agreed before 0157 too)', async () => {
		// Kept, and labelled, so nobody reads it as the guard. It says the
		// answer is stable in THIS process against THIS fixture, which is true
		// of the broken function as well; the assertion above is what bites.
		const answers = new Set<string>();
		for (let i = 0; i < 12; i++) {
			const rows = await readPublic('coin_public_sections');
			answers.add(
				JSON.stringify(
					rows.filter((r) => r.section === 'Engineering II, Junior').map((r) => r.color)
				)
			);
		}
		expect([...answers]).toEqual(['["#222222"]']);
	});

	test('THE created_at TIE IS REAL, and s.id is what makes the order total', async () => {
		// `now()` is TRANSACTION time, so two sections written in one statement
		// tie exactly -- the same trap 0132's resolution order names. Forced
		// here rather than hoped for, because the tiebreak is only load-bearing
		// when there is a tie.
		await db.sql(`update public.coin_sections set created_at = (
			select created_at from public.coin_sections where id = 'twin-new'
		) where id = 'twin-old'`);
		const { rows: tied } = await db.sql<{ n: string }>(
			`select count(distinct created_at)::text as n from public.coin_sections
			  where id in ('twin-new','twin-old')`
		);
		expect(tied[0].n).toBe('1'); // the tie is real

		// With the tie in place, `s.id` is the only thing left deciding, and
		// 'twin-new' sorts before 'twin-old'.
		const rows = await readPublic('coin_public_sections');
		const twins = rows.filter((r) => r.section === 'Engineering II, Junior');
		expect(twins).toHaveLength(1);
		expect(twins[0].color).toBe('#222222');

		// Put the fixture back so a later test does not inherit the tie.
		await db.sql(
			`update public.coin_sections set created_at = now() - interval '1 year' where id = 'twin-old'`
		);
	});

	test('a section with no colour is still absent, and one really exists', async () => {
		await db.asUser(owner.id, async (q) => {
			await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
				'no-colour',
				'Uncoloured Section',
				null,
				null,
				true
			]);
		});
		const rows = await readPublic('coin_public_sections');
		expect(rows.map((r) => r.section)).not.toContain('Uncoloured Section');
		const { rows: real } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_sections where id = 'no-colour' and color is null`
		);
		expect(real[0].n).toBe('1');
	});
});

// ===========================================================================
// 3. What an option is.
// ===========================================================================

describe('after 0157, an option is a short non-blank string or it is refused', () => {
	test('POSITIVE CONTROL: the constraint exists and ordinary content still saves', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint c join pg_class t on t.oid = c.conrelid
			  where t.relname = 'coin_role_quiz_questions'
			    and c.conname = 'coin_role_quiz_questions_options_are_option_strings'`
		);
		expect(rows[0].n).toBe('1');
		// The two rows seeded BEFORE the migration survived it, which is what
		// "existing rows still satisfy it" means in practice.
		const { rows: kept } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_role_quiz_questions where role_id = 'safety_officer'`
		);
		expect(kept[0].n).toBe('2');
		// And a new, ordinary mc question still saves.
		await db.sql(
			`insert into public.coin_role_quiz_questions
			   (role_id, type, question_text, sequence, options, correct_option_index)
			 values ('quartermaster', 'mc', 'Where do returned tools go?', 1,
			         '["The crib", "The bench", "The floor"]'::jsonb, 0)`
		);
	});

	test('EVERY SHAPE THAT IS NOT AN OPTION IS NOW REFUSED', async () => {
		const hostile: [string, string][] = [
			['an answer key smuggled into an element', `'["Left", {"text": "Right", "correct": true}]'`],
			['a number element', `'["Left", 3]'`],
			['a JSON null element', `'["Left", null]'`],
			['a boolean element', `'["Left", true]'`],
			['a NESTED ARRAY element (lax jsonpath would unwrap this)', `'["Left", ["Right"]]'`],
			['a blank element', `'["Left", "   "]'`],
			['an empty element', `'["Left", ""]'`],
			['a whitespace-only element', `'["Left", "\\n\\t"]'`],
			['an element over 200 characters', `('["Left", ' || to_jsonb(repeat('x', 201))::text || ']')`]
		];
		let seq = 100;
		for (const [label, expr] of hostile) {
			const n = seq++;
			const err = await captureError(() =>
				db.sql(
					`insert into public.coin_role_quiz_questions
					   (role_id, type, question_text, sequence, options, correct_option_index)
					 values ('safety_officer', 'mc', $1, ${n}, ${expr}::jsonb, 0)`,
					[`hostile: ${label}`]
				)
			);
			expect(err.message, label).toMatch(/coin_role_quiz_questions_options_are_option_strings/);
		}
	});

	test('AND THE BOUNDARIES ARE ACCEPTED, so the narrowing is not wider than stated', async () => {
		// 200 characters exactly, and a legitimate multi-line option: the cap
		// is on LENGTH, not on shape, and a rule that also refused these would
		// be a different rule from the one the header describes.
		await db.sql(
			`insert into public.coin_role_quiz_questions
			   (role_id, type, question_text, sequence, options, correct_option_index)
			 values ('safety_officer', 'mc', 'boundary: 200 chars exactly', 200,
			         ('["Left", ' || to_jsonb(repeat('x', 200))::text || ']')::jsonb, 0)`
		);
		await db.sql(
			`insert into public.coin_role_quiz_questions
			   (role_id, type, question_text, sequence, options, correct_option_index)
			 values ('safety_officer', 'mc', 'boundary: a two-line option', 201,
			         '["Left", "two\\nlines"]'::jsonb, 0)`
		);
		// And a `written` question still carries neither, which is 0076's rule
		// and which 0157 must not have disturbed.
		await db.sql(
			`insert into public.coin_role_quiz_questions (role_id, type, question_text, sequence)
			 values ('safety_officer', 'written', 'boundary: written carries no options', 202)`
		);
	});

	test('0076 STILL REFUSES WHAT IT ALWAYS DID, so this narrowed and replaced nothing', async () => {
		// One option, which is 0076's length rule rather than 0157's element
		// rule -- named separately so a future edit that folds the two together
		// gets caught.
		const tooFew = await captureError(() =>
			db.sql(
				`insert into public.coin_role_quiz_questions
				   (role_id, type, question_text, sequence, options, correct_option_index)
				 values ('safety_officer', 'mc', 'only one option', 300, '["Left"]'::jsonb, 0)`
			)
		);
		expect(tooFew.message).not.toMatch(/options_are_option_strings/);
		// A non-array is 0076's too, and 0157 deliberately hands that case back
		// rather than raising a jsonpath error over it.
		const notArray = await captureError(() =>
			db.sql(
				`insert into public.coin_role_quiz_questions
				   (role_id, type, question_text, sequence, options, correct_option_index)
				 values ('safety_officer', 'mc', 'not an array', 301, '{"a":1}'::jsonb, 0)`
			)
		);
		expect(notArray.message).not.toMatch(/options_are_option_strings/);
		expect(notArray.message).toMatch(/coin_role_quiz_questions_check|violates check constraint/);
	});

	test('THE ANSWER KEY IS STILL NOT IN THE PUBLIC PROJECTION, and really exists', async () => {
		// 0157 must not have widened the read while narrowing the write. The
		// previous bundle proved by mutation that adding correct_option_index
		// to this RPC reaches an anonymous caller while the ROUTE still drops
		// it -- so the route is not the gate and this is asserted at the RPC.
		const { rows: stored } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_role_quiz_questions
			  where role_id = 'safety_officer' and correct_option_index is not null`
		);
		expect(Number(stored[0].n)).toBeGreaterThan(0); // the positive control

		const rows = await readPublic('coin_public_role_questions', { p_role_id: 'safety_officer' });
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual([
				'options',
				'question_id',
				'question_text',
				'sequence',
				'type'
			]);
		}
		expect(JSON.stringify(rows)).not.toContain('correct_option_index');
		expect(JSON.stringify(rows)).not.toContain('correct');

		// And every option a public caller now receives is a string, which is
		// what the constraint makes true rather than what the fixture happens
		// to hold.
		for (const row of rows) {
			if (row.options === null) continue;
			expect(Array.isArray(row.options)).toBe(true);
			for (const option of row.options as unknown[]) expect(typeof option).toBe('string');
		}
	});
});

// ===========================================================================
// The narrowing REFUSES rather than strands work.
// ===========================================================================

describe('0157 counts the rows it would strand and refuses, on its OWN database', () => {
	test('a table already holding a smuggled answer key stops the migration dead', async () => {
		// A narrowing starts saying no to something that may already be stored,
		// and this table is hand-edited in the SQL editor with content that is
		// never committed to this repo -- so nothing readable from here can
		// tell an operator whether 0157 applies to their data. The file counts
		// the real rows itself and raises with the number. THAT PATH NEEDS ITS
		// OWN DATABASE, because the raise rolls the whole file back and would
		// otherwise leave the suite's main fixture un-migrated.
		//
		// It is also the one behaviour no mutant of the main fixture can prove:
		// with no violating row seeded, disabling the guard changes nothing.
		const dirty = await startTestDb(CHAIN_BEFORE);
		try {
			await dirty.sql(
				`insert into public.coin_role_quiz_questions
				   (role_id, type, question_text, sequence, options, correct_option_index)
				 values ('safety_officer', 'mc', 'Which lever is the estop?', 1,
				         '["Left", {"text": "Right", "correct": true}]'::jsonb, 1)`
			);
			await dirty.sql(
				`insert into public.coin_role_quiz_questions
				   (role_id, type, question_text, sequence, options, correct_option_index)
				 values ('quartermaster', 'mc', 'Where do tools go?', 1,
				         '["The crib", "   "]'::jsonb, 0)`
			);
			// A legal row beside them, so the count is a COUNT and not a total.
			await dirty.sql(
				`insert into public.coin_role_quiz_questions
				   (role_id, type, question_text, sequence, options, correct_option_index)
				 values ('lab_tech', 'mc', 'Reset the printer how?', 1,
				         '["Power cycle", "Ask"]'::jsonb, 0)`
			);

			let message = '';
			try {
				await dirty.sql(
					readFileSync(join(REPO_ROOT, 'supabase', 'migrations', MIGRATION), 'utf8')
				);
				throw new Error('0157 applied over rows it should have refused.');
			} catch (error) {
				message = (error as Error).message;
			}
			expect(message).toMatch(/0157 refuses/);
			// THE COUNT IS IN THE MESSAGE, which is the whole reason the block
			// exists rather than letting the ALTER fail with a constraint name.
			expect(message).toContain('2 of 3 rows');

			// AND IT ROLLED BACK WHOLE: no constraint, and the name fallback
			// function was not left behind either.
			const { rows: left } = await dirty.sql<{ n: string }>(
				`select count(*)::text as n from pg_constraint c join pg_class t on t.oid = c.conrelid
				  where t.relname = 'coin_role_quiz_questions'
				    and c.conname = 'coin_role_quiz_questions_options_are_option_strings'`
			);
			expect(left[0].n).toBe('0');
			const { rows: fn } = await dirty.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = '_coin_public_name_fallback'`
			);
			expect(fn[0].n).toBe('0');

			// Clean the two rows the way an operator would, and the same file
			// then applies -- so the refusal is a gate, not a dead end.
			await dirty.sql(
				`delete from public.coin_role_quiz_questions where question_text in
				 ('Which lever is the estop?', 'Where do tools go?')`
			);
			await dirty.sql(
				readFileSync(join(REPO_ROOT, 'supabase', 'migrations', MIGRATION), 'utf8')
			);
			const { rows: now } = await dirty.sql<{ n: string }>(
				`select count(*)::text as n from pg_constraint c join pg_class t on t.oid = c.conrelid
				  where t.relname = 'coin_role_quiz_questions'
				    and c.conname = 'coin_role_quiz_questions_options_are_option_strings'`
			);
			expect(now[0].n).toBe('1');
		} finally {
			await dirty.stop();
		}
	}, 240_000);
});

// ===========================================================================
// The file re-applies.
// ===========================================================================

describe('0157 is re-appliable, which is ordinary rather than exceptional', () => {
	test('pasting it a second time changes nothing and raises nothing', async () => {
		await applyMigration();
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint c join pg_class t on t.oid = c.conrelid
			  where t.relname = 'coin_role_quiz_questions'
			    and c.conname = 'coin_role_quiz_questions_options_are_option_strings'`
		);
		expect(rows[0].n).toBe('1');
		const board = await readPublic('coin_public_contracts');
		expect(board.find((r) => r.title === 'Deburr the plate stock')!.contractors).toBe(GENERIC);
	});
});
