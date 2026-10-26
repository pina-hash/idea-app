// tests/db/classroom-team-grading.test.ts
//
// LEDGER 0436, MIGRATION 0305: GRADING BY TEAM. The real chain through 0305,
// the real RPCs, the rubric generated from the manifest by the real
// `manifestToRubric`. Held: a team assignment is graded only by team; team
// criteria land on every member, role criteria only on the role's owner, and a
// double owner gets the mean of their two role blocks, so every member's
// maximum is the same; individual criteria stay each student's own; only a
// manager of the team's section grades or reads it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeShortOf, treeThrough } from './chain-0436';
import { postSet, rpcOf, seedUnit4, teamManifest, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';
import { manifestToRubric } from '../../src/lib/classroom/html-assignment/rubric';
import type { HtmlAssignmentManifest } from '../../src/lib/classroom/html-assignment/rubric';

type Grading = {
	team: { id: string; name: string; section_label: string } | null;
	rubric: { id: string }[];
	role_of: Record<string, string>;
	team_criteria: string[];
	out_of: number;
	roles: { id: string; owner: string | null; owner_name: string | null }[];
	members: { email: string; name: string; roles: string[]; score: number | null; state: string | null; scores: Record<string, number> }[];
};
type Bulk = { ok: boolean; reason?: string; succeeded?: number; refused?: number; results?: { email: string; ok: boolean; reason?: string; message?: string; score?: number }[] };

describe('0305 grading by team', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	const gradeTeam = (
		u: SeededUser,
		team: string,
		scores: Record<string, number>,
		member: Record<string, Record<string, number>> = {},
		ret = false
	) =>
		rpc<Bulk>(u, 'public.classroom_grade_team($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)', [
			f.item,
			team,
			JSON.stringify(scores),
			JSON.stringify(member),
			'Strong plan.',
			'{}',
			ret
		]);
	const reading = (u: SeededUser, team: string) =>
		rpc<Grading>(u, 'public.classroom_team_grading($1::uuid, $2::uuid)', [f.item, team]);
	const setRoles = async (as: SeededUser, section: string, team: string, owners: [string, number][]) => {
		const plan = await rpc<{ members: { key: string; name: string }[] }>(as, 'public.classroom_team_plan($1::uuid, $2::uuid)', [section, null]);
		const keys = plan.members.map((m) => m.key);
		for (const [role, i] of owners) await rpc(as, 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [team, role, keys[i]]);
	};
	const submission = async (email: string) =>
		(
			await db.sql<{ score: string | null; rubric_scores: Record<string, number> | null; state: string; direct_score: string | null }>(
				'select score, rubric_scores, state, direct_score from public.classroom_submissions where item_id = $1 and student_email = $2',
				[f.item, email]
			)
		).rows[0];

	// shared-c1 40, four role blocks of 10, mine-c1 20 (the fixture's manifest).
	const TEAM = { 'shared-c1': 40 };
	const ROLE = { 'frame-req-c1': 10, 'energy-req-c1': 5, 'drive-req-c1': 10, 'ballpath-req-c1': 0 };

	beforeAll(async () => {
		db = await startTestDb(treeThrough('0305'));
		f = await seedUnit4(db, { dueAt: '2026-11-03T07:00:00Z' });
		({ rpc, refusal } = rpcOf(db));
		const rubric = manifestToRubric(teamManifest() as unknown as HtmlAssignmentManifest);
		await rpc(f.admin, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [f.item, JSON.stringify(rubric)]);
		await postSet(db, f.admin, f.setA);
		await postSet(db, f.teacher, f.setB);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('is safe to paste and re-applies', async () => {
		expect(pasteTrap(migrationSql('0305'))).toEqual([]);
		await db.sql(migrationSql('0305'));
	});

	it('the total is the team criteria, the individual criteria and ONE role block', async () => {
		const { rows } = await db.sql<{ out_of: string }>('select public._classroom_item_out_of($1)::text as out_of', [f.item]);
		// 40 team + 20 individual + 10 role, never the 100 the rubric adds up to.
		expect(Number(rows[0].out_of)).toBe(70);
		const g = await reading(f.admin, f.teamA1);
		expect(g.out_of).toBe(70);
		expect(g.rubric).toHaveLength(6);
		expect(Object.keys(g.role_of).sort()).toEqual(['ballpath-req-c1', 'drive-req-c1', 'energy-req-c1', 'frame-req-c1']);
		expect(g.team_criteria).toEqual(['shared-c1']);
	});

	it('one student at a time is refused for a team assignment, on every path, and nothing is written', async () => {
		const one = await refusal(f.admin, 'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb, $7)', [
			f.item,
			f.a[0].email,
			JSON.stringify({ ...TEAM, 'frame-req-c1': 10, 'mine-c1': 20 }),
			null,
			false,
			'{}',
			null
		]);
		expect(one).toMatch(/Grade this assignment by team/);
		const bulk = await rpc<Bulk>(f.admin, 'public.classroom_grade_submissions($1::uuid, $2::jsonb, $3)', [
			f.item,
			JSON.stringify([{ student_email: f.a[0].email, scores: { ...TEAM } }]),
			false
		]);
		expect(bulk.refused).toBe(1);
		expect(bulk.results?.[0].message).toMatch(/Grade this assignment by team/);
		const direct = await refusal(f.admin, 'public.classroom_grade_direct($1::uuid, $2, $3, $4, $5, $6)', [
			f.item,
			f.a[0].email,
			70,
			null,
			false,
			null
		]);
		expect(direct).toMatch(/Grade this assignment by team/);
		expect(await submission(f.a[0].email)).toBeUndefined();
	});

	it('a scored role nobody owns is refused before anything is written', async () => {
		const out = await gradeTeam(f.admin, f.teamA1, { ...TEAM, ...ROLE });
		expect(out).toMatchObject({ ok: false, reason: 'role_unowned' });
		expect(await submission(f.a[0].email)).toBeUndefined();
	});

	it('a team of four: the team score on all four, each role on its owner only, individual per member', async () => {
		await setRoles(f.a[0], f.sectionA, f.teamA1, [
			['frame', 0],
			['energy', 1],
			['drive', 2],
			['ballpath', 3]
		]);
		const g0 = await reading(f.admin, f.teamA1);
		const byKey = Object.fromEntries(g0.members.map((m, i) => [m.email, i]));
		expect(g0.roles.every((r) => r.owner)).toBe(true);
		const individual = Object.fromEntries(f.a.slice(0, 4).map((u, i) => [u.email, { 'mine-c1': i === 3 ? 10 : 20 }]));
		const out = await gradeTeam(f.admin, f.teamA1, { ...TEAM, ...ROLE }, individual, true);
		expect(out).toMatchObject({ ok: true, succeeded: 4, refused: 0 });
		const g = await reading(f.admin, f.teamA1);
		const score = (email: string) => g.members.find((m) => m.email === email)!;
		for (const m of g.members) {
			const [role] = m.roles;
			const roleKey = `${role}-req-c1` as keyof typeof ROLE;
			// Present: the team criterion, this member's own role, their own reflection.
			expect(Object.keys(m.scores).sort()).toEqual([roleKey, 'mine-c1', 'shared-c1'].sort());
			// Absent: every other role's criterion.
			expect(Object.keys(m.scores).filter((k) => k.endsWith('-req-c1') && k !== roleKey)).toEqual([]);
			expect(m.state).toBe('returned');
			expect(Number(m.score)).toBe(40 + ROLE[roleKey] + (m.email === f.a[3].email ? 10 : 20));
		}
		expect(Object.keys(byKey)).toHaveLength(4);
		expect(Number(score(f.a[0].email).score)).toBe(70);
	});

	it('a team of three: the double owner gets the mean of their two role blocks', async () => {
		await setRoles(f.a[4], f.sectionA, f.teamA2, [
			['frame', 0],
			['energy', 0],
			['drive', 1],
			['ballpath', 2]
		]);
		const g0 = await reading(f.admin, f.teamA2);
		const double = g0.members.find((m) => m.roles.length === 2)!;
		expect(double.roles).toEqual(['energy', 'frame']);
		const individual = Object.fromEntries(g0.members.map((m) => [m.email, { 'mine-c1': 20 }]));
		const out = await gradeTeam(f.admin, f.teamA2, { ...TEAM, ...ROLE }, individual);
		expect(out).toMatchObject({ ok: true, succeeded: 3 });
		const g = await reading(f.admin, f.teamA2);
		const after = g.members.find((m) => m.email === double.email)!;
		// (frame 10 + energy 5) / 2 = 7.5 on top of 40 and 20; the maximum is still 70.
		expect(Number(after.score)).toBe(67.5);
		expect(Object.keys(after.scores).sort()).toEqual(['energy-req-c1', 'frame-req-c1', 'mine-c1', 'shared-c1']);
		const single = g.members.filter((m) => m.roles.length === 1).map((m) => Number(m.score)).sort();
		expect(single).toEqual([60, 70]);
	});

	it('an individual score for the team, a team score per student, and a stranger are each refused', async () => {
		expect(await refusal(f.admin, 'public.classroom_grade_team($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)', [
			f.item, f.teamA1, JSON.stringify({ ...TEAM, 'mine-c1': 20 }), '{}', null, '{}', false
		])).toMatch(/for each student, not for the team/);
		expect(await refusal(f.admin, 'public.classroom_grade_team($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)', [
			f.item, f.teamA1, JSON.stringify(TEAM), JSON.stringify({ [f.a[0].email]: { 'shared-c1': 10 } }), null, '{}', false
		])).toMatch(/given once for the team/);
		expect(await refusal(f.admin, 'public.classroom_grade_team($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)', [
			f.item, f.teamA1, JSON.stringify(TEAM), JSON.stringify({ [f.a[5].email]: { 'mine-c1': 10 } }), null, '{}', false
		])).toMatch(/not on this team/);
	});

	it('inside the team call, a role this student does not own is still refused by the grading rule itself', async () => {
		const msg = await db
			.asUser(f.admin.id, (q) =>
				q(
					`select set_config('idea.team_grade', $1, true),
						public.classroom_grade_submission($2::uuid, $3, $4::jsonb, null, false, '{}'::jsonb, null)`,
					[f.teamA1, f.item, f.a[1].email, JSON.stringify({ ...TEAM, 'frame-req-c1': 10, 'energy-req-c1': 5, 'mine-c1': 20 })]
				)
			)
			.then(() => null)
			.catch((e: Error) => e.message);
		expect(msg).toMatch(/belongs to a role this student does not own/);
		// And naming ANOTHER team's id does not open this student's grade.
		const wrong = await db
			.asUser(f.admin.id, (q) =>
				q(
					`select set_config('idea.team_grade', $1, true),
						public.classroom_grade_submission($2::uuid, $3, $4::jsonb, null, false, '{}'::jsonb, null)`,
					[f.teamA2, f.item, f.a[1].email, JSON.stringify(TEAM)]
				)
			)
			.then(() => null)
			.catch((e: Error) => e.message);
		expect(wrong).toMatch(/Grade this assignment by team/);
	});

	it('only a manager of the team’s section grades or reads it: a manager of another section and a student get not found', async () => {
		// Present: the Block 4 teacher reads and grades their own team.
		const own = await reading(f.teacher, f.teamB1);
		expect(own.team?.section_label).toBe('Block 4');
		expect(own.members).toHaveLength(3);
		// Absent: the same teacher on Block 2's team, and a student on their own team.
		for (const [who, team] of [
			[f.teacher, f.teamA1],
			[f.a[0], f.teamA1]
		] as const) {
			expect(await refusal(who, 'public.classroom_team_grading($1::uuid, $2::uuid)', [f.item, team])).toMatch(/That team does not exist/);
			expect(
				await refusal(who, 'public.classroom_grade_team($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)', [
					f.item, team, JSON.stringify(TEAM), '{}', null, '{}', false
				])
			).toMatch(/That team does not exist/);
		}
	});

	it('an unposted draw’s team is not gradable', async () => {
		await rpc(f.teacher, 'public.classroom_unpost_team_set($1::uuid)', [f.setB]);
		expect(await refusal(f.teacher, 'public.classroom_team_grading($1::uuid, $2::uuid)', [f.item, f.teamB1])).toMatch(
			/That team does not exist/
		);
	});
});

describe('0305 over seeded pre-migration data', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let plain: string;

	beforeAll(async () => {
		db = await startTestDb(treeShortOf('0305'));
		f = await seedUnit4(db);
		({ rpc } = rpcOf(db));
		await rpc(f.admin, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			f.item,
			JSON.stringify(manifestToRubric(teamManifest() as unknown as HtmlAssignmentManifest))
		]);
		// An ordinary assignment with a rubric, graded and returned before 0305.
		const created = await rpc<{ item_id: string }>(
			f.admin,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 30, p_published => true)`,
			[[f.sectionA], 'Bearing quiz', 'Name the bearing.']
		);
		plain = created.item_id;
		await rpc(f.admin, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			plain,
			JSON.stringify([
				{
					id: 'c1',
					criterion: 'Bearing named',
					points: 30,
					levels: [
						{ points: 30, label: 'Complete', short: 'Named', descriptor: 'The bearing is named.' },
						{ points: 15, label: 'Developing', short: 'Half', descriptor: 'Half named.' },
						{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not named.' }
					]
				}
			])
		]);
		await rpc(f.admin, 'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb, $7::numeric)', [
			plain,
			f.a[0].email,
			JSON.stringify({ c1: 15 }),
			'Close.',
			true,
			'{}',
			null
		]);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('every stored total and grade reads the same after the apply, and ordinary grading still works one student at a time', async () => {
		const totals = async () =>
			(
				await db.sql<{ id: string; out_of: string }>(
					'select i.id, public._classroom_item_out_of(i.id)::text as out_of from public.classroom_items i order by i.id'
				)
			).rows;
		const grades = async () =>
			(await db.sql('select item_id, student_email, score, state, rubric_scores from public.classroom_submissions order by 1, 2')).rows;
		const before = await totals();
		const gradesBefore = await grades();
		expect(before.find((r) => r.id === f.item)?.out_of).toBe('100');

		await db.sql(migrationSql('0305'));

		const after = await totals();
		// Present: the ordinary item's total is unchanged. Moved: only the team assignment's, to one role block.
		expect(after.filter((r) => r.id !== f.item)).toEqual(before.filter((r) => r.id !== f.item));
		expect(Number(after.find((r) => r.id === f.item)?.out_of)).toBe(70);
		expect(await grades()).toEqual(gradesBefore);
		const again = await rpc<{ ok: boolean; score: number }>(
			f.admin,
			'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb, $7::numeric)',
			[plain, f.a[0].email, JSON.stringify({ c1: 30 }), 'Fixed.', true, '{}', null]
		);
		expect(again).toMatchObject({ ok: true, score: 30 });
	});
});
