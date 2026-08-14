<script lang="ts">
	import DeckViewer from '$lib/classroom/DeckViewer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<DeckViewer deck={data.deck} backHref={data.backHref} backLabel="Back to the item" />
