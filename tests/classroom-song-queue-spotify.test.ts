// tests/classroom-song-queue-spotify.test.ts
//
// 0186: class music links are Spotify only, and A REFUSED LINK CANNOT COST A
// STUDENT A COIN.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. Two of the three claims here fail
// SILENTLY, which is this repo's bar for an automated test:
//
//   1. THE COIN. The charge lives at APPROVAL (`0145`) and the URL rule lives at
//      REQUEST, so the only thing keeping a refused link away from the charge is
//      that it never becomes a row. Nothing on any screen reports that ordering,
//      and a rule moved below the insert -- or asked in a second place instead
//      of the first -- would look identical everywhere and would put a student's
//      balance behind an instructor's press.
//   2. THE ROWS ALREADY IN THE TABLE. `classroom_song_requests.url` carries a
//      CHECK calling `_classroom_song_url_ok`, and a CHECK is re-evaluated on
//      UPDATE. `classroom_song_approve` UPDATEs the row it approves. So a
//      narrowing written into that predicate instead of beside it would leave
//      every already-pending non-Spotify request raising a constraint violation
//      at the moment an instructor pressed Approve -- and nothing before that
//      moment would say so. This file seeds such rows through the REAL
//      pre-0186 RPC and then applies the migration over the top.
//   3. WHAT COUNTS AS SPOTIFY. A restriction that turns away a link a student
//      legitimately pasted teaches them only that the platform is arbitrary, and
//      the forms are not guessable -- `intl-es` in the path, `?si=` on the end,
//      two short domains, and a `spotify:` URI that is not a web link at all.
//
// THE PRE-MIGRATION SEED IS THE POINT OF THE CHAIN BELOW. It boots SHORT of
// 0186, files requests through the real `classroom_song_request` of that world
// (which accepts any https host), and only then applies the file -- so the
// legacy rows here genuinely predate the rule, exactly as production's do.
//
// THE POSITIVE CONTROL IS AN IN-DATABASE MUTATION on a THROWAWAY database: the
// Spotify predicate is replaced with one that answers `true` for everything,
// which is the feature switched off, and the same refused link is then driven
// all the way through request -> approve. It must move the balance by the full
// price. If it does not, the "balance unchanged" assertion above it was passing
// because the instrument reads nothing, not because the rule holds. Nothing on
// disk is touched and there is no restore step to get wrong.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/**
 * The chain SHORT OF 0186. This is `classroom-song-queue-race.test.ts`'s chain
 * verbatim -- the coin migrations `_coin_insert` and `_coin_balance` arrive in,
 * the classroom ones the section and roster come from, 0137 last as it is
 * everywhere, then 0145.
 */
const PRE_0186 = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	// 0053 + 0085 are here because 0186 IS ONE FILE and its other half is the
	// fourth feedback status: a chain without `app_feedback` cannot apply it,
	// which is itself worth having pinned -- the two halves ship together and
	// either one missing is a failed apply rather than a half-applied schema.
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	'0072_coin_my_eating_pass_status.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0077_coin_contracts.sql',
	'0079_coin_bulk_payout.sql',
	'0080_coin_category_admin.sql',
	'0081_coin_debt_payment.sql',
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql',
	'0096_coin_medium.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0137_anon_execute_sweep.sql',
	'0145_classroom_song_queue.sql'
] as const;

const SQL_0186 = readFileSync(
	new URL('../supabase/migrations/0186_song_spotify_and_feedback_spam.sql', import.meta.url),
	'utf8'
);

/**
 * EVERY FORM THIS BUNDLE PROMISES TO ACCEPT.
 *
 * Not a restatement of the regex: each of these is a shape a student can
 * actually arrive holding, and the list is what the promise in the header means.
 * `intl-es` is the locale prefix Spotify's own web player adds; `?si=` is what
 * the Share button appends; `spotify.link` is the mobile share sheet and
 * `spoti.fi` the older branded short link.
 */
const ACCEPTED = [
	'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
	'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3',
	'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
	'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
	'https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ',
	'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
	'https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT',
	'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123def456',
	'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=a&utm_source=copy-link',
	'https://spotify.link/aBcDeFgHiJ',
	'https://spoti.fi/3xYzAbC',
	'https://play.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
	'https://www.spotify.com/us/premium/',
	'https://spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
	'HTTPS://Open.Spotify.COM/track/4cOdK2wGLETKBW3PvgPWqT'
];

/**
 * Refused, and each for a different reason worth keeping straight.
 *
 * The first four are other services -- the ordinary case. The `spotify:` URI is
 * refused ONE STEP EARLIER, by `_classroom_song_url_ok`, because it is not
 * https; it is here so the two predicates are known to agree about it rather
 * than one of them quietly starting to accept it. The last four are LOOKALIKES:
 * every one contains the literal string `spotify.com` and none of them is
 * Spotify, which is what separates a parsed authority from a `like '%...%'`.
 */
const REFUSED_NOT_SPOTIFY = [
	'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
	'https://youtu.be/dQw4w9WgXcQ',
	'https://soundcloud.com/artist/track',
	'https://music.apple.com/us/album/x/1',
	'https://open.spotify.com@example.net/track/1',
	'https://open.spotify.com.example.net/track/1',
	'https://notspotify.com/track/1',
	'https://spotify.com.br.example.net/'
];

/** Refused by the SHAPE rule, one step before the policy rule. */
const REFUSED_BAD_URL = ['spotify:track:4cOdK2wGLETKBW3PvgPWqT', 'not a link at all', 'ftp://x/y'];

interface RequestResult {
	ok: boolean;
	reason?: string;
	request_id?: string;
}

interface ApproveResult {
	ok: boolean;
	reason?: string;
	charged?: number;
	balance?: number;
}

let db: TestDb;
let teacher: SeededUser;
let ana: SeededUser;
let sectionId: string;

async function seedWorld(handle: TestDb) {
	const t = await createUser(handle, 'tvargas@boscotech.edu', 'T. Vargas');
	const a = await createUser(handle, 'ana@boscotech.net', 'Ana Reyes');
	const s = await createClassroomSection(handle, {
		as: t,
		courseCode: 'IDEA100',
		courseTitle: 'Intro to Engineering Design',
		label: 'Period 1',
		teacherEmail: t.email
	});
	await enrollStudent(handle, { as: t, sectionId: s, email: a.email, displayName: 'Ana Reyes' });
	return { teacher: t, ana: a, sectionId: s };
}

function submitOn(handle: TestDb, section: string, user: SeededUser, url: string) {
	return handle.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: RequestResult }>(
			'select public.classroom_song_request($1::uuid, $2::text, null::text) as result',
			[section, url]
		);
		return rows[0].result;
	});
}

function approveOn(handle: TestDb, user: SeededUser, requestId: string) {
	return handle.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: ApproveResult }>(
			'select public.classroom_song_approve($1::uuid) as result',
			[requestId]
		);
		return rows[0].result;
	});
}

/**
 * The student's digital balance, read the way the coin system derives it -- a
 * sum over the ledger, never a stored column (`0096`). Read as the connection
 * owner so RLS is not what this file is measuring.
 */
async function balanceOn(handle: TestDb, email: string): Promise<number> {
	const { rows } = await handle.sql<{ n: string }>(
		`select coalesce(sum(amount), 0)::text as n
		 from public.coin_transactions where student_email = $1 and medium = 'digital'`,
		[email]
	);
	return Number(rows[0].n);
}

async function rowCount(handle: TestDb): Promise<number> {
	const { rows } = await handle.sql<{ n: string }>(
		'select count(*)::text as n from public.classroom_song_requests'
	);
	return Number(rows[0].n);
}

/**
 * Give the student something to spend, THROUGH THE REAL ADMIN WRITE PATH rather
 * than by inserting a ledger row: `_coin_balance` is a sum over
 * `coin_transactions`, and a hand-written row is a fixture the producer could
 * not emit. `weekly_wage` is a flat `award`, which is the plainest positive
 * category in the list; `extra_credit` is refused by `coin_log_transaction`
 * itself (it has its own capped RPC), which is the schema working.
 */
async function grantCoins(handle: TestDb, admin: SeededUser, email: string, times: number) {
	await handle.sql(
		`insert into public.app_admins (email, granted_by) values ($1, $1)
		 on conflict (email) do nothing`,
		[admin.email]
	);
	for (let i = 0; i < times; i += 1) {
		await handle.asUser(admin.id, (q) =>
			q(
				`select public.coin_log_transaction(
					p_email => $1, p_category_id => 'weekly_wage', p_note => 'seed', p_medium => 'digital'
				)`,
				[email]
			)
		);
	}
}

beforeAll(async () => {
	db = await startTestDb(PRE_0186);
	const world = await seedWorld(db);
	teacher = world.teacher;
	ana = world.ana;
	sectionId = world.sectionId;
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// Before the migration: the world 0186 has to survive.
// ---------------------------------------------------------------------------

describe('before 0186, any https host is accepted', () => {
	test('a YouTube link files a request', async () => {
		const res = await submitOn(db, sectionId, ana, REFUSED_NOT_SPOTIFY[0]);
		// THE PREMISE OF EVERY LEGACY-ROW ASSERTION BELOW. If this stopped being
		// true, "the migration left the old rows approvable" would be a claim
		// about rows that were never there.
		expect(res.ok).toBe(true);
		expect(res.request_id).toBeTruthy();
	});
});

describe('after 0186', () => {
	let legacyRequestId: string;

	beforeAll(async () => {
		// One legacy row, filed under the OLD rule, left PENDING across the apply.
		await db.sql('delete from public.classroom_song_requests');
		const legacy = await submitOn(db, sectionId, ana, 'https://music.youtube.com/watch?v=abc');
		expect(legacy.ok).toBe(true);
		legacyRequestId = legacy.request_id!;
		await db.sql(SQL_0186);
		await grantCoins(db, teacher, ana.email, 20);
	}, 120_000);

	beforeEach(async () => {
		await db.sql(
			'delete from public.classroom_song_requests where id <> $1::uuid',
			[legacyRequestId]
		);
	});

	// -----------------------------------------------------------------------
	// What is accepted, and what is not.
	// -----------------------------------------------------------------------

	test.each(ACCEPTED)('accepts %s', async (url) => {
		const res = await submitOn(db, sectionId, ana, url);
		expect(res.ok).toBe(true);
	});

	test.each(REFUSED_NOT_SPOTIFY)('refuses %s as not_spotify', async (url) => {
		const res = await submitOn(db, sectionId, ana, url);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not_spotify');
	});

	test.each(REFUSED_BAD_URL)('refuses %s as bad_url, one step earlier', async (url) => {
		// THE ORDER OF THE TWO REFUSALS IS ITSELF THE CONTRACT. Somebody who
		// pasted something that is not a link at all must be told THAT, not told
		// their link is not Spotify -- which would send them to find a Spotify
		// link and paste it just as wrongly.
		const res = await submitOn(db, sectionId, ana, url);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('bad_url');
	});

	test('the sweeps above are not empty', () => {
		// A `test.each` over an empty array generates NO tests and reports a clean
		// file, which is the shape this repo asks every generated sweep to refuse.
		expect(ACCEPTED.length).toBe(15);
		expect(REFUSED_NOT_SPOTIFY.length).toBe(8);
		expect(REFUSED_BAD_URL.length).toBe(3);
	});

	// -----------------------------------------------------------------------
	// The coin. This is the part of the bundle that touches money.
	// -----------------------------------------------------------------------

	test('a refused link writes no row at all', async () => {
		const before = await rowCount(db);
		const res = await submitOn(db, sectionId, ana, 'https://music.youtube.com/watch?v=xyz');
		expect(res.ok).toBe(false);
		// NOT "the row is pending" and NOT "the row is rejected": there is NO
		// row. That is the whole mechanism by which a refused link can never
		// reach the charge -- `classroom_song_approve` takes a request id, and a
		// refusal never mints one.
		expect(await rowCount(db)).toBe(before);
		expect(res.request_id).toBeUndefined();
	});

	test('a refused link leaves the balance untouched', async () => {
		const before = await balanceOn(db, ana.email);
		for (const url of REFUSED_NOT_SPOTIFY) {
			const res = await submitOn(db, sectionId, ana, url);
			expect(res.ok).toBe(false);
		}
		expect(await balanceOn(db, ana.email)).toBe(before);
	});

	test('POSITIVE CONTROL: an accepted link, once approved, does move it', async () => {
		// So "unchanged" above cannot be passing because this file is reading a
		// column nothing writes, or measuring a student nobody charges.
		const before = await balanceOn(db, ana.email);
		const res = await submitOn(db, sectionId, ana, ACCEPTED[0]);
		expect(res.ok).toBe(true);
		const decided = await approveOn(db, teacher, res.request_id!);
		expect(decided.ok).toBe(true);
		expect(decided.charged).toBe(2);
		expect(await balanceOn(db, ana.email)).toBe(before - 2);
	});

	// -----------------------------------------------------------------------
	// The rows that were already there.
	// -----------------------------------------------------------------------

	test('a request filed before the rule is still approvable, and still charges', async () => {
		// THE CHECK CONSTRAINT IS THE HAZARD HERE, not the RPC. A CHECK is
		// re-evaluated on UPDATE, and this is the UPDATE. Had the rule been
		// written into `_classroom_song_url_ok` instead of beside it, this would
		// raise a constraint violation at an instructor mid-queue.
		const before = await balanceOn(db, ana.email);
		const decided = await approveOn(db, teacher, legacyRequestId);
		expect(decided.ok).toBe(true);
		expect(decided.charged).toBe(2);
		expect(await balanceOn(db, ana.email)).toBe(before - 2);
	});

	test('the containment predicate and the table CHECK were not narrowed', async () => {
		// Stated structurally as well as behaviourally: the reason the legacy row
		// above survives is that these two did not move, and a future file that
		// moved them would break that row without breaking the test above until
		// somebody happened to have a pending one.
		const { rows } = await db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = '_classroom_song_url_ok'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].src.toLowerCase()).not.toContain('spotify');

		const { rows: cons } = await db.sql<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint
			 where conrelid = 'public.classroom_song_requests'::regclass and contype = 'c'`
		);
		const urlCheck = cons.map((c) => c.def).filter((d) => d.includes('_classroom_song_url_ok'));
		expect(urlCheck).toHaveLength(1);
		expect(urlCheck[0].toLowerCase()).not.toContain('spotify');
	});

	test('the rule is asked before the insert, in the request path only', async () => {
		const { rows } = await db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_song_request'`
		);
		expect(rows).toHaveLength(1);
		const src = rows[0].src;
		expect(src.indexOf('_classroom_song_url_is_spotify')).toBeGreaterThan(-1);
		// ABOVE the insert. Below it, the row would exist and be chargeable.
		expect(src.indexOf('_classroom_song_url_is_spotify')).toBeLessThan(
			src.indexOf('insert into public.classroom_song_requests')
		);

		// AND NOT IN THE APPROVE PATH. A copy there would be a second place the
		// rule is stated, and the place where stating it costs a legacy row.
		const { rows: appr } = await db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_song_approve'`
		);
		expect(appr).toHaveLength(1);
		expect(appr[0].src).not.toContain('_classroom_song_url_is_spotify');
	});

	test('the predicate is reachable by no client role', async () => {
		const { rows } = await db.sql<{ a: boolean; b: boolean }>(
			`select has_function_privilege('anon', 'public._classroom_song_url_is_spotify(text)', 'execute') as a,
			        has_function_privilege('authenticated', 'public._classroom_song_url_is_spotify(text)', 'execute') as b`
		);
		expect(rows[0].a).toBe(false);
		expect(rows[0].b).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// THE MUTATION. A throwaway database, the rule switched off in the PERMISSIVE
// direction, and the same refused link driven all the way to the charge.
// ---------------------------------------------------------------------------

describe('the charge path, opened', () => {
	test('with the Spotify rule removed, the refused link DOES take the coins', async () => {
		const mutant = await startTestDb(PRE_0186);
		try {
			const world = await seedWorld(mutant);
			await mutant.sql(SQL_0186);
			await grantCoins(mutant, world.teacher, world.ana.email, 20);

			// Sanity: with the file applied as written, the link is refused.
			const refused = await submitOn(mutant, world.sectionId, world.ana, REFUSED_NOT_SPOTIFY[0]);
			expect(refused.ok).toBe(false);
			expect(refused.reason).toBe('not_spotify');

			// THE MUTATION, in the permissive direction: the policy predicate now
			// answers true for everything, which is the feature switched off. The
			// containment predicate, the constraint, the ordering and the charge
			// are all untouched, so the ONLY thing that changed is the rule this
			// bundle added.
			await mutant.sql(
				`create or replace function public._classroom_song_url_is_spotify(p_url text)
				 returns boolean language sql immutable as $$ select true $$`
			);

			const before = await balanceOn(mutant, world.ana.email);
			const res = await submitOn(mutant, world.sectionId, world.ana, REFUSED_NOT_SPOTIFY[0]);
			expect(res.ok).toBe(true);
			const decided = await approveOn(mutant, world.teacher, res.request_id!);
			expect(decided.ok).toBe(true);
			expect(decided.charged).toBe(2);

			// THE READING THAT MAKES THE OTHER TEST MEAN SOMETHING. The balance
			// moves by the full price here, so "unchanged" over there is the rule
			// holding rather than the measurement being blind.
			expect(await balanceOn(mutant, world.ana.email)).toBe(before - 2);
		} finally {
			await mutant.stop();
		}
	}, 180_000);
});
