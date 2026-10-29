<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		formatDue,
		isScheduled,
		itemTitle,
		scheduleLabel,
		sectionTitle,
		type AssignmentStanding,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import { formatSectionLabel } from '$lib/section-label';
	import { gradebookCsv, gradebookCsvFilename, type Gradebook } from '$lib/classroom/gradebook-export';
	import {
		GRADING_ORDER_DEFAULT,
		GRADING_ORDER_OPTIONS,
		gradingOrderSays,
		orderStandings,
		undatedBoundary,
		type GradingOrderKey
	} from '$lib/classroom/grading-order';
	import { classroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import { parseTargetLines, postedVsTarget, targetLines, type GradeTarget } from '$lib/classroom/grading-targets';

	/**
	 * Every assignment in one class, with where its grading stands and a direct
	 * path into the console for it.
	 *
	 * The gap this closes: grading was reachable only from an assignment's own
	 * page, so "what still needs marking" meant opening each assignment in turn to
	 * find out. This is that list, computed from rows the caller could already
	 * read -- `classroom_submissions` is own-row-or-reviewer, and
	 * classroom_can_review_submission answers for a manager of this class about
	 * these students, so the counts are the policy's own answer rather than a
	 * privileged one.
	 */
	let {
		section,
		standings = [],
		basePath = '/classroom',
		resubmittedAfterGrading = {},
		gradebook = null,
		protection = null,
		onprotection = null,
		targetTally = null,
		ontargets = null
	}: {
		section: ClassroomSection;
		standings?: AssignmentStanding[];
		basePath?: string;
		/**
		 * Item id -> how many students handed in again AFTER being graded, from
		 * the page load's own read. DEFAULTS TO EMPTY, so a caller that does not
		 * compute it renders exactly what this panel rendered before.
		 *
		 * ONLY RESUBMISSIONS, and the chip says so. A response edited after
		 * grading is the other half of the same integrity question and lives in
		 * `classroom_responses`, which this page does not read; a chip labelled
		 * "changed" that could only see one of the two acts would be read as
		 * complete. The grading console carries both.
		 */
		resubmittedAfterGrading?: Record<string, number>;
		/** Every student's score on every assignment, for Download grades (ledger 0438). Absent: no key. */
		gradebook?: Gradebook | null;
		/**
		 * FILL EMPTY GRADES ONLY (ledger 0457, 0315): the class's switch and the
		 * grades it kept. Absent (a harness, a deployment before 0315): no
		 * switch and no list, rather than a switch that cannot save.
		 */
		protection?: GradeProtection | null;
		onprotection?: ((on: boolean) => Promise<string | null>) | null;
		/**
		 * SYLLABUS POINT TARGETS (ledger 0457, 0321): posted points per category
		 * against the course's targets. Absent before 0321: no table.
		 */
		targetTally?: (ReturnType<typeof postedVsTarget> & { targets: GradeTarget[] }) | null;
		ontargets?: ((rows: Array<{ category: string; target_points: number | null }>) => Promise<string | null>) | null;
	} = $props();

	let editingTargets = $state(false);
	let targetText = $state('');
	let targetError = $state<string | null>(null);
	let targetBusy = $state(false);
	function startTargets() {
		targetText = targetLines(targetTally?.targets ?? []);
		targetError = null;
		editingTargets = true;
	}
	async function saveTargets() {
		if (!ontargets) return;
		targetBusy = true;
		targetError = await ontargets(parseTargetLines(targetText));
		targetBusy = false;
		if (!targetError) editingTargets = false;
	}
	const fmt = (n: number) => String(Math.round(n * 100) / 100);

	interface GradeProtection {
		on: boolean;
		kept: Array<{
			id: string;
			itemId: string;
			itemTitle: string;
			student: string;
			action: string;
			keptScore: number | null;
			keptBy: string | null;
			at: string;
		}>;
	}

	let protectBusy = $state(false);
	let protectError = $state<string | null>(null);
	async function toggleProtection() {
		if (!protection || !onprotection || protectBusy) return;
		protectBusy = true;
		protectError = await onprotection(!protection.on);
		protectBusy = false;
	}
	const ACTION_WORDS: Record<string, string> = {
		grade: 'a new grade',
		'typed score': 'a typed score',
		revoke: 'taking the grade off',
		unreturn: 'taking it back from the student'
	};
	function keptWhen(iso: string): string {
		return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function downloadGrades() {
		if (!gradebook) return;
		const url = URL.createObjectURL(new Blob([gradebookCsv(gradebook)], { type: 'text/csv;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = gradebookCsvFilename(sectionTitle(section));
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	/**
	 * THE ORDER LIVES IN `grading-order.ts`, NOT HERE, and the reason is in that
	 * module's header: the sort this replaces was reported as "kinda random",
	 * and the claim "the list is in due order" has to be assertable without
	 * rendering anything.
	 *
	 * THE CONTROL IS REMEMBERED NOW, AS A DEFAULT (ledger 0297, LEARN). This
	 * said it was per visit because persisting it needed a namespace and a write
	 * path; the classroom's preference store is both, so the teacher's last
	 * order is the one the tab opens on next time, on any computer (the
	 * `grading` group follows the account), and Settings says so and resets it.
	 * A SORT IS SAFE TO REMEMBER FROM THE CONTROL because it hides nothing; a
	 * filter is remembered only when chosen in Settings. With no store (a
	 * harness) it is per visit exactly as before, starting from the date.
	 */
	const prefStore = classroomPreferences();
	const prefs = prefStore ? reactivePreferences(prefStore) : null;
	let localOrder = $state<GradingOrderKey>(GRADING_ORDER_DEFAULT);
	/* Read off the store while there is one, so a Reset in Settings reorders the open tab too. */
	const orderKey = $derived<GradingOrderKey>(prefs ? prefs.current.grading.gradesOrder : localOrder);
	function chooseOrder(key: GradingOrderKey) {
		if (prefStore) prefStore.set('grading', { ...prefStore.current.grading, gradesOrder: key });
		else localOrder = key;
	}
	const ordered = $derived(orderStandings(standings, orderKey));
	/**
	 * Where the undated rows begin, or -1. Only ever drawn under `due`: under
	 * `queue` the list is not in date groups at all, so a "No due date" heading
	 * there would be labelling a boundary that does not exist.
	 */
	const undatedFrom = $derived(orderKey === 'due' ? undatedBoundary(ordered) : -1);
	const totalAwaiting = $derived(ordered.reduce((n, s) => n + s.awaiting, 0));
</script>

<svelte:head>
	<title>Grades &middot; {sectionTitle(section)} · IDEA Classroom</title>
</svelte:head>

<main class="classroom-page cr-instructor-surface">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA · Classroom'}</div>
		<h1>Grades</h1>
		<p class="section-line">
			{formatSectionLabel(section.label, section.block)}
			&nbsp;&middot; {ordered.length}
			{ordered.length === 1 ? 'assignment' : 'assignments'}
			{#if totalAwaiting}
				&nbsp;&middot; <strong class="awaiting-total" data-testid="grades-awaiting"
					>{totalAwaiting} waiting to be marked</strong
				>
			{/if}
		</p>
		<a class="btn secondary tiny tap-44 grades-queue" href={`${basePath}/grading`} data-testid="grades-queue-link"
			>Needs grading, every class</a
		>
		{#if gradebook && gradebook.assignments.length}
			<button type="button" class="btn secondary tiny tap-44 grades-download" data-testid="grades-download" onclick={downloadGrades}
				>Download grades (CSV)</button
			>
		{/if}
	</section>

	{#if protection}
		<section class="card protect-card" data-testid="grades-protection">
			<div class="protect-row">
				<div class="protect-text">
					<span class="protect-title">Fill empty grades only</span>
					<span class="protect-says">
						{#if protection.on}
							On. A grade someone else gave in this class is kept; you can only fill grades that are empty. Grading
							from any screen or from Claude follows this.
						{:else}
							Off. Grading here can change any grade in this class.
						{/if}
					</span>
				</div>
				{#if onprotection}
					<button
						type="button"
						class="btn secondary tiny tap-44 protect-toggle"
						aria-pressed={protection.on}
						aria-label="Fill empty grades only"
						disabled={protectBusy}
						onclick={toggleProtection}
						data-testid="grades-protection-toggle"
					>
						{protection.on ? 'On' : 'Off'}
					</button>
				{/if}
			</div>
			{#if protectError}<p class="note" role="alert">{protectError}</p>{/if}
			{#if protection.kept.length}
				<details class="kept" data-testid="grades-protection-kept">
					<summary class="tap-44">{protection.kept.length} {protection.kept.length === 1 ? 'grade' : 'grades'} kept</summary>
					<ul class="kept-rows">
						{#each protection.kept as k (k.id)}
							<li>
								<span class="kept-who">{k.student}</span>
								<span class="kept-what">{k.itemTitle}: kept {k.keptScore ?? 'the grade'}{k.keptBy ? ` from ${k.keptBy}` : ''}, refused {ACTION_WORDS[k.action] ?? k.action}</span>
								<span class="kept-when">{keptWhen(k.at)}</span>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>
	{/if}

	{#if targetTally}
		<section class="card targets-card" data-testid="grades-targets">
			<div class="targets-head">
				<span class="protect-title">Points posted against the syllabus</span>
				{#if ontargets && !editingTargets}
					<button type="button" class="btn secondary tiny tap-44" onclick={startTargets} data-testid="grades-targets-edit">Edit categories</button>
				{/if}
			</div>
			{#if editingTargets}
				<p class="protect-says">One category per line, with its points from the syllabus. Leave the number off to set it later.</p>
				<textarea class="targets-input" rows={Math.max(5, (targetTally.targets.length || 4) + 1)} bind:value={targetText} data-testid="grades-targets-text"></textarea>
				<div class="targets-actions">
					<button type="button" class="btn tiny tap-44" disabled={targetBusy} onclick={saveTargets}>Save categories</button>
					<button type="button" class="btn secondary tiny tap-44" onclick={() => (editingTargets = false)}>Cancel</button>
				</div>
				{#if targetError}<p class="note" role="alert">{targetError}</p>{/if}
			{:else if targetTally.targets.length === 0}
				<p class="protect-says">No syllabus categories for this course yet. Add them with their point targets to see what is still to post.</p>
			{:else}
				<table class="targets-table">
					<thead><tr><th scope="col">Category</th><th scope="col">Posted</th><th scope="col">Target</th><th scope="col">Gap</th></tr></thead>
					<tbody>
						{#each targetTally.rows as r (r.category)}
							<tr data-testid="grades-target-row">
								<th scope="row">{r.category}<span class="targets-posts">{r.posts} {r.posts === 1 ? 'post' : 'posts'}</span></th>
								<td>{fmt(r.posted)}</td>
								<td>{r.target == null ? 'Not set' : fmt(r.target)}</td>
								<td class:short={r.gap != null && r.gap < 0} class:over={r.gap != null && r.gap > 0}>
									{r.gap == null ? '' : r.gap === 0 ? 'On target' : r.gap < 0 ? `${fmt(-r.gap)} short` : `${fmt(r.gap)} over`}
								</td>
							</tr>
						{/each}
						{#if targetTally.unfiled.posts}
							<tr class="unfiled" data-testid="grades-target-unfiled">
								<th scope="row">Not in a syllabus category<span class="targets-posts">{targetTally.unfiled.posts} {targetTally.unfiled.posts === 1 ? 'post' : 'posts'}</span></th>
								<td>{fmt(targetTally.unfiled.posted)}</td>
								<td></td>
								<td></td>
							</tr>
						{/if}
					</tbody>
					<tfoot>
						<tr><th scope="row">Total</th><td>{fmt(targetTally.total.posted)}</td><td>{targetTally.total.target == null ? '' : fmt(targetTally.total.target)}</td><td></td></tr>
					</tfoot>
				</table>
				{#if targetTally.targets[0]?.source}<p class="targets-source">From the {targetTally.targets[0].source}.</p>{/if}
			{/if}
		</section>
	{/if}

	{#if ordered.length === 0}
		<section class="card">
			<p class="note empty-state">
				No assignments in this class yet. Post one from the Class tab and it shows up here with its
				grading status.
			</p>
		</section>
	{:else}
		<section class="card">
			<!--
				THE LIST SAYS WHAT IT IS SORTED BY. That sentence is half the fix:
				an order nobody states is an order a reader has to infer from the
				rows, and inferring wrongly is what "kinda random" was. Every
				option carries a visible WORD, never a glyph or a direction arrow.
			-->
			<div class="order-bar">
				<span class="order-says" data-testid="grades-order-says">{gradingOrderSays(orderKey)}</span>
				<span class="order-controls" role="group" aria-label="Sort assignments">
					{#each GRADING_ORDER_OPTIONS as opt (opt.key)}
						<button
							type="button"
							class="order-btn tap-44"
							class:is-on={orderKey === opt.key}
							aria-pressed={orderKey === opt.key}
							data-testid={`grades-order-${opt.key}`}
							onclick={() => chooseOrder(opt.key)}
						>
							{opt.label}
						</button>
					{/each}
				</span>
			</div>
			<ul class="grade-rows">
				{#each ordered as s, i (s.item.id)}
					{#if i === undatedFrom}
						<!--
							The boundary between the two groups a due sort produces, drawn
							ONLY when both groups exist (`undatedBoundary` answers -1
							otherwise). Without it the list reads as dates descending and
							then, with no explanation, rows carrying no date at all --
							which is the moment the order looks random again.
						-->
						<li class="group-head" data-testid="grades-undated-head">No due date</li>
					{/if}
					<li class="grade-row" data-testid="grade-row">
						<a class="grade-main" href={`${basePath}/${section.id}/item/${s.item.id}/grade`}>
							<span class="grade-text">
								<span class="grade-title">
									{itemTitle(s.item)}
									{#if !s.item.published}
										<StatusChip tone="draft" label="Draft" />
									{:else if isScheduled(s.item)}
										<StatusChip tone="neutral" glyph="clock" wrap>Scheduled &middot; {scheduleLabel(s.item)}</StatusChip>
									{/if}
								</span>
								<span class="grade-meta">
									<!-- NO DUE SEGMENT WHEN THERE IS NO DUE DATE, matching ItemDetail:
									     formatDue(null) is "No due date", which reads as a real value
									     and renders the sentence "Due No due date". Trailing (not
									     leading) separator, so a due-less assignment with points
									     never opens on a dangling middot. -->
									{#if s.item.due_at}Due {formatDue(s.item.due_at)}&nbsp;&middot;{/if}
									{#if s.item.points != null}{s.item.points} pts{/if}
								</span>
							</span>
							<span class="grade-chips">
								{#if s.awaiting}
									<StatusChip tone="warn" label="{s.awaiting} to mark" data-testid="chip-awaiting" />
								{/if}
								{#if resubmittedAfterGrading[s.item.id]}
									<StatusChip tone="special" glyph="undo" label="{resubmittedAfterGrading[s.item.id]} resubmitted after grading" data-testid="chip-resubmitted" />
								{/if}
								{#if s.returned}
									<StatusChip tone="ok" label="{s.returned} returned" />
								{/if}
								{#if s.inProgress}
									<StatusChip tone="info" glyph="progress" label="{s.inProgress} started" />
								{/if}
								{#if !s.awaiting && !s.returned && !s.inProgress}
									<StatusChip tone="neutral" label="Nothing handed in" />
								{/if}
								<StatusChip tone="neutral" label="{s.roster} enrolled" />
							</span>
						</a>
						<a class="btn secondary tiny grade-open" href={`${basePath}/${section.id}/item/${s.item.id}/grade`}>
							Grade
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.section-line {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2);
	}
	.awaiting-total {
		color: var(--amber);
	}
	.note {
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.empty-state {
		padding: 0.4rem 0;
	}
	.order-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--boundary);
	}
	.order-says {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2);
	}
	.order-controls {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	/* 44px via `.tap-44` in the markup rather than a height here, so the floor is
	   the one mechanism the rest of the app uses and a later sweep can read the
	   claim off the element. This panel declares no density class, so it is
	   student-facing for the purpose of IDEA_INTERFACE_STANDARDS 10 and clears
	   44px at every width -- the same reasoning `.grade-open` beside it carries. */
	.order-btn {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		background: none;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0 0.7rem;
		cursor: pointer;
	}
	.order-btn.is-on {
		color: var(--green);
		border-color: var(--green);
	}
	.grade-rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* The word is the signal, not the rule under it: a heading that reads only as
	   a line would be a separator, and a separator does not say "no due date". */
	.group-head {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
		padding: 0.7rem 0.2rem 0.25rem;
		border-top: 1px solid var(--boundary);
	}
	.grade-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-top: 1px solid var(--boundary);
	}
	.grade-row:first-child {
		border-top: none;
	}
	.grade-main {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1 1 auto;
		min-width: 0;
		flex-wrap: wrap;
		/* The floor, not the padding (ledger 0469: 41.6 measured). */
		min-height: 44px;
		padding: 0.5rem 0.2rem;
		text-decoration: none;
		color: var(--text-1);
	}
	.grade-main:hover .grade-title {
		color: var(--hover-ink);
	}
	.grade-text {
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
		min-width: 0;
		flex: 1 1 12rem;
	}
	.grade-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-weight: 700;
		font-size: var(--fs-ui);
	}
	.grade-meta {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2);
	}
	.grade-chips {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.grade-open {
		/* 27.6px measured. 44px floor (IDEA_INTERFACE_STANDARDS 10). This one is on the instructor's
		   Grades tab rather than a student surface -- it is raised because it
		   was named directly, and it is the row's primary action either way. */
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		flex: none;
	}
	.targets-card {
		padding: 0.9rem 1.1rem;
	}
	.targets-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.targets-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}
	.targets-table th,
	.targets-table td {
		text-align: left;
		padding: 0.35rem 0.4rem;
		border-top: 1px solid var(--hairline);
	}
	.targets-table td {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		white-space: nowrap;
	}
	.targets-table thead th {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
		border-top: none;
	}
	.targets-table tbody th {
		font-weight: 700;
	}
	.targets-table tfoot th,
	.targets-table tfoot td {
		border-top: 1px solid var(--boundary);
		font-weight: 700;
	}
	.targets-posts {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		font-weight: 400;
		color: var(--text-2);
	}
	.targets-table td.short {
		color: var(--amber);
	}
	.targets-table td.over {
		color: var(--cyan);
	}
	.targets-table tr.unfiled th,
	.targets-table tr.unfiled td {
		color: var(--text-2);
	}
	.targets-source {
		margin: 0.4rem 0 0;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2);
	}
	.targets-input {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		color: var(--text-1);
		background: var(--bg0);
		border: 1px solid var(--boundary);
		border-radius: 8px;
		padding: 0.5rem 0.6rem;
	}
	.targets-actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.grades-queue {
		display: inline-flex;
		align-items: center;
		margin-right: 0.4rem;
	}
	.protect-card {
		padding: 0.9rem 1.1rem;
	}
	.protect-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.protect-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1 1 16rem;
		min-width: 0;
	}
	.protect-title {
		font-weight: 700;
		font-size: var(--fs-ui);
	}
	.protect-says {
		font-size: var(--fs-caption);
		color: var(--text-2);
	}
	.protect-toggle {
		/* 44px across too (ledger 0469: "On" measured 34.8 wide; `.tap-44` lets a
		   control shrink, which a one-word key must not). */
		min-width: 44px;
		display: inline-flex;
		align-items: center;
		flex: none;
	}
	.kept summary {
		display: flex;
		align-items: center;
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		color: var(--amber);
	}
	.kept-rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.kept-rows li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.6rem;
		padding: 0.3rem 0;
		border-top: 1px solid var(--hairline);
		font-size: var(--fs-caption);
	}
	.kept-who {
		font-weight: 700;
		min-width: 8rem;
	}
	.kept-what {
		flex: 1 1 14rem;
		color: var(--text-2);
	}
	.kept-when {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--cyan);
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
