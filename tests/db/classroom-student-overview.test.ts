// tests/db/classroom-student-overview.test.ts
//
// 0233 PART student-overview: `classroom_student_overview(section, email)`, the
// one new read behind the per-student page. What would fail SILENTLY, which is
// why each is a test rather than something a browser pass would catch:
//
//   1. THE GATE. A teacher of ANOTHER section, the student themselves, an
//      address with no enrollment, and the teacher's own enrollment row all
//      answer NULL, identically, beside a manager and an admin who are answered.
//   2. SCOPE AND ATTRIBUTION. Hall passes, song counts and opened items are this
//      student's and this section's only. A classmate's passes in the same
//      section and the student's own passes in another section are absent, and
//      the classmate's own overview carrying THEIR pass is the positive control
//      that the absence is the filter and not an empty table.
//   3. THE COIN PROJECTION. The balance agrees with the ledger, and the two
//      columns the public Ledger never shows (the note, who logged it) are not
//      in the payload at all.
//   4. THE GRANTS. anon cannot execute it, authenticated can, exactly one
//      overload exists, and the part re-applies as a no-op.
//
// EVERYTHING IS SEEDED BEFORE 0233 IS APPLIED, through the real pre-0233 RPCs
// (the hall pass open/close paths, the song request, the item view stamp and
// the admin coin log), over the whole tree short of 0233 read off disk -- the
// database production holds before the apply.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import { PRE_0233, PRE_0233_COUNT, SQL_0233, part0233, pasteTrap } from './chain-0233';

const ADMIN = 'apina@boscotech.edu';
const T_EMAIL = 'vargas@boscotech.edu';
const U_EMAIL = 'okafor@boscotech.edu';
const S_EMAIL = 'ana.reyes@boscotech.net';
const P_EMAIL = 'ben.cho@boscotech.net';
const NEVER = 'nobody.here@boscotech.net';
const COIN_NOTE = 'private note about the fine';

let db: TestDb;
let admin: SeededUser;
let teacherT: SeededUser;
let teacherU: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let sectionA: string;
let sectionB: string;
let itemA: string;
let itemB: string;

type Overview = Record<string, unknown> & {
	student_email: string;
	display_name: string;
	active: boolean;
	has_account: boolean;
	user_id: string | null;
	hall_passes: { total: number; entries: { pass_id: string; student_email: string; student_name: string; opened_by: string | null }[]; limits: Record<string, number> };
	item_views: { item_id: string; viewed_at: string }[];
	songs: { requested: number; approved: number; rejected: number; pending: number };
	coins: {
		balance: number;
		physical_balance: number;
		digital_balance: number;
		total: number;
		transactions: Record<string, unknown>[];
	};
	presence_limits: Record<string, number>;
};

async function rpc<T>(user: SeededUser, sql: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${sql} as result`, params);
		return rows[0].result;
	});
}

async function overview(user: SeededUser, sectionId: string, email: string): Promise<Overview | null> {
	return rpc<Overview | null>(user, 'public.classroom_student_overview($1::uuid, $2::text)', [sectionId, email]);
}

async function passFor(teacher: SeededUser, sectionId: string, email: string): Promise<void> {
	const opened = await rpc<{ ok: boolean; pass_id: string }>(
		teacher,
		'public.classroom_hall_pass_open_for($1::uuid, $2::text)',
		[sectionId, email]
	);
	expect(opened.ok, `open_for ${email}`).toBe(true);
	const closed = await rpc<{ ok: boolean }>(teacher, 'public.classroom_hall_pass_close_by_id($1::uuid)', [opened.pass_id]);
	expect(closed.ok).toBe(true);
}

beforeAll(async () => {
	db = await startTestDb(PRE_0233);

	admin = await createUser(db, ADMIN, 'A Pina');
	teacherT = await createUser(db, T_EMAIL, 'T Vargas');
	teacherU = await createUser(db, U_EMAIL, 'U Okafor');
	ana = await createUser(db, S_EMAIL, 'Ana Reyes');
	ben = await createUser(db, P_EMAIL, 'Ben Cho');

	sectionA = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', label: 'Period 1', teacherEmail: T_EMAIL });
	sectionB = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', label: 'Period 4', teacherEmail: U_EMAIL });

	await enrollStudent(db, { as: teacherT, sectionId: sectionA, email: S_EMAIL, displayName: 'Ana Reyes' });
	await enrollStudent(db, { as: teacherT, sectionId: sectionA, email: P_EMAIL, displayName: 'Ben Cho' });
	// The teacher's own enrollment row, which 0138 says is never a student row.
	await enrollStudent(db, { as: teacherT, sectionId: sectionA, email: T_EMAIL, displayName: 'T Vargas' });
	await enrollStudent(db, { as: teacherU, sectionId: sectionB, email: S_EMAIL, displayName: 'Ana Reyes' });

	// One published assignment in each section, so an opened item can be in
	// this class or in another one.
	itemA = (
		await rpc<{ item_id: string }>(
			teacherT,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[sectionA], 'Bridge Sketch']
		)
	).item_id;
	itemB = (
		await rpc<{ item_id: string }>(
			teacherU,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[sectionB], 'Gear Train']
		)
	).item_id;
	await rpc(ana, 'public.classroom_mark_item_viewed($1::uuid)', [itemA]);
	await rpc(ana, 'public.classroom_mark_item_viewed($1::uuid)', [itemB]);

	// Hall passes: Ana's own trip through the student path, one a teacher sent
	// her on, Ben's one trip in the same section, and Ana's trip in section B.
	const opened = await rpc<{ ok: boolean }>(ana, 'public.classroom_hall_pass_open($1::uuid)', [sectionA]);
	expect(opened.ok).toBe(true);
	const closed = await rpc<{ ok: boolean }>(ana, 'public.classroom_hall_pass_close_mine($1::uuid)', [sectionA]);
	expect(closed.ok).toBe(true);
	await passFor(teacherT, sectionA, S_EMAIL);
	await passFor(teacherT, sectionA, P_EMAIL);
	await passFor(teacherU, sectionB, S_EMAIL);

	// Songs: Ana asks once in A (rejected) and once more (pending); Ben once in
	// A; Ana once in B.
	const first = await rpc<{ ok: boolean; request_id: string }>(
		ana,
		'public.classroom_song_request($1::uuid, $2::text, null)',
		[sectionA, 'https://open.spotify.com/track/a1']
	);
	expect(first.ok).toBe(true);
	await rpc(teacherT, 'public.classroom_song_reject($1::uuid, $2::text)', [first.request_id, 'Not this one.']);
	expect((await rpc<{ ok: boolean }>(ana, 'public.classroom_song_request($1::uuid, $2::text, null)', [sectionA, 'https://open.spotify.com/track/b2'])).ok).toBe(true);
	expect((await rpc<{ ok: boolean }>(ben, 'public.classroom_song_request($1::uuid, $2::text, null)', [sectionA, 'https://open.spotify.com/track/c3'])).ok).toBe(true);
	expect((await rpc<{ ok: boolean }>(ana, 'public.classroom_song_request($1::uuid, $2::text, null)', [sectionB, 'https://open.spotify.com/track/d4'])).ok).toBe(true);

	// Coins, through the admin log: an award and a fine with a private note,
	// and an award for Ben that must not reach Ana's total.
	await rpc(admin, `public.coin_log_transaction($1, 'highest_grade_weekly', null, null, null, 'digital')`, [S_EMAIL]);
	await rpc(admin, `public.coin_log_transaction($1, 'highest_grade_weekly', null, null, null, 'physical')`, [S_EMAIL]);
	await rpc(admin, `public.coin_log_transaction($1, 'classmate_trust_violation', null, null, $2, 'physical')`, [S_EMAIL, COIN_NOTE]);
	await rpc(admin, `public.coin_log_transaction($1, 'highest_grade_weekly', null, null, null, 'digital')`, [P_EMAIL]);

	// The pre-0233 database really has no such function.
	const { rows } = await db.sql(`select count(*)::int as n from pg_proc where proname = 'classroom_student_overview'`);
	expect(rows[0].n).toBe(0);

	await db.sql(SQL_0233);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('the part as text', () => {
	test('it is wrapped in its markers, carries no paste trap, and the chain was not short', () => {
		const part = part0233('student-overview');
		expect(part).not.toBeNull();
		expect(part).toContain('classroom_student_overview');
		expect(pasteTrap(SQL_0233)).toEqual([]);
		expect(PRE_0233_COUNT).toBeGreaterThan(200);
	});
});

describe('who is answered', () => {
	test('the teacher of the section is answered about their student', async () => {
		const o = await overview(teacherT, sectionA, S_EMAIL);
		expect(o).not.toBeNull();
		expect(o!.student_email).toBe(S_EMAIL);
		expect(o!.display_name).toBe('Ana Reyes');
		expect(o!.active).toBe(true);
		expect(o!.has_account).toBe(true);
		expect(o!.user_id).toBe(ana.id);
	});

	test('the address is normalized the way the roster stores it', async () => {
		const o = await overview(teacherT, sectionA, `  ${S_EMAIL.toUpperCase()} `);
		expect(o?.student_email).toBe(S_EMAIL);
	});

	test('an admin who teaches neither section is answered', async () => {
		expect((await overview(admin, sectionA, S_EMAIL))?.student_email).toBe(S_EMAIL);
	});

	test('every refusal is NULL, and they are identical', async () => {
		// The teacher of section B, which Ana is also in: not section A's manager.
		expect(await overview(teacherU, sectionA, S_EMAIL)).toBeNull();
		// The student about themselves.
		expect(await overview(ana, sectionA, S_EMAIL)).toBeNull();
		// A classmate about the student.
		expect(await overview(ben, sectionA, S_EMAIL)).toBeNull();
		// An address with no enrollment row in this section.
		expect(await overview(teacherT, sectionA, NEVER)).toBeNull();
		// The teacher's own enrollment row (0138).
		expect(await overview(teacherT, sectionA, T_EMAIL)).toBeNull();
		// Null and empty arguments.
		expect(await overview(teacherT, sectionA, '')).toBeNull();
		// POSITIVE CONTROL in the same breath: the same caller, the same section,
		// a real student.
		expect(await overview(teacherT, sectionA, P_EMAIL)).not.toBeNull();
	});

	test('a student who left is still answered, and says so', async () => {
		await enrollStudent(db, { as: teacherT, sectionId: sectionA, email: P_EMAIL, displayName: 'Ben Cho', active: false });
		const o = await overview(teacherT, sectionA, P_EMAIL);
		expect(o?.active).toBe(false);
		await enrollStudent(db, { as: teacherT, sectionId: sectionA, email: P_EMAIL, displayName: 'Ben Cho', active: true });
	});
});

describe('scope and attribution', () => {
	test("hall passes are this student's and this section's only", async () => {
		const o = (await overview(teacherT, sectionA, S_EMAIL))!;
		expect(o.hall_passes.total).toBe(2);
		expect(o.hall_passes.entries).toHaveLength(2);
		expect(new Set(o.hall_passes.entries.map((e) => e.student_email))).toEqual(new Set([S_EMAIL]));
		expect(o.hall_passes.entries.every((e) => e.student_name === 'Ana Reyes')).toBe(true);
		// One opened by the student, one sent by the teacher: the override marker.
		expect(o.hall_passes.entries.map((e) => e.opened_by ?? 'self').sort()).toEqual(['self', T_EMAIL].sort());
		expect(o.hall_passes.limits).toEqual({ cooldown_minutes: 10, daily_limit: 3 });

		// POSITIVE CONTROLS: Ben's pass in A, and Ana's own pass in B, exist.
		const benA = (await overview(teacherT, sectionA, P_EMAIL))!;
		expect(benA.hall_passes.total).toBe(1);
		expect(benA.hall_passes.entries[0].student_email).toBe(P_EMAIL);
		const anaB = (await overview(teacherU, sectionB, S_EMAIL))!;
		expect(anaB.hall_passes.total).toBe(1);
		const allPassIds = new Set([...benA.hall_passes.entries, ...anaB.hall_passes.entries].map((e) => e.pass_id));
		expect(o.hall_passes.entries.some((e) => allPassIds.has(e.pass_id))).toBe(false);
	});

	test('opened items are only those posted to this section', async () => {
		const o = (await overview(teacherT, sectionA, S_EMAIL))!;
		expect(o.item_views.map((v) => v.item_id)).toEqual([itemA]);
		const anaB = (await overview(teacherU, sectionB, S_EMAIL))!;
		expect(anaB.item_views.map((v) => v.item_id)).toEqual([itemB]);
	});

	test('song counts are this section only, each by the one status derivation', async () => {
		const o = (await overview(teacherT, sectionA, S_EMAIL))!;
		expect(o.songs).toEqual({ requested: 2, approved: 0, rejected: 1, pending: 1 });
		expect((await overview(teacherT, sectionA, P_EMAIL))!.songs).toEqual({ requested: 1, approved: 0, rejected: 0, pending: 1 });
		expect((await overview(teacherU, sectionB, S_EMAIL))!.songs).toEqual({ requested: 1, approved: 0, rejected: 0, pending: 1 });
	});
});

describe('the coin projection', () => {
	test('balances agree with the ledger, per medium, and are this student only', async () => {
		const o = (await overview(teacherT, sectionA, S_EMAIL))!;
		const { rows } = await db.sql<{ total: number; physical: number; digital: number; n: number }>(
			`select coalesce(sum(amount), 0)::int as total,
			        coalesce(sum(amount) filter (where medium = 'physical'), 0)::int as physical,
			        coalesce(sum(amount) filter (where medium = 'digital'), 0)::int as digital,
			        count(*)::int as n
			 from public.coin_transactions where student_email = $1`,
			[S_EMAIL]
		);
		expect(rows[0].n).toBe(3);
		expect(o.coins.balance).toBe(rows[0].total);
		expect(o.coins.physical_balance).toBe(rows[0].physical);
		expect(o.coins.digital_balance).toBe(rows[0].digital);
		expect(o.coins.total).toBe(3);
		expect(o.coins.transactions).toHaveLength(3);
		expect(new Set(o.coins.transactions.map((t) => t.category_kind))).toEqual(new Set(['award', 'fine']));
	});

	test('the note and who logged it are never in the payload, and the note does exist', async () => {
		const o = (await overview(teacherT, sectionA, S_EMAIL))!;
		const text = JSON.stringify(o);
		for (const row of o.coins.transactions) {
			expect(Object.keys(row).sort()).toEqual(
				['amount', 'category_id', 'category_kind', 'category_name', 'created_at', 'id', 'medium', 'transfer_id'].sort()
			);
		}
		expect(text).not.toContain(COIN_NOTE);
		expect(text).not.toContain(ADMIN);
		expect(text).not.toContain(P_EMAIL);
		// POSITIVE CONTROL: the note is stored, so its absence above is the projection.
		const { rows } = await db.sql(`select count(*)::int as n from public.coin_transactions where note = $1`, [COIN_NOTE]);
		expect(rows[0].n).toBe(1);
	});
});

describe('presence limits are the same object presence_state carries', () => {
	test('equal to classroom_presence_state limits, key for key', async () => {
		const o = (await overview(teacherT, sectionA, S_EMAIL))!;
		const state = await rpc<{ limits: Record<string, number> }>(
			teacherT,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[itemA, sectionA]
		);
		expect(state.limits).toBeTruthy();
		expect(o.presence_limits).toEqual(state.limits);
		expect(o.presence_limits.retention_days).toBeGreaterThan(0);
	});
});

describe('grants and shape', () => {
	test('anon cannot execute it and authenticated can', async () => {
		const { rows } = await db.sql<{ anon: boolean; auth: boolean; svc: boolean; n: number; secdef: boolean }>(
			`select has_function_privilege('anon', 'public.classroom_student_overview(uuid, text)', 'execute') as anon,
			        has_function_privilege('authenticated', 'public.classroom_student_overview(uuid, text)', 'execute') as auth,
			        (select count(*)::int from pg_proc where proname = 'classroom_student_overview') as n,
			        (select prosecdef from pg_proc where oid = 'public.classroom_student_overview(uuid, text)'::regprocedure) as secdef,
			        false as svc`
		);
		expect(rows[0]).toMatchObject({ anon: false, auth: true, n: 1, secdef: true });
		await expect(
			db.asAnon((q) => q('select public.classroom_student_overview($1::uuid, $2::text)', [sectionA, S_EMAIL]))
		).rejects.toThrow(/permission denied/);
	});

	test('the part re-applies as a no-op', async () => {
		await db.sql(SQL_0233);
		const { rows } = await db.sql(`select count(*)::int as n from pg_proc where proname = 'classroom_student_overview'`);
		expect(rows[0].n).toBe(1);
		expect((await overview(teacherT, sectionA, S_EMAIL))?.student_email).toBe(S_EMAIL);
	});
});
