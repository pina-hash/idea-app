// tests/db/classroom-team-signoffs-0323.test.ts
//
// LEDGER 0456, MIGRATION 0323: TEAM POSTS KEEP THEIR DRAW, SIGN-OFFS CAN BE
// DECIDED FROM THE POST, SEEDED TASKS CARRY DATES, A SMALL TEAM CAN BALANCE,
// AND PHASES OPEN PER TEAM.
//
// The production case, replayed: the chain short of 0323, the Unit 4 fixture
// with answers, a sign-off request and seeded tasks written through the real
// pre-0323 RPCs, then 0323 applied over that data. Held, both directions
// counted:
//   - a team post pins the draw it uses: a new draw posted later leaves a used
//     post on its old teams with every answer, and moves an unused one;
//   - a draw past its end time keeps the post open; taken down it closes for
//     students and stays gradable for the instructor;
//   - who may decide from the teams panel (a manager of the class; Mr. Pina
//     alone for an owner-only checkpoint), approving over a failed check only
//     with a note, and the checklist names who is missing what;
//   - seeded tasks take their date from the post; a team smaller than its
//     roles balances on its own roles plus an even share;
//   - a phase opens for the team whose sign-off is approved, and only that one.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeShortOf } from './chain-0436';
import { documentFor, postSet, rpcOf, seedUnit4, teamManifest, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';

const LEVELS = (top: number) => [
	{ points: top, label: 'Complete', short: 'All there', descriptor: 'Every part is present.' },
	{ points: Math.floor(top / 2), label: 'Developing', short: 'Half there', descriptor: 'Half the parts are present.' },
	{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing is present.' }
];

/**
 * The fixture's post, reshaped for this file: role modules carry most of the
 * points (so a team of three with four roles is "uneven" by the old rule),
 * Design checks the whole post, and a Build phase opens after a far-off
 * checkpoint.
 */
function manifest0323() {
	const m = teamManifest() as unknown as {
		points: number;
		team: { checkpoints: { id: string; title: string; date: string; items: Record<string, unknown>[] }[] };
		modules: Record<string, unknown>[];
	};
	m.team.checkpoints[1].items.unshift({ id: 'complete', kind: 'auto', check: 'assignment-complete', text: 'Every part of the post is done' });
	m.team.checkpoints.push({
		id: 'build',
		title: 'Build',
		date: '2030-01-07',
		items: [{ id: 'safe', kind: 'tap', text: 'Safe to build' }]
	});
	m.modules = m.modules.map((mod) => {
		if (mod.id === 'shared') return { ...mod, points: 10, criteria: [{ id: 'c1', text: 'Goal', points: 10, levels: LEVELS(10) }] };
		if (mod.audience === 'role') return { ...mod, points: 30, criteria: [{ id: 'c1', text: 'Requirement', points: 30, levels: LEVELS(30) }] };
		if (mod.id === 'mine') return { ...mod, points: 10, criteria: [{ id: 'c1', text: 'Reflection', points: 10, levels: LEVELS(10) }] };
		return mod;
	});
	m.modules.push({
		id: 'proto',
		title: 'Prototype',
		points: 10,
		audience: 'team',
		opensAfter: 'build',
		blocks: [{ id: 'proto-note', field: 'protoNote', type: 'text', optional: true }],
		criteria: [{ id: 'c1', text: 'Prototype', points: 10, levels: LEVELS(10) }]
	});
	m.points = 10 + 4 * 30 + 10 + 10;
	return m as unknown as ReturnType<typeof teamManifest>;
}

type Doc = { team: { id: string } | null; reason?: string; values: Record<string, { value: unknown }>; phases?: Record<string, { open: boolean }> };
type Plan = {
	members: { key: string; name: string; me: boolean }[];
	tasks: { id: string; kind: string; block_id: string | null; role_id: string | null; owner: string | null; due_on: string | null; points: number }[];
	balance: { balanced: boolean; rule?: string; members: { key: string; points: number; expected?: number }[] };
	checkpoints: { key: string; auto: Record<string, boolean>; missing?: Record<string, { who: string; block: string }[]> }[];
};

describe('0323 team sign-offs and draw pins', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	let setA2: string;
	let setB2: string;
	const doc = (u: SeededUser) => rpc<Doc>(u, 'public.classroom_team_document($1::uuid)', [f.item]);
	const save = (u: SeededUser, block: string, text: string) =>
		rpc<{ ok: boolean; reason?: string }>(u, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [f.item, block, JSON.stringify({ text })]);
	const plan = (u: SeededUser, section: string, team: string | null = null) =>
		rpc<Plan>(u, 'public.classroom_team_plan($1::uuid, $2::uuid)', [section, team]);
	const teacherDecide = (u: SeededUser, team: string, key: string, results: Record<string, boolean>, approve: boolean, note: string | null) =>
		rpc<{ ok: boolean; reason?: string; items?: string[] }>(
			u,
			'public.classroom_signoff_teacher_decide($1::uuid, $2, $3::jsonb, $4, $5)',
			[team, key, JSON.stringify(results), approve, note]
		);
	const saveSet = (as: SeededUser, section: string, teams: SeededUser[][]) =>
		rpc<string>(as, 'public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb)', [
			section,
			'Next teams',
			777,
			'count',
			teams.length,
			JSON.stringify(teams.map((members, i) => ({ team_number: i + 1, members: members.map((m) => m.email) })))
		]);
	const teamOf = async (set: string, email: string) =>
		(
			await db.sql<{ team_id: string }>('select team_id from public.classroom_team_members where team_set_id = $1 and student_email = $2', [set, email])
		).rows[0].team_id;

	beforeAll(async () => {
		db = await startTestDb(treeShortOf('0323'));
		// No due date, as Launcher: Design is posted: the seeded tasks are undated.
		f = await seedUnit4(db);
		({ rpc, refusal } = rpcOf(db));
		const m = manifest0323();
		await rpc(f.admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [f.item, documentFor(m), JSON.stringify(m), 'plan.html']);
		await postSet(db, f.admin, f.setA);
		await postSet(db, f.teacher, f.setB);
		// PRE-0323 DATA, through the real RPCs: team A1 answers a team box and
		// requests nothing; every team reads its plan once, so its seeded tasks
		// are stored (undated, as 0303 stored them).
		await save(f.a[0], 'goal', 'Far and straight');
		for (const u of [f.a[0], f.a[4]]) await plan(u, f.sectionA);
		await plan(f.b[0], f.sectionB);
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('before 0323 a newer draw moves the post to new teams (the bug, measured)', async () => {
		const probe = await saveSet(f.admin, f.sectionA, [[f.a[0], f.a[4], f.a[5]], [f.a[1], f.a[2], f.a[3], f.a[6]]]);
		await postSet(db, f.admin, probe);
		const d = await doc(f.a[0]);
		expect(d.team?.id).not.toBe(f.teamA1);
		expect(d.team?.id).toBe(await teamOf(probe, f.a[0].email));
		// Put the class back as it was in production: the probe draw retired.
		await rpc(f.admin, 'public.classroom_archive_team_set($1::uuid)', [probe]);
		expect((await doc(f.a[0])).team?.id).toBe(f.teamA1);
	});

	it('is safe to paste, pins every stored team post and re-applies', async () => {
		expect(pasteTrap(migrationSql('0323'))).toEqual([]);
		await db.sql(migrationSql('0323'));
		await db.sql(migrationSql('0323'));
		const { rows } = await db.sql<{ section_id: string; team_set_id: string }>(
			'select section_id, team_set_id from public.classroom_team_post_draws where item_id = $1 order by section_id',
			[f.item]
		);
		expect(rows.map((r) => [r.section_id, r.team_set_id]).sort()).toEqual(
			[
				[f.sectionA, f.setA],
				[f.sectionB, f.setB]
			].sort()
		);
	});

	it('a newer draw leaves a used post on its teams with every answer, and moves an unused one', async () => {
		setA2 = await saveSet(f.admin, f.sectionA, [[f.a[0], f.a[4], f.a[5]], [f.a[1], f.a[2], f.a[3], f.a[6]]]);
		await postSet(db, f.admin, setA2);
		setB2 = await saveSet(f.teacher, f.sectionB, [[f.b[0], f.b[1], f.b[2]]]);
		await postSet(db, f.teacher, setB2);
		// Section A was used (a team answer): A1 keeps the post and its answer.
		const ana = await doc(f.a[0]);
		expect(ana.team?.id).toBe(f.teamA1);
		expect((ana.values.goal?.value as { text: string }).text).toBe('Far and straight');
		const eli = await doc(f.a[4]);
		expect(eli.team?.id).toBe(f.teamA2);
		expect(eli.values.goal).toBeUndefined();
		// Section B was unused: it moved to the new draw.
		expect((await doc(f.b[0])).team?.id).toBe(await teamOf(setB2, f.b[0].email));
		expect((await doc(f.b[0])).team?.id).not.toBe(f.teamB1);
	});

	it('a draw past its end keeps the post open; taken down it closes for students, never for grading', async () => {
		await db.sql(`update public.classroom_team_sets set posted_at = now() - interval '2 minutes', visible_until = now() - interval '1 minute' where id = $1`, [f.setA]);
		expect((await doc(f.a[0])).team?.id).toBe(f.teamA1);
		expect((await save(f.a[1], 'method', 'Flywheel')).ok).toBe(true);
		await rpc(f.admin, 'public.classroom_unpost_team_set($1::uuid)', [f.setA]);
		expect((await doc(f.a[0])).reason).toBe('not_posted');
		expect(await save(f.a[0], 'goal', 'after unpost')).toEqual({ ok: false, reason: 'not_posted' });
		// The instructor still sees the post's own teams and can open the grading screen.
		type Teams = { sections: { section_id: string; team_set_id: string; teams: { id: string }[] }[] };
		const t = await rpc<Teams>(f.admin, 'public.classroom_item_teams($1::uuid)', [f.item]);
		const a = t.sections.find((s) => s.section_id === f.sectionA)!;
		expect(a.team_set_id).toBe(f.setA);
		expect(a.teams.map((x) => x.id).sort()).toEqual([f.teamA1, f.teamA2].sort());
		const g = await rpc<{ team: { id: string } | null }>(f.admin, 'public.classroom_team_grading($1::uuid, $2::uuid)', [f.item, f.teamA1]);
		expect(g.team?.id).toBe(f.teamA1);
		// The People tab's warning reads which posts the draw still holds.
		const uses = await rpc<{ posts: { item_id: string; ungraded: number }[] }>(f.admin, 'public.classroom_team_set_uses($1::uuid)', [f.setA]);
		expect(uses.posts).toEqual([expect.objectContaining({ item_id: f.item, ungraded: 7 })]);
		expect(await refusal(f.teacher, 'public.classroom_team_set_uses($1::uuid)', [f.setA])).toMatch(/not found/);
		await postSet(db, f.admin, f.setA);
		expect((await doc(f.a[0])).team?.id).toBe(f.teamA1);
	});

	it('seeded tasks take their date from the post, stored ones included', async () => {
		const p = await plan(f.a[0], f.sectionA, f.teamA1);
		const due = (block: string) => p.tasks.filter((t) => t.block_id === block).map((t) => t.due_on);
		expect(due('frame-text')).toEqual(['2026-10-28']);
		expect(due('goal')).toEqual(['2026-11-02']);
		expect(new Set(due('reflect'))).toEqual(new Set(['2026-11-02']));
		expect(p.tasks.filter((t) => t.kind === 'seed' && t.due_on === null)).toEqual([]);
	});

	it('a team of three with four roles balances on its own roles plus an even share', async () => {
		const team = await teamOf(setB2, f.b[0].email);
		let p = await plan(f.b[0], f.sectionB, team);
		const key = (u: SeededUser) => p.members.find((m) => m.name === u.email.split('.')[0].replace(/^./, (c) => c.toUpperCase()))!.key;
		const [k0, k1, k2] = [key(f.b[0]), key(f.b[1]), key(f.b[2])];
		for (const [role, k] of [
			['frame', k0],
			['energy', k0],
			['drive', k1],
			['ballpath', k2]
		] as const) {
			await rpc(f.b[0], 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [team, role, k]);
		}
		p = await plan(f.b[0], f.sectionB, team);
		const task = (block: string) => p.tasks.find((t) => t.block_id === block)!.id;
		await rpc(f.b[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [task('goal'), k1]);
		await rpc(f.b[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [task('method'), k2]);
		p = await plan(f.b[0], f.sectionB, team);
		// Ivy 60 + 10, Jay 30 + 10 + 5, Kai 30 + 10 + 5: the old even rule (53.3
		// each) reads Ivy at 1.31, uneven; her own roles plus a share does not.
		const pts = Object.fromEntries(p.balance.members.map((m) => [m.key, m.points]));
		expect([pts[k0], pts[k1], pts[k2]]).toEqual([70, 45, 45]);
		expect(p.balance.rule).toBe('roles');
		expect(p.balance.balanced).toBe(true);
		const exp = Object.fromEntries(p.balance.members.map((m) => [m.key, m.expected]));
		expect([exp[k0], exp[k1], exp[k2]]).toEqual([73.33, 43.33, 43.33]);
		// A team box with no owner is still never balanced.
		await rpc(f.b[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [task('goal'), null]);
		expect((await plan(f.b[0], f.sectionB, team)).balance.balanced).toBe(false);
		// Section A's four-member team keeps the even rule.
		expect((await plan(f.a[0], f.sectionA, f.teamA1)).balance.rule).toBe('even');
	});

	it('the checklist names who is missing what, in the plan and the teams panel', async () => {
		const p = await plan(f.a[0], f.sectionA, f.teamA1);
		const design = p.checkpoints.find((c) => c.key === 'design')!;
		expect(design.auto.complete).toBe(false);
		const missing = design.missing!.complete;
		const who = (block: string) => missing.filter((x) => x.block === block).map((x) => x.who).sort();
		expect(who('reflect')).toEqual(['Ana', 'Ben', 'Cara', 'Dev']);
		expect(who('goal')).toEqual([]);
		expect(who('frame-text')).toEqual(['No owner yet']);
		await save(f.a[0], 'reflect', 'I learned');
		const after = (await plan(f.a[0], f.sectionA, f.teamA1)).checkpoints.find((c) => c.key === 'design')!.missing!.complete;
		expect(after.filter((x) => x.block === 'reflect').map((x) => x.who).sort()).toEqual(['Ben', 'Cara', 'Dev']);
	});

	it('the teams panel: a manager reads their own classes only, a student none', async () => {
		type Board = { sections: { section_id: string; teams: { id: string; checkpoints: { key: string; items: { id: string; missing: unknown }[] }[]; parts: { id: string; done: number; total: number }[] }[] }[] };
		const admin = await rpc<Board>(f.admin, 'public.classroom_item_signoff_board($1::uuid)', [f.item]);
		expect(admin.sections.map((s) => s.section_id).sort()).toEqual([f.sectionA, f.sectionB].sort());
		const a1 = admin.sections.find((s) => s.section_id === f.sectionA)!.teams.find((t) => t.id === f.teamA1)!;
		expect(a1.parts.find((x) => x.id === 'shared')).toMatchObject({ done: 2, total: 2 });
		expect(a1.parts.find((x) => x.id === 'frame-req')).toMatchObject({ done: 0, total: 1 });
		const cosso = await rpc<Board>(f.teacher, 'public.classroom_item_signoff_board($1::uuid)', [f.item]);
		expect(cosso.sections.map((s) => s.section_id)).toEqual([f.sectionB]);
		const student = await rpc<Board>(f.a[0], 'public.classroom_item_signoff_board($1::uuid)', [f.item]);
		expect(student.sections).toEqual([]);
	});

	it('teacher decide: a manager of the class only; owner-only to Mr. Pina; a failed check needs a note', async () => {
		// Nobody outside the team's class decides, and a student decides nothing.
		expect(await refusal(f.teacher, 'public.classroom_signoff_teacher_decide($1::uuid, $2, $3::jsonb, $4, $5)', [f.teamA1, 'design', '{}', true, 'x'])).toMatch(/does not exist/);
		expect(await refusal(f.a[0], 'public.classroom_signoff_teacher_decide($1::uuid, $2, $3::jsonb, $4, $5)', [f.teamA1, 'design', '{}', true, 'x'])).toMatch(/does not exist/);
		// Plan carries an owner-only item: Block 4's teacher cannot approve it there.
		const teamB = await teamOf(setB2, f.b[0].email);
		expect((await teacherDecide(f.teacher, teamB, 'plan', {}, true, 'ok')).reason).toBe('owner_only');
		// A failed check (empty boxes) with no note is refused, naming the items.
		const taps = { aluminum: true, mount: true };
		const bare = await teacherDecide(f.admin, f.teamA1, 'design', taps, true, null);
		expect(bare).toMatchObject({ ok: false, reason: 'note_needed', items: ['complete'] });
		const { rows: none } = await db.sql('select 1 from public.classroom_signoff_requests where team_id = $1 and checkpoint_key = $2', [f.teamA1, 'design']);
		expect(none.length).toBe(0);
		// With a note it is approved: one request, the 0086 rows, the note kept.
		expect(await teacherDecide(f.admin, f.teamA1, 'design', taps, true, 'Ben was out sick')).toMatchObject({ ok: true, status: 'approved' });
		const { rows } = await db.sql<{ status: string; note: string }>(
			'select status, note from public.classroom_signoff_requests where team_id = $1 and checkpoint_key = $2',
			[f.teamA1, 'design']
		);
		expect(rows).toEqual([{ status: 'approved', note: expect.stringMatching(/^Approved over: Every part of the post is done\. Ben was out sick$/) }]);
		const { rows: appr } = await db.sql('select student_email from public.classroom_module_approvals where item_id = $1 and module_id = $2', [f.item, 'signoff-design']);
		expect(appr.length).toBe(4);
	});

	it('the waiting count: open requests the caller may decide, and nobody else', async () => {
		await db.sql(`insert into public.classroom_signoff_requests (team_id, checkpoint_key, requested_by) values ($1, 'design', $2)`, [f.teamA2, f.a[4].email]);
		const count = async (u: SeededUser) => (await rpc<{ count: number }>(u, 'public.classroom_signoff_waiting()')).count;
		expect(await count(f.admin)).toBe(1);
		expect(await count(f.teacher)).toBe(0);
		expect(await count(f.a[4])).toBe(0);
		const { rows } = await db.sql<{ id: string }>(`select id from public.classroom_signoff_requests where team_id = $1 and status = 'open'`, [f.teamA2]);
		const out = await rpc<{ ok: boolean; reason?: string }>(f.admin, 'public.classroom_signoff_decide($1::uuid, $2::jsonb, $3)', [rows[0].id, JSON.stringify({ aluminum: true, mount: true }), true]);
		expect(out).toMatchObject({ ok: false, reason: 'items_failed' });
	});

	it('a phase opens for the team whose sign-off is approved, and only that team', async () => {
		expect(await save(f.a[0], 'proto-note', 'Cut list')).toEqual({ ok: false, reason: 'not_open', checkpoint: 'build' });
		expect((await doc(f.a[0])).phases).toEqual({ build: { open: false, title: 'Build', date: '2030-01-07' } });
		expect(await teacherDecide(f.admin, f.teamA1, 'build', { safe: true }, true, null)).toMatchObject({ ok: true });
		expect(await save(f.a[0], 'proto-note', 'Cut list')).toEqual({ ok: true });
		expect((await doc(f.a[1])).phases?.build.open).toBe(true);
		expect(await save(f.a[4], 'proto-note', 'Not yet')).toEqual({ ok: false, reason: 'not_open', checkpoint: 'build' });
		expect((await doc(f.a[4])).phases?.build.open).toBe(false);
	});

	it('grants: the new client calls are authenticated only, the private ones nobody', async () => {
		const { rows } = await db.sql<{ fn: string; anon: boolean; auth: boolean }>(
			`select p.oid::regprocedure::text as fn,
				has_function_privilege('anon', p.oid, 'execute') as anon,
				has_function_privilege('authenticated', p.oid, 'execute') as auth
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = any ($1::text[])`,
			[
				[
					'classroom_team_set_uses',
					'classroom_signoff_teacher_decide',
					'classroom_signoff_waiting',
					'classroom_item_signoff_board',
					'_classroom_team_post_pin',
					'_classroom_item_team_set',
					'_classroom_signoff_close',
					'_classroom_signoff_missing',
					'_classroom_team_phase_refusal'
				]
			]
		);
		expect(rows.filter((r) => r.anon)).toEqual([]);
		expect(rows.filter((r) => r.auth).map((r) => r.fn.split('(')[0].replace('public.', '')).sort()).toEqual([
			'classroom_item_signoff_board',
			'classroom_signoff_teacher_decide',
			'classroom_signoff_waiting',
			'classroom_team_set_uses'
		]);
	});
});
