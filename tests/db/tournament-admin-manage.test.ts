// tests/db/tournament-admin-manage.test.ts
//
// 0192, ITEMS 5 AND 6 OF PROMPT 0110: A SITE ADMIN MANAGES, EDITS AND DELETES
// ANY TOURNAMENT REGARDLESS OF HOST, AND A CONTENDER RENAMES THEIR ENTRY UNTIL
// THE BRACKET EXISTS AND NEVER AFTER.
//
// Both gates are SERVER-SIDE: `_tournament_require_host` (which every 0062-0065
// host RPC calls), `tournament_delete`'s own `is_admin()` read, and
// `_tournament_can_manage` behind the entry-side RPCs. So this file drives the
// REAL RPCs as four kinds of caller -- a host, a second host, a student who is
// neither, an admin who holds NO `tournament_hosts` row, and a @boscotech.edu
// teacher who is on no roster (the CLAUDE.md rule that `teacher` grants
// nothing) -- and asserts the refusal MESSAGES rather than merely that
// something threw. One more gate sits inside `tournament_add_entry_member`
// (decision 1 of prompt 0110's second round): adding a teammate BY ACCOUNT
// (an email) is a host's or an admin's, and a captain is refused by sentence
// while adding by name still succeeds; that block has its own fixture.
//
// THE CHAIN. 0001/0003/0020 (profiles), 0004 (touch_updated_at), 0062/0063 (the tournament tables and
// the reward engine) through the harness; then `create publication
// supabase_realtime` because 0064's own guard asks whether the TABLE is in the
// publication rather than whether the publication exists; then 0064, 0065,
// 0066, 0067 (the admin tier -- `is_admin()` and `app_admins`), 0068, 0137 (the
// anon sweep; it is a sweep over whatever is there and applies to a partial
// schema by its own header), and finally 0192, the file under test, applied
// over the top VERBATIM by reading it off disk. Nothing here re-implements a
// migration.
//
// THE POSITIVE CONTROL is a second database with a STRING-REPLACED copy of 0192
// -- `or public.is_admin()` removed from `_tournament_require_host` -- applied
// in place of the real one. No file on disk is mutated. The admin cases that
// pass on the sound database are re-run there and are expected to redden; the
// count that does is reported in the test name.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	// 0004 is here for `touch_updated_at()`, which 0062's tournaments trigger
	// names; the tournament chain has carried it since the thumbs tests.
	'0004_gauntlet.sql',
	'0020_profiles_identity.sql',
	'0062_tournaments.sql',
	'0063_tournament_push_rewards.sql'
] as const;

const OVER_THE_TOP = [
	'0064_tournament_entry_styles.sql',
	'0065_tournament_forfeits.sql',
	'0066_tournament_delete.sql',
	'0067_admin_tier.sql',
	'0068_tournament_delete_payout_ack.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION_0192 = 'supabase/migrations/0192_tournament_entry_members_and_admin_hosts.sql';

const HOST_REFUSAL = 'Only a tournament host or a site admin can do that.';
const DELETE_REFUSAL = 'Only a host of this tournament, or a site admin, can delete it.';
const EDIT_REFUSAL =
	'Only a registrant on this entry, a tournament host or a site admin can edit it.';
const ADD_MEMBER_REFUSAL =
	'Only a registrant on this entry, a tournament host or a site admin can add a teammate.';
const LOCK = 'Entry names lock once the bracket is generated.';

/** Boots the whole chain SHORT of 0192, so a caller decides which 0192 to apply. */
async function bootShortOf0192(): Promise<TestDb> {
	const d = await startTestDb([...CHAIN]);
	await d.sql(`create publication supabase_realtime`);
	for (const file of OVER_THE_TOP) {
		await d.sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
	}
	return d;
}

/** The message a call refused with, or null when it succeeded. */
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}

let db: TestDb;
let host: SeededUser;
let cohost: SeededUser;
let student: SeededUser;
let owner: SeededUser;
let teammate: SeededUser;
let admin: SeededUser;
let teacher: SeededUser;
let tid: string;
let ownerEntry: string;
let studentEntry: string;

async function seedUsers(d: TestDb) {
	const u = {
		host: await createUser(d, 'hana.host@boscotech.net', 'Hana Host'),
		cohost: await createUser(d, 'carl.cohost@boscotech.net', 'Carl Cohost'),
		student: await createUser(d, 'sam.student@boscotech.net', 'Sam Student'),
		owner: await createUser(d, 'olive.owner@boscotech.net', 'Olive Owner'),
		teammate: await createUser(d, 'tess.teammate@boscotech.net', 'Tess Teammate'),
		admin: await createUser(d, 'ada.admin@boscotech.edu', 'Ada Admin'),
		teacher: await createUser(d, 'tom.teacher@boscotech.edu', 'Tom Teacher')
	};
	// 0067: the roster is keyed on the lowercased email and the grant is
	// limited to @boscotech.edu. The teacher is deliberately NOT inserted.
	await d.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		u.admin.email
	]);
	return u;
}

async function createTournament(
	d: TestDb,
	as: SeededUser,
	name: string,
	teamSize = 2
): Promise<string> {
	const id = await d.asUser(as.id, async (q) => {
		const r = await q<{ id: string }>(
			`select public.tournament_create($1, $2, $3::jsonb) as id`,
			[name, `${teamSize} per entry.`, JSON.stringify({ team_size: teamSize })]
		);
		return r.rows[0].id;
	});
	await d.asUser(as.id, (q) =>
		q(`select public.tournament_set_status($1, 'registration_open')`, [id])
	);
	return id;
}

async function statusOf(d: TestDb, id: string): Promise<string> {
	const r = await d.sql<{ status: string }>(`select status from public.tournaments where id = $1`, [
		id
	]);
	return r.rows[0].status;
}

async function nameOf(d: TestDb, entryId: string): Promise<string> {
	const r = await d.sql<{ display_name: string }>(
		`select display_name from public.tournament_entries where id = $1`,
		[entryId]
	);
	return r.rows[0].display_name;
}

beforeAll(async () => {
	db = await bootShortOf0192();
	await db.sql(readFileSync(MIGRATION_0192, 'utf8'));
	({ host, cohost, student, owner, teammate, admin, teacher } = await seedUsers(db));

	tid = await createTournament(db, host, 'Spring Scrimmage');
	await db.asUser(host.id, (q) =>
		q(`select public.tournament_add_host($1, $2, null)`, [tid, cohost.id])
	);
	// Two entries through the REAL RPCs: the owner's (the one everybody else
	// will try to edit) and the student's own.
	ownerEntry = await db.asUser(owner.id, async (q) => {
		const r = await q<{ id: string }>(
			`select public.tournament_register_entry($1, $2, $3, $4) as id`,
			[tid, 'Olive Original', '', null]
		);
		return r.rows[0].id;
	});
	studentEntry = await db.asUser(student.id, async (q) => {
		const r = await q<{ id: string }>(
			`select public.tournament_register_entry($1, $2, $3, $4) as id`,
			[tid, 'Sam Solo', '', null]
		);
		return r.rows[0].id;
	});
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The fixture is what it claims: the admin holds NO host row, the tournament
// is open, and the two entries are there.
// ---------------------------------------------------------------------------

describe('fixture', () => {
	test('the admin is on the roster and holds 0 tournament_hosts rows; the teacher is on neither', async () => {
		const roster = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.app_admins where email = $1`,
			[admin.email]
		);
		expect(Number(roster.rows[0].n)).toBe(1);
		const hosts = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_hosts where tournament_id = $1 and user_id = $2`,
			[tid, admin.id]
		);
		expect(Number(hosts.rows[0].n)).toBe(0);
		const isAdmin = await db.asUser(admin.id, (q) =>
			q<{ ok: boolean }>(`select public.is_admin() as ok`)
		);
		expect(isAdmin.rows[0].ok).toBe(true);
		const teacherIsAdmin = await db.asUser(teacher.id, (q) =>
			q<{ ok: boolean }>(`select public.is_admin() as ok`)
		);
		expect(teacherIsAdmin.rows[0].ok).toBe(false);
		const role = await db.sql<{ role: string }>(`select role from public.profiles where id = $1`, [
			teacher.id
		]);
		expect(role.rows[0].role).toBe('teacher');
	});

	test('2 hosts, 2 entries, 2 member rows (one per entry), status registration_open', async () => {
		const hosts = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_hosts where tournament_id = $1`,
			[tid]
		);
		expect(Number(hosts.rows[0].n)).toBe(2);
		const entries = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entries where tournament_id = $1`,
			[tid]
		);
		expect(Number(entries.rows[0].n)).toBe(2);
		const members = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entry_members where tournament_id = $1`,
			[tid]
		);
		expect(Number(members.rows[0].n)).toBe(2);
		expect(await statusOf(db, tid)).toBe('registration_open');
	});
});

// ---------------------------------------------------------------------------
// ITEM 5, THE REFUSALS. A student who is neither host nor admin, and a teacher
// who is on no roster, are refused by every host RPC WITH THE MESSAGE.
// ---------------------------------------------------------------------------

/** Every RPC item 5 names, as one caller. Returns rpc -> refusal message | null. */
async function outcomesFor(d: TestDb, who: SeededUser, t: string, entry: string) {
	const out: Record<string, string | null> = {};
	out.tournament_update = await refusal(
		d.asUser(who.id, (q) =>
			q(`select public.tournament_update($1, $2, null, null)`, [t, 'Renamed By Caller'])
		)
	);
	out.tournament_set_status = await refusal(
		d.asUser(who.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t]))
	);
	out.tournament_host_add_entry = await refusal(
		d.asUser(who.id, (q) =>
			q(`select public.tournament_host_add_entry($1, $2, '', null, null)`, [t, 'Walk-up Wasp'])
		)
	);
	out.tournament_set_reward_rules = await refusal(
		d.asUser(who.id, (q) =>
			q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [
				t,
				JSON.stringify([{ trigger_type: 'win', trigger_value: null, amount: 5 }])
			])
		)
	);
	out.tournament_update_entry = await refusal(
		d.asUser(who.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, null)`, [entry, 'Hijacked'])
		)
	);
	out.tournament_add_entry_member = await refusal(
		d.asUser(who.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, null)`, [entry, 'Intruder'])
		)
	);
	out.tournament_delete = await refusal(
		d.asUser(who.id, (q) =>
			q(`select public.tournament_delete($1, $2, false)`, [t, 'Spring Scrimmage'])
		)
	);
	return out;
}

const EXPECTED_REFUSALS: Record<string, string> = {
	tournament_update: HOST_REFUSAL,
	tournament_set_status: HOST_REFUSAL,
	tournament_host_add_entry: HOST_REFUSAL,
	tournament_set_reward_rules: HOST_REFUSAL,
	tournament_update_entry: EDIT_REFUSAL,
	tournament_add_entry_member: ADD_MEMBER_REFUSAL,
	tournament_delete: DELETE_REFUSAL
};

describe('item 5: a non-admin non-host is refused, 7 of 7 RPCs, by message', () => {
	test('the student: 7 refusals, each with its own sentence', async () => {
		const out = await outcomesFor(db, student, tid, ownerEntry);
		expect(Object.keys(out)).toHaveLength(7);
		for (const [rpc, expected] of Object.entries(EXPECTED_REFUSALS)) {
			expect(out[rpc], rpc).toBe(expected);
		}
		// And nothing landed: the name, the status, the entry count, the
		// owner's entry name and its roster are all as seeded.
		const t = await db.sql<{ name: string; status: string }>(
			`select name, status from public.tournaments where id = $1`,
			[tid]
		);
		expect(t.rows[0]).toEqual({ name: 'Spring Scrimmage', status: 'registration_open' });
		expect(await nameOf(db, ownerEntry)).toBe('Olive Original');
		const members = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entry_members where entry_id = $1`,
			[ownerEntry]
		);
		expect(Number(members.rows[0].n)).toBe(1);
	});

	test('the @boscotech.edu teacher who is on no roster: 7 of 7 refused the same way (teacher grants nothing)', async () => {
		const out = await outcomesFor(db, teacher, tid, ownerEntry);
		for (const [rpc, expected] of Object.entries(EXPECTED_REFUSALS)) {
			expect(out[rpc], rpc).toBe(expected);
		}
	});

	test('the 0068 wording is gone: no refusal mentions a teacher', async () => {
		const out = await outcomesFor(db, student, tid, ownerEntry);
		for (const msg of Object.values(out)) {
			expect(msg ?? '').not.toMatch(/teacher/i);
		}
		// And the function body no longer names the deprecated shim at all.
		const src = await db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'tournament_delete'`
		);
		expect(src.rows).toHaveLength(1);
		expect(src.rows[0].src).not.toContain('is_teacher');
		expect(src.rows[0].src).toContain('public.is_admin()');
	});
});

// ---------------------------------------------------------------------------
// ITEM 6, THE RENAME GATE, PART 1: before the bracket, the owner and a linked
// teammate rename; a non-member is refused.
// ---------------------------------------------------------------------------

describe('item 6: renaming before the bracket exists', () => {
	test('the owner renames during registration_open and the new name lands', async () => {
		await db.asUser(owner.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, null)`, [ownerEntry, 'Olive Open'])
		);
		expect(await nameOf(db, ownerEntry)).toBe('Olive Open');
	});

	test('a teammate who JOINED the entry (a linked member, not the captain) renames it', async () => {
		await db.asUser(teammate.id, (q) =>
			q(`select public.tournament_join_entry($1, $2)`, [ownerEntry, 'Tess'])
		);
		const members = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entry_members where entry_id = $1`,
			[ownerEntry]
		);
		expect(Number(members.rows[0].n)).toBe(2);
		await db.asUser(teammate.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, null)`, [
				ownerEntry,
				'Olive and Tess'
			])
		);
		expect(await nameOf(db, ownerEntry)).toBe('Olive and Tess');
	});

	test('a non-member is refused with the edit message, and the name does not move', async () => {
		expect(
			await refusal(
				db.asUser(student.id, (q) =>
					q(`select public.tournament_update_entry($1, $2, null, null)`, [
						ownerEntry,
						'Not Mine'
					])
				)
			)
		).toBe(EDIT_REFUSAL);
		expect(await nameOf(db, ownerEntry)).toBe('Olive and Tess');
	});

	test('the description and thumbnail rules: null keeps, "" clears the thumbnail, 201 chars refused', async () => {
		await db.asUser(owner.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, $3, $4)`, [
				ownerEntry,
				'Olive and Tess',
				'  A robot.  ',
				'https://example.test/pic.png'
			])
		);
		let row = await db.sql<{ description: string; thumbnail_url: string | null }>(
			`select description, thumbnail_url from public.tournament_entries where id = $1`,
			[ownerEntry]
		);
		expect(row.rows[0]).toEqual({
			description: 'A robot.',
			thumbnail_url: 'https://example.test/pic.png'
		});
		// null = keep both.
		await db.asUser(owner.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, null)`, [ownerEntry, 'Olive and Tess'])
		);
		row = await db.sql(
			`select description, thumbnail_url from public.tournament_entries where id = $1`,
			[ownerEntry]
		);
		expect(row.rows[0]).toEqual({
			description: 'A robot.',
			thumbnail_url: 'https://example.test/pic.png'
		});
		// '' clears the thumbnail.
		await db.asUser(owner.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, '')`, [ownerEntry, 'Olive and Tess'])
		);
		row = await db.sql(
			`select description, thumbnail_url from public.tournament_entries where id = $1`,
			[ownerEntry]
		);
		expect(row.rows[0].thumbnail_url).toBeNull();
		expect(
			await refusal(
				db.asUser(owner.id, (q) =>
					q(`select public.tournament_update_entry($1, $2, $3, null)`, [
						ownerEntry,
						'Olive and Tess',
						'x'.repeat(201)
					])
				)
			)
		).toBe('Description is limited to 200 characters.');
		expect(
			await refusal(
				db.asUser(owner.id, (q) =>
					q(`select public.tournament_update_entry($1, $2, null, null)`, [
						ownerEntry,
						'x'.repeat(41)
					])
				)
			)
		).toBe('Display name must be 1 to 40 characters.');
	});
});

// ---------------------------------------------------------------------------
// ADDING A TEAMMATE BY ACCOUNT IS A MANAGER ACTION (prompt 0110, second round,
// decision 1). A captain adds UNLINKED teammates by name; putting an ACCOUNT
// on a roster by typing its email is a host's or an admin's, because it
// registers somebody in a tournament without their consent (a teammate with
// an account joins through tournament_join_entry, where the account itself
// is the caller). The refusal is raised BEFORE the window and the capacity
// checks -- it is about who is asking -- and the last test pins that order.
// A fresh tournament of four per entry, so every step below has room.
// ---------------------------------------------------------------------------

const BY_ACCOUNT_REFUSAL =
	'Only a tournament host or a site admin can add a teammate by account. Teammates with an account can join the entry themselves.';

describe('decision 1: a captain adding by email is refused; a host and an admin add by email', () => {
	let et: string;
	let entry: string;

	async function roster(entryId: string) {
		const r = await db.sql<{ name: string; user_id: string | null; added_by: string | null }>(
			`select name, user_id, added_by from public.tournament_entry_members where entry_id = $1 order by created_at, id`,
			[entryId]
		);
		return r.rows;
	}

	beforeAll(async () => {
		et = await createTournament(db, host, 'Email Cup', 4);
		entry = await db.asUser(owner.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_register_entry($1, $2, $3, $4) as id`,
				[et, 'Olive by Account', '', null]
			);
			return r.rows[0].id;
		});
	}, 240_000);

	test('the captain adding by email is refused with the exact sentence, and the roster stays at 1', async () => {
		expect(
			await refusal(
				db.asUser(owner.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [entry, 'Tess', teammate.email])
				)
			)
		).toBe(BY_ACCOUNT_REFUSAL);
		expect(await roster(entry)).toHaveLength(1);
	});

	test('the captain adding by NAME alone succeeds: 2 members, the new one unlinked', async () => {
		await db.asUser(owner.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, null)`, [entry, 'Olive Two'])
		);
		const m = await roster(entry);
		expect(m).toHaveLength(2);
		expect(m[1]).toEqual({ name: 'Olive Two', user_id: null, added_by: owner.id });
	});

	test('the host adds by email: 3 members, the new one LINKED to that account and added by the host', async () => {
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, $3)`, [entry, 'Tess', teammate.email])
		);
		const m = await roster(entry);
		expect(m).toHaveLength(3);
		expect(m[2]).toEqual({ name: 'Tess', user_id: teammate.id, added_by: host.id });
	});

	test('the admin (0 hosts rows) adds by email: 4 members, linked, added by the admin', async () => {
		await db.asUser(admin.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, $3)`, [entry, 'Carl', cohost.email])
		);
		const m = await roster(entry);
		expect(m).toHaveLength(4);
		expect(m[3]).toEqual({ name: 'Carl', user_id: cohost.id, added_by: admin.id });
	});

	test('the order is pinned: on the now-FULL entry the captain by email still gets the by-account sentence, by name gets "full (4 of 4)"', async () => {
		expect(
			await refusal(
				db.asUser(owner.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [entry, 'Sam', student.email])
				)
			)
		).toBe(BY_ACCOUNT_REFUSAL);
		expect(
			await refusal(
				db.asUser(owner.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, null)`, [entry, 'Fifth'])
				)
			)
		).toBe('This entry is full (4 of 4).');
		// A blank email is "by name": the empty string takes the name path.
		expect(
			await refusal(
				db.asUser(owner.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, '  ')`, [entry, 'Fifth'])
				)
			)
		).toBe('This entry is full (4 of 4).');
		expect(await roster(entry)).toHaveLength(4);
	});

	test('a stranger by email gets the general add refusal first, not the by-account sentence', async () => {
		expect(
			await refusal(
				db.asUser(student.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [entry, 'Sam', student.email])
				)
			)
		).toBe(ADD_MEMBER_REFUSAL);
	});
});

// ---------------------------------------------------------------------------
// ITEM 5, THE ADMIN SUCCEEDS at every one of those, holding no host row, and a
// second host succeeds too. Delete is last.
// ---------------------------------------------------------------------------

describe('item 5: an admin with no hosts row manages the tournament', () => {
	test('tournament_update: the name changes', async () => {
		await db.asUser(admin.id, (q) =>
			q(`select public.tournament_update($1, $2, null, null)`, [tid, 'Spring Scrimmage (admin)'])
		);
		const t = await db.sql<{ name: string }>(`select name from public.tournaments where id = $1`, [
			tid
		]);
		expect(t.rows[0].name).toBe('Spring Scrimmage (admin)');
		// Back, so the delete confirmation below types the seeded name.
		await db.asUser(admin.id, (q) =>
			q(`select public.tournament_update($1, $2, null, null)`, [tid, 'Spring Scrimmage'])
		);
	});

	test('tournament_set_status: registration_open -> seeding', async () => {
		await db.asUser(admin.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [tid]));
		expect(await statusOf(db, tid)).toBe('seeding');
	});

	test('the owner still renames during seeding (qualifying is not a start)', async () => {
		await db.asUser(owner.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, null)`, [ownerEntry, 'Olive Seeded'])
		);
		expect(await nameOf(db, ownerEntry)).toBe('Olive Seeded');
	});

	test('tournament_update_entry on somebody else\'s entry: the admin renames it', async () => {
		await db.asUser(admin.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, null)`, [ownerEntry, 'Olive by Admin'])
		);
		expect(await nameOf(db, ownerEntry)).toBe('Olive by Admin');
	});

	test('tournament_add_entry_member on somebody else\'s entry: the admin adds a teammate (1 -> 2 members)', async () => {
		await db.asUser(admin.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, null)`, [studentEntry, 'Sam Two'])
		);
		const members = await db.sql<{ name: string; user_id: string | null }>(
			`select name, user_id from public.tournament_entry_members where entry_id = $1 order by created_at, id`,
			[studentEntry]
		);
		expect(members.rows.map((m) => m.name)).toEqual(['Sam Solo', 'Sam Two']);
		expect(members.rows[0].user_id).toBe(student.id);
		expect(members.rows[1].user_id).toBeNull();
	});

	test('tournament_host_add_entry: the admin adds a walk-up (3 entries, 3 rosters)', async () => {
		await db.asUser(admin.id, (q) =>
			q(`select public.tournament_host_add_entry($1, $2, '', null, null)`, [tid, 'Walk-up Wasp'])
		);
		const entries = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entries where tournament_id = $1`,
			[tid]
		);
		expect(Number(entries.rows[0].n)).toBe(3);
		const bare = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entries e
			 where e.tournament_id = $1
			   and not exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id)`,
			[tid]
		);
		expect(Number(bare.rows[0].n)).toBe(0);
	});

	test('tournament_set_reward_rules: the admin writes 1 rule', async () => {
		await db.asUser(admin.id, (q) =>
			q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [
				tid,
				JSON.stringify([{ trigger_type: 'win', trigger_value: null, amount: 5 }])
			])
		);
		const rules = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_reward_rules where tournament_id = $1`,
			[tid]
		);
		expect(Number(rules.rows[0].n)).toBe(1);
	});

	test('a second host succeeds too: update, and seeding <-> registration_open', async () => {
		await db.asUser(cohost.id, (q) =>
			q(`select public.tournament_update($1, null, $2, null)`, [tid, 'Edited by the co-host.'])
		);
		const t = await db.sql<{ description: string }>(
			`select description from public.tournaments where id = $1`,
			[tid]
		);
		expect(t.rows[0].description).toBe('Edited by the co-host.');
		await db.asUser(cohost.id, (q) =>
			q(`select public.tournament_set_status($1, 'registration_open')`, [tid])
		);
		expect(await statusOf(db, tid)).toBe('registration_open');
		await db.asUser(cohost.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [tid]));
		expect(await statusOf(db, tid)).toBe('seeding');
	});
});

// ---------------------------------------------------------------------------
// ITEM 6, PART 2: the bracket is generated (the host does it; an admin could)
// and from then on EVERYONE is refused with the lock message -- the owner, a
// linked teammate, a host and the admin. One rule, no carve-out.
// ---------------------------------------------------------------------------

describe('item 6: after tournament_generate_bracket the name is locked for everyone', () => {
	test('the bracket generates from 3 entries and the tournament is live', async () => {
		await db.asUser(host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [tid]));
		expect(await statusOf(db, tid)).toBe('live');
		const matches = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_bracket_matches where tournament_id = $1`,
			[tid]
		);
		expect(Number(matches.rows[0].n)).toBeGreaterThan(0);
	});

	test('4 of 4 callers refused with the lock sentence: owner, teammate, host, admin', async () => {
		const before = await nameOf(db, ownerEntry);
		const callers = { owner, teammate, host, admin };
		const results: Record<string, string | null> = {};
		for (const [label, who] of Object.entries(callers)) {
			results[label] = await refusal(
				db.asUser(who.id, (q) =>
					q(`select public.tournament_update_entry($1, $2, null, null)`, [
						ownerEntry,
						`Renamed by ${label}`
					])
				)
			);
		}
		expect(Object.keys(results)).toHaveLength(4);
		for (const [label, msg] of Object.entries(results)) {
			expect(msg, label).toBe(LOCK);
		}
		expect(await nameOf(db, ownerEntry)).toBe(before);
	});

	test('the member rename takes the same rule: the teammate and the admin both get the lock sentence', async () => {
		const m = await db.sql<{ id: string }>(
			`select id from public.tournament_entry_members where entry_id = $1 and user_id = $2`,
			[ownerEntry, teammate.id]
		);
		expect(m.rows).toHaveLength(1);
		for (const who of [teammate, admin]) {
			expect(
				await refusal(
					db.asUser(who.id, (q) =>
						q(`select public.tournament_rename_entry_member($1, $2)`, [m.rows[0].id, 'Locked'])
					)
				)
			).toBe(LOCK);
		}
	});

	test('a non-member is still refused by the AUTHORIZATION first, not by the lock', async () => {
		// The gate order matters for what a stranger learns: they are told they
		// may not edit, not that the bracket exists.
		expect(
			await refusal(
				db.asUser(student.id, (q) =>
					q(`select public.tournament_update_entry($1, $2, null, null)`, [ownerEntry, 'Nope'])
				)
			)
		).toBe(EDIT_REFUSAL);
	});
});

// ---------------------------------------------------------------------------
// ITEM 5, LAST: the admin deletes, with the name confirmation. The tournament
// has entries and a bracket but no payouts, so no acknowledgement is asked.
// ---------------------------------------------------------------------------

describe('item 5: the admin deletes, last', () => {
	test('the wrong name is refused with the counts, the right name deletes 3 entries and every roster row', async () => {
		const wrong = await refusal(
			db.asUser(admin.id, (q) =>
				q(`select public.tournament_delete($1, $2, false)`, [tid, 'Not The Name'])
			)
		);
		expect(wrong).toMatch(/^Type the tournament name exactly to confirm deletion: "Spring Scrimmage"\./);
		expect(wrong).toContain('3 entries');

		const r = await db.asUser(admin.id, (q) =>
			q<{ out: { deleted: boolean; entries: number; reward_rows: number } }>(
				`select public.tournament_delete($1, $2, false) as out`,
				[tid, 'spring scrimmage']
			)
		);
		expect(r.rows[0].out.deleted).toBe(true);
		expect(r.rows[0].out.entries).toBe(3);
		expect(r.rows[0].out.reward_rows).toBe(0);

		for (const table of [
			'tournaments',
			'tournament_entries',
			'tournament_entry_members',
			'tournament_hosts',
			'tournament_bracket_matches',
			'tournament_reward_rules'
		]) {
			const col = table === 'tournaments' ? 'id' : 'tournament_id';
			const n = await db.sql<{ n: string }>(
				`select count(*)::text as n from public.${table} where ${col} = $1`,
				[tid]
			);
			expect(Number(n.rows[0].n), table).toBe(0);
		}
	});
});

// ---------------------------------------------------------------------------
// ANON. The grants, read off the catalog AND exercised: has_function_privilege
// false for anon and true for authenticated on every 0192 public function, and
// an anonymous call is a permission error rather than a refusal sentence.
// ---------------------------------------------------------------------------

const PUBLIC_SIGS = [
	'public.tournament_update(uuid, text, text, jsonb)',
	'public.tournament_register_entry(uuid, text, text, text, text, text[])',
	'public.tournament_register_entry(uuid, text, text, text)',
	'public.tournament_host_add_entry(uuid, text, text, text, uuid)',
	'public.tournament_respond_invite(uuid, boolean, text, text, text)',
	'public.tournament_update_entry(uuid, text, text, text)',
	'public.tournament_add_entry_member(uuid, text, text)',
	'public.tournament_join_entry(uuid, text)',
	'public.tournament_remove_entry_member(uuid)',
	'public.tournament_rename_entry_member(uuid, text)',
	'public.tournament_set_entry_style(uuid, text, jsonb, text, text, text, text)',
	'public.tournament_ping_entry(uuid, uuid)',
	'public.tournament_delete(uuid, text, boolean)'
];

const PRIVATE_SIGS = [
	'public._tournament_require_host(uuid)',
	'public._tournament_can_manage(uuid)',
	'public._tournament_team_size(jsonb)',
	'public._tournament_award(uuid, uuid, integer, text, uuid)',
	'public._tournament_normalize_config(jsonb)'
];

describe('anon: 13 public functions anon=false/authenticated=true, 5 helpers closed to both', () => {
	test('has_function_privilege, 13 x 2 readings', async () => {
		let anonFalse = 0;
		let authTrue = 0;
		for (const sig of PUBLIC_SIGS) {
			const r = await db.sql<{ a: boolean; u: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as a,
				        has_function_privilege('authenticated', $1, 'execute') as u`,
				[sig]
			);
			expect(r.rows[0].a, sig).toBe(false);
			expect(r.rows[0].u, sig).toBe(true);
			if (!r.rows[0].a) anonFalse += 1;
			if (r.rows[0].u) authTrue += 1;
		}
		expect(anonFalse).toBe(13);
		expect(authTrue).toBe(13);
	});

	test('the 5 private helpers: neither anon nor authenticated holds EXECUTE', async () => {
		for (const sig of PRIVATE_SIGS) {
			const r = await db.sql<{ a: boolean; u: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as a,
				        has_function_privilege('authenticated', $1, 'execute') as u`,
				[sig]
			);
			expect(r.rows[0].a, sig).toBe(false);
			expect(r.rows[0].u, sig).toBe(false);
		}
	});

	test('an anonymous caller gets permission denied on execute, not a refusal sentence', async () => {
		const msg = await refusal(
			db.asAnon((q) =>
				q(`select public.tournament_update('00000000-0000-0000-0000-000000000000', 'x', null, null)`)
			)
		);
		expect(msg).toMatch(/permission denied for function tournament_update/i);
		// Positive control on the same connection: anon still READS the
		// spectator tables, so the denial above is the grant and not RLS.
		const n = await db.asAnon((q) => q<{ n: string }>(`select count(*)::text as n from public.tournaments`));
		expect(Number(n.rows[0].n)).toBeGreaterThanOrEqual(0);
	});

	test('pg_proc: exactly 1 row for each redeclared function, 2 for tournament_register_entry with the wide one at pronargdefaults 0', async () => {
		const ones = [
			'_tournament_require_host',
			'_tournament_can_manage',
			'_tournament_award',
			'tournament_update_entry',
			'tournament_add_entry_member',
			'tournament_join_entry',
			'tournament_remove_entry_member',
			'tournament_rename_entry_member',
			'tournament_delete',
			'tournament_set_entry_style',
			'tournament_ping_entry',
			'tournament_update',
			'_tournament_normalize_config'
		];
		for (const name of ones) {
			const r = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(Number(r.rows[0].n), name).toBe(1);
		}
		const reg = await db.sql<{ pronargs: number; pronargdefaults: number }>(
			`select p.pronargs, p.pronargdefaults from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'tournament_register_entry' order by p.pronargs`
		);
		expect(reg.rows).toEqual([
			{ pronargs: 4, pronargdefaults: 2 },
			{ pronargs: 6, pronargdefaults: 0 }
		]);
	});
});

// ---------------------------------------------------------------------------
// THE POSITIVE CONTROL. A second database, the same chain, and a copy of 0192
// with `or public.is_admin()` removed from `_tournament_require_host`. The
// admin cases above are re-run against it. What SHOULD redden is exactly the
// four RPCs that reach the admin through `_tournament_require_host`
// (update, set_status, host_add_entry, set_reward_rules); `tournament_delete`
// reads `is_admin()` itself and the two entry-side RPCs read
// `_tournament_can_manage`, so those three are expected to STAY green -- which
// is itself the finding: there are three gates, and this control opens one.
// ---------------------------------------------------------------------------

describe('positive control: 0192 without `or public.is_admin()` in _tournament_require_host', () => {
	let ctrl: TestDb;
	let cHost: SeededUser;
	let cAdmin: SeededUser;
	let cStudent: SeededUser;
	let cTid: string;
	let cEntry: string;

	beforeAll(async () => {
		ctrl = await bootShortOf0192();
		const text = readFileSync(MIGRATION_0192, 'utf8');
		const needle = '\n\t\tor public.is_admin()\n';
		// The replacement must hit exactly the one clause, or the control
		// proves nothing about it.
		expect(text.split(needle).length - 1).toBe(1);
		const mutated = text.replace(needle, '\n');
		expect(mutated).not.toBe(text);
		await ctrl.sql(mutated);
		const src = await ctrl.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = '_tournament_require_host'`
		);
		expect(src.rows[0].src).not.toContain('is_admin');

		const u = await seedUsers(ctrl);
		cHost = u.host;
		cAdmin = u.admin;
		cStudent = u.student;
		cTid = await createTournament(ctrl, cHost, 'Spring Scrimmage');
		cEntry = await ctrl.asUser(u.owner.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_register_entry($1, $2, $3, $4) as id`,
				[cTid, 'Olive Original', '', null]
			);
			return r.rows[0].id;
		});
	}, 240_000);

	afterAll(async () => {
		await ctrl?.stop();
	});

	test('the sound database: the admin succeeds at all 7 (0 refusals)', async () => {
		// Re-derived here on the sound database against a FRESH tournament, so
		// the control compares like with like rather than leaning on the
		// order-dependent results above.
		const t = await createTournament(db, host, 'Control Sound');
		const e = await db.asUser(owner.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_register_entry($1, $2, $3, $4) as id`,
				[t, 'Sound Entry', '', null]
			);
			return r.rows[0].id;
		});
		const out = await outcomesFor(db, admin, t, e);
		// tournament_delete is called with the OTHER tournament's name in
		// outcomesFor, so its refusal here is the name check, not the gate.
		const gate = Object.entries(out).filter(([rpc]) => rpc !== 'tournament_delete');
		expect(gate).toHaveLength(6);
		for (const [rpc, msg] of gate) {
			expect(msg, rpc).toBeNull();
		}
		expect(out.tournament_delete).toMatch(/^Type the tournament name exactly/);
	});

	test('the mutant still refuses the student everywhere, 7 of 7 (the control opened nothing to them)', async () => {
		const out = await outcomesFor(ctrl, cStudent, cTid, cEntry);
		// The mutant removed the CLAUSE and kept 0192's sentence, so a refusal
		// reads the same as on the sound database; what differs is who gets it.
		for (const [rpc, expected] of Object.entries(EXPECTED_REFUSALS)) {
			expect(out[rpc], rpc).toBe(expected);
		}
	});

	test('the mutant: 4 of 7 admin cases redden with the host refusal; delete and the 2 entry-side RPCs stay green (their gates were not opened)', async () => {
		const out = await outcomesFor(ctrl, cAdmin, cTid, cEntry);
		const reddened = Object.entries(out).filter(([, msg]) => msg === HOST_REFUSAL);
		expect(reddened.map(([rpc]) => rpc).sort()).toEqual(
			[
				'tournament_host_add_entry',
				'tournament_set_reward_rules',
				'tournament_set_status',
				'tournament_update'
			].sort()
		);
		expect(reddened).toHaveLength(4);
		expect(out.tournament_update_entry).toBeNull();
		expect(out.tournament_add_entry_member).toBeNull();
		// Deletion is its own gate and it is intact: the admin still deletes.
		expect(out.tournament_delete).toBeNull();
	});

});

// ---------------------------------------------------------------------------
// THE POSITIVE CONTROL FOR DECISION 1. A broken by-account gate fails
// SILENTLY -- the captain's call succeeds and a linked member appears -- so
// the refusal is proven to bite: a third database takes a copy of 0192 with
// the `and not v_manage` term struck from the email branch, and the captain's
// by-email call that the sound database refuses above SUCCEEDS there.
// ---------------------------------------------------------------------------

describe('positive control: 0192 with `and not v_manage` struck from the email branch', () => {
	let ctrl: TestDb;
	let cOwner: SeededUser;
	let cTeammate: SeededUser;
	let cEntry: string;

	beforeAll(async () => {
		ctrl = await bootShortOf0192();
		const text = readFileSync(MIGRATION_0192, 'utf8');
		const needle = "if p_email is not null and btrim(p_email) <> '' and not v_manage then";
		expect(text.split(needle).length - 1).toBe(1);
		const mutated = text.replace(needle, "if p_email is not null and btrim(p_email) <> '' and false then");
		expect(mutated).not.toBe(text);
		await ctrl.sql(mutated);
		const u = await seedUsers(ctrl);
		cOwner = u.owner;
		cTeammate = u.teammate;
		const t = await createTournament(ctrl, u.host, 'Control Email', 2);
		cEntry = await ctrl.asUser(cOwner.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_register_entry($1, $2, $3, $4) as id`,
				[t, 'Olive Control', '', null]
			);
			return r.rows[0].id;
		});
	}, 240_000);

	afterAll(async () => {
		await ctrl?.stop();
	});

	test('the mutant: the captain adds by email and it LANDS (2 members, the second linked) -- the refusal assertion reddens', async () => {
		expect(
			await refusal(
				ctrl.asUser(cOwner.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [cEntry, 'Tess', cTeammate.email])
				)
			)
		).toBeNull();
		const m = await ctrl.sql<{ user_id: string | null }>(
			`select user_id from public.tournament_entry_members where entry_id = $1 order by created_at, id`,
			[cEntry]
		);
		expect(m.rows).toHaveLength(2);
		expect(m.rows[1].user_id).toBe(cTeammate.id);
	});
});
