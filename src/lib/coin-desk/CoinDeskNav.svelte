<script lang="ts">
	import { COIN_DESK_AREAS, type CoinDeskAreaId } from './nav';

	/**
	 * The persistent sub-nav for the /coin-desk route group. ONE component,
	 * two modes, so the real layout and the dev harness can never drift apart
	 * on what areas exist or what they are called:
	 *
	 *  - no `onSelect` (the real layout): renders real <a href> links, so each
	 *    area is a real route with a real URL.
	 *  - with `onSelect` (the dev harness, which has no router): renders
	 *    buttons that switch a local view instead.
	 */
	let {
		active,
		onSelect
	}: {
		active: CoinDeskAreaId;
		onSelect?: (id: CoinDeskAreaId) => void;
	} = $props();

	const current = $derived(COIN_DESK_AREAS.find((a) => a.id === active) ?? COIN_DESK_AREAS[0]);
</script>

<nav class="desk-nav" aria-label="Coin Desk sections">
	<ul>
		{#each COIN_DESK_AREAS as area (area.id)}
			<li>
				{#if onSelect}
					<button
						type="button"
						class:active={area.id === active}
						aria-current={area.id === active ? 'page' : undefined}
						onclick={() => onSelect?.(area.id)}
					>
						{area.label}
					</button>
				{:else}
					<a
						href={area.href}
						class:active={area.id === active}
						aria-current={area.id === active ? 'page' : undefined}
					>
						{area.label}
					</a>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="blurb">{current.blurb}</p>
</nav>

<style>
	/*
	 * THE LEDGER'S TAB BAR, IN THE PORTAL'S TOKENS.
	 *
	 * `src/lib/legacy/coins/index.html` -- the IDEA Coin Ledger, which is the surface
	 * students already know this economy through -- puts its sections on a
	 * `.tab-bar`: a hairline under the row, Orbitron uppercase at wide
	 * tracking, resting in the dim ink, and the current tab marked by a 2px
	 * UNDERLINE rather than a fill. This was a row of filled pills in Share
	 * Tech Mono, which is a different piece of furniture entirely.
	 *
	 * WHAT WAS TAKEN AND WHAT WAS NOT. The shape, the face, the tracking and
	 * the underline are the ledger's. The COLOUR is not: the ledger marks its
	 * active tab in gold, and in this register `--gold` is "special callouts"
	 * while `--green` is "primary actions, active navigation, focus, success"
	 * -- so the active tab is green here. The semantic roles are fixed and
	 * matching a legacy page's palette is not a licence to reassign one.
	 *
	 * `--font-title` IS Orbitron, named through its token rather than as a
	 * literal. It reaches a third surface here (the portal home and /archive
	 * are the other two) and it reaches it for the same reason the ledger uses
	 * it: this is coin chrome.
	 */
	.desk-nav {
		margin: 0 0 1.2rem;
	}
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0;
		list-style: none;
		margin: 0;
		padding: 0;
		border-bottom: 1px solid var(--line);
	}
	li {
		margin: 0;
	}
	a,
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* 44px, the tap-target floor. It was 26.2px: hit-tested on a 375px
		   viewport the row measured 26px tall, which is under the 44px floor and
		   only just over the 24px absolute one. `min-height` and not `height`,
		   so the label is free to make it taller and never shorter. */
		min-height: 44px;
		background: none;
		border: none;
		/* The bar's own hairline is 1px; the tab's marker overlaps it rather
		   than sitting under it, which is what makes the current tab read as
		   part of the bar instead of as a box below it. */
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		border-radius: 0;
		color: var(--dim);
		font-family: var(--font-title);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		text-decoration: none;
		padding: 0.5rem 1.1rem;
		cursor: pointer;
	}
	a:hover,
	button:hover {
		color: var(--white);
	}
	a.active,
	button.active {
		color: var(--green);
		border-bottom-color: var(--green);
		text-shadow: var(--glow-green);
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--cyan);
		outline-offset: -2px;
	}
	.blurb {
		margin: 0.55rem 0 0;
		color: var(--dim);
		font-size: 0.88rem;
	}
</style>
