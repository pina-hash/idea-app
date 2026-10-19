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
	/** The status in words, for the chip beside the number. */
	const statusWord = $derived(
		page.status === 404 ? 'Not found' : page.status === 403 ? 'Not allowed' : page.status >= 500 ? 'Server error' : 'Error'
	);
	/**
	 * THE SENTENCE A PERSON READS. A thrown 404's message is the framework's
	 * bare "Not found", which the chip already says; the sentence then says what
	 * to do about it instead of repeating it.
	 */
	const lead = $derived.by(() => {
		const said = (page.error?.message ?? '').trim();
		if (page.status === 404 && (!said || /^not found\.?$/i.test(said))) {
			return 'It may have moved, or the link is from an older version of the site. Head back and find it from there.';
		}
		return said || 'The page could not be loaded.';
	});
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
	<title>{page.status} · IDEA</title>
</svelte:head>

<main class="err-page">
	<!--
		THE SITE'S OWN LOOK (report 6f1c0a3d, ledger 0416). The root layout puts
		this page on the site plate whatever the address (`sitePlateClass` with
		the error flag), because the page that failed may be one whose room never
		rendered. So the logo, the title bar between its hazard ends, the panel,
		the recessed facts and the raised keys are the home page's own, in every
		theme, and nothing here is the retired green-frame card or the `//` motif.
	-->
	<a class="err-logo" href="/" aria-label="IDEA home">
		<AnimatedLogo width="clamp(170px, 34vw, 280px)" />
	</a>

	<h1 class="plate-title err-title">{heading}</h1>

	<section class="card err-card" aria-labelledby="err-what">
		<div class="err-lead-row">
			<span class="err-code" aria-hidden="true">{page.status}</span>
			<div class="err-words">
				<span class="err-chip" data-tone={page.status === 404 ? 'amber' : 'crimson'}>{statusWord}</span>
				<p id="err-what" class="err-lead">{lead}</p>
			</div>
		</div>
		<dl class="err-facts">
			<div><dt>Page</dt><dd>{page.url.pathname}</dd></div>
			{#if errorId}
				<div><dt>Reference</dt><dd>{errorId}</dd></div>
			{/if}
		</dl>
		<div class="btn-row err-keys">
			{#if chunkFailure}
				<button type="button" class="btn" onclick={() => location.reload()}>Try again</button>
			{/if}
			{#if classHref}
				<a class="btn" href={classHref}>Back to the class</a>
			{/if}
			<a class="btn{classHref || chunkFailure ? ' secondary' : ''}" href="/">Back to the portal</a>
			{#if submit}
				<button
					type="button"
					class="btn secondary"
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
	</section>

	<p class="page-version"><VersionBadge app="portal" /></p>
</main>

<style>
	.err-page {
		box-sizing: border-box;
		width: min(100%, 46rem);
		margin: 0 auto;
		padding: clamp(1.5rem, 5vh, 3.5rem) 16px 3rem;
		display: grid;
		justify-items: stretch;
		gap: 1.25rem;
	}
	.err-logo {
		justify-self: center;
		display: block;
		line-height: 0;
		background: none;
	}
	.err-title {
		margin: 0;
	}
	.err-card {
		display: grid;
		gap: 1.1rem;
		margin: 0;
		padding: clamp(1rem, 3vw, 1.6rem);
	}
	/* The status reads at a glance, as a number in the plate's mono, with the
	   word for it on a recessed chip and the sentence under that. */
	.err-lead-row {
		display: flex;
		align-items: center;
		gap: clamp(0.9rem, 3vw, 1.6rem);
	}
	.err-code {
		flex: none;
		font-family: var(--font-mono);
		font-size: clamp(2.6rem, 9vw, 4.2rem);
		line-height: 1;
		letter-spacing: 0.04em;
		color: var(--plate-ink-2, var(--dim));
	}
	.err-words {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}
	.err-chip {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 1.6rem;
		padding: 0 0.7rem 0 0.55rem;
		border-radius: var(--plate-r-small, 7px);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--plate-ink, var(--white));
		background: var(--plate-well-face, var(--bg0));
		box-shadow:
			inset 0 1px 2px 0 var(--plate-well-shade, rgba(0, 0, 0, 0.5)),
			inset 0 -1px 0 0 var(--plate-well-lip, rgba(255, 255, 255, 0.12));
	}
	.err-chip::before {
		content: '';
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--amber);
		box-shadow: 0 0 4px 1px color-mix(in srgb, var(--amber) 70%, transparent);
	}
	.err-chip[data-tone='crimson']::before {
		background: var(--crimson);
		box-shadow: 0 0 4px 1px color-mix(in srgb, var(--crimson) 70%, transparent);
	}
	.err-lead {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.45;
		color: var(--plate-ink, var(--white));
		overflow-wrap: anywhere;
	}
	/* The facts are read-only, so they are set INTO the panel: a well. */
	.err-facts {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0.7rem 0.85rem;
		border-radius: var(--plate-r-control, 11px);
		background: var(--plate-well-face, var(--bg0));
		box-shadow:
			inset 0 1px 3px 0 var(--plate-well-shade, rgba(0, 0, 0, 0.5)),
			inset 0 -1px 0 0 var(--plate-well-lip, rgba(255, 255, 255, 0.12));
		font-family: var(--font-mono);
		font-size: 0.76rem;
	}
	.err-facts div {
		display: flex;
		gap: 0.75rem;
		min-width: 0;
	}
	.err-facts dt {
		flex: none;
		min-width: 5.5rem;
		color: var(--plate-ink-2, var(--dim));
		letter-spacing: 0.1em;
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
	.err-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin: 0;
	}
	.err-note {
		margin: 0;
		color: var(--dim);
		font-size: 0.82rem;
	}
	.page-version {
		display: flex;
		justify-content: center;
		margin: 0.4rem 0 0;
	}
	@media (max-width: 30rem) {
		.err-lead-row {
			align-items: flex-start;
		}
		.err-keys :global(.btn) {
			flex: 1 1 100%;
			justify-content: center;
		}
	}
</style>
