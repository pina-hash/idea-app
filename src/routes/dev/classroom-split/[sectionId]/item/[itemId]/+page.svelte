<script lang="ts">
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import type { PageData } from './$types';

	/**
	 * The REAL ItemDetail in the detail pane, reading `section` from the layout's
	 * data exactly as the shipping page does now that the item load no longer
	 * returns its own copy.
	 */
	let { data }: { data: PageData } = $props();
</script>

<ItemDetail section={data.section} item={data.item} canManage={false} />
