<script lang="ts">
	/**
	 * THE ONE FRAME A PUBLISHED BUNDLE IS EVER SHOWN IN.
	 *
	 * The gallery, the detail view, the review queue and the dev harnesses all
	 * mount THIS. There is exactly one place where the sandbox attribute is
	 * written down, because the failure mode of a second copy is a frame that
	 * looks identical and isolates nothing.
	 *
	 * THE FLAGS THEMSELVES LIVE IN `bundle-headers.ts`, and they are a FUNCTION
	 * of the two origins rather than a constant. They used to be written out
	 * here as the single copy, which was right while the attribute was the only
	 * place they appeared -- but the SERVING side has to send the same flags as
	 * a CSP `sandbox` directive, and a second spelling of them over there is a
	 * frame and a document that can drift apart with nothing to compare them.
	 * One implementation, two readers.
	 *
	 * `allow-same-origin` IS CONDITIONAL, NOT FORBIDDEN, AND THIS COMMENT USED
	 * TO SAY OTHERWISE. It said the pair `allow-scripts` + `allow-same-origin`
	 * cancels the sandbox outright, because a framed document given both can
	 * remove its own sandbox attribute from the PARENT document and reload
	 * unsandboxed. The mechanism is real; the rule was too broad. Reaching the
	 * parent's DOM at all requires the child to be SAME-ORIGIN WITH THE PARENT,
	 * and a bundle is served from the apps origin while the portal that frames
	 * it is a different one. `foundrySandboxFlags` decides that at runtime and
	 * withholds the flag whenever it cannot prove the two differ. The full
	 * argument, including how it composes with `frame-ancestors`, is in
	 * `bundle-headers.ts`; it is written down once, there, and not restated
	 * here.
	 *
	 * THE TWO ORIGINS THIS COMPONENT HANDS IT ARE THE TWO THE SERVER HANDS IT,
	 * WHICH IS WHAT KEEPS THE ATTRIBUTE AND THE DIRECTIVE ONE STRING.
	 *
	 *   the bundle origin  is read off `src` -- the origin of the URL this
	 *                      frame is actually about to load, which is by
	 *                      construction the origin the serving route answers on
	 *                      and therefore the exact string it passes to
	 *                      `foundryBundleCsp`. Reading
	 *                      `PUBLIC_FOUNDRY_APPS_ORIGIN` again here instead
	 *                      would be a SECOND read of the value `AppStage`
	 *                      already used to build `src`, and two independent
	 *                      reads are how a frame and its own URL come to
	 *                      disagree.
	 *   the portal origin  is `foundryPortalOrigin`'s answer, the same CALL the
	 *                      responder makes for the same argument -- no longer a
	 *                      raw read of `PUBLIC_FOUNDRY_PORTAL_ORIGIN`, because
	 *                      that variable's absence is a supported configuration
	 *                      and resting the grant on it made the whole feature
	 *                      silently inert wherever nobody had set it. It is the
	 *                      origin `frame-ancestors` pins, which is what makes
	 *                      the grant safe, so it is the right value rather than
	 *                      merely a convenient one.
	 *
	 * AN UNPARSEABLE `src` IS THE EMPTY STRING, WHICH FAILS CLOSED. A relative
	 * or malformed URL yields no origin, and no origin means the strict flag set
	 * -- never a guess about what the frame is about to load.
	 *
	 * THE ATTRIBUTE IS NOT THE ONLY SANDBOX. The serving routes send the same
	 * flags as a CSP `sandbox` directive on the document, so a student who
	 * navigates straight to a bundle URL -- outside any frame -- is treated the
	 * same way. The attribute cannot cover that case and the directive cannot
	 * cover a frame the portal renders with different flags, so both are real.
	 *
	 * This component fetches nothing. There is no token and no mint anywhere on
	 * this path any more; the caller hands over a plain `src`, per the
	 * presentation-takes-props convention.
	 */
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import {
		foundryPortalOrigin,
		foundryPortalOriginIsFallback,
		foundrySandboxFlags
	} from './bundle-headers.ts';

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
		loading = 'lazy',
		/**
		 * TAKE THE WHOLE BOX THE CALLER GIVES ME, instead of `height`.
		 *
		 * This is what full screen needs, and it is a PROP rather than a height
		 * value because the two are different mechanisms and only one of them can
		 * win: `height` is written as an INLINE STYLE, and an inline style beats
		 * every class rule -- so a caller trying to reach the full viewport by
		 * passing `height="100%"` would be resting on a percentage resolving
		 * against a wrapper whose own height is a flex computation. `fill` drops
		 * the inline height entirely and lets the box grow, which is the only
		 * arrangement in which the frame is exactly as tall as whatever is around
		 * it.
		 *
		 * IT MUST NOT REMOUNT THE FRAME. Full screen is a class change on an
		 * ANCESTOR of this element and a flag on this one; the <iframe> is never
		 * unmounted and its `src` is never rewritten, so a running app keeps its
		 * state, its timers and its audio across the transition. An implementation
		 * that swapped one frame for another would restart every app anybody ever
		 * maximised.
		 */
		fill = false
	}: {
		src: string;
		title: string;
		height?: string;
		notice?: string;
		loading?: 'lazy' | 'eager';
		fill?: boolean;
	} = $props();

	/** The origin `src` will actually load from, or '' when it has none. */
	function originOf(url: string): string {
		try {
			return new URL(url).origin;
		} catch {
			return '';
		}
	}

	/**
	 * THE PORTAL ORIGIN IS RESOLVED RATHER THAN READ, and the call is the same
	 * one `foundry-bundle-response.ts` makes for the CSP directive. It falls back
	 * to the canonical portal host when the variable is unset AND the apps origin
	 * is set; the rule, and why the apps origin gates it, is in
	 * `foundryPortalOrigin`.
	 */
	const portalOrigin = $derived(
		foundryPortalOrigin(env.PUBLIC_FOUNDRY_APPS_ORIGIN, env.PUBLIC_FOUNDRY_PORTAL_ORIGIN)
	);

	const sandboxFlags = $derived(foundrySandboxFlags(originOf(src), portalOrigin));

	/**
	 * THE RESOLVED CONFIGURATION, ON SCREEN, FOR AN ADMIN ONLY.
	 *
	 * WHY IT EXISTS. Which sandbox flags a bundle actually gets is a function of
	 * two Vercel variables, and nobody working in this repository can read what
	 * either is set to on the deployment they are looking at. That made drift on
	 * this pair INVISIBLE: a portal variable quietly unset would have withheld
	 * `allow-same-origin` in production, every published app would have kept
	 * losing its saved state on reload, and the only symptom would have been a
	 * feature that looked like it had never worked. One line beside the frame
	 * ends that -- the answer is now readable off the surface an admin already
	 * opens to review a build.
	 *
	 * IT STATES VALUES, NOT A VERDICT. There is no pass, no fail and no warning
	 * colour, because every one of these configurations is legitimate somewhere:
	 * the strict set is CORRECT in dev and on a preview, and a reader who knows
	 * which deployment they are on is the one who can tell whether what it says
	 * is what they meant. A line that judged would cry wolf on every local run.
	 *
	 * `granted` IS READ OFF THE FLAGS ACTUALLY IN FORCE, never recomputed from
	 * the origins. It is the same string the `sandbox` attribute below carries,
	 * so the line cannot report a grant the frame beside it did not get -- which
	 * is the one way a diagnostic like this becomes worse than nothing.
	 */
	const isAdmin = $derived(page.data?.isAdmin === true);
	const configLine = $derived(
		[
			`apps origin ${env.PUBLIC_FOUNDRY_APPS_ORIGIN?.trim() || 'unset'}`,
			`portal origin ${portalOrigin || 'unset'}${
				foundryPortalOriginIsFallback(
					env.PUBLIC_FOUNDRY_APPS_ORIGIN,
					env.PUBLIC_FOUNDRY_PORTAL_ORIGIN
				)
					? ' (fallback)'
					: ''
			}`,
			`allow-same-origin ${sandboxFlags.includes('allow-same-origin') ? 'granted' : 'withheld'}`
		].join(' \u00b7 ')
	);
</script>

<div class="fdy-frame-wrap" class:is-fill={fill}>
	{#if notice}
		<p class="fdy-notice">{notice}</p>
	{/if}
	<!--
		ADMIN ONLY. A student sees nothing here at all: the element is not rendered
		rather than hidden, so there is no markup to inspect and nothing to reveal
		how this deployment is wired.
	-->
	{#if isAdmin}
		<p class="fdy-config">{configLine}</p>
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
		style={fill ? '' : `height: ${height};`}
		sandbox={sandboxFlags}
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

	/*
		Metadata, so `--cyan`'s role in the register -- and `--text-2` for the
		weight, which is the token measured for secondary copy on all three portal
		grounds. `--dim` is NOT used: it clears only the darkest of them.
	*/
	.fdy-config {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text-2, var(--cyan));
		overflow-wrap: anywhere;
		min-width: 0;
	}

	/*
		FULL SCREEN IS A BOX CHANGE AND NOTHING ELSE. The wrap grows into whatever
		the caller's flex column gives it and the frame grows into the wrap; the
		element, its src and its sandbox attribute are untouched, which is what
		keeps a running app running across the transition.

		THE BORDER AND THE RADIUS GO. The whole point of the state is room, and a
		rounded 1px edge at the viewport boundary spends it on separating the frame
		from nothing.
	*/
	.fdy-frame-wrap.is-fill {
		flex: 1 1 auto;
		min-height: 0;
	}

	.fdy-frame-wrap.is-fill .fdy-frame {
		flex: 1 1 auto;
		min-height: 0;
		height: auto;
		border: 0;
		border-radius: 0;
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
