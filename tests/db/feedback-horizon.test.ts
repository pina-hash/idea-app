// tests/db/feedback-horizon.test.ts
//
// 0230 PART C: THE FEEDBACK HORIZON (Mr. Pina, 2026-09-30). A report is "now"
// or "long_term" in a column of its own. What would fail SILENTLY:
//
//   1. THE TWO RE-CREATED FUNCTIONS ANSWER EVERY DEPLOYED CALL AS BEFORE.
//      app_feedback_submit is replaced at its nine-argument signature and the
//      two-argument app_feedback_admin_list becomes a wrapper over a new wide
//      form. The anonymous route and the deployed console keep calling both,
//      so a CORPUS of calls is put to the DEPLOYED functions first, 0230 is
//      applied over the same database, and the corpus is put again: every
//      reason, every refusal sentence and every stored column the same, and
//      the console's rows the same plus the one horizon key.
//   2. THE ROWS ALREADY STORED: an old report reads now; one that carried
//      meta.horizon (the window between the deploy and the apply) is lifted,
//      with its meta left exactly as it was; and the lift runs ONCE, so an
//      admin's later move survives a re-paste.
//   3. ONE SWITCH: no client role can update the table, set_horizon is the
//      admin's alone, and it leaves the review trail untouched.
//   4. NO PAYLOAD CAN BIND TO BOTH CONSOLE READS: the wide form declares no
//      defaults and the narrow keeps its two, asserted structurally.
//
// The chain is the whole tree short of 0230; the seed goes through 0053's
// direct insert and 0170's nine-argument function, the two real write paths.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { PRE_0230, SQL_0230, canExecute, catalogFingerprint, overloads, refusal } from './chain-0230';

const SUBMIT = `select public.app_feedback_submit(
	p_app => $1, p_kind => $2, p_message => $3, p_context => $4,
	p_meta => $5::jsonb, p_contact => $6, p_address_hash => $7,
	p_tried => $8, p_screenshot_path => $9
) as r`;
const NARROW = 'select public.app_feedback_admin_list(p_app => $1, p_limit => $2) as r';
const NARROW_BARE = 'select public.app_feedback_admin_list() as r';
const WIDE = 'select public.app_feedback_admin_list(p_app => $1, p_limit => $2, p_horizon => $3) as r';
const SET = 'select public.app_feedback_set_horizon($1::uuid, $2) as r';
const SUBMIT_SIG = 'app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)';
const FAKE = '00000000-0000-4000-8000-000000000000';

type Json = Record<string, any>;

let db: TestDb;
let admin: SeededUser;
let stu: SeededUser;
let other: SeededUser;
let oldRow: string;
let oldMetaRow: string;
let oldAnonMetaRow: string;

/**
 * THE SUBMIT CORPUS. Each case is the nine arguments with the address hash
 * left as a slot, because the rate limit is per hash and the two phases must
 * not share a budget: pre-0230 and post-0230 runs get their own hash per case.
 * `subject` makes it a service-role call carrying a signed-in user.
 */
interface SubmitCase {
	name: string;
	args: (hash: string) => unknown[];
	subject?: () => SeededUser;
	repeat?: number;
}
const CASES: SubmitCase[] = [
	{ name: 'anonymous, minimal', args: (h) => ['portal', 'bug', 'It broke.', null, '{}', null, h, null, null] },
	{
		name: 'anonymous, every field',
		args: (h) => ['classroom', 'IDEA', '  It broke on Thursday.  ', '/classroom/x', '{"route":"/classroom"}', ' me at home ', h, 'Reloaded twice.', null]
	},
	{
		name: 'anonymous, tried through meta',
		args: (h) => ['portal', 'other', 'Hmm.', null, '{"tried":"Cleared the cache.","v":2}', null, h, null, null]
	},
	{ name: 'a blank message', args: (h) => ['portal', 'bug', ' \n\t ', null, '{}', null, h, null, null] },
	{ name: 'a message too long', args: (h) => ['portal', 'bug', 'm'.repeat(2001), null, '{}', null, h, null, null] },
	{ name: 'a contact too long', args: (h) => ['portal', 'bug', 'ok', null, '{}', 'c'.repeat(201), h, null, null] },
	{ name: 'a tried too long', args: (h) => ['portal', 'bug', 'ok', null, '{}', null, h, 't'.repeat(1001), null] },
	{ name: 'no address hash', args: () => ['portal', 'bug', 'ok', null, '{}', null, null, null, null] },
	{ name: 'an unknown kind', args: (h) => ['portal', 'rant', 'ok', null, '{}', null, h, null, null] },
	{ name: 'no app', args: (h) => ['  ', 'bug', 'ok', null, '{}', null, h, null, null] },
	{
		name: 'signed in through the service role',
		args: () => ['portal', 'praise', 'Nice.', null, '{"x":1}', 'ignored', 'ignored-hash', null, null],
		subject: () => stu
	},
	{ name: 'the rate limit', args: (h) => ['portal', 'bug', 'again', null, '{}', null, h, null, null], repeat: 6 }
];

/** What a submit call means: its answer, and the row it wrote, without ids, hashes or times. */
async function runCase(c: SubmitCase, phase: string): Promise<unknown[]> {
	const out: unknown[] = [];
	for (let i = 0; i < (c.repeat ?? 1); i += 1) {
		const args = c.args(`${phase}:${c.name}`);
		let answer: Json | string;
		try {
			answer = await db.asServiceRole(async (q) => (await q<{ r: Json }>(SUBMIT, args)).rows[0].r, c.subject?.().id ?? null);
		} catch (error) {
			answer = `raised: ${(error as Error).message}`;
		}
		if (typeof answer === 'object' && answer.ok) {
			const { rows } = await db.sql(
				`select user_id, app, context, kind, message, meta, contact, tried, screenshot_path,
				        reporter_hash is null as no_hash, status
				 from public.app_feedback where id = $1`,
				[answer.id]
			);
			out.push({ ok: true, keys: Object.keys(answer).sort(), row: rows[0] });
		} else {
			out.push(answer);
		}
	}
	return out;
}

type ListCase = [string, string, unknown[]];
const LIST_CASES: ListCase[] = [
	['no arguments', NARROW_BARE, []],
	['one app', NARROW, ['portal', null]],
	['an app with nothing', NARROW, ['nothing-here', null]],
	['a limit of one', NARROW, [null, 1]],
	['a limit of zero', NARROW, [null, 0]],
	['a limit too large', NARROW, [null, 5000]]
];
async function list(u: SeededUser | null, sql: string, args: unknown[]): Promise<Json[] | string> {
	try {
		if (!u) return (await db.sql<{ r: Json[] }>(sql, args)).rows[0].r;
		return await db.asUser(u.id, async (q) => (await q<{ r: Json[] }>(sql, args)).rows[0].r);
	} catch (error) {
		return `raised: ${(error as Error).message}`;
	}
}
const withoutHorizon = (rows: Json[] | string) =>
	typeof rows === 'string' ? rows : rows.map(({ horizon: _h, ...rest }) => rest);

const submitBefore = new Map<string, unknown[]>();
const listBefore = new Map<string, Json[] | string>();
const refusalsBefore: (Json[] | string)[] = [];

beforeAll(async () => {
	db = await startTestDb(PRE_0230);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	stu = await createUser(db, 'stu@boscotech.net', 'Stu Dent');
	other = await createUser(db, 'other@boscotech.net', 'Oth Er');

	// SEEDED THROUGH THE REAL PRE-0230 PATHS.
	oldRow = await db.asUser(stu.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.app_feedback (user_id, app, kind, message, meta)
			 values ($1, 'portal', 'bug', 'filed long before 0230', '{"route":"/"}'::jsonb) returning id`,
			[stu.id]
		);
		return rows[0].id;
	});
	// The window between the deploy and the apply: the new client's rung that
	// carries the choice in meta, through the deployed direct insert.
	oldMetaRow = await db.asUser(stu.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.app_feedback (user_id, app, kind, message, meta)
			 values ($1, 'portal', 'idea', 'a presentation engine', '{"horizon":"long_term","route":"/"}'::jsonb) returning id`,
			[stu.id]
		);
		return rows[0].id;
	});
	// And the same window on the anonymous path: the DEPLOYED function stores
	// meta verbatim, so the key is there to lift.
	oldAnonMetaRow = await db.asServiceRole(async (q) => {
		const { rows } = await q<{ r: Json }>(SUBMIT, ['portal', 'idea', 'big idea, signed out', null, '{"horizon":"long_term"}', null, 'seed-hash', null, null]);
		return rows[0].r.id;
	});

	// THE CORPUS, PUT TO THE DEPLOYED FUNCTIONS. The writes go first and the
	// console reads last, and after the apply the reads are compared before
	// the writes run again, so both phases read exactly the same rows.
	for (const c of CASES) submitBefore.set(c.name, await runCase(c, 'pre'));
	for (const [name, sql, args] of LIST_CASES) listBefore.set(name, await list(admin, sql, args));
	refusalsBefore.push(await list(stu, NARROW_BARE, []), await list(null, NARROW_BARE, []));

	await db.sql(SQL_0230);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the deployed corpus, case for case', () => {
	test('the corpus was not empty and covered both answers and refusals', () => {
		expect(listBefore.size).toBe(LIST_CASES.length);
		expect((listBefore.get('no arguments') as Json[]).length).toBeGreaterThan(2);
		const flat = [...submitBefore.values()].flat();
		expect(flat.filter((x) => typeof x === 'object' && (x as Json).ok)).not.toHaveLength(0);
		expect(flat).toContain('raised: Unknown feedback kind.');
		expect(flat).toContainEqual({ ok: false, reason: 'rate_limited' });
	});

	test.each(LIST_CASES)('the two-argument console read, %s: the same rows plus one horizon key', async (name, sql, args) => {
		const after = await list(admin, sql, args);
		const before = listBefore.get(name)!;
		expect(withoutHorizon(after)).toEqual(before);
		if (typeof after !== 'string') {
			for (const row of after) expect(['now', 'long_term']).toContain(row.horizon);
			if (typeof before !== 'string') for (const row of before) expect(row).not.toHaveProperty('horizon');
		}
	});

	test('the console read refuses a student and a missing session in the same words', async () => {
		expect([await list(stu, NARROW_BARE, []), await list(null, NARROW_BARE, [])]).toEqual(refusalsBefore);
		expect(refusalsBefore).toEqual(['raised: Only a site admin can read the feedback queue.', 'raised: You must be signed in.']);
	});

	test.each(CASES.map((c) => [c.name, c] as const))('app_feedback_submit, %s: the same answer and the same row', async (name, c) => {
		expect(await runCase(c, 'post')).toEqual(submitBefore.get(name));
	});
});

// ===========================================================================
describe('the rows already stored', () => {
	async function row(id: string) {
		return (await db.sql(`select horizon, meta from public.app_feedback where id = $1`, [id])).rows[0];
	}

	test('an old report reads now', async () => {
		expect((await row(oldRow)).horizon).toBe('now');
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.app_feedback where horizon = 'long_term'`
		);
		// Exactly the two rows the window wrote, and none of the corpus's.
		expect(rows[0].n).toBe(2);
	});

	test('a row that carried meta.horizon is lifted, on both paths, and its meta is untouched', async () => {
		expect(await row(oldMetaRow)).toEqual({ horizon: 'long_term', meta: { horizon: 'long_term', route: '/' } });
		expect(await row(oldAnonMetaRow)).toEqual({ horizon: 'long_term', meta: { horizon: 'long_term' } });
	});

	test('the column is NOT NULL, defaults to now, and refuses anything else', async () => {
		const { rows } = await db.sql(
			`select is_nullable, column_default from information_schema.columns
			 where table_schema = 'public' and table_name = 'app_feedback' and column_name = 'horizon'`
		);
		expect(rows[0].is_nullable).toBe('NO');
		expect(rows[0].column_default).toMatch(/^'now'/);
		const message = await refusal(() =>
			db.asUser(stu.id, (q) =>
				q(`insert into public.app_feedback (user_id, app, kind, message, horizon) values ($1, 'portal', 'bug', 'x', 'later')`, [stu.id])
			)
		);
		expect(message).toMatch(/app_feedback_horizon_check/);
	});
});

// ===========================================================================
describe('writing the horizon', () => {
	test('a signed-in reporter may set it on insert, through the deployed policy', async () => {
		const id = await db.asUser(stu.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.app_feedback (user_id, app, kind, message, horizon)
				 values ($1, 'portal', 'idea', 'later please', 'long_term') returning id`,
				[stu.id]
			);
			return rows[0].id;
		});
		expect((await db.sql(`select horizon from public.app_feedback where id = $1`, [id])).rows[0].horizon).toBe('long_term');
		// The author pin still holds: nobody files as somebody else.
		expect(
			await refusal(() =>
				db.asUser(stu.id, (q) =>
					q(`insert into public.app_feedback (user_id, app, kind, message, horizon) values ($1, 'portal', 'idea', 'x', 'long_term')`, [other.id])
				)
			)
		).toMatch(/row-level security/);
	});

	test('the anonymous path lifts meta.horizon into the column and strips the key', async () => {
		const cases: [string, string][] = [
			['{"horizon":"long_term","r":1}', 'long_term'],
			['{"horizon":" LONG_TERM "}', 'long_term'],
			['{"horizon":"banana"}', 'now'],
			['{"horizon":"now"}', 'now'],
			['{}', 'now']
		];
		for (const [meta, want] of cases) {
			const r = await db.asServiceRole(async (q) => (await q<{ r: Json }>(SUBMIT, ['portal', 'idea', `meta ${meta}`, null, meta, null, `lift:${meta}`, null, null])).rows[0].r);
			const { rows } = await db.sql(`select horizon, meta from public.app_feedback where id = $1`, [r.id]);
			expect(rows[0].horizon, meta).toBe(want);
			expect(rows[0].meta, meta).not.toHaveProperty('horizon');
		}
	});

	test('no client role can update the table; set_horizon is the only switch', async () => {
		expect(
			await refusal(() => db.asUser(stu.id, (q) => q(`update public.app_feedback set horizon = 'long_term' where user_id = $1`, [stu.id])))
		).toMatch(/permission denied/);
		const { rows } = await db.sql(
			`select has_table_privilege('authenticated', 'public.app_feedback', 'update') as auth,
			        has_table_privilege('anon', 'public.app_feedback', 'update') as anon`
		);
		expect(rows[0]).toEqual({ auth: false, anon: false });
	});

	test('set_horizon refuses a student, a missing session and anon', async () => {
		expect(await refusal(() => db.asUser(stu.id, (q) => q(SET, [oldRow, 'long_term'])))).toBe('Only a site admin can triage feedback.');
		expect(await refusal(() => db.sql(SET, [oldRow, 'long_term']))).toBe('You must be signed in.');
		expect(await refusal(() => db.asAnon((q) => q(SET, [oldRow, 'long_term'])))).toMatch(/permission denied for function/);
		expect((await db.sql(`select horizon from public.app_feedback where id = $1`, [oldRow])).rows[0].horizon).toBe('now');
	});

	test('an admin moves a report, and the review trail is not touched', async () => {
		await db.asUser(admin.id, (q) => q(`select public.app_feedback_set_status($1::uuid, 'seen')`, [oldRow]));
		const before = (await db.sql(`select status, reviewed_at, reviewed_by from public.app_feedback where id = $1`, [oldRow])).rows[0];
		const r = await db.asUser(admin.id, async (q) => (await q<{ r: Json }>(SET, [oldRow, ' LONG_TERM '])).rows[0].r);
		expect(r).toEqual({ ok: true, id: oldRow, horizon: 'long_term' });
		const after = (await db.sql(`select status, reviewed_at, reviewed_by, horizon from public.app_feedback where id = $1`, [oldRow])).rows[0];
		expect(after).toEqual({ ...before, horizon: 'long_term' });
		expect(await refusal(() => db.asUser(admin.id, (q) => q(SET, [oldRow, 'someday'])))).toBe('Horizon must be now or long_term.');
		expect(await refusal(() => db.asUser(admin.id, (q) => q(SET, [FAKE, 'now'])))).toBe('That feedback does not exist.');
		await db.asUser(admin.id, (q) => q(SET, [oldRow, 'now']));
	});
});

// ===========================================================================
describe('the console reads', () => {
	test('the wide form filters on the horizon; the narrow returns both (the positive control)', async () => {
		const long = (await list(admin, WIDE, [null, 500, 'long_term'])) as Json[];
		const now = (await list(admin, WIDE, [null, 500, 'now'])) as Json[];
		const both = (await list(admin, WIDE, [null, 500, null])) as Json[];
		const narrow = (await list(admin, NARROW, [null, 500])) as Json[];
		expect(long.length).toBeGreaterThan(0);
		expect(now.length).toBeGreaterThan(0);
		expect(long.every((r) => r.horizon === 'long_term')).toBe(true);
		expect(now.every((r) => r.horizon === 'now')).toBe(true);
		expect(both).toEqual(narrow);
		expect(narrow.length).toBe(long.length + now.length);
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.app_feedback where horizon = 'long_term'`);
		expect(long.length).toBe(rows[0].n);
	});

	test('the wide form refuses a bad horizon, a student and a missing session', async () => {
		expect(await list(admin, WIDE, [null, 10, 'later'])).toBe('raised: Horizon must be now or long_term.');
		expect(await list(stu, WIDE, [null, 10, 'now'])).toBe('raised: Only a site admin can read the feedback queue.');
		expect(await list(null, WIDE, [null, 10, 'now'])).toBe('raised: You must be signed in.');
	});

	test('no payload binds to both: the wide form has no defaults, the narrow keeps its two', async () => {
		expect(await overloads(db, 'app_feedback_admin_list')).toBe(2);
		const { rows } = await db.sql<{ sig: string; d: number }>(
			`select p.oid::regprocedure::text as sig, p.pronargdefaults as d from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'app_feedback_admin_list' order by p.pronargs`
		);
		expect(rows).toEqual([
			{ sig: 'app_feedback_admin_list(text,integer)', d: 2 },
			{ sig: 'app_feedback_admin_list(text,integer,text)', d: 0 }
		]);
		// A call naming only the new key cannot reach either form.
		expect(await refusal(() => db.asUser(admin.id, (q) => q(`select public.app_feedback_admin_list(p_horizon => 'now')`)))).toMatch(
			/does not exist/
		);
	});
});

// ===========================================================================
describe('the grants, and a second paste', () => {
	test('one submit, one set_horizon; anon executes none of the four; submit stays the service role\'s', async () => {
		expect(await overloads(db, 'app_feedback_submit')).toBe(1);
		expect(await overloads(db, 'app_feedback_set_horizon')).toBe(1);
		for (const fn of [SUBMIT_SIG, 'app_feedback_admin_list(text, integer)', 'app_feedback_admin_list(text, integer, text)', 'app_feedback_set_horizon(uuid, text)']) {
			expect(await canExecute(db, 'anon', fn), fn).toBe(false);
		}
		for (const fn of ['app_feedback_admin_list(text, integer)', 'app_feedback_admin_list(text, integer, text)', 'app_feedback_set_horizon(uuid, text)']) {
			expect(await canExecute(db, 'authenticated', fn), fn).toBe(true);
		}
		expect(await canExecute(db, 'authenticated', SUBMIT_SIG)).toBe(false);
		expect(await canExecute(db, 'service_role', SUBMIT_SIG)).toBe(true);
	});

	test('the lift runs once: an admin\'s later move survives a re-paste, and nothing else moves', async () => {
		await db.asUser(admin.id, (q) => q(SET, [oldMetaRow, 'now']));
		const fp = await catalogFingerprint(db);
		const counts = (await db.sql(`select horizon, count(*)::int as n from public.app_feedback group by 1 order by 1`)).rows;
		await db.sql(SQL_0230);
		expect((await db.sql(`select horizon from public.app_feedback where id = $1`, [oldMetaRow])).rows[0].horizon).toBe('now');
		expect((await db.sql(`select horizon, count(*)::int as n from public.app_feedback group by 1 order by 1`)).rows).toEqual(counts);
		expect(await catalogFingerprint(db)).toBe(fp);
	});
});
