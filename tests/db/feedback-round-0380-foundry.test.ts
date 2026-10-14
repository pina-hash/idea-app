// tests/db/feedback-round-0380-foundry.test.ts
//
// 0237 PARTS C TO H, on the whole tree with the file applied (ledger 0380).
//
// What would fail SILENTLY, and so is asserted here:
//   C. A class's Foundry closes by schedule: the window, the weekly pattern
//      replaced by a date exception, the hand switch winning, a hand-open
//      holding only until its window ends, and nobody but the class's teacher
//      writing any of it. Asked at PINNED INSTANTS (2026-10-12 is a Monday in
//      Los Angeles) through the one helper, and once at the real now() through
//      foundry_section_access, with a window covering the whole day.
//   D. Gallery overrides: admin-only, a null field falls back, all null removes
//      the row, a thumbnail must be a path in the caller-shaped folder.
//   E. Collections: a student reads published ones only, never a hidden app,
//      and nobody but an admin writes.
//   F. People search: admin-only, wildcards are text, at most twelve rows.
//   G. Votes: one per person per app, changeable and removable, never on your
//      own app or a hidden one, and no read names a voter.
//   H. Featured: admin-only, ordered, a pick the gallery would not show is not
//      shown.
// And the file as a whole: lettered parts, no top-level DML, no `$` in a
// comment, and a second paste changes nothing.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import { WITH_0237, SQL_0237, part0237, pasteTrap } from './chain-0237';

type Json = Record<string, unknown>;

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let other: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cy: SeededUser;
let section: string;
let otherSection: string;

const LA = 'America/Los_Angeles';
const at = (local: string) => `(timestamp '${local}') at time zone '${LA}'`;
const apps: Record<string, { app: string; version: string }> = {};

const rpc = async <T = Json>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

async function closedAt(sec: string, local: string): Promise<Json> {
	const { rows } = await db.sql<{ r: Json }>(`select public._foundry_section_closed($1::uuid, ${at(local)}) as r`, [sec]);
	return rows[0].r;
}

async function publishApp(as: SeededUser, slug: string) {
	const appId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[slug, `App ${slug}`, 'Plain HTML and a bit of JavaScript.', 'A test app.']
		);
		return rows[0].r.app_id;
	});
	const versionId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, `uploads/${appId}/v1.zip`]
		);
		return rows[0].r.version_id;
	});
	await db.asUser(as.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [versionId]));
	await db.asUser(admin.id, (q) => q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [versionId]));
	apps[slug] = { app: appId, version: versionId };
}

beforeAll(async () => {
	db = await startTestDb(WITH_0237);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	other = await createUser(db, 'other@boscotech.edu', 'Oh Ther');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cy = await createUser(db, 'cy@boscotech.net', 'Cy Park');
	section = await createClassroomSection(db, { as: teacher, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	otherSection = await createClassroomSection(db, { as: other, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: other.email });
	await enrollStudent(db, { as: teacher, sectionId: section, email: ana.email, displayName: 'Ana Reyes' });
	await enrollStudent(db, { as: other, sectionId: otherSection, email: ben.email, displayName: 'Ben Ortiz' });
	await publishApp(ana, 'ana-game');
	await publishApp(ben, 'ben-game');
	await publishApp(cy, 'cy-game');
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

describe('the file as an apply sees it', () => {
	test('it carries every lettered part, takes no top-level DML and has no paste trap', () => {
		for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Z']) expect(part0237(k), `part ${k}`).not.toBeNull();
		expect(scanFile(SQL_0237).findings).toEqual([]);
		expect(pasteTrap(SQL_0237)).toEqual([]);
		// Positive controls: both instruments bite on a planted defect.
		expect(scanFile(`${SQL_0237}\ninsert into public.foundry_featured (subject, position) values ('house:vanguard', 0);\n`).findings.length).toBeGreaterThan(0);
		expect(pasteTrap(`${SQL_0237}\n-- a stray $tag$ in a comment\n`).length).toBeGreaterThan(0);
	});

	test('a second paste applies cleanly and changes nothing it owns', async () => {
		await rpc(admin, `public.foundry_featured_set(array['house:vanguard'])`);
		await db.sql(SQL_0237);
		expect(await rpc(admin, `public.foundry_featured_read(false)`)).toEqual(['house:vanguard']);
		await rpc(admin, `public.foundry_featured_set('{}'::text[])`);
	}, 120_000);

	test('no function or table of Foundry parts C to H is open to anon or carries a client grant', async () => {
		const { rows } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and (p.proname like 'foundry\\_class\\_schedule%' or p.proname like 'foundry\\_collection%'
			   or p.proname in ('_foundry_schedule_window','_foundry_section_closed','_foundry_subject_visible','foundry_gallery_overrides_read',
			     'foundry_gallery_override_set','foundry_people_search','foundry_vote','foundry_vote_counts','foundry_featured_read','foundry_featured_set',
			     'foundry_section_access','foundry_set_section_open'))
			   and has_function_privilege('anon', p.oid, 'execute')`
		);
		expect(rows).toEqual([]);
		const { rows: t } = await db.sql<{ n: string }>(
			`select table_name as n from information_schema.role_table_grants
			 where table_schema = 'public' and grantee in ('anon','authenticated')
			   and table_name in ('foundry_class_schedule','foundry_class_schedule_days','foundry_gallery_overrides','foundry_collections',
			     'foundry_collection_members','foundry_app_votes','foundry_featured')`
		);
		expect(t).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// PART C
// ---------------------------------------------------------------------------

describe('PART C: the Foundry opens and closes by class schedule', () => {
	const MON_WINDOWS = [{ weekday: 1, starts: '10:00', ends: '10:55' }, { weekday: 3, starts: '13:00', ends: '13:55' }];

	test('only the class teacher reads or writes a schedule, and "not yours" is "not found"', async () => {
		for (const who of [ana, other]) {
			await expect(rpc(who, `public.foundry_class_schedule_get($1::uuid)`, [section])).rejects.toThrow(/does not exist/);
			await expect(rpc(who, `public.foundry_class_schedule_set($1::uuid, true, '[]'::jsonb)`, [section])).rejects.toThrow(/does not exist/);
			await expect(rpc(who, `public.foundry_class_schedule_day_set($1::uuid, current_date, 'no_class')`, [section])).rejects.toThrow(/does not exist/);
		}
		const { rows } = await db.sql(`select count(*)::int as n from public.foundry_class_schedule`);
		expect((rows[0] as { n: number }).n).toBe(0);
	});

	test('a saved pattern closes the class inside its window and only there', async () => {
		const r = await rpc<Json>(teacher, `public.foundry_class_schedule_set($1::uuid, true, $2::jsonb)`, [section, JSON.stringify(MON_WINDOWS)]);
		expect(r.ok).toBe(true);
		// 2026-10-12 is a Monday; 2026-10-13 a Tuesday; 2026-10-14 a Wednesday.
		expect((await closedAt(section, '2026-10-12 10:00:00')).closed).toBe(true);
		expect((await closedAt(section, '2026-10-12 10:54:59')).closed).toBe(true);
		expect((await closedAt(section, '2026-10-12 09:59:59')).closed).toBe(false);
		expect((await closedAt(section, '2026-10-12 10:55:00')).closed).toBe(false);
		expect((await closedAt(section, '2026-10-13 10:30:00')).closed).toBe(false);
		const wed = await closedAt(section, '2026-10-14 13:30:00');
		expect(wed.closed).toBe(true);
		expect(wed.by).toBe('schedule');
		expect(String(wed.until)).toContain('2026-10-14T20:55:00');
	});

	test('switching the schedule off opens every window, with the pattern kept', async () => {
		await rpc(teacher, `public.foundry_class_schedule_set($1::uuid, false, $2::jsonb)`, [section, JSON.stringify(MON_WINDOWS)]);
		expect((await closedAt(section, '2026-10-12 10:30:00')).closed).toBe(false);
		const got = await rpc<Json>(teacher, `public.foundry_class_schedule_get($1::uuid)`, [section]);
		expect(got.enabled).toBe(false);
		expect((got.weekly as unknown[]).length).toBe(2);
		await rpc(teacher, `public.foundry_class_schedule_set($1::uuid, true, $2::jsonb)`, [section, JSON.stringify(MON_WINDOWS)]);
	});

	/** A Monday at least a week out, as a date string, so the exception range (yesterday to about a year) always holds. */
	async function futureMonday(plusWeeks = 0): Promise<string> {
		const { rows } = await db.sql<{ d: string }>(
			`select to_char(d + ((8 - extract(isodow from d)::int) % 7) + 7 * $1::int, 'YYYY-MM-DD') as d
			 from (select current_date + 7 as d) x`,
			[plusWeeks]
		);
		return rows[0].d;
	}

	test('a date exception replaces the weekly pattern for that date alone', async () => {
		const monday = await futureMonday();
		const nextMonday = await futureMonday(1);
		// No class that Monday: open through the usual window (and an early open).
		expect((await rpc<Json>(teacher, `public.foundry_class_schedule_day_set($1::uuid, $2::date, 'no_class')`, [section, monday])).ok).toBe(true);
		expect((await closedAt(section, `${monday} 10:30:00`)).closed).toBe(false);
		// An odd schedule day: its own window, the weekly one ignored.
		await rpc(teacher, `public.foundry_class_schedule_day_set($1::uuid, $2::date, 'window', $3::jsonb)`, [section, monday, JSON.stringify([{ starts: '08:00', ends: '09:00' }])]);
		expect((await closedAt(section, `${monday} 08:30:00`)).closed).toBe(true);
		expect((await closedAt(section, `${monday} 10:30:00`)).closed).toBe(false);
		// The following Monday is untouched by it.
		expect((await closedAt(section, `${nextMonday} 10:30:00`)).closed).toBe(true);
		const cleared = await rpc<Json>(teacher, `public.foundry_class_schedule_day_clear($1::uuid, $2::date)`, [section, monday]);
		expect(cleared.removed).toBeGreaterThan(0);
		expect((await closedAt(section, `${monday} 10:30:00`)).closed).toBe(true);
	});

	test('bad input is refused in words and writes nothing', async () => {
		const bad = async (call: string, params: unknown[]) => (await rpc<Json>(teacher, call, params)).reason;
		expect(await bad(`public.foundry_class_schedule_set($1::uuid, true, $2::jsonb)`, [section, JSON.stringify([{ weekday: 1, starts: '11:00', ends: '10:00' }])])).toBe('window_order');
		expect(await bad(`public.foundry_class_schedule_set($1::uuid, true, $2::jsonb)`, [section, JSON.stringify([{ weekday: 9, starts: '10:00', ends: '11:00' }])])).toBe('window_shape');
		expect(await bad(`public.foundry_class_schedule_set($1::uuid, true, $2::jsonb)`, [section, JSON.stringify([{ weekday: 1, starts: 'soon', ends: '11:00' }])])).toBe('window_shape');
		expect(await bad(`public.foundry_class_schedule_set($1::uuid, true, '{}'::jsonb)`, [section])).toBe('weekly_shape');
		expect(await bad(`public.foundry_class_schedule_day_set($1::uuid, '2019-01-01', 'no_class')`, [section])).toBe('date_range');
		expect(await bad(`public.foundry_class_schedule_day_set($1::uuid, current_date, 'maybe')`, [section])).toBe('kind');
		// The good pattern survived every refusal.
		const got = await rpc<Json>(teacher, `public.foundry_class_schedule_get($1::uuid)`, [section]);
		expect((got.weekly as unknown[]).length).toBe(2);
	});

	test('foundry_section_access: a scheduled window closes it for a student, an admin is exempt, the hand holds', async () => {
		// A window covering the whole of every day, so the real now() is inside it.
		const all = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, starts: '00:00', ends: '23:59:59' }));
		await rpc(teacher, `public.foundry_class_schedule_set($1::uuid, true, $2::jsonb)`, [section, JSON.stringify(all)]);
		const seen = await rpc<Json>(ana, `public.foundry_section_access()`);
		expect(seen.open).toBe(false);
		const row = (seen.closed as Json[])[0];
		expect(row.by).toBe('schedule');
		expect(typeof row.until).toBe('string');
		expect(row.section_id).toBe(section);
		// Not enrolled anywhere with a window: ben is unaffected.
		expect((await rpc<Json>(ben, `public.foundry_section_access()`)).open).toBe(true);
		expect((await rpc<Json>(admin, `public.foundry_section_access()`)).open).toBe(true);
		// The teacher opens it by hand for this window.
		await rpc(teacher, `public.foundry_set_section_open($1::uuid, true)`, [section]);
		expect((await rpc<Json>(ana, `public.foundry_section_access()`)).open).toBe(true);
		const held = await db.sql<{ until: Date | null }>(`select foundry_open_until as until from public.classroom_sections where id = $1`, [section]);
		expect(held.rows[0].until).not.toBeNull();
		// A hand close wins over everything and stays until opened.
		await rpc(teacher, `public.foundry_set_section_open($1::uuid, false, 'Quiz')`, [section]);
		const closed = await rpc<Json>(ana, `public.foundry_section_access()`);
		expect(closed.open).toBe(false);
		expect(((closed.closed as Json[])[0]).by).toBe('hand');
		expect(((closed.closed as Json[])[0]).note).toBe('Quiz');
		// Back to nothing for the later suites.
		await rpc(teacher, `public.foundry_class_schedule_set($1::uuid, false, '[]'::jsonb)`, [section]);
		await rpc(teacher, `public.foundry_set_section_open($1::uuid, true)`, [section]);
		expect((await rpc<Json>(ana, `public.foundry_section_access()`)).open).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// PART D
// ---------------------------------------------------------------------------

describe('PART D: gallery overrides', () => {
	const THUMB = '11111111-2222-4333-8444-555555555555/cover.png';

	test('only an admin writes, and a stranger or the owner changes nothing', async () => {
		for (const who of [ana, teacher, ben]) {
			await expect(rpc(who, `public.foundry_gallery_override_set('house:vanguard', 'X', null, null)`)).rejects.toThrow(/Only a site administrator/);
		}
		expect(await rpc<Json[]>(ana, `public.foundry_gallery_overrides_read()`)).toEqual([]);
	});

	test('a field set shows, a field left null falls back, all null removes the row', async () => {
		const set = await rpc<Json>(admin, `public.foundry_gallery_override_set('house:greenline', 'GREENLINE 2', 'Race again.', $1)`, [THUMB]);
		expect(set.ok).toBe(true);
		let read = await rpc<Json[]>(ana, `public.foundry_gallery_overrides_read()`);
		expect(read).toEqual([{ subject: 'house:greenline', title: 'GREENLINE 2', description: 'Race again.', thumbnail_path: THUMB }]);
		await rpc(admin, `public.foundry_gallery_override_set('house:greenline', null, 'Race again.', null)`);
		read = await rpc<Json[]>(ana, `public.foundry_gallery_overrides_read()`);
		expect(read[0].title).toBeNull();
		expect(read[0].thumbnail_path).toBeNull();
		expect(read[0].description).toBe('Race again.');
		const cleared = await rpc<Json>(admin, `public.foundry_gallery_override_set('house:greenline', null, '  ', null)`);
		expect(cleared.cleared).toBe(true);
		expect(await rpc<Json[]>(ana, `public.foundry_gallery_overrides_read()`)).toEqual([]);
	});

	test('a major release app is overridable, an unknown subject or odd thumbnail is refused', async () => {
		expect((await rpc<Json>(admin, `public.foundry_gallery_override_set($1, 'Better name', null, null)`, [`app:${apps['ben-game'].app}`])).ok).toBe(true);
		expect((await rpc<Json>(admin, `public.foundry_gallery_override_set($1, 'Ghost', null, null)`, ['app:00000000-0000-4000-8000-000000000000'])).reason).toBe('not_found');
		expect((await rpc<Json>(admin, `public.foundry_gallery_override_set('house:other', 'x', null, null)`)).reason).toBe('subject');
		expect((await rpc<Json>(admin, `public.foundry_gallery_override_set('house:vanguard', null, null, '../../etc/passwd')`)).reason).toBe('thumbnail');
		await rpc(admin, `public.foundry_gallery_override_set($1, null, null, null)`, [`app:${apps['ben-game'].app}`]);
	});

	test('the student app row itself is never written by an override', async () => {
		await rpc(admin, `public.foundry_gallery_override_set($1, 'Changed', 'Changed', null)`, [`app:${apps['ana-game'].app}`]);
		const { rows } = await db.sql<{ name: string }>(`select title as name from public.student_apps where id = $1`, [apps['ana-game'].app]);
		expect(rows[0].name).toBe('App ana-game');
		await rpc(admin, `public.foundry_gallery_override_set($1, null, null, null)`, [`app:${apps['ana-game'].app}`]);
	});
});

// ---------------------------------------------------------------------------
// PART E
// ---------------------------------------------------------------------------

describe('PART E: collections', () => {
	let cid: string;

	test('only an admin writes any of it', async () => {
		for (const who of [ana, teacher]) {
			await expect(rpc(who, `public.foundry_collection_save(null, 'Mine', null, '{}'::text[])`)).rejects.toThrow(/Only a site administrator/);
			await expect(rpc(who, `public.foundry_collection_delete($1::uuid)`, ['00000000-0000-4000-8000-000000000000'])).rejects.toThrow(/Only a site administrator/);
			await expect(rpc(who, `public.foundry_collection_set_published($1::uuid, true)`, ['00000000-0000-4000-8000-000000000000'])).rejects.toThrow(/Only a site administrator/);
			await expect(rpc(who, `public.foundry_collections_order('{}'::uuid[])`)).rejects.toThrow(/Only a site administrator/);
		}
		expect(await rpc<Json[]>(ana, `public.foundry_collections_read(false)`)).toEqual([]);
	});

	test('a saved collection keeps its members in the order given and is invisible until published', async () => {
		const saved = await rpc<Json>(admin, `public.foundry_collection_save(null, 'Ported games', 'Games brought in.', $1::text[])`, [
			[`app:${apps['cy-game'].app}`, 'house:vanguard', `app:${apps['ben-game'].app}`]
		]);
		expect(saved.ok).toBe(true);
		cid = saved.id as string;
		expect(await rpc<Json[]>(ana, `public.foundry_collections_read(false)`)).toEqual([]);
		// An admin asking for everything sees the draft.
		const all = await rpc<Json[]>(admin, `public.foundry_collections_read(true)`);
		expect(all.length).toBe(1);
		expect(all[0].published).toBe(false);
		expect((all[0].members as Json[]).map((m) => m.subject)).toEqual([`app:${apps['cy-game'].app}`, 'house:vanguard', `app:${apps['ben-game'].app}`]);
		// A student who asks for everything still gets only what is published.
		expect(await rpc<Json[]>(ana, `public.foundry_collections_read(true)`)).toEqual([]);
	});

	test('published, a student reads it, minus any app the gallery would not show', async () => {
		await rpc(admin, `public.foundry_collection_set_published($1::uuid, true)`, [cid]);
		let seen = await rpc<Json[]>(ana, `public.foundry_collections_read(false)`);
		expect((seen[0].members as Json[]).length).toBe(3);
		await db.sql(`update public.student_apps set hidden_at = now() where id = $1`, [apps['cy-game'].app]);
		seen = await rpc<Json[]>(ana, `public.foundry_collections_read(false)`);
		expect((seen[0].members as Json[]).map((m) => m.subject)).toEqual(['house:vanguard', `app:${apps['ben-game'].app}`]);
		// The admin editing it still sees the hidden one, marked not live.
		const adminSees = await rpc<Json[]>(admin, `public.foundry_collections_read(true)`);
		const hidden = (adminSees[0].members as Json[]).find((m) => m.subject === `app:${apps['cy-game'].app}`);
		expect(hidden?.live).toBe(false);
		await db.sql(`update public.student_apps set hidden_at = null where id = $1`, [apps['cy-game'].app]);
	});

	test('unpublish hides it again, reorder moves it, delete removes it and its members', async () => {
		await rpc(admin, `public.foundry_collection_set_published($1::uuid, false)`, [cid]);
		expect(await rpc<Json[]>(ana, `public.foundry_collections_read(false)`)).toEqual([]);
		const second = await rpc<Json>(admin, `public.foundry_collection_save(null, 'Second', null, '{}'::text[])`);
		await rpc(admin, `public.foundry_collections_order($1::uuid[])`, [[second.id, cid]]);
		const ordered = await rpc<Json[]>(admin, `public.foundry_collections_read(true)`);
		expect(ordered.map((c) => c.title)).toEqual(['Second', 'Ported games']);
		const del = await rpc<Json>(admin, `public.foundry_collection_delete($1::uuid)`, [cid]);
		expect(del.removed).toBe(1);
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.foundry_collection_members where collection_id = $1`, [cid]);
		expect(rows[0].n).toBe(0);
		await rpc(admin, `public.foundry_collection_delete($1::uuid)`, [second.id]);
	});

	test('bad members and bad titles are refused and write nothing', async () => {
		expect((await rpc<Json>(admin, `public.foundry_collection_save(null, '  ', null, '{}'::text[])`)).reason).toBe('title');
		expect((await rpc<Json>(admin, `public.foundry_collection_save(null, 'X', null, array['nonsense'])`)).reason).toBe('member');
		expect((await rpc<Json>(admin, `public.foundry_collection_save(null, 'X', null, array['app:00000000-0000-4000-8000-000000000000'])`)).reason).toBe('member_not_found');
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.foundry_collections`);
		expect(rows[0].n).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// PART F
// ---------------------------------------------------------------------------

describe('PART F: people search by name', () => {
	test('an admin finds a person by part of a name or an address', async () => {
		const byName = await rpc<Json[]>(admin, `public.foundry_people_search('reyes')`);
		expect(byName.map((r) => r.email)).toContain('ana@boscotech.net');
		const byMail = await rpc<Json[]>(admin, `public.foundry_people_search('ben@')`);
		expect(byMail.map((r) => r.email)).toEqual(['ben@boscotech.net']);
	});
	test('nobody else may search, a one letter query answers nothing, wildcards are text', async () => {
		for (const who of [ana, teacher]) await expect(rpc(who, `public.foundry_people_search('ana')`)).rejects.toThrow(/Only a site administrator/);
		expect(await rpc<Json[]>(admin, `public.foundry_people_search('a')`)).toEqual([]);
		expect(await rpc<Json[]>(admin, `public.foundry_people_search('%%')`)).toEqual([]);
		expect(await rpc<Json[]>(admin, `public.foundry_people_search('_n')`)).toEqual([]);
	});
	test('at most twelve rows come back however many match', async () => {
		for (let i = 0; i < 15; i++) await createUser(db, `bulk${i}@boscotech.net`, `Bulk Person ${i}`);
		expect((await rpc<Json[]>(admin, `public.foundry_people_search('bulk', 500)`)).length).toBe(12);
	});
});

// ---------------------------------------------------------------------------
// PART G
// ---------------------------------------------------------------------------

describe('PART G: votes', () => {
	const counts = async (u: SeededUser) =>
		db.asUser(u.id, async (q) => (await q<{ app_id: string; net: string; net_7d: string; mine: number }>(`select * from public.foundry_vote_counts()`)).rows);
	const cell = (rows: Awaited<ReturnType<typeof counts>>, slug: string) => rows.find((r) => r.app_id === apps[slug].app);

	test('one vote per person per app: up, change, remove', async () => {
		expect((await rpc<Json>(ben, `public.foundry_vote($1::uuid, 1::smallint)`, [apps['ana-game'].app])).ok).toBe(true);
		expect(Number(cell(await counts(ben), 'ana-game')?.net)).toBe(1);
		await rpc(ben, `public.foundry_vote($1::uuid, -1::smallint)`, [apps['ana-game'].app]);
		let c = cell(await counts(ben), 'ana-game');
		expect([Number(c?.net), c?.mine]).toEqual([-1, -1]);
		await rpc(cy, `public.foundry_vote($1::uuid, 1::smallint)`, [apps['ana-game'].app]);
		c = cell(await counts(cy), 'ana-game');
		expect([Number(c?.net), c?.mine]).toEqual([0, 1]);
		await rpc(ben, `public.foundry_vote($1::uuid, 0::smallint)`, [apps['ana-game'].app]);
		c = cell(await counts(ben), 'ana-game');
		expect([Number(c?.net), c?.mine]).toEqual([1, 0]);
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.foundry_app_votes where app_id = $1`, [apps['ana-game'].app]);
		expect(rows[0].n).toBe(1);
	});

	test('never on your own app, a hidden one, one that does not exist, or a bad value', async () => {
		expect((await rpc<Json>(ana, `public.foundry_vote($1::uuid, 1::smallint)`, [apps['ana-game'].app])).reason).toBe('own_app');
		await db.sql(`update public.student_apps set hidden_at = now() where id = $1`, [apps['ben-game'].app]);
		expect((await rpc<Json>(cy, `public.foundry_vote($1::uuid, 1::smallint)`, [apps['ben-game'].app])).reason).toBe('not_votable');
		await db.sql(`update public.student_apps set hidden_at = null where id = $1`, [apps['ben-game'].app]);
		expect((await rpc<Json>(cy, `public.foundry_vote('00000000-0000-4000-8000-000000000000'::uuid, 1::smallint)`)).reason).toBe('not_votable');
		expect((await rpc<Json>(cy, `public.foundry_vote($1::uuid, 5::smallint)`, [apps['ben-game'].app])).reason).toBe('value');
	});

	test('no read names a voter: the table is shut and the count has no voter column', async () => {
		const sample = await counts(cy);
		expect(Object.keys(sample[0]).sort()).toEqual(['app_id', 'mine', 'net', 'net_7d']);
		await expect(db.asUser(cy.id, (q) => q(`select * from public.foundry_app_votes`))).rejects.toThrow(/permission denied/);
	});

	test('a hidden app drops out of the counts', async () => {
		await db.sql(`update public.student_apps set hidden_at = now() where id = $1`, [apps['ana-game'].app]);
		expect(cell(await counts(cy), 'ana-game')).toBeUndefined();
		await db.sql(`update public.student_apps set hidden_at = null where id = $1`, [apps['ana-game'].app]);
	});
});

// ---------------------------------------------------------------------------
// PART H
// ---------------------------------------------------------------------------

describe('PART H: the featured row', () => {
	test('only an admin picks, in order, up to twelve', async () => {
		await expect(rpc(ana, `public.foundry_featured_set(array['house:vanguard'])`)).rejects.toThrow(/Only a site administrator/);
		const ok = await rpc<Json>(admin, `public.foundry_featured_set($1::text[])`, [[`app:${apps['ben-game'].app}`, 'house:greenline', `app:${apps['cy-game'].app}`]]);
		expect(ok.count).toBe(3);
		expect(await rpc<string[]>(ana, `public.foundry_featured_read(false)`)).toEqual([`app:${apps['ben-game'].app}`, 'house:greenline', `app:${apps['cy-game'].app}`]);
		const many = Array.from({ length: 13 }, () => 'house:vanguard');
		expect((await rpc<Json>(admin, `public.foundry_featured_set($1::text[])`, [many])).reason).toBe('too_many');
		expect((await rpc<Json>(admin, `public.foundry_featured_set(array['house:nope'])`)).reason).toBe('subject');
		expect((await rpc<string[]>(ana, `public.foundry_featured_read(false)`)).length).toBe(3);
	});

	test('a pick the gallery would not show is not shown, and an admin can still see it', async () => {
		await db.sql(`update public.student_apps set hidden_at = now() where id = $1`, [apps['ben-game'].app]);
		expect(await rpc<string[]>(ana, `public.foundry_featured_read(false)`)).toEqual(['house:greenline', `app:${apps['cy-game'].app}`]);
		expect((await rpc<string[]>(admin, `public.foundry_featured_read(true)`)).length).toBe(3);
		await db.sql(`update public.student_apps set hidden_at = null where id = $1`, [apps['ben-game'].app]);
		await rpc(admin, `public.foundry_featured_set('{}'::text[])`);
		expect(await rpc<string[]>(ana, `public.foundry_featured_read(false)`)).toEqual([]);
	});
});
