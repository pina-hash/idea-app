// tests/db/armory-release-choice.test.ts
//
// MIGRATION 0273: a project's SolidWorks version, chosen at creation and moved
// up on purpose (ledger 0404, decision 41 item 7). The chain is every migration
// before 0273, read off disk behind the fixture completion (the database
// production holds before the apply); projects, members and files are written
// through the REAL 0231 to 0236 RPCs; a corpus of calls the deployed Windows
// app and website make is put to the DEPLOYED bodies; then 0273 goes on top
// and the same corpus runs again.
//
// What a wrong answer here would look like, and why each is silent:
//   - A PIN COMES DOWN. A lowered pin strands every file saved in the newer
//     release; nothing on screen says so until a 2025 computer cannot open one.
//   - A STUDENT OR A CAD LEAD MOVES THE PROJECT UP, and every 2025 computer on
//     the team is quietly out of step.
//   - A PIN GOES TO A RELEASE THAT DOES NOT EXIST (2099), and can never come
//     back down.
//   - THE DEPLOYED APP'S CREATE CALL STOPS RESOLVING, or answers differently,
//     because the new form made the pair ambiguous or moved a refusal.

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { canExecute, catalogFingerprint, overloads, pasteTrap } from './chain-0230';
import { armoryRpc, makeAdmin, person } from './armory-v3-helpers';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';
const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();
const FILES_0273 = ALL.filter((f) => f.startsWith('0273_'));
if (FILES_0273.length !== 1) throw new Error(`expected exactly one 0273 migration, found ${FILES_0273.length}`);
const PRE_0273 = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < '0273')];
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL_0273 = readFileSync(join(MIGRATIONS_DIR, FILES_0273[0]), 'utf8');

/** The refusal texts, written out: a test whose expected value comes from the function cannot fail. */
const NOT_A_MENTOR = 'only a mentor may raise the pinned release';
const NOT_AN_ADMIN = 'only a site admin may create an Armory project';

const CREATE3 = 'select public.armory_create_project($1, $2::smallint, $3) as r';
const CREATE4 = 'select public.armory_create_project($1, $2::smallint, $3::smallint, $4) as r';
const RAISE = 'select public.armory_raise_pinned_release($1, $2::smallint, $3) as r';

type Outcome = { ok: true; r: unknown } | { ok: false; code: string; message: string };

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;

let admin: SeededUser; // the owner, mentor of every project they create
let admin2: SeededUser; // a site admin in NO project
let mentor: SeededUser;
let lead: SeededUser;
let ana: SeededUser;
let outsider: SeededUser;

let A: string; // created before 0273, still at 2025
let B: string; // raised by its mentor before 0273
let corpusBefore: Outcome[];
const year = (): number => Number(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).slice(0, 4));

async function attempt(u: SeededUser, sql: string, params: unknown[]): Promise<Outcome> {
	try {
		const row = await api.one<{ r: unknown }>(u, sql, params);
		return { ok: true, r: row.r };
	} catch (e) {
		const err = e as { code: string; message: string };
		return { ok: false, code: err.code, message: err.message };
	}
}
async function pinOf(project: string): Promise<number> {
	return (await db.sql<{ p: number }>('select pinned_release as p from public.armory_projects where id = $1', [project])).rows[0].p;
}

/**
 * Calls the deployed app and website make whose answers must not move. Each
 * refuses or answers without writing, so the corpus can run twice.
 */
function corpus(): Array<[SeededUser, string, () => unknown[]]> {
	return [
		// Creating: a non-admin, a bad name, a bad season, a taken name.
		[mentor, CREATE3, () => ['Not Mine', null, randomUUID()]],
		[ana, CREATE3, () => ['Not Mine', 2026, randomUUID()]],
		[admin, CREATE3, () => ['bad:name', null, randomUUID()]],
		[admin, CREATE3, () => ['Fine Name', 1999, randomUUID()]],
		[admin, CREATE3, () => ['robot 2026', null, randomUUID()]],
		// Raising: everyone who is not a mentor, and every pin that does not go up.
		[ana, RAISE, () => [A, 2026, randomUUID()]],
		[lead, RAISE, () => [A, 2026, randomUUID()]],
		[outsider, RAISE, () => [A, 2026, randomUUID()]],
		[mentor, RAISE, () => [A, 2025, randomUUID()]],
		[mentor, RAISE, () => [A, 2024, randomUUID()]],
		[mentor, RAISE, () => [A, null, randomUUID()]],
		[admin, RAISE, () => [B, 2025, randomUUID()]],
		[admin, RAISE, () => [B, 2026, randomUUID()]],
		[outsider, RAISE, () => [randomUUID(), 2026, randomUUID()]]
	];
}
async function runCorpus(): Promise<Outcome[]> {
	const out: Outcome[] = [];
	for (const [u, sql, args] of corpus()) out.push(await attempt(u, sql, args()));
	return out;
}

beforeAll(async () => {
	db = await startTestDb(PRE_0273);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	admin2 = await person(db, 'tech@boscotech.edu', 'Tess Tech');
	await makeAdmin(db, admin2.email);
	mentor = await person(db, 'mentor@boscotech.edu', 'Mo Mentor');
	lead = await person(db, 'lead@boscotech.net', 'Lea Diaz');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	outsider = await person(db, 'zed@boscotech.net', 'Zed Ziegler');

	// THROUGH THE DEPLOYED RPCs: the three-argument create, and the 0231 raise.
	A = await api.project(admin, 'Robot 2026');
	B = await api.project(admin, 'Practice Bot');
	await api.member(admin, A, mentor.email, 'mentor');
	await api.member(admin, A, lead.email, 'cad_lead');
	await api.member(admin, A, ana.email, 'student');
	const dev = await api.device(ana, 'IDEA-06');
	await api.createFile(ana, A, dev, 'Drive', 'Gearbox.SLDPRT');
	expect(await api.one(admin, RAISE, [B, 2026, randomUUID()])).toEqual({ r: true });
	expect(await pinOf(A)).toBe(2025);
	expect(await pinOf(B)).toBe(2026);

	corpusBefore = await runCorpus();
	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL_0273);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('0273 as a file', () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL_0273);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile("insert into public.armory_projects (name) values ('x');").findings).toHaveLength(1);
		expect(pasteTrap(SQL_0273)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
	});

	test('the first object it creates is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL_0273);
		expect(first?.[1]).toBe('public._armory_release_ceiling');
		const earlier = ALL.filter((x) => x < '0273').map((x) => readFileSync(join(MIGRATIONS_DIR, x), 'utf8'));
		expect(earlier.some((t) => t.includes('_armory_release_ceiling'))).toBe(false);
		// Positive control: the same scan finds a name an earlier file does carry.
		expect(earlier.some((t) => t.includes('armory_raise_pinned_release'))).toBe(true);
	});

	test('a second paste changes no catalog object, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL_0273);
		expect(await catalogFingerprint(db)).toEqual(after);
	});
});

describe('the pair, the grants and the ceiling, read off the catalog', () => {
	test('two create forms, neither with a default; one raise', async () => {
		expect(await overloads(db, 'armory_create_project')).toBe(2);
		expect(await overloads(db, 'armory_raise_pinned_release')).toBe(1);
		const { rows } = await db.sql<{ sig: string; d: number }>(
			`select p.oid::regprocedure::text as sig, p.pronargdefaults::int as d from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'armory_create_project' order by 1`
		);
		expect(rows).toEqual([
			{ sig: 'armory_create_project(text,smallint,smallint,uuid)', d: 0 },
			{ sig: 'armory_create_project(text,smallint,uuid)', d: 0 }
		]);
	});

	test('authenticated calls both creates and the raise; anon calls none; nobody calls the ceiling', async () => {
		for (const sig of ['armory_create_project(text, smallint, smallint, uuid)', 'armory_create_project(text, smallint, uuid)', 'armory_raise_pinned_release(uuid, smallint, uuid)']) {
			expect(await canExecute(db, 'authenticated', sig), sig).toBe(true);
			expect(await canExecute(db, 'anon', sig), sig).toBe(false);
		}
		expect(await canExecute(db, 'authenticated', '_armory_release_ceiling()')).toBe(false);
		expect(await canExecute(db, 'anon', '_armory_release_ceiling()')).toBe(false);
		// Positive control: the same probe answers true for a function anon does hold.
		const { rows } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') limit 1`
		);
		expect(rows.length).toBe(1);
	});

	test('the ceiling is next year in Los Angeles', async () => {
		const { rows } = await db.sql<{ c: number }>('select public._armory_release_ceiling()::int as c');
		expect(rows[0].c).toBe(year() + 1);
	});
});

describe('every deployed call answers as before', () => {
	test('the corpus is identical, case for case, and it is not all one answer', async () => {
		const after = await runCorpus();
		expect(after).toEqual(corpusBefore);
		expect(after.length).toBe(14);
		// NOT VACUOUS: it holds refusals with different codes, a not-a-mentor, and a non-increase.
		const codes = new Set(after.filter((o) => !o.ok).map((o) => (o as { code: string }).code));
		expect([...codes].sort()).toEqual(['22023', '23505', '42501']);
		expect(after.filter((o) => !o.ok && o.message === NOT_A_MENTOR)).toHaveLength(4);
		expect(after.filter((o) => !o.ok && o.message === NOT_AN_ADMIN)).toHaveLength(2);
		expect(after.filter((o) => !o.ok && /must increase from 2025/.test(o.message))).toHaveLength(3);
	});
});

describe('creating with a release', () => {
	test('2026 at creation pins 2026, a null release and the old form pin 2025', async () => {
		const p26 = (await api.one<{ r: string }>(admin, CREATE4, ['Robot 2027', null, 2026, randomUUID()])).r;
		const pNull = (await api.one<{ r: string }>(admin, CREATE4, ['Offseason', null, null, randomUUID()])).r;
		const pOld = (await api.one<{ r: string }>(admin, CREATE3, ['Trophy', null, randomUUID()])).r;
		expect(await pinOf(p26)).toBe(2026);
		expect(await pinOf(pNull)).toBe(2025);
		expect(await pinOf(pOld)).toBe(2025);
		// The creator is the first mentor on every path.
		const { rows } = await db.sql<{ role: string }>(
			'select role::text from public.armory_members where project_id = any($1::uuid[]) and email = $2',
			[[p26, pNull, pOld], admin.email]
		);
		expect(rows.map((r) => r.role)).toEqual(['mentor', 'mentor', 'mentor']);
		const feed = await db.sql<{ payload: { pinned_release: number } }>(
			`select payload from public.armory_change_feed where kind = 'project_created' and entity_id = $1`,
			[p26]
		);
		expect(feed.rows[0].payload.pinned_release).toBe(2026);
	});

	test('a release outside 1995 to the ceiling is refused, and nothing is created', async () => {
		const ceiling = year() + 1;
		for (const bad of [2099, ceiling + 1, 1990]) {
			const r = await attempt(admin, CREATE4, [`Bad ${bad}`, null, bad, randomUUID()]);
			expect(r).toEqual({ ok: false, code: '22023', message: `The SolidWorks version must be a release from 1995 to ${ceiling}.` });
		}
		const { rows } = await db.sql<{ n: number }>("select count(*)::int as n from public.armory_projects where name like 'Bad %'");
		expect(rows[0].n).toBe(0);
		// The ceiling itself is allowed.
		const ok = (await api.one<{ r: string }>(admin, CREATE4, ['Newest', null, ceiling, randomUUID()])).r;
		expect(await pinOf(ok)).toBe(ceiling);
	});

	test('a non-admin is refused before the release is looked at, and a replay answers the first project', async () => {
		expect(await attempt(mentor, CREATE4, ['Mine', null, 2099, randomUUID()])).toEqual({ ok: false, code: '42501', message: NOT_AN_ADMIN });
		const op = randomUUID();
		const first = (await api.one<{ r: string }>(admin, CREATE4, ['Replayed', null, 2026, op])).r;
		const again = (await api.one<{ r: string }>(admin, CREATE4, ['Replayed', null, 2026, op])).r;
		const viaOld = (await api.one<{ r: string }>(admin, CREATE3, ['Replayed', null, op])).r;
		expect(again).toBe(first);
		expect(viaOld).toBe(first);
	});
});

describe('moving a project up', () => {
	test('a mentor raises 2025 to 2026, once; it never comes back down', async () => {
		expect(await api.one(mentor, RAISE, [A, 2026, randomUUID()])).toEqual({ r: true });
		expect(await pinOf(A)).toBe(2026);
		for (const lower of [2026, 2025, 2020]) {
			expect(await attempt(mentor, RAISE, [A, lower, randomUUID()])).toEqual({
				ok: false,
				code: '22023',
				message: 'The pinned release must increase from 2026.'
			});
		}
		expect(await pinOf(A)).toBe(2026);
		const feed = await db.sql<{ payload: Record<string, unknown> }>(
			`select payload from public.armory_change_feed where kind = 'pinned_release_raised' and entity_id = $1 order by cursor desc limit 1`,
			[A]
		);
		expect(feed.rows[0].payload).toMatchObject({ release: 2026, previous: 2025, by: mentor.email });
	});

	test('a student, a CAD lead and an outsider are refused, and the pin does not move', async () => {
		const before = await pinOf(A);
		for (const u of [ana, lead, outsider]) {
			expect(await attempt(u, RAISE, [A, before + 1, randomUUID()])).toEqual({ ok: false, code: '42501', message: NOT_A_MENTOR });
		}
		expect(await pinOf(A)).toBe(before);
	});

	test('a release above the ceiling is refused, after the role and the increase', async () => {
		const ceiling = year() + 1;
		const before = await pinOf(A);
		expect(await attempt(mentor, RAISE, [A, 2099, randomUUID()])).toEqual({
			ok: false,
			code: '22023',
			message: `SolidWorks 2099 is not a release yet; the newest a project can move to is ${ceiling}.`
		});
		// The role is asked first: a student asking for 2099 hears the role refusal.
		expect(await attempt(ana, RAISE, [A, 2099, randomUUID()])).toEqual({ ok: false, code: '42501', message: NOT_A_MENTOR });
		expect(await pinOf(A)).toBe(before);
	});

	test('a site admin who is not a member raises any project; a project that is not there says so', async () => {
		const p = (await api.one<{ r: string }>(admin, CREATE3, ['Admin Raise', null, randomUUID()])).r;
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.armory_members where project_id = $1 and email = $2', [p, admin2.email]);
		expect(rows[0].n).toBe(0);
		expect(await api.one(admin2, RAISE, [p, 2026, randomUUID()])).toEqual({ r: true });
		expect(await pinOf(p)).toBe(2026);
		expect(await attempt(admin2, RAISE, [p, 2025, randomUUID()])).toEqual({
			ok: false,
			code: '22023',
			message: 'The pinned release must increase from 2026.'
		});
		expect(await attempt(admin2, RAISE, [randomUUID(), 2026, randomUUID()])).toEqual({ ok: false, code: 'P0002', message: 'project not found' });
		// Positive control for the admin branch: the same call by a non-admin is the role refusal.
		expect(await attempt(outsider, RAISE, [p, 2027, randomUUID()])).toEqual({ ok: false, code: '42501', message: NOT_A_MENTOR });
	});

	test('a replayed raise answers the first time and moves nothing twice', async () => {
		const p = (await api.one<{ r: string }>(admin, CREATE3, ['Replay Raise', null, randomUUID()])).r;
		const op = randomUUID();
		expect(await api.one(admin, RAISE, [p, 2026, op])).toEqual({ r: true });
		expect(await api.one(admin, RAISE, [p, 2026, op])).toEqual({ r: true });
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.armory_change_feed where kind = 'pinned_release_raised' and entity_id = $1`,
			[p]
		);
		expect(rows[0].n).toBe(1);
	});
});
