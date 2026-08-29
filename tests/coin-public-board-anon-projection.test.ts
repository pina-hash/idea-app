// tests/coin-public-board-anon-projection.test.ts
//
// WHAT A STRANGER ON THE INTERNET RECEIVES FROM THE LEDGER'S FIVE BOARDS.
//
// `docs/history/set-returning-function-projections-5i6s8n.md` drove the three
// anon-granted coin reads nearest a named student -- the leaderboard, the
// transaction feed and the per-student drawer -- and named these five as the
// same question one surface over:
//
//     coin_public_contracts        the contracts board
//     coin_public_reasons          the price guide
//     coin_public_roles            the role definitions and open-slot counts
//     coin_public_role_questions   a role's application questions
//     coin_public_sections         the section colour map
//
// All five are granted to `anon` DELIBERATELY and 0137 keeps all five among
// its eighteen, so WHO may call is settled and is not the question. The
// question is WHAT each row carries, field by field, to somebody with no
// account -- and it had never been asked from that seat. Every existing test
// of the five reaches them in RAW SQL inside `coin-public-ledger.test.ts`
// (`select * from public.coin_public_contracts()`), which is the shape
// node-postgres produces and not the shape a client receives.
//
// SO EVERYTHING BELOW IS DRIVEN AS `anon`, TWICE OVER, exactly as the sibling
// file drives its three:
//
//   1. through the shared PostgREST shim with a NULL caller, which is `set
//      role anon` with no claims -- the role a signed-out request actually
//      arrives as, and the role whose EXECUTE grants 0137 exists to partition;
//   2. through the REAL route handler, `src/routes/api/coin/public/+server.ts`,
//      with that same anon client in `locals.supabase`, because the bytes that
//      reach a stranger are the JSON that route emits and not the row set
//      underneath it.
//
// THE ROUTE IS A SECOND GATE ON THREE OF THE FIVE AND NOT ON THE OTHER TWO,
// WHICH IS THIS FILE'S OWN FINDING. `readCoinPublic` reshapes `contracts`,
// `roles` and `roleQuestions` field by hand, so an added RPC column does not
// reach a browser through them; `reasons` and `sections` are
// `JSON.stringify(data ?? [])` and pass the RPC's rows through WHOLE, so an
// added column reaches the wire verbatim. The sibling file measured that split
// BETWEEN two routes (a CSV mapped by hand against an object spread through);
// here it runs down the middle of one, and both halves are pinned.
//
// THE PINS ARE WHOLE SETS, NEVER SPOT CHECKS. A disclosure arrives as an ADDED
// field, so an assertion that names the fields it dislikes cannot catch one:
// it passes forever while the payload grows around it. Each projection is
// pinned twice from ONE constant -- as the complete key set of a real returned
// row, and as the function's DECLARED result columns read off the catalog. The
// second is what still reddens when the fixture happens to return nothing.
//
// AND EVERY DENIAL HAS A POSITIVE CONTROL AHEAD OF IT. An empty array carries
// no address either; a fixture that seeded nothing would satisfy every
// no-email assertion in this file. The controls run first.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { GET } from '../src/routes/api/coin/public/+server';

/**
 * The same chain the sibling anon-projection file carries, deliberately: these
 * five and those three are one page's worth of reads, and two chains for one
 * surface is two ideas of what the Ledger runs on. All five functions were
 * last written by 0089 and nothing after it redefines one, but their
 * DEPENDENCIES moved (0096's medium, 0103, 0107), so the modern chain is what
 * a visitor actually calls today. 0137 goes last because it is a sweep over
 * whatever the chain above it created.
 *
 * `0100_coin_legacy_reimport.sql` is deliberately absent: it is a one-time
 * import of real archived data, and every row asserted about below is written
 * through a live write RPC or a hand insert into a hand-maintained table.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	'0072_coin_my_eating_pass_status.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0077_coin_contracts.sql',
	'0079_coin_bulk_payout.sql',
	'0080_coin_category_admin.sql',
	'0081_coin_debt_payment.sql',
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql',
	'0096_coin_medium.sql',
	'0103_coin_public_medium_display.sql',
	'0107_coin_public_adjustment_bucket.sql',
	'0137_anon_execute_sweep.sql',
	// 0157 REPLACES THE UNNAMED-STUDENT FALLBACK THIS FILE ORIGINALLY PINNED.
	// It is on the chain rather than left off because this file is the repo's
	// statement of what a stranger receives, and a suite pinning a projection
	// the deployed schema no longer produces is worse than no pin. The two
	// assertions whose SUBJECT was the local part are rewritten below and say
	// so; the other forty are untouched and pass unchanged, which is the real
	// check that 0157 moved only what it meant to.
	'0157_coin_public_surface_hardening.sql'
] as const;

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const SECTION = 'eng1h-sophomore';
const SECTION_LABEL = 'Engineering I Honors, Sophomore';
const SECTION_COLOR = '#00FF41';

/**
 * THE PROJECTIONS, WRITTEN DOWN ONCE. Each list is asserted twice below -- as
 * the DECLARED result columns in `pg_proc` and as the key set of a real row a
 * signed-out caller received -- so a column added to a function reddens both
 * and neither can drift from the other.
 */
const PROJECTIONS = {
	coin_public_contracts: [
		'id',
		'title',
		'description',
		'payout_amount',
		'max_contractors',
		'claimed_count',
		'status',
		'section',
		'contractors',
		'created_at',
		'completed_at',
		'cancelled_at',
		'cancel_reason'
	],
	coin_public_reasons: ['type', 'reason', 'detail', 'sort_order'],
	coin_public_roles: [
		'section_id',
		'section',
		'role_id',
		'role',
		'description',
		'capacity',
		'held',
		'open'
	],
	coin_public_role_questions: ['question_id', 'sequence', 'type', 'question_text', 'options'],
	coin_public_sections: ['section', 'color']
} as const;

type PublicFn = keyof typeof PROJECTIONS;
const PUBLIC_FNS = Object.keys(PROJECTIONS) as PublicFn[];

let db: TestDb;
let owner: SeededUser; // the pinned admin, who does every write
let ada: SeededUser; // named everywhere: profile full_name, on the roster
let noName: SeededUser; // on the roster, named NOWHERE -- the roster's own last rung
let offRoster: SeededUser; // on no roster at all -- the FUNCTION's own last rung
let contractSectioned: string;
let contractDone: string;
let contractCancelled: string;
let contractOffRoster: string;

/** An anon PostgREST client. `null` is the caller, not a missing one. */
let anon: ReturnType<typeof createPostgrestShim>;
/** The admin's client, used only as the positive half of the anon controls. */
let adminClient: ReturnType<typeof createPostgrestShim>;

/** Hands back `data`, or throws whatever the shim reported. */
async function ok<T>(
	call: Promise<{ data: unknown; error: { message: string } | null }>
): Promise<T> {
	const res = await call;
	if (res.error) throw new Error(res.error.message);
	return res.data as T;
}

/** Every row of one public read, as a signed-out visitor receives it. */
function readPublic<T = Record<string, unknown>>(
	fn: PublicFn,
	args?: Record<string, unknown>
): Promise<T[]> {
	return ok<T[]>(anon.rpc(fn, args));
}

/** Drives the REAL public route as a signed-out visitor. */
async function route(
	action: string,
	extra: Record<string, string> = {}
): Promise<{ status: number; contentType: string; body: string }> {
	const url = new URL(`https://ideabosco.com/api/coin/public?action=${action}`);
	for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
	const res = (await GET({
		url,
		locals: { supabase: anon },
		setHeaders: () => {}
		// The handler reads exactly these three. Anything else it grew would be
		// a TypeError here rather than a silently different drive.
	} as unknown as Parameters<typeof GET>[0])) as Response;
	return {
		status: res.status,
		contentType: res.headers.get('content-type') ?? '',
		body: await res.text()
	};
}

/** The route's answer, parsed. Every one of the five actions answers JSON. */
async function routeJson<T = unknown>(action: string, extra: Record<string, string> = {}): Promise<T> {
	const res = await route(action, extra);
	expect(res.status).toBe(200);
	expect(res.contentType).toBe('application/json; charset=utf-8');
	return JSON.parse(res.body) as T;
}

/** The complete key set of an object, sorted, so a pin is order-independent. */
function keysOf(row: unknown): string[] {
	return Object.keys(row as Record<string, unknown>).sort();
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	ada = await createUser(db, 'ada.lovelace@boscotech.net', 'Ada Lovelace');
	// NAMED NOWHERE, on purpose. `_coin_public_roster`'s resolution chain is
	// coin_students.display_name -> profiles.display_name -> profiles.full_name
	// -> split_part(email, '@', 1), and the last rung is what this student
	// exercises. Without her every claimant in the fixture is named by an
	// earlier rung and the local-part assertions below pass without ever
	// reaching the branch they are about.
	noName = await createUser(db, 'quiet.claimant@boscotech.net', '');
	// On NO roster and with NO ledger row, so `_coin_public_roster` does not
	// carry her at all and the LEFT JOIN inside coin_public_contracts misses.
	// That is a SECOND copy of the local-part rule, written in the function's
	// own body, and it is reachable only through an UNSECTIONED contract --
	// coin_contract_self_claim refuses a section mismatch but lets anyone
	// signed in claim a contract with no section.
	offRoster = await createUser(db, 'no.roster@boscotech.net', '');

	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			SECTION,
			SECTION_LABEL,
			SECTION_COLOR,
			null,
			true
		]);
		await q(`select public.coin_admin_assign_section_students($1, $2::text[])`, [
			SECTION,
			[ada.email, noName.email]
		]);
	});

	// A SECOND section with no colour set, so `coin_public_sections`' own
	// `where s.color is not null` is a filter with something to filter and not
	// a clause nothing exercises.
	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			'eng2-junior',
			'Engineering II, Junior',
			null,
			null,
			true
		]);
	});

	// Four contracts, one per status word the board switches on, so `status`
	// is derived over a real spread rather than asserted from one row.
	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Rebuild the shop cart',
			'Needs two people.',
			20,
			2,
			SECTION
		]);
		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Sort the fastener wall',
			null,
			8,
			1,
			null
		]);
		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Inventory the filament',
			'Done last term.',
			15,
			1,
			null
		]);
		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Repaint the safety lines',
			null,
			30,
			1,
			null
		]);
		// The fifth exists for ONE reason: an unsectioned, still-open contract
		// is the only place a claimant can stand and NOT be on the roster.
		// Completing a contract PAYS its claimants (0077), and a payment is a
		// coin_transactions row, which is one of the two things
		// `_coin_public_roster` unions -- so the off-roster claimant had to be
		// moved off the completed contract onto this one. Measured, not
		// assumed: the first draft put her on the completed one and the roster
		// carried her.
		await q(`select public.coin_admin_post_contract($1, $2, $3, $4, $5)`, [
			'Deburr the plate stock',
			null,
			12,
			1,
			null
		]);
	});
	const byTitle = async (title: string) =>
		(
			await db.sql<{ id: string }>(`select id from public.coin_contracts where title = $1`, [title])
		).rows[0].id;
	contractSectioned = await byTitle('Rebuild the shop cart');
	contractDone = await byTitle('Inventory the filament');
	contractCancelled = await byTitle('Sort the fastener wall');
	contractOffRoster = await byTitle('Deburr the plate stock');

	// Two claimants on the sectioned contract: one named, one named nowhere.
	await db.asUser(ada.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractSectioned]);
	});
	await db.asUser(noName.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractSectioned]);
	});
	// Ada claims the one that gets completed, so completion has somebody to
	// pay (0077 refuses a completion with no claimants).
	await db.asUser(ada.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractDone]);
	});
	// And the off-roster student on the unsectioned, still-open one.
	await db.asUser(offRoster.id, async (q) => {
		await q(`select public.coin_contract_self_claim($1)`, [contractOffRoster]);
	});

	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_complete_contract($1)`, [contractDone]);
		await q(`select public.coin_admin_cancel_contract($1, $2)`, [
			contractCancelled,
			'Superseded by the wall rebuild.'
		]);
	});

	// Real quiz questions on ONE role, both kinds. `lab_tech` keeps zero,
	// deliberately, so the empty-set path is a real state rather than an
	// error (0076: the real quiz text is hand-maintained in the database and
	// never committed to this repo).
	await db.sql(
		`insert into public.coin_role_quiz_questions
		   (role_id, type, question_text, sequence, options, correct_option_index)
		 values ('safety_officer', 'mc', 'Where is the shop eyewash station?', 1,
		         '["By the door", "Behind the mill", "There isn''t one"]'::jsonb, 0)`
	);
	await db.sql(
		`insert into public.coin_role_quiz_questions (role_id, type, question_text, sequence)
		 values ('safety_officer', 'written', 'Describe a time you stopped unsafe work.', 2)`
	);
	// An INACTIVE question, so `where q.active` has something to exclude.
	await db.sql(
		`insert into public.coin_role_quiz_questions
		   (role_id, type, question_text, sequence, options, correct_option_index, active)
		 values ('safety_officer', 'mc', 'RETIRED: which lever is the estop?', 3,
		         '["Left", "Right"]'::jsonb, 1, false)`
	);

	const fks = await loadForeignKeys(db);
	anon = createPostgrestShim(db, fks, null);
	adminClient = createPostgrestShim(db, fks, owner.id);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
// The five really are reachable by a signed-out caller -- and the shim really
// is one.
// ===========================================================================

describe('a signed-out caller reaches these five and nothing beside them', () => {
	test('anon holds EXECUTE on all five, and not on the internals or the admin siblings', async () => {
		const { rows } = await db.sql<{ name: string; anon_x: boolean; auth_x: boolean }>(
			`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name,
			        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
			        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x
			   from pg_proc p
			   join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname = any($1::text[])
			  order by 1`,
			[
				[
					...PUBLIC_FNS,
					// The internal read that carries `student_email`, and the three
					// ADMIN/own-row siblings answering the same questions with more
					// in them. The partition is what makes this a finding rather
					// than a fixture in which anon can call anything.
					'_coin_public_roster',
					'coin_admin_list_contracts',
					'coin_admin_list_sections',
					'coin_role_admin_list_role_questions',
					'coin_my_contract_claims'
				]
			]
		);
		const anonHolds = rows.filter((r) => r.anon_x).map((r) => r.name);
		expect(anonHolds).toEqual([
			'coin_public_contracts()',
			'coin_public_reasons()',
			'coin_public_role_questions(p_role_id text)',
			'coin_public_roles()',
			'coin_public_sections()'
		]);
		// The other five are closed to anon, and four of them are still open to
		// a signed-in caller -- so this is a partition and not a blanket revoke.
		const closed = rows.filter((r) => !r.anon_x);
		expect(closed.map((r) => r.name)).toEqual([
			'_coin_public_roster()',
			'coin_admin_list_contracts()',
			'coin_admin_list_sections()',
			'coin_my_contract_claims()',
			'coin_role_admin_list_role_questions(p_role_id text)'
		]);
		expect(closed.filter((r) => r.auth_x).map((r) => r.name)).toEqual([
			'coin_admin_list_contracts()',
			'coin_admin_list_sections()',
			'coin_my_contract_claims()',
			'coin_role_admin_list_role_questions(p_role_id text)'
		]);
	});

	test('THE SHIM ITSELF IS ANON: the same client is refused what an admin is given', async () => {
		// Without this, every "a signed-out visitor receives X" claim in this
		// file is equally satisfied by a shim quietly running as the table
		// owner -- the exact vacuum 0137 was written to end.
		const refused = await anon.rpc('coin_role_admin_list_role_questions', {
			p_role_id: 'safety_officer'
		});
		expect(refused.error?.code).toBe('PGRST202');
		expect(refused.error?.message ?? '').toMatch(/permission denied/i);

		// The POSITIVE half, on the same shim with a different caller.
		const allowed = await adminClient.rpc('coin_role_admin_list_role_questions', {
			p_role_id: 'safety_officer'
		});
		expect(allowed.error).toBeNull();
		expect((allowed.data as unknown[]).length).toBeGreaterThan(0);
	});

	test('anon cannot read the tables behind them, so the RPC is the only way in', async () => {
		// A real column per table rather than `*`: the shim refuses to quote a
		// star, and naming a column is closer to what a load would send anyway.
		const tables: [string, string][] = [
			['coin_contracts', 'id'],
			['coin_contract_claims', 'student_email'],
			['coin_categories', 'id'],
			['coin_sections', 'id'],
			['coin_role_definitions', 'id'],
			['coin_role_quiz_questions', 'correct_option_index']
		];
		for (const [table, column] of tables) {
			const res = await anon.from(table).select(column);
			expect(res.error, `${table} answered a signed-out caller`).not.toBeNull();
			expect(res.error?.message ?? '').toMatch(/permission denied/i);
		}
		// POSITIVE CONTROL: the same shim, the same select, an ADMIN caller --
		// so the refusals above are the ROLE and not a shim that cannot read a
		// table at all.
		const allowed = await adminClient.from('coin_contracts').select('id');
		expect(allowed.error).toBeNull();
		expect((allowed.data as unknown[]).length).toBeGreaterThan(0);
	});
});

// ===========================================================================
// The SHAPE question: what a table widening can and cannot reach.
// ===========================================================================

describe('all five declare their own column list, so a table widening cannot reach them', () => {
	test('each returns an explicit TABLE(...), pinned column for column', async () => {
		// This is the distinction `app_short_link_list` raised and it decides
		// what the pins below are worth. A function declared `returns setof
		// <table>` inherits that table's rowtype, so a column added to the
		// table by ANY later migration reaches every caller with the function
		// unchanged. A function declared `returns table (...)` has a fixed
		// output list: only an edit to the function itself can widen it, which
		// is a narrower job for a pin to do and is worth saying out loud rather
		// than letting the two guards read as the same guard.
		for (const fn of PUBLIC_FNS) {
			const { rows } = await db.sql<{ result: string; retset: boolean }>(
				`select pg_get_function_result(p.oid) as result, p.proretset as retset
				   from pg_proc p
				   join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = $1`,
				[fn]
			);
			expect(rows, `${fn} is not in the catalog`).toHaveLength(1);
			expect(rows[0].retset, `${fn} is not set-returning`).toBe(true);
			const declared = rows[0].result;
			expect(declared, `${fn} does not declare its own column list`).toMatch(/^TABLE\(/);
			// The names in declaration order, which is also the order a client
			// receives them in.
			const names = declared
				.slice('TABLE('.length, -1)
				.split(/,\s*(?![^(]*\))/)
				.map((part) => part.trim().split(/\s+/)[0]);
			expect(names, `${fn}'s declared columns moved`).toEqual([...PROJECTIONS[fn]]);
		}
	});

	test('CONTRAST CONTROL: app_short_link_list really is the other shape', async () => {
		// The negative half of the claim above. If `returns setof <table>` had
		// quietly stopped existing in this schema, "these five are the other
		// kind" would be true of everything and mean nothing.
		//
		// 0093 is not on this chain -- it is a short-link migration with no coin
		// dependency, and adding it to buy one assertion would change what this
		// fixture is -- so the contrast is read from the migration TEXT. That is
		// the honest instrument for a fact about a function this database does
		// not have, and it is checked to be absent here rather than left
		// ambiguous.
		const { rows } = await db.sql(
			`select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'app_short_link_list'`
		);
		expect(rows).toHaveLength(0);

		const sql = readFileSync(
			join(REPO_ROOT, 'supabase', 'migrations', '0093_short_links.sql'),
			'utf8'
		);
		const decl = sql.slice(sql.indexOf('create or replace function public.app_short_link_list'));
		expect(decl.split('\n').slice(0, 2)).toEqual([
			'create or replace function public.app_short_link_list()',
			'returns setof public.app_short_links'
		]);
		expect(decl.slice(0, 400)).toMatch(/select\s+\*\s+from public\.app_short_links/);
	});

	test('and not one of the five is a `select *`', async () => {
		for (const fn of PUBLIC_FNS) {
			const { rows } = await db.sql<{ prosrc: string }>(
				`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = $1`,
				[fn]
			);
			expect(rows[0].prosrc, `${fn} selects a whole row`).not.toMatch(/select\s+\*/i);
		}
	});
});

// ===========================================================================
// coin_public_contracts -- the only one of the five carrying a per-student
// field, and the one the route reshapes by hand.
// ===========================================================================

describe('the contracts board, called by a signed-out visitor', () => {
	test('POSITIVE CONTROL: four contracts, one per status, with real claimants', async () => {
		const rows = await readPublic('coin_public_contracts');
		expect(rows).toHaveLength(5);
		const byTitle = new Map(rows.map((r) => [r.title as string, r]));
		expect(byTitle.get('Rebuild the shop cart')?.status).toBe('In Progress');
		expect(byTitle.get('Repaint the safety lines')?.status).toBe('Open');
		expect(byTitle.get('Inventory the filament')?.status).toBe('Completed');
		expect(byTitle.get('Sort the fastener wall')?.status).toBe('Cancelled');
		expect(byTitle.get('Deburr the plate stock')?.status).toBe('In Progress');
		expect(byTitle.get('Rebuild the shop cart')?.claimed_count).toBe(2);
		expect(byTitle.get('Repaint the safety lines')?.claimed_count).toBe(0);
		// An unclaimed contract names nobody, and says so as an EMPTY STRING
		// rather than a null -- the function's own `coalesce(k.names, '')`.
		expect(byTitle.get('Repaint the safety lines')?.contractors).toBe('');
	});

	test('its columns are EXACTLY these thirteen, and a fourteenth reddens this', async () => {
		const rows = await readPublic('coin_public_contracts');
		expect(keysOf(rows[0])).toEqual([...PROJECTIONS.coin_public_contracts].sort());
	});

	test('`contractors` is DISPLAY NAMES, and the claimant emails are not in it', async () => {
		const rows = await readPublic('coin_public_contracts');
		const cart = rows.find((r) => r.title === 'Rebuild the shop cart')!;
		const names = (cart.contractors as string).split(' | ');
		expect(names).toContain('Ada Lovelace');
		expect(cart.contractors as string).not.toContain('@');
	});

	test('AN UNNAMED CLAIMANT IS THE GENERIC WORD, BY BOTH PATHS (0157)', async () => {
		// THIS ASSERTION USED TO SAY THE OPPOSITE, AND THE REVERSAL IS THE POINT.
		// As written by this file's own bundle it read "BUT AN UNNAMED CLAIMANT IS
		// PUBLISHED AS THE LOCAL PART OF THEIR ADDRESS", and argued the trade:
		// `_coin_public_roster`'s last rung and `coin_public_contracts`' own inner
		// coalesce both fell through to split_part(email, '@', 1), the student
		// domain is a single fixed string, and a local part plus that constant
		// reconstructs the whole address. It was not a field somebody forgot --
		// 0089's header states the chain openly -- and the alternative offered was
		// a claimant rendering as nothing.
		//
		// 0157 took the third option that argument missed: a GENERIC WORD, which
		// is what `gauntlet_room_board` has done since 0010 and what
		// `_coin_public_name_fallback()` now says in one place for both sites. A
		// board that names its claimants still names the ones who have a name, and
		// nobody is identified by an address any more.
		const rows = await readPublic('coin_public_contracts');
		const cart = rows.find((r) => r.title === 'Rebuild the shop cart')!;
		const names = (cart.contractors as string).split(' | ');
		expect(names).toContain('Student');
		expect(names).not.toContain('quiet.claimant');
		expect(names).not.toContain(noName.email);

		// And the SECOND copy of that rule, in the function's own body rather
		// than in the roster: a claimant the roster does not carry at all. It
		// resolves to the same word, which is what one shared definition buys.
		const deburr = rows.find((r) => r.title === 'Deburr the plate stock')!;
		expect(deburr.contractors).toBe('Student');
		// Its positive control -- she really is absent from the roster, so this
		// really is the function's own branch and not the roster's.
		const { rows: rosterRows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public._coin_public_roster() r
			  where r.student_email = $1`,
			[offRoster.email]
		);
		expect(rosterRows[0].n).toBe('0');
	});

	test('`section` is the LABEL, never the internal section id', async () => {
		const rows = await readPublic('coin_public_contracts');
		const cart = rows.find((r) => r.title === 'Rebuild the shop cart')!;
		expect(cart.section).toBe(SECTION_LABEL);
		expect(cart.section).not.toBe(SECTION);
		// POSITIVE CONTROL: the id really is what the row stores, so the label
		// really is a projection and not the only value there was.
		const { rows: stored } = await db.sql<{ section_id: string }>(
			`select section_id from public.coin_contracts where id = $1`,
			[contractSectioned]
		);
		expect(stored[0].section_id).toBe(SECTION);
	});

	test('the ADMIN sibling carries two things this one does not, and is closed to anon', async () => {
		// The paired control that makes "the public board is narrower" a
		// measurement rather than a description. `coin_admin_list_contracts`
		// answers the same question with `created_by` -- a staff EMAIL -- and
		// `claimants` as structured jsonb.
		const admin = await ok<Record<string, unknown>[]>(adminClient.rpc('coin_admin_list_contracts'));
		expect(admin.length).toBeGreaterThan(0);
		expect(keysOf(admin[0])).toContain('created_by');
		expect(keysOf(admin[0])).toContain('claimants');
		expect(String(admin.find((r) => r.title === 'Rebuild the shop cart')?.created_by)).toBe(
			owner.email
		);
		// Neither key is anywhere in the public projection.
		expect([...PROJECTIONS.coin_public_contracts]).not.toContain('created_by');
		expect([...PROJECTIONS.coin_public_contracts]).not.toContain('claimants');
	});
});

describe('/api/coin/public?action=contracts, driven as a signed-out visitor', () => {
	test('POSITIVE CONTROL: it answers a JSON array with a card per contract', async () => {
		const cards = await routeJson<Record<string, unknown>[]>('contracts');
		expect(cards).toHaveLength(5);
		expect(cards.map((c) => c.name).sort()).toEqual([
			'Deburr the plate stock',
			'Inventory the filament',
			'Rebuild the shop cart',
			'Repaint the safety lines',
			'Sort the fastener wall'
		]);
	});

	test('THE ROUTE IS A HAND RESHAPE: exactly these thirteen keys reach a browser', async () => {
		const cards = await routeJson<Record<string, unknown>[]>('contracts');
		for (const card of cards) {
			expect(keysOf(card)).toEqual(
				[
					'cancelReason',
					'claimedCount',
					'dateCancelled',
					'dateCompleted',
					'id',
					'maxContractors',
					'name',
					'notes',
					'rateLabel',
					'section',
					'status',
					'totalPayout',
					'contractors'
				].sort()
			);
		}
	});

	test('AND IT DROPS ONE THE RPC RETURNS: `created_at` never reaches the wire', async () => {
		// Worth pinning in its own right rather than being implied by the key
		// set above: it is the one field the reshape silently discards, so the
		// RPC's projection and the browser's are NOT the same list, and a reader
		// who checked only one of them would have the wrong idea of either.
		const rpcRows = await readPublic('coin_public_contracts');
		expect(keysOf(rpcRows[0])).toContain('created_at');
		const body = (await route('contracts')).body;
		expect(body).not.toContain('created_at');
	});

	test('no address AND NO PART OF ONE reaches the browser (0157)', async () => {
		// The second half of this used to assert the local parts were present.
		// Since 0157 the whole point is that they are not: a local part is the
		// recoverable half of an address on a page anybody can open, so it is
		// swept for BY NAME rather than by the presence of an `@`.
		const body = (await route('contracts')).body;
		expect(body).not.toMatch(/@boscotech\.(net|edu)/);
		expect(body).not.toContain('quiet.claimant');
		expect(body).not.toContain('no.roster');
		// POSITIVE CONTROL: the board is not simply empty -- the claimant who
		// HAS a name is still named, and the ones who do not read as the word.
		expect(body).toContain('Ada Lovelace');
		expect(body).toContain('Student');
	});
});

// ===========================================================================
// coin_public_reasons -- the price guide. Passed through WHOLE by the route.
// ===========================================================================

describe('the price guide, called by a signed-out visitor', () => {
	test('POSITIVE CONTROL: it answers the real price list across all three kinds', async () => {
		const rows = await readPublic('coin_public_reasons');
		expect(rows.length).toBeGreaterThan(20);
		expect([...new Set(rows.map((r) => r.type))].sort()).toEqual(['Award', 'Fine', 'Purchase']);
	});

	test('its columns are EXACTLY these four, and a fifth reddens this', async () => {
		const rows = await readPublic('coin_public_reasons');
		expect(keysOf(rows[0])).toEqual([...PROJECTIONS.coin_public_reasons].sort());
	});

	test('`detail` PUBLISHES coin_categories.notes verbatim, which is the trade to know', async () => {
		// The four columns are about a PRICE and name nobody, so there is no
		// per-student question here at all. The one field worth arguing about is
		// `detail`, which concatenates the price with `coin_categories.notes` --
		// free text an admin writes through `coin_admin_create_category`, and
		// which reads in the seed data as internal pricing rationale ("Attacks
		// the currency itself", "Real physical injury risk, priced at the top on
		// purpose"). Those sentences are fine on a public guide and are arguably
		// the point of it: a student should be able to see what a thing costs
		// AND why. What they are not is a private admin note, and nothing in the
		// column's name or its write path says so.
		//
		// This is the pin that says the field is a publication surface. A note
		// naming a student or an incident would reach the internet by the same
		// path, and the fix would be in the write path, not here.
		const rows = await readPublic('coin_public_reasons');
		const theft = rows.find((r) => r.reason === 'Coin Theft')!;
		const { rows: stored } = await db.sql<{ notes: string }>(
			`select notes from public.coin_categories where id = 'coin_theft'`
		);
		expect(stored[0].notes).toBe('Attacks the currency itself.');
		expect(theft.detail as string).toContain(stored[0].notes);
	});

	test('a retired or mechanism-only category does NOT reach the guide', async () => {
		// `where c.active and c.loggable` is the whole filter, and it has
		// something to filter: 0070 seeds `mint_tampering_unknown` as loggable
		// false, a mechanism rather than a fine.
		const { rows: notLoggable } = await db.sql<{ name: string }>(
			`select name from public.coin_categories where not loggable and active`
		);
		expect(notLoggable.length).toBeGreaterThan(0); // the positive control
		const guide = await readPublic('coin_public_reasons');
		for (const row of notLoggable) {
			expect(guide.map((r) => r.reason)).not.toContain(row.name);
		}
	});

	test('THE ROUTE PASSES THE RPC THROUGH WHOLE: an added column would reach the wire', async () => {
		// The other half of this file's route finding. `reasons` is
		// `JSON.stringify(data ?? [])` with no mapping at all, so what a browser
		// receives is the RPC's own key set, verbatim -- which makes THIS pin,
		// not the RPC pin, the one that would catch a widening at the surface.
		const served = await routeJson<Record<string, unknown>[]>('reasons');
		const rpcRows = await readPublic('coin_public_reasons');
		expect(served).toEqual(rpcRows);
		expect(keysOf(served[0])).toEqual([...PROJECTIONS.coin_public_reasons].sort());
	});
});

// ===========================================================================
// coin_public_roles -- the definitions board and the open-slot counts.
// ===========================================================================

describe('the roles board, called by a signed-out visitor', () => {
	test('POSITIVE CONTROL: one row per active role in each active section', async () => {
		const rows = await readPublic('coin_public_roles');
		// Two active sections x four active role definitions.
		expect(rows).toHaveLength(8);
		expect([...new Set(rows.map((r) => r.section))].sort()).toEqual([
			'Engineering I Honors, Sophomore',
			'Engineering II, Junior'
		]);
	});

	test('its columns are EXACTLY these eight, and a ninth reddens this', async () => {
		const rows = await readPublic('coin_public_roles');
		expect(keysOf(rows[0])).toEqual([...PROJECTIONS.coin_public_roles].sort());
	});

	test('the counts are COUNTS: capacity, held and open, and no holder is named', async () => {
		// `held` is the widest thing this board says, and it says it about a
		// SECTION rather than a person: "two of the three Safety Officer slots
		// in Engineering I are taken" identifies nobody, and an open-slot count
		// is what the board exists to publish -- a student deciding whether to
		// apply needs exactly this number. The identities live behind
		// `coin_role_admin_list_holders`, which is admin-gated.
		const rows = await readPublic('coin_public_roles');
		const safety = rows.find(
			(r) => r.role_id === 'safety_officer' && r.section === SECTION_LABEL
		)!;
		expect(safety.capacity).toBe(2);
		expect(safety.held).toBe(0);
		expect(safety.open).toBe(2);
		expect(safety.open).toBe((safety.capacity as number) - (safety.held as number));
	});

	test('`section_id` IS published, and is an admin-chosen slug rather than a person', async () => {
		// Named because it is the one internal key of the five that reaches a
		// signed-out caller. It is a section handle an admin typed
		// (`coin_admin_upsert_section`'s `p_id`), so it says nothing about
		// anybody -- and the ONLY shipped consumer drops it, which the route
		// test below pins. It is here because a reader comparing the RPC's list
		// against the browser's would otherwise wonder which of the two is
		// wrong.
		const rows = await readPublic('coin_public_roles');
		expect(rows.some((r) => r.section_id === SECTION)).toBe(true);
	});
});

describe('/api/coin/public?action=roles, driven as a signed-out visitor', () => {
	test('POSITIVE CONTROL: it groups by section, one entry per section', async () => {
		const groups = await routeJson<Record<string, unknown>[]>('roles');
		expect(groups).toHaveLength(2);
		expect(groups.map((g) => g.section).sort()).toEqual([
			'Engineering I Honors, Sophomore',
			'Engineering II, Junior'
		]);
	});

	test('THE ROUTE IS A HAND RESHAPE, and it drops `section_id` and `held`', async () => {
		const groups = await routeJson<
			{ section: string; appsOpen: boolean; roles: Record<string, unknown>[] }[]
		>('roles');
		for (const group of groups) {
			expect(keysOf(group)).toEqual(['appsOpen', 'roles', 'section']);
			for (const role of group.roles) {
				expect(keysOf(role)).toEqual(['capacity', 'description', 'open', 'role', 'roleId']);
			}
		}
		const body = (await route('roles')).body;
		expect(body).not.toContain('section_id');
		expect(body).not.toContain('"held"');
	});
});

// ===========================================================================
// coin_public_role_questions -- the one with an answer key one column away.
// ===========================================================================

describe('the role questions, called by a signed-out visitor', () => {
	test('POSITIVE CONTROL: both active questions come back, in sequence', async () => {
		const rows = await readPublic('coin_public_role_questions', { p_role_id: 'safety_officer' });
		expect(rows.map((r) => r.sequence)).toEqual([1, 2]);
		expect(rows.map((r) => r.type)).toEqual(['mc', 'written']);
	});

	test('its columns are EXACTLY these five, and a sixth reddens this', async () => {
		const rows = await readPublic('coin_public_role_questions', { p_role_id: 'safety_officer' });
		for (const row of rows) {
			expect(keysOf(row)).toEqual([...PROJECTIONS.coin_public_role_questions].sort());
		}
	});

	test('THE ANSWER KEY IS ABSENT, and it is a real number for these questions', async () => {
		// The positive control is the half that matters: without it this passes
		// on a fixture where no question has a key at all.
		const { rows: stored } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_role_quiz_questions
			  where role_id = 'safety_officer' and correct_option_index is not null`
		);
		expect(stored[0].n).toBe('2'); // the live mc question and the retired one
		const rows = await readPublic('coin_public_role_questions', { p_role_id: 'safety_officer' });
		expect(JSON.stringify(rows)).not.toContain('correct_option_index');
		for (const row of rows) expect(keysOf(row)).not.toContain('correct_option_index');

		// And the ADMIN sibling, which answers the same question WITH the key
		// and is closed to anon. Two functions, one question, the key on one
		// side only -- which is what makes the absence a boundary rather than a
		// column somebody has not added yet.
		const withKey = await ok<Record<string, unknown>[]>(
			adminClient.rpc('coin_role_admin_list_role_questions', { p_role_id: 'safety_officer' })
		);
		expect(keysOf(withKey[0])).toContain('correct_option_index');
		expect(withKey.some((r) => r.correct_option_index !== null)).toBe(true);
	});

	test('`options` carries option STRINGS only, so no key can ride inside it', async () => {
		// The one field of the five that is a raw jsonb column passed straight
		// out, which makes it the one place a widening needs no function edit:
		// 0076's CHECK constrains `options` to a jsonb ARRAY of length 2-8 and
		// says nothing about the ELEMENT type, so `["A", {"correct": true}]` is
		// representable today and would reach a browser through both the RPC
		// and the route. Nothing on the page would show it -- the Ledger renders
		// option text -- so it is exactly the silent kind.
		const rows = await readPublic('coin_public_role_questions', { p_role_id: 'safety_officer' });
		const mc = rows.find((r) => r.type === 'mc')!;
		expect(Array.isArray(mc.options)).toBe(true);
		expect(mc.options).toEqual(['By the door', 'Behind the mill', "There isn't one"]);
		for (const option of mc.options as unknown[]) expect(typeof option).toBe('string');
		// A written question carries neither, which is 0076's own rule.
		expect(rows.find((r) => r.type === 'written')!.options).toBeNull();
	});

	test('an inactive question is excluded, and it really exists', async () => {
		const { rows: retired } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_role_quiz_questions
			  where role_id = 'safety_officer' and not active`
		);
		expect(retired[0].n).toBe('1'); // the positive control
		const rows = await readPublic('coin_public_role_questions', { p_role_id: 'safety_officer' });
		expect(rows.map((r) => r.question_text)).not.toContain('RETIRED: which lever is the estop?');
	});

	test('a role with no questions is an empty array, not an error', async () => {
		const rows = await readPublic('coin_public_role_questions', { p_role_id: 'lab_tech' });
		expect(rows).toEqual([]);
		// And an id that names nothing answers identically, so a role cannot be
		// probed for existence through this read.
		expect(await readPublic('coin_public_role_questions', { p_role_id: 'not-a-role' })).toEqual([]);
	});
});

describe('/api/coin/public?action=roleQuestions, driven as a signed-out visitor', () => {
	test('THE ROUTE IS A HAND RESHAPE: exactly these five keys reach a browser', async () => {
		const served = await routeJson<Record<string, unknown>[]>('roleQuestions', {
			role: 'safety_officer'
		});
		expect(served).toHaveLength(2);
		for (const q of served) {
			expect(keysOf(q)).toEqual(['options', 'question', 'questionId', 'sequence', 'type']);
		}
		// The route renames `type` upward and normalizes a null `options` to an
		// empty array, which is the shape the Ledger's modal walks.
		expect(served.map((q) => q.type)).toEqual(['MC', 'FREE']);
		expect(served[1].options).toEqual([]);
	});

	test('no answer key reaches the wire, under a role that has one', async () => {
		const body = (await route('roleQuestions', { role: 'safety_officer' })).body;
		expect(body).not.toContain('correct_option_index');
		expect(body).not.toContain('correct');
	});
});

// ===========================================================================
// coin_public_sections -- the colour map. Passed through WHOLE by the route.
// ===========================================================================

describe('the section colours, called by a signed-out visitor', () => {
	test('POSITIVE CONTROL: the coloured section is there', async () => {
		const rows = await readPublic('coin_public_sections');
		expect(rows).toEqual([{ section: SECTION_LABEL, color: SECTION_COLOR }]);
	});

	test('its columns are EXACTLY these two, and a third reddens this', async () => {
		const rows = await readPublic('coin_public_sections');
		expect(keysOf(rows[0])).toEqual([...PROJECTIONS.coin_public_sections].sort());
	});

	test('a section with no colour is absent, and it really exists', async () => {
		const { rows: uncoloured } = await db.sql<{ label: string }>(
			`select label from public.coin_sections where color is null and active`
		);
		expect(uncoloured.map((r) => r.label)).toEqual(['Engineering II, Junior']);
		const rows = await readPublic('coin_public_sections');
		expect(rows.map((r) => r.section)).not.toContain('Engineering II, Junior');
	});

	test('THE ROUTE PASSES THE RPC THROUGH WHOLE: an added column would reach the wire', async () => {
		const served = await routeJson<Record<string, unknown>[]>('sections');
		const rpcRows = await readPublic('coin_public_sections');
		expect(served).toEqual(rpcRows);
		expect(keysOf(served[0])).toEqual([...PROJECTIONS.coin_public_sections].sort());
	});
});

// ===========================================================================
// The sweep.
// ===========================================================================

describe('no address leaves any of the five, under any parameter', () => {
	test('POSITIVE CONTROL: the addresses really are in the tables behind them', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_contract_claims
			  where student_email like '%@boscotech.net'`
		);
		expect(Number(rows[0].n)).toBeGreaterThan(0);
	});

	test('every row of every one of the five, serialized, contains no email at all', async () => {
		const roleIds = (
			await db.sql<{ id: string }>(`select id from public.coin_role_definitions order by id`)
		).rows.map((r) => r.id);
		expect(roleIds.length).toBeGreaterThan(0);

		const payloads: Record<string, unknown> = {
			contracts: await readPublic('coin_public_contracts'),
			reasons: await readPublic('coin_public_reasons'),
			roles: await readPublic('coin_public_roles'),
			sections: await readPublic('coin_public_sections')
		};
		// Every role, not a sample -- the questions read is the one of the five
		// that takes a parameter.
		for (const id of roleIds) {
			payloads[`questions:${id}`] = await readPublic('coin_public_role_questions', {
				p_role_id: id
			});
		}
		// And the hostile parameter: an ADDRESS handed in where a role id goes.
		payloads.emailAsRoleId = await readPublic('coin_public_role_questions', {
			p_role_id: ada.email
		});

		const text = JSON.stringify(payloads);
		expect(text).not.toMatch(/@boscotech\.(net|edu)/);
		expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
	});

	test('and neither does any of the five route actions', async () => {
		for (const action of ['contracts', 'reasons', 'roles', 'sections']) {
			const body = (await route(action)).body;
			expect(body.length, `${action} served nothing`).toBeGreaterThan(2);
			expect(body, `${action} served an address`).not.toMatch(
				/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
			);
		}
		const questions = (await route('roleQuestions', { role: 'safety_officer' })).body;
		expect(questions.length).toBeGreaterThan(2);
		expect(questions).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
	});
});
