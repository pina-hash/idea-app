<script lang="ts">
	import { page } from '$app/state';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import ImpersonationBanner from '$lib/classroom/ImpersonationBanner.svelte';
	import type {
		AddPhotoResult,
		CreateEntryResult,
		EntryActionResult,
		NoteSaveResult,
		NotebookDeletedEntry,
		NotebookEntry,
		NotebookSession,
		NotePayload
	} from '$lib/notebook';
	// The harness counts photos through the SAME helper the app does. Each of
	// the four sites below stands in for an RPC whose own guard counts
	// `removed_at is null`, so a hand-rolled filter here is a second copy of a
	// rule that can stop matching -- and a harness looser than the RPC it
	// mirrors certifies a bug as fixed.
	import { livePhotos } from '$lib/notebook';
	import { noteThreads } from '$lib/notebook-notes';
	import type { NoteDoc, NotebookNoteRow, TiptapNode } from '$lib/notebook-notes';
	import type { FolderResult, FolderTransports, NotebookFolder } from '$lib/notebook-folders';

	/**
	 * Dev harness: mounts the REAL NotebookView with the five save transports
	 * faked in memory, so the whole screen -- role branches, the session
	 * quick-picks, the free-form path (photos AND the written-note tier), the
	 * multi-photo sequencing, adding to an existing entry, note revision
	 * history, and every entry-title fallback -- is drivable with no auth, no
	 * Supabase and no Drive.
	 *
	 * NOTE CONTENT IS NORMALIZED BY THE REAL SANITIZER. The fakes POST the
	 * editor's output to /dev/notebook/normalize, which runs the shipped
	 * normalizeNoteDoc; nothing here re-implements it. So what the harness
	 * stores and renders is what the real routes would have stored.
	 *
	 * The fakes answer in the same shape the real page's fetch wrappers do,
	 * and every call is logged verbatim (including WHICH form fields were
	 * sent), which is how "a blank title submits no custom_label at all" is
	 * verified rather than assumed.
	 *
	 * Accounts:
	 *  - "student"    -- pinned class, three scheduled check-ins (one already
	 *                    covered), a populated feed. No review link.
	 *  - "instructor" -- teaches a section, so the "Section review" link
	 *                    renders. Keeps a personal notebook of their own.
	 *  - "plain"      -- signed in, no pinned class, no sessions, no entries:
	 *                    the free-form-only path and the empty state.
	 */

	type Account = 'student' | 'instructor' | 'plain';
	let account = $state<Account>('student');
	let configured = $state(true);
	/**
	 * The two capabilities that are about a READ rather than a migration: the
	 * photos embed and the check-in reads. Both degrade on their own so a
	 * failure there costs that feature instead of blanking the notebook, which
	 * is exactly what a single `configured` used to do.
	 */
	let photosReady = $state(true);
	let sessionsReady = $state(true);
	let notesReady = $state(true);
	let foldersReady = $state(true);
	let pinsReady = $state(true);
	let deletionReady = $state(true);
	let uploadReady = $state(true);
	let draftsReady = $state(true);
	let historyReady = $state(true);
	/** The "self" side of every deleted-note fixture below (0119). */
	const VIEWER_ID = 'u-self';
	/**
	 * Pads the student's feed past the 30-entry render limit, so "Show older",
	 * the date-group headings on older buckets and the search-over-everything
	 * guarantee (a match beyond the rendered window must still be findable)
	 * are drivable rather than argued about.
	 */
	let bulk = $state(false);
	/** The read-only preview an admin gets at /classroom/view-as/<email>/notebook. */
	let viewAs = $state(page.url.searchParams.get('viewas') === '1');
	let log = $state<string[]>([]);

	/**
	 * Platform simulator for the capture-path branch.
	 *
	 * Patches navigator.userAgent for real and REMOUNTS NotebookView (the
	 * {#key} below), so the shipped `preferredCapturePath(navigator.userAgent,
	 * ...)` call is the thing being exercised -- rather than adding a
	 * test-only prop to production code and then verifying the prop.
	 */
	type SimPlatform = 'device' | 'android' | 'ios';
	let platform = $state<SimPlatform>('device');
	const UA: Record<SimPlatform, string | null> = {
		device: null,
		android:
			'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
		ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
	};
	const realUA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
	$effect(() => {
		const ua = UA[platform] ?? realUA;
		Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });
	});

	const SESSIONS: NotebookSession[] = [
		{
			id: 'ses-1',
			section_id: 'sec-1',
			unit_number: 3,
			session_date: '2026-08-08',
			session_label: 'Bearing teardown'
		},
		{
			id: 'ses-2',
			section_id: 'sec-1',
			unit_number: 3,
			session_date: '2026-08-05',
			session_label: 'Shaft stackup calcs'
		},
		{
			id: 'ses-3',
			section_id: 'sec-1',
			unit_number: 2,
			session_date: '2026-07-29',
			session_label: 'Design brief + sketches'
		},
		// THE SHARED CHECK-IN: one canonical check-in (0098) posted to two of
		// this student's own classes, so the load emits it twice with the SAME
		// id. Two genuinely different picks -- the entry is filed under one class
		// or the other -- which is why the quick-picks key on the PAIR and the
		// deep link carries both ids.
		{
			id: 'ses-4',
			section_id: 'sec-1',
			unit_number: 4,
			session_date: '2026-08-11',
			session_label: 'Gearbox build (both periods)'
		},
		{
			id: 'ses-4',
			section_id: 'sec-2',
			unit_number: 4,
			session_date: '2026-08-11',
			session_label: 'Gearbox build (both periods)'
		}
	];

	function photo(
		id: string,
		seq: number,
		original_filename: string | null = null,
		variant: 'original' | 'enhanced' = 'original'
	) {
		return { id, drive_file_id: `drive-${id}`, variant, sequence_order: seq, original_filename };
	}

	/** One stored revision row, in the shape 0078 returns. */
	function note(
		id: string,
		entry_id: string,
		note_id: string,
		revision: number,
		content: NoteDoc,
		created_at: string
	): NotebookNoteRow {
		return { id, entry_id, note_id, revision, content, created_at };
	}

	/** Shorthand for a plain-paragraph document. */
	const p = (...text: string[]): NoteDoc => text.map((t) => ({ type: 'p', runs: [{ text: t }] }));

	/**
	 * A note with a SUBLIST in it (0122), so one is on screen without anybody
	 * having to paste it first.
	 *
	 * It covers the two places a level can be lost: NoteContent, which renders
	 * it, and -- through `docToTiptap` -- the editor that opens this note for
	 * editing, where a lost level shows up only on the next save.
	 */
	const NESTED_NOTE: NoteDoc = [
		{ type: 'p', runs: [{ text: 'Preload measured with the dial indicator.' }] },
		{
			type: 'ul',
			items: [
				[
					{ text: 'Stage one' },
					{ type: 'ul', items: [[{ text: '0.02mm runout' }], [{ text: 'Reseated twice' }]] }
				],
				[{ text: 'Stage two' }, { type: 'ol', items: [[{ text: 'Shim to 0.05mm' }]] }]
			]
		}
	];

	// Deliberately OLDEST-FIRST: the real load asks Postgres for newest-first,
	// so feeding the reverse is what proves the component's own newestFirst()
	// ordering is doing the work rather than inheriting the caller's order.
	const STUDENT_ENTRIES: NotebookEntry[] = [
		{
			// Session-linked: the session's own label wins over everything, and
			// its note carries NO edit control (0078 refuses the edit anyway).
			id: 'e-1',
			session_id: 'ses-3',
			section_id: 'sec-1',
			folder_id: 'f-2',
			pinned_at: null,
			custom_label: null,
			upload_timestamp: '2026-07-29T15:42:00Z',
			submitted_at: '2026-07-29T15:42:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: { session_label: 'Design brief + sketches', unit_number: 2, session_date: '2026-07-29' },
			photos: [photo('p-1', 1, 'IMG_4821.HEIC'), photo('p-2', 2, 'IMG_4822.HEIC')],
			notes: [
				note(
					'n-1',
					'e-1',
					'n-1',
					1,
					p('Sketched three layouts before settling on the belt drive.'),
					'2026-07-29T15:44:00Z'
				),
				// STAFF-DELETED (0119): the removed-notes disclosure must show the
				// RPC's own refusal text here, never a Restore control -- the
				// student cannot undo a delete that was not theirs.
				{
					...note(
						'n-9',
						'e-1',
						'n-9',
						1,
						p('First pass at the tolerance stack, later found wrong.'),
						'2026-07-29T15:50:00Z'
					),
					deleted_at: '2026-07-30T09:00:00Z',
					deleted_by: 'u-staff'
				}
			]
		},
		{
			// Free entry with a typed title, flagged with a reason + comment.
			id: 'e-2',
			session_id: null,
			section_id: null,
			folder_id: 'f-1',
			pinned_at: null,
			custom_label: 'Gearbox ratio worksheet',
			upload_timestamp: '2026-08-02T19:10:00Z',
			submitted_at: '2026-08-02T19:10:00Z',
			status: 'flagged',
			flag_reason: 'illegible',
			instructor_comment: 'The second page is too dark to read. Reshoot it in better light.',
			session: null,
			photos: [photo('p-3', 1, 'gearbox.jpg')],
			notes: []
		},
		{
			// Resubmitted after a flag: back to pending_review.
			id: 'e-3',
			session_id: null,
			section_id: null,
			folder_id: 'f-1',
			pinned_at: null,
			custom_label: 'Motor mount iteration 2',
			upload_timestamp: '2026-08-04T11:05:00Z',
			submitted_at: '2026-08-04T11:05:00Z',
			status: 'pending_review',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-4', 1, 'mount-v2.png'), photo('p-5', 2, null, 'enhanced')],
			notes: []
		},
		{
			// THE LONG-IDLE ENTRY: one free-form entry, three notes written days
			// apart, one of them already revised twice. It must read as a single
			// chronological record -- notes in the order they were WRITTEN, an
			// edited note keeping its place rather than jumping to the end.
			id: 'e-6',
			session_id: null,
			section_id: null,
			folder_id: 'f-3',
			pinned_at: null,
			custom_label: 'Chassis build log',
			upload_timestamp: '2026-07-20T09:00:00Z',
			submitted_at: '2026-07-20T09:00:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-8', 1, 'chassis-day1.jpg')],
			notes: [
				note('n-2', 'e-6', 'n-2', 1, p('Cut the rails 2mm long on purpose.'), '2026-07-20T09:05:00Z'),
				// Revised a week after it was written; both earlier versions survive.
				note(
					'n-3',
					'e-6',
					'n-3',
					1,
					p('Welded the front bulkhead. Might be out of square.'),
					'2026-07-24T14:20:00Z'
				),
				note(
					'n-4',
					'e-6',
					'n-3',
					2,
					p('Welded the front bulkhead. It IS out of square, about 1.5mm across the diagonal.'),
					'2026-07-25T08:10:00Z'
				),
				note(
					'n-5',
					'e-6',
					'n-3',
					3,
					[
						{
							type: 'p',
							runs: [
								{ text: 'Welded the front bulkhead. Out of square by ' },
								{ text: '1.5mm', bold: true },
								{ text: ' across the diagonal, fixed by shimming.' }
							]
						},
						{ type: 'ul', items: [[{ text: 'Re-check after the next weld' }], [{ text: 'Buy a longer square' }]] }
					],
					'2026-07-26T17:45:00Z'
				),
				note(
					'n-6',
					'e-6',
					'n-6',
					1,
					p('Two weeks later: the shim held. Moving on to the gearbox mounts.'),
					'2026-08-09T10:30:00Z'
				),
				// SELF-DELETED (0119): restorable from the disclosure, and it
				// carries the entry's own history entry too.
				{
					...note(
						'n-11',
						'e-6',
						'n-11',
						1,
						p('Scrapped this measurement, wrong side of the chassis.'),
						'2026-07-21T10:00:00Z'
					),
					deleted_at: '2026-07-21T10:05:00Z',
					deleted_by: VIEWER_ID
				}
			]
		},
		{
			// THE CROWDED ROW, and the only reason it exists is the two-line
			// contract: everything that can compete for the compact row's first
			// line at once -- an absurdly long title, a PINNED chip, a status
			// chip -- over a meta line already carrying a date, a photo count, a
			// note count and a long folder name. If the row holds two lines here
			// it holds two lines anywhere.
			id: 'e-7',
			session_id: null,
			section_id: null,
			folder_id: 'f-1',
			pinned_at: '2026-08-08T12:00:00Z',
			custom_label:
				'Gearbox ratio worksheet, second pass, with the recalculated stage-two reduction and the bearing preload notes',
			upload_timestamp: '2026-08-08T13:20:00Z',
			submitted_at: '2026-08-08T13:20:00Z',
			status: 'flagged',
			flag_reason: 'not_dated',
			instructor_comment: 'Add the date to the top of each page.',
			session: null,
			photos: [
				photo('p-9', 1, 'ratios-a.jpg'),
				photo('p-10', 2, null, 'enhanced'),
				photo('p-11', 3, 'ratios-b.jpg')
			],
			notes: [
				note('n-7', 'e-7', 'n-7', 1, p('Stage two came out at 3.4:1, not 3.0.'), '2026-08-08T13:25:00Z'),
				note('n-8', 'e-7', 'n-8', 1, NESTED_NOTE, '2026-08-08T13:40:00Z')
			]
		},
		{
			// Title falls all the way back to the browser filename (0071).
			id: 'e-4',
			session_id: null,
			section_id: null,
			folder_id: null,
			pinned_at: null,
			custom_label: null,
			upload_timestamp: '2026-08-06T08:30:00Z',
			submitted_at: '2026-08-06T08:30:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-6', 1, 'flywheel-sketch.jpg')],
			notes: []
		},
		{
			// THE FULLY UNLABELED ENTRY: no session, no title, and no
			// original_filename either. Valid since 0071 dropped the
			// has-a-target CHECK, and must render as "Untitled entry" rather
			// than a blank line.
			id: 'e-5',
			session_id: null,
			section_id: null,
			folder_id: null,
			pinned_at: null,
			custom_label: null,
			upload_timestamp: '2026-08-07T16:55:00Z',
			submitted_at: '2026-08-07T16:55:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-7', 1, null)],
			notes: []
		},
		{
			// A DRAFT (0118): not yet turned in. Must show an unmistakable Draft
			// marker, offer a Turn in control, and -- since 'ses-1' has no other
			// entry against it -- keep that check-in showing as outstanding
			// rather than reading as filed the moment a page is staged.
			id: 'e-9',
			session_id: 'ses-1',
			section_id: 'sec-1',
			folder_id: null,
			pinned_at: null,
			custom_label: null,
			upload_timestamp: '2026-08-09T08:00:00Z',
			submitted_at: null,
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: { session_label: 'Bearing teardown', unit_number: 3, session_date: '2026-08-08' },
			photos: [photo('p-12', 1, 'bearing-1.jpg')],
			notes: []
		},
		{
			// THE TITLE ORDER ACROSS A REMOVAL, and the only fixture in this file
			// shaped for it: no session, no typed title, ONE named photo and ONE
			// note, so every step of entryTitle above the two under test is out of
			// the way. While the page is live the card reads 'brake-rotor-runout';
			// remove it and the card must read the NOTE's opening words, never
			// 'Untitled entry' and never the filename of a page that is gone.
			// notebook_remove_photo permits this because the note is what is left.
			id: 'e-10',
			session_id: null,
			section_id: null,
			folder_id: null,
			pinned_at: null,
			custom_label: null,
			upload_timestamp: '2026-08-10T10:15:00Z',
			submitted_at: '2026-08-10T10:15:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-13', 1, 'brake-rotor-runout.jpg')],
			notes: [
				note(
					'n-10',
					'e-10',
					'n-10',
					1,
					p('Rotor runs out 0.08mm at the outer edge.'),
					'2026-08-10T10:20:00Z'
				)
			]
		}
	];

	const INSTRUCTOR_ENTRIES: NotebookEntry[] = [
		{
			id: 'i-1',
			session_id: null,
			section_id: null,
			folder_id: null,
			pinned_at: null,
			custom_label: 'Shop layout notes',
			upload_timestamp: '2026-08-07T09:00:00Z',
			submitted_at: '2026-08-07T09:00:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('ip-1', 1, 'layout.jpg')],
			notes: []
		}
	];

	/**
	 * Filler spread back over four months, so the older date buckets ("Last
	 * week", the month headings, "Older") have something in them and the
	 * render limit has something to limit. One of them carries a distinctive
	 * word ("theodolite") far past the rendered window, which is what makes
	 * "search covers the WHOLE notebook, not the loaded page" a real check.
	 */
	const FILLER: NotebookEntry[] = Array.from({ length: 40 }, (_, i) => {
		const day = new Date('2026-08-09T12:00:00Z');
		day.setDate(day.getDate() - (i + 12));
		return {
			id: `f-e-${i}`,
			session_id: null,
			section_id: null,
			folder_id: i % 3 === 0 ? 'f-1' : null,
			pinned_at: null,
			custom_label: i === 34 ? 'Surveying with the theodolite' : `Bench notes ${i + 1}`,
			upload_timestamp: day.toISOString(),
			submitted_at: day.toISOString(),
			status: 'compliant' as const,
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: i % 2 === 0 ? [photo(`f-p-${i}`, 1, `bench-${i}.jpg`)] : [],
			// The theodolite entry is deliberately OLD (about six weeks back,
			// well past the render limit in newest-first order) and carries a
			// note written days ago. Under "recent activity" it has to climb
			// over three dozen newer entries, which is what makes the sort
			// provably a sort over the WHOLE notebook rather than over the
			// thirty entries being painted.
			notes:
				i === 34
					? [
							note(
								`f-n-${i}`,
								`f-e-${i}`,
								`f-n-${i}`,
								1,
								p('Re-shot the theodolite setup and re-measured.'),
								'2026-08-09T11:00:00Z'
							)
						]
					: i % 2 === 0
						? []
						: [
								note(
									`f-n-${i}`,
									`f-e-${i}`,
									`f-n-${i}`,
									1,
									p(`Bench work, day ${i + 1}.`),
									day.toISOString()
								)
							]
		};
	});

	// Live copies so a fake save can actually append to the feed.
	let studentEntries = $state<NotebookEntry[]>([...STUDENT_ENTRIES]);
	let fillerEntries = $state<NotebookEntry[]>([...FILLER]);
	let instructorEntries = $state<NotebookEntry[]>([...INSTRUCTOR_ENTRIES]);
	let plainEntries = $state<NotebookEntry[]>([]);

	// ---- restore (0117): a graveyard, so deleteEntry has somewhere to put a
	// row and restoreEntry has somewhere to find it. Real deletion is a stamp,
	// not a removal, so this mirrors that instead of throwing the row away.
	type TrashList = 'student' | 'instructor' | 'plain';
	interface TrashRow {
		listName: TrashList;
		entry: NotebookEntry;
		deletedAt: string;
		deletedBy: 'self' | 'staff';
	}
	let trash = $state<TrashRow[]>([
		// Pre-seeded so the "your instructor removed it" refusal is drivable
		// without a second signed-in account.
		{
			listName: 'student',
			deletedAt: '2026-08-09T14:00:00Z',
			deletedBy: 'staff',
			entry: {
				id: 'e-trash-staff',
				session_id: null,
				section_id: 'sec-1',
				folder_id: null,
				pinned_at: null,
				custom_label: 'Removed by the instructor',
				upload_timestamp: '2026-08-01T09:00:00Z',
				submitted_at: '2026-08-01T09:00:00Z',
				status: 'compliant',
				flag_reason: null,
				instructor_comment: null,
				session: null,
				photos: [],
				notes: []
			}
		}
	]);
	const trashListFor = (): TrashList =>
		account === 'student' ? 'student' : account === 'instructor' ? 'instructor' : 'plain';
	const deletedEntries = $derived<NotebookDeletedEntry[]>(
		trash
			.filter((t) => t.listName === trashListFor())
			.map((t) => ({
				id: t.entry.id,
				custom_label: t.entry.custom_label,
				session: t.entry.session,
				upload_timestamp: t.entry.upload_timestamp,
				deleted_at: t.deletedAt,
				restorable: t.deletedBy === 'self'
			}))
	);

	const rawEntries = $derived(
		account === 'student'
			? bulk
				? [...studentEntries, ...fillerEntries]
				: studentEntries
			: account === 'instructor'
				? instructorEntries
				: plainEntries
	);
	/**
	 * The photos and check-in toggles strip the DATA as well as flipping the
	 * flag, exactly as the real load does when one of those reads fails --
	 * otherwise the harness would show a banner over content the page could not
	 * actually have.
	 */
	const entries = $derived(
		photosReady && sessionsReady && draftsReady && historyReady
			? rawEntries
			: rawEntries.map((entry) => ({
					...entry,
					photos: photosReady ? entry.photos : [],
					session: sessionsReady ? entry.session : null,
					// Mirrors +page.server.ts exactly: an unknown submitted_at reads as
					// SUBMITTED, never as a draft -- the entry's own upload stamp,
					// which is what the real backfill would have written.
					submitted_at: draftsReady ? entry.submitted_at : entry.upload_timestamp,
					// 0119 unapplied: no deleted_at/deleted_by on a note (undefined, not
					// null -- narrower rungs never asked for the column), and no
					// reviewed_at on the entry.
					reviewed_at: historyReady ? entry.reviewed_at : undefined,
					notes: historyReady
						? entry.notes
						: entry.notes.map((n) => ({ ...n, deleted_at: undefined, deleted_by: undefined }))
				}))
	);
	const sessions = $derived(account === 'student' && sessionsReady ? SESSIONS : []);

	/**
	 * The deep link a Classroom stream card arrives on, driven from this page's
	 * own URL exactly as the real route drives it from the server load --
	 * `?checkin=ses-4&section=sec-2` opens the notebook with that class's
	 * posting of the shared check-in already picked.
	 *
	 * Validated against `sessions` here for the same reason the real load
	 * validates against it there: the parameter may only ever name something
	 * this student was already being offered.
	 */
	const askedCheckIn = page.url.searchParams.get('checkin');
	const askedSection = page.url.searchParams.get('section');
	const initialCheckIn = $derived.by(() => {
		if (!askedCheckIn) return null;
		const match =
			(askedSection
				? sessions.find((s) => s.id === askedCheckIn && s.section_id === askedSection)
				: null) ?? sessions.find((s) => s.id === askedCheckIn);
		return match ? { sessionId: match.id, sectionId: match.section_id } : null;
	});
	const sectionLabel = $derived(account === 'student' ? 'Engineering I Honors' : null);
	const canReview = $derived(account === 'instructor');

	let seq = 0;

	function update(fn: (list: NotebookEntry[]) => NotebookEntry[]) {
		if (account === 'student') studentEntries = fn(studentEntries);
		else if (account === 'instructor') instructorEntries = fn(instructorEntries);
		else plainEntries = fn(plainEntries);
	}

	function current(): NotebookEntry[] {
		return account === 'student' ? studentEntries : account === 'instructor' ? instructorEntries : plainEntries;
	}

	/** Every field the component actually put on the FormData, verbatim. */
	function describe(form: FormData): string {
		const parts: string[] = [];
		for (const [k, v] of form.entries()) {
			// Size is logged because the upload route caps it: a camera-sized
			// original has to arrive here already shrunk, and that is only
			// checkable if the number is on screen.
			parts.push(
				v instanceof File
					? `${k}=<File ${v.name} ${v.type || 'no-type'} ${(v.size / 1024).toFixed(0)}KB>`
					: `${k}=${JSON.stringify(v)}`
			);
		}
		return parts.length ? parts.join(' ') : '(no fields)';
	}

	/**
	 * Every received upload, file included, exposed for scripted verification
	 * (decoding the corrected JPEG the corrector actually produced and
	 * diffing it against another run is how "dragging a handle changes where
	 * the warp draws from" is ASSERTED rather than eyeballed). Dev-only page.
	 */
	const received: { route: string; fields: Record<string, string>; file: File | null }[] = [];
	if (typeof window !== 'undefined') {
		(window as unknown as Record<string, unknown>).__notebookReceived = received;
	}
	function record(route: string, form: FormData) {
		const fields: Record<string, string> = {};
		let file: File | null = null;
		for (const [k, v] of form.entries()) {
			if (v instanceof File) file = v;
			else fields[k] = v;
		}
		received.push({ route, fields, file });
	}

	// ---- folders (0088) ------------------------------------------------------

	/**
	 * An in-memory mirror of 0088's own semantics, not a convenient
	 * approximation: the duplicate-name check is case- and whitespace-
	 * insensitive like the unique index, deleting a folder UNFILES its entries
	 * rather than removing them, and a move takes an ARRAY the same way
	 * notebook_move_entries does. Those are exactly the behaviours the UI has
	 * to render correctly, so a fake that skipped them would prove nothing.
	 */
	let studentFolders = $state<NotebookFolder[]>([
		{ id: 'f-1', name: 'Gearbox build', color: 'clay', created_at: '2026-07-01T00:00:00Z' },
		{ id: 'f-2', name: 'Design work', color: 'sky', created_at: '2026-07-02T00:00:00Z' },
		{ id: 'f-3', name: 'Chassis', color: 'sage', created_at: '2026-07-03T00:00:00Z' }
	]);
	let instructorFolders = $state<NotebookFolder[]>([]);
	let plainFolders = $state<NotebookFolder[]>([]);

	const folders = $derived(
		account === 'student'
			? studentFolders
			: account === 'instructor'
				? instructorFolders
				: plainFolders
	);

	function updateFolders(fn: (list: NotebookFolder[]) => NotebookFolder[]) {
		if (account === 'student') studentFolders = fn(studentFolders);
		else if (account === 'instructor') instructorFolders = fn(instructorFolders);
		else plainFolders = fn(plainFolders);
	}

	const norm = (s: string) => s.trim().toLowerCase();

	const folderTransports: FolderTransports = {
		async saveFolder(input): Promise<FolderResult> {
			log = [
				...log,
				`RPC notebook_upsert_folder  p_name=${JSON.stringify(input.name)} p_color=${JSON.stringify(
					input.color
				)} p_folder_id=${JSON.stringify(input.id)}`
			];
			const name = input.name.trim();
			// The unique index, restated: same name ignoring case and edges.
			if (folders.some((f) => norm(f.name) === norm(name) && f.id !== input.id)) {
				return { ok: false, error: 'You already have a folder with that name.' };
			}
			if (input.id) {
				updateFolders((list) =>
					list.map((f) => (f.id === input.id ? { ...f, name, color: input.color } : f))
				);
			} else {
				updateFolders((list) => [
					...list,
					{ id: `fx-${++seq}`, name, color: input.color, created_at: new Date().toISOString() }
				]);
			}
			return { ok: true };
		},

		async deleteFolder(id): Promise<FolderResult> {
			log = [...log, `RPC notebook_delete_folder  p_folder_id=${JSON.stringify(id)}`];
			// Unfiles first, in the same step, exactly as the RPC does -- the
			// entries survive, only the filing goes.
			update((list) => list.map((e) => (e.folder_id === id ? { ...e, folder_id: null } : e)));
			updateFolders((list) => list.filter((f) => f.id !== id));
			return { ok: true };
		},

		async moveEntries(entryIds, folderId): Promise<FolderResult> {
			log = [
				...log,
				`RPC notebook_move_entries  p_entry_ids=${JSON.stringify(
					entryIds
				)} p_folder_id=${JSON.stringify(folderId)}`
			];
			update((list) => list.map((e) => (entryIds.includes(e.id) ? { ...e, folder_id: folderId } : e)));
			return { ok: true };
		}
	};

	/** The REAL sanitizer, behind a dev-only endpoint. */
	async function normalize(content: TiptapNode): Promise<NoteDoc | { error: string }> {
		const res = await fetch('/dev/notebook/normalize', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content })
		});
		const body = (await res.json()) as { ok?: boolean; doc?: NoteDoc; error?: string };
		return body.ok && body.doc ? body.doc : { error: body.error ?? 'That note could not be saved.' };
	}

	async function createEntry(form: FormData): Promise<CreateEntryResult> {
		log = [...log, `POST /api/notebook/upload  ${describe(form)}`];
		record('upload', form);
		const id = `new-${++seq}`;
		const file = form.get('photo') as File | null;
		const sessionId = (form.get('session_id') as string | null) ?? null;
		const session = SESSIONS.find((s) => s.id === sessionId) ?? null;
		// Mirrors notebook_create_entry's p_submitted: absent (or anything but
		// the literal string "false") turns the entry in, matching the real
		// route's own reading of the form field.
		const submitted = (form.get('submitted') as string | null) !== 'false';
		const entry: NotebookEntry = {
			id,
			session_id: sessionId,
			section_id: session ? session.section_id : null,
			folder_id: (form.get('folder_id') as string | null) ?? null,
			pinned_at: null,
			custom_label: (form.get('custom_label') as string | null) ?? null,
			upload_timestamp: new Date().toISOString(),
			submitted_at: submitted ? new Date().toISOString() : null,
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: session
				? {
						session_label: session.session_label,
						unit_number: session.unit_number,
						session_date: session.session_date
					}
				: null,
			photos: [photo(`${id}-1`, 1, file?.name ?? null)],
			notes: []
		};
		update((list) => [entry, ...list]);
		return { ok: true, entryId: id };
	}

	/**
	 * The note door: no photo at all. Mirrors notebook_create_note_entry --
	 * content is required, the title is optional -- and appends an entry with
	 * an EMPTY photos array, the state a note-only entry really has.
	 *
	 * SINCE 0114 IT ALSO CARRIES A CHECK-IN, and mirroring that is what makes
	 * the text-only check-in drivable here: the entry it appends is
	 * session-linked, so the feed titles it from the check-in and the review
	 * grid would count it as filed, exactly as the real RPC's row does.
	 */
	async function createNote(payload: NotePayload): Promise<CreateEntryResult> {
		log = [
			...log,
			`POST /api/notebook/note  custom_label=${JSON.stringify(
				payload.custom_label
			)} session_id=${JSON.stringify(payload.session_id ?? null)} section_id=${JSON.stringify(
				payload.section_id ?? null
			)} folder_id=${JSON.stringify(payload.folder_id)} content=<editor doc>`
		];
		const doc = await normalize(payload.content);
		if ('error' in doc) return { ok: false, error: doc.error };
		const id = `new-${++seq}`;
		const noteId = `${id}-note`;
		const noteSessionId = payload.session_id ?? null;
		const noteSession = SESSIONS.find((s) => s.id === noteSessionId) ?? null;
		// Mirrors notebook_create_note_entry's p_submitted: absent means true.
		const submitted = payload.submitted !== false;
		const entry: NotebookEntry = {
			id,
			session_id: noteSessionId,
			section_id: noteSession ? noteSession.section_id : (payload.section_id ?? null),
			folder_id: payload.folder_id,
			pinned_at: null,
			custom_label: payload.custom_label,
			upload_timestamp: new Date().toISOString(),
			submitted_at: submitted ? new Date().toISOString() : null,
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: noteSession
				? {
						session_label: noteSession.session_label,
						unit_number: noteSession.unit_number,
						session_date: noteSession.session_date
					}
				: null,
			photos: [],
			notes: [note(noteId, id, noteId, 1, doc, new Date().toISOString())]
		};
		update((list) => [entry, ...list]);
		return { ok: true, entryId: id };
	}

	async function addPhoto(form: FormData): Promise<AddPhotoResult> {
		log = [...log, `POST /api/notebook/add-photo  ${describe(form)}`];
		record('add-photo', form);
		const entryId = form.get('entry_id') as string;
		const file = form.get('photo') as File | null;
		// Mirrors the RPC: variant is stored, sequence_order is max+1.
		const variant = (form.get('variant') as string) === 'enhanced' ? 'enhanced' : 'original';
		update((list) =>
			list.map((e) =>
				e.id === entryId
					? {
							...e,
							photos: [
								...e.photos,
								photo(
									`${entryId}-${e.photos.length + 1}`,
									e.photos.length + 1,
									file?.name ?? null,
									variant
								)
							]
						}
					: e
			)
		);
		return { ok: true };
	}

	/** notebook_add_note: a brand new chain (revision 1) on an existing entry. */
	async function addNote(entryId: string, content: TiptapNode): Promise<NoteSaveResult> {
		log = [...log, `POST /api/notebook/add-note  entry_id=${JSON.stringify(entryId)}`];
		const doc = await normalize(content);
		if ('error' in doc) return { ok: false, error: doc.error };
		const noteId = `n-new-${++seq}`;
		update((list) =>
			list.map((e) =>
				e.id === entryId
					? { ...e, notes: [...e.notes, note(noteId, entryId, noteId, 1, doc, new Date().toISOString())] }
					: e
			)
		);
		return { ok: true };
	}

	/**
	 * notebook_edit_note: appends a revision. Mirrors the RPC's own refusal on
	 * a session-linked entry, so the error path is drivable here too -- the UI
	 * never offers the control on those entries, but this proves what would
	 * happen if it did.
	 */
	async function editNote(noteId: string, content: TiptapNode): Promise<NoteSaveResult> {
		log = [...log, `POST /api/notebook/edit-note  note_id=${JSON.stringify(noteId)}`];
		const owner = current().find((e) => e.notes.some((n) => n.note_id === noteId));
		if (!owner) return { ok: false, error: 'That note does not exist.' };
		if (owner.session_id !== null) {
			return {
				ok: false,
				error:
					'A note on a scheduled check-in cannot be edited. Add another note to this entry instead.'
			};
		}
		const doc = await normalize(content);
		if ('error' in doc) return { ok: false, error: doc.error };
		const latest = Math.max(...owner.notes.filter((n) => n.note_id === noteId).map((n) => n.revision));
		update((list) =>
			list.map((e) =>
				e.id === owner.id
					? {
							...e,
							notes: [
								...e.notes,
								note(`${noteId}-r${latest + 1}`, e.id, noteId, latest + 1, doc, new Date().toISOString())
							]
						}
					: e
			)
		);
		return { ok: true };
	}

	// ---- pinning + activity (0091) -----------------------------------------

	function pinIn(list: NotebookEntry[], id: string, pinned: boolean): NotebookEntry[] {
		return list.map((e) =>
			e.id === id
				? { ...e, pinned_at: pinned ? new Date().toISOString() : null }
				: e
		);
	}

	/**
	 * Mirrors notebook_set_entry_pinned: one entry, the caller's own, and a
	 * timestamp rather than a flag. Every list is swept because the harness
	 * holds four of them and an entry lives in exactly one.
	 */
	async function setPinned(entryId: string, pinned: boolean): Promise<EntryActionResult> {
		log = [
			...log,
			`RPC notebook_set_entry_pinned p_entry_id=${JSON.stringify(entryId)} p_pinned=${pinned}`
		];
		studentEntries = pinIn(studentEntries, entryId, pinned);
		fillerEntries = pinIn(fillerEntries, entryId, pinned);
		instructorEntries = pinIn(instructorEntries, entryId, pinned);
		plainEntries = pinIn(plainEntries, entryId, pinned);
		return { ok: true };
	}

	// ---- soft deletion + retitling (0116) -----------------------------------

	/** Every list swept, the setPinned convention: an entry lives in exactly one. */
	function updateAll(fn: (list: NotebookEntry[]) => NotebookEntry[]) {
		studentEntries = fn(studentEntries);
		fillerEntries = fn(fillerEntries);
		instructorEntries = fn(instructorEntries);
		plainEntries = fn(plainEntries);
	}

	/** notebook_delete_entry: refuses a reviewed entry, TRASHES the row on success (0117 needs it back). */
	async function deleteEntry(entryId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_delete_entry p_entry_id=${JSON.stringify(entryId)}`];
		const found = current().find((e) => e.id === entryId);
		if (found?.status !== 'compliant' && found && found.instructor_comment) {
			return {
				ok: false,
				error:
					'Your instructor has already reviewed that entry, so it cannot be deleted here. Ask them to remove it for you.'
			};
		}
		if (!found) return { ok: false, error: 'That entry does not exist or is not yours.' };
		trash = [
			...trash,
			{
				listName: trashListFor(),
				entry: found,
				deletedAt: new Date().toISOString(),
				deletedBy: 'self'
			}
		];
		updateAll((list) => list.filter((e) => e.id !== entryId));
		return { ok: true };
	}

	/** notebook_restore_entry: refuses one deleted by staff, else puts the row back. */
	async function restoreEntry(entryId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_restore_entry p_entry_id=${JSON.stringify(entryId)}`];
		const row = trash.find((t) => t.entry.id === entryId && t.listName === trashListFor());
		if (!row) return { ok: false, error: 'That entry does not exist or is not yours.' };
		if (row.deletedBy !== 'self') {
			return {
				ok: false,
				error:
					'Your instructor removed that entry, so you cannot restore it yourself. Ask them to restore it for you.'
			};
		}
		trash = trash.filter((t) => t !== row);
		updateAll((list) => [...list, row.entry]);
		return { ok: true };
	}

	/** notebook_remove_photo: refuses to empty an entry with no note left; STAMPS removed_at (0117 needs it back). */
	async function removePhoto(photoId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_remove_photo p_photo_id=${JSON.stringify(photoId)}`];
		const entry = current().find((e) => e.photos.some((p) => p.id === photoId));
		if (!entry) return { ok: false, error: 'That photo does not exist or is not yours.' };
		const remaining = livePhotos(entry.photos).filter((p) => p.id !== photoId).length;
		// LIVE notes only (0119), the same clause the real RPC counts on. A
		// harness whose guard is looser than the RPC's lets a drive pass that the
		// real page would refuse, which is the one thing a harness must not do.
		if (remaining === 0 && noteThreads(entry.notes).length === 0) {
			return { ok: false, error: 'That is the only thing in this entry. Delete the whole entry instead.' };
		}
		updateAll((list) =>
			list.map((e) =>
				e.id === entry.id
					? {
							...e,
							photos: e.photos.map((p) =>
								p.id === photoId ? { ...p, removed_at: new Date().toISOString() } : p
							)
						}
					: e
			)
		);
		return { ok: true };
	}

	/** notebook_restore_photo: clears removed_at. */
	async function restorePhoto(photoId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_restore_photo p_photo_id=${JSON.stringify(photoId)}`];
		const entry = current().find((e) => e.photos.some((p) => p.id === photoId));
		if (!entry) return { ok: false, error: 'That photo does not exist or is not yours.' };
		const target = entry.photos.find((p) => p.id === photoId);
		if (!target?.removed_at) return { ok: false, error: 'That photo has not been removed.' };
		updateAll((list) =>
			list.map((e) =>
				e.id === entry.id
					? { ...e, photos: e.photos.map((p) => (p.id === photoId ? { ...p, removed_at: null } : p)) }
					: e
			)
		);
		return { ok: true };
	}

	/** notebook_delete_note: STAMPS deleted_at/deleted_by on every revision sharing the note_id (0119). */
	async function deleteNote(noteId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_delete_note p_note_id=${JSON.stringify(noteId)}`];
		const entry = current().find((e) => e.notes.some((n) => n.note_id === noteId));
		if (!entry) return { ok: false, error: 'That note does not exist or is not yours.' };
		if (entry.notes.find((n) => n.note_id === noteId)?.deleted_at) {
			return { ok: false, error: 'That note has already been deleted.' };
		}
		const remainingNotes = noteThreads(entry.notes).length - 1;
		const remainingPhotos = livePhotos(entry.photos).length;
		if (remainingNotes === 0 && remainingPhotos === 0 && entry.submitted_at !== null) {
			return { ok: false, error: 'That is the only thing in this entry. Delete the whole entry instead.' };
		}
		updateAll((list) =>
			list.map((e) =>
				e.id === entry.id
					? {
							...e,
							notes: e.notes.map((n) =>
								n.note_id === noteId
									? { ...n, deleted_at: new Date().toISOString(), deleted_by: VIEWER_ID }
									: n
							)
						}
					: e
			)
		);
		return { ok: true };
	}

	/** notebook_restore_note: refuses a staff-deleted note. */
	async function restoreNote(noteId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_restore_note p_note_id=${JSON.stringify(noteId)}`];
		const entry = current().find((e) => e.notes.some((n) => n.note_id === noteId));
		if (!entry) return { ok: false, error: 'That note does not exist or is not yours.' };
		const row = entry.notes.find((n) => n.note_id === noteId);
		if (!row?.deleted_at) return { ok: false, error: 'That note has not been deleted.' };
		if (row.deleted_by !== VIEWER_ID) {
			return {
				ok: false,
				error:
					'Your instructor removed that note, so you cannot restore it yourself. Ask them to restore it for you.'
			};
		}
		updateAll((list) =>
			list.map((e) =>
				e.id === entry.id
					? {
							...e,
							notes: e.notes.map((n) =>
								n.note_id === noteId ? { ...n, deleted_at: null, deleted_by: null } : n
							)
						}
					: e
			)
		);
		return { ok: true };
	}

	/** notebook_set_entry_label: refused on a check-in entry or an empty shell. */
	async function setEntryLabel(entryId: string, label: string | null): Promise<EntryActionResult> {
		log = [
			...log,
			`RPC notebook_set_entry_label p_entry_id=${JSON.stringify(entryId)} p_custom_label=${JSON.stringify(label)}`
		];
		const entry = current().find((e) => e.id === entryId);
		if (!entry) return { ok: false, error: 'That entry does not exist or is not yours.' };
		if (entry.session_id !== null) {
			return {
				ok: false,
				error:
					'This entry is filed against a scheduled check-in, so its title comes from the check-in and cannot be changed here.'
			};
		}
		// LIVE photos only, which is what notebook_set_entry_label's own guard
		// counts (`p.removed_at is null`). The raw length let a title be cleared
		// on an entry whose pages had all been removed -- a shell the real RPC
		// refuses, so the harness was passing a drive the real page would not.
		if (!label && livePhotos(entry.photos).length === 0 && noteThreads(entry.notes).length === 0) {
			return { ok: false, error: 'That title is the only thing in this entry. Delete the whole entry instead.' };
		}
		updateAll((list) => list.map((e) => (e.id === entryId ? { ...e, custom_label: label } : e)));
		return { ok: true };
	}

	// ---- draft state (0118) --------------------------------------------------

	/** notebook_submit_entry: refuses already-submitted and an empty entry, counting LIVE photos only. */
	async function submitEntry(entryId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_submit_entry p_entry_id=${JSON.stringify(entryId)}`];
		const found = current().find((e) => e.id === entryId);
		if (!found) return { ok: false, error: 'That entry does not exist or is not yours.' };
		if (found.submitted_at !== null) {
			return { ok: false, error: 'That entry has already been turned in.' };
		}
		const photos = livePhotos(found.photos).length;
		const notes = noteThreads(found.notes).length;
		if (photos === 0 && notes === 0) {
			return {
				ok: false,
				error: 'This entry has nothing in it to turn in. Add a photo or write a note first.'
			};
		}
		updateAll((list) =>
			list.map((e) => (e.id === entryId ? { ...e, submitted_at: new Date().toISOString() } : e))
		);
		return { ok: true };
	}

	/** notebook_unsubmit_entry: refuses a reviewed entry (the deleteEntry precedent) and a draft. */
	async function unsubmitEntry(entryId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_unsubmit_entry p_entry_id=${JSON.stringify(entryId)}`];
		const found = current().find((e) => e.id === entryId);
		if (!found) return { ok: false, error: 'That entry does not exist or is not yours.' };
		if (found.status !== 'compliant' && found.instructor_comment) {
			return {
				ok: false,
				error:
					'Your instructor has already reviewed that entry, so you cannot pull it back. Ask them if you need to change it.'
			};
		}
		if (found.submitted_at === null) {
			return { ok: false, error: 'That entry has not been turned in.' };
		}
		updateAll((list) => list.map((e) => (e.id === entryId ? { ...e, submitted_at: null } : e)));
		return { ok: true };
	}

	/**
	 * What notebook_entry_activity returns, computed here the way the VIEW
	 * computes it: the latest of the entry's own stamp and its note revisions.
	 * The one honest gap is photos -- a real row carries created_at and the
	 * harness's NotebookPhoto shape has none (the feed never renders it), so
	 * a photo added here does not move the stamp. Notes are what the sort is
	 * really about and they are exact.
	 */
	const activity = $derived(
		entries.map((entry) => ({
			id: entry.id,
			last_activity_at: [entry.upload_timestamp, ...entry.notes.map((n) => n.created_at)].reduce(
				(a, b) => (a > b ? a : b)
			)
		}))
	);
</script>

<svelte:head><title>dev // notebook</title></svelte:head>

<div class="dev-bar">
	<strong>dev harness</strong>
	<label>
		account
		<select bind:value={account}>
			<option value="student">student (class + check-ins)</option>
			<option value="instructor">instructor (can review)</option>
			<option value="plain">plain account (no class, no entries)</option>
		</select>
	</label>
	<label>
		platform
		<select bind:value={platform} data-testid="sim-platform">
			<option value="device">this device</option>
			<option value="android">Android (Chrome)</option>
			<option value="ios">iOS (Safari)</option>
		</select>
	</label>
	<label><input type="checkbox" bind:checked={configured} /> 0069 applied</label>
	<label
		><input type="checkbox" bind:checked={photosReady} data-testid="sim-photos" /> photos readable</label
	>
	<label
		><input type="checkbox" bind:checked={sessionsReady} data-testid="sim-sessions" /> check-ins readable</label
	>
	<label><input type="checkbox" bind:checked={notesReady} /> 0078 applied</label>
	<label><input type="checkbox" bind:checked={foldersReady} data-testid="sim-0088" /> 0088 applied</label>
	<label><input type="checkbox" bind:checked={pinsReady} data-testid="sim-0091" /> 0091 applied</label>
	<label><input type="checkbox" bind:checked={deletionReady} data-testid="sim-0117" /> 0116/0117 deletion readable</label>
	<label><input type="checkbox" bind:checked={draftsReady} data-testid="sim-0118" /> 0118 applied</label>
	<label><input type="checkbox" bind:checked={historyReady} data-testid="sim-0119" /> 0119 applied</label>
	<label><input type="checkbox" bind:checked={uploadReady} /> Drive configured</label>
	<label><input type="checkbox" bind:checked={bulk} data-testid="sim-bulk" /> 40 more entries</label>
	<!-- Mirrors /classroom/view-as/<email>/notebook exactly: readOnly plus NO
	     write transports at all, so what renders here is what an admin
	     previewing a student's notebook renders. -->
	<label><input type="checkbox" bind:checked={viewAs} data-testid="sim-view-as" /> view as student (read-only)</label>
	<button type="button" onclick={() => (log = [])}>clear log</button>
	<span class="tag" data-testid="can-review">canReview={canReview}</span>
</div>

{#if log.length}
	<pre class="dev-log" data-testid="dev-log">{log.join('\n')}</pre>
{/if}

{#if viewAs}
	<ImpersonationBanner
		email="ada.lovelace@boscotech.net"
		displayName="Ada Lovelace"
		exitHref="/dev/notebook"
	/>
{/if}

<!-- Keyed on the simulated platform so switching remounts the component and
     its capture-path detection runs again from scratch. -->
{#key `${platform}|${viewAs}`}
	<NotebookView
		{entries}
		{sessions}
		{folders}
		{sectionLabel}
		canReview={viewAs ? false : canReview}
		{configured}
		{photosReady}
		{sessionsReady}
		{initialCheckIn}
		{notesReady}
		{foldersReady}
		{pinsReady}
		{activity}
		{deletionReady}
		{draftsReady}
		deletedEntries={deletionReady ? deletedEntries : []}
		uploadReady={viewAs ? false : uploadReady}
		readOnly={viewAs}
		{historyReady}
		viewerId={VIEWER_ID}
		createEntry={viewAs ? undefined : createEntry}
		addPhoto={viewAs ? undefined : addPhoto}
		createNote={viewAs ? undefined : createNote}
		addNote={viewAs ? undefined : addNote}
		editNote={viewAs ? undefined : editNote}
		folderTransports={!viewAs && foldersReady ? folderTransports : undefined}
		setPinned={!viewAs && pinsReady ? setPinned : undefined}
		deleteEntry={viewAs ? undefined : deleteEntry}
		removePhoto={viewAs ? undefined : removePhoto}
		setEntryLabel={viewAs ? undefined : setEntryLabel}
		restoreEntry={viewAs ? undefined : restoreEntry}
		restorePhoto={viewAs ? undefined : restorePhoto}
		submitEntry={!viewAs && draftsReady ? submitEntry : undefined}
		unsubmitEntry={!viewAs && draftsReady ? unsubmitEntry : undefined}
		deleteNote={!viewAs && historyReady ? deleteNote : undefined}
		restoreNote={!viewAs && historyReady ? restoreNote : undefined}
	/>
{/key}

<style>
	.dev-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.6rem 1.2rem;
		border-bottom: 1px solid var(--line);
		background: var(--bg1);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
	}
	.dev-bar strong {
		color: var(--gold);
	}
	.tag {
		color: var(--cyan);
	}
	.dev-log {
		margin: 0;
		padding: 0.6rem 1.2rem;
		background: var(--bg0);
		border-bottom: 1px solid var(--line);
		color: var(--cyan);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
