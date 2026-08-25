<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import PeoplePanel from '$lib/classroom/PeoplePanel.svelte';
	import { createClassroomTransports } from '$lib/classroom/transports';
	import type { SectionGrid } from '$lib/notebook-review';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The notebook compliance summary (0099), which came here with the roster it
	 * summarizes. The SAME `notebook_get_section_grid` the review console runs --
	 * that RPC asks `classroom_manages_section` itself, so this can never offer a
	 * grid the database would refuse. Fails soft to the element not rendering.
	 */
	async function loadNotebookGrid(sectionId: string, unitNumber: number | null) {
		const { data: grid, error } = await data.supabase.rpc('notebook_get_section_grid', {
			p_section_id: sectionId,
			p_unit_number: unitNumber
		});
		if (error) {
			return { ok: false as const, error: 'Could not load the notebook grid for this class.' };
		}
		return { ok: true as const, value: grid as SectionGrid };
	}

	// The same transports the rest of the module uses; every one of them is
	// re-authorized by the RPC it calls, so this is plumbing, never a boundary.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
</script>

<PeoplePanel
	section={data.section}
	roster={data.roster}
	removalReady={data.removalReady}
	{transports}
	{loadNotebookGrid}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto('/classroom')}
/>
