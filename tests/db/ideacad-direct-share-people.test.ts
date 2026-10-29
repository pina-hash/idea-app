// tests/db/ideacad-direct-share-people.test.ts
//
// LEDGER 0470, THEN LEDGER 0471: IdeaCAD sharing you can pick, see and
// confirm. The picker's directory, the access list and the batch share (0325),
// as 0329 leaves them: Mr. Pina's decision of 2026-10-28
// (docs/decisions/entries/72-*, ideacad-sharing-shows-name-and-email) that
// sharing shows a name AND an email everywhere and finds anyone by any part of
// either. The chain is the whole tree short of 0329, so 0325 is there; one
// grant is made through 0217's REAL single-row share and two through 0325's
// REAL batch share BEFORE 0329 applies, and the access list is read through
// 0325 first so the pre-0329 shape is recorded, not assumed.
//
// What is held, both directions every time:
//   * the directory answers only the model's owner, school accounts only,
//     teammates then classmates then the school, never the caller and never a
//     visitor, searched by the visitor's name or by their address;
//   * every person carries their school email, in the directory, the access
//     list and the batch share's results, and the launch list names a shared
//     model's owner by name beside their email;
//   * search matches any part of a name or an address, a chosen display name
//     included, but a chosen picture still replaces the Google photo (a person
//     with no chosen name or picture is the positive control);
//   * the access list answers the owner (and only reads for anyone else it
//     answers), and "does not exist" to everyone else exactly as for a
//     document that is not there;
//   * the batch share lands many people in one call, refuses per row without
//     hiding the rest, and its undo puts every changed row back.
//
// The migration is read off disk when the suite starts, so a mutation run
// reads the mutant (docs/subsystems/verification.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startTestDb, createUser, createClassroomSection, enrollStudent, type TestDb, type SeededUser } from './harness';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrationSql, treeShortOf } from './chain-0436';

// Found by its name, so a renumbering at landing needs no edit here.
const NUMBER = readdirSync(fileURLToPath(new URL('../../supabase/migrations', import.meta.url)))
	.filter((f) => f.endsWith('_ideacad_sharing_names_and_emails.sql'))
	.map((f) => f.slice(0, 4))[0];
const KERNEL = 'remus-f7907f5-2.130.20';
let db: TestDb;
let admin: SeededUser, teacher: SeededUser, owner: SeededUser, mate: SeededUser, classmate: SeededUser,
	stranger: SeededUser, visitor: SeededUser, sparky: SeededUser, plain: SeededUser;
let doc: string;
let crowd: SeededUser[] = [];
let sparkyDoc: string;
let before0329: any;

async function call(user: SeededUser, expression: string, params: unknown[] = []): Promise<any> {
	return db.asUser(user.id, async (q) => (await q(`select ${expression} as result`, params)).rows[0].result);
}
async function refusal(user: SeededUser, expression: string, params: unknown[] = []): Promise<string> {
	try { await call(user, expression, params); return ''; } catch (error) { return (error as Error).message; }
}
const people = (q: string, user = owner, id = doc) => call(user, 'public.ideacad_share_people($1::uuid, $2)', [id, q]);
const access = (user = owner, id = doc) => call(user, 'public.ideacad_direct_document_access($1::uuid)', [id]);
const setAccess = (changes: unknown, user = owner, id = doc) =>
	call(user, 'public.ideacad_set_direct_document_access($1::uuid, $2::jsonb)', [id, JSON.stringify(changes)]);
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

beforeAll(async () => {
	db = await startTestDb(treeShortOf(NUMBER));
	admin = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teach.lee@boscotech.edu', 'Tess Teacher');
	owner = await createUser(db, 'olive.lee@boscotech.net', 'Olive Lee');
	mate = await createUser(db, 'mateo.lee@boscotech.net', 'Mateo Lee');
	classmate = await createUser(db, 'carla.lee@boscotech.net', 'Carla Lee');
	stranger = await createUser(db, 'stan.lee@boscotech.net', 'Stan Lee');
	visitor = await createUser(db, 'vic.lee@gmail.com', 'Vic Lee');
	sparky = await createUser(db, 'jordan.hidden@boscotech.net', 'Jordan Hidden');
	plain = await createUser(db, 'pat.plain@boscotech.net', 'Pat Plain');
	// Chosen identities, set the way a person sets them: their own row, under their own policy.
	await db.asUser(sparky.id, (q) => q(`update public.profiles set display_name = 'Sparky', avatar_url = 'https://lh3.example/jordan.jpg' where id = $1`, [sparky.id]));
	await db.asUser(plain.id, (q) => q(`update public.profiles set avatar_url = 'https://lh3.example/pat.jpg' where id = $1`, [plain.id]));

	const a = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Block 2', teacherEmail: teacher.email });
	const b = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Block 3', teacherEmail: admin.email });
	for (const [u, n] of [[owner, 'Olive Lee'], [mate, 'Mateo Lee'], [classmate, 'Carla Lee'], [sparky, 'Jordan Hidden']] as const) {
		await enrollStudent(db, { as: teacher, sectionId: a, email: u.email, displayName: n });
	}
	await enrollStudent(db, { as: admin, sectionId: b, email: stranger.email, displayName: 'Stan Lee' });
	// A posted team draw: Olive and Mateo on one team, Carla on another.
	const set = (await db.sql<{ id: string }>(`insert into public.classroom_team_sets (section_id, label, seed, mode, mode_value, created_by, posted_at)
		values ($1, 'Launcher teams', 7, 'size', 2, $2, now() - interval '1 hour') returning id`, [a, teacher.email])).rows[0].id;
	const t1 = (await db.sql<{ id: string }>(`insert into public.classroom_teams (team_set_id, team_number) values ($1, 1) returning id`, [set])).rows[0].id;
	const t2 = (await db.sql<{ id: string }>(`insert into public.classroom_teams (team_set_id, team_number) values ($1, 2) returning id`, [set])).rows[0].id;
	await db.sql(`insert into public.classroom_team_members (team_set_id, team_id, student_email) values ($1, $2, $4), ($1, $2, $5), ($1, $3, $6)`,
		[set, t1, t2, owner.email, mate.email, classmate.email]);

	// The model, and one grant made BEFORE 0325, through 0217's own share.
	doc = (await call(owner, 'public.ideacad_create_direct_document($1, $2)', ['Launcher arm', KERNEL])).document.id;
	await call(owner, 'public.ideacad_share_direct_document($1::uuid, $2, $3)', [doc, classmate.email, 'viewer']);

	for (let i = 0; i < 40; i++) crowd.push(await createUser(db, `crowd.${i}@boscotech.net`, `Crowd Member ${i}`));

	// Two grants through 0325's own batch share, and the access list read as
	// 0325 answers it, before 0329 exists.
	sparkyDoc = (await call(sparky, 'public.ideacad_create_direct_document($1, $2)', ['Sparky intake', KERNEL])).document.id;
	await call(sparky, 'public.ideacad_set_direct_document_access($1::uuid, $2::jsonb)',
		[sparkyDoc, JSON.stringify([{ key: owner.id, role: 'viewer' }, { email: visitor.email, role: 'viewer' }])]);
	before0329 = await access(sparky, sparkyDoc);

	await db.sql(migrationSql(NUMBER));
}, 600_000);

afterAll(async () => { await db?.stop(); });

describe(`${NUMBER} applies over 0325`, () => {
	it('was read before it applied: 0325 sent no address', () => {
		expect(before0329.count).toBe(2);
		expect(JSON.stringify(before0329)).not.toContain('@');
	});
	it('re-applies cleanly over itself', async () => {
		await db.sql(migrationSql(NUMBER));
	});
	it('opens the three entry points to signed-in callers only and the two helpers to nobody', async () => {
		const acl = (await db.sql<{ fn: string; anon: boolean; authed: boolean }>(`
			select p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
				has_function_privilege('authenticated', p.oid, 'execute') as authed
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname in ('ideacad_share_people', 'ideacad_direct_document_access',
				'ideacad_set_direct_document_access', '_ideacad_share_circle', '_ideacad_share_person_json')
			order by 1`)).rows;
		expect(acl).toHaveLength(5);
		expect(acl.filter((r) => r.anon)).toEqual([]);
		expect(acl.filter((r) => r.authed).map((r) => r.fn).sort()).toEqual(['ideacad_direct_document_access', 'ideacad_set_direct_document_access', 'ideacad_share_people']);
		await expect(db.asAnon((q) => q('select public.ideacad_share_people($1::uuid, $2)', [doc, 'lee']))).rejects.toThrow('permission denied');
		const list = (await db.sql<{ anon: boolean; authed: boolean; n: number }>(`
			select bool_or(has_function_privilege('anon', p.oid, 'execute')) as anon,
				bool_and(has_function_privilege('authenticated', p.oid, 'execute')) as authed, count(*)::int as n
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = 'ideacad_direct_documents'`)).rows[0];
		expect(list).toEqual({ anon: false, authed: true, n: 1 });
	});
});

describe('the directory', () => {
	it('suggests teammates on an empty box, and nobody else', async () => {
		const rows = await people('');
		expect(names(rows)).toEqual(['Mateo Lee']);
		expect(rows[0].relation).toBe('teammate');
		expect(names(rows)).not.toContain('Carla Lee');
	});
	it('ranks teammates, then classmates, then the school, and leaves out the caller and visitors', async () => {
		// Since 0329 "lee" also finds Tess Teacher by her address, teach.lee@.
		const rows = await people('lee');
		expect(names(rows)).toEqual(['Mateo Lee', 'Carla Lee', 'Tess Teacher', 'Stan Lee']);
		expect(rows.map((r: any) => r.relation)).toEqual(['teammate', 'classmate', 'classmate', 'school']);
		expect(rows.find((r: any) => r.name === 'Carla Lee').access).toBe('viewer');
		expect(rows.find((r: any) => r.name === 'Mateo Lee').access).toBeNull();
		expect(names(rows)).not.toContain('Olive Lee');
		expect(names(rows)).not.toContain('Vic Lee');
		// Staff are found too, and marked; the teacher of record is a classmate.
		const staff = await people('tess');
		expect(staff).toHaveLength(1);
		expect(staff[0]).toMatchObject({ name: 'Tess Teacher', staff: true, relation: 'classmate' });
	});
	it('sends every person with their school email, and answers nothing under two letters', async () => {
		const rows = await people('lee');
		expect(rows.length).toBe(4);
		expect(rows.map((r: any) => r.email)).toEqual([mate.email, classmate.email, teacher.email, stranger.email]);
		for (const r of rows) expect(Object.keys(r).sort()).toEqual(['access', 'avatar', 'avatarUrl', 'email', 'key', 'name', 'relation', 'staff']);
		expect(rows.every((r: any) => /@boscotech\.(net|edu)$/.test(r.email))).toBe(true);
		expect(await people('l')).toEqual([]);
	});
	it('never lists a visitor, found by name or by any part of their address', async () => {
		// Positive control first: the same three searches find a school account.
		expect(names(await people('stan'))).toEqual(['Stan Lee']);
		expect(names(await people('stan.lee@bosco'))).toEqual(['Stan Lee']);
		expect(names(await people('boscotech.net')).length).toBeGreaterThan(0);
		expect(await people('vic')).toEqual([]);
		expect(await people('vic.lee@gmail.com')).toEqual([]);
		expect(await people('gmail')).toEqual([]);
	});
	it('finds a chosen name by that name, the account name or any part of the address, and still never sends the Google photo', async () => {
		for (const q of ['sparky', 'spark', 'jordan', 'hidden', 'jordan.hid', 'dan.hidden@bosco', 'jordan.hidden@boscotech.net']) {
			const rows = await people(q);
			expect(names(rows), q).toEqual(['Sparky']);
			expect(rows[0], q).toMatchObject({ key: sparky.id, name: 'Sparky', email: sparky.email, avatarUrl: null });
		}
		expect(JSON.stringify(await people('spark'))).not.toContain('lh3.example');
	});
	it('positive control: a person with no chosen name or picture is found the same ways, photo and all', async () => {
		expect(names(await people('pat p'))).toEqual(['Pat Plain']);
		const byPart = await people('t.pla');
		expect(names(byPart)).toEqual(['Pat Plain']);
		expect(byPart[0]).toMatchObject({ email: plain.email, avatarUrl: 'https://lh3.example/pat.jpg' });
	});
	it('answers only the owner, and a missing model exactly as one that is not yours', async () => {
		const notYours = await refusal(classmate, 'public.ideacad_share_people($1::uuid, $2)', [doc, 'lee']);
		const missing = await refusal(owner, 'public.ideacad_share_people($1::uuid, $2)', [randomUUID(), 'lee']);
		expect(notYours).toBe('You can only share your own document.');
		expect(missing).toBe(notYours);
		expect(await refusal(stranger, 'public.ideacad_share_people($1::uuid, $2)', [doc, ''])).toBe(notYours);
	});
});

describe('who has this model', () => {
	it('lists the grant made before 0325, by name and email', async () => {
		const list = await access();
		expect(list).toMatchObject({ ok: true, canChange: true, count: 1 });
		expect(list.people).toHaveLength(1);
		expect(list.people[0]).toMatchObject({ key: classmate.id, name: 'Carla Lee', email: classmate.email, role: 'viewer' });
	});
	it('lists the grants made through 0325 by name and email, a chosen picture still in place of the photo', async () => {
		const list = await access(sparky, sparkyDoc);
		expect(list.people.map((p: any) => [p.name, p.email, p.role])).toEqual([['Olive Lee', owner.email, 'viewer'], ['Vic Lee', visitor.email, 'viewer']]);
		expect(before0329.people.map((p: any) => p.key)).toEqual(list.people.map((p: any) => p.key));
	});
	it('answers "does not exist" to a grantee, a stranger and a guessed id alike', async () => {
		const missing = await refusal(owner, 'public.ideacad_direct_document_access($1::uuid)', [randomUUID()]);
		expect(missing).toBe('That document does not exist.');
		expect(await refusal(classmate, 'public.ideacad_direct_document_access($1::uuid)', [doc])).toBe(missing);
		expect(await refusal(stranger, 'public.ideacad_direct_document_access($1::uuid)', [doc])).toBe(missing);
	});
});

describe('share, change and remove many at once', () => {
	it('lands what it can, refuses per row, and the undo puts every change back', async () => {
		const out = await setAccess([
			{ key: mate.id, role: 'editor' },
			{ key: sparky.id, role: 'viewer' },
			{ email: 'Vic.Lee@gmail.com', role: 'viewer' },
			{ email: 'nobody@boscotech.net', role: 'viewer' },
			{ key: owner.id, role: 'viewer' },
			{ key: classmate.id, role: 'banana' }
		]);
		expect(out).toMatchObject({ ok: true, total: 6, succeeded: 3, refused: 3 });
		expect(out.results.map((r: any) => [r.index, r.ok])).toEqual([[0, true], [1, true], [2, true], [3, false], [4, false], [5, false]]);
		expect(out.results[3].reason).toBe('Choose the email address of someone who has signed in.');
		expect(out.results[4].reason).toBe('This document is already yours.');
		expect(out.results[1]).toMatchObject({ name: 'Sparky', email: sparky.email });
		expect(out.access.count).toBe(4);
		expect(out.undo).toHaveLength(3);
		const back = await setAccess(out.undo);
		expect(back.succeeded).toBe(3);
		const after = await access();
		expect(after.people.map((p: any) => [p.name, p.role])).toEqual([['Carla Lee', 'viewer']]);
	});
	it('changes and removes in place, and undoing a removal restores the role', async () => {
		const up = await setAccess([{ key: classmate.id, role: 'editor' }]);
		expect(up.results[0]).toMatchObject({ ok: true, before: 'viewer', role: 'editor', changed: true });
		const gone = await setAccess([{ key: classmate.id, role: 'none' }]);
		expect(gone.access.count).toBe(0);
		expect(gone.undo).toEqual([{ key: classmate.id, role: 'editor' }]);
		const again = await setAccess([{ key: classmate.id, role: 'none' }]);
		expect(again.results[0]).toMatchObject({ ok: true, changed: false });
		expect(again.undo).toEqual([]);
		await setAccess(gone.undo);
		expect((await access()).people.map((p: any) => p.role)).toEqual(['editor']);
	});
	it('one person named twice is acted on once, with the last instruction', async () => {
		const out = await setAccess([{ key: mate.id, role: 'editor' }, { email: mate.email, role: 'viewer' }]);
		expect(out.succeeded).toBe(1);
		expect((await access()).people.find((p: any) => p.key === mate.id).role).toBe('viewer');
		await setAccess([{ key: mate.id, role: 'none' }]);
	});
	it('forty people in one call, with no cap on the model; more than a hundred in one call is refused', async () => {
		const out = await setAccess(crowd.map((u) => ({ key: u.id, role: 'viewer' })));
		expect(out).toMatchObject({ succeeded: 40, refused: 0 });
		expect(out.access.count).toBe(41);
		expect(await refusal(owner, 'public.ideacad_set_direct_document_access($1::uuid, $2::jsonb)',
			[doc, JSON.stringify(Array.from({ length: 101 }, () => ({ key: mate.id, role: 'viewer' })))])).toBe('Share with at most 100 people at a time.');
		await setAccess(out.undo);
		expect((await access()).count).toBe(1);
	});
	it('refuses a caller who is not the owner, writing nothing', async () => {
		const before = (await db.sql('select count(*)::int as n from public.ideacad_grants where document_id = $1', [doc])).rows[0].n;
		expect(await refusal(classmate, 'public.ideacad_set_direct_document_access($1::uuid, $2::jsonb)',
			[doc, JSON.stringify([{ key: stranger.id, role: 'editor' }])])).toBe('You can only share your own document.');
		expect(await refusal(owner, 'public.ideacad_set_direct_document_access($1::uuid, $2::jsonb)', [doc, '{}'])).toBe('Choose who to share with.');
		const after = (await db.sql('select count(*)::int as n from public.ideacad_grants where document_id = $1', [doc])).rows[0].n;
		expect(after).toBe(before);
	});
});

describe('the launch list names the owner', () => {
	it('gives a shared model its owner by chosen name and email, and a model of your own no owner name', async () => {
		const mine = (await call(owner, 'public.ideacad_direct_documents()')) as any[];
		const theirs = mine.find((d) => d.id === sparkyDoc);
		expect(theirs).toMatchObject({ isOwn: false, ownerName: 'Sparky', ownerEmail: sparky.email });
		const own = mine.find((d) => d.id === doc);
		expect(own).toMatchObject({ isOwn: true, ownerName: null });
		const grantee = (await call(classmate, 'public.ideacad_direct_documents()')) as any[];
		expect(grantee.find((d) => d.id === doc)).toMatchObject({ isOwn: false, ownerName: 'Olive Lee', ownerEmail: owner.email });
		// Still only what a caller may read: a stranger has neither model.
		const stranger_ = (await call(stranger, 'public.ideacad_direct_documents()')) as any[];
		expect(stranger_.map((d) => d.id)).not.toContain(doc);
		expect(stranger_.map((d) => d.id)).not.toContain(sparkyDoc);
	});
});
