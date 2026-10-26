// tests/db/classroom-presentations-0312.test.ts
//
// THE PRESENTATION LIST (ledger 0438, feedback 68d4780e), on the real chain.
//
// 0312 is applied OVER SEEDED PRE-MIGRATION DATA (CLAUDE.md's migration rule):
// the tree is booted short of it, a class, its students, a test account, a
// second teacher's class and a posted team draw are made through the real
// pre-0312 functions, then the file is applied, and applied AGAIN (a re-paste
// is ordinary). What fails silently, and so is held here:
//   * who a list may be read and marked by: the class's manager only; a
//     student, another class's teacher and a signed-out caller read the same
//     refusal, and the tables answer no client at all;
//   * who a list carries: the class's active students, never a test account
//     or a student of another class (both directions);
//   * a team list is the posted draw's teams with their members.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL } from './connector-fixture';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

const FILE = '0312_classroom_presentations.sql';
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';
const BEFORE = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < FILE)];
const SQL = readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${FILE}`, import.meta.url)), 'utf8');

let db: TestDb;
let admin: SeededUser;
let other: SeededUser;
let student: SeededUser;
let block2: string;
let otherClass: string;

const rpcAs = async <T = unknown>(u: SeededUser, fn: string, args: unknown[], types: string) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select public.${fn}(${types}) as r`, args)).rows[0].r);

type Queue = { queue: null | { id: string; up: string | null; entries: Array<{ id: string; name: string; status: string; kind: string; members: Array<{ email: string }> }> } };

beforeAll(async () => {
	db = await startTestDb(BEFORE);
	admin = await createUser(db, 'chair@boscotech.edu', 'Chair Person');
	await db.sql(`insert into public.app_admins (email, granted_by) values ('chair@boscotech.edu', 'test') on conflict do nothing`);
	other = await createUser(db, 'colleague@boscotech.edu', 'Colleague Teacher');
	student = await createUser(db, 'ana.reyes@boscotech.net', 'Ana Reyes');
	block2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Block 2', teacherEmail: admin.email });
	otherClass = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering Foundations', label: 'Block 1', teacherEmail: other.email });
	for (const [email, name] of [
		['ana.reyes@boscotech.net', 'Reyes, Ana'],
		['ben.ortiz@boscotech.net', 'Ortiz, Ben'],
		['cara.lim@boscotech.net', 'Lim, Cara'],
		['dan.cho@boscotech.net', 'Cho, Dan'],
		['eli.park@boscotech.net', 'Park, Eli'],
		['fay.diaz@boscotech.net', 'Diaz, Fay'],
		['tester@test.ideabosco.com', 'Test, Account']
	])
		await enrollStudent(db, { as: admin, sectionId: block2, email, displayName: name });
	await enrollStudent(db, { as: admin, sectionId: otherClass, email: 'zed.other@boscotech.net', displayName: 'Other, Zed' });
	await db.sql(`insert into public.test_accounts (email, label, created_by) values ('tester@test.ideabosco.com', 'Tester', 'test') on conflict do nothing`);
	// A posted team draw, through the real pre-0312 function (0307).
	const drawn = await rpcAs<{ ok: boolean }>(admin, 'classroom_draw_teams', [block2, 3, [], 7, true, 'Presentation teams'], '$1::uuid, $2::integer, $3::text[], $4::bigint, $5::boolean, $6::text');
	expect(drawn, JSON.stringify(drawn)).toMatchObject({ ok: true });
	// The file over the top, and again: a re-paste is ordinary.
	await db.sql(SQL);
	await db.sql(SQL);
}, 300_000);
afterAll(async () => db?.stop());

describe('0312 applied over a class that already exists', () => {
	it('a roster list carries the class\'s six students, never the test account or another class\'s student', async () => {
		const started = await rpcAs<{ ok: boolean; entries: number }>(admin, 'classroom_presentation_start', [block2, null, 'Unit 4 talks', 'roster', null], '$1::uuid, $2::uuid, $3::text, $4::text, $5::bigint');
		expect(started).toMatchObject({ ok: true, entries: 6 });
		const q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		const names = q.queue!.entries.map((e) => e.name);
		expect(names).toEqual(['Cho, Dan', 'Diaz, Fay', 'Lim, Cara', 'Ortiz, Ben', 'Park, Eli', 'Reyes, Ana']);
		const text = JSON.stringify(q);
		expect(text).not.toContain('tester@');
		expect(text).not.toContain('zed.other');
		// The first waiting entry is up until one is started.
		expect(q.queue!.up).toBe(q.queue!.entries[0].id);
	});

	it('marking moves who is up; Start puts one up and the old one back to waiting', async () => {
		let q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		const [a, b, c] = q.queue!.entries;
		expect(await rpcAs(admin, 'classroom_presentation_mark', [a.id, 'presented'], '$1::uuid, $2::text')).toMatchObject({ ok: true, previous: 'waiting' });
		await rpcAs(admin, 'classroom_presentation_mark', [b.id, 'absent'], '$1::uuid, $2::text');
		q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		expect(q.queue!.up).toBe(c.id);
		await rpcAs(admin, 'classroom_presentation_mark', [q.queue!.entries[4].id, 'up'], '$1::uuid, $2::text');
		await rpcAs(admin, 'classroom_presentation_mark', [q.queue!.entries[3].id, 'up'], '$1::uuid, $2::text');
		q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		expect(q.queue!.entries.filter((e) => e.status === 'up').map((e) => e.id)).toEqual([q.queue!.entries[3].id]);
		expect(q.queue!.entries[4].status).toBe('waiting');
	});

	it('a move closes the order up around it', async () => {
		let q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		const last = q.queue!.entries[5];
		expect(await rpcAs(admin, 'classroom_presentation_move', [last.id, 1], '$1::uuid, $2::integer')).toMatchObject({ ok: true, previous: 6, position: 1 });
		q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		expect(q.queue!.entries[0].id).toBe(last.id);
		expect(q.queue!.entries.map((e) => (e as unknown as { position: number }).position)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('a team list is the posted draw: each entry a team with its members', async () => {
		const started = await rpcAs<{ ok: boolean; entries: number; closed: number }>(admin, 'classroom_presentation_start', [block2, null, null, 'teams', null], '$1::uuid, $2::uuid, $3::text, $4::text, $5::bigint');
		expect(started.ok).toBe(true);
		expect(started.closed).toBe(1);
		const q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		expect(q.queue!.entries.every((e) => e.kind === 'team')).toBe(true);
		const members = q.queue!.entries.flatMap((e) => e.members.map((m) => m.email));
		expect(members.length).toBe(6);
		expect(members).not.toContain('zed.other@boscotech.net');
	});

	it('nobody but the class\'s manager reads or marks it, and the tables answer no client', async () => {
		const q = await rpcAs<Queue>(admin, 'classroom_presentation_queue', [block2], '$1::uuid');
		const entry = q.queue!.entries[0].id;
		for (const who of [student, other]) {
			await expect(rpcAs(who, 'classroom_presentation_queue', [block2], '$1::uuid')).rejects.toThrow('That class does not exist.');
			await expect(rpcAs(who, 'classroom_presentation_mark', [entry, 'presented'], '$1::uuid, $2::text')).rejects.toThrow('That presentation list does not exist.');
			await expect(db.asUser(who.id, (x) => x(`select count(*) from public.classroom_presentation_entries`))).rejects.toThrow(/permission denied/);
		}
		await expect(db.asAnon((x) => x(`select public.classroom_presentation_queue($1::uuid)`, [block2]))).rejects.toThrow(/permission denied/);
		// The other teacher's own class is theirs: the same function answers them there.
		expect(await rpcAs<Queue>(other, 'classroom_presentation_queue', [otherClass], '$1::uuid')).toEqual({ ok: true, queue: null });
		// And the entry they could not mark is unchanged.
		expect((await db.sql(`select status from public.classroom_presentation_entries where id = $1`, [entry])).rows[0].status).toBe('waiting');
	});
});
