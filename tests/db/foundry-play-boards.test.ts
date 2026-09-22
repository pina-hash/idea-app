// tests/db/foundry-play-boards.test.ts
//
// 0221. THE TWO NEW CROSS-APP COLUMNS, AND THE AUTHOR CARD.
//
// WHY THESE ARE TESTS AND NOT A HARNESS DRIVE. `CLAUDE.md` admits a test for a
// guarantee whose regression would be SILENT, and both halves here are exactly
// that shape:
//
//   * AN HOURS BOARD THAT IS WRONG LOOKS RIGHT. It renders, it ranks, and
//     nothing on any screen says the arithmetic disagrees with the rows. So
//     every figure is computed TWICE -- once by `foundry_play_counts` and once
//     by summing `student_app_plays` directly as the connection owner -- and
//     the two readings are compared. That is the prompt's own requirement and
//     it is the only check that can fail for the right reason.
//
//   * A LEAKED PROFILE FIELD IS INVISIBLE UNTIL SOMEBODY READS A PAYLOAD.
//     `foundry_author_profile` is a definer over `profiles`, which is
//     own-row-or-admin, so anything it projects is a disclosure. The assertion
//     is over the KEYS THAT COME BACK rather than over the function's declared
//     shape: the RPC returns `jsonb`, so a shape assertion would pass on a
//     payload carrying an address.
//
// THE POPULATION IS ASSERTED IN BOTH DIRECTIONS, always with a positive
// control on the same database, because an absence assertion over a definer
// that returned nothing at all would pass for the wrong reason.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/**
 * The Foundry chain through 0221. It is `foundry-publish-description-optional`'s
 * AFTER chain plus this file's own migration, and 0137 stays last as it always
 * does -- it is a sweep over whatever the chain above it created, so a
 * migration applied after it arrives holding a fresh `anon` grant from the
 * project's default privileges. 0221 revokes for itself (0166's shape), which
 * is what the anon assertions below actually measure.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	// 0038 ADDS `profiles.pathway`, WHICH `foundry_author_profile` READS. It also
	// recreates `gauntlet_leaderboards`, which is where the GAUNTLET files below
	// come from -- 0004 creates `submissions`, and without it 0038 refuses to
	// apply at all (measured: `relation "public.submissions" does not exist`).
	// They are a dependency of the pathway column, not scenery.
	'0004_gauntlet.sql',
	'0038_profile_pathway.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
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
	'0221_foundry_boards_and_author_profile.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const OWNER_EMAIL = 'apina@boscotech.edu';

interface CountRow {
	app_id: string;
	plays: string;
	plays_7d: string;
	plays_prev_7d: string;
	seconds_played: string;
}

let db: TestDb;
let admin: SeededUser;
let ana: SeededUser;
let bo: SeededUser;
/** Signed in, publishes nothing, plays nothing. The stranger's view. */
let viewer: SeededUser;
/** Signed in, has an app that is only a DRAFT. Nothing of theirs is public. */
let quiet: SeededUser;

const app: Record<string, string> = {};

async function publishApp(as: SeededUser, slug: string, title: string): Promise<string> {
	const appId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[slug, title, 'Plain HTML and a bit of JavaScript.', 'A test app.']
		);
		return rows[0].r.app_id;
	});
	const versionId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, `uploads/${appId}/v1.zip`]
		);
		return rows[0].r.version_id;
	});
	await db.asUser(as.id, (q) =>
		q(`select public.foundry_submit_version($1::uuid)`, [versionId])
	);
	await db.asUser(admin.id, (q) =>
		q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [versionId])
	);
	return appId;
}

/** A draft app with no approved version: invisible to everyone but its owner. */
async function draftApp(as: SeededUser, slug: string): Promise<string> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[slug, 'A draft', 'Plain HTML.', null]
		);
		return rows[0].r.app_id;
	});
}

/**
 * ONE PLAY SESSION, PLANTED DIRECTLY, AS THE CONNECTION OWNER.
 *
 * `foundry_play_start` cannot be used to build a fixture: it stamps `now()` on
 * both timestamps, resumes anything inside the thirty-minute window instead of
 * inserting, and offers no way to say "this one was nine days ago and lasted
 * twenty minutes". Every window and every duration this file measures needs
 * exactly that. So the rows are planted, and the CONSTRAINT the table carries
 * (`last_seen_at >= started_at`) is left to refuse anything impossible.
 *
 * Planting is also what makes the two-way check honest: the raw sum below is
 * over rows this file wrote, so a function that agreed with itself but not
 * with the table would be caught.
 */
async function plantPlay(
	appId: string,
	player: SeededUser,
	daysAgo: number,
	durationSeconds: number
): Promise<void> {
	await db.sql(
		`insert into public.student_app_plays (app_id, player, started_at, last_seen_at)
		 values ($1::uuid, $2::uuid,
		         now() - ($3 || ' days')::interval,
		         now() - ($3 || ' days')::interval + ($4 || ' seconds')::interval)`,
		[appId, player.id, String(daysAgo), String(durationSeconds)]
	);
}

/** `foundry_play_counts` as a signed-in caller reads it, keyed by app id. */
async function readCounts(as: SeededUser): Promise<Record<string, CountRow>> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<CountRow>(`select * from public.foundry_play_counts()`);
		const out: Record<string, CountRow> = {};
		for (const row of rows) out[row.app_id] = row;
		return out;
	});
}

/**
 * THE SECOND READING: the same four figures summed straight off the table, as
 * the connection owner, with no function between the query and the rows.
 */
async function readRaw(appId: string): Promise<{
	plays: number;
	plays7d: number;
	playsPrev7d: number;
	seconds: number;
}> {
	const { rows } = await db.sql<{
		plays: string;
		plays_7d: string;
		plays_prev_7d: string;
		seconds: string;
	}>(
		`select
			count(*) as plays,
			count(*) filter (where started_at >= now() - interval '7 days') as plays_7d,
			count(*) filter (
				where started_at >= now() - interval '14 days'
					and started_at < now() - interval '7 days'
			) as plays_prev_7d,
			coalesce(sum(extract(epoch from (last_seen_at - started_at)))::bigint, 0) as seconds
		 from public.student_app_plays where app_id = $1`,
		[appId]
	);
	return {
		plays: Number(rows[0].plays),
		plays7d: Number(rows[0].plays_7d),
		playsPrev7d: Number(rows[0].plays_prev_7d),
		seconds: Number(rows[0].seconds)
	};
}

async function readAuthor(
	as: SeededUser,
	owner: string
): Promise<Record<string, unknown> | null> {
	return db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: Record<string, unknown> | null }>(
			`select public.foundry_author_profile($1::uuid) as r`,
			[owner]
		);
		return rows[0].r;
	});
}

beforeAll(async () => {
	db = await startTestDb(CHAIN as unknown as string[]);

	const pina = await createUser(db, OWNER_EMAIL, 'Owner Account');
	admin = await createUser(db, 'reviewer@boscotech.edu', 'Reviewing Admin');
	await db.asUser(pina.id, (q) => q(`select public.admin_grant($1, null)`, [admin.email]));

	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	bo = await createUser(db, 'bo@boscotech.net', 'Bo Tran');
	viewer = await createUser(db, 'viewer@boscotech.net', 'Vic Ewer');
	quiet = await createUser(db, 'quiet@boscotech.net', 'Quinn Ayette');

	// A chosen display name on one author and none on the other, so the name
	// ladder's BOTH rungs are exercised by the projection assertions below.
	await db.sql(`update public.profiles set display_name = $2, pathway = 'IDEA' where id = $1`, [
		ana.id,
		'anaTheBuilder'
	]);
	await db.sql(`update public.profiles set pathway = 'CSEE' where id = $1`, [bo.id]);

	app.press = await publishApp(ana, 'cookie-press', 'Cookie Press');
	app.maze = await publishApp(ana, 'maze-runner', 'Maze Runner');
	app.solo = await publishApp(bo, 'solo-lander', 'Solo Lander');
	app.untouched = await publishApp(bo, 'untouched', 'Untouched');
	app.draft = await draftApp(quiet, 'quiet-draft');

	// COOKIE PRESS: climbing. Two plays this week against one the week before.
	await plantPlay(app.press, viewer, 1, 600);
	await plantPlay(app.press, bo, 3, 1_200);
	await plantPlay(app.press, viewer, 9, 300);

	// MAZE RUNNER: falling. One this week against three the week before.
	await plantPlay(app.maze, viewer, 2, 60);
	await plantPlay(app.maze, bo, 8, 900);
	await plantPlay(app.maze, viewer, 10, 900);
	await plantPlay(app.maze, ana, 13, 900);

	// SOLO LANDER: ONE PLAYER, a long session, and outside both windows. It is
	// the n=1 case the migration's header refuses a cross-app `players` column
	// over, and it is here so the refusal is measured rather than asserted.
	await plantPlay(app.solo, viewer, 40, 7_200);

	// UNTOUCHED: nothing at all. The left join's row of zeroes.
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// THE BOARD NUMBERS, COMPUTED TWO WAYS.
// ---------------------------------------------------------------------------

describe('0221 // foundry_play_counts agrees with the rows it is summing', () => {
	it('matches a direct sum over student_app_plays, per app, on all four figures', async () => {
		const counts = await readCounts(viewer);

		// THE POSITIVE CONTROL FOR THE WHOLE COMPARISON: the function answered
		// at all, and answered about every published app. Without this a
		// function returning nothing would make every per-app loop below
		// vacuous.
		expect(Object.keys(counts).sort()).toEqual(
			[app.press, app.maze, app.solo, app.untouched].sort()
		);

		for (const [label, appId] of Object.entries({
			press: app.press,
			maze: app.maze,
			solo: app.solo,
			untouched: app.untouched
		})) {
			const raw = await readRaw(appId);
			const fn = counts[appId];
			expect(
				{
					where: label,
					plays: Number(fn.plays),
					plays7d: Number(fn.plays_7d),
					playsPrev7d: Number(fn.plays_prev_7d),
					seconds: Number(fn.seconds_played)
				},
				`${label}: the function and a direct sum disagree`
			).toEqual({ where: label, ...raw });
		}
	});

	it('reports the fixture figures this file actually planted', async () => {
		// THE EXPECTED VALUES DO NOT COME FROM THE THING UNDER TEST. They are
		// the plants above, added up by hand: Cookie Press is 600 + 1200 + 300
		// seconds over three sessions, two of them inside seven days and one
		// nine days back, which lands in the PREVIOUS window.
		const counts = await readCounts(viewer);
		expect({
			plays: Number(counts[app.press].plays),
			plays7d: Number(counts[app.press].plays_7d),
			playsPrev7d: Number(counts[app.press].plays_prev_7d),
			seconds: Number(counts[app.press].seconds_played)
		}).toEqual({ plays: 3, plays7d: 2, playsPrev7d: 1, seconds: 2_100 });

		// AND AN APP NOBODY HAS PLAYED IS A ROW OF ZEROES, not a missing key.
		// A client that subtracts two windows would produce NaN off a hole.
		expect({
			plays: Number(counts[app.untouched].plays),
			plays7d: Number(counts[app.untouched].plays_7d),
			playsPrev7d: Number(counts[app.untouched].plays_prev_7d),
			seconds: Number(counts[app.untouched].seconds_played)
		}).toEqual({ plays: 0, plays7d: 0, playsPrev7d: 0, seconds: 0 });
	});

	it('puts a play in exactly one window, never both and never neither', async () => {
		// The boundary is half-open at the young end (`< now() - 7 days`), so
		// the two windows partition the fourteen days. Solo Lander's only play
		// is forty days back and is in neither, which is the third case.
		const counts = await readCounts(viewer);
		for (const appId of [app.press, app.maze]) {
			const row = counts[appId];
			expect(Number(row.plays_7d) + Number(row.plays_prev_7d)).toBeLessThanOrEqual(
				Number(row.plays)
			);
		}
		expect({
			plays: Number(counts[app.solo].plays),
			plays7d: Number(counts[app.solo].plays_7d),
			playsPrev7d: Number(counts[app.solo].plays_prev_7d)
		}).toEqual({ plays: 1, plays7d: 0, playsPrev7d: 0 });
	});

	it('still answers 0139\'s three columns, so no play chip loses its number', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from unnest(
				(select proargnames from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'foundry_play_counts')
			) as col where col in ('app_id', 'plays', 'plays_7d')`
		);
		expect(Number(rows[0].n)).toBe(3);
	});

	/**
	 * THE REFUSED COLUMN, ASSERTED AS AN ABSENCE WITH A POSITIVE CONTROL.
	 *
	 * A cross-app `players` count would let a reader scan a gallery for the
	 * apps with exactly one player, and on those apps `seconds_played` IS one
	 * named student's playtime. `foundry_app_play_stats` answers `players` for
	 * ONE app a caller named, which is the per-app door decision 07 opened; the
	 * control below proves that door is still open, so this absence is a
	 * deliberate narrowing of a board and not a feature that went missing.
	 */
	it('projects no cross-app players count, while the per-app one still answers', async () => {
		const counts = await readCounts(viewer);
		expect(Object.keys(counts[app.solo])).not.toContain('players');

		const perApp = await db.asUser(viewer.id, async (q) => {
			const { rows } = await q<{ r: { players: number; seconds_played: number } }>(
				`select public.foundry_app_play_stats($1::uuid) as r`,
				[app.solo]
			);
			return rows[0].r;
		});
		expect(Number(perApp.players)).toBe(1);
		expect(Number(perApp.seconds_played)).toBe(7_200);
	});

	it('shows a student only the apps they could already see', async () => {
		// `quiet` has one DRAFT app and nothing published.
		const quietCounts = await readCounts(quiet);
		expect(Object.keys(quietCounts)).toContain(app.draft);

		// POSITIVE CONTROL AND THE ABSENCE IN ONE READ: the stranger sees every
		// published app and not the draft.
		const strangerCounts = await readCounts(viewer);
		expect(Object.keys(strangerCounts).length).toBeGreaterThan(0);
		expect(Object.keys(strangerCounts)).not.toContain(app.draft);
	});
});

// ---------------------------------------------------------------------------
// THE AUTHOR CARD.
// ---------------------------------------------------------------------------

describe('0221 // foundry_author_profile', () => {
	it('projects exactly ten keys, and an address is not among them', async () => {
		const card = await readAuthor(viewer, ana.id);
		expect(card).not.toBeNull();

		// READ BACK OFF THE PAYLOAD, not off the declared return type: the
		// function returns jsonb, so nothing about its signature constrains
		// what comes out of it.
		expect(Object.keys(card as object).sort()).toEqual(
			[
				'app_count',
				'avatar',
				'avatar_url',
				'first_published_at',
				'ok',
				'owner',
				'owner_class',
				'owner_display_name',
				'owner_full_name',
				'pathway'
			].sort()
		);

		// NAMED, so a future key called something else still trips the sorted
		// comparison above and a reader of this file knows which four matter.
		for (const forbidden of ['email', 'section_id', 'role', 'preferences']) {
			expect(Object.keys(card as object)).not.toContain(forbidden);
		}

		// AND NO VALUE CARRIES AN ADDRESS EITHER. A name column holding an
		// email would pass every key assertion above.
		expect(JSON.stringify(card)).not.toContain('@');
	});

	it('projects the fields the report asked for, with both name rungs live', async () => {
		const chosen = await readAuthor(viewer, ana.id);
		expect(chosen?.owner_display_name).toBe('anaTheBuilder');
		expect(chosen?.pathway).toBe('IDEA');
		expect(Number(chosen?.app_count)).toBe(2);
		expect(chosen?.first_published_at).toBeTruthy();

		// Bo chose no display name, which production sampling says is the
		// NORMAL case. `full_name` has to be there or the card renders nameless.
		const unchosen = await readAuthor(viewer, bo.id);
		expect(unchosen?.owner_display_name).toBeNull();
		expect(unchosen?.owner_full_name).toBe('Bo Tran');
		expect(unchosen?.pathway).toBe('CSEE');
	});

	it('answers null for an author with nothing this caller can see', async () => {
		// `quiet` has one app and it is a draft, so a stranger sees no work.
		expect(await readAuthor(viewer, quiet.id)).toBeNull();

		// POSITIVE CONTROL ON THE SAME DATABASE, and it is the one that makes
		// the line above mean anything: `quiet` reading their OWN card gets it,
		// because their draft is in their own population.
		const own = await readAuthor(quiet, quiet.id);
		expect(own).not.toBeNull();
		expect(Number(own?.app_count)).toBe(1);
	});

	it('answers null for a uuid nobody owns, identically to a refusal', async () => {
		const nobody = await readAuthor(viewer, '00000000-0000-4000-8000-000000000000');
		expect(nobody).toBeNull();
		// The two answers are indistinguishable, which is the probing rule.
		expect(nobody).toEqual(await readAuthor(viewer, quiet.id));
	});

	it('counts through the caller\'s own population, so a header cannot outrun its list', async () => {
		// An admin sees the draft too, so their count of `quiet` is 1 where a
		// stranger's is nothing at all. Reading a wider number under a narrower
		// list is the failure this asserts against.
		const asAdmin = await readAuthor(admin, quiet.id);
		expect(Number(asAdmin?.app_count)).toBe(1);

		const listed = await db.asUser(viewer.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`select id from public.foundry_list_apps($1::uuid)`,
				[ana.id]
			);
			return rows.map((r) => r.id);
		});
		const card = await readAuthor(viewer, ana.id);
		expect(Number(card?.app_count)).toBe(listed.length);
	});

	it('is closed to anon and open to authenticated', async () => {
		const { rows } = await db.sql<{ a: boolean; u: boolean }>(
			`select has_function_privilege('anon', 'public.foundry_author_profile(uuid)', 'execute') as a,
			        has_function_privilege('authenticated', 'public.foundry_author_profile(uuid)', 'execute') as u`
		);
		expect(rows[0]).toEqual({ a: false, u: true });

		const counts = await db.sql<{ a: boolean; u: boolean }>(
			`select has_function_privilege('anon', 'public.foundry_play_counts(boolean, boolean)', 'execute') as a,
			        has_function_privilege('authenticated', 'public.foundry_play_counts(boolean, boolean)', 'execute') as u`
		);
		expect(counts.rows[0]).toEqual({ a: false, u: true });
	});

	it('leaves student_app_plays unreadable by every client role', async () => {
		const { rows } = await db.sql<{ auth: boolean; anon: boolean; svc: boolean }>(
			`select has_table_privilege('authenticated', 'public.student_app_plays', 'SELECT') as auth,
			        has_table_privilege('anon', 'public.student_app_plays', 'SELECT') as anon,
			        has_table_privilege('service_role', 'public.student_app_plays', 'SELECT') as svc`
		);
		expect(rows[0]).toEqual({ auth: false, anon: false, svc: false });
	});
});
