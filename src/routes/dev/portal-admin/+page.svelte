<script lang="ts">
	import Console from '../../dashboard/+page.svelte';

	/**
	 * THE REAL ADMIN CONSOLE, mounted with harness data (see +page.ts). Nothing
	 * here but the mount and a strip naming the case on screen: the thing under
	 * measurement is `src/routes/dashboard/+page.svelte` itself, its panel
	 * order, its grid and its controls. Anything reconstructed here would be a
	 * second implementation whose agreement with the page proves nothing.
	 */
	let { data } = $props();

	/* The real page's `data` is typed against its own server load, whose
	   `claims` is a full decoded JWT; the page reads nothing off it. Cast at the
	   one boundary. */
	const consoleData = $derived(data as unknown as Parameters<typeof Console>[1]['data']);
</script>

<svelte:head><title>Admin console harness</title></svelte:head>

<div class="harness-strip">
	used=<strong>{data.harness.used.join(',') || 'none'}</strong>
	&middot; owner=<strong>{data.harness.owner}</strong>
	&middot; queues=<strong>{data.harness.queues}</strong>
	&middot; students=<strong>{data.harness.students}</strong>
	{#if data.harness.sort}&middot; sort=<strong>{data.harness.sort}</strong>{/if}
	&middot; <a href="?">default</a>
	&middot; <a href="?used=roster,admins">roster, admins first</a>
	&middot; <a href="?owner=1">owner</a>
	&middot; <a href="?queues=0&students=0">empty</a>
	&middot; <a href="?students=40">40 students</a>
</div>

<Console data={consoleData} />

<style>
	.harness-strip {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--dim);
		padding: 0.35rem 1rem;
		background: var(--bg2);
		border-bottom: 1px solid var(--line);
	}
	.harness-strip a {
		color: var(--cyan);
	}
</style>
