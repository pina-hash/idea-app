// tests/feedback-horizon.test.ts
//
// LONG-TERM IDEAS IN FEEDBACK (Mr. Pina, 2026-09-30, migration 0230), the
// client half, and the admin's console link from the report box (report R15).
//
// WHAT FAILS SILENTLY HERE, AND IS THEREFORE WHAT IS ASSERTED:
//
//   1. AN ORDINARY REPORT MUST STAY BYTE-IDENTICAL. The signed-in write is a
//      direct insert under RLS, and naming a column the backend does not have
//      fails the WHOLE insert. So `horizon` may be named ONLY when somebody
//      chose "long-term", and `now` must never be sent on either path. A
//      ladder that always named it would cost every report on the site a
//      refused first attempt for as long as 0230 is unapplied, with nothing on
//      screen saying why.
//   2. THE LADDER DEGRADES ONE CAPABILITY PER RUNG, on a missing column ALONE.
//      Degrading on any other refusal would re-send a narrower row past a CHECK
//      or an RLS answer that a narrower row cannot change.
//   3. A LONG-TERM IDEA WRITTEN BEFORE 0230 STILL READS AS ONE. `rowHorizon`
//      falls back to `meta.horizon` exactly as `rowTried` falls back to
//      `meta.tried`; a reader of the column alone would file it under "fix
//      soon" and nobody would notice.
//   4. THE FILTER WORKS IN BOTH DIRECTIONS, with counts, so "Fix soon" leaving
//      out the long-term ideas is not a filter that leaves out everything.
//
// Every expected value is written out here, never derived from the module.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	FEEDBACK_HORIZONS,
	isFeedbackHorizon,
	submitAnonymousFeedback,
	submitFeedback,
	type FeedbackEntry,
	type FeedbackRow
} from '../src/lib/feedback/feedback';
import {
	EMPTY_FEEDBACK_FILTER,
	feedbackHorizonWord,
	feedbackMarkdown,
	filterFeedback,
	rowHorizon,
	rowMetaExtras,
	splitByHorizon
} from '../src/lib/feedback/console';
import { FEEDBACK_CONSOLE_PATH, feedbackConsoleHref } from '../src/lib/feedback/context';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// A fake client: `.from(table).insert(row)`, answered from a script.
// ---------------------------------------------------------------------------

type Answer = { code: string; message: string } | null;

function fakeClient(answers: Answer[]) {
	const inserted: Record<string, unknown>[] = [];
	const tables: string[] = [];
	const client = {
		from(table: string) {
			tables.push(table);
			return {
				insert(row: Record<string, unknown>) {
					// A deep copy, so a later rung mutating a shared object would be caught.
					inserted.push(JSON.parse(JSON.stringify(row)));
					const error = answers[inserted.length - 1] ?? null;
					return Promise.resolve({ error });
				}
			};
		}
	};
	return { client: client as unknown as SupabaseClient, inserted, tables };
}

const MISSING = { code: 'PGRST204', message: "Could not find the 'horizon' column" };
const ENTRY: FeedbackEntry = {
	app: 'classroom',
	context: '/classroom/[sectionId]',
	kind: 'idea',
	message: '  A presentation engine for student slides.  ',
	meta: { route: '/classroom/[sectionId]', path: '/classroom/s-1' }
};
/** The row 0053 has always taken, byte for byte, written out by hand. */
const BASE_ROW = {
	user_id: 'u-1',
	app: 'classroom',
	context: '/classroom/[sectionId]',
	kind: 'idea',
	message: 'A presentation engine for student slides.',
	meta: { route: '/classroom/[sectionId]', path: '/classroom/s-1' }
};

describe('the signed-in ladder', () => {
	it('an ordinary report (fix soon, nothing tried, no picture) is the base insert, once, with no horizon key', async () => {
		const f = fakeClient([null]);
		const res = await submitFeedback(f.client, 'u-1', ENTRY);
		expect(res).toEqual({ error: null, retryable: false });
		expect(f.inserted).toEqual([BASE_ROW]);
		expect('horizon' in f.inserted[0]!).toBe(false);
		// `now` chosen explicitly is still never sent.
		const g = fakeClient([null]);
		await submitFeedback(g.client, 'u-1', { ...ENTRY, horizon: 'now' });
		expect(g.inserted).toEqual([BASE_ROW]);
	});

	it('a long-term idea names the column on the first rung, and lands there', async () => {
		const f = fakeClient([null]);
		await submitFeedback(f.client, 'u-1', { ...ENTRY, horizon: 'long_term' });
		expect(f.inserted).toEqual([{ ...BASE_ROW, horizon: 'long_term' }]);
		expect(f.tables).toEqual(['app_feedback']);
	});

	it('without 0230 it falls to meta.horizon, one rung, and the meta is the caller\'s plus that key only', async () => {
		const f = fakeClient([MISSING, null]);
		const res = await submitFeedback(f.client, 'u-1', { ...ENTRY, horizon: 'long_term' });
		expect(res.error).toBeNull();
		expect(f.inserted).toEqual([
			{ ...BASE_ROW, horizon: 'long_term' },
			{ ...BASE_ROW, meta: { ...BASE_ROW.meta, horizon: 'long_term' } }
		]);
		// The caller's own meta object is captured context and is not edited.
		expect(ENTRY.meta).toEqual({ route: '/classroom/[sectionId]', path: '/classroom/s-1' });
	});

	it('with something tried, the rungs are 0230 + 0170, then 0170 + meta.horizon, then 0053 + both in meta', async () => {
		const f = fakeClient([MISSING, { code: '42703', message: 'column "tried" does not exist' }, null]);
		const res = await submitFeedback(f.client, 'u-1', {
			...ENTRY,
			tried: ' reloaded it ',
			horizon: 'long_term'
		});
		expect(res.error).toBeNull();
		expect(f.inserted).toEqual([
			{ ...BASE_ROW, horizon: 'long_term', tried: 'reloaded it' },
			{ ...BASE_ROW, meta: { ...BASE_ROW.meta, horizon: 'long_term' }, tried: 'reloaded it' },
			{ ...BASE_ROW, meta: { ...BASE_ROW.meta, tried: 'reloaded it', horizon: 'long_term' } }
		]);
	});

	it('the 0170 ladder is exactly what it was when nobody chose long-term', async () => {
		const f = fakeClient([MISSING, null]);
		await submitFeedback(f.client, 'u-1', { ...ENTRY, tried: 'reloaded it' });
		expect(f.inserted).toEqual([
			{ ...BASE_ROW, tried: 'reloaded it' },
			{ ...BASE_ROW, meta: { ...BASE_ROW.meta, tried: 'reloaded it' } }
		]);
	});

	it('a refusal that is not a missing column is reported at once and never re-sent narrower', async () => {
		const f = fakeClient([{ code: '23514', message: 'violates check constraint' }]);
		const res = await submitFeedback(f.client, 'u-1', { ...ENTRY, horizon: 'long_term' });
		expect(f.inserted).toHaveLength(1);
		expect(res).toEqual({ error: 'violates check constraint', retryable: false });
	});

	it('a codeless transport failure is retryable, and stops the ladder there too', async () => {
		const f = fakeClient([{ code: '', message: 'Failed to fetch' }]);
		const res = await submitFeedback(f.client, 'u-1', { ...ENTRY, horizon: 'long_term' });
		expect(f.inserted).toHaveLength(1);
		expect(res).toEqual({ error: 'Failed to fetch', retryable: true });
	});
});

describe('the anonymous path', () => {
	async function sent(entry: FeedbackEntry) {
		const bodies: Record<string, unknown>[] = [];
		const fetchImpl = (async (_url: string, init: RequestInit) => {
			bodies.push(JSON.parse(String(init.body)));
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}) as unknown as typeof fetch;
		await submitAnonymousFeedback(entry, fetchImpl);
		return bodies[0]!;
	}

	it('carries meta.horizon only when long-term was chosen, and never a horizon field', async () => {
		const long = await sent({ ...ENTRY, horizon: 'long_term' });
		expect(long.meta).toEqual({ ...BASE_ROW.meta, horizon: 'long_term' });
		expect('horizon' in long).toBe(false);
		// Positive control beside the absence: the same entry left on "fix soon".
		for (const entry of [ENTRY, { ...ENTRY, horizon: 'now' as const }]) {
			const body = await sent(entry);
			expect(body.meta).toEqual(BASE_ROW.meta);
		}
	});
});

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

function row(over: Partial<FeedbackRow>): FeedbackRow {
	return {
		id: 'r',
		app: 'portal',
		context: '/',
		kind: 'idea',
		message: 'a message',
		meta: { route: '/' },
		status: 'new',
		created_at: '2026-09-30T10:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'A Teacher',
		submitter_email: 'a@boscotech.edu',
		...over
	} as FeedbackRow;
}

describe('rowHorizon', () => {
	it('reads the column, then meta.horizon, then defaults to now', () => {
		expect(rowHorizon(row({ horizon: 'long_term' }))).toBe('long_term');
		expect(rowHorizon(row({ horizon: 'now' }))).toBe('now');
		expect(rowHorizon(row({ meta: { route: '/', horizon: 'long_term' } }))).toBe('long_term');
		expect(rowHorizon(row({}))).toBe('now');
		expect(rowHorizon(row({ horizon: null, meta: null }))).toBe('now');
	});

	it('the column wins over the blob, so an admin moving a report back to fix soon sticks', () => {
		expect(rowHorizon(row({ horizon: 'now', meta: { route: '/', horizon: 'long_term' } }))).toBe('now');
	});

	it('an unknown value in either place is now, never a third state', () => {
		expect(rowHorizon(row({ horizon: 'later' }))).toBe('now');
		expect(rowHorizon(row({ meta: { route: '/', horizon: 'someday' } }))).toBe('now');
		expect(isFeedbackHorizon('later')).toBe(false);
		expect(FEEDBACK_HORIZONS.map((h) => h.id)).toEqual(['now', 'long_term']);
	});

	it('meta.horizon is a named field, never printed again by the generic pass', () => {
		expect(rowMetaExtras(row({ meta: { route: '/', horizon: 'long_term', surface: 'x' } }))).toEqual([
			{ key: 'surface', value: 'x' }
		]);
	});
});

const ROWS: FeedbackRow[] = [
	row({ id: 'n1' }),
	row({ id: 'l1', horizon: 'long_term' }),
	row({ id: 'n2', horizon: 'now', status: 'seen' }),
	row({ id: 'l2', meta: { route: '/foundry', horizon: 'long_term' } }),
	row({ id: 'n3', kind: 'bug' })
];

describe('the horizon facet', () => {
	const f = (horizon: '' | 'now' | 'long_term', status: 'all' | 'new' = 'all') => ({
		...EMPTY_FEEDBACK_FILTER,
		status,
		horizon
	});

	it('is empty on the empty filter, which admits both', () => {
		expect(EMPTY_FEEDBACK_FILTER.horizon).toBe('');
		expect(filterFeedback(ROWS, EMPTY_FEEDBACK_FILTER)).toHaveLength(5);
	});

	it('partitions the set in both directions, with counts', () => {
		const now = filterFeedback(ROWS, f('now')).map((r) => r.id);
		const long = filterFeedback(ROWS, f('long_term')).map((r) => r.id);
		expect(now).toEqual(['n1', 'n2', 'n3']);
		expect(long).toEqual(['l1', 'l2']);
		expect(now.length + long.length).toBe(ROWS.length);
		expect(now.filter((id) => long.includes(id))).toEqual([]);
	});

	it('composes with status, and honours an optimistic horizon handed in', () => {
		expect(filterFeedback(ROWS, f('now', 'new')).map((r) => r.id)).toEqual(['n1', 'n3']);
		// n1 has just been moved to long-term on screen; the reload has not landed.
		const moved = (r: FeedbackRow) => (r.id === 'n1' ? 'long_term' : rowHorizon(r));
		expect(filterFeedback(ROWS, f('long_term'), (r) => r.status, moved).map((r) => r.id)).toEqual([
			'n1',
			'l1',
			'l2'
		]);
		expect(splitByHorizon(ROWS, moved).now.map((r) => r.id)).toEqual(['n2', 'n3']);
	});

	it('splitByHorizon keeps the queue order in each list', () => {
		const split = splitByHorizon(ROWS);
		expect(split.now.map((r) => r.id)).toEqual(['n1', 'n2', 'n3']);
		expect(split.longTerm.map((r) => r.id)).toEqual(['l1', 'l2']);
	});
});

describe('the export says when each report is for', () => {
	it('prints a horizon line on every report, now included', () => {
		const { text } = feedbackMarkdown([ROWS[0]!, ROWS[1]!, ROWS[3]!]);
		expect(text.match(/^- horizon: now$/gm)).toHaveLength(1);
		expect(text.match(/^- horizon: long-term$/gm)).toHaveLength(2);
		expect(feedbackHorizonWord('long_term')).toBe('long-term');
	});

	it('names the facet in the header only when it is set', () => {
		const set = feedbackMarkdown(ROWS, { filter: { ...EMPTY_FEEDBACK_FILTER, horizon: 'long_term' } });
		expect(set.text.split('\n').find((l) => l.startsWith('Filter:'))).toBe(
			'Filter: status: all, horizon: long-term'
		);
		const unset = feedbackMarkdown(ROWS, { filter: EMPTY_FEEDBACK_FILTER });
		expect(unset.text.split('\n').find((l) => l.startsWith('Filter:'))).toBe('Filter: status: all');
	});
});

describe('the dashboard badge counts what the console opens on', () => {
	it('counts new reports that are NOT long-term ideas, through the console\'s own reader', () => {
		const server = readFileSync(new URL('../src/routes/dashboard/+page.server.ts', import.meta.url), 'utf8');
		expect(server).toMatch(/r\.status === 'new' && rowHorizon\(r\) !== 'long_term'/);
		// The reader it names is the one the console filters with, not a copy.
		expect(server).toMatch(/import \{ rowHorizon \} from '\$lib\/feedback\/console'/);
	});
});

// ---------------------------------------------------------------------------
// R15: the console link
// ---------------------------------------------------------------------------

describe('the console link from the report box (report R15)', () => {
	it('goes to an admin, everywhere but the console itself', () => {
		expect(FEEDBACK_CONSOLE_PATH).toBe('/admin/feedback');
		for (const p of ['/', '/classroom/s-1', '/dashboard', '/classroom/feedback']) {
			expect(feedbackConsoleHref(true, p), p).toBe('/admin/feedback');
		}
		for (const p of ['/admin/feedback', '/admin/feedback/', '/admin/feedback/x']) {
			expect(feedbackConsoleHref(true, p), p).toBeNull();
		}
	});

	it('goes to nobody else, and "cannot tell" is no', () => {
		for (const v of [false, undefined, null, 'true', 1]) {
			expect(feedbackConsoleHref(v, '/'), String(v)).toBeNull();
		}
	});
});
