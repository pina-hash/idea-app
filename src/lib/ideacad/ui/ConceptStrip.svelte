<script lang="ts">
	/**
	 * The saved concepts, as cards: a profile thumbnail, the name, the rule chips
	 * and the committed chip, plus New, Duplicate, Rename, Delete and reorder.
	 *
	 * THE THUMBNAIL IS THE PROFILE, NOT A RENDER. 0145 PART 5 asks for a
	 * thumbnail "rendered offscreen from the tree"; a second WebGL context per
	 * card, on a six-year-old school desktop, is the performance budget this
	 * repository states spent on a picture 90px wide. The profile polyline is
	 * derived from the same stations the lathe revolves, so it is a true picture
	 * of THIS concept and it differs between two concepts exactly when their
	 * bodies do -- which is what a student picks a card by. An isometric render
	 * is still the right thing for the concept CARD that gets committed, which is
	 * a 1600x1000 PNG and a different surface.
	 *
	 * THE CARDS AND THE CONTROLS ARE TWO ROWS, AND THAT IS A MEASURED DECISION.
	 * On one row the strip ran off a 1440px window with "Commit as concept card"
	 * sliced in half -- it scrolls, so no threshold could see it, and a student
	 * has no reason to think there is anything to the right of the edge. The
	 * cards keep the horizontal scroll, because a document can hold many and a
	 * card is a fixed size; the controls WRAP, because there is a known number of
	 * them and every one has to be reachable without a gesture.
	 *
	 * A CARD THAT CANNOT BE EVALUATED SAYS SO RATHER THAN TAKING THE STRIP DOWN.
	 * `evaluate` reads all six features by type and throws on the first missing
	 * one, so one malformed concept in a document would otherwise blank every
	 * card beside it.
	 */
	import { evaluate } from '../blade/evaluate';
	import type { BladeConfig } from '../blade/materials';
	import type { BladeTree } from '../blade/tree';
	import { profilePolyline } from './feature-model';

	export interface ConceptCard {
		id: string;
		name: string;
		features: BladeTree;
		committed: boolean;
	}

	let {
		concepts,
		activeId,
		config,
		readOnly = false,
		renaming = false,
		renameTo = $bindable(''),
		armed = '',
		canCommit = false,
		onload,
		onnew,
		onduplicate,
		onstartrename,
		oncommitrename,
		oncancelrename,
		onarm,
		ondelete,
		onmove,
		oncompare,
		oncommit
	}: {
		concepts: ConceptCard[];
		activeId: string;
		config: BladeConfig;
		readOnly?: boolean;
		renaming?: boolean;
		renameTo?: string;
		armed?: string;
		canCommit?: boolean;
		onload: (id: string) => void;
		onnew: () => void;
		onduplicate: () => void;
		onstartrename: () => void;
		oncommitrename: () => void;
		oncancelrename: () => void;
		onarm: (id: string) => void;
		ondelete: () => void;
		onmove: (direction: -1 | 1) => void;
		oncompare: () => void;
		oncommit: () => void;
	} = $props();

	const active = $derived(concepts.find((c) => c.id === activeId) ?? concepts[0]);
	const at = $derived(concepts.findIndex((c) => c.id === activeId));

	interface Card { id: string; failures: string[]; broken: boolean; points: string }
	const cards = $derived<Card[]>(
		concepts.map((c) => {
			try {
				const e = evaluate(c.features, config);
				return {
					id: c.id,
					failures: e.rules.filter((r) => !r.pass).map((r) => r.label),
					broken: false,
					points: profilePolyline(e.geometry.stations, 46, 34, 3).points
				};
			} catch {
				return { id: c.id, failures: [], broken: true, points: '' };
			}
		})
	);
	const cardOf = (id: string) => cards.find((c) => c.id === id);
</script>

<section class="concepts" aria-label="Concepts">
	<div class="cards">
	{#each concepts as concept (concept.id)}
		{@const card = cardOf(concept.id)}
		<button class="card" class:active={concept.id === activeId} onclick={() => onload(concept.id)}>
			<svg class="thumb" viewBox="0 0 46 34" width="46" height="34" aria-hidden="true"
				><polyline points={card?.points ?? ''} /></svg
			><span class="nm">{concept.name}<small>{concept.id === activeId ? 'ACTIVE' : concept.committed ? 'COMMITTED' : ' '}</small></span>
			{#if card?.broken}
				<span class="chip fail">REBUILD</span>
			{:else if card?.failures.length}
				<span class="chip fail">FAIL {card.failures.length}</span>
			{:else}
				<span class="chip pass">PASS</span>
			{/if}
		</button>
	{/each}
	</div>
	<div class="controls">
	{#if !readOnly}
		{#if renaming}
			<input class="rename" bind:value={renameTo} placeholder="Concept name" aria-label="Concept name" />
			<button onclick={oncommitrename}>Save name</button>
			<button onclick={oncancelrename}>Cancel rename</button>
		{:else}
			<button onclick={onnew}>New</button>
			<button onclick={onduplicate}>Duplicate</button>
			<button onclick={onstartrename}>Rename</button>
			{#if concepts.length > 1}
				{#if armed === activeId}
					<button class="danger" onclick={ondelete}>Delete {active.name}</button>
					<button onclick={() => onarm('')}>Keep it</button>
				{:else}
					<button onclick={() => onarm(activeId)}>Delete</button>
				{/if}
			{:else}
				<span class="note">Your last concept cannot be deleted.</span>
			{/if}
			{#if concepts.length > 1}
				<button aria-disabled={at <= 0} onclick={() => onmove(-1)}>Move left</button>
				<button aria-disabled={at < 0 || at >= concepts.length - 1} onclick={() => onmove(1)}>Move right</button>
			{/if}
			<button onclick={oncompare}>Compare</button>
			{#if canCommit}<button onclick={oncommit}>Commit as concept card</button>{/if}
		{/if}
	{/if}
	</div>
</section>

<style>
	.concepts {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border-top: 1px solid var(--boundary);
	}
	.cards {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.controls:empty {
		display: none;
	}
	button {
		flex: 0 0 auto;
		min-height: 44px;
		min-width: 44px;
		padding: 0 1rem;
		scroll-snap-align: start;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
		border-color: var(--hairline);
	}
	.card {
		min-width: 200px;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-align: left;
		padding: 0 0.75rem;
	}
	.card.active {
		border-color: var(--green);
		background: var(--green-tint);
	}
	.nm {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		display: block;
		color: var(--green);
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
	}
	.thumb {
		flex: 0 0 auto;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: 2px;
	}
	.thumb polyline {
		fill: none;
		stroke: var(--green);
		stroke-width: 2;
	}
	.chip {
		flex: 0 0 auto;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
	}
	.chip.pass {
		color: var(--green);
	}
	.chip.fail {
		color: var(--crimson);
	}
	.danger {
		border-color: var(--crimson);
	}
	.note {
		align-self: center;
		padding: 0 0.5rem;
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
	}
	.rename {
		flex: 0 0 auto;
		min-height: 44px;
		min-width: 180px;
		padding: 0 0.7rem;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
	}
</style>
