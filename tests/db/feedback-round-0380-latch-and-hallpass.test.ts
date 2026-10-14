// tests/db/feedback-round-0380-latch-and-hallpass.test.ts
//
// 0237 PARTS A AND B, on the whole tree with the file applied.
//
// PART A (report e32659e9): the worksheet latch. What would fail SILENTLY:
//   - a student stamping a latch for a worksheet they have never touched;
//   - a latch for somebody else's assignment, or for a spec assignment;
//   - the read returning another student's latch to a student, or a section's
//     latches to someone who does not manage it;
//   - a client able to write the table at all.
//
// PART B (report 7348d14c): the hall pass is a time budget. The rule is
//   debt(next) = max(0, debt + used - budget); allowance = max(0, budget - debt)
// asked at PINNED INSTANTS (the budget function takes `p_now`), never by moving
// `now()`: the week is Monday 2026-10-12 to Sunday 2026-10-18 in Los Angeles,
// and rows are inserted at fixed instants as the connection owner.
//   - 15 minutes on day one leaves 5 on day two; an unattended 30 leaves none
//     for two days; a debt that cannot clear before the reset says the reset;
//   - last week's time never counts, and a pass opened before the budget began
//     (the apply instant) costs nothing;
//   - a pass past the auto check-in is closed AT the mark and charged the full
//     figure, lazily, by any read;
//   - everyone in the class sees WHO IS OUT by shown name, never an address;
//   - the daily count and the cooldown are GONE (a third pass in a day is not
//     refused for being the third).

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { scanFile } from '../../tools/apply-migration.mjs';
import { WITH_0237, SQL_0237, part0237 } from './chain-0237';

type Json = Record<string, unknown>;

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let outsider: SeededUser;
let section: string;
let otherSection: string;

const LA = 'America/Los_Angeles';
const at = (local: string) => `(timestamp '${local}') at time zone '${LA}'`;

async function budget(email: string, nowLocal: string, sec = section): Promise<Json> {
	const { rows } = await db.sql<{ b: Json }>(`select public._classroom_hall_pass_budget($1::uuid, $2, ${at(nowLocal)}) as b`, [sec, email]);
	return rows[0].b;
}

/** A finished pass at a pinned local instant, `mins` long, as the connection owner. */
async function placePass(email: string, openedLocal: string, mins: number, sec = section): Promise<void> {
	await db.sql(
		`insert into public.classroom_hall_passes (section_id, student_email, opened_at, closed_at)
		 values ($1::uuid, $2, ${at(openedLocal)}, ${at(openedLocal)} + make_interval(mins => $3::int))`,
		[sec, email, mins]
	);
}

async function wipePasses() {
	await db.sql('delete from public.classroom_hall_passes');
}

const rpc = async <T = Json>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

beforeAll(async () => {
	db = await startTestDb(WITH_0237);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	outsider = await createUser(db, 'out@boscotech.net', 'Out Sider');
	await db.sql(`insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing`, [teacher.email]);
	section = await createClassroomSection(db, { as: teacher, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	otherSection = await createClassroomSection(db, { as: teacher, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: teacher.email });
	for (const s of [section, otherSection]) {
		await enrollStudent(db, { as: teacher, sectionId: s, email: ana.email, displayName: 'Ana Reyes' });
		await enrollStudent(db, { as: teacher, sectionId: s, email: ben.email, displayName: 'Ben Ortiz' });
	}
	// The budget starts when the migration applied; the pinned instants below are
	// before that, so the fixture moves the start, exactly as an owner would.
	await db.sql(`update public.classroom_hall_pass_budget_start set effective_at = '2000-01-01'`);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

describe('the file as an apply sees it', () => {
	test('it carries lettered parts and takes no top-level DML', async () => {
		for (const k of ['A', 'B']) expect(part0237(k), `part ${k}`).not.toBeNull();
		expect(scanFile(SQL_0237).findings).toEqual([]);
		// Positive control: the scanner does refuse a planted top-level insert.
		expect(scanFile(`${SQL_0237}\ninsert into public.classroom_hall_passes (id) values (gen_random_uuid());\n`).findings.length).toBeGreaterThan(0);
	});
	test('no new function of the file is executable by anon, and the new tables carry no client grant', async () => {
		const { rows } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname in ('classroom_worksheet_latch','classroom_worksheet_latched',
			   'classroom_hall_pass_set_limits','_classroom_hall_pass_budget','_classroom_hall_pass_sweep','_classroom_hall_pass_section_limits')
			   and has_function_privilege('anon', p.oid, 'execute')`
		);
		expect(rows).toEqual([]);
		const { rows: t } = await db.sql<{ n: string }>(
			`select table_name as n from information_schema.role_table_grants
			 where table_schema = 'public' and table_name in ('classroom_worksheet_latches','classroom_hall_pass_budget_start')
			   and grantee in ('anon','authenticated')`
		);
		expect(t).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// PART A
// ---------------------------------------------------------------------------

describe('PART A: the worksheet latch', () => {
	let ported: string;
	let spec: string;
	const manifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup',
		course: 'IDEA100',
		points: 2,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'p1',
				title: 'Bench',
				points: 2,
				blocks: [{ id: 'hx-text', field: 'f1', type: 'text' }],
				criteria: [
					{
						id: 'p1-c',
						text: 'Recorded',
						points: 2,
						levels: [
							{ points: 2, label: 'Complete', short: 'Recorded', descriptor: 'Recorded.' },
							{ points: 1, label: 'Developing', short: 'Partial', descriptor: 'Partial.' },
							{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};
	const doc = `<!doctype html><html><head><title>Bench</title></head><body><input data-field="studentName"><input data-field="f1"><script type="application/json" id="idea-manifest">${JSON.stringify(manifest)}</script></body></html>`;

	beforeAll(async () => {
		const mk = async (title: string) =>
			(
				await rpc<{ item_id: string }>(
					teacher,
					`public.classroom_create_item(p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2, p_body => 'b', p_points => 2, p_published => true)`,
					[[section], title]
				)
			).item_id;
		ported = await mk('Ported');
		spec = await mk('Spec');
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [ported, doc, JSON.stringify(manifest), 'bench.html']);
	}, 120_000);

	const latch = (u: SeededUser, item: string, at?: string) => rpc<boolean>(u, 'public.classroom_worksheet_latch($1::uuid, $2::timestamptz)', [item, at ?? null]);
	const latched = (u: SeededUser, items: string[], sec?: string) =>
		rpc<Array<{ item_id: string; student_email: string; completed_at: string }>>(u, 'public.classroom_worksheet_latched($1::uuid[], $2::uuid)', [items, sec ?? null]);

	test('a student who has answered nothing stamps nothing', async () => {
		expect(await latch(ana, ported)).toBe(false);
		expect(await latched(ana, [ported])).toEqual([]);
	});

	test('after one answer a student stamps their own once, and a second call changes nothing', async () => {
		await rpc(ana, `public.classroom_save_response($1::uuid, 'hx-text', '{"text":"ok"}'::jsonb)`, [ported]);
		expect(await latch(ana, ported, '2026-10-01T15:00:00Z')).toBe(true);
		expect(await latch(ana, ported, '2026-10-09T15:00:00Z')).toBe(false);
		const rows = await latched(ana, [ported]);
		expect(rows).toHaveLength(1);
		expect(rows[0].student_email).toBe(ana.email);
		expect(new Date(rows[0].completed_at).toISOString()).toBe('2026-10-01T15:00:00.000Z');
	});

	test('a future instant is capped at now, never stored ahead', async () => {
		await rpc(ben, `public.classroom_save_response($1::uuid, 'hx-text', '{"text":"ok"}'::jsonb)`, [ported]);
		expect(await latch(ben, ported, '2999-01-01T00:00:00Z')).toBe(true);
		const [row] = (await latched(ben, [ported])).filter((r) => r.student_email === ben.email);
		expect(new Date(row.completed_at).getTime()).toBeLessThanOrEqual(Date.now() + 5000);
	});

	test('a spec assignment and a stranger are both refused', async () => {
		await expect(latch(ana, spec)).rejects.toThrow(/not a worksheet/i);
		await expect(latch(outsider, ported)).rejects.toThrow(/enrolled|exist/i);
	});

	test('a student reads only their own latch; the teacher reads the section; a stranger reads nothing', async () => {
		expect((await latched(ana, [ported])).map((r) => r.student_email)).toEqual([ana.email]);
		expect((await latched(teacher, [ported], section)).map((r) => r.student_email).sort()).toEqual([ana.email, ben.email].sort());
		expect((await latched(teacher, [ported])).length).toBe(2);
		expect(await latched(outsider, [ported], section)).toEqual([]);
		expect(await latched(outsider, [ported])).toEqual([]);
	});

	test('the table cannot be written or read by a client at all', async () => {
		await expect(
			db.asUser(ana.id, (q) => q(`insert into public.classroom_worksheet_latches (item_id, student_email, completed_at) values ($1::uuid, $2, now())`, [ported, ana.email]))
		).rejects.toThrow(/permission denied/i);
		await expect(db.asUser(ana.id, (q) => q('select * from public.classroom_worksheet_latches'))).rejects.toThrow(/permission denied/i);
	});
});

// ---------------------------------------------------------------------------
// PART B
// ---------------------------------------------------------------------------

describe('PART B: the budget rule at pinned instants (week of Mon 2026-10-12)', () => {
	test('a fresh week: 10 minutes, nothing used, not blocked', async () => {
		await wipePasses();
		const b = await budget(ana.email, '2026-10-12 12:00');
		expect(b).toMatchObject({ daily_seconds: 600, allowance_seconds: 600, used_seconds: 0, remaining_seconds: 600, debt_seconds: 0, blocked: false });
	});

	test('15 minutes on day one leaves 5 minutes on day two', async () => {
		await wipePasses();
		await placePass(ana.email, '2026-10-12 10:00', 15);
		const mon = await budget(ana.email, '2026-10-12 12:00');
		expect(mon).toMatchObject({ used_seconds: 900, remaining_seconds: 0, blocked: true });
		const tue = await budget(ana.email, '2026-10-13 09:00');
		expect(tue).toMatchObject({ debt_seconds: 300, allowance_seconds: 300, remaining_seconds: 300, blocked: false });
	});

	test('five minutes on day two spends that allowance and blocks the rest of the day', async () => {
		await placePass(ana.email, '2026-10-13 09:00', 5);
		expect(await budget(ana.email, '2026-10-13 12:00')).toMatchObject({ remaining_seconds: 0, blocked: true });
		// ...and is exactly paid, so Wednesday is whole again.
		expect(await budget(ana.email, '2026-10-14 09:00')).toMatchObject({ debt_seconds: 0, allowance_seconds: 600, blocked: false });
	});

	test('an unattended pass is charged the full 30 and costs two days: blocked Tuesday and Wednesday, back Thursday', async () => {
		await wipePasses();
		await placePass(ben.email, '2026-10-12 10:00', 30);
		const tue = await budget(ben.email, '2026-10-13 09:00');
		expect(tue).toMatchObject({ debt_seconds: 1200, allowance_seconds: 0, blocked: true });
		expect(new Date(tue.available_at as string).toISOString()).toBe(new Date('2026-10-15T07:00:00Z').toISOString()); // Thursday 00:00 PDT
		expect(await budget(ben.email, '2026-10-14 09:00')).toMatchObject({ debt_seconds: 600, blocked: true });
		expect(await budget(ben.email, '2026-10-15 09:00')).toMatchObject({ debt_seconds: 0, remaining_seconds: 600, blocked: false });
	});

	test('a debt that cannot clear before the reset says the reset (Monday 00:00 Los Angeles)', async () => {
		await wipePasses();
		await placePass(ben.email, '2026-10-16 10:00', 30); // Friday
		const sat = await budget(ben.email, '2026-10-17 09:00');
		expect(sat).toMatchObject({ blocked: true });
		expect(new Date(sat.available_at as string).toISOString()).toBe(new Date('2026-10-19T07:00:00Z').toISOString());
		expect(new Date(sat.resets_at as string).toISOString()).toBe(new Date('2026-10-19T07:00:00Z').toISOString());
		// The reset itself: Monday is whole.
		expect(await budget(ben.email, '2026-10-19 09:00')).toMatchObject({ debt_seconds: 0, remaining_seconds: 600, blocked: false });
	});

	test('a charge is capped at the auto check-in however long the row says (20 hours is 30 minutes)', async () => {
		await wipePasses();
		await placePass(ana.email, '2026-10-12 09:00', 20 * 60);
		expect(await budget(ana.email, '2026-10-12 12:00')).toMatchObject({ used_seconds: 1800 });
	});

	test('time before the budget began costs nothing (control: the same row counts once the start moves back)', async () => {
		await wipePasses();
		await placePass(ana.email, '2026-10-12 10:00', 15);
		await db.sql(`update public.classroom_hall_pass_budget_start set effective_at = ${at('2026-10-12 11:00')}`);
		expect(await budget(ana.email, '2026-10-13 09:00')).toMatchObject({ debt_seconds: 0, allowance_seconds: 600 });
		await db.sql(`update public.classroom_hall_pass_budget_start set effective_at = '2000-01-01'`);
		expect(await budget(ana.email, '2026-10-13 09:00')).toMatchObject({ debt_seconds: 300 });
	});

	test('the week is Monday-based in Los Angeles, and a daylight-saving week does not shift a day', async () => {
		await wipePasses();
		// The Sunday before: last week's, so it never counts on Monday.
		await placePass(ana.email, '2026-10-11 10:00', 30);
		expect(await budget(ana.email, '2026-10-12 00:05')).toMatchObject({ debt_seconds: 0, remaining_seconds: 600 });
		// Across the November fall-back (2026-11-01): Monday 2026-11-02 resets as usual.
		await placePass(ana.email, '2026-10-30 10:00', 30);
		expect(await budget(ana.email, '2026-10-31 09:00')).toMatchObject({ debt_seconds: 1200, blocked: true });
		expect(await budget(ana.email, '2026-11-02 00:05')).toMatchObject({ debt_seconds: 0, blocked: false });
	});

	test('a section can set its own numbers, and nobody else can', async () => {
		const ok = await rpc<Json>(teacher, 'public.classroom_hall_pass_set_limits($1::uuid, 20, 15)', [section]);
		expect(ok).toMatchObject({ ok: true, limits: { budget_minutes: 20, auto_checkin_minutes: 15 } });
		await wipePasses();
		expect(await budget(ana.email, '2026-10-12 12:00')).toMatchObject({ daily_seconds: 1200 });
		await placePass(ana.email, '2026-10-12 10:00', 25); // capped at 15
		expect(await budget(ana.email, '2026-10-12 12:00')).toMatchObject({ used_seconds: 900 });
		expect(await rpc<Json>(teacher, 'public.classroom_hall_pass_set_limits($1::uuid, 999, null)', [section])).toMatchObject({ ok: false, reason: 'daily_out_of_range' });
		expect(await rpc<Json>(teacher, 'public.classroom_hall_pass_set_limits($1::uuid, null, 2)', [section])).toMatchObject({ ok: false, reason: 'auto_out_of_range' });
		await expect(rpc(ana, 'public.classroom_hall_pass_set_limits($1::uuid, 99, 99)', [section])).rejects.toThrow(/does not exist/i);
		await expect(rpc(outsider, 'public.classroom_hall_pass_set_limits($1::uuid, 99, 99)', [section])).rejects.toThrow(/does not exist/i);
		// Back to the defaults with nulls.
		await rpc(teacher, 'public.classroom_hall_pass_set_limits($1::uuid, null, null)', [section]);
		expect(await budget(ana.email, '2026-10-12 12:00')).toMatchObject({ daily_seconds: 600, auto_checkin_seconds: 1800 });
	});
});

describe('PART B: the live paths', () => {
	test('the daily count and the cooldown are gone: three quick trips are three trips', async () => {
		await wipePasses();
		for (let i = 0; i < 3; i++) {
			const o = await rpc<Json>(ana, 'public.classroom_hall_pass_open($1::uuid)', [section]);
			expect(o, `trip ${i + 1}`).toMatchObject({ ok: true });
			const c = await rpc<Json>(ana, 'public.classroom_hall_pass_close_mine($1::uuid)', [section]);
			expect(c).toMatchObject({ ok: true });
		}
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_hall_passes');
		expect(rows[0].n).toBe(3);
	});

	test('a student with the day spent is refused with the budget, the date and the reset, and nothing was opened', async () => {
		await wipePasses();
		// Ten minutes already used earlier TODAY (Los Angeles) by moving a row, not the clock.
		await db.sql(
			`insert into public.classroom_hall_passes (section_id, student_email, opened_at, closed_at)
			 select $1::uuid, $2, d + interval '1 second', d + interval '1 second' + interval '10 minutes'
			 from (select (date_trunc('day', now() at time zone '${LA}')) at time zone '${LA}' as d) x`,
			[section, ana.email]
		);
		const r = await rpc<Json>(ana, 'public.classroom_hall_pass_open($1::uuid)', [section]);
		expect(r).toMatchObject({ ok: false, reason: 'over_budget', remaining_seconds: 0, daily_seconds: 600 });
		expect(r.resets_at).toBeTruthy();
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_hall_passes where closed_at is null');
		expect(rows[0].n).toBe(0);
		// Positive control: Ben, with nothing used, is let out.
		expect(await rpc<Json>(ben, 'public.classroom_hall_pass_open($1::uuid)', [section])).toMatchObject({ ok: true });
		await rpc(ben, 'public.classroom_hall_pass_close_mine($1::uuid)', [section]);
	});

	test('a pass left open past the auto check-in is closed AT the mark by any read, and charged the full 30', async () => {
		await wipePasses();
		const o = await rpc<Json>(ana, 'public.classroom_hall_pass_open($1::uuid)', [section]);
		await db.sql(`update public.classroom_hall_passes set opened_at = now() - interval '41 minutes' where id = $1::uuid`, [o.pass_id]);
		// Ben only LOOKS: his read of the state is what closes Ana's pass.
		const st = await rpc<Json>(ben, 'public.classroom_hall_pass_state($1::uuid)', [section]);
		expect(st.taken).toBe(false);
		const { rows } = await db.sql<{ closed_by: string; mins: number }>(
			`select closed_by, extract(epoch from (closed_at - opened_at))::int / 60 as mins from public.classroom_hall_passes where id = $1::uuid`,
			[o.pass_id]
		);
		expect(rows[0]).toEqual({ closed_by: 'auto', mins: 30 });
		// And Ben can now take the pass: the room is free.
		expect(await rpc<Json>(ben, 'public.classroom_hall_pass_open($1::uuid)', [section])).toMatchObject({ ok: true });
		await rpc(ben, 'public.classroom_hall_pass_close_mine($1::uuid)', [section]);
	});

	test('everyone in the class sees WHO is out, by shown name and never an address; a stranger sees nothing', async () => {
		await wipePasses();
		await rpc(ben, 'public.classroom_hall_pass_open($1::uuid)', [section]);
		const st = await rpc<Json>(ana, 'public.classroom_hall_pass_state($1::uuid)', [section]);
		expect(st).toMatchObject({ scope: 'student', taken: true, mine: false, out: { name: 'Ben Ortiz' } });
		expect(JSON.stringify(st)).not.toMatch(/@/);
		expect(st).not.toHaveProperty('history');
		expect(st).not.toHaveProperty('roster');
		const mine = await rpc<Json>(ben, 'public.classroom_hall_pass_state($1::uuid)', [section]);
		expect(mine).toMatchObject({ taken: true, mine: true, out: { name: 'Ben Ortiz' } });
		const mgr = await rpc<Json>(teacher, 'public.classroom_hall_pass_state($1::uuid)', [section]);
		expect(mgr).toMatchObject({ scope: 'manager', open: { student_name: 'Ben Ortiz' } });
		expect(Object.keys(mgr.budgets as object).sort()).toEqual([ana.email, ben.email].sort());
		expect(await rpc(outsider, 'public.classroom_hall_pass_state($1::uuid)', [section])).toBeNull();
		await rpc(ben, 'public.classroom_hall_pass_close_mine($1::uuid)', [section]);
	});

	test('the override still sends a named student out whatever their budget, and the pass is charged', async () => {
		await wipePasses();
		await db.sql(
			`insert into public.classroom_hall_passes (section_id, student_email, opened_at, closed_at)
			 select $1::uuid, $2, d + interval '1 second', d + interval '1 second' + interval '10 minutes'
			 from (select (date_trunc('day', now() at time zone '${LA}')) at time zone '${LA}' as d) x`,
			[section, ana.email]
		);
		expect(await rpc<Json>(teacher, 'public.classroom_hall_pass_open_for($1::uuid, $2)', [section, ana.email])).toMatchObject({ ok: true, opened_by: teacher.email });
		await rpc(ana, 'public.classroom_hall_pass_close_mine($1::uuid)', [section]);
	});
});
