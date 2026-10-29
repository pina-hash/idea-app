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
	 * while a mouse rests on it, while keyboard focus is inside it, while the
	 * viewer is open, in a hidden tab and for a few seconds after somebody
	 * scrolls or touches the thumbnail strip; and under
	 * `prefers-reduced-motion: reduce` it starts paused. It advances by
	 * `setTimeout`, never an animation frame, so a throttled window cannot wedge
	 * it. The cross-fade is the only motion and it lives inside `no-preference`.
	 *
	 * THE PLAY KEY NEVER HOLDS IT, AND THAT IS WHAT KEEPS ITS WORD TRUE (polish
	 * round 1). Pressing Play leaves focus, and a mouse, on the key itself; while
	 * either counted as a hold, a slideshow somebody had just asked to play
	 * stood still under a key reading "Pause" until they clicked somewhere else.
	 * So a mouse over the key and focus on the key hold nothing, and pressing
	 * Play also ends a strip-browsing hold: whenever the key is the thing being
	 * looked at or heard, "Pause" means it is moving. Focus that a mouse click
	 * left on another control holds nothing either (only keyboard focus does,
	 * the carousel pattern's rule), because the mouse is already covered by the
	 * hover hold and a clicked Next would otherwise hold the slideshow until the
	 * next click anywhere. The key's two words share one box, so it keeps one
	 * size and one place when its word changes (at 375 "Pause" wrapped to a
	 * line of its own and "Play" did not, so a tap moved it, and the strip,
	 * by a line).
	 *
	 * SIFTING: Previous and Next keys (44px), the arrow keys while focus is in the
	 * region, and a strip of thumbnails, each a button. Every move wraps both
	 * ways (`slideIndex`), the timer's included, and the strip scrolls ITSELF so
	 * the selected thumbnail sits in its middle where it can (report 169b931d).
	 * The picture itself opens the shared Lightbox on the whole set, which
	 * keeps its own clamp-at-the-ends rule (`lightboxStep`).
	 *
	 * A PICTURE THAT WILL NOT DECODE LEAVES THE SET rather than showing a broken
	 * box (the classroom's thumbnail rule), and the count says how many remain.
	 */
	import { onMount, untrack } from 'svelte';
	import Lightbox from '$lib/media/Lightbox.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';
	import { slideIndex, stripScrollLeft, type StudentGalleryItem } from './student-overview';

	let {
		items,
		name,
		day,
		notebook = true,
		intervalMs = 5000
	}: {
		items: StudentGalleryItem[];
		/** The student's shown name, for the region's accessible name. */
		name: string;
		/**
		 * Whether notebook photos belong in this set. False while the teacher
		 * hides the Notebook section: the caller leaves them out of `items`, and
		 * the empty sentence then names only what can still appear.
		 */
		notebook?: boolean;
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
	let playKey = $state<HTMLButtonElement | null>(null);

	/** The play key, or something inside it (its words). */
	function onPlayKey(target: EventTarget | null): boolean {
		return !!playKey && target instanceof Node && playKey.contains(target);
	}

	/**
	 * Whether focus arriving on `target` holds the slideshow: keyboard focus on
	 * anything but the play key. A browser that cannot answer `:focus-visible`
	 * is taken to mean keyboard focus, so the doubt falls on the side of
	 * holding still.
	 */
	function focusHolds(target: EventTarget | null): boolean {
		if (!(target instanceof Element) || onPlayKey(target)) return false;
		try {
			return target.matches(':focus-visible');
		} catch {
			return true;
		}
	}

	/*
	 * SOMEBODY BROWSING THE STRIP HOLDS THE TIMER. A finger swiping the strip
	 * on a tablet is not a hover, so without this the timer moved on mid-swipe
	 * and the strip, following it, snapped away from what they were looking at.
	 * A wheel, a touch or a press on the strip holds it for `BROWSE_HOLD_MS`
	 * after the last one; the strip's own programmatic scroll is none of those.
	 */
	const BROWSE_HOLD_MS = 6000;
	let browsing = $state(false);
	let browseTimer: ReturnType<typeof setTimeout> | null = null;
	function browse() {
		browsing = true;
		if (browseTimer) clearTimeout(browseTimer);
		browseTimer = setTimeout(() => {
			browsing = false;
			browseTimer = null;
		}, BROWSE_HOLD_MS);
	}
	function endBrowse() {
		browsing = false;
		if (browseTimer) clearTimeout(browseTimer);
		browseTimer = null;
	}

	/** The play key: Pause stops it; Play starts it at once, whatever was holding it a moment ago. */
	function togglePlay() {
		playing = !playing;
		if (playing) endBrowse();
	}

	const moving = $derived(
		playing && !hovering && !focused && !hidden && !browsing && viewer === null && shown.length > 1
	);

	/** Set once on mount: under `reduce` the strip jumps instead of gliding. */
	let reduceMotion = false;

	/** Every way of moving (Previous, Next, the arrow keys, a thumbnail, the timer) is this one step, and it wraps both ways. */
	function go(next: number) {
		if (!shown.length) return;
		index = slideIndex(next, shown.length);
	}

	/**
	 * THE STRIP FOLLOWS THE SELECTED PICTURE AND NOTHING ELSE MOVES (report
	 * 169b931d). The strip's own `scrollLeft` is set from `stripScrollLeft`,
	 * with the thumbnail measured against the strip's bounding box, never its
	 * offset parent (which is the page, and is what sent the first picture to
	 * the far right). `scrollTo` on the strip scrolls the strip alone, so the
	 * page's own position never moves; there is no `scrollIntoView` here,
	 * which would scroll every scrollable ancestor up to the window.
	 */
	function centerStrip(at: number, smooth: boolean) {
		const strip = stripEl;
		const thumb = strip?.querySelectorAll<HTMLElement>('.sws-thumb')[at];
		if (!strip || !thumb) return;
		const box = strip.getBoundingClientRect();
		const t = thumb.getBoundingClientRect();
		const left = stripScrollLeft({
			thumbStart: t.left - box.left - strip.clientLeft + strip.scrollLeft,
			thumbWidth: t.width,
			viewWidth: strip.clientWidth,
			contentWidth: strip.scrollWidth
		});
		if (Math.abs(strip.scrollLeft - left) < 1) return;
		strip.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
	}

	/*
	 * Whatever moved the picture -- a key, a thumbnail, the timer, the Lightbox
	 * closing on another picture, a broken picture leaving the set -- the strip
	 * follows, because it follows `index` rather than one handler.
	 */
	$effect(() => {
		const at = index;
		const count = shown.length;
		if (!stripEl || count < 2) return;
		untrack(() => centerStrip(at, !reduceMotion));
	});

	/* A strip that changes width (a window resized, the page's columns
	   reflowing) puts the selected picture back in its middle, at once. */
	$effect(() => {
		const strip = stripEl;
		if (!strip || typeof ResizeObserver === 'undefined') return;
		const watch = new ResizeObserver(() => centerStrip(index, false));
		watch.observe(strip);
		return () => watch.disconnect();
	});

	$effect(() => {
		if (!moving) return;
		const at = index;
		const timer = setTimeout(() => go(at + 1), intervalMs);
		return () => clearTimeout(timer);
	});

	onMount(() => {
		try {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				playing = false;
				reduceMotion = true;
			}
		} catch {
			/* no matchMedia: keep the default */
		}
		const onVis = () => (hidden = document.visibilityState === 'hidden');
		onVis();
		document.addEventListener('visibilitychange', onVis);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			if (browseTimer) clearTimeout(browseTimer);
		};
	});

	function onKey(e: KeyboardEvent) {
		// A key pressed anywhere in here but on the play key is keyboard use,
		// which holds the slideshow even where the focus came from a click.
		if (!onPlayKey(e.target)) focused = true;
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
		// Stay on the same picture where it survived; otherwise the next one
		// slides in, and after the last that is the first (the wrap rule).
		const remaining = items.filter((x) => !broken[x.key]);
		const kept = at && at !== key ? remaining.findIndex((x) => x.key === at) : -1;
		index = kept >= 0 ? kept : slideIndex(index, remaining.length);
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
	onpointerover={(e) => {
		// A mouse or a pen resting here holds it, never a finger (a tap leaves
		// no pointer behind to say it has gone) and never over the play key.
		if (e.pointerType !== 'touch') hovering = !onPlayKey(e.target);
	}}
	onpointerleave={() => (hovering = false)}
	onfocusin={(e) => (focused = focusHolds(e.target))}
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
				<!-- ONE KEY WHOSE WORD IS WHAT IT WILL DO (polish round C): Pause while
				     the slideshow plays, Play while it is paused, and no pressed state.
				     It carried `aria-pressed` set while PAUSED, so a paused slideshow
				     drew a lit "Play" key and a screen reader heard "Play, pressed"
				     with nothing playing. Both words sit in one grid cell, the one not
				     in force hidden, so the key is always as wide as the wider. -->
				<button
					type="button"
					class="btn secondary tiny sws-key"
					aria-label={playing ? 'Pause the slideshow' : 'Play the slideshow'}
					onclick={togglePlay}
					bind:this={playKey}
					data-testid="so-slide-play"
					data-playing={playing ? 'true' : 'false'}
				>
					<span class="sws-play-words">
						<span class="sws-play-word" data-testid="so-slide-play-word">{playing ? 'Pause' : 'Play'}</span>
						<span class="sws-play-spare" aria-hidden="true">{playing ? 'Play' : 'Pause'}</span>
					</span>
				</button>
			{/if}
		</div>
		{#if shown.length > 1}
			<div
				class="sws-strip"
				bind:this={stripEl}
				role="group"
				aria-label="All {shown.length} pictures"
				onwheel={browse}
				ontouchstart={browse}
				onpointerdown={browse}
				data-browsing={browsing ? 'true' : undefined}
			>
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
			<p class="sws-empty-sub">
				{notebook
					? 'Photos they hand in on an assignment, and photos in the notebook entries they turn in, appear here.'
					: 'Photos they hand in on an assignment appear here.'}
			</p>
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
		/* In a caller's flex column (the student page's gallery) it takes the
		   column's height, which only the empty state below uses. */
		flex: 1 1 auto;
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
		/* A caller laying the slideshow across a wide card caps its height here
		   (the student page's stacked top), so a full-width 16:9 stage does not
		   run 650px tall. Unset is the shape as it was. */
		max-height: var(--sws-stage-max, none);
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
		font-size: var(--fs-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #b9d7b4;
	}
	.sws-title {
		font-size: var(--fs-base);
		font-weight: 600;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.sws-when {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
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
	.sws-play-words {
		display: inline-grid;
	}
	.sws-play-words > span {
		grid-area: 1 / 1;
		text-align: center;
	}
	.sws-play-spare {
		visibility: hidden;
	}
	.sws-count {
		font-family: var(--font-mono);
		font-size: var(--fs-caption);
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
		flex: 1 1 auto;
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
		font-size: var(--fs-base);
	}
	.sws-empty .sws-empty-sub {
		font-size: var(--fs-caption);
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
