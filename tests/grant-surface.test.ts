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
// WHY THE SUITE COULD NOT SEE ANY OF IT. tests/db/supabase-stub.sql carried the
// FUNCTION half of those default privileges and its own header explained, at
// length, why a stub more permissive than the real thing "does not fail
// loudly". The TABLE half was never added. So in the fixture an object came out
// holding exactly what its migration granted, the reconciliation was trivially
// true, and the defect was invisible by construction -- the identical vacuum
// 0137 closed for functions, one object class over.
//
// THE TABLE HALF IS IN THE SHARED STUB NOW, WHICH IS THE POINT OF THIS FILE'S
// SECOND BUNDLE. It spent one bundle in this file's own prelude, so that a red
// suite could be told apart from a bad revoke while the revokes were being
// written; that reason expired when 0149 landed, and the cost of leaving it was
// that every OTHER db suite still ran against a fixture where an assertion that
// `anon` cannot reach something was weaker than it looked. MEASURED, unchanged
// by the move: a view created by a migration comes out `anon=arwdDxtm/postgres`,
// which is exactly production's DELETE,INSERT,REFERENCES,SELECT,TRIGGER,
// TRUNCATE,UPDATE; without those lines, only what the migration wrote. Applied
// to the full chain it reproduces the production sweep object for object:
// nineteen objects reachable by `anon`, the same nineteen.
//
// WHAT IS LEFT IN THIS FILE'S PRELUDE IS NOT THE DEFAULTS. It is
// tests/db/full-chain-fixture-completion.sql: auth.jwt() (read by 0043) and an
// empty supabase_realtime publication (0064 adds a table to it). The
// publication in particular MUST NOT move into the shared stub --
// tests/notebook-review-acknowledged.test.ts asserts the fixture has none and
// creates one itself to exercise the other world.
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

/**
 * Applied first, before 0001: auth.jwt() and the empty realtime publication.
 * NOT the hosted default privileges, which are in the shared stub. See the
 * header.
 */
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

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
	maps_nodes: {
		privileges: ['select'],
		reason:
			'The spatial containers: rooms, storage units, compartments. ' +
			'IDEA Maps is public-read by design and this is the headline decision of the feature: IDEA_MAPS_SPEC.md section 2, "Read access: fully public, no sign-in. Published data is anonymously readable on every read path." Explicit, not inherited: 0161:8 is `revoke all ... from public, anon, authenticated` followed by `grant select ... to anon, authenticated` on each of the four content tables. SELECT alone -- anon holds no write privilege on any of them, which 0161\'s own self-check raises on. What anon can SEE is narrowed a second time by RLS rather than by the grant: the only anon-facing policy is `using (status = \'published\')`, so a DRAFT row is unreachable through this grant. tests/maps-rls-boundary.test.ts proves both halves and mutation-proves the policy.'
	},
	maps_item_types: {
		privileges: ['select'],
		reason:
			'The searchable vocabulary (spec 5.1): names, aliases, tags, brand, part number. ' +
			'IDEA Maps is public-read by design and this is the headline decision of the feature: IDEA_MAPS_SPEC.md section 2, "Read access: fully public, no sign-in. Published data is anonymously readable on every read path." Explicit, not inherited: 0161:8 is `revoke all ... from public, anon, authenticated` followed by `grant select ... to anon, authenticated` on each of the four content tables. SELECT alone -- anon holds no write privilege on any of them, which 0161\'s own self-check raises on. What anon can SEE is narrowed a second time by RLS rather than by the grant: the only anon-facing policy is `using (status = \'published\')`, so a DRAFT row is unreachable through this grant. tests/maps-rls-boundary.test.ts proves both halves and mutation-proves the policy.'
	},
	maps_items: {
		privileges: ['select'],
		reason:
			'Unique items -- this specific machine, with its serial. ' +
			'IDEA Maps is public-read by design and this is the headline decision of the feature: IDEA_MAPS_SPEC.md section 2, "Read access: fully public, no sign-in. Published data is anonymously readable on every read path." Explicit, not inherited: 0161:8 is `revoke all ... from public, anon, authenticated` followed by `grant select ... to anon, authenticated` on each of the four content tables. SELECT alone -- anon holds no write privilege on any of them, which 0161\'s own self-check raises on. What anon can SEE is narrowed a second time by RLS rather than by the grant: the only anon-facing policy is `using (status = \'published\')`, so a DRAFT row is unreachable through this grant. tests/maps-rls-boundary.test.ts proves both halves and mutation-proves the policy.'
	},
	maps_stock: {
		privileges: ['select'],
		reason:
			'Stocked types placed somewhere, with a quantity. ' +
			'IDEA Maps is public-read by design and this is the headline decision of the feature: IDEA_MAPS_SPEC.md section 2, "Read access: fully public, no sign-in. Published data is anonymously readable on every read path." Explicit, not inherited: 0161:8 is `revoke all ... from public, anon, authenticated` followed by `grant select ... to anon, authenticated` on each of the four content tables. SELECT alone -- anon holds no write privilege on any of them, which 0161\'s own self-check raises on. What anon can SEE is narrowed a second time by RLS rather than by the grant: the only anon-facing policy is `using (status = \'published\')`, so a DRAFT row is unreachable through this grant. tests/maps-rls-boundary.test.ts proves both halves and mutation-proves the policy.'
	},
	maps_photos: {
		privileges: ['select'],
		reason:
			'Photo rows for nodes, item types and items (spec 4.4), on the same public-read decision as the four content tables above. 0163:173 revokes from public, anon, authenticated and grants SELECT back to anon, authenticated; the row is reachable only where its parent object is published, and the BYTES are a separate decision -- the maps-media bucket carries its own storage.objects policy. No anon write of any kind.'
	},
	maps_search_log: {
		privileges: ['insert'],
		reason:
			'The one anon WRITE in IDEA Maps, and it is the feature working rather than a hole. Spec 5.4: "Every query is logged with its result count and timestamp, no identity (readers are anonymous)" -- the vocabulary grows from misses, and the readers who miss are by definition not signed in, so a signed-in-only log would collect nothing from the people it exists for. This is the repo\'s documented anonymous-intake shape (CLAUDE.md, Write path): there is nothing to forge in a query string. The table has NO identity column of any kind -- query, result_count, created_at, and a uuid key rather than a sequence -- so an inserted row cannot be tied to a person even by whoever reads it. 0162:5 grants INSERT to anon and SELECT to authenticated only, and the sole SELECT policy is `to authenticated using (public.is_admin())`, so anon can write and can never read back. No UPDATE or DELETE exists for any client role: the misses it exists to surface must not be editable into silence.'
	},
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
const ANON_SURFACE_SIZE = 19;

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
	maps_nodes: {
		privileges: ['insert', 'update', 'delete'],
		reason:
			'IDEA Maps editor, admin-only in P1. ' +
			'0161\'s header states the deviation and its scope: "WRITE ACCESS IS EDITOR-ROLE RLS POLICIES ON public.is_admin() (0067), the predicate this repo already uses for the admin tier -- not a new one. This is a stated deviation from the repo\'s every-write-is-a-definer-RPC default: P1\'s editor is admin-only and writes through these policies; maps_publish is the one RPC because promote-and-retain must be atomic." So the GRANT is deliberately wide and the POLICY is the boundary: every one of the insert/update/delete policies is `to authenticated` with `public.is_admin()` in its USING and WITH CHECK, so a signed-in non-admin holding this grant is refused by RLS at 42501 and writes nothing. That is the layer tests/maps-rls-boundary.test.ts mutation-proves, table by table and policy by policy -- the grant alone would not stop anybody, and the suite asserts the anon refusal (grant layer) and the signed-in non-admin refusal (RLS layer) as two separate proofs. The P2 student-grant tier is a widening with its own bundle.'
	},
	maps_item_types: {
		privileges: ['insert', 'update', 'delete'],
		reason:
			'IDEA Maps editor: the item-type vocabulary. ' +
			'0161\'s header states the deviation and its scope: "WRITE ACCESS IS EDITOR-ROLE RLS POLICIES ON public.is_admin() (0067), the predicate this repo already uses for the admin tier -- not a new one. This is a stated deviation from the repo\'s every-write-is-a-definer-RPC default: P1\'s editor is admin-only and writes through these policies; maps_publish is the one RPC because promote-and-retain must be atomic." So the GRANT is deliberately wide and the POLICY is the boundary: every one of the insert/update/delete policies is `to authenticated` with `public.is_admin()` in its USING and WITH CHECK, so a signed-in non-admin holding this grant is refused by RLS at 42501 and writes nothing. That is the layer tests/maps-rls-boundary.test.ts mutation-proves, table by table and policy by policy -- the grant alone would not stop anybody, and the suite asserts the anon refusal (grant layer) and the signed-in non-admin refusal (RLS layer) as two separate proofs. The P2 student-grant tier is a widening with its own bundle.'
	},
	maps_items: {
		privileges: ['insert', 'update', 'delete'],
		reason:
			'IDEA Maps editor: unique items. ' +
			'0161\'s header states the deviation and its scope: "WRITE ACCESS IS EDITOR-ROLE RLS POLICIES ON public.is_admin() (0067), the predicate this repo already uses for the admin tier -- not a new one. This is a stated deviation from the repo\'s every-write-is-a-definer-RPC default: P1\'s editor is admin-only and writes through these policies; maps_publish is the one RPC because promote-and-retain must be atomic." So the GRANT is deliberately wide and the POLICY is the boundary: every one of the insert/update/delete policies is `to authenticated` with `public.is_admin()` in its USING and WITH CHECK, so a signed-in non-admin holding this grant is refused by RLS at 42501 and writes nothing. That is the layer tests/maps-rls-boundary.test.ts mutation-proves, table by table and policy by policy -- the grant alone would not stop anybody, and the suite asserts the anon refusal (grant layer) and the signed-in non-admin refusal (RLS layer) as two separate proofs. The P2 student-grant tier is a widening with its own bundle.'
	},
	maps_stock: {
		privileges: ['insert', 'update', 'delete'],
		reason:
			'IDEA Maps editor: stock placements. ' +
			'0161\'s header states the deviation and its scope: "WRITE ACCESS IS EDITOR-ROLE RLS POLICIES ON public.is_admin() (0067), the predicate this repo already uses for the admin tier -- not a new one. This is a stated deviation from the repo\'s every-write-is-a-definer-RPC default: P1\'s editor is admin-only and writes through these policies; maps_publish is the one RPC because promote-and-retain must be atomic." So the GRANT is deliberately wide and the POLICY is the boundary: every one of the insert/update/delete policies is `to authenticated` with `public.is_admin()` in its USING and WITH CHECK, so a signed-in non-admin holding this grant is refused by RLS at 42501 and writes nothing. That is the layer tests/maps-rls-boundary.test.ts mutation-proves, table by table and policy by policy -- the grant alone would not stop anybody, and the suite asserts the anon refusal (grant layer) and the signed-in non-admin refusal (RLS layer) as two separate proofs. The P2 student-grant tier is a widening with its own bundle.'
	},
	maps_photos: {
		privileges: ['insert', 'update', 'delete'],
		reason:
			'IDEA Maps photo rows (spec 4.4), on the same admin-only editor path as the four content tables above: 0163 grants insert/update/delete to authenticated and gates all three on `public.is_admin()` in the policy. The bytes behind a row live in the maps-media bucket and are governed separately by storage.objects policies, which are admin-only for every write.'
	},
	maps_revisions: {
		privileges: ['insert', 'update', 'delete'],
		reason:
			'The draft-and-publish staging table (spec 4.3), and the write grant is narrowed by policy in TWO independent ways rather than one. Admin: all four policies carry `public.is_admin()`. And STATE: the insert, update and delete policies each additionally require `state = \'pending\'`, so a client can stage, adjust and discard a pending edit and can never touch a RETAINED row. Retained history is minted only by the SECURITY DEFINER trigger _maps_retain_revision (which is what makes retention a property of the table rather than of client discipline) and removed only by the FK cascade when its object is deleted. anon holds no grant here in any direction.'
	},
	maps_search_log: {
		privileges: ['insert'],
		reason:
			'The signed-in half of the anonymous search log. 0162 grants INSERT to anon AND authenticated for the same reason 0046 does on the FSP form: being signed in must not be the thing that stops your missed query teaching the vocabulary anything. INSERT only -- no UPDATE and no DELETE for any client role, because an append-only miss log that can be edited is one whose misses can be tidied away. SELECT is authenticated-only and admin-gated by policy.'
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
const AUTHENTICATED_WRITE_SURFACE_SIZE = 21;

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
		db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
		anonHeld = await heldBy(db, 'anon');
		authedHeld = await heldBy(db, 'authenticated');
	}, 300_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// The fixture has to be able to REPRODUCE the defect before any absence
	// assertion below means anything. Without the hosted table default
	// privileges every object comes out holding exactly what its migration
	// granted and all three reconciliations pass vacuously.
	//
	// THE LINES IT PROBES ARE IN THE SHARED STUB NOW, WHICH MAKES THIS GUARD
	// MORE LOAD-BEARING THAN IT WAS, NOT LESS. When they sat in this file's own
	// prelude the chain named them literally, so a reader of the beforeAll
	// could see them; now they are one line in a file 48 db suites share and
	// nothing in this file mentions them. This is the only thing standing
	// between this file and a green run over a fixture that cannot reproduce
	// the defect it exists for. It probes an object it creates ITSELF rather
	// than reading pg_default_acl, because what matters is what a new object
	// actually inherits, which is the thing production does differently.
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
					'on a hosted project. If this fails, the `alter default privileges ... grant all on ' +
					'tables` line in tests/db/supabase-stub.sql has been moved, narrowed or lost, every ' +
					'absence assertion in this file is vacuous -- and so is every assertion in the other ' +
					'db suites that a client role cannot reach something.'
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
			expect(new Set(anonHeld.map((h) => h.name)).size, 'anon: the twelve tournament tables, the six IDEA Maps tables, and fsp_frc_interest.').toBe(ANON_SURFACE_SIZE);
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
