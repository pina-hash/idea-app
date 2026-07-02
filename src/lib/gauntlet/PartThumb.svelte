<script lang="ts">
	import { onMount } from 'svelte';
	import { getPartThumb } from './part-thumbs';

	/**
	 * Cached isometric render of a level's part, embedded in its list tile.
	 * Decorative (the title carries the meaning): shows a soft sheen while the
	 * shared studio renders on first sight, the cached PNG afterwards, and a
	 * quiet wireframe glyph when the level has no model (or WebGL is out).
	 * The signed Storage URL is resolved lazily, only on a cache miss, via the
	 * caller's resolver (see part-thumbs.ts).
	 */

	let {
		modelPath,
		resolveUrl
	}: {
		modelPath: string | null;
		resolveUrl: (path: string) => Promise<string | null>;
	} = $props();

	let src = $state<string | null>(null);
	let pending = $state(true);

	onMount(() => {
		let alive = true;
		if (!modelPath) {
			pending = false;
			return;
		}
		const path = modelPath;
		getPartThumb(path, () => resolveUrl(path)).then((url) => {
			if (!alive) {
				if (url) URL.revokeObjectURL(url);
				return;
			}
			src = url;
			pending = false;
		});
		return () => {
			alive = false;
			if (src) URL.revokeObjectURL(src);
		};
	});
</script>

<span class="part-thumb" aria-hidden="true">
	{#if src}
		<img {src} alt="" loading="lazy" decoding="async" />
	{:else if pending}
		<span class="thumb-wait"></span>
	{:else}
		<svg class="thumb-ph" viewBox="0 0 48 48">
			<g fill="none" stroke="currentColor" stroke-width="1.2">
				<path d="M24 8l14 8v16l-14 8-14-8V16z" />
				<path d="M24 8v16m0 16V24m0 0l14-8M24 24L10 16" opacity="0.55" />
			</g>
		</svg>
	{/if}
</span>

<style>
	.part-thumb {
		position: relative;
		flex: none;
		width: 96px;
		height: 72px;
		display: grid;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--line, #16242c);
		border-radius: 8px;
		/* The same deep pool-of-light stage as the big preview, in miniature. */
		background:
			radial-gradient(120% 100% at 50% 0%, rgba(59, 110, 143, 0.16), transparent 65%),
			linear-gradient(180deg, #0c141a, var(--void, #04070a) 90%);
	}
	.part-thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.thumb-wait {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			100deg,
			transparent 30%,
			rgba(136, 221, 255, 0.08) 50%,
			transparent 70%
		);
		background-size: 220% 100%;
		animation: thumb-sheen 1.6s linear infinite;
	}
	@keyframes thumb-sheen {
		from {
			background-position: 180% 0;
		}
		to {
			background-position: -80% 0;
		}
	}
	.thumb-ph {
		width: 34px;
		height: 34px;
		color: var(--dim, #5f8a78);
		opacity: 0.7;
	}
	@media (max-width: 560px) {
		.part-thumb {
			width: 72px;
			height: 54px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.thumb-wait {
			animation: none;
		}
	}
</style>
