// tests/db/classroom-presence-boundary.test.ts
//
// 0200: THE FOUR RULES MR. PINA'S "JUST KEEP THE DATA SECURE" TURNS INTO, PUT
// TO A REAL POSTGRES WITH THE REAL MIGRATION FILES APPLIED UNMODIFIED.
//
// These are minors, and this table is the first thing in the schema that says
// anything about what a child was doing minute to minute. So the four rules are
// not assertions about the SQL text -- they are behaviour, measured through the
// same two roles PostgREST actually uses:
//
//   1. A STUDENT NEVER SEES A PEER'S PRESENCE. Proved with a SIGNED-IN PEER
//      control (a real classmate, on the same roster, on the same assignment)
//      AND an ANONYMOUS control. Every one of those is paired with the positive
//      control that the owner of the row CAN see it, so a policy that denied
//      everybody would fail here rather than pass.
//   2. ONLY THE ITEM'S TEACHERS OF RECORD AND SITE ADMINS read a section's
//      presence. Proved by refusing a teacher of a DIFFERENT section OF THE
//      SAME COURSE carrying THE SAME ASSIGNMENT, which is the shape that is
//      dangerous when the boundary lives in the UI.
//   3. `anon` CAN NEITHER READ NOR WRITE. Both halves, both objects.
//   4. RETENTION. The purge removes rows past the window and keeps rows inside
//      it, in the same call, so "it deleted everything" cannot pass for
//      "it deleted the old ones".
//
// THE MIGRATION IS APPLIED OVER SEEDED PRE-MIGRATION DATA, not onto a bare
// chain: the sections, the roster, the assignment and the students' own work
// are all created through the REAL pre-0200 RPCs first, and 0200 is read off
// disk and applied on top. That is the migration rule, and here it also proves
// the thing an operator actually needs: that this file applies to a database
// that already has a term of classroom data in it.
//
// AND IT IS APPLIED TWICE. A migration that only works once fails exactly when
// somebody re-pastes it after a partial failure, with the schema half built.
//
// THE CLOCK IS FAKED BY MOVING THE ROWS, NEVER BY MOVING `now()`. Every window
// here is an age -- `now() - last_seen_at`, `now() - last_input_at`,
// `now() - retention` -- so backdating the stamps with an explicit UPDATE as the
// connection owner produces exactly the state a real wait produces,
// deterministically and in milliseconds. Nothing here sleeps.

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

// 0138 IS DELIBERATELY NOT IN THIS CHAIN, and the reason is worth stating so
// nobody adds it back to "be current". It rewrites `classroom_manages_section`
// as a thin wrapper over an email-scoped rule, with the SAME name, signature
// and answers -- and it pulls the whole notebook chain in behind it
// (`_notebook_user_id_for_email`). 0082's definition already folds `is_admin()`
// in, which is the only property this file leans on, so the admin assertions
// below are true on both sides of that migration and the chain stays the
// classroom's own.

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8');
const MIGRATION_0200 = read('0200_classroom_presence.sql');

/**
 * A MINIMAL REAL SPEC, so the pre-migration seeding below goes through
 * `classroom_save_response` (which refuses an item with no interactive spec)
 * rather than through a raw insert. The point of the seeding is that the
 * database 0200 is applied to already holds work, and work written by anything
 * but the real write path is not work.
 */
const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-u1-01', title: 'Bridge', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Only module',
			points: 20,
			blocks: [{ type: 'textField', id: 'f1', prompt: 'Say something.', minSentences: 1 }],
			rubric: [
				{
					id: 'c1',
					criterion: 'Sketch',
					// The criterion MAXIMUM, which 0095 validates every level against.
					points: 20,
					// THREE LEVELS, HIGHEST FIRST, because that is what 0095 validates:
					// a criterion needs three or four, and its `points` must equal its
					// TOP level. The fixture is built to the schema's own rules rather
					// than to what looked like enough -- a spec the real RPC refuses is
					// not pre-migration data, it is nothing.
					levels: [
						{ label: 'Proficient', short: 'P', points: 20, descriptor: 'A clear, scaled sketch.' },
						{ label: 'Developing', short: 'D', points: 10, descriptor: 'A rough sketch.' },
						{ label: 'Not yet', short: 'NY', points: 0, descriptor: 'Nothing usable yet.' }
					]
				}
			]
		}
	]
};

let db: TestDb;
/** Teacher of record for Period 1 and Period 2. Not an admin. */
let teacher: SeededUser;
/** Teacher of record for Period 3 of the SAME course, carrying the SAME item. */
let other: SeededUser;
/** On `app_admins`. Manages no section of their own. */
let admin: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
/** Period 3. A student of `other`, never of `teacher`. */
let cruz: SeededUser;
let p1 = '';
let p2 = '';
let p3 = '';
let item = '';

async function rpc<T>(userId: string, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** One heartbeat, through the real RPC, as the real student. */
async function ping(
	user: SeededUser,
	opts: { typed?: boolean; visible?: boolean } = {}
): Promise<Record<string, unknown>> {
	return rpc(user.id, 'public.classroom_presence_ping($1::uuid, $2::boolean, $3::boolean)', [
		item,
		opts.typed ?? false,
		opts.visible ?? true
	]);
}

/** How many presence rows this caller can SELECT off the table, through RLS. */
async function visibleRows(user: SeededUser): Promise<string[]> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ student_email: string }>(
			'select student_email from public.classroom_presence order by student_email'
		);
		return rows.map((r) => r.student_email);
	});
}

/**
 * BACKDATES A ROW BY MOVING ITS STAMPS, as the connection owner. Exactly the
 * state a real wait produces, because every window in 0200 is an age.
 */
async function ageRow(email: string, interval: string) {
	await db.sql(
		`update public.classroom_presence
		 set last_seen_at = last_seen_at - $2::interval,
		     last_input_at = last_input_at - $2::interval,
		     first_seen_at = first_seen_at - $2::interval
		 where item_id = $1 and student_email = $3`,
		[item, interval, email]
	);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	other = await createUser(db, 'rmonroe@boscotech.edu', 'R. Monroe');
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okafor');
	cruz = await createUser(db, 'cruz@boscotech.net', 'Cruz Delgado');

	// `apina@boscotech.edu` is the PINNED OWNER (0067's admin_owner_email), so
	// `is_admin()` is already true for them with no grant row -- which is the
	// state an admin reaching this console is actually in.
	const course = await rpc<{ course_id: string }>(
		teacher.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'Intro to Engineering Design']
	);
	const mkSection = async (userId: string, label: string) =>
		(
			await rpc<{ section_id: string }>(
				userId,
				'public.classroom_upsert_section($1::uuid, $2, $3)',
				[course.course_id, label, null]
			)
		).section_id;

	p1 = await mkSection(teacher.id, 'Period 1');
	p2 = await mkSection(teacher.id, 'Period 2');
	p3 = await mkSection(other.id, 'Period 3');

	const enroll = (owner: string, section: string, s: SeededUser) =>
		rpc(owner, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section,
			s.email,
			s.email,
			true
		]);
	await enroll(teacher.id, p1, ana);
	await enroll(teacher.id, p1, ben);
	await enroll(other.id, p3, cruz);

	// ONE canonical assignment, posted to Period 1 and Period 2 by its author,
	// and attached to Period 3 afterwards by raw insert -- exactly the
	// grading-bulk fixture's shape, and exactly what happens in life when a
	// colleague posts your assignment into their own block.
	item = (
		await rpc<{ item_id: string }>(
			teacher.id,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[p1, p2], 'Bridge Sketch']
		)
	).item_id;
	// AUTHORING FINISHES BEFORE THE THIRD CLASS IS ATTACHED, because
	// `classroom_set_assignment_spec` requires the caller to manage EVERY section
	// the item is posted to. `teacher` could not have made the Period 3 posting,
	// and that is exactly the point of it.
	await rpc(teacher.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
		item,
		JSON.stringify(SPEC)
	]);
	await db.sql(
		`insert into public.classroom_postings (item_id, section_id) values ($1, $2)
		 on conflict do nothing`,
		[item, p3]
	);

	// PRE-MIGRATION WORK, through the real pre-0200 RPC. The migration is applied
	// over a database that already holds a term's classroom data, which is the
	// only state it will ever meet in production.
	for (const s of [ana, ben, cruz]) {
		await rpc(s.id, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item,
			'f1',
			JSON.stringify('A first answer that is a whole sentence.')
		]);
	}

	await db.sql(MIGRATION_0200);
});

afterAll(async () => {
	await db?.stop();
});

describe('0200 applies, and applies again', () => {
	test('re-applying the file over its own result is a no-op, not a failure', async () => {
		// RE-PASTING IS ORDINARY -- a first attempt fails partway, somebody runs it
		// again -- so a migration that only works once fails exactly then, with the
		// schema half built.
		await expect(db.sql(MIGRATION_0200)).resolves.toBeTruthy();
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_policies
			 where schemaname = 'public' and tablename = 'classroom_presence'`
		);
		expect(rows[0].n).toBe('1');
	});

	test('the table is SELECT-only to authenticated and holds nothing for anon', async () => {
		const { rows } = await db.sql<{ grantee: string; privilege_type: string }>(
			`select grantee, privilege_type from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'classroom_presence'
			   and grantee in ('anon', 'authenticated', 'PUBLIC')
			 order by grantee, privilege_type`
		);
		expect(rows).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }]);
	});
});

describe('RULE 1 -- a student never sees another student is presence', () => {
	beforeAll(async () => {
		await ping(ana, { typed: true, visible: true });
		await ping(ben, { typed: false, visible: true });
		await ping(cruz, { typed: true, visible: true });
	});

	test('the OWNER of a row can read it -- the positive control', async () => {
		// Without this, every absence below would pass on a policy that denied
		// everybody, which is the shape a broken narrowing takes.
		expect(await visibleRows(ana)).toEqual(['ana@boscotech.net']);
	});

	test('a SIGNED-IN PEER on the same roster sees nothing of theirs', async () => {
		// Ben is a real classmate: same section, same assignment, his own row
		// present in the table. What he can see is his own row and no other.
		expect(await visibleRows(ben)).toEqual(['ben@boscotech.net']);
	});

	test('a student cannot reach a peer is row by naming it either', async () => {
		const seen = await db.asUser(ben.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*) as n from public.classroom_presence
				 where student_email = $1`,
				[ana.email]
			);
			return rows[0].n;
		});
		expect(seen).toBe('0');
	});

	test('a student gets NULL from the instructor read, for their own class', async () => {
		// Not a refusal and not an empty list of students: null, which is the same
		// answer an item id that does not exist gives, so nothing can be probed.
		const state = await rpc<unknown>(
			ana.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, p1]
		);
		expect(state).toBeNull();
	});

	test('and NULL with no section named, which is the widest form of the ask', async () => {
		const state = await rpc<unknown>(
			ana.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, null]
		);
		expect(state).toBeNull();
	});

	test('a student cannot beat for anybody but themselves -- the signature has no way to ask', async () => {
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_identity_arguments(p.oid) as args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_presence_ping'`
		);
		expect(rows).toHaveLength(1);
		// uuid + two booleans. No text, no uuid subject, nothing an email could
		// travel in: "can only act as themselves" is a property of the SIGNATURE.
		expect(rows[0].args).toBe('p_item_id uuid, p_typed boolean, p_page_visible boolean');
	});

	test('a student not enrolled in this assignment is refused outright', async () => {
		// 0086's own gate, not restated by 0200. `cruz` IS enrolled (Period 3), so
		// the negative needs somebody who is not: the teacher, who reads the item
		// but is on nobody's roster.
		await expect(ping(teacher)).rejects.toThrow(
			/Only a student enrolled in this class can work on this assignment/
		);
	});
});

describe('RULE 2 -- only the item is teachers of record and site admins', () => {
	test('the teacher of record reads their own section', async () => {
		const state = await rpc<{ students: { student_email: string }[] }>(
			teacher.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, p1]
		);
		expect(state.students.map((s) => s.student_email)).toEqual([
			'ana@boscotech.net',
			'ben@boscotech.net'
		]);
	});

	test('a teacher of a DIFFERENT section of the same course is refused', async () => {
		// `other` teaches Period 3, which carries this very assignment. They may
		// read their OWN section and nothing of Period 1's.
		const refused = await rpc<unknown>(
			other.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, p1]
		);
		expect(refused).toBeNull();

		const theirs = await rpc<{ students: { student_email: string }[] }>(
			other.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, p3]
		);
		// THE POSITIVE CONTROL FOR THE SAME CALLER. Without it the refusal above
		// could be a function that answers null for everybody.
		expect(theirs.students.map((s) => s.student_email)).toEqual(['cruz@boscotech.net']);
	});

	test('the unscoped ask returns only the sections that caller manages', async () => {
		const mine = await rpc<{ students: { student_email: string }[] }>(
			teacher.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, null]
		);
		expect(mine.students.map((s) => s.student_email)).toEqual([
			'ana@boscotech.net',
			'ben@boscotech.net'
		]);
		expect(mine.students.map((s) => s.student_email)).not.toContain('cruz@boscotech.net');
	});

	test('a teacher of a different section cannot read those rows off the table either', async () => {
		// The RPC and the policy are two independent refusals, and the table is
		// where a caller would go if the RPC refused them.
		expect(await visibleRows(other)).toEqual(['cruz@boscotech.net']);
	});

	test('a site admin reads every section, with no grant of their own', async () => {
		const all = await rpc<{ students: { student_email: string }[] }>(
			admin.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, null]
		);
		expect(all.students.map((s) => s.student_email).sort()).toEqual([
			'ana@boscotech.net',
			'ben@boscotech.net',
			'cruz@boscotech.net'
		]);
	});

	test('the payload carries the deployment is own windows, so no client keeps a second copy', async () => {
		const state = await rpc<{ limits: Record<string, number> }>(
			teacher.id,
			'public.classroom_presence_state($1::uuid, $2::uuid)',
			[item, p1]
		);
		expect(state.limits).toEqual({
			input_window_seconds: 60,
			away_window_seconds: 120,
			heartbeat_seconds: 30,
			min_gap_seconds: 20,
			retention_days: 90
		});
	});
});

describe('RULE 3 -- anon can neither read nor write', () => {
	test('anon cannot select the table', async () => {
		await db.asAnon(async (q) => {
			await expect(q('select * from public.classroom_presence')).rejects.toThrow(
				/permission denied/i
			);
		});
	});

	test('anon cannot execute the heartbeat', async () => {
		await db.asAnon(async (q) => {
			await expect(
				q('select public.classroom_presence_ping($1::uuid, true, true)', [item])
			).rejects.toThrow(/permission denied/i);
		});
	});

	test('anon cannot execute the instructor read', async () => {
		await db.asAnon(async (q) => {
			await expect(
				q('select public.classroom_presence_state($1::uuid, null)', [item])
			).rejects.toThrow(/permission denied/i);
		});
	});

	test('anon cannot execute the purge', async () => {
		await db.asAnon(async (q) => {
			await expect(q('select public.classroom_presence_purge(90)')).rejects.toThrow(
				/permission denied/i
			);
		});
	});

	test('no function in this file is executable by anon, and the sweep is not vacuous', async () => {
		const { rows } = await db.sql<{ proname: string; anon_x: boolean }>(
			`select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like '%classroom_presence%'
			 order by p.proname`
		);
		// THE CASE COUNT IS ASSERTED, so a sweep that matched nothing cannot pass.
		expect(rows.length).toBeGreaterThanOrEqual(11);
		expect(rows.filter((r) => r.anon_x)).toEqual([]);
	});
});

describe('RULE 4 -- retention', () => {
	test('90 days is the default and it lives in exactly one function', async () => {
		const { rows } = await db.sql<{ retention: string }>(
			'select public._classroom_presence_retention()::text as retention'
		);
		expect(rows[0].retention).toBe('90 days');

		// AND NOTHING ELSE IN THE FILE SPELLS IT. A second literal is what makes a
		// retention window something you change in one place and not the other.
		const literals = MIGRATION_0200.split('\n')
			.filter((line) => !line.trimStart().startsWith('--'))
			.filter((line) => /interval\s+'90\s+days'/.test(line));
		expect(literals).toHaveLength(1);
	});

	test('the purge removes rows past the window AND keeps rows inside it', async () => {
		// BOTH DIRECTIONS IN ONE CALL. "It deleted everything" must not be able to
		// pass for "it deleted the old ones", which is exactly what a test that
		// only counted the survivors would allow.
		await ageRow(ana.email, '91 days');
		await ageRow(ben.email, '89 days');

		const before = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_presence where item_id = $1',
			[item]
		);
		expect(before.rows[0].n).toBe('3');

		const result = await rpc<{ ok: boolean; deleted: number; retention_days: number }>(
			admin.id,
			'public.classroom_presence_purge($1::integer)',
			[null]
		);
		expect(result.ok).toBe(true);
		expect(result.deleted).toBe(1);
		expect(result.retention_days).toBe(90);

		const after = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_presence
			 where item_id = $1 order by student_email`,
			[item]
		);
		expect(after.rows.map((r) => r.student_email)).toEqual([
			'ben@boscotech.net',
			'cruz@boscotech.net'
		]);
	});

	test('a shorter window is available without editing the function', async () => {
		// The operator's lever: `p_days` overrides the default for one call, which
		// is how a retention decision is APPLIED before the default is changed.
		const result = await rpc<{ deleted: number; retention_days: number }>(
			admin.id,
			'public.classroom_presence_purge($1::integer)',
			[88]
		);
		expect(result.deleted).toBe(1);
		expect(result.retention_days).toBe(88);

		const after = await db.sql<{ student_email: string }>(
			'select student_email from public.classroom_presence where item_id = $1',
			[item]
		);
		expect(after.rows.map((r) => r.student_email)).toEqual(['cruz@boscotech.net']);
	});

	test('a teacher cannot purge, and neither can a student', async () => {
		// Retention is a decision about other people's children. A teacher of one
		// section has no business running it across a table that spans every class.
		await expect(
			rpc(teacher.id, 'public.classroom_presence_purge($1::integer)', [1])
		).rejects.toThrow(/Only site admins can purge classroom presence/);
		await expect(
			rpc(ana.id, 'public.classroom_presence_purge($1::integer)', [1])
		).rejects.toThrow(/Only site admins can purge classroom presence/);
	});

	test('a negative window is refused rather than deleting everything', async () => {
		await expect(
			rpc(admin.id, 'public.classroom_presence_purge($1::integer)', [-1])
		).rejects.toThrow(/A retention window cannot be negative/);
	});

	test('the heartbeat sweeps expired rows itself, so the table drains with no operator', async () => {
		// THE PURGE THAT ACTUALLY RUNS. An admin RPC nobody calls is the same thing
		// as no purge at all, which is the failure the retention rule exists to
		// prevent -- so a beat that writes also clears up to 50 expired rows.
		await ping(ana, { typed: true });
		await ageRow(ana.email, '200 days');

		const stale = await db.sql<{ n: string }>(
			`select count(*) as n from public.classroom_presence
			 where last_seen_at < now() - interval '90 days'`
		);
		expect(stale.rows[0].n).toBe('1');

		// A THROTTLED BEAT SWEEPS NOTHING, and that is the design rather than a
		// gap: the sweep rides the path that already wrote, so a student mashing
		// the heartbeat cannot drive repeated deletes. Cruz beat moments ago.
		const throttled = await ping(cruz, { typed: true });
		expect(throttled.throttled).toBe(true);
		expect(throttled.purged).toBeUndefined();
		const stillStale = await db.sql<{ n: string }>(
			`select count(*) as n from public.classroom_presence
			 where last_seen_at < now() - interval '90 days'`
		);
		expect(stillStale.rows[0].n).toBe('1');

		// Now Cruz's own row is old enough to beat again. Nothing about it is
		// EXPIRED, and the sweep is not scoped to the pinging student or even to
		// the pinging ITEM -- that is the whole point of it, since a row nobody
		// ever revisits would otherwise be permanent.
		await ageRow(cruz.email, '1 hour');
		const beat = await ping(cruz, { typed: true });
		expect(beat.throttled).toBe(false);
		expect(beat.purged).toBe(1);

		const left = await db.sql<{ n: string }>(
			`select count(*) as n from public.classroom_presence
			 where last_seen_at < now() - interval '90 days'`
		);
		expect(left.rows[0].n).toBe('0');
	});
});
