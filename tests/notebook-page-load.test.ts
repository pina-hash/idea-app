// tests/notebook-page-load.test.ts
//
// The student notebook's page load (/notebook), driven as the REAL shipped
// `load` against a REAL Postgres carrying the REAL migration chain through
// 0099 -- and, separately, against one that genuinely has no notebook tables at
// all.
//
// WHY THIS FILE EXISTS, and what the existing suites could not see. The page
// reported "the notebook tables are not in place on this project" on a database
// where they plainly were: /notebook/review read the same schema correctly at
// the same moment. The cause was not a missing table but a STALE EMBED. The
// entry select carried `notebook_sessions ( ... )`, which PostgREST had been
// resolving through the composite key notebook_entries held to
// notebook_sessions (id, section_id); 0098 repointed that key at
// notebook_session_postings, leaving no key between the two tables at all. The
// embed became unresolvable, so every rung of the load's widen-then-degrade
// chain failed, and one boolean derived from the last of them hid a working
// feature.
//
// EVERY OTHER SUITE STAYED GREEN, AND HAD TO. They speak SQL, and SQL does not
// need a foreign key to join two tables; svelte-check cannot see inside a
// select string either. The only thing that notices is something that resolves
// embeds the way PostgREST resolves them -- against the catalog -- which is
// what tests/db/postgrest-shim.ts does and why its FK lookup is the strict part
// of it. A shim that turned every embed into a JOIN would have proved nothing.
//
// The three claims below are deliberately independent, so a fix that satisfies
// one by accident does not satisfy the others:
//   1. SCHEMA: every table embedded anywhere in the shipped select strings has
//      a real relationship to its parent. No load involved.
//   2. LOAD: the real load, run as a real enrolled student, comes back
//      configured with its real entries, labels, photos, notes and check-ins.
//   3. DEGRADATION: the same load against a database with no notebook tables
//      reports exactly that, and nothing else.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import {
	createPostgrestShim,
	embeddedTables,
	loadForeignKeys,
	relationshipBetween
} from './db/postgrest-shim';
import {
	NOTEBOOK_ENTRY_SELECTS,
	NOTEBOOK_POSTING_SELECT,
	NOTEBOOK_SESSION_SELECT,
	REVIEW_ENTRY_SELECTS
} from '../src/lib/notebook-selects';
import type { NotebookEntry, NotebookSession } from '../src/lib/notebook';
import type { NotebookFolder } from '../src/lib/notebook-folders';
import { load } from '../src/routes/notebook/+page.server';

/** The chain the LIVE project carries: 0069 through 0099, on its dependencies. */
const FULL_CHAIN = [
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
	'0088_notebook_folders.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0098_notebook_session_postings.sql',
	'0099_notebook_view_as.sql'
];

/**
 * A project with the notebook's DEPENDENCIES but not one notebook migration --
 * genuinely missing tables, not a simulated failure. is_admin() and
 * classroom_sections still exist, so the load's other reads behave normally and
 * the only thing absent is the thing the card is about.
 */
const NO_NOTEBOOK_CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql'
];

let db: TestDb;
let bare: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let alice: SeededUser;
let instructor: SeededUser;
let sectionId: string;
let checkInId: string;
let linkedEntryId: string;
let freeEntryId: string;

/**
 * What the load hands the page. Written out rather than derived from
 * `typeof load`, because `PageServerLoad` types its own output as a broad
 * record (plus the `void` of the redirect branch), so deriving it yields `any`
 * and every assertion below would silently stop being type-checked. The
 * protection against a renamed field is the runtime assertions, not this.
 */
interface LoadResult {
	configured: boolean;
	photosReady: boolean;
	notesReady: boolean;
	foldersReady: boolean;
	pinsReady: boolean;
	sessionsReady: boolean;
	entries: NotebookEntry[];
	sessions: NotebookSession[];
	folders: NotebookFolder[];
	activity: { id: string; last_activity_at: string }[];
	sectionLabel: string | null;
	canReview: boolean;
	uploadReady: boolean;
	initialCheckIn: { sessionId: string; sectionId: string } | null;
}

/**
 * Calls the REAL load the way SvelteKit would, for `user` against `database`.
 *
 * `query` is the page's own URL search string. It is a real URL rather than a
 * bare object because the load reads `url.searchParams` -- the deep link an
 * IDEA Classroom check-in card arrives on -- and handing it something
 * searchParams-shaped would test this file's idea of the event instead of
 * SvelteKit's.
 */
function runLoad(
	database: TestDb,
	keys: Awaited<ReturnType<typeof loadForeignKeys>>,
	user: SeededUser,
	query = ''
) {
	return (load as unknown as (event: unknown) => Promise<LoadResult>)({
		url: new URL(`http://localhost/notebook${query}`),
		locals: {
			supabase: createPostgrestShim(database, keys, user.id),
			claims: { sub: user.id, email: user.email, role: 'authenticated' }
		}
	});
}

beforeAll(async () => {
	db = await startTestDb(FULL_CHAIN);
	fks = await loadForeignKeys(db);

	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	instructor = await createUser(db, 'instructor@boscotech.edu', 'Ada Instructor');

	sectionId = await createClassroomSection(db, {
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

	// A real check-in, through the real 0098 RPC (uuid[] of sections).
	checkInId = await db.asUser(instructor.id, async (q) => {
		const { rows } = await q<{ result: { session_id: string } }>(
			'select public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4) as result',
			[[sectionId], 3, '2026-08-10', 'Gearbox teardown']
		);
		return rows[0].result.session_id;
	});

	// Alice's own work, created through the real RPCs: one entry filed against
	// the check-in (with a photo), and one free entry carrying a written note.
	linkedEntryId = await db.asUser(alice.id, async (q) => {
		const { rows } = await q<{ result: { entry_id: string } }>(
			'select public.notebook_create_entry($1, $2, $3, $4, $5, $6) as result',
			[alice.id, 'drive-alice-1', checkInId, sectionId, null, 'IMG_0042.jpg']
		);
		return rows[0].result.entry_id;
	});
	freeEntryId = await db.asUser(alice.id, async (q) => {
		// The stored note shape (0078): blocks of typed runs, not Tiptap JSON --
		// the route normalizes into this before the RPC ever sees it.
		const content = JSON.stringify([
			{ type: 'p', runs: [{ text: 'Bearing preload measured at 0.004 in.' }] }
		]);
		const { rows } = await q<{ result: { entry_id: string } }>(
			'select public.notebook_create_note_entry($1::jsonb, $2, null, null) as result',
			[content, 'Bearing notes']
		);
		return rows[0].result.entry_id;
	});
	// A folder (0088) and a pin (0091), so both of those capabilities are
	// exercised by something real rather than by an empty list.
	await db.asUser(alice.id, async (q) => {
		await q('select public.notebook_upsert_folder($1, $2, $3)', ['Unit 3', 'gold', null]);
		await q('select public.notebook_set_entry_pinned($1, true)', [freeEntryId]);
	});
}, 180_000);

afterAll(async () => {
	await db?.stop();
	await bare?.stop();
});

/**
 * THE CHECK THAT WAS MISSING, and it needs no load and no shim: hold every
 * embed named in the shipped select strings against the real catalog. This is
 * the assertion that goes red the moment a migration repoints a key out from
 * under one of them.
 */
describe('the shipped select strings against the real schema', () => {
	it('embeds only tables notebook_entries has a real relationship to', () => {
		const seen: string[] = [];
		for (const rung of NOTEBOOK_ENTRY_SELECTS) {
			for (const table of embeddedTables(rung.select)) {
				seen.push(table);
				expect(
					relationshipBetween(fks, 'notebook_entries', table),
					`the /notebook entry select embeds ${table}, but no foreign key relates it to ` +
						`notebook_entries -- PostgREST would answer PGRST200 and the page would ` +
						`report the notebook missing`
				).not.toBeNull();
			}
		}
		// Kept honest: a parser that quietly returned nothing would pass the loop
		// above without checking anything at all.
		expect(new Set(seen)).toEqual(new Set(['notebook_entry_photos', 'notebook_entry_notes']));
	});

	/**
	 * The instructor console's per-entry read (`/notebook/review`), which named
	 * its three embeds inline in the route and so had none of the coverage
	 * above -- the same position the feed's ladder was in on the day 0098 broke
	 * it. It is a DIFFERENT select (one entry by id, `student_id`, and the
	 * folder's NAME through an embed rather than the bare `folder_id`), so it
	 * needs its own assertion rather than riding on the feed's.
	 */
	it('embeds only tables the review console entry read is related to', () => {
		const seen: string[] = [];
		for (const select of REVIEW_ENTRY_SELECTS) {
			for (const table of embeddedTables(select)) {
				seen.push(table);
				expect(
					relationshipBetween(fks, 'notebook_entries', table),
					`the /notebook/review entry select embeds ${table}, but no foreign key ` +
						`relates it to notebook_entries -- PostgREST would answer PGRST200 and ` +
						`the console would report the entry unavailable`
				).not.toBeNull();
			}
		}
		// Kept honest the same way: names the three relations this read depends
		// on, so a parser returning nothing cannot pass the loop vacuously, and
		// an embed quietly added or dropped shows up here.
		expect(new Set(seen)).toEqual(
			new Set(['notebook_entry_photos', 'notebook_entry_notes', 'notebook_folders'])
		);
	});

	it('reads check-in labels through a table that IS related, not an embed', () => {
		// The two halves of the fix, stated as schema facts: there is no key for
		// the old embed to resolve through...
		expect(relationshipBetween(fks, 'notebook_entries', 'notebook_sessions')).toBeNull();
		// ...and the posting, which the quick-picks read instead, does have one.
		expect(relationshipBetween(fks, 'notebook_session_postings', 'notebook_sessions')).not.toBeNull();
		// The plain per-entry read names no embed at all, so nothing to resolve.
		expect(embeddedTables(NOTEBOOK_SESSION_SELECT)).toEqual([]);
		expect(embeddedTables(NOTEBOOK_POSTING_SELECT)).toEqual(['notebook_sessions']);
	});

	it('would still catch the original bug: the old embed is unresolvable', async () => {
		// The exact select string that shipped, run through the shim. If this
		// ever stops failing, the shim has stopped resolving embeds the way
		// PostgREST does and every assertion in this file is worth less.
		const legacy = `id, custom_label, notebook_sessions ( session_label, unit_number, session_date )`;
		const { data, error } = await createPostgrestShim(db, fks, alice.id)
			.from('notebook_entries')
			.select(legacy);
		expect(data).toBeNull();
		expect(error?.code).toBe('PGRST200');
		expect(error?.message).toContain('notebook_sessions');
	});
});

describe('the real load against the full chain (0069 through 0099)', () => {
	let result: LoadResult;
	beforeAll(async () => {
		result = await runLoad(db, fks, alice);
	});

	it('reports the notebook available, with every capability present', () => {
		// The headline: this is the assertion that was false in production.
		expect(result.configured).toBe(true);
		expect(result.photosReady).toBe(true);
		expect(result.notesReady).toBe(true);
		expect(result.foldersReady).toBe(true);
		expect(result.pinsReady).toBe(true);
		expect(result.sessionsReady).toBe(true);
	});

	it('returns the student’s own entries, newest first', () => {
		expect(result.entries.map((e) => e.id).sort()).toEqual([freeEntryId, linkedEntryId].sort());
		const stamps = result.entries.map((e) => e.upload_timestamp);
		expect([...stamps].sort().reverse()).toEqual(stamps);
	});

	it('names the check-in a linked entry was filed against', () => {
		const linked = result.entries.find((e) => e.id === linkedEntryId);
		// The value the retired embed used to supply, now read separately -- and
		// the reason the entry does not just read "IMG_0042".
		expect(linked?.session_id).toBe(checkInId);
		expect(linked?.session?.session_label).toBe('Gearbox teardown');
		expect(linked?.session?.unit_number).toBe(3);
		// ...while a free entry genuinely has none, rather than everything being
		// null because the read failed.
		expect(result.entries.find((e) => e.id === freeEntryId)?.session).toBeNull();
	});

	it('carries photos, notes, folders and the pin stamp', () => {
		const linked = result.entries.find((e) => e.id === linkedEntryId);
		expect(linked?.photos).toHaveLength(1);
		expect(linked?.photos[0].drive_file_id).toBe('drive-alice-1');
		expect(linked?.photos[0].original_filename).toBe('IMG_0042.jpg');

		const free = result.entries.find((e) => e.id === freeEntryId);
		expect(free?.notes).toHaveLength(1);
		expect(free?.pinned_at).not.toBeNull();

		expect(result.folders.map((f) => f.name)).toEqual(['Unit 3']);
		expect(result.activity.map((a) => a.id).sort()).toEqual([freeEntryId, linkedEntryId].sort());
	});

	it('offers the check-ins from the classes the student is actually enrolled in', () => {
		expect(result.sectionLabel).toBe('ENG1H · Period 2');
		expect(result.sessions).toHaveLength(1);
		expect(result.sessions[0]).toMatchObject({
			id: checkInId,
			section_id: sectionId,
			unit_number: 3,
			session_label: 'Gearbox teardown'
		});
	});

	it('shows a classmate none of it', async () => {
		// Not a claim about this change -- a guard on the shim. If it were
		// bypassing RLS, every assertion above would be measuring the wrong
		// thing.
		const bob = await createUser(db, 'bob@boscotech.net', 'Bob Brooks');
		const asBob = await runLoad(db, fks, bob);
		expect(asBob.configured).toBe(true);
		expect(asBob.entries).toEqual([]);
	});

	/**
	 * `?checkin=&section=` -- the deep link an IDEA Classroom stream card
	 * arrives on. It is resolved against `sessions`, the list this load just
	 * built from the student's OWN classes, so the interesting property is not
	 * that a real id resolves but that anything else lands on null: a URL
	 * parameter must not be able to point the page at a check-in it was not
	 * already offering.
	 */
	describe('the check-in deep link', () => {
		it('resolves a check-in the student really has', async () => {
			const linked = await runLoad(db, fks, alice, `?checkin=${checkInId}&section=${sectionId}`);
			expect(linked.initialCheckIn).toEqual({ sessionId: checkInId, sectionId });
		});

		it('is absent when nothing is asked for', () => {
			expect(result.initialCheckIn).toBeNull();
		});

		it('refuses a check-in that is not this student’s', async () => {
			// A real check-in, in a class Bob is not in. He can see the row (0069
			// makes notebook_sessions readable), which is exactly why the load
			// validates against HIS OWN sessions rather than against existence.
			const bob = await createUser(db, 'bo@boscotech.net', 'Bo Brooks');
			const asBob = await runLoad(db, fks, bob, `?checkin=${checkInId}&section=${sectionId}`);
			expect(asBob.sessions).toEqual([]);
			expect(asBob.initialCheckIn).toBeNull();
		});

		it('refuses an id that names nothing, without failing the page', async () => {
			const junk = await runLoad(
				db,
				fks,
				alice,
				'?checkin=00000000-0000-0000-0000-000000000000&section=nonsense'
			);
			expect(junk.initialCheckIn).toBeNull();
			// The page still loaded normally around it.
			expect(junk.configured).toBe(true);
			expect(junk.sessions).toHaveLength(1);
		});

		it('falls back to the check-in’s only posting when no section is named', async () => {
			const noSection = await runLoad(db, fks, alice, `?checkin=${checkInId}`);
			expect(noSection.initialCheckIn).toEqual({ sessionId: checkInId, sectionId });
		});
	});
});

describe('a database that genuinely has no notebook tables', () => {
	let result: LoadResult;
	beforeAll(async () => {
		bare = await startTestDb(NO_NOTEBOOK_CHAIN);
		const bareFks = await loadForeignKeys(bare);
		const student = await createUser(bare, 'alice@boscotech.net', 'Alice Alvarez');
		result = await runLoad(bare, bareFks, student);
	}, 180_000);

	it('reports the notebook unavailable instead of throwing', () => {
		expect(result.configured).toBe(false);
		expect(result.entries).toEqual([]);
	});

	it('leaves every capability off and every list empty', () => {
		expect(result.photosReady).toBe(false);
		expect(result.notesReady).toBe(false);
		expect(result.foldersReady).toBe(false);
		expect(result.pinsReady).toBe(false);
		expect(result.folders).toEqual([]);
		expect(result.activity).toEqual([]);
		expect(result.sessions).toEqual([]);
	});
});
