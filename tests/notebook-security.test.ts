// tests/notebook-security.test.ts
//
// The digital notebook's security-critical properties, against a real Postgres
// with the real migrations applied (see tests/db/harness.ts).
//
// DELIBERATELY NARROW. This is not a test suite for the notebook feature; it is
// a test suite for the three guarantees that are expensive to get wrong
// silently, because nothing in the app would visibly break if they regressed:
//
//   1. RLS isolation -- one student cannot read another student's entries or
//      photos, by listing or by id, while the section's instructor and the
//      chair-level (admin) tier can.
//   2. No direct writes -- an authenticated client cannot INSERT, UPDATE or
//      DELETE notebook_entries / notebook_entry_photos at all. Every write goes
//      through a SECURITY DEFINER RPC, which is where the rules live.
//   3. Flag integrity -- a resubmission onto a flagged entry moves it to
//      pending_review instead of quietly clearing the flag, and never destroys
//      or overwrites the photo that was flagged.
//
// Everything else about this layer -- Drive filenames, label fallbacks, the
// section grid's shape -- is feature correctness and stays covered the way the
// rest of this repo covers it. Adding it here would dilute what a red run means.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

let db: TestDb;

let owner: SeededUser; // pinned admin: the chair tier
let instructorA: SeededUser; // instructor of section A, NOT an admin
let instructorB: SeededUser; // instructor of section B, NOT an admin
let unattachedStaff: SeededUser; // role 'teacher', no section, no admin grant
let alice: SeededUser;
let bob: SeededUser;

let sectionA: string;
let sectionB: string;
let sessionA: string;
let sessionB: string;

let aliceEntry: string; // alice, session A. Never mutated: the RLS baseline.
let aliceFreeEntry: string; // alice, free entry in section A. The flag subject.
let bobEntry: string; // bob, session A
let bobEntryOtherSection: string; // bob, session B

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

/** Every notebook_entries row this user can actually SELECT, sorted. */
async function visibleEntryIds(userId: string): Promise<string[]> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ id: string }>('select id from public.notebook_entries');
		return rows.map((r) => r.id).sort();
	});
}

/** Reading one specific entry BY ID -- the probe a filtered list would hide. */
async function canReadEntryById(userId: string, entryId: string): Promise<boolean> {
	return db.asUser(userId, async (q) => {
		const { rowCount } = await q('select 1 from public.notebook_entries where id = $1', [entryId]);
		return (rowCount ?? 0) > 0;
	});
}

async function visiblePhotoCount(userId: string, entryId: string): Promise<number> {
	return db.asUser(userId, async (q) => {
		const { rowCount } = await q('select 1 from public.notebook_entry_photos where entry_id = $1', [
			entryId
		]);
		return rowCount ?? 0;
	});
}

/** Creates an entry through the real student RPC, as that student. */
async function createEntry(
	student: SeededUser,
	opts: { driveFileId: string; sessionId?: string; sectionId?: string; label?: string }
): Promise<string> {
	const { rows } = await db.asUser(student.id, (q) =>
		q<{ result: { entry_id: string } }>(
			'select public.notebook_create_entry($1, $2, $3, $4, $5) as result',
			[student.id, opts.driveFileId, opts.sessionId ?? null, opts.sectionId ?? null, opts.label ?? null]
		)
	);
	return rows[0].result.entry_id;
}

beforeAll(async () => {
	db = await startTestDb();

	// Roles are derived from the email domain by 0001's role_for_email, and
	// admin comes only from 0067's pinned-owner constant / app_admins roster.
	// apina@boscotech.edu is the owner pinned in the schema; wcosso@ is seeded
	// as an admin by 0067, so the "staff but not admin" accounts avoid both.
	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	instructorA = await createUser(db, 'jbuilder@boscotech.edu', 'J Builder');
	instructorB = await createUser(db, 'kmartin@boscotech.edu', 'K Martin');
	unattachedStaff = await createUser(db, 'tsmith@boscotech.edu', 'T Smith');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bob = await createUser(db, 'bob@boscotech.net', 'Bob Brandt');

	// Sections are admin-created (assigning instructor power is admin-tier
	// trust), so this runs as the owner.
	const sections = await db.asUser(owner.id, async (q) => {
		const a = await q<{ result: { section_id: string } }>(
			'select public.notebook_admin_upsert_section($1, $2, $3) as result',
			['eng1h-sophomore', 'Period 2 lab', instructorA.id]
		);
		const b = await q<{ result: { section_id: string } }>(
			'select public.notebook_admin_upsert_section($1, $2, $3) as result',
			['eng1h-senior', 'Period 5 lab', instructorB.id]
		);
		return { a: a.rows[0].result.section_id, b: b.rows[0].result.section_id };
	});
	sectionA = sections.a;
	sectionB = sections.b;

	// Sessions are created by the section's own instructor.
	sessionA = (
		await db.asUser(instructorA.id, (q) =>
			q<{ result: { session_id: string } }>(
				'select public.notebook_admin_upsert_session($1, $2, $3, $4) as result',
				[sectionA, 3, '2026-10-14', 'Bearing teardown']
			)
		)
	).rows[0].result.session_id;
	sessionB = (
		await db.asUser(instructorB.id, (q) =>
			q<{ result: { session_id: string } }>(
				'select public.notebook_admin_upsert_session($1, $2, $3, $4) as result',
				[sectionB, 1, '2026-10-15', 'Capstone kickoff']
			)
		)
	).rows[0].result.session_id;

	aliceEntry = await createEntry(alice, { driveFileId: 'drive-alice-1', sessionId: sessionA });
	aliceFreeEntry = await createEntry(alice, {
		driveFileId: 'drive-alice-free-1',
		sectionId: sectionA,
		label: 'Bench notes'
	});
	bobEntry = await createEntry(bob, { driveFileId: 'drive-bob-1', sessionId: sessionA });
	bobEntryOtherSection = await createEntry(bob, {
		driveFileId: 'drive-bob-2',
		sessionId: sessionB
	});
});

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------

describe('the fixture itself', () => {
	test('roles come from the email domain and admin is not the same thing as staff', async () => {
		const { rows } = await db.sql<{ id: string; role: string }>(
			'select id, role from public.profiles'
		);
		const roleOf = (u: SeededUser) => rows.find((r) => r.id === u.id)?.role;

		expect(roleOf(alice)).toBe('student');
		expect(roleOf(bob)).toBe('student');
		expect(roleOf(instructorA)).toBe('teacher');
		expect(roleOf(unattachedStaff)).toBe('teacher');

		// 0067: 'teacher' on its own grants nothing elevated. If this ever flips,
		// every "instructor cannot see other sections" assertion below is
		// meaningless, so it is asserted rather than assumed.
		const isAdmin = async (u: SeededUser) =>
			(await db.asUser(u.id, (q) => q<{ admin: boolean }>('select public.is_admin() as admin')))
				.rows[0].admin;

		expect(await isAdmin(owner)).toBe(true);
		expect(await isAdmin(instructorA)).toBe(false);
		expect(await isAdmin(unattachedStaff)).toBe(false);
		expect(await isAdmin(alice)).toBe(false);
	});
});

describe('RLS: a student sees their own notebook and nobody else’s', () => {
	test('a student’s own listing returns exactly their own entries', async () => {
		expect(await visibleEntryIds(alice.id)).toEqual([aliceEntry, aliceFreeEntry].sort());
		expect(await visibleEntryIds(bob.id)).toEqual([bobEntry, bobEntryOtherSection].sort());
	});

	test('a student cannot read a classmate’s entry, by listing or by id', async () => {
		// Same section, same session: the pair most likely to leak.
		expect(await visibleEntryIds(bob.id)).not.toContain(aliceEntry);
		expect(await canReadEntryById(bob.id, aliceEntry)).toBe(false);
		expect(await canReadEntryById(bob.id, aliceFreeEntry)).toBe(false);
		expect(await canReadEntryById(alice.id, bobEntry)).toBe(false);
	});

	test('a student cannot read a classmate’s photos, by entry_id or by photo id', async () => {
		const { rows } = await db.sql<{ id: string }>(
			'select id from public.notebook_entry_photos where entry_id = $1',
			[aliceEntry]
		);
		expect(rows.length).toBeGreaterThan(0);
		const alicePhotoId = rows[0].id;

		expect(await visiblePhotoCount(bob.id, aliceEntry)).toBe(0);
		expect(await visiblePhotoCount(alice.id, aliceEntry)).toBe(rows.length);

		const byId = await db.asUser(bob.id, (q) =>
			q('select 1 from public.notebook_entry_photos where id = $1', [alicePhotoId])
		);
		expect(byId.rowCount ?? 0).toBe(0);

		// And the unfiltered listing does not carry it either.
		const all = await db.asUser(bob.id, (q) =>
			q<{ entry_id: string }>('select entry_id from public.notebook_entry_photos')
		);
		expect(all.rows.map((r) => r.entry_id)).not.toContain(aliceEntry);
	});
});

describe('RLS: staff visibility is scoped to the section they actually teach', () => {
	test('an instructor reads their own section’s entries and no others', async () => {
		const visible = await visibleEntryIds(instructorA.id);
		expect(visible).toEqual([aliceEntry, aliceFreeEntry, bobEntry].sort());

		// The decisive one: bob's OTHER entry is the same student, a section this
		// instructor does not teach.
		expect(visible).not.toContain(bobEntryOtherSection);
		expect(await canReadEntryById(instructorA.id, bobEntryOtherSection)).toBe(false);

		expect(await visibleEntryIds(instructorB.id)).toEqual([bobEntryOtherSection]);
		expect(await canReadEntryById(instructorB.id, aliceEntry)).toBe(false);
	});

	test('a staff account teaching no section sees nothing', async () => {
		// 0067's naming trap in practice: is_teacher() means "is an admin" now, so
		// a plain @boscotech.edu account must not read student notebooks.
		expect(await visibleEntryIds(unattachedStaff.id)).toEqual([]);
		expect(await canReadEntryById(unattachedStaff.id, aliceEntry)).toBe(false);
		expect(await visiblePhotoCount(unattachedStaff.id, aliceEntry)).toBe(0);
	});

	test('an instructor reads the photos of their own section’s entries only', async () => {
		expect(await visiblePhotoCount(instructorA.id, aliceEntry)).toBeGreaterThan(0);
		expect(await visiblePhotoCount(instructorA.id, bobEntryOtherSection)).toBe(0);
		expect(await visiblePhotoCount(instructorB.id, aliceEntry)).toBe(0);
	});
});

describe('RLS: the chair tier reads everything', () => {
	test('an admin reads every student’s entries and photos', async () => {
		expect(await visibleEntryIds(owner.id)).toEqual(
			[aliceEntry, aliceFreeEntry, bobEntry, bobEntryOtherSection].sort()
		);
		expect(await canReadEntryById(owner.id, aliceEntry)).toBe(true);
		expect(await canReadEntryById(owner.id, bobEntryOtherSection)).toBe(true);
		expect(await visiblePhotoCount(owner.id, aliceEntry)).toBeGreaterThan(0);
		expect(await visiblePhotoCount(owner.id, bobEntryOtherSection)).toBeGreaterThan(0);
	});
});

describe('no direct writes: the RPCs are the only door', () => {
	const actors = (): Array<[string, () => SeededUser]> => [
		['a student, on their own entry', () => alice],
		['the section instructor', () => instructorA],
		// Even the admin tier has no direct write path. The rules (flag handling,
		// ownership, the audit log) live in the RPCs, so bypassing them is never
		// allowed regardless of who is asking.
		['a site admin', () => owner]
	];

	for (const [label, actorOf] of actors()) {
		test(`INSERT into notebook_entries is rejected for ${label}`, async () => {
			const before = await db.sql('select 1 from public.notebook_entries');
			const error = await captureError(() =>
				db.asUser(actorOf().id, (q) =>
					q(
						`insert into public.notebook_entries (student_id, section_id, custom_label, status)
						 values ($1, $2, 'forged', 'compliant')`,
						[alice.id, sectionA]
					)
				)
			);
			expect(error.code).toBe('42501'); // insufficient_privilege
			const after = await db.sql('select 1 from public.notebook_entries');
			expect(after.rowCount).toBe(before.rowCount);
		});

		test(`UPDATE of notebook_entries is rejected for ${label}`, async () => {
			const error = await captureError(() =>
				db.asUser(actorOf().id, (q) =>
					q(`update public.notebook_entries set status = 'compliant' where id = $1`, [aliceEntry])
				)
			);
			expect(error.code).toBe('42501');
		});

		test(`DELETE from notebook_entries is rejected for ${label}`, async () => {
			const error = await captureError(() =>
				db.asUser(actorOf().id, (q) =>
					q('delete from public.notebook_entries where id = $1', [aliceEntry])
				)
			);
			expect(error.code).toBe('42501');
		});

		test(`INSERT into notebook_entry_photos is rejected for ${label}`, async () => {
			const before = await db.sql('select 1 from public.notebook_entry_photos');
			const error = await captureError(() =>
				db.asUser(actorOf().id, (q) =>
					q(
						`insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
						 values ($1, 'forged-file', 'original', 99)`,
						[aliceEntry]
					)
				)
			);
			expect(error.code).toBe('42501');
			const after = await db.sql('select 1 from public.notebook_entry_photos');
			expect(after.rowCount).toBe(before.rowCount);
		});

		test(`UPDATE of notebook_entry_photos is rejected for ${label}`, async () => {
			const error = await captureError(() =>
				db.asUser(actorOf().id, (q) =>
					q(`update public.notebook_entry_photos set drive_file_id = 'forged' where entry_id = $1`, [
						aliceEntry
					])
				)
			);
			expect(error.code).toBe('42501');
		});

		test(`DELETE from notebook_entry_photos is rejected for ${label}`, async () => {
			const error = await captureError(() =>
				db.asUser(actorOf().id, (q) =>
					q('delete from public.notebook_entry_photos where entry_id = $1', [aliceEntry])
				)
			);
			expect(error.code).toBe('42501');
		});
	}

	test('the entry the write attempts targeted is byte-for-byte unchanged', async () => {
		const { rows } = await db.sql<{ status: string; custom_label: string | null }>(
			'select status, custom_label from public.notebook_entries where id = $1',
			[aliceEntry]
		);
		expect(rows[0].status).toBe('compliant');
		expect(rows[0].custom_label).toBeNull();

		const photos = await db.sql<{ drive_file_id: string }>(
			'select drive_file_id from public.notebook_entry_photos where entry_id = $1',
			[aliceEntry]
		);
		expect(photos.rows.map((p) => p.drive_file_id)).toEqual(['drive-alice-1']);
	});
});

describe('flag integrity: a resubmission cannot silently clear a flag', () => {
	interface EntryRow {
		status: string;
		flag_reason: string | null;
		instructor_comment: string | null;
		reviewed_by: string | null;
	}
	interface PhotoRow {
		id: string;
		drive_file_id: string;
		variant: string;
		sequence_order: number;
		created_at: Date;
	}

	const readEntry = async (entryId: string): Promise<EntryRow> =>
		(
			await db.sql<EntryRow>(
				`select status, flag_reason, instructor_comment, reviewed_by
				 from public.notebook_entries where id = $1`,
				[entryId]
			)
		).rows[0];

	const readPhotos = async (entryId: string): Promise<PhotoRow[]> =>
		(
			await db.sql<PhotoRow>(
				`select id, drive_file_id, variant, sequence_order, created_at
				 from public.notebook_entry_photos where entry_id = $1 order by sequence_order`,
				[entryId]
			)
		).rows;

	test('the instructor can flag an entry in their section', async () => {
		await db.asUser(instructorA.id, (q) =>
			q('select public.notebook_flag_entry($1, $2, $3)', [
				aliceFreeEntry,
				'illegible',
				'Photo is out of focus, please reshoot.'
			])
		);

		const entry = await readEntry(aliceFreeEntry);
		expect(entry.status).toBe('flagged');
		expect(entry.flag_reason).toBe('illegible');
		expect(entry.instructor_comment).toBe('Photo is out of focus, please reshoot.');
		expect(entry.reviewed_by).toBe(instructorA.id);
	});

	test('adding a photo to a flagged entry forces pending_review and keeps the flag reason', async () => {
		const before = await readPhotos(aliceFreeEntry);
		expect(before).toHaveLength(1);

		const { rows } = await db.asUser(alice.id, (q) =>
			q<{ result: { status: string; sequence_order: number } }>(
				'select public.notebook_add_photo($1, $2) as result',
				[aliceFreeEntry, 'drive-alice-free-resubmit']
			)
		);
		// The RPC's own answer, before we go and read the table.
		expect(rows[0].result.status).toBe('pending_review');
		expect(rows[0].result.sequence_order).toBe(2);

		const entry = await readEntry(aliceFreeEntry);
		expect(entry.status).toBe('pending_review');
		// The heart of it: resubmitting must NOT reset the entry to compliant,
		// and the reviewer's reason and comment survive for them to judge against.
		expect(entry.status).not.toBe('compliant');
		expect(entry.flag_reason).toBe('illegible');
		expect(entry.instructor_comment).toBe('Photo is out of focus, please reshoot.');
	});

	test('the flagged photo is never deleted or overwritten by the resubmission', async () => {
		const after = await readPhotos(aliceFreeEntry);
		expect(after).toHaveLength(2);

		const original = after[0];
		expect(original.drive_file_id).toBe('drive-alice-free-1');
		expect(original.variant).toBe('original');
		expect(original.sequence_order).toBe(1);

		// The resubmission is a NEW row alongside it, not a replacement.
		expect(after[1].drive_file_id).toBe('drive-alice-free-resubmit');
		expect(after[1].sequence_order).toBe(2);
		expect(after[1].id).not.toBe(original.id);
	});

	test('only the reviewer can clear the flag, and clearing it is a separate act', async () => {
		// The student has no way to reach 'compliant': there is no client write
		// path (covered above), and their only RPC lands on pending_review.
		await db.asUser(instructorA.id, (q) =>
			q('select public.notebook_resolve_entry($1)', [aliceFreeEntry])
		);
		const entry = await readEntry(aliceFreeEntry);
		expect(entry.status).toBe('compliant');
		expect(entry.flag_reason).toBeNull();
	});

	test('a classmate cannot add a photo to someone else’s entry', async () => {
		const error = await captureError(() =>
			db.asUser(bob.id, (q) =>
				q('select public.notebook_add_photo($1, $2)', [aliceEntry, 'drive-bob-intrusion'])
			)
		);
		expect(error.message).toMatch(/does not exist or is not yours/i);

		const photos = await readPhotos(aliceEntry);
		expect(photos.map((p) => p.drive_file_id)).not.toContain('drive-bob-intrusion');
	});

	test('adding a photo to an unflagged entry leaves its status alone', async () => {
		// Self-contained so it cannot perturb the assertions above.
		const entryId = await createEntry(alice, {
			driveFileId: 'drive-alice-plain-1',
			sectionId: sectionA,
			label: 'Second bench page'
		});
		const { rows } = await db.asUser(alice.id, (q) =>
			q<{ result: { status: string } }>('select public.notebook_add_photo($1, $2) as result', [
				entryId,
				'drive-alice-plain-2'
			])
		);
		expect(rows[0].result.status).toBe('compliant');
		expect((await readEntry(entryId)).status).toBe('compliant');
	});
});
