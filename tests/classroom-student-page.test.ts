import { describe, expect, it } from 'vitest';
import { load } from '../src/routes/classroom/[sectionId]/people/[studentEmail]/+page.server';
import { CLASSMATES, EMAIL, ITEMS, NOW, SECTION, STUDENT_ID, TODAY } from '../src/routes/dev/classroom-student/fixture';

/**
 * ONE STUDENT'S PAGE, DRIVEN THROUGH ITS REAL LOAD (the 2026-10-07 round),
 * with a stub client that behaves the way RLS behaves for a manager: every
 * read of a class table answers the WHOLE CLASS unless the query itself
 * narrows it. Two guarantees here would regress SILENTLY:
 *
 *   1. EVERY REFUSAL IS THE SAME 404. Not a manager, a malformed address, an
 *      address that is not on the roster, and the teacher's own enrollment row
 *      all answer 404 -- never 403, never a redirect -- beside the manager and
 *      the enrolled student who are answered.
 *   2. NO CLASSMATE REACHES THE PAYLOAD. A load's answer is serialized into the
 *      browser. The stub plants a classmate in the submissions, the presence
 *      rows, the IdeaCAD documents, the notebook entries, the notebook grid and
 *      the team board, and the answer must carry none of them -- and every
 *      class read must have carried its own attribution filter, which is the
 *      half a second layer of filtering would otherwise hide.
 */

const TEACHER = 'vargas@boscotech.edu';
const BEN = CLASSMATES[0];

type Filter = { op: string; col: string; val: unknown };
type Query = { table: string; select: string; filters: Filter[] };

const TABLES: Record<string, Record<string, unknown>[]> = {
	classroom_submissions: [
		{ id: 'sub-a', item_id: 'a-bridge', student_email: EMAIL, state: 'returned', score: 18, submitted_at: '2026-09-19T18:00:00Z', returned_at: '2026-09-22T15:00:00Z', graded_at: '2026-09-22T15:00:00Z' },
		{ id: 'sub-b', item_id: 'a-bridge', student_email: BEN.email, state: 'returned', score: 3, submitted_at: '2026-09-19T18:00:00Z', returned_at: '2026-09-22T15:00:00Z', graded_at: '2026-09-22T15:00:00Z' },
		{ id: 'sub-c', item_id: 'a-safety', student_email: BEN.email, state: 'submitted', score: null, submitted_at: '2026-09-10T18:00:00Z', returned_at: null, graded_at: null }
	],
	classroom_presence: [
		{ item_id: 'a-bridge', student_email: EMAIL, last_input_at: '2026-09-19T17:55:00Z', active_seconds: 4800 },
		{ item_id: 'a-safety', student_email: BEN.email, last_input_at: '2026-09-10T17:55:00Z', active_seconds: 777 }
	],
	ideacad_documents: [
		{ id: 'doc-a', item_id: 'a-cad', student_email: EMAIL, title: 'Bracket v2', updated_at: '2026-10-06T18:40:00Z', archived_at: null },
		{ id: 'doc-b', item_id: 'a-cad', student_email: BEN.email, title: `${BEN.name} bracket`, updated_at: '2026-10-06T18:40:00Z', archived_at: null }
	],
	notebook_entries: [
		{ id: 'e-1', student_id: STUDENT_ID, section_id: 's-1', session_id: 'ns-1', upload_timestamp: '2026-10-06T18:00:00Z', submitted_at: '2026-10-06T18:00:00Z' },
		// In the bin (0116): counted only by a database with no `deleted_at` column.
		{ id: 'e-2', student_id: STUDENT_ID, section_id: 's-1', session_id: 'ns-1', upload_timestamp: '2026-10-05T18:00:00Z', submitted_at: '2026-10-05T18:00:00Z', deleted_at: '2026-10-07T18:00:00Z' },
		{ id: 'e-9', student_id: 'ben-uuid', section_id: 's-1', session_id: 'ns-1', upload_timestamp: '2026-10-06T18:00:00Z', submitted_at: '2026-10-06T18:00:00Z' }
	],
	// Ledger 0392: the gallery's two reads. Ben's rows are planted beside Ana's.
	classroom_submission_files: [
		{ id: 'file-a', submission_id: 'sub-a', block_id: null, caption: null, filename: 'truss.jpg', mime_type: 'application/octet-stream', storage_key: 'sub-a/1.jpg', created_at: '2026-09-19T18:00:00Z' },
		{ id: 'file-b', submission_id: 'sub-b', block_id: null, caption: null, filename: 'ben-truss.jpg', mime_type: 'application/octet-stream', storage_key: 'sub-b/1.jpg', created_at: '2026-09-19T18:00:00Z' }
	],
	notebook_entry_photos: [
		{ id: 'photo-a', entry_id: 'e-1', variant: 'original', sequence_order: 1, created_at: '2026-10-06T18:00:00Z' },
		{ id: 'photo-b', entry_id: 'e-9', variant: 'original', sequence_order: 1, created_at: '2026-10-06T18:00:00Z' }
	],
	classroom_items: [],
	classroom_html_assignments: []
};

function client(
	opts: {
		overview?: unknown;
		overviewError?: { code: string } | null;
		/** The code a `notebook_entries` read filtering on `deleted_at` fails with. */
		deletedFilterError?: string;
	} = {}
) {
	const log: Query[] = [];
	const rpcLog: { fn: string; args: unknown }[] = [];
	function builder(table: string) {
		const q: Query = { table, select: '', filters: [] };
		log.push(q);
		let range: [number, number] | null = null;
		const run = () => {
			if (opts.deletedFilterError && table === 'notebook_entries' && q.filters.some((f) => f.op === 'is-null' && f.col === 'deleted_at')) {
				return { data: null, error: { code: opts.deletedFilterError }, count: null };
			}
			let rows = (TABLES[table] ?? []).slice();
			for (const f of q.filters) {
				if (f.op === 'eq') rows = rows.filter((r) => r[f.col] === f.val);
				else if (f.op === 'in') rows = rows.filter((r) => (f.val as unknown[]).includes(r[f.col]));
				else if (f.op === 'not-null') rows = rows.filter((r) => r[f.col] !== null && r[f.col] !== undefined);
				else if (f.op === 'is-null') rows = rows.filter((r) => r[f.col] === null || r[f.col] === undefined);
			}
			if (range) rows = rows.slice(range[0], range[1] + 1);
			return { data: rows, error: null, count: rows.length };
		};
		const b = {
			select(cols: string) {
				q.select = cols;
				return b;
			},
			eq(col: string, val: unknown) {
				q.filters.push({ op: 'eq', col, val });
				return b;
			},
			in(col: string, val: unknown[]) {
				q.filters.push({ op: 'in', col, val });
				return b;
			},
			not(col: string, _op: string, _v: unknown) {
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
			limit() {
				return b;
			},
			range(from: number, to: number) {
				range = [from, to];
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
				case 'classroom_section_roster':
					return {
						data: [
							{ section_id: 's-1', student_email: EMAIL, display_name: 'Ana Reyes', active: true, manages: false },
							{ section_id: 's-1', student_email: BEN.email, display_name: BEN.name, active: true, manages: false },
							{ section_id: 's-1', student_email: TEACHER, display_name: 'T. Vargas', active: true, manages: true }
						],
						error: null
					};
				case 'classroom_student_overview':
					if (opts.overviewError) return { data: null, error: opts.overviewError };
					return { data: opts.overview === undefined ? overviewFor(args.p_student_email as string) : opts.overview, error: null };
				case 'notebook_get_section_grid':
					return { data: GRID, error: null };
				case 'classroom_team_board':
					return { data: BOARD, error: null };
				case 'foundry_list_apps':
					return {
						data: args.p_owner === STUDENT_ID ? [{ id: 'app-1', slug: 'gear-calculator', title: 'Gear Calculator', published_version_id: 'v-1' }] : [],
						error: null
					};
				default:
					return { data: null, error: { code: 'PGRST202', message: 'not here' } };
			}
		}
	};
}

function overviewFor(email: string) {
	return {
		section_id: 's-1',
		student_email: email,
		display_name: 'Ana Reyes',
		active: true,
		enrolled_at: '2026-08-14T16:00:00Z',
		has_account: true,
		user_id: STUDENT_ID,
		at: NOW,
		hall_passes: { total: 0, entries: [], limits: { budget_minutes: 10, auto_checkin_minutes: 30 } },
		item_views: [],
		songs: { requested: 0, approved: 0, rejected: 0, pending: 0 },
		coins: { balance: 0, physical_balance: 0, digital_balance: 0, total: 0, transactions: [] },
		presence_limits: { retention_days: 90 }
	};
}

const GRID = {
	section: { id: 's-1', label: 'Period 1', block: 'A', course_code: 'IDEA209H' },
	unit_number: null,
	generated_at: NOW,
	sessions: [{ id: 'ns-1', unit_number: 1, session_date: '2026-10-06', session_label: 'Day 18 bench' }],
	students: [
		{ student_key: EMAIL, id: STUDENT_ID, name: 'Ana Reyes', email: EMAIL, enrolled: true, free_entries: 0 },
		{ student_key: BEN.email, id: 'ben-uuid', name: BEN.name, email: BEN.email, enrolled: true, free_entries: 0 }
	],
	cells: [
		{ student_key: EMAIL, student_id: STUDENT_ID, session_id: 'ns-1', status: 'compliant', entry_id: 'e-1', entry_count: 1, upload_timestamp: '2026-10-06T18:00:00Z', on_time: true, excused: false, flag_reason: null },
		{ student_key: BEN.email, student_id: 'ben-uuid', session_id: 'ns-1', status: 'compliant', entry_id: 'e-9', entry_count: 1, upload_timestamp: '2026-10-06T18:00:00Z', on_time: true, excused: false, flag_reason: null }
	]
};

const BOARD = {
	manages: true,
	sets: [
		{
			id: 'ts-1',
			label: 'Gearbox build teams',
			seed: '42',
			mode: 'size',
			mode_value: 2,
			created_at: '2026-09-28T16:00:00Z',
			posted_at: null,
			visible_until: null,
			showing: false,
			edited_at: null,
			edited_by: null,
			teams: [
				{
					id: 't-1',
					team_number: 1,
					name: 'The Gearheads',
					mine: false,
					members: [
						{ student_email: EMAIL, display_name: 'Ana Reyes', still_enrolled: true },
						{ student_email: BEN.email, display_name: BEN.name, still_enrolled: true }
					]
				}
			]
		}
	]
};

function parent(canManage: boolean) {
	return async () => ({
		canManage,
		section: SECTION,
		items: ITEMS,
		checkIns: [{ session_id: 'ns-1', section_id: 's-1', session_date: '2026-10-06', session_label: 'Day 18 bench', unit_number: 1, status: null, flag_reason: null, item_id: null }],
		classClock: { now: NOW, today: TODAY }
	});
}

function run(opts: { email: string; canManage?: boolean; claims?: unknown; supabase?: ReturnType<typeof client> }) {
	const supabase = opts.supabase ?? client();
	return (load as never as (event: unknown) => Promise<unknown>)({
		params: { sectionId: 's-1', studentEmail: opts.email },
		parent: parent(opts.canManage ?? true),
		locals: { supabase, claims: opts.claims === undefined ? { sub: 'teacher-uuid', email: TEACHER } : opts.claims }
	});
}

describe('every refusal is the same 404', () => {
	it('a non-manager gets 404, not 403 and not a redirect', async () => {
		await expect(run({ email: EMAIL, canManage: false })).rejects.toMatchObject({ status: 404 });
	});

	it('a malformed, unknown or manager address is 404 each, and never throws a 500', async () => {
		for (const bad of ['a%zz', 'no-at-sign', 'x'.repeat(400) + '@x.net', 'nobody@boscotech.net', TEACHER, 'a b@x.net']) {
			await expect(run({ email: bad }), bad).rejects.toMatchObject({ status: 404 });
		}
	});

	it('no session is the classroom redirect, as every classroom load does', async () => {
		await expect(run({ email: EMAIL, claims: null })).rejects.toMatchObject({ status: 303 });
	});

	it('POSITIVE CONTROL: a manager and an enrolled student are answered, any letter case', async () => {
		const answer = (await run({ email: 'Ana.Reyes@BoscoTech.net' })) as { student: { email: string }; studentPage: { assignments: { itemId: string; score: number | null }[] } };
		expect(answer.student.email).toBe(EMAIL);
		expect(answer.studentPage.assignments.find((r) => r.itemId === 'a-bridge')?.score).toBe(18);
	});
});

describe('no classmate reaches the payload', () => {
	it('every planted classmate value is absent, and the student is present', async () => {
		const answer = await run({ email: EMAIL });
		const text = JSON.stringify(answer);
		expect(text).not.toContain(BEN.email);
		expect(text).not.toContain(BEN.name);
		expect(text).not.toContain('ben-uuid');
		expect(text).not.toContain('777');
		expect(text).not.toContain(TEACHER);
		// POSITIVE CONTROLS: the student's own rows made it through each read.
		expect(text).toContain('Bracket v2');
		expect(text).toContain('The Gearheads');
		expect(text).toContain('Gear Calculator');
		expect(text).toContain('4800');
		const page = (answer as { studentPage: { streak: number; entriesFiled: number; notebook: { covered: number }; gallery: { key: string }[] } }).studentPage;
		expect(page.entriesFiled).toBe(1);
		// The gallery: Ana's hand-in picture and her notebook photo, never Ben's.
		expect(page.gallery.map((g) => g.key).sort()).toEqual(['file:file-a', 'photo:photo-a']);
		expect(text).not.toContain('file-b');
		expect(text).not.toContain('photo-b');
		expect(page.notebook.covered).toBe(1);
	});

	it('every class read carried its own attribution filter', async () => {
		const supabase = client();
		await run({ email: EMAIL, supabase });
		const byTable = (t: string) => supabase.log.filter((q) => q.table === t);
		for (const t of ['classroom_submissions', 'classroom_presence', 'ideacad_documents']) {
			const reads = byTable(t);
			expect(reads.length, t).toBeGreaterThan(0);
			for (const q of reads) {
				expect(q.filters, t).toContainEqual({ op: 'eq', col: 'student_email', val: EMAIL });
			}
		}
		const entries = byTable('notebook_entries');
		expect(entries.length).toBeGreaterThan(0);
		for (const q of entries) {
			expect(q.filters).toContainEqual({ op: 'eq', col: 'student_id', val: STUDENT_ID });
			expect(q.filters).toContainEqual({ op: 'eq', col: 'section_id', val: 's-1' });
		}
		// The gallery's reads are keyed on rows already attributed to her: her
		// submission ids and her turned-in entry ids, and nothing else.
		for (const [t, col, ids] of [
			['classroom_submission_files', 'submission_id', ['sub-a']],
			['notebook_entry_photos', 'entry_id', ['e-1']]
		] as const) {
			const reads = byTable(t);
			expect(reads.length, t).toBeGreaterThan(0);
			for (const q of reads) expect(q.filters, t).toContainEqual({ op: 'in', col, val: ids });
		}
		// The new read is asked about the one student, in the one class.
		expect(supabase.rpcLog.find((r) => r.fn === 'classroom_student_overview')?.args).toEqual({
			p_section_id: 's-1',
			p_student_email: EMAIL
		});
	});
});

describe('a source that cannot answer costs its own section, never the page', () => {
	it('the new read missing (PGRST202) is "not yet", any other failure is "could not load"', async () => {
		const missing = (await run({ email: EMAIL, supabase: client({ overviewError: { code: 'PGRST202' } }) })) as { studentPage: { sources: { overview: string }; assignments: unknown[] } };
		expect(missing.studentPage.sources.overview).toBe('unavailable');
		expect(missing.studentPage.assignments.length).toBeGreaterThan(0);
		const failed = (await run({ email: EMAIL, supabase: client({ overviewError: { code: '57014' } }) })) as { studentPage: { sources: { overview: string } } };
		expect(failed.studentPage.sources.overview).toBe('error');
		const refused = (await run({ email: EMAIL, supabase: client({ overview: null }) })) as { studentPage: { sources: { overview: string } } };
		expect(refused.studentPage.sources.overview).toBe('error');
	});

	/*
	 * THE ENTRIES' NARROWER RUNG IS FOR A MISSING COLUMN AND NOTHING ELSE. Run
	 * on any failure, a timeout on the wide rung came back as a count with the
	 * bin in it -- a bigger streak that nothing on screen would question.
	 */
	it('the entries read drops its deleted filter on 42703 alone; any other failure is "not known"', async () => {
		type Entries = { studentPage: { entriesFiled: number | null; streak: number | null } };
		const wide = (await run({ email: EMAIL })) as Entries;
		expect(wide.studentPage.entriesFiled).toBe(1);
		// A database with no `deleted_at` column: the narrower rung answers, bin included.
		const old = (await run({ email: EMAIL, supabase: client({ deletedFilterError: '42703' }) })) as Entries;
		expect(old.studentPage.entriesFiled).toBe(2);
		// A timeout is not a missing column: no count, and no streak, rather than one with the bin in it.
		const timedOut = (await run({ email: EMAIL, supabase: client({ deletedFilterError: '57014' }) })) as Entries;
		expect(timedOut.studentPage.entriesFiled).toBeNull();
		expect(timedOut.studentPage.streak).toBeNull();
	});
});

/**
 * HOW LONG THE PAGE WAITS ON THE DATABASE (ledger 0438, report a5f80fd7: "it
 * takes a particularly long time to load student profiles"). Every read and
 * every function call here answers after the same fixed delay, so the load's
 * wall time divided by that delay is the number of round trips it waits for
 * one after another: the waterfall, measured rather than read off the code.
 * Measured 2026-10-26 on this fixture, 14 calls either way: 6 round trips
 * after the layout before this bundle, 3 after.
 */
function slow(c: ReturnType<typeof client>, ms: number) {
	const wait = () => new Promise((r) => setTimeout(r, ms));
	let calls = 0;
	return {
		get calls() {
			return calls;
		},
		client: {
			...c,
			rpc: async (fn: string, args: Record<string, unknown>) => {
				calls++;
				await wait();
				return c.rpc(fn, args);
			},
			from: (table: string) => {
				const b = c.from(table) as unknown as Record<string, unknown> & { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown> };
				const then = b.then.bind(b);
				b.then = (res, rej) => {
					calls++;
					return wait().then(() => then(res, rej));
				};
				return b;
			}
		} as unknown as ReturnType<typeof client>
	};
}

describe('the waterfall', () => {
	it('waits on at most 3 round trips after the layout', async () => {
		const L = 60;
		const s = slow(client(), L);
		const t0 = performance.now();
		const answer = (await run({ email: EMAIL, supabase: s.client })) as { studentPage: { assignments: unknown[] } };
		const rounds = Math.round((performance.now() - t0) / L);
		console.log(`student page load: ${rounds} round trips, ${s.calls} calls`);
		expect(answer.studentPage.assignments.length).toBeGreaterThan(0);
		expect(rounds).toBeLessThanOrEqual(3);
	});
});
