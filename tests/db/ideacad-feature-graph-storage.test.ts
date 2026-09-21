/**
 * 0217 (ideacad_feature_graph): the version 2 envelope, the trash, folders,
 * tags, rename, duplicate and thumbnails for DIRECT documents -- applied over
 * SEEDED PRE-MIGRATION DATA, the way CLAUDE.md's migration rule asks.
 *
 * THE CHAIN IS EVERYTHING THROUGH 0216, THEN THE REAL PRE-MIGRATION RPCs SEED
 * FOUR DOCUMENTS, THEN 0217 IS APPLIED OVER THE TOP. A document saved as
 * version 1 bodies by 0216's own save function is what production holds, and
 * the assertions below are about what happens to THAT: it still opens, still
 * saves as version 1, upgrades on the next version 2 save through ordinary
 * history actions, and replays across the boundary.
 *
 * WHAT IS PROVEN WITH A POSITIVE CONTROL RATHER THAN ASSERTED:
 *   - the trash's exclusion from the chooser list (a mutant list function
 *     derived from the migration text with the trash term removed LISTS the
 *     trashed row; the real one does not);
 *   - the expiry sweep (a 31-day-old trashed row goes; a 29-day-old one stays);
 *   - the readiness query's negative controls (two rows expected false).
 *
 * WHAT IS NOT PROVEN HERE: geometry. The validator is a persistence check and
 * the tests hand it a real BREP artifact only because 0216's save insists on
 * one; whether a feature list REBUILDS is `tests/ideacad-solid-features.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { startTestDb, createUser, type TestDb, type SeededUser } from './harness';
import { diffTrees } from '../../src/lib/ideacad/history';
import { canonical, historyAtRevision } from '../../src/lib/ideacad/solid/history';
import { createKernel } from '../../src/lib/ideacad/kernel/remus';

const MIGRATION = 'supabase/migrations/0217_ideacad_feature_graph.sql';
const KERNEL = 'remus-f7907f5-2.130.20';
const ROOT = process.cwd();
const SQL = readFileSync(`${ROOT}/${MIGRATION}`, 'utf8');
/** The world as production holds it: every file through 0216. */
const BEFORE = readdirSync(`${ROOT}/supabase/migrations`)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) <= 216)
	.sort();

let db: TestDb;
let owner: SeededUser, editor: SeededUser, viewer: SeededUser, stranger: SeededUser, teacher: SeededUser;
let sectionId: string, itemId: string;
let boxBytes: Uint8Array, boxHash: string;
/** Seeded BEFORE 0217 through 0216's own RPCs. */
let scratchId: string, linkedId: string, sharedId: string, editedId: string;
let scratchBodyId: string;
let readiness: { examined: string; expected: boolean; actual: boolean; ok: boolean }[];

const call = async (user: SeededUser, expression: string, params: unknown[] = []): Promise<any> =>
	db.asUser(user.id, async (q) => (await q(`select ${expression} as result`, params)).rows[0].result);
const denied = async (user: SeededUser, expression: string, params: unknown[] = []): Promise<string> => {
	try { await call(user, expression, params); return ''; } catch (error) { return (error as Error).message; }
};
const create = (user: SeededUser, title: string) => call(user, 'public.ideacad_create_direct_document($1,$2)', [title, KERNEL]);
const open = (id: string, user = owner) => call(user, 'public.ideacad_open_direct_document($1::uuid)', [id]);
const list = (user = owner): Promise<any[]> => call(user, 'public.ideacad_direct_documents()');
const trashList = (user = owner): Promise<any[]> => call(user, 'public.ideacad_direct_trash()');
const blob = () => ({ hash: boxHash, data: Buffer.from(boxBytes).toString('base64') });
const body = (id = randomUUID()) => ({ id, name: 'Box', artifact: boxHash, materialId: null, role: 'part', topologyEpoch: randomUUID() });
const saveExpression = 'public.ideacad_save_direct_document($1::uuid,$2::integer,$3::uuid,$4,$5::jsonb,$6::jsonb,$7::jsonb)';
function saveArgs(opened: any, model: any, options: { actions?: unknown[]; artifacts?: unknown[]; label?: string } = {}) {
	return [opened.document.id, opened.concept.revision, randomUUID(), options.label ?? 'Shape',
		JSON.stringify(options.actions ?? diffTrees(opened.concept.features, model)), JSON.stringify(model), JSON.stringify(options.artifacts ?? [])];
}
const save = (opened: any, model: any, options: Parameters<typeof saveArgs>[2] = {}, user = owner) => call(user, saveExpression, saveArgs(opened, model, options));
/** The client's upgrade of a version 1 tree, as `upgradeManifest` writes it: one `body` feature per saved body. */
const upgraded = (model: any) => ({
	...model, format: 'ideacad-solid-v2',
	features: model.bodies.map((b: any, i: number) => ({ id: `legacy-${b.id}`, name: `Saved body ${i + 1}`, type: 'body', bodyId: b.id, artifact: b.artifact, source: 'legacy' }))
});
async function counts(id: string) {
	return (await db.sql(`select
		(select count(*)::int from public.ideacad_documents where id=$1) as documents,
		(select count(*)::int from public.ideacad_concepts where document_id=$1) as concepts,
		(select count(*)::int from public.ideacad_history h join public.ideacad_concepts c on c.id=h.concept_id where c.document_id=$1) as history,
		(select count(*)::int from public.ideacad_brep_artifacts where document_id=$1) as artifacts,
		(select count(*)::int from public.ideacad_grants where document_id=$1) as grants`, [id])).rows[0];
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeAll(async () => {
	db = await startTestDb(['../../tests/db/full-chain-fixture-completion.sql', ...BEFORE]);
	[owner, editor, viewer, stranger, teacher] = await Promise.all([
		createUser(db, 'fg.owner@boscotech.net', 'Owner'),
		createUser(db, 'fg.editor@boscotech.net', 'Editor'),
		createUser(db, 'fg.viewer@boscotech.net', 'Viewer'),
		createUser(db, 'fg.stranger@boscotech.net', 'Stranger'),
		createUser(db, 'fg.teacher@boscotech.edu', 'Teacher')
	]);
	const kernel = await createKernel(readFileSync(`${ROOT}/static/ideacad/kernels/remus-9307e73.wasm`));
	const box = kernel.makeBox(2, 3, 4);
	boxBytes = kernel.serializeSolids(new Uint32Array([box]));
	boxHash = createHash('sha256').update(boxBytes).digest('hex');
	kernel.free();

	/* --- The world before 0217, seeded through 0216's real functions. --- */
	const course = await call(teacher, "public.classroom_upsert_course('FGAUDIT','Feature Graph Audit')");
	sectionId = (await call(teacher, 'public.classroom_upsert_section($1::uuid,$2,null,$3)', [course.course_id, 'A', teacher.email])).section_id;
	await call(teacher, 'public.classroom_set_enrollment($1::uuid,$2,$3,true)', [sectionId, owner.email, 'Owner']);
	itemId = (await call(teacher, "public.classroom_create_item('assignment',$1::uuid[],'Bracket','Build it.',20,null,null,true,'[]'::jsonb,false)", [[sectionId]])).item_id;
	await call(teacher, "public.ideacad_set_editor($1::uuid,'blade',$2::jsonb)", [itemId, JSON.stringify({ defaultFeatures: { legacy: true }, rules: {} })]);

	const scratch = await create(owner, 'Scratch bracket');
	scratchId = scratch.document.id;
	const scratchBody = body(); scratchBodyId = scratchBody.id;
	await save(scratch, { ...structuredClone(scratch.concept.features), bodies: [scratchBody] }, { artifacts: [blob()] });

	const linked = await create(owner, 'Assignment bracket');
	linkedId = linked.document.id;
	await save(linked, { ...structuredClone(linked.concept.features), bodies: [body()] }, { artifacts: [blob()] });
	await call(owner, 'public.ideacad_link_direct_document($1::uuid,$2::uuid)', [linkedId, itemId]);

	const shared = await create(owner, 'Shared reference');
	sharedId = shared.document.id;
	await save(shared, { ...structuredClone(shared.concept.features), bodies: [body()] }, { artifacts: [blob()] });
	await call(owner, "public.ideacad_share_direct_document($1::uuid,$2,'viewer')", [sharedId, viewer.email]);

	const edited = await create(owner, 'Editable bracket');
	editedId = edited.document.id;
	await save(edited, { ...structuredClone(edited.concept.features), bodies: [body()] }, { artifacts: [blob()] });
	await call(owner, "public.ideacad_share_direct_document($1::uuid,$2,'editor')", [editedId, editor.email]);

	/* --- Apply 0217 over the top. The trailing readiness select is the last result. --- */
	const applied: any = await db.sql(SQL);
	readiness = (Array.isArray(applied) ? applied.at(-1).rows : applied.rows) as typeof readiness;
}, 600_000);

afterAll(async () => { await db?.stop(); });

describe('A. the envelope validator, widened to two formats over seeded version 1 documents', () => {
	it('answers the readiness query with every row ok and exactly two negative controls', () => {
		expect(readiness.length).toBeGreaterThan(30);
		expect(readiness.filter((r) => !r.ok)).toEqual([]);
		const controls = readiness.filter((r) => r.expected === false);
		expect(controls).toHaveLength(2);
		for (const control of controls) expect(control.actual).toBe(false);
	});
	it('still opens and still saves a version 1 document exactly as 0216 did', async () => {
		const opened = await open(scratchId);
		expect(opened.concept.features.format).toBe('ideacad-solid-v1');
		expect(opened.canWrite).toBe(true);
		expect(opened.document.deleted_at).toBeNull();
		const result = await save(opened, { ...opened.concept.features, title: 'Scratch bracket, renamed as v1' }, { label: 'Rename' });
		expect(result.ok).toBe(true);
		expect((await open(scratchId)).concept.features.format).toBe('ideacad-solid-v1');
	});
	it('refuses a version 1 tree that carries a feature list, so version 1 stays exactly version 1', async () => {
		const opened = await open(scratchId);
		expect(await denied(owner, saveExpression, saveArgs(opened, { ...opened.concept.features, features: [] }))).toContain('carries no feature list');
	});
	it('upgrades on the first version 2 save through ordinary history actions, and the log replays across the boundary', async () => {
		const opened = await open(scratchId);
		const v1 = opened.concept.features;
		const v2 = upgraded(v1);
		const actions = diffTrees(v1, v2);
		expect(actions.map((a) => `${a.kind} ${a.path}`)).toEqual(expect.arrayContaining(['set /format', 'insert /features']));
		const result = await save(opened, v2, { actions, label: 'Upgrade' });
		expect(result.ok).toBe(true);
		expect(result.acceptedRevision).toBe(opened.concept.revision + 1);
		const reopened = await open(scratchId);
		expect(reopened.concept.features.format).toBe('ideacad-solid-v2');
		expect(reopened.concept.features.features).toHaveLength(1);
		expect(reopened.concept.features.features[0]).toMatchObject({ type: 'body', bodyId: scratchBodyId, artifact: boxHash });
		/* The client's own replay check, over the real rows: origin (v1) + actions = the v2 tree. */
		const history = await call(owner, 'public.ideacad_direct_concept_history($1::uuid,-1,2000)', [reopened.concept.id]);
		const replay = historyAtRevision(history.rows, reopened.concept.revision, reopened.concept.features);
		expect(replay.lastSeq).toBe(history.newestSeq);
		expect(canonical(history.rows[0].after)).toContain('ideacad-solid-v1');
	});
	it('accepts a version 2 save with a feature list, body colours and a fixed flag', async () => {
		const opened = await open(scratchId);
		const model = structuredClone(opened.concept.features);
		model.features.push({ id: 'f000000000001', name: 'Fillet 1', type: 'fillet', edges: [], radius: 0.1, suppressed: true });
		model.bodies[0].color = '#33aa55'; model.bodies[0].fixed = true;
		const result = await save(opened, model);
		expect(result.ok).toBe(true);
		const reopened = await open(scratchId);
		expect(reopened.concept.features.features).toHaveLength(2);
		expect(reopened.concept.features.bodies[0]).toMatchObject({ color: '#33aa55', fixed: true });
	});
	it('refuses the malformed version 2 shapes by name', async () => {
		const opened = await open(scratchId);
		const base = structuredClone(opened.concept.features);
		const cases: [any, string][] = [
			[{ ...base, features: [...base.features, { ...base.features[0] }] }, 'Feature IDs must be unique'],
			[{ ...base, features: [{ id: 'x', name: 'Bad', type: 'Extrude!' }] }, 'A feature needs a stable ID, a type and a name'],
			[{ ...base, features: [{ id: '', name: 'Bad', type: 'extrude' }] }, 'A feature needs a stable ID, a type and a name'],
			[{ ...base, features: [{ id: 'x', name: 'Bad', type: 'extrude', suppressed: 'yes' }] }, 'A feature needs a stable ID, a type and a name'],
			[(() => { const { features: _f, ...rest } = base; return rest; })(), 'needs its feature list'],
			[{ ...base, bodies: [{ ...base.bodies[0], color: 'red' }] }, 'six-digit hex colour'],
			[{ ...base, bodies: [{ ...base.bodies[0], fixed: 'yes' }] }, 'either fixed or not'],
			[{ ...base, format: 'ideacad-solid-v3' }, 'not supported']
		];
		for (const [model, message] of cases) expect(await denied(owner, saveExpression, saveArgs(opened, model)), message).toContain(message);
		expect((await open(scratchId)).concept.revision).toBe(opened.concept.revision);
	});
	it('projects the launch page fields on the list: format, featureCount, canTrash, folderId, tags, thumbnail', async () => {
		const rows = await list();
		const scratch = rows.find((r) => r.id === scratchId), linked = rows.find((r) => r.id === linkedId);
		expect(scratch).toMatchObject({ format: 'ideacad-solid-v2', featureCount: 2, bodyCount: 1, canTrash: true, folderId: null, tags: [], thumbnail: null });
		expect(linked).toMatchObject({ format: 'ideacad-solid-v1', featureCount: 0, canTrash: false, itemId });
		expect(typeof scratch.createdAt).toBe('string');
	});
});

describe('B. the trash: owner-only, unlinked-only, hidden from everyone else, restorable, then really gone', () => {
	it('a linked document has no trash path, and the preserve trigger still refuses its delete', async () => {
		expect(await denied(owner, 'public.ideacad_trash_direct_document($1::uuid)', [linkedId])).toContain('linked to an assignment');
		expect(await denied(owner, 'public.ideacad_purge_direct_document($1::uuid)', [linkedId])).toContain('linked to an assignment');
		await expect(db.sql('delete from public.ideacad_documents where id=$1', [linkedId])).rejects.toThrow('Archive the work instead of deleting it');
		await expect(db.sql('update public.ideacad_documents set deleted_at=now() where id=$1', [linkedId])).rejects.toThrow('ideacad_documents_trash_unlinked_check');
		expect((await counts(linkedId)).documents).toBe(1);
	});
	it('a raw delete of a live unlinked document is refused too: only a trashed model can go, and only through the purge', async () => {
		await expect(db.sql('delete from public.ideacad_documents where id=$1', [scratchId])).rejects.toThrow('Move this model to the trash first');
	});
	it('only the owner may trash: a grantee and a stranger get does-not-exist', async () => {
		expect(await denied(viewer, 'public.ideacad_trash_direct_document($1::uuid)', [sharedId])).toContain('does not exist');
		expect(await denied(stranger, 'public.ideacad_trash_direct_document($1::uuid)', [sharedId])).toContain('does not exist');
		expect(await denied(editor, 'public.ideacad_trash_direct_document($1::uuid)', [editedId])).toContain('does not exist');
	});
	it('trashing takes the document off every list, off the grantee, and makes it read-only for its owner', async () => {
		expect((await open(sharedId, viewer)).document.id).toBe(sharedId);
		const result = await call(owner, 'public.ideacad_trash_direct_document($1::uuid)', [sharedId]);
		expect(result.ok).toBe(true);
		const purgeAt = new Date(result.purgeAt).getTime() - new Date(result.deletedAt).getTime();
		expect(purgeAt).toBe(30 * 24 * 3600 * 1000);
		/* Absent from the owner's list and the viewer's list; present, with the purge date, in the owner's trash. */
		expect((await list()).map((r) => r.id)).not.toContain(sharedId);
		expect((await list(viewer)).map((r) => r.id)).not.toContain(sharedId);
		const trash = await trashList();
		expect(trash.map((r) => r.id)).toEqual([sharedId]);
		expect(trash[0].purgeAt).toBe(result.purgeAt);
		expect(await trashList(viewer)).toEqual([]);
		/* The grantee cannot open it; the owner opens it read-only. */
		expect(await denied(viewer, 'public.ideacad_open_direct_document($1::uuid)', [sharedId])).toContain('does not exist');
		const opened = await open(sharedId);
		expect(opened.canWrite).toBe(false);
		expect(opened.deletedAt).toBe(result.deletedAt);
		expect(opened.document.deleted_by).toBe(owner.email);
		expect(await denied(owner, saveExpression, saveArgs(opened, { ...opened.concept.features, title: 'Nope' }))).toContain('cannot edit');
		/* Every owner action on a trashed row says to restore it first. */
		expect(await denied(owner, 'public.ideacad_set_direct_document_archived($1::uuid,true)', [sharedId])).toContain('from the trash first');
		expect(await denied(owner, 'public.ideacad_link_direct_document($1::uuid,$2::uuid)', [sharedId, itemId])).toContain('from the trash before linking');
		expect(await denied(owner, "public.ideacad_share_direct_document($1::uuid,$2,'viewer')", [sharedId, stranger.email])).toContain('from the trash before sharing');
		expect(await denied(owner, 'public.ideacad_move_direct_document($1::uuid,null)', [sharedId])).toContain('from the trash first');
		expect(await denied(owner, "public.ideacad_tag_direct_document($1::uuid,array['x'])", [sharedId])).toContain('from the trash first');
		expect(await denied(owner, 'public.ideacad_duplicate_direct_document($1::uuid,null)', [sharedId])).toContain('from the trash first');
		expect(await denied(owner, 'public.ideacad_rename_direct_document($1::uuid,$2)', [sharedId, 'Nope'])).toContain('cannot edit');
		/* Trashing twice is not an error and does not move the date. */
		const again = await call(owner, 'public.ideacad_trash_direct_document($1::uuid)', [sharedId]);
		expect(again.deletedAt).toBe(result.deletedAt);
	});
	it('the list exclusion is a real filter: a mutant without the trash term lists the trashed row (positive control)', async () => {
		const start = SQL.indexOf('create or replace function public.ideacad_direct_documents()');
		const end = SQL.indexOf('$fgdirectlist$;', start) + '$fgdirectlist$;'.length;
		const original = SQL.slice(start, end);
		const term = " and d.deleted_at is null and public._ideacad_can_read_document(d.id);";
		expect(original.split(term)).toHaveLength(2);
		const mutant = original.replace(term, ' and public._ideacad_can_read_document(d.id);');
		await db.sql(mutant);
		expect((await list()).map((r) => r.id), 'the mutant must list the trashed document or this control proves nothing').toContain(sharedId);
		await db.sql(original);
		expect((await list()).map((r) => r.id)).not.toContain(sharedId);
	});
	it('restoring puts everything back, including the grantee', async () => {
		const restored = await call(owner, 'public.ideacad_restore_direct_document($1::uuid)', [sharedId]);
		expect(restored.canWrite).toBe(true);
		expect(restored.deletedAt).toBeNull();
		expect((await list()).map((r) => r.id)).toContain(sharedId);
		expect((await open(sharedId, viewer)).document.id).toBe(sharedId);
		expect(await trashList()).toEqual([]);
		expect(await denied(viewer, 'public.ideacad_restore_direct_document($1::uuid)', [sharedId])).toContain('does not exist');
	});
	it('purging is refused until the row is in the trash, then removes every row that hung off the document', async () => {
		const doomed = await create(owner, 'Doomed');
		const id = doomed.document.id;
		await save(doomed, { ...structuredClone(doomed.concept.features), bodies: [body()] }, { artifacts: [blob()] });
		await call(owner, "public.ideacad_share_direct_document($1::uuid,$2,'viewer')", [id, viewer.email]);
		const before = await counts(id);
		expect(before).toEqual({ documents: 1, concepts: 1, history: 2, artifacts: 1, grants: 1 });
		expect(await denied(owner, 'public.ideacad_purge_direct_document($1::uuid)', [id])).toContain('trash first');
		await call(owner, 'public.ideacad_trash_direct_document($1::uuid)', [id]);
		expect(await denied(viewer, 'public.ideacad_purge_direct_document($1::uuid)', [id])).toContain('does not exist');
		const purged = await call(owner, 'public.ideacad_purge_direct_document($1::uuid)', [id]);
		expect(purged).toMatchObject({ ok: true, purged: true, id, title: 'Doomed' });
		expect(await counts(id)).toEqual({ documents: 0, concepts: 0, history: 0, artifacts: 0, grants: 0 });
		expect(await denied(owner, 'public.ideacad_open_direct_document($1::uuid)', [id])).toContain('does not exist');
		/* The licence the purge set did not outlive its transaction: a raw delete is still refused. */
		await expect(db.sql('delete from public.ideacad_documents where id=$1', [scratchId])).rejects.toThrow('Move this model to the trash first');
		expect((await db.sql("select coalesce(current_setting('ideacad.purge', true), '') as v")).rows[0].v).toBe('');
	});
	it('the expiry sweep runs on the next trash write: a 31-day-old row goes and a 29-day-old row stays', async () => {
		const old = await create(owner, 'Old'), young = await create(owner, 'Young');
		await call(owner, 'public.ideacad_trash_direct_document($1::uuid)', [old.document.id]);
		await call(owner, 'public.ideacad_trash_direct_document($1::uuid)', [young.document.id]);
		await db.sql("update public.ideacad_documents set deleted_at = now() - interval '31 days' where id=$1", [old.document.id]);
		await db.sql("update public.ideacad_documents set deleted_at = now() - interval '29 days' where id=$1", [young.document.id]);
		const trash = await trashList();
		expect(trash.map((r) => r.id)).toEqual([young.document.id]);
		expect(await counts(old.document.id)).toMatchObject({ documents: 0, concepts: 0 });
		expect(await counts(young.document.id)).toMatchObject({ documents: 1, concepts: 1 });
		await call(owner, 'public.ideacad_restore_direct_document($1::uuid)', [young.document.id]);
	});
});

describe('C. folders, placement and tags are the owner\'s filing', () => {
	let folderId: string;
	it('creates, refuses a duplicate name in any case, renames and lists with a document count', async () => {
		const folder = await call(owner, 'public.ideacad_create_folder($1)', ['Brackets']);
		folderId = folder.id;
		expect(folder).toMatchObject({ name: 'Brackets', documentCount: 0 });
		expect(await denied(owner, 'public.ideacad_create_folder($1)', ['  brackets '])).toContain('already have a folder');
		expect(await denied(owner, 'public.ideacad_create_folder($1)', ['   '])).toContain('1 to 80 characters');
		expect(await denied(owner, 'public.ideacad_create_folder($1)', ['x'.repeat(81)])).toContain('1 to 80 characters');
		expect((await call(owner, 'public.ideacad_rename_folder($1::uuid,$2)', [folderId, 'Brackets and mounts'])).name).toBe('Brackets and mounts');
		expect(await denied(viewer, 'public.ideacad_rename_folder($1::uuid,$2)', [folderId, 'Mine now'])).toContain('does not exist');
		expect(await call(owner, 'public.ideacad_direct_folders()')).toEqual([expect.objectContaining({ id: folderId, name: 'Brackets and mounts', documentCount: 0 })]);
		expect(await call(viewer, 'public.ideacad_direct_folders()')).toEqual([]);
	});
	it('files a document, refuses filing into somebody else\'s folder, and unfiling on folder delete deletes nothing', async () => {
		await call(owner, 'public.ideacad_move_direct_document($1::uuid,$2::uuid)', [scratchId, folderId]);
		expect((await list()).find((r) => r.id === scratchId).folderId).toBe(folderId);
		expect((await call(owner, 'public.ideacad_direct_folders()'))[0].documentCount).toBe(1);
		expect(await denied(stranger, 'public.ideacad_move_direct_document($1::uuid,$2::uuid)', [scratchId, folderId])).toContain('does not exist');
		const theirs = await call(viewer, 'public.ideacad_create_folder($1)', ['Viewer folder']);
		expect(await denied(owner, 'public.ideacad_move_direct_document($1::uuid,$2::uuid)', [scratchId, theirs.id])).toContain('folder does not exist');
		/* The grantee's own row on the shared document is never the owner's to file, and the viewer sees no folder on it. */
		expect((await list(viewer)).find((r) => r.id === sharedId).folderId).toBeNull();
		const deleted = await call(owner, 'public.ideacad_delete_folder($1::uuid)', [folderId]);
		expect(deleted).toMatchObject({ ok: true, movedOut: 1 });
		expect((await list()).find((r) => r.id === scratchId).folderId).toBeNull();
		expect((await counts(scratchId)).documents).toBe(1);
		expect(await denied(owner, 'public.ideacad_delete_folder($1::uuid)', [theirs.id])).toContain('does not exist');
	});
	it('normalises tags in one place and refuses the shapes the chooser cannot show', async () => {
		const tagged = await call(owner, 'public.ideacad_tag_direct_document($1::uuid,$2::text[])', [scratchId, ['  Robot ', 'robot', 'CAM', '']]);
		expect(tagged.tags).toEqual(['cam', 'robot']);
		expect((await list()).find((r) => r.id === scratchId).tags).toEqual(['cam', 'robot']);
		expect(await denied(owner, 'public.ideacad_tag_direct_document($1::uuid,$2::text[])', [scratchId, Array.from({ length: 13 }, (_, i) => `t${i}`)])).toContain('at most 12');
		expect(await denied(owner, 'public.ideacad_tag_direct_document($1::uuid,$2::text[])', [scratchId, ['a,b']])).toContain('no commas');
		expect(await denied(owner, 'public.ideacad_tag_direct_document($1::uuid,$2::text[])', [scratchId, ['x'.repeat(31)]])).toContain('1 to 30');
		expect(await denied(editor, 'public.ideacad_tag_direct_document($1::uuid,$2::text[])', [editedId, ['mine']])).toContain('does not exist');
		expect((await call(owner, 'public.ideacad_tag_direct_document($1::uuid,$2::text[])', [scratchId, []])).tags).toEqual([]);
	});
});

describe('D. rename writes a history row; duplicate is any reader\'s; a thumbnail is not an edit', () => {
	it('an editor renames through one set /title action that the client replay accepts, and a viewer cannot', async () => {
		const before = await open(editedId, editor);
		const renamed = await call(editor, 'public.ideacad_rename_direct_document($1::uuid,$2)', [editedId, '  Editable bracket, v2  ']);
		expect(renamed).toMatchObject({ ok: true, noop: false, acceptedRevision: before.concept.revision + 1 });
		expect(renamed.document.title).toBe('Editable bracket, v2');
		expect(renamed.concept.features.title).toBe('Editable bracket, v2');
		const history = await call(owner, 'public.ideacad_direct_concept_history($1::uuid,-1,2000)', [before.concept.id]);
		const last = history.rows.at(-1);
		expect(last).toMatchObject({ kind: 'set', path: '/title', before: 'Editable bracket', after: 'Editable bracket, v2', actor: editor.email, operationStart: true, operationLabel: 'Rename', resultRevision: before.concept.revision + 1 });
		expect(() => historyAtRevision(history.rows, renamed.acceptedRevision, renamed.concept.features)).not.toThrow();
		const same = await call(editor, 'public.ideacad_rename_direct_document($1::uuid,$2)', [editedId, 'Editable bracket, v2']);
		expect(same).toMatchObject({ noop: true, acceptedRevision: renamed.acceptedRevision });
		expect(await denied(viewer, 'public.ideacad_rename_direct_document($1::uuid,$2)', [editedId, 'Not mine'])).toContain('cannot edit');
		expect(await denied(editor, 'public.ideacad_rename_direct_document($1::uuid,$2)', [editedId, ' '])).toContain('1 to 120 characters');
	});
	it('a viewer duplicates a shared document into their own library: unlinked, renamed, artifacts copied, history fresh, source untouched', async () => {
		const source = await open(sharedId);
		const copy = await call(viewer, 'public.ideacad_duplicate_direct_document($1::uuid,null)', [sharedId]);
		expect(copy).toMatchObject({ ok: true, copiedArtifacts: 1, sourceId: sharedId, role: 'owner', canWrite: true });
		expect(copy.document).toMatchObject({ student_email: viewer.email, item_id: null, folder_id: null, tags: [], deleted_at: null });
		expect(copy.document.title).toBe('Copy of Shared reference');
		expect(copy.concept.features.title).toBe('Copy of Shared reference');
		expect(copy.concept.features.bodies).toEqual(source.concept.features.bodies);
		expect(copy.concept.revision).toBe(1);
		expect(await counts(copy.document.id)).toEqual({ documents: 1, concepts: 1, history: 1, artifacts: 1, grants: 0 });
		expect((await open(sharedId)).concept.revision).toBe(source.concept.revision);
		expect((await list(viewer)).find((r) => r.id === copy.document.id)).toMatchObject({ isOwn: true, canTrash: true });
		expect(await denied(stranger, 'public.ideacad_duplicate_direct_document($1::uuid,null)', [sharedId])).toContain('does not exist');
		expect(await denied(owner, 'public.ideacad_duplicate_direct_document($1::uuid,$2)', [sharedId, 'x'.repeat(121)])).toContain('1 to 120');
	});
	it('the owner\'s copy keeps the folder and tags, and a named copy takes the name', async () => {
		const folder = await call(owner, 'public.ideacad_create_folder($1)', ['Copies']);
		await call(owner, 'public.ideacad_move_direct_document($1::uuid,$2::uuid)', [scratchId, folder.id]);
		await call(owner, 'public.ideacad_tag_direct_document($1::uuid,$2::text[])', [scratchId, ['bracket']]);
		const copy = await call(owner, 'public.ideacad_duplicate_direct_document($1::uuid,$2)', [scratchId, 'Scratch, second try']);
		expect(copy.document).toMatchObject({ title: 'Scratch, second try', folder_id: folder.id, tags: ['bracket'] });
		expect(copy.concept.features.format).toBe('ideacad-solid-v2');
		expect(copy.concept.features.features).toHaveLength(2);
	});
	it('a writer stores a small thumbnail without a history row or a revision bump; the shapes it is not are refused', async () => {
		const before = await open(editedId), historyBefore = (await counts(editedId)).history;
		const set = await call(editor, 'public.ideacad_set_direct_document_thumbnail($1::uuid,$2)', [editedId, PNG]);
		expect(set).toMatchObject({ ok: true, bytes: PNG.length });
		const after = await open(editedId);
		expect(after.document.thumbnail).toBe(PNG);
		expect(after.concept.revision).toBe(before.concept.revision);
		expect((await counts(editedId)).history).toBe(historyBefore);
		expect((await list()).find((r) => r.id === editedId).thumbnail).toBe(PNG);
		expect(await denied(viewer, 'public.ideacad_set_direct_document_thumbnail($1::uuid,$2)', [editedId, PNG])).toContain('cannot edit');
		expect(await denied(editor, 'public.ideacad_set_direct_document_thumbnail($1::uuid,$2)', [editedId, 'data:text/html;base64,PHNjcmlwdD4='])).toContain('data URL');
		expect(await denied(editor, 'public.ideacad_set_direct_document_thumbnail($1::uuid,$2)', [editedId, `data:image/png;base64,${'A'.repeat(60001)}`])).toContain('data URL');
		await expect(db.sql('update public.ideacad_documents set thumbnail=$1 where id=$2', ['data:image/svg+xml;base64,PHN2Zz4=', editedId])).rejects.toThrow('ideacad_documents_thumbnail_check');
		expect((await call(editor, 'public.ideacad_set_direct_document_thumbnail($1::uuid,null)', [editedId])).bytes).toBe(0);
		expect((await open(editedId)).document.thumbnail).toBeNull();
	});
});

describe('E. grants and a second apply', () => {
	it('no new or replaced function is executable by anon, and the helpers are not executable by authenticated', async () => {
		const { rows } = await db.sql(`select p.proname as name, oidvectortypes(p.proargtypes) as args
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'ideacad\\_%' or p.proname like '\\_ideacad\\_%')`);
		const names = new Set(rows.map((r: any) => r.name));
		for (const fn of ['ideacad_trash_direct_document', 'ideacad_restore_direct_document', 'ideacad_purge_direct_document', 'ideacad_direct_trash', 'ideacad_direct_folders', 'ideacad_create_folder', 'ideacad_rename_folder', 'ideacad_delete_folder', 'ideacad_move_direct_document', 'ideacad_tag_direct_document', 'ideacad_rename_direct_document', 'ideacad_duplicate_direct_document', 'ideacad_set_direct_document_thumbnail', '_ideacad_trash_window', '_ideacad_purge_expired_direct_documents', '_ideacad_clean_tags']) expect(names.has(fn), fn).toBe(true);
		const privilege = async (role: string, signature: string) => (await db.sql(`select has_function_privilege($1, $2, 'execute') as ok`, [role, signature])).rows[0].ok;
		for (const r of rows as any[]) {
			const signature = `public.${r.name}(${r.args})`;
			expect(await privilege('anon', signature), `anon on ${signature}`).toBe(false);
		}
		for (const helper of ['public._ideacad_trash_window()', 'public._ideacad_purge_expired_direct_documents()', 'public._ideacad_clean_tags(text[])']) expect(await privilege('authenticated', helper), helper).toBe(false);
		await expect(db.asAnon((q) => q('select public.ideacad_direct_trash()'))).rejects.toThrow('permission denied');
	});
	it('applies a second time without error and without changing what it reports', async () => {
		const before = (await db.sql('select count(*)::int as n from public.ideacad_documents')).rows[0].n;
		const applied: any = await db.sql(SQL);
		const rows = (Array.isArray(applied) ? applied.at(-1).rows : applied.rows) as typeof readiness;
		expect(rows.map((r) => `${r.examined}:${r.ok}`)).toEqual(readiness.map((r) => `${r.examined}:${r.ok}`));
		expect((await db.sql('select count(*)::int as n from public.ideacad_documents')).rows[0].n).toBe(before);
	});
	it('the migration carries no dollar sign inside a comment, checked against a planted control', () => {
		const scan = (text: string) => text.split('\n').filter((line) => {
			const stripped = line.replace(/'(?:[^']|'')*'/g, "''");
			const i = stripped.indexOf('--');
			return i >= 0 && stripped.slice(i).includes('$');
		});
		expect(scan(SQL)).toEqual([]);
		expect(scan(`${SQL}\n-- planted: costs $5\n`)).toHaveLength(1);
	});
});
