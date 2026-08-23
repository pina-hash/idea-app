// tests/vanguard-feedback-paths.test.ts
//
// THE TWO FEEDBACK PATHS MUST STAY APART, AND THE TABLE IS WHAT SAYS SO.
//
// VANGUARD renders no layout, so it cannot mount the shell's report control and
// cannot use the browser Supabase client the control writes through. The page
// therefore posts: a signed-in student to /api/vanguard-feedback, which performs
// the RLS-scoped insert with the caller's OWN server client, and a signed-out
// one to /api/feedback, which files under the service key with no JWT.
//
// AN ENDPOINT ANSWERING 200 IS A CLAIM ABOUT THE ENDPOINT, NOT ABOUT THE ROW.
// Every assertion below reads the row back out of a REAL Postgres with the REAL
// migration files applied, through the same role switch PostgREST performs. What
// fails silently without it:
//
//   1. A SIGNED-IN ROW LANDING AUTHORLESS. If the new route ever reached for a
//      service-role client, or the page posted to the anonymous endpoint, the
//      box would still say "Sent", the row would still appear in the queue, and
//      the only difference would be that nobody could ever follow it up.
//   2. THE ROUTE ASSERTING AN AUTHOR. `user_id` comes from `claims.sub` and
//      there is no body field for one. A route that started trusting the body
//      would look identical from the client and would let a caller file as
//      somebody else.
//   3. THE DATABASE NOT BEING THE ONE DECIDING. The proof that 0053's WITH
//      CHECK is what pins the author is that the SAME insert, run as a
//      different caller, is REFUSED — not that our own code remembered to check.
//
// The anonymous half is driven the way tests/feedback-anonymous-route.test.ts
// drives it: only the supabase-js client CONSTRUCTION is stood in for, and the
// route's own argument object goes verbatim into the real SQL function as
// service_role.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import type { SupabaseClient } from '@supabase/supabase-js';

const hooks = vi.hoisted(() => ({
	rpc: null as null | ((fn: string, args: Record<string, unknown>) => Promise<unknown>)
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		rpc: (fn: string, args: Record<string, unknown>) => {
			if (!hooks.rpc) throw new Error('no rpc stand-in installed');
			return hooks.rpc(fn, args);
		}
	})
}));

const { POST: signedInPost } = await import('../src/routes/api/vanguard-feedback/+server');
const { POST: anonymousPost } = await import('../src/routes/api/feedback/+server');

/** 0126's chain, exactly as the two existing feedback suites apply it. */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0126_app_feedback_anonymous.sql'
];

const SUBMIT = `select public.app_feedback_submit(
	p_app => $1,
	p_kind => $2,
	p_message => $3,
	p_context => $4,
	p_meta => $5::jsonb,
	p_contact => $6,
	p_address_hash => $7
) as result`;

let db: TestDb;
let student: SeededUser;
let other: SeededUser;

/**
 * The caller's own server client, standing in for `locals.supabase`.
 *
 * IT INSERTS WHATEVER THE ROUTE HANDED IT, column for column, as
 * `authenticated` with `auth.uid()` set — so the row the route composed meets
 * the real policy. A column the route invented would reach the real table and
 * be refused there, which is the point: nothing here inspects or corrects the
 * row on the way past.
 */
function clientAs(userId: string): SupabaseClient {
	return {
		from: (table: string) => ({
			insert: async (row: Record<string, unknown>) => {
				const cols = Object.keys(row);
				const text =
					`insert into public.${table} (${cols.map((c) => `"${c}"`).join(', ')}) values (` +
					cols.map((c, i) => (c === 'meta' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ') +
					')';
				const params = cols.map((c) => (c === 'meta' ? JSON.stringify(row[c]) : row[c]));
				return db.asUser(userId, async (q) => {
					try {
						await q(text, params);
						return { error: null };
					} catch (e) {
						const err = e as { message?: string; code?: string };
						return { error: { message: err.message ?? 'insert failed', code: err.code } };
					}
				});
			}
		})
	} as unknown as SupabaseClient;
}

function request(body: unknown): Request {
	return new Request('http://localhost/api/vanguard-feedback', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

/** The meta the injected box assembles, as it arrives from the page. */
const VANGUARD_META = {
	route: '/vanguard',
	path: '/vanguard/',
	role: 'student',
	section: null,
	viewport: '1512x945',
	userAgent: 'Mozilla/5.0 (X11; CrOS x86_64) Chrome/141.0.0.0 Safari/537.36',
	at: '2026-08-23T04:00:00.000Z',
	build: { value: 'abc1234', source: 'git-commit', means: 'The git commit…', historyComplete: true },
	gameVersion: '212',
	mode: 'hardcore',
	sector: 4,
	screen: 'play'
};

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	student = await createUser(db, 'wren.hollis@boscotech.net', 'Wren Hollis');
	other = await createUser(db, 'tobi.marsh@boscotech.net', 'Tobi Marsh');
	hooks.rpc = async (fn: string, args: Record<string, unknown>) => {
		expect(fn).toBe('app_feedback_submit');
		return db.asServiceRole(async (q) => {
			const { rows } = await q<{ result: unknown }>(SUBMIT, [
				args.p_app,
				args.p_kind,
				args.p_message,
				args.p_context,
				JSON.stringify(args.p_meta ?? {}),
				args.p_contact,
				args.p_address_hash
			]);
			return { data: rows[0].result, error: null };
		});
	};
	process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-not-a-real-credential';
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

type Row = {
	id: string;
	user_id: string | null;
	app: string;
	context: string | null;
	kind: string;
	message: string;
	meta: Record<string, unknown>;
	reporter_hash: string | null;
};

const rowsFor = async (message: string): Promise<Row[]> =>
	(
		await db.sql<Row>(
			`select id, user_id, app, context, kind, message, meta, reporter_hash
			 from public.app_feedback where message = $1`,
			[message]
		)
	).rows;

describe('a signed-in VANGUARD report is attributable to the account', () => {
	const MESSAGE = 'The hardcore boss in sector 4 spawns inside the wall.';

	it('lands one row carrying the caller as its author', async () => {
		const res = await signedInPost({
			request: request({ kind: 'bug', message: MESSAGE, context: '/vanguard', meta: VANGUARD_META }),
			locals: { supabase: clientAs(student.id), claims: { sub: student.id } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });

		const rows = await rowsFor(MESSAGE);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		// THE ROW CARRIES AN ACCOUNT. This is the whole difference between the
		// two paths, and it is read off the table, not off the response.
		expect(row.user_id).toBe(student.id);
		expect(row.reporter_hash).toBeNull();
		expect(row.app).toBe('vanguard');
		expect(row.context).toBe('/vanguard');
		expect(row.kind).toBe('bug');
	});

	it('carries the captured context nobody had to type', async () => {
		const row = (await rowsFor(MESSAGE))[0];
		expect(row.meta.route).toBe('/vanguard');
		expect(row.meta.path).toBe('/vanguard/');
		expect(row.meta.viewport).toBe('1512x945');
		expect((row.meta.build as { value: string }).value).toBe('abc1234');
		// The three the portal could not know without asking the game.
		expect(row.meta.gameVersion).toBe('212');
		expect(row.meta.mode).toBe('hardcore');
		expect(row.meta.sector).toBe(4);
	});

	it('ignores a user id in the body and files under the session', async () => {
		const MSG = 'Filed while trying to name somebody else as the author.';
		const res = await signedInPost({
			request: request({
				kind: 'other',
				message: MSG,
				context: '/vanguard',
				meta: {},
				// There is no such field on the route. If one ever appeared, this is
				// the assertion that would redden.
				user_id: other.id
			}),
			locals: { supabase: clientAs(student.id), claims: { sub: student.id } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		expect(res.status).toBe(200);
		const rows = await rowsFor(MSG);
		expect(rows).toHaveLength(1);
		expect(rows[0].user_id).toBe(student.id);
		expect(rows[0].user_id).not.toBe(other.id);
	});

	it('is the DATABASE that pins the author: the same row as another caller is refused', async () => {
		const MSG = 'The same insert, executed by somebody who is not its author.';
		// Identical route call, except the client is a DIFFERENT signed-in caller
		// than the claims say. 0053's WITH CHECK compares against the JWT, so the
		// insert cannot land — which is what makes the route's own honesty
		// unnecessary rather than merely present.
		const res = await signedInPost({
			request: request({ kind: 'bug', message: MSG, context: '/vanguard', meta: {} }),
			locals: { supabase: clientAs(other.id), claims: { sub: student.id } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ ok: false, reason: 'server_refused' });
		expect(await rowsFor(MSG)).toHaveLength(0);
	});

	it('refuses a signed-out caller rather than filing them anonymously', async () => {
		const MSG = 'Posted to the signed-in route with no session at all.';
		const res = await signedInPost({
			request: request({ kind: 'bug', message: MSG, context: '/vanguard', meta: {} }),
			locals: { supabase: clientAs(student.id), claims: null }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ ok: false, reason: 'unauthorized' });
		expect(await rowsFor(MSG)).toHaveLength(0);
	});
});

describe('a signed-out VANGUARD report goes to the anonymous route, unchanged', () => {
	const MESSAGE = 'The horn key does nothing on the school Chromebook.';

	it('lands one AUTHORLESS row carrying a reporter hash instead', async () => {
		const res = await anonymousPost({
			request: new Request('http://localhost/api/feedback', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					app: 'vanguard',
					context: '/vanguard',
					kind: 'bug',
					message: MESSAGE,
					meta: { ...VANGUARD_META, role: null },
					contact: 'ask me in 4th'
				})
			}),
			getClientAddress: () => '203.0.113.42'
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });

		const rows = await rowsFor(MESSAGE);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		// NO ACCOUNT, BY CONSTRUCTION: the admin client carries no JWT, so
		// auth.uid() inside the function is null and 0126 takes its anonymous
		// branch no matter who is holding the page.
		expect(row.user_id).toBeNull();
		expect(row.reporter_hash).not.toBeNull();
		expect(row.app).toBe('vanguard');
		expect(row.context).toBe('/vanguard');
		// The same captured context reaches the table on this path too.
		expect(row.meta.gameVersion).toBe('212');
		expect(row.meta.sector).toBe(4);
	});
});

describe('the evidence, read back out of the table', () => {
	it('shows one row per path, and only the signed-in one carries an account', async () => {
		const { rows } = await db.sql<{
			user_id: string | null;
			reporter_hash: string | null;
			app: string;
			message: string;
		}>(
			`select user_id, reporter_hash, app, message from public.app_feedback
			 where app = 'vanguard' order by created_at`
		);
		const withAccount = rows.filter((r) => r.user_id !== null);
		const withHash = rows.filter((r) => r.reporter_hash !== null);
		// Both directions, per the verification standard: what is PRESENT beside
		// what is ABSENT. Three rows landed in all -- two signed in (the report,
		// and the one that tried to name another author) and one anonymous -- and
		// the two refusals (wrong caller, no session) left nothing behind.
		expect(rows).toHaveLength(3);
		expect(withAccount).toHaveLength(2);
		expect(withHash).toHaveLength(1);
		// And no row is ever both: 0126's XOR check makes that unrepresentable.
		expect(rows.filter((r) => r.user_id !== null && r.reporter_hash !== null)).toHaveLength(0);
	});
});
