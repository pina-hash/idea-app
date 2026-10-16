<script lang="ts">
	/**
	 * THEIR WORK, AS A SLIDESHOW BESIDE THEIR NAME (ledger 0392, Mr. Pina
	 * 2026-10-16: "a little automatic slideshow with their uploaded work ...
	 * that automatically rolls around, but that I can also sift through myself.
	 * Their personal student gallery").
	 *
	 * Props only. The pictures are the gallery `studentGallery` built on the
	 * server, served by the proxies a thumbnail already uses, so this adds no
	 * read path and no disclosure.
	 *
	 * IT MOVES ON ITS OWN AND STOPS FOR ANYBODY WHO ASKS (WCAG 2.2.2, the class
	 * banner's rule): a worded Pause key is always on screen; it holds still
	 * while a pointer rests on it, while focus is inside it, while the viewer is
	 * open and in a hidden tab; and under `prefers-reduced-motion: reduce` it
	 * starts paused. It advances by `setTimeout`, never an animation frame, so a
	 * throttled window cannot wedge it. The cross-fade is the only motion and it
	 * lives inside `no-preference`.
	 *
	 * SIFTING: Previous and Next keys (44px), the arrow keys while focus is in the
	 * region, and a strip of thumbnails, each a button. The picture itself opens
	 * the shared Lightbox on the whole set.
	 *
	 * A PICTURE THAT WILL NOT DECODE LEAVES THE SET rather than showing a broken
	 * box (the classroom's thumbnail rule), and the count says how many remain.
	 */
	import { onMount } from 'svelte';
	import Lightbox from '$lib/media/Lightbox.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';
	import type { StudentGalleryItem } from './student-overview';

	let {
		items,
		name,
		day,
		intervalMs = 5000
	}: {
		items: StudentGalleryItem[];
		/** The student's shown name, for the region's accessible name. */
		name: string;
		/** The page's own day label for an instant. */
		day: (iso: string | null) => string;
		intervalMs?: number;
	} = $props();

	let broken = $state<Record<string, true>>({});
	const shown = $derived(items.filter((i) => !broken[i.key]));
	let index = $state(0);
	const current = $derived(shown.length ? shown[Math.min(index, shown.length - 1)] : null);
	let playing = $state(true);
	let hovering = $state(false);
	let focused = $state(false);
	let hidden = $state(false);
	let viewer = $state<number | null>(null);
	let stripEl = $state<HTMLElement | null>(null);

	const moving = $derived(playing && !hovering && !focused && !hidden && viewer === null && shown.length > 1);

	function go(next: number) {
		if (!shown.length) return;
		index = ((next % shown.length) + shown.length) % shown.length;
		// Keep the chosen thumbnail in the strip's own view, never the page's.
		const thumb = stripEl?.querySelectorAll<HTMLElement>('.sws-thumb')[index];
		if (thumb && stripEl) {
			const left = thumb.offsetLeft - stripEl.clientWidth / 2 + thumb.clientWidth / 2;
			stripEl.scrollTo({ left: Math.max(0, left), behavior: 'instant' as ScrollBehavior });
		}
	}

	$effect(() => {
		if (!moving) return;
		const at = index;
		const timer = setTimeout(() => go(at + 1), intervalMs);
		return () => clearTimeout(timer);
	});

	onMount(() => {
		try {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) playing = false;
		} catch {
			/* no matchMedia: keep the default */
		}
		const onVis = () => (hidden = document.visibilityState === 'hidden');
		onVis();
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			go(index + 1);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			go(index - 1);
		}
	}

	function dropBroken(key: string) {
		const at = current?.key;
		broken = { ...broken, [key]: true };
		// Stay on the same picture where it survived; otherwise the next one slides in.
		if (at && at !== key) {
			const i = items.filter((x) => !broken[x.key]).findIndex((x) => x.key === at);
			if (i >= 0) index = i;
		}
	}

	const lightboxImages = $derived<LightboxImage[]>(
		shown.map((i) => ({
			key: i.key,
			src: i.src,
			alt: `${name}'s work: ${i.caption}${i.at ? `, ${day(i.at)}` : ''}`,
			caption: `${i.caption}${i.at ? ` (${day(i.at)})` : ''}`,
			downloadHref: i.src
		}))
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	class="sws"
	aria-roledescription="carousel"
	aria-label="{name}'s work"
	data-testid="so-slideshow"
	data-moving={moving ? 'true' : 'false'}
	onmouseenter={() => (hovering = true)}
	onmouseleave={() => (hovering = false)}
	onfocusin={() => (focused = true)}
	onfocusout={(e) => {
		const next = e.relatedTarget as Node | null;
		if (!next || !(e.currentTarget as HTMLElement).contains(next)) focused = false;
	}}
	onkeydown={onKey}
>
	{#if current}
		<div class="sws-stage">
			{#key current.key}
				<button
					type="button"
					class="sws-slide"
					aria-roledescription="slide"
					aria-label="{current.caption}, picture {index + 1} of {shown.length}. Open it larger."
					onclick={() => (viewer = index)}
					data-testid="so-slide"
				>
					<img
						src={current.src}
						alt="{name}'s work: {current.caption}"
						loading="eager"
						decoding="async"
						onerror={() => dropBroken(current.key)}
					/>
				</button>
			{/key}
			<div class="sws-caption" aria-live={moving ? 'off' : 'polite'}>
				<span class="sws-source">{current.source === 'notebook' ? 'Notebook' : 'Assignment'}</span>
				<span class="sws-title">{current.caption}</span>
				{#if current.at}<span class="sws-when">{day(current.at)}</span>{/if}
			</div>
		</div>
		<div class="sws-controls">
			<button type="button" class="btn secondary tiny sws-key" onclick={() => go(index - 1)} disabled={shown.length < 2} data-testid="so-slide-prev">
				<span aria-hidden="true">&lsaquo;</span> Previous
			</button>
			<span class="sws-count" data-testid="so-slide-count">{index + 1} of {shown.length}</span>
			<button type="button" class="btn secondary tiny sws-key" onclick={() => go(index + 1)} disabled={shown.length < 2} data-testid="so-slide-next">
				Next <span aria-hidden="true">&rsaquo;</span>
			</button>
			{#if shown.length > 1}
				<button
					type="button"
					class="btn secondary tiny sws-key"
					aria-pressed={!playing}
					onclick={() => (playing = !playing)}
					data-testid="so-slide-play"
				>
					{playing ? 'Pause' : 'Play'}
				</button>
			{/if}
		</div>
		{#if shown.length > 1}
			<div class="sws-strip" bind:this={stripEl} role="group" aria-label="All {shown.length} pictures">
				{#each shown as it, i (it.key)}
					<button
						type="button"
						class="sws-thumb"
						class:on={i === index}
						aria-current={i === index ? 'true' : undefined}
						aria-label="Show picture {i + 1}: {it.caption}"
						onclick={() => go(i)}
					>
						<img src={it.thumb} alt="" loading="lazy" decoding="async" onerror={() => dropBroken(it.key)} />
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="sws-empty" data-testid="so-slideshow-empty">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 15l4.5-4.5 4 4 3-3L20 15M15.5 8.5h.01" /></svg>
			<p>No pictures of {name}'s work yet.</p>
			<p class="sws-empty-sub">Photos they hand in on an assignment, and photos in the notebook entries they turn in, appear here.</p>
		</div>
	{/if}
</section>

{#if shown.length}
	<!-- PRINT: a still row of up to six pictures, never the carousel. -->
	<div class="sws-print" aria-hidden="true">
		{#each shown.slice(0, 6) as it (it.key)}
			<figure>
				<img src={it.thumb} alt="" />
				<figcaption>{it.caption}</figcaption>
			</figure>
		{/each}
	</div>
	<Lightbox
		images={lightboxImages}
		index={viewer}
		label="{name}'s work"
		onIndex={(i) => (viewer = i)}
		onClose={() => {
			if (viewer !== null) go(viewer);
			viewer = null;
		}}
		testId="so-lightbox"
	/>
{/if}

<style>
	.sws {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}
	/* The picture on top and its words on a band BELOW it, never laid over it:
	   a handwritten page's last lines are at its foot, which is exactly where
	   an overlaid caption sat. */
	.sws-stage {
		position: relative;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card, 10px);
		overflow: hidden;
		/* A photograph reads best on near-black, in every theme (the Lightbox's rule). */
		background: #0b0f0c;
	}
	.sws-slide {
		all: unset;
		position: relative;
		display: block;
		aspect-ratio: 16 / 9;
		min-height: 11rem;
		cursor: zoom-in;
	}
	.sws-slide:focus-visible {
		outline: 3px solid var(--green);
		outline-offset: -3px;
	}
	.sws-slide img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
	@media (prefers-reduced-motion: no-preference) {
		.sws-slide img {
			animation: sws-in 0.6s ease-out;
		}
		@keyframes sws-in {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}
	}
	.sws-caption {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.6rem;
		padding: 0.55rem 0.8rem;
		background: #060907;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		color: #f2f4ef;
	}
	.sws-source {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #b9d7b4;
	}
	.sws-title {
		font-size: 1rem;
		font-weight: 600;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.sws-when {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: #d4dbd1;
	}
	.sws-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.sws-key {
		min-height: 44px;
	}
	.sws-count {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2);
		min-width: 4.5rem;
		text-align: center;
	}
	.sws-strip {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding: 0.2rem 0.1rem 0.4rem;
		scrollbar-width: thin;
	}
	.sws-thumb {
		all: unset;
		flex: none;
		width: 4.4rem;
		height: 3.3rem;
		border-radius: 6px;
		overflow: hidden;
		border: 2px solid transparent;
		background: #0b0f0c;
		cursor: pointer;
		opacity: 0.72;
	}
	.sws-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.sws-thumb:hover,
	.sws-thumb:focus-visible {
		opacity: 1;
		border-color: var(--hover-ink, var(--green));
	}
	.sws-thumb.on {
		opacity: 1;
		border-color: var(--green);
	}
	.sws-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		min-height: 12rem;
		padding: 1rem;
		text-align: center;
		border: 1px dashed var(--hairline);
		border-radius: var(--radius-card, 10px);
		color: var(--text-1);
	}
	.sws-empty svg {
		width: 2.4rem;
		height: 2.4rem;
		fill: none;
		stroke: var(--text-2);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.sws-empty p {
		margin: 0;
		font-size: 1rem;
	}
	.sws-empty .sws-empty-sub {
		font-size: 0.85rem;
		color: var(--text-2);
		max-width: 26rem;
	}
	.sws-print {
		display: none;
	}
	@media print {
		.sws {
			display: none !important;
		}
		.sws-print {
			display: grid;
			grid-template-columns: repeat(6, minmax(0, 1fr));
			gap: 0.08in;
		}
		.sws-print figure {
			margin: 0;
			break-inside: avoid;
		}
		.sws-print img {
			width: 100%;
			height: 0.8in;
			object-fit: cover;
			display: block;
			border: 1px solid #bbb;
		}
		.sws-print figcaption {
			font-size: 9pt;
			line-height: 1.2;
			color: #000;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
	}
</style>
