<script lang="ts">
	import { page } from '$app/state';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import { harnessManage } from '../../+layout.svelte';
	import { BASE } from '../../../fixture';
	import type { PageData } from './$types';

	/**
	 * The REAL ItemDetail in the detail pane, so a palette pick that opens an
	 * item lands on the page a student or a teacher would land on. Read-only on
	 * purpose (no transports): this harness is about getting HERE, and
	 * /dev/classroom-split drives what the item page itself does.
	 */
	let { data }: { data: PageData } = $props();
	const manage = $derived(harnessManage(page.url));
</script>

<ItemDetail
	section={data.section}
	item={data.item}
	canManage={manage}
	basePath={BASE}
	gradeHref={manage && data.item.kind === 'assignment' ? `${BASE}/s-1/item/${data.item.id}/grade` : null}
/>
