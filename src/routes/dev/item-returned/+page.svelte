<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
	import type { HxAnswerTransports } from '$lib/classroom/html-assignment/answers';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type {
		AssignmentEngineTransports,
		AssignmentSpec,
		RubricCriterion,
		StudentEngineData
	} from '$lib/classroom/assignment-spec';
	import {
		itemTitle,
		sectionTitle,
		type ClassroomItem,
		type ClassroomSection,
		type StudentWork
	} from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		classNotebookHref,
		locateClassroom,
		sectionTabs
	} from '$lib/classroom/nav';

	/**
	 * THE ITEM PAGE A STUDENT OPENS AFTER THEIR WORK COMES BACK, ON EVERY ENGINE
	 * (ledger 0297, package ITEM). The real shell, the real split, the real class
	 * list and the real ItemDetail, under the same `--cr-measure-route` the real
	 * route sets -- so the geometry measured here (how far down the page the
	 * teacher's comment sits at 375) is the geometry a student gets.
	 *
	 *   ?engine=v1|v2|v3|v4   which engine the assignment runs on (default v1).
	 *                         v4 is the IdeaCAD assignment whose work happens in
	 *                         the IdeaCAD app (`ideacad.standalone`): the item
	 *                         page is a door, and the returned card sits above it.
	 *   ?state=returned|new   returned with a score, breakdown and comment
	 *                         (default), or not started, which is where the
	 *                         "How this is graded" rubric is read BEFORE the work.
	 *
	 * The rubric is four leveled criteria on purpose: the breakdown is what used
	 * to sit ABOVE the teacher's comment, and a short one would hide the defect
	 * this page exists to measure.
	 */
	const BASE = '/dev/item-returned';
	const q = page.url.searchParams;
	const engineKind = (['v1', 'v2', 'v3', 'v4'] as const).find((k) => k === q.get('engine')) ?? 'v1';
	const returned = q.get('state') !== 'new';
	const TODAY = '2026-09-23';

	const SECTION = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 2',
		block: 'B',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	} as ClassroomSection;

	const RUBRIC: RubricCriterion[] = [
		['c1', 'Datum callouts', 'Every datum is called out and dimensioned from.', 'Most are called out.', 'Few are called out.'],
		['c2', 'Line weights', 'Visible, hidden and centre lines are all distinct.', 'Two of the three are distinct.', 'One weight throughout.'],
		['c3', 'Title block', 'Name, scale, units, material and date are all filled in.', 'One field is missing.', 'Several fields are missing.'],
		['c4', 'Tolerances', 'Every critical dimension carries a tolerance.', 'Some critical dimensions do.', 'None do.']
	].map(([id, criterion, top, mid, low]) => ({
		id,
		criterion,
		points: 10,
		levels: [
			{ points: 10, label: 'Exemplary', short: 'Exemplary', descriptor: top },
			{ points: 7, label: 'Proficient', short: 'Proficient', descriptor: mid },
			{ points: 0, label: 'Beginning', short: 'Beginning', descriptor: low }
		]
	})) as unknown as RubricCriterion[];

	const COMMENT =
		'Strong drawing. Your datum callouts are clear, but the title block is missing the material and two critical dimensions have no tolerance. Fix those two and resubmit.';

	const SUBMISSION = returned
		? {
				id: 'sub-1',
				item_id: 'i-1',
				student_email: 'ana@boscotech.net',
				state: 'returned',
				submitted_at: '2026-09-20T15:00:00.000Z',
				returned_at: '2026-09-22T15:00:00.000Z',
				rubric_scores: { c1: 10, c2: 7, c3: 7, c4: 0 },
				criterion_comments: { c3: 'Material is missing.' },
				score: 24,
				teacher_comment: COMMENT,
				graded_by: 'vargas@boscotech.edu',
				graded_at: '2026-09-22T15:00:00.000Z'
			}
		: null;

	const SPEC: AssignmentSpec = {
		schemaVersion: engineKind === 'v2' ? 2 : 1,
		...(engineKind === 'v2' ? { kind: 'assignment' } : {}),
		meta: { assignmentId: 'datum', title: 'Datum drawing', totalPoints: 40 },
		modules: [
			{
				id: 'm1',
				title: 'Callouts',
				points: 40,
				instructions: 'Name the primary datum and say why you chose it.',
				blocks: [{ type: 'textField', id: 'b1', prompt: 'Name the primary datum and say why you chose it.' }]
			}
		]
	} as unknown as AssignmentSpec;

	/** The `/hx/worksheet` fixture's own fields; the block ids are this page's. */
	const WORKSHEET: HtmlAssignmentManifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Datum drawing',
		course: 'IDEA209H',
		points: 40,
		header: [{ id: 'hxw-team', field: 'teamName', type: 'text' }],
		modules: [
			{
				id: 'hxw-mod',
				title: 'One module',
				points: 40,
				blocks: [
					{ id: 'hxw-reflection', field: 'reflection', type: 'longText', minSentences: 2 },
					{ id: 'hxw-done', field: 'checkedOff', type: 'checkbox' }
				],
				criteria: []
			}
		]
	};

	const ITEM = {
		id: 'i-1',
		kind: 'assignment',
		title: 'Datum drawing',
		body: 'Draw the bracket in three views and call out every datum. Put your name in the title block.',
		body_doc: null,
		points: 40,
		due_at: '2026-09-21T15:00:00Z',
		category: 'Drawing',
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 1,
		first_published_at: '2026-09-15T15:00:00Z',
		edited_at: null,
		created_at: '2026-09-15T15:00:00Z',
		updated_at: '2026-09-15T15:00:00Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		assignment_schema_version: engineKind === 'v3' ? 3 : engineKind === 'v4' ? 4 : 1
	} as unknown as ClassroomItem;

	const ENGINE = {
		spec: engineKind === 'v1' || engineKind === 'v2' ? SPEC : null,
		rubric: RUBRIC,
		submission: SUBMISSION,
		/* Only a returned hand-in carries an answer: `new` is work nobody has
		   started, which is the state the rubric is read in, open. */
		responses:
			returned && (engineKind === 'v1' || engineKind === 'v2')
				? [{ block_id: 'b1', value: { text: 'Face A, the mounting face' } }]
				: [],
		files: [],
		approvals: []
	} as unknown as StudentEngineData;

	/** The class list's own row reads the same submission, as the real route
	    hands it, so the row's chip agrees with the page rather than reading an
	    empty payload as Missing. */
	const work: Record<string, StudentWork> = SUBMISSION
		? { [ITEM.id]: { state: 'returned', score: SUBMISSION.score } }
		: {};

	/** In memory; nothing on this page writes, but the engine mounts with a
	    write path the way the real route hands it one. */
	const ok = async () => ({ ok: true as const, data: { ok: true } });
	const engineTransports = {
		saveResponse: ok,
		submitAssignment: ok,
		unsubmitAssignment: ok,
		uploadSubmissionFile: async () => ({ ok: false as const, message: 'Not in this harness.' }),
		deleteSubmissionFile: ok,
		setFileCaption: ok,
		reloadStudent: async () => ({ ok: true as const, data: ENGINE })
	} as unknown as AssignmentEngineTransports;

	const hxTransports: HxAnswerTransports = {
		saveResponse: ok as never,
		uploadSubmissionFile: (async () => ({ ok: false, message: 'Not in this harness.' })) as never,
		deleteSubmissionFile: ok as never,
		setFileCaption: ok as never
	};
	const htmlAnswers =
		engineKind === 'v3'
			? new HxAnswersStore({
					itemId: ITEM.id,
					manifest: WORKSHEET,
					transports: hxTransports,
					values: {},
					images: {},
					fileIds: new Map()
				})
			: null;
	onDestroy(() => htmlAnswers?.destroy());

	const loc = locateClassroom(`/classroom/s-1/item/${ITEM.id}`);
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(loc, { section: sectionTitle(SECTION), item: itemTitle(ITEM) }, BASE);
	const tabs = sectionTabs('s-1', BASE);
</script>

<svelte:head><title>dev // item returned</title></svelte:head>

{#snippet classList()}
	<ClassView
		section={SECTION}
		items={[ITEM]}
		units={[]}
		sections={[SECTION]}
		selectedItemId={ITEM.id}
		collapsed={[]}
		canManage={false}
		transports={null}
		checkIns={[]}
		{work}
		asPane={true}
		basePath={BASE}
		notebookHref={classNotebookHref('s-1', BASE)}
		clock={{ now: `${TODAY}T20:00:00.000Z`, today: TODAY }}
	/>
{/snippet}

<div
	class="cr-root"
	class:cr-app={measure === 'console'}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	data-engine={engineKind}
	data-state={returned ? 'returned' : 'new'}
>
	<ClassroomShell
		basePath={BASE}
		sections={[SECTION]}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={false}
	>
		<ClassSplit hasDetail={true} nav={classList} overlay={null}>
			<ItemDetail
				section={SECTION}
				item={ITEM}
				canManage={false}
				basePath={BASE}
				engine={ENGINE}
				{engineTransports}
				htmlAssignment={engineKind === 'v3'
					? { documentId: 'worksheet', manifest: WORKSHEET, filename: 'worksheet.html', updatedAt: null }
					: null}
				{htmlAnswers}
				ideacad={engineKind === 'v4' ? ({ standalone: true } as never) : null}
			/>
		</ClassSplit>
	</ClassroomShell>
</div>
