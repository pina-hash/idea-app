// tests/ideacad-solid-launch-transport.test.ts
//
// THE TRANSPORT'S NEW CALLS, against a fake Supabase client that records what
// it was asked. The expected RPC NAMES AND PARAMETER SPELLINGS are read off
// `supabase/migrations/0217_ideacad_feature_graph.sql` itself, so a call that
// names a function the migration does not define -- or a parameter it spells
// differently -- reddens here without a database. The degrade rule is
// asserted in both directions: `PGRST202` becomes the one storage sentence,
// and any other error stays the function's own refusal, verbatim.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSolidTransports } from '../src/lib/ideacad/solid/transport';
import { STORAGE_UNAVAILABLE } from '../src/lib/ideacad/solid/launch/wording';

const MIGRATION = readFileSync('supabase/migrations/0217_ideacad_feature_graph.sql', 'utf8');
/** The parameter names of `public.<name>(...)` as the migration declares them. */
function declaredParams(name: string): string[] {
	const m = MIGRATION.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)`));
	if (!m) throw new Error(`0217 does not define ${name}`);
	return m[1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter((p) => p !== '');
}
interface Call { name: string; args: Record<string, unknown> | undefined }
function fakeSupabase(answer: (name: string) => { data?: unknown; error?: { code?: string; message: string } | null }) {
	const calls: Call[] = [];
	const supabase = { rpc: async (name: string, args?: Record<string, unknown>) => { calls.push({ name, args }); const a = answer(name); return { data: a.data ?? null, error: a.error ?? null }; } };
	return { calls, api: createSolidTransports(supabase as unknown as SupabaseClient) };
}
const ok = (data: unknown = { ok: true }) => () => ({ data });

describe('every 0217 call names the migration\'s own function and parameters', () => {
	const cases: [string, (api: ReturnType<typeof createSolidTransports>) => Promise<unknown>, string, Record<string, unknown>][] = [
		['ideacad_trash_direct_document', (a) => a.trash('d1'), 'trash', { p_document_id: 'd1' }],
		['ideacad_restore_direct_document', (a) => a.restore('d1'), 'restore', { p_document_id: 'd1' }],
		['ideacad_purge_direct_document', (a) => a.purge('d1'), 'purge', { p_document_id: 'd1' }],
		['ideacad_direct_trash', (a) => a.trashList(), 'trashList', {}],
		['ideacad_direct_folders', (a) => a.folders(), 'folders', {}],
		['ideacad_create_folder', (a) => a.createFolder('Gears'), 'createFolder', { p_name: 'Gears' }],
		['ideacad_rename_folder', (a) => a.renameFolder('f1', 'Cogs'), 'renameFolder', { p_folder_id: 'f1', p_name: 'Cogs' }],
		['ideacad_delete_folder', (a) => a.deleteFolder('f1'), 'deleteFolder', { p_folder_id: 'f1' }],
		['ideacad_move_direct_document', (a) => a.move('d1', 'f1'), 'move', { p_document_id: 'd1', p_folder_id: 'f1' }],
		['ideacad_tag_direct_document', (a) => a.tag('d1', ['gear']), 'tag', { p_document_id: 'd1', p_tags: ['gear'] }],
		['ideacad_rename_direct_document', (a) => a.rename('d1', 'New'), 'rename', { p_document_id: 'd1', p_title: 'New' }],
		['ideacad_duplicate_direct_document', (a) => a.duplicate('d1', 'Copy'), 'duplicate', { p_document_id: 'd1', p_title: 'Copy' }]
	];
	for (const [rpc, call, member, args] of cases) {
		it(`${member} -> ${rpc}(${Object.keys(args).join(', ')})`, async () => {
			const { calls, api } = fakeSupabase(ok(rpc === 'ideacad_direct_trash' || rpc === 'ideacad_direct_folders' ? [] : { ok: true, tags: ['gear'], movedOut: 2, document: { id: 'd2' } }));
			await call(api);
			expect(calls).toHaveLength(1);
			expect(calls[0].name).toBe(rpc);
			expect(calls[0].args ?? {}).toEqual(args);
			const declared = declaredParams(rpc);
			for (const key of Object.keys(args)) expect(declared).toContain(key);
			expect(Object.keys(args).length).toBe(declared.length);
		});
	}
	it('duplicate with no title sends p_title null (the function defaults it) and hands back the new document id', async () => {
		const { calls, api } = fakeSupabase(ok({ ok: true, document: { id: 'copy-id' } }));
		expect(await api.duplicate('d1')).toEqual({ id: 'copy-id' });
		expect(calls[0].args).toEqual({ p_document_id: 'd1', p_title: null });
	});
	it('move to no folder sends p_folder_id null', async () => {
		const { calls, api } = fakeSupabase(ok());
		await api.move('d1', null);
		expect(calls[0].args).toEqual({ p_document_id: 'd1', p_folder_id: null });
	});
	it('the migration file really is the instrument: a made-up function name is refused by the helper', () => {
		expect(() => declaredParams('ideacad_no_such_function')).toThrow(/does not define/);
		expect(declaredParams('ideacad_move_direct_document')).toEqual(['p_document_id', 'p_folder_id']);
	});
});

describe('degrade on PGRST202 alone', () => {
	it('a missing function answers the storage sentence, and a real refusal stays verbatim (positive control)', async () => {
		const missing = fakeSupabase(() => ({ error: { code: 'PGRST202', message: 'Could not find the function public.ideacad_trash_direct_document(p_document_id) in the schema cache' } }));
		await expect(missing.api.trash('d1')).rejects.toThrow(STORAGE_UNAVAILABLE);
		await expect(missing.api.folders()).rejects.toThrow(STORAGE_UNAVAILABLE);
		const refused = fakeSupabase(() => ({ error: { code: 'P0001', message: 'This model is linked to an assignment, so it is kept. Archive it instead.' } }));
		await expect(refused.api.trash('d1')).rejects.toThrow('This model is linked to an assignment, so it is kept. Archive it instead.');
		await expect(refused.api.trash('d1')).rejects.not.toThrow(STORAGE_UNAVAILABLE);
	});
	it('the list normalises a 0216-shaped row so the launch page reads 0217 fields on any deployment', async () => {
		const { api } = fakeSupabase(ok([{ id: 'a', title: 'Old', itemId: null, ownerEmail: 'x@boscotech.net', isOwn: true, updatedAt: '2026-09-01T00:00:00.000Z', archivedAt: null, canWrite: true, canArchive: true, bodyCount: 2, role: 'owner' }]));
		const [row] = await api.list();
		expect(row.tags).toEqual([]); expect(row.folderId).toBeNull(); expect(row.featureCount).toBe(0); expect(row.canTrash).toBe(false); expect(row.createdAt).toBe('2026-09-01T00:00:00.000Z');
	});
	it('the trash list and the folder list normalise their rows too', async () => {
		const trash = fakeSupabase(ok([{ id: 't', title: 'Gone', deletedAt: '2026-09-01T00:00:00.000Z', purgeAt: '2026-10-01T00:00:00.000Z' }]));
		expect((await trash.api.trashList())[0]).toMatchObject({ id: 't', title: 'Gone', tags: [], bodyCount: 0 });
		const folders = fakeSupabase(ok([{ id: 'f', name: 'Gears', createdAt: 'c', documentCount: 3 }]));
		expect(await folders.api.folders()).toEqual([{ id: 'f', name: 'Gears', createdAt: 'c', documentCount: 3 }]);
	});
});
