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
//   D. SEQUENCES, exhaustively, and the declared list is EMPTY. Added after
//      0203. The identical bootstrap carries `grant all on sequences`, so a
//      sequence arrives holding USAGE, SELECT and UPDATE -- `nextval`,
//      `currval` and `setval` -- for both client roles, and a `bigserial` or
//      `generated always as identity` column creates one with nobody writing a
//      line for it. Three had been open since 0035, 0062 and 0063:
//      `gauntlet_run_events_id_seq`, `tournament_match_events_id_seq` and
//      `tournament_reward_ledger_id_seq`.
//      A, B and C could not see any of it -- `heldBy` reads
//      `relkind in ('r','v','m','p')`, and a sequence is `'S'` -- which is the
//      same one-object-class-over vacuum this file's own header describes for
//      tables and 0137 for functions. Nothing in this repository has ever
//      wanted a client sequence grant: every writer of every sequence-owning
//      table is a SECURITY DEFINER function running as the owner. So the
//      allowlist is empty ON PURPOSE and any entry added to it is a decision
//      somebody has to write a reason for.
//
//   E. VIEWS, exhaustively, in BOTH directions and including `authenticated`
//      SELECT. This is the one gap A, B and C leave open by design: B says
//      `authenticated` SELECT is "the ordinary case on ~100 objects and is
//      deliberately not enumerated". That is right for a table, whose RLS is
//      the boundary, and WRONG for a view -- an owner-privileged view (one
//      without `security_invoker`) bypasses the RLS of everything underneath
//      it, so its SELECT grant IS the boundary and CLAUDE.md requires it to
//      carry its own explicit row predicate instead. There are seven, which is
//      few enough to declare in full, and each entry states which of the two
//      kinds it is. That claim is CHECKED against `reloptions` rather than
//      merely written down, so a view that silently loses `security_invoker`
//      in a later `create or replace` reddens here.
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
import {
	SEQUENCE_PRIVILEGES,
	sequenceCount,
	sequencesHeldBy,
	describeSeq,
	viewFacts,
	type SeqHeld,
	type SequencePrivilege,
	type ViewFact
} from './db/grant-sweeps';

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
	'because profiles is not anon-readable. tournament_entry_members (0192) is the thirteenth, on ' +
	'the same decision: the roster under an entry, one CHOSEN name per registrant and never a ' +
	'profile name, revoked from anon and authenticated and then granted SELECT in the 0062 loop ' +
	'shape, because the projector (session-blind by rule) names the pair on the floor from it.';

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
	'tournament_entry_styles',
	'tournament_entry_members'
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
const ANON_SURFACE_SIZE = 20;

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

// ---------------------------------------------------------------------------
// D. THE SEQUENCE SURFACE.
//
// Empty on purpose. See the header: no migration in this repository has ever
// granted a client role anything on a sequence, and every one that was open
// got there through the project's `alter default privileges ... grant all on
// sequences`. 0203 narrowed the three that had.
//
// An entry added here is a real decision and needs a real reason, which is
// exactly the same bar section A sets for a new anonymous surface. What it
// would have to argue is that a client role should be able to call `nextval`,
// `currval` or `setval` DIRECTLY -- not through the definer RPC that owns the
// table, which runs as the owner and is unaffected by any of this.
// ---------------------------------------------------------------------------

interface SequenceEntry {
	/** Exactly the privileges `anon` may hold. Order-insensitive. */
	readonly anon: readonly SequencePrivilege[];
	/** Exactly the privileges `authenticated` may hold. Order-insensitive. */
	readonly authenticated: readonly SequencePrivilege[];
	readonly reason: string;
}

const SEQUENCE_SURFACE: Readonly<Record<string, SequenceEntry>> = {};

/** Pinned so an entry added silently fails. Zero is the correct value. */
const SEQUENCE_SURFACE_SIZE = 0;

// ---------------------------------------------------------------------------
// E. THE VIEW SURFACE.
//
// All seven, both roles, and the security model of each. `ownerPrivileged` is
// the thing that decides whether the SELECT grant beside it is a convenience
// or a boundary: a `security_invoker` view adds no reach at all and is filtered
// by the RLS of its own base tables, while an owner-privileged one bypasses
// that RLS entirely and has to carry a row predicate in its own body.
// ---------------------------------------------------------------------------

interface ViewEntry {
	/** Exactly the table privileges `anon` may hold. Empty on all seven. */
	readonly anon: readonly Privilege[];
	/** Exactly the table privileges `authenticated` may hold. */
	readonly authenticated: readonly Privilege[];
	/** True when the view has NO `security_invoker` reloption. Checked, not claimed. */
	readonly ownerPrivileged: boolean;
	readonly reason: string;
}

const VIEW_SURFACE: Readonly<Record<string, ViewEntry>> = {
	coin_balances: {
		anon: [],
		authenticated: ['select'],
		ownerPrivileged: false,
		reason:
			'A balance is a sum() over coin_transactions and is never stored (CLAUDE.md, State ' +
			'modelling). 0096 drops and recreates it `with (security_invoker = true)`, so it adds no ' +
			'reach of its own: a caller sees exactly the ledger rows coin_transactions\' own RLS ' +
			'would have shown them, summed. The SELECT grant is therefore a convenience and not a ' +
			'boundary, which is the whole reason the invoker flag is asserted beside it rather than ' +
			'described in a comment. 0149 took the inherited writes off it; the SELECT is the one ' +
			'privilege its own migration asked for.'
	},
	coin_contract_status: {
		anon: [],
		authenticated: ['select'],
		ownerPrivileged: true,
		reason:
			'OWNER-PRIVILEGED, and that is the decision 0077 section 3 states in its own header: it ' +
			'exists as a view rather than an RPC precisely so that a student can see how full a ' +
			'contract is while coin_contract_claims\' own RLS stays narrow. What it projects is a ' +
			'COUNT and a derived state word, never a claimant -- the aggregate is the row predicate, ' +
			'so no email, no user id and no per-claim row can come out of it however it is queried. ' +
			'anon holds nothing: the contract list a signed-out visitor reads is coin_public_contracts, ' +
			'a definer RPC, which is one of 0137\'s eighteen deliberate public surfaces and is not ' +
			'this view.'
	},
	gauntlet_leaderboard: {
		anon: [],
		authenticated: ['select'],
		ownerPrivileged: true,
		reason:
			'OWNER-PRIVILEGED DELIBERATELY, and 0060\'s header is the statement of it: a board that ' +
			'ran as the invoker would show each student only their own runs, which is a functional ' +
			'break rather than a narrowing -- the point of a leaderboard is other people\'s rows. The ' +
			'row predicate is the projection itself: a seat, a display name and a time. 0194 rebuilt ' +
			'it for the plausibility floor and added `rank_state`, which is the reason it is worth ' +
			'pinning here -- a `create or replace view` preserves reloptions, so a rebuild cannot ' +
			'quietly change the security model, and this entry is what would catch it if one did. ' +
			'anon holds nothing, which 0060 asserted at apply time for exactly this view.'
	},
	gauntlet_room_board: {
		anon: [],
		authenticated: ['select'],
		ownerPrivileged: true,
		reason:
			'The per-room board, owner-privileged for the same reason as gauntlet_leaderboard and ' +
			'named in the same sentence of 0060\'s header. 0060 exists because the two room views ' +
			'were returning rows from rooms the caller was not in: the fix was an explicit row ' +
			'predicate in the body (the caller must be a participant in, or the host of, the room), ' +
			'which is what CLAUDE.md requires of an owner-privileged view and what replaces the RLS ' +
			'it bypasses. anon holds nothing.'
	},
	gauntlet_room_roster: {
		anon: [],
		authenticated: ['select'],
		ownerPrivileged: true,
		reason:
			'The other half of the same 0060 fix, on the same decision and with the same explicit ' +
			'room-membership predicate in its body. It is the more sensitive of the pair -- a roster ' +
			'is a list of people -- which is why the scoping bug it was written to close is worth the ' +
			'entry. anon holds nothing.'
	},
	gauntlet_speedrun_attempt_history: {
		anon: [],
		authenticated: ['select'],
		ownerPrivileged: false,
		reason:
			'`security_invoker = true`, set by 0033 at creation and called out approvingly in 0060\'s ' +
			'header as the one GAUNTLET view that SHOULD have it, "because that one is deliberately ' +
			'own-rows-only". A student reads their own attempt history and nobody else\'s, and the ' +
			'thing enforcing that is the RLS on the base table rather than anything in the view. ' +
			'Losing the flag here would silently turn a private history into a public one with no ' +
			'other symptom, which is what this entry is for.'
	},
	notebook_entry_activity: {
		anon: [],
		authenticated: ['select'],
		ownerPrivileged: false,
		reason:
			'`security_invoker = true`, rebuilt at 0129 for the autosave coalescing change. This is ' +
			'the view section B\'s own comment already singles out: it is AUTO-UPDATABLE ' +
			'(information_schema reports is_updatable = YES), so before 0149 a client role held ' +
			'INSERT, UPDATE and DELETE on it by inheritance and only the invoker reloption stood ' +
			'between that and a write into the notebook. B still asserts no write on any view; this ' +
			'entry adds the half B does not cover, which is that the SELECT is the only thing left ' +
			'and the flag that makes it harmless is still set.'
	}
};

/** Pinned so an entry added silently fails. */
const VIEW_SURFACE_SIZE = 7;

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
	let seqHeld: SeqHeld[];
	let views: ViewFact[];

	beforeAll(async () => {
		db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
		anonHeld = await heldBy(db, 'anon');
		authedHeld = await heldBy(db, 'authenticated');
		seqHeld = [...(await sequencesHeldBy(db, 'anon')), ...(await sequencesHeldBy(db, 'authenticated'))];
		views = await viewFacts(db);
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
	// The same guard, one object class over, and section D needs it MORE than
	// section A needs the one above -- because D's declared list is EMPTY, so
	// every one of its assertions is an absence over an absence. Without the
	// `alter default privileges ... grant all on sequences` line in
	// tests/db/supabase-stub.sql, a sequence created here comes out holding
	// nothing for `anon`, D passes on a fixture that cannot reproduce the
	// defect, and the three sequences 0203 narrowed would never have shown up
	// in the first place.
	// -----------------------------------------------------------------------
	it('the fixture carries the hosted default privileges for SEQUENCES too', async () => {
		await db.sql(`create sequence if not exists public.zz_default_privilege_probe_seq`);
		try {
			const { rows } = await db.sql<{ priv: string; held: boolean }>(
				`select p.priv, has_sequence_privilege('anon', 'public.zz_default_privilege_probe_seq', p.priv) as held
				   from unnest($1::text[]) as p(priv)`,
				[[...SEQUENCE_PRIVILEGES]]
			);
			const missing = rows.filter((r) => !r.held).map((r) => r.priv);
			expect(
				missing,
				'A sequence created here must inherit USAGE, SELECT and UPDATE for `anon`, the way it ' +
					'does on a hosted project. If this fails, the `alter default privileges ... grant ' +
					'all on sequences` line in tests/db/supabase-stub.sql has been moved, narrowed or ' +
					'lost, and every assertion in section D is vacuous.'
			).toEqual([]);
		} finally {
			await db.sql(`drop sequence if exists public.zz_default_privilege_probe_seq`);
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
			expect(new Set(anonHeld.map((h) => h.name)).size, 'anon: the thirteen tournament tables, the six IDEA Maps tables, and fsp_frc_interest.').toBe(ANON_SURFACE_SIZE);
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

		it('found the sequences and the views it is about to reconcile', async () => {
			// Section D's declared list is EMPTY and section E's is seven long.
			// An absence assertion over a sweep that found no objects at all is
			// green for the wrong reason, so both counts are reported here and
			// neither section may be read without them.
			const n = await sequenceCount(db);
			expect(
				n,
				'Measured at 3: gauntlet_run_events_id_seq, tournament_match_events_id_seq and ' +
					'tournament_reward_ledger_id_seq. Every other key in this schema is a uuid. If this ' +
					'is 0 the catalog query stopped matching and section D proves nothing.'
			).toBeGreaterThan(0);
			expect(views.length, 'Section E declares all of them by name.').toBe(VIEW_SURFACE_SIZE);
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
	// D. Sequences.
	// -----------------------------------------------------------------------
	describe('D. what a client role reaches on a SEQUENCE', () => {
		it('holds nothing this file does not declare, and the declared list is empty', () => {
			const undeclared = seqHeld.filter((h) => !SEQUENCE_SURFACE[h.name]);
			expect(
				undeclared.map(describeSeq),
				'A sequence privilege is USAGE (nextval), SELECT (currval, last_value) or UPDATE ' +
					'(setval), and no migration in this repository has ever granted one to a client ' +
					'role. Every occurrence is inherited from `alter default privileges ... grant all ' +
					'on sequences`, which a `bigserial` or `generated always as identity` column trips ' +
					'without anybody writing a line. 0203 narrowed the three that had been open since ' +
					'0035, 0062 and 0063. Revoke it ' +
					'in a migration on 0203\'s shape -- `revoke all on sequence ... from public, anon, ' +
					'authenticated` BY NAME, because `from public` alone removes an entry these ' +
					'sequences do not have -- or add it to SEQUENCE_SURFACE with the reason a client ' +
					'should be able to call setval directly. Note the definer RPC that writes the ' +
					'owning table runs as the OWNER and needs none of this.'
			).toEqual([]);
		});

		it('holds exactly the declared privileges on each declared sequence', () => {
			const drift: string[] = [];
			for (const [name, entry] of Object.entries(SEQUENCE_SURFACE)) {
				for (const role of ['anon', 'authenticated'] as const) {
					const actual = seqHeld
						.filter((h) => h.name === name && h.role === role)
						.map((h) => h.privilege)
						.sort();
					const expected = [...entry[role]].sort();
					if (JSON.stringify(actual) !== JSON.stringify(expected)) {
						drift.push(
							`${name} (${role}): declared [${expected.join(', ')}], holds [${actual.join(', ')}]`
						);
					}
				}
			}
			expect(drift, 'Drift in either direction is a finding, exactly as in A.').toEqual([]);
		});

		it('declares a non-empty reason for every entry', () => {
			const thin = Object.entries(SEQUENCE_SURFACE)
				.filter(([, e]) => e.reason.trim().length < 40)
				.map(([n]) => n);
			expect(thin, 'An entry without a real reason is a hole with a line drawn over it.').toEqual(
				[]
			);
		});

		it('pins the list length so an entry added silently fails', () => {
			expect(
				Object.keys(SEQUENCE_SURFACE).length,
				'Zero is the correct value and the only one anybody has ever needed. If this moved, ' +
					'the entry above it is the thing to read.'
			).toBe(SEQUENCE_SURFACE_SIZE);
		});
	});

	// -----------------------------------------------------------------------
	// E. Views.
	// -----------------------------------------------------------------------
	describe('E. what a client role reaches on a VIEW', () => {
		it('declares every view in the schema, and declares no view that is gone', () => {
			const present = views.map((v) => v.name).sort();
			const declared = Object.keys(VIEW_SURFACE).sort();
			const undeclared = present.filter((n) => !VIEW_SURFACE[n]);
			const stale = declared.filter((n) => !views.some((v) => v.name === n));
			expect(
				undeclared,
				'A new view is a new read path, and unlike a table its SELECT grant can be the whole ' +
					'boundary. Declare it with the reason its migration gives, and say which of the two ' +
					'kinds it is.'
			).toEqual([]);
			expect(
				stale,
				'A declared view that no longer exists means this list is describing a surface that is ' +
					'gone, which is how a reader comes to trust a reason for something nobody can read.'
			).toEqual([]);
		});

		it('holds exactly the declared privileges on each view, for both client roles', () => {
			const drift: string[] = [];
			for (const [name, entry] of Object.entries(VIEW_SURFACE)) {
				for (const [role, held] of [
					['anon', anonHeld],
					['authenticated', authedHeld]
				] as const) {
					const actual = held
						.filter((h) => h.name === name)
						.map((h) => h.privilege)
						.sort();
					const expected = [...entry[role]].sort();
					if (JSON.stringify(actual) !== JSON.stringify(expected)) {
						drift.push(
							`${name} (${role}): declared [${expected.join(', ')}], holds [${actual.join(', ')}]`
						);
					}
				}
			}
			expect(
				drift,
				'This is the assertion A and B do not make: B enumerates only WRITES for ' +
					'`authenticated`, on the stated grounds that its SELECT is the ordinary case on ~100 ' +
					'objects. For a VIEW it is not ordinary -- an owner-privileged one bypasses the RLS ' +
					'of every table beneath it -- so all seven are enumerated in both directions.'
			).toEqual([]);
		});

		it('agrees with the catalog about which views are owner-privileged', () => {
			const wrong: string[] = [];
			for (const v of views) {
				const entry = VIEW_SURFACE[v.name];
				if (!entry) continue; // the previous test is the one that reports an undeclared view
				if (entry.ownerPrivileged !== v.ownerPrivileged) {
					wrong.push(
						`${v.name}: declared ownerPrivileged=${entry.ownerPrivileged}, catalog says ${v.ownerPrivileged}`
					);
				}
			}
			expect(
				wrong,
				'`create or replace view` PRESERVES reloptions, so a rebuild cannot change this by ' +
					'accident -- but a drop-and-recreate can, silently, and an invoker view that ' +
					'quietly became owner-privileged is a private history turned public with no other ' +
					'symptom. 0060 is the precedent: it found three GAUNTLET views returning rows from ' +
					'rooms the caller was not in. Read off `reloptions`, so the entry beside it cannot ' +
					'be merely a claim.'
			).toEqual([]);
		});

		it('grants `anon` nothing on any view, with no exceptions', () => {
			const found = anonHeld.filter((h) => h.kind === 'v' || h.kind === 'm');
			expect(
				found.map(describeHeld),
				'Every public surface in this codebase is a definer RPC that projects the address and ' +
					'the identity away inside the database -- CLAUDE.md: "A public surface over an ' +
					'email-keyed schema uses `anon`-granted RPCs ... never a table grant, never a ' +
					'`security_invoker` view." A view here would be the second way in.'
			).toEqual([]);
		});

		it('declares a non-empty reason for every entry', () => {
			const thin = Object.entries(VIEW_SURFACE)
				.filter(([, e]) => e.reason.trim().length < 40)
				.map(([n]) => n);
			expect(thin).toEqual([]);
		});

		it('pins the list length so an entry added silently fails', () => {
			expect(Object.keys(VIEW_SURFACE).length).toBe(VIEW_SURFACE_SIZE);
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
