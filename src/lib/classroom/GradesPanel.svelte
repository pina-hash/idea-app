<script lang="ts">
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
	import {
		GRADING_ORDER_DEFAULT,
		GRADING_ORDER_OPTIONS,
		gradingOrderSays,
		orderStandings,
		undatedBoundary,
		type GradingOrderKey
	} from '$lib/classroom/grading-order';

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
		resubmittedAfterGrading = {}
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
	} = $props();

	/**
	 * THE ORDER LIVES IN `grading-order.ts`, NOT HERE, and the reason is in that
	 * module's header: the sort this replaces was reported as "kinda random",
	 * and the claim "the list is in due order" has to be assertable without
	 * rendering anything.
	 *
	 * THE CONTROL IS PER VISIT AND IS NOT REMEMBERED, which is a real cost and
	 * is stated rather than hidden: a teacher who prefers the marking queue
	 * picks it again next time they open the tab. Persisting it means a new
	 * namespace in `profiles.preferences` and a write path from this page, which
	 * is a larger change than the one the report asked for; the DEFAULT is the
	 * half that matters and the default is now the date.
	 */
	let orderKey = $state<GradingOrderKey>(GRADING_ORDER_DEFAULT);
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
	<title>Grades &middot; {sectionTitle(section)} // IDEA Classroom</title>
</svelte:head>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA // Classroom'}</div>
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
	</section>

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
							onclick={() => (orderKey = opt.key)}
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
										<span class="draft-chip">Draft</span>
									{:else if isScheduled(s.item)}
										<span class="sched-chip">Scheduled &middot; {scheduleLabel(s.item)}</span>
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
									<span class="chip tone-attention" data-testid="chip-awaiting">
										{s.awaiting} to mark
									</span>
								{/if}
								{#if resubmittedAfterGrading[s.item.id]}
									<span class="chip tone-changed" data-testid="chip-resubmitted">
										{resubmittedAfterGrading[s.item.id]} resubmitted after grading
									</span>
								{/if}
								{#if s.returned}
									<span class="chip tone-good">{s.returned} returned</span>
								{/if}
								{#if s.inProgress}
									<span class="chip tone-muted">{s.inProgress} started</span>
								{/if}
								{#if !s.awaiting && !s.returned && !s.inProgress}
									<span class="chip tone-muted">Nothing handed in</span>
								{/if}
								<span class="chip tone-muted">{s.roster} enrolled</span>
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
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.section-line {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.awaiting-total {
		color: var(--amber);
	}
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
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
		font-size: 0.66rem;
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
		font-size: 0.66rem;
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
		font-size: 0.62rem;
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
		padding: 0.5rem 0.2rem;
		text-decoration: none;
		color: var(--text-1);
	}
	.grade-main:hover .grade-title {
		color: var(--gold);
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
		font-size: 0.95rem;
	}
	.grade-meta {
		font-family: var(--font-mono);
		font-size: 0.66rem;
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
	.chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.06rem 0.45rem;
		white-space: nowrap;
		color: var(--text-2);
	}
	.tone-attention {
		color: var(--amber);
		border-color: var(--amber);
	}
	/* --gold, not --amber, and only because amber is ALREADY SPOKEN FOR on this
	   panel: `tone-attention` is the routine "to mark" count, which sits on the
	   same row. Two amber chips side by side would flatten the difference
	   between a normal queue and a grade that may no longer describe the work.
	   Gold is the register's special-callout token, which is exactly the claim.
	   The console uses amber for this same fact because there amber is free and
	   gold is taken by "incomplete" -- colour is never the only signal on either
	   surface, and the chip carries the whole sentence. */
	.tone-changed {
		color: var(--gold);
		border-color: var(--gold);
	}
	.tone-good {
		color: var(--green);
		border-color: var(--green);
	}
	.tone-muted {
		color: var(--text-2);
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
