// tests/feedback-anonymous-route.test.ts
//
// THE ANONYMOUS REPORT ROUTE, driven as the REAL shipped POST handler against a
// REAL Postgres with the REAL 0126 applied.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. Every claim in here fails
// INVISIBLY, which is the bar this repo sets for an automated test:
//
//   1. A BODY-SUPPLIED ADDRESS LOOKS EXACTLY LIKE A REAL ONE once it is a hash.
//      If the route ever passed `body.address_hash` through, reports would keep
//      arriving, the column would keep filling, the console would render
//      normally -- and the rate limit would be keyed on a value the
//      rate-limited party chose, which is no rate limit at all. Nothing on any
//      screen changes.
//   2. SO WOULD A HEADER. `x-forwarded-for` is a string any caller can set. A
//      route reading one directly behaves identically in every manual test,
//      because a browser does not send one and a proxy sends the right value;
//      it fails only against the one caller it exists to stop.
//   3. THE CAP MUST REFUSE, NOT FAIL. A cap that comes back looking like a
//      transport failure is retried with backoff, five times, arriving at the
//      same answer -- and the person is told their report is being re-sent.
//   4. THE SIGNED-IN PATH MUST NOT HAVE MOVED. This bundle deliberately leaves
//      0053's direct insert alone; a signed-in report quietly starting to go
//      through this route would land AUTHORLESS, and an authorless row is a row
//      nobody can follow up.
//
// WHAT IS MOCKED AND WHAT IS NOT. Only the supabase-js client construction: the
// stand-in's `.rpc(name, args)` forwards the route's OWN argument object,
// verbatim and unread, into a real named-parameter call to the real SQL
// function, executed as `service_role` -- the role the real key authenticates
// as. It asserts the function NAME and nothing about the arguments, so the
// route cannot pass by sending something the database would have refused.
// Postgres decides; the test asks.

import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { FEEDBACK_MAX_BODY_BYTES, feedbackWriter } from '../src/lib/feedback/feedback';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The route builds its own admin client, so the client CONSTRUCTOR is what has
 * to be stood in for. Declared through `vi.hoisted` because `vi.mock` is
 * hoisted above every import and cannot see a plain module-level binding.
 */
const hooks = vi.hoisted(() => ({
	rpc: null as null | ((fn: string, args: Record<string, unknown>) => Promise<unknown>),
	/** Every argument object the route handed the client, in order. */
	calls: [] as { fn: string; args: Record<string, unknown> }[]
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		rpc: (fn: string, args: Record<string, unknown>) => {
			hooks.calls.push({ fn, args });
			if (!hooks.rpc) throw new Error('no rpc stand-in installed');
			return hooks.rpc(fn, args);
		}
	})
}));

const { POST } = await import('../src/routes/api/feedback/+server');

/** 0126's chain, exactly as tests/feedback-anonymous.test.ts applies it. */
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
let salt: string;
let student: SeededUser;

/**
 * THE EXPECTED HASH IS COMPUTED FROM THE SALT AND node's md5, not from anything
 * the route or the function produced. The salt is read straight off the table
 * as the connection owner (nothing else can read it, which is the point of it).
 */
function expectedHash(address: string): string {
	return createHash('md5').update(salt + address).digest('hex');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	const { rows } = await db.sql<{ salt: string }>(
		`select salt from public.app_feedback_reporter_secret limit 1`
	);
	salt = rows[0].salt;
	student = await createUser(db, 'wren.hollis@boscotech.net', 'Wren Hollis');
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

beforeEach(async () => {
	hooks.calls.length = 0;
	process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-not-a-real-credential';
	// The stand-in: the route's own argument object, into the real function, as
	// the role the real key authenticates as.
	hooks.rpc = async (fn: string, args: Record<string, unknown>) => {
		expect(fn).toBe('app_feedback_submit');
		return db.asServiceRole(async (q) => {
			try {
				const { rows } = await q<{ result: unknown }>(SUBMIT, [
					args.p_app,
					args.p_kind,
					args.p_message,
					args.p_context ?? null,
					JSON.stringify(args.p_meta ?? {}),
					args.p_contact ?? null,
					args.p_address_hash ?? null
				]);
				return { data: rows[0].result, error: null };
			} catch (e) {
				// PostgREST surfaces a raised exception as an error object with a
				// code, not a throw, which is what the route branches on.
				return { data: null, error: { message: (e as Error).message, code: 'P0001' } };
			}
		});
	};
	await db.sql(`delete from public.app_feedback`);
	await db.sql(`delete from public.app_feedback_rate`);
});

afterEach(() => {
	hooks.rpc = null;
});

interface CallOptions {
	address?: string;
	headers?: Record<string, string>;
	raw?: string;
	contentLength?: string;
}

/** Calls the REAL route handler the way SvelteKit would. */
function callRoute(body: unknown, options: CallOptions = {}): Promise<Response> {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		...(options.headers ?? {})
	};
	if (options.contentLength !== undefined) headers['content-length'] = options.contentLength;
	return (POST as unknown as (event: unknown) => Promise<Response>)({
		request: new Request('http://localhost/api/feedback', {
			method: 'POST',
			headers,
			body: options.raw ?? JSON.stringify(body)
		}),
		getClientAddress: () => options.address ?? '198.51.100.4'
	});
}

const REPORT = {
	app: 'portal',
	kind: 'bug',
	message: 'Sign in bounces me straight back to the home page.',
	context: '/',
	meta: { route: '/', path: '/' }
};

function storedRows() {
	return db
		.sql<{
			user_id: string | null;
			reporter_hash: string | null;
			contact: string | null;
			message: string;
			app: string;
			context: string | null;
		}>(
			`select user_id, reporter_hash, contact, message, app, context
			   from public.app_feedback order by created_at`
		)
		.then((r) => r.rows);
}

// ---------------------------------------------------------------------------
// 1. THE ADDRESS COMES FROM THE REQUEST, NOT FROM ANYTHING IN IT
// ---------------------------------------------------------------------------

describe('where the rate-limit key comes from', () => {
	it('files an anonymous report and stores the digest of the CONNECTION address', async () => {
		const res = await callRoute(REPORT, { address: '198.51.100.4' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });

		const rows = await storedRows();
		expect(rows).toHaveLength(1);
		expect(rows[0].user_id).toBeNull();
		expect(rows[0].reporter_hash).toBe(expectedHash('198.51.100.4'));
		// The address itself is nowhere near the table.
		expect(rows[0].reporter_hash).not.toContain('198.51.100');
	});

	it('IGNORES a hash supplied in the body, and the same test sees the real one', async () => {
		// Four spellings, because the field a future body might use is not
		// knowable: the claim is that NOTHING in the body reaches the parameter,
		// not that one particular key is filtered out.
		const forged = {
			...REPORT,
			address_hash: 'attacker-chosen-key',
			reporter_hash: 'attacker-chosen-key',
			p_address_hash: 'attacker-chosen-key',
			address: '10.0.0.1'
		};
		const res = await callRoute(forged, { address: '203.0.113.9' });
		expect(res.status).toBe(200);

		const rows = await storedRows();
		expect(rows).toHaveLength(1);
		// THE POSITIVE CONTROL IS THE SAME ASSERTION PAIR, ON THE SAME ROW: the
		// forged value is absent AND the real one is present. Either half alone
		// passes on a route that stored nothing at all.
		expect(rows[0].reporter_hash).not.toBe(expectedHash('attacker-chosen-key'));
		expect(rows[0].reporter_hash).not.toBe(expectedHash('10.0.0.1'));
		expect(rows[0].reporter_hash).toBe(expectedHash('203.0.113.9'));

		// And the parameter the route actually sent was the address, unhashed:
		// the salting happens inside the definer function, so a route that
		// hashed it itself would be a route that could choose the stored value.
		expect(hooks.calls).toHaveLength(1);
		expect(hooks.calls[0].args.p_address_hash).toBe('203.0.113.9');
	});

	it('IGNORES a forged forwarding header, which is the rejected alternative', async () => {
		// THE MUTATION THIS PAIRS WITH: point the route at a header instead of
		// getClientAddress(). Every other test in this file still passes; this
		// one reddens, which is the whole reason it is written separately.
		const res = await callRoute(REPORT, {
			address: '203.0.113.9',
			headers: {
				'x-forwarded-for': '10.10.10.10',
				'x-real-ip': '10.10.10.11',
				'cf-connecting-ip': '10.10.10.12',
				forwarded: 'for=10.10.10.13'
			}
		});
		expect(res.status).toBe(200);

		const rows = await storedRows();
		for (const forged of ['10.10.10.10', '10.10.10.11', '10.10.10.12', '10.10.10.13']) {
			expect(rows[0].reporter_hash).not.toBe(expectedHash(forged));
		}
		expect(rows[0].reporter_hash).toBe(expectedHash('203.0.113.9'));
	});

	it('counts one connection as one reporter however the body labels itself', async () => {
		// Five accepted (0126's cap), each claiming a different identity in the
		// body, all from one connection.
		for (let i = 0; i < 5; i += 1) {
			const res = await callRoute(
				{ ...REPORT, message: `report ${i}`, address_hash: `pretend-${i}` },
				{ address: '192.0.2.77' }
			);
			expect([i, await res.json()]).toEqual([i, { ok: true }]);
		}
		const sixth = await callRoute(
			{ ...REPORT, message: 'report 5', address_hash: 'pretend-5' },
			{ address: '192.0.2.77' }
		);
		// 0126'S OWN WORD, PASSED THROUGH AS IT STANDS.
		expect(await sixth.json()).toEqual({ ok: false, reason: 'rate_limited' });
		expect(sixth.status).toBe(200);

		// A refused call writes nothing, so the window cannot renew itself.
		expect(await storedRows()).toHaveLength(5);

		// POSITIVE CONTROL: a different connection is a different bucket, so the
		// five above are a cap and not a dead route.
		const other = await callRoute(REPORT, { address: '192.0.2.78' });
		expect(await other.json()).toEqual({ ok: true });
		expect(await storedRows()).toHaveLength(6);
	});
});

// ---------------------------------------------------------------------------
// 2. WHAT IT CARRIES, AND WHAT IT REFUSES
// ---------------------------------------------------------------------------

describe('what the route sends and what it will not', () => {
	it('carries the message, the app, the context, the meta and the optional contact', async () => {
		const res = await callRoute({
			...REPORT,
			contact: '  ask me in 4th  ',
			meta: { route: '/', viewport: '1440x900' }
		});
		expect(await res.json()).toEqual({ ok: true });
		const rows = await storedRows();
		expect(rows[0].app).toBe('portal');
		expect(rows[0].context).toBe('/');
		expect(rows[0].contact).toBe('ask me in 4th');
		expect(rows[0].message).toBe('Sign in bounces me straight back to the home page.');
	});

	it('takes a report with no contact at all, which is the ordinary case', async () => {
		await callRoute({ ...REPORT, contact: '   ' });
		const rows = await storedRows();
		expect(rows).toHaveLength(1);
		expect(rows[0].contact).toBeNull();
	});

	it('caps the body BEFORE parsing it, as a refusal and not a failure', async () => {
		const oversized = JSON.stringify({ ...REPORT, meta: { pad: 'x'.repeat(30_000) } });
		expect(oversized.length).toBeGreaterThan(FEEDBACK_MAX_BODY_BYTES);
		const res = await callRoute(null, { raw: oversized });
		expect(res.status).toBe(413);
		// A `reason` IS the signal the client reads as "considered, do not
		// retry". A body with none would be re-sent with backoff.
		expect(await res.json()).toEqual({ ok: false, reason: 'body_too_large' });
		// Nothing was written, and nothing was even asked of the database.
		expect(hooks.calls).toHaveLength(0);
		expect(await storedRows()).toHaveLength(0);

		// POSITIVE CONTROL: the same shape under the cap lands, so the refusal
		// above is the cap rather than a route that refuses everything.
		const under = JSON.stringify({ ...REPORT, meta: { pad: 'x'.repeat(100) } });
		expect(under.length).toBeLessThan(FEEDBACK_MAX_BODY_BYTES);
		const ok = await callRoute(null, { raw: under });
		expect(await ok.json()).toEqual({ ok: true });
		expect(await storedRows()).toHaveLength(1);
	});

	it('does not trust a declared content-length in either direction', async () => {
		// Understated: the real bytes are what count.
		const oversized = JSON.stringify({ ...REPORT, meta: { pad: 'x'.repeat(30_000) } });
		const lying = await callRoute(null, { raw: oversized, contentLength: '12' });
		expect(lying.status).toBe(413);
		expect(await storedRows()).toHaveLength(0);

		// Overstated: an honest small body with an absurd declared length is
		// refused early, which is the point of checking the header at all.
		const early = await callRoute(REPORT, { contentLength: String(FEEDBACK_MAX_BODY_BYTES + 1) });
		expect(early.status).toBe(413);
		expect(hooks.calls).toHaveLength(0);
	});

	it('refuses a body that is not a JSON object, and an unknown kind', async () => {
		expect((await callRoute(null, { raw: 'not json at all' })).status).toBe(400);
		expect((await callRoute(null, { raw: '[1,2,3]' })).status).toBe(400);
		expect((await callRoute({ ...REPORT, kind: 'complaint' })).status).toBe(400);
		expect((await callRoute({ ...REPORT, app: '  ' })).status).toBe(400);
		expect(await storedRows()).toHaveLength(0);
		// POSITIVE CONTROL on the same run.
		expect(await (await callRoute(REPORT)).json()).toEqual({ ok: true });
	});

	it('refuses an empty message as a refusal the person can act on', async () => {
		const res = await callRoute({ ...REPORT, message: '   \n\t  ' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: false, reason: 'message_empty' });
		expect(await storedRows()).toHaveLength(0);
	});

	it('answers not_configured, once, when the service key is absent', async () => {
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
		const res = await callRoute(REPORT);
		expect(res.status).toBe(503);
		// CONSIDERED, so the client reports it once instead of backing off: a
		// missing environment variable does not fix itself in eight seconds.
		expect(await res.json()).toEqual({ ok: false, reason: 'not_configured' });
		expect(hooks.calls).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 3. THE SIGNED-IN PATH DID NOT MOVE
// ---------------------------------------------------------------------------

/**
 * PostgREST's `.from(table).insert(row)`, translated to SQL and run as the
 * caller through the same role switch PostgREST performs, so 0053's own policy
 * is what decides whether the row lands.
 */
function tableClientFor(userId: string) {
	return {
		from(table: string) {
			return {
				async insert(row: Record<string, unknown>) {
					const names = Object.keys(row);
					const cols = names.join(', ');
					const params = names.map((_, i) => `$${i + 1}`).join(', ');
					return db.asUser(userId, async (q) => {
						try {
							await q(`insert into public.${table} (${cols}) values (${params})`,
								names.map((n) => {
									const value = row[n];
									return value !== null && typeof value === 'object'
										? JSON.stringify(value)
										: value;
								})
							);
							return { error: null };
						} catch (e) {
							return { error: { message: (e as Error).message, code: '42501' } };
						}
					});
				}
			};
		}
	} as unknown as SupabaseClient;
}

describe('a signed-in report still goes the old way', () => {
	it('writes straight to the table, lands attributable, and makes no request', async () => {
		// THE MEASUREMENT, not a reading of the code: any fetch at all fails the
		// test, so a signed-in write that quietly started using the route (and
		// would therefore land AUTHORLESS) cannot pass.
		const realFetch = globalThis.fetch;
		let fetches = 0;
		globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
			fetches += 1;
			return realFetch(...args);
		}) as typeof fetch;
		try {
			const write = feedbackWriter(tableClientFor(student.id), student.id);
			expect(write).not.toBeNull();
			const result = await write!({
				app: 'portal',
				context: '/notebook',
				kind: 'bug',
				message: 'The plate switch is hard to hit on a phone.',
				meta: { route: '/notebook' }
			});
			expect(result).toEqual({ error: null, retryable: false });
			expect(fetches).toBe(0);
		} finally {
			globalThis.fetch = realFetch;
		}

		const rows = await storedRows();
		expect(rows).toHaveLength(1);
		// ATTRIBUTABLE, and carrying no address hash: 0126's XOR check is what
		// makes "an account beside an address" unrepresentable.
		expect(rows[0].user_id).toBe(student.id);
		expect(rows[0].reporter_hash).toBeNull();

		// POSITIVE CONTROL on the same fixture: the anonymous path, through the
		// route, produces the mirror-image row.
		await callRoute(REPORT, { address: '198.51.100.4' });
		const both = await storedRows();
		expect(both).toHaveLength(2);
		const anon = both.find((r) => r.user_id === null);
		expect(anon?.reporter_hash).toBe(expectedHash('198.51.100.4'));
	});

	it('hands a signed-out caller the anonymous writer instead of nothing', async () => {
		// The reason this bundle exists: `feedbackWriter` used to answer null
		// with no session, which is what removed the control from the sign-in
		// page -- the one page where a broken sign-in can be reported.
		expect(feedbackWriter(tableClientFor(student.id), null)).not.toBeNull();
		expect(feedbackWriter(null, null)).not.toBeNull();
		// And null is still reachable, because absence is still the mechanism
		// for a surface with nothing to write through.
		expect(feedbackWriter(null, null, { allowAnonymous: false })).toBeNull();
	});
});
