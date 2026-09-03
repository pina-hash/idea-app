<script lang="ts">
	import GradesPanel from '$lib/classroom/GradesPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

</script>

<GradesPanel
	section={data.section}
	standings={data.standings}
	resubmittedAfterGrading={data.resubmittedAfterGrading}
/>
