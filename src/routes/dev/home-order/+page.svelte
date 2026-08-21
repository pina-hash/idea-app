<script lang="ts">
	import Home from '../../+page.svelte';

	/**
	 * THE REAL HOME PAGE, mounted with harness data (see +page.ts).
	 *
	 * There is deliberately nothing here but the mount and a strip saying which
	 * case is on screen: the whole point is that the component under measurement
	 * is `src/routes/+page.svelte` itself, including its `managesAnySection`
	 * derivation, its snippets and its ordering branch. Anything reconstructed
	 * here would be a second implementation whose agreement with the page proves
	 * nothing.
	 */
	let { data } = $props();

	/**
	 * The real page's `data` is typed against its own server load, whose
	 * `claims` is a full decoded JWT. A harness has no JWT and needs none: the
	 * page reads `sub` and `email` off it and nothing else. Cast at the one
	 * boundary rather than fabricating six claim fields that would then read as
	 * meaningful.
	 */
	const homeData = $derived(data as unknown as Parameters<typeof Home>[1]['data']);
</script>

<div class="harness-strip">
	role=<strong>{data.harness.role}</strong> &middot; classes=<strong>{data.harness.classes}</strong>
	&middot; rows/card=<strong>{data.harness.rows}</strong>
	&middot; <a href="?role=student&classes=1&rows=3">student x1</a>
	&middot; <a href="?role=teacher&classes=4&rows=3">teacher x4</a>
	&middot; <a href="?role=teacher&classes=1&rows=3">teacher x1</a>
</div>

<Home data={homeData} />

<style>
	.harness-strip {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		background: #000;
		color: var(--dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}
	.harness-strip strong {
		color: var(--cyan);
	}
	.harness-strip a {
		color: var(--gold);
	}
</style>
