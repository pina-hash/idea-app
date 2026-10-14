<script lang="ts">
	/**
	 * A PICTURE WITH A DRAWING OVER IT, at `object-fit: contain` in whatever box
	 * the caller gives it. The natural size comes from the image itself, which
	 * is what `MarkLayer` needs to put a mark on the same spot at every size. A
	 * picture that will not decode says so in words rather than drawing marks
	 * over nothing.
	 */
	import MarkLayer from './MarkLayer.svelte';
	import type { Marks } from './notes';

	let {
		src,
		alt,
		marks,
		fit = 'contain'
	}: {
		src: string;
		alt: string;
		marks: Marks | null;
		fit?: 'contain' | 'cover';
	} = $props();

	let natural = $state<{ w: number; h: number } | null>(null);
	let broken = $state(false);
	function loaded(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		natural = { w: img.naturalWidth, h: img.naturalHeight };
	}
</script>

<span class="marked" class:cover={fit === 'cover'} data-testid="marked-picture">
	{#if broken}
		<span class="marked-broken">The picture could not be shown.</span>
	{:else}
		<img {src} {alt} loading="lazy" decoding="async" onload={loaded} onerror={() => (broken = true)} />
		{#if natural && fit === 'contain'}
			<MarkLayer {marks} width={natural.w} height={natural.h} />
		{/if}
	{/if}
</span>

<style>
	.marked {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
	}
	.marked img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.marked.cover img {
		object-fit: cover;
	}
	.marked-broken {
		display: grid;
		place-items: center;
		height: 100%;
		padding: 0.5rem;
		color: var(--text-2);
		font-size: 0.8rem;
		text-align: center;
	}
</style>
