<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import { REPORT_LABEL_SHORT } from '$lib/feedback/context';
	import { CLASSROOM_UPDATES, updateDateLabel, updatesByDay, updatesByMonth } from '$lib/classroom/updates';

	/**
	 * The student-facing classroom update log. Presentation only (the
	 * CoinBalanceView split), reading the committed changelog file through
	 * $lib/classroom/updates -- there is no database behind it, because "what
	 * changed in the app" is a property of the deployed code, not of anyone's
	 * account.
	 */
	// No props: the page is the changelog file, and the report affordance now
	// comes from the shell rather than from a control each page mounts itself.
	const updates = CLASSROOM_UPDATES;
	/*
	 * BY MONTH, THE NEWEST OPEN (ledger 0297, LEARN). Each month is a
	 * Disclosure, so its region is hidden in CSS and never removed (it prints),
	 * and a month somebody opened or closed stays that way for them. The newest
	 * month follows no latch: it is open because it is what the page is for.
	 *
	 * INSIDE A MONTH, ONE CARD PER DAY. Every entry used to be a card of its own
	 * carrying its own date: 196 cards, 42,751px at 1440 with 176 of them. The
	 * day is printed once and the entries on it are rows of one card.
	 */
	const months = updatesByMonth(updates).map((m) => ({ ...m, days: updatesByDay(m.entries) }));
</script>

{#snippet entry(u: (typeof updates)[number])}
	<li class="update" data-testid="update-entry">
		<h4 class="update-title">{u.title}</h4>
		{#if u.tags.length}
			<span class="update-tags">
				{#each u.tags as tag (tag)}
					<span class="chip">{tag}</span>
				{/each}
			</span>
		{/if}
		<p class="update-body">{u.body}</p>
	</li>
{/snippet}

<svelte:head>
	<title>What's new // IDEA Classroom</title>
</svelte:head>

<!--
	NO MASTHEAD HERE. Every /classroom page renders inside the persistent shell
	(src/routes/classroom/+layout.svelte), which owns the logo, the section
	switcher and the breadcrumb trail back up.
-->
<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Classroom</div>
		<h1>What's new</h1>
		<p class="lead" data-testid="updates-lead">
			Everything that has changed in IDEA Classroom, newest first. If something here does not match
			what you see, press {REPORT_LABEL_SHORT} at the top of the page.
		</p>
	</section>

	{#if updates.length === 0}
		<section class="card">
			<p class="note">Nothing logged yet.</p>
		</section>
	{:else}
		{#each months as m, i (m.key)}
			<section class="update-month" data-testid="update-month" data-month={m.key}>
				<Disclosure
					label={m.label}
					heading={2}
					collapseWhen={i > 0}
					scope={`classroom-updates:${m.key}`}
					testId={`update-month-${m.key}`}
				>
					{#snippet meta()}
						<span class="month-count">{m.entries.length} {m.entries.length === 1 ? 'update' : 'updates'}</span>
					{/snippet}
					{#each m.days as d (d.date)}
						<section class="card update-day" data-testid="update-day">
							<h3 class="update-when">{updateDateLabel(d.date)}</h3>
							<ul class="update-list">
								{#each d.entries as u (u.date + u.title)}
									{@render entry(u)}
								{/each}
							</ul>
						</section>
					{/each}
				</Disclosure>
			</section>
		{/each}
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-reading));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.update-day {
		margin: var(--space-3) 0 0;
	}
	.update-when {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--cyan);
	}
	.update-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* Rows of one card, a hairline between them: a rule between two entries in
	   a card is decoration, not a control edge. */
	.update {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem var(--space-2);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--hairline);
	}
	.update:first-child {
		border-top: 0;
		padding-top: 0;
	}
	.update:last-child {
		padding-bottom: 0;
	}
	.update-title {
		margin: 0;
		font-size: 1rem;
	}
	.update-tags {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
	}
	.update-body {
		flex-basis: 100%;
		margin: 0;
		line-height: 1.55;
		font-size: 0.95rem;
	}
	.update-month {
		margin-bottom: var(--space-3);
	}
	.month-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0;
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
