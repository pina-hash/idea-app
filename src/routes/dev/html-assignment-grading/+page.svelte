<script lang="ts">
	import { page } from '$app/state';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import { hxFrameSeed } from '$lib/classroom/html-assignment/answers';
	import {
		htmlAssignmentSrc,
		htmlFieldToBlockId
	} from '$lib/classroom/html-assignment/mount';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import {
		registerLocalSubmissionFileUrl,
		type AssignmentTeacherTransports,
		type ResponseRow,
		type RubricCriterion,
		type StudentWork,
		type SubmissionFileRow,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	// THE ROOM'S OWN STYLESHEET, not just its class. `.cr-root` with no rules
	// behind it paints the portal plate while claiming to be the classroom,
	// which is a worse fixture than no wrapper at all.
	import '$lib/classroom/classroom.css';

	/** `empty` selects the student with nothing stored; `broken` points the one
	    photo at a URL that cannot decode, so the fallback row is measurable. */
	// NOT NAMED `state`: a local of that name shadows the `$state` rune and
	// every later `$state(...)` in this file becomes a store read.
	const viewState = $derived(page.url.searchParams.get('state') ?? '');
	const wantEmpty = $derived(viewState === 'empty');
	const broken = $derived(viewState === 'broken');

	const ITEM_ID = 'i-hx-smoke';
	const SECTION_ID = 's-hx';
	const TEACHER = 'teacher@boscotech.edu';

	/** Fixed instants, never `new Date()`: a fixture that moves cannot be asserted. */
	const NOW = Date.parse('2026-09-10T17:00:00Z');
	const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

	const SECTION: ClassroomSection = {
		id: SECTION_ID,
		course_id: 'c-1',
		label: 'Block 4',
		block: '4',
		teacher_email: TEACHER,
		active: true,
		course: { id: 'c-1', code: 'IDEA100', title: 'Engineering Essentials', active: true }
	};

	/**
	 * PUBLISHED AND NOT SCHEDULED, so `htmlAssignmentServed` is true and the
	 * frame is mounted. The not-live sentence is the other branch and has its
	 * own measurement; here it would hide the pane this route exists to measure.
	 */
	const ITEM: ClassroomItem = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'HX Smoke Test',
		body: '',
		points: 10,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: iso(4),
		edited_at: null,
		created_at: iso(4),
		updated_at: iso(4),
		attachments: [],
		publish_at: null
	} as unknown as ClassroomItem;

	/**
	 * THE FIELDS ARE THE `/hx/worksheet` FIXTURE'S OWN (`teamName`,
	 * `reflection`, `checkedOff`) AND THE BLOCK IDS ARE NOT.
	 *
	 * The document knows only its fields and has never been told a block id, so
	 * these ids are this fixture's alone -- and they are deliberately different
	 * strings from the fields, because a lookup that is the identity function
	 * cannot be observed. They also satisfy `HTML_ID_RE` (`[A-Za-z0-9_-]{1,40}`),
	 * which the dev document's own map predates and does not.
	 */
	const MANIFEST = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'HX Smoke Test',
		course: 'IDEA100',
		points: 10,
		header: [{ id: 'hxw-team', field: 'teamName', type: 'text' }],
		modules: [
			{
				id: 'hxw-work',
				title: 'Work',
				points: 10,
				audience: 'individual',
				blocks: [
					{ id: 'hxw-reflection', field: 'reflection', type: 'longText', minSentences: 2 },
					{ id: 'hxw-done', field: 'checkedOff', type: 'checkbox' },
					{ id: 'hxw-photo', field: 'photo', type: 'image' }
				],
				criteria: [
					{
						id: 'work',
						text: 'Everything answered',
						points: 10,
						levels: [
							{ points: 10, label: 'Complete', short: 'All answered', descriptor: 'Every field is filled in.' },
							{ points: 5, label: 'Developing', short: 'Some answered', descriptor: 'Some fields are filled in.' },
							{ points: 0, label: 'Absent', short: 'Nothing answered', descriptor: 'Nothing is filled in.' }
						]
					}
				]
			}
		]
	} as unknown as HtmlAssignmentManifest;

	const RUBRIC: RubricCriterion[] = MANIFEST.modules[0].criteria as unknown as RubricCriterion[];

	const ROSTER: ClassroomEnrollment[] = [
		{
			section_id: SECTION_ID,
			student_email: 'alice@boscotech.net',
			display_name: 'Alice Alvarez',
			active: true,
			manages: false
		},
		{
			section_id: SECTION_ID,
			student_email: 'bruno@boscotech.net',
			display_name: 'Bruno Baptiste',
			active: true,
			manages: false
		}
	];

	/**
	 * AN 8x5 PNG AS A DATA URI, REGISTERED THROUGH THE EXISTING DEV OVERRIDE.
	 * Its bytes were CHECKED IN A BROWSER rather than typed from memory: the
	 * first one here was valid base64 carrying malformed PNG, which decoded to
	 * nothing and silently put the fallback row on screen in the state meant to
	 * show a working thumbnail -- a fixture that measures the wrong branch and
	 * looks entirely correct.
	 * The real proxy needs a session and a row; `registerLocalSubmissionFileUrl`
	 * is the hook the attachment surfaces already use for exactly this.
	 * `?state=broken` registers a URL that cannot decode instead, which is what
	 * puts the fallback row on screen.
	 */
	const PNG =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAIAAAD38zoCAAAAEUlEQVR4nGOIWpCHFTHQQQIAucA4QbqkH88AAAAASUVORK5CYII=';
	// REGISTERED AT MODULE SCOPE AND NOT FROM AN `$effect`, which was the first
	// shape and is measurably wrong: `hxImagesFromFiles` reads
	// `submissionFileSrc` while the console builds its rows, which happens
	// BEFORE effects run, so the override landed after the URL had already been
	// taken and every thumbnail fell back. Measured: `missing: 1`, `thumbs: []`.
	// svelte-ignore state_referenced_locally
	registerLocalSubmissionFileUrl(
		'f-photo-1',
		page.url.searchParams.get('state') === 'broken' ? 'data:image/png;base64,Zm9v' : PNG
	);

	/**
	 * ALICE HAS A SUBMISSION ROW BECAUSE SHE ATTACHED A FILE, which is 0086's
	 * own rule and not a fixture convenience: responses are deliberately
	 * independent of the submissions table so autosave never has to create one,
	 * and the row is created lazily by the first file attach, the first grade or
	 * the submit. BRUNO HAS NO ROW AT ALL, which is what a student who has typed
	 * nothing and attached nothing looks like -- and there is no turn-in on a
	 * ported assignment, so neither of them is ever "submitted" by their own
	 * hand.
	 */
	const SUBMISSIONS: SubmissionRow[] = [
		{
			id: 'sub-alice',
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			state: 'draft',
			submitted_at: null,
			returned_at: null,
			scores: null,
			total: null,
			comment: null,
			updated_at: iso(0)
		} as unknown as SubmissionRow
	];

	const RESPONSES: ResponseRow[] = [
		{
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			block_id: 'hxw-team',
			value: { text: 'Team Meridian' }
		},
		{
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			block_id: 'hxw-reflection',
			value: {
				text: 'I modelled the blade root and the hub today. The fillet at the root took three tries before it would rebuild.'
			}
		},
		{
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			block_id: 'hxw-done',
			value: { checked: [true] }
		}
	];

	const FILES: SubmissionFileRow[] = [
		{
			id: 'f-photo-1',
			submission_id: 'sub-alice',
			block_id: 'hxw-photo',
			filename: 'blade-root-fillet.png',
			caption: 'The fillet after the third rebuild',
			mime_type: 'application/octet-stream',
			sort_order: 1
		}
	];

	let log = $state<string[]>([]);
	function note(what: string) {
		log = [...log, what];
	}

	const transports: AssignmentTeacherTransports = {
		async setSpec(itemId) {
			note(`setSpec ${itemId}`);
			return { ok: true, data: undefined };
		},
		async setRubric(itemId) {
			note(`setRubric ${itemId}`);
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail) {
			note(`gradeSubmission ${studentEmail}`);
			return { ok: true, data: { ok: true, state: 'submitted' } };
		},
		async approveModule(itemId, studentEmail, moduleId) {
			note(`approveModule ${studentEmail} ${moduleId}`);
			return { ok: true, data: undefined };
		},
		async loadGrading() {
			return {
				ok: true,
				data: {
					roster: ROSTER,
					submissions: SUBMISSIONS,
					// The empty state is the SAME fixture with the stored rows taken
					// away, so the only difference on screen is the one being measured.
					responses: wantEmpty ? [] : RESPONSES,
					files: wantEmpty ? [] : FILES,
					filesStorageReady: true,
					extraCreditReady: true,
					approvals: []
				}
			};
		}
	};

	const htmlSrc = $derived(htmlAssignmentSrc('', 'worksheet'));
	const htmlFields = $derived(htmlFieldToBlockId(MANIFEST));

	function seedFor(student: StudentWork) {
		return hxFrameSeed(MANIFEST, student.responses, student.files);
	}
</script>

<svelte:head><title>dev: grading console, ported HTML assignment</title></svelte:head>

<div class="cr-root harness" data-testid="hx-grading-harness">
	<header class="hx-head">
		<h1>Grading console, ported HTML assignment</h1>
		<p class="hx-note">
			The REAL <code>GradingConsole</code> with <code>spec = null</code> -- the real
			schema-3 configuration -- and the REAL <code>HtmlAssignmentFrame</code> in its work
			pane, pointed at the real <code>/hx/worksheet</code>. Before ledger 0141 no
			<code>htmlWork</code> snippet was passed and this pane was empty.
		</p>
		<nav class="hx-states">
			<a class="hx-state" class:is-on={viewState === ''} href="/dev/html-assignment-grading">work</a>
			<a class="hx-state" class:is-on={wantEmpty} href="/dev/html-assignment-grading?state=empty">no answers</a>
			<a class="hx-state" class:is-on={broken} href="/dev/html-assignment-grading?state=broken">photo will not decode</a>
		</nav>
	</header>

	{#key viewState}
		<GradingConsole
			section={SECTION}
			item={ITEM}
			spec={null}
			rubric={RUBRIC}
			{transports}
			{htmlWork}
		/>
	{/key}

	{#snippet htmlWork(student: StudentWork)}
		{@const seed = seedFor(student)}
		<HtmlAssignmentFrame
			src={htmlSrc}
			title={ITEM.title ?? 'Assignment'}
			fieldToBlockId={htmlFields}
			values={seed.values}
			images={seed.images}
			saved={null}
			readOnly
		/>
	{/snippet}

	<section class="hx-log" aria-label="Transport calls">
		<h2>Transport calls</h2>
		<ul data-testid="hx-log">
			{#each log as line, i (i)}<li>{line}</li>{/each}
		</ul>
	</section>
</div>

<style>
	.harness {
		padding: var(--space-4, 1.2rem);
	}
	.hx-head {
		margin-bottom: var(--space-4, 1.2rem);
	}
	.hx-head h1 {
		font-family: var(--font-title, var(--font-display));
		font-size: 1.1rem;
		margin: 0 0 0.4rem;
	}
	.hx-note {
		color: var(--text-2);
		font-size: 0.85rem;
		max-width: var(--measure-reading, 62ch);
		margin: 0 0 0.8rem;
	}
	.hx-states {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.hx-state {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		text-decoration: none;
	}
	.hx-state.is-on {
		color: var(--green);
		border-color: var(--green);
	}
	.hx-log {
		margin-top: var(--space-4, 1.2rem);
	}
	.hx-log h2 {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.hx-log ul {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		padding-left: 1.2rem;
	}
</style>
