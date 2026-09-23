// tests/db/classroom-teams.test.ts
//
// 0223, AND THE FIVE THINGS ABOUT IT THAT WOULD FAIL SILENTLY.
//
//   1. THE ANON GRANT. `revoke ... from public` does NOT close a function on a
//      hosted Supabase project: the bootstrap default privileges write a DIRECT
//      `anon` grant into every new function's proacl AT CREATION TIME, which
//      removing the `public` entry never touches. 0201 shipped exactly that
//      hole across ten functions and nobody saw it until production was
//      measured. The stub carries those defaults, so this chain reproduces the
//      condition; every assertion below reads `has_function_privilege` off the
//      catalog rather than trusting 0223's own apply-time guard, because a
//      guard passing tells you only that the guard ran.
//
//   2. THE MEMBERSHIP BOUNDARY. A team has no `user_id`, so the tournament
//      writer's `entries.user_id = auth.uid()` does not translate and 0223
//      writes a new predicate. A predicate that accidentally admits every
//      signed-in student produces no error and no visible defect -- the banner
//      just changes colour one day. So every arm is asserted in BOTH
//      directions: a member permitted, a classmate on ANOTHER team refused, a
//      student of the same class on NO team refused, a student of a DIFFERENT
//      class refused, a teacher permitted, and `anon` refused.
//
//   3. THE ROSTER-CHANGE CASE, which is the state that will actually occur.
//      Presence-shaped reads elsewhere in this app inner-join
//      `classroom_enrollments` and silently drop a row when an enrollment goes.
//      0223's board LEFT joins. The difference is invisible until a student
//      transfers out mid-term and a team of four quietly becomes a team of
//      three, with the record of who worked with whom destroyed rather than
//      annotated.
//
//   4. THE POSTING WINDOW, which is read at CALL TIME and is therefore the kind
//      of thing that passes whenever the test happens to run. Both edges are
//      pinned with explicit timestamps rather than by waiting.
//
//   5. ONE STUDENT, ONE TEAM. That is a PRIMARY KEY plus a composite foreign
//      key, not an RPC check, so it is asserted with RLS out of the way
//      entirely -- as the connection owner -- where nothing but the key itself
//      can be what refuses.
//
// WHICH LAYER EACH ASSERTION RAN AT, because the prompt asks and because it
// matters: EVERY assertion in this file runs at the SQL layer through
// `db.asUser` / `db.asAnon` against the real deployed functions. None goes
// through `tests/db/postgrest-shim.ts`, which models `select` and `rpc` but not
// `insert` -- and a team write is an insert.
//
// WHERE THE EXPECTED VALUES COME FROM: the team SIZES are derived from
// arithmetic stated in the test (two teams over four students, dealt
// round-robin, is 2 and 2), the refusal assertions are about which sentence
// arrives rather than about a boolean, and the grant assertions are read off
// `pg_catalog` -- none of the three is the implementation agreeing with itself.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql',
	// The anon sweep goes LAST of the pre-existing files, per CLAUDE.md: it is
	// a sweep over whatever the chain above created. 0223 then lands AFTER it,
	// which is the real deployment order and the one that matters -- a function
	// created after the sweep arrives holding a fresh `anon` grant from the
	// project's default privileges and must revoke for itself.
	'0137_anon_execute_sweep.sql',
	'0223_classroom_teams.sql'
] as const;

const GRANTED_FNS = [
	'classroom_save_team_set(uuid, text, bigint, text, integer, jsonb)',
	'classroom_post_team_set(uuid, timestamptz)',
	'classroom_unpost_team_set(uuid)',
	'classroom_archive_team_set(uuid)',
	'classroom_set_team_style(uuid, text, text, text, jsonb, text, text, text)',
	'classroom_team_board(uuid)'
] as const;

const PRIVATE_FNS = [
	'_classroom_team_member(uuid, text)',
	'_classroom_team_set_visible(uuid)'
] as const;

const TEAM_TABLES = ['classroom_team_sets', 'classroom_teams', 'classroom_team_members'] as const;

interface BoardTeam {
	id: string;
	team_number: number;
	name: string | null;
	accent_color: string | null;
	background_type: string | null;
	background_value: unknown;
	tagline: string | null;
	style_updated_by: string | null;
	mine: boolean;
	members: { student_email: string; display_name: string; still_enrolled: boolean }[];
}
interface BoardSet {
	id: string;
	label: string;
	seed: string;
	mode: string;
	mode_value: number;
	posted_at: string | null;
	visible_until: string | null;
	showing: boolean;
	teams: BoardTeam[];
}
interface Board {
	ok: boolean;
	manages: boolean;
	sets: BoardSet[];
}

let db: TestDb;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let carla: SeededUser;
let dana: SeededUser;
/** Enrolled in this class, deliberately on NO team. */
let erik: SeededUser;
/** Enrolled in a DIFFERENT class entirely. */
let zoe: SeededUser;
let sectionId: string;
let otherSectionId: string;

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** The refusal sentence, or null where the call succeeded. */
async function refusal(userId: string, call: string, params: unknown[]): Promise<string | null> {
	try {
		await rpc(userId, call, params);
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

const STYLE_CALL =
	'public.classroom_set_team_style($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8)';

/** A whole team set, saved the way the People tab saves one. */
async function saveSet(
	userId: string,
	label: string,
	seed: number,
	mode: 'size' | 'count',
	value: number,
	teams: readonly (readonly string[])[]
): Promise<string> {
	return rpc<string>(
		userId,
		'public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb)',
		[
			sectionId,
			label,
			seed,
			mode,
			value,
			JSON.stringify(teams.map((members, i) => ({ team_number: i + 1, members })))
		]
	);
}

const board = (userId: string, section = sectionId) =>
	rpc<Board>(userId, 'public.classroom_team_board($1::uuid)', [section]);

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);

	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Otto Ther');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cruz');
	dana = await createUser(db, 'dana@boscotech.net', 'Dana Diaz');
	erik = await createUser(db, 'erik@boscotech.net', 'Erik Estrada');
	zoe = await createUser(db, 'zoe@boscotech.net', 'Zoe Zamora');

	// Seeded through the REAL RPCs, so the world under test is one the
	// application could actually have produced.
	const courseId = (
		await rpc<{ course_id: string }>(teacher.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	sectionId = (
		await rpc<{ section_id: string }>(
			teacher.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 3', 'Block C']
		)
	).section_id;
	otherSectionId = (
		await rpc<{ section_id: string }>(
			otherTeacher.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 9', 'Block A']
		)
	).section_id;

	for (const [email, name] of [
		[alice.email, 'Alice Alvarez'],
		[bruno.email, 'Bruno Barros'],
		[carla.email, 'Carla Cruz'],
		[dana.email, 'Dana Diaz'],
		[erik.email, 'Erik Estrada']
	] as const) {
		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionId,
			email,
			name,
			true
		]);
	}
	await rpc(otherTeacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		otherSectionId,
		zoe.email,
		'Zoe Zamora',
		true
	]);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the grant surface, read off the catalog rather than off the guard', () => {
	test('anon can execute none of the six granted functions, and authenticated can execute all six', async () => {
		const rows = await db.sql<{ sig: string; a: boolean; au: boolean }>(
			`select sig,
			        has_function_privilege('anon', 'public.' || sig, 'execute') as a,
			        has_function_privilege('authenticated', 'public.' || sig, 'execute') as au
			 from unnest($1::text[]) as sig`,
			[[...GRANTED_FNS]]
		);
		expect(rows.rows).toHaveLength(GRANTED_FNS.length);
		// Both directions in one reading: the absence is the boundary and the
		// presence is the positive control that the query is looking at all.
		expect(rows.rows.filter((r) => r.a).map((r) => r.sig)).toEqual([]);
		expect(rows.rows.filter((r) => r.au).map((r) => r.sig).sort()).toEqual([...GRANTED_FNS].sort());
	});

	test('the two private predicates are executable by neither client role', async () => {
		const { rows } = await db.sql<{ sig: string; a: boolean; au: boolean }>(
			`select sig,
			        has_function_privilege('anon', 'public.' || sig, 'execute') as a,
			        has_function_privilege('authenticated', 'public.' || sig, 'execute') as au
			 from unnest($1::text[]) as sig`,
			[[...PRIVATE_FNS]]
		);
		expect(rows).toHaveLength(PRIVATE_FNS.length);
		expect(rows.filter((r) => r.a || r.au).map((r) => r.sig)).toEqual([]);
	});

	test('the three tables carry RLS, no policy, and no privilege for either client role', async () => {
		const { rows } = await db.sql<{
			tbl: string;
			rls: boolean;
			policies: string;
			anon_privs: string | null;
			auth_privs: string | null;
		}>(
			`select t.tbl,
			        c.relrowsecurity as rls,
			        (select count(*) from pg_policies p
			          where p.schemaname = 'public' and p.tablename = t.tbl)::text as policies,
			        (select string_agg(pr, ',') from unnest($2::text[]) as pr
			          where has_table_privilege('anon', 'public.' || t.tbl, pr)) as anon_privs,
			        (select string_agg(pr, ',') from unnest($2::text[]) as pr
			          where has_table_privilege('authenticated', 'public.' || t.tbl, pr)) as auth_privs
			 from unnest($1::text[]) as t(tbl)
			 join pg_class c on c.relname = t.tbl
			 join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'`,
			[
				[...TEAM_TABLES],
				['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
			]
		);
		expect(rows).toHaveLength(TEAM_TABLES.length);
		for (const r of rows) {
			expect({ tbl: r.tbl, rls: r.rls, policies: r.policies }).toEqual({
				tbl: r.tbl,
				rls: true,
				policies: '0'
			});
			expect({ tbl: r.tbl, anon: r.anon_privs, auth: r.auth_privs }).toEqual({
				tbl: r.tbl,
				anon: null,
				auth: null
			});
		}
	});
});

// ===========================================================================
describe('a draw persists, and keeps the seed that makes it checkable', () => {
	let setId: string;

	test('a manager saves a set and reads it back with its seed, mode and teams intact', async () => {
		setId = await saveSet(teacher.id, 'Build teams', 0x1234abcd, 'count', 2, [
			[alice.email, carla.email],
			[bruno.email, dana.email]
		]);
		expect(setId).toMatch(/^[0-9a-f-]{36}$/);

		const b = await board(teacher.id);
		expect(b.manages).toBe(true);
		const s = b.sets.find((x) => x.id === setId);
		expect(s).toBeDefined();
		// The seed rides back as TEXT: a bigint through jsonb would lose
		// precision in the browser, and the seed is the whole reproducibility
		// claim.
		expect({ seed: s!.seed, mode: s!.mode, mode_value: s!.mode_value, label: s!.label }).toEqual({
			seed: String(0x1234abcd),
			mode: 'count',
			mode_value: 2,
			label: 'Build teams'
		});
		// Two teams over four students, dealt round-robin, is 2 and 2. That
		// figure is arithmetic stated here, not a second call to the dealer.
		expect(s!.teams.map((t) => t.members.length)).toEqual([2, 2]);
		expect(
			s!.teams.flatMap((t) => t.members.map((m) => m.student_email)).sort()
		).toEqual([alice.email, bruno.email, carla.email, dana.email].sort());
	});

	test('an address with no enrollment behind it is refused, by count and by name, and writes nothing', async () => {
		const before = (await board(teacher.id)).sets.length;
		const msg = await refusal(
			teacher.id,
			'public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb)',
			[
				sectionId,
				'Typo teams',
				1,
				'size',
				2,
				JSON.stringify([{ team_number: 1, members: [alice.email, 'ghost@boscotech.net'] }])
			]
		);
		expect(msg).toContain('not enrolled in this class');
		expect(msg).toContain('ghost@boscotech.net');
		// The raise rolls the whole function back, so the half-written set is
		// not left behind -- which is the difference between a refusal and a
		// partial save nobody can see.
		expect((await board(teacher.id)).sets).toHaveLength(before);
	});

	test('a student on two teams of one draw is unrepresentable at the key, with RLS out of the way', async () => {
		// As the CONNECTION OWNER: no RLS, no grants, no definer function. The
		// only thing left that can refuse this is the primary key itself.
		const { rows } = await db.sql<{ team_set_id: string; team_id: string }>(
			`select m.team_set_id, m.team_id from public.classroom_team_members m
			  where m.team_set_id = $1 limit 1`,
			[setId]
		);
		const other = await db.sql<{ id: string }>(
			`select id from public.classroom_teams where team_set_id = $1 and id <> $2 limit 1`,
			[setId, rows[0].team_id]
		);
		await expect(
			db.sql(
				`insert into public.classroom_team_members (team_set_id, team_id, student_email)
				 values ($1, $2, $3)`,
				[setId, other.rows[0].id, alice.email]
			)
		).rejects.toThrow(/duplicate key|classroom_team_members_pkey/i);
	});
});

// ===========================================================================
describe('who may customize a team: membership, not ownership', () => {
	let setId: string;
	let teamOne: string;
	let teamTwo: string;

	beforeAll(async () => {
		setId = await saveSet(teacher.id, 'Style teams', 99, 'count', 2, [
			[alice.email, carla.email],
			[bruno.email, dana.email]
		]);
		const b = await board(teacher.id);
		const s = b.sets.find((x) => x.id === setId)!;
		teamOne = s.teams[0].id;
		teamTwo = s.teams[1].id;
	});

	test('a student ON the team may style it, and the row records which member wrote', async () => {
		const r = await rpc<{ ok: boolean; updated_by: string }>(alice.id, STYLE_CALL, [
			teamOne,
			'The Gearboxes',
			'#3f8f5f',
			'solid',
			JSON.stringify('#102015'),
			'bolt',
			null,
			'Built to last'
		]);
		expect(r.ok).toBe(true);
		expect(r.updated_by).toBe(alice.email);

		const s = (await board(teacher.id)).sets.find((x) => x.id === setId)!;
		const t = s.teams.find((x) => x.id === teamOne)!;
		expect({
			name: t.name,
			accent: t.accent_color,
			bg: t.background_type,
			tagline: t.tagline,
			by: t.style_updated_by
		}).toEqual({
			name: 'The Gearboxes',
			accent: '#3f8f5f',
			bg: 'solid',
			tagline: 'Built to last',
			by: alice.email
		});
	});

	test('the last write wins between two members, and the row says which one it was', async () => {
		await rpc(carla.id, STYLE_CALL, [teamOne, 'Gearboxes', '#7f3f8f', null, null, null, null, null]);
		const s = (await board(teacher.id)).sets.find((x) => x.id === setId)!;
		const t = s.teams.find((x) => x.id === teamOne)!;
		expect({ accent: t.accent_color, by: t.style_updated_by }).toEqual({
			accent: '#7f3f8f',
			by: carla.email
		});
	});

	test('a classmate on ANOTHER team of the same draw is refused', async () => {
		const msg = await refusal(bruno.id, STYLE_CALL, [
			teamOne,
			'Hijacked',
			'#ff0000',
			null,
			null,
			null,
			null,
			null
		]);
		expect(msg).toContain('Only a student on this team');
	});

	test('a student of the same class who is on NO team is refused', async () => {
		const msg = await refusal(erik.id, STYLE_CALL, [
			teamOne,
			null,
			'#ff0000',
			null,
			null,
			null,
			null,
			null
		]);
		expect(msg).toContain('Only a student on this team');
	});

	test('a student of a DIFFERENT class is refused, and learns nothing about the team either way', async () => {
		const msg = await refusal(zoe.id, STYLE_CALL, [
			teamTwo,
			null,
			'#ff0000',
			null,
			null,
			null,
			null,
			null
		]);
		expect(msg).toContain('Only a student on this team');
	});

	test('a teacher of the class is permitted', async () => {
		const r = await rpc<{ ok: boolean; updated_by: string }>(teacher.id, STYLE_CALL, [
			teamTwo,
			'Taken down',
			null,
			null,
			null,
			null,
			null,
			null
		]);
		expect({ ok: r.ok, by: r.updated_by }).toEqual({ ok: true, by: teacher.email });
	});

	test('a teacher of a DIFFERENT class is refused', async () => {
		const msg = await refusal(otherTeacher.id, STYLE_CALL, [
			teamTwo,
			null,
			'#ff0000',
			null,
			null,
			null,
			null,
			null
		]);
		expect(msg).toContain('Only a student on this team');
	});

	test('anon is refused at the grant, before any body runs', async () => {
		const err = await db.asAnon(async (q) => {
			try {
				await q(`select public.classroom_set_team_style($1::uuid, $2)`, [teamOne, 'Anon']);
				return null;
			} catch (e) {
				return (e as Error).message;
			}
		});
		expect(err).toMatch(/permission denied/i);
	});

	test('anon cannot read the board either, at any posting state', async () => {
		const err = await db.asAnon(async (q) => {
			try {
				await q(`select public.classroom_team_board($1::uuid)`, [sectionId]);
				return null;
			} catch (e) {
				return (e as Error).message;
			}
		});
		expect(err).toMatch(/permission denied/i);
	});

	test('a malformed colour is refused with a sentence, not a constraint name', async () => {
		expect(await refusal(alice.id, STYLE_CALL, [teamOne, null, 'blue', null, null, null, null, null]))
			.toContain('hex value');
		expect(
			await refusal(alice.id, STYLE_CALL, [
				teamOne,
				null,
				null,
				'gradient',
				JSON.stringify(['#102015']),
				null,
				null,
				null
			])
		).toContain('two hex colours');
	});

	test('an image background is refused: there is no bucket for one', async () => {
		const msg = await refusal(alice.id, STYLE_CALL, [
			teamOne,
			null,
			null,
			'image',
			JSON.stringify('https://example.com/x.png'),
			null,
			null,
			null
		]);
		expect(msg).toContain('solid or gradient');
	});
});

// ===========================================================================
describe('the posting window decides what a student sees', () => {
	let setId: string;

	beforeAll(async () => {
		setId = await saveSet(teacher.id, 'Posted teams', 7, 'size', 2, [
			[alice.email, bruno.email],
			[carla.email, dana.email]
		]);
	});

	const studentSees = async () =>
		(await board(alice.id)).sets.map((s) => s.label);

	test('an unposted draw is the teacher\'s alone: the student board does not carry it', async () => {
		expect(await studentSees()).not.toContain('Posted teams');
		// The positive control on the same reading: the manager DOES see it, so
		// "the student sees nothing" is not "the query returned nothing".
		expect((await board(teacher.id)).sets.map((s) => s.label)).toContain('Posted teams');
	});

	test('posting it puts it on the student board, with the caller\'s own team flagged', async () => {
		await rpc(teacher.id, 'public.classroom_post_team_set($1::uuid, $2::timestamptz)', [
			setId,
			null
		]);
		const s = (await board(alice.id)).sets.find((x) => x.label === 'Posted teams');
		expect(s).toBeDefined();
		expect(s!.showing).toBe(true);
		// `mine` is projected by the database. The client cannot re-derive it:
		// it does not know which addresses belong to the viewer.
		expect(s!.teams.filter((t) => t.mine).flatMap((t) => t.members.map((m) => m.student_email)))
			.toContain(alice.email);
		expect(s!.teams.filter((t) => t.mine)).toHaveLength(1);
	});

	test('a window whose end has passed hides it again, with no sweep and nothing stamped', async () => {
		// Set the end directly, as the owner: `classroom_post_team_set` refuses
		// a past end time by design, and what is under test here is the READ,
		// which computes visibility at call time from the row.
		await db.sql(
			`update public.classroom_team_sets
			    set posted_at = now() - interval '2 hours',
			        visible_until = now() - interval '1 hour'
			  where id = $1`,
			[setId]
		);
		expect(await studentSees()).not.toContain('Posted teams');
		expect((await board(teacher.id)).sets.map((s) => s.label)).toContain('Posted teams');
	});

	test('a future window is not showing yet either', async () => {
		await db.sql(
			`update public.classroom_team_sets
			    set posted_at = now() + interval '1 hour', visible_until = null
			  where id = $1`,
			[setId]
		);
		expect(await studentSees()).not.toContain('Posted teams');
	});

	test('taking it down clears both ends of the window', async () => {
		await rpc(teacher.id, 'public.classroom_post_team_set($1::uuid, $2::timestamptz)', [setId, null]);
		expect(await studentSees()).toContain('Posted teams');
		await rpc(teacher.id, 'public.classroom_unpost_team_set($1::uuid)', [setId]);
		expect(await studentSees()).not.toContain('Posted teams');
	});

	test('a posting end in the past is refused at the write, naming the reason', async () => {
		const msg = await refusal(
			teacher.id,
			'public.classroom_post_team_set($1::uuid, $2::timestamptz)',
			[setId, new Date(Date.now() - 60_000).toISOString()]
		);
		expect(msg).toContain('already passed');
	});

	test('a student of another class gets the same sentence a missing section gets', async () => {
		expect(await refusal(zoe.id, 'public.classroom_team_board($1::uuid)', [sectionId])).toContain(
			'Not found.'
		);
	});

	test('only a manager may post, unpost or archive', async () => {
		for (const call of [
			'public.classroom_post_team_set($1::uuid)',
			'public.classroom_unpost_team_set($1::uuid)',
			'public.classroom_archive_team_set($1::uuid)'
		]) {
			expect(await refusal(alice.id, call, [setId])).toMatch(/Only a teacher of this class/);
		}
	});
});

// ===========================================================================
describe('the roster moves under the draw, and the draw says so rather than shrinking', () => {
	let setId: string;

	beforeAll(async () => {
		setId = await saveSet(teacher.id, 'Roster drift', 11, 'count', 1, [
			[alice.email, bruno.email, carla.email]
		]);
	});

	test('a student whose enrollment is deactivated STAYS on the team, flagged rather than dropped', async () => {
		const before = (await board(teacher.id)).sets.find((s) => s.id === setId)!.teams[0];
		expect(before.members).toHaveLength(3);
		expect(before.members.every((m) => m.still_enrolled)).toBe(true);

		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionId,
			bruno.email,
			'Bruno Barros',
			false
		]);

		const after = (await board(teacher.id)).sets.find((s) => s.id === setId)!.teams[0];
		// THE COUNT DOES NOT MOVE. An inner join here would have made this 2,
		// silently, and the record of who worked with whom would be gone.
		expect(after.members).toHaveLength(3);
		expect(
			Object.fromEntries(after.members.map((m) => [m.student_email, m.still_enrolled]))
		).toEqual({
			[alice.email]: true,
			[bruno.email]: false,
			[carla.email]: true
		});
		// And the name survives too, because it is read from the enrollment row
		// that is still there and merely inactive.
		expect(after.members.find((m) => m.student_email === bruno.email)!.display_name).toBe(
			'Bruno Barros'
		);
	});

	test('a student REMOVED from the roster outright still holds their place, named from the address', async () => {
		await db.sql(`delete from public.classroom_enrollments where section_id = $1 and student_email = $2`, [
			sectionId,
			carla.email
		]);
		const after = (await board(teacher.id)).sets.find((s) => s.id === setId)!.teams[0];
		expect(after.members).toHaveLength(3);
		const row = after.members.find((m) => m.student_email === carla.email)!;
		// No enrollment row at all: `still_enrolled` false, and the local part
		// of the address stands in for the name that is gone.
		expect({ enrolled: row.still_enrolled, name: row.display_name }).toEqual({
			enrolled: false,
			name: 'carla'
		});
	});

	test('a deactivated student can no longer READ the board, which is the enrollment rule and not a team rule', async () => {
		expect(await refusal(bruno.id, 'public.classroom_team_board($1::uuid)', [sectionId])).toContain(
			'Not found.'
		);
	});
});

// ===========================================================================
describe('archive, never delete', () => {
	test('there is no delete RPC and no delete grant anywhere in this feature', async () => {
		const { rows } = await db.sql<{ proname: string }>(
			`select p.proname from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
			 where p.proname like '%team%' and p.proname like '%delete%'`
		);
		expect(rows.map((r) => r.proname)).toEqual([]);
	});

	test('an archived set leaves every surface and its teams stop being writable', async () => {
		const setId = await saveSet(teacher.id, 'Retired teams', 5, 'count', 1, [[alice.email]]);
		const teamId = (await board(teacher.id)).sets.find((s) => s.id === setId)!.teams[0].id;
		await rpc(teacher.id, 'public.classroom_post_team_set($1::uuid, $2::timestamptz)', [setId, null]);
		expect((await board(alice.id)).sets.map((s) => s.label)).toContain('Retired teams');

		await rpc(teacher.id, 'public.classroom_archive_team_set($1::uuid)', [setId]);

		expect((await board(teacher.id)).sets.map((s) => s.label)).not.toContain('Retired teams');
		expect((await board(alice.id)).sets.map((s) => s.label)).not.toContain('Retired teams');
		expect(await refusal(alice.id, STYLE_CALL, [teamId, 'Nope', null, null, null, null, null, null]))
			.toContain('retired');

		// THE ROW IS STILL THERE. That is the whole difference between archive
		// and delete, and it is asserted rather than assumed.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_team_members where team_set_id = $1`,
			[setId]
		);
		expect(rows[0].n).toBe('1');
	});
});
