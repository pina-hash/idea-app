// tests/notebook-guidance-propagates.test.ts
//
// THE ONE CLAIM THE WHOLE 0123 CLIENT DESIGN TURNS ON: a check-in's guidance
// prompt is READ THROUGH THE CHECK-IN, at every read, and is never copied onto
// an entry when one is filed against it.
//
// THE REJECTED ALTERNATIVE, and why it needs a test rather than a comment.
// Snapshotting the prompt onto the entry at creation is the obvious design. It
// is simpler (one read, no join), it is faster, and it is what a future session
// will refactor toward -- and on every screen in this application it looks
// IDENTICAL. It is wrong in exactly one situation: an instructor rereads the
// prompt, sees it was unclear, and fixes it. Under the snapshot design the
// students who already answered the unclear version keep reading the unclear
// version forever, the instructor sees the corrected one on their own console,
// and nothing anywhere reports a disagreement. A correction that does not
// propagate is the failure this feature would fail at silently.
//
// SO IT IS ASSERTED THROUGH THE REAL LOAD FUNCTION, over a real embedded
// Postgres with the real migration files applied, against an entry FILED BEFORE
// the correction was written -- because a test that edited the prompt first
// would pass under either design.
//
// It also covers the ladder's own answer on a pre-0123 project: the check-in
// LABEL must still arrive. Degrading has to cost the prompt and nothing else,
// and a rung that took the label down with it would leave every filed entry
// unnamed -- which is the 0098 failure, one migration later.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { load } from '../src/routes/notebook/+page.server';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import type { NotebookEntry, NotebookSession } from '../src/lib/notebook';

/**
 * The notebook chain UNIONED with the classroom rich-text chain, exactly as
 * tests/notebook-session-guidance.test.ts assembles it: `_classroom_doc_ok` is
 * the gate 0123 CALLS rather than clones, so a chain without 0108/0122 could
 * not apply the migration at all.
 */
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
	'0092_classroom_reference_specs.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0106_notebook_instructor_student_access.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0122_rich_text_nested_lists.sql',
	'0123_notebook_session_guidance.sql'
];

/** The same chain one migration short: the deploy state 0123 has to degrade to. */
const PRE_GUIDANCE_CHAIN = CHAIN.filter((m) => m !== '0123_notebook_session_guidance.sql');

const FIRST = [{ type: 'p', runs: [{ text: 'Photograph your notes.' }] }];
const CORRECTED = [
	{ type: 'p', runs: [{ text: 'Photograph BOTH pages, flat, with the bore numbers readable.' }] }
];

interface LoadResult {
	sessionsReady: boolean;
	sessions: NotebookSession[];
	entries: NotebookEntry[];
}

function runLoad(
	database: TestDb,
	keys: Awaited<ReturnType<typeof loadForeignKeys>>,
	user: SeededUser
) {
	return (load as unknown as (event: unknown) => Promise<LoadResult>)({
		url: new URL('http://localhost/notebook'),
		locals: {
			supabase: createPostgrestShim(database, keys, user.id),
			claims: { sub: user.id, email: user.email, role: 'authenticated' }
		}
	});
}

/**
 * Seed a project on `chain`: one class, one instructor, one enrolled student,
 * one check-in carrying `FIRST` as its prompt, and one entry that student filed
 * against it. Everything goes through the REAL RPCs, so what is stored is what
 * the deployed app stores.
 */
async function seed(chain: string[]) {
	const db = await startTestDb(chain);
	const fks = await loadForeignKeys(db);
	const alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	const instructor = await createUser(db, 'instructor@boscotech.edu', 'Ada Instructor');

	const sectionId = await createClassroomSection(db, {
		as: instructor,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: instructor.email
	});
	await enrollStudent(db, {
		as: instructor,
		sectionId,
		email: alice.email,
		displayName: 'Alice Alvarez'
	});

	const sessionId = await db.asUser(instructor.id, async (q) => {
		const { rows } = await q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4) as result',
			[[sectionId], 3, '2026-08-10', 'Bearing teardown']
		);
		return rows[0].result.session_id;
	});

	// The prompt as it was first written. Only where the column exists: the
	// pre-0123 project is seeded without one, which is the state it is for.
	if (chain.includes('0123_notebook_session_guidance.sql')) {
		await db.asUser(instructor.id, (q) =>
			q('select public.notebook_set_session_guidance($1::uuid, $2::jsonb)', [
				sessionId,
				JSON.stringify(FIRST)
			])
		);
	}

	// THE STUDENT FILES BEFORE THE CORRECTION. This ordering is the whole test:
	// under the rejected design the entry would have taken its copy right here.
	const entryId = await db.asUser(alice.id, async (q) => {
		const { rows } = await q<{ result: { entry_id: string } }>(
			'select public.notebook_create_entry($1, $2, $3, $4, null, $5) as result',
			[alice.id, 'drive-alice-1', sessionId, sectionId, 'page.jpg']
		);
		return rows[0].result.entry_id;
	});

	return { db, fks, alice, instructor, sectionId, sessionId, entryId };
}

describe('a corrected prompt reaches an entry that was filed before it', () => {
	let ctx: Awaited<ReturnType<typeof seed>>;

	beforeAll(async () => {
		ctx = await seed(CHAIN);
	});
	afterAll(async () => {
		await ctx?.db.stop();
	});

	it('the load carries the prompt on both the check-in and the filed entry', async () => {
		const before = await runLoad(ctx.db, ctx.fks, ctx.alice);
		expect(before.sessionsReady).toBe(true);

		// The composer's read: the check-in the student is about to file against.
		const session = before.sessions.find((s) => s.id === ctx.sessionId);
		expect(session, 'the check-in did not reach the composer at all').toBeDefined();
		expect(session!.guidance_doc).toEqual(FIRST);

		// The filed entry's read: what was asked for, on the work that answered.
		const entry = before.entries.find((e) => e.id === ctx.entryId);
		expect(entry, 'the entry did not reach the feed at all').toBeDefined();
		expect(entry!.session?.guidance_doc).toEqual(FIRST);
	});

	/**
	 * THE ASSERTION THAT DISTINGUISHES THE TWO DESIGNS.
	 *
	 * Nothing about the ENTRY changes here -- it is not rewritten, resaved or
	 * touched. Only the check-in's own column moves. Under the shipped design
	 * both reads answer the corrected sentence because both resolve the prompt
	 * through the check-in by id at read time. Under the rejected snapshot
	 * design the entry's copy would still say `FIRST`, and this reddens.
	 */
	it('...and answers the CORRECTED prompt after the instructor fixes it', async () => {
		await ctx.db.asUser(ctx.instructor.id, (q) =>
			q('select public.notebook_set_session_guidance($1::uuid, $2::jsonb)', [
				ctx.sessionId,
				JSON.stringify(CORRECTED)
			])
		);

		const after = await runLoad(ctx.db, ctx.fks, ctx.alice);
		expect(after.sessions.find((s) => s.id === ctx.sessionId)!.guidance_doc).toEqual(CORRECTED);

		const entry = after.entries.find((e) => e.id === ctx.entryId);
		expect(
			entry!.session?.guidance_doc,
			'the filed entry is still showing the prompt as it read when it was filed -- ' +
				'the guidance has been copied onto the entry instead of referenced through the check-in'
		).toEqual(CORRECTED);
	});

	/**
	 * CLEARING PROPAGATES TOO, and it is the same argument from the other end: a
	 * prompt an instructor deliberately removed must not survive on the entries
	 * filed while it existed.
	 */
	it('and a cleared prompt clears everywhere, rather than surviving on old entries', async () => {
		await ctx.db.asUser(ctx.instructor.id, (q) =>
			q('select public.notebook_set_session_guidance($1::uuid, null)', [ctx.sessionId])
		);
		const after = await runLoad(ctx.db, ctx.fks, ctx.alice);
		expect(after.sessions.find((s) => s.id === ctx.sessionId)!.guidance_doc).toBeNull();
		expect(after.entries.find((e) => e.id === ctx.entryId)!.session?.guidance_doc).toBeNull();
		// The positive control: the check-in and the entry are both still THERE,
		// so the two nulls above are "no prompt" rather than "nothing loaded".
		expect(after.sessions.some((s) => s.id === ctx.sessionId)).toBe(true);
		expect(after.entries.find((e) => e.id === ctx.entryId)!.session?.session_label).toBe(
			'Bearing teardown'
		);
	});
});

/**
 * THE DEGRADE, on its own database because it is a different schema.
 *
 * A project sitting between 0122 and 0123 is a real state -- migrations here
 * are applied by hand -- and PostgREST rejects the WHOLE select for a column it
 * does not know. So the guidance rung has to fail and the narrow one has to
 * carry the read, costing the prompt and NOTHING else. A rung that took the
 * check-in label down with it would leave every filed entry unnamed, which is
 * the 0098 failure one migration later.
 */
describe('a project without 0123 loses the prompt and keeps everything else', () => {
	let ctx: Awaited<ReturnType<typeof seed>>;

	beforeAll(async () => {
		ctx = await seed(PRE_GUIDANCE_CHAIN);
	});
	afterAll(async () => {
		await ctx?.db.stop();
	});

	it('still reports the check-ins ready, named, and attached to the entry', async () => {
		const result = await runLoad(ctx.db, ctx.fks, ctx.alice);
		// The headline: the ladder degraded rather than the page failing.
		expect(result.sessionsReady).toBe(true);

		const session = result.sessions.find((s) => s.id === ctx.sessionId);
		expect(session).toBeDefined();
		expect(session!.session_label).toBe('Bearing teardown');
		expect(session!.unit_number).toBe(3);

		const entry = result.entries.find((e) => e.id === ctx.entryId);
		expect(entry).toBeDefined();
		expect(entry!.session?.session_label).toBe('Bearing teardown');
	});

	/**
	 * `undefined`, NOT `null`, and the difference is load-bearing: null is the
	 * widest rung answering "this check-in has no prompt", undefined is the read
	 * never having asked. The review console reads exactly that difference to
	 * decide whether to OFFER the field, so collapsing the two here would put an
	 * editor in front of an instructor on a database with nowhere to save it.
	 */
	it('reports the prompt as NOT ASKED rather than as absent', async () => {
		const result = await runLoad(ctx.db, ctx.fks, ctx.alice);
		const session = result.sessions.find((s) => s.id === ctx.sessionId)!;
		expect(session.guidance_doc).toBeUndefined();
		expect(session.guidance_doc).not.toBeNull();
		const entry = result.entries.find((e) => e.id === ctx.entryId)!;
		expect(entry.session?.guidance_doc).toBeUndefined();
	});
});
