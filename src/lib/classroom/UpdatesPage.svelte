<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ClassroomFeedback from '$lib/classroom/ClassroomFeedback.svelte';
	import { CLASSROOM_UPDATES, updateDateLabel } from '$lib/classroom/updates';
	import type { FeedbackEntry } from '$lib/feedback/feedback';

	/**
	 * The student-facing classroom update log. Presentation only (the
	 * CoinBalanceView split), reading the committed changelog file through
	 * $lib/classroom/updates -- there is no database behind it, because "what
	 * changed in the app" is a property of the deployed code, not of anyone's
	 * account.
	 */
	let {
		submitFeedback = null
	}: {
		submitFeedback?: ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null;
	} = $props();

	const updates = CLASSROOM_UPDATES;
</script>

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
		<p class="lead">
			Everything that has changed in Classroom, newest first. If something here does not match
			what you are seeing, tell us with the Feedback button at the bottom.
		</p>
	</section>

	{#if updates.length === 0}
		<section class="card">
			<p class="note">Nothing logged yet.</p>
		</section>
	{:else}
		{#each updates as u (u.date + u.title)}
			<article class="card update">
				<div class="update-head">
					<span class="update-when">{updateDateLabel(u.date)}</span>
					{#each u.tags as tag (tag)}
						<span class="chip">{tag}</span>
					{/each}
				</div>
				<h2>{u.title}</h2>
				<p class="update-body">{u.body}</p>
			</article>
		{/each}
	{/if}

	<ClassroomFeedback context="updates" submit={submitFeedback} />

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
	.update h2 {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
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
