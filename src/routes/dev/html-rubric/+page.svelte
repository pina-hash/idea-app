<script lang="ts">
	import { page } from '$app/state';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import RubricView from '$lib/classroom/RubricView.svelte';
	import {
		levelShort,
		type AssignmentTeacherTransports,
		type RubricCriterion,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import { manifestRubricIssues, manifestRubricTotal } from '$lib/classroom/html-assignment/rubric';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import {
		COMMENTS,
		ITEM_ID,
		MANIFEST,
		MANIFEST_RUBRIC,
		SCORES,
		SECTION_ID,
		SPEC,
		SPEC_RUBRIC,
		TEACHER
	} from './fixture';
	// THE ROOM'S OWN STYLESHEET, not just its class. Both components ship under
	// `/classroom/**`, whose layout gives every surface `.cr-root`; a `.cr-root`
	// with no rules behind it paints the portal plate while claiming to be the
	// classroom, which is a worse fixture than no wrapper at all
	// (tools/browser-verify/routes/README.md). The spec carries a presence row
	// asserting the room actually mounted.
	import '$lib/classroom/classroom.css';

	/**
	 * `single` mounts only the manifest console; `graded` returns the grade.
	 * NOT named `state`: `$state` is a rune here and a local of that name
	 * shadows it, which svelte-check reports as "Cannot use 'state' as a store"
	 * a hundred lines away from the declaration that caused it.
	 */
	const mode = $derived(page.url.searchParams.get('state') ?? '');
	const single = $derived(mode === 'single');
	const graded = $derived(mode === 'graded');

	/** A FIXED instant, never `new Date()`: a fixture that moves cannot be asserted. */
	const NOW = Date.parse('2026-09-08T17:00:00Z');
	const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

	const SECTION: ClassroomSection = {
		id: SECTION_ID,
		course_id: 'c-1',
		label: 'Period 1',
		block: '1',
		teacher_email: TEACHER,
		active: true,
		course: { id: 'c-1', code: 'IDEA113', title: 'Engineering Design II', active: true }
	};

	const ITEM: ClassroomItem = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'Blade Design Log',
		body: 'Log the bench setup and the first cut.',
		body_doc: null,
		points: 30,
		due_at: iso(-24),
		category: 'Unit Labs',
		author_email: TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: iso(72),
		edited_at: null,
		created_at: iso(72),
		updated_at: iso(72),
		links: [],
		attachments: [],
		postings: []
	};

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

	function submissions(): SubmissionRow[] {
		const base: SubmissionRow = {
			id: 'sub-a',
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			state: 'submitted',
			submitted_at: iso(6),
			returned_at: null,
			rubric_scores: null,
			criterion_comments: null,
			score: null,
			teacher_comment: null,
			graded_by: null,
			graded_at: null,
			extra_credit: null
		};
		if (!graded) return [base];
		return [
			{
				...base,
				state: 'returned',
				returned_at: iso(2),
				graded_at: iso(2),
				graded_by: TEACHER,
				rubric_scores: { ...SCORES },
				criterion_comments: { ...COMMENTS },
				score: Object.values(SCORES).reduce((n, v) => n + v, 0),
				teacher_comment: 'Solid log. Tighten the reflection.'
			}
		];
	}

	/**
	 * THE TRANSPORTS ARE INERT ON PURPOSE. This harness measures a RENDER, and a
	 * console that could write would let a drive change the thing being compared
	 * halfway through the comparison. `/dev/grading-change` is the harness whose
	 * transports really write, because the behaviour it exists for is what
	 * happens after a grade lands.
	 */
	let log = $state<string[]>([]);
	function note(what: string, detail: unknown) {
		log = [`${log.length + 1} ${what} ${JSON.stringify(detail)}`, ...log].slice(0, 8);
	}

	function transportsFor(label: string): AssignmentTeacherTransports {
		return {
			async setSpec(itemId, spec) {
				note(`${label} setSpec`, { itemId, spec: spec ? 'set' : null });
				return { ok: true, data: undefined };
			},
			async setRubric(itemId, criteria) {
				note(`${label} setRubric`, { itemId, criteria: criteria?.length ?? null });
				return { ok: true, data: undefined };
			},
			async gradeSubmission(itemId, studentEmail, scores) {
				note(`${label} gradeSubmission`, { studentEmail, scores });
				return { ok: true, data: { ok: true, state: 'submitted' } };
			},
			async approveModule(itemId, studentEmail, moduleId, approved) {
				note(`${label} approveModule`, { studentEmail, moduleId, approved });
				return { ok: true, data: undefined };
			},
			async loadGrading(itemId, sectionId) {
				note(`${label} loadGrading`, { itemId, sectionId });
				return {
					ok: true,
					data: {
						roster: ROSTER,
						submissions: submissions(),
						responses: [],
						files: [],
						filesStorageReady: true,
						extraCreditReady: true,
						approvals: []
					}
				};
			}
		};
	}

	const manifestTransports = transportsFor('manifest');
	const specTransports = transportsFor('spec');

	/**
	 * THE ORACLE, PRINTED BESIDE THE RENDERINGS.
	 *
	 * `levelShort` called directly on each derived level, with NO spec, which is
	 * what an HTML assignment really has. A browser pass compares the level
	 * buttons on screen against THIS rather than against a list somebody typed
	 * next to them -- so the check is console-against-pure-function. Break the
	 * translation and both sides go quiet together, which is the tell that a
	 * mutation landed rather than the console merely hiding something.
	 */
	const oracle = $derived(
		MANIFEST_RUBRIC.flatMap((c: RubricCriterion) =>
			c.levels.map((l) => ({
				id: c.id,
				points: l.points,
				short: levelShort(l, c.id, null),
				/** What the SAME level resolves to when a spec IS available. */
				withSpec: levelShort(l, c.id, SPEC),
				descriptor: l.descriptor ?? ''
			}))
		)
	);

	const issues = $derived(manifestRubricIssues(MANIFEST));
	const total = $derived(manifestRubricTotal(MANIFEST));
	const equal = $derived(JSON.stringify(MANIFEST_RUBRIC) === JSON.stringify(SPEC_RUBRIC));
</script>

<svelte:head><title>Dev: manifest rubric</title></svelte:head>

<div class="cr-root harness hx-rubric">
	<header class="hx-head">
		<h1>HTML assignment: the manifest becomes the rubric</h1>
		<p class="hx-lede">
			The same assignment written twice -- once as an upload manifest, once by hand as a spec --
			rendered through the real components. Identical is a comparison of two screens, not of two
			objects.
		</p>
		<ul class="hx-facts" data-testid="hx-facts">
			<li>
				Rubric total from the manifest: <strong data-testid="hx-total">{total}</strong> pts
			</li>
			<li>
				Criteria: <strong data-testid="hx-count">{MANIFEST_RUBRIC.length}</strong>, ids
				<code data-testid="hx-ids">{MANIFEST_RUBRIC.map((c) => c.id).join(' ')}</code>
			</li>
			<li>
				Manifest issues: <strong data-testid="hx-issues">{issues.length}</strong>
				{#if issues.length}<span class="hx-bad">{issues.join(' / ')}</span>{/if}
			</li>
			<li>
				Derived rubrics identical as JSON:
				<strong data-testid="hx-equal">{equal ? 'yes' : 'no'}</strong>
			</li>
		</ul>
	</header>

	{#if !single}
		<section class="hx-cols" aria-label="The student-facing rubric, both ways">
			<div class="hx-col">
				<h2 class="hx-col-head">From the manifest</h2>
				<div data-testid="hx-view-manifest">
					<RubricView
						criteria={MANIFEST_RUBRIC}
						scores={graded ? SCORES : null}
						comments={graded ? COMMENTS : null}
					/>
				</div>
			</div>
			<div class="hx-col">
				<h2 class="hx-col-head">From the spec</h2>
				<div data-testid="hx-view-spec">
					<RubricView
						criteria={SPEC_RUBRIC}
						scores={graded ? SCORES : null}
						comments={graded ? COMMENTS : null}
					/>
				</div>
			</div>
		</section>
	{/if}

	<section class="hx-consoles" aria-label="The grading console, both ways">
		<div class="hx-console" data-testid="hx-console-manifest">
			<h2 class="hx-col-head">
				Grading console over the MANIFEST rubric, spec = null
				<span class="hx-note">the real HTML-assignment configuration</span>
			</h2>
			<GradingConsole
				section={SECTION}
				item={ITEM}
				spec={null}
				rubric={MANIFEST_RUBRIC}
				transports={manifestTransports}
			/>
		</div>
		{#if !single}
			<div class="hx-console" data-testid="hx-console-spec">
				<h2 class="hx-col-head">
					Grading console over the SPEC rubric, spec handed in
					<span class="hx-note">the control</span>
				</h2>
				<GradingConsole
					section={SECTION}
					item={ITEM}
					spec={SPEC}
					rubric={SPEC_RUBRIC}
					transports={specTransports}
				/>
			</div>
		{/if}
	</section>

	<section class="oracle" aria-label="What levelShort answers, called directly">
		<h2 class="hx-col-head">Oracle: levelShort on each derived level</h2>
		<table data-testid="hx-oracle">
			<thead>
				<tr><th>Criterion</th><th>Pts</th><th>No spec</th><th>With spec</th><th>Same</th></tr>
			</thead>
			<tbody>
				{#each oracle as row, i (i)}
					<tr>
						<td>{row.id}</td>
						<td>{row.points}</td>
						<td>{row.short}</td>
						<td>{row.withSpec}</td>
						<td>{row.short === row.withSpec ? 'yes' : 'NO'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="hx-note" data-testid="hx-oracle-summary">
			{oracle.filter((r) => r.short === r.withSpec).length} of {oracle.length} resolve identically
			with and without a spec;
			{oracle.filter((r) => r.short === r.descriptor).length} of {oracle.length} fell back to the
			descriptor.
		</p>
	</section>

	{#if log.length}
		<section class="hx-log" aria-label="Transport log">
			<h2 class="hx-col-head">Transport log</h2>
			<ul>
				{#each log as line, i (i)}<li>{line}</li>{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.hx-rubric {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.hx-head h1 {
		margin: 0 0 0.35rem;
		font-size: 1.15rem;
	}
	.hx-lede {
		margin: 0 0 0.6rem;
		color: var(--text-2);
		font-size: 0.85rem;
		max-width: 60ch;
	}
	.hx-facts {
		margin: 0;
		padding: 0.5rem 0.7rem;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.hx-bad {
		color: var(--amber);
	}
	.hx-cols,
	.hx-consoles {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fit, minmax(min(22rem, 100%), 1fr));
		align-items: start;
	}
	.hx-col,
	.hx-console {
		min-width: 0;
	}
	.hx-col-head {
		margin: 0 0 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.hx-note {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-2);
	}
	.oracle table {
		border-collapse: collapse;
		font-size: 0.72rem;
		width: 100%;
	}
	.oracle th,
	.oracle td {
		border: 1px solid var(--hairline);
		padding: 0.2rem 0.4rem;
		text-align: left;
		color: var(--text-1);
	}
	.oracle th {
		font-family: var(--font-mono);
		color: var(--text-2);
	}
	.hx-log ul {
		margin: 0;
		padding-left: 1rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
</style>
