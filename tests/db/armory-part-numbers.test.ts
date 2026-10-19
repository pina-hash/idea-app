// tests/db/armory-part-numbers.test.ts
//
// MIGRATION 0274: IDEA Armory's part number registry and COTS library
// (ledger 0405, decision 41, scheme A). The chain is every migration before
// 0274 read off disk behind the fixture completion (the database production
// holds before the apply); projects, members, files and one old-style 0231
// allocation are written through the REAL 0231 to 0273 RPCs; then 0274 goes on
// top.
//
// What a wrong answer here would look like, and why each is silent:
//   - A NUMBER HANDED OUT TWICE. Two students' parts carry one number and
//     nothing on screen says so until a drawing is printed.
//   - A NUMBER REUSED AFTER A DELETE OR A PURGE, which is the same thing a
//     season later.
//   - A STUDENT EDITS THE COTS LIBRARY, or somebody outside a project reads or
//     takes its numbers.
//   - A REVISION GOES BACKWARDS, or "made from" names a part nobody can find.

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { canExecute, catalogFingerprint, overloads, pasteTrap } from './chain-0230';
import { armoryRpc, makeAdmin, person, waitForLockWait, type Refusal } from './armory-v3-helpers';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';
const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();
const MINE = ALL.filter((f) => /^\d{4}_armory_part_numbers\.sql$/.test(f));
if (MINE.length !== 1) throw new Error(`expected exactly one *_armory_part_numbers migration, found ${MINE.length}`);
const FILE = MINE[0];
const PRE = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < FILE)];
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL = readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8');

const TAKE = 'select public.armory_part_number_take($1, $2, $3, $4, $5, $6, $7) as r';
const DESCRIBE = 'select public.armory_part_number_describe($1, $2, $3, $4, $5, $6, $7) as r';

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;

let admin: SeededUser; // owner, mentor of every project they create
let admin2: SeededUser; // a site admin in NO project
let mentor: SeededUser;
let lead: SeededUser;
let ana: SeededUser; // student
let ben: SeededUser; // student
let outsider: SeededUser;

let A: string; // Robot, season 2026
let B: string; // a second robot, same prefix and season
let C: string; // a class project
let gearbox: string; // a file in A
let devAna: string;

interface Num {
	id: string;
	part_number: string;
	kind: string;
	assembly: number;
	part: number;
	revision: string;
	made_from: string | null;
	file_id: string | null;
	file_name: string | null;
	assigned_name: string | null;
	assigned_by?: string | null;
}

const take = async (u: SeededUser, p: string, ss: string, asm: number | null, file: string | null = null, desc = '', op = randomUUID()) =>
	(await api.one<{ r: Num }>(u, TAKE, [p, ss, asm, file, null, desc, op])).r;
const takeFails = (u: SeededUser, p: string, ss: string, asm: number | null, file: string | null = null) =>
	api.fails(u, TAKE, [p, ss, asm, file, null, '', randomUUID()]);
const reason = (r: Refusal): string | undefined => (r.detail ? (JSON.parse(r.detail) as { reason?: string }).reason : undefined);

beforeAll(async () => {
	db = await startTestDb(PRE);
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	admin2 = await person(db, 'tech@boscotech.edu', 'Tess Tech');
	await makeAdmin(db, admin2.email);
	mentor = await person(db, 'mentor@boscotech.edu', 'Mo Mentor');
	lead = await person(db, 'lead@boscotech.net', 'Lea Diaz');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben.ortiz@boscotech.net', 'Ben Ortiz');
	outsider = await person(db, 'zed@boscotech.net', 'Zed Ziegler');

	// THROUGH THE DEPLOYED RPCs, before 0274.
	A = await api.project(admin, 'Robot 2026');
	B = await api.project(admin, 'Robot 2026 B');
	C = await api.project(admin, 'IDEA100 Blade');
	for (const p of [A, B]) {
		await api.member(admin, p, mentor.email, 'mentor');
		await api.member(admin, p, lead.email, 'cad_lead');
		await api.member(admin, p, ana.email, 'student');
	}
	await api.member(admin, C, ben.email, 'student');
	devAna = await api.device(ana, 'IDEA-06');
	gearbox = await api.createFile(ana, A, devAna, 'Drive', 'Gearbox.SLDASM');
	// An old-style allocation through 0231/0232's allocator, which 0274 leaves alone.
	const old = await api.one<{ part_number: string }>(ana, 'select * from public.armory_allocate_part_number($1, 3, null, $2)', [A, randomUUID()]);
	expect(old.part_number).toBe('5669-26-0300');

	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the file', () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile("insert into public.armory_cots_parts (vendor) values ('x');").findings).toHaveLength(1);
		expect(pasteTrap(SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
	});

	test('the first object it creates is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL);
		expect(first?.[1]).toBe('public.armory_part_number_problem');
		const earlier = ALL.filter((x) => x < FILE).map((x) => readFileSync(join(MIGRATIONS_DIR, x), 'utf8'));
		expect(earlier.some((t) => t.includes('armory_part_number_problem'))).toBe(false);
		expect(earlier.some((t) => t.includes('armory_allocate_part_number'))).toBe(true);
	});

	test('a second paste changes no catalog object, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toEqual(after);
		// The seed did not double.
		expect((await db.sql('select count(*)::int as n from public.armory_part_subsystems')).rows[0].n).toBe(9);
	});
});

describe('what was there before', () => {
	test('every existing project starts on prefix 5669; the old allocator still answers', async () => {
		const { rows } = await db.sql<{ p: string }>('select distinct part_prefix as p from public.armory_projects');
		expect(rows).toEqual([{ p: '5669' }]);
		const again = await api.one<{ part_number: string }>(ana, 'select * from public.armory_allocate_part_number($1, 3, null, $2)', [A, randomUUID()]);
		expect(again.part_number).toBe('5669-26-0301');
		expect(await overloads(db, 'armory_allocate_part_number')).toBe(1);
	});

	test('the nine subsystem codes, in the decision order', async () => {
		const { rows } = await db.sql<{ code: string }>('select code from public.armory_part_subsystems order by sort_order');
		expect(rows.map((r) => r.code)).toEqual(['DT', 'SH', 'IN', 'EL', 'AR', 'CL', 'FR', 'EE', 'MS']);
	});
});

describe('taking a number', () => {
	let dt1: Num;
	test('an assembly first, then its parts, in order', async () => {
		dt1 = await take(ana, A, 'dt', null, gearbox, 'Drive gearbox');
		expect(dt1.part_number).toBe('5669-26-DT-0100');
		expect(dt1.kind).toBe('assembly');
		expect(dt1.file_name).toBe('Gearbox.SLDASM');
		expect(dt1.assigned_name).toBe('Ana Reyes');
		expect(dt1).not.toHaveProperty('assigned_by');
		expect((await take(ana, A, 'DT', 1)).part_number).toBe('5669-26-DT-0101');
		expect((await take(lead, A, 'DT', 1)).part_number).toBe('5669-26-DT-0102');
		expect((await take(mentor, A, 'DT', null)).part_number).toBe('5669-26-DT-0200');
		expect((await take(ana, A, 'SH', null)).part_number).toBe('5669-26-SH-0100');
	});

	test('the same operation id answers the same number and writes one row', async () => {
		const op = randomUUID();
		const a = await take(ana, A, 'DT', 2, null, '', op);
		const b = await take(ana, A, 'DT', 2, null, '', op);
		expect(b.part_number).toBe(a.part_number);
		const { rows } = await db.sql('select count(*)::int as n from public.armory_part_numbers where part_number = $1', [a.part_number]);
		expect(rows[0].n).toBe(1);
	});

	test('two callers at once get two different numbers', async () => {
		// One holds the subsystem's lock inside an open transaction; the other waits on it.
		const holder = db.asUser(ana.id, async (q) => {
			await q('begin');
			const r = (await q(TAKE, [A, 'IN', null, null, null, '', randomUUID()])).rows[0].r as Num;
			await new Promise((res) => setTimeout(res, 50));
			const waiting = db.asUser(lead.id, async (q2) => (await q2(TAKE, [A, 'IN', null, null, null, '', randomUUID()])).rows[0].r as Num);
			await waitForLockWait(db, 1);
			await q('commit');
			return [r, await waiting];
		});
		const [first, second] = await holder;
		expect(first.part_number).toBe('5669-26-IN-0100');
		expect(second.part_number).toBe('5669-26-IN-0200');
		// And twelve at once, with no lock held by hand.
		const many = await Promise.all(
			Array.from({ length: 12 }, (_, i) => take(i % 2 ? ana : lead, A, 'EL', null))
		);
		const numbers = many.map((n) => n.part_number).sort();
		expect(new Set(numbers).size).toBe(12);
		expect(numbers[0]).toBe('5669-26-EL-0100');
		expect(numbers[11]).toBe('5669-26-EL-1200');
	});

	test('a second project with the same prefix and season continues the same numbers', async () => {
		expect((await take(ana, B, 'DT', null)).part_number).toBe('5669-26-DT-0300');
		// It cannot hang a part off A's assembly 1.
		const r = await takeFails(ana, B, 'DT', 1);
		expect(r.code).toBe('22023');
		expect(reason(r)).toBe('no_assembly');
		expect(r.message).toBe("Assembly 01 has no number yet in subsystem DT on this project. Take the assembly's number first.");
	});

	test('who may take one: any member and a site admin; nobody else, answered like a project that does not exist', async () => {
		expect((await take(admin2, A, 'MS', null)).assigned_name).toBe('Tess Tech');
		const out = await takeFails(outsider, A, 'DT', null);
		const ghost = await takeFails(outsider, randomUUID(), 'DT', null);
		expect([out.code, out.message, reason(out)]).toEqual(['42501', 'not a project member', 'not_member']);
		expect([ghost.code, ghost.message, reason(ghost)]).toEqual([out.code, out.message, reason(out)]);
		const ben1 = await takeFails(ben, A, 'DT', null);
		expect(ben1.code).toBe('42501');
		// The control: Ben takes one on his own project.
		expect((await take(ben, C, 'MS', null)).part_number).toBe('5669-26-MS-0200');
	});

	test('every refusal is a sentence with a reason', async () => {
		const unknown = await takeFails(ana, A, 'ZZ', null);
		expect(unknown.message).toBe('There is no subsystem code ZZ. The codes are DT, SH, IN, EL, AR, CL, FR, EE, MS.');
		expect(reason(unknown)).toBe('unknown_subsystem');
		expect(reason(await takeFails(ana, A, 'DT', 0))).toBe('bad_assembly');
		expect(reason(await takeFails(ana, A, 'DT', 100))).toBe('bad_assembly');
		const numbered = await takeFails(ana, A, 'DT', null, gearbox);
		expect([numbered.code, numbered.message, reason(numbered)]).toEqual(['23505', 'Gearbox.SLDASM already has the number 5669-26-DT-0100.', 'file_numbered']);
		const elsewhere = await takeFails(ana, B, 'DT', null, gearbox);
		expect(reason(elsewhere)).toBe('file_not_in_project');
	});

	test('an archived project takes no new numbers', async () => {
		await api.one(admin, 'select public.armory_set_project_archived($1, true, $2)', [C, randomUUID()]);
		const r = await takeFails(ben, C, 'MS', null);
		expect([r.code, reason(r)]).toEqual(['55000', 'archived']);
		await api.one(admin, 'select public.armory_set_project_archived($1, false, $2)', [C, randomUUID()]);
	});
});

describe('the prefix and the subsystem list', () => {
	test("a mentor sets a class project's prefix; a student cannot; new numbers use it", async () => {
		const r = await api.fails(ben, 'select public.armory_set_part_prefix($1, $2, $3)', [C, 'IDEA100', randomUUID()]);
		expect(r.code).toBe('42501');
		const bad = await api.fails(admin, 'select public.armory_set_part_prefix($1, $2, $3)', [C, 'IDEA 100', randomUUID()]);
		expect(reason(bad)).toBe('bad_prefix');
		expect((await api.one<{ r: boolean }>(admin, 'select public.armory_set_part_prefix($1, $2, $3) as r', [C, 'idea100', randomUUID()])).r).toBe(true);
		expect((await take(ben, C, 'FR', null)).part_number).toBe('IDEA100-26-FR-0100');
	});

	test('a mentor of any project adds a code; a CAD lead and a student cannot; a retired code takes no numbers', async () => {
		for (const u of [lead, ana]) {
			const r = await api.fails(u, 'select public.armory_part_subsystem_save($1, $2, $3)', ['PN', 'Pneumatics', randomUUID()]);
			expect([r.code, reason(r)]).toEqual(['42501', 'not_curator']);
		}
		expect((await api.one<{ r: boolean }>(mentor, 'select public.armory_part_subsystem_save($1, $2, $3) as r', ['pn', 'Pneumatics', randomUUID()])).r).toBe(true);
		expect((await take(ana, A, 'PN', null)).part_number).toBe('5669-26-PN-0100');
		await api.one(mentor, 'select public.armory_part_subsystem_retire($1, true, $2)', ['PN', randomUUID()]);
		const r = await takeFails(ana, A, 'PN', null);
		expect(r.message).toBe('The subsystem PN (Pneumatics) is retired. Pick another, or ask a mentor to bring it back.');
		await api.one(mentor, 'select public.armory_part_subsystem_retire($1, false, $2)', ['PN', randomUUID()]);
		expect((await take(ana, A, 'PN', null)).part_number).toBe('5669-26-PN-0200');
	});
});

describe('the COTS library', () => {
	let hex: string;
	test('a mentor and a site admin add; a CAD lead, a student and an outsider cannot', async () => {
		for (const u of [lead, ana, outsider]) {
			const r = await api.fails(u, 'select public.armory_cots_add($1, $2, $3, $4, $5, $6)', ['WCP', '0388', 'Hex Bearing', null, null, randomUUID()]);
			expect([r.code, reason(r)]).toEqual(['42501', 'not_curator']);
		}
		hex = (await api.one<{ r: string }>(mentor, 'select public.armory_cots_add($1, $2, $3, $4, $5, $6) as r', ['wcp', '0388', 'Hex Bearing', 'https://wcproducts.com/', null, randomUUID()])).r;
		await api.one(admin2, 'select public.armory_cots_add($1, $2, $3, $4, $5, $6)', ['HW', 'SHCS-10-32x0.75', 'Socket head cap screw', null, null, randomUUID()]);
		await api.one(admin, 'select public.armory_cots_add($1, $2, $3, $4, $5, $6)', ['REV', '21-1650', 'NEO Motor', null, null, randomUUID()]);
		const dup = await api.fails(admin, 'select public.armory_cots_add($1, $2, $3, $4, $5, $6)', ['WCP', '0388', 'Again', null, null, randomUUID()]);
		expect([dup.code, dup.message, reason(dup)]).toEqual(['23505', 'The library already has WCP-0388: Hex Bearing.', 'duplicate']);
		const bad = await api.fails(admin, 'select public.armory_cots_add($1, $2, $3, $4, $5, $6)', ['W C P', '0388', 'x', null, null, randomUUID()]);
		expect(bad.message).toBe('The vendor prefix is one to eight letters or digits, starting with a letter, such as WCP or REV.');
		const link = await api.fails(admin, 'select public.armory_cots_add($1, $2, $3, $4, $5, $6)', ['AM', '0059', 'Gear 14T', 'http://x', null, randomUUID()]);
		expect(reason(link)).toBe('bad_link');
	});

	test('every project reads it; somebody on no project does not', async () => {
		const list = await api.one<{ r: { parts: Array<{ cots_number: string }>; can_curate: boolean } }>(ben, 'select public.armory_cots_list() as r');
		expect(list.r.parts.map((p) => p.cots_number)).toEqual(['HW-SHCS-10-32x0.75', 'REV-21-1650', 'WCP-0388']);
		expect(list.r.can_curate).toBe(false);
		expect((await api.one<{ r: { can_curate: boolean } }>(mentor, 'select public.armory_cots_list() as r')).r.can_curate).toBe(true);
		const r = await api.fails(outsider, 'select public.armory_cots_list()');
		expect(r.code).toBe('42501');
		expect((await api.rows(outsider, 'select * from public.armory_cots_parts')).length).toBe(0);
		expect((await api.rows(ben, 'select * from public.armory_cots_parts')).length).toBe(3);
	});

	test('a correction changes the words; retiring keeps the row; nothing deletes one', async () => {
		expect((await api.one<{ r: boolean }>(mentor, 'select public.armory_cots_correct($1, $2, $3, $4, $5) as r', [hex, 'Hex Bearing, 1/2 in', null, null, randomUUID()])).r).toBe(true);
		expect((await api.one<{ r: boolean }>(mentor, 'select public.armory_cots_correct($1, $2, $3, $4, $5) as r', [hex, 'Hex Bearing, 1/2 in', null, null, randomUUID()])).r).toBe(false);
		expect(reason(await api.fails(ana, 'select public.armory_cots_retire($1, true, $2)', [hex, randomUUID()]))).toBe('not_curator');
		expect((await api.one<{ r: boolean }>(mentor, 'select public.armory_cots_retire($1, true, $2) as r', [hex, randomUUID()])).r).toBe(true);
		// Even the table's owner cannot delete or renumber a row.
		const del = await db.sql('delete from public.armory_cots_parts where id = $1', [hex]).catch((e) => e as Refusal);
		expect((del as Refusal).code).toBe('55000');
		const ren = await db.sql("update public.armory_cots_parts set vendor_part = '0389' where id = $1", [hex]).catch((e) => e as Refusal);
		expect((ren as Refusal).code).toBe('55000');
		expect((await db.sql('select count(*)::int as n from public.armory_cots_parts')).rows[0].n).toBe(3);
		await api.one(mentor, 'select public.armory_cots_retire($1, false, $2)', [hex, randomUUID()]);
	});
});

describe('describing a number', () => {
	test('revision forward only, made from must be in the library, and the number itself must be well formed', async () => {
		const num = '5669-26-DT-0101';
		const d1 = (await api.one<{ r: Num }>(ana, DESCRIBE, [num.toLowerCase(), null, null, 'Gear plate', 'Rev C', 'wcp-0388', randomUUID()])).r;
		expect([d1.revision, d1.made_from]).toEqual(['C', 'WCP-0388']);
		const back = await api.fails(ana, DESCRIBE, [num, null, null, null, 'B', null, randomUUID()]);
		expect([back.message, reason(back)]).toEqual(['A revision only moves forward; 5669-26-DT-0101 is at Rev C.', 'revision_back']);
		expect((await api.one<{ r: Num }>(ana, DESCRIBE, [num, null, null, null, 'AA', '', randomUUID()])).r).toMatchObject({ revision: 'AA', made_from: null });
		const nope = await api.fails(ana, DESCRIBE, [num, null, null, null, null, 'AM-9999', randomUUID()]);
		expect(reason(nope)).toBe('unknown_cots');
		const bad = await api.fails(ana, DESCRIBE, ['5669-26-DT-0101B', null, null, null, null, null, randomUUID()]);
		expect([bad.code, bad.message]).toEqual(['22023', 'A revision letter goes beside the number, never in it: write 5669-27-DT-0104 and Rev B separately.']);
		const theirs = await api.fails(ben, DESCRIBE, [num, null, null, 'mine now', null, null, randomUUID()]);
		const ghost = await api.fails(ben, DESCRIBE, ['5669-26-DT-9999', null, null, 'x', null, null, randomUUID()]);
		expect([theirs.code, reason(theirs)]).toEqual(['P0002', 'not_found']);
		expect(ghost.code).toBe(theirs.code);
	});
});

describe('a number is never reused', () => {
	test('a removed file keeps its number; the next one is still higher', async () => {
		const shaft = await api.createFile(ana, A, devAna, 'Drive', 'Shaft.SLDPRT');
		const n = await take(ana, A, 'DT', 2, shaft);
		await api.lock(ana, shaft, devAna);
		expect(await api.tombstone(ana, shaft, null, devAna)).toBe(true);
		const after = await take(ana, A, 'DT', 2);
		expect(Number(after.part_number.slice(-2))).toBe(Number(n.part_number.slice(-2)) + 1);
		const { rows } = await db.sql('select file_id from public.armory_part_numbers where part_number = $1', [n.part_number]);
		expect(rows).toEqual([{ file_id: shaft }]);
	});

	test('a project deleted forever leaves its numbers taken, with nobody named; the next project continues past them', async () => {
		const before = (await db.sql<{ m: number }>(`select max(assembly)::int as m from public.armory_part_numbers where prefix = '5669' and season_yy = 26 and subsystem = 'DT'`)).rows[0].m;
		const scrap = await api.project(admin, 'Scrap Bot');
		await api.member(admin, scrap, ana.email, 'student');
		const s1 = await take(ana, scrap, 'DT', null);
		expect(Number(s1.part_number.slice(-4, -2))).toBe(before + 1);
		await api.one(admin, 'select public.armory_set_project_archived($1, true, $2)', [scrap, randomUUID()]);
		await api.one(admin, 'select public.armory_purge_project($1, $2, $3)', [scrap, 'Scrap Bot', randomUUID()]);
		const { rows } = await db.sql('select project_id, assigned_by from public.armory_part_numbers where part_number = $1', [s1.part_number]);
		expect(rows).toEqual([{ project_id: null, assigned_by: null }]);
		const next = await take(ana, A, 'DT', null);
		expect(Number(next.part_number.slice(-4, -2))).toBe(before + 2);
		// The table's owner cannot delete or renumber one either.
		const del = await db.sql('delete from public.armory_part_numbers where part_number = $1', [s1.part_number]).catch((e) => e as Refusal);
		expect((del as Refusal).code).toBe('55000');
		const ren = await db.sql('update public.armory_part_numbers set part = 50 where part_number = $1', [next.part_number]).catch((e) => e as Refusal);
		expect((ren as Refusal).code).toBe('55000');
	});
});

describe('reads, grants and RLS', () => {
	test("the project read lists the project's numbers to a member and a site admin, and refuses an outsider", async () => {
		const read = 'select public.armory_project_part_numbers($1) as r';
		const mine = (await api.one<{ r: { numbers: Num[]; can_take: boolean; project: { prefix: string; season_yy: number } } }>(ana, read, [A])).r;
		expect(mine.can_take).toBe(true);
		expect(mine.project).toMatchObject({ prefix: '5669', season_yy: 26 });
		expect(mine.numbers.every((n) => n.part_number.startsWith('5669-26-'))).toBe(true);
		const count = (await db.sql<{ n: number }>('select count(*)::int as n from public.armory_part_numbers where project_id = $1', [A])).rows[0].n;
		expect(mine.numbers.length).toBe(count);
		// The address reaches a mentor and a site admin, never a student; the name reaches everybody.
		expect(mine.numbers.filter((n) => 'assigned_by' in n).length).toBe(0);
		expect(mine.numbers.filter((n) => n.assigned_name === 'Ana Reyes').length).toBeGreaterThan(0);
		const theirs = (await api.one<{ r: { numbers: Num[] } }>(admin2, read, [A])).r.numbers;
		expect(theirs.length).toBe(count);
		expect(theirs.filter((n) => n.assigned_by === ana.email).length).toBeGreaterThan(0);
		const mentors = (await api.one<{ r: { numbers: Num[] } }>(mentor, read, [A])).r.numbers;
		expect(mentors.every((n) => 'assigned_by' in n)).toBe(true);
		expect((await api.fails(outsider, read, [A])).code).toBe('42501');
		// The table under RLS: an outsider reads none, a member reads the project's.
		expect((await api.rows(outsider, 'select * from public.armory_part_numbers')).length).toBe(0);
		expect((await api.rows(ben, 'select * from public.armory_part_numbers where project_id = $1', [A])).length).toBe(0);
		expect((await api.rows(ana, 'select * from public.armory_part_numbers where project_id = $1', [A])).length).toBe(count);
	});

	test('no client writes a table directly; anon executes nothing here', async () => {
		const w = await api.fails(ana, `insert into public.armory_part_numbers (part_number, prefix, season_yy, subsystem, assembly, part) values ('5669-26-DT-9900','5669',26,'DT',99,0)`);
		expect(w.code).toBe('42501');
		const c = await api.fails(mentor, `insert into public.armory_cots_parts (vendor, vendor_part, description, added_by) values ('X','1','x','x')`);
		expect(c.code).toBe('42501');
		for (const sig of [
			'armory_part_number_take(uuid, text, integer, uuid, text, text, uuid)',
			'armory_part_number_describe(text, uuid, text, text, text, text, uuid)',
			'armory_cots_add(text, text, text, text, uuid, uuid)',
			'armory_cots_list()',
			'armory_project_part_numbers(uuid)',
			'armory_part_number_problem(text)'
		]) {
			expect(await canExecute(db, 'anon', sig), sig).toBe(false);
			expect(await canExecute(db, 'authenticated', sig), sig).toBe(true);
		}
		expect(await canExecute(db, 'authenticated', '_armory_parts_refuse(text, text, text, jsonb)')).toBe(false);
		expect(await overloads(db, 'armory_part_number_take')).toBe(1);
	});
});
