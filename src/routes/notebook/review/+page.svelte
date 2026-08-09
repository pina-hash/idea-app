<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';

	/** Placeholder: the real compliance grid is a later session. */
	let { data } = $props();
</script>

<svelte:head>
	<title>Section review // IDEA Notebook</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/notebook">&lsaquo; My Notebook</a>
		<ProfileMenu />
	</div>
</div>

<main class="review-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Notebook</div>
		<h1>Section review</h1>
		<p class="lead">
			The per-section compliance grid, showing every student against every scheduled check-in, is
			<strong>coming soon</strong>. You are seeing this page because you
			{data.isInstructor ? 'teach a notebook section' : 'are a site admin'}.
		</p>
	</section>

	<section class="card">
		<h2>Not built yet</h2>
		<p class="note">
			Reviewing, flagging, and the section grid arrive in a later release. Until then, students'
			entries are being collected and nothing is lost, so there is nothing you need to do here.
		</p>
	</section>

	<VersionBadge app="portal" />
</main>

<style>
	.review-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.lead strong {
		color: var(--white);
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
</style>
