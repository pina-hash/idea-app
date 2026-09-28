// tests/db/classroom-class-theme.test.ts
//
// 0225 PART B: EACH COURSE GETS A THEME, AND THE CLASS VOTES IT INTO BEING
// (decision 45). What would fail SILENTLY, and so is asserted here:
//
//   1. WHO IS THE ELECTORATE. A voter predicate that admits one person too many
//      produces no error and no visible defect: the theme simply moves. So each
//      arm is asserted in both directions, through the private predicate as the
//      owner AND through the real vote as the person: an active enrollment in an
//      active section votes; an inactive enrollment, an enrollment only in an
//      archived section and an enrollment in another course do not; a teacher
//      of the course, an admin and a teacher who is also on the roster are
//      refused with the sentence that says why.
//
//   2. ONLY TALLIES LEAVE THE DATABASE. The tally is swept, as text, for any
//      address at all, with the caller's own choice present as the positive
//      control; the paint read OMITS a section the caller cannot see, with a
//      section they can see present beside it. Both are mutation-proved in the
//      permissive direction (the history entry carries the runs).
//
//   3. THE WINNER RULE, WITH PINNED TIMES. A tie goes to the option whose latest
//      counted vote is EARLIEST, then option id; it is asserted on rows written
//      as the owner with explicit `voted_at` values, and again through the real
//      RPC as the no-flicker sequence decision 45 asks for.
//
//   4. A RESET ARCHIVES. Older votes stop counting and stay in the table, and a
//      re-vote after the reset counts again.
//
//   5. THE APPLY OVER SEEDED DATA, THE GRANTS OFF THE CATALOG, ONE OVERLOAD PER
//      FUNCTION, AND A SECOND PASTE THAT CHANGES NOTHING.
//
// The chain is booted SHORT of 0225; the courses, sections and roster are
// written through the real 0082/0083 RPCs; 0225 is then applied over the top.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import { createClassThemeTransports } from '../../src/lib/classroom/class-theme';
import { load as classroomLayoutLoad } from '../../src/routes/classroom/+layout.server';

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
	'0137_anon_execute_sweep.sql',
	'0223_classroom_teams.sql'
] as const;

const SQL_0225 = readFileSync(
	fileURLToPath(
		new URL('../../supabase/migrations/0225_classroom_team_edits_and_class_themes.sql', import.meta.url)
	),
	'utf8'
);

const PUBLIC_FNS = [
	'classroom_theme_vote(uuid, text, text)',
	'classroom_theme_tally(uuid)',
	'classroom_theme_set_voting(uuid, boolean)',
	'classroom_theme_reset(uuid)',
	'classroom_set_section_accent(uuid, text)',
	'classroom_class_themes(uuid[])',
	'classroom_move_team_member(uuid, text, uuid)'
] as const;
const PRIVATE_FNS = [
	'_classroom_theme_voter(uuid, text)',
	'_classroom_theme_manager(uuid)',
	'_classroom_theme_counted_votes(uuid)',
	'_classroom_theme_winners(uuid)'
] as const;
const TABLES = ['classroom_theme_votes', 'classroom_theme_settings'] as const;

const VOTE = 'public.classroom_theme_vote($1::uuid, $2, $3)';
const TALLY = 'public.classroom_theme_tally($1::uuid)';
const THEMES = 'public.classroom_class_themes($1::uuid[])';
const ACCENT = 'public.classroom_set_section_accent($1::uuid, $2)';

interface Tally {
	ok: boolean;
	course_id: string;
	voting_open: boolean;
	reset_at: string | null;
	manages: boolean;
	can_vote: boolean;
	voters: number;
	counts: { feature: string; option: string; votes: number }[];
	winners: Record<string, string>;
	mine: Record<string, string>;
}
interface SectionTheme {
	section_id: string;
	course_id: string;
	accent: string | null;
	winners: Record<string, string>;
}

let db: TestDb;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let admin: SeededUser;
let sam: SeededUser;
let val: SeededUser;
/** Enrolled in A1, then deactivated. */
let ina: SeededUser;
/** Actively enrolled ONLY in A2, which is archived. */
let arc: SeededUser;
/** Actively enrolled in course B only. */
let bob: SeededUser;
/** Twelve-feature cap probe, a fresh voter so nothing else they did interferes. */
let cap: SeededUser;
let courseA: string;
let courseB: string;
let sectionA1: string;
let sectionA2: string;
let sectionB1: string;

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

async function refusal(userId: string, call: string, params: unknown[]): Promise<string | null> {
	try {
		await rpc(userId, call, params);
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

async function enroll(section: string, u: SeededUser, name: string, active = true, as = teacher) {
	await rpc(as.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [section, u.email, name, active]);
}

const tally = (u: SeededUser, course = courseA) => rpc<Tally>(u.id, TALLY, [course]);

/** Asked as the owner, about a THIRD party: the email-scoped predicate. */
async function isVoter(course: string, email: string): Promise<boolean> {
	const { rows } = await db.sql<{ v: boolean }>(
		`select public._classroom_theme_voter($1::uuid, $2) as v`,
		[course, email]
	);
	return rows[0].v;
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);

	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Otto Ther');
	// The pinned owner in 0067 is an admin with no grant row needed.
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	sam = await createUser(db, 'sam@boscotech.net', 'Sam Soto');
	val = await createUser(db, 'val@boscotech.net', 'Val Vega');
	ina = await createUser(db, 'ina@boscotech.net', 'Ina Iba');
	arc = await createUser(db, 'arc@boscotech.net', 'Arc Arce');
	bob = await createUser(db, 'bob@boscotech.net', 'Bob Baca');
	cap = await createUser(db, 'cap@boscotech.net', 'Cap Cruz');

	courseA = (
		await rpc<{ course_id: string }>(teacher.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	courseB = (
		await rpc<{ course_id: string }>(otherTeacher.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA209H',
			'Engineering I Honors'
		])
	).course_id;
	const section = async (as: SeededUser, course: string, label: string) =>
		(
			await rpc<{ section_id: string }>(as.id, 'public.classroom_upsert_section($1::uuid, $2, $3)', [
				course,
				label,
				null
			])
		).section_id;
	sectionA1 = await section(teacher, courseA, 'Period 1');
	sectionA2 = await section(teacher, courseA, 'Period 2');
	sectionB1 = await section(otherTeacher, courseB, 'Period 4');

	await enroll(sectionA1, sam, 'Sam Soto');
	await enroll(sectionA1, val, 'Val Vega');
	await enroll(sectionA1, cap, 'Cap Cruz');
	await enroll(sectionA1, ina, 'Ina Iba');
	await enroll(sectionA1, ina, 'Ina Iba', false);
	await enroll(sectionA2, arc, 'Arc Arce');
	// A teacher on their own roster, the way a roster import sweeps them in.
	await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		sectionA1,
		teacher.email,
		'Tee Cher',
		true
	]);
	await enroll(sectionB1, bob, 'Bob Baca', true, otherTeacher);
	await rpc(teacher.id, 'public.classroom_set_section_active($1::uuid, $2)', [sectionA2, false]);

	// THE APPLY, over the seeded roster.
	await db.sql(SQL_0225);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the grant surface, read off the catalog', () => {
	test('anon executes none of the new functions; authenticated executes the public ones and none of the private ones', async () => {
		const { rows } = await db.sql<{ sig: string; a: boolean; au: boolean }>(
			`select sig,
			        has_function_privilege('anon', 'public.' || sig, 'execute') as a,
			        has_function_privilege('authenticated', 'public.' || sig, 'execute') as au
			   from unnest($1::text[]) as sig`,
			[[...PUBLIC_FNS, ...PRIVATE_FNS]]
		);
		expect(rows).toHaveLength(PUBLIC_FNS.length + PRIVATE_FNS.length);
		expect(rows.filter((r) => r.a).map((r) => r.sig)).toEqual([]);
		expect(rows.filter((r) => r.au).map((r) => r.sig).sort()).toEqual([...PUBLIC_FNS].sort());
	});

	test('both tables carry RLS, no policy, and no privilege of any kind for either client role', async () => {
		const privs = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
		const { rows } = await db.sql<{ tbl: string; rls: boolean; policies: string; held: string | null }>(
			`select t.tbl, c.relrowsecurity as rls,
			        (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tbl)::text as policies,
			        (select string_agg(r || ':' || pr, ',') from unnest(array['anon','authenticated']) as r,
			                unnest($2::text[]) as pr
			          where has_table_privilege(r, 'public.' || t.tbl, pr)) as held
			   from unnest($1::text[]) as t(tbl)
			   join pg_class c on c.relname = t.tbl
			   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'`,
			[[...TABLES], privs]
		);
		expect(rows).toHaveLength(TABLES.length);
		for (const r of rows) expect({ tbl: r.tbl, rls: r.rls, policies: r.policies, held: r.held }).toEqual({
			tbl: r.tbl,
			rls: true,
			policies: '0',
			held: null
		});
		// POSITIVE CONTROL: the privilege query reads grants at all. 0082 grants
		// authenticated SELECT on classroom_sections.
		const control = await db.sql<{ ok: boolean }>(
			`select has_table_privilege('authenticated', 'public.classroom_sections', 'select') as ok`
		);
		expect(control.rows[0].ok).toBe(true);
	});

	test('exactly one pg_proc row per new function, and still one board', async () => {
		const names = [...PUBLIC_FNS, ...PRIVATE_FNS].map((s) => s.split('(')[0]).concat('classroom_team_board');
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*)::text as n from pg_proc p
			   join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
			  where p.proname = any($1::text[]) group by p.proname`,
			[names]
		);
		expect(rows).toHaveLength(names.length);
		expect(rows.filter((r) => r.n !== '1')).toEqual([]);
	});

	test('anon is refused every new public function at the grant', async () => {
		const calls: [string, unknown[]][] = [
			[VOTE, [courseA, 'palette', 'navy']],
			[TALLY, [courseA]],
			[THEMES, [[sectionA1]]],
			[ACCENT, [sectionA1, 'teal']],
			['public.classroom_theme_set_voting($1::uuid, $2)', [courseA, false]],
			['public.classroom_theme_reset($1::uuid)', [courseA]]
		];
		for (const [call, params] of calls) {
			const err = await db.asAnon(async (q) => {
				try {
					await q(`select ${call}`, params);
					return null;
				} catch (e) {
					return (e as Error).message;
				}
			});
			expect(err, call).toMatch(/permission denied/i);
		}
	});
});

// ===========================================================================
describe('who votes: an active enrollment in an active section of the course', () => {
	test('the predicate, asked about third parties as the owner, in both directions', async () => {
		expect(await isVoter(courseA, sam.email)).toBe(true);
		expect(await isVoter(courseA, '  SAM@BoscoTech.net ')).toBe(true);
		expect(await isVoter(courseA, ina.email)).toBe(false); // inactive enrollment
		expect(await isVoter(courseA, arc.email)).toBe(false); // only in an archived section
		expect(await isVoter(courseA, bob.email)).toBe(false); // another course
		expect(await isVoter(courseB, bob.email)).toBe(true); // ...where he does vote
		expect(await isVoter(courseA, '')).toBe(false); // no session
	});

	test('a voter votes and is answered with the winners', async () => {
		const r = await rpc<{ ok: boolean; option: string; winners: Record<string, string> }>(sam.id, VOTE, [
			courseA,
			'palette',
			'navy'
		]);
		expect(r).toEqual({ ok: true, option: 'navy', winners: { palette: 'navy' } });
	});

	test('everybody who is not a voter gets the sentence a missing course gets', async () => {
		for (const u of [ina, arc, bob]) {
			expect(await refusal(u.id, VOTE, [courseA, 'palette', 'red']), u.email).toBe('Not found.');
		}
		expect(await refusal(sam.id, VOTE, ['00000000-0000-4000-8000-00000000c0de', 'palette', 'red'])).toBe(
			'Not found.'
		);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_theme_votes where student_email = any($1::text[])`,
			[[ina.email, arc.email, bob.email]]
		);
		expect(rows[0].n).toBe('0');
	});

	test('a teacher of the course is refused, even one who is on their own roster', async () => {
		expect(await refusal(teacher.id, VOTE, [courseA, 'palette', 'red'])).toBe(
			"Teachers set the class accent; the theme is the class's vote."
		);
	});

	test('an admin manages every course that has a section, so an admin is refused too', async () => {
		expect(await refusal(admin.id, VOTE, [courseA, 'palette', 'red'])).toBe(
			"Teachers set the class accent; the theme is the class's vote."
		);
		// ...and reads the tally through the same rule, as a manager.
		const t = await tally(admin);
		expect({ manages: t.manages, can_vote: t.can_vote }).toEqual({ manages: true, can_vote: false });
	});

	test('a feature or option outside the slug shape is refused in words; case is folded', async () => {
		expect(await refusal(sam.id, VOTE, [courseA, 'pal ette', 'navy'])).toBe(
			"That is not one of the class theme's features."
		);
		expect(await refusal(sam.id, VOTE, [courseA, 'palette', 'navy!'])).toBe(
			'That is not one of the choices for this part of the theme.'
		);
		expect(await refusal(sam.id, VOTE, [courseA, 'x'.repeat(41), 'navy'])).toBe(
			"That is not one of the class theme's features."
		);
		const r = await rpc<{ option: string }>(sam.id, VOTE, [courseA, ' PALETTE ', 'NAVY']);
		expect(r.option).toBe('navy');
	});
});

// ===========================================================================
describe('the tally is counts, never voters', () => {
	test('a voter reads counts, the winners and their own choice; a teacher reads the same without a choice', async () => {
		await rpc(val.id, VOTE, [courseA, 'badge', 'gear']);
		const s = await tally(sam);
		expect(s).toMatchObject({ ok: true, course_id: courseA, voting_open: true, manages: false, can_vote: true });
		expect(s.mine).toEqual({ palette: 'navy' });
		expect(s.voters).toBe(2);
		expect(s.counts).toEqual([
			{ feature: 'badge', option: 'gear', votes: 1 },
			{ feature: 'palette', option: 'navy', votes: 1 }
		]);
		const t = await tally(teacher);
		expect({ manages: t.manages, can_vote: t.can_vote, mine: t.mine }).toEqual({
			manages: true,
			can_vote: false,
			mine: {}
		});
		expect(t.counts).toEqual(s.counts);
	});

	test('NO ADDRESS ANYWHERE IN IT, for a voter or a teacher, with the caller\'s own choice present', async () => {
		for (const u of [sam, val, teacher]) {
			const text = JSON.stringify(await tally(u));
			expect(text, u.email).not.toContain('@');
		}
		// POSITIVE CONTROLS: the sweep is over a payload that DOES carry the
		// caller's own vote, and the table under it DOES carry the addresses.
		expect((await tally(sam)).mine.palette).toBe('navy');
		const raw = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_theme_votes where course_id = $1 order by 1`,
			[courseA]
		);
		expect(raw.rows.map((r) => r.student_email)).toEqual([sam.email, val.email]);
	});

	test('a student outside the course, and a teacher of another course, get Not found', async () => {
		expect(await refusal(bob.id, TALLY, [courseA])).toBe('Not found.');
		expect(await refusal(otherTeacher.id, TALLY, [courseA])).toBe('Not found.');
		expect(await refusal(ina.id, TALLY, [courseA])).toBe('Not found.');
	});
});

// ===========================================================================
describe('closed, withdrawn and reset', () => {
	test('a closed vote is a graceful refusal, withdrawals included, and only a manager can close it', async () => {
		expect(await refusal(sam.id, 'public.classroom_theme_set_voting($1::uuid, $2)', [courseA, false])).toBe(
			'Not found.'
		);
		expect(
			await refusal(otherTeacher.id, 'public.classroom_theme_set_voting($1::uuid, $2)', [courseA, false])
		).toBe('Not found.');

		const closed = await rpc<{ ok: boolean; voting_open: boolean }>(
			teacher.id,
			'public.classroom_theme_set_voting($1::uuid, $2)',
			[courseA, false]
		);
		expect(closed).toMatchObject({ ok: true, voting_open: false });
		expect(await rpc(sam.id, VOTE, [courseA, 'palette', 'red'])).toEqual({ ok: false, reason: 'closed' });
		expect(await rpc(sam.id, VOTE, [courseA, 'palette', null])).toEqual({ ok: false, reason: 'closed' });
		expect((await tally(sam)).mine).toEqual({ palette: 'navy' });
		expect((await tally(sam)).voting_open).toBe(false);

		await rpc(teacher.id, 'public.classroom_theme_set_voting($1::uuid, $2)', [courseA, true]);
		expect(await rpc(sam.id, VOTE, [courseA, 'palette', 'red'])).toMatchObject({ ok: true, option: 'red' });
	});

	test('a blank option withdraws the caller\'s own vote on that feature, and nobody else\'s', async () => {
		await rpc(sam.id, VOTE, [courseA, 'banner', 'stripes']);
		expect(await rpc(sam.id, VOTE, [courseA, 'banner', '   '])).toEqual({ ok: true, withdrawn: true });
		expect((await tally(sam)).mine.banner).toBeUndefined();
		await rpc(sam.id, VOTE, [courseA, 'banner', 'stripes']);
		expect(await rpc(sam.id, VOTE, [courseA, 'banner', null])).toEqual({ ok: true, withdrawn: true });
		// Val's vote on another feature is untouched by Sam's withdrawals.
		expect((await tally(val)).mine).toEqual({ badge: 'gear' });
	});

	test('a reset stops older votes counting and deletes nothing; a re-vote counts again', async () => {
		const before = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_theme_votes where course_id = $1`,
			[courseA]
		);
		const r = await rpc<{ ok: boolean; reset_at: string; voting_open: boolean }>(
			teacher.id,
			'public.classroom_theme_reset($1::uuid)',
			[courseA]
		);
		expect(r.ok).toBe(true);
		expect(r.reset_at).not.toBeNull();

		const t = await tally(sam);
		expect({ counts: t.counts, winners: t.winners, mine: t.mine, voters: t.voters }).toEqual({
			counts: [],
			winners: {},
			mine: {},
			voters: 0
		});
		// ARCHIVE, NEVER DELETE: every row is still there.
		const after = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_theme_votes where course_id = $1`,
			[courseA]
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);

		// Sam re-votes the SAME option he held before the reset: it counts again.
		await rpc(sam.id, VOTE, [courseA, 'palette', 'red']);
		const again = await tally(val);
		expect(again.counts).toEqual([{ feature: 'palette', option: 'red', votes: 1 }]);
		expect(again.mine).toEqual({}); // Val has not re-voted
		expect(again.voters).toBe(1);
		expect(await refusal(sam.id, 'public.classroom_theme_reset($1::uuid)', [courseA])).toBe('Not found.');
	});
});

// ===========================================================================
describe('the winner rule, with pinned times', () => {
	// Rows written as the OWNER with explicit `voted_at`, so the tie rule is
	// tested at instants the test chose rather than at whatever now() gave. The
	// addresses are not users; the vote table is email-keyed.
	const T = (min: number) => new Date(Date.UTC(2030, 0, 1, 12, min)).toISOString();
	async function pin(feature: string, votes: [string, string, number][]) {
		for (const [who, option, min] of votes) {
			await db.sql(
				`insert into public.classroom_theme_votes (course_id, feature, student_email, option_id, voted_at)
				 values ($1, $2, $3, $4, $5::timestamptz)`,
				[courseA, feature, `${who}@pinned.net`, option, T(min)]
			);
		}
	}
	const winners = async () => (await tally(teacher)).winners;

	test('most votes wins outright', async () => {
		await pin('w-most', [
			['a', 'zeta', 1],
			['b', 'zeta', 2],
			['c', 'alpha', 3]
		]);
		expect((await winners())['w-most']).toBe('zeta');
	});

	test('a tie goes to the option whose latest counted vote is EARLIEST', async () => {
		await pin('w-tie', [
			['a', 'red', 5],
			['b', 'red', 6],
			['c', 'navy', 1],
			['d', 'navy', 9]
		]);
		// red reached 2 at minute 6, navy only at minute 9.
		expect((await winners())['w-tie']).toBe('red');
	});

	test('an exact tie on both counts and times falls to option id', async () => {
		await pin('w-exact', [
			['a', 'plum', 4],
			['b', 'fern', 4]
		]);
		expect((await winners())['w-exact']).toBe('fern');
	});

	test('a vote at or before the reset does not count toward a winner', async () => {
		// The course's reset (previous block) stamped now(); every pinned row is
		// in 2030, so move them behind a reset stamped after them instead.
		await db.sql(
			`insert into public.classroom_theme_votes (course_id, feature, student_email, option_id, voted_at)
			 values ($1, 'w-old', 'old@pinned.net', 'gone', now() - interval '1 day')`,
			[courseA]
		);
		expect((await winners())['w-old']).toBeUndefined();
		// POSITIVE CONTROL: the same row stamped after the reset does count.
		await db.sql(
			`update public.classroom_theme_votes set voted_at = now() + interval '1 day'
			  where course_id = $1 and feature = 'w-old'`,
			[courseA]
		);
		expect((await winners())['w-old']).toBe('gone');
	});

	test('through the real vote: the option that only just drew level does not take over', async () => {
		const pal = async () => (await tally(val)).winners['flicker'];
		await rpc(sam.id, VOTE, [courseA, 'flicker', 'navy']);
		await rpc(val.id, VOTE, [courseA, 'flicker', 'red']);
		expect(await pal()).toBe('navy'); // 1-1, navy got there first
		await rpc(val.id, VOTE, [courseA, 'flicker', 'red']); // a repeat click re-stamps nothing
		expect(await pal()).toBe('navy');
		await rpc(sam.id, VOTE, [courseA, 'flicker', 'red']);
		expect(await pal()).toBe('red'); // 2-0
		await rpc(sam.id, VOTE, [courseA, 'flicker', 'navy']);
		expect(await pal()).toBe('red'); // 1-1 again, and the incumbent keeps it
	});
});

// ===========================================================================
describe('the twelve-feature cap', () => {
	test('a thirteenth distinct feature is refused; a re-vote on one already held is not; a withdrawal frees a slot', async () => {
		for (let i = 1; i <= 12; i++) await rpc(cap.id, VOTE, [courseA, `cap-${i}`, 'yes']);
		expect(await refusal(cap.id, VOTE, [courseA, 'cap-13', 'yes'])).toBe(
			'You have already voted on every part of the theme this class can have.'
		);
		expect(await rpc(cap.id, VOTE, [courseA, 'cap-1', 'no'])).toMatchObject({ ok: true, option: 'no' });
		await rpc(cap.id, VOTE, [courseA, 'cap-12', null]);
		expect(await rpc(cap.id, VOTE, [courseA, 'cap-13', 'yes'])).toMatchObject({ ok: true });
	});
});

// ===========================================================================
describe('the paint read omits what the caller cannot see', () => {
	test('a student gets their own class and nothing else, in the order asked', async () => {
		const got = await rpc<SectionTheme[]>(sam.id, THEMES, [
			[sectionB1, sectionA1, '00000000-0000-4000-8000-00000000beef', sectionA2, sectionA1]
		]);
		expect(got.map((g) => g.section_id)).toEqual([sectionA1]);
		expect(got[0].course_id).toBe(courseA);
		expect(got[0].winners).toEqual((await tally(teacher)).winners);
		// POSITIVE CONTROL: the section omitted for Sam is there for its own class.
		const bobs = await rpc<SectionTheme[]>(bob.id, THEMES, [[sectionA1, sectionB1]]);
		expect(bobs.map((g) => g.section_id)).toEqual([sectionB1]);
	});

	test('a teacher gets every section they manage, the archived one included, and not another teacher\'s', async () => {
		const got = await rpc<SectionTheme[]>(teacher.id, THEMES, [[sectionA2, sectionB1, sectionA1]]);
		expect(got.map((g) => g.section_id)).toEqual([sectionA2, sectionA1]);
	});

	test('nothing it answers names a person', async () => {
		const text = JSON.stringify(await rpc(sam.id, THEMES, [[sectionA1]]));
		expect(text).not.toContain('@');
		expect(text).toContain(courseA);
	});

	test('an empty or null ask is an empty list; more than two hundred ids is refused', async () => {
		expect(await rpc(sam.id, THEMES, [[]])).toEqual([]);
		expect(await rpc(sam.id, THEMES, [null])).toEqual([]);
		const many = Array.from({ length: 201 }, () => sectionA1);
		expect(await refusal(sam.id, THEMES, [many])).toBe('Ask for at most 200 classes at a time.');
	});
});

// ===========================================================================
describe('the section accent is the teacher\'s', () => {
	test('a teacher sets and clears it, and the paint read carries it', async () => {
		expect(await rpc(teacher.id, ACCENT, [sectionA1, ' Teal '])).toEqual({ ok: true, accent: 'teal' });
		const [t] = await rpc<SectionTheme[]>(sam.id, THEMES, [[sectionA1]]);
		expect(t.accent).toBe('teal');
		expect(await rpc(teacher.id, ACCENT, [sectionA1, '  '])).toEqual({ ok: true, accent: null });
		const [cleared] = await rpc<SectionTheme[]>(sam.id, THEMES, [[sectionA1]]);
		expect(cleared.accent).toBeNull();
		await rpc(teacher.id, ACCENT, [sectionA1, 'teal']);
	});

	test('a student, and a teacher of another class, are refused; a bad slug is refused in words', async () => {
		expect(await refusal(sam.id, ACCENT, [sectionA1, 'red'])).toBe('Only a teacher of this class can set its accent.');
		expect(await refusal(otherTeacher.id, ACCENT, [sectionA1, 'red'])).toBe(
			'Only a teacher of this class can set its accent.'
		);
		expect(await refusal(teacher.id, ACCENT, [sectionA1, 'red; drop'])).toBe('That is not one of the class accents.');
		const { rows } = await db.sql<{ a: string | null }>(
			`select theme_accent as a from public.classroom_sections where id = $1`,
			[sectionA1]
		);
		expect(rows[0].a).toBe('teal');
	});

	test('the column constraint refuses a bad value even from the owner, with no RPC in the way', async () => {
		await expect(
			db.sql(`update public.classroom_sections set theme_accent = 'Not A Slug' where id = $1`, [sectionA1])
		).rejects.toThrow(/classroom_sections_theme_accent_shape/);
	});
});

// ===========================================================================
describe('a second paste changes nothing', () => {
	test('the file re-applies over live votes: every tally and every theme reads back identical', async () => {
		const tBefore = await tally(teacher);
		const sBefore = await rpc<SectionTheme[]>(teacher.id, THEMES, [[sectionA1, sectionA2]]);
		await db.sql(SQL_0225);
		expect(await tally(teacher)).toEqual(tBefore);
		expect(await rpc<SectionTheme[]>(teacher.id, THEMES, [[sectionA1, sectionA2]])).toEqual(sBefore);
		const c = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint where conname = 'classroom_sections_theme_accent_shape'`
		);
		expect(c.rows[0].n).toBe('1');
	});
});

// ===========================================================================
// THE CLIENT HALF AGAINST THE REAL FUNCTIONS (ledger 0347). The client module
// was built beside this migration and tested against a fake; a parameter
// named differently from the SQL answers PGRST202, which the client reads as
// "no themes on this deployment" -- a silent no-op on the one path that
// paints anything. So the SHIPPED transports and the SHIPPED classroom layout
// load are driven here through the PostgREST shim, which calls in NAMED
// notation exactly as PostgREST does.
describe('the shipped transports and layout load reach the real functions', () => {
	const shimFor = async (u: SeededUser) =>
		createClassThemeTransports(createPostgrestShim(db, await loadForeignKeys(db), u.id) as never);

	test('a student votes and reads the tally; a teacher opens, closes, resets and sets the accent', async () => {
		const t = await shimFor(teacher);
		const reset = await t.reset(courseA);
		expect(reset.ok).toBe(true);
		const opened = await t.setVoting(courseA, true);
		expect(opened).toEqual({ ok: true, voting_open: true, reset_at: expect.any(String) });

		const student = await shimFor(sam);
		const voted = await student.vote(courseA, 'palette', 'ember');
		expect(voted).toEqual({ ok: true, withdrawn: false, option: 'ember', winners: { palette: 'ember' } });
		const read = await student.tally(courseA);
		expect(read.ok && read.tally.mine).toEqual({ palette: 'ember' });
		expect(read.ok && read.tally.can_vote).toBe(true);

		const accent = await t.setAccent(sectionA1, 'sky');
		expect(accent).toEqual({ ok: true, accent: 'sky' });
		const themes = await t.themes([sectionA1]);
		expect(themes).toEqual({
			ok: true,
			themes: [{ section_id: sectionA1, course_id: courseA, accent: 'sky', winners: { palette: 'ember' } }]
		});

		// A teacher's vote is the database's refusal, in its own words -- never
		// `unavailable`, which would hide the panel.
		const refused = await t.vote(courseA, 'palette', 'ocean');
		expect(refused.ok).toBe(false);
		expect(!refused.ok && refused.reason).toBe('error');

		const closed = await t.setVoting(courseA, false);
		expect(closed.ok && closed.voting_open).toBe(false);
		expect(await student.vote(courseA, 'palette', 'ocean')).toEqual({ ok: false, reason: 'closed' });
		await t.setVoting(courseA, true);
	});

	test('the classroom layout load hands every surface the student\'s class theme, and none for a class nobody voted on', async () => {
		const fks = await loadForeignKeys(db);
		// The load names the key a vote re-runs it by (`classroom:themes`), so the
		// strip and My Classes can catch up with a banner a vote just repainted.
		const deps: string[] = [];
		const data = (await classroomLayoutLoad({
			locals: { supabase: createPostgrestShim(db, fks, sam.id), claims: { sub: sam.id, email: sam.email } },
			depends: (...keys: string[]) => deps.push(...keys)
		} as never)) as { navSections: { id: string }[]; navThemes: Record<string, { palette: { id: string }; accent: { id: string } | null }> };
		expect(deps).toEqual(['classroom:themes']);
		expect(data.navSections.map((s) => s.id)).toContain(sectionA1);
		expect(data.navThemes[sectionA1]?.palette.id).toBe('ember');
		expect(data.navThemes[sectionA1]?.accent?.id).toBe('sky');

		const other = (await classroomLayoutLoad({
			locals: { supabase: createPostgrestShim(db, fks, bob.id), claims: { sub: bob.id, email: bob.email } },
			depends: () => {}
		} as never)) as { navSections: { id: string }[]; navThemes: Record<string, unknown> };
		// Bob's class exists for him (the control) and has no theme.
		expect(other.navSections.map((s) => s.id)).toEqual([sectionB1]);
		expect(other.navThemes).toEqual({});
	});
});
