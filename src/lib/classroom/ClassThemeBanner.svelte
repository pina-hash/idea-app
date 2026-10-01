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
	 * composites it), the pattern is a `background-image` on the banner only,
	 * the edge is the border, the section's accent is the thick left stripe,
	 * and the badge and the class name take the room's own text ink. The words
	 * are always in the accessible tree, because a theme is never colour alone.
	 *
	 * Both twins of every colour arrive inline from `classThemeVars`; the
	 * stylesheet below picks one into a used property of its own, and picks the
	 * Space White twin under that theme. It never redeclares a `--ct-*` name the
	 * inline style sets, which would silently lose to it.
	 */
	let {
		theme = null,
		children
	}: {
		theme?: ClassTheme | null;
		children: Snippet;
	} = $props();

	const vars = $derived(classThemeVars(theme));
	const words = $derived(classThemeWords(theme));
</script>

{#if theme}
	<div
		class="ct-banner"
		class:has-badge={theme.badge.paths.length > 0}
		style={vars}
		data-testid="class-banner"
		data-palette={theme.palette.id}
		data-pattern={theme.pattern.id}
		data-badge={theme.badge.id}
		data-accent={theme.accent?.id ?? ''}
	>
		{#if theme.badge.paths.length > 0}
			<span class="ct-badge" data-testid="class-banner-badge" aria-hidden="true">
				<BadgeIcon id={theme.badge.id} size="1.7rem" />
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
		background-image: var(--ct-p);
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
	.ct-badge {
		flex: none;
		display: grid;
		place-items: center;
		align-self: flex-start;
		margin-top: 0.35rem;
		color: var(--text-1);
	}
	.ct-body {
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
