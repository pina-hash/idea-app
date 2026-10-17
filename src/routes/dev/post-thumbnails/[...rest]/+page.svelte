<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Opened // post thumbnails harness</title>
</svelte:head>

<main class="harness" data-testid="thumb-opened" data-rest={data.rest}>
	<h1>Opened</h1>
	<p>This is where a click on a thumbnail went: <code>{data.rest}</code></p>
	<p><a href="/dev/post-thumbnails">Back to the class</a></p>
</main>
