<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let filter = $state('');
	const shown = $derived(
		data.students.filter((s) => {
			const q = filter.trim().toLowerCase();
			if (!q) return true;
			return s.student_email.includes(q) || (s.display_name ?? '').toLowerCase().includes(q);
		})
	);
</script>

<svelte:head>
	<title>Student notebooks // IDEA Classroom</title>
</svelte:head>

<!-- The shell owns the masthead; under view-as it renders in minimal mode. -->
<main class="viewas-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Classroom &middot; admin</div>
		<h1>View a student's notebook</h1>
		<p class="lead">
			Open a student's digital notebook exactly as they see it. Strictly read-only: nothing you
			click here writes anything.
		</p>
		<p class="lead">
			The class and assignment previews that used to live here are gone. An instructor already
			reads the real class page and the real item page, through the same components a student
			does -- the only difference is the edit affordances.
		</p>
	</section>

	{#if !data.ready}
		<section class="card">
			<p class="feedback error">
				Not available yet -- migration 0083 does not appear to be applied.
			</p>
		</section>
	{:else}
		<section class="card">
			<label class="filter">
				<span>Find a student</span>
				<input type="search" bind:value={filter} placeholder="name or email" />
			</label>
			{#if data.students.length === 0}
				<p class="note">
					No active enrollments yet. Import a roster on a class's People tab first.
				</p>
			{:else if shown.length === 0}
				<p class="note">No student matches "{filter}".</p>
			{:else}
				<div class="student-rows">
					{#each shown as s (s.student_email)}
						<!-- Straight to the notebook: it is the only surface under a
						     student now, so a landing page in between would be one link on
						     a page of its own. -->
						<a
							class="student-row"
							href={`/classroom/view-as/${encodeURIComponent(s.student_email)}/notebook`}
						>
							<span class="student-main">
								<span class="student-name">{s.display_name}</span>
								<span class="student-email">{s.student_email}</span>
							</span>
							<span class="student-count">
								{s.section_count} class{s.section_count === 1 ? '' : 'es'}
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/* The picker is one column of prose and a list of names, so it takes the
	   reading measure BY NAME. It was the literal 46rem, which is the same
	   number until somebody tunes the token and this page silently stops
	   agreeing with the pages it links to. */
	.viewas-page {
		max-width: var(--measure-reading);
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.filter {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: 0.7rem;
	}
	.filter span {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.filter input {
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	.filter input:focus {
		outline: 1px solid var(--focus-ring);
	}
	.student-rows {
		display: flex;
		flex-direction: column;
	}
	.student-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.2rem;
		border-bottom: 1px solid var(--hairline);
		text-decoration: none;
		color: var(--text-1);
	}
	.student-row:last-child {
		border-bottom: none;
	}
	.student-row:hover .student-name {
		color: var(--gold);
	}
	.student-main {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.student-name {
		font-weight: 700;
		font-size: 0.95rem;
	}
	.student-email {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.student-count {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--cyan);
		white-space: nowrap;
	}
	.page-footer {
		margin-top: var(--space-6);
		display: flex;
		justify-content: center;
	}
	@media (max-width: 560px) {
		.student-count {
			margin-left: 0;
		}
	}
</style>
