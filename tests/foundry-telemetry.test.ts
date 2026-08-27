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
	'0137_anon_execute_sweep.sql'
] as const;

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

		const { rows: grants } = await db.sql<{ anon: boolean; auth: boolean }>(
			`select has_table_privilege('anon', 'public.student_app_plays', 'SELECT') as anon,
			        has_table_privilege('authenticated', 'public.student_app_plays', 'SELECT') as auth`
		);
		expect(grants[0].anon).toBe(false);
		expect(grants[0].auth).toBe(false);
	});

	it('answers a non-owner NULL from the aggregate, and answers the author and an admin', async () => {
		const alice = await author();
		const bob = await author();
		const { appId, versionId } = await publishedApp(alice, 'aggregate-gate-app');
		await start(bob, appId, versionId);

		// THE REFUSAL. Same answer a nonexistent app gives, so an id cannot be
		// probed for existence.
		expect(await stats(bob, appId)).toBeNull();

		// POSITIVE CONTROLS: the author and staff both get real numbers, so the
		// null above is the gate and not an empty aggregate.
		const mine = await stats(alice, appId);
		expect(mine?.plays).toBe(1);
		expect(mine?.players).toBe(1);

		const staff = await stats(admin, appId);
		expect(staff?.plays).toBe(1);

		// AND A NONEXISTENT APP IS INDISTINGUISHABLE FROM ONE THAT IS NOT YOURS.
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

	it('withholds every telemetry function from anon and holds them for authenticated', async () => {
		const { rows } = await db.sql<{ name: string; anon: boolean; auth: boolean }>(
			`select p.proname as name,
			        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
			        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('foundry_play_start', 'foundry_play_ping',
			                      'foundry_play_counts', 'foundry_app_play_stats',
			                      '_foundry_play_window')`
		);
		expect(rows.length).toBe(5);
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
