<script lang="ts">
	import type { Snippet } from 'svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import { classThemeVars, classThemeWords, type ClassTheme } from '$lib/classroom/class-theme';

	/**
	 * THE CLASS BANNER (decision 45, report R07): the class's voted look drawn
	 * around the class page's own header, which it wraps rather than repeats --
	 * one title, never a second heading.
	 *
	 * A NULL THEME RENDERS THE CHILDREN AND NOTHING ELSE. `resolveClassTheme`
	 * answers null for a course with no votes and no accent, which is every
	 * class until somebody votes, and that state has to look exactly as the page
	 * did before this existed: no wrapper, no class, no style attribute.
	 *
	 * WHAT PAINTS WHAT is `class-theme.ts`'s header, and this follows it
	 * exactly: the palette's wash is a translucent `background-color` laid over
	 * whatever the room's own ground is (never a fill under the text, and a
	 * colour rather than an image layer so the browser pass's ground walk
	 * composites it), the edge is the border, the section's accent is the thick
	 * left stripe, and the badge and the class name take the room's own text
	 * ink. The words are always in the accessible tree, because a theme is never
	 * colour alone.
	 *
	 * THE PATTERN IS ITS OWN LAYER NOW, SO IT CAN MOVE (ledger 0360, report R21:
	 * "themed patterns should be nicely animated"). It used to be a
	 * `background-image` on the banner, which cannot move without repainting the
	 * whole banner every frame. It is a real element (a scoped `::after` is the
	 * thing Svelte prunes, CLAUDE.md), `aria-hidden`, drawn with the identical
	 * stroke at the identical alpha, so no frame of the motion is a different
	 * contrast from the still pattern the catalogue's sweep already measures. It
	 * paints over the wash and under the words by TREE ORDER among positioned
	 * boxes, with no z-index anywhere, so the banner stays what it was: not a
	 * stacking context, and nothing inside it is trapped under the page.
	 *
	 * THE MOTION IS BOUNDED, AND THAT IS WCAG 2.2.2 RATHER THAN TASTE. Motion
	 * that starts by itself and lasts more than five seconds beside content
	 * needs a pause control, so the drift that plays on arrival lasts 4.2s and
	 * ends exactly on the still frame; it loops only while a pointer that can
	 * hover is over the banner, which is a person asking for it. Transform only,
	 * so the compositor carries it, and nothing at all under
	 * `prefers-reduced-motion: reduce`, where the layer is the still frame.
	 *
	 * Both twins of every colour arrive inline from `classThemeVars`; the
	 * stylesheet below picks one into a used property of its own, and picks the
	 * Space White twin under that theme. It never redeclares a `--ct-*` name the
	 * inline style sets, which would silently lose to it.
	 */
	let {
		theme = null,
		badgeInline = false,
		children
	}: {
		theme?: ClassTheme | null;
		/**
		 * The wrapped content draws the badge itself, in its own first line
		 * (the class header does, beside the title, so the rows under it get
		 * the banner's whole width on a phone). The banner then draws no badge
		 * column of its own; everything else is identical.
		 */
		badgeInline?: boolean;
		children: Snippet;
	} = $props();

	const vars = $derived(classThemeVars(theme));
	const words = $derived(classThemeWords(theme));
</script>

{#if theme}
	<div
		class="ct-banner"
		class:has-badge={theme.badge.paths.length > 0 && !badgeInline}
		style={vars}
		data-testid="class-banner"
		data-palette={theme.palette.id}
		data-pattern={theme.pattern.id}
		data-badge={theme.badge.id}
		data-accent={theme.accent?.id ?? ''}
	>
		{#if theme.pattern.template}
			<!-- The clip, not the banner, hides the layer's overscan, so a focus
			     ring on a key inside the header is never clipped. -->
			<span class="ct-pattern-clip" aria-hidden="true"
				><span class="ct-pattern" data-testid="class-banner-pattern"></span></span
			>
		{/if}
		{#if theme.badge.paths.length > 0 && !badgeInline}
			<span class="ct-badge" data-testid="class-banner-badge" aria-hidden="true">
				<BadgeIcon id={theme.badge.id} size="1.7rem" motion="once" />
			</span>
		{/if}
		<div class="ct-body">
			{@render children()}
			<span class="sr-only" data-testid="class-banner-words">Class theme: {words}.</span>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.ct-banner {
		--ct-w: var(--ct-wash);
		--ct-e: var(--ct-edge);
		--ct-p: var(--ct-pattern);
		--ct-a: var(--ct-accent, var(--ct-edge));
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		margin: 0 0 var(--space-3, 0.75rem);
		padding: 0.6rem 0.75rem 0.1rem 0.85rem;
		background-color: var(--ct-w);
		border: 1px solid var(--ct-e);
		border-left: 6px solid var(--ct-a);
		border-radius: var(--radius-card, 6px);
		color: var(--text-1);
	}
	:global(:root[data-theme='space-white']) .ct-banner {
		--ct-w: var(--ct-wash-light);
		--ct-e: var(--ct-edge-light);
		--ct-p: var(--ct-pattern-light);
		--ct-a: var(--ct-accent-light, var(--ct-edge-light));
	}
	/* THE PATTERN LAYER. The clip covers the banner's padding box, which is the
	   box the background-image used to be laid out in, so the still pattern sits
	   exactly where it did. Positioned with no z-index: it paints first among the
	   banner's positioned children, and the badge and body after it. */
	.ct-pattern-clip {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border-radius: inherit;
		pointer-events: none;
	}
	.ct-pattern {
		position: absolute;
		inset: 0;
		background-image: var(--ct-p);
	}
	/* Stripes and rays move by sliding and turning, so their layer carries a
	   margin the motion never uncovers. Stripes are uniform, so the margin moves
	   only their phase; the rays' centre moves 24px past the corner, out of
	   sight under the border. Rings and ripples only ever grow about their own
	   centre, which can never uncover the box, so they need none. */
	.ct-banner:is([data-pattern='stripes'], [data-pattern='rays']) .ct-pattern {
		inset: -24px;
	}
	.ct-banner[data-pattern='rings'] .ct-pattern {
		transform-origin: 100% 50%;
	}
	.ct-banner[data-pattern='rays'] .ct-pattern {
		transform-origin: 100% 100%;
	}
	.ct-banner[data-pattern='ripples'] .ct-pattern {
		transform-origin: 0% 100%;
	}
	.ct-badge {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		align-self: flex-start;
		margin-top: 0.35rem;
		color: var(--text-1);
	}
	.ct-body {
		position: relative;
		flex: 1 1 auto;
		min-width: 0;
	}

	/* THE MOTION: an arrival that ends on the still frame, and a loop only under
	   a hovering pointer. One period of the stripes along the x axis is 12px over
	   cos 45deg, so the loop is seamless; a ring breathes about its centre; the
	   rays turn less than a degree, which is all their 24px margin allows on the
	   widest banner the class pane can draw. */
	@media (prefers-reduced-motion: no-preference) {
		.ct-banner[data-pattern='stripes'] .ct-pattern {
			animation: ct-stripes-in 4.2s cubic-bezier(0.2, 0.7, 0.2, 1) both;
		}
		.ct-banner[data-pattern='rings'] .ct-pattern,
		.ct-banner[data-pattern='ripples'] .ct-pattern {
			animation: ct-breathe-in 4.2s cubic-bezier(0.2, 0.7, 0.2, 1) both;
		}
		.ct-banner[data-pattern='rays'] .ct-pattern {
			animation: ct-turn-in 4.2s cubic-bezier(0.2, 0.7, 0.2, 1) both;
		}
	}
	@media (prefers-reduced-motion: no-preference) and (hover: hover) {
		.ct-banner[data-pattern='stripes']:hover .ct-pattern {
			animation: ct-stripes-drift 3s linear infinite;
		}
		.ct-banner[data-pattern='rings']:hover .ct-pattern,
		.ct-banner[data-pattern='ripples']:hover .ct-pattern {
			animation: ct-breathe 3.2s ease-in-out infinite alternate;
		}
		.ct-banner[data-pattern='rays']:hover .ct-pattern {
			animation: ct-turn 4s ease-in-out infinite alternate;
		}
	}
	@keyframes ct-stripes-in {
		from {
			transform: translateX(-16.97px);
		}
		to {
			transform: none;
		}
	}
	@keyframes ct-stripes-drift {
		from {
			transform: none;
		}
		to {
			transform: translateX(16.97px);
		}
	}
	@keyframes ct-breathe-in {
		from {
			transform: scale(1.12);
		}
		to {
			transform: none;
		}
	}
	@keyframes ct-breathe {
		from {
			transform: none;
		}
		to {
			transform: scale(1.06);
		}
	}
	@keyframes ct-turn-in {
		from {
			transform: rotate(-0.9deg);
		}
		to {
			transform: none;
		}
	}
	@keyframes ct-turn {
		from {
			transform: none;
		}
		to {
			transform: rotate(0.9deg);
		}
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
</style>
