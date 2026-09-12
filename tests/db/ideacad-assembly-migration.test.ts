// tests/db/ideacad-assembly-migration.test.ts
//
// 0207 APPLIED OVER SEEDED PRE-MIGRATION DATA, which is CLAUDE.md's rule for a
// migration test: boot the chain SHORT of the file, seed through the REAL
// pre-migration RPCs, then apply the file over the top. A reset chain proves the
// SQL parses; only seeded data proves the backfill.
//
// THE BEFORE-AND-AFTER ROW COUNTS ARE THE POINT. The prompt asked for them
// measured rather than asserted to work, so this file counts documents,
// concepts and parts on the pre-migration database, applies 0207, and counts
// again. The migration's own self-check makes the same comparison from inside
// the transaction; this is the outside measurement of it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const MIGRATIONS_DIR = new URL('../../supabase/migrations/', import.meta.url);
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const TARGET = '0207_ideacad_assembly_parts.sql';
const CHAIN_BEFORE_0207 = ALL.filter((f) => f !== TARGET);
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';
const TARGET_SQL = readFileSync(new URL(TARGET, MIGRATIONS_DIR), 'utf8');

let db: TestDb;
let teacher: SeededUser;
let alice: SeededUser;
let bob: SeededUser;
let itemId: string;
let sectionId: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

const count = async (table: string, where = 'true'): Promise<number> => {
	const { rows } = await db.sql<{ n: string }>(`select count(*) as n from ${table} where ${where}`);
	return Number(rows[0].n);
};

let before: { documents: number; concepts: number; parts: number };
let after: { documents: number; concepts: number; parts: number };

beforeAll(async () => {
	// The chain WITHOUT 0207 -- the world as it is on production today.
	db = await startTestDb([FIXTURE_COMPLETION, ...CHAIN_BEFORE_0207]);
	teacher = await createUser(db, 'asmmig.teacher@boscotech.edu', 'Asm Teacher');
	alice = await createUser(db, 'asmmig.alice@boscotech.net', 'Alice');
	bob = await createUser(db, 'asmmig.bob@boscotech.net', 'Bob');
	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEAASM', 'IdeaCAD Assembly')"
	);
	const section = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 1', teacher.email]
	);
	sectionId = section.section_id;
	for (const student of [alice, bob]) {
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			section.section_id,
			student.email,
			student.email
		]);
	}
	const item = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[section.section_id]]
	);
	itemId = item.item_id;
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		itemId,
		JSON.stringify({ defaultFeatures: { blade: 'seed' } })
	]);

	// SEEDED THROUGH THE REAL PRE-MIGRATION RPCs: two students open a document,
	// and one of them adds a second concept, so the fixture carries a document
	// with more than one feature tree in it before the column exists.
	for (const student of [alice, bob]) {
		await call(student, 'public.ideacad_open_document($1::uuid)', [itemId]);
	}
	const aliceDoc = await call<{ document: { id: string } }>(
		alice,
		'public.ideacad_open_document($1::uuid)',
		[itemId]
	);
	await call(alice, "public.ideacad_new_concept($1::uuid, 'Concept 2', $2::jsonb)", [
		aliceDoc.document.id,
		JSON.stringify({ blade: 'alternative' })
	]);

	before = {
		documents: await count('public.ideacad_documents'),
		concepts: await count('public.ideacad_concepts'),
		parts: 0
	};

	await db.sql(TARGET_SQL);

	after = {
		documents: await count('public.ideacad_documents'),
		concepts: await count('public.ideacad_concepts'),
		parts: await count('public.ideacad_parts')
	};
}, 600_000);

afterAll(async () => db?.stop());

describe('0207 over seeded pre-migration data', () => {
	it('has a fixture worth migrating: two documents, three concepts, no parts table', () => {
		expect(before).toEqual({ documents: 2, concepts: 3, parts: 0 });
	});

	it('turns every existing document into a one-part assembly and adds or removes nothing else', () => {
		expect(after.documents).toBe(before.documents);
		expect(after.concepts).toBe(before.concepts);
		expect(after.parts).toBe(before.documents);
	});

	it('points every existing concept at a part, and never at another document\'s part', async () => {
		expect(await count('public.ideacad_concepts', 'part_id is null')).toBe(0);
		const mismatched = await count(
			'public.ideacad_concepts c join public.ideacad_parts p on p.id = c.part_id',
			'p.document_id <> c.document_id'
		);
		expect(mismatched).toBe(0);
	});

	it('carries the document\'s active concept onto its part', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from public.ideacad_documents d
			 join public.ideacad_parts p on p.document_id = d.id
			 where d.active_concept_id is not null and p.active_concept_id = d.active_concept_id`
		);
		expect(Number(rows[0].n)).toBe(2);
	});

	it('re-applies as a no-op: the counts do not move and nothing raises', async () => {
		await expect(db.sql(TARGET_SQL)).resolves.toBeTruthy();
		expect(await count('public.ideacad_documents')).toBe(before.documents);
		expect(await count('public.ideacad_concepts')).toBe(before.concepts);
		expect(await count('public.ideacad_parts')).toBe(before.documents);
		expect(await count('public.ideacad_concepts', 'part_id is null')).toBe(0);
		// A third paste, because the interesting failure is the second one that
		// works and the third that does not.
		await expect(db.sql(TARGET_SQL)).resolves.toBeTruthy();
		expect(await count('public.ideacad_parts')).toBe(before.documents);
	});

	it('leaves all ten 0201 functions at exactly one definition each, unredefined', async () => {
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*) as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in (
			   'ideacad_set_editor','ideacad_open_document','ideacad_new_concept',
			   'ideacad_save_concept','ideacad_update_concept_meta','ideacad_delete_concept',
			   'ideacad_set_active','ideacad_set_prediction','ideacad_commit_concept','ideacad_roster')
			 group by p.proname order by p.proname`
		);
		expect(rows).toHaveLength(10);
		expect(rows.every((r) => Number(r.n) === 1)).toBe(true);
	});

	it('keeps 0201\'s own text out of this file: 0207 names none of the ten in a create', () => {
		const creates = TARGET_SQL.split('\n').filter((line) =>
			/^\s*create (or replace )?function/i.test(line)
		);
		const tenNames = [
			'ideacad_set_editor',
			'ideacad_open_document',
			'ideacad_new_concept(',
			'ideacad_save_concept',
			'ideacad_update_concept_meta',
			'ideacad_delete_concept',
			'ideacad_set_active(',
			'ideacad_set_prediction',
			'ideacad_commit_concept',
			'ideacad_roster'
		];
		// The positive control: the sweep DOES find this file's own creates.
		expect(creates.length).toBeGreaterThan(10);
		for (const name of tenNames) {
			expect(creates.filter((line) => line.includes(name))).toEqual([]);
		}
	});
});

describe('the ten 0201 RPCs after 0207: a single-part document behaves as it did', () => {
	it('still opens an existing document and returns its concepts', async () => {
		const opened = await call<{
			document: { id: string; active_concept_id: string };
			concepts: Array<{ id: string; name: string }>;
		}>(alice, 'public.ideacad_open_document($1::uuid)', [itemId]);
		expect(opened.concepts.map((c) => c.name)).toEqual(['Concept 1', 'Concept 2']);
	});

	it('still adds a concept through ideacad_new_concept, and the trigger files it under the sole part', async () => {
		const doc = await call<{ document: { id: string } }>(
			bob,
			'public.ideacad_open_document($1::uuid)',
			[itemId]
		);
		const concept = await call<{ id: string; part_id: string }>(
			bob,
			"public.ideacad_new_concept($1::uuid, 'Concept 2', $2::jsonb)",
			[doc.document.id, JSON.stringify({ blade: 'bob alt' })]
		);
		const { rows } = await db.sql<{ part_id: string | null; document_id: string }>(
			'select part_id, document_id from public.ideacad_concepts where id = $1',
			[concept.id]
		);
		expect(rows[0].part_id).not.toBeNull();
		const { rows: partRows } = await db.sql<{ document_id: string }>(
			'select document_id from public.ideacad_parts where id = $1',
			[rows[0].part_id]
		);
		expect(partRows[0].document_id).toBe(rows[0].document_id);
	});

	it('opens a BRAND-NEW document after 0207 and mints its one-part assembly on the way', async () => {
		const carol = await createUser(db, 'asmmig.carol@boscotech.net', 'Carol');
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			sectionId,
			carol.email,
			carol.email
		]);
		const opened = await call<{
			document: { id: string; active_concept_id: string };
			concepts: Array<{ id: string }>;
		}>(carol, 'public.ideacad_open_document($1::uuid)', [itemId]);
		expect(opened.concepts).toHaveLength(1);
		const { rows } = await db.sql<{ id: string; active_concept_id: string | null; name: string }>(
			'select id, active_concept_id, name from public.ideacad_parts where document_id = $1',
			[opened.document.id]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('Part 1');
		// The part's active concept is the concept that created it -- which is
		// only true because column defaults are filled in before a BEFORE ROW
		// trigger sees the tuple. Measured here rather than assumed.
		expect(rows[0].active_concept_id).toBe(opened.concepts[0].id);
		expect(rows[0].active_concept_id).toBe(opened.document.active_concept_id);
	});

	it('still refuses another student\'s document on every one of the six write paths', async () => {
		const opened = await call<{ document: { id: string }; concepts: Array<{ id: string }> }>(
			alice,
			'public.ideacad_open_document($1::uuid)',
			[itemId]
		);
		const conceptId = opened.concepts[0].id;
		const attempts: Array<[string, unknown[]]> = [
			['public.ideacad_save_concept($1::uuid, $2::jsonb, 99)', [conceptId, '{}']],
			["public.ideacad_update_concept_meta($1::uuid, 'Stolen', 9)", [conceptId]],
			['public.ideacad_delete_concept($1::uuid)', [conceptId]],
			['public.ideacad_set_active($1::uuid, $2::uuid)', [opened.document.id, conceptId]],
			["public.ideacad_set_prediction($1::uuid, $2::uuid, 'mine')", [opened.document.id, conceptId]],
			['public.ideacad_commit_concept($1::uuid)', [conceptId]]
		];
		for (const [expression, params] of attempts) {
			await expect(call(bob, expression, params)).rejects.toThrow();
		}
	});
});

describe('the trigger refuses rather than guesses once an assembly has two parts', () => {
	it('raises on ideacad_new_concept and names the part-aware replacement', async () => {
		const opened = await call<{ document: { id: string } }>(
			alice,
			'public.ideacad_open_document($1::uuid)',
			[itemId]
		);
		await call(alice, "public.ideacad_add_part($1::uuid, 'Hex shank', $2::jsonb)", [
			opened.document.id,
			JSON.stringify({ shank: 'stock' })
		]);
		// The positive control for the message: one part accepted it above, and
		// the same call now refuses with the replacement named.
		await expect(
			call(alice, "public.ideacad_new_concept($1::uuid, 'Ambiguous', $2::jsonb)", [
				opened.document.id,
				'{}'
			])
		).rejects.toThrow(/ideacad_new_part_concept/);
		// And a single-part document beside it is unaffected, so the refusal is
		// per assembly rather than per deployment.
		const bobDoc = await call<{ document: { id: string } }>(
			bob,
			'public.ideacad_open_document($1::uuid)',
			[itemId]
		);
		const { rows } = await db.sql<{ n: string }>(
			'select count(*) as n from public.ideacad_parts where document_id = $1',
			[bobDoc.document.id]
		);
		expect(Number(rows[0].n)).toBe(1);
		await expect(
			call(bob, "public.ideacad_new_concept($1::uuid, 'Concept 3', $2::jsonb)", [
				bobDoc.document.id,
				'{}'
			])
		).resolves.toBeTruthy();
	});
});
