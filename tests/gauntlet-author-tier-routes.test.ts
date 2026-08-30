// tests/gauntlet-author-tier-routes.test.ts
//
// 0155, the ROUTE half: a refused caller is TOLD they are refused.
//
// WHY THIS FILE EXISTS. An audit found that a Bosco Tech teacher who is not an
// admin got a REDIRECT off /gauntlet/author, so being refused was
// indistinguishable from a broken link -- they landed on the dojo with nothing
// anywhere saying what happened or who to ask. The rooms landing had the same
// defect in its other costume: it rendered fine and simply omitted the host
// section, so a refusal looked like the feature not existing.
//
// BOTH FAILURES ARE INVISIBLE TO EVERY OTHER CHECK. A redirect is a correct,
// type-checking, test-passing thing for a load to do; `svelte-check` has no
// opinion, the database suite cannot see a route, and the person who hits it is
// by definition not the person who wrote it. The only thing that reddens when
// somebody "tidies" this back into `redirect(303, '/gauntlet')` is an assertion
// that the load did NOT throw and that the words reached the page.
//
// THE COPY IS ASSERTED, NOT JUST THE FLAG. A boolean reaching the payload
// proves nothing about what a person reads; the render is what says the panel
// is on screen and carries who to ask.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as AUTHOR_LOAD } from '../src/routes/gauntlet/author/+page.server';
import { load as AUTHOR_NEW_LOAD } from '../src/routes/gauntlet/author/new/+page.server';
import { load as ROOMS_LOAD } from '../src/routes/gauntlet/rooms/+page.server';
import AuthorPage from '../src/routes/gauntlet/author/+page.svelte';
import RoomsPage from '../src/routes/gauntlet/rooms/+page.svelte';
import { ADMIN_OWNER_EMAIL } from '../src/lib/admin';
import { canAuthorGauntlet } from '../src/lib/server/gauntlet-authoring';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0004_gauntlet.sql',
	'0005_gauntlet_speedrun.sql',
	'0006_gauntlet_macro.sql',
	'0007_gauntlet_modeling_modes.sql',
	'0008_gauntlet_knowledge_modes.sql',
	'0009_gauntlet_authoring.sql',
	'0010_gauntlet_rooms.sql',
	'0015_gauntlet_speedrun_formalize.sql',
	'0016_gauntlet_speedrun_start.sql',
	'0017_gauntlet_run_status.sql',
	'0018_gauntlet_speedrun_units.sql',
	'0019_gauntlet_purge_demo.sql',
	'0021_gauntlet_progression.sql',
	'0022_gauntlet_drawing_series.sql',
	'0023_gauntlet_reveal_focus_regions.sql',
	'0024_gauntlet_leaderboards.sql',
	'0025_gauntlet_room_delete.sql',
	'0026_gauntlet_material_gate.sql',
	'0027_gauntlet_material_density_gate.sql',
	'0028_gauntlet_room_code_and_host_play.sql',
	'0029_gauntlet_drop_tiers.sql',
	'0030_gauntlet_unit_system.sql',
	'0031_gauntlet_tools_bucket.sql',
	'0033_gauntlet_speedrun_attempts.sql',
	'0034_gauntlet_volume_only_verification.sql',
	'0035_gauntlet_run_events.sql',
	'0036_gauntlet_volume_tolerance_0_1.sql',
	'0061_gauntlet_target_disclosure.sql',
	'0137_anon_execute_sweep.sql',
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0155_gauntlet_authoring_tier.sql'
] as const;

/**
 * The chain WITHOUT 0155: a deployment between the push and the apply, which is
 * a real state here because migrations are applied by hand and separately.
 *
 * IT NAMES 0155 RATHER THAN COUNTING FROM THE END. This was
 * `CHAIN.slice(0, -1)`, which means "without 0155" only for as long as 0155
 * happens to be the last entry on CHAIN -- so appending ANY later migration
 * silently redefines this constant as "with 0155, without the new one", and the
 * before/after pair below stops contrasting the thing it names. It does not
 * fail when that happens: `dbBefore` simply becomes a second copy of the
 * after-world, and the absence assertions pass because 0155 is applied.
 *
 * THE THIRD INSTANCE OF ONE DEFECT. `gauntlet-run-review-route.test.ts` had it
 * for 0152 and `gauntlet-practice-meter.test.ts` for 0151; both were fixed on
 * the two branches this file's bundle reconciles, and both reports predicted a
 * third. This is it, found by sweeping `tests/` for the spelling rather than by
 * waiting for it to bite. Nothing appends to CHAIN today, so the constant is
 * still CORRECT as written -- this is closing it while it is cheap, not
 * repairing a live failure.
 *
 * A TRUNCATION AND NOT A FILTER: everything after 0155 on this chain would
 * depend on it, so dropping 0155 out of the middle would build a state no
 * operator can reach.
 */
const CHAIN_BEFORE = CHAIN.slice(
	0,
	CHAIN.indexOf('0155_gauntlet_authoring_tier.sql')
) as unknown as string[];

// `indexOf` returning -1 would make the slice above an EMPTY chain, which fails
// in a way that reads as a broken harness rather than as a renamed migration.
if (!CHAIN.includes('0155_gauntlet_authoring_tier.sql')) {
	throw new Error('CHAIN_BEFORE cannot be derived: 0155 is not on CHAIN.');
}

type ForeignKeys = Awaited<ReturnType<typeof loadForeignKeys>>;

let db: TestDb;
let fks: ForeignKeys;
let dbBefore: TestDb;
let fksBefore: ForeignKeys;

let admin: SeededUser;
let author: SeededUser;
let teacher: SeededUser;
let student: SeededUser;
let adminBefore: SeededUser;
let teacherBefore: SeededUser;

function client(who: SeededUser, which: 'after' | 'before' = 'after') {
	return which === 'after'
		? createPostgrestShim(db, fks, who.id)
		: createPostgrestShim(dbBefore, fksBefore, who.id);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function driveAuthor(who: SeededUser, which: 'after' | 'before' = 'after'): Promise<any> {
	return (await AUTHOR_LOAD({
		locals: {
			supabase: client(who, which),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
	} as any)) as any;
}

async function driveAuthorNew(who: SeededUser): Promise<any> {
	return (await AUTHOR_NEW_LOAD({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		},
		url: new URL('http://localhost/gauntlet/author/new')
	} as any)) as any;
}

async function driveRooms(who: SeededUser): Promise<any> {
	return (await ROOMS_LOAD({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
	} as any)) as any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeAll(async () => {
	db = await startTestDb(CHAIN as unknown as string[]);
	fks = await loadForeignKeys(db);

	admin = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	author = await createUser(db, 'mcosso@boscotech.edu', 'Author Teacher');
	teacher = await createUser(db, 'notonthelist@boscotech.edu', 'Plain Teacher');
	student = await createUser(db, 'kid@boscotech.net', 'A Student');
	await db.asUser(admin.id, (q) =>
		q(`select public.gauntlet_author_grant($1)`, [author.email])
	);

	// The world as deployed the moment this code ships and before 0155 is pasted
	// into the SQL editor. Migrations here are applied by hand and separately, so
	// this is a real state and not a hypothetical.
	dbBefore = await startTestDb(CHAIN_BEFORE);
	fksBefore = await loadForeignKeys(dbBefore);
	adminBefore = await createUser(dbBefore, 'apina@boscotech.edu', 'Site Owner');
	teacherBefore = await createUser(dbBefore, 'notonthelist@boscotech.edu', 'Plain Teacher');
}, 300_000);

afterAll(async () => {
	await db?.stop();
	await dbBefore?.stop();
});

describe('/gauntlet/author refuses in words, not with a redirect', () => {
	it('does not throw for a caller who cannot author', async () => {
		// A SvelteKit `redirect()` is a THROW. Asserting the load resolves is
		// exactly the assertion that reddens if somebody puts the bounce back.
		for (const who of [teacher, student]) {
			await expect(driveAuthor(who), who.email).resolves.toBeDefined();
		}
	});

	it('hands the refused caller the reason, and the permitted ones none', async () => {
		expect((await driveAuthor(teacher)).refusal).toBeTruthy();
		expect((await driveAuthor(student)).refusal).toBeTruthy();
		expect((await driveAuthor(admin)).refusal).toBeNull();
		expect((await driveAuthor(author)).refusal).toBeNull();
	});

	it('renders the refusal on the page, with who to ask', async () => {
		const data = await driveAuthor(teacher);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(AuthorPage, { props: { data: data as any } });
		expect(body).toContain('You do not have GAUNTLET authoring');
		// The one thing a refused person actually needs next.
		expect(body).toContain(ADMIN_OWNER_EMAIL);
		// And no control whose every action would fail: absence is the mechanism.
		expect(body).not.toContain('+ New challenge');
		expect(body).not.toContain('Speedrun ruleset');
	});

	it('POSITIVE CONTROL: an author gets the real console, controls and all', async () => {
		// Without this, "the refused page has no New challenge button" could
		// equally mean the button was deleted for everybody.
		const data = await driveAuthor(author);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(AuthorPage, { props: { data: data as any } });
		expect(body).toContain('+ New challenge');
		expect(body).toContain('Speedrun ruleset');
		expect(body).not.toContain('You do not have GAUNTLET authoring');
	});

	it('sends a refused caller from /author/new to the page that explains it', async () => {
		// The two form routes DO redirect, deliberately -- to the one surface that
		// speaks, rather than to /gauntlet, which is what read as a broken link.
		// One panel, not three copies of one sentence.
		await expect(driveAuthorNew(teacher)).rejects.toMatchObject({
			status: 303,
			location: '/gauntlet/author'
		});
		await expect(driveAuthorNew(author)).resolves.toBeDefined();
	});
});

describe('/gauntlet/rooms says why hosting is not offered', () => {
	it('gates hosting on the author tier, not on admin', async () => {
		expect((await driveRooms(admin)).canHost).toBe(true);
		expect((await driveRooms(author)).canHost).toBe(true);
		expect((await driveRooms(teacher)).canHost).toBe(false);
		expect((await driveRooms(student)).canHost).toBe(false);
	});

	it('renders the reason for a caller who cannot host, and keeps joining open', async () => {
		const data = await driveRooms(teacher);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(RoomsPage, { props: { data: data as any } });
		expect(body).toContain('You do not have GAUNTLET authoring');
		expect(body).toContain(ADMIN_OWNER_EMAIL);
		expect(body).not.toContain('+ Host a new room');
		// JOINING is not part of this tier and never was: anyone with a code gets
		// in. A refusal panel that also removed the join form would be the bug.
		expect(body).toContain('Join');
	});

	it('POSITIVE CONTROL: an author gets the host control and no refusal', async () => {
		const data = await driveRooms(author);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { body } = render(RoomsPage, { props: { data: data as any } });
		expect(body).toContain('+ Host a new room');
		expect(body).not.toContain('You do not have GAUNTLET authoring');
	});
});

describe('the world between the deploy and the apply', () => {
	it('degrades to the admin answer when 0155 is not applied yet', async () => {
		// canAuthorGauntlet falls back to isAdmin on PGRST202 ALONE. That is not a
		// hole: with 0155 unapplied the database has no author tier and every gate
		// still reads is_teacher(), which IS the admin check, so mirroring it is
		// what keeps the app honest about what the backend will allow.
		const asAdmin = await driveAuthor(adminBefore, 'before');
		expect(asAdmin.refusal).toBeNull();

		const asTeacher = await driveAuthor(teacherBefore, 'before');
		expect(asTeacher.refusal).toBeTruthy();
	});

	it('POSITIVE CONTROL: the function really is missing on that chain', async () => {
		// So the fallback above is the branch that ran, and not the RPC quietly
		// answering. A test of a degrade path that never degraded proves nothing.
		const { rows } = await dbBefore.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'gauntlet_can_author'`
		);
		expect(rows[0].n).toBe('0');
		const { rows: after } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'gauntlet_can_author'`
		);
		expect(after[0].n).toBe('1');
	});
});

describe('the error ladder in canAuthorGauntlet', () => {
	// NOT DRIVEN THROUGH THE POSTGREST SHIM, AND THE REASON IS THE WHOLE POINT
	// OF THIS BLOCK. tests/db/postgrest-shim.ts answers EVERY rpc failure as
	// `{ code: 'PGRST202' }` -- a missing function and a deliberate `raise` inside
	// a live one are the same object coming out of it. So a test that made the
	// real `gauntlet_can_author()` raise would exercise the DEGRADE path while
	// appearing to exercise the fault path, and would pass whether the code
	// matched on PGRST202 or on nothing at all. Measured: a mutant that degraded
	// on ANY error passed all ten DB-driven assertions in this file.
	//
	// The distinction is only observable at the boundary the rule is written
	// about, so it is asserted there, against the two error shapes PostgREST
	// actually produces. The shim is shared and is not this bundle's to change.

	/* eslint-disable @typescript-eslint/no-explicit-any */
	function stub(rpcAnswers: Record<string, { data: unknown; error: unknown }>, role = 'teacher') {
		return {
			rpc: async (name: string) =>
				rpcAnswers[name] ?? { data: null, error: { code: 'PGRST202', message: 'missing' } },
			from: () => ({
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({ data: { role }, error: null }),
						single: async () => ({ data: { role }, error: null })
					})
				})
			})
		} as any;
	}
	/* eslint-enable @typescript-eslint/no-explicit-any */

	it('FAILS CLOSED on a runtime fault inside the function', async () => {
		// P0001 is a `raise` -- the function exists and said no, or broke. Reading
		// that as "not migrated" would judge the caller by a rule the database is
		// not applying, on exactly the request that most deserves refusing. The
		// stub would answer TRUE for is_admin if the fallback ran, so a false here
		// can only mean the fallback did not.
		const client = stub({
			gauntlet_can_author: {
				data: null,
				error: { code: 'P0001', message: 'gauntlet_can_author() blew up' }
			},
			is_admin: { data: true, error: null }
		});
		expect(await canAuthorGauntlet(client, 'someone')).toBe(false);
	});

	it('POSITIVE CONTROL: PGRST202 DOES degrade to the admin answer', async () => {
		// Without this, the `false` above could equally mean the function always
		// answers false and the ladder has no live path at all.
		const missing = { data: null, error: { code: 'PGRST202', message: 'no function' } };
		expect(
			await canAuthorGauntlet(stub({ gauntlet_can_author: missing, is_admin: { data: true, error: null } }), 'x')
		).toBe(true);
		expect(
			await canAuthorGauntlet(stub({ gauntlet_can_author: missing, is_admin: { data: false, error: null } }), 'x')
		).toBe(false);
	});

	it('answers the RPC when it works, without consulting anything else', async () => {
		expect(
			await canAuthorGauntlet(stub({ gauntlet_can_author: { data: true, error: null }, is_admin: { data: false, error: null } }), 'x')
		).toBe(true);
		expect(
			await canAuthorGauntlet(stub({ gauntlet_can_author: { data: false, error: null }, is_admin: { data: true, error: null } }), 'x')
		).toBe(false);
	});
});
