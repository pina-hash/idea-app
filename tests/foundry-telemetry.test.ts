// tests/foundry-telemetry.test.ts
//
// IDEA FOUNDRY TELEMETRY (0139), the guarantees whose regression would be
// SILENT.
//
// This is not a feature-correctness suite. What is asserted here is the set of
// boundaries that fail INVISIBLY if they break, which on this feature is
// mostly one boundary said several ways: NOBODY SEES ANOTHER STUDENT'S PLAY
// HISTORY. A leak there does not throw, does not look wrong on screen and does
// not fail a type check -- it is simply a number, or a row, in front of a
// person who should not have it.
//
// The rest of the file covers the three things that are silently WRONG rather
// than silently open: a play recorded for something that is not the published
// build (which puts staff review runs in a student's popularity figure), a
// rate limit that stops holding (which turns one session into a thousand
// rows), and a duration that reads zero because the tab was closed instead of
// stopped -- which is the NORMAL way a play ends, so getting it wrong would be
// wrong for most of the data.
//
// EVERY DENIAL IS PAIRED WITH A POSITIVE CONTROL. Each refusal below has a
// sibling asserting the same call from the permitted caller lands, because a
// scan that comes back clean because it was pointed at the wrong thing reads
// exactly like a scan that came back clean.
//
// ---------------------------------------------------------------------------
// WIDENED BY 0204, NOT REPLACED, AND THE BOUNDARY IT PROVES HAS MOVED ONCE.
//
// Mr. Pina answered decision 07 PUBLIC on 2026-09-12, so the three metrics
// that were owner-only -- `players`, `seconds_played`, `last_played_at` --
// now answer any signed-in caller who can see the app. THAT IS A DELIBERATE
// NARROWING OF WHAT THIS FILE GUARDS, and the sentence that survives it is
// the one that still matters:
//
//     PUBLIC MEANS AGGREGATE. A student may read how much an APP has been
//     played. A student may never read how much ANOTHER NAMED STUDENT has
//     played it.
//
// So the peer controls below are stronger than the ones they replace rather
// than weaker. The old test asked "does a peer get null"; a peer gets numbers
// now, so asking that again would prove nothing. What is asked instead is
// that the numbers a peer gets are the SAME numbers everyone gets -- an
// aggregate over every player -- and that no call, in any shape, hands back a
// figure attributable to one named person. The fixtures are built so a leak
// would be VISIBLE as a wrong number rather than as an extra column: two
// players with deliberately DIFFERENT durations, so an aggregate and one
// person's share are different integers and a function returning the wrong
// one cannot coincidentally agree.
//
// THE n=1 CASE IS ACCEPTED AND IS NOT A DEFECT. On an app one person has
// played, the public aggregate is that person's own figure. Mr. Pina was
// asked precisely this and said it is fine; there is no threshold here and a
// test asserting one would be asserting against the decision.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

/**
 * The Foundry chain as production has it, with 0139 on the end and 0137 after
 * it -- the sweep goes last in every chain because it is a sweep over whatever
 * the chain above it created. 0139's own functions revoke for themselves (a
 * function created after 0137 is not covered by it), so the sweep is a no-op
 * here; running it anyway is what proves that.
 */
const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0094_notebook_classroom_sections.sql',
	'0101_classroom_decks.sql',
	'0130_foundry.sql',
	'0131_foundry_service_role_writes.sql',
	'0132_foundry_author_class.sql',
	'0136_foundry_delete.sql',
	'0139_foundry_telemetry.sql',
	'0141_foundry_app_cap_and_download.sql',
	'0173_foundry_section_gate_description_and_trust.sql',
	'0204_foundry_description_optional_and_public_play_stats.sql',
	'0137_anon_execute_sweep.sql'
] as const;

/**
 * THE SAME CHAIN STOPPING AT 0173, which is the world as it was the moment
 * before this bundle. It exists for ONE reason and it is the reason a
 * before-and-after is a measurement rather than an assertion: 0204 REMOVES a
 * gate, and a test that only checks the gate is gone passes identically on a
 * database where the gate was never there. This chain is where the gate is
 * asked, and where it answers.
 */
const MIGRATIONS_BEFORE_0204 = MIGRATIONS.filter(
	(m) => m !== '0204_foundry_description_optional_and_public_play_stats.sql'
);

/** The pinned owner constant from 0067. is_admin() self-heals to it. */
const OWNER_EMAIL = 'apina@boscotech.edu';

let db: TestDb;
let owner: SeededUser;
let admin: SeededUser;

/** A fresh author per app: the five-app cap is real and enforced per person. */
let seq = 0;
async function author(): Promise<SeededUser> {
	seq += 1;
	return createUser(db, `player${seq}@boscotech.net`, `Player ${seq}`);
}

async function createApp(as: SeededUser, slug: string): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3) as r`,
			[slug, 'Test app', 'Plain HTML and a bit of JavaScript. No framework.']
		);
		return rows[0].r.app_id;
	});
}

async function createVersion(as: SeededUser, appId: string, zip: string): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, zip]
		);
		return rows[0].r.version_id;
	});
}

/** Create, upload, submit and approve: an app with a live published build. */
async function publishedApp(
	as: SeededUser,
	slug: string
): Promise<{ appId: string; versionId: string }> {
	const appId = await createApp(as, slug);
	const versionId = await createVersion(as, appId, `uploads/${slug}/v1.zip`);
	await db.asUser(as.id, (q) =>
		q(`select public.foundry_submit_version($1::uuid)`, [versionId])
	);
	await db.asUser(admin.id, (q) =>
		q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [versionId])
	);
	return { appId, versionId };
}

interface StartResult {
	ok: boolean;
	play_id?: string;
	resumed?: boolean;
	reason?: string;
}

async function start(as: SeededUser, appId: string, versionId: string): Promise<StartResult> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: StartResult }>(
			`select public.foundry_play_start($1::uuid, $2::uuid) as r`,
			[appId, versionId]
		);
		return rows[0].r;
	});
}

async function ping(as: SeededUser, playId: string): Promise<{ ok: boolean; reason?: string }> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { ok: boolean; reason?: string } }>(
			`select public.foundry_play_ping($1::uuid) as r`,
			[playId]
		);
		return rows[0].r;
	});
}

interface Stats {
	plays: number;
	players: number;
	seconds_played: number;
	last_played_at: string | null;
}

async function stats(as: SeededUser, appId: string): Promise<Stats | null> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: Stats | null }>(
			`select public.foundry_app_play_stats($1::uuid) as r`,
			[appId]
		);
		return rows[0].r;
	});
}

/** What `foundry_my_play_stats` (0204) hands back. One caller's own figures. */
interface MyStats {
	plays: number;
	seconds_played: number;
	first_played_at: string | null;
	last_played_at: string | null;
}

/**
 * 0204. THE CALLER-SCOPED READ. Note the shape of this helper: it takes WHO
 * is asking and WHICH APP, and there is no third argument, because the
 * function has no third parameter. That is the boundary -- there is no call
 * anybody can write that names another player.
 */
async function myStats(as: SeededUser, appId: string): Promise<MyStats | null> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: MyStats | null }>(
			`select public.foundry_my_play_stats($1::uuid) as r`,
			[appId]
		);
		return rows[0].r;
	});
}

/** A play row given a known duration, so an aggregate and one share differ. */
async function stretch(playId: string, seconds: number): Promise<void> {
	await db.sql(
		`update public.student_app_plays
		    set last_seen_at = started_at + make_interval(secs => $2)
		  where id = $1`,
		[playId, seconds]
	);
}

/** An app with an uploaded draft and NO published version. */
async function draftApp(
	as: SeededUser,
	slug: string
): Promise<{ appId: string; versionId: string }> {
	const appId = await createApp(as, slug);
	const versionId = await createVersion(as, appId, `uploads/${slug}/v1.zip`);
	return { appId, versionId };
}

/** Rows in the table, read as the connection owner (which bypasses RLS). */
async function rowCount(appId: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*) as n from public.student_app_plays where app_id = $1`,
		[appId]
	);
	return Number(rows[0].n);
}

/** Moves a play row back in time. Seeding, as the owner: there is no RPC for it. */
async function backdate(playId: string, interval: string): Promise<void> {
	await db.sql(
		`update public.student_app_plays
		    set started_at = started_at - $2::interval,
		        last_seen_at = last_seen_at - $2::interval
		  where id = $1`,
		[playId, interval]
	);
}

/** The message Postgres actually produced, so a report can quote it. */
async function refusal(fn: () => Promise<unknown>): Promise<string> {
	try {
		await fn();
	} catch (err) {
		return (err as Error).message;
	}
	throw new Error('expected a refusal, but the call succeeded');
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	owner = await createUser(db, OWNER_EMAIL, 'Owner Account');
	admin = await createUser(db, 'reviewer@boscotech.edu', 'Reviewing Admin');
	await db.asUser(owner.id, (q) => q(`select public.admin_grant($1, null)`, [admin.email]));
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// THE BOUNDARY. Nobody sees another student's play history.
// ---------------------------------------------------------------------------

describe('0139 // nobody sees another student\'s play history', () => {
	it('refuses every client role a direct read of the play table, with the rows demonstrably there', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'direct-read-app');
		await start(bob, appId, versionId);

		// POSITIVE CONTROL FIRST: the row really exists, so a refusal below is a
		// refusal about access and not about an empty table.
		expect(await rowCount(appId)).toBe(1);

		const asAuthor = await refusal(() =>
			db.asUser(alice.id, (q) => q(`select * from public.student_app_plays`))
		);
		expect(asAuthor).toMatch(/permission denied/i);

		const asOtherStudent = await refusal(() =>
			db.asUser(bob.id, (q) => q(`select * from public.student_app_plays`))
		);
		expect(asOtherStudent).toMatch(/permission denied/i);

		// AN ADMIN TOO. There is no per-play read for anybody, which is what
		// makes "no player detail" structural rather than an omission from a UI.
		const asAdmin = await refusal(() =>
			db.asUser(admin.id, (q) => q(`select * from public.student_app_plays`))
		);
		expect(asAdmin).toMatch(/permission denied/i);

		const asAnon = await refusal(() =>
			db.asAnon((q) => q(`select * from public.student_app_plays`))
		);
		expect(asAnon).toMatch(/permission denied/i);
	});

	it('carries no policy and no client grant: both refusals are in place, not one', async () => {
		const { rows: policies } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_policies
			  where schemaname = 'public' and tablename = 'student_app_plays'`
		);
		expect(Number(policies[0].n)).toBe(0);

		const { rows: rls } = await db.sql<{ on: boolean }>(
			`select c.relrowsecurity as "on" from pg_class c
			   join pg_namespace n on n.oid = c.relnamespace
			  where n.nspname = 'public' and c.relname = 'student_app_plays'`
		);
		expect(rls[0].on).toBe(true);

		const { rows: grants } = await db.sql<{ anon: boolean; auth: boolean; svc: boolean }>(
			`select has_table_privilege('anon', 'public.student_app_plays', 'SELECT') as anon,
			        has_table_privilege('authenticated', 'public.student_app_plays', 'SELECT') as auth,
			        has_table_privilege('service_role', 'public.student_app_plays', 'SELECT') as svc`
		);
		expect(grants[0].anon).toBe(false);
		expect(grants[0].auth).toBe(false);
		// `service_role` IS THE ONE 0139 SAID IT HAD CLOSED AND HAD NOT.
		// Its comment reads "`service_role` gets nothing either, and that is
		// deliberate"; its table revoke then names `anon, authenticated` and
		// stops, while all five of its FUNCTION revokes in the same file name
		// `service_role` too. So the role held SELECT from 0139 until 0204,
		// and the reason nothing reported it is that this very assertion
		// tested the two client roles only. 0204 section 4 closes it.
		expect(grants[0].svc).toBe(false);

		// AND NO OTHER ROLE HOLDS ANY PRIVILEGE ON IT EITHER, asked of the
		// ACL rather than of three names somebody remembered to list -- which
		// is how the gap above survived. The table's own owner is the one
		// entry left, and it is what the definer functions run as.
		const { rows: acl } = await db.sql<{ grantee: string; priv: string }>(
			`select grantee, privilege_type as priv
			   from information_schema.role_table_grants
			  where table_schema = 'public' and table_name = 'student_app_plays'
			    and grantee not in ('PUBLIC')
			  order by grantee, privilege_type`
		);
		expect(acl.filter((r) => ['anon', 'authenticated', 'service_role'].includes(r.grantee)))
			.toEqual([]);
	});

	/**
	 * 0204 MOVED THIS ONE, AND IT IS THE ONLY ASSERTION IN THIS FILE THE
	 * BUNDLE CHANGED. It used to read "answers a non-owner NULL from the
	 * aggregate". Decision 07 is answered public, so a non-owner who can see
	 * the app answers with NUMBERS now, and the refusals that survive are the
	 * ones about WHICH APP rather than about who is asking.
	 */
	it('answers a peer the aggregate for an app they can see, and NULL for one they cannot', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'aggregate-gate-app');
		await start(bob, appId, versionId);

		// THE WIDENING. A peer who is not the author and not staff gets the
		// aggregate for a PUBLISHED app.
		const peer = await stats(bob, appId);
		expect(peer?.plays).toBe(1);
		expect(peer?.players).toBe(1);

		// ...and it is the SAME answer the author and staff get, which is the
		// whole claim of "public means aggregate": there is no second, richer
		// view behind the old gate for anybody to be given.
		expect(await stats(alice, appId)).toEqual(peer);
		expect(await stats(admin, appId)).toEqual(peer);

		// THE REFUSALS THAT SURVIVE, and they are about the APP. An
		// UNPUBLISHED app is its author's alone, exactly as it was.
		const draft = await draftApp(alice, 'aggregate-gate-draft');
		expect(await stats(bob, draft.appId)).toBeNull();
		// POSITIVE CONTROL: its author still reads it, so the null is the
		// population gate and not the function having stopped working.
		expect((await stats(alice, draft.appId))?.plays).toBe(0);
		// ...and an admin reads it, which is the second half of the predicate.
		expect((await stats(admin, draft.appId))?.plays).toBe(0);

		// A HIDDEN app is staff's alone, and hiding it takes it away from the
		// AUTHOR too -- which is the population predicate, not a new rule.
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, null)`, [appId])
		);
		expect(await stats(bob, appId)).toBeNull();
		expect(await stats(alice, appId)).toBeNull();
		expect((await stats(admin, appId))?.plays).toBe(1);
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, false, null)`, [appId])
		);
		expect((await stats(bob, appId))?.plays).toBe(1);

		// AND A NONEXISTENT APP IS INDISTINGUISHABLE FROM ONE OUTSIDE THE
		// POPULATION. Both null, so an id still cannot be probed.
		const nowhere = await db.asUser(bob.id, async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.foundry_app_play_stats(gen_random_uuid()) as r`
			);
			return rows[0].r;
		});
		expect(nowhere).toBeNull();
	});

	it('exposes no player column anywhere a client can reach, in either read function', async () => {
		const { rows } = await db.sql<{ name: string }>(
			`select a.attname as name
			   from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			   join lateral unnest(p.proargnames) with ordinality as a(attname, ord) on true
			  where n.nspname = 'public'
			    and p.proname in ('foundry_play_counts', 'foundry_app_play_stats')`
		);
		const names = rows.map((r) => r.name);
		// The sweep must have found something, or "no player column" is vacuous.
		expect(names.length).toBeGreaterThan(0);
		expect(names.some((n) => /player|owner|uid|email|user/i.test(n))).toBe(false);

		// `foundry_play_counts` returns exactly three columns and none of them
		// is about a person. Asserted from the catalog rather than from the file.
		const { rows: cols } = await db.sql<{ names: string[] }>(
			`select p.proargnames as names from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'foundry_play_counts'`
		);
		expect(cols[0].names).toEqual([
			'p_include_hidden',
			'p_include_unpublished',
			'app_id',
			'plays',
			'plays_7d'
		]);
	});

	it('refuses a ping against somebody else\'s play, and accepts the player\'s own', async () => {
		const alice = await author();
		const bob = await author();
		const carol = await author();
		const { appId, versionId } = await publishedApp(alice, 'ping-gate-app');
		const r = await start(bob, appId, versionId);
		expect(r.ok).toBe(true);

		// Carol holds Bob's play id and cannot extend his session.
		expect(await ping(carol, r.play_id!)).toEqual({ ok: false, reason: 'unknown' });
		// The AUTHOR of the app cannot either: owning the app is not owning the
		// play, and there is no staff exception here for the same reason.
		expect(await ping(alice, r.play_id!)).toEqual({ ok: false, reason: 'unknown' });
		expect(await ping(admin, r.play_id!)).toEqual({ ok: false, reason: 'unknown' });

		// POSITIVE CONTROL: Bob's own ping lands.
		expect(await ping(bob, r.play_id!)).toEqual({ ok: true });
	});

	// -----------------------------------------------------------------------
	// 0204, DECISION 07. All THREE owner-only metrics, named one at a time.
	// -----------------------------------------------------------------------

	/**
	 * THE THREE ARE NAMED INDIVIDUALLY AND ON PURPOSE. Decision 07's title
	 * says "the two owner-only metrics" and there are THREE: `players`,
	 * `seconds_played` and `last_played_at`. (`plays`, the fourth scalar, was
	 * never owner-only -- `foundry_play_counts` has answered it to any
	 * signed-in caller since 0139 and it is on the gallery cards.) Widening
	 * two and leaving one is the failure mode this bundle was written
	 * against, and it would pass any assertion phrased over the object as a
	 * whole, because the object still has all four keys either way. So each
	 * one gets its own expectation against its own known-correct number.
	 */
	it('answers a peer all THREE formerly owner-only metrics, each named and each correct', async () => {
		const alice = await author();
		const bob = await author();
		const carol = await author();
		const dave = await author();
		const { appId, versionId } = await publishedApp(alice, 'three-metrics-app');

		// TWO players, DIFFERENT durations, so the aggregate is not equal to
		// either share and a function handing back one person's figure cannot
		// coincidentally agree with the right answer.
		const b = await start(bob, appId, versionId);
		await stretch(b.play_id!, 300);
		const c = await start(carol, appId, versionId);
		await stretch(c.play_id!, 60);

		const peer = await stats(dave, appId);
		expect(peer).not.toBeNull();

		// ONE. players.
		expect(peer!.players).toBe(2);
		// TWO. seconds_played -- the SUM, 300 + 60, and not either share.
		expect(Number(peer!.seconds_played)).toBe(360);
		expect(Number(peer!.seconds_played)).not.toBe(300);
		expect(Number(peer!.seconds_played)).not.toBe(60);
		// THREE. last_played_at.
		expect(peer!.last_played_at).not.toBeNull();

		// The already-public fourth scalar, so the set is complete and the
		// three above are not being compared against a broken object.
		expect(peer!.plays).toBe(2);

		// THE PEER CONTROL. Dave, Bob and Carol are four different accounts
		// and every one of them reads the IDENTICAL aggregate -- so no
		// caller is being handed a figure that is about them, and no caller
		// is being handed a figure that is about somebody else. A leak in
		// either direction changes one of these objects and reddens here.
		const fromBob = await stats(bob, appId);
		const fromCarol = await stats(carol, appId);
		const fromAuthor = await stats(alice, appId);
		const fromStaff = await stats(admin, appId);
		expect(fromBob).toEqual(peer);
		expect(fromCarol).toEqual(peer);
		expect(fromAuthor).toEqual(peer);
		expect(fromStaff).toEqual(peer);
	});

	/**
	 * THE BEFORE-AND-AFTER, on a SECOND database carrying the same chain
	 * stopping at 0173. A test that only asserts the gate is open passes
	 * identically on a database where the gate was never there, so this is
	 * what makes "0204 opened it" a measurement instead of a claim.
	 */
	it('measures the gate CLOSED on the chain through 0173 and OPEN with 0204 over it', async () => {
		const before = await startTestDb(MIGRATIONS_BEFORE_0204);
		try {
			const ownerB = await createUser(before, OWNER_EMAIL, 'Owner Account');
			const adminB = await createUser(before, 'reviewer@boscotech.edu', 'Reviewing Admin');
			await before.asUser(ownerB.id, (q) =>
				q(`select public.admin_grant($1, null)`, [adminB.email])
			);
			const alice = await createUser(before, 'before-a@boscotech.net', 'Before Alice');
			const bob = await createUser(before, 'before-b@boscotech.net', 'Before Bob');

			// 0173 REFUSES A SUBMIT WITH NO DESCRIPTION, which is decision 05
			// and is the other half of this bundle. The app has to carry one
			// here just to reach a published state, and that refusal is
			// measured in its own file.
			const { rows: mk } = await before.asUser(alice.id, (q) =>
				q<{ r: { app_id: string } }>(
					`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
					['before-gate', 'Before app', 'Plain HTML.', 'A description, because 0173 demands one.']
				)
			);
			const appId = mk[0].r.app_id;
			const { rows: mv } = await before.asUser(alice.id, (q) =>
				q<{ r: { version_id: string } }>(
					`select public.foundry_create_version($1::uuid, $2) as r`,
					[appId, 'uploads/before-gate/v1.zip']
				)
			);
			const versionId = mv[0].r.version_id;
			await before.asUser(alice.id, (q) =>
				q(`select public.foundry_submit_version($1::uuid)`, [versionId])
			);
			await before.asUser(adminB.id, (q) =>
				q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [versionId])
			);
			await before.asUser(bob.id, (q) =>
				q(`select public.foundry_play_start($1::uuid, $2::uuid)`, [appId, versionId])
			);

			// THE GATE, CLOSED. A peer gets null on the chain through 0173.
			const { rows: peerBefore } = await before.asUser(bob.id, (q) =>
				q<{ r: unknown }>(`select public.foundry_app_play_stats($1::uuid) as r`, [appId])
			);
			expect(peerBefore[0].r).toBeNull();

			// POSITIVE CONTROL on the same database: the author does get
			// numbers, so the null above is the gate and not a broken fixture.
			const { rows: mineBefore } = await before.asUser(alice.id, (q) =>
				q<{ r: Stats }>(`select public.foundry_app_play_stats($1::uuid) as r`, [appId])
			);
			expect(mineBefore[0].r.plays).toBe(1);

			// AND THE CALLER-SCOPED READ DOES NOT EXIST YET, which is the
			// other thing 0204 adds.
			const { rows: fn } = await before.sql<{ n: string }>(
				`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = 'foundry_my_play_stats'`
			);
			expect(Number(fn[0].n)).toBe(0);
		} finally {
			await before.stop();
		}
	}, 120_000);

	it('withholds every telemetry function from anon and holds them for authenticated', async () => {
		const { rows } = await db.sql<{ name: string; anon: boolean; auth: boolean }>(
			`select p.proname as name,
			        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
			        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('foundry_play_start', 'foundry_play_ping',
			                      'foundry_play_counts', 'foundry_app_play_stats',
			                      'foundry_my_play_stats', '_foundry_play_window')`
		);
		// SIX since 0204 added the caller-scoped read. The count is asserted
		// so a function that silently failed to be created cannot pass this
		// sweep by simply not being in the result set.
		expect(rows.length).toBe(6);
		for (const row of rows) {
			expect([row.name, row.anon]).toEqual([row.name, false]);
			// The private helper is granted to nobody; the four RPCs to
			// authenticated.
			expect([row.name, row.auth]).toEqual([
				row.name,
				row.name !== '_foundry_play_window'
			]);
		}
	});
});

// ---------------------------------------------------------------------------
// 0204. A STUDENT READS THEIR OWN PLAYTIME, AND NOBODY ELSE'S.
//
// Mr. Pina: "if I play twenty hours of cookie clicker I should see my
// playstats." Before 0204 there was no caller-scoped door on this table at
// all -- four functions, none of them scoped to the caller's own rows.
//
// THE BOUNDARY IS THE SIGNATURE, which is why the first test here is about
// the catalog rather than about behaviour: a function with no identity
// parameter has no call anybody can write that names another player, so
// "can only read their own" is structural rather than a check that could be
// got wrong. The behavioural tests are the second layer.
// ---------------------------------------------------------------------------

describe('0204 // a student reads their own playtime and nobody else\'s', () => {
	it('takes no identity parameter, so there is no call shape that names another player', async () => {
		const { rows } = await db.sql<{ names: string[] | null; n: string }>(
			`select p.proargnames as names, count(*) over () as n
			   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			  where ns.nspname = 'public' and p.proname = 'foundry_my_play_stats'`
		);
		// THE SIGNATURE TRAP. Exactly one row, so no old arity survives beside
		// the new one.
		expect(rows.length).toBe(1);
		expect(rows[0].names).toEqual(['p_app_id']);
		// Said the other way, because the list above is the thing a later
		// widening edits: nothing in the signature is about a person.
		expect(
			(rows[0].names ?? []).some((n) => /player|owner|uid|email|user|student/i.test(n))
		).toBe(false);
	});

	it('answers each player their OWN figures, and the two players disagree', async () => {
		const alice = await author();
		const bob = await author();
		const carol = await author();
		const { appId, versionId } = await publishedApp(alice, 'my-stats-app');

		const b = await start(bob, appId, versionId);
		await stretch(b.play_id!, 1200);
		const c = await start(carol, appId, versionId);
		await stretch(c.play_id!, 45);

		const bobsOwn = await myStats(bob, appId);
		const carolsOwn = await myStats(carol, appId);

		// EACH READS THEIR OWN. The numbers are deliberately different, so a
		// function that handed either of them the aggregate, or the other
		// person's share, produces a WRONG NUMBER here rather than a
		// plausible one.
		expect(Number(bobsOwn!.seconds_played)).toBe(1200);
		expect(Number(carolsOwn!.seconds_played)).toBe(45);
		expect(bobsOwn!.plays).toBe(1);
		expect(carolsOwn!.plays).toBe(1);

		// THE PEER CONTROL, AND IT IS THE WHOLE POINT OF THIS FILE. Bob's
		// figure is NOT Carol's, and neither is the aggregate. If a peer's
		// row leaked into this answer, one of these three is what changes.
		expect(Number(bobsOwn!.seconds_played)).not.toBe(Number(carolsOwn!.seconds_played));
		const everyone = await stats(bob, appId);
		expect(Number(everyone!.seconds_played)).toBe(1245);
		expect(Number(bobsOwn!.seconds_played)).not.toBe(Number(everyone!.seconds_played));

		// THE AUTHOR OF THE APP IS NOT EXEMPT. Owning the work is not owning
		// the play: Alice has played nothing, so Alice reads zeroes, and
		// there is no parameter through which she could ask about Bob.
		const authorsOwn = await myStats(alice, appId);
		expect(authorsOwn!.plays).toBe(0);
		expect(Number(authorsOwn!.seconds_played)).toBe(0);
		expect(authorsOwn!.first_played_at).toBeNull();
		expect(authorsOwn!.last_played_at).toBeNull();

		// AND NEITHER IS AN ADMIN, which is the same sentence about staff.
		// What an admin has that an author does not is OTHER APPS, never more
		// detail about one person.
		const staffOwn = await myStats(admin, appId);
		expect(staffOwn!.plays).toBe(0);
		expect(Number(staffOwn!.seconds_played)).toBe(0);
	});

	it('counts every session of the caller\'s own and spans them from first to last', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'my-stats-sessions');

		const one = await start(bob, appId, versionId);
		await stretch(one.play_id!, 100);
		// Outside the resume window, so this is a SECOND session rather than a
		// resumed one -- which is what makes `plays` two here.
		await backdate(one.play_id!, '2 hours');
		const two = await start(bob, appId, versionId);
		expect(two.resumed ?? false).toBe(false);
		await stretch(two.play_id!, 50);

		const own = await myStats(bob, appId);
		expect(own!.plays).toBe(2);
		expect(Number(own!.seconds_played)).toBe(150);
		expect(own!.first_played_at).not.toBeNull();
		expect(own!.last_played_at).not.toBeNull();
		// The span really is a span, and not one timestamp twice.
		expect(new Date(own!.first_played_at!).getTime()).toBeLessThan(
			new Date(own!.last_played_at!).getTime()
		);
	});

	it('follows the same population as the aggregate, so an id still cannot be probed', async () => {
		const alice = await author();
		const bob = await author();
		const draft = await draftApp(alice, 'my-stats-draft');

		// Bob cannot see the app, so he cannot ask about his own time in it
		// either -- and gets the same answer a nonexistent app gives.
		expect(await myStats(bob, draft.appId)).toBeNull();
		const nowhere = await db.asUser(bob.id, async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.foundry_my_play_stats(gen_random_uuid()) as r`
			);
			return rows[0].r;
		});
		expect(nowhere).toBeNull();

		// POSITIVE CONTROL: the author CAN, so the nulls above are the
		// population gate rather than the function refusing everybody.
		expect((await myStats(alice, draft.appId))?.plays).toBe(0);
	});

	it('refuses anon and holds for authenticated, with the roles named', async () => {
		const { rows } = await db.sql<{ anon: boolean; auth: boolean; svc: boolean }>(
			`select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
			        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
			        has_function_privilege('service_role', p.oid, 'EXECUTE') as svc
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'foundry_my_play_stats'`
		);
		expect(rows.length).toBe(1);
		// 0166's shape: revoked from anon BY NAME, because this project's
		// default privileges write a DIRECT anon grant at creation time that
		// `revoke ... from public` never touches. This is the assertion 0201
		// did not have.
		expect(rows[0].anon).toBe(false);
		expect(rows[0].auth).toBe(true);
		expect(rows[0].svc).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// WHAT COUNTS AS A PLAY.
// ---------------------------------------------------------------------------

describe('0139 // only the published build is a play', () => {
	it('refuses a draft and a submitted version, and records the published one', async () => {
		const alice = await author();
		const bob = await author();
		const appId = await createApp(alice, 'publication-gate-app');
		const draft = await createVersion(alice, appId, 'uploads/pub-gate/v1.zip');

		// A DRAFT: the owner testing their own upload is not a play.
		expect(await start(alice, appId, draft)).toEqual({ ok: false, reason: 'not_playable' });

		await db.asUser(alice.id, (q) =>
			q(`select public.foundry_submit_version($1::uuid)`, [draft])
		);
		// A SUBMITTED BUILD: a reviewer running it to decide about it is not a
		// play either. This is the database half of that; the review route
		// hands down no recording transport at all, which is the other half.
		expect(await start(admin, appId, draft)).toEqual({ ok: false, reason: 'not_playable' });
		expect(await rowCount(appId)).toBe(0);

		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [draft])
		);

		// POSITIVE CONTROL: the identical call, on the identical version, once
		// it is the app's published build.
		const r = await start(bob, appId, draft);
		expect(r.ok).toBe(true);
		expect(await rowCount(appId)).toBe(1);
	});

	it('refuses a hidden app and records the same app once it is restored', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'hidden-gate-app');

		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, 'under discussion')`, [appId])
		);
		expect(await start(bob, appId, versionId)).toEqual({ ok: false, reason: 'not_playable' });
		expect(await rowCount(appId)).toBe(0);

		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, false, null)`, [appId])
		);
		expect((await start(bob, appId, versionId)).ok).toBe(true);
		expect(await rowCount(appId)).toBe(1);
	});

	it('refuses a version that belongs to a different app', async () => {
		const alice = await author();
		const bob = await author();
		const a = await publishedApp(alice, 'cross-app-a');
		const b = await publishedApp(bob, 'cross-app-b');

		const carol = await author();
		expect(await start(carol, a.appId, b.versionId)).toEqual({
			ok: false,
			reason: 'not_playable'
		});
		expect(await rowCount(a.appId)).toBe(0);

		// POSITIVE CONTROL: the app's own version records.
		expect((await start(carol, a.appId, a.versionId)).ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// ONE ROW PER SESSION.
// ---------------------------------------------------------------------------

describe('0139 // the rate limit is the resume window', () => {
	it('mashing Launch writes one row, and a start outside the window writes a second', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'resume-window-app');

		const first = await start(bob, appId, versionId);
		expect(first.resumed).toBe(false);

		// Nine more presses. Every one resumes the row the first press made.
		for (let i = 0; i < 9; i += 1) {
			const again = await start(bob, appId, versionId);
			expect(again.ok).toBe(true);
			expect(again.resumed).toBe(true);
			expect(again.play_id).toBe(first.play_id);
		}
		expect(await rowCount(appId)).toBe(1);

		// POSITIVE CONTROL FOR THE OTHER DIRECTION: once the row falls out of
		// the window, a start is a new session rather than a resume. Without
		// this the assertion above would also pass on a function that never
		// inserted anything after the first row.
		await backdate(first.play_id!, '31 minutes');
		const later = await start(bob, appId, versionId);
		expect(later.resumed).toBe(false);
		expect(later.play_id).not.toBe(first.play_id);
		expect(await rowCount(appId)).toBe(2);
	});

	it('keeps two different people in two different sessions', async () => {
		const alice = await author();
		const bob = await author();
		const carol = await author();
		const { appId, versionId } = await publishedApp(alice, 'two-people-app');

		const b = await start(bob, appId, versionId);
		const c = await start(carol, appId, versionId);
		expect(c.resumed).toBe(false);
		expect(c.play_id).not.toBe(b.play_id);
		expect(await rowCount(appId)).toBe(2);

		const s = await stats(alice, appId);
		expect(s?.plays).toBe(2);
		expect(s?.players).toBe(2);
	});

	it('refuses a stale ping so the portal starts a fresh session instead of booking the gap', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'stale-ping-app');

		const r = await start(bob, appId, versionId);
		// POSITIVE CONTROL: fresh, so it lands.
		expect(await ping(bob, r.play_id!)).toEqual({ ok: true });

		await backdate(r.play_id!, '31 minutes');
		expect(await ping(bob, r.play_id!)).toEqual({ ok: false, reason: 'stale' });

		// AND THE REFUSAL DID NOT WRITE. A stale ping that extended the row
		// anyway is the exact defect this exists to prevent: it would book the
		// whole hidden gap as play time.
		const { rows } = await db.sql<{ secs: string }>(
			`select extract(epoch from (last_seen_at - started_at))::bigint as secs
			   from public.student_app_plays where id = $1`,
			[r.play_id!]
		);
		expect(Number(rows[0].secs)).toBeLessThan(5);
	});
});

// ---------------------------------------------------------------------------
// DURATION, INCLUDING THE NORMAL CASE OF NO CLEAN END.
// ---------------------------------------------------------------------------

describe('0139 // an abandoned session still has a duration', () => {
	it('measures a session with no clean end from its last heartbeat', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'abandoned-app');

		const r = await start(bob, appId, versionId);
		// Five minutes of heartbeats and then the tab closes: nothing marks the
		// end, and the row is never touched again.
		await db.sql(
			`update public.student_app_plays
			    set started_at = now() - interval '5 minutes'
			  where id = $1`,
			[r.play_id!]
		);

		const s = await stats(alice, appId);
		// 300 seconds, from last_seen_at alone. A design keyed on a clean end
		// would report 0 here, which is what most real plays would report.
		expect(s?.seconds_played).toBeGreaterThanOrEqual(299);
		expect(s?.seconds_played).toBeLessThanOrEqual(301);
		expect(s?.last_played_at).not.toBeNull();
	});

	it('reports zeroes rather than nulls for an app nobody has played', async () => {
		const alice = await author();
		const { appId } = await publishedApp(alice, 'never-played-app');
		const s = await stats(alice, appId);
		expect(s).toEqual({
			ok: true,
			app_id: appId,
			plays: 0,
			players: 0,
			seconds_played: 0,
			last_played_at: null
		});
	});
});

// ---------------------------------------------------------------------------
// THE GALLERY'S COUNTS.
// ---------------------------------------------------------------------------

describe('0139 // popularity counts are over apps and follow the caller\'s population', () => {
	async function counts(as: SeededUser): Promise<Map<string, { plays: number; recent: number }>> {
		return db.asUser(as.id, async (q) => {
			const { rows } = await q<{ app_id: string; plays: string; plays_7d: string }>(
				`select * from public.foundry_play_counts()`
			);
			return new Map(
				rows.map((r) => [r.app_id, { plays: Number(r.plays), recent: Number(r.plays_7d) }])
			);
		});
	}

	it('separates all-time from the last seven days', async () => {
		const alice = await author();
		const bob = await author();
		const carol = await author();
		const { appId, versionId } = await publishedApp(alice, 'seven-day-app');

		const old = await start(bob, appId, versionId);
		await backdate(old.play_id!, '9 days');
		const recent = await start(carol, appId, versionId);
		expect(recent.play_id).not.toBe(old.play_id);

		const seen = (await counts(carol)).get(appId);
		expect(seen).toEqual({ plays: 2, recent: 1 });
	});

	it('omits an app the caller could not see in the gallery, and includes one they could', async () => {
		const alice = await author();
		const stranger = await author();
		// Never published: in nobody's gallery but the owner's own list.
		const privateApp = await createApp(alice, 'unpublished-counts-app');
		const { appId: publicApp } = await publishedApp(alice, 'published-counts-app');

		const strangerSees = await counts(stranger);
		expect(strangerSees.has(privateApp)).toBe(false);
		// POSITIVE CONTROL: the published one IS in the same answer, so the
		// absence above is the population and not an empty result.
		expect(strangerSees.has(publicApp)).toBe(true);

		// And the owner sees their own unpublished app, which is what makes the
		// stranger's absence a rule about the caller rather than about the app.
		const ownerSees = await counts(alice);
		expect(ownerSees.has(privateApp)).toBe(true);
	});

	it('does not widen for a student who passes the admin flags', async () => {
		const alice = await author();
		const stranger = await author();
		const { appId } = await publishedApp(alice, 'flag-widening-app');
		await db.asUser(admin.id, (q) =>
			q(`select public.foundry_set_app_hidden($1::uuid, true, 'shelved')`, [appId])
		);

		const student = await db.asUser(stranger.id, async (q) => {
			const { rows } = await q<{ app_id: string }>(
				`select app_id from public.foundry_play_counts(true, true)`
			);
			return rows.map((r) => r.app_id);
		});
		expect(student).not.toContain(appId);

		// POSITIVE CONTROL: the same flags from an admin DO widen, so the
		// student's absence is the predicate refusing rather than the flags
		// being ignored by everybody.
		const staff = await db.asUser(admin.id, async (q) => {
			const { rows } = await q<{ app_id: string }>(
				`select app_id from public.foundry_play_counts(true, true)`
			);
			return rows.map((r) => r.app_id);
		});
		expect(staff).toContain(appId);
	});
});

// ---------------------------------------------------------------------------
// WHAT DELETION DOES TO A PLAY.
// ---------------------------------------------------------------------------

describe('0139 // deletion', () => {
	it('keeps the play when a version is deleted and drops it when the app is', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'delete-shape-app');

		// A second version, played, then deleted. The published one cannot be
		// deleted (0136 refuses it), which is why the play is hung on this one.
		const second = await createVersion(alice, appId, 'uploads/delete-shape/v2.zip');
		await start(bob, appId, versionId);
		await db.sql(`update public.student_app_plays set version_id = $1 where app_id = $2`, [
			second,
			appId
		]);

		await db.asUser(alice.id, (q) =>
			q(`select public.foundry_delete_version($1::uuid)`, [second])
		);
		// THE PLAY SURVIVES THE BUILD. A play is a fact about the APP, so
		// deleting an old version must not reduce the author's own count.
		expect(await rowCount(appId)).toBe(1);
		const { rows } = await db.sql<{ v: string | null }>(
			`select version_id as v from public.student_app_plays where app_id = $1`,
			[appId]
		);
		expect(rows[0].v).toBeNull();
		expect((await stats(alice, appId))?.plays).toBe(1);

		// THE APP IS THE OTHER ANSWER: the thing the record was about is gone.
		await db.asUser(alice.id, (q) => q(`select public.foundry_delete_app($1::uuid)`, [appId]));
		expect(await rowCount(appId)).toBe(0);
	});

	it('keeps a departed account\'s play as a play and stops counting it as a player', async () => {
		const alice = await author();
		const bob = await author();
		const carol = await author();
		const { appId, versionId } = await publishedApp(alice, 'departed-account-app');
		await start(bob, appId, versionId);
		await start(carol, appId, versionId);

		const before = await stats(alice, appId);
		expect(before).toMatchObject({ plays: 2, players: 2 });

		await db.sql(`delete from auth.users where id = $1`, [bob.id]);

		const after = await stats(alice, appId);
		// The stated cost of `on delete set null`, asserted rather than assumed.
		expect(after).toMatchObject({ plays: 2, players: 1 });
	});
});
