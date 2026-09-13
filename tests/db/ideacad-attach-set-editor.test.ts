// tests/db/ideacad-attach-set-editor.test.ts
//
// WHAT `ideacad_set_editor` ACTUALLY DOES, ASKED OF THE REAL FUNCTION -- 0223.
//
// 0201 shipped this RPC and nothing outside `src/routes/dev/` ever called it,
// so every clause below had been READ and none of it had been DRIVEN. Ledger
// 0223 puts a control in front of it, and the control makes two promises a
// teacher acts on: that turning the editor OFF does not destroy a class's work,
// and that turning it back ON gives every student their own concepts back. This
// file is where those two promises are measured rather than argued.
//
// THE ONE THAT MATTERS MOST IS THE ABSENCE. `ideacad_documents`,
// `ideacad_concepts` and `ideacad_predictions` cascade off `classroom_items`
// and NEVER off `ideacad_editors`, so deleting the editor row leaves them
// standing -- and a wrong answer here is invisible in normal use, because the
// only symptom is a term of student work that is gone the next time somebody
// looks. Every survival assertion therefore rides beside a POSITIVE CONTROL
// counted on the same rows a moment earlier, so a zero cannot be a query that
// was simply looking in the wrong place.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/* The config the shipping control writes is `DEFAULT_BLADE_CONFIG`; what this
   file needs of it is only that `defaultFeatures` is present and round-trips,
   since `ideacad_open_document` builds the first concept out of it. */
const CONFIG = JSON.stringify({ defaultFeatures: { schema: 1, editor: 'blade', features: [] } });

let db: TestDb;
let teacher: SeededUser;
let other: SeededUser;
let alice: SeededUser;
let bob: SeededUser;
let sectionId: string;
let itemId: string;
let materialId: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

/** Read as the CONNECTION OWNER, outside RLS, because these counts are about
    whether rows EXIST and not about who may see them. A count taken as a
    student would conflate a deleted row with a hidden one. */
const count = async (table: string, where: string, params: unknown[] = []): Promise<number> => {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text as n from public.${table} where ${where}`,
		params
	);
	return Number(rows[0].n);
};

const schemaVersion = async (): Promise<number | null> => {
	const { rows } = await db.sql<{ v: number | null }>(
		'select assignment_schema_version as v from public.classroom_items where id = $1',
		[itemId]
	);
	return rows[0].v;
};

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'attach.teacher@boscotech.edu', 'Attach Teacher');
	other = await createUser(db, 'attach.other@boscotech.edu', 'Other Teacher');
	alice = await createUser(db, 'attach.alice@boscotech.net', 'Alice');
	bob = await createUser(db, 'attach.bob@boscotech.net', 'Bob');
	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEAATTACH', 'IdeaCAD Attach')"
	);
	const section = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 2', teacher.email]
	);
	sectionId = section.section_id;
	for (const student of [alice, bob]) {
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			sectionId,
			student.email,
			student.email
		]);
	}
	const item = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[sectionId]]
	);
	itemId = item.item_id;
	const material = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('material', $1::uuid[], 'Reading', 'Read it.', null, null, null, true, '[]'::jsonb, false)",
		[[sectionId]]
	);
	materialId = material.item_id;
}, 600_000);

afterAll(async () => db?.stop());

describe('ideacad_set_editor: who may call it, and on what', () => {
	it('refuses a teacher who does not manage the item, and writes nothing', async () => {
		await expect(
			call(other, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [itemId, CONFIG])
		).rejects.toThrow(/Only a teacher for this class can change its editor/);
		expect(await count('ideacad_editors', 'item_id = $1', [itemId])).toBe(0);
		expect(await schemaVersion()).toBeNull();
	});

	it('refuses a student outright', async () => {
		await expect(
			call(alice, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [itemId, CONFIG])
		).rejects.toThrow(/Only a teacher for this class can change its editor/);
		expect(await count('ideacad_editors', 'item_id = $1', [itemId])).toBe(0);
	});

	it('refuses anything that is not an assignment', async () => {
		await expect(
			call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [materialId, CONFIG])
		).rejects.toThrow(/IdeaCAD can only be attached to an assignment/);
	});

	it('refuses an editor name that is not blade', async () => {
		await expect(
			call(teacher, "public.ideacad_set_editor($1::uuid, 'sketchpad', $2::jsonb)", [itemId, CONFIG])
		).rejects.toThrow(/Choose the Blade editor/);
		expect(await count('ideacad_editors', 'item_id = $1', [itemId])).toBe(0);
	});

	it('refuses an item that already carries a ported worksheet, with the sentence the control renders verbatim', async () => {
		await db.sql('update public.classroom_items set assignment_schema_version = 3 where id = $1', [
			itemId
		]);
		await expect(
			call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [itemId, CONFIG])
		).rejects.toThrow('This assignment already uses another work surface. Remove it first.');
		/* THE ITEM IS LEFT WHERE IT WAS. A refusal that had already moved the
		   column would be a worse outcome than the one it refused. */
		expect(await schemaVersion()).toBe(3);
		await db.sql(
			'update public.classroom_items set assignment_schema_version = null where id = $1',
			[itemId]
		);
	});

	it('turns it on: writes the editor row, stores the config, and sets the item to schema 4', async () => {
		const result = await call<{ ok: boolean; editor: string }>(
			teacher,
			"public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)",
			[itemId, CONFIG]
		);
		expect(result).toEqual({ ok: true, editor: 'blade' });
		expect(await count('ideacad_editors', 'item_id = $1', [itemId])).toBe(1);
		expect(await schemaVersion()).toBe(4);
		const { rows } = await db.sql<{ config: { defaultFeatures: unknown } }>(
			'select config from public.ideacad_editors where item_id = $1',
			[itemId]
		);
		expect(rows[0].config.defaultFeatures).toEqual({ schema: 1, editor: 'blade', features: [] });
	});

	it('re-applies over itself without minting a second row', async () => {
		await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [itemId, CONFIG]);
		expect(await count('ideacad_editors', 'item_id = $1', [itemId])).toBe(1);
		expect(await schemaVersion()).toBe(4);
	});
});

describe('turning it off does not destroy student work', () => {
	let aliceConceptId: string;

	it('POSITIVE CONTROL: two students open it and their rows are really there', async () => {
		for (const student of [alice, bob]) {
			const opened = await call<{
				document: { id: string };
				concepts: Array<{ id: string; revision: number }>;
			}>(student, 'public.ideacad_open_document($1::uuid)', [itemId]);
			expect(opened.concepts).toHaveLength(1);
			if (student === alice) aliceConceptId = opened.concepts[0].id;
		}
		await call(alice, 'public.ideacad_save_concept($1::uuid, $2::jsonb, $3)', [
			aliceConceptId,
			JSON.stringify({ schema: 1, editor: 'blade', features: ['alice worked here'] }),
			2
		]);
		const doc = await db.sql<{ id: string }>(
			'select id from public.ideacad_documents where item_id = $1 and student_email = $2',
			[itemId, alice.email]
		);
		await call(alice, 'public.ideacad_set_prediction($1::uuid, $2::uuid, $3)', [
			doc.rows[0].id,
			aliceConceptId,
			'this one is stiffer'
		]);
		expect(await count('ideacad_documents', 'item_id = $1', [itemId])).toBe(2);
		expect(
			await count(
				'ideacad_concepts',
				'document_id in (select id from public.ideacad_documents where item_id = $1)',
				[itemId]
			)
		).toBe(2);
		expect(
			await count(
				'ideacad_predictions',
				'document_id in (select id from public.ideacad_documents where item_id = $1)',
				[itemId]
			)
		).toBe(1);
	});

	it('off removes the editor row and clears the schema version', async () => {
		const result = await call<{ ok: boolean; editor: null }>(
			teacher,
			'public.ideacad_set_editor($1::uuid, null, null)',
			[itemId]
		);
		expect(result).toEqual({ ok: true, editor: null });
		expect(await count('ideacad_editors', 'item_id = $1', [itemId])).toBe(0);
		expect(await schemaVersion()).toBeNull();
	});

	it('and leaves every document, concept and prediction exactly where it was', async () => {
		expect(await count('ideacad_documents', 'item_id = $1', [itemId])).toBe(2);
		expect(
			await count(
				'ideacad_concepts',
				'document_id in (select id from public.ideacad_documents where item_id = $1) and deleted_at is null',
				[itemId]
			)
		).toBe(2);
		expect(
			await count(
				'ideacad_predictions',
				'document_id in (select id from public.ideacad_documents where item_id = $1)',
				[itemId]
			)
		).toBe(1);
		const { rows } = await db.sql<{ features: { features: string[] } }>(
			'select features from public.ideacad_concepts where id = $1',
			[aliceConceptId]
		);
		expect(rows[0].features.features).toEqual(['alice worked here']);
	});

	it('but STRANDS them: a student can no longer open the document while it is off', async () => {
		await expect(
			call(alice, 'public.ideacad_open_document($1::uuid)', [itemId])
		).rejects.toThrow(/does not have the Blade editor/);
	});

	it('and turning it back on returns every student to the concept they left, with no second concept minted', async () => {
		await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [itemId, CONFIG]);
		const reopened = await call<{
			concepts: Array<{ id: string; features: { features: string[] }; revision: number }>;
		}>(alice, 'public.ideacad_open_document($1::uuid)', [itemId]);
		expect(reopened.concepts).toHaveLength(1);
		expect(reopened.concepts[0].id).toBe(aliceConceptId);
		expect(reopened.concepts[0].features.features).toEqual(['alice worked here']);
		expect(reopened.concepts[0].revision).toBe(2);
		expect(await count('ideacad_documents', 'item_id = $1', [itemId])).toBe(2);
		expect(
			await count(
				'ideacad_concepts',
				'document_id in (select id from public.ideacad_documents where item_id = $1)',
				[itemId]
			)
		).toBe(2);
	});
});
