// tests/db/tournament-entry-members.test.ts
//
// 0192, ITEM 7 OF PROMPT 0110: AN ENTRY HOLDS ONE OR MORE REGISTRANTS, AND
// REWARDS PAY EVERY ONE OF THEM.
//
// Four things are measured here, each against the REAL RPCs on a real Postgres
// with the real migration files applied in order:
//
//   1. THE ROSTER WRITE PATH. The narrow (0062) and wide (0192) forms of
//      `tournament_register_entry`, `tournament_join_entry`,
//      `tournament_add_entry_member` (by name and by email),
//      `tournament_remove_entry_member` and `tournament_rename_entry_member`,
//      every refusal by message, every count asserted, and the lock once the
//      bracket exists.
//   2. THE PRE-MIGRATION BACKFILL. A separate database boots the chain SHORT of
//      0192, registers two entries through the 0062 RPCs (one linked, one
//      host walk-up), and THEN takes 0192 over the top -- the CLAUDE.md rule
//      that a migration is tested against seeded pre-migration data. It is
//      applied a second time in the same database and nothing moves.
//      Adding BY EMAIL is a MANAGER action (decision 1 of the second round):
//      the captain's attempt is the refusal, by sentence, and the host drives
//      the resolving cases. `tournament_update` with a config that LACKS a
//      team_size key keeps the stored value (decision (c)); every other key is
//      still whole-object replaced, and a present key is honoured.
//   3. REWARDS. A team-of-two beside a solo in a two-entry bracket: a forfeit
//      pays 0 rows, a solo's contested win pays 1, a team's contested win pays
//      2 (one per member, full amount each, member_id set), placements settle
//      per member, and `tournament_delete` reports the summed coins. A second
//      fixture puts an UNLINKED teammate (wide form, teammates ['Zed']) on the
//      winning team and asserts that member's own row: user_id null,
//      member_id set, the full amount.
//   4. THE POSITIVE CONTROL. A copy of 0192 with `_tournament_award`'s
//      per-member select replaced by 0063's single-row insert, applied in a
//      third database from a string-replaced copy (no file on disk is
//      touched), reddens the "2 rows for the team" assertion.
//
// The chain is the admin-manage file's: 0001/0003/0004/0020, 0062/0063, the
// publication, then 0064-0068, 0137 and 0192 read verbatim off disk.

import { beforeAll, afterAll, describe, expect, inject, test } from 'vitest';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
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

const LOCK = 'Entry names lock once the bracket is generated.';
const FULL_2 = 'This entry is full (2 of 2).';
const ALREADY = 'You are already registered for this tournament.';
const NOT_OPEN = 'Registration is not open for this tournament.';
const REMOVE_REFUSAL =
	'Only that registrant, the registering account, a tournament host or a site admin can remove a teammate.';
const RENAME_REFUSAL =
	'Only that registrant, the registering account, a tournament host or a site admin can rename a teammate.';

async function bootShortOf0192(): Promise<TestDb> {
	const d = await startTestDb([...CHAIN]);
	await d.sql(`create publication supabase_realtime`);
	for (const file of OVER_THE_TOP) {
		await d.sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
	}
	return d;
}

/**
 * Applies SQL to one of the harness's databases on a RAW client that listens
 * for NOTICEs, so a migration's own `raise notice` counts become assertable.
 * The pool behind `db.sql` does not surface them.
 */
async function applyWithNotices(databaseName: string, text: string): Promise<string[]> {
	const cluster = inject('pgCluster');
	const client = new pg.Client({
		host: cluster.host,
		port: cluster.port,
		user: cluster.user,
		password: cluster.password,
		database: databaseName
	});
	const notices: string[] = [];
	client.on('notice', (n) => notices.push(n.message ?? ''));
	await client.connect();
	try {
		await client.query(text);
	} finally {
		await client.end().catch(() => {});
	}
	return notices;
}

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}

interface Member {
	id: string;
	name: string;
	user_id: string | null;
	added_by: string | null;
}

/** The roster of one entry in roster order (created_at, then id). */
async function membersOf(d: TestDb, entryId: string): Promise<Member[]> {
	const r = await d.sql<Member>(
		`select id, name, user_id, added_by from public.tournament_entry_members
		 where entry_id = $1 order by created_at, id`,
		[entryId]
	);
	return r.rows;
}

async function createTournament(
	d: TestDb,
	as: SeededUser,
	name: string,
	teamSize: number,
	open = true
): Promise<string> {
	const id = await d.asUser(as.id, async (q) => {
		const r = await q<{ id: string }>(`select public.tournament_create($1, $2, $3::jsonb) as id`, [
			name,
			'',
			JSON.stringify({ team_size: teamSize })
		]);
		return r.rows[0].id;
	});
	if (open) {
		await d.asUser(as.id, (q) =>
			q(`select public.tournament_set_status($1, 'registration_open')`, [id])
		);
	}
	return id;
}

async function registerNarrow(d: TestDb, as: SeededUser, t: string, name: string) {
	return d.asUser(as.id, async (q) => {
		const r = await q<{ id: string }>(
			`select public.tournament_register_entry($1, $2, $3, $4) as id`,
			[t, name, '', null]
		);
		return r.rows[0].id;
	});
}

async function registerWide(
	d: TestDb,
	as: SeededUser,
	t: string,
	name: string,
	memberName: string | null,
	teammates: string[] | null
) {
	return d.asUser(as.id, async (q) => {
		const r = await q<{ id: string }>(
			`select public.tournament_register_entry($1, $2, $3, $4, $5, $6::text[]) as id`,
			[t, name, '', null, memberName, teammates]
		);
		return r.rows[0].id;
	});
}

async function statusOf(d: TestDb, id: string): Promise<string> {
	const r = await d.sql<{ status: string }>(`select status from public.tournaments where id = $1`, [
		id
	]);
	return r.rows[0].status;
}

interface Match {
	id: string;
	bracket: string;
	round: number;
	status: string;
	entry_a_id: string | null;
	entry_b_id: string | null;
	winner_id: string | null;
}

async function matchesOf(d: TestDb, t: string): Promise<Match[]> {
	const r = await d.sql<Match>(
		`select id, bracket, round, status, entry_a_id, entry_b_id, winner_id
		 from public.tournament_bracket_matches where tournament_id = $1
		 order by bracket, round, slot`,
		[t]
	);
	return r.rows;
}

interface Ledger {
	id: number;
	entry_id: string;
	user_id: string | null;
	member_id: string | null;
	amount: number;
	reason: string;
	match_id: string | null;
}

async function ledgerOf(d: TestDb, t: string): Promise<Ledger[]> {
	const r = await d.sql<Ledger>(
		`select id, entry_id, user_id, member_id, amount, reason, match_id
		 from public.tournament_reward_ledger where tournament_id = $1 order by id`,
		[t]
	);
	return r.rows;
}

/** Host plays a CONTESTED best-of-1: the side holding `winner` wins game 1. */
async function playContested(d: TestDb, host: SeededUser, m: Match, winner: string) {
	await d.asUser(host.id, (q) => q(`select public.tournament_start_match($1)`, [m.id]));
	const side = m.entry_a_id === winner ? 'a' : 'b';
	return d.asUser(host.id, async (q) => {
		const r = await q<{ out: Record<string, unknown> }>(
			`select public.tournament_submit_match_result($1, $2::jsonb) as out`,
			[m.id, JSON.stringify({ games: [{ winner: side }] })]
		);
		return r.rows[0].out;
	});
}

let db: TestDb;
let host: SeededUser;
let azad: SeededUser;
let dana: SeededUser;
let eve: SeededUser;
let frank: SeededUser;
let gus: SeededUser;
let hal: SeededUser;
let sol: SeededUser;
let admin: SeededUser;

let t1: string;
let solEntry: string;
let azadEntry: string;
let eveEntry: string;
let walkup: string;

async function seedUsers(d: TestDb) {
	const u = {
		host: await createUser(d, 'hana.host@boscotech.net', 'Hana Host'),
		azad: await createUser(d, 'azad.a@boscotech.net', 'Azad Account'),
		dana: await createUser(d, 'dana.d@boscotech.net', 'Dana Account'),
		eve: await createUser(d, 'eve.e@boscotech.net', 'Eve Account'),
		frank: await createUser(d, 'frank.f@boscotech.net', 'Frank Account'),
		gus: await createUser(d, 'gus.g@boscotech.net', 'Gus Account'),
		hal: await createUser(d, 'hal.h@boscotech.net', 'Hal Account'),
		sol: await createUser(d, 'sol.s@boscotech.net', 'Sol Account'),
		admin: await createUser(d, 'ada.admin@boscotech.edu', 'Ada Admin')
	};
	await d.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		u.admin.email
	]);
	return u;
}

beforeAll(async () => {
	db = await bootShortOf0192();
	await db.sql(readFileSync(MIGRATION_0192, 'utf8'));
	({ host, azad, dana, eve, frank, gus, hal, sol, admin } = await seedUsers(db));
	t1 = await createTournament(db, host, 'Team Cup', 2);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. Registration writes the roster
// ---------------------------------------------------------------------------

describe('registration: the narrow form and the wide form both write a roster', () => {
	test('NARROW form: 1 member row, named as the entry, user_id = the registrant, added_by = the registrant', async () => {
		solEntry = await registerNarrow(db, sol, t1, 'Sol Solo');
		const m = await membersOf(db, solEntry);
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({ name: 'Sol Solo', user_id: sol.id, added_by: sol.id });
	});

	test("WIDE form with p_member_name 'Azad' and teammates ['Diego']: 2 members, linked then unlinked, in order", async () => {
		azadEntry = await registerWide(db, azad, t1, 'Azad Alliance', 'Azad', ['Diego']);
		const m = await membersOf(db, azadEntry);
		expect(m).toHaveLength(2);
		expect(m[0]).toMatchObject({ name: 'Azad', user_id: azad.id, added_by: azad.id });
		expect(m[1]).toMatchObject({ name: 'Diego', user_id: null, added_by: azad.id });
		// The entry's own column is still the captain: the 0062 reading holds.
		const e = await db.sql<{ user_id: string; display_name: string }>(
			`select user_id, display_name from public.tournament_entries where id = $1`,
			[azadEntry]
		);
		expect(e.rows[0]).toEqual({ user_id: azad.id, display_name: 'Azad Alliance' });
	});

	test('teammates over team_size are refused with the cap, and nothing is written', async () => {
		expect(await refusal(registerWide(db, eve, t1, 'Eve Excess', 'Eve', ['A', 'B']))).toBe(
			'This tournament allows entries of up to 2 registrants.'
		);
		const n = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entries where tournament_id = $1 and user_id = $2`,
			[t1, eve.id]
		);
		expect(Number(n.rows[0].n)).toBe(0);
	});

	test('blank teammate names are dropped, a missing member name falls back to the entry name (1 member)', async () => {
		eveEntry = await registerWide(db, eve, t1, 'Eve Eleven', '', ['', '   ']);
		const m = await membersOf(db, eveEntry);
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({ name: 'Eve Eleven', user_id: eve.id });
	});

	test('a 41-character teammate name is refused by sentence, not by the CHECK constraint', async () => {
		expect(
			await refusal(registerWide(db, gus, t1, 'Gus Gang', 'Gus', ['x'.repeat(41)]))
		).toBe('Teammate names must be 1 to 40 characters.');
		expect(
			await refusal(registerWide(db, gus, t1, 'Gus Gang', 'y'.repeat(41), []))
		).toBe('Your roster name must be 1 to 40 characters.');
	});

	test('a host walk-up (tournament_host_add_entry) gets an UNLINKED captain member', async () => {
		walkup = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_host_add_entry($1, $2, '', null, null) as id`,
				[t1, 'Walk-up Wasp']
			);
			return r.rows[0].id;
		});
		const m = await membersOf(db, walkup);
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({ name: 'Walk-up Wasp', user_id: null, added_by: host.id });
	});

	test('the invariant holds across the tournament: 0 entries without a member, 4 entries, 5 members', async () => {
		const r = await db.sql<{ entries: string; members: string; bare: string }>(
			`select
			   (select count(*) from public.tournament_entries where tournament_id = $1)::text as entries,
			   (select count(*) from public.tournament_entry_members where tournament_id = $1)::text as members,
			   (select count(*) from public.tournament_entries e where e.tournament_id = $1
			      and not exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id))::text as bare`,
			[t1]
		);
		expect(r.rows[0]).toEqual({ entries: '4', members: '5', bare: '0' });
	});
});

// ---------------------------------------------------------------------------
// 2. tournament_join_entry
// ---------------------------------------------------------------------------

describe('tournament_join_entry: a second account joins itself', () => {
	test("Dana joins Sol's entry: 2 members, the second linked to Dana and added by Dana", async () => {
		await db.asUser(dana.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [solEntry, 'Dana']));
		const m = await membersOf(db, solEntry);
		expect(m).toHaveLength(2);
		expect(m[1]).toMatchObject({ name: 'Dana', user_id: dana.id, added_by: dana.id });
	});

	test('a full entry refuses with the count: "This entry is full (2 of 2)."', async () => {
		expect(
			await refusal(db.asUser(frank.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [azadEntry, 'Frank'])))
		).toBe(FULL_2);
	});

	test('an account already in the tournament is refused: as a teammate (Dana) and as a captain (Azad)', async () => {
		expect(
			await refusal(db.asUser(dana.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [eveEntry, 'Dana'])))
		).toBe(ALREADY);
		expect(
			await refusal(db.asUser(azad.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [eveEntry, 'Azad'])))
		).toBe(ALREADY);
		expect(await membersOf(db, eveEntry)).toHaveLength(1);
	});

	test("an invite accepted by an account already on somebody else's roster is a no-op accept: 0 new entries, Dana still 1 member row, invite 'accepted'", async () => {
		// Dana is on Sol's entry (the first test above). `tournament_send_invite`
		// (0062) asks only the entries table, so the host CAN invite her; before
		// the roster half landed in `tournament_respond_invite`, her accept
		// inserted a second entry and the one-per-user index answered a bare
		// 23505 -- which `rpcErrorStatus` classifies as transient, so a client
		// would have retried a considered refusal. Now it is the same no-op
		// accept an invitee who already holds an entry gets.
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entries where tournament_id = $1`,
			[t1]
		);
		const inviteId = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(`select public.tournament_send_invite($1, $2, null) as id`, [
				t1,
				dana.id
			]);
			return r.rows[0].id;
		});
		expect(
			await refusal(
				db.asUser(dana.id, (q) =>
					q(`select public.tournament_respond_invite($1, true, $2, '', null)`, [inviteId, 'Dana Again'])
				)
			)
		).toBeNull();
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entries where tournament_id = $1`,
			[t1]
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
		const rows = await db.sql<{ entry_id: string }>(
			`select entry_id from public.tournament_entry_members where tournament_id = $1 and user_id = $2`,
			[t1, dana.id]
		);
		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0].entry_id).toBe(solEntry);
		const inv = await db.sql<{ status: string }>(`select status from public.tournament_invites where id = $1`, [
			inviteId
		]);
		expect(inv.rows[0].status).toBe('accepted');
	});

	test('joining while registration is not open (seeding) is refused', async () => {
		const t3 = await createTournament(db, host, 'Seeding Cup', 2);
		const gusEntry = await registerNarrow(db, gus, t3, 'Gus Solo');
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t3]));
		expect(
			await refusal(db.asUser(frank.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [gusEntry, 'Frank'])))
		).toBe(NOT_OPEN);
		// ... but a HOST may still add a teammate during seeding (the window),
		// and an ADMIN may remove one.
		const mid = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_add_entry_member($1, $2, null) as id`,
				[gusEntry, 'Gus Two']
			);
			return r.rows[0].id;
		});
		expect(await membersOf(db, gusEntry)).toHaveLength(2);
		await db.asUser(admin.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [mid]));
		expect(await membersOf(db, gusEntry)).toHaveLength(1);
	});

	test('an anonymous caller cannot execute it at all', async () => {
		const msg = await refusal(
			db.asAnon((q) => q(`select public.tournament_join_entry($1, 'x')`, [solEntry]))
		);
		expect(msg).toMatch(/permission denied for function tournament_join_entry/i);
	});
});

// ---------------------------------------------------------------------------
// 3. tournament_add_entry_member by email
// ---------------------------------------------------------------------------

// ADDING BY ACCOUNT IS A MANAGER ACTION (prompt 0110, second round, decision
// 1): a captain adds unlinked teammates by name, a host or an admin may put
// an ACCOUNT on a roster by email, and a teammate with an account joins
// through tournament_join_entry (section 2). So the by-email cases below are
// driven by the HOST, and the captain's by-email attempt is the refusal.
const BY_ACCOUNT_REFUSAL =
	'Only a tournament host or a site admin can add a teammate by account. Teammates with an account can join the entry themselves.';

describe('tournament_add_entry_member: by name (a member or a manager), and by email (a manager only)', () => {
	test('DECISION 1: the captain (Eve) adding by email is refused with the exact sentence; 1 member, nothing written', async () => {
		expect(
			await refusal(
				db.asUser(eve.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [eveEntry, 'Frank', frank.email])
				)
			)
		).toBe(BY_ACCOUNT_REFUSAL);
		expect(await membersOf(db, eveEntry)).toHaveLength(1);
	});

	test('the captain by NAME succeeds and by email is refused, on a fresh 3-per-entry tournament (Frank: 1 -> 2 unlinked; the host then links Hal: 3)', async () => {
		const tn = await createTournament(db, host, 'Name Cup', 3);
		const frankEntry = await registerNarrow(db, frank, tn, 'Frank Front');
		expect(
			await refusal(
				db.asUser(frank.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [frankEntry, 'Hal', hal.email])
				)
			)
		).toBe(BY_ACCOUNT_REFUSAL);
		await db.asUser(frank.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, null)`, [frankEntry, 'Pal'])
		);
		let m = await membersOf(db, frankEntry);
		expect(m).toHaveLength(2);
		expect(m[1]).toMatchObject({ name: 'Pal', user_id: null, added_by: frank.id });
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, $3)`, [frankEntry, 'Hal', hal.email])
		);
		m = await membersOf(db, frankEntry);
		expect(m).toHaveLength(3);
		expect(m[2]).toMatchObject({ name: 'Hal', user_id: hal.id, added_by: host.id });
		// A linked teammate is a member, not a manager: Hal by email is refused too.
		expect(
			await refusal(
				db.asUser(hal.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [frankEntry, 'Gus', gus.email])
				)
			)
		).toBe(BY_ACCOUNT_REFUSAL);
	});

	test('an unknown email (by the host) is refused and nothing is written', async () => {
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, $3)`, [eveEntry, 'Nobody', 'nobody@boscotech.net'])
				)
			)
		).toBe('No account found for that email.');
		expect(await membersOf(db, eveEntry)).toHaveLength(1);
	});

	test('an account already entered is refused (by the host): a captain elsewhere (Azad) and a teammate elsewhere (Dana)', async () => {
		for (const u of [azad, dana]) {
			expect(
				await refusal(
					db.asUser(host.id, (q) =>
						q(`select public.tournament_add_entry_member($1, $2, $3)`, [eveEntry, 'Poached', u.email])
					)
				)
			).toBe('That account is already registered in this tournament.');
		}
	});

	test('a stranger is refused by the add message', async () => {
		expect(
			await refusal(
				db.asUser(gus.id, (q) =>
					q(`select public.tournament_add_entry_member($1, $2, null)`, [eveEntry, 'Intruder'])
				)
			)
		).toBe('Only a registrant on this entry, a tournament host or a site admin can add a teammate.');
	});

	test('a known email (case- and whitespace-insensitive), by the host, resolves to a LINKED member added by the host', async () => {
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, $3)`, [eveEntry, 'Frank', '  Frank.F@Boscotech.net '])
		);
		const m = await membersOf(db, eveEntry);
		expect(m).toHaveLength(2);
		expect(m[1]).toMatchObject({ name: 'Frank', user_id: frank.id, added_by: host.id });
	});

	test('and now the entry is full: "This entry is full (2 of 2)."', async () => {
		expect(
			await refusal(
				db.asUser(eve.id, (q) => q(`select public.tournament_add_entry_member($1, $2, null)`, [eveEntry, 'Extra']))
			)
		).toBe(FULL_2);
	});

	test('tournament_update refuses a team_size below the largest roster: "(2 registrants)"', async () => {
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ team_size: 1 })])
				)
			)
		).toBe('team_size cannot be lower than the largest entry (2 registrants).');
		const cfg = await db.sql<{ team_size: string }>(
			`select config ->> 'team_size' as team_size from public.tournaments where id = $1`,
			[t1]
		);
		expect(cfg.rows[0].team_size).toBe('2');
	});
});

// ---------------------------------------------------------------------------
// 4. Renaming a roster row
// ---------------------------------------------------------------------------

describe('tournament_rename_entry_member: that member, the captain, or a manager', () => {
	test('Azad renames own row; Sol (captain) renames Dana; Dana renames herself; the admin renames Diego', async () => {
		const [azadRow] = await membersOf(db, azadEntry);
		await db.asUser(azad.id, (q) => q(`select public.tournament_rename_entry_member($1, $2)`, [azadRow.id, ' Azad A. ']));
		expect((await membersOf(db, azadEntry))[0].name).toBe('Azad A.');

		const [, danaRow] = await membersOf(db, solEntry);
		await db.asUser(sol.id, (q) => q(`select public.tournament_rename_entry_member($1, $2)`, [danaRow.id, 'Dana by Sol']));
		expect((await membersOf(db, solEntry))[1].name).toBe('Dana by Sol');
		await db.asUser(dana.id, (q) => q(`select public.tournament_rename_entry_member($1, $2)`, [danaRow.id, 'Dana']));
		expect((await membersOf(db, solEntry))[1].name).toBe('Dana');

		const [, diegoRow] = await membersOf(db, azadEntry);
		await db.asUser(admin.id, (q) => q(`select public.tournament_rename_entry_member($1, $2)`, [diegoRow.id, 'Diego D.']));
		expect((await membersOf(db, azadEntry))[1].name).toBe('Diego D.');
	});

	test('a stranger is refused and a 41-character name is refused', async () => {
		const [, diegoRow] = await membersOf(db, azadEntry);
		expect(
			await refusal(db.asUser(gus.id, (q) => q(`select public.tournament_rename_entry_member($1, $2)`, [diegoRow.id, 'Nope'])))
		).toBe(RENAME_REFUSAL);
		expect(
			await refusal(db.asUser(azad.id, (q) => q(`select public.tournament_rename_entry_member($1, $2)`, [diegoRow.id, 'x'.repeat(41)])))
		).toBe('Teammate names must be 1 to 40 characters.');
		expect((await membersOf(db, azadEntry))[1].name).toBe('Diego D.');
	});
});

// ---------------------------------------------------------------------------
// 5. Removing a roster row
// ---------------------------------------------------------------------------

describe('tournament_remove_entry_member: the two refusals and the three allowed removals', () => {
	test('the LAST member is refused: "An entry needs at least one registrant. A host or a site admin can remove the entry instead."', async () => {
		const halEntry = await registerNarrow(db, hal, t1, 'Hal Alone');
		const [halRow] = await membersOf(db, halEntry);
		expect(
			await refusal(db.asUser(hal.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [halRow.id])))
		).toBe('An entry needs at least one registrant. A host or a site admin can remove the entry instead.');
		expect(await membersOf(db, halEntry)).toHaveLength(1);
	});

	test("the captain's own row is refused while a teammate remains", async () => {
		const [azadRow] = await membersOf(db, azadEntry);
		expect(
			await refusal(db.asUser(azad.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [azadRow.id])))
		).toBe('The registering account stays on the entry. A host or a site admin can remove the entry to withdraw it.');
		// The admin gets the same answer: it is a rule about the entry, not a gate.
		expect(
			await refusal(db.asUser(admin.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [azadRow.id])))
		).toBe('The registering account stays on the entry. A host or a site admin can remove the entry to withdraw it.');
		expect(await membersOf(db, azadEntry)).toHaveLength(2);
	});

	test('a stranger is refused', async () => {
		const [, frankRow] = await membersOf(db, eveEntry);
		expect(
			await refusal(db.asUser(gus.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [frankRow.id])))
		).toBe(REMOVE_REFUSAL);
		expect(await membersOf(db, eveEntry)).toHaveLength(2);
	});

	test('a teammate removed by the captain (2 -> 1), a teammate leaving by themselves (2 -> 1), a teammate removed by the host (2 -> 1)', async () => {
		const [, diegoRow] = await membersOf(db, azadEntry);
		await db.asUser(azad.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [diegoRow.id]));
		expect(await membersOf(db, azadEntry)).toHaveLength(1);

		const [, danaRow] = await membersOf(db, solEntry);
		await db.asUser(dana.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [danaRow.id]));
		expect(await membersOf(db, solEntry)).toHaveLength(1);

		const [, frankRow] = await membersOf(db, eveEntry);
		await db.asUser(host.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [frankRow.id]));
		expect(await membersOf(db, eveEntry)).toHaveLength(1);
	});

	test('the unique index: a freed account may join another entry, and cannot be on two', async () => {
		await db.asUser(dana.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [eveEntry, 'Dana']));
		expect(await membersOf(db, eveEntry)).toHaveLength(2);
		expect(
			await refusal(db.asUser(dana.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [azadEntry, 'Dana'])))
		).toBe(ALREADY);
	});
});

// ---------------------------------------------------------------------------
// 6. The config: team_size through the normalizer, and the stored value
// ---------------------------------------------------------------------------

describe('_tournament_normalize_config: team_size', () => {
	test('7 and "two" are refused with one sentence; 3 lands in the stored config; a config with no key reads as 1', async () => {
		for (const bad of [7, 0, 'two']) {
			expect(
				await refusal(
					db.asUser(host.id, (q) =>
						q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ team_size: bad })])
					)
				),
				String(bad)
			).toBe('team_size must be a whole number from 1 to 6.');
		}
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ team_size: 3 })])
		);
		const cfg = await db.sql<{ cfg: Record<string, unknown> }>(
			`select config as cfg from public.tournaments where id = $1`,
			[t1]
		);
		expect(cfg.rows[0].cfg.team_size).toBe(3);
		expect(Object.keys(cfg.rows[0].cfg).sort()).toEqual(
			['best_of', 'best_of_default', 'quals_enabled', 'score_entry', 'team_size']
		);
		// Back to 2 for the rest of the file.
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ team_size: 2 })])
		);
		const one = await db.sql<{ n: number }>(`select public._tournament_team_size('{}'::jsonb) as n`);
		expect(one.rows[0].n).toBe(1);
	});

	test('a p_config with NO team_size key keeps the STORED value (3 stays 3 through {best_of_default: 3} and {}); every other key is still whole-object replaced; a present key is honoured', async () => {
		const stored = async () => {
			const r = await db.sql<{ cfg: Record<string, unknown> }>(
				`select config as cfg from public.tournaments where id = $1`,
				[t1]
			);
			return r.rows[0].cfg;
		};
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ team_size: 3 })])
		);
		expect((await stored()).team_size).toBe(3);
		// The deployed-client shape: best_of resent alone, no team_size key.
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ best_of_default: 3 })])
		);
		let cfg = await stored();
		expect(cfg.team_size).toBe(3);
		expect(cfg.best_of_default).toBe(3);
		// An empty object: team_size still 3, and best_of_default falls back to
		// the normalizer's 1 -- only team_size is softened.
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_update($1, null, null, '{}'::jsonb)`, [t1])
		);
		cfg = await stored();
		expect(cfg.team_size).toBe(3);
		expect(cfg.best_of_default).toBe(1);
		expect(Object.keys(cfg).sort()).toEqual(
			['best_of', 'best_of_default', 'quals_enabled', 'score_entry', 'team_size']
		);
		// A key that IS present is honoured, 2 included; and back to 2 for the file.
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ team_size: 2 })])
		);
		expect((await stored()).team_size).toBe(2);
		// The floor still reads the folded value: with a 2-member roster on the
		// board, an explicit 1 is refused while a keyless object is not.
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ team_size: 1 })])
				)
			)
		).toBe('team_size cannot be lower than the largest entry (2 registrants).');
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_update($1, null, null, $2::jsonb)`, [t1, JSON.stringify({ quals_enabled: false })])
				)
			)
		).toBeNull();
		expect((await stored()).team_size).toBe(2);
		// A non-object still gets the normalizer's own refusal.
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_update($1, null, null, '[1]'::jsonb)`, [t1])
				)
			)
		).toBe('Config must be a JSON object.');
	});
});

// ---------------------------------------------------------------------------
// 7. set_entry_style reads the roster
// ---------------------------------------------------------------------------

describe('tournament_set_entry_style: linked members may; hosts and admins only for an unlinked walk-up', () => {
	test('the host and the admin restyle the walk-up; a stranger may not', async () => {
		for (const who of [host, admin]) {
			const r = await db.asUser(who.id, (q) =>
				q<{ id: string | null }>(
					`select public.tournament_set_entry_style($1, null, null, '#1f6feb', 'bolt', null, null) as id`,
					[walkup]
				)
			);
			expect(r.rows[0].id).toBe(walkup);
		}
		expect(
			await refusal(
				db.asUser(gus.id, (q) =>
					q(`select public.tournament_set_entry_style($1, null, null, '#1f6feb', 'bolt', null, null)`, [walkup])
				)
			)
		).toBe('Only a host or a site admin can customize a walk-up entry.');
	});

	test("the host may NOT restyle Azad's linked entry; Azad may", async () => {
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_set_entry_style($1, null, null, '#1f6feb', 'bolt', null, null)`, [azadEntry])
				)
			)
		).toBe('Only a player on this entry can customize it.');
		const r = await db.asUser(azad.id, (q) =>
			q<{ id: string | null }>(
				`select public.tournament_set_entry_style($1, null, null, '#1f6feb', 'bolt', null, null) as id`,
				[azadEntry]
			)
		);
		expect(r.rows[0].id).toBe(azadEntry);
	});

	test("a linked TEAMMATE (Dana on Eve's entry) may restyle it", async () => {
		const r = await db.asUser(dana.id, (q) =>
			q<{ id: string | null }>(
				`select public.tournament_set_entry_style($1, null, null, null, 'crown', null, 'Two of us') as id`,
				[eveEntry]
			)
		);
		expect(r.rows[0].id).toBe(eveEntry);
	});

	test('a walk-up that GAINS a linked teammate stops being a host-restyleable entry', async () => {
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_add_entry_member($1, $2, $3)`, [walkup, 'Gus', gus.email])
		);
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_set_entry_style($1, null, null, null, 'star', null, null)`, [walkup])
				)
			)
		).toBe('Only a player on this entry can customize it.');
		const r = await db.asUser(gus.id, (q) =>
			q<{ id: string | null }>(
				`select public.tournament_set_entry_style($1, null, null, null, 'star', null, null) as id`,
				[walkup]
			)
		);
		expect(r.rows[0].id).toBe(walkup);
	});
});

// ---------------------------------------------------------------------------
// 8. The lock: once the bracket exists, names and rosters are fixed
// ---------------------------------------------------------------------------

describe('after tournament_generate_bracket: 5 rosters locked', () => {
	test('the bracket generates from 5 entries', async () => {
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t1]));
		await db.asUser(host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [t1]));
		expect(await statusOf(db, t1)).toBe('live');
	});

	test('rename member and rename entry: the lock sentence; join, add, remove: the window sentences', async () => {
		const [azadRow] = await membersOf(db, azadEntry);
		expect(
			await refusal(db.asUser(azad.id, (q) => q(`select public.tournament_rename_entry_member($1, $2)`, [azadRow.id, 'Late'])))
		).toBe(LOCK);
		expect(
			await refusal(db.asUser(azad.id, (q) => q(`select public.tournament_update_entry($1, $2, null, null)`, [azadEntry, 'Late'])))
		).toBe(LOCK);
		expect(
			await refusal(db.asUser(frank.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [azadEntry, 'Frank'])))
		).toBe(NOT_OPEN);
		expect(
			await refusal(db.asUser(azad.id, (q) => q(`select public.tournament_add_entry_member($1, $2, null)`, [azadEntry, 'Late'])))
		).toBe('Teammates can only be added while registration is open or during seeding.');
		const [, danaRow] = await membersOf(db, eveEntry);
		expect(
			await refusal(db.asUser(dana.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [danaRow.id])))
		).toBe('Teammates can only be removed while registration is open or during seeding.');
	});
});

// ---------------------------------------------------------------------------
// 9. THE PRE-MIGRATION BACKFILL, in its own database.
// ---------------------------------------------------------------------------

describe('backfill: 0192 applied over entries the 0062 RPCs wrote', () => {
	let pre: TestDb;
	let pHost: SeededUser;
	let pAzad: SeededUser;
	let pT: string;
	let linked: string;
	let unlinked: string;
	let snapshot: { members: Member[]; procs: unknown[]; pubs: unknown[] };

	const procSnapshot = (d: TestDb) =>
		d.sql(
			`select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.pronargdefaults,
			        p.proacl::text as acl, md5(p.prosrc) as body
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and (p.proname like 'tournament%' or p.proname like '\\_tournament%')
			 order by p.proname, args`
		);
	const pubSnapshot = (d: TestDb) =>
		d.sql(
			`select tablename from pg_publication_tables where pubname = 'supabase_realtime'
			   and schemaname = 'public' order by tablename`
		);

	beforeAll(async () => {
		pre = await bootShortOf0192();
		pHost = await createUser(pre, 'pre.host@boscotech.net', 'Pre Host');
		pAzad = await createUser(pre, 'pre.azad@boscotech.net', 'Pre Azad');
		// The 0062 config: no team_size key at all.
		pT = await pre.asUser(pHost.id, async (q) => {
			const r = await q<{ id: string }>(`select public.tournament_create($1, '', '{}'::jsonb) as id`, [
				'Before 0192'
			]);
			return r.rows[0].id;
		});
		await pre.asUser(pHost.id, (q) => q(`select public.tournament_set_status($1, 'registration_open')`, [pT]));
		linked = await registerNarrow(pre, pAzad, pT, 'Old Linked');
		unlinked = await pre.asUser(pHost.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_host_add_entry($1, $2, '', null, null) as id`,
				[pT, 'Old Walk-up']
			);
			return r.rows[0].id;
		});
	}, 240_000);

	afterAll(async () => {
		await pre?.stop();
	});

	test('before 0192 there is no roster table and 2 entries', async () => {
		const r = await pre.sql<{ ok: boolean }>(
			`select to_regclass('public.tournament_entry_members') is not null as ok`
		);
		expect(r.rows[0].ok).toBe(false);
		const n = await pre.sql<{ n: string }>(`select count(*)::text as n from public.tournament_entries`);
		expect(Number(n.rows[0].n)).toBe(2);
	});

	test('0192 applies, saying "backfilled 2 member row(s)"; both entries have exactly 1 member with the right user_id, name, added_by and created_at', async () => {
		const notices = await applyWithNotices(pre.databaseName, readFileSync(MIGRATION_0192, 'utf8'));
		const mine = notices.filter((n) => n.startsWith('0192:'));
		expect(mine).toHaveLength(3);
		expect(mine[0]).toBe('0192: backfilled 2 member row(s), one per entry that had none.');
		expect(mine[1]).toBe(
			'0192: 2 member row(s) in total; 0 entries without a member; tournament_reward_ledger.member_id present = true.'
		);
		expect(mine[2]).toMatch(/^0192: 13 public functions checked/);
		const l = await membersOf(pre, linked);
		const u = await membersOf(pre, unlinked);
		expect(l).toHaveLength(1);
		expect(u).toHaveLength(1);
		expect(l[0]).toMatchObject({ name: 'Old Linked', user_id: pAzad.id, added_by: pAzad.id });
		expect(u[0]).toMatchObject({ name: 'Old Walk-up', user_id: null, added_by: pHost.id });
		const stamps = await pre.sql<{ same: boolean }>(
			`select bool_and(m.created_at = e.created_at) as same
			 from public.tournament_entry_members m join public.tournament_entries e on e.id = m.entry_id`
		);
		expect(stamps.rows[0].same).toBe(true);
		const total = await pre.sql<{ n: string }>(`select count(*)::text as n from public.tournament_entry_members`);
		expect(Number(total.rows[0].n)).toBe(2);
	});

	test('a pre-0192 config (no team_size key) is a solo tournament: joining is "full (1 of 1)"', async () => {
		const joiner = await createUser(pre, 'pre.joiner@boscotech.net', 'Pre Joiner');
		expect(
			await refusal(pre.asUser(joiner.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [linked, 'Joiner'])))
		).toBe('This entry is full (1 of 1).');
		// A deployed client resending a keyless config over a pre-0192 row:
		// the fold-in reads the absent stored key as 1 and writes 1, never
		// anything larger, and best_of_default lands.
		await pre.asUser(pHost.id, (q) =>
			q(`select public.tournament_update($1, null, null, $2::jsonb)`, [pT, JSON.stringify({ best_of_default: 3 })])
		);
		const cfg = await pre.sql<{ cfg: Record<string, unknown> }>(
			`select config as cfg from public.tournaments where id = $1`,
			[pT]
		);
		expect(cfg.rows[0].cfg.team_size).toBe(1);
		expect(cfg.rows[0].cfg.best_of_default).toBe(3);
	});

	test('the backfilled captain renames the entry and pings resolve to their account', async () => {
		await pre.asUser(pAzad.id, (q) =>
			q(`select public.tournament_update_entry($1, $2, null, null)`, [linked, 'Old Linked, renamed'])
		);
		const e = await pre.sql<{ display_name: string }>(
			`select display_name from public.tournament_entries where id = $1`,
			[linked]
		);
		expect(e.rows[0].display_name).toBe('Old Linked, renamed');
	});

	test('APPLIED A SECOND TIME: 2 members, same rows; 20 tournament functions, same signatures, defaults, ACLs and bodies; same publication', async () => {
		snapshot = {
			members: (await pre.sql<Member>(`select id, name, user_id, added_by from public.tournament_entry_members order by id`)).rows,
			procs: (await procSnapshot(pre)).rows,
			pubs: (await pubSnapshot(pre)).rows
		};
		expect(snapshot.members).toHaveLength(2);
		expect(snapshot.procs.length).toBeGreaterThanOrEqual(20);
		expect(snapshot.pubs.map((r) => (r as { tablename: string }).tablename)).toContain('tournament_entry_members');

		const notices = await applyWithNotices(pre.databaseName, readFileSync(MIGRATION_0192, 'utf8'));
		const mine = notices.filter((n) => n.startsWith('0192:'));
		expect(mine[0]).toBe('0192: backfilled 0 member row(s), one per entry that had none.');

		const after = {
			members: (await pre.sql<Member>(`select id, name, user_id, added_by from public.tournament_entry_members order by id`)).rows,
			procs: (await procSnapshot(pre)).rows,
			pubs: (await pubSnapshot(pre)).rows
		};
		expect(after).toEqual(snapshot);
		const reg = await pre.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'tournament_register_entry'`
		);
		expect(Number(reg.rows[0].n)).toBe(2);
	});

	test('the verification query from the header answers as the header says', async () => {
		const r = await pre.sql<{
			members: string;
			entries_without_members: string;
			register_overloads: string;
			wide_form_has_no_defaults: boolean;
			host_guard_admin_aware: boolean;
			ledger_member_column: boolean;
			anon_cannot_join: boolean;
		}>(`select
			  (select count(*) from public.tournament_entry_members)::text as members,
			  (select count(*) from public.tournament_entries e
			     where not exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id))::text as entries_without_members,
			  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			     where n.nspname = 'public' and p.proname = 'tournament_register_entry')::text as register_overloads,
			  (select bool_and(p.pronargdefaults = 0) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			     where n.nspname = 'public' and p.proname = 'tournament_register_entry' and p.pronargs = 6) as wide_form_has_no_defaults,
			  (select position('is_admin' in p.prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			     where n.nspname = 'public' and p.proname = '_tournament_require_host') as host_guard_admin_aware,
			  (select exists (select 1 from information_schema.columns
			     where table_schema = 'public' and table_name = 'tournament_reward_ledger' and column_name = 'member_id')) as ledger_member_column,
			  (select not has_function_privilege('anon', 'public.tournament_join_entry(uuid, text)', 'execute')) as anon_cannot_join`);
		expect(r.rows[0]).toEqual({
			members: '2',
			entries_without_members: '0',
			register_overloads: '2',
			wide_form_has_no_defaults: true,
			host_guard_admin_aware: true,
			ledger_member_column: true,
			anon_cannot_join: true
		});
	});
});

// ---------------------------------------------------------------------------
// 10. REWARDS: every registrant is paid
// ---------------------------------------------------------------------------

describe('rewards: a team of two beside a solo, win 10 / 1st place 50', () => {
	let t2: string;
	let team: string;
	let solo: string;
	let teamRows: Member[];
	let wf: Match;

	beforeAll(async () => {
		t2 = await createTournament(db, host, 'Reward Cup', 2);
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [
				t2,
				JSON.stringify([
					{ trigger_type: 'win', trigger_value: null, amount: 10 },
					{ trigger_type: 'placement', trigger_value: 1, amount: 50 }
				])
			])
		);
		team = await registerWide(db, azad, t2, 'Azad and Dana', 'Azad', []);
		await db.asUser(dana.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [team, 'Dana']));
		solo = await registerNarrow(db, eve, t2, 'Eve Solo');
		teamRows = await membersOf(db, team);
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t2]));
		await db.asUser(host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [t2]));
	}, 240_000);

	test('the fixture: 2 entries, a 2-member team (both linked) and a 1-member solo, a 2-match bracket', async () => {
		expect(teamRows).toHaveLength(2);
		expect(teamRows.map((m) => m.user_id)).toEqual([azad.id, dana.id]);
		expect(await membersOf(db, solo)).toHaveLength(1);
		const ms = await matchesOf(db, t2);
		expect(ms.map((m) => m.bracket).sort()).toEqual(['grand_final', 'winners']);
		wf = ms.find((m) => m.bracket === 'winners')!;
		expect([wf.entry_a_id, wf.entry_b_id].sort()).toEqual([team, solo].sort());
		expect(await ledgerOf(db, t2)).toHaveLength(0);
	});

	test('ping_entry on the team returns user_ids of BOTH linked members, captain first, and user_id = the first', async () => {
		const r = await db.asUser(host.id, (q) =>
			q<{ out: { user_id: string; user_ids: string[]; entry_name: string } }>(
				`select public.tournament_ping_entry($1, $2) as out`,
				[wf.id, team]
			)
		);
		expect(r.rows[0].out.user_ids).toEqual([azad.id, dana.id]);
		expect(r.rows[0].out.user_id).toBe(azad.id);
		expect(r.rows[0].out.entry_name).toBe('Azad and Dana');
		// The solo: one id, the same shape.
		const s = await db.asUser(host.id, (q) =>
			q<{ out: { user_id: string; user_ids: string[] } }>(`select public.tournament_ping_entry($1, $2) as out`, [
				wf.id,
				solo
			])
		);
		expect(s.rows[0].out.user_ids).toEqual([eve.id]);
		expect(s.rows[0].out.user_id).toBe(eve.id);
	});

	test('a FORFEIT in the winners final pays 0 rows', async () => {
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_submit_match_result($1, $2::jsonb)`, [
				wf.id,
				JSON.stringify({ forfeit: true, winner_id: team, reason: 'Solo no-show' })
			])
		);
		expect(await ledgerOf(db, t2)).toHaveLength(0);
		const gf = (await matchesOf(db, t2)).find((m) => m.bracket === 'grand_final')!;
		expect([gf.entry_a_id, gf.entry_b_id].sort()).toEqual([team, solo].sort());
	});

	test('the SOLO wins the grand final contested: 1 row, amount 10, user_id = Eve, member_id = her row; a reset is created', async () => {
		const gf = (await matchesOf(db, t2)).find((m) => m.bracket === 'grand_final')!;
		const out = await playContested(db, host, gf, solo);
		expect(out.reset_created).toBe(true);
		const rows = await ledgerOf(db, t2);
		expect(rows).toHaveLength(1);
		const [soloRow] = await membersOf(db, solo);
		expect(rows[0]).toMatchObject({
			entry_id: solo,
			user_id: eve.id,
			member_id: soloRow.id,
			amount: 10,
			reason: 'match win',
			match_id: gf.id
		});
	});

	test('the TEAM wins the reset contested: 2 rows for the win (one per member, 10 each) and 2 rows for 1st place (50 each); champion = the team', async () => {
		const reset = (await matchesOf(db, t2)).find((m) => m.bracket === 'grand_final_reset')!;
		const out = await playContested(db, host, reset, team);
		expect(out.tournament_status).toBe('complete');
		expect(out.champion_entry_id).toBe(team);

		const rows = await ledgerOf(db, t2);
		expect(rows).toHaveLength(5);
		const win = rows.filter((r) => r.match_id === reset.id);
		expect(win).toHaveLength(2);
		expect(win.map((r) => r.amount)).toEqual([10, 10]);
		expect(win.map((r) => r.user_id)).toEqual([azad.id, dana.id]);
		expect(win.map((r) => r.member_id)).toEqual(teamRows.map((m) => m.id));
		expect(win.every((r) => r.entry_id === team)).toBe(true);

		const place = rows.filter((r) => r.match_id === null);
		expect(place).toHaveLength(2);
		expect(place.map((r) => r.amount)).toEqual([50, 50]);
		expect(place.map((r) => r.reason)).toEqual(['1st place', '1st place']);
		expect(place.map((r) => r.member_id)).toEqual(teamRows.map((m) => m.id));
		// No 2nd-place rule was set, so the solo gets no placement row.
		expect(rows.filter((r) => r.entry_id === solo)).toHaveLength(1);
	});

	test('tournament_delete without the acknowledgement reports the SUMMED coins: 130 to 2 entries', async () => {
		const msg = await refusal(
			db.asUser(host.id, (q) => q(`select public.tournament_delete($1, $2, false)`, [t2, 'Reward Cup']))
		);
		expect(msg).toMatch(/^This tournament has paid out 130 IDEA Coins to 2 entries as reward payouts\./);
	});

	test('a linked teammate (Dana) may restyle the team entry after the event; the host may not', async () => {
		const r = await db.asUser(dana.id, (q) =>
			q<{ id: string | null }>(
				`select public.tournament_set_entry_style($1, null, null, null, 'crown', null, 'Champions') as id`,
				[team]
			)
		);
		expect(r.rows[0].id).toBe(team);
		expect(
			await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_set_entry_style($1, null, null, null, 'crown', null, null)`, [team])
				)
			)
		).toBe('Only a player on this entry can customize it.');
	});

	test('the admin deletes it with the acknowledgement and the name: reward_coins 130, 5 reward rows, every roster row gone', async () => {
		const r = await db.asUser(admin.id, (q) =>
			q<{ out: { deleted: boolean; reward_coins: number; reward_rows: number; reward_entries: number } }>(
				`select public.tournament_delete($1, $2, true) as out`,
				[t2, 'Reward Cup']
			)
		);
		expect(r.rows[0].out).toMatchObject({ deleted: true, reward_coins: 130, reward_rows: 5, reward_entries: 2 });
		const left = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entry_members where tournament_id = $1`,
			[t2]
		);
		expect(Number(left.rows[0].n)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 10b. REWARDS, THE UNLINKED TEAMMATE. The wide form with teammates ['Zed']
// puts a member with NO account on the winning team; the award writes that
// member a row of its own -- user_id null, member_id set, the FULL amount --
// rather than skipping it or folding it into the captain's row. The ledger's
// `user_id` is nullable for exactly this (0063: "null for unlinked walk-ups").
// ---------------------------------------------------------------------------

describe('rewards: an UNLINKED teammate (wide form, teammates [\'Zed\']) is paid a row of their own', () => {
	let t4: string;
	let team: string;
	let solo: string;
	let zedRows: Member[];
	let wf: Match;

	beforeAll(async () => {
		t4 = await createTournament(db, host, 'Zed Cup', 2);
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [
				t4,
				JSON.stringify([{ trigger_type: 'win', trigger_value: null, amount: 10 }])
			])
		);
		team = await registerWide(db, azad, t4, 'Azad and Zed', 'Azad', ['Zed']);
		solo = await registerNarrow(db, eve, t4, 'Eve Again');
		zedRows = await membersOf(db, team);
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t4]));
		await db.asUser(host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [t4]));
	}, 240_000);

	test('the fixture: the team is [Azad (linked), Zed (user_id null)], the solo is 1 member, the ledger is empty', async () => {
		expect(zedRows).toHaveLength(2);
		expect(zedRows[0]).toMatchObject({ name: 'Azad', user_id: azad.id });
		expect(zedRows[1]).toMatchObject({ name: 'Zed', user_id: null, added_by: azad.id });
		expect(await membersOf(db, solo)).toHaveLength(1);
		wf = (await matchesOf(db, t4)).find((m) => m.bracket === 'winners')!;
		expect([wf.entry_a_id, wf.entry_b_id].sort()).toEqual([team, solo].sort());
		expect(await ledgerOf(db, t4)).toHaveLength(0);
	});

	test("the team wins the winners final contested: 2 rows; Zed's row has user_id null, member_id = Zed's row, amount 10 (the full amount)", async () => {
		await playContested(db, host, wf, team);
		const rows = (await ledgerOf(db, t4)).filter((r) => r.match_id === wf.id);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			entry_id: team,
			user_id: azad.id,
			member_id: zedRows[0].id,
			amount: 10,
			reason: 'match win'
		});
		expect(rows[1]).toMatchObject({
			entry_id: team,
			user_id: null,
			member_id: zedRows[1].id,
			amount: 10,
			reason: 'match win'
		});
		// Positive control on the shape: the member_id is a REAL roster row,
		// and it is the unlinked one.
		const m = await db.sql<{ user_id: string | null; name: string }>(
			`select user_id, name from public.tournament_entry_members where id = $1`,
			[rows[1].member_id]
		);
		expect(m.rows).toHaveLength(1);
		expect(m.rows[0]).toEqual({ user_id: null, name: 'Zed' });
	});

	test('ping_entry on that team returns only the linked account: user_ids [Azad], user_id = Azad', async () => {
		const gf = (await matchesOf(db, t4)).find((m) => m.bracket === 'grand_final')!;
		const r = await db.asUser(host.id, (q) =>
			q<{ out: { user_id: string; user_ids: string[] } }>(`select public.tournament_ping_entry($1, $2) as out`, [
				gf.id,
				team
			])
		);
		expect(r.rows[0].out.user_ids).toEqual([azad.id]);
		expect(r.rows[0].out.user_id).toBe(azad.id);
	});

	test('tournament_delete without the acknowledgement reports the SUMMED coins: 20 to 1 entry (both rows counted)', async () => {
		const msg = await refusal(
			db.asUser(host.id, (q) => q(`select public.tournament_delete($1, $2, false)`, [t4, 'Zed Cup']))
		);
		expect(msg).toMatch(/^This tournament has paid out 20 IDEA Coins to 1 entry as reward payouts\./);
	});
});

// ---------------------------------------------------------------------------
// 11. THE POSITIVE CONTROL for the award: the same contested team win on a
// third database carrying a copy of 0192 whose per-member select is 0063's
// single-row insert. The sound database is measured first on a FRESH
// tournament, with the identical helper, so the two readings differ in
// exactly one thing.
// ---------------------------------------------------------------------------

/** A fresh team-of-two vs solo, bracket generated, the team wins the winners final contested. Returns that match's ledger rows. */
async function teamWinsContested(
	d: TestDb,
	u: { host: SeededUser; azad: SeededUser; dana: SeededUser; eve: SeededUser }
): Promise<Ledger[]> {
	const t = await createTournament(d, u.host, 'Control Cup', 2);
	await d.asUser(u.host.id, (q) =>
		q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [
			t,
			JSON.stringify([{ trigger_type: 'win', trigger_value: null, amount: 10 }])
		])
	);
	const team = await registerWide(d, u.azad, t, 'Control Team', 'Azad', []);
	await d.asUser(u.dana.id, (q) => q(`select public.tournament_join_entry($1, $2)`, [team, 'Dana']));
	await registerNarrow(d, u.eve, t, 'Control Solo');
	expect(await membersOf(d, team)).toHaveLength(2);
	await d.asUser(u.host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t]));
	await d.asUser(u.host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [t]));
	const wf = (await matchesOf(d, t)).find((m) => m.bracket === 'winners')!;
	await playContested(d, u.host, wf, team);
	return (await ledgerOf(d, t)).filter((r) => r.match_id === wf.id);
}

describe('positive control: 0192 with the legacy single-row _tournament_award', () => {
	let ctrl: TestDb;
	let cu: { host: SeededUser; azad: SeededUser; dana: SeededUser; eve: SeededUser };

	beforeAll(async () => {
		ctrl = await bootShortOf0192();
		const text = readFileSync(MIGRATION_0192, 'utf8');
		const begin = '\t-- 0192 award: one row per member (begin)\n';
		const end = '\t-- 0192 award: one row per member (end)\n';
		const i = text.indexOf(begin);
		const j = text.indexOf(end);
		expect(i).toBeGreaterThan(0);
		expect(j).toBeGreaterThan(i);
		expect(text.indexOf(begin, i + 1)).toBe(-1);
		const legacy =
			'\tinsert into public.tournament_reward_ledger\n' +
			'\t\t(tournament_id, entry_id, user_id, amount, reason, match_id)\n' +
			'\tselect p_tournament_id, e.id, e.user_id, p_amount, p_reason, p_match_id\n' +
			'\tfrom public.tournament_entries e\n' +
			'\twhere e.id = p_entry_id;\n';
		const mutated = text.slice(0, i) + legacy + text.slice(j + end.length);
		expect(mutated).not.toBe(text);
		await ctrl.sql(mutated);
		const src = await ctrl.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = '_tournament_award'`
		);
		expect(src.rows[0].src).not.toContain('tournament_entry_members');
		const s = await seedUsers(ctrl);
		cu = { host: s.host, azad: s.azad, dana: s.dana, eve: s.eve };
	}, 240_000);

	afterAll(async () => {
		await ctrl?.stop();
	});

	test('the sound database: the team win pays 2 rows, member_id set on both', async () => {
		const rows = await teamWinsContested(db, { host, azad, dana, eve });
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.member_id !== null)).toBe(true);
		expect(rows.map((r) => r.user_id)).toEqual([azad.id, dana.id]);
	});

	test('the mutant: the same win pays 1 row, member_id null, user_id = the captain only -- the "2 rows" assertion reddens', async () => {
		const rows = await teamWinsContested(ctrl, cu);
		expect(rows).toHaveLength(1);
		expect(rows[0].member_id).toBeNull();
		expect(rows[0].user_id).toBe(cu.azad.id);
	});
});

// ---------------------------------------------------------------------------
// 12. THE POSITIVE CONTROL for the team_size fold-in (decision (c)). The
// defect it closes is SILENT -- a keyless config shrinks a team event to
// solo and nothing raises -- so it is reproduced: a fourth database takes a
// copy of 0192 with the fold-in condition replaced by `if false then`, and
// the keyless update that keeps 3 on the sound database writes 1 there.
// ---------------------------------------------------------------------------

describe('positive control: 0192 with the team_size fold-in disabled', () => {
	let ctrl: TestDb;
	let cHost: SeededUser;
	let cT: string;

	beforeAll(async () => {
		ctrl = await bootShortOf0192();
		const text = readFileSync(MIGRATION_0192, 'utf8');
		const needle = "if jsonb_typeof(v_config) = 'object' and not (v_config ? 'team_size') then";
		expect(text.split(needle).length - 1).toBe(1);
		const mutated = text.replace(needle, 'if false then');
		expect(mutated).not.toBe(text);
		await ctrl.sql(mutated);
		const s = await seedUsers(ctrl);
		cHost = s.host;
		cT = await createTournament(ctrl, cHost, 'Control Config', 3);
	}, 240_000);

	afterAll(async () => {
		await ctrl?.stop();
	});

	test('the mutant: {best_of_default: 3} over a stored team_size 3 writes team_size 1 -- the "3 stays 3" assertion reddens', async () => {
		await ctrl.asUser(cHost.id, (q) =>
			q(`select public.tournament_update($1, null, null, $2::jsonb)`, [cT, JSON.stringify({ best_of_default: 3 })])
		);
		const cfg = await ctrl.sql<{ cfg: Record<string, unknown> }>(
			`select config as cfg from public.tournaments where id = $1`,
			[cT]
		);
		expect(cfg.rows[0].cfg.team_size).toBe(1);
		expect(cfg.rows[0].cfg.best_of_default).toBe(3);
	});
});
