<script lang="ts">
	import { onMount } from 'svelte';
	import { getPartThumb } from './part-thumbs';

	/**
	 * The single thumbnail slot on a COLLAPSED Speedrun series card. It slowly
	 * cross-fades through the isometric renders of the series' levels (~3.5s each),
	 * reusing the exact cached-render pipeline as the per-row PartThumb
	 * (part-thumbs.ts), so a warm cache never re-renders or re-signs.
	 *
	 * Degrades gracefully:
	 * - prefers-reduced-motion (or a single level): one static thumbnail, no rotation.
	 * - a level with no model, or one that fails to render: dropped from the rotation.
	 * - no renderable thumbnails at all: a VIEWPORT-styled wireframe placeholder.
	 *
	 * `models` + `resolveUrl` mirror PartThumb (lazy signed URL only on a cache
	 * miss). `preresolved` lets the dev harness inject ready image URLs so the
	 * cross-fade and reduced-motion paths are verifiable without Supabase/STLs.
	 */
	let {
		models = [],
		resolveUrl,
		preresolved = null,
		intervalMs = 3500,
		reducedMotion = null
	}: {
		models?: (string | null)[];
		resolveUrl?: (path: string) => Promise<string | null>;
		preresolved?: string[] | null;
		intervalMs?: number;
		/** Override motion detection (null = auto via prefers-reduced-motion). */
		reducedMotion?: boolean | null;
	} = $props();

	let sources = $state<string[]>(preresolved ?? []);
	let ready = $state(preresolved != null);
	let active = $state(0);
	let reduced = $state(false);
	// Object URLs this component minted via getPartThumb, revoked on destroy.
	let owned: string[] = [];

	onMount(() => {
		reduced =
			reducedMotion ??
			(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

		let alive = true;
		if (preresolved == null) {
			const paths = models.filter((m): m is string => !!m);
			Promise.all(
				paths.map((p) =>
					getPartThumb(p, () => (resolveUrl ? resolveUrl(p) : Promise.resolve(null))).catch(() => null)
				)
			).then((urls) => {
				if (!alive) {
					urls.forEach((u) => u && URL.revokeObjectURL(u));
					return;
				}
				owned = urls.filter((u): u is string => !!u);
				sources = owned;
				ready = true;
			});
		}

		return () => {
			alive = false;
			owned.forEach((u) => URL.revokeObjectURL(u));
		};
	});

	// Rotate only when there is more than one thumbnail and motion is allowed.
	$effect(() => {
		if (reduced || sources.length < 2) {
			active = 0;
			return;
		}
		const id = setInterval(() => {
			active = (active + 1) % sources.length;
		}, intervalMs);
		return () => clearInterval(id);
	});
</script>

<span class="series-thumb" aria-hidden="true">
	{#if sources.length}
		{#each sources as src, i (src)}
			<img class="st-img" class:on={i === active} {src} alt="" decoding="async" />
		{/each}
	{:else if !ready}
		<span class="st-wait"></span>
	{:else}
		<svg class="st-ph" viewBox="0 0 48 48">
			<g fill="none" stroke="currentColor" stroke-width="1.2">
				<path d="M24 8l14 8v16l-14 8-14-8V16z" />
				<path d="M24 8v16m0 16V24m0 0l14-8M24 24L10 16" opacity="0.55" />
			</g>
		</svg>
	{/if}
</span>

<style>
	.series-thumb {
		position: relative;
		flex: none;
		width: 132px;
		height: 99px;
		display: grid;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--line, #16242c);
		border-radius: 8px;
		/* The same deep pool-of-light stage as the previews, in miniature. */
		background:
			radial-gradient(120% 100% at 50% 0%, rgba(59, 110, 143, 0.16), transparent 65%),
			linear-gradient(180deg, #0c141a, var(--void, #04070a) 90%);
	}
	.st-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		opacity: 0;
		transition: opacity 0.9s ease-in-out;
	}
	.st-img.on {
		opacity: 1;
	}
	.st-wait {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			100deg,
			transparent 30%,
			rgba(136, 221, 255, 0.08) 50%,
			transparent 70%
		);
		background-size: 220% 100%;
		animation: st-sheen 1.6s linear infinite;
	}
	@keyframes st-sheen {
		from {
			background-position: 180% 0;
		}
		to {
			background-position: -80% 0;
		}
	}
	.st-ph {
		width: 44px;
		height: 44px;
		color: var(--dim, #5f8a78);
		opacity: 0.7;
	}
	@media (prefers-reduced-motion: reduce) {
		/* No rotation and no cross-fade: the first thumbnail sits static. */
		.st-img {
			transition: none;
		}
		.st-wait {
			animation: none;
		}
	}
</style>
