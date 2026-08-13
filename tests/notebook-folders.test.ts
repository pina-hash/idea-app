// tests/notebook-folders.test.ts
//
// 0088 gives a student folders to organize their own notebook with. Almost
// none of it is worth a test -- a folder is decoration over a feed, and a
// broken rail is visible the moment anyone looks at it.
//
// THREE THINGS ARE NOT, and they are why this file exists. Each fails
// SILENTLY: the notebook keeps working, the UI keeps rendering, and nobody
// finds out.
//
//   1. WHOSE FOLDER AN ENTRY CAN BE FILED INTO. 0088 answers this with a
//      COMPOSITE foreign key on (folder_id, student_id) rather than with a
//      check inside an RPC, which is the whole reason it is trustworthy:
//      filing into somebody else's folder is unrepresentable, not merely
//      refused. Degrade that to a plain reference to (id) and every RPC still
//      passes its own checks, so nothing observable changes.
//   2. WHO CAN READ A FOLDER NAME. Staff see a folder only through an entry
//      they can already read. Open that policy up and the app looks identical
//      while every student's folder names become readable by every other
//      student.
//   3. THE OVERLOAD TRAP. Both creating RPCs gained a parameter, so both had
//      to be DROPPED at their old signature first. Skip the drop and the old
//      arity stays callable as a second overload -- one that knows nothing
//      about folders and silently ignores the one the student picked.
//
// Deliberately NOT covered: which folder the picker defaults to, how the rail
// counts, what search matches. Those are pure functions and a dev harness, and
// pulling them in here would dilute what a red run means.
//
// The fixture is the real embedded Postgres with the real migration files
// applied (tests/db/harness.ts); every client call runs as `authenticated`
// with the request.jwt.claims GUC set, the way PostgREST issues one.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	MIGRATIONS,
	createClassroomSection,
	createUser,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/** The notebook chain, plus folders. */
const CHAIN = [...MIGRATIONS] as const;

let db: TestDb;
let ada: SeededUser; // student
let ben: SeededUser; // a DIFFERENT student
let instructor: SeededUser; // teaches Ada's section
let outsider: SeededUser; // @boscotech.edu, teaches nothing
let chair: SeededUser; // the 0067 admin tier
let sectionId: string;

/** Ada's folders. */
let gearbox: string;
let empty: string;
/** Ben's folder, for the cross-student cases. */
let bensFolder: string;

async function newFolder(owner: SeededUser, name: string, color: string | null = null) {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_folders (student_id, name, color) values ($1, $2, $3) returning id`,
		[owner.id, name, color]
	);
	return rows[0].id;
}

/** A free-form entry owned by `owner`, optionally filed. */
async function newEntry(owner: SeededUser, label: string, folderId: string | null = null) {
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries (student_id, custom_label, folder_id)
		 values ($1, $2, $3) returning id`,
		[owner.id, label, folderId]
	);
	return rows[0].id;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	ada = await createUser(db, 'ada.pike@boscotech.net', 'Ada Pike');
	ben = await createUser(db, 'ben.okafor@boscotech.net', 'Ben Okafor');
	instructor = await createUser(db, 'instructor@boscotech.edu', 'Ines Tructor');
	outsider = await createUser(db, 'outsider@boscotech.edu', 'Otto Sider');
	chair = await createUser(db, 'apina@boscotech.edu', 'A Pina'); // the pinned owner

	// Since 0094 the notebook hangs off a CLASSROOM section, and "the
	// instructor" is its teacher of record. Created through the real 0082 RPC.
	sectionId = await createClassroomSection(db, {
		as: instructor,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: instructor.email
	});

	gearbox = await newFolder(ada, 'Gearbox build', 'clay');
	empty = await newFolder(ada, 'Nothing in here');
	bensFolder = await newFolder(ben, 'Ben only');
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------

describe('the overload trap: both creating RPCs were dropped, not just replaced', () => {
	it.each([['notebook_create_entry'], ['notebook_create_note_entry']])(
		'%s exists exactly once',
		async (name) => {
			// Adding a parameter changes the real signature, so `create or
			// replace` alone leaves the OLD arity callable as a second overload
			// -- one that ignores p_folder_id entirely. A count above 1 means
			// the drop was skipped and filing silently stops working for any
			// caller that still passes the old argument list.
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(Number(rows[0].n)).toBe(1);
		}
	);
});

describe('an entry can only be filed into its OWN owner’s folder', () => {
	it('the composite FK refuses it even with RLS out of the way', async () => {
		// The decisive case, and the reason the constraint is composite. This
		// runs as the CONNECTION OWNER -- no RLS, no RPC, no application check
		// of any kind -- so the only thing that can refuse it is the foreign
		// key itself. A plain reference to notebook_folders(id) would accept
		// this row happily.
		const entryId = await newEntry(ada, 'Ada’s page');
		await expect(
			db.sql(`update public.notebook_entries set folder_id = $1 where id = $2`, [
				bensFolder,
				entryId
			])
		).rejects.toMatchObject({ code: '23503' });
	});

	it('notebook_move_entries refuses a folder that is not the caller’s', async () => {
		const entryId = await newEntry(ada, 'Another page');
		await expect(
			db.asUser(ada.id, (q) =>
				q(`select public.notebook_move_entries(p_entry_ids => $1, p_folder_id => $2)`, [
					[entryId],
					bensFolder
				])
			)
		).rejects.toThrow(/does not exist or is not yours/i);
	});

	it('notebook_create_entry refuses one, and writes nothing', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where student_id = $1`,
			[ada.id]
		);
		await expect(
			db.asUser(ada.id, (q) =>
				q(
					`select public.notebook_create_entry(
						p_student_id => $1, p_drive_file_id => 'drive-x', p_folder_id => $2)`,
					[ada.id, bensFolder]
				)
			)
		).rejects.toThrow(/does not exist or is not yours/i);
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where student_id = $1`,
			[ada.id]
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});

	it('notebook_create_note_entry refuses one too', async () => {
		await expect(
			db.asUser(ada.id, (q) =>
				q(
					`select public.notebook_create_note_entry(
						p_content => $1::jsonb, p_folder_id => $2)`,
					[JSON.stringify([{ type: 'p', runs: [{ text: 'hello' }] }]), bensFolder]
				)
			)
		).rejects.toThrow(/does not exist or is not yours/i);
	});

	it('a move cannot reach another student’s ENTRY at all', async () => {
		// Not an error: the WHERE clause simply does not match, and the count
		// coming back is what actually moved -- so a caller can tell.
		const bensEntry = await newEntry(ben, 'Ben’s page');
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { moved: number; requested: number } }>(
				`select public.notebook_move_entries(p_entry_ids => $1, p_folder_id => $2) as result`,
				[[bensEntry], gearbox]
			)
		);
		expect(rows[0].result).toMatchObject({ requested: 1, moved: 0 });

		const check = await db.sql<{ folder_id: string | null }>(
			`select folder_id from public.notebook_entries where id = $1`,
			[bensEntry]
		);
		expect(check.rows[0].folder_id).toBeNull();
	});
});

describe('who can read a folder', () => {
	let filed: string;

	beforeAll(async () => {
		// An entry of Ada's, in Gearbox, in the instructor's section: the only
		// thing that should make that folder visible to staff.
		filed = await newEntry(ada, 'Filed page', gearbox);
		await db.sql(`update public.notebook_entries set section_id = $1 where id = $2`, [
			sectionId,
			filed
		]);
	});

	it('the owner reads their own, and only their own', async () => {
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_folders order by name`)
		);
		expect(rows.map((r) => r.id).sort()).toEqual([gearbox, empty].sort());
	});

	it('another student reads none of them, by list or by id', async () => {
		const list = await db.asUser(ben.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_folders where student_id = $1`, [ada.id])
		);
		expect(list.rows).toHaveLength(0);

		// By id is the case that matters: an id is guessable in a way a list is
		// not, and RLS must answer the same way either way.
		const byId = await db.asUser(ben.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_folders where id = $1`, [gearbox])
		);
		expect(byId.rows).toHaveLength(0);
	});

	it('the section instructor reads a folder they can see an entry in', async () => {
		const { rows } = await db.asUser(instructor.id, (q) =>
			q<{ name: string }>(`select name from public.notebook_folders where id = $1`, [gearbox])
		);
		expect(rows.map((r) => r.name)).toEqual(['Gearbox build']);
	});

	it('but NOT an empty one — there is no entry to give it context', async () => {
		const { rows } = await db.asUser(instructor.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_folders where id = $1`, [empty])
		);
		expect(rows).toHaveLength(0);
	});

	it('a teacher who teaches nothing reads none of them', async () => {
		const { rows } = await db.asUser(outsider.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_folders`)
		);
		expect(rows).toHaveLength(0);
	});

	it('the chair tier reads it, through the same delegation', async () => {
		const { rows } = await db.asUser(chair.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_folders where id = $1`, [gearbox])
		);
		expect(rows.map((r) => r.id)).toEqual([gearbox]);
	});

	it('unfiling the last entry takes the folder back out of staff view', async () => {
		// Proves the staff policy is really reading through the ENTRY rather
		// than having quietly become "any signed-in teacher".
		await db.sql(`update public.notebook_entries set folder_id = null where id = $1`, [filed]);
		const { rows } = await db.asUser(instructor.id, (q) =>
			q<{ id: string }>(`select id from public.notebook_folders where id = $1`, [gearbox])
		);
		expect(rows).toHaveLength(0);
		await db.sql(`update public.notebook_entries set folder_id = $1 where id = $2`, [
			gearbox,
			filed
		]);
	});
});

describe('there is no client write path to notebook_folders', () => {
	const actors = () => [
		['a student', ada],
		['an instructor', instructor],
		['the chair', chair]
	] as const;

	for (const [who, user] of [
		['a student', () => ada],
		['an instructor', () => instructor],
		['the chair', () => chair]
	] as const) {
		it(`${who} cannot INSERT, UPDATE or DELETE directly`, async () => {
			const actor = user();
			await expect(
				db.asUser(actor.id, (q) =>
					q(`insert into public.notebook_folders (student_id, name) values ($1, 'Sneaky')`, [
						actor.id
					])
				)
			).rejects.toMatchObject({ code: '42501' });

			await expect(
				db.asUser(actor.id, (q) =>
					q(`update public.notebook_folders set name = 'Renamed' where id = $1`, [gearbox])
				)
			).rejects.toMatchObject({ code: '42501' });

			await expect(
				db.asUser(actor.id, (q) =>
					q(`delete from public.notebook_folders where id = $1`, [gearbox])
				)
			).rejects.toMatchObject({ code: '42501' });
		});
	}

	it('and none of the folder RPCs are reachable by anon', async () => {
		const { rows } = await db.sql<{ fn: string; granted: boolean }>(
			`select fn, has_function_privilege('anon', fn, 'EXECUTE') as granted
			 from unnest(array[
				'public.notebook_upsert_folder(text,text,uuid)',
				'public.notebook_delete_folder(uuid)',
				'public.notebook_move_entries(uuid[],uuid)'
			 ]) as fn`
		);
		expect(rows).toHaveLength(3);
		for (const row of rows) expect(row.granted).toBe(false);
		void actors;
	});
});

describe('deleting a folder unfiles its entries — it never deletes them', () => {
	it('keeps every entry, its photos and its notes', async () => {
		const doomed = await newFolder(ada, 'To be deleted');
		const a = await newEntry(ada, 'Kept A', doomed);
		const b = await newEntry(ada, 'Kept B', doomed);
		await db.sql(
			`insert into public.notebook_entry_photos (entry_id, drive_file_id, sequence_order)
			 values ($1, 'drive-keep', 1)`,
			[a]
		);
		// 0078's `notebook_entry_notes_root` CHECK requires note_id = id on
		// revision 1 and fires at INSERT, so the id is minted up front rather
		// than patched afterwards.
		await db.sql(
			`insert into public.notebook_entry_notes (id, entry_id, note_id, revision, content, author_id)
			 select v.id, $1, v.id, 1, $2::jsonb, $3 from (select gen_random_uuid() as id) v`,
			[b, JSON.stringify([{ type: 'p', runs: [{ text: 'kept' }] }]), ada.id]
		);

		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { ok: boolean; unfiled_entries: number } }>(
				`select public.notebook_delete_folder(p_folder_id => $1) as result`,
				[doomed]
			)
		);
		expect(rows[0].result).toMatchObject({ ok: true, unfiled_entries: 2 });

		const gone = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_folders where id = $1`,
			[doomed]
		);
		expect(gone.rows[0].n).toBe('0');

		const kept = await db.sql<{ id: string; folder_id: string | null }>(
			`select id, folder_id from public.notebook_entries where id = any($1) order by custom_label`,
			[[a, b]]
		);
		expect(kept.rows).toHaveLength(2);
		expect(kept.rows.every((r) => r.folder_id === null)).toBe(true);

		const photos = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entry_photos where entry_id = $1`,
			[a]
		);
		expect(photos.rows[0].n).toBe('1');
		const notes = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entry_notes where entry_id = $1`,
			[b]
		);
		expect(notes.rows[0].n).toBe('1');
	});

	it('refuses somebody else’s folder', async () => {
		await expect(
			db.asUser(ben.id, (q) =>
				q(`select public.notebook_delete_folder(p_folder_id => $1)`, [gearbox])
			)
		).rejects.toThrow(/does not exist or is not yours/i);
	});
});

describe('folder names are unique per student', () => {
	it('a duplicate is a structured refusal, not an exception', async () => {
		// The one failure ordinary use reaches, which is why it comes back as
		// data the form can render beside the field rather than as a raise.
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { ok: boolean; reason?: string } }>(
				`select public.notebook_upsert_folder(p_name => $1) as result`,
				['  gearbox BUILD ']
			)
		);
		expect(rows[0].result).toMatchObject({ ok: false, reason: 'duplicate_name' });
	});

	it('a DIFFERENT student may use the same name', async () => {
		const { rows } = await db.asUser(ben.id, (q) =>
			q<{ result: { ok: boolean } }>(
				`select public.notebook_upsert_folder(p_name => 'Gearbox build') as result`
			)
		);
		expect(rows[0].result.ok).toBe(true);
	});

	it('renaming a folder to its own name is allowed', async () => {
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { ok: boolean } }>(
				`select public.notebook_upsert_folder(
					p_name => 'Gearbox build', p_color => 'sky', p_folder_id => $1) as result`,
				[gearbox]
			)
		);
		expect(rows[0].result.ok).toBe(true);
	});

	it('and the unique index holds even with the RPC bypassed', async () => {
		await expect(
			db.sql(`insert into public.notebook_folders (student_id, name) values ($1, 'GEARBOX BUILD')`, [
				ada.id
			])
		).rejects.toMatchObject({ code: '23505' });
	});
});

describe('filing at creation actually files', () => {
	it('notebook_create_entry stores the folder', async () => {
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { entry_id: string; folder_id: string | null } }>(
				`select public.notebook_create_entry(
					p_student_id => $1, p_drive_file_id => 'drive-filed', p_folder_id => $2) as result`,
				[ada.id, gearbox]
			)
		);
		expect(rows[0].result.folder_id).toBe(gearbox);
		const stored = await db.sql<{ folder_id: string | null }>(
			`select folder_id from public.notebook_entries where id = $1`,
			[rows[0].result.entry_id]
		);
		expect(stored.rows[0].folder_id).toBe(gearbox);
	});

	it('notebook_create_note_entry stores it too', async () => {
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { entry_id: string; folder_id: string | null } }>(
				`select public.notebook_create_note_entry(
					p_content => $1::jsonb, p_folder_id => $2) as result`,
				[JSON.stringify([{ type: 'p', runs: [{ text: 'a filed note' }] }]), gearbox]
			)
		);
		expect(rows[0].result.folder_id).toBe(gearbox);
		const stored = await db.sql<{ folder_id: string | null }>(
			`select folder_id from public.notebook_entries where id = $1`,
			[rows[0].result.entry_id]
		);
		expect(stored.rows[0].folder_id).toBe(gearbox);
	});

	it('a bulk move files several entries in one call', async () => {
		const ids = [
			await newEntry(ada, 'Bulk 1'),
			await newEntry(ada, 'Bulk 2'),
			await newEntry(ada, 'Bulk 3')
		];
		const { rows } = await db.asUser(ada.id, (q) =>
			q<{ result: { moved: number } }>(
				`select public.notebook_move_entries(p_entry_ids => $1, p_folder_id => $2) as result`,
				[ids, gearbox]
			)
		);
		expect(rows[0].result.moved).toBe(3);

		// And unfiling is the same call with no folder.
		const back = await db.asUser(ada.id, (q) =>
			q<{ result: { moved: number } }>(
				`select public.notebook_move_entries(p_entry_ids => $1, p_folder_id => null) as result`,
				[ids]
			)
		);
		expect(back.rows[0].result.moved).toBe(3);
		const check = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries
			 where id = any($1) and folder_id is null`,
			[ids]
		);
		expect(check.rows[0].n).toBe('3');
	});
});

/**
 * Migrations here are applied BY HAND in the Supabase SQL editor, so a second
 * run is an ordinary thing that happens -- somebody re-pastes the file, or a
 * first attempt failed partway and gets retried. A migration that only works
 * once fails at exactly that moment, with the schema half-built.
 *
 * This is not hypothetical: the first cut of 0088 used the drop-then-add
 * pattern for `notebook_folders_id_student_key`, which the entries' composite
 * foreign key depends on, so re-running it raised 2BP01 and aborted the rest
 * of the file.
 */
describe('the migration re-applies cleanly over its own objects', () => {
	it('runs a second time, and the schema still behaves', async () => {
		const path = fileURLToPath(
			new URL('../supabase/migrations/0088_notebook_folders.sql', import.meta.url)
		);
		await expect(db.sql(readFileSync(path, 'utf8'))).resolves.toBeDefined();

		// Not merely "it did not throw": the guarantees the file exists for have
		// to survive the re-run, with real filed rows already in the table.
		const filed = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entries where folder_id is not null`
		);
		expect(Number(filed.rows[0].n)).toBeGreaterThan(0);

		// The composite FK is still the composite one.
		await expect(
			db.sql(`update public.notebook_entries set folder_id = $1 where student_id = $2`, [
				bensFolder,
				ada.id
			])
		).rejects.toMatchObject({ code: '23503' });

		// And still exactly one of each creating RPC.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('notebook_create_entry', 'notebook_create_note_entry')`
		);
		expect(Number(rows[0].n)).toBe(2);
	});
});
