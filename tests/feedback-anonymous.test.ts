// tests/feedback-anonymous.test.ts
//
// 0126: an authorless feedback row, rate limited, written by one service-role
// function.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE, per this repo's rule that
// automated tests are for guarantees whose regression is SILENT. Every claim
// here fails invisibly:
//
//   1. THE GRANT IS THE WHOLE DESIGN. The address hash is a PARAMETER, so a
//      caller that can reach this function can choose its own rate-limit key and
//      the limit becomes decoration. Nothing on any screen looks different when
//      `authenticated` gains execute on it; the box still works, the reports
//      still arrive, and the cap simply stops meaning anything.
//   2. THE ADDRESS MUST NOT REACH THE TABLE. A column that quietly starts
//      holding a raw address renders nowhere, breaks nothing, and is a log of
//      who was where for as long as it goes unnoticed.
//   3. THE DEPLOYED WRITE PATH MUST SURVIVE THE WIDENING. This bundle changes no
//      client code, so the FeedbackBox that is deployed right now keeps inserting
//      through 0053's policy. If dropping the NOT NULL or restating the policy
//      broke that, it would break in production and nowhere else.
//   4. THE OWN-ROW CHECK MUST NOT HAVE LOOSENED WITH IT. "user_id is nullable
//      now" is exactly the kind of change that turns an own-row WITH CHECK into
//      one a client can walk past by sending nothing, and a client filing as
//      nobody looks identical to a client filing as itself.
//
// Everything runs against a REAL embedded Postgres with the REAL migration files
// applied unmodified, driven through the same role switch PostgREST performs, so
// what is asserted is the grants, the policies and the function bodies the repo
// actually ships.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * The feedback chain: profiles and the role derivation, 0053's box, 0067's admin
 * tier (0053's read policy calls is_teacher(), which since 0067 IS is_admin()),
 * and the migration under test.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0126_app_feedback_anonymous.sql'
];

/**
 * The same chain plus the classroom migrations 0085 needs, so the triage console
 * read that is DEPLOYED TODAY can be put to a table that now contains an
 * authorless row. Its own bundle will give such a row a name on screen; what
 * matters here is that it does not fall over before then.
 */
const CONSOLE_CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0126_app_feedback_anonymous.sql',
	'0137_anon_execute_sweep.sql'
];

/**
 * The same chain with 0127 over the top: the console read that gives an
 * authorless row a name on screen, which 0126 deliberately left to a later
 * bundle. Kept as a SEPARATE chain from CONSOLE_CHAIN so both states are
 * asserted -- a deployment sitting between the two is a real state, and the
 * console's own fallback is written for it.
 */
const CONSOLE_CHAIN_0127 = [...CONSOLE_CHAIN, '0127_app_feedback_console_anonymous.sql'];

/** The RPC, called the way a service-role request would call it. */
const SUBMIT = `select public.app_feedback_submit(
	p_app => $1,
	p_kind => $2,
	p_message => $3,
	p_context => $4,
	p_meta => $5::jsonb,
	p_contact => $6,
	p_address_hash => $7
) as result`;

interface SubmitResult {
	ok: boolean;
	reason?: string;
	id?: string;
}

let db: TestDb;
let student: SeededUser;

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	student = await createUser(db, 'student@boscotech.net', 'A Student');
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/** One anonymous submission from `address`, as our own server would make it. */
async function submitAnon(
	address: string,
	message: string,
	contact: string | null = null
): Promise<SubmitResult> {
	return db.asServiceRole(async (q) => {
		const { rows } = await q<{ result: SubmitResult }>(SUBMIT, [
			'portal',
			'bug',
			message,
			'/dashboard',
			'{}',
			contact,
			address
		]);
		return rows[0].result;
	});
}

async function countFeedback(): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(`select count(*) as n from public.app_feedback`);
	return Number(rows[0].n);
}

async function countRate(): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*) as n from public.app_feedback_rate`
	);
	return Number(rows[0].n);
}

describe('0126 applies like a migration in this repo', () => {
	it('re-applies cleanly, and leaves exactly one of everything it creates', async () => {
		// Re-pasting a migration is ordinary here -- someone re-runs it, or a
		// first attempt failed partway. A file that only works once fails exactly
		// then, with the schema half-built.
		const text = readFileSync(
			new URL('../supabase/migrations/0126_app_feedback_anonymous.sql', import.meta.url),
			'utf8'
		);
		await expect(db.sql(text)).resolves.toBeTruthy();

		// THE SIGNATURE TRAP, asserted rather than assumed: one row, one arity.
		const { rows: procs } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'app_feedback_submit'`
		);
		expect(Number(procs[0].n)).toBe(1);

		// And one constraint, not one per apply.
		const { rows: cons } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_constraint
			 where conrelid = 'public.app_feedback'::regclass
				 and conname = 'app_feedback_author_xor_reporter'`
		);
		expect(Number(cons[0].n)).toBe(1);

		// The salt is minted once. A second row would mean two salts and a hash
		// that stops matching itself.
		const { rows: salt } = await db.sql<{ n: string }>(
			`select count(*) as n from public.app_feedback_reporter_secret`
		);
		expect(Number(salt[0].n)).toBe(1);
	});
});

describe('the deployed write path, which this bundle does not touch', () => {
	it('still accepts a signed-in direct insert through 0053s policy', async () => {
		const id = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.app_feedback (user_id, app, kind, message, meta)
				 values ($1, 'portal', 'idea', 'the direct insert still works', '{}'::jsonb)
				 returning id`,
				[student.id]
			);
			return rows[0].id;
		});

		const { rows } = await db.sql<{
			user_id: string | null;
			reporter_hash: string | null;
			contact: string | null;
		}>(`select user_id, reporter_hash, contact from public.app_feedback where id = $1`, [id]);
		expect(rows[0].user_id).toBe(student.id);
		// The widening is additive: an old-path row carries neither new column.
		expect(rows[0].reporter_hash).toBeNull();
		expect(rows[0].contact).toBeNull();
	});

	it('refuses a null author from a signed-in client, and a forged hash with it', async () => {
		await db.asUser(student.id, async (q) => {
			// The column is nullable now. The POLICY is what refuses this, and it
			// has to keep refusing it or the widening handed every client an
			// authorless write.
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message)
					 values (null, 'portal', 'bug', 'filed as nobody')`
				)
			).rejects.toMatchObject({ code: '42501' });

			// Somebody else's row, the check 0053 has always made.
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message)
					 values (gen_random_uuid(), 'portal', 'bug', 'filed as somebody else')`
				)
			).rejects.toMatchObject({ code: '42501' });

			// And an own row carrying an address hash: refused by the XOR check,
			// which is what keeps an account from ever sitting beside an address.
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, reporter_hash)
					 values ($1, 'portal', 'bug', 'my own row plus a hash', 'anything')`,
					[student.id]
				)
			).rejects.toMatchObject({ code: '23514' });
		});
	});

	it('still refuses a signed-out client outright', async () => {
		await db.asAnon(async (q) => {
			await expect(
				q(
					`insert into public.app_feedback (app, kind, message)
					 values ('portal', 'bug', 'no account, no grant')`
				)
			).rejects.toMatchObject({ code: '42501' });
		});
	});
});

describe('who may call the function', () => {
	it('is service_role and nobody else', async () => {
		// Behavioural, both directions.
		await db.asUser(student.id, async (q) => {
			await expect(q(SUBMIT, ['portal', 'bug', 'signed in', null, '{}', null, null])).rejects.toMatchObject(
				{ code: '42501' }
			);
		});
		await db.asAnon(async (q) => {
			await expect(
				q(SUBMIT, ['portal', 'bug', 'signed out', null, '{}', null, '198.51.100.4'])
			).rejects.toMatchObject({ code: '42501' });
		});
		// The positive control: the same call from the one role that may make it.
		const ok = await submitAnon('198.51.100.4', 'signed out, through the server');
		expect(ok.ok).toBe(true);

		// And the catalog, which is where the grant either is or is not. A grant
		// to PUBLIC would show up here as `anon` and `authed` both true, since
		// every role holds what PUBLIC holds.
		const { rows } = await db.sql<{
			anon: boolean;
			authed: boolean;
			svc: boolean;
		}>(
			`select
				has_function_privilege('anon', $1, 'execute') as anon,
				has_function_privilege('authenticated', $1, 'execute') as authed,
				has_function_privilege('service_role', $1, 'execute') as svc`,
			['public.app_feedback_submit(text, text, text, text, jsonb, text, text)']
		);
		expect(rows[0]).toEqual({ anon: false, authed: false, svc: true });
	});
});

describe('the two roles the one function serves', () => {
	it('files an anonymous report with no author and a hash', async () => {
		const result = await submitAnon('203.0.113.9', 'the sign-in button does nothing');
		expect(result.ok).toBe(true);

		const { rows } = await db.sql<{
			user_id: string | null;
			reporter_hash: string | null;
			app: string;
			kind: string;
			message: string;
			context: string | null;
		}>(
			`select user_id, reporter_hash, app, kind, message, context
			 from public.app_feedback where id = $1`,
			[result.id]
		);
		expect(rows[0].user_id).toBeNull();
		expect(rows[0].reporter_hash).not.toBeNull();
		expect(rows[0]).toMatchObject({
			app: 'portal',
			kind: 'bug',
			message: 'the sign-in button does nothing',
			context: '/dashboard'
		});
	});

	it('files a signed-in report as the caller, and stores no address beside them', async () => {
		const result = await db.asServiceRole(async (q) => {
			const { rows } = await q<{ result: SubmitResult }>(SUBMIT, [
				'portal',
				'idea',
				'a signed-in note through the same function',
				null,
				'{}',
				null,
				// Supplied, and deliberately ignored on this path.
				'203.0.113.9'
			]);
			return rows[0].result;
		}, student.id);
		expect(result.ok).toBe(true);

		const { rows } = await db.sql<{ user_id: string | null; reporter_hash: string | null }>(
			`select user_id, reporter_hash from public.app_feedback where id = $1`,
			[result.id]
		);
		// The author is auth.uid() -- there is no parameter through which it
		// could have been anybody else.
		expect(rows[0].user_id).toBe(student.id);
		// AND NO HASH. An account stored beside an address hash would link that
		// account to every anonymous report sharing the address.
		expect(rows[0].reporter_hash).toBeNull();
	});

	it('refuses an anonymous call that carries no address at all', async () => {
		await db.asServiceRole(async (q) => {
			await expect(
				q(SUBMIT, ['portal', 'bug', 'from nowhere', null, '{}', null, null])
			).rejects.toThrow(/reporter address hash/i);
		});
	});
});

describe('the hash column never receives an address', () => {
	it('stores a salted digest of what was passed, not what was passed', async () => {
		const address = '198.51.100.77';
		const result = await submitAnon(address, 'feeding a literal address in');
		expect(result.ok).toBe(true);

		const { rows } = await db.sql<{ reporter_hash: string; plain: string }>(
			`select reporter_hash, md5($2) as plain from public.app_feedback where id = $1`,
			[result.id, address]
		);
		const stored = rows[0].reporter_hash;

		// Not the address.
		expect(stored).not.toBe(address);
		expect(stored).not.toContain(address);
		// Not an UNSALTED digest of it either -- an unsalted hash of a v4 address
		// is a 4-billion-entry rainbow table, which is not a hash at all.
		expect(stored).not.toBe(rows[0].plain);
		expect(stored).toMatch(/^[0-9a-f]{32}$/);

		// And nowhere else, either: not in the rate table, not in any other
		// column of the row. A sweep, so a future column cannot quietly become
		// the place the address ends up.
		const { rows: leaks } = await db.sql<{ n: string }>(
			`select count(*) as n from public.app_feedback f
			 where f::text like '%' || $1 || '%'`,
			[address]
		);
		expect(Number(leaks[0].n)).toBe(0);
		const { rows: rateLeaks } = await db.sql<{ n: string }>(
			`select count(*) as n from public.app_feedback_rate r
			 where r::text like '%' || $1 || '%'`,
			[address]
		);
		expect(Number(rateLeaks[0].n)).toBe(0);

		// The positive control the two sweeps need: the same probe DOES find the
		// message, so "not found" means absent rather than "the sweep reads
		// nothing".
		const { rows: control } = await db.sql<{ n: string }>(
			`select count(*) as n from public.app_feedback f
			 where f::text like '%feeding a literal address in%'`
		);
		expect(Number(control[0].n)).toBe(1);
	});

	it('cannot be read back out through anything, because the salt cannot be', async () => {
		// The salt is what stands between a stored hash and the address behind
		// it. Nothing but the definer function may read it.
		for (const role of ['anon', 'authenticated', 'service_role'] as const) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_table_privilege($1, 'public.app_feedback_reporter_secret', 'select') as ok`,
				[role]
			);
			expect({ role, ok: rows[0].ok }).toEqual({ role, ok: false });
		}
	});
});

describe('the rate limit', () => {
	const address = '192.0.2.50';

	it('lets the cap through, refuses the next, and writes nothing when it refuses', async () => {
		const before = await countFeedback();

		const results: SubmitResult[] = [];
		for (let i = 0; i < 5; i += 1) {
			results.push(await submitAnon(address, `report number ${i + 1}`));
		}
		expect(results.every((r) => r.ok)).toBe(true);

		const refused = await submitAnon(address, 'report number 6');
		expect(refused.ok).toBe(false);
		expect(refused.reason).toBe('rate_limited');
		// The refusal carries nothing else: no count, no remaining quota, no
		// window, no reset time. Anything more is an answer to "how close is this
		// address to its limit", which is a question the function does not take.
		expect(Object.keys(refused).sort()).toEqual(['ok', 'reason']);

		// Five landed, the sixth wrote nothing at all -- not a feedback row, and
		// not a rate row either, because a refusal that renewed its own window
		// would turn a ten-minute wait into a permanent one under retry.
		expect(await countFeedback()).toBe(before + 5);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from public.app_feedback_rate where reporter_hash =
				md5((select s.salt from public.app_feedback_reporter_secret s limit 1) || $1)`,
			[address]
		);
		expect(Number(rows[0].n)).toBe(5);
	});

	it('is per address, not global', async () => {
		// The positive control for the assertion above: while 192.0.2.50 is
		// capped, somebody else's morning is unaffected. A limit that had gone
		// global would look identical from the refused side.
		const other = await submitAnon('192.0.2.51', 'a different building');
		expect(other.ok).toBe(true);
		expect((await submitAnon(address, 'still capped')).reason).toBe('rate_limited');
	});

	it('ages its rows out, and lets one through once the window has passed', async () => {
		// Push this address's window into the past. Nothing else moves, so the
		// only thing that can change the answer is the passage of time.
		await db.sql(
			`update public.app_feedback_rate set created_at = created_at - interval '11 minutes'
			 where reporter_hash = md5((select s.salt from public.app_feedback_reporter_secret s limit 1) || $1)`,
			[address]
		);

		const after = await submitAnon(address, 'the next window');
		expect(after.ok).toBe(true);

		// And the aged rows are GONE, not merely uncounted: a rate table that
		// only grows is a second problem, and one made of address hashes.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from public.app_feedback_rate
			 where created_at < now() - interval '10 minutes'`
		);
		expect(Number(rows[0].n)).toBe(0);
		// The one just written is still there -- the prune took the old rows, not
		// the table.
		expect(await countRate()).toBeGreaterThan(0);
	});
});

describe('what the function refuses gracefully', () => {
	it('caps the message itself, not only in the client', async () => {
		const before = await countFeedback();
		const tooLong = 'x'.repeat(2001);
		const refused = await submitAnon('192.0.2.90', tooLong);
		expect(refused).toEqual({ ok: false, reason: 'message_too_long' });
		// A refusal, not an exception: the caller has something to show a person.
		expect(await countFeedback()).toBe(before);

		// The boundary itself is accepted, so the cap is the cap and not one less.
		const atCap = await submitAnon('192.0.2.90', 'y'.repeat(2000));
		expect(atCap.ok).toBe(true);
	});

	it('refuses an empty message, including one that is only whitespace', async () => {
		const before = await countFeedback();
		expect(await submitAnon('192.0.2.91', '   \n\t  ')).toEqual({
			ok: false,
			reason: 'message_empty'
		});
		expect(await countFeedback()).toBe(before);
	});

	it('takes a contact when one is offered, and never needs one', async () => {
		const withContact = await submitAnon(
			'192.0.2.92',
			'you can reach me',
			'  a.student@boscotech.net  '
		);
		expect(withContact.ok).toBe(true);
		const without = await submitAnon('192.0.2.93', 'you cannot, and that is fine');
		expect(without.ok).toBe(true);

		const { rows } = await db.sql<{ id: string; contact: string | null }>(
			`select id, contact from public.app_feedback where id = any($1::uuid[])`,
			[[withContact.id, without.id]]
		);
		const byId = new Map(rows.map((r) => [r.id, r.contact]));
		expect(byId.get(withContact.id!)).toBe('a.student@boscotech.net');
		expect(byId.get(without.id!)).toBeNull();

		const tooLong = await submitAnon('192.0.2.94', 'reachable at length', 'z'.repeat(201));
		expect(tooLong).toEqual({ ok: false, reason: 'contact_too_long' });
	});
});

describe('the triage console, before 0127 and after it', () => {
	it('still reads the queue once it contains an authorless row', async () => {
		const console_db = await startTestDb(CONSOLE_CHAIN);
		try {
			// is_admin() falls back to the pinned owner constant, so this account
			// is an admin the moment it exists.
			const owner = await createUser(console_db, 'apina@boscotech.edu', 'Site Owner');
			const reporter = await createUser(console_db, 'reporter@boscotech.net', 'A Reporter');

			await console_db.asUser(reporter.id, (q) =>
				q(
					`insert into public.app_feedback (user_id, app, kind, message)
					 values ($1, 'portal', 'idea', 'signed in and named')`,
					[reporter.id]
				)
			);
			await console_db.asServiceRole(async (q) => {
				const { rows } = await q<{ result: SubmitResult }>(SUBMIT, [
					'portal',
					'bug',
					'anonymous and nameless',
					null,
					'{}',
					null,
					'203.0.113.200'
				]);
				expect(rows[0].result.ok).toBe(true);
			});

			const list = await console_db.asUser(owner.id, async (q) => {
				const { rows } = await q<{ rows_json: { message: string; submitter_email: string | null }[] }>(
					`select public.app_feedback_admin_list() as rows_json`
				);
				return rows[0].rows_json;
			});
			const messages = list.map((r) => r.message).sort();
			expect(messages).toEqual(['anonymous and nameless', 'signed in and named']);
			// The authorless row comes back with no submitter to name, which is
			// what an anonymous report is. Naming it on screen is a later bundle.
			expect(list.find((r) => r.message === 'anonymous and nameless')?.submitter_email).toBeNull();
		} finally {
			await console_db.stop();
		}
	}, 120_000);

	/**
	 * 0127. THE THREE THINGS IT CHANGES AND THE ONE IT MUST NOT.
	 *
	 * The first two fail invisibly, which is why they are here rather than in a
	 * browser pass: a payload that stopped saying `anonymous` renders as a
	 * report from somebody whose name we simply could not find, and a payload
	 * that started carrying `reporter_hash` puts a salted address on an admin's
	 * screen, in an export, and in a screenshot, while looking like nothing at
	 * all.
	 */
	it('states anonymity, returns the contact, and NEVER the reporter hash', async () => {
		const console_db = await startTestDb(CONSOLE_CHAIN_0127);
		try {
			const owner = await createUser(console_db, 'apina@boscotech.edu', 'Site Owner');
			const reporter = await createUser(console_db, 'reporter@boscotech.net', 'A Reporter');

			await console_db.asUser(reporter.id, (q) =>
				q(
					`insert into public.app_feedback (user_id, app, kind, message)
					 values ($1, 'portal', 'idea', 'signed in and named')`,
					[reporter.id]
				)
			);
			for (const [message, contact] of [
				['anonymous with a contact', 'ask me in 4th'],
				['anonymous with nothing', null]
			] as [string, string | null][]) {
				await console_db.asServiceRole(async (q) => {
					const { rows } = await q<{ result: SubmitResult }>(SUBMIT, [
						'portal',
						'bug',
						message,
						null,
						'{}',
						contact,
						`203.0.113.${message.length}`
					]);
					expect([message, rows[0].result.ok]).toEqual([message, true]);
				});
			}

			const list = await console_db.asUser(owner.id, async (q) => {
				const { rows } = await q<{
					rows_json: Record<string, unknown>[];
				}>(`select public.app_feedback_admin_list() as rows_json`);
				return rows[0].rows_json;
			});
			const byMessage = new Map(list.map((r) => [r.message as string, r]));
			expect([...byMessage.keys()].sort()).toEqual([
				'anonymous with a contact',
				'anonymous with nothing',
				'signed in and named'
			]);

			const withContact = byMessage.get('anonymous with a contact')!;
			expect(withContact.anonymous).toBe(true);
			expect(withContact.contact).toBe('ask me in 4th');
			// NULL, not the empty string 0085's expression produced: a console
			// branches on absence, and '' is not absence.
			expect(withContact.submitter_name).toBeNull();
			expect(withContact.submitter_email).toBeNull();

			const bare = byMessage.get('anonymous with nothing')!;
			expect(bare.anonymous).toBe(true);
			expect(bare.contact).toBeNull();

			// THE ONE IT MUST NOT CHANGE: a signed-in row is what it always was.
			const named = byMessage.get('signed in and named')!;
			expect(named.anonymous).toBe(false);
			expect(named.submitter_name).toBe('A Reporter');
			expect(named.submitter_email).toBe('reporter@boscotech.net');

			// THE HASH IS IN THE TABLE AND NOT IN THE PAYLOAD, asserted in one
			// place so the absence cannot be a row that was never written.
			const stored = await console_db.sql<{ reporter_hash: string | null }>(
				`select reporter_hash from public.app_feedback where reporter_hash is not null`
			);
			expect(stored.rows).toHaveLength(2);
			const payload = JSON.stringify(list);
			for (const row of stored.rows) {
				expect(payload).not.toContain(row.reporter_hash);
			}
			expect(payload).not.toContain('reporter_hash');
			// POSITIVE CONTROL: the payload is real and carries the rest of it.
			expect(payload).toContain('ask me in 4th');
		} finally {
			await console_db.stop();
		}
	}, 120_000);

	it('re-applies, and leaves exactly one app_feedback_admin_list', async () => {
		const console_db = await startTestDb(CONSOLE_CHAIN_0127);
		try {
			const sql = readFileSync(
				new URL(
					'../supabase/migrations/0127_app_feedback_console_anonymous.sql',
					import.meta.url
				),
				'utf8'
			);
			await console_db.sql(sql);
			const { rows } = await console_db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				   join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = 'app_feedback_admin_list'`
			);
			// The signature did not change, so `create or replace` is correct and
			// no old arity can have survived as a second overload.
			expect(rows[0].n).toBe('1');
			const grant = await console_db.sql<{ ok: boolean }>(
				`select has_function_privilege('authenticated',
					'public.app_feedback_admin_list(text, integer)', 'execute') as ok`
			);
			expect(grant.rows[0].ok).toBe(true);
			const anon = await console_db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon',
					'public.app_feedback_admin_list(text, integer)', 'execute') as ok`
			);
			expect(anon.rows[0].ok).toBe(false);
		} finally {
			await console_db.stop();
		}
	}, 120_000);
});
