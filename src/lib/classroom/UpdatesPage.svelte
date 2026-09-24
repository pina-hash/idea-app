<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import { REPORT_LABEL_SHORT } from '$lib/feedback/context';
	import { CLASSROOM_UPDATES, updateDateLabel, updatesByMonth } from '$lib/classroom/updates';

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
	 */
	const months = updatesByMonth(updates);
</script>

{#snippet entry(u: (typeof updates)[number])}
	<article class="card update" data-testid="update-entry">
		<div class="update-head">
			<span class="update-when">{updateDateLabel(u.date)}</span>
			{#each u.tags as tag (tag)}
				<span class="chip">{tag}</span>
			{/each}
		</div>
		<h3>{u.title}</h3>
		<p class="update-body">{u.body}</p>
	</article>
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
					{#each m.entries as u (u.date + u.title)}
						{@render entry(u)}
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
	.update {
		margin-bottom: 0.9rem;
	}
	.update-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: 0.3rem;
	}
	.update-when {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--cyan);
	}
	.chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
	}
	.update h3 {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
	}
	.update-month {
		margin-bottom: var(--space-3);
	}
	.update-month :global(.update:first-child) {
		margin-top: var(--space-2);
	}
	.month-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.update-body {
		margin: 0;
		line-height: 1.6;
		font-size: 0.95rem;
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
