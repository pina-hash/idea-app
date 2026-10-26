// tests/db/calendar.test.ts
//
// LEDGER 0439, MIGRATION 0308: THE IDEA CALENDAR. The real chain short of 0308,
// seeded through the real pre-migration RPCs (the Unit 4 fixture: one team post
// shared by two sections, a draw per section), then 0308 applied over it.
//
// HELD, in both directions:
//   * a student's calendar holds their own classes' live posts, due dates,
//     pacing and sign-offs, their own team's tasks, and the public layers; it
//     never holds another class's post, a draft, a post not yet live, another
//     team's task, or an address;
//   * a teacher of record sees their class, scheduled posts marked; an admin's
//     own calendar is the classes he teaches, never the whole school;
//   * the subscription link answers its owner's calendar and nothing else, and
//     a replaced or revoked link answers nothing;
//   * pacing resolves a `day` to school days (weekends and no-school days
//     skipped), drops what `manifestPacing` drops, and an admin's moves win;
//   * every write is an admin's (or the caller's own link), every other caller
//     is refused.
// THE VISIBILITY READ IS MUTATION-PROVEN (ledger 0439 RESULTS): with the
// enrollment term or the team-membership term of `_calendar_feed_email` opened
// up, the "never holds" tests here go red.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, type SeededUser, type TestDb } from './harness';
import { startTestDb } from './harness';
import { migrationSql, treeShortOf } from './chain-0436';
import { documentFor, postSet, rpcOf, seedUnit4, teamManifest, type Unit4Fixture } from './team-unit4-fixture';
import { pasteTrap } from './chain-0230';
import { manifestPacing } from '../../src/lib/classroom/html-assignment/pacing';

interface CalEvent {
	id: string;
	layer: string;
	kind: string;
	title: string;
	day: string;
	item_id?: string;
	section_ids?: string[];
	scheduled?: boolean;
	state?: string | null;
	owner?: string | null;
	mine?: boolean;
	step_id?: string;
	event_id?: string;
}
interface Feed {
	ok: boolean;
	today: string;
	sections: { id: string; teaches: boolean }[];
	events: CalEvent[];
	prefs?: unknown;
	link?: boolean;
}

const FROM = '2026-10-01';
const TO = '2026-12-31';

describe('0308 the IDEA calendar', () => {
	let db: TestDb;
	let f: Unit4Fixture;
	let rpc: ReturnType<typeof rpcOf>['rpc'];
	let refusal: ReturnType<typeof rpcOf>['refusal'];
	let outsider: SeededUser;
	let onlyB: string;
	let draft: string;
	let later: string;
	let otherSection: string;
	const feed = (u: SeededUser) => rpc<Feed>(u, 'public.calendar_feed($1::date, $2::date)', [FROM, TO]);
	const anonCall = async <T>(call: string, params: unknown[]): Promise<T> =>
		db.asAnon(async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

	const createItem = async (as: SeededUser, sections: string[], title: string, published = true) =>
		(
			await rpc<{ item_id: string }>(
				as,
				`public.classroom_create_item(p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
					p_body => 'Work.', p_points => 10, p_published => $3)`,
				[sections, title, published]
			)
		).item_id;

	beforeAll(async () => {
		db = await startTestDb(treeShortOf('0308'));
		f = await seedUnit4(db, { dueAt: '2026-11-03T07:00:00Z' });
		({ rpc, refusal } = rpcOf(db));
		await postSet(db, f.admin, f.setA);
		await postSet(db, f.teacher, f.setB);
		// The post opens on a Friday, so day 2 is the next Monday.
		await db.sql(`update public.classroom_items set publish_at = '2026-10-23T15:00:00Z' where id = $1`, [f.item]);
		// Seed the team plans through the real read, before the migration.
		await rpc(f.a[0], 'public.classroom_team_plan($1::uuid, null)', [f.sectionA]);
		await rpc(f.a[4], 'public.classroom_team_plan($1::uuid, null)', [f.sectionA]);
		onlyB = await createItem(f.teacher, [f.sectionB], 'Block 4 only');
		draft = await createItem(f.admin, [f.sectionA], 'Unfinished draft', false);
		later = await createItem(f.admin, [f.sectionA], 'Scheduled later');
		await db.sql(`update public.classroom_items set publish_at = now() + interval '20 days', due_at = now() + interval '25 days' where id = $1`, [later]);
		await db.sql(`update public.classroom_items set due_at = '2026-11-10T07:59:59Z' where id = any($1::uuid[])`, [[onlyB, draft]]);
		outsider = await createUser(db, 'zed.outsider@boscotech.net', 'Zed Outsider');
		otherSection = await createClassroomSection(db, {
			as: f.admin,
			courseCode: 'IDEA100',
			courseTitle: 'Rotation',
			label: 'Block 1',
			teacherEmail: f.teacher.email
		});
		await enrollStudent(db, { as: f.admin, sectionId: otherSection, email: outsider.email, displayName: 'Zed Outsider' });
		// Pre-migration data in place; now the file, twice.
		expect(pasteTrap(migrationSql('0308'))).toEqual([]);
		await db.sql(migrationSql('0308'));
		await db.sql(migrationSql('0308'));
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('a student sees their class: the post opening, its due date, the sign-offs, the no-school day', async () => {
		const c = await feed(f.a[0]);
		expect(c.ok).toBe(true);
		expect(c.sections.map((s) => s.id)).toEqual([f.sectionA]);
		const ids = c.events.map((e) => e.id);
		expect(ids).toContain(`open:${f.item}`);
		expect(ids).toContain(`due:${f.item}`);
		expect(c.events.find((e) => e.id === `due:${f.item}`)!.day).toBe('2026-11-02');
		const signoffs = c.events.filter((e) => e.kind === 'signoff');
		expect(signoffs.map((e) => [e.title, e.day])).toEqual([
			['Plan', '2026-10-28'],
			['Design', '2026-11-02']
		]);
		expect(signoffs.every((e) => typeof e.state === 'string')).toBe(true);
		expect(c.events.filter((e) => e.kind === 'no_school').map((e) => e.day)).toEqual(['2026-11-11']);
	});

	it('NEVER: another class, a draft, a post not yet live, or an address', async () => {
		const c = await feed(f.a[0]);
		const items = new Set(c.events.map((e) => e.item_id).filter(Boolean));
		expect(items.has(onlyB)).toBe(false);
		expect(items.has(draft)).toBe(false);
		expect(items.has(later)).toBe(false);
		expect(JSON.stringify(c)).not.toMatch(/@boscotech/);
		// The positive control: section B's student does see the Block 4 post.
		const b = await feed(f.b[0]);
		expect(b.events.some((e) => e.item_id === onlyB)).toBe(true);
		expect(b.events.some((e) => e.item_id === f.item)).toBe(true);
	});

	it("a student holds their own team's tasks and never another team's", async () => {
		const mine = (await feed(f.a[0])).events.filter((e) => e.kind === 'task');
		const theirs = (await feed(f.a[4])).events.filter((e) => e.kind === 'task');
		expect(mine.length).toBeGreaterThan(0);
		expect(theirs.length).toBeGreaterThan(0);
		const mineIds = new Set(mine.map((e) => e.id));
		expect(theirs.some((e) => mineIds.has(e.id))).toBe(false);
		// The reflection is an individual task per member: exactly one is "mine".
		expect(mine.filter((e) => e.title && e.mine).length).toBeGreaterThanOrEqual(1);
		// A student on no team has no tasks, and still has the class.
		const loner = await feed(f.a[7]);
		expect(loner.events.filter((e) => e.kind === 'task')).toEqual([]);
		expect(loner.events.some((e) => e.id === `due:${f.item}`)).toBe(true);
		// A student in no Unit 4 class has nothing of it.
		const zed = await feed(outsider);
		expect(zed.sections.map((s) => s.id)).toEqual([otherSection]);
		expect(zed.events.filter((e) => e.layer === 'classes' || e.layer === 'team' || e.layer === 'pacing')).toEqual([]);
	});

	it("the teacher of record sees a scheduled post marked; an admin's calendar is the classes he teaches", async () => {
		const admin = await feed(f.admin);
		expect(admin.sections.map((s) => s.id)).toEqual([f.sectionA]);
		expect(admin.sections[0].teaches).toBe(true);
		const scheduled = admin.events.find((e) => e.id === `open:${later}`);
		expect(scheduled?.scheduled).toBe(true);
		expect(admin.events.some((e) => e.item_id === draft)).toBe(false);
		expect(admin.events.some((e) => e.item_id === onlyB)).toBe(false);
		expect(admin.events.some((e) => e.kind === 'task')).toBe(false);
	});

	it('pacing: day steps count school days from the opening day, date steps hold, and the reader agrees', async () => {
		const m = teamManifest() as Record<string, unknown>;
		m.pacing = [
			{ id: 'd1', day: 1, title: 'Read the brief', modules: ['shared', 'ghost'] },
			{ id: 'd2', day: 2, title: 'Split the roles', modules: ['frame-req'] },
			{ id: 'd14', day: 14, title: 'Across the holiday' },
			{ id: 'fixed', date: '2026-11-02', title: 'Design ready' },
			{ id: 'bad', day: 0, title: 'Never' },
			{ id: 'both', day: 1, date: '2026-11-02', title: 'Never' },
			{ id: 'd1', day: 5, title: 'Repeat, never' },
			{ id: 'feb', date: '2026-02-30', title: 'Never' },
			{ title: 'No id' }
		];
		await rpc(f.admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
			f.item,
			documentFor(m as ReturnType<typeof teamManifest>),
			JSON.stringify(m),
			'plan.html'
		]);
		const p = await rpc<{ ok: boolean; due_at: string; pacing: { id: string; day: string; modules: string[]; source: string }[] }>(
			f.a[0],
			'public.classroom_item_pacing($1::uuid)',
			[f.item]
		);
		expect(p.ok).toBe(true);
		expect(p.pacing.map((s) => [s.id, s.day])).toEqual([
			['d1', '2026-10-23'],
			['d2', '2026-10-26'],
			['fixed', '2026-11-02'],
			// 14 school days from Fri Oct 23, skipping weekends and Nov 11.
			['d14', '2026-11-12']
		]);
		expect(p.pacing[0].modules).toEqual(['shared']);
		// The TypeScript reader keeps exactly the same steps.
		expect(manifestPacing(m).map((s) => s.id).sort()).toEqual(p.pacing.map((s) => s.id).sort());
		// And the calendar carries them on the pacing layer.
		const c = await feed(f.a[0]);
		expect(c.events.filter((e) => e.kind === 'pacing').map((e) => e.step_id)).toEqual(['d1', 'd2', 'fixed', 'd14']);
		// A reader outside the class is told nothing.
		expect(await rpc(outsider, 'public.classroom_item_pacing($1::uuid)', [f.item])).toEqual({ ok: false, reason: 'not_found' });
	});

	it("an admin moves, retitles, hides and adds steps; nobody else may", async () => {
		const set = (u: SeededUser, step: string, title: string | null, day: string | null, remove = false) =>
			rpc<{ ok: boolean; pacing: { id: string; day: string; title: string; source: string }[] }>(
				u,
				'public.classroom_item_pacing_set($1::uuid, $2, $3, $4::date, null, $5)',
				[f.item, step, title, day, remove]
			);
		expect(await refusal(f.a[0], 'public.classroom_item_pacing_set($1::uuid, $2, null, $3::date, null, false)', [f.item, 'd2', '2026-10-27'])).toMatch(
			/Only a site admin/
		);
		expect(await refusal(f.teacher, 'public.classroom_item_pacing_clear($1::uuid, $2)', [f.item, 'd2'])).toMatch(/Only a site admin/);
		let r = await set(f.admin, 'd2', null, '2026-10-27');
		expect(r.pacing.find((s) => s.id === 'd2')).toMatchObject({ day: '2026-10-27', title: 'Split the roles', source: 'moved' });
		r = await set(f.admin, 'extra', null, '2026-10-29');
		expect(r).toMatchObject({ ok: false, reason: 'new_step' });
		r = await set(f.admin, 'extra', 'Build the mock-up', '2026-10-29');
		expect(r.pacing.find((s) => s.id === 'extra')).toMatchObject({ source: 'set', day: '2026-10-29' });
		r = await set(f.admin, 'd14', null, null, true);
		expect(r.pacing.some((s) => s.id === 'd14')).toBe(false);
		const back = await rpc<{ pacing: { id: string; day: string }[] }>(f.admin, 'public.classroom_item_pacing_clear($1::uuid, $2)', [f.item, 'd2']);
		expect(back.pacing.find((s) => s.id === 'd2')?.day).toBe('2026-10-26');
	});

	it('program events: an admin adds, moves and removes; every viewer sees them; nobody else may write', async () => {
		const added = await rpc<{ ok: boolean; id: string }>(
			f.admin,
			'public.calendar_event_save(null, $1, $2, $3::date, $4::date, $5::time, null, $6, null)',
			['robotics', 'Beach Blitz', '2026-10-30', '2026-11-01', '08:00', 'Capistrano Valley HS']
		);
		expect(added.ok).toBe(true);
		expect(await refusal(f.a[0], 'public.calendar_event_save(null, $1, $2, $3::date)', ['idea', 'Mine', '2026-11-05'])).toMatch(/Only a site admin/);
		expect(await refusal(f.teacher, 'public.calendar_event_remove($1::uuid)', [added.id])).toMatch(/Only a site admin/);
		expect(await rpc(f.admin, 'public.calendar_event_save(null, $1, $2, $3::date)', ['frc', 'Bad layer', '2026-11-05'])).toMatchObject({
			ok: false,
			reason: 'layer'
		});
		let c = await feed(f.a[0]);
		expect(c.events.find((e) => e.event_id === added.id)).toMatchObject({ layer: 'robotics', day: '2026-10-30', title: 'Beach Blitz' });
		const moved = await rpc<{ ok: boolean }>(f.admin, 'public.calendar_event_move($1::uuid, $2::date)', [added.id, '2026-11-06']);
		expect(moved.ok).toBe(true);
		const listed = await rpc<{ id: string; starts_on: string; ends_on: string }[]>(f.admin, 'public.calendar_events_list($1::date, $2::date, null)', [FROM, TO]);
		expect(listed.find((e) => e.id === added.id)).toMatchObject({ starts_on: '2026-11-06', ends_on: '2026-11-08' });
		expect(await refusal(f.a[0], 'public.calendar_events_list(null, null, null)')).toMatch(/Only a site admin/);
		await rpc(f.admin, 'public.calendar_event_remove($1::uuid)', [added.id]);
		c = await feed(f.a[0]);
		expect(c.events.some((e) => e.event_id === added.id)).toBe(false);
	});

	it("the subscription link answers its owner's calendar, and a replaced or revoked one answers nothing", async () => {
		const first = await rpc<{ ok: boolean; token: string }>(f.a[0], 'public.calendar_feed_link(false)');
		expect(first.token).toMatch(/^[0-9a-f]{64}$/);
		expect((await rpc<{ token: string }>(f.a[0], 'public.calendar_feed_link(false)')).token).toBe(first.token);
		const byToken = await anonCall<Feed>('public.calendar_feed_by_token($1, $2::date, $3::date)', [first.token, FROM, TO]);
		const own = await feed(f.a[0]);
		expect(byToken.ok).toBe(true);
		expect(byToken.events.map((e) => e.id)).toEqual(own.events.map((e) => e.id));
		expect(own.link).toBe(true);
		// Someone else's link is someone else's calendar.
		const other = await rpc<{ token: string }>(f.a[4], 'public.calendar_feed_link(false)');
		expect(other.token).not.toBe(first.token);
		const otherFeed = await anonCall<Feed>('public.calendar_feed_by_token($1, $2::date, $3::date)', [other.token, FROM, TO]);
		expect(otherFeed.events.map((e) => e.id)).not.toEqual(byToken.events.map((e) => e.id));
		// Replace: the old one stops at once.
		const fresh = await rpc<{ token: string }>(f.a[0], 'public.calendar_feed_link(true)');
		expect(fresh.token).not.toBe(first.token);
		expect(await anonCall('public.calendar_feed_by_token($1, null, null)', [first.token])).toEqual({ ok: false });
		await rpc(f.a[0], 'public.calendar_feed_link_revoke()');
		expect(await anonCall('public.calendar_feed_by_token($1, null, null)', [fresh.token])).toEqual({ ok: false });
		expect(await anonCall('public.calendar_feed_by_token($1, null, null)', ['not a token'])).toEqual({ ok: false });
		// Nobody reads the token table directly.
		await expect(db.asUser(f.a[0].id, (q) => q('select * from public.calendar_feed_tokens'))).rejects.toThrow(/permission denied/);
		await expect(anonCall('public.calendar_feed(null, null)', [])).rejects.toThrow();
	});

	it("an admin may read one viewer's calendar; nobody else may", async () => {
		const read = await rpc<Feed>(f.admin, 'public.calendar_feed_for($1, $2::date, $3::date)', [f.a[0].email, FROM, TO]);
		const own = await feed(f.a[0]);
		expect(read.events.map((e) => e.id)).toEqual(own.events.map((e) => e.id));
		expect(await refusal(f.a[1], 'public.calendar_feed_for($1, null, null)', [f.a[0].email])).toMatch(/Only a site admin/);
		expect(await refusal(f.teacher, 'public.calendar_feed_for($1, null, null)', [f.a[0].email])).toMatch(/Only a site admin/);
	});

	it('the private helpers are reachable by nobody but their definer callers', async () => {
		const { rows } = await db.sql<{ fn: string; anon: boolean; authed: boolean }>(
			`select p.proname as fn,
				has_function_privilege('anon', p.oid, 'execute') as anon,
				has_function_privilege('authenticated', p.oid, 'execute') as authed
			from pg_proc p where p.pronamespace = 'public'::regnamespace
				and p.proname in ('_calendar_feed_email', '_classroom_item_pacing', '_calendar_prefs', '_calendar_school_day_n',
					'calendar_feed', 'calendar_feed_by_token', 'calendar_event_save')
			order by p.proname`
		);
		expect(rows).toEqual([
			{ fn: '_calendar_feed_email', anon: false, authed: false },
			{ fn: '_calendar_prefs', anon: false, authed: false },
			{ fn: '_calendar_school_day_n', anon: false, authed: false },
			{ fn: '_classroom_item_pacing', anon: false, authed: false },
			{ fn: 'calendar_event_save', anon: false, authed: true },
			{ fn: 'calendar_feed', anon: false, authed: true },
			{ fn: 'calendar_feed_by_token', anon: true, authed: true }
		]);
	});
});
