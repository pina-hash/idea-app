// tests/notebook-entry-photo-rule.test.ts
//
// 0075 makes the photo CONDITIONAL: a free-form entry may be a written note
// with no photo at all, while a session-linked entry -- a check-in an
// instructor scheduled because they asked for a page -- still requires one.
//
// WHY THIS IS WORTH A TEST rather than a browser pass. The rule spans two
// tables and lives in one plpgsql branch, so no constraint enforces it and
// nothing visibly breaks if it inverts: a regression that let a check-in be
// filed empty would look exactly like a working notebook until someone tried
// to grade it. Both halves are asserted, so relaxing the session side or
// tightening the free side turns this file red.
//
// The fixture is the real embedded Postgres with the real migration files
// applied (tests/db/harness.ts); every call runs as `authenticated` with the
// request.jwt.claims GUC set, the way PostgREST issues one.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

let db: TestDb;
let student: SeededUser;
let sectionId: string;
let sessionId: string;

beforeAll(async () => {
	db = await startTestDb();
	student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
	const teacher = await createUser(db, 'chair@boscotech.edu', 'Dana Chair');

	// Since 0094 the notebook hangs off a CLASSROOM section, and "the
	// instructor" is its teacher of record. Created through the real 0082 RPC.
	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: teacher.email
	});

	const session = await db.sql<{ id: string }>(
		`insert into public.notebook_sessions (section_id, unit_number, session_date, session_label)
		 values ($1, 3, current_date, 'Bearing teardown') returning id`,
		[sectionId]
	);
	sessionId = session.rows[0].id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/** notebook_create_entry, called by name exactly as the API routes call it. */
function createEntry(
	args: {
		file?: string | null;
		session?: string | null;
		section?: string | null;
		label?: string | null;
		filename?: string | null;
	} = {}
) {
	return db.asUser(student.id, (q) =>
		q<{ entry: { entry_id: string; photo_id: string | null } }>(
			`select public.notebook_create_entry(
				p_student_id => $1,
				p_drive_file_id => $2,
				p_session_id => $3,
				p_section_id => $4,
				p_custom_label => $5,
				p_original_filename => $6
			) as entry`,
			[
				student.id,
				args.file ?? null,
				args.session ?? null,
				args.section ?? null,
				args.label ?? null,
				args.filename ?? null
			]
		)
	);
}

function photoCount(entryId: string) {
	return db
		.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entry_photos where entry_id = $1`,
			[entryId]
		)
		.then((r) => Number(r.rows[0].n));
}

describe('notebook_create_entry: the photo is conditional on the tier', () => {
	it('replaced the 0071 function rather than adding an overload', async () => {
		// A defaulted-parameter change keys on the same argument list, so there
		// must still be exactly ONE notebook_create_entry. (0068's lesson was
		// about ADDING a parameter; this asserts it does not apply here.)
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_create_entry'`
		);
		expect(Number(rows[0].n)).toBe(1);
	});

	it('accepts a free-form entry with only a label, and stores no photo', async () => {
		const { rows } = await createEntry({ label: 'Talked through the gearbox ratio' });
		const entry = rows[0].entry;
		expect(entry.entry_id).toBeTruthy();
		expect(entry.photo_id).toBeNull();
		expect(await photoCount(entry.entry_id)).toBe(0);

		const stored = await db.sql<{ custom_label: string; session_id: string | null }>(
			`select custom_label, session_id from public.notebook_entries where id = $1`,
			[entry.entry_id]
		);
		expect(stored.rows[0].custom_label).toBe('Talked through the gearbox ratio');
		expect(stored.rows[0].session_id).toBeNull();
	});

	it('still REJECTS a session-linked entry with no photo', async () => {
		await expect(createEntry({ session: sessionId })).rejects.toThrow(
			/Drive file id is required/i
		);
		// Rejected outright: no half-made entry left behind.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where session_id = $1`,
			[sessionId]
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	it('rejects a session-linked entry with a label but no photo', async () => {
		// A label is NOT a substitute on the session tier: the instructor asked
		// for a page, and only the free tier accepts a label in place of one.
		await expect(
			createEntry({ session: sessionId, label: 'forgot my notebook' })
		).rejects.toThrow(/Drive file id is required/i);
	});

	it('still accepts a session-linked entry WITH a photo', async () => {
		const { rows } = await createEntry({ session: sessionId, file: 'drive-abc123' });
		const entry = rows[0].entry;
		expect(entry.photo_id).toBeTruthy();
		expect(await photoCount(entry.entry_id)).toBe(1);
		const stored = await db.sql<{ section_id: string }>(
			`select section_id from public.notebook_entries where id = $1`,
			[entry.entry_id]
		);
		// The section still follows the session, untouched by 0075.
		expect(stored.rows[0].section_id).toBe(sectionId);
	});

	it('still accepts a fully unlabeled free entry that has a photo (0071)', async () => {
		const { rows } = await createEntry({ file: 'drive-unlabeled' });
		expect(await photoCount(rows[0].entry.entry_id)).toBe(1);
	});

	it('rejects a free entry with neither a photo nor a label', async () => {
		await expect(createEntry({})).rejects.toThrow(/needs a photo or a label/i);
		// Whitespace is not a label: btrim collapses it to nothing.
		await expect(createEntry({ label: '   ' })).rejects.toThrow(/needs a photo or a label/i);
	});

	it('still refuses to create an entry for someone else', async () => {
		const other = await createUser(db, 'someone.else@boscotech.net', 'Someone Else');
		await expect(
			db.asUser(student.id, (q) =>
				q(`select public.notebook_create_entry(p_student_id => $1, p_custom_label => 'note')`, [
					other.id
				])
			)
		).rejects.toThrow(/your own account/i);
	});
});

describe('notebook_add_photo: an entry with zero photos is a normal target', () => {
	it('adds the FIRST photo to a note-only entry at sequence_order 1', async () => {
		const { rows } = await createEntry({ label: 'Note that gets a photo later' });
		const entryId = rows[0].entry.entry_id;
		expect(await photoCount(entryId)).toBe(0);

		const added = await db.asUser(student.id, (q) =>
			q<{ photo: { photo_id: string; sequence_order: number } }>(
				`select public.notebook_add_photo(
					p_entry_id => $1, p_drive_file_id => $2,
					p_variant => 'original', p_original_filename => $3
				) as photo`,
				[entryId, 'drive-late-1', 'page-one.jpg']
			)
		);
		expect(added.rows[0].photo.sequence_order).toBe(1);
		expect(await photoCount(entryId)).toBe(1);

		// And the next one continues from there, so a note-only start does not
		// leave a gap or a collision in the sequence.
		const second = await db.asUser(student.id, (q) =>
			q<{ photo: { sequence_order: number } }>(
				`select public.notebook_add_photo(
					p_entry_id => $1, p_drive_file_id => $2
				) as photo`,
				[entryId, 'drive-late-2']
			)
		);
		expect(second.rows[0].photo.sequence_order).toBe(2);
		expect(await photoCount(entryId)).toBe(2);
	});
});
