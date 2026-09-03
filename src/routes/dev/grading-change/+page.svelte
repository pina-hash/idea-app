<script lang="ts">
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import { postGradeChange, postGradeChangeLabel } from '$lib/classroom/grading-export';
	import {
		rubricFromSpec,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type ResponseRow,
		type RubricCriterion,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';

	const ITEM_ID = 'i-change-1';
	const SECTION_ID = 's-change-1';
	const TEACHER = 'teacher@boscotech.edu';

	/** Hours ago, so the fixture's ordering is legible in the printed stamps. */
	function iso(hoursAgo: number): string {
		return new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
	}

	const SPEC: AssignmentSpec = {
		schemaVersion: 1,
		meta: {
			assignmentId: 'idea100-bridge-02',
			title: 'Bridge Sketch Worksheet',
			totalPoints: 20,
			gradingCategory: 'Unit Labs'
		},
		modules: [
			{
				id: 'm1',
				title: 'Three Views',
				points: 20,
				aiLevel: 0,
				intro: 'Sketch the truss bridge from three views before you touch CAD.',
				blocks: [
					{
						type: 'instructions',
						content: 'Sketch the bridge from the front, the top and the side.'
					},
					{
						type: 'textField',
						id: 'f1',
						prompt: 'Which view was hardest, and why?',
						minSentences: 2
					},
					{
						type: 'textField',
						id: 'f2',
						prompt: 'Where does the bridge fail first?',
						minSentences: 2
					}
				],
				rubric: [
					{
						id: 'c1',
						criterion: 'Sketch quality',
						levels: [
							{ points: 10, label: 'Complete', descriptor: 'All three views, in proportion.' },
							{ points: 5, label: 'Developing', descriptor: 'Views present, proportion off.' },
							{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
						]
					},
					{
						id: 'c2',
						criterion: 'Reflection',
						levels: [
							{ points: 10, label: 'Complete', descriptor: 'Specific and reasoned.' },
							{ points: 5, label: 'Developing', descriptor: 'General.' },
							{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};

	const RUBRIC: RubricCriterion[] = rubricFromSpec(SPEC);

	const SECTION: ClassroomSection = {
		id: SECTION_ID,
		course_id: 'c-1',
		label: 'Period 1',
		block: '1',
		teacher_email: TEACHER,
		active: true,
		course: { id: 'c-1', code: 'IDEA100', title: 'Engineering I Honors', active: true }
	};

	const ITEM: ClassroomItem = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'Bridge Sketch Worksheet',
		body: 'Sketch the truss bridge and say where it fails.',
		body_doc: null,
		points: 20,
		due_at: iso(-48),
		category: 'Unit Labs',
		author_email: TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: iso(240),
		edited_at: null,
		created_at: iso(240),
		updated_at: iso(240),
		links: [],
		attachments: [],
		postings: []
	};

	const ROSTER: ClassroomEnrollment[] = [
		{ section_id: SECTION_ID, student_email: 'alice@boscotech.net', display_name: 'Alice Alvarez', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'carla@boscotech.net', display_name: 'Carla Cardenas', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'dara@boscotech.net', display_name: 'Dara Nwosu', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'eli@boscotech.net', display_name: 'Eli Ramos', active: true, manages: false }
	];

	function sub(
		over: Partial<SubmissionRow> & { id: string; student_email: string; state: SubmissionRow['state'] }
	): SubmissionRow {
		return {
			item_id: ITEM_ID,
			submitted_at: null,
			returned_at: null,
			rubric_scores: null,
			criterion_comments: null,
			score: null,
			teacher_comment: null,
			graded_by: null,
			graded_at: null,
			...over
		};
	}

	/** A graded row: handed in, scored, returned. `over` moves what each case needs. */
	function graded(
		id: string,
		email: string,
		over: Partial<SubmissionRow> = {}
	): SubmissionRow {
		return sub({
			id,
			student_email: email,
			state: 'returned',
			submitted_at: iso(10),
			returned_at: iso(8),
			graded_at: iso(8),
			graded_by: TEACHER,
			rubric_scores: { 'm1-c1': 10, 'm1-c2': 5 },
			score: 15,
			...over
		});
	}

	let submissions = $state<SubmissionRow[]>([
		// THE POSITIVE CONTROL: graded, nothing touched since. No chip, ever.
		// She also carries the extra-credit award, so the console's total shows
		// 15 rubric + 3 = 18 against an out-of of 20.
		graded('sub-a', 'alice@boscotech.net', { extra_credit: 3, score: 18 }),
		// Edited after the grade (see the responses below). The silent half.
		graded('sub-b', 'ben@boscotech.net', { extra_credit: null }),
		// Resubmitted after the grade: submitted_at is LATER than graded_at, and
		// the state went back to `submitted`, which is what the RPC does.
		graded('sub-c', 'carla@boscotech.net', {
			state: 'submitted',
			submitted_at: iso(4),
			extra_credit: null
		}),
		// Both acts on one row.
		graded('sub-d', 'dara@boscotech.net', {
			state: 'submitted',
			submitted_at: iso(3),
			extra_credit: null
		}),
		// THE SECOND CONTROL: submitted, NEVER graded, with the newest responses
		// on the page. A derivation keyed on response time alone would light him
		// up; there is no grade for anything to be after.
		sub({ id: 'sub-e', student_email: 'eli@boscotech.net', state: 'submitted', submitted_at: iso(2) })
	]);

	function text(email: string, blockId: string, value: string, hoursAgo: number): ResponseRow {
		return {
			item_id: ITEM_ID,
			student_email: email,
			block_id: blockId,
			value: { text: value },
			updated_at: iso(hoursAgo)
		};
	}

	const HARD = 'The top view was hardest. The chord spacing kept drifting on me.';
	const FAIL = 'It fails at the lower chord near midspan. That member carries the most tension.';

	let responses = $state<ResponseRow[]>([
		// Alice: written before the grade and untouched since (10h ago, graded 8h).
		text('alice@boscotech.net', 'f1', HARD, 10),
		text('alice@boscotech.net', 'f2', FAIL, 10),
		// Ben: f1 is older than the grade, f2 was rewritten AFTER it. One block
		// moving is enough, which is the case a per-row check would miss.
		text('ben@boscotech.net', 'f1', HARD, 10),
		text('ben@boscotech.net', 'f2', `${FAIL} I changed my mind about this after seeing the score.`, 5),
		// Carla: responses untouched. Her change is the resubmission alone, so
		// the two kinds are visibly independent rather than one thing twice.
		text('carla@boscotech.net', 'f1', HARD, 10),
		text('carla@boscotech.net', 'f2', FAIL, 10),
		// Dara: resubmitted AND rewrote a block.
		text('dara@boscotech.net', 'f1', HARD, 10),
		text('dara@boscotech.net', 'f2', `${FAIL} Rewritten before handing in again.`, 3),
		// Eli: the newest writing on the page, and no grade to be after it.
		text('eli@boscotech.net', 'f1', HARD, 2),
		text('eli@boscotech.net', 'f2', FAIL, 2)
	]);

	/**
	 * THE PRE-0171 BRANCH, as a switch rather than a second route. False is a
	 * deployment sitting before the migration: the console must withhold the
	 * extra-credit control and SAY so, not blank the form.
	 */
	let extraCreditReady = $state(true);

	let log = $state<string[]>([]);
	function note(what: string, detail: unknown) {
		log = [`${new Date().toLocaleTimeString()} ${what} ${JSON.stringify(detail)}`, ...log].slice(0, 12);
	}

	/**
	 * The write transports write the same rows the RPCs write, INCLUDING the
	 * `graded_at = now()` stamp on every grade. That is what makes the clearing
	 * behaviour drivable here: grade a flagged student and the chip goes, in the
	 * real component, off the real derivation.
	 */
	const transports: AssignmentTeacherTransports = {
		async setSpec(itemId, spec) {
			note('setSpec', { itemId, spec: spec ? 'set' : null });
			return { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			note('setRubric', { itemId, criteria: criteria?.length ?? null });
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail, scores, comment, release, criterionComments, extraCredit) {
			note('gradeSubmission', { studentEmail, scores, release, extraCredit });
			const existing = submissions.find((s) => s.student_email === studentEmail);
			const next: SubmissionRow = existing
				? { ...existing }
				: sub({ id: `sub-${studentEmail}`, student_email: studentEmail, state: 'draft' });
			const rubricSum = Object.values(scores).reduce((n, v) => n + Number(v || 0), 0);
			// null MEANS LEAVE ALONE, exactly as 0171 does -- a harness that
			// cleared here would hide the one behaviour that argument exists for.
			const award = extraCredit == null ? (next.extra_credit ?? null) : extraCredit;
			next.rubric_scores = { ...scores };
			next.criterion_comments = criterionComments ? { ...criterionComments } : null;
			next.extra_credit = award;
			next.score = rubricSum + Number(award ?? 0);
			next.teacher_comment = comment;
			next.graded_by = TEACHER;
			// THE STAMP THAT CLEARS THE SIGNAL. Every grade moves it, regrades
			// included, which is the whole reason the mark can be got rid of.
			next.graded_at = new Date().toISOString();
			if (release) {
				next.state = 'returned';
				next.returned_at = new Date().toISOString();
			}
			submissions = existing
				? submissions.map((s) => (s.student_email === studentEmail ? next : s))
				: [...submissions, next];
			return { ok: true, data: { ok: true, state: next.state } };
		},
		async approveModule(itemId, studentEmail, moduleId, approved) {
			note('approveModule', { studentEmail, moduleId, approved });
			return { ok: true, data: undefined };
		},
		async loadGrading(itemId, sectionId) {
			note('loadGrading', { itemId, sectionId });
			return {
				ok: true,
				data: {
					roster: ROSTER.filter((e) => e.section_id === sectionId),
					submissions: submissions.filter((s) => s.item_id === itemId),
					responses: responses.filter((r) => r.item_id === itemId),
					files: [],
					filesStorageReady: true,
					extraCreditReady,
					approvals: []
				}
			};
		}
	};

	/**
	 * THE ORACLE, PRINTED BESIDE THE CONSOLE.
	 *
	 * A browser pass asserting "four rows carry the mark and one does not" needs
	 * an answer that did NOT come from the surface under test. This is
	 * `postGradeChange` called directly on the same fixture, so the check is
	 * console-against-pure-function rather than console-against-itself. Break
	 * the derivation and BOTH sides go quiet here, which is the tell that a
	 * mutation actually landed rather than the console merely hiding something.
	 */
	const oracle = $derived(
		ROSTER.map((e) => {
			const submission = submissions.find((s) => s.student_email === e.student_email) ?? null;
			const change = postGradeChange({
				submission,
				responses: responses.filter((r) => r.student_email === e.student_email)
			});
			return {
				name: e.display_name,
				email: e.student_email,
				state: submission?.state ?? 'none',
				gradedAt: submission?.graded_at ?? null,
				submittedAt: submission?.submitted_at ?? null,
				extraCredit: submission?.extra_credit ?? null,
				score: submission?.score ?? null,
				label: change ? postGradeChangeLabel(change) : null,
				at: change?.at ?? null
			};
		})
	);
	const flagged = $derived(oracle.filter((r) => r.label).length);
</script>

<svelte:head><title>Grading: post-grade change + extra credit // dev</title></svelte:head>

<main class="harness cr-root">
	<h1>Grading console: post-grade change and extra credit</h1>
	<p class="lede">
		The REAL <code>GradingConsole</code>, against an inert fixture. THREE of the five students
		changed their work after it was graded, one in each of the three combinations. The other
		two are the controls: one was graded and has not been touched since, and one has the
		newest writing on the page and has never been graded at all. Grading a flagged student
		clears the mark, because the grade stamps a later instant.
	</p>

	<label class="switch">
		<input type="checkbox" bind:checked={extraCreditReady} />
		<span>
			<code>extraCreditReady</code> -- uncheck to see the pre-0171 deployment, where the console
			must withhold the extra-credit control and say why rather than blanking the form.
		</span>
	</label>

	<section class="oracle">
		<h2>What <code>postGradeChange</code> answers ({flagged} of {oracle.length} flagged)</h2>
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th>Student</th>
						<th>State</th>
						<th>Graded</th>
						<th>Handed in</th>
						<th>Score</th>
						<th>Extra credit</th>
						<th>Signal</th>
						<th>Changed at</th>
					</tr>
				</thead>
				<tbody>
					{#each oracle as row (row.email)}
						<tr>
							<td>{row.name}</td>
							<td>{row.state}</td>
							<td>{row.gradedAt ?? '--'}</td>
							<td>{row.submittedAt ?? '--'}</td>
							<td>{row.score ?? '--'}</td>
							<td>{row.extraCredit ?? '--'}</td>
							<td class:none={!row.label}>{row.label ?? 'none'}</td>
							<td class:none={!row.at}>{row.at ?? '--'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<!--
		KEYED ON THE FLAG, because `loadGrading` runs once per mount and the flag
		travels IN its payload. Flipping the switch without a remount left the
		console showing the extra-credit control it had already been told about,
		which is not a state any deployment is ever in: a build either has 0171
		applied or it does not, and either way the page loads once. The remount is
		what makes the switch mean "a different deployment" rather than "the same
		deployment changing its mind".
	-->
	{#key extraCreditReady}
		<GradingConsole section={SECTION} item={ITEM} spec={SPEC} rubric={RUBRIC} {transports} />
	{/key}

	<h2 class="captures-head">Transport calls</h2>
	{#if log.length === 0}
		<p class="none">Nothing yet.</p>
	{:else}
		<ul class="log">
			{#each log as line, i (`${i}-${line}`)}
				<li>{line}</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.harness {
		padding: var(--space-3, 1rem);
		max-width: 100%;
	}
	h1 {
		font-family: var(--font-display);
		color: var(--text-1);
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.lede {
		max-width: 70ch;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-1);
	}
	.switch {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		max-width: 70ch;
		margin: 0.8rem 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--text-1);
		/* The floor is a min-height, never a height: a label that owns its row
		   is measured at the LABEL, which is what a finger hits. */
		min-height: 44px;
		padding: 0.3rem 0;
	}
	.switch input {
		width: 24px;
		height: 24px;
		margin-top: 0.1rem;
		flex: none;
	}
	.oracle {
		margin-bottom: var(--space-3, 1rem);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.72rem;
	}
	th,
	td {
		border: 1px solid var(--hairline);
		padding: 0.3rem 0.45rem;
		text-align: left;
		vertical-align: top;
		color: var(--text-1);
		white-space: nowrap;
	}
	th {
		font-family: var(--font-mono);
		color: var(--text-2);
	}
	.none {
		color: var(--text-2);
	}
	.captures-head {
		margin-top: var(--space-3, 1rem);
	}
	/* Wide content scrolls inside its OWN box; the page never scrolls sideways. */
	.table-scroll {
		overflow-x: auto;
	}
	.log {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-1);
		margin: 0;
		padding-left: 1rem;
	}
</style>
