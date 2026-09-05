<script lang="ts">
	import { page } from '$app/state';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import {
		managedPostedSections,
		type BulkGradeReport,
		type BulkGradeRow,
		type BulkGradingTransports,
		type PostedSection
	} from '$lib/classroom/grading-bulk';
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
	import { postGradeChange } from '$lib/classroom/grading-export';

	const ITEM_ID = 'i-bulk-1';
	const TEACHER = 'tvargas@boscotech.edu';
	const OTHER = 'rmonroe@boscotech.edu';

	/**
	 * NOT NAMED `state`. A local called `state` SHADOWS the `$state` rune -- every
	 * `$state<T>([])` in the file then parses as a store read of that variable,
	 * and svelte-check answers "Cannot use 'state' as a store", which reads like a
	 * broken toolchain and is a name collision.
	 */
	const viewState = $derived(page.url.searchParams.get('state') ?? '');

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
					{ type: 'instructions', content: 'Sketch the bridge from the front, top and side.' },
					{ type: 'textField', id: 'f1', prompt: 'Which view was hardest, and why?', minSentences: 2 },
					{ type: 'textField', id: 'f2', prompt: 'Where does the bridge fail first?', minSentences: 2 }
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

	function mkSection(id: string, label: string, block: string, teacher: string): ClassroomSection {
		return {
			id,
			course_id: 'c-1',
			label,
			block,
			teacher_email: teacher,
			active: true,
			course: { id: 'c-1', code: 'IDEA100', title: 'Engineering I Honors', active: true }
		};
	}

	const P1 = mkSection('s-p1', 'Period 1', '1', TEACHER);
	const P2 = mkSection('s-p2', 'Period 2', '2', TEACHER);
	/** Somebody else's class. It IS posted to; the caller does not manage it. */
	const P4 = mkSection('s-p4', 'Period 4', '4', OTHER);

	/**
	 * THE WHOLE POSTING LIST, including the one the caller cannot grade. The
	 * console never sees this: `managedPostedSections` does, exactly as it does
	 * behind the real transport.
	 */
	const POSTINGS: PostedSection[] = [
		{ section_id: P1.id, section: P1 },
		{ section_id: P2.id, section: P2 },
		{ section_id: P4.id, section: P4 }
	];

	/**
	 * What `classroom_section_roster(null)` answers: EVERY roster the caller
	 * manages, and nothing else. Period 4's rows are absent because the RPC's
	 * own body filters them, not because this fixture chose to leave them out --
	 * which is why the mutation control below opens the POSTING clause and not
	 * this list.
	 */
	const MANAGED_ROSTER: ClassroomEnrollment[] = [
		{ section_id: P1.id, student_email: 'alice@boscotech.net', display_name: 'Alice Alvarez', active: true, manages: false },
		{ section_id: P1.id, student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: true, manages: false },
		{ section_id: P1.id, student_email: 'carla@boscotech.net', display_name: 'Carla Cardenas', active: true, manages: false },
		{ section_id: P1.id, student_email: 'dara@boscotech.net', display_name: 'Dara Nwosu', active: true, manages: false },
		{ section_id: P2.id, student_email: 'eli@boscotech.net', display_name: 'Eli Ramos', active: true, manages: false },
		{ section_id: P2.id, student_email: 'fatima@boscotech.net', display_name: 'Fatima Diallo', active: true, manages: false },
		{ section_id: P2.id, student_email: 'gus@boscotech.net', display_name: 'Gus Whitlock', active: true, manages: false }
	];

	/**
	 * Period 4's roster, which the real RPC would never return to this caller.
	 * It exists here ONLY so the mutation control has something to reveal: with
	 * the clause open, Period 4 appears as a group and these two are in it.
	 */
	const UNMANAGED_ROSTER: ClassroomEnrollment[] = [
		{ section_id: P4.id, student_email: 'hana@boscotech.net', display_name: 'Hana Kowalski', active: true, manages: false },
		{ section_id: P4.id, student_email: 'idris@boscotech.net', display_name: 'Idris Bello', active: true, manages: false }
	];

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
			extra_credit: null,
			...over
		};
	}

	/**
	 * SIX HANDED IN, ONE ALREADY GRADED, ONE NEVER STARTED. The mix is what
	 * makes the presets mean anything: "Handed in" and "Not graded yet" are
	 * different sets here, which is the whole reason both exist.
	 */
	let submissions = $state<SubmissionRow[]>([
		sub({ id: 'sub-a', student_email: 'alice@boscotech.net', state: 'submitted', submitted_at: iso(9) }),
		// Ben is ALREADY GRADED and returned: the plan table's "Was" column has
		// something to show, and the regrade warning has a reason to fire.
		sub({
			id: 'sub-b',
			student_email: 'ben@boscotech.net',
			state: 'returned',
			submitted_at: iso(10),
			returned_at: iso(8),
			graded_at: iso(8),
			graded_by: TEACHER,
			rubric_scores: { 'm1-c1': 10, 'm1-c2': 5 },
			score: 15
		}),
		sub({ id: 'sub-c', student_email: 'carla@boscotech.net', state: 'submitted', submitted_at: iso(7) }),
		// Dara never handed anything in: "Handed in" must not include her.
		sub({ id: 'sub-e', student_email: 'eli@boscotech.net', state: 'submitted', submitted_at: iso(6) }),
		sub({ id: 'sub-f', student_email: 'fatima@boscotech.net', state: 'submitted', submitted_at: iso(5) }),
		sub({ id: 'sub-g', student_email: 'gus@boscotech.net', state: 'submitted', submitted_at: iso(4) }),
		sub({ id: 'sub-h', student_email: 'hana@boscotech.net', state: 'submitted', submitted_at: iso(4) }),
		sub({ id: 'sub-i', student_email: 'idris@boscotech.net', state: 'submitted', submitted_at: iso(3) })
	]);

	function text(email: string, blockId: string, value: string, hoursAgo: number): ResponseRow {
		return { item_id: ITEM_ID, student_email: email, block_id: blockId, value: { text: value }, updated_at: iso(hoursAgo) };
	}

	const HARD = 'The top view was hardest. The chord spacing kept drifting on me.';
	const FAIL = 'It fails at the lower chord near midspan. That member carries the most tension.';

	let responses = $state<ResponseRow[]>(
		[
			'alice@boscotech.net',
			'ben@boscotech.net',
			'carla@boscotech.net',
			'eli@boscotech.net',
			'fatima@boscotech.net',
			'gus@boscotech.net',
			'hana@boscotech.net',
			'idris@boscotech.net'
		].flatMap((email, i) => [text(email, 'f1', HARD, 10 + i), text(email, 'f2', FAIL, 10 + i)])
	);

	/** The pre-0171 branch, as a switch rather than a second route. */
	const extraCreditReady = $derived(viewState !== 'pre-0171');

	/**
	 * OPEN THE CROSS-SECTION CLAUSE. `?leak=1` skips the intersection entirely,
	 * so Period 4 -- a class this caller does not teach -- appears with its
	 * students. It is the POSITIVE CONTROL for the refusal: a spec asserting
	 * "Period 4 is not here" proves nothing unless there is a configuration in
	 * which it is.
	 */
	const leak = $derived(page.url.searchParams.get('leak') === '1');

	const sections = $derived(
		leak
			? POSTINGS.map((p) => p.section).filter((s): s is ClassroomSection => !!s)
			: managedPostedSections(POSTINGS, MANAGED_ROSTER.map((r) => r.section_id))
	);
	const roster = $derived(leak ? [...MANAGED_ROSTER, ...UNMANAGED_ROSTER] : MANAGED_ROSTER);

	let log = $state<string[]>([]);
	function note(what: string, detail: unknown) {
		log = [`${new Date().toLocaleTimeString()} ${what} ${JSON.stringify(detail)}`, ...log].slice(0, 12);
	}

	/**
	 * THE BATCH, ANSWERED THE WAY 0175 ANSWERS IT: a loop with a per-row
	 * refusal, and a report that names every student either way. The refusals
	 * modelled here are the ones the database actually makes, so the outcome
	 * panel can be driven without a network.
	 *
	 *   * Gus Whitlock is REFUSED for a made-up conflict, so a browser pass has
	 *     a named failure to read beside a batch that mostly landed. A harness
	 *     where everything succeeds cannot show the half of this surface that
	 *     matters.
	 *   * A student in a section the caller does not manage is refused with the
	 *     database's own sentence, which is what `?leak=1` makes reachable.
	 */
	const REFUSER = 'gus@boscotech.net';
	let refuseGus = $state(true);
	/** Bumped to stand in for the instructor coming back to the page. */
	let reloadKey = $state(0);

	const teacherTransports: AssignmentTeacherTransports = {
		async setSpec(itemId, spec) {
			note('setSpec', { itemId, spec: spec ? 'set' : null });
			return { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			note('setRubric', { itemId, criteria: criteria?.length ?? null });
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail, scores, comment, release, criterionComments, extraCredit) {
			note('gradeSubmission', { studentEmail, release, extraCredit });
			writeGrade(studentEmail, scores, comment ?? null, release, criterionComments ?? null, extraCredit);
			return { ok: true, data: { ok: true, state: release ? 'returned' : 'draft' } };
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
					roster: roster.filter((e) => e.section_id === sectionId),
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

	/** The write the RPC makes, including the `graded_at` stamp that clears 0011's signal. */
	function writeGrade(
		email: string,
		scores: Record<string, number>,
		comment: string | null,
		release: boolean,
		critComments: Record<string, string> | null,
		extraCredit: number | null | undefined
	): number {
		const existing = submissions.find((s) => s.student_email === email);
		const next: SubmissionRow = existing
			? { ...existing }
			: sub({ id: `sub-${email}`, student_email: email, state: 'draft' });
		const rubricSum = Object.values(scores).reduce((n, v) => n + Number(v || 0), 0);
		// null AND undefined both mean LEAVE ALONE, exactly as 0171 does.
		const award = extraCredit == null ? (next.extra_credit ?? null) : extraCredit;
		next.rubric_scores = { ...scores };
		next.criterion_comments = critComments ? { ...critComments } : null;
		next.extra_credit = award;
		next.score = rubricSum + Number(award ?? 0);
		next.teacher_comment = comment;
		next.graded_by = TEACHER;
		next.graded_at = new Date().toISOString();
		if (release) {
			next.state = 'returned';
			next.returned_at = new Date().toISOString();
		}
		submissions = existing
			? submissions.map((s) => (s.student_email === email ? next : s))
			: [...submissions, next];
		return next.score;
	}

	const bulkTransports: BulkGradingTransports = {
		async loadAcross(itemId) {
			note('loadAcross', { itemId, sections: sections.length });
			return {
				ok: true,
				data: {
					sections,
					data: {
						// The transport narrows the roster to the sections in play,
						// exactly as the real one does.
						roster: roster.filter((e) => sections.some((s) => s.id === e.section_id)),
						submissions: submissions.filter((s) => s.item_id === itemId),
						responses: responses.filter((r) => r.item_id === itemId),
						files: [],
						filesStorageReady: true,
						extraCreditReady,
						approvals: []
					}
				}
			};
		},
		async gradeMany(itemId, grades, release) {
			note('gradeMany', { itemId, n: grades.length, release });
			const results: BulkGradeRow[] = [];
			let succeeded = 0;
			let refused = 0;
			for (const g of [...grades].sort((a, b) => a.student_email.localeCompare(b.student_email))) {
				const unmanaged = !roster.some(
					(e) => e.student_email === g.student_email && sections.some((s) => s.id === e.section_id)
				);
				if (unmanaged) {
					refused += 1;
					results.push({
						email: g.student_email,
						ok: false,
						reason: 'error',
						message: "Only a teacher of record for this student's class can grade this."
					});
					continue;
				}
				if (refuseGus && g.student_email === REFUSER) {
					refused += 1;
					results.push({
						email: g.student_email,
						ok: false,
						reason: 'error',
						message: 'That grade was changed by somebody else while this batch was running.'
					});
					continue;
				}
				const score = writeGrade(
					g.student_email,
					g.scores,
					g.comment ?? null,
					release,
					g.criterion_comments ?? null,
					// ABSENT means leave alone. `undefined` is the absence.
					g.extra_credit
				);
				succeeded += 1;
				results.push({
					email: g.student_email,
					ok: true,
					score,
					state: release ? 'returned' : 'draft'
				});
			}
			const report: BulkGradeReport = {
				ok: true,
				total: grades.length,
				succeeded,
				refused,
				results
			};
			return { ok: true, data: report };
		}
	};

	/**
	 * THE ORACLE, printed beside the console: the counts a browser pass should
	 * be able to read off the surface, derived from the fixture rather than from
	 * the component. Break the grouping and the two disagree.
	 */
	const oracle = $derived(
		sections.map((s) => ({
			id: s.id,
			title: `IDEA100 · ${s.label}`,
			students: roster.filter((e) => e.section_id === s.id).length,
			ungraded: roster.filter(
				(e) =>
					e.section_id === s.id &&
					!submissions.find((x) => x.student_email === e.student_email)?.graded_at
			).length
		}))
	);
	const totalStudents = $derived(roster.filter((e) => sections.some((s) => s.id === e.section_id)).length);

	/**
	 * WHO THE ORACLE SAYS IS FLAGGED, from `postGradeChange` directly. The
	 * console derives its own chips through the same function, so a browser pass
	 * compares surface against pure function rather than against a label
	 * somebody typed beside it.
	 */
	const flaggedNames = $derived(
		roster
			.filter((e) =>
				postGradeChange({
					submission: submissions.find((s) => s.student_email === e.student_email) ?? null,
					responses: responses.filter((r) => r.student_email === e.student_email)
				})
					? true
					: false
			)
			.map((e) => e.display_name)
	);

	/**
	 * One student's writing moves past the grade. Nothing else is touched.
	 *
	 * IT REMOUNTS THE CONSOLE, and that is standing in for something real. The
	 * console reads the roster once on mount and again after every write; a
	 * student editing their work in another browser does not push anything at
	 * it, so the instructor sees the mark the next time the page loads. The
	 * remount is that next load, not a shortcut around one.
	 */
	function touchAlice() {
		const now = new Date().toISOString();
		responses = responses.map((r) =>
			r.student_email === 'alice@boscotech.net' && r.block_id === 'f2'
				? { ...r, value: { text: `${FAIL} I rewrote this after seeing the score.` }, updated_at: now }
				: r
		);
		reloadKey += 1;
		note('touchAlice', { updated_at: now });
	}
</script>

<svelte:head><title>Grading at scale // dev</title></svelte:head>

<main class="harness cr-root">
	<h1>Grading console: many students, many classes</h1>
	<p class="lede">
		The REAL <code>GradingConsole</code> with the bulk transport handed in, against an inert
		fixture. One assignment, posted to three classes; the caller teaches two of them. Period 4
		is somebody else's and must never appear -- <a href="?leak=1">?leak=1</a> opens the clause
		that keeps it out, which is the positive control for that refusal.
	</p>
	<p class="lede">
		States:
		<a href="/dev/grading-bulk">default</a> ·
		<a href="/dev/grading-bulk?state=pre-0171">pre-0171</a> ·
		<a href="/dev/grading-bulk?state=single">single (no bulk transport)</a>
	</p>

	<section class="oracle-box">
		<h2>Oracle</h2>
		<p data-testid="oracle-total">
			{sections.length} classes, {totalStudents} students{leak ? ' (CLAUSE OPEN)' : ''}
		</p>
		<table class="oracle">
			<thead>
				<tr><th>Class</th><th>Students</th><th>Not graded</th></tr>
			</thead>
			<tbody>
				{#each oracle as row (row.id)}
					<tr><td>{row.title}</td><td>{row.students}</td><td>{row.ungraded}</td></tr>
				{/each}
			</tbody>
		</table>
		<label class="refuse-toggle">
			<input type="checkbox" bind:checked={refuseGus} />
			<span>Refuse Gus Whitlock's row (so a batch has a named failure in it)</span>
		</label>
		<!--
			0011'S SIGNAL, DRIVABLE AFTER A BULK GRADE. `postGradeChange` is a
			comparison between `graded_at` and the work's own timestamps, so the way
			to prove a bulk write did not break it is to grade in bulk and then move
			ONE student's response past the stamp. It must light exactly her up.
		-->
		<div class="touch-row">
			<button type="button" class="btn secondary tiny" data-testid="touch-alice" onclick={touchAlice}>
				Edit Alice's response now (raises the post-grade mark for her alone)
			</button>
			<span class="touch-note" data-testid="touch-count">
				{flaggedNames.length === 0
					? 'Nobody is flagged as changed after grading.'
					: `Flagged: ${flaggedNames.join(', ')}`}
			</span>
		</div>
	</section>

	{#key `${viewState}-${leak}-${reloadKey}`}
		<GradingConsole
			section={sections[0] ?? P1}
			item={ITEM}
			spec={SPEC}
			rubric={RUBRIC}
			transports={teacherTransports}
			bulk={viewState === 'single' ? null : bulkTransports}
		/>
	{/key}

	<section class="log-box">
		<h2>Transport log</h2>
		<ul>
			{#each log as line, i (i)}<li>{line}</li>{/each}
		</ul>
	</section>
</main>

<style>
	.harness {
		padding: 1rem;
	}
	.lede {
		max-width: 60rem;
		color: var(--text-2);
	}
	.oracle-box,
	.log-box {
		margin: 1rem 0;
		padding: 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
	}
	.oracle {
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.oracle th,
	.oracle td {
		border: 1px solid var(--hairline);
		padding: 0.2rem 0.5rem;
		text-align: left;
	}
	.touch-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.6rem;
	}
	.touch-note {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.refuse-toggle {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin-top: 0.6rem;
		font-size: 0.85rem;
	}
	.log-box ul {
		margin: 0;
		padding-left: 1rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
</style>
