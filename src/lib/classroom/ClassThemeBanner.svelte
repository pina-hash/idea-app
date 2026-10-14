<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import {
		classThemeFlow,
		classThemeVars,
		classThemeWords,
		PATTERN_FLOW_FPS,
		patternFlowOffset,
		type ClassTheme
	} from '$lib/classroom/class-theme';
	import { classroomPreferences, reactivePreferences } from '$lib/preferences/context';

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
	 * THE PATTERN IS ITS OWN LAYER, SO IT CAN MOVE (ledger 0360, report R21).
	 * It is a real element (a scoped `::after` is the thing Svelte prunes,
	 * CLAUDE.md), `aria-hidden`, drawn with the identical stroke at the
	 * identical alpha, so no frame of the motion is a different contrast from
	 * the still pattern the catalogue's sweep already measures. It paints over
	 * the wash and under the words by TREE ORDER among positioned boxes, with no
	 * z-index anywhere, so the banner is still not a stacking context.
	 *
	 * IT FLOWS FOR AS LONG AS THE PAGE IS OPEN (Mr. Pina, 2026-10-14: "still
	 * glitching and pausing. they should be smoothly continuous looping
	 * animations"; decision 61). The motion used to be a 4.2s arrival that eased
	 * to a stop, then a loop that ran only under a hovering pointer and swung
	 * back and forth, so it stopped whenever the pointer left, never ran on a
	 * touch screen, and slowed to nothing at both ends of every swing. Now one
	 * registered property (`--ct-phase` for stripes, rings and ripples,
	 * `--ct-turn` for rays) runs from zero to exactly one period of the
	 * pattern, linearly and forever, and a repeating gradient moved by one
	 * period is the same picture: the loop has no seam and no turn to pause at.
	 * `patternFlow` in `class-theme.ts` derives the moving form from the one
	 * template, so there is no second copy of any pattern.
	 *
	 * IT IS PHASE-LOCKED TO THE WALL CLOCK. Every mount starts the loop where the
	 * clock says it is (`patternFlowOffset`), so the class page remounting on a
	 * tab change, or coming back from `display: none` on a phone, lands on the
	 * frame the pattern was already showing instead of restarting it.
	 *
	 * IT STOPS FOR ANYBODY WHO ASKS. Motion that runs longer than five seconds
	 * beside content needs a way to stop it (WCAG 2.2.2): `Class banner motion`
	 * in Display settings (`display.bannerMotion`, this device), and
	 * `prefers-reduced-motion: reduce`, whatever the setting says. Stopped, the
	 * layer draws the still template, byte for byte the frame it always drew. A
	 * browser that cannot register a custom property animates it in one jump a
	 * period, which is a glitch, so there it stays still too.
	 *
	 * Web Animations, not a stylesheet `@keyframes`, so the period comes from
	 * the template rather than being written down twice, and the start can be
	 * set from the clock. It is stepped at `PATTERN_FLOW_FPS`: at four pixels a
	 * second a thirtieth of a second is a seventh of a pixel, and it halves the
	 * paints of the one layer that repaints.
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
	const flow = $derived(classThemeFlow(theme));

	/* The off switch: this device's choice in Display settings. With no store in
	   context (a harness that provides none) the pattern moves. */
	const prefStore = classroomPreferences();
	const prefs = prefStore ? reactivePreferences(prefStore) : null;
	const still = $derived(prefs ? prefs.current.display.bannerMotion === 'still' : false);

	/* `reduce` is read from the media query itself and followed live, so a
	   person who switches it on mid-lesson is obeyed without a reload. */
	let reduce = $state(true);
	onMount(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduce = query.matches;
		const follow = () => (reduce = query.matches);
		query.addEventListener('change', follow);
		return () => query.removeEventListener('change', follow);
	});

	let layer = $state<HTMLSpanElement | null>(null);
	let flowing = $state(false);
	$effect(() => {
		const el = layer;
		const f = flow;
		const off = still || reduce;
		if (!el || !f || off) return;
		// The animation is started outside the tracking context: nothing it
		// touches may become a dependency of this effect (CLAUDE.md, Svelte 5).
		return untrack(() => {
			if (!registerFlowProperties()) return;
			const steps = Math.max(1, Math.round((f.durationMs / 1000) * PATTERN_FLOW_FPS));
			const animation = el.animate(
				[{ [f.property]: `0${f.unit}` }, { [f.property]: `${f.period}${f.unit}` }],
				{ duration: f.durationMs, iterations: Infinity, easing: `steps(${steps}, end)` }
			);
			animation.currentTime = patternFlowOffset(Date.now(), f.durationMs);
			flowing = true;
			return () => {
				animation.cancel();
				flowing = false;
			};
		});
	});
</script>

<script lang="ts" module>
	/**
	 * THE TWO PROPERTIES THE FLOW ANIMATES, registered once per page. A property
	 * that is not registered interpolates in one jump at the halfway point, which
	 * would be exactly the glitch this replaces, so a browser without
	 * `CSS.registerProperty` (or one that refuses) keeps the still frame.
	 */
	let registered: boolean | null = null;
	function registerFlowProperties(): boolean {
		if (registered !== null) return registered;
		if (typeof CSS === 'undefined' || typeof CSS.registerProperty !== 'function') return (registered = false);
		for (const [name, syntax, initialValue] of [
			['--ct-phase', '<length>', '0px'],
			['--ct-turn', '<angle>', '0deg']
		] as const) {
			try {
				CSS.registerProperty({ name, syntax, inherits: false, initialValue });
			} catch (err) {
				// Already registered (a second banner, or a hot reload) is fine;
				// anything else means the property will not interpolate.
				if (!(err instanceof DOMException && err.name === 'InvalidModificationError')) return (registered = false);
			}
		}
		return (registered = true);
	}
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
			<!-- The clip, not the banner, bounds the layer, so a focus ring on a
			     key inside the header is never clipped. -->
			<span class="ct-pattern-clip" aria-hidden="true"
				><span
					class="ct-pattern"
					data-testid="class-banner-pattern"
					data-flow={flowing ? 'on' : 'off'}
					style={flow?.style}
					bind:this={layer}
				></span></span
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
	/* Flowing, the layer draws the template with the phase in it (at phase zero,
	   the same picture), on a layer of its own so only it repaints, never the
	   words and keys over it. */
	.ct-pattern[data-flow='on'] {
		background-image: var(--ct-pf);
		will-change: transform;
	}
	:global(:root[data-theme='space-white']) .ct-pattern[data-flow='on'] {
		background-image: var(--ct-pf-light);
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
