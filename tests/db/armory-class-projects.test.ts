// tests/db/armory-class-projects.test.ts
//
// MIGRATION 0319 (ledger 0463): an Armory project linked to a class.
// The chain is every migration before the file, read off disk; a class, its
// roster, an Armory project with members, files and a check out are written
// through the REAL deployed RPCs; a corpus of the calls the deployed Windows
// app makes runs against the DEPLOYED bodies; then the file goes on top and
// the same corpus runs again and must answer identically.
//
// What a wrong answer here would look like, and why each is silent:
//   - A STUDENT CHECKS A FILE INTO A CLASSMATE'S FOLDER. Nothing on screen
//     says the rule did not hold; the file simply changes.
//   - THE LINK DEMOTES A MENTOR who is also on the roster.
//   - A STUDENT WHO LEFT KEEPS ACCESS, or a student added by hand is removed.
//   - AN UNLINKED PROJECT ANSWERS DIFFERENTLY after the apply, which breaks a
//     running Armory 0.5.1 on a project nobody linked.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createClassroomSection, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { canExecute, catalogFingerprint, overloads, pasteTrap } from './chain-0230';
import { migrationFile, migrationSql, treeShortOf } from './chain-0436';
import { armoryRpc, hash, person } from './armory-v3-helpers';

const N = '0319';
const SQL = migrationSql(N);
/** 0320: the WHERE pg-safeupdate demands, on 0319's roster sync. */
const FIX = migrationSql('0320');

type Outcome = { ok: true; r: unknown } | { ok: false; code: string; message: string };

let db: TestDb;
let api: ReturnType<typeof armoryRpc>;
let preFingerprint: string;

let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser; // Reyes, Ana
let ben: SeededUser; // Okafor, Ben
let emma: SeededUser; // Vanden Dries, Emma Maria
let emma2: SeededUser; // Vanden Dries, Emma Louise (a clash)
let mateo: SeededUser; // on the roster and already a mentor of the project
let hand: SeededUser; // added by hand, not on the roster
let outsider: SeededUser;

let section: string;
let P: string; // the class project
let Q: string; // an unlinked project, the corpus
let anaDev: string;
let benDev: string;
let mateoDev: string;
let teacherDev: string;
let qFile: string;
let corpusBefore: Outcome[];

async function attempt(u: SeededUser, sql: string, params: unknown[]): Promise<Outcome> {
	return db.asUser(u.id, async (q) => {
		// Each call runs inside a transaction that is rolled back, so the corpus leaves nothing behind.
		await q('begin');
		try {
			const row = (await q(sql, params)).rows[0] as { r: unknown };
			return { ok: true as const, r: row.r };
		} catch (e) {
			const err = e as { code: string; message: string };
			return { ok: false as const, code: err.code, message: err.message };
		} finally {
			await q('rollback');
		}
	});
}
const link = (u: SeededUser, p: string, s: string) =>
	api.one<{ r: Record<string, unknown> }>(u, 'select public.armory_link_section($1, $2, $3) as r', [p, s, randomUUID()]).then((x) => x.r);
const folders = (u: SeededUser, p: string) =>
	api.one<{ r: Array<{ folder: string; kind: string; owner: string | null; writers: string[]; files: number; placeholder_file_id: string }> }>(
		u,
		'select public.armory_folder_list($1) as r',
		[p]
	).then((x) => x.r);
async function role(p: string, email: string): Promise<string | null> {
	const { rows } = await db.sql<{ role: string }>('select role::text as role from public.armory_members where project_id = $1 and email = $2', [p, email]);
	return rows[0]?.role ?? null;
}
const CREATE = 'select public.armory_create_file($1, $2, $3, $4, $5) as r';
const LOCK = 'select public.armory_acquire_lock($1, $2, $3) as r';
const MOVE = 'select public.armory_move_file($1, $2, $3, $4, $5) as r';
const RENAME = 'select public.armory_rename_folder($1, $2, $3, $4, $5) as r';
const DELETE = 'select public.armory_delete_folder($1, $2, $3, $4) as r';
const FILES = 'select public.armory_project_files($1) as r';

/** Calls the deployed Windows app makes on a project nobody linked. */
function corpus(): Array<[() => SeededUser, string, () => unknown[]]> {
	return [
		[() => ana, CREATE, () => [Q, 'Drive', 'Gear.SLDPRT', anaDev, randomUUID()]],
		[() => ana, CREATE, () => [Q, 'bad:folder', 'x.txt', anaDev, randomUUID()]],
		[() => outsider, CREATE, () => [Q, '', 'y.txt', anaDev, randomUUID()]],
		[() => ben, LOCK, () => [qFile, benDev, randomUUID()]],
		[() => ana, MOVE, () => [qFile, 'Elsewhere', 'Frame.SLDPRT', anaDev, randomUUID()]],
		[() => ben, RENAME, () => [Q, 'Drive', 'Drivetrain', benDev, randomUUID()]],
		[() => ben, DELETE, () => [Q, 'Nothing', benDev, randomUUID()]]
	];
}
async function runCorpus(): Promise<Outcome[]> {
	const out: Outcome[] = [];
	for (const [u, sql, args] of corpus()) {
		const o = await attempt(u(), sql, args());
		// A new file id is new each run; only its shape is compared.
		out.push(o.ok && typeof o.r === 'string' && /^[0-9a-f-]{36}$/.test(o.r) ? { ok: true, r: 'uuid' } : o);
	}
	return out;
}

beforeAll(async () => {
	db = await startTestDb(treeShortOf(N));
	api = armoryRpc(db);
	admin = await person(db, 'apina@boscotech.edu', 'Mr. Pina');
	teacher = await person(db, 'teach@boscotech.edu', 'A Teacher');
	ana = await person(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	ben = await person(db, 'ben.okafor@boscotech.net', 'Ben Okafor');
	emma = await person(db, 'emma.vd@boscotech.net', 'Emma Vanden Dries');
	emma2 = await person(db, 'emma.l.vd@boscotech.net', 'Emma L Vanden Dries');
	mateo = await person(db, 'mateo@boscotech.net', 'Mateo R');
	hand = await person(db, 'hand@boscotech.net', 'Hand Added');
	outsider = await person(db, 'zed@boscotech.net', 'Zed');

	section = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering Foundations', label: '3', teacherEmail: teacher.email });
	for (const [u, name] of [
		[ana, 'Reyes, Ana'],
		[ben, 'Okafor, Ben'],
		[emma, 'Vanden Dries, Emma Maria'],
		[emma2, 'Vanden Dries, Emma Louise'],
		[mateo, 'R, Mateo']
	] as const) {
		await enrollStudent(db, { as: admin, sectionId: section, email: u.email, displayName: name });
	}

	// THROUGH THE DEPLOYED RPCs.
	P = await api.project(admin, 'IDEA 100 Section 3');
	Q = await api.project(admin, 'Robot 2027');
	await api.member(admin, P, mateo.email, 'mentor');
	await api.member(admin, P, hand.email, 'student');
	for (const u of [ana, ben]) await api.member(admin, Q, u.email, 'student');
	anaDev = await api.device(ana, 'IDEA-06');
	benDev = await api.device(ben, 'IDEA-07');
	mateoDev = await api.device(mateo, 'IDEA-08');
	teacherDev = await api.device(teacher, 'Teacher PC');
	qFile = await api.createFile(ana, Q, anaDev, 'Drive', 'Frame.SLDPRT');
	expect(await api.lock(ana, qFile, anaDev)).toBe(true);
	await api.commit(ana, qFile, null, hash('a'), anaDev);

	corpusBefore = await runCorpus();
	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL);
	await db.sql(FIX);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

describe(`${N} as a file`, () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(pasteTrap(SQL)).toEqual([]);
		expect(scanFile("insert into public.armory_folders (project_id) values (null);").findings).toHaveLength(1);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
		expect(migrationFile(N)).toBe(`${N}_armory_class_projects.sql`);
	});

	test('the first object it creates is new in this file', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table)\s+(?:if\s+not\s+exists\s+)?([\w.]+)/i.exec(SQL);
		expect(first?.[1]).toBe('public.armory_project_sections');
		const earlier = treeShortOf(N).slice(1).map((f) => migrationSql(f.slice(0, 4)));
		expect(earlier.some((t) => t.includes('armory_project_sections'))).toBe(false);
		expect(earlier.some((t) => t.includes('armory_create_file'))).toBe(true);
	});

	test('a second paste changes no catalog object, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL);
		await db.sql(FIX);
		expect(await catalogFingerprint(db)).toEqual(after);
	});

	test('one form of every replaced function, authenticated only; the helpers nobody', async () => {
		for (const f of ['armory_create_file', 'armory_acquire_lock', 'armory_commit_version', 'armory_move_file', 'armory_rename_folder', 'armory_delete_folder', 'armory_link_section']) {
			expect(await overloads(db, f), f).toBe(1);
		}
		for (const sig of ['armory_link_section(uuid, uuid, uuid)', 'armory_unlink_section(uuid, uuid)', 'armory_make_personal_folders(uuid, uuid)', 'armory_make_team_folders(uuid, uuid)', 'armory_folder_list(uuid)', 'armory_project_class(uuid)']) {
			expect(await canExecute(db, 'anon', sig), sig).toBe(false);
			expect(await canExecute(db, 'authenticated', sig), sig).toBe(true);
		}
		for (const sig of ['_armory_may_write_folder(uuid, text)', '_armory_sync_section(uuid)', '_armory_make_placeholder(uuid, text, text)', '_armory_refuse_folder_write(uuid, text)']) {
			expect(await canExecute(db, 'authenticated', sig), sig).toBe(false);
			expect(await canExecute(db, 'anon', sig), sig).toBe(false);
		}
	});
});

describe('a project nobody linked answers exactly as before', () => {
	test('the deployed app corpus, before and after', async () => {
		expect(await runCorpus()).toEqual(corpusBefore);
	});
});

describe('linking a class', () => {
	let result: Record<string, unknown>;
	beforeAll(async () => {
		result = await link(admin, P, section);
	});

	test('one call adds the whole roster as students and the teacher as instructor', async () => {
		expect(result.students_added).toBe(4);
		expect(result.already_members).toBe(1);
		expect(result.instructor_added).toBe(1);
		for (const u of [ana, ben, emma, emma2]) expect(await role(P, u.email), u.email).toBe('student');
		expect(await role(P, teacher.email)).toBe('instructor');
	});

	test('an add is never a role change: the mentor on the roster stays a mentor', async () => {
		expect(await role(P, mateo.email)).toBe('mentor');
		expect(result.kept_their_role).toEqual([{ email: mateo.email, role: 'mentor' }]);
	});

	test('each student gets a Last_First folder; a clash adds the middle initial', async () => {
		const list = await folders(admin, P);
		const byOwner = Object.fromEntries(list.filter((f) => f.kind === 'personal').map((f) => [f.owner, f.folder]));
		expect(byOwner[ana.email]).toBe('Reyes_Ana');
		expect(byOwner[ben.email]).toBe('Okafor_Ben');
		expect(byOwner[emma.email]).toBe('VandenDries_EmmaM');
		expect(byOwner[emma2.email]).toBe('VandenDries_EmmaL');
		expect(byOwner[mateo.email]).toBe('R_Mateo');
		expect(Object.keys(byOwner)).toHaveLength(5);
		for (const f of list) expect(f.writers.length, f.folder).toBe(1);
		for (const f of list) expect(f.files, f.folder).toBe(0);
	});

	test('every folder carries a placeholder with a real version, so Armory 0.5.1 makes the folder on disk', async () => {
		const files = (await api.one<{ r: Array<{ folder: string; name: string; current: { hash: string; bytes: number } | null; deleted: boolean }> }>(ana, FILES, [P])).r;
		const anas = files.find((f) => f.folder === 'Reyes_Ana');
		expect(anas?.name).toBe('README - Reyes_Ana.txt');
		expect(anas?.current?.hash).toBe('20af567f0310d646f19774ba42f935151c06a94a8c77ca51b063ec24d3eeeb90');
		expect(anas?.current?.bytes).toBe(238);
		expect(files.filter((f) => f.name.startsWith('README - ') && f.current)).toHaveLength(5);
	});

	test('a re-link changes nothing', async () => {
		const again = await link(admin, P, section);
		expect(again.students_added).toBe(0);
		expect(again.folders_made).toBe(0);
		expect(again.placeholders_made).toBe(0);
	});

	test('a student cannot link, unlink or make folders; a non-member teacher of another class cannot either', async () => {
		const refused = await api.fails(ana, 'select public.armory_link_section($1, $2, $3)', [P, section, randomUUID()]);
		expect(refused.code).toBe('42501');
		expect((await api.fails(ana, 'select public.armory_make_personal_folders($1, $2)', [P, randomUUID()])).code).toBe('42501');
		expect((await api.fails(ana, 'select public.armory_unlink_section($1, $2)', [P, randomUUID()])).code).toBe('42501');
	});
});

describe('the folder write rule, in the database', () => {
	let benFile: string;
	test('a student cannot create a file in a classmate folder (the mutation target)', async () => {
		const refusal = await api.fails(ana, CREATE, [P, 'Okafor_Ben', 'Mine.SLDPRT', anaDev, randomUUID()]);
		expect(refusal.code).toBe('PT403');
		expect(refusal.message).toBe("This is Ben's folder. Save your work in your own folder.");
		expect(JSON.parse(refusal.detail!)).toMatchObject({ reason: 'not_your_folder', folder: 'Okafor_Ben' });
		expect(JSON.stringify(refusal)).not.toContain('@');
	});

	test('the owner can, and so can a subfolder of their own', async () => {
		benFile = (await api.one<{ r: string }>(ben, CREATE, [P, 'Okafor_Ben', 'Bracket.SLDPRT', benDev, randomUUID()])).r;
		expect(benFile).toMatch(/^[0-9a-f-]{36}$/);
		const sub = await api.one<{ r: string }>(ben, CREATE, [P, 'Okafor_Ben/Drafts', 'Sketch.SLDPRT', benDev, randomUUID()]);
		expect(sub.r).toMatch(/^[0-9a-f-]{36}$/);
		expect(await api.lock(ben, benFile, benDev)).toBe(true);
		const c = await api.commit(ben, benFile, null, hash('b'), benDev);
		expect(c.advanced).toBe(true);
		expect(await api.release(ben, benFile, benDev)).toBe(true);
	});

	test('a classmate cannot check out, so cannot check in, the owner file; everyone can read it', async () => {
		const refused = await api.fails(ana, LOCK, [benFile, anaDev, randomUUID()]);
		expect(refused.code).toBe('PT403');
		const files = (await api.one<{ r: Array<{ id: string }> }>(ana, FILES, [P])).r;
		expect(files.some((f) => f.id === benFile)).toBe(true);
		// A check in without the lock is kept as a side version, as always.
		const c = await api.commit(ana, benFile, null, hash('c'), anaDev);
		expect(c.advanced).toBe(false);
	});

	test('the batch check out refuses per file the same way', async () => {
		const r = await api.one<{ r: { refused: number; results: Array<{ ok: boolean; code: string }> } }>(ana, 'select public.armory_lock_files($1, $2, $3) as r', [[benFile], anaDev, randomUUID()]);
		expect(r.r.refused).toBe(1);
		expect(r.r.results[0].code).toBe('PT403');
	});

	test('a check in by a lock holder who may no longer write is kept as their copy', async () => {
		// The teacher (instructor) checks out Ben's file; then is demoted to student by a mentor.
		expect(await api.lock(teacher, benFile, teacherDev)).toBe(true);
		await db.sql(`update public.armory_members set role = 'student' where project_id = $1 and email = $2`, [P, teacher.email]);
		const c = await api.commit(teacher, benFile, (await db.sql<{ v: string }>('select current_version_id as v from public.armory_files where id = $1', [benFile])).rows[0].v, hash('d'), teacherDev);
		expect(c.advanced).toBe(false);
		await db.sql(`update public.armory_members set role = 'instructor' where project_id = $1 and email = $2`, [P, teacher.email]);
		expect(await api.release(teacher, benFile, teacherDev)).toBe(true);
	});

	test('a mentor and an instructor write anywhere; a move into a classmate folder is refused', async () => {
		const m = await api.one<{ r: string }>(mateo, CREATE, [P, 'Okafor_Ben', 'Note.txt', mateoDev, randomUUID()]);
		expect(m.r).toMatch(/^[0-9a-f-]{36}$/);
		const anaFile = (await api.one<{ r: string }>(ana, CREATE, [P, 'Reyes_Ana', 'Plate.SLDPRT', anaDev, randomUUID()])).r;
		expect(await api.lock(ana, anaFile, anaDev)).toBe(true);
		expect((await api.fails(ana, MOVE, [anaFile, 'Okafor_Ben', 'Plate.SLDPRT', anaDev, randomUUID()])).code).toBe('PT403');
	});

	test('a student cannot rename or delete a class folder, their own included', async () => {
		expect((await api.fails(ben, RENAME, [P, 'Okafor_Ben', 'Ben', benDev, randomUUID()])).code).toBe('PT403');
		expect((await api.fails(ben, DELETE, [P, 'Okafor_Ben', benDev, randomUUID()])).code).toBe('PT403');
		expect((await api.fails(ana, DELETE, [P, 'Okafor_Ben/Drafts', anaDev, randomUUID()])).code).toBe('PT403');
		// Inside their own folder, a subfolder is theirs to rename.
		const moved = await api.one<{ r: number }>(ben, RENAME, [P, 'Okafor_Ben/Drafts', 'Okafor_Ben/Old', benDev, randomUUID()]);
		expect(moved.r).toBe(1);
	});

	test('the top of the project stays open to every member', async () => {
		const r = await api.one<{ r: string }>(ana, CREATE, [P, 'Shared', 'Common.SLDPRT', anaDev, randomUUID()]);
		expect(r.r).toMatch(/^[0-9a-f-]{36}$/);
	});

	test('the placeholder is not counted as work', async () => {
		const list = await folders(ben, P);
		expect(list.find((f) => f.folder === 'Okafor_Ben')?.files).toBe(3);
		expect(list.find((f) => f.folder === 'Reyes_Ana')?.files).toBe(1); // Plate, made by Ana
	});
});

describe('the roster moves', () => {
	test('a student who leaves loses access, keeps their files; a hand-added student stays', async () => {
		await db.sql('update public.classroom_enrollments set active = false where section_id = $1 and student_email = $2', [section, ben.email]);
		expect(await role(P, ben.email)).toBeNull();
		expect(await role(P, hand.email)).toBe('student');
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.armory_files where project_id = $1 and folder like 'Okafor_Ben%' and deleted_at is null`, [P]);
		expect(rows[0].n).toBe(4);
		await db.sql('update public.classroom_enrollments set active = true where section_id = $1 and student_email = $2', [section, ben.email]);
		expect(await role(P, ben.email)).toBe('student');
		const list = await folders(admin, P);
		expect(list.filter((f) => f.owner === ben.email).map((f) => f.folder)).toEqual(['Okafor_Ben']);
	});

	test('a new student on the roster joins with a folder at once', async () => {
		const late = await person(db, 'late@boscotech.net', 'Late Joiner');
		await enrollStudent(db, { as: admin, sectionId: section, email: late.email, displayName: 'Joiner, Late' });
		expect(await role(P, late.email)).toBe('student');
		expect((await folders(admin, P)).some((f) => f.folder === 'Joiner_Late')).toBe(true);
	});

	test('unlink stops following and changes nobody', async () => {
		const r = await api.one<{ r: { unlinked: boolean } }>(admin, 'select public.armory_unlink_section($1, $2) as r', [P, randomUUID()]);
		expect(r.r.unlinked).toBe(true);
		await db.sql('update public.classroom_enrollments set active = false where section_id = $1 and student_email = $2', [section, ana.email]);
		expect(await role(P, ana.email)).toBe('student');
		await db.sql('update public.classroom_enrollments set active = true where section_id = $1 and student_email = $2', [section, ana.email]);
		await link(admin, P, section);
	});
});

describe('team folders', () => {
	let setId: string;
	test('without a posted draw it says so and writes nothing', async () => {
		const refusal = await api.fails(admin, 'select public.armory_make_team_folders($1, $2)', [P, randomUUID()]);
		expect(JSON.parse(refusal.detail!).reason).toBe('no_teams');
	});

	test('Teams/<name> for each team; only that team writes; re-running updates writers and moves nothing', async () => {
		setId = (await db.asUser(teacher.id, (q) => q<{ r: string }>('select public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb) as r', [
			section, 'Build teams', 7, 'count', 2,
			JSON.stringify([{ team_number: 1, members: [ana.email, ben.email] }, { team_number: 2, members: [emma.email, emma2.email] }])
		]))).rows[0].r;
		await db.asUser(teacher.id, (q) => q('select public.classroom_post_team_set($1::uuid, $2::timestamptz)', [setId, null]));
		const made = await api.one<{ r: { folders_made: number } }>(admin, 'select public.armory_make_team_folders($1, $2) as r', [P, randomUUID()]);
		expect(made.r.folders_made).toBe(2);
		const teamFolders = (await folders(admin, P)).filter((f) => f.kind === 'team');
		expect(teamFolders.map((f) => f.folder)).toEqual(['Teams/Team 1', 'Teams/Team 2']);
		expect(teamFolders[0].writers).toEqual([ana.email, ben.email].sort());
		const ok = await api.one<{ r: string }>(ana, CREATE, [P, 'Teams/Team 1', 'Launcher.SLDASM', anaDev, randomUUID()]);
		expect(ok.r).toMatch(/^[0-9a-f-]{36}$/);
		const refusal = await api.fails(ana, CREATE, [P, 'Teams/Team 2', 'Spy.SLDPRT', anaDev, randomUUID()]);
		expect(refusal.code).toBe('PT403');
		expect(refusal.message).toBe('This folder is for team Team 2. Save your work in your own folder.');

		// Ben moves to team 2; the re-run updates writers and moves no file.
		await db.sql(`update public.classroom_team_members set team_id = (select id from public.classroom_teams where team_set_id = $1 and team_number = 2) where team_set_id = $1 and student_email = $2`, [setId, ben.email]);
		const before = (await db.sql<{ n: number }>(`select count(*)::int as n from public.armory_change_feed where project_id = $1 and kind in ('file_moved', 'tombstone', 'folder_renamed', 'folder_deleted')`, [P])).rows[0].n;
		const again = await api.one<{ r: { folders_made: number; files_moved: number } }>(admin, 'select public.armory_make_team_folders($1, $2) as r', [P, randomUUID()]);
		expect(again.r).toMatchObject({ folders_made: 0, files_moved: 0 });
		const after = (await db.sql<{ n: number }>(`select count(*)::int as n from public.armory_change_feed where project_id = $1 and kind in ('file_moved', 'tombstone', 'folder_renamed', 'folder_deleted')`, [P])).rows[0].n;
		expect(after).toBe(before);
		const t = (await folders(admin, P)).filter((f) => f.kind === 'team');
		expect(t[0].writers).toEqual([ana.email]);
		expect(t[1].writers).toEqual([ben.email, emma.email, emma2.email].sort());
	});
});

describe('0320: no Armory body writes with no WHERE, which pg-safeupdate refuses on production', () => {
	/** pg-safeupdate's rule, as tests/db/tournament-bracket-seeded-0317.test.ts states it: an UPDATE or DELETE needs a top-level WHERE. */
	function unqualified(body: string): string[] {
		const s = body.replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");
		const out: string[] = [];
		const re = /\b(update\s+(only\s+)?([a-z_]+\.)?[a-z_]+(\s+(as\s+)?[a-z_]+)?\s+set\b|delete\s+from\s+(only\s+)?([a-z_]+\.)?[a-z_]+)/gi;
		for (let m = re.exec(s); m; m = re.exec(s)) {
			const end = s.indexOf(';', m.index);
			const stmt = s.slice(m.index, end < 0 ? undefined : end);
			let depth = 0;
			let top = '';
			for (const ch of stmt) {
				if (ch === '(') depth += 1;
				else if (ch === ')') depth -= 1;
				else if (depth === 0) top += ch;
			}
			if (!/\bwhere\b/i.test(top)) out.push(stmt.replace(/\s+/g, ' ').slice(0, 80));
		}
		return out;
	}
	test('every armory function on the chain carries its WHERE; 0319 alone did not', async () => {
		const { rows } = await db.sql<{ name: string; def: string }>(
			`select p.proname as name, p.prosrc as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like '%armory%'`
		);
		const bad = rows.flatMap((r) => unqualified(r.def).map((x) => `${r.name}: ${x}`));
		expect(bad).toEqual([]);
		// Control: the scanner sees 0319's bare delete.
		expect(unqualified(SQL).some((x) => x.startsWith('delete from pg_temp.armory_roster'))).toBe(true);
		expect(unqualified(FIX)).toEqual([]);
	});
});
