// tests/db/classroom-hall-pass-limits.test.ts
//
// 0174: THE HALL PASS LIMIT IS THE DATABASE'S, AND THESE ARE THE THREE DEFECTS
// IT CLOSES.
//
// "Students can spam bathroom pass" is three different rules wearing one word,
// and 0143's schema shows which of them were real:
//
//   1. HOLDING SEVERAL AT ONCE. The capacity index is on `(section_id) where
//      closed_at is null` -- one open row per SECTION, not per student -- so a
//      student in two sections could be marked out of both. Nothing in 0143
//      could see it, because the index is per section by construction.
//   2. TAKING THE NEXT ONE IMMEDIATELY. Nothing stood between a close and the
//      next open.
//   3. AN UNBOUNDED NUMBER ACROSS A PERIOD. Nothing counted.
//
// EVERY ASSERTION HERE IS AGAINST THE REAL MIGRATION FILES, applied in order to
// a real Postgres, and every refusal is read off the RPC's own jsonb rather
// than off a client's interpretation of it.
//
// THE CLOCK IS FAKED BY MOVING THE ROWS, NEVER BY MOVING `now()`. A pass's age
// is `now() - opened_at`, so backdating `opened_at`/`closed_at` with an
// explicit UPDATE as the connection owner produces exactly the state a real
// wait produces, deterministically and in milliseconds. Nothing here sleeps.
//
// AND A MOVED ROW IS ANCHORED TO AN AGE OR TO A DAY, NEVER TO WHICHEVER IS
// NEARER TO HAND. That distinction is the one this file learned the hard way.
// Two of 0174's three limits are day-scoped and one is age-scoped, so a fixture
// has to say which it is:
//
//   `tripAgo`     -- AGE-SCOPED. The cooldown reads `now() - closed_at`, which
//                    is the same interval on every calendar, so the row may sit
//                    anywhere. This is the original helper, unchanged.
//   `tripsToday`  -- DAY-SCOPED. The daily cap counts rows whose `opened_at`
//                    falls on TODAY in America/Los_Angeles, so the row has to
//                    land on today at every hour, and the helper checks that it
//                    did rather than assuming it.
//
// WHAT WENT WRONG WITHOUT THAT SPLIT: the cap fixtures were `now() - 60 to 120
// minutes`, which is YESTERDAY in Los Angeles for the first two hours of every
// LA day. `used_today` then read 0, and six tests here failed between 00:00 and
// 02:00 Pacific and passed the other twenty-two hours -- measured by moving the
// container's clock through the day, not inferred. The rule above was never
// the problem; anchoring a day to an age was. Do not answer a recurrence by
// skipping near midnight, by widening a window, by pinning a timezone, or by
// stubbing `now()`: the first three test nothing and the last one is exactly
// what this file exists not to do.
//
// THE DAY BOUNDARY IS TESTED AT AN INSTANT WHERE LA AND UTC DISAGREE, which is
// the 0140 instrument: at 8pm Pacific the UTC date is already tomorrow, so a
// test written at any other hour cannot tell the two calendars apart and a UTC
// mutation would redden nothing.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0137_anon_execute_sweep.sql',
	'0143_classroom_hall_pass.sql',
	'0144_classroom_hall_pass_close_by_id.sql',
	'0174_classroom_hall_pass_limits.sql'
] as const;

interface PassResult {
	ok: boolean;
	reason?: string;
	retry_at?: string;
	used?: number;
	limit?: number;
	pass_id?: string;
	opened_by?: string;
}

let db: TestDb;
let teacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let sectionA: string;
let sectionB: string;

async function open(user: SeededUser, sectionId: string): Promise<PassResult> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: PassResult }>(
			'select public.classroom_hall_pass_open($1::uuid) as result',
			[sectionId]
		);
		return rows[0].result;
	});
}

async function closeMine(user: SeededUser, sectionId: string): Promise<PassResult> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: PassResult }>(
			'select public.classroom_hall_pass_close_mine($1::uuid) as result',
			[sectionId]
		);
		return rows[0].result;
	});
}

async function openFor(
	user: SeededUser,
	sectionId: string,
	email: string
): Promise<PassResult> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: PassResult }>(
			'select public.classroom_hall_pass_open_for($1::uuid, $2::text) as result',
			[sectionId, email]
		);
		return rows[0].result;
	});
}

async function state(user: SeededUser, sectionId: string): Promise<Record<string, unknown>> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: Record<string, unknown> }>(
			'select public.classroom_hall_pass_state($1::uuid) as result',
			[sectionId]
		);
		return rows[0].result;
	});
}

/**
 * Take one complete trip and then move it into the past, as the connection
 * owner. This is what "a while ago" means to the AGE-SCOPED rule: the cooldown
 * reads `now() - closed_at`, an interval, so where the row lands on a calendar
 * does not enter into it.
 *
 * IT IS NOT THE HELPER FOR THE CAP. The cap reads `opened_at`'s LA calendar
 * DAY, and an age cannot promise a day -- see `tripsToday` below and the
 * anchoring note in this file's header.
 */
async function tripAgo(user: SeededUser, sectionId: string, minutesAgo: number): Promise<void> {
	const opened = await open(user, sectionId);
	expect(opened.ok).toBe(true);
	const closed = await closeMine(user, sectionId);
	expect(closed.ok).toBe(true);
	await db.sql(
		`update public.classroom_hall_passes
		 set opened_at = now() - make_interval(mins => $2::int),
		     closed_at = now() - make_interval(mins => $2::int)
		 where id = $1::uuid`,
		[opened.pass_id, minutesAgo]
	);
}

/**
 * Take `count` complete trips and leave every one of them on TODAY'S
 * America/Los_Angeles calendar day -- the calendar the daily cap is counted in.
 *
 * WHY THIS IS NOT `tripAgo`, AND WHY THE HEADER'S RULE IS UNTOUCHED. The rows
 * still move and `now()` still does not. What changes is the ANCHOR: an age is
 * the wrong way to say "today", because a fixture positioned relative to now
 * cannot also say which day it lands on. `now() - 90 minutes` is YESTERDAY for
 * the first ninety minutes of every LA day, so `used_today` read 0 and the six
 * day-scoped tests in this file failed between 00:00 and 02:00 Pacific and
 * passed the other twenty-two hours -- measured, not inferred, by moving the
 * container's clock. A DAY-SCOPED fixture therefore anchors to the day's own
 * start; an AGE-SCOPED one (the cooldown) keeps `tripAgo` and may sit anywhere.
 *
 * THE TRIPS ARE BUILT FIRST AND PLACED AFTERWARDS, in one statement, and that
 * order is forced. Each `open` has to clear the cooldown left by the previous
 * `close`, so the build reuses `tripAgo`'s wide backdate to get the rows made;
 * only then is every row re-anchored into today. Placing them one at a time
 * would leave the last close minutes old and refuse the next open in exactly
 * the hours this exists for.
 *
 * The slots are `k / (count + 1)` of the part of today that has already
 * happened, so they are strictly after LA midnight, strictly before now,
 * distinct and ordered oldest-first at every hour, including 00:00:01.
 *
 * WITHIN THE FIRST MINUTES OF THE LA DAY A TRIP CANNOT ALSO BE OLDER THAN THE
 * COOLDOWN -- there is not that much day yet -- so a caller that then opens
 * reads `limit_reached` on the strength of 0174 asking the CAP BEFORE the
 * cooldown, which is that function's own stated order and its own comment's
 * reason ("at the cap the cooldown is irrelevant"). Nothing here depends on the
 * ages themselves; they were never what the day-scoped assertions read.
 *
 * `count` must not exceed the cap: the build takes real passes through the real
 * RPC, and past the cap the RPC is right to refuse one.
 */
async function tripsToday(user: SeededUser, sectionId: string, count: number): Promise<void> {
	for (let k = 0; k < count; k++) await tripAgo(user, sectionId, 60 + k * 10);

	const { rows: placed } = await db.sql<{ id: string }>(
		`with la as (
			select date_trunc('day', now() at time zone 'America/Los_Angeles')
			         at time zone 'America/Los_Angeles' as midnight
		), ranked as (
			select h.id,
			       row_number() over (order by h.opened_at) as k,
			       count(*) over () as n
			from public.classroom_hall_passes h
			where h.section_id = $1::uuid and h.student_email = $2 and h.closed_at is not null
		)
		update public.classroom_hall_passes h
		set opened_at = la.midnight
		                + (now() - la.midnight) * (ranked.k::float8 / (ranked.n + 1)),
		    closed_at = la.midnight
		                + (now() - la.midnight) * ((ranked.k + 0.5)::float8 / (ranked.n + 1))
		from ranked, la
		where h.id = ranked.id
		returning h.id`,
		[sectionId, user.email]
	);
	expect(placed).toHaveLength(count);

	// THE FIXTURE CHECKS ITSELF, AT WHATEVER HOUR IT IS. A fixture that quietly
	// misses the day it was aiming for is the whole defect this replaces, and it
	// showed up as an assertion about the PRODUCT failing rather than as an
	// assertion about the fixture. Now the fixture says so first.
	const { rows: audit } = await db.sql<{
		n: string;
		today: string;
		distinct_opened: string;
		in_past: string;
	}>(
		`select count(*) as n,
		        count(*) filter (
		          where (opened_at at time zone 'America/Los_Angeles')::date
		              = (now() at time zone 'America/Los_Angeles')::date
		            and (closed_at at time zone 'America/Los_Angeles')::date
		              = (now() at time zone 'America/Los_Angeles')::date
		        ) as today,
		        count(distinct opened_at) as distinct_opened,
		        count(*) filter (where opened_at < now() and closed_at < now()) as in_past
		 from public.classroom_hall_passes
		 where section_id = $1::uuid and student_email = $2`,
		[sectionId, user.email]
	);
	expect({
		n: Number(audit[0].n),
		today: Number(audit[0].today),
		distinct: Number(audit[0].distinct_opened),
		inPast: Number(audit[0].in_past)
	}).toEqual({ n: count, today: count, distinct: count, inPast: count });
}

/** Every row in a section, oldest first, straight off the table. */
async function passRows(sectionId: string) {
	const { rows } = await db.sql<{
		id: string;
		student_email: string;
		opened_by: string | null;
		closed_at: string | null;
	}>(
		`select id, student_email, opened_by, closed_at
		 from public.classroom_hall_passes where section_id = $1::uuid order by opened_at`,
		[sectionId]
	);
	return rows;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');

	await db.sql(`insert into public.app_admins (email, granted_by) values ($1, $1)`, [
		teacher.email
	]);

	sectionA = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA100',
		courseTitle: 'Engineering I',
		label: 'Block 1',
		teacherEmail: teacher.email
	});
	sectionB = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering II Honors',
		label: 'Block 4',
		teacherEmail: teacher.email
	});
	for (const section of [sectionA, sectionB]) {
		await enrollStudent(db, {
			as: teacher,
			sectionId: section,
			email: ana.email,
			displayName: 'Ana Reyes'
		});
		await enrollStudent(db, {
			as: teacher,
			sectionId: section,
			email: ben.email,
			displayName: 'Ben Ortiz'
		});
	}
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

/** Wipes every pass so each block starts from a stated state. */
async function reset(): Promise<void> {
	await db.sql('delete from public.classroom_hall_passes');
}

// ---------------------------------------------------------------------------
// The numbers, and that nothing else states them.
// ---------------------------------------------------------------------------

describe('the limits are written down once', () => {
	test('the helper answers both numbers and is granted to nobody', async () => {
		const { rows } = await db.sql<{
			limits: { cooldown_minutes: number; daily_limit: number };
			anon_x: boolean;
			auth_x: boolean;
		}>(
			`select public._classroom_hall_pass_limits() as limits,
			        has_function_privilege('anon', 'public._classroom_hall_pass_limits()', 'execute') as anon_x,
			        has_function_privilege('authenticated', 'public._classroom_hall_pass_limits()', 'execute') as auth_x`
		);
		expect(rows[0].limits.cooldown_minutes).toBeGreaterThan(0);
		expect(rows[0].limits.daily_limit).toBeGreaterThan(0);
		// Private: its values ride on the state payload, so no client calls it.
		expect({ anon: rows[0].anon_x, authed: rows[0].auth_x }).toEqual({
			anon: false,
			authed: false
		});
	});

	test('every other hall pass function is authenticated-only, and there are seven in all', async () => {
		const { rows } = await db.sql<{ sig: string; anon_x: boolean; auth_x: boolean }>(
			`select p.oid::regprocedure::text as sig,
			        has_function_privilege('anon', p.oid, 'execute') as anon_x,
			        has_function_privilege('authenticated', p.oid, 'execute') as auth_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and (p.proname like 'classroom_hall_pass%' or p.proname = '_classroom_hall_pass_limits')
			 order by 1`
		);
		// A COUNT rather than a list, so a function added later cannot slip past
		// this sweep by not being in a list somebody wrote out.
		expect(rows.length).toBe(7);
		for (const r of rows) expect(r.anon_x).toBe(false);
	});

	test('the numbers the state projects are the numbers the refusal uses', async () => {
		await reset();
		const seen = (await state(ana, sectionA)) as {
			limits: { cooldown_minutes: number; daily_limit: number };
		};
		const { rows } = await db.sql<{ limits: { daily_limit: number } }>(
			'select public._classroom_hall_pass_limits() as limits'
		);
		expect(seen.limits).toEqual(rows[0].limits);

		// And the refusal echoes the same cap rather than a literal of its own.
		// DAY-SCOPED: these have to be TODAY's passes or there is nothing to cap.
		await tripsToday(ana, sectionA, seen.limits.daily_limit);
		const refused = await open(ana, sectionA);
		expect(refused).toMatchObject({
			ok: false,
			reason: 'limit_reached',
			limit: seen.limits.daily_limit
		});
	});
});

// ---------------------------------------------------------------------------
// DEFECT 1: one body, one corridor.
// ---------------------------------------------------------------------------

describe('defect 1 -- a student cannot hold two passes at once', () => {
	test('an open pass in one section refuses an open in another', async () => {
		await reset();
		expect((await open(ana, sectionA)).ok).toBe(true);

		// The capacity index cannot see this: section B has no open row at all.
		const { rows: bOpen } = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_hall_passes where section_id = $1::uuid and closed_at is null',
			[sectionB]
		);
		expect(Number(bOpen[0].n)).toBe(0);

		const second = await open(ana, sectionB);
		expect(second).toMatchObject({ ok: false, reason: 'already_out' });

		// POSITIVE CONTROL: the refusal is about ANA, not about section B being
		// shut. Ben walks out of B in the same state.
		expect((await open(ben, sectionB)).ok).toBe(true);
	});

	test('closing the first frees the student for the second', async () => {
		await reset();
		expect((await open(ana, sectionA)).ok).toBe(true);
		expect((await closeMine(ana, sectionA)).ok).toBe(true);
		// Section B has its own cooldown clock, which has never run for Ana.
		expect((await open(ana, sectionB)).ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// DEFECT 2: the cooldown, and the time in the refusal.
// ---------------------------------------------------------------------------

describe('defect 2 -- the next pass is not immediate', () => {
	test('signing back in and straight out again is refused, with an instant to give back', async () => {
		await reset();
		expect((await open(ana, sectionA)).ok).toBe(true);
		expect((await closeMine(ana, sectionA)).ok).toBe(true);

		const again = await open(ana, sectionA);
		expect(again.ok).toBe(false);
		expect(again.reason).toBe('cooldown');
		// THE TIME IS THE POINT. A refusal with no instant in it is asked again
		// immediately, in person, which is the behaviour this closes.
		expect(typeof again.retry_at).toBe('string');
		expect(new Date(again.retry_at as string).getTime()).toBeGreaterThan(Date.now());

		// Nothing was written by the refusal.
		expect(await passRows(sectionA)).toHaveLength(1);
	});

	test('the cooldown elapses and the same call is then allowed', async () => {
		await reset();
		const { rows } = await db.sql<{ limits: { cooldown_minutes: number } }>(
			'select public._classroom_hall_pass_limits() as limits'
		);
		const cooldown = rows[0].limits.cooldown_minutes;

		// One minute short: still refused.
		await tripAgo(ana, sectionA, cooldown - 1);
		expect(await open(ana, sectionA)).toMatchObject({ ok: false, reason: 'cooldown' });

		// One minute past: allowed. Same student, same section, same call --
		// only the clock moved.
		// BOTH ENDS MOVE. `closed_at >= opened_at` is a CHECK on the table
		// (0143), so backdating only the close writes a pass that came back
		// before it left and the constraint refuses it.
		await db.sql(
			`update public.classroom_hall_passes
			 set opened_at = now() - make_interval(mins => $1::int + 5),
			     closed_at = now() - make_interval(mins => $1::int)
			 where section_id = $2::uuid and student_email = $3`,
			[cooldown + 1, sectionA, ana.email]
		);
		expect((await open(ana, sectionA)).ok).toBe(true);
	});

	test('the cooldown is per section, not global to the student', async () => {
		await reset();
		await tripAgo(ana, sectionA, 0);
		expect(await open(ana, sectionA)).toMatchObject({ ok: false, reason: 'cooldown' });
		// A different class keeps its own clock: one class's rules are that
		// class's, and a student is not in two rooms in one period anyway.
		expect((await open(ana, sectionB)).ok).toBe(true);
	});

	test('the state tells the student the instant before they tap, and clears it afterwards', async () => {
		await reset();
		await tripAgo(ana, sectionA, 0);
		const during = (await state(ana, sectionA)) as { retry_at: string | null };
		expect(typeof during.retry_at).toBe('string');

		await db.sql(
			`update public.classroom_hall_passes
			 set opened_at = now() - interval '4 hours', closed_at = now() - interval '3 hours'
			 where section_id = $1::uuid and student_email = $2`,
			[sectionA, ana.email]
		);
		const after = (await state(ana, sectionA)) as { retry_at: string | null };
		// NULL MEANS "not on cooldown", so the client asks one question rather
		// than holding a second copy of the comparison.
		expect(after.retry_at).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// DEFECT 3: the daily cap.
// ---------------------------------------------------------------------------

describe('defect 3 -- the number of passes in a day is bounded', () => {
	test('the cap refuses the next one and reports the count', async () => {
		await reset();
		const { rows } = await db.sql<{ limits: { daily_limit: number } }>(
			'select public._classroom_hall_pass_limits() as limits'
		);
		const cap = rows[0].limits.daily_limit;

		await tripsToday(ana, sectionA, cap);
		const refused = await open(ana, sectionA);
		expect(refused).toMatchObject({ ok: false, reason: 'limit_reached', used: cap, limit: cap });

		// POSITIVE CONTROL: the cap is per student. Ben is untouched by Ana's day.
		expect((await open(ben, sectionA)).ok).toBe(true);
	});

	test('the cap is per section', async () => {
		await reset();
		const { rows } = await db.sql<{ limits: { daily_limit: number } }>(
			'select public._classroom_hall_pass_limits() as limits'
		);
		await tripsToday(ana, sectionA, rows[0].limits.daily_limit);
		expect(await open(ana, sectionA)).toMatchObject({ ok: false, reason: 'limit_reached' });
		expect((await open(ana, sectionB)).ok).toBe(true);
	});

	test('the window is the America/Los_Angeles day, at an instant where UTC disagrees', async () => {
		await reset();
		const { rows } = await db.sql<{ limits: { daily_limit: number } }>(
			'select public._classroom_hall_pass_limits() as limits'
		);
		const cap = rows[0].limits.daily_limit;
		// THE PRECONDITION IS ITSELF DAY-SCOPED, AND THAT IS WHAT USED TO BREAK
		// THIS TEST. `tripsToday` guarantees the rows are today at every hour and
		// says so itself; without it these were `now() - 60..80 minutes`, which is
		// YESTERDAY for the first eighty minutes of the LA day -- so the cap this
		// line asserts was never reached and the test about the day boundary
		// failed at the day boundary, before its own instrument ever ran.
		await tripsToday(ana, sectionA, cap);
		expect(await open(ana, sectionA)).toMatchObject({ ok: false, reason: 'limit_reached' });

		// THE INSTRUMENT (0140's). Move every row back to 8pm Pacific YESTERDAY,
		// which is 3am UTC TODAY -- so the two calendars give different answers
		// about whether these passes are today's. Under the LA calendar they are
		// yesterday's and the student may go again; under UTC they would still
		// be today's and the refusal would stand.
		await db.sql(
			`update public.classroom_hall_passes
			 set opened_at = ((now() at time zone 'America/Los_Angeles')::date - 1 + time '20:00')
			                 at time zone 'America/Los_Angeles',
			     closed_at = ((now() at time zone 'America/Los_Angeles')::date - 1 + time '20:05')
			                 at time zone 'America/Los_Angeles'
			 where section_id = $1::uuid and student_email = $2`,
			[sectionA, ana.email]
		);

		// The rows really are on different days in the two calendars, or this
		// test proves nothing about which one the RPC used.
		const { rows: cal } = await db.sql<{ la: string; utc: string; today_la: string }>(
			`select distinct (opened_at at time zone 'America/Los_Angeles')::date::text as la,
			        (opened_at at time zone 'UTC')::date::text as utc,
			        (now() at time zone 'America/Los_Angeles')::date::text as today_la
			 from public.classroom_hall_passes where section_id = $1::uuid`,
			[sectionA]
		);
		expect(cal[0].utc).not.toBe(cal[0].la);
		expect(cal[0].utc).toBe(cal[0].today_la);

		// So a UTC-based count still sees `cap` passes today and would refuse.
		// The LA-based one sees none.
		expect((await open(ana, sectionA)).ok).toBe(true);
	});

	test('the state reports the count today without being asked to refuse anything', async () => {
		await reset();
		await tripsToday(ana, sectionA, 2);
		const seen = (await state(ana, sectionA)) as { used_today: number };
		expect(seen.used_today).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// THE OVERRIDE.
// ---------------------------------------------------------------------------

describe('the instructor override', () => {
	test('it opens a pass past the cap and records who authorized it', async () => {
		await reset();
		const { rows } = await db.sql<{ limits: { daily_limit: number } }>(
			'select public._classroom_hall_pass_limits() as limits'
		);
		await tripsToday(ana, sectionA, rows[0].limits.daily_limit);
		expect(await open(ana, sectionA)).toMatchObject({ ok: false, reason: 'limit_reached' });

		const forced = await openFor(teacher, sectionA, ana.email);
		expect(forced.ok).toBe(true);
		expect(forced.opened_by).toBe(teacher.email);

		const written = await passRows(sectionA);
		expect(written.filter((r) => r.opened_by === teacher.email)).toHaveLength(1);
		// EVERY OTHER ROW IS NULL, which is what "the student opened it
		// themselves" means and what makes the trail readable.
		expect(written.filter((r) => r.opened_by === null)).toHaveLength(
			rows[0].limits.daily_limit
		);
	});

	test('it opens a pass past the cooldown', async () => {
		await reset();
		await tripAgo(ana, sectionA, 0);
		expect(await open(ana, sectionA)).toMatchObject({ ok: false, reason: 'cooldown' });
		expect((await openFor(teacher, sectionA, ana.email)).ok).toBe(true);
	});

	test('an overridden pass still counts toward the day', async () => {
		await reset();
		expect((await openFor(teacher, sectionA, ana.email)).ok).toBe(true);
		expect((await closeMine(ana, sectionA)).ok).toBe(true);
		const seen = (await state(ana, sectionA)) as { used_today: number };
		// The instructor said yes to ONE trip, not to the rest of the day.
		expect(seen.used_today).toBe(1);
	});

	test('it does not override the capacity index or the cross-section rule', async () => {
		await reset();
		expect((await open(ben, sectionA)).ok).toBe(true);
		// Somebody is already out of this room.
		expect(await openFor(teacher, sectionA, ana.email)).toMatchObject({
			ok: false,
			reason: 'taken'
		});

		await reset();
		expect((await open(ana, sectionB)).ok).toBe(true);
		// Ana is already gone. An override is permission to go now, not
		// permission to be in two places.
		expect(await openFor(teacher, sectionA, ana.email)).toMatchObject({
			ok: false,
			reason: 'already_out'
		});
	});

	test('a student cannot call it, on themselves or on anybody', async () => {
		await reset();
		await expect(openFor(ana, sectionA, ana.email)).rejects.toThrow(
			/That class does not exist/
		);
		await expect(openFor(ana, sectionA, ben.email)).rejects.toThrow(
			/That class does not exist/
		);
		// And nothing was written by either attempt.
		expect(await passRows(sectionA)).toHaveLength(0);
	});

	test('the roster the override picks from holds only students it would accept', async () => {
		await reset();
		await db.sql(
			'update public.classroom_enrollments set active = false where section_id = $1::uuid and student_email = $2',
			[sectionA, ben.email]
		);
		const seen = (await state(teacher, sectionA)) as {
			roster: { student_email: string }[];
		};
		// A deactivated student is refused by `open_for`, so offering their name
		// would be a control whose only possible answer is a refusal.
		expect(seen.roster.map((r) => r.student_email)).toEqual([ana.email]);
		expect(await openFor(teacher, sectionA, ben.email)).toMatchObject({
			ok: false,
			reason: 'not_enrolled'
		});
		await db.sql(
			'update public.classroom_enrollments set active = true where section_id = $1::uuid and student_email = $2',
			[sectionA, ben.email]
		);
		const back = (await state(teacher, sectionA)) as { roster: { student_email: string }[] };
		expect(back.roster).toHaveLength(2);
	});

	test('a name off the roster and a deactivated one answer identically', async () => {
		await reset();
		expect(await openFor(teacher, sectionA, 'nobody@boscotech.net')).toMatchObject({
			ok: false,
			reason: 'not_enrolled'
		});
		await db.sql(
			'update public.classroom_enrollments set active = false where section_id = $1::uuid and student_email = $2',
			[sectionA, ben.email]
		);
		expect(await openFor(teacher, sectionA, ben.email)).toMatchObject({
			ok: false,
			reason: 'not_enrolled'
		});
		await db.sql(
			'update public.classroom_enrollments set active = true where section_id = $1::uuid and student_email = $2',
			[sectionA, ben.email]
		);
	});
});

// ---------------------------------------------------------------------------
// DISCLOSURE. 0143's whole argument, re-checked against every field 0174 adds.
// ---------------------------------------------------------------------------

describe('0174 discloses nothing new to a student', () => {
	test("a peer's state still carries no name, email, pass id, history or opened_by", async () => {
		await reset();
		expect((await openFor(teacher, sectionA, ben.email)).ok).toBe(true);
		const seen = await state(ana, sectionA);

		expect(Object.keys(seen).sort()).toEqual(
			['limits', 'mine', 'opened_at', 'retry_at', 'scope', 'section_id', 'taken', 'used_today'].sort()
		);
		// The ROSTER 0174 hands a manager for the override control is absent
		// here, and its absence is the projection: a student branch that
		// evaluated it would be a class directory on every poll.
		expect('roster' in seen).toBe(false);
		// POSITIVE CONTROL: the manager, on the same open pass, is told all of it
		// -- so the absences above are a projection and not an empty database.
		const managerSeen = (await state(teacher, sectionA)) as {
			open: { student_name: string } | null;
			history: { opened_by: string | null }[];
			roster: { student_email: string; student_name: string }[];
		};
		expect(managerSeen.open?.student_name).toBe('Ben Ortiz');
		expect(managerSeen.history[0].opened_by).toBe(teacher.email);
		expect(managerSeen.roster.map((r) => r.student_name)).toEqual(['Ana Reyes', 'Ben Ortiz']);

		// And nothing anywhere in the student's serialized payload names Ben.
		const text = JSON.stringify(seen);
		expect(text).not.toContain(ben.email);
		expect(text).not.toContain('Ben');
		expect(text).not.toContain(teacher.email);
	});

	test('the student still cannot select the table', async () => {
		await db.asUser(ana.id, async (q) => {
			await expect(q('select * from public.classroom_hall_passes')).rejects.toThrow(
				/permission denied/i
			);
		});
	});
});

// ---------------------------------------------------------------------------
// 0143's own promise, which this file must not have broken.
// ---------------------------------------------------------------------------

describe('nothing expires or auto-closes a pass', () => {
	test('a pass left open for hours is still open and still refuses nothing', async () => {
		await reset();
		const opened = await open(ana, sectionA);
		expect(opened.ok).toBe(true);
		await db.sql(
			`update public.classroom_hall_passes set opened_at = now() - interval '6 hours' where id = $1::uuid`,
			[opened.pass_id]
		);
		const seen = (await state(teacher, sectionA)) as { taken: boolean };
		// Still out. 0143: "a long absence is a conversation an instructor has,
		// not something the schema adjudicates." 0174 limits how OFTEN a pass may
		// be taken, never how long one lasts.
		expect(seen.taken).toBe(true);
		expect((await closeMine(ana, sectionA)).ok).toBe(true);
	});

	test('the migration re-applies over live rows', async () => {
		await reset();
		const opened = await open(ana, sectionA);
		expect(opened.ok).toBe(true);
		const { readFileSync } = await import('node:fs');
		await db.sql(
			readFileSync('supabase/migrations/0174_classroom_hall_pass_limits.sql', 'utf8')
		);
		const rows = await passRows(sectionA);
		expect(rows).toHaveLength(1);
		expect(rows[0].closed_at).toBeNull();
		expect((await closeMine(ana, sectionA)).ok).toBe(true);
	});
});
