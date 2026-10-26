// tests/db/classroom-team-voice.test.ts
//
// LEDGER 0436, MIGRATION 0307: TEAMS BY VOICE (Mr. Pina's addendum 2).
//
// Part 1, the rules, through the real RPCs over the real chain: the server's
// draw makes teams of 3 and 4 only, never 2 or 5, leaves out whoever is named,
// keeps its seed and is the same draw every time from that seed; a preview
// writes nothing; swap, add, remove and rename; who may do any of it; the
// burn-up board's new name and the draw board's one form.
//
// Part 2, THE JUDGE: through the connector's own call path (`runTool`, the
// MCP server's handler, as the signed-in admin), draw and post a set for a
// fixture class, swap two students, rename a team, assign a role, approve one
// request and send one back. After each call the student's own read reflects
// it, the live notice that wakes an open page was sent, and the change log
// matches a click-made change field for field.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeThrough } from './chain-0436';
import { postSet, rpcOf, seedUnit4, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { runTool } from '../../src/lib/server/connector/tools';

type Draw = {
	ok: boolean;
	reason?: string;
	seed?: string | number;
	size?: number;
	students?: number;
	left_out?: { email: string; name: string }[];
	teams?: { team_number: number; members: { email: string; name: string }[] }[];
	team_set_id?: string;
	names?: string[];
	choices?: unknown[];
};

const sizes = (d: Draw) => (d.teams ?? []).map((t) => t.members.length);

describe('0307 the rules', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	let big: string;
	const preview = (u: SeededUser, section: string, size: number, leaveOut: string[] = [], seed: number | null = 11) =>
		rpc<Draw>(u, 'public.classroom_preview_team_draw($1::uuid, $2::integer, $3::text[], $4::bigint)', [section, size, leaveOut, seed]);

	beforeAll(async () => {
		db = await startTestDb(treeThrough('0307'));
		f = await seedUnit4(db);
		({ rpc, refusal } = rpcOf(db));
		big = await createClassroomSection(db, { as: f.admin, courseCode: 'IDEA209H', courseTitle: 'Engineering Design', label: 'Block 3', teacherEmail: f.admin.email });
		for (let i = 1; i <= 19; i++) {
			const email = `student${String(i).padStart(2, '0')}@boscotech.net`;
			await createUser(db, email, `Student ${i}`);
			await enrollStudent(db, { as: f.admin, sectionId: big, email, displayName: `Student${String(i).padStart(2, '0')}, Pat` });
		}
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('is safe to paste and re-applies; both board forms stand and each answers its own call', async () => {
		expect(pasteTrap(migrationSql('0307'))).toEqual([]);
		await db.sql(migrationSql('0307'));
		const forms = await db.sql<{ args: string }>(
			"select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'classroom_team_board' order by 1"
		);
		expect(forms.rows.map((r) => r.args)).toEqual(['', 'p_section_id uuid']);
		// No payload binds to both: the burn-up board takes nothing, the draw board its class.
		expect((await rpc<{ ok: boolean; teams: unknown[] }>(f.admin, 'public.classroom_team_board()')).ok).toBe(true);
		expect(await rpc<unknown>(f.admin, 'public.classroom_team_board(p_section_id => $1::uuid)', [f.sectionA])).toBeTruthy();
	});

	it('teams of 3 and 4 only, for every class size that allows it, and never 2 or 5', async () => {
		const out = [] as [number, number, number[]][];
		for (const leave of [0, 4, 5, 8, 9, 11, 13, 15, 16]) {
			const absent = Array.from({ length: leave }, (_, i) => `student${String(i + 1).padStart(2, '0')}@boscotech.net`);
			for (const size of [3, 4]) {
				const d = await preview(f.admin, big, size, absent);
				expect(d.ok, `${19 - leave} students, size ${size}`).toBe(true);
				expect(sizes(d).every((n) => n === 3 || n === 4)).toBe(true);
				expect(sizes(d).reduce((a, b) => a + b, 0)).toBe(19 - leave);
				out.push([19 - leave, size, sizes(d)]);
			}
		}
		expect(out.find(([n, s]) => n === 19 && s === 4)?.[2]).toEqual([4, 4, 4, 4, 3]);
		expect(out.find(([n, s]) => n === 10 && s === 3)?.[2]).toEqual([4, 3, 3]);
		// Five cannot be cut into 3s and 4s, so it is refused rather than made a 5 or a 2 and a 3.
		const five = await preview(f.admin, big, 4, Array.from({ length: 14 }, (_, i) => `student${String(i + 1).padStart(2, '0')}@boscotech.net`));
		expect(five).toMatchObject({ ok: false, reason: 'cannot_split', students: 5 });
		expect((await preview(f.admin, big, 5)).reason).toBe('size');
		expect((await preview(f.admin, big, 2)).reason).toBe('size');
	});

	it('the seed is kept and is the draw: the same seed draws the same teams, another seed another', async () => {
		const a = await preview(f.admin, big, 4, [], 424242);
		const b = await preview(f.admin, big, 4, [], 424242);
		const c = await preview(f.admin, big, 4, [], 7);
		expect(String(a.seed)).toBe('424242');
		expect(a.teams).toEqual(b.teams);
		expect(a.teams).not.toEqual(c.teams);
		const fresh = await preview(f.admin, big, 4, [], null);
		expect(Number(fresh.seed)).toBeGreaterThan(0);
		expect((await preview(f.admin, big, 4, [], Number(fresh.seed))).teams).toEqual(fresh.teams);
	});

	it('leave out by address, whole roster name or one word of it; an unknown or ambiguous name is refused', async () => {
		// Eight in Block 2; two left out leaves six, two teams of three.
		const d = await preview(f.admin, f.sectionA, 4, ['ana.perez@boscotech.net', 'Ben Ortiz']);
		expect(d.ok).toBe(true);
		expect(d.left_out?.map((x) => x.email).sort()).toEqual(['ana.perez@boscotech.net', 'ben.ortiz@boscotech.net']);
		const drawn = (d.teams ?? []).flatMap((t) => t.members.map((m) => m.email));
		// Present: the other six. Absent: the two left out.
		expect(drawn).toHaveLength(6);
		expect(drawn.filter((e) => ['ana.perez@boscotech.net', 'ben.ortiz@boscotech.net'].includes(e))).toEqual([]);
		// One word of a roster name is enough.
		const e = await preview(f.admin, f.sectionA, 4, ['cara', 'Shah']);
		expect(e.left_out?.map((x) => x.email).sort()).toEqual(['cara.lin@boscotech.net', 'dev.shah@boscotech.net']);
		expect(await preview(f.admin, f.sectionA, 4, ['nobody'])).toMatchObject({ ok: false, reason: 'unknown_students', names: ['nobody'] });
		expect((await preview(f.admin, big, 4, ['pat'])).reason).toBe('ambiguous');
	});

	it('whoever manages the class is never drawn onto a team, even on its roster', async () => {
		// The class's own teacher and an admin (who manages every class), both enrolled beside the students.
		await db.sql('update public.classroom_sections set teacher_email = $2 where id = $1', [big, f.teacher.email]);
		await enrollStudent(db, { as: f.admin, sectionId: big, email: f.teacher.email, displayName: 'Cosso, M' });
		await enrollStudent(db, { as: f.admin, sectionId: big, email: f.admin.email, displayName: 'Pina, A' });
		const d = await preview(f.teacher, big, 4);
		const drawn = (d.teams ?? []).flatMap((t) => t.members.map((m) => m.email));
		// Present: the nineteen students. Absent: both of them.
		expect(drawn).toHaveLength(19);
		expect(drawn).not.toContain(f.teacher.email);
		expect(drawn).not.toContain(f.admin.email);
		await db.sql('update public.classroom_sections set teacher_email = $2 where id = $1', [big, f.admin.email]);
	});

	it('a preview writes nothing; a draw saves the same teams from the seed and posts them when asked', async () => {
		const count = async () => Number((await db.sql<{ n: string }>('select count(*)::text as n from public.classroom_team_sets')).rows[0].n);
		const before = await count();
		const p = await preview(f.admin, f.sectionA, 4, [], 99);
		expect(await count()).toBe(before);
		const d = await rpc<Draw & { posted: boolean }>(f.admin, 'public.classroom_draw_teams($1::uuid, $2::integer, $3::text[], $4::bigint, $5, $6)', [
			f.sectionA, 4, [], 99, true, 'Launcher teams'
		]);
		expect(d).toMatchObject({ ok: true, posted: true });
		expect(await count()).toBe(before + 1);
		const saved = await db.sql<{ n: number; email: string }>(
			'select t.team_number as n, m.student_email as email from public.classroom_teams t join public.classroom_team_members m on m.team_id = t.id where t.team_set_id = $1 order by 1, 2',
			[d.team_set_id]
		);
		const expected = (p.teams ?? []).flatMap((t) => t.members.map((m) => ({ n: t.team_number, email: m.email }))).sort((x, y) => x.n - y.n || x.email.localeCompare(y.email));
		expect(saved.rows).toEqual(expected);
		const set = await db.sql('select label, seed::text as seed, mode, mode_value from public.classroom_team_sets where id = $1', [d.team_set_id]);
		expect(set.rows[0]).toEqual({ label: 'Launcher teams', seed: '99', mode: 'size', mode_value: 4 });
		const current = await db.sql<{ id: string }>('select public._classroom_section_team_set($1) as id', [f.sectionA]);
		expect(current.rows[0].id).toBe(d.team_set_id);
	});

	it('swap trades two students; add, remove an empty team, refuse one with people or work; rename returns the old name', async () => {
		const set = (await db.sql<{ id: string }>('select public._classroom_section_team_set($1) as id', [f.sectionA])).rows[0].id;
		const teamOf = async (email: string) =>
			(await db.sql<{ team_id: string }>('select team_id from public.classroom_team_members where team_set_id = $1 and student_email = $2', [set, email])).rows[0].team_id;
		const [x, y] = await db.sql<{ email: string; team_id: string }>(
			'select distinct on (team_id) student_email as email, team_id from public.classroom_team_members where team_set_id = $1 order by team_id, student_email',
			[set]
		).then((r) => r.rows);
		expect(await rpc(f.admin, 'public.classroom_swap_team_members($1::uuid, $2, $3)', [set, x.email, y.email])).toMatchObject({ ok: true });
		expect(await teamOf(x.email)).toBe(y.team_id);
		expect(await teamOf(y.email)).toBe(x.team_id);
		expect(await rpc(f.admin, 'public.classroom_swap_team_members($1::uuid, $2, $3)', [set, x.email, x.email])).toEqual({ ok: false, reason: 'same_team' });

		const added = await rpc<{ ok: boolean; team_id: string; team_number: number }>(f.admin, 'public.classroom_add_team($1::uuid, $2)', [set, 'Volt']);
		expect(added.ok).toBe(true);
		expect(await rpc(f.admin, 'public.classroom_remove_team($1::uuid)', [x.team_id])).toEqual({ ok: false, reason: 'not_empty' });
		await db.sql(`insert into public.classroom_team_answers (team_id, item_id, block_id, value, updated_by) values ($1, $2, 'goal', '{"text":"x"}', 'x@boscotech.net')`, [added.team_id, f.item]);
		expect(await rpc(f.admin, 'public.classroom_remove_team($1::uuid)', [added.team_id])).toEqual({ ok: false, reason: 'has_work' });
		await db.sql('delete from public.classroom_team_answers where team_id = $1', [added.team_id]);
		expect(await rpc(f.admin, 'public.classroom_remove_team($1::uuid)', [added.team_id])).toEqual({ ok: true, removed: true });

		expect(await rpc(f.admin, 'public.classroom_rename_team($1::uuid, $2)', [x.team_id, 'Torque'])).toEqual({ ok: true, name: 'Torque', previous: null });
		expect(await rpc(f.admin, 'public.classroom_rename_team($1::uuid, $2)', [x.team_id, ''])).toEqual({ ok: true, name: null, previous: 'Torque' });
	});

	it('only a manager of the class: a teacher of another class and a student are refused everywhere, and nothing is written', async () => {
		const set = (await db.sql<{ id: string }>('select public._classroom_section_team_set($1) as id', [f.sectionA])).rows[0].id;
		const team = (await db.sql<{ id: string }>('select id from public.classroom_teams where team_set_id = $1 order by team_number limit 1', [set])).rows[0].id;
		const before = await db.sql('select count(*)::int as n from public.classroom_team_sets');
		for (const who of [f.teacher, f.a[0]]) {
			expect(await refusal(who, 'public.classroom_preview_team_draw($1::uuid, 4, $2::text[], 1)', [f.sectionA, []])).toMatch(/That class does not exist/);
			expect(await refusal(who, 'public.classroom_draw_teams($1::uuid, 4, $2::text[], 1, true, null)', [f.sectionA, []])).toMatch(/That class does not exist/);
			expect(await refusal(who, 'public.classroom_swap_team_members($1::uuid, $2, $3)', [set, f.a[0].email, f.a[5].email])).toMatch(/Team set not found/);
			expect(await refusal(who, 'public.classroom_add_team($1::uuid, null)', [set])).toMatch(/Team set not found/);
			expect(await refusal(who, 'public.classroom_remove_team($1::uuid)', [team])).toMatch(/That team does not exist/);
			expect(await refusal(who, 'public.classroom_rename_team($1::uuid, $2)', [team, 'Mine'])).toMatch(/That team does not exist/);
		}
		// Present: the Block 4 teacher draws for Block 4.
		expect((await preview(f.teacher, f.sectionB, 3)).ok).toBe(true);
		expect((await db.sql('select count(*)::int as n from public.classroom_team_sets')).rows).toEqual(before.rows);
	});
});

describe('0307 the judge: the connector’s own call path, as a student sees it', () => {
	let w: ConnectorWorld;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];

	const call = async (name: string, args: Record<string, unknown>, said: string) => {
		const ctx = await w.ctx(f.admin);
		const first = (await runTool(ctx, 'site_call', { name, args, said, request_id: crypto.randomUUID() })) as Record<string, unknown>;
		if (first.status !== 'preview') return first;
		const ctx2 = await w.ctx(f.admin);
		return (await runTool(ctx2, 'site_call', { name, args, said, request_id: crypto.randomUUID(), confirm_token: first.confirm_token })) as Record<string, unknown>;
	};
	/** Live notices sent on one channel: a section id, or `team-<id>` for one team. */
	const notices = async (key: string) =>
		Number((await w.db.sql<{ n: string }>('select count(*)::text as n from realtime.messages where topic = $1', [`classroom-live:${key}`])).rows[0].n);
	const doc = (u: SeededUser) => rpc<{ team: { id: string; name: string } | null; reason?: string }>(u, 'public.classroom_team_document($1::uuid)', [f.item]);
	/** A change-log row as a reader compares two: everything but ids, people and times. */
	const shape = (r: Record<string, unknown>, keepNote = true) => ({
		kind: r.kind,
		before: r.before === null ? null : 'set',
		after: r.after === null ? null : 'set',
		...(keepNote ? { note: r.note } : {})
	});
	const rawSince = async (team: string, at: string) =>
		(await w.db.sql('select kind, actor_email, before, after, note from public.classroom_team_log where team_id = $1 and at > $2 order by id', [team, at])).rows;
	const logSince = async (team: string, at: string) => (await rawSince(team, at)).map((r) => shape(r));
	const now = async () => (await w.db.sql<{ t: string }>('select clock_timestamp()::text as t')).rows[0].t;

	beforeAll(async () => {
		w = await connectorWorld();
		// Its own course, beside the connector world's IDEA209H blocks.
		f = await seedUnit4(w.db, { dueAt: '2026-11-16T07:00:00Z', courseCode: 'IDEA209U' });
		({ rpc } = rpcOf(w.db));
	}, 240_000);

	afterAll(async () => {
		await w?.stop();
	});

	let set = '';
	let teams: { id: string; members: string[] }[] = [];

	it('draw, read the teams back, then post: the student lands in their team', async () => {
		expect((await doc(f.a[0])).team).toBeNull();
		const read = await call('classroom_preview_team_draw', { p_section_id: f.sectionA, p_size: 4, p_leave_out: [], p_seed: 5669 }, 'draw teams of four for Block 2');
		expect(read.status).toBe('ok');
		const drawn = (read.result as Draw).teams!;
		expect(drawn.map((t) => t.members.length)).toEqual([4, 4]);
		const teamsNotices = await notices(f.sectionA);
		const done = await call(
			'classroom_draw_teams',
			{ p_section_id: f.sectionA, p_size: 4, p_leave_out: [], p_seed: 5669, p_post: true, p_label: 'Launcher teams' },
			'post it'
		);
		expect(done.status, JSON.stringify(done)).toBe('done');
		expect(await notices(f.sectionA)).toBeGreaterThan(teamsNotices);
		set = (await w.db.sql<{ id: string }>("select id from public.classroom_team_sets where label = 'Launcher teams' and seed = 5669")).rows[0].id;
		teams = (
			await w.db.sql<{ id: string; members: string[] }>(
				'select t.id, array_agg(m.student_email order by m.student_email) as members from public.classroom_teams t join public.classroom_team_members m on m.team_id = t.id where t.team_set_id = $1 group by t.id, t.team_number order by t.team_number',
				[set]
			)
		).rows;
		expect(teams.map((t) => t.members)).toEqual(drawn.map((t) => t.members.map((m) => m.email).sort()));
		const mine = teams.find((t) => t.members.includes(f.a[0].email))!;
		expect((await doc(f.a[0])).team?.id).toBe(mine.id);
		// A student in the other class is unaffected.
		expect((await doc(f.b[0])).team).toBeNull();
	});

	it('swap two students: each one’s document switches, and the log is the two moves a click makes', async () => {
		const [t1, t2] = teams;
		const a = t1.members[0];
		const b = t2.members[0];
		const at = await now();
		const n = await notices(f.sectionA);
		expect((await call('classroom_swap_team_members', { p_team_set_id: set, p_first: a, p_second: b }, 'swap them'))?.status).toBe('done');
		expect(await notices(f.sectionA)).toBeGreaterThan(n);
		const ua = f.a.find((u) => u.email === a)!;
		expect((await doc(ua)).team?.id).toBe(t2.id);
		const voiced = [...(await logSince(t1.id, at)), ...(await logSince(t2.id, at))];
		// The click: the People tab moves two other students, one at a time.
		const at2 = await now();
		const c = t1.members[1];
		const d = t2.members[1];
		await rpc(f.admin, 'public.classroom_move_team_member($1::uuid, $2, $3::uuid)', [set, c, t2.id]);
		await rpc(f.admin, 'public.classroom_move_team_member($1::uuid, $2, $3::uuid)', [set, d, t1.id]);
		const clicked = [...(await logSince(t1.id, at2)), ...(await logSince(t2.id, at2))];
		expect(voiced.length).toBeGreaterThan(0);
		expect(voiced).toEqual(clicked);
		// Put the click back, so the teams are the draw plus the one voiced swap.
		await rpc(f.admin, 'public.classroom_move_team_member($1::uuid, $2, $3::uuid)', [set, c, t1.id]);
		await rpc(f.admin, 'public.classroom_move_team_member($1::uuid, $2, $3::uuid)', [set, d, t2.id]);
	});

	it('rename a team: the student’s document carries the new name', async () => {
		const mine = (await doc(f.a[0])).team!;
		const n = await notices(f.sectionA);
		expect((await call('classroom_rename_team', { p_team_id: mine.id, p_name: 'Torque' }, 'call it Torque')).status).toBe('done');
		expect(await notices(f.sectionA)).toBeGreaterThan(n);
		expect((await doc(f.a[0])).team?.name).toBe('Torque');
	});

	it('assign a role: it asks first, the student’s plan shows the owner, and the log matches the plan page’s own change', async () => {
		const mine = (await doc(f.a[0])).team!;
		const members = (await w.db.sql<{ email: string }>('select student_email as email from public.classroom_team_members where team_id = $1 order by 1', [mine.id])).rows.map((r) => r.email);
		const ctx = await w.ctx(f.admin);
		const first = (await runTool(ctx, 'site_call', { name: 'classroom_team_set_role', args: { p_team_id: mine.id, p_role_id: 'drive', p_owner_email: members[0] }, said: 'give the drive to them', request_id: crypto.randomUUID() })) as Record<string, unknown>;
		expect(first.status).toBe('preview');
		const at = await now();
		const n = await notices(`team-${mine.id}`);
		const done = await call('classroom_team_set_role', { p_team_id: mine.id, p_role_id: 'drive', p_owner_email: members[0] }, 'give the drive to them');
		expect(done.status, JSON.stringify(done)).toBe('done');
		expect(await notices(`team-${mine.id}`)).toBeGreaterThan(n);
		const voiced = await rawSince(mine.id, at);
		expect(voiced.map((r) => [r.kind, r.actor_email, r.note])).toEqual([['role', f.admin.email, 'drive']]);
		const plan = await rpc<{ members: { key: string; name: string }[]; roles: { id: string; owner: string | null }[] }>(f.a[0], 'public.classroom_team_plan($1::uuid, null)', [f.sectionA]);
		const ownerKey = plan.roles.find((r) => r.id === 'drive')?.owner;
		expect(ownerKey).toBeTruthy();
		// The click: a student sets the next role from the plan page.
		const at2 = await now();
		await rpc(f.a[0], 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [mine.id, 'frame', plan.members[1].key]);
		const clicked = await rawSince(mine.id, at2);
		// Field for field, the role's own id aside (it names which role, and the two set different roles).
		expect(voiced.map((r) => shape(r, false))).toEqual(clicked.map((r) => shape(r, false)));
		expect(clicked.map((r) => r.note)).toEqual(['frame']);
	});

	it('approve one request and send one back: the team reads the decision, and the log matches the queue’s own taps', async () => {
		const [t1, t2] = teams;
		// Read from the database, not the draw: the swap above moved two of them.
		const owner1 = (await w.db.sql<{ email: string }>('select student_email as email from public.classroom_team_members where team_id = $1 order by 1 limit 1', [t1.id])).rows[0].email;
		const owner2 = (await w.db.sql<{ email: string }>('select student_email as email from public.classroom_team_members where team_id = $1 order by 1 limit 1', [t2.id])).rows[0].email;
		await rpc(f.admin, 'public.classroom_team_set_role($1::uuid, $2, $3)', [t2.id, 'drive', owner2]);
		const u1 = f.a.find((u) => u.email === owner1)!;
		const u2 = f.a.find((u) => u.email === owner2)!;
		expect(await rpc(u1, 'public.classroom_signoff_request($1::uuid, $2)', [t1.id, 'design'])).toMatchObject({ ok: true });
		expect(await rpc(u2, 'public.classroom_signoff_request($1::uuid, $2)', [t2.id, 'design'])).toMatchObject({ ok: true });
		const queue = await call('classroom_signoff_queue', {}, 'read the sign-off queue');
		expect(queue.status).toBe('ok');
		const reqs = (queue.result as { requests: { id: string; team: { id: string } }[] }).requests;
		const r1 = reqs.find((r) => r.team.id === t1.id)!;
		const r2 = reqs.find((r) => r.team.id === t2.id)!;

		const at = await now();
		const n = await notices(`team-${t1.id}`);
		const approve = await call('classroom_signoff_decide', { p_request_id: r1.id, p_results: { aluminum: true, mount: true }, p_approve: true }, 'approve their design');
		expect(approve.status, JSON.stringify(approve)).toBe('done');
		expect(await notices(`team-${t1.id}`)).toBeGreaterThan(n);
		const p1 = await rpc<{ checkpoints: { key: string; state: string; decision: { by: string } | null }[] }>(u1, 'public.classroom_team_plan($1::uuid, null)', [f.sectionA]);
		expect(p1.checkpoints.find((c) => c.key === 'design')).toMatchObject({ state: 'approved', decision: { by: 'A. Pina' } });

		const at2 = await now();
		const back = await call('classroom_signoff_decide', { p_request_id: r2.id, p_results: { aluminum: false, mount: true }, p_approve: false }, 'send them back, the structure is not aluminum');
		expect(back.status, JSON.stringify(back)).toBe('done');
		const p2 = await rpc<{ checkpoints: { key: string; state: string }[]; tasks: { kind: string; title: string }[] }>(u2, 'public.classroom_team_plan($1::uuid, null)', [f.sectionA]);
		expect(p2.checkpoints.find((c) => c.key === 'design')?.state).toBe('sent-back');
		expect(p2.tasks.filter((t) => t.kind === 'sendback').map((t) => t.title)).toEqual(['Fix: The structure is aluminum, with wood only for a minor part']);

		const voicedApprove = await logSince(t1.id, at);
		const voicedBack = await logSince(t2.id, at2);
		// The click: the queue's own taps decide the same two checkpoints again on a fresh pair of requests.
		expect(await rpc(u2, 'public.classroom_signoff_request($1::uuid, $2)', [t2.id, 'design'])).toMatchObject({ ok: true });
		const again = (await rpc<{ requests: { id: string; team: { id: string } }[] }>(f.admin, 'public.classroom_signoff_queue()')).requests.find((r) => r.team.id === t2.id)!;
		const at3 = await now();
		await rpc(f.admin, 'public.classroom_signoff_decide($1::uuid, $2::jsonb, $3)', [again.id, JSON.stringify({ aluminum: false, mount: true }), false]);
		expect(voicedBack).toEqual(await logSince(t2.id, at3));
		expect(voicedApprove.map((r) => r.kind)).toEqual(['signoff-approved']);
		expect(voicedApprove[0].note).toBe('Design approved by A. Pina');
	});
});
