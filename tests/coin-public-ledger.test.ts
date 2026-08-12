// tests/coin-public-ledger.test.ts
//
// Migration 0089's PUBLIC read layer, against a real Postgres with the real
// migrations applied (see tests/db/harness.ts).
//
// DELIBERATELY NARROW, the notebook-security / coin-contracts convention: this
// suite exists for the guarantees that would regress SILENTLY. Almost all of
// them are one guarantee:
//
//   THE IDEA COIN LEDGER IS A PUBLIC PAGE OVER AN EMAIL-KEYED SCHEMA.
//
// If an address ever leaks into a public payload, nothing breaks, nothing
// looks wrong, no test that renders the page fails, and the leaderboard keeps
// working perfectly — right up until somebody opens the network tab and finds
// a school directory. So the headline assertion here does not spot-check a
// field: it serializes EVERY row of EVERY public RPC, under every parameter
// the surface accepts, and asserts the text contains no address at all.
//
// The rest:
//   * anon can execute the read RPCs and can reach NOTHING else.
//   * The drawer never emits the Eating Pass strike count (the documented
//     disclosure boundary — held/not-held is public, the count is not).
//   * coin_role_self_apply applies as the CALLER and nobody else, refuses a
//     non-student and a student with no roster section, refuses a duplicate
//     held role, and snapshots MC correctness at submission.
//   * A role with zero questions is a SUCCESS path, not an error (0076's
//     content-ownership rule: real quiz text is hand-maintained and never
//     committed here, so "no questions yet" is the normal state).
//   * The tier-aware weekly wage the leaderboard reports agrees with what
//     0087's coin_log_transaction actually pays.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * 0089's own chain. Deliberately its own list rather than an edit to the
 * shared MIGRATIONS constant, so extending the fixture for this feature can
 * never change what an existing suite applies.
 */
const CHAIN = [
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
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql'
] as const;

let db: TestDb;
let owner: SeededUser; // the pinned admin
let studentA: SeededUser;
let studentB: SeededUser;
let outsider: SeededUser; // signed in, student, but on no roster
let teacher: SeededUser;

const SECTION = 'eng1h-sophomore';

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'other.teacher@boscotech.edu', 'Other Teacher');
	studentA = await createUser(db, 'ada.lovelace@boscotech.net', 'Ada Lovelace');
	studentB = await createUser(db, 'grace.hopper@boscotech.net', 'Grace Hopper');
	outsider = await createUser(db, 'no.roster@boscotech.net', 'No Roster');

	// A coin section with both students on its roster.
	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			SECTION,
			'Engineering I Honors — Sophomore',
			'#00FF41',
			null,
			true
		]);
		await q(`select public.coin_admin_assign_section_students($1, $2::text[])`, [
			SECTION,
			[studentA.email, studentB.email]
		]);
	});

	// A student who has never signed in but has a balance: the "attach a
	// balance to an email independent of login status" case the whole schema
	// is built around, and one of the two most likely to expose an address.
	await db.sql(
		`insert into public.coin_students (student_email, display_name, legacy_section, source)
		 values ('walkup.student@boscotech.net', 'Walkup, Student', 'IDEA-113', 'legacy-import:test')`
	);

	// The OTHER one, and the reason it is here rather than being assumed
	// covered: an email with a real balance but NO profile row and NO
	// coin_students row, so identity resolution falls all the way through to
	// the last branch. Without this row every student in the fixture is named
	// by an earlier branch, and the "no address in the payload" assertions
	// pass without ever exercising the fallback -- verified by mutating that
	// branch to return the whole address and watching the suite stay green.
	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_adjust_balance($1, 15, 'orphan opening balance')`, [
			'orphan.only@boscotech.net'
		]);
	});

	// Real ledger activity across all four kinds.
	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_log_transaction($1, 'weekly_wage', null, null, null)`, [studentA.email]);
		await q(`select public.coin_log_transaction($1, 'disruptive_behavior', null, null, null)`, [studentA.email]);
		await q(`select public.coin_log_transaction($1, 'weekly_wage', null, null, null)`, [studentB.email]);
		await q(`select public.coin_admin_adjust_balance($1, 200, 'opening balance')`, [
			'walkup.student@boscotech.net'
		]);
	});

	// A contract with a claim on it, so the contracts payload has a real
	// claimant to name.
	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Rebuild the shop cart',
			'Needs two people.',
			20,
			2,
			null
		]);
	});
	const contractId = (
		await db.sql<{ id: string }>(`select id from public.coin_contracts limit 1`)
	).rows[0].id;
	await db.asUser(studentA.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractId]);
	});

	// Real quiz questions on ONE role. shop_steward keeps zero, deliberately,
	// so the "no questions configured" path is exercised as a real state.
	await db.sql(
		`insert into public.coin_role_quiz_questions (role_id, type, question_text, sequence, options, correct_option_index)
		 values ('safety_officer', 'mc', 'Where is the shop eyewash station?', 1,
		         '["By the door", "Behind the mill", "There isn''t one"]'::jsonb, 0)`
	);
	await db.sql(
		`insert into public.coin_role_quiz_questions (role_id, type, question_text, sequence)
		 values ('safety_officer', 'written', 'Describe a time you stopped unsafe work.', 2)`
	);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/** Every public read, under every parameter the surface accepts. */
async function everyPublicPayload(q: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>) {
	const studentIds = (
		await q(`select student_id from public.coin_public_leaderboard()`)
	).rows as { student_id: string }[];

	const payloads: Record<string, unknown> = {
		leaderboard: (await q(`select * from public.coin_public_leaderboard()`)).rows,
		transactions: (await q(`select * from public.coin_public_transactions(5000)`)).rows,
		reasons: (await q(`select * from public.coin_public_reasons()`)).rows,
		contracts: (await q(`select * from public.coin_public_contracts()`)).rows,
		roles: (await q(`select * from public.coin_public_roles()`)).rows,
		sections: (await q(`select * from public.coin_public_sections()`)).rows,
		questionsSafety: (await q(`select * from public.coin_public_role_questions('safety_officer')`)).rows,
		questionsSteward: (await q(`select * from public.coin_public_role_questions('shop_steward')`)).rows
	};

	// Every student, not a sample: the drawer is the one addressable read and
	// a leak there would be per-student.
	payloads.students = [];
	for (const { student_id } of studentIds) {
		const { rows } = await q(`select public.coin_public_student($1) as d`, [student_id]);
		(payloads.students as unknown[]).push((rows[0] as { d: unknown }).d);
	}
	// And the not-found path, plus a hostile id.
	payloads.unknownStudent = (
		await q(`select public.coin_public_student($1) as d`, ['not-a-real-id'])
	).rows;
	payloads.emailAsStudentId = (
		await q(`select public.coin_public_student($1) as d`, [studentA.email])
	).rows;

	return payloads;
}

describe('no public payload contains an email address', () => {
	test('anon: every read, every row, every parameter', async () => {
		const payloads = await db.asAnon((q) => everyPublicPayload(q));
		const text = JSON.stringify(payloads);

		// Sanity first: if the payloads were empty this assertion would pass
		// vacuously, which is exactly how a leak test rots.
		// Four students on the board: the two on the roster, the walk-up
		// named by coin_students, and the orphan email named by nothing at
		// all -- which is the branch that has to be exercised for these
		// assertions to mean anything.
		expect((payloads.leaderboard as unknown[]).length).toBe(4);
		expect((payloads.transactions as unknown[]).length).toBeGreaterThan(2);
		expect((payloads.contracts as unknown[]).length).toBeGreaterThan(0);
		expect((payloads.students as unknown[]).length).toBe(4);

		// No address in any form: neither a full one nor a bare domain.
		expect(text).not.toMatch(/@boscotech/i);
		expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

		// And the names ARE there, so the absence above is a projection and
		// not an empty result set.
		expect(text).toContain('Ada Lovelace');
		expect(text).toContain('Walkup, Student');
		// The orphan is named by the local part alone, with the domain gone.
		expect(text).toContain('orphan.only');
	});

	test('signed in as a student: same reads, still no address', async () => {
		const payloads = await db.asUser(studentA.id, (q) => everyPublicPayload(q));
		expect(JSON.stringify(payloads)).not.toMatch(/@boscotech/i);
	});

	test('the opaque id is stable, opaque, and not an email in disguise', async () => {
		const first = await db.asAnon(async (q) => {
			const { rows } = await q<{ student_id: string; name: string }>(
				`select student_id, name from public.coin_public_leaderboard() where name = 'Ada Lovelace'`
			);
			return rows[0];
		});
		const second = await db.asAnon(async (q) => {
			const { rows } = await q<{ student_id: string }>(
				`select student_id from public.coin_public_leaderboard() where name = 'Ada Lovelace'`
			);
			return rows[0];
		});
		expect(first.student_id).toBe(second.student_id);
		expect(first.student_id).toMatch(/^[0-9a-f]{32}$/);
		// It cannot be the email, nor a trivial encoding of one.
		expect(first.student_id).not.toContain('ada');
		expect(Buffer.from(first.student_id, 'hex').toString('utf8')).not.toContain('@');
	});

	test('the id salt is unreadable by anon, authenticated, and an admin', async () => {
		for (const run of [
			() => db.asAnon((q) => q(`select * from public.coin_public_id_secret`)),
			() => db.asUser(studentA.id, (q) => q(`select * from public.coin_public_id_secret`)),
			() => db.asUser(owner.id, (q) => q(`select * from public.coin_public_id_secret`))
		]) {
			const err = await captureError(run);
			expect(err.code).toBe('42501');
		}
	});
});

describe('the anon boundary', () => {
	test('anon may execute exactly the public reads', async () => {
		const readable = [
			'coin_public_leaderboard()',
			'coin_public_transactions(integer)',
			'coin_public_student(text)',
			'coin_public_reasons()',
			'coin_public_contracts()',
			'coin_public_roles()',
			'coin_public_role_questions(text)',
			'coin_public_sections()'
		];
		for (const sig of readable) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', 'public.${sig}', 'execute') as ok`
			);
			expect(rows[0].ok, sig).toBe(true);
		}
	});

	test('anon may NOT execute any write or admin function', async () => {
		const forbidden = [
			'coin_role_self_apply(text, jsonb)',
			'coin_contract_self_claim(uuid)',
			'coin_me()',
			'coin_my_contract_claims()',
			'coin_admin_lookup(text)',
			'coin_admin_adjust_balance(text, integer, text)',
			'coin_log_transaction(text, text, integer, numeric, text)',
			'coin_admin_list_contracts()',
			'coin_role_apply(text, text, jsonb)'
		];
		for (const sig of forbidden) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', 'public.${sig}', 'execute') as ok`
			);
			expect(rows[0].ok, sig).toBe(false);
		}
	});

	test('anon may not read any email-keyed table directly', async () => {
		for (const table of [
			'coin_transactions',
			'coin_students',
			'coin_wage_tiers',
			'coin_section_students',
			'coin_contract_claims',
			'coin_role_holders',
			'profiles'
		]) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_table_privilege('anon', 'public.${table}', 'select') as ok`
			);
			expect(rows[0].ok, table).toBe(false);
		}
	});

	test('the internal roster helper is not reachable by anyone', async () => {
		for (const role of ['anon', 'authenticated']) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege($1, 'public._coin_public_roster()', 'execute') as ok`,
				[role]
			);
			expect(rows[0].ok, role).toBe(false);
		}
	});
});

describe('the drawer disclosure boundary', () => {
	test('a held Eating Pass is public; the strike count never is', async () => {
		// Buy a pass, then take one strike, so both facts genuinely exist.
		await db.asUser(owner.id, async (q) => {
			await q(`select public.coin_admin_adjust_balance($1, 400, 'seed for pass')`, [studentB.email]);
			await q(`select public.coin_log_transaction($1, 'eating_pass', null, null, null)`, [studentB.email]);
			await q(`select public.coin_log_transaction($1, 'eating_violation', null, null, null)`, [studentB.email]);
		});

		// The strike is real: the admin-side derivation sees it.
		const strikes = (
			await db.sql<{ n: number }>(`select public.coin_eating_pass_strikes($1) as n`, [studentB.email])
		).rows[0].n;
		expect(Number(strikes)).toBe(1);

		const detail = await db.asAnon(async (q) => {
			const { rows } = await q<{ id: string }>(
				`select student_id as id from public.coin_public_leaderboard() where name = 'Grace Hopper'`
			);
			const { rows: d } = await q<{ d: Record<string, unknown> }>(
				`select public.coin_public_student($1) as d`,
				[rows[0].id]
			);
			return d[0].d;
		});

		expect(detail.eating_pass_held).toBe(true);
		// The whole point: the count is absent, and no key anywhere in the
		// payload carries it under another name.
		expect(Object.keys(detail)).not.toContain('eating_pass_strikes');
		expect(JSON.stringify(detail)).not.toMatch(/strike/i);
	});

	test('an unknown id is a structured miss, not an error or a probe oracle', async () => {
		const miss = await db.asAnon(async (q) => {
			const { rows } = await q<{ d: Record<string, unknown> }>(
				`select public.coin_public_student($1) as d`,
				['ffffffffffffffffffffffffffffffff']
			);
			return rows[0].d;
		});
		expect(miss.ok).toBe(false);
		expect(miss.reason).toBe('unknown_student');
	});
});

describe('tier-aware weekly wage', () => {
	test('the leaderboard reports the same rate 0087 actually pays', async () => {
		// Take studentA to tier 3 through the real Pay Raise path.
		await db.asUser(owner.id, async (q) => {
			await q(`select public.coin_admin_adjust_balance($1, 500, 'seed for raises')`, [studentA.email]);
			await q(`select public.coin_log_pay_raise($1, null)`, [studentA.email]);
			await q(`select public.coin_log_pay_raise($1, null)`, [studentA.email]);
		});

		const row = await db.asAnon(async (q) => {
			const { rows } = await q<{ weekly_wage: number; wage_tier: number }>(
				`select weekly_wage, wage_tier from public.coin_public_leaderboard() where name = 'Ada Lovelace'`
			);
			return rows[0];
		});
		expect(Number(row.wage_tier)).toBe(3);

		// What a real Weekly Wage log pays this student, from the RPC itself —
		// not a number computed here.
		const paid = await db.asUser(owner.id, async (q) => {
			const { rows } = await q<{ r: { amount: number; wage_tier: number } }>(
				`select public.coin_log_transaction($1, 'weekly_wage', null, null, null) as r`,
				[studentA.email]
			);
			return rows[0].r;
		});
		expect(Number(row.weekly_wage)).toBe(Math.abs(Number(paid.amount)));
		expect(Number(paid.wage_tier)).toBe(3);
	});
});

describe('coin_role_self_apply', () => {
	test('applies as the CALLER — there is no parameter for anyone else', async () => {
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_identity_arguments(p.oid) as args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'coin_role_self_apply'`
		);
		expect(rows).toHaveLength(1);
		// A role id and the answers. Nothing that could name another student,
		// which is what makes "you can only apply as yourself" a property of
		// the signature rather than a check that could be got wrong.
		expect(rows[0].args).toBe('p_role_id text, p_answers jsonb');
		expect(rows[0].args).not.toMatch(/email|student/i);
	});

	test('a student on a roster applies, and MC correctness is snapshotted', async () => {
		const questions = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ question_id: string; type: string }>(
				`select question_id, type from public.coin_public_role_questions('safety_officer') order by sequence`
			);
			return rows;
		});
		expect(questions).toHaveLength(2);

		const result = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; application_id?: string } }>(
				`select public.coin_role_self_apply('safety_officer', $1::jsonb) as r`,
				[
					JSON.stringify([
						{ question_id: questions[0].question_id, selected_option_index: 0 },
						{ question_id: questions[1].question_id, written_answer: 'I stopped a cut once.' }
					])
				]
			);
			return rows[0].r;
		});
		expect(result.ok).toBe(true);

		const answers = (
			await db.sql<{ question_type: string; is_correct: boolean | null; correct_option_index: number | null }>(
				`select question_type, is_correct, correct_option_index
				 from public.coin_role_application_answers where application_id = $1 order by sequence`,
				[result.application_id]
			)
		).rows;
		expect(answers).toHaveLength(2);
		expect(answers[0].is_correct).toBe(true);
		expect(answers[0].correct_option_index).toBe(0);
		expect(answers[1].question_type).toBe('written');

		// Filed under the caller, never under a supplied name.
		const app = (
			await db.sql<{ student_email: string; submitted_by: string; section_id: string }>(
				`select student_email, submitted_by, section_id from public.coin_role_applications where id = $1`,
				[result.application_id]
			)
		).rows[0];
		expect(app.student_email).toBe(studentA.email);
		expect(app.submitted_by).toBe(studentA.email);
		expect(app.section_id).toBe(SECTION);
	});

	test('a wrong MC option snapshots as incorrect', async () => {
		const questions = await db.asUser(studentB.id, async (q) => {
			const { rows } = await q<{ question_id: string }>(
				`select question_id from public.coin_public_role_questions('safety_officer') order by sequence`
			);
			return rows;
		});
		const result = await db.asUser(studentB.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; application_id?: string } }>(
				`select public.coin_role_self_apply('safety_officer', $1::jsonb) as r`,
				[
					JSON.stringify([
						{ question_id: questions[0].question_id, selected_option_index: 2 },
						{ question_id: questions[1].question_id, written_answer: 'Not really.' }
					])
				]
			);
			return rows[0].r;
		});
		expect(result.ok).toBe(true);
		const { rows } = await db.sql<{ is_correct: boolean }>(
			`select is_correct from public.coin_role_application_answers
			 where application_id = $1 and question_type = 'mc'`,
			[result.application_id]
		);
		expect(rows[0].is_correct).toBe(false);
	});

	test('a role with NO configured questions is a success path, not an error', async () => {
		const none = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from public.coin_public_role_questions('shop_steward')`
			);
			return rows[0].n;
		});
		expect(none).toBe('0');

		const result = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean } }>(
				`select public.coin_role_self_apply('shop_steward', '[]'::jsonb) as r`
			);
			return rows[0].r;
		});
		expect(result.ok).toBe(true);
	});

	test('refuses a non-student, a student with no roster section, and a held role', async () => {
		const asTeacher = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; reason: string } }>(
				`select public.coin_role_self_apply('shop_steward', '[]'::jsonb) as r`
			);
			return rows[0].r;
		});
		expect(asTeacher).toEqual({ ok: false, reason: 'not_a_student' });

		const asOutsider = await db.asUser(outsider.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; reason: string } }>(
				`select public.coin_role_self_apply('shop_steward', '[]'::jsonb) as r`
			);
			return rows[0].r;
		});
		expect(asOutsider).toEqual({ ok: false, reason: 'no_section' });

		const unknown = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; reason: string } }>(
				`select public.coin_role_self_apply('not_a_role', '[]'::jsonb) as r`
			);
			return rows[0].r;
		});
		expect(unknown).toEqual({ ok: false, reason: 'unknown_role' });

		// Grant a role for real, then re-apply for it. Quartermaster, not
		// Shop Steward: Shop Steward's ratio is per_students (3 per 25), so a
		// 2-student section has a capacity of ZERO and the approval would be
		// refused on capacity before "already holds it" could ever be reached
		// -- which would make this test pass for the wrong reason.
		const applied = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; application_id: string } }>(
				`select public.coin_role_self_apply('quartermaster', '[]'::jsonb) as r`
			);
			return rows[0].r;
		});
		expect(applied.ok).toBe(true);

		const review = await db.asUser(owner.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; reason?: string } }>(
				`select public.coin_role_admin_review($1, 'approve', null, null) as r`,
				[applied.application_id]
			);
			return rows[0].r;
		});
		expect(review.ok, JSON.stringify(review)).toBe(true);

		const dup = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ r: { ok: boolean; reason: string } }>(
				`select public.coin_role_self_apply('quartermaster', '[]'::jsonb) as r`
			);
			return rows[0].r;
		});
		expect(dup).toEqual({ ok: false, reason: 'already_holds_role' });
	});

	test('there is no client write path onto the applications tables', async () => {
		for (const table of ['coin_role_applications', 'coin_role_application_answers']) {
			for (const verb of ['insert', 'update', 'delete']) {
				const { rows } = await db.sql<{ ok: boolean }>(
					`select has_table_privilege('authenticated', 'public.${table}', '${verb}') as ok`
				);
				expect(rows[0].ok, `${table}.${verb}`).toBe(false);
			}
		}
	});
});

describe('coin_me', () => {
	test('names the caller and carries no address', async () => {
		const me = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ r: Record<string, unknown> }>(`select public.coin_me() as r`);
			return rows[0].r;
		});
		expect(me.signed_in).toBe(true);
		expect(me.is_student).toBe(true);
		expect(me.name).toBe('Ada Lovelace');
		expect(JSON.stringify(me)).not.toMatch(/@boscotech/i);
	});

	test('a teacher is signed in but not a student', async () => {
		const me = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ r: Record<string, unknown> }>(`select public.coin_me() as r`);
			return rows[0].r;
		});
		expect(me.signed_in).toBe(true);
		expect(me.is_student).toBe(false);
	});
});
