// tests/db/ideacad-grants-anon-execute-surface.test.ts
//
// THE anon EXECUTE SURFACE OF `public`, SWEPT WHOLE -- and 0202's own repair
// pinned inside the same file, because the repair is one instance of what the
// sweep is for.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------------
//
// A hosted Supabase project bootstraps
//
//   alter default privileges in schema public
//     grant execute on functions to anon, authenticated, service_role;
//
// so every function a migration creates arrives holding a DIRECT grant to
// `anon`. The repo's older narrowing, `revoke all on function f from public`,
// removes the single PUBLIC entry the SQL default would have written and leaves
// that direct grant exactly where it was. 0137 swept the schema once for this
// and 0166 established the shape that prevents it -- revoke from `public, anon,
// authenticated` BY NAME, then grant back deliberately.
//
// 0201 invented its own shape and lost the `anon` clause, and all ten of its
// functions came out anon-executable on production. Nothing in this suite
// noticed, because nothing in this suite had ever looked: `grant-surface.test.ts`
// reconciles TABLES and VIEWS against the catalog and says so in its own header
// ("the identical vacuum 0137 closed for functions, one object class over") --
// it has never read `pg_proc`. This file is that missing half.
//
// ---------------------------------------------------------------------------
// WHAT IT ASSERTS
// ---------------------------------------------------------------------------
//
//   A. THE GENERAL SWEEP. Every function in `public` after the WHOLE chain is
//      applied. Any one executable by `anon` that ANON_EXECUTE_SURFACE does not
//      declare fails, and any declared name the catalog no longer shows as
//      anon-executable fails too -- drift in either direction. The list is
//      keyed on the function NAME rather than the full signature, deliberately:
//      an overload added to a deliberately-public function is the same decision
//      as the original and should not redden, while a brand-new NAME always
//      does. The length is pinned so an entry added silently fails and a
//      reviewer has to read the reason, which is the whole mechanism.
//
//   B. THE IDEACAD GRANT SURFACE, CLASSIFIED RATHER THAN COUNTED. No ideacad
//      function is executable by `anon` -- swept BY PREFIX, universally, with no
//      count and no exemption, because that is the property 0201's defect
//      violated and every future ideacad migration should uphold. Every
//      client-callable one holds `authenticated`; every definer-only one
//      withholds it; every ideacad table gives `anon` nothing and
//      `authenticated` nothing beyond SELECT.
//
//      THIS SECTION USED TO PIN A COUNT ("all ten functions and no more") AND
//      REQUIRE `authenticated` ON EVERY ONE OF THEM, which is what 0202 section
//      4 asserts at apply time. Both were facts about 0201's world and neither
//      survived 0205, which adds nine functions, two of them definer-only
//      helpers that withhold the client grant on purpose. A count is a number
//      somebody bumps until the test is green; a CLASSIFICATION is a decision
//      somebody makes about the function in front of them, and it is the thing
//      a later migration can answer for its own objects. 0206 makes the same
//      split at apply time and supersedes 0202's check; see that file's header.
//
//   C. IDEMPOTENCE. 0206 is applied a SECOND time over the database the chain
//      already left, and the full acl of every ideacad object is compared before
//      and after. It is 0206 and no longer 0202 for the reason above: once 0205
//      is applied, re-pasting 0202 raises on both of its incidental assertions.
//      0202's file is an applied record and is not rewritten; the property moves
//      to the guard that replaced its check rather than being dropped.
//
//   F. THE SEAM. 0206 section 1 and this file's IDEACAD_FUNCTIONS are two
//      independent statements of one classification -- deliberately, since a
//      test whose expected value comes from the thing it tests cannot fail --
//      so section F parses the migration's own VALUES list back out of the
//      `.sql` file and reconciles the two, names and kinds both.
//
//   G. THE GUARD DRIVEN TO A REFUSAL, four ways and back again. 0206 passing on
//      the chain is one reading, and on its own it is equally consistent with a
//      guard that can never refuse anything -- so an `anon` grant is planted on
//      a client-callable function and on a definer-only one, a client-callable
//      function is stripped of `authenticated`, and a table is handed TRUNCATE,
//      each mutation named EXACTLY and each restored. The arm that matters most
//      is the one with no mutation in it at all: the guard ADMITS a definer-only
//      helper holding no client grant, which is precisely what 0202 refuses and
//      the whole reason 0206 exists.
//
//   E. THE WITHOUT-0202 CONTROL, which is what stops A and B being a green tick
//      over a property something else in the chain happened to provide. A
//      SECOND database is booted with the identical chain MINUS 0202, and every
//      one of 0201's TEN must be anon-executable there while zero are on the
//      chain that has it. That is 0201's defect, reproduced, so "0202 closes it"
//      is a measured difference rather than an assertion about a file. It is a
//      CONTAINMENT and no longer an exact-set comparison: what the control is
//      for is 0201's ten, and an exact set says as much about what else happens
//      to be open, which lands a later ideacad migration here for a reason that
//      has nothing to do with 0202.
//
//   D. THE MUTATION PROOF. A sweep that found nothing because it was looking in
//      the wrong place reports exactly what a clean database reports. So the
//      sweep is re-run with `anon` granted EXECUTE on one ordinary private
//      function, and must name it; the grant is then revoked and the sweep must
//      come back clean. The mutation is a catalog edit and the restore is a
//      revoke of the same grant -- NOTHING under `supabase/migrations/` is read,
//      written or re-applied, and no `git` command is run (CLAUDE.md: a
//      `git checkout --` inside a mutation script silently discarded three
//      sessions' uncommitted work).
//
// `service_role` IS NOT RECONCILED, for the reason 0137 and
// `grant-surface.test.ts` both give: it bypasses RLS by design and a CHECK
// constraint's function runs as the WRITING role (0131), so narrowing it breaks
// direct server writes rather than tightening anything.
//
// `authenticated` IS NOT RECONCILED EITHER, and that is a scope line rather than
// an oversight. `authenticated` EXECUTE is the ordinary case on most of this
// schema -- every student-facing RPC holds it on purpose -- so a list that long
// carries no signal and would be maintained by pasting. What is dangerous is the
// PUBLIC INTERNET reaching a definer function, and that is `anon`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './harness';

/**
 * The whole chain, in file order, read from disk rather than listed -- so a
 * migration added tomorrow is swept the day it lands instead of the day
 * somebody remembers to add it here. Same mechanism `grant-surface.test.ts`
 * uses, and for the same reason.
 */
const MIGRATION_DIR = new URL('../../supabase/migrations', import.meta.url);
const ALL_MIGRATIONS = readdirSync(MIGRATION_DIR)
	.filter((f) => f.endsWith('.sql'))
	.sort();

/**
 * Applied first, before 0001: auth.jwt() (read by 0043) and an empty
 * supabase_realtime publication (0064 adds a table to it). Passed as a path
 * relative to the migrations directory, which is the shape `startTestDb`
 * resolves. NOT the hosted default privileges -- those are in the shared stub,
 * which is what makes the whole sweep below non-vacuous.
 */
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

/** The file section E's control chain leaves out. */
const MIGRATION_0202 = '0202_ideacad_anon_grant_repair.sql';

/** The file whose idempotence section C measures. See section C for why it is
 *  this one and no longer 0202. */
const MIGRATION_0206 = '0206_ideacad_grant_guard.sql';

/**
 * EVERY IDEACAD FUNCTION, CLASSIFIED -- and the classification, not a count, is
 * what this file pins.
 *
 * 0202's self-check asserted there were EXACTLY TEN and that EVERY one of them
 * was executable by `authenticated`. Both were true of 0201's world and neither
 * survived 0205, which adds nine -- four of them predicates, two of which
 * withhold the `authenticated` grant DELIBERATELY because nothing but a
 * SECURITY DEFINER body ever calls them. A count is a fact about today's
 * population; `kind` is a fact about the function itself, and it is the one a
 * later migration can answer for its own objects.
 *
 * `client` means A BROWSER REACHES IT, by either of the two routes that impose
 * the same requirement: PostgREST calls it as an RPC, or an RLS policy names
 * it. The second is the one that looks wrong and is not -- a policy expression
 * is evaluated as the QUERYING role, so an underscore-prefixed predicate in a
 * `using` clause has to hold the grant or the read fails with
 * `permission denied for function` instead of returning the caller's own rows.
 * That is the 0070 lesson 0109 wrote down.
 *
 * `definer` means NOTHING BUT ANOTHER DEFINER BODY CALLS IT. It runs as the
 * owner when it is reached, so a client grant buys the caller nothing the RPC
 * above it does not already give them, and withholding it is the narrower end
 * state.
 *
 * `migration` is what section E reads: its control is about the world 0201 left
 * and 0202 repaired, which is 0201's rows and not 0205's.
 *
 * This table is the test-side twin of 0206 section 1. The two are deliberately
 * NOT derived from one another: the migration's list is what the DATABASE
 * enforces at apply time and this one is what the SUITE enforces on every run,
 * and a test whose expected value comes from the thing it tests cannot fail.
 * `describe('F')` below reconciles them, which is the seam that catches a drift.
 */
interface IdeacadFn {
	readonly kind: 'client' | 'definer';
	readonly migration: '0201' | '0205';
	readonly reason: string;
}

const RPC_0201 = 'An RPC the Blade editor calls. 0201 created it; 0202 narrowed it to 0166 shape.';
const RPC_0205 = 'A sharing RPC. 0205 created it and revoked it from `public, anon, authenticated` by name.';
const POLICY_PREDICATE =
	'A 0205 predicate NAMED INSIDE AN RLS `using` CLAUSE, so it is evaluated as the querying role and ' +
	'must hold the grant. Revoking it does not narrow the read, it breaks it outright.';
const DEFINER_ONLY =
	'A 0205 predicate reached ONLY from a SECURITY DEFINER body. No policy names it and no client calls ' +
	'it, so it holds no client grant at all -- which is exactly what 0202 could not express and what ' +
	'made its "every ideacad function is executable by authenticated" assertion stop being true.';

const IDEACAD_FUNCTIONS: Readonly<Record<string, IdeacadFn>> = {
	// --- 0201's ten. Every one of them an RPC. ---
	ideacad_set_editor: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_open_document: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_new_concept: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_save_concept: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_update_concept_meta: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_delete_concept: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_set_active: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_set_prediction: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_commit_concept: { kind: 'client', migration: '0201', reason: RPC_0201 },
	ideacad_roster: { kind: 'client', migration: '0201', reason: RPC_0201 },

	// --- 0205's five sharing RPCs. ---
	ideacad_share_document: { kind: 'client', migration: '0205', reason: RPC_0205 },
	ideacad_unshare_document: { kind: 'client', migration: '0205', reason: RPC_0205 },
	ideacad_document_grants: { kind: 'client', migration: '0205', reason: RPC_0205 },
	ideacad_open_shared_document: { kind: 'client', migration: '0205', reason: RPC_0205 },
	ideacad_shared_with_me: { kind: 'client', migration: '0205', reason: RPC_0205 },

	// --- 0205's four predicates, split by whether a POLICY names them. ---
	_ideacad_can_read_document: { kind: 'client', migration: '0205', reason: POLICY_PREDICATE },
	_ideacad_manages_document: { kind: 'client', migration: '0205', reason: POLICY_PREDICATE },
	_ideacad_document_role: { kind: 'definer', migration: '0205', reason: DEFINER_ONLY },
	_ideacad_can_write_document: { kind: 'definer', migration: '0205', reason: DEFINER_ONLY }
};

/**
 * WHICH MIGRATIONS THIS RUN'S CHAIN ACTUALLY CONTAINS.
 *
 * A tree carrying 0206 and not 0205 is an ORDINARY STATE here, not a mistake:
 * migrations are applied by hand one file at a time, the two files were written
 * on two different unmerged lanes, and `ALL_MIGRATIONS` is read off the
 * directory rather than listed. So the expectations below are a LADDER over
 * what the chain has, the same widen-then-degrade shape every client select in
 * this repo uses -- and NOT a set pinned to whichever lane happened to land
 * first, which is a test that goes red on a legitimate tree.
 *
 * It reads the FILES, never the catalog: deriving "is 0205 here" from whether
 * its functions turned up would make every assertion below circular.
 */
const chainHas = (migration: string): boolean =>
	ALL_MIGRATIONS.some((f) => f.startsWith(`${migration}_`));

/** The classified functions this run's chain is expected to have created. */
const EXPECTED_FUNCTIONS: Readonly<Record<string, IdeacadFn>> = Object.fromEntries(
	Object.entries(IDEACAD_FUNCTIONS).filter(([, f]) => chainHas(f.migration))
);

/** Every expected ideacad function name, by whichever cut is wanted. */
const ideacadNames = (pick: (f: IdeacadFn) => boolean): string[] =>
	Object.entries(EXPECTED_FUNCTIONS)
		.filter(([, f]) => pick(f))
		.map(([name]) => name)
		.sort();

/** The prefix every ideacad function and table name starts from. */
const IDEACAD_FN_RE = /^_?ideacad/;

/**
 * 0201's four. Section E's control is about THESE and not about 0205's
 * `ideacad_grants`: that table was created by a migration which revokes its own
 * inherited privileges in its own text, so it is correctly narrow on a chain
 * with 0202 left out and is not part of the defect 0202 repaired.
 */
const IDEACAD_0201_TABLES = [
	'ideacad_editors',
	'ideacad_documents',
	'ideacad_concepts',
	'ideacad_predictions'
] as const;

/**
 * The tables whose `authenticated` SELECT the feature depends on. 0201's four
 * plus 0205's one. Named rather than swept, because "this grant must still be
 * there" is only answerable about a table somebody decided it for -- a future
 * ideacad table with RLS and no client grant at all is a legitimate shape
 * (`student_app_plays` is exactly that), and sweeping would refuse it.
 */
const IDEACAD_SELECT_TABLES: readonly string[] = [
	...IDEACAD_0201_TABLES,
	...(chainHas('0205') ? (['ideacad_grants'] as const) : [])
];

// ---------------------------------------------------------------------------
// A. THE DECLARED anon EXECUTE SURFACE.
//
// Every entry is a function some migration granted to `anon` IN ITS OWN TEXT --
// not a guess about what looks public. The reason is the thing a reviewer
// reads; it is not decoration.
// ---------------------------------------------------------------------------

const COIN_PUBLIC_REASON =
	'THE PUBLIC COIN LEDGER. /coins/ is in the public tier and is reachable with no session at ' +
	'all. 0089 granted the eight to `anon` in its own text and 0157 re-granted two of them after ' +
	'a hardening pass. They exist as anon RPCs rather than as a table grant or a ' +
	'`security_invoker` view precisely so the address is projected away INSIDE the database and ' +
	'each row comes back under an opaque id -- there is no parameter or field through which an ' +
	'email can be requested or returned.';

const GAUNTLET_MACRO_REASON =
	'THE UNAUTHENTICATED GAUNTLET RUN PATH. A SOLIDWORKS macro calls these with the anon key and ' +
	'a run code; 0016 states it outright -- "the Start macro is unauthenticated (anon key); the ' +
	'code is the credential". There is no session to have. 0137 kept all five on the strength of ' +
	'the migrations\' own stated intent and said plainly that it had NOT re-confirmed the macro ' +
	'still calls them; that uncertainty is inherited here unchanged rather than quietly dropped. ' +
	'Retiring the surface means revoking them in their own migration, by somebody who checked.';

const MAPS_SEARCH_REASON =
	'THE PUBLIC IDEA MAPS VIEWER. /maps reads no session and is deliberately not under the ' +
	'/maps/edit gate (CLAUDE.md, and IDEA_MAPS_SPEC sections 2 and 5). 0162 section 6 grants ' +
	'maps_search and the four helpers its INVOKER body evaluates, and does it in 0166\'s shape -- ' +
	'`revoke ... from public, anon, authenticated` and then a grant naming both client roles. A ' +
	'revoke before the grant is what distinguishes a decision from an inheritance, and is why ' +
	'these five are on this list rather than in front of it.';

const ANON_EXECUTE_SURFACE: Readonly<Record<string, string>> = {
	// --- The public coin ledger (8). 0089, 0096, 0103, 0107, 0157. ---
	coin_public_contracts: COIN_PUBLIC_REASON,
	coin_public_leaderboard: COIN_PUBLIC_REASON,
	coin_public_reasons: COIN_PUBLIC_REASON,
	coin_public_role_questions: COIN_PUBLIC_REASON,
	coin_public_roles: COIN_PUBLIC_REASON,
	coin_public_sections: COIN_PUBLIC_REASON,
	coin_public_student: COIN_PUBLIC_REASON,
	coin_public_transactions: COIN_PUBLIC_REASON,

	// --- The public classroom surfaces (4). 0092, 0109, 0135. ---
	classroom_public_reference:
		'THE PUBLIC REFERENCE-DOCUMENT VIEWER at /reference/<itemId>, which resolves for a MATERIAL ' +
		'a teacher flagged public. 0092 granted it to `anon`; 0109 re-granted it after the ' +
		'scheduled-posting change. The route lives OUTSIDE /classroom deliberately -- that prefix is ' +
		'in authedPrefixes and would bounce a signed-out visitor before the load ran.',
	classroom_public_attachment:
		'ITS ATTACHMENTS, same surface and same decision (0092, re-granted by 0109 and again by 0135 ' +
		'when it started projecting storage_key beside drive_file_id). 0135 made a public ' +
		'material serve its storage-backed attachment with NO SESSION, which is exactly what this ' +
		'grant is for; the bytes still come back as a download, never inline.',
	classroom_attachment_object_is_public:
		'NAMED INSIDE A storage.objects RLS POLICY THAT ADMITS `anon` (0135). A policy expression is ' +
		'evaluated as the QUERYING role, not from inside a definer function, so revoking this does ' +
		'not narrow anything -- it breaks the read outright. That is the 0070 lesson 0109 wrote ' +
		'down, where revoking current_user_email() stopped a student reading their own balance.',
	_classroom_item_live:
		'THE SAME SHAPE ONE POLICY OVER: called from inside the "classroom postings readable" policy ' +
		'(0109:144, which grants it to `authenticated, anon` and says why in its own comment). ' +
		'Underscore-prefixed and reachable, which looks wrong and is not: a private helper named in ' +
		'an RLS `using` clause has to be executable by whichever role is doing the querying.',

	// --- Short links (1). 0093. ---
	app_short_link_target:
		'SHORT LINKS RESOLVE BEFORE ANY SESSION EXISTS. /<slug> is in the public tier and QR codes ' +
		'and printed handouts are in circulation, so an authored slug is a permanent contract ' +
		'(CLAUDE.md). 0093:85 grants it to `anon, authenticated` in its own text. This is also the ' +
		'positive control 0202\'s self-check reads, for the same reason the sweep below has one.',

	// --- The unauthenticated GAUNTLET run path (5). 0006-0184. ---
	gauntlet_macro_start: GAUNTLET_MACRO_REASON,
	gauntlet_macro_submit: GAUNTLET_MACRO_REASON,
	gauntlet_run_targets: GAUNTLET_MACRO_REASON,
	gauntlet_run_events_insert: GAUNTLET_MACRO_REASON,
	gauntlet_run_analysis_upsert: GAUNTLET_MACRO_REASON,

	// --- The public IDEA Maps viewer (5). 0162, 0165. ---
	maps_search: MAPS_SEARCH_REASON,
	_maps_node_vocab: MAPS_SEARCH_REASON,
	_maps_item_type_vocab: MAPS_SEARCH_REASON,
	_maps_item_vocab: MAPS_SEARCH_REASON,
	_maps_chain_link: MAPS_SEARCH_REASON
};

/**
 * Twenty-three. EIGHTEEN of them are 0137's own partition, name for name -- that
 * file listed them in its header and this list was checked against it rather
 * than re-derived. The other FIVE are the IDEA Maps viewer, which shipped after
 * 0137 and granted itself correctly.
 *
 * Pinned so an entry cannot be added silently: moving this number is fine, and
 * moving it without reading the reason beside the new entry is what the pin
 * refuses.
 */
const ANON_EXECUTE_SURFACE_SIZE = 23;

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

interface FnRow {
	readonly name: string;
	readonly sig: string;
	readonly anon: boolean;
	readonly authed: boolean;
}

/**
 * Every function in `public` the MIGRATION CHAIN created, with what each client
 * role may execute.
 *
 * EXTENSION-OWNED FUNCTIONS ARE EXCLUDED, and that is a scope line rather than
 * a convenience. pg_trgm installs its operator support functions into `public`
 * and grants them to PUBLIC itself, so THIRTY-ONE of them read anon-executable
 * on any database carrying the extension (measured on the full chain, not
 * estimated). They are not the chain's to revoke: they
 * carry no session, read no row, and revoking one breaks the index that names
 * it. `pg_depend` with deptype 'e' is the catalog's own answer to "did an
 * extension create this", which is why it is asked rather than inferred from a
 * name prefix -- a prefix list would have to be maintained, and the failure
 * mode of a stale one is a function silently waved through.
 */
async function publicFunctions(db: TestDb): Promise<FnRow[]> {
	const { rows } = await db.sql<FnRow>(`
		select p.proname as name,
		       p.oid::regprocedure::text as sig,
		       has_function_privilege('anon', p.oid, 'execute') as anon,
		       has_function_privilege('authenticated', p.oid, 'execute') as authed
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		  and p.prokind = 'f'
		  -- Functions an EXTENSION owns are out of scope. See publicFunctions'
		  -- own doc comment for why, and why the question is asked of pg_depend
		  -- rather than guessed from a name prefix.
		  and not exists (
		    select 1 from pg_depend d
		    where d.classid = 'pg_proc'::regclass
		      and d.objid = p.oid
		      and d.deptype = 'e'
		  )
		order by 1, 2
	`);
	return rows;
}

/**
 * The acl of the fourteen objects 0202 touches, as one sorted, comparable
 * string. Read from `proacl`/`relacl` directly rather than from
 * has_*_privilege, because the idempotence question is whether the ACL ENTRIES
 * are identical, not merely whether the same answers fall out of them.
 */
async function ideacadAcl(db: TestDb): Promise<string> {
	const { rows } = await db.sql<{ line: string }>(`
		select p.oid::regprocedure::text || ' => ' ||
		       coalesce(array_to_string(p.proacl::text[], '|'), '(null)') as line
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname ~ '^_?ideacad'
		union all
		select 'table ' || c.relname || ' => ' ||
		       coalesce(array_to_string(c.relacl::text[], '|'), '(null)') as line
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname ~ '^ideacad_'
		order by 1
	`);
	return rows.map((r) => r.line).join('\n');
}

const TABLE_PRIVILEGES = [
	'SELECT',
	'INSERT',
	'UPDATE',
	'DELETE',
	'TRUNCATE',
	'REFERENCES',
	'TRIGGER'
] as const;

/** Which of the seven a role actually holds on a table. */
async function tablePrivileges(db: TestDb, role: string, table: string): Promise<string[]> {
	const { rows } = await db.sql<{ priv: string }>(
		`select p.priv
		 from unnest($1::text[]) as p(priv)
		 where has_table_privilege($2, ('public.' || $3)::regclass, p.priv)
		 order by 1`,
		[TABLE_PRIVILEGES as unknown as string[], role, table]
	);
	return rows.map((r) => r.priv);
}

/** Every table and view in `public` whose name starts from the ideacad prefix. */
async function ideacadTables(db: TestDb): Promise<string[]> {
	const { rows } = await db.sql<{ relname: string }>(`
		select c.relname
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public'
		  and c.relkind in ('r', 'p', 'v', 'm')
		  and c.relname ~ '^ideacad_'
		order by 1
	`);
	return rows.map((r) => r.relname);
}

/**
 * 0206 section 1's own classification, read back OUT OF THE `.sql` FILE.
 *
 * Section F compares it against this file's table. The two lists are written
 * independently on purpose -- one is what the database refuses at apply time
 * and the other is what the suite refuses on every run -- and a seam between
 * two independent statements of one rule is only worth having if something
 * compares them. Without this, the migration could classify a function one way
 * and the test the other and both would be green.
 *
 * It parses SIGNATURES and returns NAMES, because 0206 is signature-keyed (an
 * overload cannot be waved through on a bare name there) and this file is
 * name-keyed (its catalog sweep reports `proname`). The narrowing is safe only
 * while no ideacad function is overloaded, which section F asserts rather than
 * assumes.
 */
function parseGuardClassification(sql: string): ReadonlyMap<string, 'client' | 'definer'> {
	const out = new Map<string, 'client' | 'definer'>();
	const row = /\('public\.(_?ideacad[A-Za-z0-9_]*)\([^)]*\)',\s*'(client|definer)'/g;
	for (const m of sql.matchAll(row)) out.set(m[1], m[2] as 'client' | 'definer');
	return out;
}

let db: TestDb;
/** The same chain with 0202 left out. Section E's control. See the header. */
let dbWithout0202: TestDb;
let functions: FnRow[] = [];
let functionsWithout0202: FnRow[] = [];
/** The acl of 0202's fourteen objects after the chain's single apply. */
let aclAfterFirstApply = '';
/** ...and after applying 0206 a second time over the same database. */
let aclAfterSecondApply = '';
/** Every ideacad function 0206 section 1 classifies, read out of that file. */
let guardClassification: ReadonlyMap<string, 'client' | 'definer'> = new Map();

const notes: string[] = [];

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	functions = await publicFunctions(db);

	// E. The world as 0201 left it.
	//
	// 0206 COMES OUT OF THIS CHAIN TOO, AND NOT AS A CONVENIENCE. This control
	// deliberately reconstructs the world where 0201's ten ARE anon-executable,
	// which is precisely the state 0206 exists to refuse -- so leaving 0206 in
	// makes the chain fail to build at all and the control measures nothing
	// (measured: `0206: 10 ideacad function(s) are executable by anon`, all ten
	// named, 22 tests skipped). A guard over the repaired world cannot sit in a
	// chain that un-does the repair; taking it out is what keeps the control a
	// control. That the guard refuses here is itself the proof it bites, and
	// section G asserts it on purpose rather than leaving it as a build failure.
	dbWithout0202 = await startTestDb([
		FIXTURE_COMPLETION,
		...ALL_MIGRATIONS.filter((f) => f !== MIGRATION_0202 && f !== MIGRATION_0206)
	]);
	functionsWithout0202 = await publicFunctions(dbWithout0202);

	// C. The second apply, over the world the chain just built -- which is the
	// same shape as pasting the guard into a project that already carries the
	// repair. Its own checks raise on anything they refuse, so reaching the read
	// below at all is half the assertion.
	//
	// THIS IS 0206 AND NO LONGER 0202, AND THAT IS THE WHOLE OF WHAT 0205 BROKE.
	// 0202 section 4 asserts there are EXACTLY TEN ideacad functions and that
	// EVERY one holds `authenticated`; 0205 makes both false, so re-pasting 0202
	// over a database carrying it raises `expected 10 ideacad functions in
	// public, found 19` and then names the two definer-only helpers as having
	// "LOST the authenticated grant". Neither is a defect -- both are 0202
	// describing a world that ended. 0202's file is an applied record and is not
	// rewritten; 0206 replaces its CHECK, and the idempotence property moves with
	// the check rather than being dropped.
	aclAfterFirstApply = await ideacadAcl(db);
	const secondApply = readFileSync(join(fileURLToPath(MIGRATION_DIR), MIGRATION_0206), 'utf8');
	await db.sql(secondApply);
	aclAfterSecondApply = await ideacadAcl(db);

	// F. 0206's own classification, parsed out of its section 1 VALUES list.
	guardClassification = parseGuardClassification(
		readFileSync(join(fileURLToPath(MIGRATION_DIR), MIGRATION_0206), 'utf8')
	);

	notes.push(`chain applied: ${ALL_MIGRATIONS.length} migration files`);
	notes.push(`functions in public: ${functions.length}`);
	notes.push(`anon-executable: ${functions.filter((f) => f.anon).length}`);
	notes.push(
		`anon-executable ideacad functions -- with 0202: ` +
			`${functions.filter((f) => IDEACAD_FN_RE.test(f.name) && f.anon).length}, ` +
			`without it: ${functionsWithout0202.filter((f) => IDEACAD_FN_RE.test(f.name) && f.anon).length}`
	);
	notes.push(
		`ideacad functions in the catalog: ${functions.filter((f) => IDEACAD_FN_RE.test(f.name)).length} ` +
			`(${ideacadNames((f) => f.kind === 'client').length} client-callable, ` +
			`${ideacadNames((f) => f.kind === 'definer').length} definer-only, by this file's table)`
	);
	notes.push(
		`chain state: 0201 ${chainHas('0201') ? 'yes' : 'NO'}, 0205 ${chainHas('0205') ? 'yes' : 'no'}, ` +
			`0206 ${chainHas('0206') ? 'yes' : 'NO'} -- ` +
			`${Object.keys(EXPECTED_FUNCTIONS).length} of ${Object.keys(IDEACAD_FUNCTIONS).length} ` +
			`classified functions expected on this tree`
	);
}, 600_000);

afterAll(async () => {
	if (notes.length) console.log(['', 'ANON EXECUTE SWEEP', ...notes].join('\n'));
	await db?.stop();
	await dbWithout0202?.stop();
});

describe('the sweep saw the database', () => {
	it('found the whole schema, not an empty catalog', () => {
		// The vacuity guard. Every `toEqual([])` below passes on a database with
		// no functions in it at all, which is also what a catalog query that
		// stopped matching returns.
		expect(functions.length, 'functions in public').toBeGreaterThan(300);
		expect(
			functions.filter((f) => f.anon).length,
			'anon-executable functions: zero here would mean the sweep cannot see a grant at all'
		).toBeGreaterThan(0);
	});
});

describe('A. every function in public, against the declared anon surface', () => {
	it('is executable by anon only where a migration said so, with a reason', () => {
		const undeclared = functions
			.filter((f) => f.anon && !(f.name in ANON_EXECUTE_SURFACE))
			.map((f) => f.sig)
			.sort();
		expect(
			undeclared,
			'`anon` is the public internet, and a SECURITY DEFINER function it can reach is a gate ' +
				'weakened from "refused at the grant" to "refused in the body". Each of these is almost ' +
				'certainly inherited from the hosted default privileges rather than granted by anyone -- ' +
				'the 0201 defect. Revoke it in a migration, following 0166 (revoke from `public, anon, ' +
				'authenticated` BY NAME), or add its name to ANON_EXECUTE_SURFACE with the reason ' +
				'somebody decided it.'
		).toEqual([]);
	});

	it('still holds every grant this list claims', () => {
		const anonNames = new Set(functions.filter((f) => f.anon).map((f) => f.name));
		const stale = Object.keys(ANON_EXECUTE_SURFACE)
			.filter((name) => !anonNames.has(name))
			.sort();
		expect(
			stale,
			'ANON_EXECUTE_SURFACE claims these are deliberately public and the catalog disagrees. ' +
				'Either a migration revoked one (delete the entry and say so) or the public surface is ' +
				'broken (a signed-out visitor can no longer reach it).'
		).toEqual([]);
	});

	it('declares exactly the number of names it did when this was last read', () => {
		expect(
			Object.keys(ANON_EXECUTE_SURFACE).length,
			'The length is pinned so an entry cannot be added silently. Moving it is fine; moving it ' +
				'without reading the reason beside the new entry is what this refuses.'
		).toBe(ANON_EXECUTE_SURFACE_SIZE);
	});
});

describe('B. the ideacad grant surface, classified rather than counted', () => {
	it('classifies every ideacad function the catalog holds, and holds every one it classifies', () => {
		const found = functions.filter((f) => IDEACAD_FN_RE.test(f.name)).map((f) => f.name);

		// THIS REPLACES "has all ten functions and no more", WHICH IS THE
		// ASSERTION 0205 BROKE. What is pinned now is that every ideacad
		// function has been CLASSIFIED -- adding one means adding a row to
		// IDEACAD_FUNCTIONS with the reason it is client-callable or
		// definer-only, which is a decision somebody makes, where bumping a
		// count is a number somebody changes until the test goes green.
		const unclassified = found.filter((n) => !(n in EXPECTED_FUNCTIONS)).sort();
		expect(
			unclassified,
			'a new ideacad function must be classified: `client` if PostgREST calls it as an RPC or an ' +
				'RLS policy names it, `definer` if only another SECURITY DEFINER body reaches it. 0206 ' +
				'section 1 wants the same row, by signature.'
		).toEqual([]);

		const absent = Object.keys(EXPECTED_FUNCTIONS)
			.filter((n) => !found.includes(n))
			.sort();
		expect(
			absent,
			'IDEACAD_FUNCTIONS names these and the catalog does not have them. Either a migration dropped ' +
				'one (delete the row and say so) or the chain did not apply.'
		).toEqual([]);

		// The vacuity guard for this whole section: a filter that stopped
		// matching returns [] and every assertion above passes on it.
		expect(found.length, 'ideacad functions found by the prefix sweep').toBeGreaterThan(0);
	});

	it('leaves NO ideacad function executable by anon -- swept whole, with no count and no exemption', () => {
		// THE PROPERTY THAT MATTERED, and the only one asserted universally. It
		// is swept by PREFIX deliberately: a function added by a migration
		// written after this one is covered the day it lands, and a migration
		// that forgets 0166's revoke shape reddens here. 0206 asserts the same
		// thing at apply time, in the same shape, for the same reason.
		const open = functions.filter((f) => IDEACAD_FN_RE.test(f.name) && f.anon).map((f) => f.sig);
		expect(open, 'this is the exact defect 0201 shipped and 0202 repairs').toEqual([]);
	});

	it('keeps every CLIENT-CALLABLE one executable by authenticated', () => {
		const client = new Set(ideacadNames((f) => f.kind === 'client'));
		const lost = functions
			.filter((f) => client.has(f.name) && !f.authed)
			.map((f) => f.sig)
			.sort();
		expect(
			lost,
			'the narrowing went too far and the feature is down. An RPC PostgREST calls and a predicate an ' +
				'RLS policy names both need this grant, for the same reason: a policy expression is ' +
				'evaluated as the querying role.'
		).toEqual([]);
		expect(client.size, 'client-callable functions: zero would make the check vacuous').toBeGreaterThan(0);
	});

	it('withholds authenticated from the DEFINER-ONLY helpers, which is what 0202 could not say', () => {
		// The positive control for the classification itself. Without this the
		// `definer` kind would be a pure exemption -- a way to make a failing
		// assertion go away -- rather than a claim about the schema that is
		// itself measured. It is also the exact pair 0202's third assertion
		// names when it refuses a re-paste.
		const definer = ideacadNames((f) => f.kind === 'definer');

		// THE VACUITY PREMISE IS CHAIN-CONDITIONAL, and saying so is the honest
		// form of it. Every definer-only helper in the schema comes from 0205, so
		// on a tree without it this arm sweeps an empty set and proves nothing --
		// which is a fact about the tree, not a pass. Asserting `> 0`
		// unconditionally reddens a legitimate chain (measured: exactly this
		// assertion, on a tree carrying 0206 and not 0205); asserting nothing
		// lets the arm go quiet the day 0205 lands. So the premise is tied to the
		// migration that creates the population it is about.
		if (chainHas('0205')) {
			expect(
				definer.length,
				'0205 is in this chain, so it created definer-only helpers and this arm must have some to ' +
					'look at'
			).toBeGreaterThan(0);
		} else {
			expect(definer, 'nothing in this chain creates a definer-only ideacad helper').toEqual([]);
		}

		const wide = functions
			.filter((f) => definer.includes(f.name) && f.authed)
			.map((f) => f.sig)
			.sort();
		expect(
			wide,
			'a helper nothing but a definer body calls does not need a client grant, and 0205 withholds ' +
				'it on purpose. If a later migration named one in a policy, move it to `client` here and ' +
				'in 0206 section 1 and say why.'
		).toEqual([]);
	});

	it('leaves anon holding nothing at all on EVERY ideacad table', async () => {
		// Swept from the catalog rather than from a fixed list, so 0205's
		// `ideacad_grants` is covered without anyone remembering to add it, and
		// so is whatever a later migration creates.
		const tables = await ideacadTables(db);
		expect(tables.length, 'ideacad tables found').toBeGreaterThan(0);
		for (const table of tables) {
			expect(await tablePrivileges(db, 'anon', table), `anon on ${table}`).toEqual([]);
		}
	});

	it('leaves authenticated holding nothing BEYOND select on every ideacad table', async () => {
		// SELECT-or-nothing, universal: this repo grants a client role no write
		// privilege on a feature table at all, and TRUNCATE is the one of the
		// other six that RLS does not cover.
		const tables = await ideacadTables(db);
		for (const table of tables) {
			const held = await tablePrivileges(db, 'authenticated', table);
			expect(held.filter((priv) => priv !== 'SELECT'), `authenticated on ${table}`).toEqual([]);
		}
	});

	it('keeps the select grant the feature depends on, on each table named for it', async () => {
		// The other direction, and NAMED rather than swept: a future ideacad
		// table with RLS and no client grant at all is a legitimate shape
		// (`student_app_plays` is exactly that), so requiring SELECT everywhere
		// would refuse it. SELECT is 0201's and 0205's own decision, and the RLS
		// policies are what make that grant mean "your own rows".
		for (const table of IDEACAD_SELECT_TABLES) {
			expect(await tablePrivileges(db, 'authenticated', table), `authenticated on ${table}`).toEqual(
				['SELECT']
			);
		}
	});
});

describe('C. 0206 applied twice over the same database', () => {
	it('changes not one acl entry the second time, and does not refuse the second apply', () => {
		// Reaching this assertion at all is half of it: 0206's own guard raises
		// on anything it refuses, and the apply in `beforeAll` would have thrown.
		expect(aclAfterSecondApply).toBe(aclAfterFirstApply);
		expect(aclAfterFirstApply, 'the comparison read an empty catalog').not.toBe('');
	});

	it('compares an acl that actually covers 0205 as well as 0201', () => {
		// The vacuity guard for the comparison above: `ideacadAcl` sweeps by
		// prefix, so a regex that stopped matching would compare two identical
		// empty strings and pass. Nineteen functions and five tables is the
		// population, so the acl text has to name more than 0201's ten.
		const lines = aclAfterFirstApply.split('\n');
		expect(lines.length, 'acl lines read').toBeGreaterThan(Object.keys(EXPECTED_FUNCTIONS).length);
		expect(aclAfterFirstApply).toContain('table ideacad_predictions');
		if (chainHas('0205')) expect(aclAfterFirstApply).toContain('table ideacad_grants');
	});
});

describe('F. the migration guard and this file classify the same way', () => {
	// The seam. 0206 section 1 and IDEACAD_FUNCTIONS above are two independent
	// statements of one rule -- deliberately, because a test whose expected
	// value is derived from the thing it tests cannot fail -- and two
	// independent statements are only worth having if something compares them.
	it('names the same functions on both sides', () => {
		// The FULL tables, not the chain-filtered cut: both are static lists
		// somebody wrote, and they should agree whatever this run's chain holds.
		expect(
			[...guardClassification.keys()].sort(),
			'0206 section 1 and IDEACAD_FUNCTIONS disagree about which functions exist'
		).toEqual(Object.keys(IDEACAD_FUNCTIONS).sort());
	});

	it('puts each of them on the same side of the client/definer line', () => {
		const disagree = Object.entries(IDEACAD_FUNCTIONS)
			.filter(([name, f]) => guardClassification.get(name) !== f.kind)
			.map(([name, f]) => `${name}: here ${f.kind}, 0206 ${guardClassification.get(name)}`)
			.sort();
		expect(disagree).toEqual([]);
	});

	it('reports which chain state this run measured, so the numbers above are attributable', () => {
		// Not an assertion about the tree, a statement OF it. A reader of the
		// notes below has to know whether 0205's nine were in the population.
		expect(chainHas('0201'), '0201 must always be in the chain').toBe(true);
		expect(chainHas('0206'), '0206 must always be in the chain').toBe(true);
	});

	it('read a real list out of the migration rather than an empty one', () => {
		// The parser is a regex over a `.sql` file. A regex that stopped
		// matching returns an empty map, and an empty map compared against an
		// empty derived set would pass both assertions above.
		expect(guardClassification.size, 'rows parsed out of 0206 section 1').toBeGreaterThan(0);
		expect([...guardClassification.values()]).toContain('definer');
		expect([...guardClassification.values()]).toContain('client');
	});

	it('is safe to compare by NAME, because no ideacad function is overloaded', () => {
		// 0206 is keyed on SIGNATURE and this file on NAME. That narrowing is
		// only sound while the two are one-to-one, so it is measured rather
		// than assumed.
		const names = functions.filter((f) => IDEACAD_FN_RE.test(f.name)).map((f) => f.name);
		expect(names.length, 'ideacad functions').toBe(new Set(names).size);
	});
});

describe('D. the sweep reddens when a grant is actually there', () => {
	it('names a function anon was handed EXECUTE on, and goes quiet again when it is taken back', async () => {
		// A private helper with no public surface of its own, so the mutation is
		// unambiguous: nothing about it belongs on the declared list.
		const victim = 'public.current_user_email()';

		const before = await publicFunctions(db);
		expect(
			before.filter((f) => f.anon && !(f.name in ANON_EXECUTE_SURFACE)).map((f) => f.sig),
			'control: clean before the mutation'
		).toEqual([]);

		await db.sql(`grant execute on function ${victim} to anon`);
		try {
			const during = await publicFunctions(db);
			const undeclared = during
				.filter((f) => f.anon && !(f.name in ANON_EXECUTE_SURFACE))
				.map((f) => f.sig);
			expect(undeclared, 'the mutation must be seen').toContain('current_user_email()');
		} finally {
			await db.sql(`revoke execute on function ${victim} from anon`);
		}

		const after = await publicFunctions(db);
		expect(
			after.filter((f) => f.anon && !(f.name in ANON_EXECUTE_SURFACE)).map((f) => f.sig),
			'restored: the revoke put the catalog back'
		).toEqual([]);
	});
});

describe('G. 0206 bites, and not always in the same direction', () => {
	// A GUARD THAT ONLY EVER RETURNS ONE VALUE HAS NOT BEEN TESTED. 0206 passes
	// on the chain -- that is one reading, and on its own it is equally
	// consistent with a guard that can never refuse anything. So each arm is
	// driven to a refusal and back.
	//
	// The mutation is a CATALOG edit and the restore is its exact inverse.
	// Nothing under `supabase/migrations/` is written and no `git` command is
	// run: a `git checkout --` inside a mutation script is a discard-to-HEAD and
	// has taken three sessions' uncommitted work in one week (CLAUDE.md).

	/** Apply 0206 over the current catalog. Returns its refusal, or null. */
	async function applyGuard(): Promise<string | null> {
		const sql = readFileSync(join(fileURLToPath(MIGRATION_DIR), MIGRATION_0206), 'utf8');
		try {
			await db.sql(sql);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	}

	it('is quiet on the unmutated chain, which is the control every arm below needs', async () => {
		expect(await applyGuard(), '0206 refused an unmutated chain').toBeNull();
	});

	it('names exactly the client-callable function anon was handed EXECUTE on', async () => {
		// THE ORIGINAL DEFECT, planted on one function. This is the property
		// 0202 was written for and the one 0206 keeps.
		const victim = 'public.ideacad_roster(uuid)';
		await db.sql(`grant execute on function ${victim} to anon`);
		let refusal: string | null = null;
		try {
			refusal = await applyGuard();
		} finally {
			await db.sql(`revoke execute on function ${victim} from anon`);
		}

		expect(refusal, 'the guard let an anon-executable ideacad function through').not.toBeNull();
		expect(refusal).toContain('1 ideacad function(s) are executable by anon');
		expect(refusal).toContain('ideacad_roster(uuid)');
		// EXACTLY that one, not "at least" it. A guard that names the whole
		// subsystem whenever anything is wrong is not naming the defect.
		for (const other of ideacadNames(() => true)) {
			if (other === 'ideacad_roster') continue;
			expect(refusal, `${other} must not be named`).not.toContain(`${other}(`);
		}
		expect(await applyGuard(), 'the revoke put the catalog back').toBeNull();
	});

	it('sweeps the DEFINER-ONLY half for anon too, with no exemption', async () => {
		// The `definer` kind exempts a function from the AUTHENTICATED
		// requirement and from nothing else. Without this, "definer-only" would
		// be a way to put a function beyond the reach of the one property that
		// mattered.
		if (!chainHas('0205')) {
			expect(ideacadNames((f) => f.kind === 'definer'), 'no definer-only helper on this chain').toEqual(
				[]
			);
			return;
		}
		const victim = 'public._ideacad_document_role(uuid)';
		await db.sql(`grant execute on function ${victim} to anon`);
		let refusal: string | null = null;
		try {
			refusal = await applyGuard();
		} finally {
			await db.sql(`revoke execute on function ${victim} from anon`);
		}
		expect(refusal, 'a definer-only helper is not exempt from the anon sweep').not.toBeNull();
		expect(refusal).toContain('_ideacad_document_role(uuid)');
		expect(refusal).toContain('executable by anon');
		expect(await applyGuard(), 'restored').toBeNull();
	});

	it('admits a definer-only helper holding NO authenticated grant, without complaint', async () => {
		// THE ASSERTION 0202 CANNOT MAKE, and the reason this file exists. The
		// premise is measured first, so the pass cannot come from there being
		// nothing to admit.
		if (!chainHas('0205')) {
			expect(ideacadNames((f) => f.kind === 'definer'), 'no definer-only helper on this chain').toEqual(
				[]
			);
			return;
		}
		const definer = ideacadNames((f) => f.kind === 'definer');
		const holding = functions.filter((f) => definer.includes(f.name) && f.authed).map((f) => f.sig);
		expect(holding, 'premise: these hold no authenticated grant').toEqual([]);
		expect(definer.length, 'premise: there are some to admit').toBeGreaterThan(0);

		expect(await applyGuard(), '0206 refused a legitimately definer-only helper').toBeNull();
	});

	it('still refuses a CLIENT-CALLABLE function that lost its authenticated grant', async () => {
		// The third direction: the narrowing going too far. 0202 asserted this
		// over every ideacad function, which is what made it unable to tell a
		// deliberate definer-only helper from a feature that is down. 0206
		// asserts it over the classified client half, so both readings survive.
		const client = ideacadNames((f) => f.kind === 'client');
		const victimName = client.includes('ideacad_share_document')
			? 'ideacad_share_document'
			: 'ideacad_open_document';
		const victim = functions.find((f) => f.name === victimName);
		expect(victim, `premise: ${victimName} is in the catalog`).toBeDefined();
		const sig = `public.${victim!.sig}`;

		await db.sql(`revoke execute on function ${sig} from authenticated`);
		let refusal: string | null = null;
		try {
			refusal = await applyGuard();
		} finally {
			await db.sql(`grant execute on function ${sig} to authenticated`);
		}

		expect(refusal, 'the guard let a client-callable function lose its grant').not.toBeNull();
		expect(refusal).toContain('LOST the authenticated grant');
		expect(refusal).toContain(victim!.sig);
		expect(await applyGuard(), 'the regrant put the catalog back').toBeNull();
	});

	it('refuses a client table privilege beyond authenticated SELECT', async () => {
		// The fourth reading, and the one that keeps 0202's section 3 property
		// alive: TRUNCATE is not subject to row-level security at all, so an
		// inherited grant of it is not something RLS covers.
		await db.sql('grant truncate on table public.ideacad_documents to authenticated');
		let refusal: string | null = null;
		try {
			refusal = await applyGuard();
		} finally {
			await db.sql('revoke truncate on table public.ideacad_documents from authenticated');
		}
		expect(refusal, 'the table half of the guard is not biting').not.toBeNull();
		expect(refusal).toContain('beyond authenticated SELECT');
		expect(refusal).toContain('TRUNCATE on ideacad_documents');
		expect(await applyGuard(), 'restored').toBeNull();
	});

	it('leaves the acl exactly as it found it, after all of that', async () => {
		// Every arm above restored in a `finally`, but a restore that quietly
		// did not land would leave the rest of this run measuring a mutated
		// database. Compared against the acl read before section C's second
		// apply, which is the last point nothing had been mutated.
		expect(await ideacadAcl(db)).toBe(aclAfterFirstApply);
	});
});

describe('E. the same chain WITHOUT 0202 -- the world 0201 left', () => {
	it('has every one of 0201\'s ten executable by anon', () => {
		const open = new Set(
			functionsWithout0202.filter((f) => IDEACAD_FN_RE.test(f.name) && f.anon).map((f) => f.name)
		);

		// WIDENED RATHER THAN RE-PINNED, and the difference matters. This used to
		// be `toEqual([...the ten])`, an exact-set assertion that is really a
		// count in another shape: it says as much about what ELSE is open as
		// about 0201's ten, so a later ideacad migration lands here for a reason
		// that has nothing to do with 0202. What the control is FOR is that
		// 0201's ten are open without 0202 and shut with it, so that is what it
		// asserts -- a containment, not an equality.
		const closed = ideacadNames((f) => f.migration === '0201').filter((n) => !open.has(n));
		expect(
			closed,
			'the defect 0201 shipped, reproduced. If this ever comes back non-empty, 0202 is not what is ' +
				'closing the hole and every assertion in B is passing for a reason nobody has identified.'
		).toEqual([]);

		// The two halves of the measured difference, stated as numbers rather
		// than left implicit in two separate assertions.
		expect(ideacadNames((f) => f.migration === '0201').length, "0201's own functions").toBe(10);
		expect(
			functions.filter((f) => IDEACAD_FN_RE.test(f.name) && f.anon).length,
			'with 0202 in the chain'
		).toBe(0);
		expect(open.size, 'without it').toBeGreaterThanOrEqual(10);
	});

	it("has 0201's four tables holding all seven privileges for both client roles", async () => {
		// 0201's four and NOT every ideacad table: 0205 revokes its own
		// `ideacad_grants` in its own text, so that one is correctly narrow on
		// this chain too and is no part of the defect 0202 repaired.
		for (const table of IDEACAD_0201_TABLES) {
			for (const role of ['anon', 'authenticated']) {
				expect(
					await tablePrivileges(dbWithout0202, role, table),
					`${role} on ${table} before 0202`
				).toEqual([...TABLE_PRIVILEGES].sort());
			}
		}
	});

	it('is otherwise the same database, so the control is not measuring a different chain', () => {
		// Same function population either side. If these differ, the two chains
		// are not comparable and the contrast above says nothing.
		expect(functionsWithout0202.map((f) => f.sig).sort()).toEqual(functions.map((f) => f.sig).sort());
	});
});
