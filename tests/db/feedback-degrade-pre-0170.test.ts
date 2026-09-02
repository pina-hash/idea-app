// tests/db/feedback-degrade-pre-0170.test.ts
//
// THE CLIENT AGAINST A BACKEND THAT HAS NOT HAD 0170 APPLIED, which in this
// repo is not a hypothetical: migrations are pasted into the Supabase SQL
// editor BY HAND, separately from the deploy, so every hour between a push and
// an apply is a deployment sitting between two migrations.
//
// WHAT FAILS SILENTLY HERE, and why it is a test rather than a harness drive:
// naming a column PostgREST does not hold fails the WHOLE insert, so a client
// that sent `tried` unconditionally would take down EVERY report on the site
// -- signed in and signed out, bug and praise -- for as long as the gap lasted,
// on the one surface whose job is to catch things being broken. Nothing on
// screen distinguishes that from the network being down, and the person is told
// their report is being re-sent.
//
// SO THE LADDER IS DRIVEN AGAINST A REAL PRE-0170 DATABASE, not against a mock
// of one. The chain is applied SHORT of the migration; the REAL `submitFeedback`
// runs against it; and then the identical call is made against the SAME chain
// WITH 0170 applied, which is the positive control that says the narrow rung
// was taken because the column was missing rather than because the widest rung
// never runs at all.
//
// THE CLIENT STAND-IN IS HAND-ROLLED, and that is a deliberate choice against
// `tests/db/postgrest-shim.ts`. The shim models `.from(t).select(...)` and
// `.rpc(...)` and has no `.insert` at all, and extending it is a change to a
// file every other suite reads. What is needed here is narrower than the shim
// and stricter in the one way that matters: it executes the client's OWN column
// list as real SQL against the real table, as the real role, so a column the
// database does not have produces the database's own SQLSTATE rather than an
// answer this file chose. Postgres answers `42703`; PostgREST answers
// `PGRST204` for the same condition on a write, and `feedbackColumnMissing`
// takes both -- the SQLSTATE is what a test can produce honestly, and the
// PostgREST code is asserted against the source separately below.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	feedbackColumnMissing,
	probeFeedbackCapabilities,
	submitFeedback,
	type FeedbackEntry
} from '../../src/lib/feedback/feedback';

const BASE = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0126_app_feedback_anonymous.sql',
	'0127_app_feedback_console_anonymous.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const WITH_0170 = [...BASE, '0170_feedback_tried_and_screenshot.sql'] as const;

/**
 * Every column list the client actually sent, in order, so a test can assert
 * WHICH rung was taken rather than inferring it from the outcome.
 */
interface Sent {
	inserts: string[][];
	selects: string[];
}

/**
 * The narrowest client `submitFeedback` and `probeFeedbackCapabilities` use:
 * `.from(t).insert(row)` and `.from(t).select(cols).limit(n)`, each executed as
 * real SQL as the given user. Anything else throws rather than being modelled
 * wrong -- a stand-in more permissive than the real thing does not fail loudly,
 * it certifies a bug.
 */
function client(db: TestDb, userId: string, sent: Sent): SupabaseClient {
	return {
		from(table: string) {
			if (table !== 'app_feedback') throw new Error(`unexpected table ${table}`);
			return {
				async insert(row: Record<string, unknown>) {
					const cols = Object.keys(row);
					sent.inserts.push(cols);
					const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
					const names = cols.map((c) => `"${c}"`).join(', ');
					try {
						await db.asUser(userId, (q) =>
							q(
								`insert into public.app_feedback (${names}) values (${placeholders})`,
								cols.map((c) => (c === 'meta' ? JSON.stringify(row[c]) : row[c]))
							)
						);
						return { error: null };
					} catch (e) {
						const err = e as { code?: string; message?: string };
						return { error: { code: err.code, message: err.message ?? String(e) } };
					}
				},
				select(columns: string) {
					sent.selects.push(columns);
					return {
						async limit(n: number) {
							try {
								await db.asUser(userId, (q) =>
									q(`select ${columns} from public.app_feedback limit ${n}`)
								);
								return { data: [], error: null };
							} catch (e) {
								const err = e as { code?: string; message?: string };
								return { data: null, error: { code: err.code, message: err.message ?? String(e) } };
							}
						}
					};
				}
			};
		}
	} as unknown as SupabaseClient;
}

const ENTRY: FeedbackEntry = {
	app: 'portal',
	context: '/notebook',
	kind: 'bug',
	message: 'The plate switch does nothing on my phone.',
	meta: { route: '/notebook', path: '/notebook' },
	tried: 'Tapped it eight times, then tried it on a laptop.'
};

async function countRows(target: TestDb): Promise<number> {
	const { rows } = await target.sql<{ n: string }>(
		`select count(*)::text as n from public.app_feedback`
	);
	return Number(rows[0].n);
}

let pre: TestDb;
let post: TestDb;
let preUser: SeededUser;
let postUser: SeededUser;

beforeAll(async () => {
	pre = await startTestDb(BASE);
	post = await startTestDb(WITH_0170);
	preUser = await createUser(pre, 'wren.hollis@boscotech.net', 'Wren Hollis');
	postUser = await createUser(post, 'wren.hollis@boscotech.net', 'Wren Hollis');
}, 180_000);

afterAll(async () => {
	await pre?.stop();
	await post?.stop();
});

describe('before 0170 is applied', () => {
	it('has neither column, which is the state everything below is about', async () => {
		const { rows } = await pre.sql<{ n: string }>(
			`select count(*)::text as n from information_schema.columns
			 where table_schema = 'public' and table_name = 'app_feedback'
				 and column_name in ('tried', 'screenshot_path')`
		);
		expect(Number(rows[0].n)).toBe(0);
		// The positive control: the same probe finds both on the migrated chain,
		// so a zero here means absent rather than "this query reads nothing".
		const { rows: after } = await post.sql<{ n: string }>(
			`select count(*)::text as n from information_schema.columns
			 where table_schema = 'public' and table_name = 'app_feedback'
				 and column_name in ('tried', 'screenshot_path')`
		);
		expect(Number(after[0].n)).toBe(2);
	});

	it('sends the report anyway, on the narrow rung, with tried in meta', async () => {
		const sent: Sent = { inserts: [], selects: [] };
		const result = await submitFeedback(client(pre, preUser.id, sent), preUser.id, ENTRY);

		// NOTHING THROWS AND NOTHING IS LOST. This is the whole claim.
		expect(result).toEqual({ error: null, retryable: false });

		// TWO ATTEMPTS: the widest rung named `tried`, was refused for the column
		// not existing, and the narrow rung is 0053's own insert.
		expect(sent.inserts).toHaveLength(2);
		expect(sent.inserts[0]).toContain('tried');
		expect(sent.inserts[1]).not.toContain('tried');
		expect(sent.inserts[1]).not.toContain('screenshot_path');

		// And the answer still reached the row, in the free-form blob the console
		// reads generically. A field that silently dropped what somebody typed
		// would look identical from every screen.
		const { rows } = await pre.sql<{ meta: Record<string, unknown>; message: string }>(
			`select meta, message from public.app_feedback order by created_at desc limit 1`
		);
		expect(rows[0].message).toBe(ENTRY.message);
		expect(rows[0].meta).toEqual({
			route: '/notebook',
			path: '/notebook',
			tried: 'Tapped it eight times, then tried it on a laptop.'
		});
	});

	it('offers no attach control, because the probe says no', async () => {
		const sent: Sent = { inserts: [], selects: [] };
		const caps = await probeFeedbackCapabilities(client(pre, preUser.id, sent));
		expect(caps).toEqual({ tried: false, screenshot: false });
		// It asked, rather than assuming: a probe that never ran would answer the
		// same way and would go on answering it after the migration landed.
		expect(sent.selects).toEqual(['tried,screenshot_path']);
	});

	it('reports a refusal on the narrow rung rather than climbing back down again', async () => {
		// On THIS chain a forged author is refused twice for two different
		// reasons: the widest rung dies on the missing column (42703, before RLS
		// is ever consulted) and the narrow rung dies on the policy (42501). What
		// matters is that the ladder STOPS there -- two rungs, a refusal reported
		// once, and no third attempt.
		const sent: Sent = { inserts: [], selects: [] };
		const result = await submitFeedback(
			client(pre, preUser.id, sent),
			'00000000-0000-4000-8000-000000000000',
			ENTRY
		);
		expect(result.error).toBeTruthy();
		expect(result.retryable).toBe(false);
		expect(sent.inserts).toHaveLength(2);
	});
});

describe('after 0170 is applied', () => {
	it('takes the widest rung, once, and puts tried in the column', async () => {
		const sent: Sent = { inserts: [], selects: [] };
		const result = await submitFeedback(client(post, postUser.id, sent), postUser.id, ENTRY);
		expect(result).toEqual({ error: null, retryable: false });

		// ONE attempt. A ladder that always spent two round trips would be a
		// permanent cost paid for a state that ended at the apply.
		expect(sent.inserts).toHaveLength(1);
		expect(sent.inserts[0]).toContain('tried');

		const { rows } = await post.sql<{ tried: string | null; meta: Record<string, unknown> }>(
			`select tried, meta from public.app_feedback order by created_at desc limit 1`
		);
		expect(rows[0].tried).toBe('Tapped it eight times, then tried it on a laptop.');
		// AND NOT IN BOTH PLACES. Two spellings of one answer is what the console
		// would print twice.
		expect(rows[0].meta).toEqual({ route: '/notebook', path: '/notebook' });
	});

	it('reports a REAL refusal as a refusal instead of degrading past it', async () => {
		// THE DANGEROUS DIRECTION, isolated on the chain where the columns exist
		// so the only thing that can refuse is the POLICY. A ladder that retried
		// on ANY error would turn an RLS denial into a second attempt and then
		// report whatever that one said -- so a row refused for being filed as
		// somebody else would come back wearing a different sentence, or worse,
		// land. Only "the column is not there" degrades.
		const sent: Sent = { inserts: [], selects: [] };
		const before = await countRows(post);
		const result = await submitFeedback(
			client(post, postUser.id, sent),
			'00000000-0000-4000-8000-000000000000',
			ENTRY
		);
		expect(result.error).toBeTruthy();
		expect(result.retryable).toBe(false);
		// ONE attempt: 42501 is a considered refusal and re-sending cannot change
		// it. And nothing landed, which is the half a second rung could have got
		// wrong invisibly.
		expect(sent.inserts).toHaveLength(1);
		expect(await countRows(post)).toBe(before);
	});

	it('probes true, which is what lets the attach control be drawn at all', async () => {
		const sent: Sent = { inserts: [], selects: [] };
		expect(await probeFeedbackCapabilities(client(post, postUser.id, sent))).toEqual({
			tried: true,
			screenshot: true
		});
	});

	it('carries a screenshot key on the widest rung', async () => {
		const sent: Sent = { inserts: [], selects: [] };
		const key = `${postUser.id}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png`;
		const result = await submitFeedback(client(post, postUser.id, sent), postUser.id, {
			...ENTRY,
			screenshotPath: key
		});
		expect(result.error).toBeNull();
		expect(sent.inserts[0]).toContain('screenshot_path');
		const { rows } = await post.sql<{ screenshot_path: string | null }>(
			`select screenshot_path from public.app_feedback order by created_at desc limit 1`
		);
		expect(rows[0].screenshot_path).toBe(key);
	});
});

describe('which errors mean "not migrated yet"', () => {
	it('takes the two codes for a missing column and nothing else', () => {
		// READ OFF THE CODE ALONE. `42703` is what Postgres answers and what the
		// stand-in above genuinely produced; `PGRST204` is what PostgREST answers
		// for the same condition on a write, which no local fixture can emit, so
		// it is pinned here instead of being left to a production discovery.
		expect(feedbackColumnMissing('42703')).toBe(true);
		expect(feedbackColumnMissing('PGRST204')).toBe(true);
		// Everything that is a considered refusal, and must never degrade.
		for (const code of ['42501', '23514', '23505', 'PGRST202', '', null, undefined]) {
			expect({ code, missing: feedbackColumnMissing(code) }).toEqual({ code, missing: false });
		}
	});
});
