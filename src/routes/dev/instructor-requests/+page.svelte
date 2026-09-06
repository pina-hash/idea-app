<script lang="ts">
	/**
	 * PROMPT 0069's FOUR BUILT ITEMS, IN ONE PLACE, MOUNTING THE REAL COMPONENTS.
	 *
	 * Dev-only and 404 in production (see +page.ts). Four mounts, one per item,
	 * because each is a different component and the whole point of the bundle is
	 * that they are all instructor surfaces rather than one feature:
	 *
	 *   1. THE DUE-TIME DEFAULT -- the real `ContentComposer` in create mode with
	 *      `kind="assignment"`, which is the only mode the due field renders in.
	 *      What is worth driving here is not that the boxes exist but that the
	 *      TIME box is seeded 23:59 with the DATE box empty: a default nobody can
	 *      see is the failure this replaces, and a seeded DATE would be a
	 *      deadline nobody chose. Both are readable off the two inputs.
	 *   2. THE SPOTIFY RULE -- the real `SongQueue` in its student projection. The
	 *      surface half of that item is a SENTENCE and a PLACEHOLDER, said before
	 *      the paste, and the refusal sentence rendered where the student is
	 *      working. The transport below answers `not_spotify` for anything that
	 *      is not a Spotify link, WITHOUT deciding it -- it is a stand-in for the
	 *      database's answer, not a second copy of the rule, which is why it
	 *      matches on a literal substring and would be useless as a gate.
	 *   3. THE SPAM STATUS -- the real `FeedbackConsole`, four rows, one already
	 *      marked spam. The claims worth a browser are that the fourth tab and
	 *      the fourth button EXIST, that a spam row is still on the All tab (the
	 *      export honesty argument), and that the row's other three buttons are
	 *      the undo.
	 *   4. THE TWO CONFUSABLE CONTROLS -- the real `ItemDetail` with
	 *      `canManage`, which is the only place the Instructor tools toggle and
	 *      the Edit control sit side by side. What is measured is that they are
	 *      now two distinguishable controls: different words, and two different
	 *      `aria-controls` targets.
	 *
	 * EVERY TRANSPORT IS IN MEMORY AND NOTHING HERE REACHES A NETWORK. The
	 * feedback console's `setStatus` records what it was asked for and answers
	 * ok, which is what lets the browser pass read the press back.
	 */
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import SongQueue from '$lib/classroom/SongQueue.svelte';
	import type {
		ClassroomComposerTransports,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import type { FeedbackRow, FeedbackStatus } from '$lib/feedback/feedback';
	import type {
		SongQueueStudentState,
		SongQueueTransports
	} from '$lib/classroom/song-queue';

	/** A pinned instant, so nothing on this page reads a clock. */
	const NOW = Date.parse('2026-09-10T18:00:00.000Z');

	const SECTION: ClassroomSection = {
		id: 'sec-1',
		course_id: 'course-1',
		label: 'Block 3',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	const composerTransports = {
		async createItem() {
			return { ok: true as const, itemId: 'item-1' };
		},
		async updateItem() {
			return { ok: true as const };
		},
		async loadCategorySuggestions() {
			return [] as string[];
		}
	} as unknown as ClassroomComposerTransports;

	// ---------------------------------------------------------------------
	// 2. The song queue.
	// ---------------------------------------------------------------------

	const songState: SongQueueStudentState = {
		scope: 'student',
		section_id: 'sec-1',
		price: 2,
		pending_cap: 3,
		my_pending: 0,
		approved: [],
		mine: []
	};

	/**
	 * A STAND-IN FOR THE DATABASE'S ANSWER, NOT A COPY OF THE RULE.
	 *
	 * The real decision is `_classroom_song_url_is_spotify` and nothing in
	 * `src/` may re-implement it -- `tests/classroom-song-queue-surface.test.ts`
	 * sweeps for exactly that. This substring test is deliberately too crude to
	 * be one (it would accept `https://example.net/?x=open.spotify.com`), which
	 * is the point: it is here so the page can render the two ANSWERS, and it
	 * would be worthless as a gate.
	 */
	const songTransports: SongQueueTransports = {
		async load() {
			return songState;
		},
		async submit(_sectionId, url) {
			if (url.includes('open.spotify.com') || url.includes('spotify.link')) {
				return {
					ok: true,
					request_id: 'req-new',
					section_id: 'sec-1',
					url,
					note: null,
					created_at: new Date(NOW).toISOString(),
					status: 'pending',
					pending: 1,
					cap: 3
				} as never;
			}
			return { ok: false, reason: 'not_spotify' } as never;
		},
		async approve() {
			return { ok: false, reason: 'already_decided' } as never;
		},
		async reject() {
			return { ok: false, reason: 'already_decided' } as never;
		}
	};

	// ---------------------------------------------------------------------
	// 3. The feedback console.
	// ---------------------------------------------------------------------

	const row = (
		id: string,
		status: FeedbackStatus,
		message: string,
		kind = 'bug'
	): FeedbackRow => ({
		id,
		app: 'classroom',
		context: '/classroom',
		kind,
		message,
		meta: { route: '/classroom/[sectionId]', path: '/classroom/sec-1', role: 'student' },
		status,
		created_at: '2026-09-05T17:20:00.000Z',
		reviewed_at: status === 'new' ? null : '2026-09-05T18:00:00.000Z',
		reviewed_by: status === 'new' ? null : 'apina@boscotech.edu',
		submitter_name: 'Ana Reyes',
		submitter_email: 'ana@boscotech.net'
	});

	/**
	 * TWO ROWS IN `new`, DELIBERATELY. The browser pass presses Spam on the
	 * first, and a single-row queue would then be EMPTY at measuring time --
	 * which is the feature working and would report as "0 buttons" on every row
	 * that measures the buttons. Two rows means the press is observable (the New
	 * count falls) AND there is still a row on screen to measure.
	 */
	const feedbackRows: FeedbackRow[] = [
		row('f1', 'new', 'BUY CHEAP WATCHES AT example.net'),
		row('f2', 'new', 'The grade page will not open on my phone.'),
		row('f3', 'seen', 'Could the due dates show the time as well?', 'idea'),
		row('f4', 'resolved', 'Fixed now, thank you.', 'praise'),
		row('f5', 'spam', 'A report somebody already marked spam.')
	];

	/** What the console asked for, readable by the browser pass. */
	let lastStatusCall = $state<string>('');

	async function setStatus(id: string, status: FeedbackStatus) {
		lastStatusCall = `${id}:${status}`;
		return { ok: true };
	}

	// ---------------------------------------------------------------------
	// 4. The item detail strip.
	// ---------------------------------------------------------------------

	const ITEM: ClassroomItem = {
		id: 'item-1',
		kind: 'assignment',
		title: 'Bracket sketch, three views',
		body: 'Sketch the bracket in three standard views. Dimension the two holes.',
		points: 20,
		due_at: '2026-09-11T06:59:00.000Z',
		category: 'Unit Labs',
		author_email: 'teacher@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		is_public: false,
		publish_at: null,
		unit_id: null,
		sort_order: 1,
		first_published_at: '2026-09-04T16:00:00.000Z',
		edited_at: null,
		created_at: '2026-09-04T16:00:00.000Z',
		updated_at: '2026-09-04T16:00:00.000Z',
		links: [],
		attachments: [],
		postings: [
			{
				item_id: 'item-1',
				section_id: 'sec-1',
				posted_at: '2026-09-04T16:00:00.000Z'
			} as never
		],
		instructorAttachments: [],
		instructorLinks: []
	};
</script>

<svelte:head><title>Instructor requests harness</title></svelte:head>

<div class="cr-root">
	<div class="harness">
		<h1>Instructor requests (prompt 0069)</h1>
		<p class="lede">
			The four built items, each mounting the real component. Item 4 of the five, sorting a list
			by date, was not built: the audit found several candidate pages and no way to tell which was
			meant.
		</p>

		<section class="mount" data-mount="due time defaults to 11:59pm">
			<h2>1. An assignment's due time defaults to 11:59pm</h2>
			<p class="note">
				The date box starts empty, so no deadline is invented. The time box starts at 23:59, so
				picking a day is all that is left to do.
			</p>
			<ContentComposer
				mode="create"
				kind="assignment"
				sections={[SECTION]}
				initialTargets={['sec-1']}
				transports={composerTransports}
				attachmentsEnabled={false}
				instructorAttachmentsEnabled={false}
				onsaved={() => {}}
			/>
		</section>

		<section class="mount" data-mount="song links are spotify only">
			<h2>2. Class music links are Spotify only</h2>
			<p class="note">
				The rule is said before the paste, and the refusal renders where the student is working.
				The transport here stands in for the database's answer; it does not decide it.
			</p>
			<SongQueue sectionId="sec-1" state={songState} transports={songTransports} now={NOW} />
		</section>

		<section class="mount" data-mount="a spam report is marked, not deleted">
			<h2>3. A false or spam report can be marked Spam</h2>
			<p class="note">
				A fourth status beside New, Seen and Resolved. The row is still there, still on the All
				tab, and the three other buttons on it are the undo.
			</p>
			<p class="probe" data-testid="probe-set-status">{lastStatusCall || 'no press yet'}</p>
			<FeedbackConsole rows={feedbackRows} {setStatus} now={() => NOW} />
		</section>

		<section class="mount" data-mount="edit and instructor tools are distinguishable">
			<h2>4. The Edit control and the Instructor tools toggle</h2>
			<p class="note">
				Adjacent, the same size, and both open a panel below this strip. They now say different
				words and name different regions.
			</p>
			<ItemDetail section={SECTION} item={ITEM} sections={[SECTION]} canManage transports={composerTransports} />
		</section>
	</div>
</div>

<style>
	.harness {
		padding: 1rem;
		max-width: 72rem;
		margin: 0 auto;
	}
	h1 {
		font-size: 1.2rem;
		margin: 0 0 0.4rem;
	}
	h2 {
		font-size: 1rem;
		margin: 0 0 0.3rem;
	}
	.lede,
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0 0 1rem;
	}
	.mount {
		margin: 0 0 2.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--boundary);
	}
	.probe {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
		margin: 0 0 0.6rem;
	}
</style>
