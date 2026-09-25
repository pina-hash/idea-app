// tests/classroom-grading-work-paging.test.ts
//
// THE GRADING READS PAGE PAST POSTGREST'S ROW CAP, AND NOTHING ELSE WOULD
// NOTICE IF THEY STOPPED (ledger 0298).
//
// WHAT WAS WRONG. `loadItemWork` read `classroom_responses` for one assignment
// with `.eq('item_id', ...)` and no paging. PostgREST caps one response at the
// project's `max_rows` (1000 by default on Supabase) and answers the truncated
// set with NO error. The table holds one row per student per block, so a
// 63-block worksheet crosses 1000 at sixteen students; every row past the cap
// read as a blank answer in both grading consoles, the Live grid and the
// graded-work export, and nothing anywhere said so.
//
// WHY IT NEEDS A TEST. The failure is invisible in normal use: a class small
// enough to demo never reaches the cap, the console renders, and a blank answer
// looks exactly like a student who did not answer. Removing the loop later
// would restore it with every screen still looking fine.
//
// HOW. The REAL exported transports (`loadGrading`, `loadAcross`) against a
// fake client that ENFORCES a 1000-row cap, holds 2,345 answers, and breaks
// ties differently on every request -- so a page function ordered on anything
// short of the primary key repeats or skips rows here, as a real server may.
// THE POSITIVE CONTROL is the same fake answering the OLD unpaged query shape
// with exactly 1000, which is what proves the cap is real rather than assumed.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	WORK_MAX_PAGES,
	WORK_PAGE_ROWS,
	createBulkGradingTransports,
	createTeacherEngineTransports,
	readWorkPages
} from '../src/lib/classroom/transports';
import { load as loadGrades } from '../src/routes/classroom/[sectionId]/grades/+page.server';

const ITEM = 'i-worksheet';
const OTHER_ITEM = 'i-other';
const CAP = 1000;

/** 35 students x 67 blocks = 2,345 answers, plus a few on another item that must never arrive. */
const STUDENTS = Array.from({ length: 35 }, (_, i) => `s${String(i).padStart(2, '0')}@boscotech.net`);
const BLOCKS = Array.from({ length: 67 }, (_, i) => `b${String(i).padStart(2, '0')}`);

type Row = Record<string, unknown>;

/** A deterministic shuffle, so the stored order is not the answer order. */
function shuffled<T>(list: readonly T[], seed: number): T[] {
	const out = [...list];
	let s = seed >>> 0 || 1;
	for (let i = out.length - 1; i > 0; i--) {
		s = (Math.imul(s, 1103515245) + 12345) >>> 0;
		const j = s % (i + 1);
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function responseRows(): Row[] {
	const rows: Row[] = [];
	for (const email of STUDENTS) {
		for (const block of BLOCKS) {
			rows.push({
				item_id: ITEM,
				student_email: email,
				block_id: block,
				value: { v: `${email}/${block}` },
				updated_at: '2026-09-24T17:00:00Z'
			});
		}
	}
	rows.push({ item_id: OTHER_ITEM, student_email: STUDENTS[0], block_id: 'b00', value: {}, updated_at: null });
	return shuffled(rows, 7);
}

/** 1,210 hand-in files: two submissions' worth past the cap, many sharing a sort_order. */
function fileRows(): Row[] {
	const rows: Row[] = [];
	for (let i = 0; i < 1210; i++) {
		rows.push({
			id: `f-${String(i).padStart(5, '0')}`,
			submission_id: `sub-${i % 35}`,
			block_id: BLOCKS[i % 5],
			caption: null,
			filename: `p${i}.jpg`,
			mime_type: 'application/octet-stream',
			size_bytes: 10,
			sort_order: (i % 3) + 1,
			created_at: '2026-09-24T17:00:00Z',
			storage_key: `sub-${i % 35}/k${i}.jpg`,
			classroom_submissions: { item_id: ITEM }
		});
	}
	return shuffled(rows, 11);
}

/** 1,050 module approvals: 35 students x 30 modules. */
function approvalRows(): Row[] {
	const rows: Row[] = [];
	for (const email of STUDENTS) {
		for (let m = 0; m < 30; m++) {
			rows.push({
				item_id: ITEM,
				student_email: email,
				module_id: `m${String(m).padStart(2, '0')}`,
				approved_by: 't@boscotech.edu',
				approved_at: null
			});
		}
	}
	return shuffled(rows, 13);
}

function read(row: Row, column: string): unknown {
	if (!column.includes('.')) return row[column];
	const [embed, col] = column.split('.');
	return (row[embed] as Row | null)?.[col];
}

function compare(a: unknown, b: unknown): number {
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	const x = String(a);
	const y = String(b);
	return x < y ? -1 : x > y ? 1 : 0;
}

interface Sent {
	table: string;
	filters: [string, unknown][];
	orders: string[];
	range: [number, number] | null;
}

/**
 * A client whose every table read is capped at 1000 rows, the way PostgREST's
 * `max_rows` truncates: silently, with no error. Filters are APPLIED rather
 * than ignored (a fake more permissive than the server certifies a bug), and
 * rows tied on the requested order come back in a different arrangement on
 * every request.
 */
function cappedClient(
	tables: Record<string, Row[]>,
	opts: { failRequest?: (sent: Sent, index: number) => boolean } = {}
) {
	const sent: Sent[] = [];
	const builder = (table: string) => {
		const q: Sent = { table, filters: [], orders: [], range: null };
		const self: Record<string, unknown> = {};
		self.select = () => self;
		self.eq = (col: string, v: unknown) => (q.filters.push([col, v]), self);
		self.in = (col: string, v: unknown) => (q.filters.push([col, v]), self);
		self.order = (col: string) => (q.orders.push(col), self);
		self.range = (from: number, to: number) => ((q.range = [from, to]), self);
		self.maybeSingle = () => self;
		self.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
			const index = sent.push(q) - 1;
			if (opts.failRequest?.(q, index)) {
				return Promise.resolve({ data: null, error: { message: 'boom', code: '57014' } }).then(resolve);
			}
			let rows = (tables[table] ?? []).filter((r) =>
				q.filters.every(([col, v]) =>
					Array.isArray(v) ? v.includes(read(r, col)) : read(r, col) === v
				)
			);
			// A new tie-break for every request: stable sort over a fresh shuffle.
			rows = shuffled(rows, 1000 + index);
			if (q.orders.length) {
				rows.sort((a, b) => {
					for (const col of q.orders) {
						const c = compare(read(a, col), read(b, col));
						if (c) return c;
					}
					return 0;
				});
			}
			if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
			return Promise.resolve({ data: rows.slice(0, CAP), error: null }).then(resolve);
		};
		return self;
	};
	const client = {
		rpc: async (name: string) =>
			name === 'classroom_manages_section'
				? { data: true, error: null }
				: {
						data: STUDENTS.map((student_email) => ({
							section_id: 's1',
							student_email,
							active: true,
							manages: false
						})),
						error: null
					},
		from: (table: string) => builder(table)
	};
	return { client: client as unknown as SupabaseClient, sent };
}

const TABLES = () => ({
	classroom_postings: [
		{
			item_id: ITEM,
			section_id: 's1',
			classroom_sections: { id: 's1', course_id: 'c1', label: 'Block 4', block: '4', active: true }
		}
	],
	classroom_submissions: STUDENTS.map((email, i) => ({ id: `sub-${i}`, item_id: ITEM, student_email: email, state: 'submitted' })),
	classroom_responses: responseRows(),
	classroom_submission_files: fileRows(),
	classroom_module_approvals: approvalRows()
});

const keyOf = (r: Row) => `${r.student_email} ${r.block_id}`;

describe('the grading work reads page past the 1000-row cap', () => {
	it('POSITIVE CONTROL: the old unpaged read of the same fake answers exactly 1000', async () => {
		const { client } = cappedClient(TABLES());
		const { data } = await client
			.from('classroom_responses')
			.select('item_id, student_email, block_id, value, updated_at')
			.eq('item_id', ITEM);
		expect((data as Row[]).length).toBe(CAP);
	});

	it('loadGrading receives all 2,345 answers, once each, in a stable order', async () => {
		const { client, sent } = cappedClient(TABLES());
		const res = await createTeacherEngineTransports(client).loadGrading(ITEM, 's1');
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error('unreachable');
		const responses = res.data.responses as unknown as Row[];

		expect(responses.length).toBe(2345);
		expect(new Set(responses.map(keyOf)).size).toBe(2345);
		// Every student and every block, and nothing from the other item.
		expect(responses.every((r) => r.item_id === ITEM)).toBe(true);
		expect(new Set(responses.map((r) => r.student_email)).size).toBe(STUDENTS.length);
		// The stable order is the primary key's own: student, then block.
		const keys = responses.map(keyOf);
		expect(keys).toEqual([...keys].sort());
		// Three pages, the last one short.
		const pages = sent.filter((s) => s.table === 'classroom_responses');
		expect(pages.map((p) => p.range)).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999]
		]);
		expect(pages[0].orders).toEqual(['student_email', 'block_id']);

		// The other two per-student-per-thing reads page the same way.
		expect(res.data.files.length).toBe(1210);
		expect(new Set(res.data.files.map((f) => f.id)).size).toBe(1210);
		expect(res.data.filesStorageReady).toBe(true);
		expect(res.data.approvals.length).toBe(1050);
		expect(new Set(res.data.approvals.map((a) => `${a.student_email} ${a.module_id}`)).size).toBe(1050);
	});

	it('loadAcross (the across-classes console) receives them all too', async () => {
		const { client } = cappedClient(TABLES());
		const across = createBulkGradingTransports(client);
		const res = await across.loadAcross!(ITEM);
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error('unreachable');
		expect(res.data.data.responses.length).toBe(2345);
		expect(new Set((res.data.data.responses as unknown as Row[]).map(keyOf)).size).toBe(2345);
	});

	it("a first page's error answers exactly as the old single read did: no answers", async () => {
		const { client } = cappedClient(TABLES(), {
			failRequest: (s) => s.table === 'classroom_responses'
		});
		const res = await createTeacherEngineTransports(client).loadGrading(ITEM, 's1');
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error('unreachable');
		expect(res.data.responses).toEqual([]);
	});

	it('a later page that errors keeps what arrived before it, never less than the old read', async () => {
		const { client } = cappedClient(TABLES(), {
			failRequest: (s) => s.table === 'classroom_responses' && (s.range?.[0] ?? 0) >= 2000
		});
		const res = await createTeacherEngineTransports(client).loadGrading(ITEM, 's1');
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error('unreachable');
		expect(res.data.responses.length).toBe(2000);
		expect(new Set((res.data.responses as unknown as Row[]).map(keyOf)).size).toBe(2000);
	});
});

describe('readWorkPages stops', () => {
	it('at its page cap when a server answers full pages forever', async () => {
		let calls = 0;
		const out = await readWorkPages(async (from, to) => {
			calls++;
			return { data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null };
		});
		expect(calls).toBe(WORK_MAX_PAGES);
		expect((out.data as number[]).length).toBe(WORK_MAX_PAGES * WORK_PAGE_ROWS);
		expect(out.error).toBeNull();
	});

	it('after exactly one request when the first page is short', async () => {
		let calls = 0;
		const out = await readWorkPages(async () => {
			calls++;
			return { data: [1, 2, 3], error: null };
		});
		expect(calls).toBe(1);
		expect(out.data).toEqual([1, 2, 3]);
	});
});

describe("the Grades tab's submissions read pages too", () => {
	/** 40 assignments, each with a submission from 35 students: 1,400 rows. */
	const ITEMS = Array.from({ length: 40 }, (_, i) => `a${String(i).padStart(2, '0')}`);
	const STATES = ['draft', 'submitted', 'returned'];
	const tables = () => ({
		classroom_sections: [{ id: 's1', course_id: 'c1', label: 'Block 4', block: '4', active: true }],
		classroom_items: ITEMS.map((id) => ({
			id,
			kind: 'assignment',
			title: id,
			created_at: '2026-09-01T00:00:00Z',
			posted_in: { section_id: 's1' }
		})),
		classroom_submissions: shuffled(
			ITEMS.flatMap((item_id, i) =>
				STUDENTS.map((student_email, j) => ({
					item_id,
					student_email,
					state: STATES[(i + j) % 3],
					score: null,
					graded_at: null,
					submitted_at: null
				}))
			),
			17
		)
	});
	const event = (client: SupabaseClient) => ({
		params: { sectionId: 's1' },
		locals: { supabase: client, claims: { sub: 'u-teacher', email: 't@boscotech.edu' } }
	});
	type Standing = { item: { id: string }; awaiting: number; returned: number; inProgress: number };
	const counted = (standings: Standing[]) =>
		standings.reduce((n, s) => n + s.awaiting + s.returned + s.inProgress, 0);

	it('POSITIVE CONTROL: the old unpaged read answers exactly 1000 of the 1,400', async () => {
		const { client } = cappedClient(tables());
		const { data } = await client
			.from('classroom_submissions')
			.select('item_id, state, score, graded_at, submitted_at')
			.in('item_id', ITEMS);
		expect((data as Row[]).length).toBe(CAP);
	});

	it('every one of the 1,400 submissions is counted, 35 per assignment', async () => {
		const { client, sent } = cappedClient(tables());
		const out = (await (loadGrades as unknown as (e: unknown) => Promise<{ standings: Standing[] }>)(
			event(client)
		)) as { standings: Standing[] };
		expect(out.standings.length).toBe(ITEMS.length);
		expect(counted(out.standings)).toBe(ITEMS.length * STUDENTS.length);
		for (const s of out.standings) expect(s.awaiting + s.returned + s.inProgress).toBe(STUDENTS.length);
		const pages = sent.filter((q) => q.table === 'classroom_submissions');
		expect(pages[0].orders).toEqual(['item_id', 'student_email']);
		expect(pages.length).toBe(2);
	});
});
