// tests/db/duplicate-drafts-count.test.ts
//
// 0074: the count nobody has, and the one thing this surface must not get
// wrong.
//
// WHY THIS IS A DATABASE TEST. Every claim under test is about ROWS THAT
// EXIST rather than about rows a client can read, and the gap between those
// two is the whole reason 0186 is a SECURITY DEFINER function instead of a
// browser-side count off the existing grants. A mounted component cannot see
// that gap; only real Postgres with the real policies in force can.
//
// THE THREE CONTROLS the prompt requires are sections 1, 2 and 3, and each is
// a PAIRED measurement rather than a single assertion -- the fixture that
// should be listed measured beside the one that should not, so a rule that
// stopped applying at all cannot pass by listing everything or nothing.
//
// Section 4 is the measurement that decides the whole design: the same
// submission counted through the CALLER'S OWN eyes (what a browser could have
// asked) and through the definer. They disagree, and they disagree in the
// direction that deletes a student's work.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

/**
 * The classroom chain, plus every table 0186 counts, plus 0186 itself.
 *
 * 0137 SITS BEFORE 0186 ON PURPOSE. It is a one-time repair of the grants that
 * already existed, so a function created after it arrives granted to `anon`
 * again unless its own migration names the roles. Putting the sweep first is
 * what makes section 5's ACL assertions mean "0186 revoked for itself" rather
 * than "0137 happened to catch it".
 */
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
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql',
	'0128_classroom_instructor_copy.sql',
	'0137_anon_execute_sweep.sql',
	'0186_classroom_duplicate_drafts.sql'
] as const;

type Group = {
	author_email: string;
	kind: string;
	title: string | null;
	copies: number;
	first_written: string;
	last_written: string;
	keep_id: string;
	surplus_count: number;
	removable_count: number;
	blocked_count: number;
	surplus: {
		id: string;
		created_at: string;
		removable: boolean;
		student_work: number;
		authored: number;
		counts: Record<string, number>;
	}[];
};

type Answer = {
	groups: Group[];
	totals: { groups: number; surplus: number; removable: number; blocked: number };
};

describe('0074: duplicate drafts, counted as they exist', () => {
	let db: TestDb;
	let teacher: SeededUser;
	let other: SeededUser;
	let student: SeededUser;
	let section: string;
	let otherSection: string;

	/** Ask the shipped RPC as a real signed-in caller, through RLS and grants. */
	async function ask(as: SeededUser, sectionId: string | null = null): Promise<Answer> {
		return db.asUser(as.id, async (q) => {
			const { rows } = await q<{ result: Answer }>(
				'select public.classroom_duplicate_drafts($1::uuid) as result',
				[sectionId]
			);
			return rows[0].result;
		});
	}

	/**
	 * Write an item DIRECTLY, as the connection owner.
	 *
	 * Deliberately not through `classroom_create_item`: the surplus rows this
	 * surface exists to find were written by a client that has since been
	 * fixed, and several of them need a `created_at` minutes apart, which the
	 * RPC stamps with `now()` inside one transaction (every row would tie). The
	 * SHAPE is what matters here and it is the shape the RPC produces -- an
	 * ordinary item with at least one posting, which is what
	 * `_classroom_check_publish_targets` guarantees.
	 */
	async function seedItem(opts: {
		author: SeededUser;
		title: string | null;
		body: string;
		kind?: string;
		published?: boolean;
		minutesAgo: number;
		sections?: string[];
	}): Promise<string> {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.classroom_items
				(kind, title, body, author_email, author_name, published, created_at)
			 values ($1, $2, $3, $4, 'Seeded', $5, now() - make_interval(mins => $6))
			 returning id`,
			[
				opts.kind ?? 'assignment',
				opts.title,
				opts.body,
				opts.author.email,
				opts.published ?? false,
				opts.minutesAgo
			]
		);
		const id = rows[0].id;
		for (const s of opts.sections ?? [section]) {
			await db.sql('insert into public.classroom_postings (item_id, section_id) values ($1, $2)', [
				id,
				s
			]);
		}
		return id;
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');
		other = await createUser(db, 'okonkwo@boscotech.edu', 'A. Okonkwo');
		student = await createUser(db, 'rivera@boscotech.net', 'J. Rivera');

		const course = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { course_id: string } }>(
				"select public.classroom_upsert_course('IDEA209H', 'Engineering I Honors') as result"
			);
			return rows[0].result.course_id;
		});
		section = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { section_id: string } }>(
				"select public.classroom_upsert_section($1::uuid, 'Period 2', 'B') as result",
				[course]
			);
			return rows[0].result.section_id;
		});
		otherSection = await db.asUser(other.id, async (q) => {
			const { rows } = await q<{ result: { section_id: string } }>(
				"select public.classroom_upsert_section($1::uuid, 'Period 6', 'D') as result",
				[course]
			);
			return rows[0].result.section_id;
		});
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// 0. THE EMPTY ANSWER. B3: safe to open on a clean database.
	// -----------------------------------------------------------------------
	describe('a database with no duplicates', () => {
		it('answers a well-formed empty result, not null and not an error', async () => {
			const a = await ask(teacher);
			expect(a.groups).toEqual([]);
			expect(a.totals).toEqual({ groups: 0, surplus: 0, removable: 0, blocked: 0 });
		});

		it('a lone draft standing on its own is never named', async () => {
			await seedItem({ author: teacher, title: 'Only one of these', body: 'x', minutesAgo: 90 });
			const a = await ask(teacher);
			expect(a.totals.groups).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// 1. CONTROL ONE. A genuine surplus copy is listed, and the oldest is kept.
	// -----------------------------------------------------------------------
	describe('CONTROL 1: a genuine surplus copy', () => {
		let oldest: string;
		let copies: string[];

		beforeAll(async () => {
			oldest = await seedItem({
				author: teacher,
				title: 'Bridge lab writeup',
				body: 'Measure the deflection at 2 N.',
				minutesAgo: 60
			});
			copies = [];
			for (const m of [58, 57, 56]) {
				copies.push(
					await seedItem({
						author: teacher,
						title: 'Bridge lab writeup',
						body: 'Measure the deflection at 2 N.',
						minutesAgo: m
					})
				);
			}
			// The negative half, seeded beside it: same title, DIFFERENT body.
			// Two drafts a teacher wrote deliberately are not copies.
			await seedItem({
				author: teacher,
				title: 'Bridge lab writeup',
				body: 'A different second draft entirely.',
				minutesAgo: 40
			});
		});

		it('groups the four identical drafts as one group of four', async () => {
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.title === 'Bridge lab writeup' && x.copies === 4);
			expect(g).toBeDefined();
			expect(g!.copies).toBe(4);
			expect(g!.surplus_count).toBe(3);
		});

		it('KEEPS THE OLDEST and names exactly the other three as surplus', async () => {
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.copies === 4)!;
			expect(g.keep_id).toBe(oldest);
			expect(g.surplus.map((s) => s.id).sort()).toEqual([...copies].sort());
			expect(g.surplus.map((s) => s.id)).not.toContain(oldest);
		});

		it('CONTROL: the same-title-different-body draft is NOT in any group', async () => {
			const a = await ask(teacher);
			const everyNamedId = a.groups.flatMap((g) => [g.keep_id, ...g.surplus.map((s) => s.id)]);
			const { rows } = await db.sql<{ id: string }>(
				`select id from public.classroom_items
				  where body = 'A different second draft entirely.'`
			);
			expect(rows).toHaveLength(1);
			expect(everyNamedId).not.toContain(rows[0].id);
		});

		it('CONTROL: a PUBLISHED pair of identical items is never a duplicate draft', async () => {
			const before = await ask(teacher);
			for (const m of [30, 29]) {
				await seedItem({
					author: teacher,
					title: 'Published twice on purpose',
					body: 'Live content.',
					published: true,
					minutesAgo: m
				});
			}
			const after = await ask(teacher);
			expect(after.totals.groups).toBe(before.totals.groups);
			expect(after.groups.map((g) => g.title)).not.toContain('Published twice on purpose');
		});

		it('reports when the oldest was written, so a reader can date the group', async () => {
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.copies === 4)!;
			expect(new Date(g.first_written).getTime()).toBeLessThan(
				new Date(g.last_written).getTime()
			);
		});
	});

	// -----------------------------------------------------------------------
	// 2. CONTROL TWO. Student work is never removable. 0061's trap.
	// -----------------------------------------------------------------------
	describe('CONTROL 2: a copy carrying student work', () => {
		let withWork: string;
		let withoutWork: string;

		beforeAll(async () => {
			await seedItem({
				author: teacher,
				title: 'Truss sketch',
				body: 'Sketch the truss and label the members.',
				minutesAgo: 20
			});
			withoutWork = await seedItem({
				author: teacher,
				title: 'Truss sketch',
				body: 'Sketch the truss and label the members.',
				minutesAgo: 19
			});
			withWork = await seedItem({
				author: teacher,
				title: 'Truss sketch',
				body: 'Sketch the truss and label the members.',
				minutesAgo: 18
			});
			// A hand-in on the copy, by a student who is NOT on the roster.
			// See section 4: this is the row a browser-side count cannot see.
			await db.sql(
				`insert into public.classroom_submissions (item_id, student_email, state, submitted_at)
				 values ($1, $2, 'submitted', now())`,
				[withWork, student.email]
			);
		});

		it('lists the copy carrying work, and marks it NOT removable', async () => {
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.title === 'Truss sketch')!;
			const row = g.surplus.find((s) => s.id === withWork);
			expect(row).toBeDefined();
			expect(row!.removable).toBe(false);
			expect(row!.student_work).toBe(1);
		});

		it('CONTROL: its sibling with no work IS removable, on the same group', async () => {
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.title === 'Truss sketch')!;
			const row = g.surplus.find((s) => s.id === withoutWork)!;
			expect(row.removable).toBe(true);
			expect(row.student_work).toBe(0);
			// Both directions on one group is the assertion: the guard bites on
			// one row and does not bite on the other, so a rule that stopped
			// applying could not pass this pair.
			expect(g.removable_count).toBe(1);
			expect(g.blocked_count).toBe(1);
		});

		it('counts a RESPONSE as student work too, not only a submission', async () => {
			const id = await seedItem({
				author: teacher,
				title: 'Load cases',
				body: 'List three load cases.',
				minutesAgo: 15
			});
			const withResponse = await seedItem({
				author: teacher,
				title: 'Load cases',
				body: 'List three load cases.',
				minutesAgo: 14
			});
			await db.sql(
				`insert into public.classroom_responses (item_id, student_email, block_id, value)
				 values ($1, $2, 'b1', '{"text":"dead load"}'::jsonb)`,
				[withResponse, student.email]
			);
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.title === 'Load cases')!;
			expect(g.keep_id).toBe(id);
			expect(g.surplus.find((s) => s.id === withResponse)!.removable).toBe(false);
			expect(g.blocked_count).toBe(1);
		});

		it('a POSTING alone never blocks a row, because every item has one', async () => {
			const a = await ask(teacher);
			const every = a.groups.flatMap((g) => g.surplus);
			expect(every.length).toBeGreaterThan(0);
			// Every surplus row has at least one posting...
			expect(every.every((s) => s.counts.postings >= 1)).toBe(true);
			// ...and some of them are removable anyway. If postings blocked,
			// this would be 0 and the surface would be useless.
			expect(every.filter((s) => s.removable).length).toBeGreaterThan(0);
		});

		it('AUTHORED material is reported but does not block, and is named', async () => {
			const id = await seedItem({
				author: teacher,
				title: 'Deck day',
				body: 'Slides for the intro.',
				minutesAgo: 12
			});
			const withRubric = await seedItem({
				author: teacher,
				title: 'Deck day',
				body: 'Slides for the intro.',
				minutesAgo: 11
			});
			await db.sql(
				`insert into public.classroom_rubrics (item_id, criteria, updated_by)
				 values ($1, '[]'::jsonb, $2)`,
				[withRubric, teacher.email]
			);
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.title === 'Deck day')!;
			expect(g.keep_id).toBe(id);
			const row = g.surplus.find((s) => s.id === withRubric)!;
			expect(row.counts.rubrics).toBe(1);
			expect(row.authored).toBeGreaterThan(0);
			// Authored material is the author's own, on a copy of the author's
			// own draft. It is a reason to look, not a refusal.
			expect(row.removable).toBe(true);
			expect(row.student_work).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// 3. CONTROL THREE. Another instructor's section shows nothing.
	// -----------------------------------------------------------------------
	describe('CONTROL 3: an instructor of a different section', () => {
		it('sees none of the first teacher drafts', async () => {
			const mine = await ask(teacher);
			expect(mine.totals.groups).toBeGreaterThan(0);
			const theirs = await ask(other);
			expect(theirs.totals.groups).toBe(0);
			expect(theirs.groups).toEqual([]);
		});

		it('CONTROL: the same call answers for THEIR own section once they have copies', async () => {
			for (const m of [10, 9] as const) {
				await seedItem({
					author: other,
					title: 'Their own duplicate',
					body: 'Written in period 6.',
					minutesAgo: m,
					sections: [otherSection]
				});
			}
			const theirs = await ask(other);
			expect(theirs.totals.groups).toBe(1);
			expect(theirs.groups[0].title).toBe('Their own duplicate');
			// And it is still invisible to the first teacher, so the boundary
			// holds in both directions rather than in the one that is easy.
			const mine = await ask(teacher);
			expect(mine.groups.map((g) => g.title)).not.toContain('Their own duplicate');
		});

		it('A CO-POSTED item is invisible to a manager of only ONE of its sections', async () => {
			// _classroom_manages_item requires EVERY posting's section, which is
			// the delete gate. A teacher who cannot delete it must not be
			// offered it here.
			for (const m of [8, 7] as const) {
				await seedItem({
					author: teacher,
					title: 'Co-posted pair',
					body: 'Shared across two classes.',
					minutesAgo: m,
					sections: [section, otherSection]
				});
			}
			const mine = await ask(teacher);
			const theirs = await ask(other);
			expect(mine.groups.map((g) => g.title)).not.toContain('Co-posted pair');
			expect(theirs.groups.map((g) => g.title)).not.toContain('Co-posted pair');
		});

		it('the section filter narrows to one class and null means every class', async () => {
			const all = await ask(other, null);
			const here = await ask(other, otherSection);
			const elsewhere = await ask(other, section);
			expect(all.totals.groups).toBe(1);
			expect(here.totals.groups).toBe(1);
			expect(elsewhere.totals.groups).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// 4. THE MEASUREMENT THAT DECIDES THE DESIGN.
	//
	// The same submission, counted two ways. This is why 0186 exists rather
	// than a browser-side count off the existing `grant select`.
	// -----------------------------------------------------------------------
	describe('a browser-side count would under-report, in the unsafe direction', () => {
		it('the teacher READS 0 submission rows for a hand-in that exists', async () => {
			const { rows: real } = await db.sql<{ n: string }>(
				`select count(*)::text as n from public.classroom_submissions
				  where student_email = $1`,
				[student.email]
			);
			expect(Number(real[0].n)).toBeGreaterThan(0);

			// The same count as the CALLER, through RLS -- exactly what a
			// browser doing this without a definer would have got. The student
			// has no enrollment row, so classroom_can_review_submission is
			// false on both arms and the row is invisible.
			const visible = await db.asUser(teacher.id, async (q) => {
				const { rows } = await q<{ n: string }>(
					'select count(*)::text as n from public.classroom_submissions'
				);
				return Number(rows[0].n);
			});
			expect(visible).toBe(0);
		});

		it('and the definer still refuses to call that row removable', async () => {
			const a = await ask(teacher);
			const g = a.groups.find((x) => x.title === 'Truss sketch')!;
			expect(g.blocked_count).toBe(1);
			// The pair IS the proof: 0 rows readable, 1 row blocking. A count
			// taken the readable way would have said "safe to remove".
		});

		it('totals add up across every group', async () => {
			const a = await ask(teacher);
			const surplus = a.groups.reduce((n, g) => n + g.surplus.length, 0);
			const removable = a.groups.reduce(
				(n, g) => n + g.surplus.filter((s) => s.removable).length,
				0
			);
			expect(a.totals.surplus).toBe(surplus);
			expect(a.totals.removable).toBe(removable);
			expect(a.totals.blocked).toBe(surplus - removable);
			expect(a.totals.groups).toBe(a.groups.length);
		});
	});

	// -----------------------------------------------------------------------
	// 5. THE FUNCTION IS READ ONLY, AND CLOSED.
	// -----------------------------------------------------------------------
	describe('0186 itself', () => {
		it('is granted to authenticated and to nobody else', async () => {
			const { rows } = await db.sql<{
				anon: boolean;
				auth: boolean;
				svc: boolean;
				priv: boolean;
			}>(
				`select
					has_function_privilege('anon', 'public.classroom_duplicate_drafts(uuid)', 'execute') as anon,
					has_function_privilege('authenticated', 'public.classroom_duplicate_drafts(uuid)', 'execute') as auth,
					has_function_privilege('service_role', 'public.classroom_duplicate_drafts(uuid)', 'execute') as svc,
					has_function_privilege('authenticated', 'public._classroom_item_attached_counts(uuid)', 'execute') as priv`
			);
			expect(rows[0].anon).toBe(false);
			expect(rows[0].auth).toBe(true);
			expect(rows[0].svc).toBe(false);
			expect(rows[0].priv).toBe(false);
		});

		it('refuses a signed-out caller, and the refusal is the GRANT not the body', async () => {
			// `anon` holds no EXECUTE, so the call cannot even reach the
			// `auth.uid() is null` guard inside. Both layers are asserted:
			// the grant here, and the guard by its own presence in the file,
			// because a future grant to anon must still not answer.
			await expect(
				db.asAnon(async (q) => q('select public.classroom_duplicate_drafts(null::uuid)'))
			).rejects.toThrow(/permission denied/i);
		});

		it('is declared STABLE, so it cannot write', async () => {
			const { rows } = await db.sql<{ volatile: string; n: string }>(
				`select p.provolatile as volatile, count(*) over () ::text as n
				   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and p.proname = 'classroom_duplicate_drafts'`
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].volatile).toBe('s');
		});

		it('leaves every row exactly where it was', async () => {
			const before = await db.sql<{ n: string }>(
				'select count(*)::text as n from public.classroom_items'
			);
			await ask(teacher);
			await ask(other);
			const after = await db.sql<{ n: string }>(
				'select count(*)::text as n from public.classroom_items'
			);
			expect(after.rows[0].n).toBe(before.rows[0].n);
		});

		it('re-applies cleanly, because a migration gets re-pasted', async () => {
			const sql = await import('node:fs/promises').then((fs) =>
				fs.readFile('supabase/migrations/0186_classroom_duplicate_drafts.sql', 'utf8')
			);
			await db.sql(sql);
			const a = await ask(teacher);
			expect(a.totals.groups).toBeGreaterThan(0);
		});
	});
});
