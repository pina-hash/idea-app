// tests/grant-surface.test.ts
//
// THE MIGRATIONS ARE THE INTENT AND THE CATALOG IS THE REALITY, AND UNTIL THIS
// FILE NOTHING HAD EVER COMPARED THEM.
//
// A hosted Supabase project bootstraps `alter default privileges in schema
// public grant all on tables to anon, authenticated, service_role`, so every
// table and view a migration creates arrives holding SELECT, INSERT, UPDATE,
// DELETE, TRUNCATE, REFERENCES and TRIGGER for `anon` and `authenticated`
// before the migration grants anything -- and `create or replace view`
// preserves grants, so an inherited privilege survives every later recreation.
// A migration saying `grant select ... to authenticated` therefore describes
// what its author was thinking about, not what the object holds. 0060 found
// three views this way; a production sweep on 2026-08-28 found six more, one of
// which (a view over student full names and room participation) had been open
// for roughly two months.
//
// WHY THE SUITE COULD NOT SEE ANY OF IT. tests/db/supabase-stub.sql carries the
// FUNCTION half of those default privileges and its own header explains, at
// length, why a stub more permissive than the real thing "does not fail
// loudly". The TABLE half was never added. So in the fixture an object came out
// holding exactly what its migration granted, the reconciliation was trivially
// true, and the defect was invisible by construction -- the identical vacuum
// 0137 closed for functions, one object class over.
// tests/db/hosted-table-default-privileges.sql supplies it. MEASURED: with that
// file a view created by a migration comes out `anon=arwdDxtm/postgres`, which
// is exactly production's DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,
// UPDATE; without it, only what the migration wrote. Applied to the full chain
// it reproduces the production sweep object for object: nineteen objects
// reachable by `anon`, the same nineteen.
//
// IT IS THIS FILE'S OWN PRELUDE, NOT THE SHARED STUB, and that is a deliberate
// limit rather than an oversight. Turning it on in the stub changes what all 48
// database files apply, which is a decision for a bundle that owns them; folded
// in here it would also have arrived in the same commit as the revokes, so a
// red suite could not be told apart from a bad revoke. The consequence is worth
// knowing: OTHER db suites still run without table default privileges, so an
// assertion elsewhere that `anon` cannot select something is still weaker than
// it looks. Moving these lines into the stub is the right eventual home.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE ASSERTS
// ---------------------------------------------------------------------------
// Three reconciliations, each list-driven, each entry carrying the reason
// somebody decided it. An intentional public grant is a line somebody wrote;
// a hole somebody left has no line and reddens.
//
//   A. THE ANONYMOUS SURFACE, exhaustively. `anon` is the public internet, and
//      its reach is small enough to declare in full. Any object holding an
//      `anon` privilege that ANON_SURFACE does not declare fails, and any
//      declared object whose privilege set has drifted fails in either
//      direction -- a grant added, or a grant this list still claims.
//
//   B. THE CLIENT WRITE SURFACE, exhaustively. The platform doctrine is "ZERO
//      client write grants on feature tables -- every write is a SECURITY
//      DEFINER RPC that re-checks the caller inside its own body", so
//      `authenticated` holding INSERT, UPDATE, DELETE or TRUNCATE is exactly
//      the interesting set and is small. `authenticated` SELECT is the ordinary
//      case on ~100 objects and is deliberately not enumerated -- a list that
//      long carries no signal and would be maintained by pasting -- but C
//      catches a new object regardless.
//
//   C. REFERENCES AND TRIGGER, with NO exceptions at all. Neither is ever
//      deliberately granted to a client role anywhere in this codebase; they
//      arrive only by inheritance. So they are the tripwire that fires on a
//      brand-new object even if somebody adds that object to A and B for a
//      reason that sounded good.
//
// A future migration's `create table` inherits all seven privileges and so
// reddens all three at once, which is the point: the next instance of this will
// be an object that does not exist yet, and none of the three lists names it.
//
// The list LENGTHS are pinned so an entry added silently fails -- a reviewer
// then has to look at the reason, which is the whole mechanism.
//
// `service_role` IS NOT RECONCILED, deliberately: it bypasses RLS by design,
// holds grants no client has, and a CHECK constraint's function runs as the
// WRITING role (0131), so narrowing it breaks direct server writes. 0137 left
// it alone for the same reason.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, type TestDb } from './db/harness';

/**
 * The whole chain, in file order, over a database carrying the hosted
 * default privileges. Read from disk rather than listed, so a migration added
 * tomorrow is reconciled the day it lands instead of the day somebody
 * remembers to add it here.
 */
const MIGRATION_DIR = new URL('../supabase/migrations', import.meta.url);
const ALL_MIGRATIONS = readdirSync(MIGRATION_DIR)
	.filter((f) => f.endsWith('.sql'))
	.sort();

/** Applied first, before 0001. See the header. */
const HOSTED_DEFAULTS = '../../tests/db/hosted-table-default-privileges.sql';

const TABLE_PRIVILEGES = [
	'select',
	'insert',
	'update',
	'delete',
	'truncate',
	'references',
	'trigger'
] as const;
type Privilege = (typeof TABLE_PRIVILEGES)[number];

interface SurfaceEntry {
	/** Exactly the privileges this role may hold. Order-insensitive. */
	readonly privileges: readonly Privilege[];
	/** Why. Not decoration: this is the thing a reviewer reads. */
	readonly reason: string;
}

// ---------------------------------------------------------------------------
// A. THE ANONYMOUS SURFACE.
//
// Thirteen objects, all of them a deliberate public surface with a migration
// that REVOKED the defaults and then granted back exactly one privilege --
// which is the shape that distinguishes a decision from an inheritance.
// ---------------------------------------------------------------------------

const TOURNAMENT_PUBLIC_REASON =
	'Public bracket, established rather than assumed. 0062:239-262 runs `revoke all ... from ' +
	'anon, authenticated` and THEN `grant select` per table over a literal array of all nine; ' +
	'0063:240-258 and 0064:108-120 do the same for the other three. A revoke before the grant ' +
	'is the opposite of inheritance. /tournaments is deliberately absent from authedPrefixes ' +
	'and five of its eight routes load with no session, so a signed-out visitor really does ' +
	'render a live bracket (tv/+page.server.ts: "FULLY PUBLIC and deliberately session-blind ' +
	'... must not gain [a guard]"). Identity was decided on purpose: no tournament table has an ' +
	'email column, there is no view over any of them, and the public identity is ' +
	'tournament_entries.display_name, TYPED by the entrant at registration, never a Google ' +
	'account name -- 0062 calls it an IDENTITY RULE. user_id columns are opaque uuids, opaque ' +
	'because profiles is not anon-readable.';

const TOURNAMENT_TABLES = [
	'tournaments',
	'tournament_hosts',
	'tournament_entries',
	'tournament_invites',
	'tournament_qual_pools',
	'tournament_qual_matches',
	'tournament_bracket_matches',
	'tournament_match_games',
	'tournament_match_events',
	'tournament_reward_rules',
	'tournament_reward_ledger',
	'tournament_entry_styles'
] as const;

const ANON_SURFACE: Readonly<Record<string, SurfaceEntry>> = {
	...Object.fromEntries(
		TOURNAMENT_TABLES.map((t) => [
			t,
			{ privileges: ['select'] as const, reason: TOURNAMENT_PUBLIC_REASON }
		])
	),
	fsp_frc_interest: {
		privileges: ['insert'],
		reason:
			'The public FRC interest form at /fsp/frc-interest, reached cold from a QR code. Explicit, ' +
			'not inherited: 0046:32 is `revoke all ... from anon, authenticated` followed by `grant ' +
			'insert ... to anon`. 0046 header: "Prospective freshmen and parents scanning the code will ' +
			'not have a Bosco Tech account, so this is the one FSP surface that accepts an anonymous ' +
			'submission with no auth gate at all." /fsp is not in authedPrefixes and the page has no ' +
			'server load; the insert goes out on the browser anon client from ' +
			'src/lib/fsp/frc-interest.ts:79. Revoking it breaks the form, quietly, in its own error ' +
			'state. Reads are double-locked: anon holds no SELECT, and the only SELECT policy is `to ' +
			'authenticated using (public.is_teacher())`.'
	}
};

/** Pinned so an entry added silently fails. */
const ANON_SURFACE_SIZE = 13;

// ---------------------------------------------------------------------------
// B. THE CLIENT WRITE SURFACE.
//
// Every object `authenticated` may INSERT, UPDATE, DELETE or TRUNCATE. The
// doctrine is zero client write grants on feature tables, so each of these is
// a deliberate exception with a stated reason -- and after 0149 not one of
// them is a view.
// ---------------------------------------------------------------------------

const AUTHENTICATED_WRITE_SURFACE: Readonly<Record<string, SurfaceEntry>> = {
	app_feedback: {
		privileges: ['insert'],
		reason:
			'A signed-in report is a direct insert whose WITH CHECK pins user_id to auth.uid(); the ' +
			'anonymous path is app_feedback_submit, granted to service_role alone. CLAUDE.md keeps the ' +
			'two apart deliberately and 0126\'s XOR check makes one row shape impossible anyway.'
	},
	fsp_frc_interest: {
		privileges: ['insert'],
		reason:
			'The signed-in half of the same public intake form. 0046:33 grants insert to anon AND ' +
			'authenticated, because being signed in must not be the thing that stops you submitting.'
	},
	fsp_item_opens: {
		privileges: ['insert'],
		reason:
			'0048:44 grants `select, insert` and its comment states the intent: "SELECT + INSERT only ' +
			'(no UPDATE/DELETE), so PostgREST can never issue a mutating statement the policies would ' +
			'otherwise have to guard." A first-open row is append-only self-write, contained by `with ' +
			'check (auth.uid() = user_id)`. 0149 removed the inherited UPDATE/DELETE/TRUNCATE that had ' +
			'made that comment untrue. Note the module behind it has no importer anywhere in the repo.'
	},
	frc_gate_submissions: {
		privileges: ['insert', 'update'],
		reason: 'FRC gate review: a student submits and revises their own gate answer under own-row RLS.'
	},
	fsp_config: {
		privileges: ['update'],
		reason: 'The FSP live-session config row, updated in place by staff under its own policy.'
	},
	gauntlet_series: {
		privileges: ['insert', 'update', 'delete'],
		reason: 'GAUNTLET authoring: a series is authored from the client under an author/admin policy.'
	},
	gauntlet_speedrun_ruleset: {
		privileges: ['update'],
		reason: 'The speedrun ruleset row, tuned in place from the GAUNTLET authoring surface.'
	},
	greenline_decals: {
		privileges: ['insert', 'update', 'delete'],
		reason: 'A player owns their decals; own-row RLS, with admin moderation on top.'
	},
	greenline_loadouts: {
		privileges: ['insert', 'update'],
		reason: 'A player owns their loadouts. No delete: a loadout is kept, not removed.'
	},
	greenline_loadout_slots: {
		privileges: ['insert', 'update', 'delete'],
		reason: 'The child rows of a loadout, edited with it under the same own-row policy.'
	},
	profiles: {
		privileges: ['update'],
		reason:
			'A person edits their own profile (display_name, avatar, preferences, pathway) under ' +
			'own-row RLS. No insert: handle_new_user creates the row. No delete, ever. Role changes ' +
			'are refused server-side by enforce_role_change, never by withholding this grant.'
	},
	vanguard_runs: {
		privileges: ['insert'],
		reason: 'VANGUARD appends a run record. Insert only: a run is history and is never edited.'
	},
	vanguard_run_state: {
		privileges: ['insert', 'update', 'delete'],
		reason: 'The live per-run state VANGUARD writes as it plays, owned by the running player.'
	},
	vanguard_saves: {
		privileges: ['insert', 'update'],
		reason: 'VANGUARD cloud save, own-row. No delete: a save is overwritten, not removed.'
	}
};

/** Pinned so an entry added silently fails. */
const AUTHENTICATED_WRITE_SURFACE_SIZE = 14;

const WRITE_PRIVILEGES = ['insert', 'update', 'delete', 'truncate'] as const;

interface Held {
	readonly name: string;
	readonly kind: string;
	readonly privilege: Privilege;
}

/** Everything `role` actually holds in `public`, straight off the catalog. */
async function heldBy(db: TestDb, role: string): Promise<Held[]> {
	const { rows } = await db.sql<{ relname: string; relkind: string; privilege: string }>(
		`select c.relname, c.relkind, p.privilege
		   from pg_class c
		   join pg_namespace n on n.oid = c.relnamespace
		   cross join unnest($2::text[]) as p(privilege)
		  where n.nspname = 'public'
		    and c.relkind in ('r', 'v', 'm', 'p')
		    and has_table_privilege($1, c.oid, p.privilege)
		  order by c.relname, p.privilege`,
		[role, [...TABLE_PRIVILEGES]]
	);
	return rows.map((r) => ({
		name: r.relname,
		kind: r.relkind,
		privilege: r.privilege as Privilege
	}));
}

const describeHeld = (h: Held) => `${h.privilege} on ${h.kind === 'v' ? 'view' : 'table'} ${h.name}`;

describe('grant surface: the migrations against the catalog', () => {
	let db: TestDb;
	let anonHeld: Held[];
	let authedHeld: Held[];

	beforeAll(async () => {
		db = await startTestDb([HOSTED_DEFAULTS, ...ALL_MIGRATIONS]);
		anonHeld = await heldBy(db, 'anon');
		authedHeld = await heldBy(db, 'authenticated');
	}, 300_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// The fixture has to be able to REPRODUCE the defect before any absence
	// assertion below means anything. Without the prelude every object comes
	// out holding exactly what its migration granted and all three
	// reconciliations pass vacuously.
	// -----------------------------------------------------------------------
	it('the fixture actually carries the hosted default privileges', async () => {
		await db.sql(`create table if not exists public.zz_default_privilege_probe (id int)`);
		try {
			const { rows } = await db.sql<{ priv: string; held: boolean }>(
				`select p.priv, has_table_privilege('anon', 'public.zz_default_privilege_probe', p.priv) as held
				   from unnest($1::text[]) as p(priv)`,
				[[...TABLE_PRIVILEGES]]
			);
			const missing = rows.filter((r) => !r.held).map((r) => r.priv);
			expect(
				missing,
				'A table created here must inherit the full privilege set for `anon`, the way it does ' +
					'on a hosted project. If this fails, tests/db/hosted-table-default-privileges.sql is ' +
					'not being applied and every absence assertion in this file is vacuous.'
			).toEqual([]);
		} finally {
			await db.sql(`drop table if exists public.zz_default_privilege_probe`);
		}
	});

	// -----------------------------------------------------------------------
	// POSITIVE CONTROLS. Every reconciliation below is an ABSENCE assertion, and
	// an absence assertion over a sweep that swept nothing is green for the
	// wrong reason. These report the counts the sweep actually saw, so "no
	// findings" can be told apart from "no data".
	// -----------------------------------------------------------------------
	describe('the sweep saw the database', () => {
		it('applied the whole chain, not a prefix of it', () => {
			expect(ALL_MIGRATIONS.length, 'Read off disk; a chain that stopped early is a green run over half a schema.').toBeGreaterThanOrEqual(147);
			expect(ALL_MIGRATIONS).toContain('0149_grant_surface_reconciliation.sql');
		});

		it('found the objects the chain creates', async () => {
			const { rows } = await db.sql<{ n: number }>(
				`select count(*)::int as n from pg_class c
				   join pg_namespace n on n.oid = c.relnamespace
				  where n.nspname = 'public' and c.relkind in ('r','v','m','p')`
			);
			expect(rows[0].n, 'Measured at 113 across 147 migrations.').toBeGreaterThan(100);
		});

		it('found a non-empty grant surface for both client roles', () => {
			// If heldBy() ever returns nothing -- a renamed role, a typo in the
			// privilege list, a catalog query that stopped matching -- every
			// `toEqual([])` below passes and reports a clean database.
			expect(new Set(anonHeld.map((h) => h.name)).size, 'anon: the twelve tournament tables plus fsp_frc_interest.').toBe(ANON_SURFACE_SIZE);
			expect(
				new Set(
					authedHeld
						.filter((h) => (WRITE_PRIVILEGES as readonly string[]).includes(h.privilege))
						.map((h) => h.name)
				).size,
				'authenticated: the fourteen declared write exceptions.'
			).toBe(AUTHENTICATED_WRITE_SURFACE_SIZE);
			expect(authedHeld.filter((h) => h.privilege === 'select').length, 'The ordinary case, deliberately not enumerated -- but it must be there.').toBeGreaterThan(50);
		});
	});

	// -----------------------------------------------------------------------
	// A. The anonymous surface.
	// -----------------------------------------------------------------------
	describe('A. what `anon` reaches', () => {
		it('holds nothing this file does not declare, with a reason', () => {
			const undeclared = anonHeld.filter((h) => !ANON_SURFACE[h.name]);
			expect(
				undeclared.map(describeHeld),
				'`anon` is the public internet. An object here holds a privilege no entry in ' +
					'ANON_SURFACE claims -- almost certainly inherited from the project default ' +
					'privileges rather than granted by anyone. Trace every caller, then either revoke ' +
					'it in a migration or add it to ANON_SURFACE with the reason somebody decided it.'
			).toEqual([]);
		});

		it('holds exactly the declared privilege on each declared object', () => {
			const drift: string[] = [];
			for (const [name, entry] of Object.entries(ANON_SURFACE)) {
				const actual = anonHeld
					.filter((h) => h.name === name)
					.map((h) => h.privilege)
					.sort();
				const expected = [...entry.privileges].sort();
				if (JSON.stringify(actual) !== JSON.stringify(expected)) {
					drift.push(`${name}: declared [${expected.join(', ')}], holds [${actual.join(', ')}]`);
				}
			}
			expect(
				drift,
				'Drift in either direction is a finding. Holding MORE than declared is the defect this ' +
					'file exists for. Holding LESS means this list is describing a surface that is gone, ' +
					'which is how a public form breaks with nothing saying so.'
			).toEqual([]);
		});

		it('declares a non-empty reason for every entry', () => {
			const thin = Object.entries(ANON_SURFACE)
				.filter(([, e]) => e.reason.trim().length < 40)
				.map(([n]) => n);
			expect(thin, 'An entry without a real reason is a hole with a line drawn over it.').toEqual(
				[]
			);
		});

		it('pins the list length so an entry added silently fails', () => {
			expect(
				Object.keys(ANON_SURFACE).length,
				'Adding a public surface is a disclosure decision. If this number moved, the entry ' +
					'above it is the thing to read.'
			).toBe(ANON_SURFACE_SIZE);
		});
	});

	// -----------------------------------------------------------------------
	// B. The client write surface.
	// -----------------------------------------------------------------------
	describe('B. what `authenticated` may write', () => {
		it('writes nothing this file does not declare, with a reason', () => {
			const undeclared = authedHeld.filter(
				(h) =>
					(WRITE_PRIVILEGES as readonly string[]).includes(h.privilege) &&
					!AUTHENTICATED_WRITE_SURFACE[h.name]
			);
			expect(
				undeclared.map(describeHeld),
				'The doctrine is zero client write grants on feature tables: every write is a SECURITY ' +
					'DEFINER RPC that re-checks the caller in its own body. A write privilege here is ' +
					'either an inherited default nobody wrote, or a real exception that needs its reason ' +
					'in AUTHENTICATED_WRITE_SURFACE.'
			).toEqual([]);
		});

		it('holds exactly the declared write privileges on each declared object', () => {
			const drift: string[] = [];
			for (const [name, entry] of Object.entries(AUTHENTICATED_WRITE_SURFACE)) {
				const actual = authedHeld
					.filter(
						(h) => h.name === name && (WRITE_PRIVILEGES as readonly string[]).includes(h.privilege)
					)
					.map((h) => h.privilege)
					.sort();
				const expected = [...entry.privileges].sort();
				if (JSON.stringify(actual) !== JSON.stringify(expected)) {
					drift.push(`${name}: declared [${expected.join(', ')}], holds [${actual.join(', ')}]`);
				}
			}
			expect(drift).toEqual([]);
		});

		it('grants no write on a VIEW at all', () => {
			const viewWrites = authedHeld.filter(
				(h) => h.kind === 'v' && (WRITE_PRIVILEGES as readonly string[]).includes(h.privilege)
			);
			expect(
				viewWrites.map(describeHeld),
				'No migration in this repo has ever granted a write on a view; every one of these is ' +
					'inherited. It is not inert either -- notebook_entry_activity is auto-updatable ' +
					'(information_schema reports is_updatable = YES), so only its security_invoker ' +
					'reloption stands between a client role and a write into the notebook.'
			).toEqual([]);
		});

		it('declares a non-empty reason for every entry', () => {
			const thin = Object.entries(AUTHENTICATED_WRITE_SURFACE)
				.filter(([, e]) => e.reason.trim().length < 40)
				.map(([n]) => n);
			expect(thin).toEqual([]);
		});

		it('pins the list length so an entry added silently fails', () => {
			expect(Object.keys(AUTHENTICATED_WRITE_SURFACE).length).toBe(
				AUTHENTICATED_WRITE_SURFACE_SIZE
			);
		});
	});

	// -----------------------------------------------------------------------
	// C. The unconditional tripwire.
	// -----------------------------------------------------------------------
	describe('C. REFERENCES and TRIGGER, which are never granted deliberately', () => {
		it('are held by neither client role, anywhere, with no exceptions', () => {
			const found = [...anonHeld, ...authedHeld].filter(
				(h) => h.privilege === 'references' || h.privilege === 'trigger'
			);
			expect(
				found.map(describeHeld),
				'Nothing in supabase/migrations grants REFERENCES or TRIGGER to a client role, so every ' +
					'occurrence is an inherited default. This list has no exceptions ON PURPOSE: it is ' +
					'the check that still fires on a brand-new object after somebody has added that ' +
					'object to ANON_SURFACE or AUTHENTICATED_WRITE_SURFACE for a reason that sounded good.'
			).toEqual([]);
		});
	});

	// -----------------------------------------------------------------------
	// The reads the reconciled objects exist for must survive it.
	// -----------------------------------------------------------------------
	it('leaves every reconciled object readable by `authenticated`', () => {
		const reconciled = [
			'coin_balances',
			'coin_contract_status',
			'gauntlet_speedrun_attempt_history',
			'notebook_entry_activity',
			'gauntlet_leaderboard',
			'gauntlet_room_board',
			'gauntlet_room_roster',
			'notebook_folders',
			'fsp_item_opens'
		];
		const lost = reconciled.filter(
			(n) => !authedHeld.some((h) => h.name === n && h.privilege === 'select')
		);
		expect(
			lost,
			'0149 narrows these nine. Each was granted exactly `select to authenticated` by its own ' +
				'migration and every consuming surface is signed in; a revoke that took the SELECT with ' +
				'the writes would break a working page.'
		).toEqual([]);
	});
});
