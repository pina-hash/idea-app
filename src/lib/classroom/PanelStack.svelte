<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A PAGE'S PANELS IN THIS PERSON'S ORDER, WITH THE ANCHOR HELD STILL (ledger
	 * 0360, report R23). The class page and the item page each render through
	 * this, so "two keyed lists around a fixed anchor" has one spelling.
	 *
	 * THE ANCHOR IS OUTSIDE BOTH LISTS, AND THAT IS THE WHOLE COMPONENT. Moving an
	 * `<iframe>` in the DOM reloads it, and the item page's work slot holds a
	 * ported worksheet's iframe: a single keyed `{#each}` over every panel would
	 * move the work slot's nodes whenever a panel crossed it and reload a
	 * student's open worksheet. Here the anchor is rendered once, statically,
	 * between the two lists; a reorder moves panels around it and never moves
	 * it. `tests/dom/classroom-panel-stack.test.ts` holds the same node across
	 * every reorder.
	 *
	 * NO WRAPPER ELEMENT. Each panel snippet renders exactly the markup it
	 * rendered before this existed, so a page with no stored layout is the page
	 * as it was, and a parent's `> .child` rule still reaches its children.
	 *
	 * A panel moving from one side of the anchor to the other is unmounted and
	 * mounted again (it changes lists), which is the one cost of the shape: the
	 * panel's own transient state restarts. Within a side, the keyed list moves
	 * it and keeps it.
	 */
	let {
		above,
		below,
		panel,
		anchor = null
	}: {
		/** Panel ids before the anchor, in order (`resolvePanels(...).above`). */
		above: readonly string[];
		/** Panel ids after it (`resolvePanels(...).below`). */
		below: readonly string[];
		/** Renders one panel by id: the page's own markup for it. */
		panel: Snippet<[string]>;
		/** The fixed panel. Null where the page has none (an item that is not an assignment). */
		anchor?: Snippet | null;
	} = $props();
</script>

{#each above as id (id)}{@render panel(id)}{/each}
{#if anchor}{@render anchor()}{/if}
{#each below as id (id)}{@render panel(id)}{/each}
