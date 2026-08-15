// tests/notebook-view-as.test.ts
//
// VIEW THE NOTEBOOK AS A STUDENT (0099), against a real embedded Postgres with
// the real migration files applied unmodified.
//
// WHAT EARNS A TEST HERE, and it is a short list on purpose: only the things
// that fail SILENTLY. An admin-only read that quietly stops being admin-only
// still renders a perfectly normal-looking notebook; a preview that quietly
// shows an INSTRUCTOR-shaped slice of a student's data instead of the
// student's own also renders a perfectly normal-looking notebook, and would
// send someone away believing they had checked the student experience when
// they had checked something else. Neither is visible from the screen, which
// is exactly why they are here rather than in a harness pass.
//
// Three groups:
//
//   1. WHO. A student and a plain teacher are refused; the admin is not; anon
//      holds no EXECUTE grant. Mutation-checked in BOTH directions -- see the
//      run notes in CLAUDE.md.
//   2. WHAT. The payload is that student's OWN notebook: their entries and
//      nobody else's, their folders, their pins, their check-ins from their
//      own ACTIVE enrollments -- never the admin's reach, and never filtered
//      down to what an instructor would review.
//   3. READ-ONLY IS STRUCTURAL. The `notebook_view_as%` namespace is
//      enumerated out of pg_proc and asserted to be exactly one function, and
//      that function STABLE. A write RPC added to the family fails this test
//      rather than passing review -- the same guard 0083's own suite puts on
//      `classroom_view_as%`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/**
 * The notebook chain, plus 0083 (which defines `_classroom_view_as_guard`, the
 * check 0099 CALLS rather than copies) and 0091 (pinned_at + the activity view
 * the payload carries). 0053 is 0083's own dependency.
 */
const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0088_notebook_folders.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0098_notebook_session_postings.sql',
	'0099_notebook_view_as.sql',
	// 0106 moved this payload into a shared helper and left the guard alone, so
	// every assertion below is the regression check on that extraction: same
	// admin-only door, byte-for-byte the same notebook behind it.
	'0106_notebook_instructor_student_access.sql'
] as const;

const MIGRATION_0099 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0099_notebook_view_as.sql'),
	'utf8'
);

interface Payload {
	student: { email: string; display_name: string | null; user_id: string | null };
	section_label: string | null;
	entries: {
		id: string;
		session_id: string | null;
		section_id: string | null;
		folder_id: string | null;
		pinned_at: string | null;
		custom_label: string | null;
		status: string;
		flag_reason: string | null;
		session: { session_label: string; unit_number: number; session_date: string } | null;
		photos: { id: string; variant: string; sequence_order: number }[];
		notes: { id: string; note_id: string; revision: number }[];
	}[];
	folders: { id: string; name: string; color: string }[];
	sessions: { id: string; section_id: string; session_label: string }[];
	activity: { id: string; last_activity_at: string }[];
}

let db: TestDb;
let owner: SeededUser;
let teacherA: SeededUser;
let teacherB: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
/** P1: teacherA's. P2: teacherB's, and alice is NOT in it. */
let p1: string;
let p2: string;
/** P3: alice was enrolled and then removed. */
let p3: string;
let s1: string;
let s2: string;
let s3: string;
let aliceFolder: string;
let aliceSessionEntry: string;
let aliceNoteEntry: string;
let alicePinnedEntry: string;
let brunoEntry: string;

async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as { message?: string }).message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

function viewAs(userId: string, email: string): Promise<Payload> {
	return rpc<Payload>(userId, 'public.notebook_view_as_notebook($1)', [email]);
}

async function addSession(
	sectionIds: string[],
	unit: number,
	date: string,
	label: string
): Promise<string> {
	const res = await rpc<{ session_id: string }>(
		owner.id,
		`public.notebook_admin_upsert_session(
			p_section_ids => $1::uuid[], p_unit_number => $2::integer,
			p_session_date => $3::date, p_session_label => $4)`,
		[sectionIds, unit, date, label]
	);
	return res.session_id;
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	// The pinned owner (0067's admin_owner_email) -- the only account that is
	// an admin without a grant, which is what makes it usable as the fixture.
	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'teacher.a@boscotech.edu', 'Teacher A');
	teacherB = await createUser(db, 'teacher.b@boscotech.edu', 'Teacher B');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');

	p1 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design',
		label: 'Period 1',
		teacherEmail: teacherA.email
	});
	p2 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA209H',
		label: 'Period 2',
		teacherEmail: teacherB.email
	});
	p3 = await createClassroomSection(db, {
		as: owner,
		courseCode: 'IDEA100',
		courseTitle: 'Intro',
		label: 'Period 3',
		teacherEmail: teacherA.email
	});

	await enrollStudent(db, {
		as: teacherA,
		sectionId: p1,
		email: alice.email,
		displayName: 'Alvarez, Alice'
	});
	await enrollStudent(db, {
		as: teacherA,
		sectionId: p1,
		email: bruno.email,
		displayName: 'Barros, Bruno'
	});
	// On a roster, has never signed in: the 0094 state the payload must survive.
	await enrollStudent(db, {
		as: teacherA,
		sectionId: p1,
		email: 'dana@boscotech.net',
		displayName: 'Devi, Dana'
	});
	// Alice was in P3 and is not any more. Its check-in must NOT reach her.
	await enrollStudent(db, {
		as: teacherA,
		sectionId: p3,
		email: alice.email,
		displayName: 'Alvarez, Alice',
		active: false
	});
	// Bruno alone is in P2, so P2's check-in is a control: it is a section the
	// ADMIN can reach but Alice cannot.
	await enrollStudent(db, {
		as: teacherB,
		sectionId: p2,
		email: bruno.email,
		displayName: 'Barros, Bruno'
	});

	s1 = await addSession([p1], 3, '2026-08-08', 'Bearing teardown');
	s2 = await addSession([p1], 3, '2026-08-10', 'Shaft stackup');
	s3 = await addSession([p2], 1, '2026-08-11', 'Another class');
	await addSession([p3], 1, '2026-08-12', 'A class she left');

	// --- Alice's own notebook, written by Alice through the real RPCs -------
	aliceFolder = (
		await rpc<{ folder_id: string }>(alice.id, 'public.notebook_upsert_folder($1, $2, null)', [
			'Gearbox',
			'gold'
		])
	).folder_id;

	aliceSessionEntry = (
		await rpc<{ entry_id: string }>(
			alice.id,
			`public.notebook_create_entry(
				p_student_id => $1, p_drive_file_id => $2, p_session_id => $3, p_section_id => $4)`,
			[alice.id, 'drive-alice-1', s1, p1]
		)
	).entry_id;

	aliceNoteEntry = (
		await rpc<{ entry_id: string }>(
			alice.id,
			`public.notebook_create_note_entry(
				p_content => $1::jsonb, p_custom_label => $2, p_folder_id => $3)`,
			[JSON.stringify([{ type: 'p', runs: [{ text: 'Ratio math.' }] }]), 'Ratios', aliceFolder]
		)
	).entry_id;

	alicePinnedEntry = (
		await rpc<{ entry_id: string }>(
			alice.id,
			`public.notebook_create_entry(
				p_student_id => $1, p_drive_file_id => $2, p_custom_label => $3)`,
			[alice.id, 'drive-alice-2', 'Sketches']
		)
	).entry_id;
	await rpc(alice.id, 'public.notebook_set_entry_pinned($1::uuid, true)', [alicePinnedEntry]);

	// Flagged by her instructor: a real review state the preview must show her
	// exactly as she sees it (a flag is visible to the student, by design).
	await rpc(teacherA.id, 'public.notebook_flag_entry($1::uuid, $2, $3)', [
		aliceSessionEntry,
		'illegible',
		'Please rephotograph page 2.'
	]);

	// --- Bruno's, so "only her own" has something to fail against ----------
	brunoEntry = (
		await rpc<{ entry_id: string }>(
			bruno.id,
			`public.notebook_create_entry(
				p_student_id => $1, p_drive_file_id => $2, p_session_id => $3, p_section_id => $4)`,
			[bruno.id, 'drive-bruno-1', s1, p1]
		)
	).entry_id;
	await rpc(bruno.id, 'public.notebook_upsert_folder($1, $2, null)', ['Bruno only', 'sky']);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe('who may view a notebook as a student', () => {
	test('a student is refused', async () => {
		const err = await captureError(() => viewAs(alice.id, alice.email));
		expect(err.message).toMatch(/site admin/i);
	});

	test("a student is refused even for their OWN notebook -- it is not a self-service read", async () => {
		const err = await captureError(() => viewAs(bruno.id, bruno.email));
		expect(err.message).toMatch(/site admin/i);
	});

	test('a plain teacher is refused -- including for their own student', async () => {
		// teacherA is the teacher of record of Alice's section and can read her
		// entries through the staff policy; that is a REVIEW tier, and it is not
		// this. Being a teacher is not being an admin (the 0067 naming trap).
		const err = await captureError(() => viewAs(teacherA.id, alice.email));
		expect(err.message).toMatch(/site admin/i);
	});

	test('a teacher of another section is refused', async () => {
		const err = await captureError(() => viewAs(teacherB.id, alice.email));
		expect(err.message).toMatch(/site admin/i);
	});

	test('the admin is not refused', async () => {
		const payload = await viewAs(owner.id, alice.email);
		expect(payload.student.email).toBe(alice.email);
	});

	test('a granted admin works too, so the check is is_admin() and not the pinned owner', async () => {
		await rpc(owner.id, 'public.admin_grant($1)', [teacherB.email]);
		const payload = await viewAs(teacherB.id, alice.email);
		expect(payload.student.email).toBe(alice.email);
		await rpc(owner.id, 'public.admin_revoke($1)', [teacherB.email]);
		const err = await captureError(() => viewAs(teacherB.id, alice.email));
		expect(err.message).toMatch(/site admin/i);
	});

	test('anon holds no EXECUTE grant', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon', 'public.notebook_view_as_notebook(text)', 'execute') as ok`
		);
		expect(rows[0].ok).toBe(false);
	});

	test('the email is normalized, and a junk one is refused rather than probed', async () => {
		const payload = await viewAs(owner.id, '  ALICE@BoscoTech.net ');
		expect(payload.student.email).toBe(alice.email);
		const err = await captureError(() => viewAs(owner.id, 'not-an-email'));
		expect(err.message).toMatch(/pick a student/i);
	});
});

// ---------------------------------------------------------------------------
// 2. What -- their own notebook, not an instructor's view of it
// ---------------------------------------------------------------------------

describe('the payload is that student’s own notebook', () => {
	test('every entry is hers, and nobody else’s', async () => {
		const payload = await viewAs(owner.id, alice.email);
		const ids = payload.entries.map((e) => e.id).sort();
		expect(ids).toEqual([aliceSessionEntry, aliceNoteEntry, alicePinnedEntry].sort());
		expect(ids).not.toContain(brunoEntry);
	});

	test('EVERY kind of her work is there, unfiltered', async () => {
		const payload = await viewAs(owner.id, alice.email);
		const byId = new Map(payload.entries.map((e) => [e.id, e]));

		// A check-in entry, with its check-in resolved the way her feed shows it.
		const linked = byId.get(aliceSessionEntry)!;
		expect(linked.session_id).toBe(s1);
		expect(linked.session?.session_label).toBe('Bearing teardown');
		expect(linked.photos.map((p) => p.variant)).toEqual(['original']);
		// Her instructor's flag is part of what SHE sees, so it rides along.
		expect(linked.status).toBe('flagged');
		expect(linked.flag_reason).toBe('illegible');

		// A written note, filed in her own folder.
		const note = byId.get(aliceNoteEntry)!;
		expect(note.folder_id).toBe(aliceFolder);
		expect(note.notes).toHaveLength(1);
		expect(note.notes[0].revision).toBe(1);

		// A pinned free-form entry.
		const pinned = byId.get(alicePinnedEntry)!;
		expect(pinned.pinned_at).not.toBeNull();
		expect(pinned.custom_label).toBe('Sketches');

		// Newest first, exactly as her own load orders it.
		expect(payload.entries[0].id).toBe(alicePinnedEntry);
	});

	test('her folders, and only hers', async () => {
		const payload = await viewAs(owner.id, alice.email);
		expect(payload.folders.map((f) => f.name)).toEqual(['Gearbox']);
		expect(payload.folders[0].color).toBe('gold');
	});

	test('every entry carries an activity stamp, from the view her own load reads', async () => {
		const payload = await viewAs(owner.id, alice.email);
		expect(payload.activity.map((a) => a.id).sort()).toEqual(
			[aliceSessionEntry, aliceNoteEntry, alicePinnedEntry].sort()
		);
		for (const row of payload.activity) expect(row.last_activity_at).toBeTruthy();
	});

	test('her check-ins come from HER active enrollments, not the admin’s reach', async () => {
		const payload = await viewAs(owner.id, alice.email);
		const ids = payload.sessions.map((s) => s.id).sort();
		// P1's two. NOT P2's (a class she is not in) and NOT P3's (one she left),
		// both of which the admin can read perfectly well through their own tier.
		expect(ids).toEqual([s1, s2].sort());
		for (const s of payload.sessions) expect(s.section_id).toBe(p1);

		const adminsOwn = await db.sql<{ id: string }>(
			'select id from public.notebook_sessions order by session_date'
		);
		expect(adminsOwn.rows.length).toBe(4);
	});

	test('the class chip names her classes', async () => {
		const payload = await viewAs(owner.id, alice.email);
		expect(payload.section_label).toBe('IDEA209H · Period 1');
		// Bruno is in two, so his reads as a count rather than one name.
		const brunoPayload = await viewAs(owner.id, bruno.email);
		expect(brunoPayload.section_label).toBe('2 classes');
	});

	test('a roster row with no account is a normal state, not an error', async () => {
		const payload = await viewAs(owner.id, 'dana@boscotech.net');
		expect(payload.student.user_id).toBeNull();
		expect(payload.student.display_name).toBe('Devi, Dana');
		expect(payload.entries).toEqual([]);
		expect(payload.folders).toEqual([]);
		// Her check-ins are real and waiting for her.
		expect(payload.sessions.map((s) => s.id).sort()).toEqual([s1, s2].sort());
	});

	test('an email on no roster at all answers empty rather than raising', async () => {
		const payload = await viewAs(owner.id, 'nobody@boscotech.net');
		expect(payload.student.user_id).toBeNull();
		expect(payload.entries).toEqual([]);
		expect(payload.sessions).toEqual([]);
		expect(payload.section_label).toBeNull();
	});

	test('a shared check-in appears once per class of HERS, never once per class', async () => {
		// The same canonical check-in posted to P1 AND P2. Alice is only in P1,
		// so she sees it once; Bruno is in both, so he sees it twice -- which is
		// what each of their own loads produces (0098's posting model).
		const shared = await addSession([p1, p2], 4, '2026-08-14', 'Shared check-in');
		try {
			const hers = await viewAs(owner.id, alice.email);
			expect(hers.sessions.filter((s) => s.id === shared)).toHaveLength(1);
			expect(hers.sessions.find((s) => s.id === shared)!.section_id).toBe(p1);

			const his = await viewAs(owner.id, bruno.email);
			expect(his.sessions.filter((s) => s.id === shared).map((s) => s.section_id).sort()).toEqual(
				[p1, p2].sort()
			);
		} finally {
			await rpc(owner.id, 'public.notebook_admin_delete_session($1::uuid)', [shared]);
		}
	});
});

// ---------------------------------------------------------------------------
// 3. Read-only, structurally
// ---------------------------------------------------------------------------

describe('read-only is a property of the surface area', () => {
	test('there is exactly ONE notebook view_as function, and it is STABLE', async () => {
		const { rows } = await db.sql<{ name: string; volatility: string; args: string }>(
			`select p.proname as name,
			        p.provolatile as volatility,
			        pg_get_function_identity_arguments(p.oid) as args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'notebook_view_as%'
			 order by p.proname`
		);
		expect(rows.map((r) => r.name)).toEqual(['notebook_view_as_notebook']);
		expect(rows.map((r) => r.args)).toEqual(['p_email text']);
		// 's' = STABLE. A VOLATILE one would be the first thing able to write.
		expect(rows.every((r) => r.volatility === 's')).toBe(true);
	});

	test('it reuses 0083’s guard rather than shipping a second one', async () => {
		// A `_notebook_view_as_guard` would be a second copy of one permission
		// rule; the whole point is that there is only ever the one.
		const { rows } = await db.sql<{ name: string }>(
			`select proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like '%view_as_guard%'`
		);
		expect(rows.map((r) => r.name)).toEqual(['_classroom_view_as_guard']);

		const uses = await db.sql<{ ok: boolean }>(
			`select prosrc like '%_classroom_view_as_guard%' as ok
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_view_as_notebook'`
		);
		expect(uses.rows[0].ok).toBe(true);
	});

	test('previewing writes nothing: the notebook is byte-identical afterwards', async () => {
		const snapshot = async () =>
			(
				await db.sql<{ digest: string }>(
					`select coalesce(string_agg(t, '|' order by t), '') as digest from (
					   select e.id::text || ':' || e.status || ':' || coalesce(e.folder_id::text, '-')
					        || ':' || coalesce(e.pinned_at::text, '-') as t
					   from public.notebook_entries e
					   union all
					   select 'f:' || f.id::text || ':' || f.name from public.notebook_folders f
					   union all
					   select 'p:' || pg.session_id::text || ':' || pg.section_id::text
					   from public.notebook_session_postings pg
					 ) s`
				)
			).rows[0].digest;

		const before = await snapshot();
		await viewAs(owner.id, alice.email);
		await viewAs(owner.id, bruno.email);
		await viewAs(owner.id, 'dana@boscotech.net');
		expect(await snapshot()).toBe(before);
	});

	test('the migration re-applies cleanly, and the guarantees survive it', async () => {
		await db.sql(MIGRATION_0099);
		await db.sql(MIGRATION_0099);

		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_view_as_notebook'`
		);
		expect(rows[0].n).toBe('1');

		const anon = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon', 'public.notebook_view_as_notebook(text)', 'execute') as ok`
		);
		expect(anon.rows[0].ok).toBe(false);

		const err = await captureError(() => viewAs(alice.id, alice.email));
		expect(err.message).toMatch(/site admin/i);
		const payload = await viewAs(owner.id, alice.email);
		expect(payload.entries).toHaveLength(3);
	});
});
