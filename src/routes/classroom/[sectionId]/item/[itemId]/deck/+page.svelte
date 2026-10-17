<script lang="ts">
	import DeckViewer from '$lib/classroom/DeckViewer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/*
	 * THE FEEDBACK BUTTON IS THE ROOT LAYOUT'S CORNER BUTTON, as on every page
	 * (ledger 0396). It used to be relocated into the deck's bar, because the
	 * stage is projected and a floating control over it ends up in the
	 * photograph of the lesson. The viewer now keeps the corner off the slide
	 * instead (a black band under the stage outside full screen), and in full
	 * screen the button is not drawn at all: the full-screen element is the
	 * viewer, and the button is not inside it.
	 */
</script>

<DeckViewer deck={data.deck} backHref={data.backHref} backLabel="Back to the item" />
