// tests/db/armory-v033.test.ts
//
// MIGRATION 0236: the four website requests after Armory 0.3.3 (ledger 0377).
// The chain is every migration through 0235 (the database production holds
// before the apply), then projects, members, devices, files and checkouts
// written through the REAL 0231 to 0235 RPCs, a corpus of calls put to the
// DEPLOYED bodies, then 0236 on top and the same corpus again.
//
// What a wrong answer here would look like, and why each is silent:
//   - A STUDENT FORCES A CHECK IN, REMOVES A FILE OR MOVES SOMEONE ELSE'S. The
//     take-back predicate is new and shared; a predicate that admitted a
//     student would let them act through four RPCs, and the app would simply
//     show it working.
//   - THE THREE TAKE-BACK ANSWERS DISAGREE. The app shows Force check in when
//     armory_my_projects says can_take_back; a break_lock that disagreed is a
//     key whose only answer is a refusal, or a refusal the key never offers.
//   - A CAD LEAD HANDS OUT FORCE CHECK IN by making someone an instructor.
//   - AN EXISTING CALLER'S ANSWER MOVES. A refusal text, SQLSTATE or order
//     the app reads, changed by a file that only meant to add.
//   - A REMOVE OF AN EMPTY FILE REPLAYS AS A SECOND REMOVAL, or removes a
//     file that has a version or a checkout.

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { WITH_0233, canExecute, catalogFingerprint, overloads, pasteTrap } from './chain-0233';
import { armoryRpc, hash, makeAdmin, person } from './armory-v3-helpers';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const one = (prefix: string): string => {
	const f = readdirSync(MIGRATIONS_DIR).filter((x) => x.startsWith(prefix));
	if (f.length !== 1) throw new Error(`expected exactly one ${prefix} migration, found ${f.length}`);
	return f[0];
};
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL_0236 = readFileSync(join(MIGRATIONS_DIR, one('0236_')), 'utf8');

/** The refusal texts, written out: a test whose expected value comes from the function cannot fail. */
const NOT_A_LEAD = 'only a mentor or cad_lead may break a lock';
const NOT_A_REMOVER = 'only a mentor, CAD lead or instructor may remove a file with no first version';

const BREAK = 'select public.armory_break_lock($1, $2, $3) as r';
const BREAKS = 'select public.armory_break_locks($1::uuid[], $2, $3) as r';
const MOVE = 'select public.armory_move_file($1, $2, $3, $4, $5) as r';
const RENAME = 'select public.armory_rename_folder($1, $2, $3, $4, $5) as r';
const ADD = 'select public.armory_add_member($1, $2, $3::public.armory_member_role, $4) as r';
const REMOVE_MEMBER = 'select public.armory_remove_member($1, $2, $3) as r';
const MINE = 'select public.armory_my_projects() as r';
const REMOVE_EMPTY = 'select public.armory_remove_empty_file($1, $2) as r';
const CAN = 'select public.armory_can_take_back($1) as r';

type Outcome = { ok: true; r: unknown } | { ok: false; code: string; message: string; detail: unknown };

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;

let admin: SeededUser; // the owner, mentor of every project they create
let admin2: SeededUser; // a site admin in NO project
let mentor: SeededUser;
let lead: SeededUser;
let inst: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let outsider: SeededUser;

let A: string; // everyone
let B: string; // the owner and the two students
const dev: Record<string, string> = {};
const f: Record<string, string> = {};

let corpusBefore: Outcome[];
let mineBefore: Map<string, unknown>;

async function attempt(u: SeededUser, sql: string, params: unknown[]): Promise<Outcome> {
	try {
		const row = await api.one<{ r: unknown }>(u, sql, params);
		return { ok: true, r: row.r };
	} catch (e) {
		const err = e as { code: string; message: string; detail?: string };
		return { ok: false, code: err.code, message: err.message, detail: err.detail ? JSON.parse(err.detail) : null };
	}
}

/**
 * Calls an existing caller makes, each with a fresh operation id, whose
 * answer must not move. Every one either refuses (so writes nothing) or
 * answers without changing the files, so the corpus can run twice.
 */
function corpus(): Array<[SeededUser, string, () => unknown[]]> {
	return [
		// Force check in: students, an outsider, a lead outside the project, a file id that names nothing.
		[ben, BREAK, () => [f.held, dev.ben, randomUUID()]],
		[ana, BREAK, () => [f.held, null, randomUUID()]],
		[outsider, BREAK, () => [f.held, dev.outsider, randomUUID()]],
		[lead, BREAK, () => [f.inB, null, randomUUID()]],
		[lead, BREAK, () => [randomUUID(), null, randomUUID()]],
		[lead, BREAK, () => [f.free, null, randomUUID()]],
		[ben, BREAK, () => [f.held, dev.ana, randomUUID()]],
		[ben, BREAKS, () => [[f.held, f.free], dev.ben, randomUUID()]],
		// A student moving someone else's file, and a free one: false, as always.
		[ben, MOVE, () => [f.held, 'Moved', 'Held.SLDPRT', dev.ben, randomUUID()]],
		[ben, MOVE, () => [f.free, 'Moved', 'Free.SLDPRT', dev.ben, randomUUID()]],
		[outsider, MOVE, () => [f.held, 'Moved', 'x.SLDPRT', dev.outsider, randomUUID()]],
		// A student renaming a folder with someone else's checkout in it: 55006 with the names.
		[ben, RENAME, () => [A, 'Drive', 'Drive2', dev.ben, randomUUID()]],
		[outsider, RENAME, () => [A, 'Drive', 'Drive2', dev.outsider, randomUUID()]],
		// The member writes: every refusal a lead or a student could meet before.
		[lead, ADD, () => [A, 'new.lead@boscotech.net', 'cad_lead', randomUUID()]],
		[lead, ADD, () => [A, 'new.mentor@boscotech.net', 'mentor', randomUUID()]],
		[lead, ADD, () => [A, mentor.email, 'student', randomUUID()]],
		[lead, ADD, () => [A, ana.email, 'student', randomUUID()]],
		[ana, ADD, () => [A, 'friend@boscotech.net', 'student', randomUUID()]],
		[inst, ADD, () => [A, 'friend@boscotech.net', 'student', randomUUID()]],
		[mentor, ADD, () => [A, inst.email, 'instructor', randomUUID()]],
		[lead, REMOVE_MEMBER, () => [A, ana.email, randomUUID()]],
		[outsider, ADD, () => [A, 'friend@boscotech.net', 'student', randomUUID()]]
	];
}
async function runCorpus(): Promise<Outcome[]> {
	const out: Outcome[] = [];
	for (const [u, sql, args] of corpus()) out.push(await attempt(u, sql, args()));
	return out;
}
async function myProjects(): Promise<Map<string, unknown>> {
	const out = new Map<string, unknown>();
	for (const u of [admin, admin2, mentor, lead, inst, ana, ben, outsider]) out.set(u.email, (await attempt(u, MINE, [])) as Outcome);
	return out;
}
async function lockOf(file: string) {
	return (
		await db.sql<{ holder_email: string; holder_device_id: string; broken_at: string | null }>(
			'select holder_email, holder_device_id, broken_at from public.armory_locks where file_id = $1',
			[file]
		)
	).rows[0];
}
async function fileRow(file: string) {
	return (
		await db.sql<{ folder: string; name: string; deleted_at: string | null; current_version_id: string | null }>(
			'select folder, name, deleted_at, current_version_id from public.armory_files where id = $1',
			[file]
		)
	).rows[0];
}
async function changes(kind: string, entity: string) {
	return (
		await db.sql<{ payload: Record<string, unknown> }>(
			'select payload from public.armory_change_feed where kind = $1 and entity_id = $2 order by cursor',
			[kind, entity]
		)
	).rows.map((r) => r.payload);
}

beforeAll(async () => {
	db = await startTestDb([...WITH_0233, one('0234_'), one('0235_')]);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	admin2 = await person(db, 'tech@boscotech.edu', 'Tess Tech');
	await makeAdmin(db, admin2.email);
	mentor = await person(db, 'mentor@boscotech.edu', 'Mo Mentor');
	lead = await person(db, 'lead@boscotech.net', 'Lea Diaz');
	inst = await person(db, 'teach@boscotech.edu', 'Ivy Instructor');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben@boscotech.net', 'Ben Ortiz');
	outsider = await person(db, 'zed@boscotech.net', 'Zed Ziegler');

	A = await api.project(admin, 'Robot 2026');
	B = await api.project(admin, 'Practice Bot');
	await api.member(admin, A, mentor.email, 'mentor');
	await api.member(admin, A, lead.email, 'cad_lead');
	await api.member(admin, A, inst.email, 'instructor');
	for (const p of [A, B]) {
		await api.member(admin, p, ana.email, 'student');
		await api.member(admin, p, ben.email, 'student');
	}
	for (const [k, u, n] of [
		['mentor', mentor, 'Mentor PC'],
		['lead', lead, 'Lead PC'],
		['inst', inst, 'Teacher PC'],
		['ana', ana, 'IDEA-06'],
		['ben', ben, 'IDEA-06'],
		['outsider', outsider, 'Zed PC']
	] as Array<[string, SeededUser, string]>) {
		dev[k] = await api.device(u, n);
	}
	f.held = await api.createFile(ana, A, dev.ana, 'Drive', 'Gearbox.SLDPRT');
	expect(await api.lock(ana, f.held, dev.ana)).toBe(true);
	f.free = await api.createFile(ana, A, dev.ana, 'Drive', 'Plate.SLDPRT');
	f.inB = await api.createFile(ana, B, dev.ana, '', 'Practice.SLDPRT');
	expect(await api.lock(ana, f.inB, dev.ana)).toBe(true);

	// AGAINST THE DEPLOYED 0233 TO 0235 BODIES.
	corpusBefore = await runCorpus();
	mineBefore = await myProjects();
	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL_0236);
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('0236 as a file', () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL_0236);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile("insert into public.armory_locks (file_id) values ('x');").findings).toHaveLength(1);
		expect(pasteTrap(SQL_0236)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
	});

	test('the first object it creates is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL_0236);
		expect(first?.[1]).toBe('public.armory_can_take_back');
		const earlier = readdirSync(MIGRATIONS_DIR)
			.filter((x) => x < '0236')
			.map((x) => readFileSync(join(MIGRATIONS_DIR, x), 'utf8'));
		expect(earlier.some((t) => t.includes('armory_can_take_back'))).toBe(false);
		// Positive control: the same scan finds a name an earlier file does carry.
		expect(earlier.some((t) => t.includes('armory_break_lock'))).toBe(true);
	});

	test('a second paste changes no catalog object, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL_0236);
		expect(await catalogFingerprint(db)).toEqual(after);
	});
});

describe('the grants, the overloads and RLS, read off the catalog', () => {
	test('one overload each; authenticated may call the two new functions and anon may not', async () => {
		for (const name of [
			'armory_can_take_back',
			'armory_remove_empty_file',
			'armory_my_projects',
			'armory_break_lock',
			'armory_break_locks',
			'armory_add_member',
			'armory_move_file',
			'armory_rename_folder'
		]) {
			expect(await overloads(db, name)).toBe(1);
		}
		for (const sig of ['armory_can_take_back(uuid)', 'armory_remove_empty_file(uuid, uuid)', 'armory_break_lock(uuid, uuid, uuid)']) {
			expect(await canExecute(db, 'authenticated', sig)).toBe(true);
			expect(await canExecute(db, 'anon', sig)).toBe(false);
		}
		// Positive control: the same probe answers true for a function anon does hold.
		const { rows } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') limit 1`
		);
		expect(rows).toHaveLength(1);
	});

	test('RLS stays on every Armory table, and the incidents table grants nothing new', async () => {
		const { rows } = await db.sql<{ relname: string; rls: boolean }>(
			`select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'armory\\_%'`
		);
		expect(rows.length).toBeGreaterThanOrEqual(15);
		expect(rows.filter((r) => !r.rls)).toEqual([]);
		const grants = await db.sql<{ grantee: string; privilege_type: string }>(
			`select grantee, privilege_type from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'armory_app_incidents' and grantee in ('anon', 'authenticated', 'public')
			 order by grantee, privilege_type`
		);
		expect(grants.rows).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }]);
	});
});

// ===========================================================================
describe('existing callers', () => {
	test('the corpus answers exactly as it did against the deployed bodies', async () => {
		const after = await runCorpus();
		expect(after).toHaveLength(corpusBefore.length);
		// Positive controls: the corpus really holds refusals and answers, not a blank.
		expect(corpusBefore.filter((o) => !o.ok).length).toBeGreaterThanOrEqual(12);
		expect(corpusBefore.filter((o) => o.ok).length).toBeGreaterThanOrEqual(5);
		after.forEach((o, i) => expect([i, o]).toEqual([i, corpusBefore[i]]));
	});

	test('armory_my_projects answers as before for everyone but an instructor, whose can_take_back is now true', async () => {
		const after = await myProjects();
		for (const [email, before] of mineBefore) {
			if (email === inst.email) continue;
			expect([email, after.get(email)]).toEqual([email, before]);
		}
		const was = (mineBefore.get(inst.email) as { r: Array<Record<string, unknown>> }).r;
		const now = (after.get(inst.email) as { r: Array<Record<string, unknown>> }).r;
		expect(was.map((p) => p.can_take_back)).toEqual([false]);
		expect(now.map((p) => p.can_take_back)).toEqual([true]);
		expect(now.map(({ can_take_back: _, ...rest }) => rest)).toEqual(was.map(({ can_take_back: _, ...rest }) => rest));
	});
});

// ===========================================================================
describe('item 1: the one take-back predicate', () => {
	test('it admits a mentor, a CAD lead, an instructor and a site admin, and nobody else', async () => {
		const answers: Record<string, boolean> = {};
		for (const u of [admin, admin2, mentor, lead, inst, ana, ben, outsider]) {
			answers[u.email] = (await api.one<{ r: boolean }>(u, CAN, [A])).r;
		}
		expect(answers).toEqual({
			[admin.email]: true,
			[admin2.email]: true,
			[mentor.email]: true,
			[lead.email]: true,
			[inst.email]: true,
			[ana.email]: false,
			[ben.email]: false,
			[outsider.email]: false
		});
		// Per project: the lead and the instructor are not in B.
		expect((await api.one<{ r: boolean }>(lead, CAN, [B])).r).toBe(false);
		expect((await api.one<{ r: boolean }>(inst, CAN, [B])).r).toBe(false);
		expect((await api.one<{ r: boolean }>(ana, CAN, [randomUUID()])).r).toBe(false);
	});

	test('my_projects, break_lock and break_locks agree with it for every member', async () => {
		for (const u of [mentor, lead, inst, ana, ben]) {
			const can = (await api.one<{ r: boolean }>(u, CAN, [A])).r;
			const listed = ((await api.one<{ r: Array<{ id: string; can_take_back: boolean }> }>(u, MINE, [])).r).find((p) => p.id === A)!;
			expect([u.email, listed.can_take_back]).toEqual([u.email, can]);
			const file = await api.createFile(ana, A, dev.ana, 'Agree', `agree-${u.email}.SLDPRT`);
			expect(await api.lock(ana, file, dev.ana)).toBe(true);
			const single = await attempt(u, BREAK, [file, null, randomUUID()]);
			expect([u.email, single.ok]).toEqual([u.email, can]);
			if (!single.ok) expect([single.code, single.message]).toEqual(['P0001', NOT_A_LEAD]);
			const batch = (await api.one<{ r: { succeeded: number; refused: number } }>(u, BREAKS, [[file], null, randomUUID()])).r;
			// The single call already checked a lead's in, so their batch finds nothing held and still succeeds.
			expect([u.email, batch.succeeded]).toEqual([u.email, can ? 1 : 0]);
		}
	});

	test('an instructor forces a check in from the website, and the change row is the usual one', async () => {
		const file = await api.createFile(ben, A, dev.ben, 'Inst', 'Arm.SLDPRT');
		expect(await api.lock(ben, file, dev.ben)).toBe(true);
		expect((await api.one<{ r: boolean }>(inst, BREAK, [file, null, randomUUID()])).r).toBe(true);
		expect((await lockOf(file)).broken_at).not.toBeNull();
		expect(await changes('lock_broken', file)).toEqual([{ by: inst.email, former_holder: ben.email, former_device_id: dev.ben }]);
		// Named on their own computer it works too; on someone else's it does not.
		const file2 = await api.createFile(ben, A, dev.ben, 'Inst', 'Arm2.SLDPRT');
		expect(await api.lock(ben, file2, dev.ben)).toBe(true);
		const bad = await attempt(inst, BREAK, [file2, dev.ben, randomUUID()]);
		expect(bad).toMatchObject({ ok: false, code: 'P0001', message: 'device is not registered to caller' });
		expect((await api.one<{ r: boolean }>(inst, BREAK, [file2, dev.inst, randomUUID()])).r).toBe(true);
	});

	test('a student is still refused, by every one of the three', async () => {
		const file = await api.createFile(ana, A, dev.ana, 'Student', 'Keep.SLDPRT');
		expect(await api.lock(ana, file, dev.ana)).toBe(true);
		expect(await attempt(ben, BREAK, [file, dev.ben, randomUUID()])).toMatchObject({ ok: false, code: 'P0001', message: NOT_A_LEAD });
		const r = (await api.one<{ r: { refused: number; results: Array<{ message: string }> } }>(ben, BREAKS, [[file], null, randomUUID()])).r;
		expect([r.refused, r.results[0].message]).toEqual([1, NOT_A_LEAD]);
		expect(((await api.one<{ r: Array<{ id: string; can_take_back: boolean }> }>(ben, MINE, [])).r).every((p) => !p.can_take_back)).toBe(true);
		expect((await lockOf(file)).broken_at).toBeNull();
	});
});

describe('item 1: only a mentor makes or changes an instructor', () => {
	test('a CAD lead may no longer grant instructor, nor change one; a mentor and a site admin may', async () => {
		const e1 = await attempt(lead, ADD, [A, 'new.teacher@boscotech.edu', 'instructor', randomUUID()]);
		expect(e1).toMatchObject({ ok: false, code: '42501', message: 'only a mentor may grant instructor' });
		const e2 = await attempt(lead, ADD, [A, inst.email, 'student', randomUUID()]);
		expect(e2).toMatchObject({ ok: false, code: '42501', message: 'only a mentor may change an instructor' });
		// A student stays a student: the lead's ordinary add is untouched.
		expect(await attempt(lead, ADD, [A, 'cara@boscotech.net', 'student', randomUUID()])).toEqual({ ok: true, r: true });
		// And promoting that student to instructor is the grant, refused.
		expect(await attempt(lead, ADD, [A, 'cara@boscotech.net', 'instructor', randomUUID()])).toMatchObject({
			ok: false,
			message: 'only a mentor may grant instructor'
		});
		expect(await attempt(mentor, ADD, [A, 'new.teacher@boscotech.edu', 'instructor', randomUUID()])).toEqual({ ok: true, r: true });
		expect(await attempt(admin2, ADD, [B, 'new.teacher@boscotech.edu', 'instructor', randomUUID()])).toEqual({ ok: true, r: true });
		const roles = await db.sql<{ project_id: string; role: string }>(
			`select project_id, role::text from public.armory_members where email = 'new.teacher@boscotech.edu' order by project_id = $1 desc`,
			[A]
		);
		expect(roles.rows.map((r) => r.role)).toEqual(['instructor', 'instructor']);
		expect((await db.sql(`select 1 from public.armory_members where email = 'cara@boscotech.net' and role = 'student'`)).rows).toHaveLength(1);
	});
});

// ===========================================================================
describe('item 2: armory_remove_empty_file', () => {
	test('a CAD lead removes a file with no first version: one tombstone, one change row, the name free again', async () => {
		const file = await api.createFile(ana, A, dev.ana, 'Empty', 'Orphan.SLDPRT');
		const r = await api.one<{ r: boolean }>(lead, REMOVE_EMPTY, [file, randomUUID()]);
		expect(r.r).toBe(true);
		expect((await fileRow(file)).deleted_at).not.toBeNull();
		const t = await db.sql<{ version_id: string | null; author_email: string }>(
			'select version_id, author_email from public.armory_tombstones where file_id = $1',
			[file]
		);
		expect(t.rows).toEqual([{ version_id: null, author_email: lead.email }]);
		expect(await changes('tombstone', file)).toEqual([{ device_id: null, by: lead.email, reason: 'no_first_version' }]);
		// The name is free: an add of the same name elsewhere lands (it revives the record, as for any removed file).
		const again = await api.createFile(ben, A, dev.ben, 'Elsewhere', 'Orphan.SLDPRT');
		expect(again).toBe(file);
		expect(await fileRow(file)).toMatchObject({ folder: 'Elsewhere', deleted_at: null });
	});

	test('a mentor, an instructor and a site admin in no project may; a student and an outsider may not', async () => {
		for (const u of [mentor, inst, admin2]) {
			const file = await api.createFile(ben, A, dev.ben, 'Empty', `ok-${u.email}.SLDPRT`);
			expect([u.email, (await api.one<{ r: boolean }>(u, REMOVE_EMPTY, [file, randomUUID()])).r]).toEqual([u.email, true]);
		}
		const file = await api.createFile(ben, A, dev.ben, 'Empty', 'student-try.SLDPRT');
		for (const u of [ben, ana, outsider]) {
			expect(await attempt(u, REMOVE_EMPTY, [file, randomUUID()])).toEqual({ ok: false, code: '42501', message: NOT_A_REMOVER, detail: null });
		}
		// A lead of ANOTHER project is refused here too.
		const inB = await api.createFile(ana, B, dev.ana, '', 'b-empty.SLDPRT');
		expect(await attempt(lead, REMOVE_EMPTY, [inB, randomUUID()])).toMatchObject({ ok: false, code: '42501' });
		expect((await fileRow(file)).deleted_at).toBeNull();
		expect((await fileRow(inB)).deleted_at).toBeNull();
		expect(await changes('tombstone', file)).toEqual([]);
	});

	test('refused for a file that has a version, and for a file somebody holds, whoever holds it', async () => {
		const versioned = await api.createFile(ana, A, dev.ana, 'Empty', 'Saved.SLDPRT');
		expect(await api.lock(ana, versioned, dev.ana)).toBe(true);
		expect((await api.commit(ana, versioned, null, hash('a'), dev.ana)).advanced).toBe(true);
		expect(await api.release(ana, versioned, dev.ana)).toBe(true);
		expect(await attempt(lead, REMOVE_EMPTY, [versioned, randomUUID()])).toMatchObject({
			ok: false,
			code: '55000',
			detail: { reason: 'has_version' }
		});

		const held = await api.createFile(ana, A, dev.ana, 'Empty', 'Adding.SLDPRT');
		expect(await api.lock(ana, held, dev.ana)).toBe(true);
		expect(await attempt(lead, REMOVE_EMPTY, [held, randomUUID()])).toMatchObject({
			ok: false,
			code: '55006',
			detail: { reason: 'checked_out', names: ['Adding.SLDPRT'], total: 1 }
		});
		// The lead's OWN checkout counts as a live lock too.
		const own = await api.createFile(lead, A, dev.lead, 'Empty', 'LeadAdding.SLDPRT');
		expect(await api.lock(lead, own, dev.lead)).toBe(true);
		expect(await attempt(lead, REMOVE_EMPTY, [own, randomUUID()])).toMatchObject({ ok: false, code: '55006' });
		for (const x of [versioned, held, own]) expect((await fileRow(x)).deleted_at).toBeNull();

		// Positive control: once the check out is forced in, the same file is removed.
		expect((await api.one<{ r: boolean }>(lead, BREAK, [held, null, randomUUID()])).r).toBe(true);
		expect((await api.one<{ r: boolean }>(lead, REMOVE_EMPTY, [held, randomUUID()])).r).toBe(true);
	});

	test('it replays by operation id, answers false for a file already removed, and refuses a reused id', async () => {
		const file = await api.createFile(ana, A, dev.ana, 'Empty', 'Replay.SLDPRT');
		const op = randomUUID();
		expect((await api.one<{ r: boolean }>(lead, REMOVE_EMPTY, [file, op])).r).toBe(true);
		// Brought back by an add of the same name, then the SAME operation again: the first answer, and nothing removed.
		expect(await api.createFile(ana, A, dev.ana, 'Empty', 'Replay.SLDPRT')).toBe(file);
		expect((await api.one<{ r: boolean }>(lead, REMOVE_EMPTY, [file, op])).r).toBe(true);
		expect((await fileRow(file)).deleted_at).toBeNull();
		expect(await changes('tombstone', file)).toHaveLength(1);
		// A fresh operation removes it; another fresh one finds it removed and answers false.
		expect((await api.one<{ r: boolean }>(lead, REMOVE_EMPTY, [file, randomUUID()])).r).toBe(true);
		expect((await api.one<{ r: boolean }>(lead, REMOVE_EMPTY, [file, randomUUID()])).r).toBe(false);
		expect(await changes('tombstone', file)).toHaveLength(2);
		// Reused by another caller or for another RPC.
		expect(await attempt(mentor, REMOVE_EMPTY, [file, op])).toMatchObject({ message: 'operation id was already used by another caller or RPC' });
		const other = randomUUID();
		await api.one(lead, BREAK, [file, null, other]);
		expect(await attempt(lead, REMOVE_EMPTY, [file, other])).toMatchObject({ message: 'operation id was already used by another caller or RPC' });
		expect(await attempt(lead, REMOVE_EMPTY, [file, null])).toMatchObject({ message: 'operation id is required' });
	});

	test('a file id that names nothing: 42501 for a lead, P0002 for a site admin', async () => {
		expect(await attempt(lead, REMOVE_EMPTY, [randomUUID(), randomUUID()])).toMatchObject({ ok: false, code: '42501', message: NOT_A_REMOVER });
		expect(await attempt(admin2, REMOVE_EMPTY, [randomUUID(), randomUUID()])).toMatchObject({ ok: false, code: 'P0002', message: 'file not found' });
	});

	test('with no session the role cannot call it at all', async () => {
		await expect(db.sql(`set role anon; select public.armory_remove_empty_file(gen_random_uuid(), gen_random_uuid())`)).rejects.toThrow(
			/permission denied/
		);
		await db.sql('reset role');
	});
});

// ===========================================================================
describe('item 3: a lead organizes files someone else has checked out', () => {
	test('a CAD lead and an instructor move a file Ana holds; the lock stays hers and her check in still lands', async () => {
		const file = await api.createFile(ana, A, dev.ana, 'Org', 'Shaft.SLDPRT');
		expect(await api.lock(ana, file, dev.ana)).toBe(true);
		expect((await api.one<{ r: boolean }>(lead, MOVE, [file, 'Org/Moved', 'Shaft.SLDPRT', dev.lead, randomUUID()])).r).toBe(true);
		expect(await fileRow(file)).toMatchObject({ folder: 'Org/Moved', name: 'Shaft.SLDPRT' });
		expect(await lockOf(file)).toEqual({ holder_email: ana.email, holder_device_id: dev.ana, broken_at: null });
		expect(await changes('file_moved', file)).toEqual([
			{
				old_folder: 'Org',
				old_name: 'Shaft.SLDPRT',
				folder: 'Org/Moved',
				name: 'Shaft.SLDPRT',
				device_id: dev.lead,
				by: lead.email,
				checked_out_by: ana.email
			}
		]);
		expect((await api.one<{ r: boolean }>(inst, MOVE, [file, 'Org/Again', 'Shaft2.SLDPRT', dev.inst, randomUUID()])).r).toBe(true);
		// Ana's save lands on the moved file, by its id.
		expect((await api.commit(ana, file, null, hash('b'), dev.ana)).advanced).toBe(true);
		expect(await api.release(ana, file, dev.ana)).toBe(true);
	});

	test("a holder's own move writes the usual row with no added key", async () => {
		const file = await api.createFile(ana, A, dev.ana, 'Org', 'Own.SLDPRT');
		expect(await api.lock(ana, file, dev.ana)).toBe(true);
		expect((await api.one<{ r: boolean }>(ana, MOVE, [file, 'Org', 'Own2.SLDPRT', dev.ana, randomUUID()])).r).toBe(true);
		expect(Object.keys((await changes('file_moved', file))[0]).sort()).toEqual(['by', 'device_id', 'folder', 'name', 'old_folder', 'old_name']);
	});

	test('a student still cannot move it, and a lead still cannot move a file nobody has checked out', async () => {
		const file = await api.createFile(ana, A, dev.ana, 'Org', 'Bracket.SLDPRT');
		expect(await api.lock(ana, file, dev.ana)).toBe(true);
		expect((await api.one<{ r: boolean }>(ben, MOVE, [file, 'Ben', 'Bracket.SLDPRT', dev.ben, randomUUID()])).r).toBe(false);
		expect((await fileRow(file)).folder).toBe('Org');
		const free = await api.createFile(ana, A, dev.ana, 'Org', 'Spacer.SLDPRT');
		expect((await api.one<{ r: boolean }>(lead, MOVE, [free, 'Lead', 'Spacer.SLDPRT', dev.lead, randomUUID()])).r).toBe(false);
		expect((await fileRow(free)).folder).toBe('Org');
		expect(await changes('file_moved', file)).toEqual([]);
	});

	test('a lead renames a folder with other people\'s checkouts in it; a student is still refused 55006', async () => {
		const a1 = await api.createFile(ana, A, dev.ana, 'Arm', 'Arm1.SLDPRT');
		const b1 = await api.createFile(ben, A, dev.ben, 'Arm/Wrist', 'Wrist1.SLDPRT');
		await api.createFile(ana, A, dev.ana, 'Arm', 'Elbow.SLDPRT');
		expect(await api.lock(ana, a1, dev.ana)).toBe(true);
		expect(await api.lock(ben, b1, dev.ben)).toBe(true);

		const refused = await attempt(ben, RENAME, [A, 'Arm', 'Arm v2', dev.ben, randomUUID()]);
		expect(refused).toMatchObject({ ok: false, code: '55006', detail: { reason: 'checked_out', names: ['Arm1.SLDPRT'], total: 1 } });

		expect((await api.one<{ r: number }>(lead, RENAME, [A, 'Arm', 'Arm v2', dev.lead, randomUUID()])).r).toBe(3);
		expect((await fileRow(a1)).folder).toBe('Arm v2');
		expect((await fileRow(b1)).folder).toBe('Arm v2/Wrist');
		expect(await lockOf(a1)).toMatchObject({ holder_email: ana.email, broken_at: null });
		expect(await lockOf(b1)).toMatchObject({ holder_email: ben.email, broken_at: null });
		const row = (await changes('folder_renamed', A)).at(-1);
		expect(row).toEqual({ from: 'Arm', to: 'Arm v2', files: 3, device_id: dev.lead, by: lead.email, over_checkouts: 2 });

		// A rename with nothing checked out by anyone else carries no added key, for a lead too.
		await api.createFile(ana, A, dev.ana, 'Quiet', 'Q.SLDPRT');
		expect((await api.one<{ r: number }>(lead, RENAME, [A, 'Quiet', 'Quiet2', dev.lead, randomUUID()])).r).toBe(1);
		expect(Object.keys((await changes('folder_renamed', A)).at(-1)!).sort()).toEqual(['by', 'device_id', 'files', 'from', 'to']);
	});
});

// ===========================================================================
describe("item 4: the incident's machine id", () => {
	async function incident(u: SeededUser, report: unknown): Promise<string> {
		return (
			await api.one<{ id: string }>(
				u,
				`select public.armory_submit_app_incident('slowPass', 'A pass took long.', '0.3.3', 'IDEA-06', null, $1::jsonb, null) as id`,
				[JSON.stringify(report)]
			)
		).id;
	}

	test('it is read from the report, kept only when it is a short word, and only an admin reads it', async () => {
		const good = await incident(ana, { machineId: '3f9c0a7e2b14d865', deviceName: 'IDEA-06' });
		const none = await incident(ana, { deviceName: 'IDEA-06' });
		const odd = await incident(ben, { machineId: 'not a word; drop table' });
		const num = await incident(ben, { machineId: 12345 });
		const read = await api.rows<{ id: string; machine_id: string | null }>(
			admin2,
			'select id, machine_id from public.armory_app_incidents where id = any($1::uuid[])',
			[[good, none, odd, num]]
		);
		const by = Object.fromEntries(read.map((r) => [r.id, r.machine_id]));
		expect(by).toEqual({ [good]: '3f9c0a7e2b14d865', [none]: null, [odd]: null, [num]: null });
		// A student reads no incident row, their own included (RLS), as before.
		expect(await api.rows(ana, 'select machine_id from public.armory_app_incidents', [])).toEqual([]);
		// The admin list answers exactly the keys it did; the column does not ride on it.
		const list = (await api.one<{ r: Array<Record<string, unknown>> }>(admin2, 'select public.armory_app_incidents_admin_list(10) as r', [])).r;
		expect(list.length).toBeGreaterThanOrEqual(4);
		expect(Object.keys(list[0])).not.toContain('machine_id');
	});
});
