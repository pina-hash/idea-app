<script lang="ts">
	import { page } from '$app/state';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild } from '$lib/feedback/context';
	import { version as buildId } from '$app/environment';
	import { deploy } from 'virtual:site-versions';

	/**
	 * THE FIRST ERROR BOUNDARY IN THIS REPO.
	 *
	 * Before this file, every failed load fell through to SvelteKit's built-in
	 * error page: a bare white document outside the app's chrome, with no way
	 * back, no build stamp, and nothing to say. It is the highest-value place in
	 * the whole portal to ask what happened, because the person is looking at a
	 * broken thing right now and will not be five minutes from now.
	 *
	 * ROOT ONLY, ON PURPOSE. A root +error.svelte catches a failure from any
	 * page or layout load beneath it, which is the same coverage argument that
	 * puts the report affordance in the root layout. A per-section error page
	 * would be one more thing each new area has to remember.
	 *
	 * THE AFFORDANCE IS THE SHARED ONE, RELOCATED. `place="relocated"` is what
	 * takes it off the shell's floating position and puts it in this panel, with
	 * the status, the route and the correlation id already filled in. The shell's
	 * own copy stands down here (the `error` exclusion category), so there is one
	 * control offering more rather than two offering different things.
	 */
	const build = describeBuild(deploy, buildId);
	const submit = $derived(
		page.data.supabase ? feedbackWriter(page.data.supabase, page.data.claims?.sub) : null
	);

	const heading = $derived(
		page.status === 404 ? 'That page is not here' : 'Something went wrong'
	);
	const errorId = $derived(page.error?.id ?? null);
</script>

<svelte:head>
	<title>{page.status} // IDEA</title>
</svelte:head>

<main class="err-page">
	<section class="hero">
		<span class="eyebrow warn">Error // {page.status}</span>
		<a class="wordmark logo-mark" href="/" aria-label="IDEA home">
			<AnimatedLogo width="clamp(200px, 52vw, 380px)" />
		</a>
	</section>

	<div class="card">
		<h2>{heading}</h2>
		<p class="lead">{page.error?.message ?? 'The page could not be loaded.'}</p>
		<dl class="err-facts">
			<div><dt>Status</dt><dd>{page.status}</dd></div>
			<div><dt>Page</dt><dd>{page.url.pathname}</dd></div>
			{#if errorId}
				<div><dt>Reference</dt><dd>{errorId}</dd></div>
			{/if}
		</dl>
		<div class="btn-row">
			<a class="btn" href="/">Back to the portal</a>
			<SiteFeedback
				place="relocated"
				routeId={page.route.id}
				pathname={page.url.pathname}
				role={page.data.userProfile?.role ?? null}
				sectionId={page.params.sectionId ?? null}
				{build}
				{submit}
				status={page.status}
				errorMessage={page.error?.message ?? null}
				{errorId}
				label="Tell us what happened"
			/>
		</div>
		{#if !submit}
			<p class="err-note">
				Sign in from the portal home page to send a report about this. We are not taking
				signed-out reports yet.
			</p>
		{/if}
	</div>

	<p class="page-version"><VersionBadge app="portal" /></p>
</main>

<style>
	.err-page {
		max-width: var(--measure-form, 46rem);
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.err-facts {
		display: grid;
		gap: 0.35rem;
		margin: 0 0 1rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
	.err-facts div {
		display: flex;
		gap: 0.6rem;
	}
	.err-facts dt {
		min-width: 5.5rem;
		color: var(--dim);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.err-facts dd {
		margin: 0;
		color: var(--cyan);
		overflow-wrap: anywhere;
		/* An item's automatic minimum is its min-content, so a long path would
		   otherwise push the card past the viewport. */
		min-width: 0;
	}
	.err-note {
		margin: 0.8rem 0 0;
		color: var(--dim);
		font-size: 0.82rem;
	}
	.page-version {
		display: flex;
		justify-content: center;
		margin-top: 1.4rem;
	}
</style>
