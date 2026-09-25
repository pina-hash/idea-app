// tests/ideacad-solid-live-transport.test.ts
//
// THE LIVE LAYER'S SERVER CALLS (feedback R34), against a fake Supabase client
// that records what it was asked. The poll and the pull are best effort by
// design, so a call naming a function or a column production does not have
// would fail QUIETLY forever: the modeler would simply never update. So the
// expected names are read off the migrations themselves -- the history RPC and
// its parameter spellings off 0216, the `revision` column off 0201 -- and the
// integrity check on pulled bytes is asserted in both directions.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSolidTransports } from '../src/lib/ideacad/solid/transport';
import type { DirectRow } from '../src/lib/ideacad/solid/history';

const M0216 = readFileSync('supabase/migrations/0216_ideacad_direct_documents.sql', 'utf8');
const M0201 = readFileSync('supabase/migrations/0201_ideacad_blade_editor.sql', 'utf8');
function declaredParams(name: string): string[] {
	const m = M0216.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)`));
	if (!m) throw new Error(`0216 does not define ${name}`);
	return m[1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter((p) => p !== '');
}

const bytes = new Uint8Array([1, 2, 3, 4, 5]);
const hash = createHash('sha256').update(bytes).digest('hex');
const b64 = Buffer.from(bytes).toString('base64');
const body = (artifact: string) => ({ id: 'b1', name: 'Box', artifact, materialId: null, role: 'part' });
const origin: DirectRow = { seq: 0, kind: 'origin', path: '', after: { title: 'Start', bodies: [] } };
const rows: DirectRow[] = [
	origin,
	{ seq: 1, kind: 'set', path: '/title', before: 'Start', after: 'Mine', operationId: 'a', operationStart: true, operationLabel: 'Rename', resultRevision: 2, actor: 'ana.reyes@boscotech.net' },
	{ seq: 2, kind: 'insert', path: '/bodies/0', before: null, after: body(hash), operationId: 'b', operationStart: true, operationLabel: 'Box', resultRevision: 3, actor: 'ben.ortiz@boscotech.net' }
];

interface Call { name: string; args?: Record<string, unknown> }
function fake(options: { artifactData?: string; revision?: unknown; selectError?: string } = {}) {
	const calls: Call[] = [], selects: { table: string; columns: string; eq: [string, unknown] }[] = [];
	const supabase = {
		rpc: async (name: string, args?: Record<string, unknown>) => {
			calls.push({ name, args });
			if (name === 'ideacad_direct_concept_history') {
				const after = Number(args?.p_after_seq), limit = Number(args?.p_limit);
				return { data: { conceptId: args?.p_concept_id, rows: [origin, ...rows.filter((r) => r.seq > after)].slice(0, limit), total: rows.length, newestSeq: 2 }, error: null };
			}
			if (name === 'ideacad_read_brep_artifacts') return { data: (args?.p_hashes as string[]).map((h) => ({ hash: h, kernel: 'k', data: options.artifactData ?? b64 })), error: null };
			return { data: null, error: { message: `unexpected ${name}` } };
		},
		from(table: string) {
			return { select(columns: string) { return { eq(col: string, value: unknown) { selects.push({ table, columns, eq: [col, value] }); return { maybeSingle: async () => options.selectError ? { data: null, error: { message: options.selectError } } : { data: { revision: 'revision' in options ? options.revision : 3 }, error: null } }; } }; } };
		}
	};
	return { calls, selects, live: createSolidTransports(supabase as unknown as SupabaseClient).live('ana.reyes@boscotech.net') };
}

describe('the poll floor reads one column of one row that 0201 defines', () => {
	it('head selects ideacad_concepts.revision by the concept id and returns the number', async () => {
		const { selects, live } = fake({ revision: 7 });
		expect(await live.head('concept-1')).toBe(7);
		expect(selects).toEqual([{ table: 'ideacad_concepts', columns: 'revision', eq: ['id', 'concept-1'] }]);
		expect(M0201).toMatch(/create table public\.ideacad_concepts\([^;]*\brevision integer not null/);
	});
	it('a refused read and a missing revision throw rather than answering a number', async () => {
		await expect(fake({ selectError: 'permission denied' }).live.head('c')).rejects.toThrow('permission denied');
		await expect(fake({ revision: null }).live.head('c')).rejects.toThrow(/no model revision/);
	});
});

describe('the pull reads 0216\'s history function after the session\'s own last row', () => {
	it('names the migration\'s own function and parameters, and drops the repeated origin', async () => {
		const { calls, live } = fake();
		const pulled = await live.pull({ documentId: 'd1', conceptId: 'c1', afterSeq: 1, have: new Set(), artifacts: false });
		expect(pulled.rows.map((r) => r.seq)).toEqual([2]);
		expect(pulled.head).toBe(2);
		expect(pulled.artifacts).toEqual([]);
		expect(calls.map((c) => c.name)).toEqual(['ideacad_direct_concept_history']);
		expect(Object.keys(calls[0].args ?? {}).sort()).toEqual(declaredParams('ideacad_direct_concept_history').sort());
		expect(calls[0].args).toMatchObject({ p_concept_id: 'c1', p_after_seq: 1 });
	});
	it('with artifacts, fetches only the bytes it lacks, through the same read an open uses, checked against their hash', async () => {
		const { calls, live } = fake();
		const pulled = await live.pull({ documentId: 'd1', conceptId: 'c1', afterSeq: 1, have: new Set(), artifacts: true });
		expect(pulled.artifacts.map((a) => a.hash)).toEqual([hash]);
		expect(calls.map((c) => c.name)).toEqual(['ideacad_direct_concept_history', 'ideacad_read_brep_artifacts']);
		expect(Object.keys(calls[1].args ?? {}).sort()).toEqual(declaredParams('ideacad_read_brep_artifacts').sort());
		const held = fake();
		expect((await held.live.pull({ documentId: 'd1', conceptId: 'c1', afterSeq: 1, have: new Set([hash]), artifacts: true })).artifacts).toEqual([]);
		expect(held.calls.map((c) => c.name)).toEqual(['ideacad_direct_concept_history']);
	});
	it('refuses bytes that do not hash to their own name (the positive control is the pull above)', async () => {
		const { live } = fake({ artifactData: Buffer.from([9, 9, 9]).toString('base64') });
		await expect(live.pull({ documentId: 'd1', conceptId: 'c1', afterSeq: 1, have: new Set(), artifacts: true })).rejects.toThrow(/integrity/);
	});
	it('the migration file really is the instrument: a made-up name is refused by the helper', () => {
		expect(() => declaredParams('ideacad_no_such_function')).toThrow(/does not define/);
		expect(declaredParams('ideacad_direct_concept_history')).toEqual(['p_concept_id', 'p_after_seq', 'p_limit']);
	});
});
