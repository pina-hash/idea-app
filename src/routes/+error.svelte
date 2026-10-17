<script lang="ts">
	import { page } from '$app/state';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { feedbackWriter } from '$lib/feedback/feedback';
	import { openSiteFeedback } from '$lib/feedback/opener';

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
	 * THE WINDOW IS THE SHARED ONE, AND SO IS ITS BUTTON (ledger 0396). The root
	 * layout's corner button is on this page as on every page, carrying the
	 * status, the route and the correlation id (the root layout hands it
	 * `page.error`), and "Tell us what happened" below opens THAT window
	 * (`openSiteFeedback`). It used to mount a second window of its own in this
	 * card, with the corner button standing down; one window, one corner, and a
	 * second way in to it is what replaced that.
	 *
	 * IT NO LONGER NEEDS A SESSION, OR EVEN A SUPABASE CLIENT. This boundary
	 * catches a failure in a LAYOUT load, which is precisely when `page.data`
	 * may carry neither -- and it used to answer that case with a sentence
	 * telling the person to sign in and come back, on a page that had just
	 * failed to load. `feedbackWriter` hands back the anonymous route in exactly
	 * those cases now, so the highest-value report in the portal is the one
	 * report that can always be filed.
	 */
	/* The same writer the root layout hands its window, asked only to decide
	   whether there is a window to open (a caller can hand in none). */
	const submit = $derived(feedbackWriter(page.data.supabase, page.data.claims?.sub));
	/* A press that found no window says so, rather than doing nothing. */
	let noWindow = $state(false);

	const heading = $derived(
		page.status === 404 ? 'That page is not here' : 'Something went wrong'
	);
	const errorId = $derived(page.error?.id ?? null);

	/**
	 * A PIECE OF THE SITE THAT FAILED TO DOWNLOAD (`hooks.client.ts` sets
	 * `chunk`), which is almost always a deploy that renamed the site's files
	 * under an open tab, or a network blip. Loading the page again is the fix,
	 * so it is offered as a control rather than described. `location.reload()`
	 * and not a link: the address is already the page that failed.
	 */
	const chunkFailure = $derived(page.error?.chunk === true);

	/**
	 * THE WAY BACK TO THE CLASS, for a failure anywhere inside one. Not offered
	 * on the class page itself, where it would be a link to the page that just
	 * failed.
	 */
	const classHref = $derived.by(() => {
		const sectionId = page.params.sectionId;
		if (!sectionId) return null;
		const href = `/classroom/${sectionId}`;
		return page.url.pathname === href || page.url.pathname === `${href}/` ? null : href;
	});
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
			{#if chunkFailure}
				<button type="button" class="btn" onclick={() => location.reload()}>Try again</button>
			{/if}
			{#if classHref}
				<a class="btn" href={classHref}>Back to the class</a>
			{/if}
			<a class="btn" href="/">Back to the portal</a>
			{#if submit}
				<button
					type="button"
					class="btn"
					data-testid="error-report"
					onclick={() => (noWindow = !openSiteFeedback())}
				>
					Tell us what happened
				</button>
			{/if}
		</div>
		{#if !submit || noWindow}
			<!--
				A STATE THAT NO LONGER HAS A CAUSE, KEPT RATHER THAN DELETED. Every
				visitor gets a writer now, signed in or not, so this cannot render
				from being signed out. It stands because `submit` is still allowed to
				be null (a caller that hands in nothing), and a control that silently
				is not there is worse than one that says why.
			-->
			<p class="err-note">
				Reporting is not available on this page. The reference above is in the
				server log if you can pass it on another way.
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
