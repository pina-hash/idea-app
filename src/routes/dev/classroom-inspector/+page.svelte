<script lang="ts">
	import { page } from '$app/state';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import '$lib/classroom/classroom.css';
	import { itemInspector } from '$lib/classroom/inspector.svelte';
	import { SAMPLE_REFERENCE } from '$lib/classroom/dev-reference-fixture';
	import type {
		ClassroomComposerTransports,
		ClassroomItem,
		ClassroomSection,
		TxResult
	} from '$lib/classroom/classroom';
	import type { AssignmentSpec, AssignmentTeacherTransports, RubricCriterion } from '$lib/classroom/assignment-spec';
	import type { ClassCheckIn, ClassCheckInTransports } from '$lib/classroom/class-check-ins';
	import type { ClassroomDeck, DeckTransports } from '$lib/classroom/deck';
	import type { ReferenceTransports } from '$lib/classroom/reference-spec';
	import type { RevisionTransports } from '$lib/classroom/revisions';

	/**
	 * THE INSTRUCTOR INSPECTOR, mounted as the REAL ItemDetail -- never a copy of
	 * its markup. See +page.ts for the four cases and why this route exists.
	 *
	 * IT MOUNTS INSIDE `.cr-root` AND INSIDE A `ClassSplit`, because that is the
	 * room and the box production gives it: the item page is the DETAIL pane of
	 * the classroom's two-pane shell, so the inspector's real container at 1440px
	 * is roughly half the viewport and not the whole of it. A harness measuring
	 * this component across a full 1440px page would be measuring a width it
	 * never has -- and the header row's wrap point is exactly the kind of claim
	 * that would get wrong. `--cr-measure-route` mirrors what the real layout
	 * sets (see nav.ts's classroomMeasure).
	 */
	const iso = (d: number, h = 9) => new Date(Date.UTC(2026, 7, 16 + d, h)).toISOString();

	/**
	 * A FIXED FAR-FUTURE INSTANT, and not `iso(+n)`.
	 *
	 * `isScheduled` compares `publish_at` against the REAL clock, so a fixture
	 * dated off a pinned 2026 epoch stops being scheduled the moment the epoch
	 * passes -- and the Scheduled chip, which is the widest thing the header row
	 * can hold and therefore the whole point of measuring this row, silently
	 * disappears from the measurement rather than failing it. A date the clock
	 * cannot overtake keeps the widest case reachable, and it is still a
	 * constant, so the chip's text is byte-identical between runs.
	 */
	const FAR_FUTURE = '2031-09-05T15:30:00.000Z';

	const SECTION: ClassroomSection = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 2',
		block: 'B',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
	};

	const SECTION_2: ClassroomSection = {
		id: 's-2',
		course_id: 'c-1',
		label: 'Period 5',
		block: 'D',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
	};

	function baseItem(over: Partial<ClassroomItem> & { id: string; kind: ClassroomItem['kind'] }): ClassroomItem {
		return {
			title: null,
			body: '',
			body_doc: null,
			points: null,
			due_at: null,
			category: null,
			author_email: 'vargas@boscotech.edu',
			author_name: 'T. Vargas',
			published: true,
			pinned: false,
			is_public: false,
			publish_at: null,
			unit_id: null,
			sort_order: 1,
			first_published_at: iso(-6),
			edited_at: null,
			created_at: iso(-6),
			updated_at: iso(-6),
			links: [],
			attachments: [],
			postings: [{ section_id: 's-1' }],
			...over
		};
	}

	/**
	 * A LONG TITLE AND A SCHEDULED DATE ON PURPOSE. The state chips are the
	 * element in the header row that absorbs slack and truncates, so the case
	 * worth measuring is the widest chip this surface can produce -- "Scheduled
	 * &middot; <a date>" -- beside the quick controls, at 375px.
	 */
	const ASSIGNMENT: ClassroomItem = baseItem({
		id: 'i-assignment',
		kind: 'assignment',
		title: 'Bridge stackup: measuring span, rise and deck thickness to tolerance',
		body: 'Measure the truss you built on Tuesday and record every dimension.',
		points: 20,
		due_at: iso(4, 17),
		category: 'Lab',
		publish_at: FAR_FUTURE,
		pinned: true,
		postings: [{ section_id: 's-1' }, { section_id: 's-2' }],
		instructorAttachments: [
			{ id: 'ia-1', filename: 'bridge-answer-key.pdf', mime_type: 'application/octet-stream', size_bytes: 184320 }
		],
		instructorLinks: [{ id: 'il-1', label: 'Setup notes', url: 'https://example.org/setup' }]
	});

	/**
	 * SCHEDULED **AND** PUBLIC, which is the widest chip set one item can
	 * legally carry: `is_public` is CHECK-constrained to a material (0092), so
	 * "Scheduled &middot; <date>" beside "Public link" is only producible here.
	 * That is the case the header row has to survive at 375px.
	 */
	const MATERIAL: ClassroomItem = baseItem({
		id: 'i-material',
		kind: 'material',
		title: 'Hook design and manufacturing guide',
		body: 'The standing reference for the hook unit.',
		is_public: true,
		publish_at: FAR_FUTURE
	});

	const SPARSE: ClassroomItem = baseItem({
		id: 'i-sparse',
		kind: 'post',
		title: 'Shop is closed Thursday',
		body: 'No lab on Thursday. Bring your notebook Friday instead.',
		published: false
	});

	const SPEC = {
		schemaVersion: 1,
		meta: { assignmentId: 'bridge-stackup', title: 'Bridge stackup', totalPoints: 20, unit: 2 },
		modules: [
			{
				id: 'm1',
				title: 'Measure',
				points: 20,
				aiLevel: 1,
				blocks: [
					{ type: 'instructions', content: 'Measure the span at three points and record each one.' },
					{ type: 'textField', id: 'f1', prompt: 'What did you measure the span as?' }
				],
				rubric: [
					{
						id: 'm1-r1',
						label: 'Accuracy',
						levels: [
							{ label: 'Full', points: 20, descriptor: 'Every dimension within tolerance.' },
							{ label: 'Part', points: 12, descriptor: 'Most dimensions within tolerance.' },
							{ label: 'None', points: 0, descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	} as unknown as AssignmentSpec;

	const RUBRIC: RubricCriterion[] = [
		{
			id: 'm1-r1',
			criterion: 'Accuracy',
			points: 20,
			levels: [
				{ label: 'Full', points: 20, descriptor: 'Every dimension within tolerance.' },
				{ label: 'Part', points: 12, descriptor: 'Most dimensions within tolerance.' },
				{ label: 'None', points: 0, descriptor: 'Not attempted.' }
			]
		}
	];

	const DECK: ClassroomDeck = {
		item_id: 'i-material',
		title: 'Hook design walkthrough',
		slides: [],
		has_state_file: true
	} as unknown as ClassroomDeck;

	const CHECK_IN: ClassCheckIn = {
		session_id: 'ns-1',
		section_id: 's-1',
		unit_number: 2,
		session_date: '2026-08-20',
		session_label: 'Truss layout sketch',
		status: null,
		flag_reason: null,
		item_id: 'i-assignment',
		guidance_doc: null
	};

	// --- Stub transports. Every one resolves without doing anything: this
	//     harness is for the inspector's ARRANGEMENT, not its write paths.
	const ok = <T,>(value: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data: value });

	const composerTransports: ClassroomComposerTransports = {
		createItem: () => ok({ itemId: 'i-new', sectionIds: [], formattingDropped: false }),
		updateItem: () => ok({ itemId: 'i-assignment', sectionIds: [], formattingDropped: false }),
		deleteItem: () => ok(undefined),
		duplicateItem: () => ok({ itemId: 'i-copy' }),
		addPostings: () => ok({ added: 0 }),
		removePosting: () => ok({ ok: true }),
		setPublished: () => ok(undefined),
		setPinned: () => ok(undefined),
		setOrder: () => ok(undefined),
		uploadAttachment: () => ok(undefined),
		deleteAttachment: () => ok(undefined),
		uploadInstructorAttachment: () => ok(undefined),
		deleteInstructorAttachment: () => ok(undefined),
		setInstructorResources: () => ok(undefined),
		markViewed: () => ok(undefined)
	};

	const teacherTransports: AssignmentTeacherTransports = {
		setSpec: () => ok(undefined),
		setRubric: () => ok(undefined),
		gradeSubmission: () => ok(undefined as never),
		approveModule: () => ok(undefined),
		loadGrading: () => ok(undefined as never)
	};

	const referenceTransports: ReferenceTransports = {
		setReferenceSpec: () => Promise.resolve({ ok: true }),
		setPublic: () => Promise.resolve({ ok: true })
	};

	const deckTransports: DeckTransports = {
		uploadDeck: () => Promise.resolve({ ok: true, message: '', fileCount: 0, replaced: false }),
		deleteDeck: () => Promise.resolve({ ok: true, message: '' })
	};

	const revisionTransports: RevisionTransports = {
		load: () => Promise.resolve({ ok: true as const, data: { entries: [], headRevisions: {} } as never }),
		restore: () => Promise.resolve({ ok: false as const, message: 'Stub.' })
	};

	let sessionSeq = 0;
	const checkInTransports: ClassCheckInTransports = {
		createForItem: () => Promise.resolve({ ok: true, sessionId: `ns-harness-${++sessionSeq}` }),
		unlink: () => Promise.resolve({ ok: true }),
		setGuidance: () => Promise.resolve({ ok: true })
	};

	type Case = 'assignment' | 'material' | 'sparse' | 'student';
	const CASES: { id: Case; label: string; blurb: string }[] = [
		{ id: 'assignment', label: 'Assignment (manager)', blurb: 'Spec, rubric, grading href, check-in, instructor-only material, history. All three groups.' },
		{ id: 'material', label: 'Material (manager)', blurb: 'Reference document and a deck. No assignment engine, no instructor-only group.' },
		{ id: 'sparse', label: 'Sparse (manager)', blurb: 'Every optional transport null. Only "This post" survives -- the empty-group control.' },
		{ id: 'student', label: 'Student', blurb: 'canManage false. The whole region is absent -- the positive control.' }
	];

	const current = $derived<Case>((page.url.searchParams.get('case') as Case) ?? 'assignment');
	const wantOpen = $derived(page.url.searchParams.get('open') === '1');

	const item = $derived(
		current === 'material' ? MATERIAL : current === 'sparse' ? SPARSE : ASSIGNMENT
	);
	const manage = $derived(current !== 'student');
	const isAssignment = $derived(current === 'assignment');
	const isMaterial = $derived(current === 'material');
	const isSparse = $derived(current === 'sparse');

	/**
	 * OPENED FROM THE URL, NOT BY A CLICK THE HARNESS HOPES LANDS. The open flag
	 * is module state that deliberately starts collapsed (inspector.svelte.ts),
	 * which is right for the product and useless for a run that has to measure
	 * the body. Written in an effect and UNTRACKED, because writing a `$state`
	 * an expression above it also reads is how an effect re-triggers itself
	 * forever -- the transport-in-an-effect trap in CLAUDE.md, in its smallest
	 * form.
	 */
	$effect(() => {
		const open = wantOpen;
		itemInspector.open = open;
	});
</script>

<svelte:head><title>dev: classroom item inspector</title></svelte:head>

<div class="cr-root" style="--cr-measure-route: var(--measure-wide)">
	<div class="harness-bar">
		<h1>Instructor inspector</h1>
		<nav class="harness-cases">
			{#each CASES as c (c.id)}
				<a
					class="harness-case"
					class:on={current === c.id}
					href={`/dev/classroom-inspector?case=${c.id}${wantOpen ? '&open=1' : ''}`}
					data-testid={`case-${c.id}`}>{c.label}</a
				>
			{/each}
			<a
				class="harness-case"
				class:on={wantOpen}
				href={`/dev/classroom-inspector?case=${current}&open=${wantOpen ? '0' : '1'}`}
				data-testid="toggle-open">{wantOpen ? 'Tools open' : 'Tools shut'}</a
			>
		</nav>
		<p class="harness-blurb" data-testid="case-blurb">
			{CASES.find((c) => c.id === current)?.blurb}
		</p>
	</div>

	<!-- THE REAL SHELL. The item page is the DETAIL pane in production, so the
	     inspector's container here is the same fraction of the viewport it is
	     there. `hasDetail` is always true: this harness only ever has a detail. -->
	<ClassSplit scroll="page" detailWidth="roomy" narrow="swap" hasDetail>
		{#snippet nav()}
			<p class="harness-note">
				The class stream sits here in production. It is a placeholder: this route
				measures the detail pane.
			</p>
		{/snippet}
		{#snippet children()}
			{#key `${current}-${wantOpen}`}
				<ItemDetail
					section={SECTION}
					{item}
					sections={[SECTION, SECTION_2]}
					canManage={manage}
					transports={manage ? composerTransports : null}
					basePath="/dev/classroom-inspector"
					spec={isAssignment ? SPEC : null}
					rubric={isAssignment ? RUBRIC : null}
					teacherTransports={isAssignment ? teacherTransports : null}
					gradeHref={isAssignment ? '/dev/classroom-inspector/grade' : null}
					referenceSpec={isMaterial ? SAMPLE_REFERENCE : null}
					referenceTransports={isMaterial ? referenceTransports : null}
					deck={isMaterial ? DECK : null}
					deckTransports={isMaterial ? deckTransports : null}
					revisionTransports={isSparse ? null : revisionTransports}
					checkIns={isAssignment ? [CHECK_IN] : []}
					checkInTransports={isAssignment ? checkInTransports : null}
				/>
			{/key}
		{/snippet}
	</ClassSplit>
</div>

<style>
	.harness-bar {
		padding: var(--space-3) var(--space-4) 0;
	}
	.harness-bar h1 {
		margin: 0 0 var(--space-2);
		font-size: 1.1rem;
	}
	.harness-cases {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.harness-case {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
		text-decoration: none;
	}
	.harness-case.on {
		color: var(--green);
		border-color: var(--green);
	}
	.harness-blurb,
	.harness-note {
		margin: var(--space-2) 0 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
</style>
