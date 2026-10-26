// tests/db/classroom-team-board.test.ts
//
// LEDGER 0436, MIGRATION 0306: THE TEAM BOARD. The real chain through 0306,
// the real RPCs. Held: an admin's board is every class with a posted draw, a
// teacher's is their own classes, a student's is empty; an unposted draw is
// on nobody's board; each team is its own plan plus when each task's work was
// saved; a sign-off request's push goes to the class's teacher, or to Mr. Pina
// alone for an owner-only item, and only the server may ask.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeThrough } from './chain-0436';
import { postSet, rpcOf, seedUnit4, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';

type Board = {
	ok: boolean;
	sections: { id: string; label: string }[];
	teams: { team: { id: string; name: string }; section_label: string; tasks: { id: string; block_id: string | null }[]; saved_at: Record<string, string> }[];
	machines: { id: string }[];
};

describe('0306 the team board', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	const board = (u: SeededUser) => rpc<Board>(u, 'public.classroom_team_board()');

	beforeAll(async () => {
		db = await startTestDb(treeThrough('0306'));
		f = await seedUnit4(db, { dueAt: '2026-11-16T07:00:00Z' });
		({ rpc, refusal } = rpcOf(db));
		await postSet(db, f.admin, f.setA);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('is safe to paste and re-applies', async () => {
		expect(pasteTrap(migrationSql('0306'))).toEqual([]);
		await db.sql(migrationSql('0306'));
	});

	it('an admin sees every class with a posted draw, a teacher their own, a student nothing; an unposted draw is on no board', async () => {
		let a = await board(f.admin);
		// Present: Block 2's two teams. Absent: Block 4, whose draw is saved but not posted.
		expect(a.sections.map((s) => s.label)).toEqual(['Block 2']);
		expect(a.teams.map((t) => t.team.id).sort()).toEqual([f.teamA1, f.teamA2].sort());
		expect((await board(f.teacher)).teams).toEqual([]);
		await postSet(db, f.teacher, f.setB);
		a = await board(f.admin);
		expect(a.sections.map((s) => s.label)).toEqual(['Block 2', 'Block 4']);
		expect(a.teams).toHaveLength(3);
		const t = await board(f.teacher);
		expect(t.sections.map((s) => s.label)).toEqual(['Block 4']);
		expect(t.teams.map((x) => x.team.id)).toEqual([f.teamB1]);
		const s = await board(f.a[0]);
		expect(s.sections).toEqual([]);
		expect(s.teams).toEqual([]);
		expect(a.machines.length).toBeGreaterThan(0);
	});

	it('each team carries when its linked work was saved, and nothing for work not yet written', async () => {
		let a = await board(f.admin);
		const team = () => a.teams.find((x) => x.team.id === f.teamA1)!;
		const goal = team().tasks.find((x) => x.block_id === 'goal')!;
		expect(team().saved_at[goal.id]).toBeUndefined();
		await rpc(f.a[0], 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [f.item, 'goal', JSON.stringify({ text: 'Launch a ball 6 m.' })]);
		await rpc(f.a[0], 'public.classroom_team_box_lock($1::uuid, $2, false)', [f.item, 'goal']);
		a = await board(f.admin);
		expect(Date.parse(team().saved_at[goal.id])).toBeGreaterThan(Date.now() - 60_000);
		// Another team's board entry has no time for its own goal: the save was Team 1's.
		const other = a.teams.find((x) => x.team.id === f.teamA2)!;
		const otherGoal = other.tasks.find((x) => x.block_id === 'goal')!;
		expect(other.saved_at[otherGoal.id]).toBeUndefined();
	});

	it('a request’s push goes to the class teacher, or to the owner alone, and only the server may ask', async () => {
		const insert = async (team: string, key: string, ownerOnly: boolean) =>
			(
				await db.sql<{ id: string }>(
					'insert into public.classroom_signoff_requests (team_id, checkpoint_key, requested_by, owner_only) values ($1, $2, $3, $4) returning id',
					[team, key, 'x@boscotech.net', ownerOnly]
				)
			).rows[0].id;
		const notify = async (id: string) =>
			(
				await db.sql<{ ids: string[] }>(
					'select public._classroom_signoff_notify($1) as ids',
					[id]
				)
			).rows[0].ids;
		const b = await insert(f.teamB1, 'design', false);
		const owner = await insert(f.teamB1, 'plan', true);
		expect(await notify(b)).toEqual([f.teacher.id]);
		expect(await notify(owner)).toEqual([f.admin.id]);
		const asService = await db.sql<{ ok: boolean }>(
			"select has_function_privilege('service_role', 'public._classroom_signoff_notify(uuid)', 'execute') as ok"
		);
		expect(asService.rows[0].ok).toBe(true);
		expect(await refusal(f.teacher, 'public._classroom_signoff_notify($1::uuid)', [b])).toMatch(/permission denied/);
		await db.sql("update public.classroom_signoff_requests set status = 'approved' where id = $1", [b]);
		expect(await notify(b)).toEqual([]);
	});
});
