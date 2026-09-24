<script lang="ts">
	import { page } from '$app/state';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import { harnessManage, TOUR_BASE } from '../../+layout.svelte';
	import type { PageData } from './$types';

	/**
	 * The REAL ItemDetail in the detail pane, which is what puts a second pane
	 * beside the list and so what makes the list-width separator appear.
	 * Read-only (no transports): this harness is about the tour and the width.
	 */
	let { data }: { data: PageData } = $props();
	const manage = $derived(harnessManage(page.url));
</script>

<ItemDetail
	section={data.section}
	item={data.item}
	canManage={manage}
	basePath={TOUR_BASE}
	gradeHref={manage && data.item.kind === 'assignment' ? `${TOUR_BASE}/s-1/item/${data.item.id}/grade` : null}
/>
