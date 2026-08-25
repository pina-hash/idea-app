<script lang="ts">
	/**
	 * ONE APP, AS EVERYBODY READS IT.
	 *
	 * The gallery mounts this. The review queue mounts THIS TOO, and adds its
	 * inspector beside it -- it does not render a second, staff-flavoured copy of
	 * an app page. That is `IDEA_INTERFACE_STANDARDS` role parity in its literal
	 * form: a reviewer is looking at the student view plus affordances, through
	 * the same render path, so a change to how an app reads reaches both at once
	 * and neither can drift.
	 *
	 * THERE IS NO `staff` FLAG AND NO STAFF BRANCH IN THIS FILE. The reviewer's
	 * tools are not rendered here at all -- `ReviewQueue` puts its inspector in
	 * the column BESIDE this component, which is what makes "what does a student
	 * see" answerable by reading this file straight through rather than by
	 * tracing branches. Nothing a reviewer can do can therefore leak into a
	 * student's page by forgetting a condition, because there is no condition.
	 *
	 * WHICH VERSION RUNS IS A PROP. The gallery runs the published one; the queue
	 * runs the one it is deciding about, which by definition is not published
	 * yet. Nothing else about the surface changes between those two cases, which
	 * is exactly why it is a parameter rather than a second component.
	 */
	import { env } from '$env/dynamic/public';

	import AppStage from './AppStage.svelte';
	import { foundryAppUrl } from './bundle-url.ts';
	import { foundryAuthorClass, foundryAuthorName } from './surface.ts';
	import type { FoundryApp, FoundryGalleryTransports } from './transports.ts';

	let {
		app,
		versionId = null,
		transports = {},
		coverUrl = (path: string) => path,
		frameHeight = '70vh',
		runningLabel = '',
		/**
		 * THE APPS ORIGIN, READ ONCE HERE AND HANDED DOWN.
		 *
		 * The frame src and the share link must name the SAME origin, and two
		 * independent reads of one environment variable is the arrangement in
		 * which they can differ -- a surface offering a link to one host while
		 * running the app off another. So this reads it and passes it to
		 * `AppStage` explicitly; `AppStage` keeps its own default for the harness
		 * and the routes that mount it directly.
		 *
		 * UNSET REMOVES BOTH, which is the same strict direction the launch
		 * control already takes: no origin, no frame and no link, rather than a
		 * fallback to the current one -- which on the portal is the cookie-carrying
		 * host the split exists to keep bundles off.
		 */
		appsOrigin = env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? ''
	}: {
		app: FoundryApp;
		/** Defaults to whatever is published. Null with nothing published = no stage. */
		versionId?: string | null;
		transports?: FoundryGalleryTransports;
		coverUrl?: (path: string) => string;
		frameHeight?: string;
		runningLabel?: string;
		appsOrigin?: string;
	} = $props();

	const runs = $derived(versionId ?? app.published_version_id);
	const author = $derived(foundryAuthorName(app));
	const authorClass = $derived(foundryAuthorClass(app));
	const cover = $derived(app.cover_path ? coverUrl(app.cover_path) : null);

	/**
	 * THE DIRECT PAGE'S URL, OR NULL, AND THE THREE CONDITIONS ARE EACH A REAL
	 * CASE RATHER THAN DEFENSIVENESS.
	 *
	 * It keys on `published_version_id` and NOT on `runs`. `runs` is whichever
	 * build this surface is showing, which in the review queue is the SUBMITTED
	 * one -- and `/a/` serves the published version, deliberately, so a link
	 * offered beside a submitted build would point at something else or at
	 * nothing at all.
	 *
	 * A HIDDEN APP GETS NO LINK, because `/a/` 404s a hidden app and a control
	 * whose only possible outcome is a refusal should not be offered. The queue
	 * is where a shelved app is met, so this is the surface that would have
	 * offered it.
	 *
	 * NO APPS ORIGIN, NO LINK: there is no direct page on a deployment that has
	 * not been told where bundles are served from.
	 */
	const shareUrl = $derived(
		app.published_version_id && !app.hidden_at ? foundryAppUrl(appsOrigin, app.id) : null
	);

	/**
	 * WHAT THE COPY CONTROL LAST DID, reported in a live region BESIDE the button
	 * rather than by rewriting the button's own label. A control whose word
	 * changes under the pointer is a control somebody clicks twice, and a screen
	 * reader announcing "Copied" as the name of a button called "Copy link" is
	 * announcing the wrong thing.
	 *
	 * THE FAILURE CASE IS REAL AND IS NOT A THROW TO SWALLOW. The Clipboard API
	 * is refused outright without a secure context and can be refused by
	 * permission, so the answer when it fails is to say the URL is there to be
	 * selected -- which is true, because the URL is rendered as text either way
	 * rather than living only inside the button's handler.
	 */
	let copyResult = $state<'idle' | 'copied' | 'failed'>('idle');
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	function clearCopyTimer() {
		if (copyTimer !== null) {
			clearTimeout(copyTimer);
			copyTimer = null;
		}
	}

	async function copyShareUrl() {
		if (!shareUrl) return;
		clearCopyTimer();
		try {
			await navigator.clipboard.writeText(shareUrl);
			copyResult = 'copied';
		} catch {
			copyResult = 'failed';
		}
		// A `setTimeout` and not an animation frame, for the reason the whole
		// Foundry running path is built on: a wedged bundle in the frame above
		// stops this document's animation frames arriving and leaves its task
		// queue alive.
		copyTimer = setTimeout(() => {
			copyResult = 'idle';
			copyTimer = null;
		}, 4000);
	}

	// The instance owns the timer, so the instance clears it: a selection change
	// remounts this component and a stray callback would write state on a copy of
	// it nobody is looking at.
	$effect(() => clearCopyTimer);

	// A different app is a different link, so a stale acknowledgement must not
	// ride across the change and read as though the new one was copied.
	$effect(() => {
		void app.id;
		clearCopyTimer();
		copyResult = 'idle';
	});
</script>

<article class="fdy-detail">
	<header class="fdy-detail-head">
		<h2 class="fdy-detail-title">{app.title}</h2>
		{#if app.tagline}<p class="fdy-detail-tagline">{app.tagline}</p>{/if}
		<!--
			THE AUTHOR LINE, AND EVERY PART OF IT IS CONDITIONAL SEPARATELY.
			`owner_class` is legitimately null (0132) and renders as NOTHING: no
			placeholder, no label, no colon, no empty chip. The separator lives
			inside the class branch so a null cannot leave one stranded after the
			name.
		-->
		{#if author || authorClass}
			<p class="fdy-detail-by">
				{#if author}<span class="fdy-author">{author}</span>{/if}
				{#if authorClass}<span class="fdy-class">{authorClass}</span>{/if}
			</p>
		{/if}
	</header>

	{#if cover}
		<!--
			`contain`, never `cover`: a cropped-to-fill preview hides the cut-off
			edge, and the whole reason a cover exists is to show what the app looks
			like. The alt text is the title because the image IS the app's own
			screenshot; a second description would be invented here.
		-->
		<img class="fdy-cover" src={cover} alt={app.title} loading="lazy" />
	{/if}

	{#if runs}
		<AppStage
			appId={app.id}
			versionId={runs}
			title={app.title}
			{appsOrigin}
			{transports}
			height={frameHeight}
			{runningLabel}
		/>
	{:else}
		<p class="fdy-detail-note">Nothing is published for this app yet.</p>
	{/if}

	<!--
		THE SHARE LINK, AND THE SENTENCE THAT HAS TO GO WITH IT.

		This surface is signed in and the link is not, which is a difference a
		student cannot see and would have no reason to guess -- so it is stated in
		words, before the control rather than after it. A student should know what
		they are handing over before they hand it over.

		THE SENTENCE SAYS WHAT IS AND IS NOT ON THAT PAGE, because "public" on its
		own reads as "my name is on the internet". `/a/` reads one column of the
		app row and the version's files: the author, the class and the build notes
		are gallery surfaces and the direct page never carries them.

		THE URL IS TEXT, NOT ONLY A CLIPBOARD CALL. The Clipboard API can be
		refused, and a copy control is worthless on a surface where the thing being
		copied cannot be read and selected by hand.
	-->
	{#if shareUrl}
		<section class="fdy-detail-section">
			<h3>Share this app</h3>
			<p class="fdy-share-note">
				Anyone with this link can open the app without signing in. The page carries
				the app on its own, with no name, class or build notes on it.
			</p>
			<div class="fdy-share-row">
				<code class="fdy-share-url" data-testid="share-url">{shareUrl}</code>
				<button type="button" class="btn fdy-share-copy tap-44" onclick={copyShareUrl}>
					Copy link
				</button>
			</div>
			<p class="fdy-share-said" aria-live="polite" data-testid="share-copy-result">
				{#if copyResult === 'copied'}Copied.{:else if copyResult === 'failed'}That did not
					copy. Select the link above and copy it by hand.{/if}
			</p>
		</section>
	{/if}

	{#if app.description}
		<section class="fdy-detail-section">
			<h3>About</h3>
			<p class="fdy-prose">{app.description}</p>
		</section>
	{/if}

	<!--
		HOW THIS WAS BUILT IS NOT OPTIONAL AND IS NOT A FOOTNOTE. `build_notes` is
		required by `foundry_create_app`, and it is the thing the whole programme
		is actually about: what the student generated, what they borrowed, and what
		they wrote by hand. It reads at the same weight as the description.
	-->
	<section class="fdy-detail-section">
		<h3>How this was built</h3>
		<p class="fdy-prose">{app.build_notes}</p>
	</section>
</article>

<style>
	.fdy-detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 1rem);
		min-width: 0;
	}

	.fdy-detail-head {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.fdy-detail-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		color: var(--text-1, var(--white));
	}

	.fdy-detail-tagline {
		margin: 0;
		color: var(--text-2, var(--dim));
	}

	.fdy-detail-by {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.25rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.fdy-author {
		color: var(--cyan);
	}

	/* The class is metadata beside a name, so it takes the metadata token and a
	   separating rule rather than a coloured chip -- an invented identity colour
	   for a course is exactly the kind of decoration this palette refuses. */
	.fdy-class {
		color: var(--text-2, var(--dim));
		padding-left: 0.5rem;
		border-left: 1px solid var(--boundary);
	}

	.fdy-cover {
		display: block;
		width: 100%;
		max-width: 100%;
		max-height: 18rem;
		object-fit: contain;
		object-position: left center;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-md, 8px);
		background: var(--surface-1, var(--bg1));
	}

	.fdy-detail-section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.fdy-detail-section h3 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}

	.fdy-prose {
		margin: 0;
		/* A plain string, rendered as text. There is no rich-text document here
		   and no {@html} anywhere near it. `pre-wrap` keeps the student's own
		   line breaks without asking a renderer to interpret anything. */
		white-space: pre-wrap;
		color: var(--text-1, var(--white));
	}

	.fdy-share-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-share-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	/* The URL takes the room and wraps rather than ellipsising: a truncated link
	   is one somebody copies by hand and gets wrong. `anywhere` because a uuid
	   has no break opportunity in it at all. */
	.fdy-share-url {
		flex: 1 1 18rem;
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-1, var(--white));
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		background: var(--surface-2, var(--bg2));
	}

	.fdy-share-copy {
		flex: 0 0 auto;
	}

	/* The live region keeps its box whether or not it has words in it, so an
	   acknowledgement does not reflow the section it appears in. */
	.fdy-share-said {
		margin: 0;
		min-height: 1.2em;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-detail-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
	}
</style>
