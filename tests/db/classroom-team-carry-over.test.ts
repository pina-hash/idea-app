// tests/db/classroom-team-carry-over.test.ts
//
// LEDGER 0446, MIGRATION 0313: A POST THAT BECOMES A TEAM POST KEEPS WHAT ITS
// STUDENTS ALREADY WROTE.
//
// The production case, replayed on the real chain short of 0313 with every row
// written through the real RPCs: a per-student post, a draw already posted,
// students answering on their own; then 0313 applied over that data; then the
// post re-stored with `team`. Held here, both directions counted:
//   - every team box a member had answered is the team's answer and every
//     member's copy, the newest answer winning;
//   - an answer that differed from the one kept is in the box's history, so
//     nothing a student wrote is gone;
//   - an individual block is NEVER copied to a teammate (the privacy half,
//     mutation-proven: carry individual blocks too and this file reddens);
//   - a section whose draw is not posted gets nothing until it is posted;
//   - running it again changes nothing.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './harness';
import { migrationSql, treeShortOf } from './chain-0436';
import { documentFor, postSet, rpcOf, seedUnit4, teamManifest, type Unit4Fixture } from './team-unit4-fixture';

const SAVE = 'public.classroom_save_response($1::uuid, $2, $3::jsonb)';
const SET_HTML = 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)';

/** The same post before it was a team post: no `team`, no role modules. */
function perStudentManifest() {
	const m = teamManifest() as Record<string, unknown> & { modules: Record<string, unknown>[] };
	const out: Record<string, unknown> = { ...m };
	delete out.team;
	out.modules = m.modules.map((mod) => {
		const copy = { ...mod };
		if (copy.audience === 'role') {
			copy.audience = 'team';
			delete copy.role;
		}
		return copy;
	});
	return out as ReturnType<typeof teamManifest>;
}

const text = (t: string) => JSON.stringify({ text: t });

describe('0313 team carry-over', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];

	const teamValue = async (team: string, block: string) =>
		(
			await db.sql<{ value: { text: string } | null; updated_by: string | null }>(
				'select value, updated_by from public.classroom_team_answers where team_id = $1 and item_id = $2 and block_id = $3',
				[team, f.item, block]
			)
		).rows[0] ?? null;
	const memberValue = async (email: string, block: string) =>
		(
			await db.sql<{ value: { text: string } }>(
				'select value from public.classroom_responses where student_email = $1 and item_id = $2 and block_id = $3',
				[email, f.item, block]
			)
		).rows[0]?.value?.text ?? null;
	const history = async (team: string, block: string) =>
		(
			await db.sql<{ actor_email: string; after: { text: string } }>(
				'select actor_email, after from public.classroom_team_log where team_id = $1 and item_id = $2 and block_id = $3 order by at, id',
				[team, f.item, block]
			)
		).rows.map((r) => `${r.actor_email.split('@')[0]}=${r.after.text}`);

	beforeAll(async () => {
		db = await startTestDb(treeShortOf('0313'));
		rpc = rpcOf(db).rpc;
		f = await seedUnit4(db);
		const per = perStudentManifest();
		await rpc(f.admin, SET_HTML, [f.item, documentFor(per), JSON.stringify(per), 'plan.html']);
		// Section A's draw is up, as IDEA-Blade's was; section B's is not.
		await postSet(db, f.admin, f.setA);
		// Team A1 is a[0..3]: two agree on the goal, two differ on the method.
		await rpc(f.a[0], SAVE, [f.item, 'goal', text('Same')]);
		await rpc(f.a[0], SAVE, [f.item, 'method', text('Old')]);
		await rpc(f.a[0], SAVE, [f.item, 'reflect', text('Only mine')]);
		await rpc(f.a[1], SAVE, [f.item, 'goal', text('Same')]);
		await rpc(f.a[2], SAVE, [f.item, 'method', text('New')]);
		// Team A2 is a[4..6]: one answer. Section B (not posted): one answer.
		await rpc(f.a[4], SAVE, [f.item, 'goal', text('Solo')]);
		await rpc(f.b[0], SAVE, [f.item, 'goal', text('Bee')]);
		await db.sql(migrationSql('0313'));
	}, 240_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('applying 0313 over a per-student post writes no team answer', async () => {
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_team_answers where item_id = $1', [f.item]);
		expect(rows[0].n).toBe(0);
	});

	it('becoming a team post carries every answered team box over, newest answer kept, every member holding the copy', async () => {
		const m = teamManifest();
		await rpc(f.admin, SET_HTML, [f.item, documentFor(m), JSON.stringify(m), 'plan.html']);

		expect((await teamValue(f.teamA1, 'goal'))?.value?.text).toBe('Same');
		expect((await teamValue(f.teamA1, 'goal'))?.updated_by).toBe(f.a[1].email);
		expect((await teamValue(f.teamA1, 'method'))?.value?.text).toBe('New');
		const team = f.a.slice(0, 4);
		const goal = await Promise.all(team.map((s) => memberValue(s.email, 'goal')));
		const method = await Promise.all(team.map((s) => memberValue(s.email, 'method')));
		expect(goal).toEqual(['Same', 'Same', 'Same', 'Same']);
		expect(method).toEqual(['New', 'New', 'New', 'New']);
		// Boxes nobody answered stay empty: no team row is invented.
		expect(await teamValue(f.teamA1, 'frame-text')).toBeNull();

		expect((await teamValue(f.teamA2, 'goal'))?.value?.text).toBe('Solo');
		expect(await Promise.all(f.a.slice(4, 7).map((s) => memberValue(s.email, 'goal')))).toEqual(['Solo', 'Solo', 'Solo']);
	});

	it('an answer that lost to a newer one is in the box history, so nothing a student wrote is gone', async () => {
		expect(await history(f.teamA1, 'method')).toEqual(['ana.perez=Old', 'cara.lin=New']);
		expect(await history(f.teamA1, 'goal')).toEqual(['ben.ortiz=Same']);
	});

	it('an individual block is never copied to a teammate (present for its writer, absent for the other three)', async () => {
		const reflect = await Promise.all(f.a.slice(0, 4).map((s) => memberValue(s.email, 'reflect')));
		expect(reflect.filter((v) => v === 'Only mine')).toHaveLength(1);
		expect(reflect.filter((v) => v === null)).toHaveLength(3);
		const { rows } = await db.sql<{ n: number }>(
			"select count(*)::int as n from public.classroom_team_answers where item_id = $1 and block_id = 'reflect'",
			[f.item]
		);
		expect(rows[0].n).toBe(0);
	});

	it('the team page shows the carried answers', async () => {
		const doc = await rpc<{ values: Record<string, { value: { text: string } }> }>(f.a[3], 'public.classroom_team_document($1::uuid)', [f.item]);
		expect(doc.values.goal?.value?.text).toBe('Same');
		expect(doc.values.method?.value?.text).toBe('New');
	});

	it('a section whose draw is not posted gets nothing until it is posted, then its answers carry over', async () => {
		expect(await teamValue(f.teamB1, 'goal')).toBeNull();
		await postSet(db, f.teacher, f.setB);
		expect((await teamValue(f.teamB1, 'goal'))?.value?.text).toBe('Bee');
		expect(await Promise.all(f.b.map((s) => memberValue(s.email, 'goal')))).toEqual(['Bee', 'Bee', 'Bee']);
	});

	it('running it again changes nothing: a re-upload and a re-applied file add no history and move no answer', async () => {
		const before = (await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_team_log where item_id = $1', [f.item])).rows[0].n;
		const m = teamManifest();
		await rpc(f.admin, SET_HTML, [f.item, documentFor(m), JSON.stringify(m), 'plan.html']);
		await db.sql(migrationSql('0313'));
		const after = (await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_team_log where item_id = $1', [f.item])).rows[0].n;
		expect(after).toBe(before);
		expect((await teamValue(f.teamA1, 'method'))?.value?.text).toBe('New');
	});

	it('a team answer saved after the switch is never replaced by a carry-over', async () => {
		await rpc(f.a[0], SAVE, [f.item, 'goal', text('Changed by the team')]);
		await postSet(db, f.admin, f.setA);
		const m = teamManifest();
		await rpc(f.admin, SET_HTML, [f.item, documentFor(m), JSON.stringify(m), 'plan.html']);
		expect((await teamValue(f.teamA1, 'goal'))?.value?.text).toBe('Changed by the team');
	});
});
