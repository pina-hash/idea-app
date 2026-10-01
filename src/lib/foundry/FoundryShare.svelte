<script lang="ts">
	/**
	 * THE SHARE LINK, AS ONE CONTROL TWO SURFACES MOUNT.
	 *
	 * `/a/<app id>` is a published app's own public address: the whole document,
	 * no iframe, no chrome, and no session -- the apps origin holds none. So a
	 * link to it works for somebody who has never signed in, which is the
	 * property that makes it worth handing to a student and the property they
	 * have to be told about before they hand it to anyone else.
	 *
	 * WHY IT IS A COMPONENT RATHER THAN A SECOND COPY. It was written inside
	 * `FoundryDetail` for the gallery, and `/foundry/mine` needs the identical
	 * thing -- a student wants their own link more than a visitor does. What
	 * would have been duplicated is not markup: it is the PUBLICATION RULE that
	 * decides whether a link exists at all, the SENTENCE that says what the page
	 * does and does not carry, and a copy handler with a timer and two effects
	 * behind it. A second copy of any of those is a copy that stops agreeing --
	 * and the one that matters most is the sentence, because the surface that
	 * quietly loses it is the one where a student shares something without
	 * knowing what is on it.
	 *
	 * WHEN THERE IS NO LINK, THERE IS NO SECTION. Three ways that happens, and
	 * all three are refusals `/a/` itself makes, mirrored here so no control is
	 * offered whose only possible outcome is a refusal:
	 *
	 *   nothing published    `publishedVersionOf` reads one column and would
	 *                        find nothing. A draft has no public address.
	 *   the app is hidden    `serveBundleFile` refuses a hidden app outright.
	 *                        Offering its owner a link to a page that 404s is
	 *                        worse than offering nothing.
	 *   no apps origin       a deployment that has not been told where bundles
	 *                        are served from has no direct page. Same strict
	 *                        direction the launch control takes: no origin, no
	 *                        link, rather than a fallback to the current one --
	 *                        which on the portal is the cookie-carrying host the
	 *                        whole origin split exists to keep bundles off.
	 */
	import { foundryAppUrl } from './bundle-url.ts';

	let {
		app,
		appsOrigin,
		/**
		 * The host's own section class, so this sits in the caller's rhythm
		 * rather than carrying a second opinion about spacing into two rooms.
		 * The gallery's sections and /foundry/mine's blocks are shaped
		 * differently and neither is this component's business.
		 */
		sectionClass = ''
	}: {
		/** Only the three fields the publication rule reads. */
		app: { id: string; published_version_id: string | null; hidden_at: string | null };
		appsOrigin: string;
		sectionClass?: string;
	} = $props();

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
		// Foundry running path is built on: a wedged bundle in a frame on this
		// page stops the document's animation frames arriving and leaves its
		// task queue alive.
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

<!--
	THE STATEMENT COMES BEFORE THE CONTROL, not after it. What this link does is
	not guessable from the URL: it opens without a session, which is a thing the
	student cannot see and would have no reason to guess. A student should know
	what they are handing over before they hand it over.

	THE SENTENCE SAYS WHAT IS AND IS NOT ON THAT PAGE, because "public" on its
	own reads as "my name is on the internet". `/a/` reads one column of the app
	row and the version's files: the author, the class and the build notes are
	gallery surfaces and the direct page never carries them.

	THE URL IS TEXT, NOT ONLY A CLIPBOARD CALL. The Clipboard API can be refused,
	and a copy control is worthless on a surface where the thing being copied
	cannot be read and selected by hand.
-->
{#if shareUrl}
	<section class={sectionClass} data-testid="foundry-share">
		<h3>Share this app</h3>
		<p class="fdy-share-note">
			Anyone with this link can open the app without signing in. The page carries the app
			on its own, with no name, class or build notes on it.
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

<style>
	.fdy-share-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
		max-width: 68ch;
		line-height: 1.5;
	}

	.fdy-share-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
		margin-top: 0.35rem;
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
		margin: 0.35rem 0 0;
		min-height: 1.2em;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}
</style>
