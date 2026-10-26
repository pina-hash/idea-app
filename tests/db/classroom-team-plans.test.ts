// tests/db/classroom-team-plans.test.ts
//
// LEDGER 0436, MIGRATION 0303: THE TEAM PLAN. The real chain through 0303 and
// the real RPCs. Held: what seeds (and that it seeds once), whose a task is,
// the balance the sign-off request will ask, the due-date cap, the check-in,
// and that a plan is its team's and its managers' only.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeThrough } from './chain-0436';
import { postSet, rpcOf, seedUnit4, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';

interface Plan {
	ok: boolean;
	team: { id: string } | null;
	reason?: string;
	me: string;
	members: { key: string; name: string; me: boolean }[];
	roles: { id: string; owner: string | null }[];
	tasks: {
		id: string;
		kind: string;
		title: string;
		block_id: string | null;
		role_id: string | null;
		owner: string | null;
		fixed_owner: boolean;
		due_on: string | null;
		cap: string | null;
		points: number;
		value: unknown;
		on_it: string[];
	}[];
	balance: { total: number; even: number; balanced: boolean; members: { key: string; points: number }[]; unowned: number };
	no_school: { day: string }[];
	machines: { id: string }[];
}

describe('0303 team plans', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	const plan = (u: SeededUser, section: string, team: string | null = null) =>
		rpc<Plan>(u, 'public.classroom_team_plan($1::uuid, $2::uuid)', [section, team]);

	beforeAll(async () => {
		db = await startTestDb(treeThrough('0303'));
		f = await seedUnit4(db, { dueAt: '2026-11-03T07:00:00Z' });
		({ rpc, refusal } = rpcOf(db));
		await postSet(db, f.admin, f.setA);
		await postSet(db, f.teacher, f.setB);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('is safe to paste, re-applies, and seeds the machines and Nov 11 once', async () => {
		expect(pasteTrap(migrationSql('0303'))).toEqual([]);
		await db.sql(migrationSql('0303'));
		const p = await plan(f.a[0], f.sectionA);
		expect(p.machines.map((m) => m.id)).toEqual(['laser', 'router', 'printer', 'mill', 'lathe']);
		expect(p.no_school.map((d) => d.day)).toEqual(['2026-11-11']);
	});

	it('seeds every graded block once: team blocks unowned, role blocks fixed to the role, individual blocks per member', async () => {
		const p = await plan(f.a[0], f.sectionA);
		const again = await plan(f.a[1], f.sectionA);
		expect(again.tasks.length).toBe(p.tasks.length);
		const seeds = p.tasks.filter((t) => t.kind === 'seed');
		// 2 team blocks + 4 role blocks + 1 individual block x 4 members.
		expect(seeds).toHaveLength(2 + 4 + 4);
		expect(seeds.filter((t) => t.block_id === 'goal' || t.block_id === 'method').every((t) => !t.fixed_owner && t.owner === null)).toBe(true);
		expect(seeds.filter((t) => t.role_id).every((t) => t.fixed_owner)).toBe(true);
		const reflect = seeds.filter((t) => t.block_id === 'reflect');
		expect(new Set(reflect.map((t) => t.owner))).toEqual(new Set(p.members.map((m) => m.key)));
		// Points: the 40-point team module spreads 20 + 20; each role block 10; reflection 20 each.
		expect(seeds.find((t) => t.block_id === 'goal')?.points).toBe(20);
		expect(seeds.find((t) => t.block_id === 'drive-text')?.points).toBe(10);
		expect(reflect.every((t) => t.points === 20)).toBe(true);
		expect(seeds.every((t) => t.due_on === '2026-11-02')).toBe(true);
		// No address anywhere in the payload a student reads.
		expect(JSON.stringify(p)).not.toMatch(/@boscotech/);
	});

	it('a role task follows the role owner; a fixed owner cannot be reassigned', async () => {
		const p = await plan(f.a[0], f.sectionA);
		const ben = p.members.find((m) => m.name === 'Ben')!.key;
		expect(await rpc(f.a[0], 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [f.teamA1, 'drive', ben])).toEqual({ ok: true });
		const after = await plan(f.a[0], f.sectionA);
		const drive = after.tasks.find((t) => t.block_id === 'drive-text')!;
		expect(drive.owner).toBe(ben);
		expect(await rpc(f.a[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [drive.id, p.me])).toEqual({
			ok: false,
			reason: 'fixed_owner'
		});
	});

	it('the balance: unowned work is never balanced; an even split is', async () => {
		let p = await plan(f.a[0], f.sectionA);
		expect(p.balance.balanced).toBe(false);
		const keys = p.members.map((m) => m.key);
		const roles = ['frame', 'energy', 'drive', 'ballpath'];
		for (let i = 0; i < 4; i++) {
			await rpc(f.a[0], 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [f.teamA1, roles[i], keys[i]]);
		}
		const goal = p.tasks.find((t) => t.block_id === 'goal')!;
		const method = p.tasks.find((t) => t.block_id === 'method')!;
		await rpc(f.a[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [goal.id, keys[0]]);
		p = await plan(f.a[0], f.sectionA);
		// 40 + 4x10 + 4x20 = 160 over 4 = 40 each; key 0 holds 20+10+20 = 50 (1.25x), method unowned.
		expect(p.balance.unowned).toBe(20);
		expect(p.balance.balanced).toBe(false);
		await rpc(f.a[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [method.id, keys[1]]);
		p = await plan(f.a[0], f.sectionA);
		expect(p.balance.total).toBe(160);
		expect(p.balance.members.map((m) => m.points).sort()).toEqual([30, 30, 50, 50]);
		expect(p.balance.balanced).toBe(true);
		// A team's own task is 0 points and moves nothing.
		expect((await rpc<{ ok: boolean }>(f.a[0], 'public.classroom_team_task_add($1::uuid, $2, $3, $4::date)', [f.teamA1, 'Buy bolts', keys[2], '2026-10-29'])).ok).toBe(true);
		expect((await plan(f.a[0], f.sectionA)).balance.total).toBe(160);
	});

	it('a due date moves, logged, never past the post due date and never on a weekend or Nov 11', async () => {
		const p = await plan(f.a[0], f.sectionA);
		const t = p.tasks.find((x) => x.block_id === 'goal')!;
		expect(t.cap).toBe('2026-11-02');
		const set = (d: string) => rpc(f.a[0], 'public.classroom_team_task_set_due($1::uuid, $2::date)', [t.id, d]);
		expect(await set('2026-11-03')).toMatchObject({ ok: false, reason: 'past_post_due' });
		expect(await set('2026-11-01')).toMatchObject({ ok: false, reason: 'not_school_day' });
		expect(await set('2026-10-28')).toEqual({ ok: true });
		const log = await db.sql(`select before, after from public.classroom_team_log where kind = 'task-due' and team_id = $1`, [f.teamA1]);
		expect(log.rows).toEqual([{ before: '2026-11-02', after: '2026-10-28' }]);
	});

	it('check-in: the tasks a member is on today, replaced, never another team’s task', async () => {
		const p = await plan(f.a[0], f.sectionA);
		const mine = p.tasks.filter((t) => t.owner === p.me).slice(0, 2).map((t) => t.id);
		const other = (await plan(f.a[4], f.sectionA)).tasks[0].id;
		expect(await rpc(f.a[0], 'public.classroom_team_checkin($1::uuid, $2::uuid[])', [f.teamA1, [...mine, other]])).toEqual({
			ok: true,
			count: 2
		});
		const after = await plan(f.a[1], f.sectionA);
		expect(after.tasks.filter((t) => t.on_it.includes(p.me)).map((t) => t.id).sort()).toEqual([...mine].sort());
	});

	it('blocked is set by the owner only, with a reason, and cleared', async () => {
		const p = await plan(f.a[0], f.sectionA);
		const t = p.tasks.find((x) => x.owner === p.me && x.kind === 'seed')!;
		expect(await rpc(f.a[1], 'public.classroom_team_task_block($1::uuid, $2)', [t.id, 'no wood'])).toEqual({ ok: false, reason: 'not_owner' });
		expect(await rpc(f.a[0], 'public.classroom_team_task_block($1::uuid, $2)', [t.id, 'Waiting on the router'])).toEqual({ ok: true });
		expect(await rpc(f.a[0], 'public.classroom_team_task_block($1::uuid, $2)', [t.id, null])).toEqual({ ok: true });
	});

	it('privacy: a plan is its team’s and its managers’, both directions counted', async () => {
		const own = await plan(f.a[4], f.sectionA);
		expect(own.team?.id).toBe(f.teamA2);
		expect(await refusal(f.a[4], 'public.classroom_team_plan($1::uuid, $2::uuid)', [f.sectionA, f.teamA1])).toBe('That team does not exist.');
		expect(await refusal(f.b[0], 'public.classroom_team_plan($1::uuid, $2::uuid)', [f.sectionA, f.teamA1])).toBe('That team does not exist.');
		expect(await refusal(f.teacher, 'public.classroom_team_plan($1::uuid, $2::uuid)', [f.sectionA, f.teamA1])).toBe('That team does not exist.');
		expect((await plan(f.teacher, f.sectionB, f.teamB1)).team?.id).toBe(f.teamB1);
		expect((await plan(f.admin, f.sectionA, f.teamA1)).team?.id).toBe(f.teamA1);
		const t = (await plan(f.a[0], f.sectionA)).tasks[0].id;
		for (const call of [
			['public.classroom_team_task_set_due($1::uuid, $2::date)', [t, '2026-10-29']],
			['public.classroom_team_task_depends($1::uuid, $2::uuid)', [t, null]],
			['public.classroom_team_task_remove($1::uuid)', [t]]
		] as const) {
			expect(await refusal(f.a[4], call[0], [...call[1]])).toBe('That task does not exist.');
		}
		expect(await refusal(f.a[0], `(select count(*) from public.classroom_team_tasks)`)).toMatch(/permission denied/);
	});

	it('admin only: the machine list and the no-school days', async () => {
		expect(await refusal(f.teacher, 'public.classroom_machine_tag_set($1, $2, $3)', ['plasma', 'Plasma', true])).toMatch(/site admin/);
		expect(await rpc(f.admin, 'public.classroom_no_school_day_set($1::date, $2)', ['2026-11-26', 'Thanksgiving'])).toEqual({ ok: true });
		expect((await plan(f.a[0], f.sectionA)).no_school.map((d) => d.day)).toEqual(['2026-11-11', '2026-11-26']);
	});
});
