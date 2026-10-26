// tests/db/connector-levels.test.ts
//
// THE THREE LEVELS HOLD FOR EVERY ENTRY, ENFORCED BY THE SERVER FROM THE
// REGISTRY (docs/connector/DESIGN.md section 3), judged by the log tables read
// back as the connection owner and never by a tool's own answer:
//
//   - a `read` entry writes no row in any log table and no audit row;
//   - a `confirm` entry writes nothing without a token, nothing with a token
//     that is not the one it was handed, and nothing with the right token
//     carried over to different arguments;
//   - every `undo` entry runs, writes, and `undo_last` then reverses it: every
//     row the write took away is back, and every row it added is gone again
//     (or, in a table that is append-only by design, answered by a reversing
//     row the undo appends);
//   - `level_when` picks the level from the arguments, both ways.
//
// The samples are tests/db/connector-samples.ts, shared with the permission
// suite: a write entry the registry gains with no sample fails here too.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectorWorld, logDiff, logSnapshot, normalizeRow, type ConnectorWorld } from './connector-fixture';
import { connectorSamples, isGeneric, OWNER_ONLY, type Samples } from './connector-samples';
import { runTool } from '../../src/lib/server/connector/tools';
import { callArgs, callEntries, directEntries, levelFor, levelsOf, type FunctionEntry } from '../../src/lib/server/connector/registry';
import type { ToolContext } from '../../src/lib/server/connector/context';

let w: ConnectorWorld;
let S: Samples;

beforeAll(async () => {
	w = await connectorWorld();
	S = connectorSamples(w);
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

async function snapshot(): Promise<Map<string, string[]>> {
	return logSnapshot((t, p) => w.db.sql(t, p) as unknown as Promise<{ rows: Record<string, unknown>[] }>);
}

async function counts(tables: string[]): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	for (const t of tables) out[t] = Number((await w.db.sql<{ n: string }>(`select count(*)::text as n from public.${t}`)).rows[0].n);
	return out;
}

const BOOKKEEPING = ['connector_audit', 'connector_confirmations'];

async function adminCtx(): Promise<ToolContext> {
	return w.ctx(w.admin);
}

/** Every entry the model can reach: through site_call, or as a tool of its own. */
function entries(): FunctionEntry[] {
	return [...callEntries(), ...directEntries()];
}

/** The args a sample makes, by the entry's own parameter names: through site_call, or its own tool. */
async function callThrough(ctx: ToolContext, e: FunctionEntry, args: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	if (e.surface === 'tool') return runTool(ctx, e.tool ?? e.name, { ...args, ...extra });
	return runTool(ctx, 'site_call', { name: e.name, args, ...extra });
}

/** A normalized multiset: row text to count, per table. */
function bag(snap: Map<string, string[]>, keepStamps = false): Map<string, Map<string, number>> {
	const out = new Map<string, Map<string, number>>();
	for (const [t, rows] of snap) {
		const m = new Map<string, number>();
		for (const r of rows) {
			const k = keepStamps ? normalizeRow(r) : stripStamps(normalizeRow(r));
			m.set(k, (m.get(k) ?? 0) + 1);
		}
		out.set(t, m);
	}
	return out;
}

/** Rows in `a` beyond what `b` holds, per table, as normalized text. */
function beyond(a: Map<string, Map<string, number>>, b: Map<string, Map<string, number>>): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const [t, m] of a) {
		const other = b.get(t) ?? new Map<string, number>();
		const extra: string[] = [];
		for (const [k, n] of m) for (let i = (other.get(k) ?? 0); i < n; i++) extra.push(k);
		if (extra.length) out.set(t, extra);
	}
	return out;
}

/**
 * Tables that are append-only BY DESIGN (CLAUDE.md, "State modelling"): a
 * reversal there is a new row, never a removed one, so what the write added or
 * stamped stays and the undo's own row answers it. Named, so nothing else is
 * excused.
 */
const APPEND_ONLY = /^(coin_transactions|classroom_content_revisions|classroom_grade_revocations|profile_avatar_holds|tournament_match_events|app_feedback_edits|connector_gaps)$|(_events|_log|_audit|_history|_revisions)$/;

/**
 * Columns a write stamps with WHO last touched a row and WHEN, which an undo
 * stamps again rather than clearing (a status set back by hand records the
 * person who set it back, exactly as on the site). Timestamps are already
 * blanked by normalizeRow; these are the columns that would still differ.
 */
const STAMPS = new Set(['reviewed_at', 'reviewed_by', 'updated_by', 'edited_at', 'edited_by', 'style_updated_by', 'teacher_seen_at']);

/** Writes whose whole effect IS the review stamp: for them the stamp is compared, not set aside. */
const STAMP_IS_THE_EFFECT = new Set(['notebook_accept_entry', 'notebook_unaccept_entry']);

function stripStamps(row: string): string {
	try {
		const o = JSON.parse(row) as Record<string, unknown>;
		for (const k of STAMPS) if (k in o) o[k] = '<stamp>';
		return JSON.stringify(o);
	} catch {
		return row;
	}
}

/**
 * Writes the site reverses by MEANING rather than row for row, each with the
 * reason and the fact checked instead. Every one is a function whose own
 * reverse leaves a record behind on purpose: a revoked grade keeps its
 * revocation, a removed note keeps its words, a review sent back stays a review.
 */
const REVERSED_BY_MEANING: Record<string, { why: string; check: (args: Record<string, unknown>) => Promise<boolean> }> = {
	classroom_grade_direct: {
		why: 'A first grade is taken back by revoking it (0265): the row stays as an empty draft and the grade is kept in the revocation record.',
		check: async (a) => (await w.db.sql(`select 1 from public.classroom_submissions where item_id = $1 and student_email = $2 and score is null and returned_at is null`, [a.p_item_id, a.p_student_email])).rows.length === 1
	},
	classroom_grade_submission: {
		why: 'As above, for a rubric grade.',
		check: async (a) => (await w.db.sql(`select 1 from public.classroom_submissions where item_id = $1 and student_email = $2 and score is null and returned_at is null`, [a.p_item_id, a.p_student_email])).rows.length === 1
	},
	classroom_restore_grade: {
		why: 'A restored grade is revoked again; every revocation is kept.',
		check: async (a) => (await w.db.sql(`select 1 from public.classroom_submissions where item_id = $1 and student_email = $2 and score is null`, [a.p_item_id, a.p_student_email])).rows.length === 1
	},
	classroom_feedback_post: {
		why: 'A note is removed by a stamp, never deleted; its messages stay under the removed thread.',
		check: async (a) => (await w.db.sql(`select 1 from public.classroom_feedback_threads where item_id = $1 and removed_at is not null`, [a.p_item_id])).rows.length >= 1
	},
	coin_voice_log: {
		why: 'Undo reverses the coin record (ledger 0432); the phrase he said stays learned with its amount, because a default he set is his, not part of one record.',
		check: async (a) =>
			(await w.db.sql(
				`select 1 from public.coin_transactions t where t.student_email = $1 and t.category_id = $2 and public._coin_is_reversed(t.id)`,
				[a.p_email, a.p_category_id]
			)).rows.length >= 1
	},
	coin_banner_save: {
		why: 'A banner pin is taken down by a stamp (0280), never deleted, so the banner keeps its record of what ran (ledger 0416).',
		check: async (a) => (await w.db.sql(`select 1 from public.coin_banner_pins where title = $1 and removed_at is not null`, [a.p_title])).rows.length === 1
	},
	classroom_quick_post_create: {
		why: 'A notice is taken down by a stamp, never deleted.',
		check: async (a) => (await w.db.sql(`select 1 from public.classroom_quick_posts where body = $1 and taken_down_at is not null`, [a.p_body])).rows.length >= 1
	},
	classroom_save_team_set: {
		why: 'A saved draw is archived, never deleted, so the record of who worked with whom stays.',
		check: async (a) => (await w.db.sql(`select 1 from public.classroom_team_sets where label = $1 and archived_at is not null`, [a.p_label])).rows.length === 1
	},
	classroom_draw_teams: {
		why: 'A draw saved by voice is undone as a saved draw is (0307 calls classroom_save_team_set): archived, never deleted.',
		check: async (a) => (await w.db.sql(`select 1 from public.classroom_team_sets where label = $1 and archived_at is not null`, [a.p_label])).rows.length === 1
	},
	greenline_decal_review: {
		why: 'No function returns a reviewed decal to pending; the undo of an approval sends it back for revision, out of public view.',
		check: async (a) => (await w.db.sql(`select 1 from public.greenline_decals where user_id = $1 and status <> 'approved'`, [a.p_user_id])).rows.length === 1
	},
	greenline_track_review: {
		why: 'No function returns a reviewed track to pending; the undo of an approval sends it back, off the public list.',
		check: async (a) => (await w.db.sql(`select 1 from public.greenline_tracks where id = $1 and status <> 'approved'`, [a.p_track_id])).rows.length === 1
	},
	notebook_flag_entry: {
		why: 'A flag is reversed by resolving it; no function returns a reviewed entry to waiting.',
		check: async (a) => (await w.db.sql(`select 1 from public.notebook_entries where id = $1 and status <> 'flagged' and flag_reason is null`, [a.p_entry_id])).rows.length === 1
	},
	profile_avatar_restore: {
		why: 'A restored picture is turned off again with a new hold; every hold is kept.',
		check: async (a) => (await w.db.sql(`select 1 from public.profiles where email = $1 and avatar is null and avatar_url is null`, [a.p_email])).rows.length === 1
	}
};

/**
 * Entries whose shared sample takes the branch that ASKS first (the first
 * answer, the first spec, a draft opened for registration): a second call on
 * the same record takes the undo branch, which is the one this suite checks.
 */
const SECOND_CALL: Record<string, (first: Record<string, unknown>) => Record<string, unknown>> = {
	classroom_save_instructor_response: (a) => ({ ...a, p_value: 'a changed answer' }),
	classroom_set_assignment_spec: (a) => ({ ...a, p_spec: { ...(a.p_spec as Record<string, unknown>), meta: { assignmentId: 'connector-sample', title: 'Sample, revised', totalPoints: 8 } } }),
	classroom_set_reference_spec: (a) => ({ ...a, p_spec: { ...(a.p_spec as Record<string, unknown>), meta: { referenceId: 'ref-1', title: 'Course Reference, revised' } } }),
	tournament_set_status: (a) => ({ ...a, p_status: 'seeding' })
};

describe('read entries write nothing', () => {
	it('every read entry, called with real ids where the world has them, writes no log row and no audit row', async () => {
		const reads = entries().filter((e) => levelsOf(e).every((l) => l === 'read'));
		expect(reads.length).toBeGreaterThanOrEqual(100);
		const values = await S.readValues();
		const before = await snapshot();
		const beforeBooks = await counts(BOOKKEEPING);
		const ctx = await adminCtx();
		let answered = 0;
		for (const e of reads) {
			const args: Record<string, unknown> = {};
			for (const a of callArgs(e)) if (a.required) args[a.param] = values(a.param, a.type);
			const out = await callThrough(ctx, e, args);
			if (out.status === 'ok') answered += 1;
		}
		expect(logDiff(before, await snapshot())).toEqual(new Map());
		expect(await counts(BOOKKEEPING)).toEqual(beforeBooks);
		// The positive control: most of them really ran and answered.
		expect(answered).toBeGreaterThanOrEqual(Math.floor(reads.length * 0.6));
	}, 300_000);
});

describe('confirm entries never write without the token they were handed', () => {
	const confirms = () => entries().filter((e) => e.level === 'confirm' && !e.level_when?.length && !OWNER_ONLY.has(e.name));

	it('there are confirm entries to check', () => {
		expect(confirms().length).toBeGreaterThanOrEqual(40);
	});

	it('every confirm entry: no token previews and writes nothing; a made-up token is refused and writes nothing', async () => {
		const notPreviewed: string[] = [];
		for (const e of confirms()) {
			const args = await S.samples[e.name]();
			// A fresh context per call, as one MCP request is: the name lookups are cached per request.
			const ctx = await adminCtx();
			const before = await snapshot();
			const first = await callThrough(ctx, e, args);
			const second = await callThrough(ctx, e, args, { confirm_token: 'not-a-token-it-was-handed' });
			expect(logDiff(before, await snapshot()), `${e.name} wrote without a token`).toEqual(new Map());
			if (first.status === 'preview') expect(typeof first.confirm_token, `${e.name} handed back a token`).toBe('string');
			// A generic-proof entry (ledger 0416) runs on placeholder arguments, which
			// its own checks may refuse: refused-and-nothing-written is its proof. A
			// placeholder name no record carries (ledger 0422's lookups) is refused
			// the same way, before anything is asked of the database.
			else if (!(isGeneric(e.name) && ['refused', 'not_found', 'ambiguous'].includes(String(first.status)))) notPreviewed.push(`${e.name}: ${first.status} ${String(first.message ?? '')}`);
			expect(second.status, `${e.name} with a made-up token`).not.toBe('done');
		}
		expect(notPreviewed).toEqual([]);
	}, 600_000);

	it('the right token carried over to different arguments is refused; with the same arguments it writes once', async () => {
		const e = entries().find((x) => x.name === 'classroom_delete_item')!;
		expect(e.level).toBe('confirm');
		const a = await S.samples[e.name]();
		const b = await S.samples[e.name]();
		const ctx = await adminCtx();
		const preview = await callThrough(ctx, e, a);
		expect(preview.status).toBe('preview');
		const before = await snapshot();
		const swapped = await callThrough(ctx, e, b, { confirm_token: preview.confirm_token });
		expect(swapped.status).not.toBe('done');
		expect(logDiff(before, await snapshot())).toEqual(new Map());
		// The token was spent on the refusal: a fresh preview and its own token write it.
		const again = await callThrough(ctx, e, a);
		const done = await callThrough(ctx, e, a, { confirm_token: again.confirm_token });
		expect(done.status).toBe('done');
		expect(logDiff(before, await snapshot()).size).toBeGreaterThan(0);
	});
});

describe('level_when decides from the arguments, both ways', () => {
	it('every level_when entry names levels the server can tell apart', () => {
		const ruled = entries().filter((e) => e.level_when?.length);
		expect(ruled.length).toBeGreaterThanOrEqual(1);
		for (const e of ruled) expect(new Set(levelsOf(e)).size, e.name).toBeGreaterThan(1);
	});

	it('adding coins runs at once and can be undone; taking them away or setting zero asks first and writes nothing', async () => {
		const e = entries().find((x) => x.name === 'coin_admin_adjust_balance')!;
		expect(levelFor(e, { p_amount: 20 })).toBe('undo');
		expect(levelFor(e, { p_amount: -20 })).toBe('confirm');
		expect(levelFor(e, { p_amount: 0 })).toBe('confirm');
		const ctx = await adminCtx();
		const coins = async () => (await w.db.sql(`select 1 from public.coin_transactions where student_email = $1`, [w.students.leo])).rows.length;
		const start = await coins();
		const down = await callThrough(ctx, e, { p_email: w.students.leo, p_amount: -5, p_note: 'level check' });
		expect(down.status).toBe('preview');
		expect(down.confirm_token).toBeTruthy();
		expect(await coins()).toBe(start);
		const up = await callThrough(ctx, e, { p_email: w.students.leo, p_amount: 5, p_note: 'level check' });
		expect(up.status).toBe('done');
		expect(await coins()).toBe(start + 1);
	});
});

describe('every undo entry is reversed by undo_last', () => {
	const undoEntries = () => entries().filter((e) => levelsOf(e).includes('undo'));

	it('names an undo for every entry that runs at the undo level', () => {
		const missing = undoEntries().filter((e) => !e.undo).map((e) => e.name);
		expect(missing).toEqual([]);
		expect(undoEntries().length).toBeGreaterThanOrEqual(60);
	});

	it('every entry reversed by meaning is an undo entry, and every second-call entry asks first on its sample', () => {
		const names = new Set(undoEntries().map((e) => e.name));
		expect(Object.keys(REVERSED_BY_MEANING).filter((n) => !names.has(n))).toEqual([]);
		expect(Object.keys(SECOND_CALL).filter((n) => !names.has(n))).toEqual([]);
	});

	for (const name of entries().filter((e) => levelsOf(e).includes('undo')).map((e) => e.name)) {
		it(`${name}: the write lands, and undo_last reverses it`, async () => {
			const e = entries().find((x) => x.name === name)!;
			const ctx = await adminCtx();
			let args = await S.samples[name]();
			if (SECOND_CALL[name]) {
				// The first call asks (nothing to go back to yet); press it through, then the second is the undo-level one.
				const first = await callThrough(ctx, e, args);
				expect(first.status, `${name} first call asks`).toBe('preview');
				const done = await callThrough(ctx, e, args, { confirm_token: first.confirm_token });
				expect(done.status, `${name} first call with its token`).toBe('done');
				args = SECOND_CALL[name](args);
			}
			const keep = STAMP_IS_THE_EFFECT.has(name);
			const before = bag(await snapshot(), keep);
			const out = await callThrough(ctx, e, args);
			expect(out.status, `${name}: ${String(out.message ?? '')}`).toBe('done');
			expect(out.undo_available, `${name} names its undo`).toBe(true);
			const written = bag(await snapshot(), keep);
			const added = beyond(written, before);
			const taken = beyond(before, written);
			expect(added.size + taken.size, `${name} wrote to a log table`).toBeGreaterThan(0);

			const undo = await runTool(ctx, 'undo_last', {});
			expect(undo.status, `${name} undo: ${String(undo.message ?? '')}`).toBe('done');
			const after = bag(await snapshot(), keep);
			expect(beyond(after, written).size + beyond(written, after).size, `${name}: the undo changed something`).toBeGreaterThan(0);

			const meaning = REVERSED_BY_MEANING[name];
			if (meaning) {
				expect(await meaning.check(args), `${name}: ${meaning.why}`).toBe(true);
				return;
			}
			// Everything the write took away is back (stamps aside).
			const stillGone = beyond(before, after);
			for (const [t, rows] of taken) {
				if (APPEND_ONLY.test(t)) continue;
				const missing = (stillGone.get(t) ?? []).filter((r) => rows.includes(r));
				expect(missing, `${name}: ${t} rows the write took that the undo did not put back`).toEqual([]);
			}
			// Everything the write added is gone, unless the table is append-only.
			const stillThere = beyond(after, before);
			for (const [t, rows] of added) {
				if (APPEND_ONLY.test(t)) continue;
				const left = (stillThere.get(t) ?? []).filter((r) => rows.includes(r));
				expect(left, `${name}: ${t} rows the write added that the undo left`).toEqual([]);
			}
		});
	}
});
