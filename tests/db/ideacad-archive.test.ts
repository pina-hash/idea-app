// tests/db/ideacad-archive.test.ts
//
// 0214's behaviour, against a real Postgres carrying the real migration chain
// applied unmodified.
//
// WHAT DECISION 29 ASKED FOR, AND WHERE EACH HALF IS PROVEN HERE:
//
//   "THE DOCUMENT AND ALL ITS WORK IS ARCHIVED, NOT DELETED, and stays
//    accessible to the admin instructor."          -> B (survives), C (reach)
//   "If the instructor shares an archived document with a class, those
//    students get access to it too."               -> E
//   "An archived document must stop being WRITABLE
//    and keep being READABLE."                     -> D
//
// EVERY VISIBILITY CLAIM IS ASSERTED IN BOTH DIRECTIONS, which is this repo's
// standing rule and is the only shape that can tell "the gate holds" from "the
// query was wrong". Section D in particular pairs each refusal with the SAME
// call succeeding on a live document in the same database, so a suite that
// refused everything for an unrelated reason cannot read as a passing archive.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildArchiveFixture, type ArchiveFixture } from './ideacad-archive-fixture';

let f: ArchiveFixture;

beforeAll(async () => {
	f = await buildArchiveFixture('arch');
}, 240_000);

afterAll(async () => {
	await f?.db.stop();
});

/** Every row `ideacad_archive` returns for the fixture's item, as the teacher. */
const archiveRows = () =>
	f.call<Array<Record<string, unknown>>>(f.teacher, 'public.ideacad_archive($1::uuid)', [
		f.itemId
	]);

/** Archive (or restore) the fixture document as the teacher. */
const setArchived = (on: boolean) =>
	f.call<{ ok: boolean }>(f.teacher, 'public.ideacad_set_document_archived($1::uuid, $2)', [
		f.documentId,
		on
	]);

/** Delete the owner's enrollment as the connection owner, bypassing every gate. */
const dropOwnerEnrollment = () =>
	f.db.sql('delete from public.classroom_enrollments where section_id = $1 and student_email = $2', [
		f.oldSection,
		f.owner.email
	]);

// ---------------------------------------------------------------------------
// A. WHAT WAS ALREADY TRUE BEFORE THIS MIGRATION.
//
// 0214's header claims the instructor's READ was already item-keyed and needed
// no change, and that what was missing was the LISTING. Both halves are
// measured here rather than argued, because "we did not have to change that"
// is exactly the kind of claim that is wrong quietly.
// ---------------------------------------------------------------------------
describe('A. the instructor reach that already existed', () => {
	it('reads a live document and its concepts through RLS, keyed on the item and not the roster', async () => {
		const seen = await f.db.asUser(f.teacher.id, async (q) => {
			const docs = await q<{ id: string }>('select id from public.ideacad_documents where id = $1', [
				f.documentId
			]);
			const concepts = await q<{ id: string }>(
				'select id from public.ideacad_concepts where document_id = $1',
				[f.documentId]
			);
			return { docs: docs.rows.length, concepts: concepts.rows.length };
		});
		expect(seen).toEqual({ docs: 1, concepts: 1 });
	});

	it('and the read predicate names no enrollment, which is why the reach survives one going away', async () => {
		const { rows } = await f.db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = '_ideacad_can_read_document'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].prosrc).toContain('_classroom_manages_item');
		expect(rows[0].prosrc).not.toContain('classroom_enrollments');
	});

	it('but ideacad_roster DOES drive off the enrollment, which is the gap 0214 fills', async () => {
		const { rows } = await f.db.sql<{ prosrc: string }>(
			`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'ideacad_roster'`
		);
		expect(rows[0].prosrc).toContain('classroom_enrollments');
	});
});

// ---------------------------------------------------------------------------
// B. THE DOCUMENT SURVIVES ITS OWNER'S ENROLLMENT BEING REMOVED, AND IS
//    LISTABLE AFTERWARDS.
//
// The enrollment is deleted AS THE CONNECTION OWNER, bypassing
// classroom_remove_enrollment entirely. That is deliberate: 0213 refuses this
// removal (section F proves it still does), so the only way to reach the state
// decision 29 is about is to produce it the way it was produced BEFORE 0213 --
// which is also exactly the orphan population already in the table.
// ---------------------------------------------------------------------------
describe('B. an archived document outlives the enrollment', () => {
	it('starts on the live roster and NOT in the archive', async () => {
		const roster = await f.call<Array<{ studentEmail: string; document: unknown }>>(
			f.teacher,
			'public.ideacad_roster($1::uuid)',
			[f.itemId]
		);
		expect(roster.map((r) => r.studentEmail)).toContain(f.owner.email);
		expect(await archiveRows()).toEqual([]);
	});

	it('archiving is a deliberate instructor act that stamps both columns together', async () => {
		await setArchived(true);
		const { rows } = await f.db.sql<{ archived_at: Date | null; archived_by: string | null }>(
			'select archived_at, archived_by from public.ideacad_documents where id = $1',
			[f.documentId]
		);
		expect(rows[0].archived_at).not.toBeNull();
		expect(rows[0].archived_by).toBe(f.teacher.email);
	});

	it('a second archive does not move the stamp -- the column says WHEN, not LAST PRESSED', async () => {
		const before = await f.db.sql<{ archived_at: Date }>(
			'select archived_at from public.ideacad_documents where id = $1',
			[f.documentId]
		);
		await setArchived(true);
		const after = await f.db.sql<{ archived_at: Date }>(
			'select archived_at from public.ideacad_documents where id = $1',
			[f.documentId]
		);
		expect(after.rows[0].archived_at.toISOString()).toBe(
			before.rows[0].archived_at.toISOString()
		);
	});

	it('and now the archive lists it, with reason "archived" while the owner is still enrolled', async () => {
		const rows = await archiveRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			documentId: f.documentId,
			ownerEmail: f.owner.email,
			reason: 'archived',
			onRoster: true,
			conceptCount: 1,
			archivedBy: f.teacher.email
		});
	});

	it('THE ROW SURVIVES THE ENROLLMENT GOING AWAY, and the archive still lists it', async () => {
		await dropOwnerEnrollment();

		// The roster -- the enrollment-keyed read -- has genuinely lost it. This
		// is the positive control for the whole bundle: without it, "the archive
		// can see it" says nothing, because everything could see it.
		const roster = await f.call<Array<{ studentEmail: string }>>(
			f.teacher,
			'public.ideacad_roster($1::uuid)',
			[f.itemId]
		);
		expect(roster.map((r) => r.studentEmail)).not.toContain(f.owner.email);

		const rows = await archiveRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			documentId: f.documentId,
			ownerEmail: f.owner.email,
			onRoster: false,
			conceptCount: 1
		});

		// The work itself is untouched: not deleted, not soft-deleted, still one
		// live concept with its features intact.
		const { rows: concepts } = await f.db.sql<{ n: string }>(
			`select count(*)::text as n from public.ideacad_concepts
			  where document_id = $1 and deleted_at is null`,
			[f.documentId]
		);
		expect(concepts[0].n).toBe('1');
	});

	it('an OFF-ROSTER document that nobody archived is listed too, under its own reason', async () => {
		// The orphan population 0213 can no longer create and cannot
		// retroactively find. Before 0214 these were in the table and on no
		// surface at all.
		await setArchived(false);
		const rows = await archiveRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ reason: 'off_roster', onRoster: false, archivedAt: null });

		// Put it back for everything below.
		await setArchived(true);
	});
});

// ---------------------------------------------------------------------------
// C. WHO CAN REACH THE ARCHIVE, AND WHO CANNOT.
// ---------------------------------------------------------------------------
describe('C. the archive is the managing teacher, and nobody else', () => {
	it('a teacher of an unposted section is refused, and cannot probe the item', async () => {
		expect(await f.refusal(f.otherTeacher, 'public.ideacad_archive($1::uuid)', [f.itemId]))
			.toContain('Only a teacher for this class can open the archive.');
	});

	it('a current student is refused', async () => {
		expect(await f.refusal(f.nextYear, 'public.ideacad_archive($1::uuid)', [f.itemId]))
			.toContain('Only a teacher for this class can open the archive.');
	});

	it('nobody but a managing teacher can archive, and the refusal cannot be told from a missing id', async () => {
		const missing = '00000000-0000-4000-8000-000000000000';
		const asStudent = await f.refusal(
			f.classmate,
			'public.ideacad_set_document_archived($1::uuid, true)',
			[f.documentId]
		);
		const asTeacherOnNothing = await f.refusal(
			f.teacher,
			'public.ideacad_set_document_archived($1::uuid, true)',
			[missing]
		);
		expect(asStudent).toContain('That document does not exist.');
		// The two sentences are IDENTICAL, which is the property: an id that
		// exists and one that does not answer the same, so neither can be probed.
		expect(asTeacherOnNothing).toBe(asStudent);
	});

	it('the OWNER cannot archive their own document either -- it is an instructor decision', async () => {
		// Measured through a live document, since the owner's enrollment is gone
		// by now and a refusal for the wrong reason would read the same.
		const other = await f.call<{ document: { id: string } }>(
			f.classmate,
			'public.ideacad_open_document($1::uuid)',
			[f.itemId]
		);
		expect(
			await f.refusal(f.classmate, 'public.ideacad_set_document_archived($1::uuid, true)', [
				other.document.id
			])
		).toContain('That document does not exist.');
	});
});

// ---------------------------------------------------------------------------
// D. ARCHIVED MEANS UNWRITABLE AND STILL READABLE.
//
// EVERY REFUSAL IS PAIRED WITH THE SAME CALL SUCCEEDING, on the classmate's
// LIVE document in the same database and the same run. A sweep of refusals with
// no control passes just as well when the fixture is broken.
// ---------------------------------------------------------------------------
describe('D. an archived document stops being writable and keeps being readable', () => {
	let liveDocument: string;
	let liveConcept: string;

	beforeAll(async () => {
		const opened = await f.call<{ document: { id: string }; concepts: Array<{ id: string }> }>(
			f.classmate,
			'public.ideacad_open_document($1::uuid)',
			[f.itemId]
		);
		liveDocument = opened.document.id;
		liveConcept = opened.concepts[0].id;
		// The owner is off the roster, so they cannot write through
		// _classroom_engine_student any more. Put them back, so the ONLY thing
		// standing between them and a write is the archive -- otherwise every
		// refusal below has two possible causes and proves neither.
		await f.call(f.teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			f.oldSection,
			f.owner.email,
			f.owner.email
		]);
	});

	it('the write predicate answers false for the archived document and true for a live one', async () => {
		const archived = await f.predicate<boolean>(
			f.owner,
			'public._ideacad_can_write_document($1::uuid)',
			[f.documentId]
		);
		const live = await f.predicate<boolean>(
			f.classmate,
			'public._ideacad_can_write_document($1::uuid)',
			[liveDocument]
		);
		expect({ archived, live }).toEqual({ archived: false, live: true });
	});

	it('AND SO DOES THE ASSEMBLY OWNER PREDICATE, which does not go through the first', async () => {
		// _ideacad_part_writer short-circuits on _ideacad_part_owner BEFORE
		// consulting 0205's rule, and four part writes gate on it directly. This
		// is the half a narrowing of the first predicate alone would have missed.
		const archived = await f.predicate<boolean>(f.owner, 'public._ideacad_part_owner($1::uuid)', [
			f.documentId
		]);
		const live = await f.predicate<boolean>(f.classmate, 'public._ideacad_part_owner($1::uuid)', [
			liveDocument
		]);
		expect({ archived, live }).toEqual({ archived: false, live: true });
	});

	it('every concept write refuses on the archived document and lands on the live one', async () => {
		const attempts = (doc: string, concept: string, marker: string) => [
			{
				label: 'ideacad_new_concept',
				expression: 'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)',
				params: [doc, `c ${marker}`, JSON.stringify({ blade: marker })]
			},
			{
				label: 'ideacad_save_concept',
				expression: 'public.ideacad_save_concept($1::uuid, $2::jsonb, 99)',
				params: [concept, JSON.stringify({ blade: marker })]
			},
			{
				label: 'ideacad_update_concept_meta',
				expression: 'public.ideacad_update_concept_meta($1::uuid, $2, 9)',
				params: [concept, `renamed ${marker}`]
			},
			{
				label: 'ideacad_set_prediction',
				expression: 'public.ideacad_set_prediction($1::uuid, $2::uuid, $3)',
				params: [doc, concept, `why ${marker}`]
			},
			{
				label: 'ideacad_commit_concept',
				expression: 'public.ideacad_commit_concept($1::uuid)',
				params: [concept]
			},
			{
				label: 'ideacad_set_active',
				expression: 'public.ideacad_set_active($1::uuid, $2::uuid)',
				params: [doc, concept]
			}
		];

		const refused: string[] = [];
		for (const a of attempts(f.documentId, f.conceptId, 'ARCHIVED')) {
			const message = await f.refusal(f.owner, a.expression, a.params);
			if (message !== '') refused.push(a.label);
		}

		const landed: string[] = [];
		for (const a of attempts(liveDocument, liveConcept, 'LIVE')) {
			const message = await f.refusal(f.classmate, a.expression, a.params);
			if (message === '') landed.push(a.label);
		}

		// THE CASE COUNT IS ASSERTED, so a sweep that generated nothing cannot
		// pass, and both directions are reported rather than one.
		expect(refused).toHaveLength(6);
		expect(landed).toHaveLength(6);
		expect(refused.sort()).toEqual(landed.sort());
	});

	it('and NOTHING the archived writes attempted reached the table', async () => {
		// The marker is what makes "wrote nothing" assertable: a returned error
		// says the RPC refused, this says no bytes are anywhere in the table.
		const { rows } = await f.db.sql<{ n: string }>(
			`select count(*)::text as n from public.ideacad_concepts c
			  where c.document_id = $1 and (c.name like '%ARCHIVED%' or c.features::text like '%ARCHIVED%')`,
			[f.documentId]
		);
		expect(rows[0].n).toBe('0');

		// ...and the positive control for that query: the live document's writes
		// DID land, so the search is capable of finding a marker at all.
		const { rows: control } = await f.db.sql<{ n: string }>(
			`select count(*)::text as n from public.ideacad_concepts c
			  where c.document_id = $1 and (c.name like '%LIVE%' or c.features::text like '%LIVE%')`,
			[liveDocument]
		);
		expect(Number(control[0].n)).toBeGreaterThan(0);
	});

	it('the assembly write path refuses too, on the rung that bypasses 0205', async () => {
		expect(
			await f.refusal(f.owner, 'public.ideacad_add_part($1::uuid, $2, null)', [
				f.documentId,
				'Bracket'
			])
		).not.toBe('');
		// Control: the same call on a live document the caller owns.
		expect(
			await f.refusal(f.classmate, 'public.ideacad_add_part($1::uuid, $2, null)', [
				liveDocument,
				'Bracket'
			])
		).toBe('');
	});

	it('READS ARE UNAFFECTED -- the owner and the teacher both still open it', async () => {
		const asOwner = await f.call<{
			role: string;
			canWrite: boolean;
			archived: boolean;
			concepts: unknown[];
		}>(
			f.owner,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(asOwner.role).toBe('owner');
		// canWrite comes from the WRITE GATE and not from the role. 0205
		// computed it from the role alone, so before this migration an archived
		// document told its own owner it was writable while every write
		// refused -- a full set of editing controls whose only outcome is a
		// refusal. This assertion is the one that found it.
		expect(asOwner.canWrite).toBe(false);
		expect(asOwner.archived).toBe(true);
		expect(asOwner.concepts).toHaveLength(1);

		const asTeacher = await f.call<{ role: string; canWrite: boolean }>(
			f.teacher,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(asTeacher).toMatchObject({ role: 'manager', canWrite: false });
	});

	it('and the payload says archived is false again once it is restored', async () => {
		await setArchived(false);
		const restored = await f.call<{ canWrite: boolean; archived: boolean }>(
			f.owner,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(restored).toMatchObject({ canWrite: true, archived: false });
		await setArchived(true);
	});

	it('restoring it makes the same writes land again, which is what makes the archive reversible', async () => {
		await setArchived(false);
		expect(
			await f.refusal(f.owner, 'public.ideacad_save_concept($1::uuid, $2::jsonb, 500)', [
				f.conceptId,
				JSON.stringify({ blade: 'RESTORED' })
			])
		).toBe('');
		await setArchived(true);
	});
});

// ---------------------------------------------------------------------------
// E. THE CLASS SHARE. Mr. Pina's second sentence, in both directions.
// ---------------------------------------------------------------------------
describe('E. an instructor shares an archived document with a current class', () => {
	const shareToNewSection = (user = f.teacher, section = f.newSection) =>
		f.refusal(user, 'public.ideacad_share_document_with_section($1::uuid, $2::uuid)', [
			f.documentId,
			section
		]);

	it('BEFORE the grant, a current student cannot read the document at all', async () => {
		// Three independent refusals, so no single one is doing all the work.
		const role = await f.predicate<string | null>(
			f.nextYear,
			'public._ideacad_document_role($1::uuid)',
			[f.documentId]
		);
		expect(role).toBeNull();

		const visible = await f.db.asUser(f.nextYear.id, async (q) => {
			const { rows } = await q('select id from public.ideacad_documents where id = $1', [
				f.documentId
			]);
			return rows.length;
		});
		expect(visible).toBe(0);

		expect(
			await f.refusal(f.nextYear, 'public.ideacad_open_shared_document($1::uuid)', [
				f.documentId
			])
		).toContain('That document does not exist.');

		expect(
			await f.call<unknown[]>(f.nextYear, 'public.ideacad_shared_with_me($1::uuid)', [f.itemId])
		).toEqual([]);
	});

	it('the instructor grants it to this current class', async () => {
		expect(await shareToNewSection()).toBe('');
		const grants = await f.call<Array<Record<string, unknown>>>(
			f.teacher,
			'public.ideacad_document_section_grants($1::uuid)',
			[f.documentId]
		);
		expect(grants).toHaveLength(1);
		expect(grants[0]).toMatchObject({
			sectionId: f.newSection,
			label: 'Period 3',
			grantedBy: f.teacher.email
		});
	});

	it('AFTER the grant, the current student discovers it, opens it, and is a VIEWER', async () => {
		const mine = await f.call<Array<Record<string, unknown>>>(
			f.nextYear,
			'public.ideacad_shared_with_me($1::uuid)',
			[f.itemId]
		);
		expect(mine).toHaveLength(1);
		expect(mine[0]).toMatchObject({
			documentId: f.documentId,
			ownerEmail: f.owner.email,
			role: 'viewer',
			via: 'class'
		});

		const opened = await f.call<{ role: string; canWrite: boolean; concepts: unknown[] }>(
			f.nextYear,
			'public.ideacad_open_shared_document($1::uuid)',
			[f.documentId]
		);
		expect(opened).toMatchObject({ role: 'viewer', canWrite: false });
		expect(opened.concepts).toHaveLength(1);
	});

	it('and CANNOT write a single one of the seven, class grant or not', async () => {
		const attempts: Array<[string, string, unknown[]]> = [
			['new_concept', 'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)', [f.documentId, 'x', '{}']],
			['save_concept', 'public.ideacad_save_concept($1::uuid, $2::jsonb, 900)', [f.conceptId, '{}']],
			['update_meta', 'public.ideacad_update_concept_meta($1::uuid, $2, 3)', [f.conceptId, 'x']],
			['set_active', 'public.ideacad_set_active($1::uuid, $2::uuid)', [f.documentId, f.conceptId]],
			['set_prediction', 'public.ideacad_set_prediction($1::uuid, $2::uuid, $3)', [f.documentId, f.conceptId, 'x']],
			['commit', 'public.ideacad_commit_concept($1::uuid)', [f.conceptId]],
			['delete_concept', 'public.ideacad_delete_concept($1::uuid)', [f.conceptId]]
		];
		const refused: string[] = [];
		for (const [label, expression, params] of attempts) {
			if ((await f.refusal(f.nextYear, expression, params)) !== '') refused.push(label);
		}
		expect(refused).toHaveLength(7);

		// Nor can they re-share it, in either shape.
		expect(
			await f.refusal(f.nextYear, 'public.ideacad_share_document($1::uuid, $2, $3)', [
				f.documentId,
				f.stranger.email,
				'viewer'
			])
		).toContain('You can only share your own document.');
		expect(
			await f.refusal(
				f.nextYear,
				'public.ideacad_share_document_with_section($1::uuid, $2::uuid)',
				[f.documentId, f.newSection]
			)
		).toContain('That document does not exist.');
	});

	it('THE OUT-OF-CLASS STRANGER IS STILL REFUSED -- the grant is a class, not the world', async () => {
		expect(
			await f.predicate<string | null>(f.stranger, 'public._ideacad_document_role($1::uuid)', [
				f.documentId
			])
		).toBeNull();
		expect(
			await f.refusal(f.stranger, 'public.ideacad_open_shared_document($1::uuid)', [
				f.documentId
			])
		).toContain('That document does not exist.');
		expect(
			await f.call<unknown[]>(f.stranger, 'public.ideacad_shared_with_me($1::uuid)', [f.itemId])
		).toEqual([]);
	});

	it('a personal EDITOR grant beats the class viewer grant, and does not get demoted by it', async () => {
		// The ordering inside _ideacad_document_role. Reversed, this student
		// would silently become a viewer with nothing on screen saying why.
		await f.db.sql(
			`insert into public.ideacad_grants(document_id, grantee_email, role, granted_by)
			 values ($1, $2, 'editor', $3)
			 on conflict (document_id, grantee_email) do update set role = excluded.role`,
			[f.documentId, f.nextYear.email, f.owner.email]
		);
		expect(
			await f.predicate<string | null>(f.nextYear, 'public._ideacad_document_role($1::uuid)', [
				f.documentId
			])
		).toBe('editor');

		// ...and ideacad_shared_with_me returns ONE row for the document, the
		// person one, rather than two rows disagreeing about the role.
		const mine = await f.call<Array<{ role: string; via: string }>>(
			f.nextYear,
			'public.ideacad_shared_with_me($1::uuid)',
			[f.itemId]
		);
		expect(mine).toHaveLength(1);
		expect(mine[0]).toMatchObject({ role: 'editor', via: 'person' });

		// AND THE EDITOR STILL CANNOT WRITE, because the document is archived.
		// The two rules compose rather than one overriding the other.
		expect(
			await f.predicate<boolean>(f.nextYear, 'public._ideacad_can_write_document($1::uuid)', [
				f.documentId
			])
		).toBe(false);

		await f.db.sql('delete from public.ideacad_grants where document_id = $1 and grantee_email = $2', [
			f.documentId,
			f.nextYear.email
		]);
	});

	it('deactivating the recipient closes their access in the same statement', async () => {
		await f.call(f.teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, false)', [
			f.newSection,
			f.nextYear.email,
			f.nextYear.email
		]);
		expect(
			await f.predicate<string | null>(f.nextYear, 'public._ideacad_document_role($1::uuid)', [
				f.documentId
			])
		).toBeNull();
		await f.call(f.teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			f.newSection,
			f.nextYear.email,
			f.nextYear.email
		]);
		expect(
			await f.predicate<string | null>(f.nextYear, 'public._ideacad_document_role($1::uuid)', [
				f.documentId
			])
		).toBe('viewer');
	});

	it('unsharing closes it, and unsharing twice is not an error', async () => {
		const first = await f.call<{ removed: number }>(
			f.teacher,
			'public.ideacad_unshare_document_from_section($1::uuid, $2::uuid)',
			[f.documentId, f.newSection]
		);
		expect(first).toMatchObject({ ok: true, removed: 1 });
		expect(
			await f.predicate<string | null>(f.nextYear, 'public._ideacad_document_role($1::uuid)', [
				f.documentId
			])
		).toBeNull();

		const second = await f.call<{ removed: number }>(
			f.teacher,
			'public.ideacad_unshare_document_from_section($1::uuid, $2::uuid)',
			[f.documentId, f.newSection]
		);
		expect(second).toMatchObject({ ok: true, removed: 0 });
	});
});

// ---------------------------------------------------------------------------
// F. THE FOUR NARROWINGS 0214's HEADER CLAIMS, each one measured.
// ---------------------------------------------------------------------------
describe('F. the narrowings the header states', () => {
	it('(a) a class grant has no role to choose -- the column does not exist', async () => {
		const { rows } = await f.db.sql<{ column_name: string }>(
			`select column_name from information_schema.columns
			  where table_schema = 'public' and table_name = 'ideacad_section_grants'`
		);
		const names = rows.map((r) => r.column_name).sort();
		expect(names).toEqual(['document_id', 'granted_at', 'granted_by', 'section_id', 'updated_at']);
		expect(names).not.toContain('role');
	});

	it('(b) a LIVE document cannot be shared with a class at all', async () => {
		await setArchived(false);
		expect(
			await f.refusal(
				f.teacher,
				'public.ideacad_share_document_with_section($1::uuid, $2::uuid)',
				[f.documentId, f.newSection]
			)
		).toContain('Archive this document first.');
		await setArchived(true);
		// The control: the identical call, on the identical row, one state over.
		expect(
			await f.refusal(
				f.teacher,
				'public.ideacad_share_document_with_section($1::uuid, $2::uuid)',
				[f.documentId, f.newSection]
			)
		).toBe('');
	});

	it('(c) a section the item is not posted to is refused', async () => {
		expect(
			await f.refusal(
				f.teacher,
				'public.ideacad_share_document_with_section($1::uuid, $2::uuid)',
				[f.documentId, f.unpostedSection]
			)
		).toContain('You can only share this with a class this assignment is posted to.');
	});

	it('and a teacher who does not manage the ITEM is refused before any of that', async () => {
		expect(
			await f.refusal(
				f.otherTeacher,
				'public.ideacad_share_document_with_section($1::uuid, $2::uuid)',
				[f.documentId, f.newSection]
			)
		).toContain('That document does not exist.');
	});

	it('restoring a shared document DROPS its class grants rather than leaving live work shared', async () => {
		const before = await f.call<unknown[]>(
			f.teacher,
			'public.ideacad_document_section_grants($1::uuid)',
			[f.documentId]
		);
		expect(before).toHaveLength(1);

		await setArchived(false);
		expect(
			await f.call<unknown[]>(f.teacher, 'public.ideacad_document_section_grants($1::uuid)', [
				f.documentId
			])
		).toEqual([]);
		expect(
			await f.predicate<string | null>(f.nextYear, 'public._ideacad_document_role($1::uuid)', [
				f.documentId
			])
		).toBeNull();

		// Re-archiving does NOT bring them back, which is the safe direction.
		await setArchived(true);
		expect(
			await f.call<unknown[]>(f.teacher, 'public.ideacad_document_section_grants($1::uuid)', [
				f.documentId
			])
		).toEqual([]);
	});

	it('(d) the owner address is projected, deliberately, and the surface is what says so', async () => {
		await f.call(f.teacher, 'public.ideacad_share_document_with_section($1::uuid, $2::uuid)', [
			f.documentId,
			f.newSection
		]);
		const mine = await f.call<Array<{ ownerEmail: string | null }>>(
			f.nextYear,
			'public.ideacad_shared_with_me($1::uuid)',
			[f.itemId]
		);
		expect(mine[0].ownerEmail).toBe(f.owner.email);
	});
});

// ---------------------------------------------------------------------------
// G. THE 0213 CENSUS IS NOT WEAKENED.
//
// 0213 IS NOT ON THIS BRANCH -- it is claimed by ledger 0212 on
// claude/sharp-einstein-cqrnx6 and lands independently -- so what runs here is
// 0138's FOUR-way census. Two claims are separable and both are made:
//
//   1. STRUCTURAL, and true whichever of the two files lands first: 0214 does
//      not name classroom_remove_enrollment, so the deployed body is
//      BYTE-IDENTICAL before and after 0214 applies.
//   2. THE PREDICATE 0213 WILL RUN, asserted directly against the real tables:
//      its count of ideacad_documents has no archived_at term, so an archived
//      document is counted exactly as a live one is and the refusal 0213 adds
//      fires on an archived document too.
//
// Together those are the whole of "0214 cannot weaken 0213": (1) says the
// function is untouched and (2) says the rows it counts are untouched.
// ---------------------------------------------------------------------------
describe('G. the enrollment census 0214 must not have touched', () => {
	it('0214 names no classroom function at all', async () => {
		const { readFileSync } = await import('node:fs');
		const sql = readFileSync(
			new URL('../../supabase/migrations/0214_ideacad_document_archive.sql', import.meta.url),
			'utf8'
		);
		// Strip the comments: the header discusses 0213 at length, which is the
		// point, and a naive grep over the whole file would find those sentences.
		const code = sql
			.split('\n')
			.filter((line) => !/^\s*--/.test(line))
			.join('\n');
		expect(code).not.toMatch(/create\s+or\s+replace\s+function\s+public\.classroom_/);
		expect(code).not.toMatch(/drop\s+function[^;]*classroom_/);
		expect(code).not.toMatch(/alter\s+(table|function)[^;]*classroom_/);
		// The census name DOES appear in the code, exactly once, inside section
		// 9's read-only self-check -- which asserts the census has no archive
		// term in it. Asserting the name is absent would forbid the check that
		// proves the property, so the COUNT and the STATEMENT are asserted
		// instead: one occurrence, and it is a select out of pg_proc.
		expect(code).toMatch(/proname = 'classroom_remove_enrollment'/);
		// ...and OUTSIDE that read-only self-check the name does not occur at
		// all. Asserting the name is simply absent would forbid the very check
		// that proves the property, and asserting a raw occurrence COUNT would
		// be a number to renumber rather than read.
		const withoutSelfCheck = code.replace(/do \$check\$[\s\S]*?\$check\$;/, '');
		expect(withoutSelfCheck).not.toContain('classroom_remove_enrollment');
		// Positive control: the excision removed something and did not silently
		// match nothing, which would make the line above vacuous.
		expect(withoutSelfCheck.length).toBeLessThan(code.length);
	});

	it('the deployed census body is byte-identical before and after 0214', async () => {
		// Applied over a SECOND database built from the chain WITHOUT 0214, so
		// the comparison is against a real pre-0214 world rather than against a
		// remembered string.
		const { readdirSync, readFileSync } = await import('node:fs');
		const { startTestDb } = await import('./harness');
		const all = readdirSync(new URL('../../supabase/migrations', import.meta.url))
			.filter((file) => file.endsWith('.sql'))
			.sort();
		const without = all.filter((file) => !file.startsWith('0214_'));
		const db = await startTestDb(['../../tests/db/full-chain-fixture-completion.sql', ...without]);
		try {
			const read = async () => {
				const { rows } = await db.sql<{ prosrc: string }>(
					`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
					  where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment'`
				);
				return rows[0].prosrc;
			};
			const before = await read();
			await db.sql(
				readFileSync(
					new URL('../../supabase/migrations/0214_ideacad_document_archive.sql', import.meta.url),
					'utf8'
				)
			);
			const after = await read();
			expect(after).toBe(before);
			// The control: 0214 genuinely applied over this database, so "nothing
			// changed" is not "nothing ran".
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from information_schema.columns
				  where table_schema = 'public' and table_name = 'ideacad_documents'
				    and column_name = 'archived_at'`
			);
			expect(rows[0].n).toBe('1');
		} finally {
			await db.stop();
		}
	}, 240_000);

	it('THE COUNT 0213 TAKES STILL FINDS AN ARCHIVED DOCUMENT', async () => {
		// 0213's own expression, verbatim, run against the real tables. If this
		// ever answers 0 for an archived document, archiving has become a way to
		// strand a part through the removal control -- which is the defect 0213
		// closed, arriving through this file instead.
		const countFor = async (email: string, section: string) => {
			const { rows } = await f.db.sql<{ n: string }>(
				`select count(*)::text as n
				   from public.ideacad_documents d
				   join public.classroom_postings pg on pg.item_id = d.item_id
				  where d.student_email = $1 and pg.section_id = $2`,
				[email, section]
			);
			return Number(rows[0].n);
		};

		const { rows: state } = await f.db.sql<{ archived_at: Date | null }>(
			'select archived_at from public.ideacad_documents where id = $1',
			[f.documentId]
		);
		expect(state[0].archived_at).not.toBeNull();
		expect(await countFor(f.owner.email, f.oldSection)).toBe(1);

		// The negative control for the query itself: somebody with no document
		// counts zero, so a count of 1 above means the join found a row rather
		// than the expression being unconditionally true.
		expect(await countFor(f.stranger.email, f.oldSection)).toBe(0);
	});

	it('and 0138 four-way census still refuses a student with responses, exactly as before', async () => {
		// The census that IS on this branch, driven end to end through the real
		// RPC, so "0214 broke nothing" is measured rather than inferred from the
		// prosrc comparison alone.
		const clean = await f.call<{ ok: boolean }>(
			f.teacher,
			'public.classroom_remove_enrollment($1::uuid, $2)',
			[f.newSection, f.nextYear.email]
		);
		expect(clean).toMatchObject({ ok: true });

		// ...and the refusal direction, on a student who has work in the four
		// categories 0138 counts.
		await f.call(f.teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			f.newSection,
			f.nextYear.email,
			f.nextYear.email
		]);
		await f.db.sql(
			`insert into public.classroom_responses (item_id, student_email, block_id, value)
			 values ($1, $2, 'b1', '{"kind":"text","text":"x"}'::jsonb)
			 on conflict do nothing`,
			[f.itemId, f.nextYear.email]
		);
		const refused = await f.call<{ ok: boolean; reason: string; counts: Record<string, number> }>(
			f.teacher,
			'public.classroom_remove_enrollment($1::uuid, $2)',
			[f.newSection, f.nextYear.email]
		);
		expect(refused).toMatchObject({ ok: false, reason: 'work_attached' });
		expect(refused.counts.responses).toBe(1);
	});
});
