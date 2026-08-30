<script lang="ts">
	import { page } from '$app/state';
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import type { ItemDoc } from '$lib/classroom/classroom-doc';
	import type { TiptapNode } from '$lib/rich-text';
	import type { NotebookFlagReason, NotebookPhoto, NotebookStatus } from '$lib/notebook';
	import type { NoteDoc, NotebookNoteRow } from '$lib/notebook-notes';
	import {
		type GridCell,
		type GridSession,
		type GridStudent,
		type ReviewEntry,
		type ReviewResult,
		type ReviewSection,
		type ReviewTransports,
		type SectionGrid
	} from '$lib/notebook-review';
	import {
		criterionMax,
		levelIndexForScore,
		type RubricCriterion
	} from '$lib/classroom/assignment-spec';
	import type {
		DocCheckData,
		DocCheckResult,
		DocCheckSubmission,
		DocCheckTransports,
		GradeOutcome,
		LinkableItem,
		UnitItemLink
	} from '$lib/notebook-documentation-check';

	/**
	 * Dev harness: mounts the REAL ReviewConsole (and with it the real
	 * SessionManager, SectionGrid, EntryReview and NotebookPhotos) against an
	 * in-memory store that mirrors 0069's actual rules -- no auth, no
	 * Supabase, no Drive.
	 *
	 * The store is not a stub that always says yes. It reproduces the parts of
	 * `notebook_get_section_grid` whose OUTPUT the UI is written against (the
	 * roster union, latest-entry-per-cell, entry_count, the
	 * America/Los_Angeles-date on_time comparison, excusals, free_entries) AND
	 * the instructor-or-admin refusal every notebook RPC performs -- so
	 * "an instructor cannot reach another section's grid" is demonstrable
	 * here, not merely assumed from the route's own scoping.
	 *
	 * Every transport call is logged VERBATIM, which is how "a flag reaches
	 * notebook_flag_entry with these exact arguments" is verified rather than
	 * assumed.
	 *
	 * Viewers:
	 *  - "instructor" -- teaches section A only. Must not see section B.
	 *  - "reviewer"   -- the 0169 SECTION REVIEWER tier: reviews section A,
	 *                    manages nothing. Sees A's grid and review actions and
	 *                    must see NO Check-ins tab, NO Grade unit tab and NO
	 *                    delete controls.
	 *  - "chair"      -- the 0067 admin tier. Sees both.
	 */

	type Viewer = 'instructor' | 'chair' | 'reviewer';
	/**
	 * `?viewer=` and `?nosections=1` seed the switches, so the browser-verify
	 * specs can drive a fixed viewer without scripting the select. Seeded ONCE,
	 * exactly like `initialSectionId`: the harness bar owns them afterwards.
	 */
	const askedViewer = page.url.searchParams.get('viewer');
	let viewer = $state<Viewer>(
		askedViewer === 'chair' || askedViewer === 'reviewer' ? askedViewer : 'instructor'
	);
	let log = $state<string[]>([]);
	/** 0069 unapplied (the fail-soft card), the /dev/notebook toggle. */
	let configured = $state(true);
	/** 0097 unapplied: the Documentation Check panel is simply absent. */
	let docCheckReady = $state(true);
	/** A teacher of some OTHER section: nothing here is theirs to see. */
	let noSections = $state(page.url.searchParams.get('nosections') === '1');

	// Staff identity is an EMAIL since 0094 (classroom_sections.teacher_email),
	// so the old instructor/chair uuids are gone with the check that used them.
	const INSTRUCTOR_EMAIL = 'ines.tructor@boscotech.edu';

	/**
	 * The 0169 SECTION REVIEWER viewer: holds a notebook_section_reviewers row
	 * for P2 (sec-a) and manages nothing anywhere. The console must show them
	 * the grid and the review actions for that one section, and NO Check-ins
	 * tab, NO Grade unit tab and NO delete controls -- absence, per section,
	 * on the `manages` flag the server load computes.
	 */
	const REVIEWED_SECTION_IDS = new Set(['sec-a']);

	// Since 0094 these are CLASSROOM sections (0082) and "the instructor" is the
	// teacher of record, matched by email rather than by uuid. `manages` is the
	// VIEWER's flag, not the section's, so it is computed per viewer where
	// `visibleSections` is built, never stored here.
	const SECTIONS: Omit<ReviewSection, 'manages'>[] = [
		{
			id: 'sec-a',
			course_code: 'ENG1H',
			course_title: 'Engineering I Honors',
			label: 'Period 2',
			block: 'B',
			teacher_email: INSTRUCTOR_EMAIL
		},
		{
			id: 'sec-b',
			course_code: 'ENG1H',
			course_title: 'Engineering I Honors',
			label: 'Period 4',
			block: null,
			teacher_email: 'someone.else@boscotech.edu'
		}
	];

	// ---- the in-memory database -------------------------------------------

	/**
	 * Since 0098 a check-in is ONE canonical record with a posting per section,
	 * so the store holds the full set rather than a single owner. GridSession
	 * already carries `section_ids`, so nothing is added here at all.
	 */
	type StoreSession = GridSession & { section_ids: string[] };
	interface StoreEntry {
		id: string;
		student_id: string;
		section_id: string;
		session_id: string | null;
		custom_label: string | null;
		upload_timestamp: string;
		status: NotebookStatus;
		flag_reason: NotebookFlagReason | null;
		instructor_comment: string | null;
		/**
		 * The student's own filing (0088), shown to staff as context. Optional
		 * here so the existing fixtures keep meaning "unfiled" without being
		 * rewritten -- which is also the real pre-0088 state.
		 */
		folder_name?: string | null;
		/**
		 * 0121's acknowledgement. Undefined on every seeded fixture, which is the
		 * real state of a class nobody has started reviewing.
		 */
		reviewed_at?: string | null;
		reviewed_by?: string | null;
		photos: NotebookPhoto[];
		/** Written notes (0078). The review panel renders them read-only. */
		notes: NotebookNoteRow[];
	}
	/**
	 * A roster row. Since 0094 enrollment is a classroom_enrollments row keyed
	 * by EMAIL, and `id` is null for a student who has been enrolled but has
	 * never signed in -- a normal state a real roster reaches every August.
	 */
	interface StoreStudent {
		id: string | null;
		name: string;
		email: string;
		/** The section they are ACTIVELY enrolled in, or null once they leave. */
		section_id: string | null;
	}

	/**
	 * TODAY AND THE DAYS AROUND IT, ON THE AMERICA/LOS_ANGELES CALENDAR -- the
	 * one `notebook_get_section_grid` adjudicates `session_date` in, and the same
	 * `en-CA` spelling the column holds, so every comparison below is lexical.
	 *
	 * COMPUTED, NEVER HARDCODED, and that is the whole reason it exists. The
	 * fixture dates above it are pinned literals, which is right for a check-in
	 * whose whole job is to be in the past; a SCHEDULED check-in is defined by
	 * being ahead of whenever you are reading, so a pinned date would quietly
	 * become an ordinary missing column at some point and the state this harness
	 * exists to show would stop appearing, with nothing to say so.
	 */
	function laDay(offsetDays: number): string {
		const d = new Date();
		d.setDate(d.getDate() + offsetDays);
		return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
	}
	const LA_TODAY = laDay(0);

	let sessions = $state<StoreSession[]>([
		// `guidance_doc: null` on every check-in without a prompt, never absent:
		// a real read on the widest rung returns the column carrying null, and
		// `undefined` is the different fact that the rung did not carry it. The
		// console reads exactly that difference to decide whether this project
		// can hold guidance at all, so a harness that left the key off would be
		// simulating a pre-0123 database while claiming to be a current one.
		{ id: 'ses-a1', section_ids: ['sec-a'], unit_number: 3, session_date: '2026-08-03', session_label: 'Design brief', guidance_doc: null },
		// SHARED ACROSS BOTH SECTIONS: the case the whole change exists for.
		// One record, one date, a column in each of the two grids.
		{ id: 'ses-a2', section_ids: ['sec-a', 'sec-b'], unit_number: 3, session_date: '2026-08-05', session_label: 'Shaft stackup calcs', guidance_doc: null },
		// CARRIES A PROMPT ALREADY (0123), so the field opens on a real document
		// rather than only on an empty one -- the seed path is where a `{#key}`
		// bug hides. `ses-a2` is shared across two sections and has none, which is
		// the pair the "every class reads the same prompt" hint is about.
		{
			id: 'ses-a3',
			section_ids: ['sec-a'],
			unit_number: 3,
			session_date: '2026-08-07',
			session_label: 'Bearing teardown',
			guidance_doc: [
				{
					type: 'p',
					runs: [{ text: 'Photograph both pages of your teardown notes, flat and in focus.' }]
				}
			]
		},
		{ id: 'ses-a4', section_ids: ['sec-a'], unit_number: 2, session_date: '2026-07-28', session_label: 'Shop safety walk', guidance_doc: null },
		// SCHEDULED, NOT MISSING (0140): dated ten days ahead of whenever this
		// harness is opened, which is a teacher laying out the rest of the unit.
		// Every cell in this column reads `scheduled` -- except Ana's, who filed
		// early below, and Ben's, who is excused ahead: the two arms that outrank
		// it in the RPC, both drivable here rather than argued about.
		{
			id: 'ses-a5',
			section_ids: ['sec-a'],
			unit_number: 3,
			session_date: laDay(10),
			session_label: 'Gearbox reassembly',
			guidance_doc: null
		},
		{ id: 'ses-b1', section_ids: ['sec-b'], unit_number: 3, session_date: '2026-08-04', session_label: 'Gear train sketch', guidance_doc: null }
	]);

	const STUDENTS: StoreStudent[] = [
		{ id: 'stu-1', name: 'Ruiz, Ana', email: 'ana.ruiz@boscotech.net', section_id: 'sec-a' },
		{ id: 'stu-2', name: 'Okafor, Ben', email: 'ben.okafor@boscotech.net', section_id: 'sec-a' },
		{ id: 'stu-3', name: 'Tran, Chloe', email: 'chloe.tran@boscotech.net', section_id: 'sec-a' },
		// Transferred out: NOT on the active roster any more, but holds entries in
		// sec-a, so the RPC's roster UNION must keep them visible (flagged as no
		// longer enrolled).
		{ id: 'stu-4', name: 'Patel, Dev', email: 'dev.patel@boscotech.net', section_id: 'sec-b' },
		{ id: 'stu-5', name: 'Moreno, Eli', email: 'eli.moreno@boscotech.net', section_id: 'sec-b' },
		// ON THE ROSTER, NEVER SIGNED IN. No account, so no uuid at all -- the
		// state that makes the grid's row key the email rather than the id.
		{ id: null, name: 'Newcomer, Dana', email: 'dana.newcomer@boscotech.net', section_id: 'sec-a' },
		// Carries the three REMOVED-PHOTO entries below, on their own row so no
		// other student's tally means something different than its comment says.
		{ id: 'stu-6', name: 'Vega, Frankie', email: 'frankie.vega@boscotech.net', section_id: 'sec-a' }
	];

	function photo(
		id: string,
		seq: number,
		filename: string | null = null,
		variant: 'original' | 'enhanced' = 'original'
	): NotebookPhoto {
		return {
			id,
			drive_file_id: `drive-${id}`,
			variant,
			sequence_order: seq,
			original_filename: filename
		};
	}

	/**
	 * A photo the student removed (0116). The row is STILL in the payload --
	 * the console's select carries `removed_at` and filters nothing server-side
	 * -- so every count and render on this panel has to go through `livePhotos`,
	 * which is the whole point of seeding one here.
	 */
	function removedPhoto(id: string, seq: number, filename: string | null = null): NotebookPhoto {
		return { ...photo(id, seq, filename), removed_at: '2026-08-09T08:00:00Z' };
	}

	let entries = $state<StoreEntry[]>([
		// Ana: three on-time entries -> 3 of 3. The first carries an original +
		// its adjacent 'enhanced' pair, so the review panel's page grouping
		// (corrected shown by default, toggle back to the original) is
		// drivable here.
		mk('e-1', 'stu-1', 'sec-a', 'ses-a1', '2026-08-03T16:10:00Z', 'compliant', [
			photo('p-1', 1, 'brief.jpg'),
			photo('p-1e', 2, 'brief-corrected.jpg', 'enhanced')
		]),
		mk('e-2', 'stu-1', 'sec-a', 'ses-a2', '2026-08-05T15:40:00Z', 'compliant', [photo('p-2', 1, 'stackup.jpg')]),
		// A session-linked entry carrying a note that has already been REVISED:
		// the instructor sees the current text and the earlier version, and no
		// edit control anywhere (0078 refuses it for anyone but the owner, and
		// on a check-in for the owner too).
		mk(
			'e-3',
			'stu-1',
			'sec-a',
			'ses-a3',
			'2026-08-07T15:05:00Z',
			'compliant',
			[photo('p-3', 1)],
			[
				noteRow('n-1', 'e-3', 'n-1', 1, 'Pulled the bearing without the puller.', '2026-08-07T15:06:00Z'),
				noteRow(
					'n-2',
					'e-3',
					'n-1',
					2,
					'Pulled the bearing without the puller, which scored the race.',
					'2026-08-07T15:20:00Z'
				)
			]
		),
		// Ben: one LATE, one FLAGGED, one missing -> 2 of 3, 1 flag. The late
		// one carries a folder, so the staff-facing "Filed under" context (0088)
		// renders on one entry and is absent on every other -- both states.
		{
			...mk('e-4', 'stu-2', 'sec-a', 'ses-a1', '2026-08-06T20:15:00Z', 'compliant', [
				photo('p-4', 1, 'late-brief.jpg')
			]),
			folder_name: 'Gearbox build'
		},
		{
			...mk('e-5', 'stu-2', 'sec-a', 'ses-a2', '2026-08-05T14:00:00Z', 'flagged', [photo('p-5', 1)]),
			flag_reason: 'illegible',
			instructor_comment: 'Pencil is too faint to read past the second page.'
		},
		// Chloe: one excused (below), one resubmitted -> 1 of 3.
		mk('e-6', 'stu-3', 'sec-a', 'ses-a3', '2026-08-07T18:30:00Z', 'pending_review', [
			photo('p-6', 1, 'teardown-1.jpg'),
			photo('p-7', 2, 'teardown-2.jpg')
		]),
		// Dev (transferred in): TWO entries for one check-in -> the cell shows
		// the latest and badges the count.
		mk('e-7', 'stu-4', 'sec-a', 'ses-a3', '2026-08-06T09:00:00Z', 'compliant', [photo('p-8', 1)]),
		mk('e-8', 'stu-4', 'sec-a', 'ses-a3', '2026-08-07T09:00:00Z', 'compliant', [photo('p-9', 1, 'redo.jpg')]),
		// ...and a session-less free entry, which has no column but is counted.
		{
			// No photos at all: a written-note entry, which is exactly what the
			// review panel must render rather than an "empty entry" message.
			...mk('e-9', 'stu-4', 'sec-a', null, '2026-08-08T11:00:00Z', 'compliant', [], [
				noteRow(
					'n-3',
					'e-9',
					'n-3',
					1,
					'Measured the bench spacing; the drill press needs another 300mm.',
					'2026-08-08T11:00:00Z'
				)
			]),
			custom_label: 'Shop layout notes'
		},
		// Section B, so the chair has something to switch to -- and it is the
		// TEXT-ONLY CHECK-IN (0114): an entry filed against a scheduled check-in
		// whose whole content is writing. The grid counts ENTRIES, never photos,
		// so its cell reads on-time exactly as a photographed one does; what it
		// exercises is the panel, which must render the writing rather than the
		// "no photos and no written notes" message.
		mk('e-10', 'stu-5', 'sec-b', 'ses-b1', '2026-08-04T17:00:00Z', 'compliant', [], [
			noteRow(
				'n-4',
				'e-10',
				'n-4',
				1,
				'Left my notebook in the shop, so I wrote the belt-tension steps up here and will copy them across tomorrow.',
				'2026-08-04T17:00:00Z'
			)
		]),
		// Filed by a sec-b student against the SHARED check-in (ses-a2). It has
		// to stay on sec-b's grid and off sec-a's, and it is what unposting
		// sec-b must detach rather than destroy.
		mk('e-11', 'stu-4', 'sec-b', 'ses-a2', '2026-08-05T18:20:00Z', 'compliant', [photo('p-11', 1)]),
		// REMOVED PHOTOS (0116), the three shapes this panel has to tell apart, on
		// a student of their own so no existing row's tally changes. All three are
		// filed against check-ins because EntryReview opens from a GRID CELL -- a
		// free entry has no column and could not be opened here at all.
		//
		// e-12: page 2 removed, page 1 still there. One page renders, and the count
		// beside the title says one, through the same `livePhotos` the student's
		// own feed uses.
		{
			...mk(
				'e-12',
				'stu-6',
				'sec-a',
				'ses-a1',
				'2026-08-03T09:15:00Z',
				'compliant',
				[photo('p-12', 1, 'stackup-1.jpg'), removedPhoto('p-13', 2, 'stackup-2-blurred.jpg')],
				[
					noteRow(
						'n-5',
						'e-12',
						'n-5',
						1,
						'Second page came out blurred, so I pulled it and will reshoot it.',
						'2026-08-03T09:20:00Z'
					)
				]
			),
			custom_label: 'Stackup, page 1'
		},
		// e-13: NOTHING LIVE LEFT, and it is reachable rather than hypothetical.
		// The student removed their only page (notebook_remove_photo allows that
		// while a live note remains), and staff then deleted the note --
		// notebook_staff_delete_note carries no shell guard, which is the one path
		// to a submitted entry with no live photo and no live note. Keyed on the
		// raw array length this panel rendered a header and an empty body; it has
		// to say the entry has neither.
		{
			...mk(
				'e-13',
				'stu-6',
				'sec-a',
				'ses-a2',
				'2026-08-05T10:00:00Z',
				'compliant',
				[removedPhoto('p-14', 1, 'reshoot-me.jpg')],
				[
					{
						...noteRow(
							'n-6',
							'e-13',
							'n-6',
							1,
							'Placeholder, will write this up.',
							'2026-08-05T10:05:00Z'
						),
						deleted_at: '2026-08-06T11:00:00Z'
					}
				]
			),
			custom_label: 'Withdrawn page'
		},
		// e-14: THE REAPPEARANCE CASE, which the two above cannot show. Removal is
		// what those fixtures are frozen in; this one exists to be moved, so the
		// count going back UP can be watched rather than reasoned about. Page 2
		// starts removed (count reads 1) and the harness bar's button clears its
		// `removed_at` in this store, exactly as `notebook_restore_photo` clears
		// the column -- so the panel re-derives through `photoPages` and reads 2.
		//
		// THE CONTROL IS THE HARNESS'S, NEVER THE PANEL'S. EntryReview is
		// read-only about photos on purpose (staff restore is its own RPC on the
		// grid's own tools), so a restore button rendered by the component under
		// test would be the harness inventing a surface that does not ship.
		{
			...mk(
				'e-14',
				'stu-6',
				'sec-a',
				'ses-a3',
				'2026-08-07T14:30:00Z',
				'compliant',
				[photo('p-15', 1, 'teardown-a.jpg'), removedPhoto('p-16', 2, 'teardown-b.jpg')]
			),
			custom_label: 'Teardown, restorable page'
		},
		// FILED EARLY against the check-in that has not happened yet (0140). Ana
		// has done next week's work today, so her cell carries her ENTRY and not
		// `scheduled` -- which is the arm that has to outrank the date, and the
		// one that would be easiest to get backwards. It also puts her total one
		// ahead of the rest of the class on the count column, which is the
		// intended reading: the day counts for the student who filed it.
		mk('e-15', 'stu-1', 'sec-a', 'ses-a5', new Date().toISOString(), 'compliant', [
			photo('p-17', 1, 'reassembly-early.jpg')
		])
	]);

	/**
	 * The removed page e-14 exists to put back. Named once here so the button,
	 * its label and the console hook cannot drift onto different rows.
	 */
	const RESTORABLE_PHOTO_ID = 'p-16';

	/** True while e-14's second page is still removed, so the button can say which way it goes. */
	const restorableIsRemoved = $derived(
		!!entries
			.find((e) => e.id === 'e-14')
			?.photos.find((p) => p.id === RESTORABLE_PHOTO_ID)?.removed_at
	);

	/**
	 * Flip one photo's `removed_at`, the way notebook_restore_photo /
	 * notebook_remove_photo do. Reversible on purpose: the reappearance is worth
	 * watching more than once, and a one-way button makes a reload the only way
	 * to see it again.
	 *
	 * IT FIRES THE CHANNEL, like every other write into this store. `loadEntry`
	 * hands the panel a SNAPSHOT (`{ ...entry }`), which is what the real
	 * console gets from notebook_review_entry -- so a store write nothing
	 * announces leaves the open panel showing the count it opened on, and the
	 * restore only appears on the next open. That is the console behaving
	 * correctly and the harness under-driving it, which is precisely the shape
	 * of harness bug that makes a passing drive prove nothing.
	 */
	function setPhotoRemoved(photoId: string, removed: boolean) {
		entries = entries.map((e) => ({
			...e,
			photos: e.photos.map((p) =>
				p.id === photoId ? { ...p, removed_at: removed ? '2026-08-09T08:00:00Z' : null } : p
			)
		}));
		note(`(student) ${removed ? 'removed' : 'restored'} photo ${photoId}`);
		emitChange();
	}

	function mk(
		id: string,
		student_id: string,
		section_id: string,
		session_id: string | null,
		upload_timestamp: string,
		status: NotebookStatus,
		photos: NotebookPhoto[],
		notes: NotebookNoteRow[] = []
	): StoreEntry {
		return {
			id,
			student_id,
			section_id,
			session_id,
			custom_label: null,
			upload_timestamp,
			status,
			flag_reason: null,
			instructor_comment: null,
			photos,
			notes
		};
	}

	/** One stored revision row, in the shape 0078 returns. */
	function noteRow(
		id: string,
		entry_id: string,
		note_id: string,
		revision: number,
		text: string,
		created_at: string
	): NotebookNoteRow {
		const content: NoteDoc = [{ type: 'p', runs: [{ text }] }];
		return { id, entry_id, note_id, revision, content, created_at };
	}

	/**
	 * Chloe is excused from the stackup check-in. Ben is excused AHEAD of time
	 * from a check-in that has not happened yet (a known absence next week),
	 * which is the case that proves an excusal outranks `scheduled` (0140)
	 * rather than the other way round.
	 */
	const EXCUSALS = [
		{ session_id: 'ses-a2', student_id: 'stu-3' },
		{ session_id: 'ses-a5', student_id: 'stu-2' }
	];

	// ---- the RPC's own rules, mirrored -------------------------------------

	const isChair = $derived(viewer === 'chair');

	/** `public.classroom_manages_section(section)` -- teacher of record or admin. */
	function mayManage(sectionId: string): boolean {
		if (isChair) return true;
		return (
			viewer === 'instructor' &&
			SECTIONS.some((s) => s.id === sectionId && s.teacher_email === INSTRUCTOR_EMAIL)
		);
	}

	/**
	 * `public.notebook_reviews_section(section)` (0169) -- manage folded in
	 * first, then the section-scoped reviewer row, exactly the predicate's own
	 * shape. This is what the REVIEW transports check; the manage transports
	 * (sessions, deletes, doc-check) stay on `mayManage`.
	 */
	function mayReview(sectionId: string): boolean {
		if (mayManage(sectionId)) return true;
		return viewer === 'reviewer' && REVIEWED_SECTION_IDS.has(sectionId);
	}

	/**
	 * 0098's _notebook_detach_session_entries: entries filed against a check-in
	 * are DETACHED, never deleted -- session_id nulled, custom_label backfilled
	 * from the check-in's own label. `sectionId` null = every section (delete),
	 * otherwise just that one (unpost, or a reconcile that drops it).
	 */
	function detachFrom(session: StoreSession, sectionId: string | null): number {
		let detached = 0;
		entries = entries.map((e) => {
			if (e.session_id !== session.id) return e;
			if (sectionId !== null && e.section_id !== sectionId) return e;
			detached++;
			return { ...e, session_id: null, custom_label: e.custom_label ?? session.session_label };
		});
		return detached;
	}

	/** The RPC's LA-calendar-date comparison against session_date. */
	function onTime(uploadIso: string, sessionDate: string): boolean {
		const day = new Date(uploadIso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
		return day <= sessionDate;
	}

	function buildGrid(sectionId: string, unitNumber: number | null): SectionGrid {
		const section = SECTIONS.find((s) => s.id === sectionId)!;
		const sessionRows = sessions
			.filter(
				(s) =>
					s.section_ids.includes(sectionId) &&
					(unitNumber === null || s.unit_number === unitNumber)
			)
			.sort(
				(a, b) =>
					a.session_date.localeCompare(b.session_date) ||
					a.unit_number - b.unit_number ||
					a.session_label.localeCompare(b.session_label)
			);

		// Roster (0094): the section's ACTIVE enrollments UNION anyone holding
		// entries or excusals here, keyed by email because a roster row may have
		// no account behind it.
		const sectionSessionIds = new Set(
			sessions.filter((s) => s.section_ids.includes(sectionId)).map((s) => s.id)
		);
		const roster: GridStudent[] = STUDENTS.filter(
			(p) =>
				p.section_id === sectionId ||
				(p.id !== null &&
					(entries.some((e) => e.student_id === p.id && e.section_id === sectionId) ||
						EXCUSALS.some((x) => x.student_id === p.id && sectionSessionIds.has(x.session_id))))
		)
			.map((p) => ({
				student_key: p.email || String(p.id),
				id: p.id,
				name: p.name,
				email: p.email,
				enrolled: p.section_id === sectionId,
				free_entries: entries.filter(
					(e) => p.id !== null && e.student_id === p.id && e.section_id === sectionId && e.session_id === null
				).length,
				...(reviewReady
					? {
							free_entries_unreviewed: entries.filter(
								(e) =>
									p.id !== null &&
									e.student_id === p.id &&
									e.section_id === sectionId &&
									e.session_id === null &&
									!e.reviewed_at
							).length
						}
					: {})
			}))
			.sort((a, b) => a.name.localeCompare(b.name) || a.student_key.localeCompare(b.student_key));

		const cells: GridCell[] = [];
		for (const student of roster) {
			for (const session of sessionRows) {
				const mine = entries
					// SCOPED TO THIS SECTION, which the single-section model got
					// for free: a shared check-in also holds the other class's
					// entries, and they belong on that class's grid.
					.filter(
						(e) =>
							e.student_id === student.id &&
							e.session_id === session.id &&
							e.section_id === sectionId
					)
					.sort((a, b) => b.upload_timestamp.localeCompare(a.upload_timestamp));
				const latest = mine[0];
				const excused = EXCUSALS.some(
					(x) => x.student_id === student.id && x.session_id === session.id
				);
				cells.push({
					student_key: student.student_key,
					student_id: student.id,
					session_id: session.id,
					// THE RPC'S OWN ORDER (0140), mirrored: an entry outranks an
					// excusal, an excusal outranks the date, and only a cell with
					// nothing in it on a day that HAS arrived is missing.
					status: latest
						? latest.status
						: excused
							? 'excused'
							: session.session_date > LA_TODAY
								? 'scheduled'
								: 'missing',
					entry_id: latest?.id ?? null,
					entry_count: mine.length,
					upload_timestamp: latest?.upload_timestamp ?? null,
					on_time: latest ? onTime(latest.upload_timestamp, session.session_date) : null,
					excused,
					flag_reason: latest?.flag_reason ?? null,
					// 0121'S THREE READS, MIRRORED -- and `unreviewed_count` comes
					// from the COUNTS read (every entry in the cell) rather than
					// from the shown one, which is the distinction the RPC makes and
					// the one a badge that agreed with the cell would lose. Absent
					// entirely with the toggle off: the key missing is what a
					// pre-0121 database looks like, and the console has to read that
					// as "cannot answer" rather than as "not reviewed".
					...(reviewReady
						? {
								reviewed: latest ? !!latest.reviewed_at : null,
								reviewed_at: latest?.reviewed_at ?? null,
								unreviewed_count: mine.filter((e) => !e.reviewed_at).length
							}
						: {})
				});
			}
		}

		return {
			section,
			unit_number: unitNumber,
			generated_at: new Date().toISOString(),
			sessions: sessionRows,
			students: roster,
			cells
		};
	}

	function note(line: string) {
		log = [...log, line];
	}

	let nextId = 0;

	// ---- LIVE UPDATES, mirrored --------------------------------------------
	//
	// THREE STATES, because "realtime is unavailable" is two different things
	// and the console has to survive both:
	//
	//   on      the channel delivers. Every write to this store -- including a
	//           second client's -- calls every listener, which is what the real
	//           publication does (your own writes echo back too).
	//   silent  the channel is registered and NOTHING EVER ARRIVES. A dead
	//           socket, a missing publication row, a proxy eating websockets.
	//           The console must still refetch after its own writes.
	//   off     there is no `subscribe` transport at all -- an older deploy, or
	//           a mount that never had one. The console must not show a live
	//           indicator and must still work.
	//
	// The listeners are the channel. `subscribe` returning its own teardown is
	// the same contract `removeChannel` gives the real one, and the log records
	// both ends so a leak is visible rather than inferred.
	type RealtimeMode = 'on' | 'silent' | 'off';
	let realtime = $state<RealtimeMode>('on');
	/** 0121 applied: the grid carries the reviewed dimension and accept works. */
	let reviewReady = $state(true);
	let listeners: (() => void)[] = [];
	let emitted = $state(0);

	function emitChange() {
		if (realtime !== 'on') return;
		emitted++;
		for (const fn of [...listeners]) fn();
	}

	/**
	 * A SECOND CLIENT. Not a fake event: it writes a real row into the same
	 * store the console reads through, then fires the channel -- so what the
	 * console does about it is what it would do about a student filing work.
	 *
	 * Eli is in the OTHER section and sorts FIRST by name, so filing here adds a
	 * row at the TOP of the roster (0094's union keeps anyone holding entries in
	 * the section). That is the case the requirement is about: the instructor's
	 * own row must not move under them when somebody appears above it.
	 */
	function secondClientFiles(studentId: string, sessionId: string) {
		const id = `e-live-${++nextId}`;
		entries = [
			...entries,
			mk(id, studentId, 'sec-a', sessionId, new Date().toISOString(), 'compliant', [
				photo(`p-${id}`, 1, 'filed-live.jpg')
			])
		];
		note(`(second client) student ${studentId} filed ${id} against ${sessionId}`);
		emitChange();
	}

	/** The OTHER instructor acknowledging something, to show convergence. */
	function secondInstructorAccepts() {
		const target = entries.find((e) => e.section_id === 'sec-a' && !e.reviewed_at);
		if (!target) {
			note('(second client) nothing left unreviewed in sec-a');
			return;
		}
		entries = entries.map((e) =>
			e.id === target.id
				? { ...e, reviewed_at: new Date().toISOString(), reviewed_by: 'other-staff-uuid' }
				: e
		);
		note(`(second client) other instructor accepted ${target.id}`);
		emitChange();
	}

	/**
	 * The editor's document -> the STORED shape, the way the real route's
	 * `$lib/server` normalizer does. Paragraphs and text runs only, which is
	 * every document this harness can produce by typing; anything richer is what
	 * the real normalizer is for and is not simulated here, deliberately, rather
	 * than half-simulated into a shape the gate would refuse.
	 */
	function harnessNormalizeDoc(doc: TiptapNode | null): ItemDoc {
		const blocks: ItemDoc = [];
		for (const node of doc?.content ?? []) {
			const text = (node.content ?? []).map((n) => n.text ?? '').join('');
			if (text.trim() !== '') blocks.push({ type: 'p', runs: [{ text }] });
		}
		return blocks;
	}

	const baseTransports: ReviewTransports = {
		async loadSessions(sectionId) {
			note(`select notebook_session_postings where section_id=${JSON.stringify(sectionId)}`);
			return {
				ok: true,
				// Every section each one runs in, not just the one asked about --
				// what the real transport's two-step read is for.
				value: sessions.filter((s) => s.section_ids.includes(sectionId)).map((s) => ({ ...s }))
			};
		},

		/**
		 * THE GUIDANCE WRITE (0123), answered in memory.
		 *
		 * IT MIRRORS THE REAL MECHANISM RATHER THAN SHORTCUTTING IT: the manager
		 * check is the same `mayManage` over EVERY section the check-in runs in
		 * that the edit path uses (`_notebook_manages_session`'s own bar), null
		 * and an empty document collapse to one cleared state exactly as the RPC
		 * folds them, and the document is stored in the STORED shape -- not the
		 * editor's -- because that is what crosses the real route's normalizer.
		 * A harness missing the guard the real page has makes a passing drive
		 * prove nothing.
		 */
		async setSessionGuidance(sessionId, doc) {
			note(`POST /api/notebook/session-guidance ${sessionId} ${doc ? 'doc' : 'null'}`);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) return { ok: false, error: 'That check-in does not exist.' };
			if (!session.section_ids.every(mayManage)) {
				return {
					ok: false,
					error:
						'Only the teacher of record for every class this check-in runs in can write its guidance.'
				};
			}
			const stored = harnessNormalizeDoc(doc);
			const cleared = stored.length === 0;
			sessions = sessions.map((s) =>
				s.id === sessionId ? { ...s, guidance_doc: cleared ? null : stored } : s
			);
			emitChange();
			return { ok: true, value: { cleared } };
		},

		async saveSession(input) {
			note(`rpc notebook_admin_upsert_session ${JSON.stringify(input)}`);
			// ALL-OR-NOTHING over every target, the real _notebook_check_session_targets.
			if (input.section_ids.length === 0) {
				return { ok: false, error: 'Select at least one section for this check-in.' };
			}
			if (!input.section_ids.every(mayManage)) {
				return {
					ok: false,
					error: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			if (input.session_label.trim() === '') {
				return { ok: false, error: 'A session label is required.' };
			}
			if (input.id) {
				const existing = sessions.find((s) => s.id === input.id);
				if (!existing) return { ok: false, error: 'That session does not exist.' };
				// Editing needs EVERY section it runs in, not just the ones
				// being listed -- otherwise reconcile-to-mine would be a way to
				// seize a shared check-in.
				if (!existing.section_ids.every(mayManage)) {
					return {
						ok: false,
						error:
							'Only the teacher of record for every section this check-in runs in can edit it.'
					};
				}
				const dropped = existing.section_ids.filter((id) => !input.section_ids.includes(id));
				for (const id of dropped) detachFrom(existing, id);
				sessions = sessions.map((s) =>
					s.id === input.id
						? {
								...s,
								unit_number: input.unit_number,
								session_date: input.session_date,
								session_label: input.session_label,
								section_ids: [...input.section_ids]
							}
						: s
				);
				return { ok: true, value: { session_id: input.id } };
			}
			const id = `ses-new-${++nextId}`;
			sessions = [
				...sessions,
				{
					id,
					section_ids: [...input.section_ids],
					unit_number: input.unit_number,
					session_date: input.session_date,
					session_label: input.session_label,
					// NULL, not absent: a real widest-rung read returns the column with
					// a null in it, and `undefined` is the different fact that the read
					// never asked for it. The console tells the two apart to decide
					// whether to offer the field at all, so the harness must too.
					guidance_doc: null
				}
			];
			return { ok: true, value: { session_id: id } };
		},

		async addSessionSections(sessionId, sectionIds) {
			note(
				`rpc notebook_add_session_postings ${JSON.stringify({ p_session_id: sessionId, p_section_ids: sectionIds })}`
			);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) return { ok: false, error: 'That session does not exist.' };
			if (!session.section_ids.every(mayManage)) {
				return {
					ok: false,
					error:
						'Only the teacher of record for every section this check-in runs in can add another.'
				};
			}
			if (!sectionIds.every(mayManage)) {
				return {
					ok: false,
					error: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			const added = sectionIds.filter((id) => !session.section_ids.includes(id));
			sessions = sessions.map((s) =>
				s.id === sessionId ? { ...s, section_ids: [...s.section_ids, ...added] } : s
			);
			return { ok: true, value: { added: added.length } };
		},

		async removeSessionSection(sessionId, sectionId) {
			note(
				`rpc notebook_remove_session_posting ${JSON.stringify({ p_session_id: sessionId, p_section_id: sectionId })}`
			);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session || !session.section_ids.includes(sectionId)) {
				return { ok: false, error: 'That check-in does not run in that section.' };
			}
			// THE WEAKER PERMISSION, deliberately: taking your own class off a
			// shared check-in needs only that section.
			if (!mayManage(sectionId)) {
				return {
					ok: false,
					error: "Only the section's teacher of record or a site admin can remove it."
				};
			}
			if (session.section_ids.length <= 1) {
				return { ok: true, value: { ok: false, reason: 'last_posting' } };
			}
			const detached = detachFrom(session, sectionId);
			sessions = sessions.map((s) =>
				s.id === sessionId
					? { ...s, section_ids: s.section_ids.filter((id) => id !== sectionId) }
					: s
			);
			return {
				ok: true,
				value: { ok: true, detached_entries: detached, remaining: session.section_ids.length - 1 }
			};
		},

		async deleteSession(sessionId) {
			note(`rpc notebook_admin_delete_session ${JSON.stringify({ p_session_id: sessionId })}`);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) return { ok: false, error: 'That session does not exist.' };
			if (!session.section_ids.every(mayManage)) {
				return {
					ok: false,
					error:
						'Only the teacher of record for every section this check-in runs in can delete it.'
				};
			}
			const detached = detachFrom(session, null);
			sessions = sessions.filter((s) => s.id !== sessionId);
			return { ok: true, value: { detached_entries: detached } };
		},

		async loadGrid(sectionId, unitNumber) {
			note(
				`rpc notebook_get_section_grid ${JSON.stringify({ p_section_id: sectionId, p_unit_number: unitNumber })}`
			);
			if (!SECTIONS.some((s) => s.id === sectionId)) {
				return { ok: false, error: 'That section does not exist.' };
			}
			if (!mayReview(sectionId)) {
				return {
					ok: false,
					error: 'Only the section instructor, a section reviewer, or a site admin can view the notebook grid.'
				};
			}
			return { ok: true, value: buildGrid(sectionId, unitNumber) };
		},

		async loadEntry(entryId) {
			note(`select notebook_entries where id=${JSON.stringify(entryId)}`);
			const entry = entries.find((e) => e.id === entryId);
			// RLS: staff read entries of sections they own; anything else is
			// simply not there.
			if (!entry || !mayReview(entry.section_id)) {
				return { ok: false, error: 'That entry is no longer available.' };
			}
			return { ok: true, value: { ...entry } as ReviewEntry };
		},

		async flagEntry(entryId, reason, comment) {
			note(
				`rpc notebook_flag_entry ${JSON.stringify({
					p_entry_id: entryId,
					p_flag_reason: reason,
					p_instructor_comment: comment
				})}`
			);
			const entry = entries.find((e) => e.id === entryId);
			if (!entry) return { ok: false, error: 'That entry does not exist.' };
			if (!mayReview(entry.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor, a section reviewer, or a site admin can flag notebook entries.'
				};
			}
			entries = entries.map((e) =>
				e.id === entryId
					? { ...e, status: 'flagged', flag_reason: reason, instructor_comment: comment }
					: e
			);
			emitChange();
			return { ok: true, value: undefined };
		},

		async resolveEntry(entryId, comment) {
			note(
				`rpc notebook_resolve_entry ${JSON.stringify({
					p_entry_id: entryId,
					p_instructor_comment: comment
				})}`
			);
			const entry = entries.find((e) => e.id === entryId);
			if (!entry) return { ok: false, error: 'That entry does not exist.' };
			if (!mayReview(entry.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor, a section reviewer, or a site admin can resolve notebook entries.'
				};
			}
			entries = entries.map((e) =>
				e.id === entryId
					? {
							...e,
							status: 'compliant',
							flag_reason: null,
							instructor_comment: comment ?? e.instructor_comment
						}
					: e
			);
			emitChange();
			return { ok: true, value: undefined };
		},

		/**
		 * 0121's notebook_accept_entry, refusals and all: the gate, the deleted
		 * check, the draft check, and -- the one that matters for the panel --
		 * status, flag_reason and instructor_comment untouched.
		 */
		async acceptEntry(entryId) {
			note(`rpc notebook_accept_entry ${JSON.stringify({ p_entry_id: entryId })}`);
			const entry = entries.find((e) => e.id === entryId);
			if (!entry) return { ok: false, error: 'That entry does not exist.' };
			if (!mayReview(entry.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor, a section reviewer, or a site admin can review notebook entries.'
				};
			}
			entries = entries.map((e) =>
				e.id === entryId
					? { ...e, reviewed_at: new Date().toISOString(), reviewed_by: 'staff-uuid' }
					: e
			);
			emitChange();
			return { ok: true, value: undefined };
		},

		/** 0121's notebook_unaccept_entry, including its flagged refusal. */
		async unacceptEntry(entryId) {
			note(`rpc notebook_unaccept_entry ${JSON.stringify({ p_entry_id: entryId })}`);
			const entry = entries.find((e) => e.id === entryId);
			if (!entry) return { ok: false, error: 'That entry does not exist.' };
			if (!mayReview(entry.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor, a section reviewer, or a site admin can review notebook entries.'
				};
			}
			if (entry.status === 'flagged') {
				return {
					ok: false,
					error: 'That entry is flagged, so it cannot be marked unreviewed. Resolve the flag instead.'
				};
			}
			entries = entries.map((e) =>
				e.id === entryId ? { ...e, reviewed_at: null, reviewed_by: null } : e
			);
			emitChange();
			return { ok: true, value: undefined };
		},

		async deleteEntry(entryId) {
			note(`rpc notebook_staff_delete_entry ${JSON.stringify({ p_entry_id: entryId })}`);
			const entry = entries.find((e) => e.id === entryId);
			if (!entry) return { ok: false, error: 'That entry does not exist.' };
			if (!mayManage(entry.section_id)) {
				return {
					ok: false,
					error: 'That entry does not exist, or is not in a class you manage.'
				};
			}
			entries = entries.filter((e) => e.id !== entryId);
			emitChange();
			return { ok: true, value: undefined };
		},

		async deleteNote(noteId) {
			note(`rpc notebook_staff_delete_note ${JSON.stringify({ p_note_id: noteId })}`);
			const entry = entries.find((e) => e.notes.some((n) => n.note_id === noteId));
			if (!entry || !mayManage(entry.section_id)) {
				return { ok: false, error: 'That note does not exist, or is not one you manage.' };
			}
			if (entry.notes.find((n) => n.note_id === noteId)?.deleted_at) {
				return { ok: false, error: 'That note has already been deleted.' };
			}
			entries = entries.map((e) =>
				e.id === entry.id
					? {
							...e,
							notes: e.notes.map((n) =>
								n.note_id === noteId
									? { ...n, deleted_at: new Date().toISOString(), deleted_by: 'staff-uuid' }
									: n
							)
						}
					: e
			);
			emitChange();
			return { ok: true, value: undefined };
		},

		subscribe(sectionId, onChange) {
			note(`realtime subscribe channel=notebook-review-${sectionId}`);
			const fn = onChange;
			listeners = [...listeners, fn];
			return () => {
				note(`realtime removeChannel notebook-review-${sectionId}`);
				listeners = listeners.filter((l) => l !== fn);
			};
		}
	};

	/**
	 * `off` DROPS THE KEY rather than handing over a function that does nothing,
	 * because that is the difference the console reads: an absent `subscribe` is
	 * a mount with no live path and no live indicator, where a registered one
	 * that never fires is a socket that is simply quiet. Both have to work, and
	 * they are not the same state.
	 */
	const transports = $derived.by((): ReviewTransports => {
		if (realtime !== 'off') return baseTransports;
		const { subscribe: _dropped, ...rest } = baseTransports;
		return rest;
	});

	/**
	 * Exactly what the route's load hands the console: scoped per viewer, with
	 * the per-section `manages` flag the load computes -- reviewed-only
	 * sections arrive `manages: false`, which is what withholds the Check-ins
	 * tab, the Grade unit tab and the delete controls for them.
	 */
	const visibleSections: ReviewSection[] = $derived(
		noSections
			? []
			: SECTIONS.filter((s) => mayReview(s.id)).map((s) => ({
					...s,
					manages: mayManage(s.id)
				}))
	);

	/**
	 * `?section=` -- the deep link a class page uses. Validated against the
	 * list this viewer is being offered, exactly as the real load validates it,
	 * so a foreign id preselects nothing rather than a section the grid would
	 * refuse.
	 */
	const askedSection = $derived.by(() => {
		const asked = page.url.searchParams.get('section');
		return visibleSections.some((s) => s.id === asked) ? asked : null;
	});

	/** `?bare=1`: the console with none of the harness's own chrome. */
	const bare = $derived(page.url.searchParams.get('bare') === '1');

	// ---- Documentation Check (0097 + Classroom's grading RPC), mirrored -----
	//
	// The store reproduces the rules the UI is written against, not a stub that
	// always says yes: which assignments a section may be graded on, the
	// composite "posted to this section" requirement 0097's FK enforces, and --
	// the important one -- classroom_can_review_submission, so
	// "a teacher of one class cannot grade another class's student" is
	// demonstrable here rather than assumed. Grades land in the same
	// {itemId|email} shape classroom_submissions holds them in.

	interface StoreItem extends LinkableItem {
		kind: 'assignment' | 'material';
		/** classroom_postings: which sections this one canonical item is in. */
		section_ids: string[];
	}

	const ITEMS: StoreItem[] = [
		{ id: 'itm-doc3', title: 'Unit 3 Documentation Check', points: 25, kind: 'assignment', section_ids: ['sec-a'] },
		{ id: 'itm-gearbox', title: 'Gearbox teardown writeup', points: 40, kind: 'assignment', section_ids: ['sec-a'] },
		{ id: 'itm-syllabus', title: 'Course syllabus', points: null, kind: 'material', section_ids: ['sec-a'] },
		{ id: 'itm-doc-b', title: 'Unit 3 Documentation Check (P4)', points: 25, kind: 'assignment', section_ids: ['sec-b'] }
	];

	let docLinks = $state<UnitItemLink[]>([]);
	let docRubrics = $state<Record<string, RubricCriterion[]>>({});
	let docSubmissions = $state<Record<string, DocCheckSubmission>>({});

	function docFail(message: string): DocCheckResult<never> {
		return { ok: false, error: message };
	}

	/** `classroom_can_review_submission(item, email)`, mirrored exactly. */
	function mayReviewSubmission(itemId: string, email: string): boolean {
		const item = ITEMS.find((i) => i.id === itemId);
		if (!item) return false;
		return item.section_ids.some(
			(sid) =>
				mayManage(sid) &&
				STUDENTS.some((s) => s.email === email && s.section_id === sid)
		);
	}

	const docCheckTransports: DocCheckTransports = {
		async load(sectionId, unitNumber) {
			log = [...log, `docCheck.load(${sectionId}, ${unitNumber})`];
			if (!mayManage(sectionId)) return docFail('Only the section instructor or a site admin can view this.');
			const link = docLinks.find((l) => l.section_id === sectionId && l.unit_number === unitNumber) ?? null;
			const candidates: LinkableItem[] = ITEMS.filter(
				(i) => i.kind === 'assignment' && i.section_ids.includes(sectionId)
			).map((i) => ({ id: i.id, title: i.title, points: i.points }));
			const item = link ? (ITEMS.find((i) => i.id === link.item_id) ?? null) : null;
			const submissions: Record<string, DocCheckSubmission> = {};
			if (item) {
				for (const [key, row] of Object.entries(docSubmissions)) {
					if (key.startsWith(`${item.id}|`)) submissions[row.student_email] = row;
				}
			}
			const value: DocCheckData = {
				link,
				item: item ? { id: item.id, title: item.title, points: item.points } : null,
				rubric: item ? (docRubrics[item.id] ?? null) : null,
				submissions,
				candidates
			};
			return { ok: true, value };
		},

		async linkItem(sectionId, unitNumber, itemId) {
			log = [...log, `notebook_link_unit_item(${sectionId}, ${unitNumber}, ${itemId})`];
			if (!mayManage(sectionId)) {
				return docFail('Only the section instructor or a site admin can link a Documentation Check.');
			}
			const item = ITEMS.find((i) => i.id === itemId);
			if (!item) return docFail('That classwork item does not exist.');
			if (item.kind !== 'assignment') {
				return docFail(`A Documentation Check has to be an assignment; ${item.kind} cannot be graded.`);
			}
			if (!item.section_ids.includes(sectionId)) {
				return docFail('That assignment is not posted to this class, so this class cannot be graded on it.');
			}
			docLinks = [
				...docLinks.filter((l) => !(l.section_id === sectionId && l.unit_number === unitNumber)),
				{ section_id: sectionId, unit_number: unitNumber, item_id: itemId }
			];
			return { ok: true, value: undefined };
		},

		async unlinkItem(sectionId, unitNumber) {
			log = [...log, `notebook_unlink_unit_item(${sectionId}, ${unitNumber})`];
			if (!mayManage(sectionId)) return docFail('Only the section instructor or a site admin can unlink this.');
			docLinks = docLinks.filter((l) => !(l.section_id === sectionId && l.unit_number === unitNumber));
			return { ok: true, value: undefined };
		},

		async installRubric(itemId, criteria) {
			log = [...log, `classroom_set_rubric(${itemId}, ${criteria.length} criteria)`];
			docRubrics = { ...docRubrics, [itemId]: criteria };
			return { ok: true, value: undefined };
		},

		async gradeSubmission(itemId, studentEmail, scores, comment, release, criterionComments) {
			log = [
				...log,
				`classroom_grade_submission(${itemId}, ${studentEmail}, ${JSON.stringify(scores)}, ${JSON.stringify(comment)}, ${release}, ${JSON.stringify(criterionComments)})`
			];
			if (!mayReviewSubmission(itemId, studentEmail)) {
				return docFail("Only a teacher of record for this student's class can grade this.");
			}
			const criteria = docRubrics[itemId];
			if (!criteria?.length) return docFail('Create a rubric for this assignment before grading.');

			// The 0095 rules the panel must render: an off-level score needs a
			// comment, and a release needs every criterion scored.
			const uncommented: string[] = [];
			const missing: string[] = [];
			let total = 0;
			for (const c of criteria) {
				const value = scores[c.id];
				if (value == null) {
					missing.push(c.id);
					continue;
				}
				if (value < 0 || value > criterionMax(c)) {
					return docFail(`The score for "${c.criterion}" must be between 0 and ${criterionMax(c)}.`);
				}
				total += value;
				if (levelIndexForScore(c, value) < 0 && !(criterionComments[c.id] ?? '').trim()) {
					uncommented.push(c.id);
				}
			}
			for (const key of Object.keys(scores)) {
				if (!criteria.some((c) => c.id === key)) {
					return docFail(`Score key "${key}" is not a rubric criterion.`);
				}
			}
			if (uncommented.length) {
				const outcome: GradeOutcome = { ok: false, reason: 'override_needs_comment', missing: uncommented };
				return { ok: true, value: outcome };
			}
			if (release && missing.length) {
				const outcome: GradeOutcome = { ok: false, reason: 'incomplete_scores', missing };
				return { ok: true, value: outcome };
			}

			const now = new Date().toISOString();
			const prior = docSubmissions[`${itemId}|${studentEmail}`];
			docSubmissions = {
				...docSubmissions,
				[`${itemId}|${studentEmail}`]: {
					student_email: studentEmail,
					state: release ? 'returned' : (prior?.state ?? 'draft'),
					score: total,
					rubric_scores: { ...scores },
					criterion_comments: { ...criterionComments },
					teacher_comment: comment,
					graded_at: now,
					returned_at: release ? now : (prior?.returned_at ?? null)
				}
			};
			const outcome: GradeOutcome = { ok: true, score: total, state: release ? 'returned' : 'draft' };
			return { ok: true, value: outcome };
		}
	};

	// Console hook, so the grid and the Documentation Check store can be
	// asserted programmatically.
	$effect(() => {
		(window as unknown as Record<string, unknown>).__notebookReview = {
			buildGrid,
			docCheckTransports,
			get docLinks() {
				return docLinks;
			},
			get docRubrics() {
				return docRubrics;
			},
			get docSubmissions() {
				return docSubmissions;
			},
			/**
			 * The same object the console is driving. Exposed so the SCOPING can
			 * be shown to be a real refusal -- an instructor asking the transport
			 * for another section's grid directly -- rather than only a shorter
			 * picker.
			 */
			transports,
			get entries() {
				return entries;
			},
			/**
			 * The removed-photo fixtures, drivable from a script. `setPhotoRemoved`
			 * is the harness's own store write (0116's column, nothing more), so a
			 * verification run can put a page back and re-read the panel's count
			 * without clicking the bar that bare mode hides.
			 */
			setPhotoRemoved,
			RESTORABLE_PHOTO_ID,
			get restorableIsRemoved() {
				return restorableIsRemoved;
			},
			get sessions() {
				return sessions;
			},
			get log() {
				return log;
			},
			setViewer: (v: Viewer) => (viewer = v),
			/**
			 * THE LIVE PATH, drivable from a script. A verification run needs to
			 * be able to write a row as somebody else and fire the channel at a
			 * moment of its own choosing -- clicking a harness button works, but
			 * only from a bar that bare mode hides.
			 */
			secondClientFiles,
			secondInstructorAccepts,
			setRealtime: (m: RealtimeMode) => (realtime = m),
			setReviewReady: (v: boolean) => (reviewReady = v),
			get realtime() {
				return realtime;
			},
			get emitted() {
				return emitted;
			},
			get listenerCount() {
				return listeners.length;
			}
		};
	});
</script>

<svelte:head><title>dev // notebook review</title></svelte:head>

<!--
	`?bare=1` hides the harness's OWN chrome. The console is a full-height
	application above 1024px, so the bar and the log below it are the only
	things that give this page a document scroll at all -- and measuring "the
	console needs no scrolling" through them would be measuring the harness.
	Bare mode is the shipping geometry, mounted by the shipping component.
-->
{#if !bare}
<div class="harness-bar">
	<strong>dev harness</strong>
	<label>
		viewer
		<select bind:value={viewer}>
			<option value="instructor">instructor (teaches P2 only)</option>
			<option value="reviewer">section reviewer (reviews P2)</option>
			<option value="chair">chair / admin (all sections)</option>
		</select>
	</label>
	<label><input type="checkbox" bind:checked={configured} /> 0069 applied</label>
	<label><input type="checkbox" bind:checked={docCheckReady} /> 0097 applied</label>
	<label><input type="checkbox" bind:checked={reviewReady} /> 0121 applied</label>
	<label><input type="checkbox" bind:checked={noSections} /> no sections</label>
	<label>
		realtime
		<select bind:value={realtime} data-testid="realtime-mode">
			<option value="on">on (delivers)</option>
			<option value="silent">silent (dead socket)</option>
			<option value="off">off (no transport)</option>
		</select>
	</label>
	<button type="button" data-testid="second-client-new-row" onclick={() => secondClientFiles('stu-5', 'ses-a1')}
		>2nd client: new student files</button
	>
	<button type="button" data-testid="second-client-fills" onclick={() => secondClientFiles('stu-3', 'ses-a1')}
		>2nd client: Chloe files</button
	>
	<button type="button" data-testid="second-instructor-accepts" onclick={secondInstructorAccepts}
		>2nd instructor accepts</button
	>
	<!--
		e-14's page 2 (Vega, Frankie / Bearing teardown). Drives the reappearance
		case the two frozen removed-photo fixtures cannot show: the panel's count
		has to go 1 -> 2 and back without a reload.
	-->
	<button
		type="button"
		data-testid="toggle-restorable-photo"
		onclick={() => setPhotoRemoved(RESTORABLE_PHOTO_ID, !restorableIsRemoved)}
		>{restorableIsRemoved ? 'restore' : 're-remove'} e-14 page 2</button
	>
	<span class="hint">
		sections offered: {visibleSections.map((s) => s.id).join(', ') || '(none)'} · events sent:
		{emitted}
	</span>
	<button type="button" onclick={() => (log = [])}>clear log</button>
</div>
{/if}

{#key viewer}
	<ReviewConsole
		sections={visibleSections}
		{isChair}
		{configured}
		initialSectionId={askedSection}
		{transports}
		docCheck={docCheckReady ? docCheckTransports : null}
	/>
{/key}

{#if !bare}
<section class="panel">
	<h2>Transport log</h2>
	{#if log.length === 0}
		<p class="hint">Nothing called yet.</p>
	{:else}
		<ol>
			{#each log as line, i (i)}<li>{line}</li>{/each}
		</ol>
	{/if}
</section>
{/if}

<style>
	.harness-bar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.5rem 1.2rem;
		background: var(--bg2);
		border-bottom: 1px solid var(--line-strong);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
	}
	.harness-bar label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.harness-bar select,
	.harness-bar button {
		background: var(--bg0);
		color: var(--white);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.25rem 0.4rem;
		font-family: inherit;
		font-size: inherit;
	}
	.hint {
		color: var(--dim);
	}
	.panel {
		max-width: 76rem;
		margin: 0 auto 1.5rem;
		padding: 0.9rem 1.2rem;
		border: 1px dashed var(--line);
		border-radius: 4px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
	}
	.panel h2 {
		font-size: 0.85rem;
		margin: 0 0 0.5rem;
		color: var(--gold);
	}
	ol {
		margin: 0;
		padding-left: 1.4rem;
		color: var(--dim);
		display: grid;
		gap: 0.2rem;
	}
</style>
