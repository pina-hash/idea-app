<script lang="ts">
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import RubricBuilder from '$lib/classroom/RubricBuilder.svelte';
	import RubricView from '$lib/classroom/RubricView.svelte';
	import {
		levelShort,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type RubricCriterion,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	// THE ROOM'S OWN STYLESHEET, not just its class. `.cr-root` with no rules
	// behind it is a fixture that paints the portal plate while claiming to be
	// the classroom, which is worse than no wrapper at all
	// (tools/browser-verify/routes/README.md, "A harness must be in the room
	// production is in"). The spec carries a presence row asserting it mounted.
	import '$lib/classroom/classroom.css';

	/**
	 * THE REAL `RubricBuilder`, the REAL `RubricView` and the REAL
	 * `GradingConsole`, over ONE store. Editing a level here writes the store
	 * the console below reads, so "does an edited description reach the place
	 * the work is marked" is a thing a person can do rather than reason about.
	 * `+page.ts` carries the argument.
	 */

	const ITEM_ID = 'i-unit1-final';
	const SECTION_ID = 's-unit1';
	const TEACHER = 'teacher@boscotech.edu';

	/** Fixed instants, never `new Date()`: a fixture that moves cannot be asserted. */
	const NOW = Date.parse('2026-09-08T17:00:00Z');
	const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

	const SECTION: ClassroomSection = {
		id: SECTION_ID,
		course_id: 'c-1',
		label: 'Block 4',
		block: '4',
		teacher_email: TEACHER,
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	const ITEM: ClassroomItem = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'Unit 1 Final: Report, Presentation, and Defense',
		body: 'Hand in the report, then present and defend it.',
		body_doc: null,
		points: 10,
		due_at: iso(1),
		category: 'Unit Labs',
		author_email: TEACHER,
		author_name: 'W. Cosso',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: iso(10),
		edited_at: null,
		created_at: iso(10),
		updated_at: iso(1),
		links: [],
		attachments: [],
		postings: []
	};

	/**
	 * THE SPEC IS THE UNEDITED ONE, which is the whole point of having it here.
	 * Mr. Cosso edited the RUBRIC; nothing touched the spec, so it still holds
	 * the sourcing wording. `levelShort` rung two reads it, so a level whose
	 * stored short is cleared falls back to THIS rather than to the description
	 * -- the residual this lane could not close, visible on screen.
	 */
	const SPEC: AssignmentSpec = {
		schemaVersion: 1,
		meta: {
			assignmentId: 'idea209h-unit1-final',
			title: 'Unit 1 Final: Report, Presentation, and Defense',
			totalPoints: 10,
			gradingCategory: 'Unit Labs'
		},
		modules: [
			{
				id: 'm1',
				title: 'Engineering Report',
				points: 10,
				blocks: [
					{
						type: 'instructions',
						content: 'Write the four sections, then defend them.'
					}
				],
				rubric: [
					{
						id: 'c1',
						criterion: 'All four sections complete',
						levels: [
							{ points: 4, label: 'Complete', short: 'Four sections, nothing missing', descriptor: 'All four sections are present and each answers its prompt.' },
							{ points: 3, label: 'Proficient', short: 'One item missing', descriptor: 'All four present; one omits an item its prompt asked for.' },
							{ points: 0, label: 'Absent', short: 'Two or more sections missing', descriptor: 'Two or more sections are missing or empty.' }
						]
					},
					{
						id: 'c2',
						criterion: 'Every value and property carries its source',
						levels: [
							{ points: 4, label: 'Complete', short: 'All sourced', descriptor: 'Every published property carries its value and the page it was read from.' },
							{ points: 3, label: 'Proficient', short: 'One source missing', descriptor: 'One property is named with its value but no source.' },
							{ points: 0, label: 'Absent', short: 'Four or more unsourced', descriptor: 'Four or more properties carry no source.' }
						]
					},
					{
						id: 'c3',
						criterion: 'Readable without asking the writer',
						levels: [
							{ points: 2, label: 'Complete', short: 'Follows on one read', descriptor: 'A reader who has not seen the checkpoints can follow it on one read.' },
							{ points: 1, label: 'Proficient', short: 'One passage needs rereading', descriptor: 'One passage has to be reread, but the rest follows.' },
							{ points: 0, label: 'Absent', short: 'Cannot be followed', descriptor: 'The report cannot be followed without asking the writer.' }
						]
					}
				]
			}
		]
	} as unknown as AssignmentSpec;

	/**
	 * THE STORED RUBRIC, as `classroom_rubrics` holds it: generated from the
	 * spec, so every level carries BOTH forms and the ids are `rubricFromSpec`'s
	 * own `<module>-<authored>`. THREE levels on two criteria and FOUR on one,
	 * because the level control's density is what `short` exists for and a
	 * uniform ladder never exercises the fourth button.
	 */
	const SEEDED: RubricCriterion[] = [
		{
			id: 'm1-c1',
			criterion: 'Engineering Report: All four sections complete',
			points: 4,
			levels: [
				{ points: 4, label: 'Complete', short: 'Four sections, nothing missing', descriptor: 'All four sections are present and each one answers everything its prompt asked for.' },
				{ points: 3, label: 'Proficient', short: 'One item missing', descriptor: 'All four sections are present; one section omits one item its prompt asked for.' },
				{ points: 1, label: 'Developing', short: 'A section missing or empty', descriptor: 'One section is missing or empty, or two or more sections omit an item.' },
				{ points: 0, label: 'Absent', short: 'Two or more sections missing', descriptor: 'Two or more sections are missing or empty.' }
			]
		},
		{
			id: 'm1-c2',
			criterion: 'Engineering Report: Every value and property carries its source',
			points: 4,
			levels: [
				{ points: 4, label: 'Complete', short: 'All sourced', descriptor: 'Every published property named in the report carries its value and the vendor page it was read from.' },
				{ points: 3, label: 'Proficient', short: 'One source missing', descriptor: 'One property is named with its value but no source.' },
				{ points: 0, label: 'Absent', short: 'Four or more unsourced', descriptor: 'Four or more properties carry no source.' }
			]
		},
		{
			id: 'm1-c3',
			criterion: 'Engineering Report: Readable without asking the writer',
			points: 2,
			levels: [
				{ points: 2, label: 'Complete', short: 'Follows on one read', descriptor: 'A reader who has not seen the checkpoints can follow the report on one read.' },
				{ points: 1, label: 'Proficient', short: 'One passage needs rereading', descriptor: 'One passage has to be reread or guessed at, but the rest follows.' },
				{ points: 0, label: 'Absent', short: 'Cannot be followed', descriptor: 'The report cannot be followed without asking the writer what was meant.' }
			]
		}
	];

	const ROSTER: ClassroomEnrollment[] = [
		{ section_id: SECTION_ID, student_email: 'alice@boscotech.net', display_name: 'Alice Alvarez', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'carla@boscotech.net', display_name: 'Carla Cardenas', active: true, manages: false }
	];

	const SUBMISSIONS: SubmissionRow[] = ROSTER.map((e, i) => ({
		id: `sub-${i}`,
		item_id: ITEM_ID,
		student_email: e.student_email,
		state: 'submitted',
		submitted_at: iso(1),
		returned_at: null,
		rubric_scores: null,
		criterion_comments: null,
		score: null,
		teacher_comment: null,
		graded_by: null,
		graded_at: null
	}));

	/** THE ONE STORE both surfaces read. `setRubric` writes it, nothing else. */
	let rubric = $state<RubricCriterion[] | null>(structuredClone(SEEDED));
	let log = $state<string[]>([]);
	/** Bumped on every rubric write, so the console remounts on the new rows. */
	let saves = $state(0);

	const transports: AssignmentTeacherTransports = {
		async setSpec(itemId) {
			log = [...log, `setSpec ${itemId}`];
			return { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			log = [...log, `setRubric ${itemId} ${criteria?.length ?? 'null'} criteria`];
			rubric = criteria ? structuredClone($state.snapshot(criteria) as RubricCriterion[]) : null;
			saves += 1;
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail, scores) {
			log = [...log, `gradeSubmission ${studentEmail} ${JSON.stringify(scores)}`];
			return { ok: true, data: { ok: true, state: 'submitted' } };
		},
		async approveModule(itemId, studentEmail, moduleId, approved) {
			log = [...log, `approveModule ${studentEmail} ${moduleId} ${approved}`];
			return { ok: true, data: undefined };
		},
		async loadGrading() {
			return {
				ok: true,
				data: {
					roster: ROSTER,
					submissions: SUBMISSIONS,
					responses: [],
					files: [],
					filesStorageReady: true,
					approvals: []
				}
			};
		}
	};

	/**
	 * THE ORACLE: `levelShort` called directly on the CURRENT store, which is
	 * the resolver the console itself uses. A pass compares the console against
	 * this rather than against its own claim, and the `source` column names
	 * WHICH RUNG answered -- which is the only way to tell "the console shows
	 * what I typed" from "the console shows a spec line that happens to match".
	 */
	const oracle = $derived(
		(rubric ?? []).flatMap((c) =>
			(c.levels ?? []).map((l, li) => {
				const resolved = levelShort(l, c.id, SPEC);
				const own = l.short?.trim() ?? '';
				const descriptor = l.descriptor?.trim() ?? '';
				const source = own ? 'stored short' : resolved === descriptor ? 'descriptor' : 'spec short';
				return {
					key: `${c.id}:${li}`,
					criterion: c.criterion,
					points: l.points,
					own,
					descriptor,
					resolved,
					source
				};
			})
		)
	);
</script>

<svelte:head><title>Rubric edit to grading console // dev harness</title></svelte:head>

<div class="cr-root">
	<section class="oracle" data-testid="rubric-oracle">
		<h1>Rubric edit &middot; does it reach the console (0106)</h1>
		<p class="lede">
			The REAL <code>RubricBuilder</code>, <code>RubricView</code> and
			<code>GradingConsole</code> over ONE store. Press <strong>Edit rubric</strong>, rewrite a
			level's description, save, and read the console below. The table is
			<code>levelShort</code> called directly on the current store, so a measurement compares the
			console with the resolver rather than with itself. <strong>source</strong> names which rung
			answered: a level whose short line is cleared falls to the SPEC's copy of the old line, not
			to the description, which is the residual prompt 0106 could not close.
		</p>
		<div class="table-scroll">
			<table>
				<thead>
					<tr><th>Criterion</th><th>pts</th><th>stored short</th><th>description</th><th>console shows</th><th>source</th></tr>
				</thead>
				<tbody>
					{#each oracle as row (row.key)}
						<tr
							data-testid="oracle-row"
							data-key={row.key}
							data-source={row.source}
							data-resolved={row.resolved}
						>
							<td>{row.criterion}</td>
							<td>{row.points}</td>
							<td>{row.own || '(cleared)'}</td>
							<td>{row.descriptor}</td>
							<td>{row.resolved}</td>
							<td>{row.source}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="pane card" data-testid="builder-pane">
		<h2>The rubric, as a teacher edits it</h2>
		<RubricBuilder itemId={ITEM_ID} criteria={rubric} spec={SPEC} {transports} />
	</section>

	<section class="pane card" data-testid="student-pane">
		<h2>The same rubric, as a student reads it</h2>
		{#if rubric?.length}
			<RubricView criteria={rubric} />
		{:else}
			<p class="none">No rubric attached.</p>
		{/if}
	</section>

	<section class="pane" data-testid="console-pane">
		<h2>The same rubric, where the work is marked</h2>
		{#key saves}
			<GradingConsole
				section={SECTION}
				item={ITEM}
				spec={SPEC}
				{rubric}
				{transports}
				basePath="/dev/grading-rubric"
			/>
		{/key}
	</section>

	{#if log.length}
		<section class="oracle log" data-testid="transport-log">
			<h2>Transport log</h2>
			<ul>{#each log as line, i (i)}<li>{line}</li>{/each}</ul>
		</section>
	{/if}
</div>

<style>
	.oracle,
	.pane {
		margin: var(--space-3) auto;
		max-width: 72rem;
		padding: 0 var(--space-3);
	}
	.pane.card {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: var(--space-3);
	}
	h1 {
		font-size: 1.2rem;
		margin: 0 0 0.4rem;
	}
	h2 {
		font-size: 0.95rem;
		margin: 0 0 0.6rem;
	}
	.lede {
		margin: 0 0 0.8rem;
		font-size: 0.85rem;
		line-height: 1.55;
		color: var(--text-2);
		max-width: 68ch;
	}
	.none {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 0.76rem;
		width: 100%;
	}
	th,
	td {
		border: 1px solid var(--hairline);
		padding: 0.3rem 0.45rem;
		text-align: left;
		vertical-align: top;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.log ul {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
</style>
