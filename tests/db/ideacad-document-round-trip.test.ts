import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

let db: TestDb;
let teacher: SeededUser;
let alice: SeededUser;
let bob: SeededUser;
let itemId: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'ideacad.teacher@boscotech.edu', 'IdeaCAD Teacher');
	alice = await createUser(db, 'ideacad.alice@boscotech.net', 'Alice');
	bob = await createUser(db, 'ideacad.bob@boscotech.net', 'Bob');
	const course = await call<{ course_id: string }>(teacher, "public.classroom_upsert_course('IDEACAD', 'IdeaCAD')");
	const section = await call<{ section_id: string }>(teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 1', teacher.email]);
	for (const student of [alice, bob]) {
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)',
			[section.section_id, student.email, student.email]);
	}
	const item = await call<{ item_id: string }>(teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[section.section_id]]);
	itemId = item.item_id;
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)",
		[itemId, JSON.stringify({ defaultFeatures: { blade: 'seed' } })]);
}, 600_000);

afterAll(async () => db?.stop());

describe('IdeaCAD real RPC round trip and ownership', () => {
	it('opens, edits, saves, and opens the persisted feature tree', async () => {
		const first = await call<{ document: { id: string }; concepts: Array<{ id: string; revision: number }> }>(
			alice, 'public.ideacad_open_document($1::uuid)', [itemId]);
		const concept = first.concepts[0];
		const saved = await call<{ ok: boolean; concept: { revision: number; features: unknown } }>(
			alice, 'public.ideacad_save_concept($1::uuid, $2::jsonb, $3)',
			[concept.id, JSON.stringify({ blade: 'student edit' }), concept.revision + 1]);
		expect(saved).toMatchObject({ ok: true, concept: { revision: 2, features: { blade: 'student edit' } } });
		const reopened = await call<{ concepts: Array<{ features: unknown }> }>(alice,
			'public.ideacad_open_document($1::uuid)', [itemId]);
		expect(reopened.concepts[0].features).toEqual({ blade: 'student edit' });
	});

	it('refuses a stale revision and returns the stored row rather than clobbering it', async () => {
		const opened = await call<{ concepts: Array<{ id: string; revision: number }> }>(alice,
			'public.ideacad_open_document($1::uuid)', [itemId]);
		const result = await call<{ ok: boolean; reason: string; concept: { features: unknown; revision: number } }>(
			alice, 'public.ideacad_save_concept($1::uuid, $2::jsonb, $3)',
			[opened.concepts[0].id, JSON.stringify({ blade: 'stale local work' }), opened.concepts[0].revision]);
		expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'stale' }));
		expect(result.concept.features).toEqual({ blade: 'student edit' });
	});

	it('does not let another student save, rename, reposition, delete, activate, predict, or commit the document', async () => {
		const opened = await call<{ document: { id: string }; concepts: Array<{ id: string }> }>(alice,
			'public.ideacad_open_document($1::uuid)', [itemId]);
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
		const stored = await db.sql<{ name: string; revision: number; committed_at: string | null }>(
			'select name, revision, committed_at from public.ideacad_concepts where id=$1', [conceptId]);
		expect(stored.rows[0]).toMatchObject({ name: 'Concept 1', revision: 2, committed_at: null });
	});
});
