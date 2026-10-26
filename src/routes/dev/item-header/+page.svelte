<script lang="ts">
	/**
	 * THE ITEM HEADER ABOVE A PORTED WORKSHEET (ledger 0438, reports 3ac88030
	 * and 36198988). Mounts the REAL ItemDetail inside the classroom's own
	 * `.cr-root` plate, which is what drew the empty hazard bar: the plate's
	 * title rule outranked the hidden title's own.
	 *
	 *   ?manage=1   a manager (the inspector, and with `switch=1` the title switch)
	 *   ?switch=1   hands in `setShowTitle`, so the switch renders in the inspector
	 *   ?shown=1    the stored setting is "show the title"
	 *   ?kind=plain a plain assignment, whose title always shows
	 *
	 * `tools/browser-verify/routes/item-header*.mjs` measures it at 375 and 1440.
	 */
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import type { HtmlAssignmentData } from '$lib/classroom/html-assignment/mount';
	import type { HtmlAssignmentTransports } from '$lib/classroom/html-assignment/store';
	import { itemById, SECTION } from '../classroom-palette/fixture';

	const q = page.url.searchParams;
	const manage = q.get('manage') === '1';
	const plain = q.get('kind') === 'plain';
	const base = itemById('i-tonight')!;
	const item = (plain ? base : { ...base, assignment_schema_version: 3 }) as typeof base;
	const WORKSHEET = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bridge fixture worksheet',
		course: 'IDEA209H',
		points: 10,
		modules: [
			{
				id: 'mod-1',
				title: 'One module',
				points: 10,
				blocks: [{ id: 'mod-1.a.team', field: 'teamName', type: 'text' }],
				criteria: []
			}
		]
	};
	const htmlAssignment = plain
		? null
		: ({
				documentId: 'worksheet',
				manifest: WORKSHEET,
				filename: 'worksheet.html',
				updatedAt: null,
				showTitle: q.get('shown') === '1'
			} as unknown as HtmlAssignmentData);
	let writes = $state(0);
	const htmlAssignmentTransports = (
		q.get('switch') === '1'
			? {
					setShowTitle: async () => {
						writes += 1;
						return { ok: true };
					}
				}
			: null
	) as unknown as HtmlAssignmentTransports | null;
</script>

<div class="cr-root {CLASSROOM_PLATE}">
	<main class="classroom-page" data-testid="item-header-harness" data-writes={writes}>
		<ItemDetail
			section={SECTION}
			{item}
			canManage={manage}
			basePath="/dev/item-header"
			{htmlAssignment}
			{htmlAssignmentTransports}
		/>
	</main>
</div>
