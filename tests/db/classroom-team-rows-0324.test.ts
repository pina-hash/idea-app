// tests/db/classroom-team-rows-0324.test.ts
//
// LEDGER 0456, MIGRATION 0324: A TEAM TABLE LOCKS BY ROW, A TEAM NAME THAT
// NAMES A CLASSMATE IS HELD, AND THE UNIT 4 TEAM TOOLS.
//
// The production case, replayed: the chain short of 0324, a team post with a
// shared table, saved through the real pre-0324 save (which locked the whole
// table), then 0324 applied over that data. Held, both directions counted:
//   - two teammates hold two rows of one table at once; a third cannot take a
//     held row; a save keeps a held row's words and writes the rest, even from
//     a stale copy of the table;
//   - a student's team name or tagline naming a classmate is held, not shown,
//     for the class's instructor only; a teacher's own write is never held;
//   - a student reads only their own team's box history; the machine week and
//     a class's late start answer the classes the caller manages only.

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

/** The fixture's post with a shared weighted-objectives table. */
function tableManifest() {
	const m = teamManifest() as unknown as { points: number; modules: Record<string, unknown>[] };
	m.modules.push({
		id: 'matrix',
		title: 'Weighted objectives',
		points: 10,
		audience: 'team',
		blocks: [{ id: 'wot', field: 'wotTable', type: 'table' }],
		criteria: [{ id: 'c1', text: 'Matrix', points: 10, levels: LEVELS(10) }]
	});
	m.points += 10;
	return m as unknown as ReturnType<typeof teamManifest>;
}

const table = (rows: string[][]) => JSON.stringify({ text: JSON.stringify(rows) });

describe('0324 team rows, held names and team tools', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	const save = (u: SeededUser, block: string, value: string) =>
		rpc<{ ok: boolean; reason?: string; kept_rows?: number[] }>(u, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [f.item, block, value]);
	const lock = (u: SeededUser, block: string, take = true) =>
		rpc<{ ok: boolean; reason?: string; by?: string; rows?: boolean }>(u, 'public.classroom_team_box_lock($1::uuid, $2, $3)', [f.item, block, take]);
	const stored = async (team: string) =>
		(
			await db.sql<{ value: { text: string } }>(
				`select value from public.classroom_team_answers where team_id = $1 and item_id = $2 and block_id = 'wot'`,
				[team, f.item]
			)
		).rows[0]?.value.text;
	const teamName = async (team: string) =>
		(await db.sql<{ name: string | null; tagline: string | null }>('select name, tagline from public.classroom_teams where id = $1', [team])).rows[0];

	beforeAll(async () => {
		db = await startTestDb(treeShortOf('0324'));
		f = await seedUnit4(db);
		({ rpc, refusal } = rpcOf(db));
		const m = tableManifest();
		await rpc(f.admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [f.item, documentFor(m), JSON.stringify(m), 'plan.html']);
		await postSet(db, f.admin, f.setA);
		await postSet(db, f.teacher, f.setB);
		// PRE-0324 DATA: Ana saves the table through the old save, which took
		// the WHOLE table's lock; then she releases it.
		expect((await save(f.a[0], 'wot', table([['Mass', '10'], ['Cost', '5']]))).ok).toBe(true);
		await lock(f.a[0], 'wot', false);
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('before 0324 one student holds the whole table (the bug, measured)', async () => {
		expect((await lock(f.a[0], 'wot')).ok).toBe(true);
		expect(await lock(f.a[1], 'wot')).toMatchObject({ ok: false, reason: 'held', by: 'Ana' });
		await lock(f.a[0], 'wot', false);
	});

	it('is safe to paste and re-applies', async () => {
		expect(pasteTrap(migrationSql('0324'))).toEqual([]);
		await db.sql(migrationSql('0324'));
		await db.sql(migrationSql('0324'));
	});

	it('two teammates hold two rows at once; a held row is refused to a third', async () => {
		expect(await lock(f.a[0], 'wot#r0')).toMatchObject({ ok: true });
		expect(await lock(f.a[1], 'wot#r1')).toMatchObject({ ok: true });
		expect(await lock(f.a[2], 'wot#r0')).toMatchObject({ ok: false, reason: 'held', by: 'Ana' });
		// A whole table is never locked: asking takes nothing and refuses nobody.
		expect(await lock(f.a[2], 'wot')).toMatchObject({ ok: true, rows: true });
		expect(await lock(f.a[3], 'wot#r2')).toMatchObject({ ok: true });
		// A row of a box that is not a table is not a lock.
		expect(await refusal(f.a[0], 'public.classroom_team_box_lock($1::uuid, $2, $3)', [f.item, 'goal#r0', true])).toMatch(/not shared/);
	});

	it('a save keeps a held row and writes the rest, even from a stale copy', async () => {
		// Ben holds row 1, Ana row 0. Ben's save changes both rows.
		const ben = await save(f.a[1], 'wot', table([['Speed', '10'], ['Cost', '7']]));
		expect(ben).toMatchObject({ ok: true, kept_rows: [0] });
		expect(await stored(f.teamA1)).toBe('[["Mass","10"],["Cost","7"]]');
		// Ana saves from her stale copy: row 0 is hers, row 1 is Ben's and keeps his 7.
		const ana = await save(f.a[0], 'wot', table([['Range', '10'], ['Cost', '5']]));
		expect(ana).toMatchObject({ ok: true, kept_rows: [1] });
		expect(await stored(f.teamA1)).toBe('[["Range","10"],["Cost","7"]]');
		// A box that is not a table still locks whole.
		expect((await save(f.a[0], 'goal', JSON.stringify({ text: 'Far' }))).ok).toBe(true);
		expect(await save(f.a[1], 'goal', JSON.stringify({ text: 'Near' }))).toMatchObject({ ok: false, reason: 'held' });
	});

	it('a student team name naming a classmate is held for the class instructor; a teacher is never held', async () => {
		// Eli Moss is on team A2. Ana (A1) names her team after him.
		await rpc(f.a[0], 'public.classroom_set_team_style($1::uuid, $2)', [f.teamA1, 'Moss Bosses']);
		expect((await teamName(f.teamA1)).name).not.toBe('Moss Bosses');
		const holds = await rpc<{ holds: { id: string; text: string; hits: string[] }[] }>(f.admin, 'public.classroom_team_text_holds_list()');
		expect(holds.holds).toEqual([expect.objectContaining({ text: 'Moss Bosses', hits: ['Moss'] })]);
		// Block 4's teacher manages another class: nothing; a student: nothing.
		expect((await rpc<{ holds: unknown[] }>(f.teacher, 'public.classroom_team_text_holds_list()')).holds).toEqual([]);
		expect((await rpc<{ holds: unknown[] }>(f.a[0], 'public.classroom_team_text_holds_list()')).holds).toEqual([]);
		expect(await refusal(f.a[0], 'public.classroom_team_text_hold_decide($1::uuid, $2)', [holds.holds[0].id, true])).toMatch(/does not exist/);
		// A name that names nobody is applied at once; a team's own member is never a hit.
		await rpc(f.a[0], 'public.classroom_set_team_style($1::uuid, $2)', [f.teamA1, 'Perez Rockets']);
		expect((await teamName(f.teamA1)).name).toBe('Perez Rockets');
		// The admin allows the held one: it is applied.
		expect(await rpc(f.admin, 'public.classroom_team_text_hold_decide($1::uuid, $2)', [holds.holds[0].id, true])).toMatchObject({ ok: true, status: 'approved' });
		expect((await teamName(f.teamA1)).name).toBe('Moss Bosses');
		// A teacher's own write is never held.
		await rpc(f.teacher, 'public.classroom_set_team_style($1::uuid, $2)', [f.teamB1, 'Moss Fans']);
		expect((await teamName(f.teamB1)).name).toBe('Moss Fans');
	});

	it('box history: a student reads their own team only, newest first, and puts a version back', async () => {
		type H = { entries: { by: string | null; value: { text: string } }[] };
		const mine = await rpc<H>(f.a[2], 'public.classroom_team_box_history_mine($1::uuid, $2)', [f.item, 'wot']);
		expect(mine.entries.map((e) => e.by)).toEqual(['Ana', 'Ben', 'Ana']);
		expect(mine.entries[0].value.text).toBe('[["Range","10"],["Cost","7"]]');
		const other = await rpc<H>(f.a[4], 'public.classroom_team_box_history_mine($1::uuid, $2)', [f.item, 'wot']);
		expect(other.entries).toEqual([]);
		const outsider = await rpc<H>(f.b[0], 'public.classroom_team_box_history_mine($1::uuid, $2)', [f.item, 'wot']);
		expect(outsider.entries).toEqual([]);
		// Release the row locks, then put the first version back.
		for (const [u, k] of [[f.a[0], 'wot#r0'], [f.a[1], 'wot#r1'], [f.a[3], 'wot#r2']] as const) await lock(u, k, false);
		await db.sql(`delete from public.classroom_team_box_locks where team_id = $1`, [f.teamA1]);
		expect((await save(f.a[2], 'wot', JSON.stringify(mine.entries[2].value))).ok).toBe(true);
		expect(await stored(f.teamA1)).toBe('[["Mass","10"],["Cost","5"]]');
	});

	it('the machine week: bookings across the caller’s classes, a clash flagged, nobody else’s class', async () => {
		for (const u of [f.a[0], f.a[4], f.b[0]]) await rpc(u, 'public.classroom_team_plan($1::uuid, $2::uuid)', [u === f.b[0] ? f.sectionB : f.sectionA, null]);
		await db.sql(
			`update public.classroom_team_tasks t set machine = 'laser', due_on = '2030-03-05'
			 from public.classroom_team_plans p
			 where p.id = t.plan_id and t.block_id = 'goal' and p.team_id = any ($1::uuid[])`,
			[[f.teamA1, f.teamA2, f.teamB1]]
		);
		type W = { bookings: { team: string; section: string; clash: boolean }[] };
		const admin = await rpc<W>(f.admin, 'public.classroom_machine_week($1::date)', ['2030-03-04']);
		expect(admin.bookings.length).toBe(3);
		expect(admin.bookings.every((b) => b.clash)).toBe(true);
		const cosso = await rpc<W>(f.teacher, 'public.classroom_machine_week($1::date)', ['2030-03-04']);
		expect(cosso.bookings.map((b) => b.section)).toEqual(['Block 4']);
		expect((await rpc<W>(f.a[0], 'public.classroom_machine_week($1::date)', ['2030-03-04'])).bookings).toEqual([]);
	});

	it('a class running late: its own students read shifted dates; only its teacher sets it', async () => {
		expect(await refusal(f.teacher, 'public.classroom_item_section_shift_set($1::uuid, $2::uuid, $3)', [f.item, f.sectionA, 2])).toMatch(/not in a class you teach/);
		expect(await refusal(f.b[0], 'public.classroom_item_section_shift_set($1::uuid, $2::uuid, $3)', [f.item, f.sectionB, 2])).toMatch(/not in a class you teach/);
		expect(await rpc(f.teacher, 'public.classroom_item_section_shift_set($1::uuid, $2::uuid, $3)', [f.item, f.sectionB, 2])).toMatchObject({ ok: true });
		type P = { shift: number };
		expect((await rpc<P>(f.b[0], 'public.classroom_item_pacing($1::uuid)', [f.item])).shift).toBe(2);
		expect((await rpc<P>(f.a[0], 'public.classroom_item_pacing($1::uuid)', [f.item])).shift).toBe(0);
		type Plan = { checkpoints: { key: string; date: string }[] };
		const b = await rpc<Plan>(f.b[0], 'public.classroom_team_plan($1::uuid, $2::uuid)', [f.sectionB, null]);
		const a = await rpc<Plan>(f.a[0], 'public.classroom_team_plan($1::uuid, $2::uuid)', [f.sectionA, null]);
		expect(a.checkpoints.find((c) => c.key === 'plan')?.date).toBe('2026-10-28');
		expect(b.checkpoints.find((c) => c.key === 'plan')?.date).toBe('2026-10-30');
		const shifts = await rpc<{ shifts: { section_id: string; days: number }[] }>(f.teacher, 'public.classroom_item_section_shifts($1::uuid)', [f.item]);
		expect(shifts.shifts).toEqual([{ section_id: f.sectionB, days: 2 }]);
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
					'classroom_team_text_holds_list',
					'classroom_team_text_hold_decide',
					'classroom_team_box_history_mine',
					'classroom_machine_week',
					'classroom_item_section_shift_set',
					'classroom_item_section_shifts',
					'_idea_roster_name_hits',
					'_classroom_teams_name_hold',
					'_classroom_table_rows'
				]
			]
		);
		expect(rows.filter((r) => r.anon)).toEqual([]);
		expect(rows.filter((r) => r.auth).map((r) => r.fn.split('(')[0].replace('public.', '')).sort()).toEqual([
			'classroom_item_section_shift_set',
			'classroom_item_section_shifts',
			'classroom_machine_week',
			'classroom_team_box_history_mine',
			'classroom_team_text_hold_decide',
			'classroom_team_text_holds_list'
		]);
	});
});
