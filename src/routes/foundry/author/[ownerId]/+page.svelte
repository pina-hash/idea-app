<script lang="ts">
	/**
	 * A PUBLISHER'S PAGE. The route load owns the three reads; `FoundryAuthorPage`
	 * owns the arrangement. This is the wiring and nothing else.
	 *
	 * IT MOUNTS THE SAME `coverUrl` THE GALLERY MOUNTS, so a card's picture
	 * resolves through one implementation on both surfaces. A second resolver is
	 * how a cover renders on one page and 404s on the other.
	 *
	 * THE SHELL IS THE AREA LAYOUT'S. `/foundry/+layout.svelte` mounts
	 * `FoundryShell` and `forge.css`, so this page inherits the tabs, the room
	 * and the closure refusal without importing any of them -- which is the
	 * point of the layout, and is why a new Foundry page cannot ship ungated by
	 * somebody forgetting a copy.
	 */
	import { foundryCoverUrl } from '$lib/foundry/covers';
	import FoundryAuthorPage from '$lib/foundry/FoundryAuthorPage.svelte';
	import { foundryAuthorName } from '$lib/foundry/surface';

	let { data } = $props();

	/**
	 * THE TAB TITLE USES THE SAME TWO-RUNG LADDER the page's heading does, and
	 * falls back to the same word. A document title reading "null" is the kind
	 * of thing nobody sees in review and everybody sees in a browser history.
	 */
	const title = $derived(foundryAuthorName(data.card) ?? 'Publisher');
</script>

<svelte:head><title>{title} | IDEA Foundry</title></svelte:head>

<FoundryAuthorPage
	card={data.card}
	apps={data.apps}
	playCounts={data.playCounts}
	coverUrl={foundryCoverUrl}
/>
