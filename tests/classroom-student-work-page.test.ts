import { describe, expect, it } from 'vitest';
import { load } from '../src/routes/classroom/[sectionId]/people/[studentEmail]/work/[itemId]/+page.server';
import { CLASSMATES, EMAIL, ITEMS, SECTION } from '../src/routes/dev/classroom-student/fixture';

/**
 * ONE STUDENT'S FILLED ASSIGNMENT ON ITS OWN PAGE (the 2026-10-15 round,
 * report 5464ceb2), driven through its real load with a stub client that
 * answers the way RLS answers a manager: every read of a class table returns
 * the WHOLE CLASS unless the query narrows it. The two guarantees that would
 * regress silently:
 *
 *   1. EVERY REFUSAL IS THE SAME 404, never a 403 and never a redirect: not a
 *      manager, a malformed address, an address off the roster, the teacher's
 *      own row, an item not posted here, and an item that is not an assignment.
 *   2. ONLY THIS STUDENT'S WORK LEAVES THE SERVER, and every work read carried
 *      its own attribution filter (the half a later client-side filter would
 *      hide), with a classmate's rows planted in every table as the control.
 */

const TEACHER = 'vargas@boscotech.edu';
const BEN = CLASSMATES[0];
const ITEM = ITEMS.find((i) => i.kind === 'assignment')!;
const POST = ITEMS.find((i) => i.kind !== 'assignment')!;

type Filter = { op: string; col: string; val: unknown };
type Query = { table: string; select: string; filters: Filter[]; single: boolean };

const TABLES: Record<string, Record<string, unknown>[]> = {
	classroom_sections: [{ ...(SECTION as unknown as Record<string, unknown>) }],
	classroom_items: ITEMS.map((i) => ({ ...(i as unknown as Record<string, unknown>), assignment_schema_version: null })),
	classroom_assignment_specs: [],
	classroom_html_assignments: [],
	classroom_submissions: [
		{ id: 'sub-a', item_id: ITEM.id, student_email: EMAIL, state: 'returned', score: 18, submitted_at: '2026-09-19T18:00:00Z', returned_at: '2026-09-22T15:00:00Z', graded_at: '2026-09-22T15:00:00Z', rubric_scores: null, teacher_comment: 'Ana, nice bracing', graded_by: TEACHER, updated_at: '2026-09-22T15:00:00Z' },
		{ id: 'sub-b', item_id: ITEM.id, student_email: BEN.email, state: 'returned', score: 3, submitted_at: '2026-09-19T18:00:00Z', returned_at: '2026-09-22T15:00:00Z', graded_at: '2026-09-22T15:00:00Z', rubric_scores: null, teacher_comment: 'Ben planted comment 777', graded_by: TEACHER, updated_at: '2026-09-22T15:00:00Z' }
	],
	classroom_responses: [
		{ item_id: ITEM.id, student_email: EMAIL, block_id: 'q1', value: { text: 'Ana answer one' }, updated_at: '2026-09-19T17:00:00Z' },
		{ item_id: ITEM.id, student_email: BEN.email, block_id: 'q1', value: { text: 'Ben planted answer 777' }, updated_at: '2026-09-19T17:00:00Z' }
	],
	classroom_submission_files: [
		{ id: 'f-a', submission_id: 'sub-a', block_id: null, filename: 'ana-bracket.png', mime_type: 'image/png', sort_order: 0, storage_key: 'sub-a/x.png', classroom_submissions: { item_id: ITEM.id, student_email: EMAIL } },
		{ id: 'f-b', submission_id: 'sub-b', block_id: null, filename: 'ben-planted-777.png', mime_type: 'image/png', sort_order: 0, storage_key: 'sub-b/y.png', classroom_submissions: { item_id: ITEM.id, student_email: BEN.email } }
	],
	classroom_module_approvals: [
		{ item_id: ITEM.id, student_email: EMAIL, module_id: 'm1', approved_by: TEACHER, approved_at: '2026-09-18T17:00:00Z' },
		{ item_id: ITEM.id, student_email: BEN.email, module_id: 'm1', approved_by: TEACHER, approved_at: '2026-09-18T17:00:00Z' }
	]
};

/** A joined column filter (`classroom_submissions.student_email`) reads the embedded object. */
function pick(row: Record<string, unknown>, col: string): unknown {
	if (!col.includes('.')) return row[col];
	const [rel, key] = col.split('.');
	const embedded = row[rel];
	return embedded && typeof embedded === 'object' ? (embedded as Record<string, unknown>)[key] : undefined;
}

function client(manages = true) {
	const log: Query[] = [];
	const rpcLog: { fn: string; args: unknown }[] = [];
	function builder(table: string) {
		const q: Query = { table, select: '', filters: [], single: false };
		log.push(q);
		let range: [number, number] | null = null;
		const run = () => {
			let rows = (TABLES[table] ?? []).slice();
			for (const f of q.filters) {
				if (f.op === 'eq') rows = rows.filter((r) => pick(r, f.col) === f.val);
				else if (f.op === 'in') rows = rows.filter((r) => (f.val as unknown[]).includes(pick(r, f.col)));
				else if (f.op === 'not-null') rows = rows.filter((r) => pick(r, f.col) !== null && pick(r, f.col) !== undefined);
				else if (f.op === 'is-null') rows = rows.filter((r) => pick(r, f.col) === null || pick(r, f.col) === undefined);
			}
			// The posting join: an item answers only when posted to the section asked for.
			if (table === 'classroom_items' && q.select.includes('posted_in:classroom_postings!inner')) {
				const want = q.filters.find((f) => f.col === 'posted_in.section_id')?.val;
				// The fixture's items carry no postings list; the database's inner join
				// is what this stands in for, so an item is posted here unless it says
				// otherwise, and an unknown id still answers nothing through the id filter.
				rows = rows.filter((r) => !Array.isArray(r.postings) || (r.postings as { section_id: string }[]).some((p) => p.section_id === want));
			}
			if (range) rows = rows.slice(range[0], range[1] + 1);
			if (q.single) return { data: rows[0] ?? null, error: null, count: null };
			return { data: rows, error: null, count: rows.length };
		};
		const b = {
			select(cols: string) {
				q.select = cols;
				return b;
			},
			eq(col: string, val: unknown) {
				if (col !== 'posted_in.section_id') q.filters.push({ op: 'eq', col, val });
				else q.filters.push({ op: 'join', col, val });
				return b;
			},
			in(col: string, val: unknown[]) {
				q.filters.push({ op: 'in', col, val });
				return b;
			},
			not(col: string) {
				q.filters.push({ op: 'not-null', col, val: null });
				return b;
			},
			is(col: string, val: unknown) {
				if (val === null) q.filters.push({ op: 'is-null', col, val });
				return b;
			},
			order() {
				return b;
			},
			range(from: number, to: number) {
				range = [from, to];
				return b;
			},
			maybeSingle() {
				q.single = true;
				return b;
			},
			then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
				return Promise.resolve(run()).then(resolve, reject);
			}
		};
		return b;
	}
	return {
		log,
		rpcLog,
		from: (table: string) => builder(table),
		rpc: async (fn: string, args: Record<string, unknown>) => {
			rpcLog.push({ fn, args });
			switch (fn) {
				case 'classroom_manages_section':
					return { data: manages, error: null };
				case 'classroom_section_roster':
					return {
						data: [
							{ section_id: 's-1', student_email: EMAIL, display_name: 'Ana Reyes', active: true, manages: false },
							{ section_id: 's-1', student_email: BEN.email, display_name: BEN.name, active: true, manages: false },
							{ section_id: 's-1', student_email: TEACHER, display_name: 'T. Vargas', active: true, manages: true }
						],
						error: null
					};
				default:
					return { data: null, error: { code: 'PGRST202', message: `no ${fn}` } };
			}
		}
	};
}

function run(opts: { email: string; itemId?: string; manages?: boolean; claims?: unknown; supabase?: ReturnType<typeof client> }) {
	const supabase = opts.supabase ?? client(opts.manages ?? true);
	return (load as never as (event: unknown) => Promise<unknown>)({
		params: { sectionId: 's-1', studentEmail: opts.email, itemId: opts.itemId ?? ITEM.id },
		locals: { supabase, claims: opts.claims === undefined ? { sub: 'teacher-uuid', email: TEACHER } : opts.claims }
	});
}

async function status(p: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await p;
		return 'ok';
	} catch (e) {
		return (e as { status?: number }).status ?? -1;
	}
}

describe('every refusal is the same 404', () => {
	it('a non-manager gets 404, not 403 and not a redirect', async () => {
		expect(await status(run({ email: EMAIL, manages: false }))).toBe(404);
	});
	it('a malformed, unknown or manager address is 404 each', async () => {
		expect(await status(run({ email: 'not an address' }))).toBe(404);
		expect(await status(run({ email: 'nobody@boscotech.net' }))).toBe(404);
		expect(await status(run({ email: TEACHER }))).toBe(404);
	});
	it('an item not posted here, and an item that is not an assignment, are 404 each', async () => {
		expect(await status(run({ email: EMAIL, itemId: 'no-such-item' }))).toBe(404);
		expect(await status(run({ email: EMAIL, itemId: POST.id }))).toBe(404);
	});
	it('no session is the classroom redirect, as every classroom load does', async () => {
		expect(await status(run({ email: EMAIL, claims: null }))).toBe(303);
	});
	it('POSITIVE CONTROL: a manager opening an enrolled student is answered, any letter case', async () => {
		expect(await status(run({ email: EMAIL }))).toBe('ok');
		expect(await status(run({ email: EMAIL.toUpperCase() }))).toBe('ok');
	});
});

describe("only this student's work leaves the server", () => {
	it('every planted classmate value is absent, and the student is present', async () => {
		const answer = (await run({ email: EMAIL })) as Record<string, unknown>;
		const text = JSON.stringify(answer);
		expect(text).not.toContain(BEN.email);
		expect(text).not.toContain(BEN.name);
		expect(text).not.toContain('777');
		// POSITIVE CONTROLS: the student's own rows made it through each read.
		expect(text).toContain('Ana answer one');
		expect(text).toContain('ana-bracket.png');
		expect(text).toContain('Ana, nice bracing');
		const work = answer.work as { submission: { id: string } | null; responses: unknown[]; files: unknown[]; approvals: unknown[]; complete: boolean };
		expect(work.submission?.id).toBe('sub-a');
		expect(work.responses).toHaveLength(1);
		expect(work.files).toHaveLength(1);
		expect(work.approvals).toHaveLength(1);
		expect(work.complete).toBe(true);
		expect((answer.student as { email: string }).email).toBe(EMAIL);
		// The grading console's token for this student on this item rides along.
		expect(answer.gradeToken).toMatch(/^[0-9a-f]{16}$/);
	});

	it('every work read carried its own attribution filter', async () => {
		const supabase = client();
		await run({ email: EMAIL, supabase });
		const byTable = (t: string) => supabase.log.filter((q) => q.table === t);
		for (const t of ['classroom_submissions', 'classroom_responses', 'classroom_module_approvals']) {
			const reads = byTable(t);
			expect(reads.length, t).toBeGreaterThan(0);
			for (const q of reads) expect(q.filters, t).toContainEqual({ op: 'eq', col: 'student_email', val: EMAIL });
		}
		const files = byTable('classroom_submission_files');
		expect(files.length).toBeGreaterThan(0);
		for (const q of files) {
			expect(q.filters).toContainEqual({ op: 'eq', col: 'classroom_submissions.student_email', val: EMAIL });
		}
		// The gate asked the database, never a client-side spelling of "manages".
		expect(supabase.rpcLog.map((r) => r.fn)).toContain('classroom_manages_section');
	});
});
