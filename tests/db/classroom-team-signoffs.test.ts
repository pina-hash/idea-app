// tests/db/classroom-team-signoffs.test.ts
//
// LEDGER 0436, MIGRATION 0304: THE SIGN-OFF QUEUE. The real chain through 0304,
// the real RPCs. Held: a request unlocks only on the plan's own checks; who may
// decide (an admin any section, a manager their own, an owner-only item Mr.
// Pina alone); Approve writes the 0086 approval rows and fixes owners; Send back
// turns failed items into 0-point tasks for the right owner; a student decides
// nothing.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeThrough } from './chain-0436';
import { postSet, rpcOf, seedUnit4, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';

type Queue = { requests: { id: string; team: { id: string; name: string }; checkpoint: { key: string }; owner_only: boolean; items: { id: string; kind: string; auto_ok: boolean | null; owner: string | null }[] }[] };
type Plan = {
	me: string;
	members: { key: string; name: string }[];
	tasks: { id: string; kind: string; block_id: string | null; owner: string | null; title: string; points: number; cleared: boolean; note: string | null }[];
	checkpoints: { key: string; state: string; auto: Record<string, boolean>; decision: { status: string; by: string } | null }[];
	owners_fixed: boolean;
};

describe('0304 sign-offs', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	const plan = (u: SeededUser, section: string, team: string | null = null) =>
		rpc<Plan>(u, 'public.classroom_team_plan($1::uuid, $2::uuid)', [section, team]);
	const request = (u: SeededUser, team: string, key: string) =>
		rpc<{ ok: boolean; reason?: string; items?: string[] }>(u, 'public.classroom_signoff_request($1::uuid, $2)', [team, key]);
	const queue = (u: SeededUser) => rpc<Queue>(u, 'public.classroom_signoff_queue()');
	const decide = (u: SeededUser, id: string, results: Record<string, boolean>, approve: boolean) =>
		rpc<{ ok: boolean; reason?: string; tasks?: number }>(u, 'public.classroom_signoff_decide($1::uuid, $2::jsonb, $3)', [
			id,
			JSON.stringify(results),
			approve
		]);

	beforeAll(async () => {
		db = await startTestDb(treeThrough('0304'));
		f = await seedUnit4(db, { dueAt: '2026-11-03T07:00:00Z' });
		({ rpc, refusal } = rpcOf(db));
		await postSet(db, f.admin, f.setA);
		await postSet(db, f.teacher, f.setB);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('is safe to paste and re-applies', async () => {
		expect(pasteTrap(migrationSql('0304'))).toEqual([]);
		await db.sql(migrationSql('0304'));
	});

	it('the checkpoints arrive in the plan from the manifest, open, sign-off 1 not yet approved', async () => {
		const p = await plan(f.a[0], f.sectionA);
		expect(p.checkpoints.map((c) => [c.key, c.state])).toEqual([
			['plan', 'open'],
			['design', 'open']
		]);
		expect(p.owners_fixed).toBe(false);
		const stored = await db.sql('select count(*)::int as n from public.classroom_signoff_checkpoints');
		expect(stored.rows[0].n).toBe(2);
	});

	it('a request unlocks only when the auto items pass, by the database’s own checks', async () => {
		const first = await request(f.a[0], f.teamA1, 'plan');
		expect(first.ok).toBe(false);
		expect(first.reason).toBe('auto_failed');
		expect(first.items?.sort()).toEqual(['balance', 'fields', 'owners', 'roles']);
		// Make the plan: roles to four members, both team tasks owned, every role field written.
		let p = await plan(f.a[0], f.sectionA);
		const keys = p.members.map((m) => m.key);
		const roles = ['frame', 'energy', 'drive', 'ballpath'];
		for (let i = 0; i < 4; i++) await rpc(f.a[0], 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [f.teamA1, roles[i], keys[i]]);
		const goal = p.tasks.find((t) => t.block_id === 'goal')!;
		const method = p.tasks.find((t) => t.block_id === 'method')!;
		await rpc(f.a[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [goal.id, keys[0]]);
		await rpc(f.a[0], 'public.classroom_team_task_set_owner($1::uuid, $2)', [method.id, keys[1]]);
		p = await plan(f.a[0], f.sectionA);
		expect(p.checkpoints[0].auto).toMatchObject({ owners: true, roles: true, balance: true, fields: false });
		for (let i = 0; i < 4; i++) {
			const save = await rpc<{ ok: boolean }>(f.a[i], 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
				f.item,
				`${roles[i]}-text`,
				JSON.stringify({ text: 'Written.' })
			]);
			expect(save.ok).toBe(true);
		}
		expect(await request(f.a[2], f.teamA1, 'plan')).toMatchObject({ ok: true });
		expect(await request(f.a[3], f.teamA1, 'plan')).toEqual({ ok: false, reason: 'already_requested' });
		expect((await plan(f.a[0], f.sectionA)).checkpoints[0].state).toBe('requested');
	});

	it('who decides: Mr. Pina alone for an owner-only checkpoint; a manager only their own section', async () => {
		// Team B makes a Design request (no owner-only item) with no auto items to pass.
		expect(await request(f.b[0], f.teamB1, 'design')).toMatchObject({ ok: true });
		const pina = await queue(f.admin);
		expect(pina.requests.map((r) => [r.team.id, r.checkpoint.key, r.owner_only])).toEqual([
			[f.teamA1, 'plan', true],
			[f.teamB1, 'design', false]
		]);
		const cosso = await queue(f.teacher);
		expect(cosso.requests.map((r) => [r.team.id, r.checkpoint.key])).toEqual([[f.teamB1, 'design']]);
		expect(await refusal(f.teacher, 'public.classroom_signoff_decide($1::uuid, $2::jsonb, $3)', [pina.requests[0].id, '{}', true])).toBe(
			'That request does not exist.'
		);
		// A second admin who is not Mr. Pina decides any section, but never an owner-only request.
		const other = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		await db.sql('insert into public.app_admins (email, granted_by) values ($1, $2)', [other.email, f.admin.email]);
		const reyes = await queue(other);
		expect(reyes.requests.map((r) => [r.team.id, r.checkpoint.key])).toEqual([[f.teamB1, 'design']]);
		expect(await refusal(other, 'public.classroom_signoff_decide($1::uuid, $2::jsonb, $3)', [pina.requests[0].id, '{}', true])).toBe(
			'That request does not exist.'
		);
		// A student sees nothing and decides nothing.
		expect((await queue(f.a[0])).requests).toEqual([]);
		expect(await refusal(f.a[0], 'public.classroom_signoff_decide($1::uuid, $2::jsonb, $3)', [pina.requests[0].id, '{}', true])).toBe(
			'That request does not exist.'
		);
	});

	it('Mr. Pina approves the owner-only Plan request with every tap passed', async () => {
		const q = await queue(f.admin);
		const req = q.requests.find((r) => r.checkpoint.key === 'plan')!;
		expect(req.items.find((i) => i.id === 'interfaces')?.owner).toBe('Ana');
		// Approve refuses while a tap item is failed or untapped, then lands.
		expect(await decide(f.admin, req.id, { interfaces: true }, true)).toEqual({ ok: false, reason: 'items_failed', items: ['method'] });
		expect(await decide(f.admin, req.id, { interfaces: true, method: true }, true)).toMatchObject({ ok: true });
	});

	it('send back on the Design request: failed taps become 0-point tasks, and a re-request is allowed', async () => {
		const q = await queue(f.teacher);
		const req = q.requests[0];
		const p0 = await plan(f.teacher, f.sectionB, f.teamB1);
		const roleOwner = (await plan(f.b[0], f.sectionB)).members[0].key;
		await rpc(f.b[0], 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [f.teamB1, 'drive', roleOwner]);
		expect(await decide(f.teacher, req.id, { aluminum: false, mount: false }, false)).toEqual({ ok: true, status: 'sent_back', tasks: 2 });
		const p = await plan(f.b[0], f.sectionB);
		const sent = p.tasks.filter((t) => t.kind === 'sendback');
		expect(sent.map((t) => [t.title, t.owner, t.points]).sort()).toEqual([
			['Fix: The drill or power tool is clamped or mounted to the launcher, never hand-held while firing', roleOwner, 0],
			['Fix: The structure is aluminum, with wood only for a minor part', null, 0]
		]);
		expect(sent.every((t) => t.note === 'Design sent back by M. Cosso')).toBe(true);
		expect(p.checkpoints.find((c) => c.key === 'design')?.state).toBe('sent-back');
		expect(p0.tasks.length + 2).toBe(p.tasks.length);
		expect(await request(f.b[1], f.teamB1, 'design')).toMatchObject({ ok: true });
		const again = (await queue(f.teacher)).requests[0];
		expect(await decide(f.teacher, again.id, { aluminum: true, mount: true }, true)).toMatchObject({ ok: true });
		const after = await plan(f.b[0], f.sectionB);
		expect(after.tasks.filter((t) => t.kind === 'sendback').every((t) => t.cleared)).toBe(true);
	});

	it('approve: the 0086 approval rows, the stamp in the change log, and owners fixed for students only', async () => {
		const approvals = await db.sql(
			`select student_email, approved_by from public.classroom_module_approvals where item_id = $1 and module_id = 'signoff-plan' order by 1`,
			[f.item]
		);
		expect(approvals.rows.map((r) => r.student_email)).toEqual(f.a.slice(0, 4).map((u) => u.email).sort());
		expect(new Set(approvals.rows.map((r) => r.approved_by))).toEqual(new Set([f.admin.email]));
		const log = await db.sql(`select note from public.classroom_team_log where team_id = $1 and kind = 'signoff-approved'`, [f.teamA1]);
		expect(log.rows).toEqual([{ note: 'Plan approved by A. Pina' }]);
		const p = await plan(f.a[0], f.sectionA);
		expect(p.owners_fixed).toBe(true);
		expect(p.checkpoints[0].decision).toMatchObject({ status: 'approved', by: 'A. Pina' });
		const key = p.members[1].key;
		expect(await rpc(f.a[0], 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [f.teamA1, 'frame', key])).toEqual({
			ok: false,
			reason: 'owners_fixed'
		});
		expect(await rpc(f.admin, 'public.classroom_team_plan_set_role($1::uuid, $2, $3)', [f.teamA1, 'frame', key])).toEqual({ ok: true });
		expect(await request(f.a[0], f.teamA1, 'plan')).toEqual({ ok: false, reason: 'approved' });
	});

	it('the checklist is admin-editable data and a re-read never overwrites an edit', async () => {
		const list = await rpc<{ checkpoints: { item_id: string; key: string; items: unknown[] }[] }>(f.admin, 'public.classroom_signoff_checklists()');
		const design = list.checkpoints.find((c) => c.key === 'design')!;
		expect(
			await rpc(f.admin, 'public.classroom_signoff_checkpoint_set($1::uuid, $2, $3, $4::date, $5, $6::jsonb)', [
				design.item_id,
				'design',
				'Design',
				'2026-11-03',
				'No metal is cut before this sign-off.',
				JSON.stringify([...design.items, { id: 'bearings', kind: 'tap', text: 'The team uses 6 or fewer 1/2 in hex bearings' }])
			])
		).toEqual({ ok: true });
		await plan(f.a[0], f.sectionA);
		const again = await rpc<{ checkpoints: { key: string; items: { id: string }[] }[] }>(f.admin, 'public.classroom_signoff_checklists()');
		expect(again.checkpoints.find((c) => c.key === 'design')!.items.map((i) => i.id)).toContain('bearings');
		expect(await refusal(f.teacher, 'public.classroom_signoff_checklists()')).toMatch(/site admin/);
	});
});
