// tests/db/feedback-tried-screenshot.test.ts
//
// 0170: "What did you try?" as a real column, and one screenshot in a private
// bucket.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE, per this repo's rule that
// automated tests are for guarantees whose regression is SILENT. Every claim
// here fails invisibly:
//
//   1. THE BUCKET'S TYPE LIST IS THE WHOLE GATE ON WHAT LANDS IN IT. Nothing in
//      `src/` reads `storage.buckets`, so nothing in `src/` reports a list that
//      quietly re-widens to `image/*` -- which is 0168's finding, and admits
//      `image/svg+xml`, a DOCUMENT carrying script and external references.
//      Every screen looks identical either way.
//   2. THE OBJECT POLICIES DECIDE WHO CAN OPEN A SCREENSHOT. A reporter's
//      screenshot is whatever was on their screen when something went wrong,
//      which is exactly the picture nobody else should be able to fetch. A
//      policy that admitted every signed-in caller would break nothing, show
//      nothing, and be discovered only by somebody holding a URL.
//   3. THE KEY SHAPE IS AN AUTHORIZATION CLAIM ON THE ROW. `screenshot_path`
//      names an object; the CHECK is what stops a row naming somebody else's
//      folder. A widened CHECK renders identically and is a pointer at another
//      person's bytes.
//   4. THE WIDENING MUST NOT BREAK THE DEPLOYED WRITE PATHS. Both of them --
//      0053's direct signed-in insert and 0126's service-role function -- keep
//      running against this table for as long as the current client is
//      deployed, and a break there is a break in production and nowhere else.
//
// SEEDED PRE-MIGRATION, THEN MIGRATED OVER THE TOP, which is this repo's
// migration rule rather than a reset chain: the fixture boots the chain SHORT
// of 0170, writes rows through the REAL pre-0170 paths (the direct insert and
// the 7-argument `app_feedback_submit`), and only then applies the file. So the
// assertions about old rows are about rows that genuinely predate it.
//
// THE POSITIVE CONTROLS ARE IN-DATABASE MUTATIONS, in `mutations`, at the end.
// Each one opens ONE statement of the applied migration in the PERMISSIVE
// direction on a THROWAWAY database and asserts the matching claim above stops
// holding -- so a claim that passes here cannot be passing because the probe
// reads nothing. They mutate the applied SCHEMA and never the file on disk:
// there is no restore step to get wrong, and `git checkout --` (which discards
// uncommitted work to HEAD, silently) is never involved.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/**
 * The chain SHORT OF 0170. 0053 is the box, 0067 the admin tier 0053's read
 * policy resolves through, 0082/0083/0085 the classroom migrations
 * `app_feedback_admin_list` arrives in, 0126 the anonymous path 0170 widens and
 * 0127 the console read it replaces. 0137 is LAST, as it is in every chain
 * here, because it is a sweep over whatever the chain above it created.
 */
const PRE_0170 = [
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

const SQL_0170 = readFileSync(
	new URL('../../supabase/migrations/0170_feedback_tried_and_screenshot.sql', import.meta.url),
	'utf8'
);

/** The pre-0170 arity, which the migration drops. */
const SUBMIT_7 = `select public.app_feedback_submit(
	p_app => $1, p_kind => $2, p_message => $3, p_context => $4,
	p_meta => $5::jsonb, p_contact => $6, p_address_hash => $7
) as result`;

/** The post-0170 arity. */
const SUBMIT_9 = `select public.app_feedback_submit(
	p_app => $1, p_kind => $2, p_message => $3, p_context => $4,
	p_meta => $5::jsonb, p_contact => $6, p_address_hash => $7,
	p_tried => $8, p_screenshot_path => $9
) as result`;

interface SubmitResult {
	ok: boolean;
	reason?: string;
	id?: string;
}

const BUCKET = 'feedback-media';
/** A well-formed object key under `uid`. The uuid half is fixed so a test can name it twice. */
const KEY_UUID = '11111111-2222-4333-8444-555555555555';
const keyFor = (uid: string, ext = 'png') => `${uid}/${KEY_UUID}.${ext}`;

let db: TestDb;
let owner: SeededUser;
let reporter: SeededUser;
let other: SeededUser;
/** Written through the REAL pre-0170 paths, before the file was applied. */
let legacySignedInId: string;
let legacyAnonId: string;

/**
 * The grants a real Supabase project hands `authenticated` on storage and the
 * test stub does not -- stated rather than hidden, exactly as
 * tests/classroom-storage-objects.test.ts states it. Without them every write
 * below would be refused for "permission denied for table objects", which is a
 * true refusal that proves nothing about a policy. The permitted-caller
 * controls are what say the grant landed.
 */
async function grantStorage(target: TestDb): Promise<void> {
	await target.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	// `anon` HOLDS THE TABLE GRANT ON A REAL PROJECT TOO, and it has to hold it
	// here or the signed-out read below is refused for "permission denied for
	// table objects" -- a true refusal that says nothing about a POLICY, which
	// is what this file is asserting. With the grant in place, a signed-out
	// reader is stopped by there being no `anon` policy on this bucket, which is
	// the actual claim.
	await target.sql(`grant select on storage.objects to anon`);
	await target.sql(`grant select on storage.buckets to authenticated, anon, service_role`);
}

async function putObject(target: TestDb, userId: string, key: string) {
	return target.asUser(userId, (q) =>
		q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key])
	);
}

/** How many objects at this key the caller can SEE. 0 is an RLS denial. */
async function readableCount(target: TestDb, userId: string, key: string): Promise<number> {
	return target.asUser(userId, async (q) => {
		const { rows } = await q<{ n: string }>(
			`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
			[BUCKET, key]
		);
		return Number(rows[0].n);
	});
}

async function mimeList(target: TestDb): Promise<string[] | null> {
	const { rows } = await target.sql<{ t: string[] | null }>(
		`select allowed_mime_types as t from storage.buckets where id = $1`,
		[BUCKET]
	);
	expect(rows).toHaveLength(1);
	return rows[0].t;
}

/**
 * Does this bucket's `allowed_mime_types` admit `type`?
 *
 * MIRRORS storage-api rather than comparing the array, the instrument
 * tests/maps-media-and-plan-frame.test.ts settled on: a NULL or empty list
 * means "no restriction" and admits everything, `*` and `type/*` match by
 * prefix, anything else matches exactly and case-insensitively. Written as the
 * RULE so it bites on every shape of re-widening -- the wildcard coming back,
 * the list being emptied, the list being dropped to null, or `image/svg+xml`
 * simply being added to it.
 */
function admits(list: string[] | null, type: string): boolean {
	if (list === null || list.length === 0) return true;
	const want = type.trim().toLowerCase();
	return list.some((raw) => {
		const entry = raw.trim().toLowerCase();
		if (entry === '*' || entry === '*/*') return true;
		if (entry.endsWith('/*')) return want.startsWith(entry.slice(0, -1));
		return entry === want;
	});
}

beforeAll(async () => {
	db = await startTestDb(PRE_0170);
	await grantStorage(db);

	// is_admin() falls back to the pinned owner constant, so this account is an
	// admin the moment it exists.
	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	reporter = await createUser(db, 'wren.hollis@boscotech.net', 'Wren Hollis');
	other = await createUser(db, 'sam.okafor@boscotech.net', 'Sam Okafor');

	// --- SEEDED THROUGH THE REAL PRE-MIGRATION PATHS -----------------------
	// A signed-in report, through 0053's own insert policy, as the reporter.
	legacySignedInId = await db.asUser(reporter.id, async (q) => {
		const { rows } = await q<{ id: string }>(
			`insert into public.app_feedback (user_id, app, kind, message, meta)
			 values ($1, 'portal', 'bug', 'filed before 0170 existed', '{"route":"/"}'::jsonb)
			 returning id`,
			[reporter.id]
		);
		return rows[0].id;
	});

	// An anonymous report, through the 7-argument function, as the one role that
	// may call it.
	const anon = await db.asServiceRole(async (q) => {
		const { rows } = await q<{ result: SubmitResult }>(SUBMIT_7, [
			'portal',
			'idea',
			'anonymous, and also before 0170',
			'/dashboard',
			'{}',
			null,
			'198.51.100.7'
		]);
		return rows[0].result;
	});
	expect(anon.ok).toBe(true);
	legacyAnonId = anon.id!;

	// --- THE MIGRATION, OVER THE TOP OF THAT ------------------------------
	await db.sql(SQL_0170);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// It applies like a migration in this repo
// ---------------------------------------------------------------------------

describe('0170 applies, and re-applies', () => {
	it('re-pastes cleanly and leaves exactly one of everything it creates', async () => {
		// Re-pasting is ordinary here -- someone re-runs it, or a first attempt
		// failed partway. A file that only works once fails exactly then, with
		// the schema half-built. The file's own self-check raises on any claim it
		// makes being false, so this also re-runs every one of them.
		await expect(db.sql(SQL_0170)).resolves.toBeTruthy();

		// THE SIGNATURE TRAP, asserted rather than assumed: one row, one arity,
		// and the arity is the NEW one. A surviving 7-argument overload would
		// make PostgREST unable to resolve either call.
		const { rows: procs } = await db.sql<{ n: string; nargs: number }>(
			`select count(*)::text as n, max(pronargs) as nargs from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'app_feedback_submit'`
		);
		expect({ n: Number(procs[0].n), nargs: procs[0].nargs }).toEqual({ n: 1, nargs: 9 });

		// One of each constraint, not one per apply.
		const { rows: cons } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint
			 where conrelid = 'public.app_feedback'::regclass
				 and conname in ('app_feedback_tried_len', 'app_feedback_screenshot_path_shape')`
		);
		expect(Number(cons[0].n)).toBe(2);

		// One bucket row, and four policies -- not eight.
		const { rows: pol } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
				 and policyname like 'feedback media %'`
		);
		expect(Number(pol[0].n)).toBe(4);
	});

	it('leaves the two columns and the private bucket in place', async () => {
		const { rows: cols } = await db.sql<{ column_name: string; is_nullable: string }>(
			`select column_name, is_nullable from information_schema.columns
			 where table_schema = 'public' and table_name = 'app_feedback'
				 and column_name in ('tried', 'screenshot_path')
			 order by column_name`
		);
		expect(cols).toEqual([
			{ column_name: 'screenshot_path', is_nullable: 'YES' },
			{ column_name: 'tried', is_nullable: 'YES' }
		]);

		const { rows: bucket } = await db.sql<{
			public: boolean;
			file_size_limit: string | number | null;
		}>(`select public, file_size_limit from storage.buckets where id = $1`, [BUCKET]);
		expect(bucket).toHaveLength(1);
		// PRIVATE is the property the whole no-navigation argument rests on.
		expect(bucket[0].public).toBe(false);
		expect(Number(bucket[0].file_size_limit)).toBe(8388608);
	});

	it('leaves the rows written before it alone, with both new columns null', async () => {
		const { rows } = await db.sql<{
			id: string;
			tried: string | null;
			screenshot_path: string | null;
			message: string;
		}>(
			`select id, tried, screenshot_path, message from public.app_feedback
			 where id = any($1::uuid[]) order by message`,
			[[legacySignedInId, legacyAnonId]]
		);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect({ id: row.id, tried: row.tried, shot: row.screenshot_path }).toEqual({
				id: row.id,
				tried: null,
				shot: null
			});
		}
		// And the messages are untouched, which is the half a widening could
		// silently rewrite.
		expect(rows.map((r) => r.message)).toEqual([
			'anonymous, and also before 0170',
			'filed before 0170 existed'
		]);
	});
});

// ---------------------------------------------------------------------------
// The anonymous write path, widened
// ---------------------------------------------------------------------------

describe('an anonymous report can say what was tried', () => {
	async function submitAnon(
		address: string,
		message: string,
		opts: { tried?: string | null; meta?: string; shot?: string | null } = {}
	): Promise<SubmitResult> {
		return db.asServiceRole(async (q) => {
			const { rows } = await q<{ result: SubmitResult }>(SUBMIT_9, [
				'portal',
				'bug',
				message,
				'/dashboard',
				opts.meta ?? '{}',
				null,
				address,
				opts.tried ?? null,
				opts.shot ?? null
			]);
			return rows[0].result;
		});
	}

	it('files an authorless row carrying the tried text', async () => {
		const result = await submitAnon('203.0.113.11', 'the sign-in button does nothing', {
			tried: 'Reloaded twice, then tried it in a private window.'
		});
		expect(result.ok).toBe(true);

		const { rows } = await db.sql<{
			user_id: string | null;
			reporter_hash: string | null;
			tried: string | null;
			screenshot_path: string | null;
		}>(
			`select user_id, reporter_hash, tried, screenshot_path
			 from public.app_feedback where id = $1`,
			[result.id]
		);
		expect(rows[0].user_id).toBeNull();
		// Still attributable to something, which is 0126's XOR rule and must not
		// have moved.
		expect(rows[0].reporter_hash).not.toBeNull();
		expect(rows[0].tried).toBe('Reloaded twice, then tried it in a private window.');
		// An anonymous reporter cannot attach a screenshot from the shipped form;
		// this asserts the row it does write carries none.
		expect(rows[0].screenshot_path).toBeNull();
	});

	it('lifts meta.tried into the column and removes the key from meta', async () => {
		// THE BRIDGE. The anonymous route forwards `meta` verbatim and does not
		// name p_tried, so the signed-out form carries the answer inside the blob
		// and this function is what gives every row ONE spelling. Without the
		// removal the console's generic meta pass would print the same sentence a
		// second time under a key.
		const result = await submitAnon('203.0.113.12', 'the QR code goes nowhere', {
			meta: JSON.stringify({ route: '/', tried: 'Scanned it with two phones.' })
		});
		expect(result.ok).toBe(true);

		const { rows } = await db.sql<{ tried: string | null; meta: Record<string, unknown> }>(
			`select tried, meta from public.app_feedback where id = $1`,
			[result.id]
		);
		expect(rows[0].tried).toBe('Scanned it with two phones.');
		expect(rows[0].meta).toEqual({ route: '/' });
		expect(Object.keys(rows[0].meta)).not.toContain('tried');
	});

	it('prefers the parameter over the meta key when a caller sends both', async () => {
		const result = await submitAnon('203.0.113.13', 'two spellings arrived', {
			tried: 'the parameter',
			meta: JSON.stringify({ tried: 'the meta key' })
		});
		const { rows } = await db.sql<{ tried: string; meta: Record<string, unknown> }>(
			`select tried, meta from public.app_feedback where id = $1`,
			[result.id]
		);
		expect(rows[0].tried).toBe('the parameter');
		expect(rows[0].meta).toEqual({});
	});

	it('refuses an over-long tried GRACEFULLY, and takes the value at the cap', async () => {
		const before = await countRows();
		const refused = await submitAnon('203.0.113.14', 'a long account', {
			tried: 'x'.repeat(1001)
		});
		// A refusal, not an exception: the caller has something to show a person.
		expect(refused).toEqual({ ok: false, reason: 'tried_too_long' });
		expect(await countRows()).toBe(before);

		// The boundary itself is accepted, so the cap is the cap and not one less.
		const atCap = await submitAnon('203.0.113.15', 'exactly at the cap', {
			tried: 'y'.repeat(1000)
		});
		expect(atCap.ok).toBe(true);
	});

	it('still refuses everything 0126 refused, unchanged', async () => {
		// The widening must not have loosened anything beside it.
		expect(await submitAnon('203.0.113.16', '   \n\t  ')).toEqual({
			ok: false,
			reason: 'message_empty'
		});
		expect(await submitAnon('203.0.113.17', 'z'.repeat(2001))).toEqual({
			ok: false,
			reason: 'message_too_long'
		});
	});

	it('is still callable by service_role and by nobody else', async () => {
		// THE GRANT IS THE WHOLE DESIGN (0126): the address hash is a parameter,
		// so anyone who can reach this function chooses their own rate-limit key.
		await db.asUser(reporter.id, async (q) => {
			await expect(
				q(SUBMIT_9, ['portal', 'bug', 'signed in', null, '{}', null, null, null, null])
			).rejects.toMatchObject({ code: '42501' });
		});
		await db.asAnon(async (q) => {
			await expect(
				q(SUBMIT_9, ['portal', 'bug', 'signed out', null, '{}', null, '198.51.100.9', null, null])
			).rejects.toMatchObject({ code: '42501' });
		});

		const sig =
			'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)';
		const { rows } = await db.sql<{ anon: boolean; authed: boolean; svc: boolean }>(
			`select has_function_privilege('anon', $1, 'execute') as anon,
			        has_function_privilege('authenticated', $1, 'execute') as authed,
			        has_function_privilege('service_role', $1, 'execute') as svc`,
			[sig]
		);
		expect(rows[0]).toEqual({ anon: false, authed: false, svc: true });
	});
});

async function countRows(): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(`select count(*)::text as n from public.app_feedback`);
	return Number(rows[0].n);
}

// ---------------------------------------------------------------------------
// The signed-in path, which is a direct insert and stays one
// ---------------------------------------------------------------------------

describe('a signed-in reporter writes and reads back their own row', () => {
	let mineId: string;

	it('files a row with both new fields through 0053s own insert policy', async () => {
		mineId = await db.asUser(reporter.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`insert into public.app_feedback
					(user_id, app, kind, message, meta, tried, screenshot_path)
				 values ($1, 'portal', 'bug', 'the launcher card will not open',
					'{"route":"/"}'::jsonb, 'Clicked it, then reloaded, then tried Safari.', $2)
				 returning id`,
				[reporter.id, keyFor(reporter.id)]
			);
			return rows[0].id;
		});
		expect(mineId).toBeTruthy();
	});

	it('reads its own row back, both fields included', async () => {
		const row = await db.asUser(reporter.id, async (q) => {
			const { rows } = await q<{ tried: string | null; screenshot_path: string | null }>(
				`select tried, screenshot_path from public.app_feedback where id = $1`,
				[mineId]
			);
			return rows[0] ?? null;
		});
		expect(row).toEqual({
			tried: 'Clicked it, then reloaded, then tried Safari.',
			screenshot_path: keyFor(reporter.id)
		});
	});

	it('is invisible to another student, who is the positive controls other half', async () => {
		// 0053's read policy is own-rows-or-admin. The widening added columns, not
		// a population: a second student sees no row at all, so there is nothing
		// for the new columns to leak through.
		const seen = await db.asUser(other.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from public.app_feedback where id = $1`,
				[mineId]
			);
			return Number(rows[0].n);
		});
		expect(seen).toBe(0);

		// The control: the owner IS an admin, so the same statement finds it.
		const asAdmin = await db.asUser(owner.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from public.app_feedback where id = $1`,
				[mineId]
			);
			return Number(rows[0].n);
		});
		expect(asAdmin).toBe(1);
	});

	it('refuses a row naming somebody elses folder, and a .svg key', async () => {
		await db.asUser(reporter.id, async (q) => {
			// THE KEY IS AN AUTHORIZATION CLAIM. A row pointing into another
			// person's folder is refused by the CHECK, not by a convention.
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
					 values ($1, 'portal', 'bug', 'pointing at somebody else', $2)`,
					[reporter.id, keyFor(other.id)]
				)
			).rejects.toMatchObject({ code: '23514' });

			// An SVG is a document, not a picture. No policy could have written the
			// object, and the row cannot name one either.
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
					 values ($1, 'portal', 'bug', 'an svg key', $2)`,
					[reporter.id, `${reporter.id}/${KEY_UUID}.svg`]
				)
			).rejects.toMatchObject({ code: '23514' });

			// A flat key with no folder at all, which is what a traversal attempt
			// or a hand-built path most often looks like.
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
					 values ($1, 'portal', 'bug', 'no folder', $2)`,
					[reporter.id, `${KEY_UUID}.png`]
				)
			).rejects.toMatchObject({ code: '23514' });

			// THE POSITIVE CONTROL for all three: the well-formed key is accepted by
			// the same statement, so the refusals are the CHECK and not the insert.
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
					 values ($1, 'portal', 'bug', 'a well formed key', $2)`,
					[reporter.id, `${reporter.id}/22222222-3333-4444-8555-666666666666.jpg`]
				)
			).resolves.toBeTruthy();
		});
	});

	it('refuses an over-long tried on the direct path too, since the CHECK is the boundary', async () => {
		await db.asUser(reporter.id, async (q) => {
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, tried)
					 values ($1, 'portal', 'bug', 'too much detail', $2)`,
					[reporter.id, 'x'.repeat(1001)]
				)
			).rejects.toMatchObject({ code: '23514' });
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, tried)
					 values ($1, 'portal', 'bug', 'exactly enough detail', $2)`,
					[reporter.id, 'x'.repeat(1000)]
				)
			).resolves.toBeTruthy();
		});
	});

	it('still refuses a null author and a forged one, which the widening must not have touched', async () => {
		await db.asUser(reporter.id, async (q) => {
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, tried)
					 values (null, 'portal', 'bug', 'filed as nobody', 'nothing')`
				)
			).rejects.toMatchObject({ code: '42501' });
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message)
					 values (gen_random_uuid(), 'portal', 'bug', 'filed as somebody else')`
				)
			).rejects.toMatchObject({ code: '42501' });
		});
		await db.asAnon(async (q) => {
			await expect(
				q(`insert into public.app_feedback (app, kind, message) values ('portal', 'bug', 'no grant')`)
			).rejects.toMatchObject({ code: '42501' });
		});
	});
});

// ---------------------------------------------------------------------------
// The object itself
// ---------------------------------------------------------------------------

describe('a screenshot object is the reporters and the admins, and nobody elses', () => {
	it('lets a reporter write into their own folder and refuses another folder', async () => {
		await expect(putObject(db, reporter.id, keyFor(reporter.id))).resolves.toBeTruthy();
		// The refusal, against the identical statement: the prefix is the rule.
		await expect(putObject(db, reporter.id, keyFor(other.id))).rejects.toMatchObject({
			code: '42501'
		});
	});

	it('refuses a signed-out writer outright', async () => {
		await db.asAnon(async (q) => {
			await expect(
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [
					BUCKET,
					`anon/${KEY_UUID}.png`
				])
			).rejects.toMatchObject({ code: '42501' });
		});
	});

	it('is unreadable by a second student and readable by its owner and an admin', async () => {
		// THE CLAIM THIS FILE EXISTS FOR. A screenshot is whatever was on the
		// reporter's screen when something went wrong.
		expect(await readableCount(db, other.id, keyFor(reporter.id))).toBe(0);
		// The two positive controls, the identical statement from the two callers
		// who SHOULD reach it. Without them a typo in the bucket name, a missing
		// grant and a wrong prefix all produce the same clean pass.
		expect(await readableCount(db, reporter.id, keyFor(reporter.id))).toBe(1);
		expect(await readableCount(db, owner.id, keyFor(reporter.id))).toBe(1);
	});

	it('is invisible to a signed-out reader', async () => {
		const seen = await db.asAnon(async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from storage.objects where bucket_id = $1`,
				[BUCKET]
			);
			return Number(rows[0].n);
		});
		expect(seen).toBe(0);
	});

	it('can be deleted by its owner and not by anyone else', async () => {
		await putObject(db, other.id, keyFor(other.id));
		const strangerDeleted = await db.asUser(reporter.id, async (q) => {
			const res = await q(`delete from storage.objects where bucket_id = $1 and name = $2`, [
				BUCKET,
				keyFor(other.id)
			]);
			return res.rowCount ?? 0;
		});
		expect(strangerDeleted).toBe(0);
		const ownerDeleted = await db.asUser(other.id, async (q) => {
			const res = await q(`delete from storage.objects where bucket_id = $1 and name = $2`, [
				BUCKET,
				keyFor(other.id)
			]);
			return res.rowCount ?? 0;
		});
		expect(ownerDeleted).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// The type list
// ---------------------------------------------------------------------------

describe('the bucket admits three raster types and no SVG', () => {
	/**
	 * WHAT IS NOT ASSERTED HERE, AND CANNOT BE. `allowed_mime_types` is enforced
	 * by storage-api at upload time against the request's DECLARED content type,
	 * not by a database constraint -- there is no Storage server in this harness.
	 * So this asserts the POLICY VALUE the upload path reads, which is the whole
	 * of what this migration controls, and does not simulate an upload.
	 */
	const SVG = ['image/svg+xml', 'IMAGE/SVG+XML', 'image/svg+xml-compressed'];

	it('refuses every spelling of SVG', async () => {
		const list = await mimeList(db);
		for (const type of SVG) {
			expect({ type, admitted: admits(list, type) }).toEqual({ type, admitted: false });
		}
	});

	it('admits exactly png, jpeg and webp -- the positive control beside the refusal', async () => {
		const list = await mimeList(db);
		for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
			expect({ type, admitted: admits(list, type) }).toEqual({ type, admitted: true });
		}
		// HEIC is refused HERE where 0168 admitted it for maps-media, because a
		// screenshot is taken at a computer and Chrome and Firefox do not decode
		// HEIC -- a HEIC nobody can open is a broken thumbnail on the one screen
		// that needed it.
		for (const type of ['image/heic', 'image/heif', 'image/gif', 'image/avif', 'text/html']) {
			expect({ type, admitted: admits(list, type) }).toEqual({ type, admitted: false });
		}
		expect(list).toEqual(['image/png', 'image/jpeg', 'image/webp']);
	});
});

// ---------------------------------------------------------------------------
// The console read
// ---------------------------------------------------------------------------

describe('the triage console read', () => {
	it('projects tried and screenshot_path, for an admin only', async () => {
		const rows = await db.asUser(owner.id, async (q) => {
			const { rows } = await q<{ result: Record<string, unknown>[] }>(
				`select public.app_feedback_admin_list() as result`
			);
			return rows[0].result;
		});
		expect(Array.isArray(rows)).toBe(true);
		expect(rows.length).toBeGreaterThan(0);
		// EVERY row carries both keys, present-and-null included: a console that
		// has to tell "no screenshot" from "this backend does not project one"
		// reads the key's presence, not its value.
		for (const row of rows) {
			expect(Object.keys(row)).toEqual(expect.arrayContaining(['tried', 'screenshot_path']));
		}
		const withTried = rows.filter((r) => typeof r.tried === 'string');
		expect(withTried.length).toBeGreaterThan(0);
		const withShot = rows.filter((r) => typeof r.screenshot_path === 'string');
		expect(withShot.length).toBeGreaterThan(0);

		// 0127's own projections are unmoved.
		expect(rows.some((r) => r.anonymous === true)).toBe(true);
		expect(rows.some((r) => r.anonymous === false)).toBe(true);
		// AND THE REPORTER HASH IS STILL NOT IN IT. It exists to be counted, not
		// read; a column that reaches a console reaches an export and a screenshot.
		for (const row of rows) {
			expect(Object.keys(row)).not.toContain('reporter_hash');
		}
	});

	it('still refuses a non-admin and a signed-out caller', async () => {
		await db.asUser(reporter.id, async (q) => {
			await expect(q(`select public.app_feedback_admin_list() as result`)).rejects.toThrow(
				/site admin/i
			);
		});
		await db.asAnon(async (q) => {
			await expect(q(`select public.app_feedback_admin_list() as result`)).rejects.toMatchObject({
				code: '42501'
			});
		});
	});
});

// ---------------------------------------------------------------------------
// The positive controls: each claim, put to a schema with one statement opened
// ---------------------------------------------------------------------------

describe('mutations -- each assertion above, proven to bite', () => {
	let mutant: TestDb;
	let mReporter: SeededUser;
	let mOther: SeededUser;

	beforeAll(async () => {
		mutant = await startTestDb(PRE_0170);
		await grantStorage(mutant);
		await createUser(mutant, 'apina@boscotech.edu', 'Site Owner');
		mReporter = await createUser(mutant, 'wren.hollis@boscotech.net', 'Wren Hollis');
		mOther = await createUser(mutant, 'sam.okafor@boscotech.net', 'Sam Okafor');
		await mutant.sql(SQL_0170);
		await putObject(mutant, mReporter.id, keyFor(mReporter.id));
	}, 180_000);

	afterAll(async () => {
		await mutant?.stop();
	});

	it('a widened select policy makes the cross-reader denial pass -- so the denial is real', async () => {
		// REMOVED: the `and (storage.foldername(name))[1] = (select auth.uid())::text`
		// half of "feedback media read own folder", replaced by nothing (the
		// bucket alone), which is the permissive direction.
		expect(await readableCount(mutant, mOther.id, keyFor(mReporter.id))).toBe(0);
		await mutant.sql(`
			drop policy "feedback media read own folder" on storage.objects;
			create policy "feedback media read own folder" on storage.objects
				for select to authenticated using (bucket_id = 'feedback-media');
		`);
		try {
			expect(await readableCount(mutant, mOther.id, keyFor(mReporter.id))).toBe(1);
		} finally {
			await mutant.sql(`
				drop policy "feedback media read own folder" on storage.objects;
				create policy "feedback media read own folder" on storage.objects
					for select to authenticated
					using (
						bucket_id = 'feedback-media'
						and (storage.foldername(name))[1] = (select auth.uid())::text
					);
			`);
		}
		expect(await readableCount(mutant, mOther.id, keyFor(mReporter.id))).toBe(0);
	});

	it('a widened insert policy lets a stranger write into a folder -- so the prefix rule is real', async () => {
		// REMOVED: the same prefix comparison from "feedback media insert own folder".
		const stranger = `${mOther.id}/33333333-4444-4555-8666-777777777777.png`;
		await expect(putObject(mutant, mReporter.id, stranger)).rejects.toMatchObject({
			code: '42501'
		});
		await mutant.sql(`
			drop policy "feedback media insert own folder" on storage.objects;
			create policy "feedback media insert own folder" on storage.objects
				for insert to authenticated with check (bucket_id = 'feedback-media');
		`);
		try {
			await expect(putObject(mutant, mReporter.id, stranger)).resolves.toBeTruthy();
		} finally {
			await mutant.sql(`
				delete from storage.objects where bucket_id = 'feedback-media' and name = $1;
			`, [stranger]);
			await mutant.sql(`
				drop policy "feedback media insert own folder" on storage.objects;
				create policy "feedback media insert own folder" on storage.objects
					for insert to authenticated
					with check (
						bucket_id = 'feedback-media'
						and (storage.foldername(name))[1] = (select auth.uid())::text
					);
			`);
		}
		await expect(putObject(mutant, mReporter.id, stranger)).rejects.toMatchObject({
			code: '42501'
		});
	});

	it('the wildcard back in the bucket list admits SVG -- so the narrowing is real', async () => {
		// REMOVED: the three-entry array, replaced by 0163's `image/*`, which is
		// the exact shape 0168 found and the exact shape a future session would
		// most plausibly restore.
		expect(admits(await mimeList(mutant), 'image/svg+xml')).toBe(false);
		await mutant.sql(
			`update storage.buckets set allowed_mime_types = array['image/*'] where id = $1`,
			[BUCKET]
		);
		try {
			expect(admits(await mimeList(mutant), 'image/svg+xml')).toBe(true);
		} finally {
			await mutant.sql(
				`update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp']
				 where id = $1`,
				[BUCKET]
			);
		}
		expect(admits(await mimeList(mutant), 'image/svg+xml')).toBe(false);
	});

	it('a widened key CHECK accepts another persons folder and a .svg -- so the CHECK is real', async () => {
		// REMOVED: the whole `app_feedback_screenshot_path_shape` constraint,
		// which is the permissive direction (a constraint commented out entirely
		// is the only way to open this one -- there is no weaker predicate that
		// is not simply a different rule).
		const foreign = keyFor(mOther.id);
		await mutant.asUser(mReporter.id, async (q) => {
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
					 values ($1, 'portal', 'bug', 'before', $2)`,
					[mReporter.id, foreign]
				)
			).rejects.toMatchObject({ code: '23514' });
		});
		await mutant.sql(
			`alter table public.app_feedback drop constraint app_feedback_screenshot_path_shape`
		);
		try {
			await mutant.asUser(mReporter.id, async (q) => {
				await expect(
					q(
						`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
						 values ($1, 'portal', 'bug', 'during', $2)`,
						[mReporter.id, foreign]
					)
				).resolves.toBeTruthy();
				await expect(
					q(
						`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
						 values ($1, 'portal', 'bug', 'an svg during', $2)`,
						[mReporter.id, `${mReporter.id}/${KEY_UUID}.svg`]
					)
				).resolves.toBeTruthy();
			});
		} finally {
			await mutant.sql(
				`delete from public.app_feedback where message in ('during', 'an svg during')`
			);
			await mutant.sql(`
				alter table public.app_feedback
					add constraint app_feedback_screenshot_path_shape
					check (
						screenshot_path is null
						or (
							user_id is not null
							and screenshot_path ~ (
								'^' || user_id::text
								|| '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp)$'
							)
						)
						or (
							user_id is null
							and screenshot_path ~
								'^anon/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp)$'
						)
					);
			`);
		}
		await mutant.asUser(mReporter.id, async (q) => {
			await expect(
				q(
					`insert into public.app_feedback (user_id, app, kind, message, screenshot_path)
					 values ($1, 'portal', 'bug', 'after', $2)`,
					[mReporter.id, foreign]
				)
			).rejects.toMatchObject({ code: '23514' });
		});
	});

	it('a function that drops tried on the floor stores null -- so the column write is real', async () => {
		// REMOVED: `tried` from the INSERT column list and `v_tried` from its
		// VALUES, which is how a widening most plausibly half-lands -- the
		// parameter is accepted, the refusal still fires, and the value simply
		// never reaches the table. Nothing on any screen would say so.
		const submit = (message: string) =>
			mutant.asServiceRole(async (q) => {
				const { rows } = await q<{ result: SubmitResult }>(SUBMIT_9, [
					'portal',
					'bug',
					message,
					null,
					'{}',
					null,
					'198.51.100.31',
					'what I tried',
					null
				]);
				return rows[0].result;
			});
		const readTried = async (id: string) => {
			const { rows } = await mutant.sql<{ tried: string | null }>(
				`select tried from public.app_feedback where id = $1`,
				[id]
			);
			return rows[0].tried;
		};

		const before = await submit('before the mutation');
		expect(await readTried(before.id!)).toBe('what I tried');

		await mutant.sql(`
			create or replace function public.app_feedback_submit(
				p_app text, p_kind text, p_message text, p_context text default null,
				p_meta jsonb default '{}'::jsonb, p_contact text default null,
				p_address_hash text default null, p_tried text default null,
				p_screenshot_path text default null
			) returns jsonb language plpgsql security definer set search_path = '' as $mut$
			declare
				v_id uuid;
			begin
				insert into public.app_feedback (user_id, app, kind, message, meta, reporter_hash)
				values (null, p_app, p_kind, p_message, coalesce(p_meta, '{}'::jsonb),
					md5(coalesce(p_address_hash, 'x')))
				returning id into v_id;
				return jsonb_build_object('ok', true, 'id', v_id);
			end $mut$;
		`);
		try {
			const during = await submit('during the mutation');
			expect(await readTried(during.id!)).toBeNull();
		} finally {
			await mutant.sql(SQL_0170);
		}
		const after = await submit('after the mutation');
		expect(await readTried(after.id!)).toBe('what I tried');
	});
});
