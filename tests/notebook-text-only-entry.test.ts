// tests/notebook-text-only-entry.test.ts
//
// 0114: a notebook entry may be WRITING, on a scheduled check-in as well as on
// the free-form path. Real Postgres, real migrations, applied unmodified.
//
// WHY THIS EARNS A TEST. The bug it fixes was reported from a classroom on the
// first day of school -- students could not submit an entry without a photo --
// and the shape of that bug is exactly the shape this suite guards against: a
// rule enforced in four places, three of which look fine on their own. The
// composer, the upload route, and the two creating RPCs each had a defensible
// reason to want a photo, and between them there was no way to answer a
// check-in in writing at all.
//
// So what is asserted here is the SEAM, not the happy path: that the note door
// now reaches a check-in, that the section it lands on is the one the composite
// FK will accept, that the entry it makes is counted by the grid exactly like a
// photographed one (the downstream assumption a zero-photo entry would break
// silently), and that "nothing at all" is still refused -- by BOTH doors, with
// a message that names writing rather than a Drive file id.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

let db: TestDb;
let student: SeededUser;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let sectionId: string;
let otherSectionId: string;
let sessionId: string;

/** The canonical doc shape, as src/lib/notebook-notes.ts defines it. */
const doc = (text: string) => JSON.stringify([{ type: 'p', runs: [{ text }] }]);

/** Calls an RPC the way PostgREST does: named parameters, as `authenticated`. */
function rpc<T = Record<string, string>>(
	userId: string,
	fn: string,
	args: Record<string, unknown>
): Promise<T> {
	const names = Object.keys(args);
	const placeholders = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select public.${fn}(${placeholders}) as result`, [
			...names.map((n) => args[n])
		]);
		return rows[0].result;
	});
}

async function photoCount(entryId: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text as n from public.notebook_entry_photos where entry_id = $1`,
		[entryId]
	);
	return Number(rows[0].n);
}

async function noteCount(entryId: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text as n from public.notebook_entry_notes where entry_id = $1`,
		[entryId]
	);
	return Number(rows[0].n);
}

beforeAll(async () => {
	db = await startTestDb();
	student = await createUser(db, 'nadia.ortiz@boscotech.net', 'Nadia Ortiz');
	teacher = await createUser(db, 'jbuilder@boscotech.edu', 'J Builder');
	otherTeacher = await createUser(db, 'kmartin@boscotech.edu', 'K Martin');

	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: teacher.email
	});
	otherSectionId = await createClassroomSection(db, {
		as: otherTeacher,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 4',
		teacherEmail: otherTeacher.email
	});
	await enrollStudent(db, {
		as: teacher,
		sectionId,
		email: student.email,
		displayName: 'Ortiz, Nadia'
	});

	// A check-in posted to Period 2 only, through the real 0098 RPC.
	const session = await db.asUser(teacher.id, (q) =>
		q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1::uuid[], $2, $3, $4) as result',
			[[sectionId], 4, '2026-10-20', 'Gearbox build']
		)
	);
	sessionId = session.rows[0].result.session_id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('a check-in can be answered in writing', () => {
	it('creates the entry and its first note in one call, with no photo', async () => {
		const result = await rpc<{
			entry_id: string;
			note_id: string;
			session_id: string;
			section_id: string;
		}>(student.id, 'notebook_create_note_entry', {
			p_content: doc('Forgot my notebook, so I worked the ratio out on the whiteboard.'),
			p_session_id: sessionId
		});

		expect(result.entry_id).toBeTruthy();
		expect(result.note_id).toBeTruthy();
		// The check-in it answers, and the class that check-in runs in -- resolved
		// server-side rather than taken on trust from the caller.
		expect(result.session_id).toBe(sessionId);
		expect(result.section_id).toBe(sectionId);

		const { rows } = await db.sql<{ session_id: string; section_id: string; status: string }>(
			`select session_id, section_id, status from public.notebook_entries where id = $1`,
			[result.entry_id]
		);
		expect(rows[0].session_id).toBe(sessionId);
		expect(rows[0].section_id).toBe(sectionId);
		expect(rows[0].status).toBe('compliant');

		// The whole point: zero photos, one note, one entry.
		expect(await photoCount(result.entry_id)).toBe(0);
		expect(await noteCount(result.entry_id)).toBe(1);
	});

	it('lands on the section the composite FK accepts, and refuses one it would not', async () => {
		// The pair is what notebook_entries keys on. A section that check-in is
		// NOT posted to has to be refused by the resolver rather than reaching the
		// insert and failing on a foreign key.
		await expect(
			rpc(student.id, 'notebook_create_note_entry', {
				p_content: doc('Filed against a class this check-in does not run in.'),
				p_session_id: sessionId,
				p_section_id: otherSectionId
			})
		).rejects.toThrow(/does not run in that section/i);

		// And an explicit, CORRECT section is honoured rather than ignored.
		const ok = await rpc<{ section_id: string }>(student.id, 'notebook_create_note_entry', {
			p_content: doc('Filed against the class whose button was pressed.'),
			p_session_id: sessionId,
			p_section_id: sectionId
		});
		expect(ok.section_id).toBe(sectionId);
	});

	it('still creates a free-form note with no session at all', async () => {
		// The path 0078 shipped, unchanged: adding a parameter must not have made
		// the check-in mandatory.
		const result = await rpc<{ entry_id: string; session_id: string | null }>(
			student.id,
			'notebook_create_note_entry',
			{ p_content: doc('Measured the bench spacing.'), p_custom_label: 'Shop layout' }
		);
		expect(result.session_id).toBeNull();
		const { rows } = await db.sql<{ session_id: string | null; custom_label: string }>(
			`select session_id, custom_label from public.notebook_entries where id = $1`,
			[result.entry_id]
		);
		expect(rows[0].session_id).toBeNull();
		expect(rows[0].custom_label).toBe('Shop layout');
		expect(await photoCount(result.entry_id)).toBe(0);
	});

	it('replaced the four-argument form rather than adding an overload', async () => {
		// A defaulted TRAILING parameter is an added parameter, not a re-defaulted
		// one: two overloads differing only by it leave PostgREST unable to
		// resolve the call at all, so every note would fail rather than the new
		// shape alone. The old arity is dropped, so there must be exactly one.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'notebook_create_note_entry'`
		);
		expect(Number(rows[0].n)).toBe(1);
	});
});

describe('a text-only check-in is counted like any other', () => {
	it('fills its cell in the section grid, which counts entries and not photos', async () => {
		// THE DOWNSTREAM ASSUMPTION MOST LIKELY TO FAIL SILENTLY. If anything
		// between the entry and the grid keyed "filed" off a photo, a student who
		// answered in writing would read as missing -- and would be marked as
		// missing on a Documentation Check, which is a real grade.
		const written = await rpc<{ entry_id: string }>(student.id, 'notebook_create_note_entry', {
			p_content: doc('Wrote up the belt tension steps; no page to shoot yet.'),
			p_session_id: sessionId
		});

		const grid = await db.asUser(teacher.id, (q) =>
			q<{ result: { students: { student_key: string }[]; cells: Record<string, unknown>[] } }>(
				'select public.notebook_get_section_grid($1, null) as result',
				[sectionId]
			)
		);
		const cells = grid.rows[0].result.cells.filter(
			(c) => c.session_id === sessionId && c.student_key === student.email
		);
		expect(cells).toHaveLength(1);
		const cell = cells[0] as {
			status: string;
			entry_id: string | null;
			entry_count: number;
			on_time: boolean | null;
		};
		expect(cell.status).toBe('compliant');
		expect(cell.on_time).toBe(true);
		// The latest of everything filed against this check-in, including the
		// written ones -- so the count is what a photo-blind grid would report.
		expect(cell.entry_id).toBe(written.entry_id);
		expect(cell.entry_count).toBeGreaterThanOrEqual(1);
	});

	it('is readable by the section instructor, exactly like a photographed one', async () => {
		// 0106's staff read is about who the AUTHOR is, not what the entry holds;
		// pinned here so a zero-photo entry cannot become invisible to review.
		const written = await rpc<{ entry_id: string }>(student.id, 'notebook_create_note_entry', {
			p_content: doc('Reviewer has to be able to read this.'),
			p_session_id: sessionId
		});
		const seen = await db.asUser(teacher.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_entries where id = $1`, [written.entry_id])
		);
		expect(seen.rows).toHaveLength(1);
		const notes = await db.asUser(teacher.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_entry_notes where entry_id = $1`, [
				written.entry_id
			])
		);
		expect(notes.rows).toHaveLength(1);
	});
});

describe('an entry with neither a photo nor writing is still refused', () => {
	it('refuses a check-in with no photo, naming writing rather than a Drive file id', async () => {
		// notebook_create_entry is the PHOTO door and still requires one -- its
		// only content IS a photo. What 0114 changed is what it says: the old
		// message named our storage vendor and one of the two ways out.
		const attempt = rpc(student.id, 'notebook_create_entry', {
			p_student_id: student.id,
			p_session_id: sessionId,
			p_section_id: sectionId
		});
		await expect(attempt).rejects.toThrow(/nothing in it/i);
		await expect(attempt).rejects.toThrow(/write a note/i);
		await expect(attempt).rejects.not.toThrow(/drive file id/i);
	});

	it('refuses a free-form entry with no photo and no title, naming all three ways out', async () => {
		const attempt = rpc(student.id, 'notebook_create_entry', { p_student_id: student.id });
		await expect(attempt).rejects.toThrow(/nothing in it/i);
		await expect(attempt).rejects.toThrow(/photo.*write.*title/i);
	});

	it('refuses an empty note on a check-in, and leaves no half-made entry behind', async () => {
		// The note door's own "nothing in it": an empty document is not writing.
		// It has to be refused BEFORE the entry insert, or a check-in answered
		// with nothing would still read as filed on the grid.
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where student_id = $1`,
			[student.id]
		);
		await expect(
			rpc(student.id, 'notebook_create_note_entry', {
				p_content: JSON.stringify([]),
				p_session_id: sessionId
			})
		).rejects.toThrow(/not a valid note/i);
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where student_id = $1`,
			[student.id]
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});
});

describe('the boundary is unchanged', () => {
	it('creates for the caller only, whatever session is named', async () => {
		const intruder = await createUser(db, 'wes.kane@boscotech.net', 'Wes Kane');
		const result = await rpc<{ entry_id: string }>(intruder.id, 'notebook_create_note_entry', {
			p_content: doc('Filed by me, for me.'),
			p_session_id: sessionId
		});
		const { rows } = await db.sql<{ student_id: string }>(
			`select student_id from public.notebook_entries where id = $1`,
			[result.entry_id]
		);
		// The RPC takes no student id at all -- the caller IS the owner, which is
		// a property of the signature rather than a check that could be got wrong.
		expect(rows[0].student_id).toBe(intruder.id);
	});

	it('grants anon nothing', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select has_function_privilege('anon',
			   'public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid)', 'execute') as ok`
		);
		expect(rows[0].ok).toBe(false);
	});
});
