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
	.desk-nav {
		margin: 0 0 1.2rem;
	}
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		list-style: none;
		margin: 0;
		padding: 0 0 0.5rem;
		border-bottom: 1px solid var(--line);
	}
	li {
		margin: 0;
	}
	a,
	button {
		display: inline-block;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-decoration: none;
		padding: 0.35rem 0.85rem;
		cursor: pointer;
	}
	a:hover,
	button:hover {
		color: var(--white);
		border-color: var(--green);
	}
	a.active,
	button.active {
		color: var(--bg0);
		background: var(--green);
		border-color: var(--green);
		font-weight: 700;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--cyan);
		outline-offset: 2px;
	}
	.blurb {
		margin: 0.55rem 0 0;
		color: var(--dim);
		font-size: 0.88rem;
	}
</style>
