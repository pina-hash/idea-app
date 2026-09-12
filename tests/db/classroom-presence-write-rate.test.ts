// tests/db/classroom-presence-write-rate.test.ts
//
// 0200: THE WRITE RATE AND THE CREDIT RULE, MEASURED RATHER THAN PROMISED.
//
// "A write per keystroke would hammer the database" is the prompt's own
// constraint and the reason the client beats at most every 30 seconds. That is
// what the client does; it is not what makes it true. A limit that lives only
// in the code sending the requests is a promise -- the next surface to call the
// RPC keeps none of it, and neither does anybody typing into a console.
//
// SO THE FLOOR IS IN THE FUNCTION, and this file measures it the only way that
// means anything: by BEATING AS FAST AS A CLIENT POSSIBLY COULD, in a tight
// loop with no waiting at all, and counting how many of those beats reached the
// table. The figure is reported in the history entry.
//
// THE CLOCK IS FAKED BY MOVING THE ROW, NEVER BY MOVING `now()`. The floor is
// `now() - last_seen_at`, an age, so backdating the stamp as the connection
// owner produces exactly the state a real wait produces. Nothing here sleeps,
// and a test that slept for the real 20 seconds per case would take minutes and
// still be measuring the same arithmetic.
//
// AND THE CREDIT RULE IS THE OTHER HALF. "How much time did they actually
// spend" is the number Mr. Pina asked for, so the cases that matter are the
// ones where a naive implementation would over-count: the first beat, a beat
// after a long gap, a beat that reports input from a tab the student is not
// looking at.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8');

let db: TestDb;
let teacher: SeededUser;
let ana: SeededUser;
let item = '';

interface Beat {
	ok: boolean;
	throttled: boolean;
	credited_seconds?: number;
	active_seconds?: number;
}

async function rpc<T>(userId: string, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function ping(typed: boolean, visible: boolean): Promise<Beat> {
	return rpc<Beat>(
		ana.id,
		'public.classroom_presence_ping($1::uuid, $2::boolean, $3::boolean)',
		[item, typed, visible]
	);
}

/** Backdates the row so the next beat is as old as a real wait would make it. */
async function wait(interval: string) {
	await db.sql(
		`update public.classroom_presence
		 set last_seen_at = last_seen_at - $2::interval,
		     last_input_at = last_input_at - $2::interval
		 where item_id = $1 and student_email = $3`,
		[item, interval, ana.email]
	);
}

async function activeSeconds(): Promise<number> {
	const { rows } = await db.sql<{ active_seconds: number }>(
		'select active_seconds from public.classroom_presence where item_id = $1 and student_email = $2',
		[item, ana.email]
	);
	return rows[0]?.active_seconds ?? 0;
}

async function reset() {
	await db.sql('delete from public.classroom_presence where item_id = $1', [item]);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');

	const course = await rpc<{ course_id: string }>(
		teacher.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'Intro to Engineering Design']
	);
	const section = (
		await rpc<{ section_id: string }>(
			teacher.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[course.course_id, 'Period 1', null]
		)
	).section_id;
	await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		section,
		ana.email,
		ana.email,
		true
	]);
	item = (
		await rpc<{ item_id: string }>(
			teacher.id,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[section], 'Bridge Sketch']
		)
	).item_id;

	await db.sql(read('0200_classroom_presence.sql'));
});

afterAll(async () => {
	await db?.stop();
});

describe('the write rate is the database is, not the client is', () => {
	test('a hundred beats as fast as a client can send them produce ONE row write', async () => {
		await reset();
		const results: Beat[] = [];
		for (let i = 0; i < 100; i += 1) results.push(await ping(true, true));

		const written = results.filter((r) => !r.throttled).length;
		const throttled = results.filter((r) => r.throttled).length;

		// THE MEASUREMENT. 100 beats with no waiting at all -- which is faster
		// than any heartbeat, faster than typing, and exactly what a client with
		// its timer removed would do -- reach the table once.
		expect(written).toBe(1);
		expect(throttled).toBe(99);
		expect(results.every((r) => r.ok)).toBe(true);

		// AND THE TABLE AGREES. A function that reported `throttled` while writing
		// anyway would pass every assertion above.
		const { rows } = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_presence where item_id = $1',
			[item]
		);
		expect(rows[0].n).toBe('1');
		// Nothing accrued either: the first beat has no interval behind it and the
		// ninety-nine after it never reached the credit.
		expect(await activeSeconds()).toBe(0);
	});

	test('the ceiling is three writes a minute per student per assignment', async () => {
		await reset();
		let written = 0;
		// Sixty simulated seconds, beaten at every second. The 20-second floor
		// admits the 1st, the 21st and the 41st.
		for (let second = 0; second < 60; second += 1) {
			const beat = await ping(true, true);
			if (!beat.throttled) written += 1;
			await wait('1 second');
		}
		expect(written).toBe(3);
	});

	test('a beat inside the floor writes NOTHING -- not a later stamp, not a credit', async () => {
		await reset();
		await ping(true, true);
		await wait('10 seconds');
		const before = await db.sql<{ last_seen_at: string; active_seconds: number }>(
			'select last_seen_at, active_seconds from public.classroom_presence where item_id = $1',
			[item]
		);
		const refused = await ping(true, true);
		expect(refused.throttled).toBe(true);
		const after = await db.sql<{ last_seen_at: string; active_seconds: number }>(
			'select last_seen_at, active_seconds from public.classroom_presence where item_id = $1',
			[item]
		);
		expect(after.rows[0]).toEqual(before.rows[0]);
	});
});

describe('active seconds count WORKING and nothing else', () => {
	test('the first beat credits nothing -- there is no interval behind it', async () => {
		await reset();
		const first = await ping(true, true);
		expect(first.credited_seconds).toBe(0);
		expect(first.active_seconds).toBe(0);
	});

	test('a typed, visible interval credits the interval', async () => {
		await reset();
		await ping(true, true);
		await wait('30 seconds');
		const beat = await ping(true, true);
		expect(beat.credited_seconds).toBe(30);
		expect(beat.active_seconds).toBe(30);
	});

	test('an interval with no typing in it credits nothing', async () => {
		// VIEWING IS NOT WORKING. A student with the page open, reading, accrues
		// nothing -- which is the whole distinction Mr. Pina asked for, and the
		// one a naive "time with the page open" counter would lose.
		await reset();
		await ping(true, true);
		await wait('30 seconds');
		const beat = await ping(false, true);
		expect(beat.credited_seconds).toBe(0);
		expect(beat.active_seconds).toBe(0);
	});

	test('a typed interval reported HIDDEN credits nothing', async () => {
		// The hide report can legitimately follow a keystroke: type, then switch
		// tabs. Crediting that interval would pay for the switch. Both flags are
		// required and this is the case that proves the AND is really an AND.
		await reset();
		await ping(true, true);
		await wait('30 seconds');
		const beat = await ping(true, false);
		expect(beat.credited_seconds).toBe(0);
		expect(beat.active_seconds).toBe(0);
	});

	test('a long gap is capped at two heartbeats, not credited whole', async () => {
		// A gap longer than two beats means at least one beat did not happen: the
		// tab was hidden, the machine slept, the network went. Crediting the whole
		// gap would count exactly the time the student was NOT working.
		await reset();
		await ping(true, true);
		await wait('45 minutes');
		const beat = await ping(true, true);
		expect(beat.credited_seconds).toBe(60);
		expect(beat.active_seconds).toBe(60);
	});

	test('the counter accumulates across a whole working period', async () => {
		await reset();
		await ping(true, true);
		// Ten more beats, 30 simulated seconds apart, all typed and visible.
		for (let i = 0; i < 10; i += 1) {
			await wait('30 seconds');
			await ping(true, true);
		}
		expect(await activeSeconds()).toBe(300);

		// Then the student stops typing for five beats. The counter holds.
		for (let i = 0; i < 5; i += 1) {
			await wait('30 seconds');
			await ping(false, true);
		}
		expect(await activeSeconds()).toBe(300);
	});

	test('a last_seen_at in the FUTURE is refused, not credited backwards', async () => {
		// UNREACHABLE THROUGH THE RPC, AND TESTED ANYWAY. `last_seen_at` is
		// stamped with the database's own `now()` on every write, so no browser
		// clock can put it ahead -- which is exactly why the arithmetic that would
		// meet a future stamp has never been exercised. Forced into that state as
		// the connection owner, the floor answers first (a negative interval is
		// less than 20 seconds), so the beat is THROTTLED and nothing is written.
		// Fail-safe in the direction that matters: the bad case refuses rather
		// than crediting a negative number of seconds.
		await reset();
		await ping(true, true);
		await db.sql(
			`update public.classroom_presence
			 set last_seen_at = now() + interval '5 minutes'
			 where item_id = $1`,
			[item]
		);
		const beat = await ping(true, true);
		expect(beat.throttled).toBe(true);
		expect(await activeSeconds()).toBe(0);
	});

	test('the column itself refuses a negative count, whatever wrote it', async () => {
		// The last line of defence, asserted as a CHECK rather than as a claim
		// about the function: a future write path that got the arithmetic wrong
		// would be refused by the column rather than storing a negative duration.
		await reset();
		await ping(true, true);
		await expect(
			db.sql('update public.classroom_presence set active_seconds = -1 where item_id = $1', [
				item
			])
		).rejects.toThrow(/violates check constraint/i);
	});
});

describe('what is stored is the minimum, and there is no event log', () => {
	test('the table holds six columns and not one of them is content', async () => {
		const { rows } = await db.sql<{ column_name: string; data_type: string }>(
			`select column_name, data_type from information_schema.columns
			 where table_schema = 'public' and table_name = 'classroom_presence'
			 order by column_name`
		);
		expect(rows.map((r) => r.column_name)).toEqual([
			'active_seconds',
			'first_seen_at',
			'item_id',
			'last_input_at',
			'last_seen_at',
			'page_visible',
			'student_email'
		]);
		// No text column but the email, which is the key. Nothing a keystroke, a
		// word, a URL or a device could be stored in.
		expect(rows.filter((r) => r.data_type === 'text').map((r) => r.column_name)).toEqual([
			'student_email'
		]);
	});

	test('one row per (item, student), so beating cannot grow the table', async () => {
		await reset();
		for (let i = 0; i < 20; i += 1) {
			await ping(true, true);
			await wait('30 seconds');
		}
		const { rows } = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_presence where item_id = $1',
			[item]
		);
		// A HISTORY WOULD BE 20 HERE. It is 1, because the counter answers the
		// question and cannot answer any other.
		expect(rows[0].n).toBe('1');
	});

	test('no second presence table exists for anything to log into', async () => {
		const { rows } = await db.sql<{ table_name: string }>(
			`select table_name from information_schema.tables
			 where table_schema = 'public' and table_name like '%presence%'
			 order by table_name`
		);
		expect(rows.map((r) => r.table_name)).toEqual(['classroom_presence']);
	});
});
