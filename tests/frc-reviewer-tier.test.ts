// tests/frc-reviewer-tier.test.ts
//
// 0167: the FRC REVIEWER tier reaches exactly what it was granted, and
// nothing else.
//
// WHY THIS FILE EXISTS, given that automated tests here are the exception.
// The same two silent directions as the GAUNTLET author tier (0155), plus one
// of its own:
//
//   * TOO NARROW fails visibly: a reviewer presses Approve and is refused.
//   * TOO WIDE FAILS SILENTLY AND FOREVER. The nearest wrong gate is
//     `fsp_frc_interest` -- the FSP prospective-student interest roster, which
//     shares the "frc" name and the old predicate BY ACCIDENT and holds
//     student phone numbers and parent emails. It is explicitly on 0067's
//     list of what the admin narrowing was FOR. If the reviewer tier ever
//     leaks onto it, nothing on any screen changes and family contact data is
//     quietly readable by a population nobody enumerated. That is the single
//     most likely future edit ("make the frc gates consistent"), so it is
//     asserted here from both the behavioural and the catalog side.
//
// MUTATION-PROVEN IN THE PERMISSIVE DIRECTION (recorded in this bundle's
// docs/history entry): re-gating the fsp_frc_interest policy onto
// frc_can_review() reddens the census assertions below, and widening
// frc_can_review() itself to admit any authenticated caller reddens the
// matrix. A policy deleted outright fails closed and proves nothing.
//
// FIVE CALLERS, because the decided population is the unusual half of this
// tier: reviewers are a MIX of @boscotech.edu and @boscotech.net addresses,
// so a .net reviewer is load-bearing (a domain predicate would exclude them)
// and a plain .edu teacher is load-bearing in the other direction (a domain
// or role predicate would admit them).
//
//   admin      the pinned owner. Passes everything, reviewer gates included.
//   reviewer   @boscotech.edu, NOT in app_admins, granted through the real
//              frc_reviewer_grant RPC.
//   reviewerNet @boscotech.net, likewise granted -- the mixed-domain case.
//   teacher    @boscotech.edu, on neither list. role_for_email makes them
//              'teacher', and that must still buy nothing.
//   student    @boscotech.net, on no list. Reaches only their own rows.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';

/**
 * The FRC chain as production stands, with 0167 on top. 0046 is here for the
 * census half (the fsp_frc_interest policy this tier must NOT reach); 0137
 * last-but-one per its own rule, with 0167 after it because 0167 names its
 * own roles in every revoke (a function created after the sweep is not
 * covered by it).
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0039_frc_user_progress.sql',
	'0040_frc_quiz.sql',
	'0041_frc_progress_lockdown.sql',
	'0042_frc_gate_submissions.sql',
	'0046_fsp_frc_interest.sql',
	'0137_anon_execute_sweep.sql',
	'0167_frc_reviewer_tier.sql'
] as const;

type Who = 'admin' | 'reviewer' | 'reviewerNet' | 'teacher' | 'student';
const EVERYONE: readonly Who[] = ['admin', 'reviewer', 'reviewerNet', 'teacher', 'student'];
/** Who each OPEN gate must admit. */
const REVIEWERS: readonly Who[] = ['admin', 'reviewer', 'reviewerNet'];
/** Who each SHUT gate must admit. */
const ADMIN_ONLY: readonly Who[] = ['admin'];

let db: TestDb;
const user = {} as Record<Who, SeededUser>;

/** Runs `fn` as `who` and answers whether the gate ADMITTED them. */
async function admits(who: Who, fn: (q: TestDb['sql']) => Promise<boolean>): Promise<boolean> {
	try {
		return await db.asUser(user[who].id, fn);
	} catch {
		return false;
	}
}

/** Runs one gate for all five callers and returns the set that got in. */
async function matrix(fn: (q: TestDb['sql']) => Promise<boolean>): Promise<Who[]> {
	const got: Who[] = [];
	for (const who of EVERYONE) if (await admits(who, fn)) got.push(who);
	return got;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	user.admin = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	user.reviewer = await createUser(db, 'mentor@boscotech.edu', 'Edu Mentor');
	user.reviewerNet = await createUser(db, 'coach@boscotech.net', 'Net Coach');
	user.teacher = await createUser(db, 'notonthelist@boscotech.edu', 'Plain Teacher');
	user.student = await createUser(db, 'kid@boscotech.net', 'A Student');

	// THE ALLOWLIST IS POPULATED THROUGH THE REAL RPC, not by raw insert: the
	// grant path is itself a gate under test. One .edu and one .net grant,
	// because the mixed population is the reason this is an allowlist at all.
	await db.asUser(user.admin.id, (q) =>
		q(`select public.frc_reviewer_grant($1, $2)`, [user.reviewer.email, 'Granted by the suite.'])
	);
	await db.asUser(user.admin.id, (q) =>
		q(`select public.frc_reviewer_grant($1, $2)`, [
			user.reviewerNet.email,
			'The .net case 0155 would have refused.'
		])
	);

	// The student's work, seeded where a client cannot write (as the owner):
	// a completion and a finalized quiz attempt.
	await db.sql(
		`insert into public.frc_user_progress (user_id, unit_id) values ($1, 'MDM-1')`,
		[user.student.id]
	);
	await db.sql(
		`insert into public.frc_quiz_attempts (user_id, unit_id, status, score, pass_percent, submitted_at, sealed)
		 values ($1, 'MDM-1', 'passed', 90, 90, now(), '[{"c":0,"o":"obj"}]'::jsonb)`,
		[user.student.id]
	);

	// A modeling-gate submission, seeded AS THE STUDENT through RLS -- which
	// doubles as the positive control that 0167 left the student write path
	// alone (own row, status 'submitted' only).
	await db.asUser(user.student.id, (q) =>
		q(
			`insert into public.frc_gate_submissions (user_id, unit_id, link, notes)
			 values ($1, 'MDM-4', 'https://drive.example/pack.zip', 'first solid')`,
			[user.student.id]
		)
	);

	// A prospective-student interest row (family contact data), for the SHUT
	// half. Seeded as the owner; the public form's anon INSERT is 0046's own
	// deliberate surface and not under test here.
	await db.sql(
		`insert into public.fsp_frc_interest (full_name, email, phone)
		 values ('Prospective Kid', 'family@example.com', '555-0100')`
	);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The predicate itself
// ---------------------------------------------------------------------------

describe('frc_can_review() is the tier, and is not is_admin()', () => {
	it('admits the admin and BOTH granted reviewers (.edu and .net), and nobody else', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.frc_can_review() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...REVIEWERS]);
	});

	it('DOES NOT make a reviewer an admin -- the whole point of a separate tier', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.is_admin() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('and is_teacher(), the 0067 shim, still answers the admin check for all five', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.is_teacher() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('is not executable by anon (the 0137 default-privileges trap)', async () => {
		const { rows } = await db.sql<{ anon: boolean }>(
			`select has_function_privilege('anon', 'public.frc_can_review()', 'execute') as anon`
		);
		expect(rows[0].anon).toBe(false);
	});

	it('has exactly one signature each for the two recreated 0041 RPCs (no overload survived)', async () => {
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*)::text as n
			 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
				and p.proname in ('frc_mark_complete', 'frc_unmark_complete')
			 group by p.proname order by p.proname`
		);
		expect(rows).toEqual([
			{ proname: 'frc_mark_complete', n: '1' },
			{ proname: 'frc_unmark_complete', n: '1' }
		]);
	});
});

// ---------------------------------------------------------------------------
// OPEN: the six re-gated sites
// ---------------------------------------------------------------------------

describe('what the reviewer tier reaches', () => {
	it("reads another student's progress rows (0039 select policy)", async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(
				`select unit_id from public.frc_user_progress where user_id = $1`,
				[user.student.id]
			);
			return rows.length > 0;
		});
		// The student reads their own row through the own-row policy, so they
		// appear too -- assert that explicitly rather than letting it hide.
		expect(got).toEqual(['admin', 'reviewer', 'reviewerNet', 'student']);
	});

	it("reads another student's quiz attempt log (0040 select policy)", async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(
				`select status, score from public.frc_quiz_attempts where user_id = $1`,
				[user.student.id]
			);
			return rows.length > 0;
		});
		expect(got).toEqual(['admin', 'reviewer', 'reviewerNet', 'student']);
	});

	it('but NOBODY reads the sealed answer key -- 0167 widened rows, never columns', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(`select sealed from public.frc_quiz_attempts limit 1`);
			return rows.length > 0;
		});
		expect(got).toEqual([]);
	});

	it('marks a completion (frc_mark_complete), and the row genuinely lands', async () => {
		const admitted: Who[] = [];
		for (const who of EVERYONE) {
			// A unit id per caller, so one caller's idempotent success can never
			// mask another's refusal.
			const unitId = `mark-test-${who.toLowerCase()}`;
			const ok = await admits(who, async (q) => {
				const { rows } = await q<{ v: { error?: string } }>(
					`select public.frc_mark_complete($1, $2) as v`,
					[user.student.id, unitId]
				);
				return !rows[0].v?.error;
			});
			if (ok) admitted.push(who);
			const { rows } = await db.sql(
				`select unit_id from public.frc_user_progress where user_id = $1 and unit_id = $2`,
				[user.student.id, unitId]
			);
			// The gate's answer and the EFFECT agree: a refusal wrote nothing.
			expect(rows.length, `${who} row effect`).toBe(ok ? 1 : 0);
		}
		expect(admitted).toEqual([...REVIEWERS]);
	});

	it('unmarks a completion (frc_unmark_complete)', async () => {
		const admitted: Who[] = [];
		for (const who of EVERYONE) {
			const unitId = `unmark-test-${who.toLowerCase()}`;
			await db.sql(`insert into public.frc_user_progress (user_id, unit_id) values ($1, $2)`, [
				user.student.id,
				unitId
			]);
			const ok = await admits(who, async (q) => {
				const { rows } = await q<{ v: { error?: string } }>(
					`select public.frc_unmark_complete($1, $2) as v`,
					[user.student.id, unitId]
				);
				return !rows[0].v?.error;
			});
			if (ok) admitted.push(who);
			const { rows } = await db.sql(
				`select unit_id from public.frc_user_progress where user_id = $1 and unit_id = $2`,
				[user.student.id, unitId]
			);
			expect(rows.length, `${who} row effect`).toBe(ok ? 0 : 1);
		}
		expect(admitted).toEqual([...REVIEWERS]);
	});

	it("reads another student's gate submission (0042 select policy)", async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(
				`select unit_id from public.frc_gate_submissions where user_id = $1`,
				[user.student.id]
			);
			return rows.length > 0;
		});
		expect(got).toEqual(['admin', 'reviewer', 'reviewerNet', 'student']);
	});

	it('approves a submission (0042 update policy), and a student can never self-approve', async () => {
		const admitted: Who[] = [];
		for (const who of EVERYONE) {
			// A fresh submitted row per caller (separate unit), seeded as the owner
			// so the fixture is independent of any caller's earlier success.
			const unitId = `MDM-approve-${who.toLowerCase()}`;
			await db.sql(
				`insert into public.frc_gate_submissions (user_id, unit_id, link) values ($1, $2, 'https://x')`,
				[user.student.id, unitId]
			);
			const ok = await admits(who, async (q) => {
				const { rows } = await q(
					`update public.frc_gate_submissions
					 set status = 'approved', reviewer_feedback = 'nice', reviewed_at = now()
					 where user_id = $1 and unit_id = $2
					 returning unit_id`,
					[user.student.id, unitId]
				);
				return rows.length === 1;
			});
			if (ok) admitted.push(who);
			const { rows } = await db.sql<{ status: string }>(
				`select status from public.frc_gate_submissions where user_id = $1 and unit_id = $2`,
				[user.student.id, unitId]
			);
			expect(rows[0].status, `${who} effect`).toBe(ok ? 'approved' : 'submitted');
		}
		// The student is ABSENT even on their own row: the own-row update policy's
		// WITH CHECK only ever lets them write status='submitted'.
		expect(admitted).toEqual([...REVIEWERS]);
	});

	it('reads the review queue WITH the submitter identity (frc_review_queue)', async () => {
		const perCaller: Record<string, number> = {};
		for (const who of EVERYONE) {
			const rows = await db.asUser(user[who].id, async (q) => {
				const { rows: r } = await q<{
					unit_id: string;
					student_name: string | null;
					student_email: string | null;
				}>(`select unit_id, student_name, student_email from public.frc_review_queue()`);
				return r;
			});
			perCaller[who] = rows.length;
			if (REVIEWERS.includes(who)) {
				// The seeded MDM-4 submission is in there, carrying the student's
				// real name and email from the definer projection.
				const seeded = rows.find((r) => r.unit_id === 'MDM-4');
				expect(seeded?.student_name, `${who} name`).toBe('A Student');
				expect(seeded?.student_email, `${who} email`).toBe(user.student.email);
			}
		}
		// A non-reviewer gets an EMPTY SET, never an error -- the same answer an
		// empty queue gives, so the surface cannot be probed.
		expect(perCaller.teacher).toBe(0);
		expect(perCaller.student).toBe(0);
		// POSITIVE CONTROL: the reviewers' non-zero counts above are real reads.
		expect(perCaller.admin).toBeGreaterThan(0);
		expect(perCaller.reviewer).toBeGreaterThan(0);
		expect(perCaller.reviewerNet).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// SHUT: the gates the tier must NOT have widened. This half is the one whose
// failure is invisible.
// ---------------------------------------------------------------------------

describe('what the reviewer tier must NOT reach', () => {
	it('does NOT read the FSP interest roster (family contact data, the accidental namesake)', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(`select full_name, phone from public.fsp_frc_interest`);
			return rows.length > 0;
		});
		expect(got).toEqual([...ADMIN_ONLY]);
	});

	it('and the fsp_frc_interest POLICY still reads is_teacher(), not the new predicate', async () => {
		const { rows } = await db.sql<{ widened: boolean; teacher: boolean }>(
			`select pg_get_expr(pol.polqual, pol.polrelid) like '%frc_can_review%' as widened,
				pg_get_expr(pol.polqual, pol.polrelid) like '%is_teacher%' as teacher
			 from pg_policy pol
			 where pol.polname = 'teachers read frc interest'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].widened).toBe(false);
		// POSITIVE CONTROL: the expression genuinely contains the OLD predicate,
		// so `widened === false` is a real read and not an empty match.
		expect(rows[0].teacher).toBe(true);
		// And the same instrument finds the new predicate where it WAS applied.
		const { rows: open } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policy pol
			 where pol.polname in ('frc progress select teacher', 'frc quiz select teacher',
				'frc gate select teacher', 'frc gate update teacher')
				and pg_get_expr(pol.polqual, pol.polrelid) like '%frc_can_review%'`
		);
		expect(open[0].n).toBe('4');
	});

	it('cannot write frc_user_progress directly -- 0041 closed that and 0167 left it closed', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(
				`insert into public.frc_user_progress (user_id, unit_id)
				 values ($1, 'direct-write') returning unit_id`,
				[user.student.id]
			);
			return rows.length === 1;
		});
		// Not even the admin: there is no client grant at all, only the RPCs.
		expect(got).toEqual([]);
	});

	it('and the two 0039 write policies 0041 dropped were NOT resurrected', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policy pol
			 where pol.polname in ('frc progress insert', 'frc progress delete')`
		);
		expect(rows[0].n).toBe('0');
		// POSITIVE CONTROL: the same catalog read finds the policies that DO exist
		// on that table (the two selects), so the zero is not a broken query.
		const { rows: live } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policy pol join pg_class c on c.oid = pol.polrelid
			 where c.relname = 'frc_user_progress'`
		);
		expect(live[0].n).toBe('2');
	});

	it('the student quiz path is untouched: no reviewer predicate in frc_quiz_start/grade', async () => {
		const { rows } = await db.sql<{ proname: string; widened: boolean }>(
			`select p.proname, p.prosrc like '%frc_can_review%' as widened
			 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname in ('frc_quiz_start', 'frc_quiz_grade')
			 order by p.proname`
		);
		expect(rows.map((r) => r.proname)).toEqual(['frc_quiz_grade', 'frc_quiz_start']);
		expect(rows.every((r) => r.widened === false)).toBe(true);
		// POSITIVE CONTROL: the identical instrument answers true for the two
		// functions 0167 DID re-gate.
		const { rows: open } = await db.sql<{ n: string }>(
			`select count(*)::text as n
			 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
				and p.proname in ('frc_mark_complete', 'frc_unmark_complete')
				and p.prosrc like '%frc_can_review%'`
		);
		expect(open[0].n).toBe('2');
	});

	it('and a student still starts their own quiz (the untouched path actually works)', async () => {
		const attemptId = await db.asUser(user.student.id, async (q) => {
			const { rows } = await q<{ v: { attempt_id?: string } }>(
				`select public.frc_quiz_start('MDM-9', '[{"c":1,"o":"obj"}]'::jsonb, 90) as v`
			);
			return rows[0].v?.attempt_id ?? null;
		});
		expect(attemptId).toBeTruthy();
	});

	it('does not read the admin roster, nor the REVIEWER roster (staff emails)', async () => {
		for (const table of ['app_admins', 'frc_reviewers']) {
			const got = await matrix(async (q) => {
				const { rows } = await q(`select email from public.${table}`);
				return rows.length > 0;
			});
			expect(got, `table ${table}`).toEqual([...ADMIN_ONLY]);
		}
	});

	it('does not grant or revoke reviewing -- the tier does not propagate', async () => {
		const granted = await matrix(async (q) => {
			await q(`select public.frc_reviewer_grant($1)`, ['someone.else@boscotech.edu']);
			return true;
		});
		expect(granted).toEqual([...ADMIN_ONLY]);
		const revoked = await matrix(async (q) => {
			await q(`select public.frc_reviewer_revoke($1)`, ['someone.else@boscotech.edu']);
			return true;
		});
		expect(revoked).toEqual([...ADMIN_ONLY]);
	});

	it('has no client write path to the roster table itself', async () => {
		const got = await matrix(async (q) => {
			const { rows } = await q(
				`insert into public.frc_reviewers (email) values ($1) returning email`,
				[`self.${Math.random().toString(36).slice(2)}@boscotech.edu`]
			);
			return rows.length === 1;
		});
		expect(got).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// The roster's own rules
// ---------------------------------------------------------------------------

describe('the allowlist admits both school domains and nothing outside them', () => {
	it('refuses an outside address', async () => {
		await expect(
			db.asUser(user.admin.id, (q) =>
				q(`select public.frc_reviewer_grant($1)`, ['someone@gmail.com'])
			)
		).rejects.toThrow(/boscotech/);
	});

	it('normalizes the address, so one person cannot hold two rows', async () => {
		await db.asUser(user.admin.id, (q) =>
			q(`select public.frc_reviewer_grant($1)`, ['  MiXeD@BoscoTech.net '])
		);
		const { rows } = await db.sql<{ email: string; n: string }>(
			`select email, count(*)::text as n from public.frc_reviewers
			 where email like 'mixed%' group by email`
		);
		expect(rows).toEqual([{ email: 'mixed@boscotech.net', n: '1' }]);
	});

	it('revoking removes the tier, and leaves an admin untouched', async () => {
		await db.asUser(user.admin.id, (q) =>
			q(`select public.frc_reviewer_revoke($1)`, [user.reviewer.email])
		);
		const after = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.frc_can_review() as ok`);
			return rows[0].ok === true;
		});
		expect(after).toEqual(['admin', 'reviewerNet']);
		// Put it back so file order cannot matter to anything added later.
		await db.asUser(user.admin.id, (q) =>
			q(`select public.frc_reviewer_grant($1)`, [user.reviewer.email])
		);
	});
});

// ---------------------------------------------------------------------------
// Re-applying the file
// ---------------------------------------------------------------------------

describe('0167 re-applies', () => {
	it('pastes cleanly a second time over a database that already has it', async () => {
		const sql = readFileSync(
			join(process.cwd(), 'supabase/migrations/0167_frc_reviewer_tier.sql'),
			'utf8'
		);
		await expect(db.sql(sql)).resolves.toBeDefined();
		// And the world is unchanged: the tier still admits exactly the three.
		const got = await matrix(async (q) => {
			const { rows } = await q<{ ok: boolean }>(`select public.frc_can_review() as ok`);
			return rows[0].ok === true;
		});
		expect(got).toEqual([...REVIEWERS]);
	});
});
