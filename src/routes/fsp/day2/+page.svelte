<script lang="ts">
	import FspDayArchive from '$lib/fsp/FspDayArchive.svelte';

	let { data } = $props();
</script>

<FspDayArchive day={2} slidesSrc="/fsp/day2/index.html" {data} />
