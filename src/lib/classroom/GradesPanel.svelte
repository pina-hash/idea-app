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
		basePath = '/classroom'
	}: {
		section: ClassroomSection;
		standings?: AssignmentStanding[];
		basePath?: string;
	} = $props();

	/**
	 * Anything waiting first, then by due date. A teacher opening this page is
	 * asking one question, and the answer should be at the top of it.
	 */
	const ordered = $derived(
		[...standings].sort(
			(a, b) =>
				(b.awaiting > 0 ? 1 : 0) - (a.awaiting > 0 ? 1 : 0) ||
				b.awaiting - a.awaiting ||
				Date.parse(b.item.due_at ?? '0') - Date.parse(a.item.due_at ?? '0')
		)
	);
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
			<ul class="grade-rows">
				{#each ordered as s (s.item.id)}
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
	.grade-rows {
		list-style: none;
		margin: 0;
		padding: 0;
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
