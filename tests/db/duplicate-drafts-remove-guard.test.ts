// tests/db/duplicate-drafts-remove-guard.test.ts
//
// 0074 / B2: a row with student work attached cannot be removed through this
// surface EVEN IF THE CLIENT ASKS.
//
// WHY THIS IS SEPARATE FROM THE COUNT TEST. The count test asks whether the
// database CALLS a row removable. This one asks what happens when a caller
// ignores that answer and posts the id anyway -- which is the only version of
// the question that matters, because the component's own guard is markup and
// markup is not a boundary. It drives the SHIPPED route handler, imported from
// its own file, against real embedded Postgres as a real signed-in teacher.
//
// THE DELETE IS THE REAL ONE. The guard forwards to
// `POST /api/classroom/delete-content` through SvelteKit's `fetch`, so this
// test hands the handler a `fetch` that calls that route's own POST. Nothing
// about the deletion is reimplemented: `classroom_delete_item` runs, its
// management check runs, and the row count afterwards is the measurement.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import { POST as REMOVE } from '../../src/routes/classroom/[sectionId]/duplicates/remove/+server';
import { POST as DELETE_CONTENT } from '../../src/routes/api/classroom/delete-content/+server';

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
	'0187_classroom_duplicate_drafts.sql'
] as const;

describe('0074: the removal guard refuses what the surface promises it refuses', () => {
	let db: TestDb;
	let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
	let teacher: SeededUser;
	let other: SeededUser;
	let student: SeededUser;
	let section: string;
	let otherSection: string;

	let keepId = '';
	let safeId = '';
	let workId = '';
	let theirId = '';

	function shim(user: SeededUser | null): SupabaseClient {
		return createPostgrestShim(db, fks, user?.id ?? null) as unknown as SupabaseClient;
	}

	/**
	 * The route's own `fetch`, wired to the REAL delete-content handler.
	 *
	 * This is what SvelteKit's `event.fetch` does for a same-app URL: it
	 * invokes the handler in-process with the request's own session. Wiring it
	 * to anything else -- a stub that reports success, say -- would leave the
	 * measurement below ("is the row gone") meaningless.
	 */
	function routeFetch(as: SeededUser | null) {
		return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const url = String(input);
			if (!url.includes('/api/classroom/delete-content')) {
				throw new Error(`the guard reached for an unexpected URL: ${url}`);
			}
			return DELETE_CONTENT({
				request: new Request('http://localhost' + url, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: String(init?.body ?? '{}')
				}),
				locals: { supabase: shim(as), claims: as ? { sub: as.id } : null }
			} as never) as Promise<Response>;
		};
	}

	async function askRemove(
		id: unknown,
		as: SeededUser | null = teacher,
		sectionId = section
	): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
		const res = (await REMOVE({
			request: new Request('http://localhost/remove', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id })
			}),
			params: { sectionId },
			fetch: routeFetch(as),
			locals: { supabase: shim(as), claims: as ? { sub: as.id } : null }
		} as never)) as Response;
		return { status: res.status, body: (await res.json()) as { ok?: boolean; error?: string } };
	}

	async function exists(id: string): Promise<boolean> {
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_items where id = $1',
			[id]
		);
		return Number(rows[0].n) > 0;
	}

	async function seed(opts: {
		author: SeededUser;
		title: string;
		body: string;
		minutesAgo: number;
		sections?: string[];
	}): Promise<string> {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.classroom_items
				(kind, title, body, author_email, author_name, published, created_at)
			 values ('assignment', $1, $2, $3, 'Seeded', false, now() - make_interval(mins => $4))
			 returning id`,
			[opts.title, opts.body, opts.author.email, opts.minutesAgo]
		);
		for (const s of opts.sections ?? [section]) {
			await db.sql('insert into public.classroom_postings (item_id, section_id) values ($1, $2)', [
				rows[0].id,
				s
			]);
		}
		return rows[0].id;
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		fks = await loadForeignKeys(db);
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

		const T = 'Truss sketch';
		const B = 'Sketch the truss and label the members.';
		keepId = await seed({ author: teacher, title: T, body: B, minutesAgo: 30 });
		safeId = await seed({ author: teacher, title: T, body: B, minutesAgo: 29 });
		workId = await seed({ author: teacher, title: T, body: B, minutesAgo: 28 });
		await db.sql(
			`insert into public.classroom_submissions (item_id, student_email, state, submitted_at)
			 values ($1, $2, 'submitted', now())`,
			[workId, student.email]
		);

		// A duplicate pair belonging to the OTHER teacher, in their own class.
		await seed({
			author: other,
			title: 'Their own',
			body: 'Period 6 draft.',
			minutesAgo: 20,
			sections: [otherSection]
		});
		theirId = await seed({
			author: other,
			title: 'Their own',
			body: 'Period 6 draft.',
			minutesAgo: 19,
			sections: [otherSection]
		});
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// THE CLAUSE. This is the assertion B2 asks for.
	// -----------------------------------------------------------------------
	it('REFUSES a copy carrying student work, and the row survives', async () => {
		expect(await exists(workId)).toBe(true);
		const res = await askRemove(workId);
		expect(res.status).toBe(400);
		expect(res.body.ok).toBe(false);
		expect(res.body.error).toMatch(/student has work/i);
		// The measurement, not the message: the row is still there.
		expect(await exists(workId)).toBe(true);
	});

	it('CONTROL: its sibling with no work IS removed by the identical call', async () => {
		expect(await exists(safeId)).toBe(true);
		const res = await askRemove(safeId);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(await exists(safeId)).toBe(false);
		// The pair is the proof. One call shape, two answers, decided by the
		// clause and not by the fixture.
	});

	it('never removes the copy being KEPT, even asked by uuid', async () => {
		const res = await askRemove(keepId);
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/being kept/i);
		expect(await exists(keepId)).toBe(true);
	});

	it("refuses another teacher's copy, in the same words as a row that does not exist", async () => {
		const theirs = await askRemove(theirId);
		const nowhere = await askRemove('00000000-0000-4000-8000-000000000000');
		expect(theirs.status).toBe(400);
		expect(theirs.body.error).toBe(nowhere.body.error);
		expect(await exists(theirId)).toBe(true);
	});

	it('refuses an item that is not a duplicate at all', async () => {
		const lone = await seed({
			author: teacher,
			title: 'Only one of these',
			body: 'Unique.',
			minutesAgo: 5
		});
		const res = await askRemove(lone);
		expect(res.status).toBe(400);
		expect(res.body.ok).toBe(false);
		expect(await exists(lone)).toBe(true);
	});

	it('refuses a signed-out caller with 401 and reaches no delete', async () => {
		const res = await askRemove(keepId, null);
		expect(res.status).toBe(401);
		expect(await exists(keepId)).toBe(true);
	});

	it('refuses a malformed id before asking the database anything', async () => {
		const res = await askRemove('not-a-uuid');
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/uuid/i);
	});
});
