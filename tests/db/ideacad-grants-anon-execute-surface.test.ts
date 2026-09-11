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
//   B. 0202's OWN REPAIR, both halves: the ten `ideacad_*` functions
//      (anon false, authenticated true) and the four `ideacad_*` tables
//      (authenticated holds SELECT and nothing else, anon holds nothing).
//
//   C. IDEMPOTENCE. 0202 is applied a SECOND time over the database the chain
//      already left, and the full acl of all fourteen objects is compared
//      before and after. That is the "applying it over Mr. Pina's hand-applied
//      state changes nothing" property, measured rather than argued.
//
//   E. THE WITHOUT-0202 CONTROL, which is what stops A and B being a green tick
//      over a property something else in the chain happened to provide. A
//      SECOND database is booted with the identical chain MINUS 0202, and the
//      ten functions must be anon-executable there and the four tables must
//      hold all seven privileges for both client roles. That is 0201's defect,
//      reproduced, so "0202 closes it" is a measured difference rather than an
//      assertion about a file.
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

/** The file whose idempotence section C measures. */
const MIGRATION_0202 = '0202_ideacad_anon_grant_repair.sql';

/** 0201's ten. The list section 2 of 0202 revokes, by name. */
const IDEACAD_FUNCTIONS = [
	'ideacad_set_editor',
	'ideacad_open_document',
	'ideacad_new_concept',
	'ideacad_save_concept',
	'ideacad_update_concept_meta',
	'ideacad_delete_concept',
	'ideacad_set_active',
	'ideacad_set_prediction',
	'ideacad_commit_concept',
	'ideacad_roster'
] as const;

/** 0201's four. */
const IDEACAD_TABLES = [
	'ideacad_editors',
	'ideacad_documents',
	'ideacad_concepts',
	'ideacad_predictions'
] as const;

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

let db: TestDb;
/** The same chain with 0202 left out. Section E's control. See the header. */
let dbWithout0202: TestDb;
let functions: FnRow[] = [];
let functionsWithout0202: FnRow[] = [];
/** The acl of 0202's fourteen objects after the chain's single apply. */
let aclAfterFirstApply = '';
/** ...and after applying 0202 a second time over the same database. */
let aclAfterSecondApply = '';

const notes: string[] = [];

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	functions = await publicFunctions(db);

	// E. The world as 0201 left it.
	dbWithout0202 = await startTestDb([
		FIXTURE_COMPLETION,
		...ALL_MIGRATIONS.filter((f) => f !== MIGRATION_0202)
	]);
	functionsWithout0202 = await publicFunctions(dbWithout0202);

	// C. The second apply, over the world the chain just built -- which is the
	// same shape as pasting 0202 into a project that already carries the
	// hand-applied repair. Its own self-check raises on a partial apply, so
	// reaching the read below at all is half the assertion.
	aclAfterFirstApply = await ideacadAcl(db);
	const secondApply = readFileSync(join(fileURLToPath(MIGRATION_DIR), MIGRATION_0202), 'utf8');
	await db.sql(secondApply);
	aclAfterSecondApply = await ideacadAcl(db);

	notes.push(`chain applied: ${ALL_MIGRATIONS.length} migration files`);
	notes.push(`functions in public: ${functions.length}`);
	notes.push(`anon-executable: ${functions.filter((f) => f.anon).length}`);
	notes.push(
		`anon-executable ideacad functions -- with 0202: ` +
			`${functions.filter((f) => /^_?ideacad/.test(f.name) && f.anon).length}, ` +
			`without it: ${functionsWithout0202.filter((f) => /^_?ideacad/.test(f.name) && f.anon).length}`
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

describe('B. 0202: the ideacad grant surface', () => {
	it('has all ten functions and no more', () => {
		const found = functions.filter((f) => /^_?ideacad/.test(f.name)).map((f) => f.name);
		expect(found.sort()).toEqual([...IDEACAD_FUNCTIONS].sort());
	});

	it('leaves none of them executable by anon', () => {
		const open = functions.filter((f) => /^_?ideacad/.test(f.name) && f.anon).map((f) => f.sig);
		expect(open, 'this is the exact defect 0201 shipped and 0202 repairs').toEqual([]);
	});

	it('keeps all ten executable by authenticated', () => {
		const lost = functions.filter((f) => /^_?ideacad/.test(f.name) && !f.authed).map((f) => f.sig);
		expect(lost, 'the narrowing went too far and the feature is down').toEqual([]);
	});

	it('leaves anon holding nothing at all on the four tables', async () => {
		for (const table of IDEACAD_TABLES) {
			expect(await tablePrivileges(db, 'anon', table), `anon on ${table}`).toEqual([]);
		}
	});

	it('leaves authenticated holding exactly SELECT on the four tables', async () => {
		for (const table of IDEACAD_TABLES) {
			// SELECT is 0201's own decision: its four RLS policies are what make
			// that grant mean "your own rows". TRUNCATE is the one of the other
			// six that RLS does not cover at all.
			expect(await tablePrivileges(db, 'authenticated', table), `authenticated on ${table}`).toEqual(
				['SELECT']
			);
		}
	});
});

describe('C. 0202 applied twice over the same database', () => {
	it('changes not one acl entry the second time', () => {
		expect(aclAfterSecondApply).toBe(aclAfterFirstApply);
		expect(aclAfterFirstApply, 'the comparison read an empty catalog').not.toBe('');
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

describe('E. the same chain WITHOUT 0202 -- the world 0201 left', () => {
	it('has all ten functions executable by anon', () => {
		const open = functionsWithout0202
			.filter((f) => /^_?ideacad/.test(f.name) && f.anon)
			.map((f) => f.name)
			.sort();
		// If this ever comes back empty, 0202 is not what is closing the hole and
		// every assertion in B is passing for a reason nobody has identified.
		expect(open, 'the defect 0201 shipped, reproduced').toEqual([...IDEACAD_FUNCTIONS].sort());
	});

	it('has all four tables holding all seven privileges for both client roles', async () => {
		for (const table of IDEACAD_TABLES) {
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
