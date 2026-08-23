<script lang="ts">
	/**
	 * THE ONE FRAME A PUBLISHED BUNDLE IS EVER SHOWN IN.
	 *
	 * The gallery does not exist yet; when it does, it mounts THIS, and the dev
	 * harness at /dev/foundry-proxy mounts it too. There is exactly one place
	 * where the sandbox attribute is written down, because the failure mode of a
	 * second copy is a frame that looks identical and isolates nothing.
	 *
	 * `allow-same-origin` IS THE ONE FLAG THAT MUST NEVER APPEAR HERE.
	 * `allow-scripts` and `allow-same-origin` together cancel the sandbox
	 * outright: a framed document given both can reach into its own origin,
	 * remove its own sandbox attribute from the parent document and reload
	 * itself unsandboxed. Every other flag on this element is additive and
	 * arguable; that pair is not.
	 *
	 * What IS granted, and why each one:
	 *   allow-scripts        a bundle is a program. Without it there is nothing
	 *                        to show.
	 *   allow-modals         alert / confirm / prompt. Generated apps use them
	 *                        constantly, and without this they are silent
	 *                        no-ops -- a game that "does nothing" when you win.
	 *   allow-pointer-lock   canvas games ask for it; without it the request
	 *                        rejects and the app's own error path runs.
	 *
	 * What is deliberately NOT granted: `allow-popups` (window.open),
	 * `allow-top-navigation` (setting top.location), `allow-forms`,
	 * `allow-downloads`, `allow-modals`' louder cousins. None of them is needed
	 * by the build contract and each is a way out of the frame.
	 *
	 * THE ATTRIBUTE IS NOT THE ONLY SANDBOX. The proxy sends the same flags as a
	 * CSP `sandbox` directive on the document itself, so a student who navigates
	 * straight to a bundle URL -- outside any frame -- lands in the same opaque
	 * origin. The attribute cannot cover that case and the directive cannot
	 * cover a frame the portal renders with different flags, so both are real.
	 *
	 * This component fetches nothing and knows nothing about tokens. The route
	 * that mounts it owns the mint and hands over a `src`, per the
	 * presentation-takes-props convention.
	 */
	let {
		src,
		title,
		/** Height of the frame box. The bundle decides its own layout inside it. */
		height = '70vh',
		/** Rendered above the frame when the caller has something to say about it. */
		notice = '',
		/**
		 * `lazy` is right for a gallery of many apps and is the default. It is a
		 * PROP rather than a constant because lazy loading is driven by an
		 * IntersectionObserver, and a surface that needs the frame to load
		 * whether or not anything observes it -- a single-app page, or the dev
		 * harness -- has to be able to say so. (The verification pane never
		 * fires IntersectionObserver at all, so a lazy frame there never loads
		 * and every assertion about it passes vacuously.)
		 */
		loading = 'lazy'
	}: {
		src: string;
		title: string;
		height?: string;
		notice?: string;
		loading?: 'lazy' | 'eager';
	} = $props();
</script>

<div class="fdy-frame-wrap">
	{#if notice}
		<p class="fdy-notice">{notice}</p>
	{/if}
	<!--
		referrerpolicy="no-referrer": the request for a bundle carries no record of
		which page of ours the viewer came from. It is a cross-site request either
		way, so a referrer would be the origin only, but the origin is still more
		than the apps host has any use for.
	-->
	<iframe
		{src}
		{title}
		class="fdy-frame"
		style="height: {height};"
		sandbox="allow-scripts allow-modals allow-pointer-lock"
		referrerpolicy="no-referrer"
		{loading}
	></iframe>
</div>

<style>
	.fdy-frame-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	.fdy-notice {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-frame {
		display: block;
		width: 100%;
		min-width: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		/*
			A published app draws its own background. Painting one here would show
			through wherever the bundle does not, and it would be OUR colour on
			THEIR work.
		*/
		background: var(--surface-1, var(--bg1));
	}
</style>
