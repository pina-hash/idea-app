<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
</script>

<main>
	<section class="hero">
		<span class="eyebrow warn">Authentication // Error</span>
		<a class="wordmark logo-mark" href="/" aria-label="IDEA home">
			<AnimatedLogo width="clamp(220px, 60vw, 420px)" />
		</a>
	</section>

	<div class="card">
		<h2>Sign in failed</h2>
		<p class="lead">We could not complete your sign in. Please return home and try again.</p>
		<div class="btn-row">
			<a class="btn" href="/">Back to home</a>
		</div>
	</div>

	<p class="page-version"><VersionBadge app="portal" /></p>
</main>
