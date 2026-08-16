<script lang="ts">
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// No transports, no isStaff: this is the student's own view of their own
	// classes, and there is deliberately nothing here that writes.
	const base = $derived(`/classroom/view-as/${encodeURIComponent(data.studentEmail)}`);
</script>

<!--
	The notebook is a per-STUDENT surface rather than a per-class one, so it
	has no home on a class page's basePath -- it belongs beside "their classes".
	This nav strip is the view-as tree's own chrome (it sits under the banner
	and is not part of the student experience being previewed); every class
	page reached below ALSO carries its own notebook link, rewritten under this
	basePath exactly like every other link there.
-->
<nav class="viewas-nav" aria-label="This student's surfaces">
	<a href={`${base}/notebook`}>Their notebook &rsaquo;</a>
</nav>

<MyClasses
	ready={data.ready}
	sections={data.sections}
	basePath={base}
/>

<style>
	.viewas-nav {
		max-width: 46rem;
		margin: 0.9rem auto -0.5rem;
		padding: 0 1.2rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
	}
	.viewas-nav a {
		color: var(--gold);
	}
</style>
