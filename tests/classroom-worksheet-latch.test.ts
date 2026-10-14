// tests/classroom-worksheet-latch.test.ts
//
// Ledger 0380, report e32659e9: "an assignment that is done should be done".
// Completion of a ported worksheet is DERIVED against the manifest the
// worksheet has today, so adding a required block un-finished every student
// who had finished. The latch (0237) keeps the first moment the worksheet was
// found complete; readers see the union. These cases fail on the code before
// the latch existed: the "manifest grew" case reads Missing without it.

import { describe, expect, it } from 'vitest';
import { mergeLatches, readWorksheetCompletions, worksheetKey } from '$lib/classroom/student-work';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const ME = 'ana@boscotech.net';
const OTHER = 'bruno@boscotech.net';

const block = (id: string) => ({ id, field: id, type: 'text' });
const manifest = (...ids: string[]) =>
	({
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Hook',
		course: 'IDEA100',
		points: 10,
		header: [],
		modules: [{ id: 'm1', title: 'M', points: 10, blocks: ids.map(block), criteria: [] }]
	}) as unknown as HtmlAssignmentManifest;

type Row = Record<string, unknown>;

function client(opts: { manifest: HtmlAssignmentManifest; responses: Row[]; latches?: Row[]; rpcMissing?: boolean }) {
	const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const tables: Record<string, Row[]> = {
		classroom_items: [{ id: 'w', assignment_schema_version: 3 }],
		classroom_html_assignments: [{ item_id: 'w', manifest: opts.manifest }],
		classroom_responses: opts.responses,
		classroom_submission_files: []
	};
	const supabase = {
		rpc(name: string, args: Record<string, unknown>) {
			rpcCalls.push({ name, args });
			if (opts.rpcMissing) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'missing' } });
			if (name === 'classroom_worksheet_latched') return Promise.resolve({ data: opts.latches ?? [], error: null });
			return Promise.resolve({ data: true, error: null });
		},
		from(table: string) {
			const within: Array<[string, unknown[]]> = [];
			const eq: Array<[string, unknown]> = [];
			let range: [number, number] | null = null;
			const b: Record<string, unknown> = {
				select: () => b,
				in: (c: string, v: unknown[]) => (within.push([c, v]), b),
				not: () => b,
				order: () => b,
				eq: (c: string, v: unknown) => (eq.push([c, v]), b),
				range: (f: number, t: number) => ((range = [f, t]), b),
				then: (resolve: (v: unknown) => unknown) => {
					let rows = tables[table] ?? [];
					for (const [c, v] of within) rows = rows.filter((r) => v.includes(r[c]));
					for (const [c, v] of eq) rows = rows.filter((r) => r[c] === v);
					const total = rows.length;
					if (range) rows = rows.slice(range[0], range[1] + 1);
					return Promise.resolve({ data: rows, error: null, count: total }).then(resolve);
				}
			};
			return b;
		}
	};
	return { supabase: supabase as never, rpcCalls };
}

const answer = (email: string, block_id: string, updated_at = '2026-10-01T15:00:00.000Z') => ({
	item_id: 'w',
	student_email: email,
	block_id,
	value: { text: 'done' },
	updated_at
});

describe('a finished worksheet stays finished when the manifest grows', () => {
	const grown = manifest('a', 'b', 'stage-4');
	const responses = [answer(ME, 'a'), answer(ME, 'b')];

	it('WITHOUT a latch the added required block reads the student as not complete (the defect)', async () => {
		const { supabase } = client({ manifest: grown, responses });
		const out = await readWorksheetCompletions(supabase, ['w'], { onlyEmail: ME });
		expect(out?.has(worksheetKey('w', ME))).toBe(false);
	});

	it('WITH the latch from before the block was added, the student still reads complete, at the stamped instant', async () => {
		const { supabase } = client({
			manifest: grown,
			responses,
			latches: [{ item_id: 'w', student_email: ME, completed_at: '2026-10-01T15:00:00.000Z' }]
		});
		const out = await readWorksheetCompletions(supabase, ['w'], { onlyEmail: ME, latches: { stamp: true } });
		expect(out?.get(worksheetKey('w', ME))).toBe('2026-10-01T15:00:00.000Z');
	});

	it("a classmate's latch never finishes this student's worksheet, and a pinned read drops it", async () => {
		const { supabase } = client({
			manifest: grown,
			responses,
			latches: [{ item_id: 'w', student_email: OTHER, completed_at: '2026-10-01T15:00:00.000Z' }]
		});
		const out = await readWorksheetCompletions(supabase, ['w'], { onlyEmail: ME, latches: {} });
		expect(out?.has(worksheetKey('w', OTHER))).toBe(false);
		expect(out?.has(worksheetKey('w', ME))).toBe(false);
	});

	it('a manager read (section id, no pin) sees every student in the section the latch table returns', async () => {
		const { supabase, rpcCalls } = client({
			manifest: grown,
			responses: [],
			latches: [
				{ item_id: 'w', student_email: ME, completed_at: '2026-10-01T15:00:00.000Z' },
				{ item_id: 'w', student_email: OTHER, completed_at: '2026-10-02T15:00:00.000Z' }
			]
		});
		const out = await readWorksheetCompletions(supabase, ['w'], { latches: { sectionId: 'sec-1' } });
		expect([...(out?.keys() ?? [])].sort()).toEqual([worksheetKey('w', ME), worksheetKey('w', OTHER)].sort());
		expect(rpcCalls[0].args).toMatchObject({ p_section_id: 'sec-1' });
	});
});

describe('stamping: the caller\'s own completion, once', () => {
	it('a student whose derivation finds the worksheet complete and holds no latch stamps it, with the instant', async () => {
		const { supabase, rpcCalls } = client({ manifest: manifest('a'), responses: [answer(ME, 'a', '2026-10-01T16:00:00.000Z')] });
		const out = await readWorksheetCompletions(supabase, ['w'], { onlyEmail: ME, latches: { stamp: true } });
		expect(out?.get(worksheetKey('w', ME))).toBe('2026-10-01T16:00:00.000Z');
		const stamps = rpcCalls.filter((c) => c.name === 'classroom_worksheet_latch');
		expect(stamps).toHaveLength(1);
		expect(stamps[0].args).toEqual({ p_item_id: 'w', p_completed_at: '2026-10-01T16:00:00.000Z' });
	});
	it('an already stamped student is not stamped again, and a read without stamp never writes', async () => {
		const latch = { item_id: 'w', student_email: ME, completed_at: '2026-10-01T16:00:00.000Z' };
		const a = client({ manifest: manifest('a'), responses: [answer(ME, 'a', '2026-10-01T16:00:00.000Z')], latches: [latch] });
		await readWorksheetCompletions(a.supabase, ['w'], { onlyEmail: ME, latches: { stamp: true } });
		expect(a.rpcCalls.filter((c) => c.name === 'classroom_worksheet_latch')).toHaveLength(0);
		const b = client({ manifest: manifest('a'), responses: [answer(ME, 'a')] });
		await readWorksheetCompletions(b.supabase, ['w'], { onlyEmail: ME, latches: {} });
		expect(b.rpcCalls.filter((c) => c.name === 'classroom_worksheet_latch')).toHaveLength(0);
	});
	it('with 0237 not applied the answer is exactly what the derivation says', async () => {
		const { supabase } = client({ manifest: manifest('a'), responses: [answer(ME, 'a')], rpcMissing: true });
		const out = await readWorksheetCompletions(supabase, ['w'], { onlyEmail: ME, latches: { stamp: true } });
		expect(out?.has(worksheetKey('w', ME))).toBe(true);
	});
});

describe('mergeLatches', () => {
	it('the earlier instant wins, so a later edit cannot make a worksheet finished on time late', () => {
		const k = worksheetKey('w', ME);
		expect(mergeLatches(new Map([[k, '2026-10-05T00:00:00.000Z']]), new Map([[k, '2026-10-01T00:00:00.000Z']]))?.get(k)).toBe('2026-10-01T00:00:00.000Z');
		expect(mergeLatches(new Map([[k, '2026-10-01T00:00:00.000Z']]), new Map([[k, '2026-10-05T00:00:00.000Z']]))?.get(k)).toBe('2026-10-01T00:00:00.000Z');
		expect(mergeLatches(new Map([[k, '']]), new Map([[k, '2026-10-05T00:00:00.000Z']]))?.get(k)).toBe('2026-10-05T00:00:00.000Z');
	});
	it('a derivation that could not answer leaves the latches alone, and nothing at all stays null', () => {
		const k = worksheetKey('w', ME);
		expect(mergeLatches(null, new Map([[k, 'x']]))?.get(k)).toBe('x');
		expect(mergeLatches(null, new Map())).toBeNull();
	});
});
