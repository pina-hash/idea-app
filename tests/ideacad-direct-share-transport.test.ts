// tests/ideacad-direct-share-transport.test.ts
//
// LEDGER 0470: the three sharing calls the launch page makes, against a fake
// Supabase client. The function names and parameter spellings are read off the
// sharing migration itself (found by name, so a renumber at landing needs no
// edit here), and the degrade rule holds both ways: `PGRST202` becomes the one
// sharing sentence, any other error stays the function's own refusal.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSolidTransports } from '../src/lib/ideacad/solid/transport';
import { outcomeSentence, parseOutcome, pickerRow, SHARING_UNAVAILABLE } from '../src/lib/ideacad/solid/launch/share';

const FILE = readdirSync('supabase/migrations').filter((f) => f.endsWith('_ideacad_sharing_people.sql'));
const MIGRATION = readFileSync(`supabase/migrations/${FILE[0]}`, 'utf8');
function declaredParams(name: string): string[] {
	const m = MIGRATION.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)`));
	if (!m) throw new Error(`the sharing migration does not define ${name}`);
	return m[1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter((p) => p !== '');
}
function fake(answer: { data?: unknown; error?: { code?: string; message: string } | null }) {
	const calls: { name: string; args?: Record<string, unknown> }[] = [];
	const supabase = { rpc: async (name: string, args?: Record<string, unknown>) => { calls.push({ name, args }); return { data: answer.data ?? null, error: answer.error ?? null }; } };
	return { calls, api: createSolidTransports(supabase as unknown as SupabaseClient) };
}

describe('the sharing calls name the migration\'s own functions and parameters', () => {
	it('finds exactly one sharing migration', () => expect(FILE).toHaveLength(1));
	const cases: [string, (a: ReturnType<typeof createSolidTransports>) => Promise<unknown>, Record<string, unknown>][] = [
		['ideacad_direct_document_access', (a) => a.access('d1'), { p_document_id: 'd1' }],
		['ideacad_share_people', (a) => a.people('d1', 'ana'), { p_document_id: 'd1', p_query: 'ana' }],
		['ideacad_set_direct_document_access', (a) => a.setAccess('d1', [{ key: 'k1', role: 'viewer' }]), { p_document_id: 'd1', p_changes: [{ key: 'k1', role: 'viewer' }] }]
	];
	for (const [name, run, args] of cases) {
		it(name, async () => {
			const { calls, api } = fake({ data: name === 'ideacad_share_people' ? [] : {} });
			await run(api);
			expect(calls).toEqual([{ name, args }]);
			expect(Object.keys(args).sort()).toEqual(declaredParams(name).sort());
		});
	}
	it('a deployment without the functions gets the one sentence; any other refusal is passed through verbatim', async () => {
		await expect(fake({ error: { code: 'PGRST202', message: 'Could not find the function' } }).api.access('d1')).rejects.toThrow(SHARING_UNAVAILABLE);
		await expect(fake({ error: { code: 'P0001', message: 'That document does not exist.' } }).api.access('d1')).rejects.toThrow('That document does not exist.');
	});
	it('the retired one-address share transport is gone', () => {
		expect('share' in fake({}).api).toBe(false);
	});
});

describe('what the panel says', () => {
	const ok = (index: number, name: string, before: string | null, role: string | null) => ({ index, ok: true, key: `k${index}`, name, before, role, changed: before !== role });
	it('names who was added, moved and removed, from what changed rather than what was asked', () => {
		const said = (results: unknown[]) => outcomeSentence(parseOutcome({ results, succeeded: results.length }));
		expect(said([ok(0, 'Ana', null, 'viewer')])).toBe('Shared with Ana.');
		expect(said([ok(0, 'Ana', null, 'viewer'), ok(1, 'Ben', null, 'editor'), ok(2, 'Cal', null, 'viewer')])).toBe('Shared with Ana and 2 others.');
		expect(said([ok(0, 'Ana', 'viewer', 'editor')])).toBe('Ana can now edit.');
		expect(said([ok(0, 'Ana', 'editor', null)])).toBe('Removed Ana.');
		expect(said([ok(0, 'Ana', 'viewer', 'viewer')])).toBe('Nothing changed. They already had that access.');
	});
	it('a directory row carries no address and says how the person relates to you', () => {
		const row = pickerRow({ key: 'k', name: 'Ms. Lane', avatar: null, avatarUrl: null, staff: true, relation: 'classmate', access: 'editor' });
		expect(row.detail).toBe('Staff · In your class · Has it: Can edit');
		expect(JSON.stringify(row)).not.toContain('@');
	});
});
