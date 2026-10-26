// tests/db/classroom-team-documents.test.ts
//
// LEDGER 0436, MIGRATION 0302: ONE LIVE SHARED DOCUMENT PER TEAM.
//
// The real chain through 0302, the real RPCs, as the real student role. What is
// held here is what fails SILENTLY if it regresses: who may see a team's
// answers, who may write a box, that posting a draw is the switch, and that a
// moved student's work stays with the team it was written for. Every visibility
// claim is counted in both directions.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeThrough } from './chain-0436';
import { postSet, rpcOf, seedUnit4, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';

type Doc = {
	ok: boolean;
	team: { id: string; name: string } | null;
	reason?: string;
	members: { name: string; me: boolean }[];
	roles: { id: string; owner: string | null; mine: boolean }[];
	values: Record<string, { value: unknown; by: string }>;
	locks: Record<string, { by: string; mine: boolean }>;
};

describe('0302 team documents', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	const SAVE = 'public.classroom_save_response($1::uuid, $2, $3::jsonb)';
	const LOCK = 'public.classroom_team_box_lock($1::uuid, $2, $3)';
	const DOC = 'public.classroom_team_document($1::uuid)';
	const save = (u: SeededUser, block: string, value: unknown) =>
		rpc<{ ok: boolean; reason?: string; by?: string }>(u, SAVE, [f.item, block, JSON.stringify(value)]);
	const doc = (u: SeededUser) => rpc<Doc>(u, DOC, [f.item]);
	const notices = async (key: string, topic: string) =>
		Number(
			(
				await db.sql<{ n: string }>(
					`select count(*) as n from realtime.messages where topic = $1 and payload->>'topic' = $2`,
					[`classroom-live:${key}`, topic]
				)
			).rows[0].n
		);

	beforeAll(async () => {
		db = await startTestDb(treeThrough('0302'));
		f = await seedUnit4(db);
		({ rpc, refusal } = rpcOf(db));
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('is safe to paste and re-applies over itself', async () => {
		expect(pasteTrap(migrationSql('0302'))).toEqual([]);
		await db.sql(migrationSql('0302'));
	});

	it('before a draw is posted a student has no team document, said as not_posted, and cannot write a team box', async () => {
		const d = await doc(f.a[0]);
		expect(d.team).toBeNull();
		expect(d.reason).toBe('not_posted');
		expect(await save(f.a[0], 'goal', 'too early')).toEqual({ ok: false, reason: 'not_posted' });
		// An individual block of the same post still saves.
		expect(await save(f.a[0], 'reflect', 'mine')).toEqual({ ok: true });
	});

	it('posting is the switch: the post sends the section notice, and the document opens', async () => {
		const before = await notices(f.sectionA, 'teams');
		await postSet(db, f.admin, f.setA);
		expect(await notices(f.sectionA, 'teams')).toBeGreaterThan(before);
		const d = await doc(f.a[0]);
		expect(d.team?.id).toBe(f.teamA1);
		expect(d.members.map((m) => m.name)).toEqual(['Ana', 'Ben', 'Cara', 'Dev']);
		expect(d.members.filter((m) => m.me)).toHaveLength(1);
		// Section B posted nothing and is unaffected.
		expect((await doc(f.b[0])).reason).toBe('not_posted');
		// The eighth student is in a posted draw and on no team.
		expect((await doc(f.a[7])).reason).toBe('no_team');
	});

	it('a team box: one answer for the whole team, copied to every member, logged, noticed', async () => {
		const before = await notices(`team-${f.teamA1}`, 'team-doc');
		expect(await save(f.a[0], 'goal', 'Hit the far bin')).toEqual({ ok: true });
		const rows = await db.sql<{ student_email: string; value: unknown }>(
			`select student_email, value from public.classroom_responses where item_id = $1 and block_id = 'goal' order by 1`,
			[f.item]
		);
		expect(rows.rows.map((r) => r.student_email)).toEqual(f.a.slice(0, 4).map((u) => u.email).sort());
		expect(new Set(rows.rows.map((r) => JSON.stringify(r.value)))).toEqual(new Set(['"Hit the far bin"']));
		const d = await doc(f.a[2]);
		expect(d.values.goal).toMatchObject({ value: 'Hit the far bin', by: 'Ana' });
		expect(await notices(`team-${f.teamA1}`, 'team-doc')).toBeGreaterThan(before);
		// A save takes the box's lock, and the page releases it on blur.
		await rpc(f.a[0], LOCK, [f.item, 'goal', false]);
		const log = await db.sql(`select kind, before, after from public.classroom_team_log where team_id = $1 and kind = 'answer'`, [
			f.teamA1
		]);
		expect(log.rows).toEqual([{ kind: 'answer', before: null, after: 'Hit the far bin' }]);
	});

	it('a box locked by student 1 is read live by student 2 and refused to them by the server', async () => {
		expect(await rpc(f.a[0], LOCK, [f.item, 'method', true])).toMatchObject({ ok: true });
		const seen = await doc(f.a[1]);
		expect(seen.locks.method).toEqual(expect.objectContaining({ by: 'Ana', mine: false }));
		expect(await rpc(f.a[1], LOCK, [f.item, 'method', true])).toMatchObject({ ok: false, reason: 'held', by: 'Ana' });
		expect(await save(f.a[1], 'method', 'mine now')).toMatchObject({ ok: false, reason: 'held', by: 'Ana' });
		// Different boxes at once: both land.
		expect(await save(f.a[0], 'method', 'Flywheel')).toEqual({ ok: true });
		expect(await save(f.a[1], 'goal', 'Hit the far bin twice')).toEqual({ ok: true });
		await rpc(f.a[1], LOCK, [f.item, 'goal', false]);
		const d = await doc(f.a[3]);
		expect(d.values.method.value).toBe('Flywheel');
		expect(d.values.goal.value).toBe('Hit the far bin twice');
		// Release on blur frees it at once.
		await rpc(f.a[0], LOCK, [f.item, 'method', false]);
		expect(await rpc(f.a[1], LOCK, [f.item, 'method', true])).toMatchObject({ ok: true });
		await rpc(f.a[1], LOCK, [f.item, 'method', false]);
	});

	it('a lock left two minutes idle is free (a closed laptop never freezes a box)', async () => {
		await rpc(f.a[0], LOCK, [f.item, 'goal', true]);
		expect(await save(f.a[1], 'goal', 'blocked')).toMatchObject({ reason: 'held' });
		await db.sql(
			`update public.classroom_team_box_locks set touched_at = now() - interval '121 seconds' where block_id = 'goal'`
		);
		expect((await doc(f.a[1])).locks.goal).toBeUndefined();
		expect(await save(f.a[1], 'goal', 'free again')).toEqual({ ok: true });
		await rpc(f.a[1], LOCK, [f.item, 'goal', false]);
	});

	it('an owned block: nobody writes it before a role owner is set, then only the owner does', async () => {
		expect(await save(f.a[0], 'drive-text', 'gears')).toMatchObject({ ok: false, reason: 'no_owner' });
		expect(
			await rpc(f.a[1], 'public.classroom_team_set_role($1::uuid, $2, $3)', [f.teamA1, 'drive', f.a[0].email])
		).toEqual({ ok: true });
		expect(await save(f.a[1], 'drive-text', 'not mine')).toMatchObject({ ok: false, reason: 'not_owner', by: 'Ana' });
		expect(await rpc(f.a[1], LOCK, [f.item, 'drive-text', true])).toMatchObject({ ok: false, reason: 'not_owner' });
		expect(await save(f.a[0], 'drive-text', 'Two-stage belt')).toEqual({ ok: true });
		const d = await doc(f.a[1]);
		expect(d.values['drive-text'].value).toBe('Two-stage belt');
		expect(d.roles.find((r) => r.id === 'drive')).toMatchObject({ owner: 'Ana', mine: false });
		// An owner must be on the team; an unknown role is refused.
		expect(
			await rpc(f.a[0], 'public.classroom_team_set_role($1::uuid, $2, $3)', [f.teamA1, 'frame', f.a[5].email])
		).toEqual({ ok: false, reason: 'not_member' });
		expect(
			await rpc(f.a[0], 'public.classroom_team_set_role($1::uuid, $2, $3)', [f.teamA1, 'turret', f.a[0].email])
		).toEqual({ ok: false, reason: 'unknown_role' });
	});

	it('privacy: a student sees only their own team; a student on another team and another section see none of it', async () => {
		const other = await doc(f.a[4]);
		expect(other.team?.id).toBe(f.teamA2);
		expect(Object.keys(other.values)).toEqual([]);
		// Team A1 holds three answered boxes; A2 reads none of them, in either read.
		expect(Object.keys((await doc(f.a[0])).values).sort()).toEqual(['drive-text', 'goal', 'method']);
		const rows = await db.asUser(f.a[4].id, (q) =>
			q(`select block_id from public.classroom_responses where item_id = $1 and block_id in ('goal','method','drive-text')`, [
				f.item
			])
		);
		expect(rows.rows).toHaveLength(0);
		// The manager read and the history refuse a student, naming nothing.
		expect(await refusal(f.a[4], 'public.classroom_team_document_for($1::uuid, $2::uuid)', [f.item, f.teamA1])).toBe(
			'That team does not exist.'
		);
		expect(
			await refusal(f.a[4], 'public.classroom_team_box_history($1::uuid, $2::uuid, $3)', [f.item, f.teamA1, 'goal'])
		).toBe('That team does not exist.');
		// The tables answer nobody directly.
		for (const t of ['classroom_team_answers', 'classroom_team_log', 'classroom_team_box_locks', 'classroom_team_plan_roles']) {
			expect(await refusal(f.a[0], `(select count(*) from public.${t})`)).toMatch(/permission denied/);
		}
	});

	it('managers: Block 4 teacher reads only Block 4 teams; the admin reads both; history is the whole box', async () => {
		await postSet(db, f.teacher, f.setB);
		const cosso = await rpc<{ sections: { label: string; teams: unknown[] }[] }>(
			f.teacher,
			'public.classroom_item_teams($1::uuid)',
			[f.item]
		);
		expect(cosso.sections.map((s) => s.label)).toEqual(['Block 4']);
		expect(await refusal(f.teacher, 'public.classroom_team_document_for($1::uuid, $2::uuid)', [f.item, f.teamA1])).toBe(
			'That team does not exist.'
		);
		const admin = await rpc<{ sections: { label: string; teams: unknown[] }[] }>(
			f.admin,
			'public.classroom_item_teams($1::uuid)',
			[f.item]
		);
		expect(admin.sections.map((s) => [s.label, s.teams.length])).toEqual([
			['Block 2', 2],
			['Block 4', 1]
		]);
		const history = await rpc<{ entries: { by: string; before: unknown; after: unknown }[] }>(
			f.admin,
			'public.classroom_team_box_history($1::uuid, $2::uuid, $3)',
			[f.item, f.teamA1, 'goal']
		);
		expect(history.entries.map((e) => [e.by, e.before, e.after])).toEqual([
			['Ana Perez', null, 'Hit the far bin'],
			['Ben Ortiz', 'Hit the far bin', 'Hit the far bin twice'],
			['Ben Ortiz', 'Hit the far bin twice', 'free again']
		]);
	});

	it('a hand move: access moves at once, the work stays with the team, and both teams log it', async () => {
		const before = await notices(f.sectionA, 'teams');
		await rpc(f.admin, 'public.classroom_move_team_member($1::uuid, $2, $3::uuid)', [f.setA, f.a[1].email, f.teamA2]);
		expect(await notices(f.sectionA, 'teams')).toBeGreaterThan(before);
		const moved = await doc(f.a[1]);
		expect(moved.team?.id).toBe(f.teamA2);
		expect(Object.keys(moved.values)).toEqual([]);
		// The answer they wrote for team A1 stays with A1 and left their own rows.
		expect((await doc(f.a[0])).values.goal.value).toBe('free again');
		const theirs = await db.sql(`select block_id from public.classroom_responses where item_id = $1 and student_email = $2`, [
			f.item,
			f.a[1].email
		]);
		expect(theirs.rows).toEqual([]);
		const log = await db.sql<{ team_id: string; kind: string }>(
			`select team_id, kind from public.classroom_team_log where kind like 'move-%' order by id`
		);
		expect(log.rows).toEqual([
			{ team_id: f.teamA1, kind: 'move-out' },
			{ team_id: f.teamA2, kind: 'move-in' }
		]);
	});

	it('unposting is the switch back: the document closes for the section', async () => {
		await rpc(f.admin, 'public.classroom_unpost_team_set($1::uuid)', [f.setA]);
		expect((await doc(f.a[0])).reason).toBe('not_posted');
		expect(await save(f.a[0], 'goal', 'after unpost')).toEqual({ ok: false, reason: 'not_posted' });
		expect((await doc(f.b[0])).team?.id).toBe(f.teamB1);
		await postSet(db, f.admin, f.setA);
	});

	it('past the due date every team box is read-only, and an individual box still follows its own rules', async () => {
		await db.sql(`update public.classroom_items set due_at = now() - interval '1 minute' where id = $1`, [f.item]);
		expect(await save(f.a[0], 'goal', 'late')).toEqual({ ok: false, reason: 'past_due' });
		expect(await rpc(f.a[0], LOCK, [f.item, 'goal', true])).toEqual({ ok: false, reason: 'past_due' });
		expect(await save(f.a[0], 'reflect', 'late reflection')).toEqual({ ok: true });
		await db.sql(`update public.classroom_items set due_at = null where id = $1`, [f.item]);
	});

	it('grants: every new function is closed to anon, the five client calls are open to authenticated only', async () => {
		const { rows } = await db.sql<{ fn: string; anon: boolean; auth: boolean }>(`
			select p.oid::regprocedure::text as fn,
				has_function_privilege('anon', p.oid, 'execute') as anon,
				has_function_privilege('authenticated', p.oid, 'execute') as auth
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and (p.proname like '%team_document%' or p.proname like '%team_box%'
				or p.proname like '_classroom_team%' or p.proname in ('classroom_item_teams', 'classroom_team_set_role',
				'_classroom_live_notice', '_classroom_first_name', '_classroom_section_team_set',
				'_classroom_save_team_response', '_classroom_html_team_block', '_classroom_html_team_manifest'))
			order by 1`);
		expect(rows.filter((r) => r.anon)).toEqual([]);
		expect(rows.filter((r) => r.auth).map((r) => r.fn.split('(')[0]).sort()).toEqual([
			'classroom_item_teams',
			'classroom_team_box_history',
			'classroom_team_box_lock',
			'classroom_team_document',
			'classroom_team_document_for',
			'classroom_team_set_role'
		]);
	});
});
