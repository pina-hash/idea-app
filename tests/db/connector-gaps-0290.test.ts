// tests/db/connector-gaps-0290.test.ts
//
// 0290 (ledger 0422): what the connector could not do. The chain is booted
// SHORT of 0290, a class with teams, answers, contracts and market cards is
// made through the real RPCs (raw rows only where no RPC exists), then 0290
// is applied over the top.
//
// The silent guarantees, each with its control:
//   - a student reads their OWN team's progress, never another team's, and
//     never an answer's words; a student of another class is refused;
//   - a retired question's answers are read by a teacher of the class and by
//     nobody else; only an admin retires;
//   - every lookup refuses a non-admin; a name finds its record;
//   - a team added with its players carries no placeholder player.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;
const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = ALL.find((f) => f.startsWith('0290_'))!;
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < '0290')];

let db: TestDb;
let admin: SeededUser, teacher: SeededUser, other: SeededUser, ana: SeededUser, ben: SeededUser, cal: SeededUser, zed: SeededUser;
let s1: string, s2: string, item: string, contract: string;

const as = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	other = await createUser(db, 'other@boscotech.edu', 'Oth Er');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cal = await createUser(db, 'cal@boscotech.net', 'Cal Ng');
	zed = await createUser(db, 'zed@boscotech.net', 'Zed Zee');
	s1 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 2', teacherEmail: teacher.email });
	s2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: other.email });
	for (const [u, n] of [[ana, 'Ana Reyes'], [ben, 'Ben Ortiz'], [cal, 'Cal Ng']] as const) {
		await enrollStudent(db, { as: teacher, sectionId: s1, email: u.email, displayName: n });
	}
	await enrollStudent(db, { as: other, sectionId: s2, email: zed.email, displayName: 'Zed Zee' });
	item = (await as<{ item_id: string }>(teacher,
		`public.classroom_create_item('assignment', $1::uuid[], 'Blade Build', 'Do it.', 50, null, null, true, '[]'::jsonb, false)`, [[s1]])).item_id;
	// Answers, as the save path stores them (a string, a boolean, an empty table).
	await db.sql(`insert into public.classroom_responses (item_id, student_email, block_id, value) values
		($1, 'ben@boscotech.net', 'd1-sketch', '"a secret sentence"'::jsonb),
		($1, 'ben@boscotech.net', 'd1-check', 'true'::jsonb),
		($1, 'ben@boscotech.net', 'd2-table', '"[[\\"\\",\\"\\"]]"'::jsonb),
		($1, 'cal@boscotech.net', 'd1-sketch', '"cal wrote"'::jsonb)`, [item]);
	// A posted team set: Ana and Ben on team 1, Cal on team 2.
	const set = (await db.sql<{ id: string }>(`insert into public.classroom_team_sets (section_id, label, seed, mode, mode_value, created_by, posted_at)
		values ($1, 'Blade teams', 7, 'size', 2, 'teach@boscotech.edu', now() - interval '1 hour') returning id`, [s1])).rows[0].id;
	const t1 = (await db.sql<{ id: string }>(`insert into public.classroom_teams (team_set_id, team_number, name) values ($1, 1, 'Torque') returning id`, [set])).rows[0].id;
	const t2 = (await db.sql<{ id: string }>(`insert into public.classroom_teams (team_set_id, team_number) values ($1, 2) returning id`, [set])).rows[0].id;
	await db.sql(`insert into public.classroom_team_members (team_set_id, team_id, student_email) values ($1, $2, 'ana@boscotech.net'), ($1, $2, 'ben@boscotech.net'), ($1, $3, 'cal@boscotech.net')`, [set, t1, t2]);
	// A contract, posted the site's way.
	const c = await as<{ ok: boolean; id: string }>(admin, `public.coin_contract_post('Sweep IDEA Shop', 'Sweep it.', 'flat', 2, null, 1, null, false)`);
	expect(c.ok).toBe(true);
	contract = c.id;

	await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe('0290 applies', () => {
	test('re-applies cleanly', async () => {
		await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
	});
});

describe('teammates\' progress', () => {
	test('Ana sees her own team (Ben and herself), which steps hold an answer, and no answer\'s words', async () => {
		const r = await as<{ teams: { team_name: string; members: { name: string; me: boolean; answered: string[] }[] }[] }>(ana, 'public.classroom_team_progress($1::uuid)', [item]);
		expect(r.teams).toHaveLength(1);
		expect(r.teams[0].team_name).toBe('Torque');
		const names = r.teams[0].members.map((m) => m.name);
		expect(names).toEqual(['Ana Reyes', 'Ben Ortiz']);
		expect(names).not.toContain('Cal Ng');
		const benRow = r.teams[0].members.find((m) => m.name === 'Ben Ortiz')!;
		// The string and the boolean count; the empty table does not.
		expect(benRow.answered).toEqual(['d1-check', 'd1-sketch']);
		expect(JSON.stringify(r)).not.toContain('secret');
		expect(JSON.stringify(r)).not.toContain('cal wrote');
	});

	test('Cal sees only team 2; a student of another class is refused; an unposted set shows nothing', async () => {
		const c = await as<{ teams: { members: { name: string }[] }[] }>(cal, 'public.classroom_team_progress($1::uuid)', [item]);
		expect(c.teams.flatMap((t) => t.members.map((m) => m.name))).toEqual(['Cal Ng']);
		expect(await refusal(as(zed, 'public.classroom_team_progress($1::uuid)', [item]))).toMatch(/enrolled|does not exist/);
		await db.sql(`update public.classroom_team_sets set posted_at = null`);
		expect((await as<{ teams: unknown[] }>(ana, 'public.classroom_team_progress($1::uuid)', [item])).teams).toEqual([]);
		await db.sql(`update public.classroom_team_sets set posted_at = now() - interval '1 hour'`);
	});
});

describe('retired questions', () => {
	test('an admin retires; the class teacher and the admin read it; a student and another teacher read nothing; a teacher cannot retire', async () => {
		const blocks = JSON.stringify([{ block_id: 'd1-sketch', block: { id: 'd1-sketch', field: 'sketch', type: 'longText', prompt: 'Sketch it' }, module_title: 'Day 1' }]);
		expect(await refusal(as(teacher, 'public.classroom_html_retire_blocks($1::uuid, $2::jsonb)', [item, blocks]))).toMatch(/site admin/);
		expect((await as<Json>(admin, 'public.classroom_html_retire_blocks($1::uuid, $2::jsonb)', [item, blocks])).retired).toBe(1);
		expect((await as<Json>(admin, 'public.classroom_html_retire_blocks($1::uuid, $2::jsonb)', [item, blocks])).retired).toBe(0);
		expect(await as<unknown[]>(teacher, 'public.classroom_html_retired_blocks($1::uuid)', [item])).toHaveLength(1);
		expect(await as<unknown[]>(admin, 'public.classroom_html_retired_blocks($1::uuid)', [item])).toHaveLength(1);
		expect(await as<unknown[]>(ana, 'public.classroom_html_retired_blocks($1::uuid)', [item])).toEqual([]);
		expect(await as<unknown[]>(other, 'public.classroom_html_retired_blocks($1::uuid)', [item])).toEqual([]);
	});
});

describe('lookups', () => {
	test('a non-admin is refused; names find their records', async () => {
		expect(await refusal(as(teacher, `public.connector_lookup('section', 'Block 2')`))).toMatch(/Not found/);
		const sec = await as<{ matches: { id: string }[] }>(admin, `public.connector_lookup('section', 'idea100 block 2')`);
		expect(sec.matches.map((m) => m.id)).toEqual([s1]);
		const post = await as<{ matches: { id: string }[] }>(admin, `public.connector_lookup('post', 'blade build')`);
		expect(post.matches[0].id).toBe(item);
		const st = await as<{ matches: { id: string }[] }>(admin, `public.connector_lookup('student', 'ben ortiz')`);
		expect(st.matches[0].id).toBe(ben.email);
		const k = await as<{ matches: { id: string }[] }>(admin, `public.connector_lookup('contract', 'sweep idea shop')`);
		expect(k.matches.map((m) => m.id)).toEqual([contract]);
		expect(await refusal(as(admin, `public.connector_lookup('spaceship', 'x')`))).toMatch(/no lookup/);
	});
});

describe('contracts', () => {
	test('edit every field, assign a student, cancel and restore', async () => {
		const e = await as<Json>(admin, `public.coin_admin_edit_contract($1::uuid, p_title => 'Sweep the shop', p_payout_amount => 3, p_max_contractors => 2, p_section_id => $2::uuid, p_debt_only => true)`, [contract, s1]);
		expect(e.ok).toBe(true);
		const row = (await db.sql(`select title, payout_amount, max_contractors, class_section_id, debt_only from public.coin_contracts where id = $1`, [contract])).rows[0];
		expect(row).toMatchObject({ title: 'Sweep the shop', payout_amount: 3, max_contractors: 2, class_section_id: s1, debt_only: true });
		await as(admin, `public.coin_admin_edit_contract($1::uuid, p_clear_class => true, p_debt_only => false)`, [contract]);
		expect((await db.sql(`select class_section_id from public.coin_contracts where id = $1`, [contract])).rows[0].class_section_id).toBeNull();
		expect(await refusal(as(teacher, `public.coin_admin_edit_contract($1::uuid, p_title => 'x')`, [contract]))).toMatch(/full coin admin/);
		expect((await as<Json>(admin, `public.coin_admin_assign_contract($1::uuid, $2)`, [contract, ana.email])).ok).toBe(true);
		expect((await as<Json>(admin, `public.coin_admin_assign_contract($1::uuid, $2)`, [contract, ana.email])).reason).toBe('already_claimed');
		await as(admin, `public.coin_admin_cancel_contract($1::uuid, 'Removed by Mr. Pina')`, [contract]);
		expect((await as<Json>(admin, `public.coin_admin_assign_contract($1::uuid, $2)`, [contract, ben.email])).reason).toBe('not_open');
		expect((await as<Json>(admin, `public.coin_admin_restore_contract($1::uuid)`, [contract])).ok).toBe(true);
		expect((await db.sql(`select cancelled_at from public.coin_contracts where id = $1`, [contract])).rows[0].cancelled_at).toBeNull();
	});
});

describe('the IDEA Market list for staff', () => {
	test('every card with its featured state; a removed card is restored; a student cannot list', async () => {
		const made = await as<{ ok: boolean; id: string }>(admin, `public.coin_market_official_save(null, 'Tissue boxes', 'Bring a box', null, 5, null, 30)`);
		expect(made.ok).toBe(true);
		const id = made.id ?? (await db.sql<{ id: string }>(`select id from public.coin_market_listings where title = 'Tissue boxes'`)).rows[0].id;
		await as(admin, `public.coin_market_listing_staff($1::uuid, 'feature')`, [id]);
		const list = await as<{ id: string; featured: boolean }[]>(admin, 'public.coin_market_admin_listings()');
		expect(list.find((l) => l.id === id)?.featured).toBe(true);
		await as(admin, `public.coin_market_listing_staff($1::uuid, 'remove', 'test')`, [id]);
		expect((await as<{ id: string }[]>(admin, 'public.coin_market_admin_listings()')).some((l) => l.id === id)).toBe(false);
		expect((await as<{ id: string }[]>(admin, 'public.coin_market_admin_listings(true)')).some((l) => l.id === id)).toBe(true);
		expect((await as<Json>(admin, `public.coin_market_listing_staff($1::uuid, 'restore')`, [id])).ok).toBe(true);
		expect((await as<{ id: string }[]>(admin, 'public.coin_market_admin_listings()')).some((l) => l.id === id)).toBe(true);
		expect(await refusal(as(ana, 'public.coin_market_admin_listings()'))).toMatch(/coin staff/);
	});
});

describe('a tournament team with its real players', () => {
	test('no placeholder player; every player linked; too many players refused', async () => {
		const tid = await db.asUser(admin.id, async (q) => (await q<{ id: string }>(`select public.tournament_create('Blade Night', '3 per entry.', '{"team_size": 3}'::jsonb) as id`)).rows[0].id);
		await db.asUser(admin.id, (q) => q(`select public.tournament_set_status($1, 'registration_open')`, [tid]));
		const r = await as<{ ok: boolean; entry_id: string }>(admin, `public.tournament_host_add_team($1::uuid, 'Torque', $2::text[])`, [tid, [ana.email, ben.email, cal.email]]);
		expect(r.ok).toBe(true);
		const members = (await db.sql<{ name: string; user_id: string | null }>(`select name, user_id from public.tournament_entry_members where entry_id = $1 order by name`, [r.entry_id])).rows;
		expect(members.map((m) => m.name)).toEqual(['Ana Reyes', 'Ben Ortiz', 'Cal Ng']);
		expect(members.every((m) => m.user_id !== null)).toBe(true);
		expect(await refusal(as(admin, `public.tournament_host_add_team($1::uuid, 'Again', $2::text[])`, [tid, [ana.email]]))).toMatch(/already registered/);
		expect(await refusal(as(admin, `public.tournament_host_add_team($1::uuid, 'Big', $2::text[])`, [tid, ['a@x.net', 'b@x.net', 'c@x.net', 'd@x.net']]))).toMatch(/up to 3/);
		expect(await refusal(as(ana, `public.tournament_host_add_team($1::uuid, 'Mine', $2::text[])`, [tid, [zed.email]]))).not.toBeNull();
	});
});
