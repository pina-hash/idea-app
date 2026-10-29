<script lang="ts" module>
	/** One place in an app's sub-nav. */
	export interface SubNavItem {
		id: string;
		label: string;
		/** A real address. Without one the pad is a button and `onselect` runs. */
		href?: string;
		current?: boolean;
		/** A count that is part of the word ("Review 3"). */
		count?: number | string | null;
		/** The count is lit: something is waiting. */
		hot?: boolean;
		testid?: string;
		/** A word for a screen reader when the visible word is shorter. */
		ariaLabel?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * THE ONE APP SUB-NAV (ledger 0468, feedback 38516c68).
	 *
	 * Every app's places are a strip of the Plate's PADS: a thick bezel, a
	 * recessed LED in its own lane, and the current place lit, with
	 * `aria-current` and the heavier word, so the light is never the only
	 * signal. The pads are the kit's `idea-pad` (tools/hx-kit/kit/plate.css,
	 * the one file the site and HTML assignments share); this component only
	 * renders the list. Every pad is 44px tall at every width, and the strip
	 * wraps rather than scrolling a place out of sight.
	 *
	 * A pad with an `href` is a link (a real route); one without is a button
	 * that calls `onselect`, for a harness with no router. `icon` draws a
	 * glyph before a pad's word; the word is always there.
	 */
	let {
		label,
		items,
		onselect,
		icon,
		blurb,
		testid = 'app-subnav'
	}: {
		/** What the strip is, for a screen reader ("Coin Desk sections"). */
		label: string;
		items: SubNavItem[];
		onselect?: (id: string) => void;
		icon?: Snippet<[SubNavItem]>;
		/** One line under the strip about the current place. */
		blurb?: string | null;
		testid?: string;
	} = $props();
</script>

<nav class="app-subnav" aria-label={label} data-testid={testid}>
	<ul class="idea-pads">
		{#each items as item (item.id)}
			<li>
				{#if item.href}
					<a
						class="idea-pad"
						href={item.href}
						aria-current={item.current ? 'page' : undefined}
						aria-label={item.ariaLabel}
						data-testid={item.testid}
					>
						{#if icon}{@render icon(item)}{/if}
						<span class="idea-pad-word">{item.label}</span>
						{#if item.count !== undefined && item.count !== null}
							<span class="idea-pad-count" data-hot={item.hot ? 'true' : undefined}>{item.count}</span>
						{/if}
					</a>
				{:else}
					<button
						type="button"
						class="idea-pad"
						aria-current={item.current ? 'page' : undefined}
						aria-label={item.ariaLabel}
						data-testid={item.testid}
						onclick={() => onselect?.(item.id)}
					>
						{#if icon}{@render icon(item)}{/if}
						<span class="idea-pad-word">{item.label}</span>
						{#if item.count !== undefined && item.count !== null}
							<span class="idea-pad-count" data-hot={item.hot ? 'true' : undefined}>{item.count}</span>
						{/if}
					</button>
				{/if}
			</li>
		{/each}
	</ul>
	{#if blurb}<p class="asn-blurb">{blurb}</p>{/if}
</nav>

<style>
	.app-subnav {
		min-width: 0;
		margin: 0 0 1.2rem;
	}
	/* Centred with the page header above it. */
	.app-subnav :global(.idea-pads) {
		justify-content: center;
	}
	/* A LIT COUNT carries a lamp in the warning tone's solid: something is
	   waiting. The number keeps the pad's own ink, because a semantic ink on a
	   key face reads about 3.45:1 (ledger 0465); the lamp is a mark, which
	   needs 3:1, and the number says the rest. */
	.app-subnav :global(.idea-pad-count[data-hot]) {
		color: var(--plate-ink);
		font-weight: 700;
	}
	.app-subnav :global(.idea-pad-count[data-hot])::before {
		content: '';
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: 4px;
		vertical-align: 0.1em;
		border-radius: 50%;
		background: var(--status-warn-solid);
		box-shadow: 0 0 0 1px var(--plate-led-ring);
	}
	.asn-blurb {
		max-width: 72ch;
		margin: 0.5rem auto 0;
		color: var(--text-2);
		font-size: 0.95rem;
		text-align: center;
	}
</style>
