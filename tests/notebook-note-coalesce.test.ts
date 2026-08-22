// tests/notebook-note-coalesce.test.ts
//
// 0129 makes the composer's autosave REPLACE the head revision in place
// instead of appending one per keystroke burst, and collapses the chains
// already written since the autosave shipped.
//
// WHY THIS FILE EXISTS, and it is two different silent failures.
//
//   1. THE PREDICATE. A replacement OVERWRITES stored words. If it fires one
//      condition too wide -- across a boundary somebody deliberately stamped,
//      on a submitted entry an instructor can read, on somebody else's note --
//      the version that mattered is simply gone, with nothing raised anywhere
//      and no way to tell afterwards. Every test below that asserts an APPEND
//      is aimed at exactly that, and each names the revision count that must
//      be present beside the content that must have survived.
//   2. THE BACKFILL, which DELETES ROWS AND IS NOT REVERSIBLE. It is driven
//      against data seeded through the REAL pre-0129 RPCs on a chain booted
//      short of the file, then has the file applied over the top -- because a
//      backfill tested only against a reset chain has never met the shape it
//      exists for. The fixture carries a long autosave chain that must
//      collapse to one row AND a hand-authored chain that must come out
//      byte-identical, so a backfill that is too greedy fails just as loudly
//      as one that does nothing.
//
// THE CHAIN RULE FROM 0119 IS RE-ASSERTED HERE RATHER THAN ASSUMED. Deleting
// a note marks every row sharing note_id; coalescing changes how many rows
// that is. Both `describe`s end by deleting a coalesced note and counting
// marked rows against live ones, with a positive control (a second, untouched
// chain on the same entry) so an absence assertion cannot pass vacuously.
//
// TIMESTAMPS ARE REWRITTEN AS THE OWNER AFTER SEEDING, and that is deliberate
// rather than a shortcut. `created_at` is server-set (no RPC takes it), so the
// only way to build a fixture whose gaps are 3 seconds in one chain and 10
// minutes in another is to stamp them afterwards -- and pinning them to fixed
// instants is also what keeps the backfill's own cutoff from depending on what
// the machine's clock happens to read on the day the suite runs.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { noteThreads, deletedNoteThreads, type NotebookNoteRow } from '../src/lib/notebook-notes';

/** Everything 0129 depends on, in order. 0119 is the last rung below it. */
const PRE_CHAIN = [
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
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0119_notebook_note_delete.sql'
] as const;

const FULL_CHAIN = [...PRE_CHAIN, '0129_notebook_note_coalesce.sql'] as const;

const MIGRATION_0129 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0129_notebook_note_coalesce.sql'),
	'utf8'
);

/** The instant a0d43ba (the autosave bundle) is dated, which 0129 cuts on. */
const CUTOFF = '2026-08-22T11:26:10.000Z';
/** Comfortably after it: where the "already turned in since a0d43ba" rows sit. */
const AFTER = Date.parse('2026-08-22T18:00:00.000Z');
/** Comfortably before it: rows only a person could have written. */
const BEFORE = Date.parse('2026-08-20T09:00:00.000Z');

function doc(text: string) {
	return JSON.stringify([{ type: 'p', runs: [{ text }] }]);
}

interface RevisionRow {
	id: string;
	note_id: string;
	revision: number;
	text: string;
	created_at: Date;
	updated_at: Date | null;
	autosave: boolean;
	supersedes_id: string | null;
	deleted_at: Date | null;
}

/* =========================================================================
 * A. THE GO-FORWARD BEHAVIOUR: the predicate, on a chain that has 0129.
 * ========================================================================= */

describe('0129 coalescing: what an autosave write does', () => {
	let db: TestDb;
	let owner: SeededUser;
	let teacher: SeededUser;
	let ada: SeededUser;
	let bo: SeededUser;
	let p1: string;

	beforeAll(async () => {
		db = await startTestDb(FULL_CHAIN);
		owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
		teacher = await createUser(db, 'tealeaf@boscotech.edu', 'T Leaf');
		ada = await createUser(db, 'ada@boscotech.net', 'Ada Lovelace');
		bo = await createUser(db, 'bo@boscotech.net', 'Bo Diddley');
		p1 = await createClassroomSection(db, {
			as: owner,
			courseCode: 'IDEA100',
			label: 'P1',
			teacherEmail: teacher.email
		});
		await enrollStudent(db, {
			as: teacher,
			sectionId: p1,
			email: ada.email,
			displayName: 'Ada Lovelace'
		});
		await enrollStudent(db, {
			as: teacher,
			sectionId: p1,
			email: bo.email,
			displayName: 'Bo Diddley'
		});
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	async function rpc<T = Record<string, unknown>>(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<T> {
		const { rows } = await db.asUser(user.id, (q) =>
			q<{ result: T }>(`select ${call} as result`, params)
		);
		return rows[0].result;
	}

	/** Every revision of one note, oldest first, read as the owner (no RLS). */
	async function chain(noteId: string): Promise<RevisionRow[]> {
		const { rows } = await db.sql<RevisionRow>(
			`select n.id, n.note_id, n.revision,
			        n.content -> 0 -> 'runs' -> 0 ->> 'text' as text,
			        n.created_at, n.updated_at, n.autosave, n.supersedes_id, n.deleted_at
			 from public.notebook_entry_notes n
			 where n.note_id = $1
			 order by n.revision`,
			[noteId]
		);
		return rows;
	}

	/** An autosave-created DRAFT holding one note: the composer's own door. */
	async function autosaveDraft(user: SeededUser, text: string) {
		return rpc<{ entry_id: string; note_id: string }>(
			user,
			`public.notebook_create_note_entry($1::jsonb, null, null, null, null, false, true)`,
			[doc(text)]
		);
	}

	const autosave = (user: SeededUser, noteId: string, text: string) =>
		rpc<{ revision: number; coalesced: boolean; created_at: string; updated_at: string | null }>(
			user,
			`public.notebook_edit_note($1::uuid, $2::jsonb, true)`,
			[noteId, doc(text)]
		);

	const deliberateEdit = (user: SeededUser, noteId: string, text: string) =>
		rpc<{ revision: number; coalesced: boolean }>(
			user,
			`public.notebook_edit_note($1::uuid, $2::jsonb)`,
			[noteId, doc(text)]
		);

	it('THE SIGNATURE TRAP: each re-signed function has exactly one overload', async () => {
		const { rows } = await db.sql<{ name: string; overloads: string }>(
			`select p.proname as name, count(*)::text as overloads
			 from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
			   and p.proname in ('notebook_edit_note', 'notebook_add_note',
			                     'notebook_create_note_entry', 'notebook_submit_entry',
			                     'notebook_seal_notes')
			 group by p.proname
			 order by p.proname`
		);
		expect(rows.map((r) => [r.name, r.overloads])).toEqual([
			['notebook_add_note', '1'],
			['notebook_create_note_entry', '1'],
			['notebook_edit_note', '1'],
			['notebook_seal_notes', '1'],
			['notebook_submit_entry', '1']
		]);
	});

	it('a whole writing session is ONE revision, and it keeps its start time', async () => {
		const made = await autosaveDraft(ada, 'first');
		const before = await chain(made.note_id);
		expect(before).toHaveLength(1);
		expect(before[0].autosave).toBe(true);
		expect(before[0].updated_at).toBeNull();

		for (const text of ['first se', 'first sent', 'first sentence']) {
			const result = await autosave(ada, made.note_id, text);
			expect(result.coalesced).toBe(true);
			expect(result.revision).toBe(1);
		}

		const after = await chain(made.note_id);
		// The headline: four writes, one row.
		expect(after).toHaveLength(1);
		expect(after[0].text).toBe('first sentence');
		expect(after[0].revision).toBe(1);
		// Started when it was started; changed when typing stopped.
		expect(after[0].created_at.toISOString()).toBe(before[0].created_at.toISOString());
		expect(after[0].updated_at).not.toBeNull();
		expect(after[0].updated_at!.getTime()).toBeGreaterThanOrEqual(
			after[0].created_at.getTime()
		);
	});

	it('an explicit Save draft STAMPS A BOUNDARY, and the next autosave writes past it', async () => {
		const made = await autosaveDraft(ada, 'draft one');
		await autosave(ada, made.note_id, 'draft one and a half');

		// The click a student means as "keep this version". It has nothing to
		// send -- those exact words are already stored -- so sealing is the whole
		// of what it does.
		const sealed = await rpc<{ sealed: number }>(ada, `public.notebook_seal_notes($1::uuid)`, [
			made.entry_id
		]);
		expect(Number(sealed.sealed)).toBe(1);

		const next = await autosave(ada, made.note_id, 'draft two');
		expect(next.coalesced).toBe(false);
		expect(next.revision).toBe(2);

		const rows = await chain(made.note_id);
		expect(rows.map((r) => [r.revision, r.text, r.autosave])).toEqual([
			[1, 'draft one and a half', false],
			[2, 'draft two', true]
		]);
		// The version the student saved is still there, unmodified...
		expect(rows[0].text).toBe('draft one and a half');
		// ...and the head that carried on from it is replaceable again.
		const third = await autosave(ada, made.note_id, 'draft two, longer');
		expect(third.coalesced).toBe(true);
		expect(await chain(made.note_id)).toHaveLength(2);
	});

	it('a DELIBERATE edit appends and is itself a boundary', async () => {
		const made = await autosaveDraft(ada, 'alpha');
		// notebook_edit_note with no p_autosave: the entry card's own editor,
		// which is `autosave: false` and mints a revision on purpose.
		const edit = await deliberateEdit(ada, made.note_id, 'beta');
		expect(edit.coalesced).toBe(false);
		expect(edit.revision).toBe(2);

		const rows = await chain(made.note_id);
		expect(rows.map((r) => [r.revision, r.text, r.autosave])).toEqual([
			[1, 'alpha', true],
			[2, 'beta', false]
		]);

		// And it is a boundary in its own right: nothing sealed the entry, but
		// the revision it wrote was not an autosave, so nothing may write across it.
		const next = await autosave(ada, made.note_id, 'gamma');
		expect(next.coalesced).toBe(false);
		expect(next.revision).toBe(3);
		expect((await chain(made.note_id)).map((r) => r.text)).toEqual(['alpha', 'beta', 'gamma']);
	});

	it('TURNING IN SEALS: a coalesced head can never be rewritten afterwards', async () => {
		const made = await autosaveDraft(ada, 'turned in');
		await autosave(ada, made.note_id, 'turned in, final');

		const head = (await chain(made.note_id))[0];
		expect(head.autosave).toBe(true);

		await rpc(ada, `public.notebook_submit_entry($1::uuid)`, [made.entry_id]);

		const sealedRows = await chain(made.note_id);
		expect(sealedRows).toHaveLength(1);
		expect(sealedRows[0].autosave).toBe(false);
		expect(sealedRows[0].text).toBe('turned in, final');

		// An autosave arriving after the turn-in (the composer clears its draft,
		// but the RPC is reachable through PostgREST regardless) APPENDS.
		const late = await autosave(ada, made.note_id, 'rewritten after review');
		expect(late.coalesced).toBe(false);
		const rows = await chain(made.note_id);
		expect(rows.map((r) => [r.revision, r.text])).toEqual([
			[1, 'turned in, final'],
			[2, 'rewritten after review']
		]);
		// What the instructor read is still exactly what they read.
		expect(rows[0].text).toBe('turned in, final');
		// ...and the new revision is NOT replaceable either, because the entry is
		// submitted. This is the second layer, and it is the one that holds when
		// the seal is opened.
		const later = await autosave(ada, made.note_id, 'rewritten twice');
		expect(later.coalesced).toBe(false);
		expect(await chain(made.note_id)).toHaveLength(3);
	});

	it('A SECOND AUTHOR CANNOT REPLACE SOMEBODY ELSE’S HEAD', async () => {
		const made = await autosaveDraft(ada, 'ada wrote this');
		// Seeded as the connection owner: no RPC can produce this row, because
		// every note-writing RPC stamps author_id from auth.uid() and takes no
		// identity parameter. It is here because the predicate names author_id,
		// and a condition nothing can currently violate is exactly the one that
		// silently stops being true. NOT editor coverage.
		await db.sql(`update public.notebook_entry_notes set author_id = $1 where note_id = $2`, [
			bo.id,
			made.note_id
		]);

		const result = await autosave(ada, made.note_id, 'ada rewrote it');
		expect(result.coalesced).toBe(false);
		const rows = await chain(made.note_id);
		expect(rows.map((r) => [r.revision, r.text])).toEqual([
			[1, 'ada wrote this'],
			[2, 'ada rewrote it']
		]);
	});

	it('a note on somebody else’s entry is refused, coalescing or not', async () => {
		const made = await autosaveDraft(ada, 'private');
		await expect(autosave(bo, made.note_id, 'not yours')).rejects.toThrow(
			/that note is not yours/i
		);
		expect(await chain(made.note_id)).toHaveLength(1);
		expect((await chain(made.note_id))[0].text).toBe('private');
	});

	it('a DELETED chain refuses an autosave, and stays marked end to end', async () => {
		const made = await autosaveDraft(ada, 'to be removed');
		await autosave(ada, made.note_id, 'to be removed, edited');
		// A second note on the same entry, so the shell guard has something to
		// count and this delete is allowed at all -- and so the assertions below
		// have a POSITIVE CONTROL sitting beside the deleted chain.
		const keeper = await rpc<{ note_id: string }>(
			ada,
			`public.notebook_add_note($1::uuid, $2::jsonb)`,
			[made.entry_id, doc('the other note')]
		);
		await deliberateEdit(ada, keeper.note_id, 'the other note, revised');

		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [made.note_id]);

		const removed = await chain(made.note_id);
		expect(removed).toHaveLength(1);
		expect(removed.every((r) => r.deleted_at !== null)).toBe(true);
		const control = await chain(keeper.note_id);
		expect(control).toHaveLength(2);
		expect(control.every((r) => r.deleted_at === null)).toBe(true);

		await expect(autosave(ada, made.note_id, 'sneaking it back')).rejects.toThrow(
			/has been deleted/i
		);
		expect(await chain(made.note_id)).toHaveLength(1);
	});

	it('DELETE STILL MARKS THE WHOLE CHAIN of a coalesced note', async () => {
		const made = await autosaveDraft(ada, 'v1');
		// A chain with both kinds of write in it: two boundaries and a
		// replaceable head, so "the whole chain" is more than one row.
		await autosave(ada, made.note_id, 'v1 typing');
		await deliberateEdit(ada, made.note_id, 'v2');
		await autosave(ada, made.note_id, 'v3');
		await autosave(ada, made.note_id, 'v3 typing');
		const before = await chain(made.note_id);
		expect(before.map((r) => [r.revision, r.text])).toEqual([
			[1, 'v1 typing'],
			[2, 'v2'],
			[3, 'v3 typing']
		]);

		const keeper = await rpc<{ note_id: string }>(
			ada,
			`public.notebook_add_note($1::uuid, $2::jsonb)`,
			[made.entry_id, doc('positive control')]
		);

		const result = await rpc<{ revisions: number }>(
			ada,
			`public.notebook_delete_note($1::uuid)`,
			[made.note_id]
		);
		// Three rows marked, not one: the delete keys on note_id, and coalescing
		// has not put any row of this note outside that key.
		expect(Number(result.revisions)).toBe(3);

		const marked = await chain(made.note_id);
		expect(marked).toHaveLength(3);
		expect(marked.filter((r) => r.deleted_at !== null)).toHaveLength(3);
		// The positive control: a chain on the same entry that must NOT be marked.
		const live = await chain(keeper.note_id);
		expect(live).toHaveLength(1);
		expect(live.filter((r) => r.deleted_at !== null)).toHaveLength(0);

		// And the client's own funnel agrees, which is what actually decides
		// whether an older revision surfaces as a head anywhere.
		const { rows } = await db.sql<NotebookNoteRow>(
			`select id, entry_id, note_id, revision, content, created_at, deleted_at, deleted_by
			 from public.notebook_entry_notes where entry_id = $1`,
			[made.entry_id]
		);
		expect(noteThreads(rows).map((t) => t.noteId)).toEqual([keeper.note_id]);
		expect(deletedNoteThreads(rows).map((t) => [t.noteId, t.revisions])).toEqual([
			[made.note_id, 3]
		]);
	});

	it('an autosave onto a PHOTO-made draft starts a replaceable revision 1', async () => {
		// notebook_add_note is the composer's other door: the draft already
		// exists (a photo made it) and the text is the first note on it.
		const entry = await rpc<{ entry_id: string }>(
			ada,
			`public.notebook_create_entry($1::uuid, $2::text, null, null, null, $3::text, null, false)`,
			[ada.id, 'drive-file-1', 'page.jpg']
		);
		const added = await rpc<{ note_id: string }>(
			ada,
			`public.notebook_add_note($1::uuid, $2::jsonb, true)`,
			[entry.entry_id, doc('typed onto a photo entry')]
		);
		expect((await chain(added.note_id))[0].autosave).toBe(true);

		const next = await autosave(ada, added.note_id, 'typed onto a photo entry, more');
		expect(next.coalesced).toBe(true);
		const rows = await chain(added.note_id);
		expect(rows).toHaveLength(1);
		expect(rows[0].text).toBe('typed onto a photo entry, more');
	});

	it('add_note WITHOUT the flag starts a boundary, and add_note on a SUBMITTED entry never marks', async () => {
		const made = await autosaveDraft(ada, 'body');
		const plain = await rpc<{ note_id: string }>(
			ada,
			`public.notebook_add_note($1::uuid, $2::jsonb)`,
			[made.entry_id, doc('written deliberately')]
		);
		expect((await chain(plain.note_id))[0].autosave).toBe(false);

		await rpc(ada, `public.notebook_submit_entry($1::uuid)`, [made.entry_id]);
		const late = await rpc<{ note_id: string }>(
			ada,
			`public.notebook_add_note($1::uuid, $2::jsonb, true)`,
			[made.entry_id, doc('added after turning in')]
		);
		// The flag was asked for and refused: the entry is turned in, so this row
		// is content somebody else can already read.
		expect((await chain(late.note_id))[0].autosave).toBe(false);
	});

	it('create_note_entry marks nothing when the entry is turned in at creation', async () => {
		const made = await rpc<{ note_id: string }>(
			ada,
			`public.notebook_create_note_entry($1::jsonb, null, null, null, null, true, true)`,
			[doc('turned in immediately')]
		);
		expect((await chain(made.note_id))[0].autosave).toBe(false);
	});

	it('seal refuses somebody else’s entry, and says nothing about it', async () => {
		const made = await autosaveDraft(ada, 'mine');
		await expect(
			rpc(bo, `public.notebook_seal_notes($1::uuid)`, [made.entry_id])
		).rejects.toThrow(/does not exist or is not yours/i);
		expect((await chain(made.note_id))[0].autosave).toBe(true);
	});

	it('there is still NO client write path to the table', async () => {
		const { rows } = await db.sql<{ privilege_type: string }>(
			`select privilege_type from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'notebook_entry_notes'
			   and grantee in ('authenticated', 'anon')
			 order by privilege_type`
		);
		expect(rows.map((r) => r.privilege_type)).toEqual(['SELECT']);

		const { rows: policies } = await db.sql<{ cmd: string }>(
			`select cmd from pg_policies
			 where schemaname = 'public' and tablename = 'notebook_entry_notes'`
		);
		expect(policies.map((p) => p.cmd)).toEqual(['SELECT']);

		// And the direct write a client would try is refused by the grants.
		const made = await autosaveDraft(ada, 'not writable');
		await expect(
			db.asUser(ada.id, (q) =>
				q(`update public.notebook_entry_notes set autosave = false where note_id = $1`, [
					made.note_id
				])
			)
		).rejects.toThrow(/permission denied/i);
	});

	it('"last worked on" moves when a head is replaced in place', async () => {
		const made = await autosaveDraft(ada, 'activity');
		const first = await db.asUser(ada.id, (q) =>
			q<{ last_activity_at: Date }>(
				`select last_activity_at from public.notebook_entry_activity where id = $1`,
				[made.entry_id]
			)
		);
		// Push the head's stamps back, so the replacement below is measurably
		// later than anything else on the entry.
		await db.sql(
			`update public.notebook_entry_notes
			 set created_at = now() - interval '1 hour', updated_at = null
			 where note_id = $1`,
			[made.note_id]
		);
		await db.sql(
			`update public.notebook_entries
			 set upload_timestamp = now() - interval '1 hour' where id = $1`,
			[made.entry_id]
		);
		const stale = await db.asUser(ada.id, (q) =>
			q<{ last_activity_at: Date }>(
				`select last_activity_at from public.notebook_entry_activity where id = $1`,
				[made.entry_id]
			)
		);
		await autosave(ada, made.note_id, 'activity, still typing');
		const fresh = await db.asUser(ada.id, (q) =>
			q<{ last_activity_at: Date }>(
				`select last_activity_at from public.notebook_entry_activity where id = $1`,
				[made.entry_id]
			)
		);
		expect(first.rows[0].last_activity_at).toBeInstanceOf(Date);
		expect(fresh.rows[0].last_activity_at.getTime()).toBeGreaterThan(
			stale.rows[0].last_activity_at.getTime()
		);
	});

	it('every chain it wrote is contiguous from 1 and properly linked', async () => {
		// The invariant an append has always had (head + 1) and the backfill has
		// to reproduce: asserted here over everything section A created, so the
		// two halves of this file are held to the same rule.
		const { rows } = await db.sql<{ broken: string }>(
			`select count(*)::text as broken from (
			   select n.note_id
			   from public.notebook_entry_notes n
			   group by n.note_id
			   having count(*) <> max(n.revision)
			      or min(n.revision) <> 1
			      or count(*) filter (where n.revision = 1 and n.id = n.note_id and n.supersedes_id is null) <> 1
			      or count(*) filter (where n.revision > 1 and n.supersedes_id is null) > 0
			 ) t`
		);
		expect(rows[0].broken).toBe('0');
		// Kept honest: the sweep above would also report 0 over an empty table.
		const { rows: total } = await db.sql<{ chains: string }>(
			`select count(distinct note_id)::text as chains from public.notebook_entry_notes`
		);
		expect(Number(total[0].chains)).toBeGreaterThan(8);
	});
});

/* =========================================================================
 * B. THE BACKFILL, against data written by the REAL pre-0129 RPCs.
 * ========================================================================= */

describe('0129 backfill: collapsing what the autosave already wrote', () => {
	let db: TestDb;
	let owner: SeededUser;
	let teacher: SeededUser;
	let ada: SeededUser;
	let p1: string;

	/** note_id per fixture chain. */
	const notes: Record<string, string> = {};
	const entries: Record<string, string> = {};
	/** What each chain looked like BEFORE the migration was applied. */
	const before: Record<string, RevisionRow[]> = {};
	let rowsBefore = 0;

	async function rpc<T = Record<string, unknown>>(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<T> {
		const { rows } = await db.asUser(user.id, (q) =>
			q<{ result: T }>(`select ${call} as result`, params)
		);
		return rows[0].result;
	}

	async function chain(noteId: string, withNewColumns = true): Promise<RevisionRow[]> {
		const extra = withNewColumns ? 'n.updated_at, n.autosave' : 'null::timestamptz as updated_at, false as autosave';
		const { rows } = await db.sql<RevisionRow>(
			`select n.id, n.note_id, n.revision,
			        n.content -> 0 -> 'runs' -> 0 ->> 'text' as text,
			        n.created_at, ${extra}, n.supersedes_id, n.deleted_at
			 from public.notebook_entry_notes n
			 where n.note_id = $1
			 order by n.revision`,
			[noteId]
		);
		return rows;
	}

	/**
	 * Seeds one chain through the REAL pre-0129 RPCs -- create, then one
	 * notebook_edit_note per later revision -- and then stamps the whole chain
	 * onto a fixed schedule as the owner. `startsAt` is the first revision's
	 * instant; `gapMs` is how far apart the writes were.
	 */
	async function seedChain(
		key: string,
		texts: string[],
		startsAt: number,
		gapMs: number | number[]
	) {
		const made = await rpc<{ entry_id: string; note_id: string }>(
			ada,
			`public.notebook_create_note_entry($1::jsonb, null, null, null, null, false)`,
			[doc(texts[0])]
		);
		entries[key] = made.entry_id;
		notes[key] = made.note_id;
		for (const text of texts.slice(1)) {
			await rpc(ada, `public.notebook_edit_note($1::uuid, $2::jsonb)`, [made.note_id, doc(text)]);
		}
		let at = startsAt;
		for (let i = 0; i < texts.length; i++) {
			if (i > 0) at += Array.isArray(gapMs) ? gapMs[i - 1] : gapMs;
			await db.sql(
				`update public.notebook_entry_notes set created_at = $1 where note_id = $2 and revision = $3`,
				[new Date(at).toISOString(), made.note_id, i + 1]
			);
		}
	}

	beforeAll(async () => {
		db = await startTestDb(PRE_CHAIN);
		owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
		teacher = await createUser(db, 'tealeaf@boscotech.edu', 'T Leaf');
		ada = await createUser(db, 'ada@boscotech.net', 'Ada Lovelace');
		p1 = await createClassroomSection(db, {
			as: owner,
			courseCode: 'IDEA100',
			label: 'P1',
			teacherEmail: teacher.email
		});
		await enrollStudent(db, {
			as: teacher,
			sectionId: p1,
			email: ada.email,
			displayName: 'Ada Lovelace'
		});

		// THE CASE THIS MIGRATION EXISTS FOR: a student writing for ten minutes,
		// twelve revisions, each a few seconds after the last.
		await seedChain(
			'burst',
			Array.from({ length: 12 }, (_, i) => `paragraph as it stood at write ${i + 1}`),
			AFTER,
			3_000
		);

		// HAND-AUTHORED REVISIONS: the same student, the same door, ten minutes
		// apart. These must come out untouched, byte for byte.
		await seedChain(
			'handwritten',
			['a first thought', 'a second thought', 'a third thought', 'a fourth thought'],
			AFTER + 3_600_000,
			600_000
		);

		// BEFORE THE AUTOSAVE SHIPPED: revisions one second apart, which the
		// window would happily eat if the cutoff were not there. Nothing but a
		// person could have written these.
		await seedChain('ancient', ['old one', 'old two', 'old three'], BEFORE, 1_000);

		// MIXED: a burst, a real gap, another burst. Two revisions must survive.
		await seedChain(
			'mixed',
			['m1', 'm2', 'm3', 'm4', 'm5'],
			AFTER + 7_200_000,
			[2_000, 2_000, 900_000, 2_000]
		);

		// A DELETED chain, marked end to end (0119), that also happens to be a
		// burst. It must collapse like any other and stay marked on every row.
		await seedChain('removed', ['gone one', 'gone two', 'gone three'], AFTER + 10_800_000, 2_000);
		await rpc(ada, `public.notebook_add_note($1::uuid, $2::jsonb)`, [
			entries.removed,
			doc('the note that keeps this entry from being empty')
		]);
		await rpc(ada, `public.notebook_delete_note($1::uuid)`, [notes.removed]);

		for (const key of Object.keys(notes)) before[key] = await chain(key === '' ? '' : notes[key], false);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entry_notes`
		);
		rowsBefore = Number(rows[0].n);

		// THE FILE, applied over the seeded database. This is the whole point of
		// booting short of it.
		await db.sql(MIGRATION_0129);
	}, 240_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('the seeded fixture really was long before the migration ran', () => {
		// The positive control for everything below: a backfill asserted against
		// a fixture that was already short proves nothing.
		expect(before.burst).toHaveLength(12);
		expect(before.handwritten).toHaveLength(4);
		expect(before.ancient).toHaveLength(3);
		expect(before.mixed).toHaveLength(5);
		expect(before.removed).toHaveLength(3);
		expect(rowsBefore).toBe(12 + 4 + 3 + 5 + 3 + 1);
	});

	it('a twelve-revision autosave burst collapses to ONE row', async () => {
		const rows = await chain(notes.burst);
		expect(rows).toHaveLength(1);
		expect(rows[0].revision).toBe(1);
		// The LAST content survives...
		expect(rows[0].text).toBe('paragraph as it stood at write 12');
		// ...on the FIRST row's identity and start time...
		expect(rows[0].id).toBe(before.burst[0].id);
		expect(rows[0].created_at.toISOString()).toBe(before.burst[0].created_at.toISOString());
		// ...with the last write's instant as the modification stamp.
		expect(rows[0].updated_at?.toISOString()).toBe(before.burst[11].created_at.toISOString());
		// Sealed, not replaceable: nothing written before 0129 becomes
		// rewritable retroactively.
		expect(rows[0].autosave).toBe(false);
	});

	it('hand-authored revisions ten minutes apart are UNTOUCHED', async () => {
		const rows = await chain(notes.handwritten);
		expect(rows).toHaveLength(4);
		expect(rows.map((r) => [r.revision, r.text])).toEqual([
			[1, 'a first thought'],
			[2, 'a second thought'],
			[3, 'a third thought'],
			[4, 'a fourth thought']
		]);
		// Byte for byte: same ids, same stamps, no modification stamp invented.
		expect(rows.map((r) => r.id)).toEqual(before.handwritten.map((r) => r.id));
		expect(rows.map((r) => r.created_at.toISOString())).toEqual(
			before.handwritten.map((r) => r.created_at.toISOString())
		);
		expect(rows.map((r) => r.updated_at)).toEqual([null, null, null, null]);
		expect(rows.map((r) => r.supersedes_id)).toEqual(
			before.handwritten.map((r) => r.supersedes_id)
		);
	});

	it('revisions written BEFORE the autosave shipped are untouched, however close together', async () => {
		const rows = await chain(notes.ancient);
		// One second apart, which the 30s window would collapse in a heartbeat.
		// The cutoff is the only thing standing between them and deletion.
		expect(rows).toHaveLength(3);
		expect(rows.map((r) => r.text)).toEqual(['old one', 'old two', 'old three']);
		expect(rows.map((r) => r.id)).toEqual(before.ancient.map((r) => r.id));
		expect(rows.map((r) => r.updated_at)).toEqual([null, null, null]);
	});

	it('a mixed chain keeps ONE revision per burst, in order, still linked', async () => {
		const rows = await chain(notes.mixed);
		expect(rows.map((r) => [r.revision, r.text])).toEqual([
			[1, 'm3'],
			[2, 'm5']
		]);
		// Renumbered contiguously, and the survivor of the second burst still
		// points at the survivor of the first.
		expect(rows[0].id).toBe(before.mixed[0].id);
		expect(rows[1].id).toBe(before.mixed[3].id);
		expect(rows[1].supersedes_id).toBe(rows[0].id);
		expect(rows[0].supersedes_id).toBeNull();
		expect(rows[0].updated_at?.toISOString()).toBe(before.mixed[2].created_at.toISOString());
		expect(rows[1].updated_at?.toISOString()).toBe(before.mixed[4].created_at.toISOString());
	});

	it('a DELETED chain collapses and stays marked on every surviving row', async () => {
		const rows = await chain(notes.removed);
		expect(rows).toHaveLength(1);
		expect(rows[0].text).toBe('gone three');
		expect(rows[0].deleted_at).not.toBeNull();

		// The positive control: the other note on the same entry, which was never
		// deleted and must still read as live.
		const { rows: all } = await db.sql<NotebookNoteRow>(
			`select id, entry_id, note_id, revision, content, created_at, deleted_at, deleted_by
			 from public.notebook_entry_notes where entry_id = $1`,
			[entries.removed]
		);
		expect(deletedNoteThreads(all).map((t) => [t.noteId, t.revisions])).toEqual([
			[notes.removed, 1]
		]);
		expect(noteThreads(all)).toHaveLength(1);
		expect(noteThreads(all)[0].noteId).not.toBe(notes.removed);
	});

	it('DELETE STILL MARKS THE WHOLE CHAIN after the backfill, with a positive control', async () => {
		// The mixed chain still has two revisions. Delete it and count.
		const keeper = await rpc<{ note_id: string }>(
			ada,
			`public.notebook_add_note($1::uuid, $2::jsonb)`,
			[entries.mixed, doc('positive control on the same entry')]
		);
		const result = await rpc<{ revisions: number }>(
			ada,
			`public.notebook_delete_note($1::uuid)`,
			[notes.mixed]
		);
		expect(Number(result.revisions)).toBe(2);

		const marked = await chain(notes.mixed);
		expect(marked).toHaveLength(2);
		expect(marked.filter((r) => r.deleted_at !== null)).toHaveLength(2);
		const live = await chain(keeper.note_id);
		expect(live).toHaveLength(1);
		expect(live.filter((r) => r.deleted_at !== null)).toHaveLength(0);
	});

	it('every chain in the database is contiguous, rooted and linked afterwards', async () => {
		const { rows } = await db.sql<{ broken: string; chains: string }>(
			`select
			   (select count(*)::text from (
			      select n.note_id
			      from public.notebook_entry_notes n
			      group by n.note_id
			      having count(*) <> max(n.revision)
			         or min(n.revision) <> 1
			         or count(*) filter (where n.revision = 1 and n.id = n.note_id and n.supersedes_id is null) <> 1
			         or count(*) filter (where n.revision > 1 and n.supersedes_id is null) > 0
			   ) t) as broken,
			   (select count(distinct note_id)::text from public.notebook_entry_notes) as chains`
		);
		expect(rows[0].broken).toBe('0');
		// Not vacuous: there really are chains to check.
		expect(Number(rows[0].chains)).toBe(7);
	});

	it('the collapse removed exactly the rows it should and no others', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.notebook_entry_notes`
		);
		// burst 12 -> 1, mixed 5 -> 2, removed 3 -> 1. handwritten (4), ancient
		// (3) and the entry-keeper note (1) are untouched. The +1 is the control
		// note the delete test above added to the mixed entry, which is not the
		// backfill's doing and is counted separately rather than folded in.
		const survived = 1 + 4 + 3 + 2 + 1 + 1;
		expect(Number(rows[0].n)).toBe(survived + 1);
		// 11 + 3 + 2 rows deleted, which is the whole of what the collapse did.
		expect(rowsBefore - survived).toBe(16);
	});

	it('re-applying the file is a no-op: the backfill runs exactly once', async () => {
		const { rows: sample } = await db.sql<{ n: string; contents: string }>(
			`select count(*)::text as n, md5(string_agg(n.id::text || n.revision || n.content::text, ',' order by n.id)) as contents
			 from public.notebook_entry_notes n`
		);
		// A re-paste is ordinary here: a first attempt fails partway, or somebody
		// runs the file again. The backfill deletes rows, so a second run that
		// did anything at all would be deleting real work.
		await db.sql(MIGRATION_0129);
		const { rows: after } = await db.sql<{ n: string; contents: string }>(
			`select count(*)::text as n, md5(string_agg(n.id::text || n.revision || n.content::text, ',' order by n.id)) as contents
			 from public.notebook_entry_notes n`
		);
		expect([after[0].n, after[0].contents]).toEqual([sample[0].n, sample[0].contents]);
	});

	it('the file this suite applied is the one in the repository', () => {
		// The mutation-proof handshake: if the migration is edited between runs,
		// this hash is what says so out loud rather than the suite quietly
		// testing a different file from the one that ships.
		expect(createHash('md5').update(MIGRATION_0129).digest('hex')).toHaveLength(32);
		expect(MIGRATION_0129).toContain('_notebook_note_coalescable');
		expect(MIGRATION_0129).toContain(CUTOFF.replace('T', ' ').replace('.000Z', '+00'));
	});
});
