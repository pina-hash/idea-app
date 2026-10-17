<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { env as publicEnv } from '$env/dynamic/public';
	import HtmlThumbnailFrame from '$lib/classroom/html-assignment/HtmlThumbnailFrame.svelte';
	import {
		KIND_GLYPHS,
		focalObjectPosition,
		thumbnailPlan,
		type ItemThumbnail,
		type ThumbGlyph,
		type ThumbPlan,
		type ThumbPlanOptions
	} from '$lib/classroom/thumbnail';

	/**
	 * ONE POST'S THUMBNAIL SLOT (ledger 0396, report a6a037f3). The class page's
	 * rows, the home page's class cards and the thumbnail editor's preview all
	 * draw a post through this, so a post looks the same wherever it is listed.
	 *
	 * THREE LAYERS, back to front, and the back one is always there:
	 *
	 *   the GENERATED IDENTITY  the post's type glyph on a plate tile tinted by
	 *                           its unit. It is the slot's own background, so a
	 *                           picture still loading, a picture that failed, a
	 *                           live thumbnail not yet ready (or refused, as a
	 *                           draft's is), and a post with nothing set all show
	 *                           it, and a slot is never empty or a broken image.
	 *   the MEDIA               a picture (`object-fit: cover` around the post's
	 *                           focal point, so one picture serves every shape)
	 *                           or a live HTML thumbnail (`HtmlThumbnailFrame`).
	 *                           Somebody else's design, so it sits below the
	 *                           plate's scope (`.pt-media` in plate.css).
	 *   the LINK                a real link to the post over everything, except
	 *                           on an interactive HTML thumbnail that is showing,
	 *                           which keeps its own clicks (until it is ready,
	 *                           and if it fails, the link is the way in), and
	 *                           where the slot is drawn inside
	 *                           somebody else's link (`passive`, `href` null: the
	 *                           class row's tile, a home feed or to-do row). It
	 *                           repeats the row's own link, so it is out of the
	 *                           tab order and hidden from assistive tech: the
	 *                           row's title is the one way in by keyboard and by
	 *                           name.
	 *
	 * THE SLOT'S SIZE IS CSS: `data-shape` sets `--thumb-w`, `--thumb-h`,
	 * `--thumb-ratio` and `--thumb-shape` below, and a container may set
	 * `--thumb-tile` or `--thumb-banner-h` to fit its own row. A new shape is a
	 * rule here and an entry in `THUMB_SHAPES`; nothing stored changes.
	 */
	let {
		item,
		shape,
		glyph,
		tint = null,
		href = null,
		label,
		imageSrc = null,
		muted = false,
		passive = false,
		now = null,
		onlivefail = null
	}: {
		/** The post: its id and its thumbnail row (undefined or null draws the generated identity). */
		item: { id: string; thumbnail?: ItemThumbnail | null; published?: boolean; publish_at?: string | null };
		shape: 'tile' | 'wide' | 'banner' | string;
		glyph: ThumbGlyph;
		/** The unit's tint, 0 to 7, or null for a post in no unit. */
		tint?: number | null;
		/** Where a click goes. Null draws no link (the editor's preview). */
		href?: string | null;
		/** The post's title, for the live thumbnail frame's own title. */
		label: string;
		/** A harness's own picture, standing in for the image route. */
		imageSrc?: ThumbPlanOptions['imageSrc'];
		/** A check-in nobody has been asked for yet: drawn in the quiet ink. */
		muted?: boolean;
		/**
		 * Drawn inside somebody else's link (a home feed row): an interactive
		 * HTML thumbnail is mounted as a plain one, so the click is the row's.
		 */
		passive?: boolean;
		/** The loader's clock (ISO), so a post scheduled ahead asks for no live thumbnail. */
		now?: string | null;
		/**
		 * A live thumbnail that loaded and never said it was ready (its route
		 * answered a 404, or the document's script never ran): the slot shows the
		 * generated look, and the thumbnail editor says why in words.
		 */
		onlivefail?: (() => void) | null;
	} = $props();

	const plan: ThumbPlan = $derived(
		thumbnailPlan(item, { sandboxOrigin: publicEnv.PUBLIC_HX_SANDBOX_ORIGIN ?? '', imageSrc, now })
	);

	/* Whether the media layer has painted, which is when the glyph steps back. A
	   picture that fails falls back to the generated identity for this mount,
	   keyed on its address so a NEW picture is tried again. */
	let loadedFor = $state<string | null>(null);
	let failedFor = $state<string | null>(null);
	let liveReady = $state(false);
	const mediaKey = $derived(plan.kind === 'image' || plan.kind === 'html' ? plan.src : null);
	const imageShown = $derived(plan.kind === 'image' && failedFor !== plan.src);
	const showingMedia = $derived(
		(plan.kind === 'image' && loadedFor === plan.src && failedFor !== plan.src) || (plan.kind === 'html' && liveReady)
	);
	const ownClicks = $derived(plan.kind === 'html' && plan.interactive && !passive);

	let frameRef = $state<HtmlThumbnailFrame | null>(null);

	/*
	 * THE POINTER, FORWARDED AT MOST ONCE A FRAME. A pointer over a slot fires
	 * a move per input event, and a page scrolling under a still pointer fires
	 * them too; each one read the slot's rect (a layout pass) and posted a
	 * message. So moves are coalesced to the latest one and sent on the next
	 * frame, or after 50ms where frames are not ticking (a background tab), and
	 * a leave is sent at once so the thumbnail never stays "hovered".
	 */
	let pendingMove: { el: HTMLElement; x: number; y: number } | null = null;
	let moveTimer: ReturnType<typeof setTimeout> | null = null;
	let moveFrame: number | null = null;

	function flushMove(): void {
		if (moveTimer) clearTimeout(moveTimer);
		if (moveFrame !== null) cancelAnimationFrame(moveFrame);
		moveTimer = null;
		moveFrame = null;
		const move = pendingMove;
		pendingMove = null;
		if (!move || plan.kind !== 'html' || !frameRef) return;
		const r = move.el.getBoundingClientRect();
		frameRef.pointer(r.width ? (move.x - r.left) / r.width : 0.5, r.height ? (move.y - r.top) / r.height : 0.5, true);
	}

	function forward(e: PointerEvent, inside: boolean): void {
		// An interactive thumbnail hears the pointer itself, inside its frame.
		if (plan.kind !== 'html' || !frameRef || ownClicks) return;
		if (!inside) {
			pendingMove = null;
			if (moveTimer) clearTimeout(moveTimer);
			if (moveFrame !== null) cancelAnimationFrame(moveFrame);
			moveTimer = null;
			moveFrame = null;
			const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
			frameRef.pointer(r.width ? (e.clientX - r.left) / r.width : 0.5, r.height ? (e.clientY - r.top) / r.height : 0.5, false);
			return;
		}
		const first = pendingMove === null;
		pendingMove = { el: e.currentTarget as HTMLElement, x: e.clientX, y: e.clientY };
		if (!first) return;
		moveFrame = requestAnimationFrame(flushMove);
		moveTimer = setTimeout(flushMove, 50);
	}

	onDestroy(() => {
		if (moveTimer) clearTimeout(moveTimer);
		if (moveFrame !== null) cancelAnimationFrame(moveFrame);
	});
</script>

<!-- The pointer is forwarded from the slot itself, so a non-interactive live
     thumbnail answers hover whether a link of its own sits over it or the slot
     is drawn inside somebody else's link (the class row's tile, a home feed
     row). The handlers only post the position; they take no click. -->
<div
	class="pt"
	class:muted
	class:showing={showingMedia}
	data-shape={shape}
	data-tint={tint ?? 'none'}
	data-source={plan.kind}
	data-glyph={glyph}
	data-testid="post-thumb"
	data-ready={showingMedia ? 'true' : 'false'}
	role="presentation"
	onpointermove={(e) => forward(e, true)}
	onpointerenter={(e) => forward(e, true)}
	onpointerleave={(e) => forward(e, false)}
>
	<span class="pt-gen" aria-hidden="true">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
			{#each KIND_GLYPHS[glyph] as d (d)}<path {d} />{/each}
		</svg>
	</span>
	{#if mediaKey}
		<span class="pt-media">
			{#if plan.kind === 'image' && imageShown}
				<!-- `alt=""`: the row's title names the post, and the picture is
				     decoration on its link (the home feed's cover makes the same
				     call). The same proxy an attachment's thumbnail loads from. -->
				<img
					src={plan.src}
					alt=""
					loading="lazy"
					decoding="async"
					style:object-position={focalObjectPosition(plan.focalX, plan.focalY, plan.width, plan.height)}
					onload={() => (loadedFor = plan.kind === 'image' ? plan.src : null)}
					onerror={() => (failedFor = plan.kind === 'image' ? plan.src : null)}
				/>
			{:else if plan.kind === 'html'}
				<HtmlThumbnailFrame
					bind:this={frameRef}
					src={plan.src}
					interactive={ownClicks}
					title={label}
					{shape}
					onready={(yes) => (liveReady = yes)}
					onfail={onlivefail}
					onopen={href ? () => goto(href) : null}
				/>
			{/if}
		</span>
	{/if}
	<!-- An interactive thumbnail takes its own clicks only once it is showing:
	     until it says it is ready, and after it failed, the slot is the
	     generated look and the link over it is the way in. -->
	{#if href && !(ownClicks && liveReady)}
		<a
			class="pt-link"
			{href}
			tabindex="-1"
			aria-hidden="true"
			data-testid="post-thumb-link"
		></a>
	{/if}
</div>

<style>
	/*
	 * THE SHAPES. Every size is a custom property, and a renderer reads only
	 * these: the live thumbnail is told its shape from `--thumb-shape` itself.
	 */
	.pt {
		position: relative;
		display: block;
		flex: none;
		width: var(--thumb-w);
		height: var(--thumb-h);
		aspect-ratio: var(--thumb-ratio, auto);
		/* A size container, so the glyph scales with whatever box a shape gives. */
		container-type: size;
		overflow: hidden;
		border-radius: var(--thumb-r, 9px);
		/* The edge is an OUTLINE drawn inside the box, never a border: an outline
		   paints over the picture, so the edge holds on any photo, and the link
		   over the slot then fills the whole box (a 44px tile is a 44px target,
		   where a border left the link 42px inside it). */
		outline: 1px solid var(--pt-edge);
		outline-offset: -1px;
		background:
			linear-gradient(var(--pt-dir, 180deg), var(--pt-wash-a), var(--pt-wash-b)),
			linear-gradient(180deg, var(--pt-face-top), var(--pt-face-bot));
		color: var(--pt-ink);
		box-sizing: border-box;
	}
	.pt[data-shape='tile'] {
		/* A row may set `--thumb-tile` and `--thumb-tile-r` (ClassView sets the
		   first on a phone, the home feed both, to its 34px mark box). */
		--thumb-w: var(--thumb-tile, 3rem);
		--thumb-h: var(--thumb-tile, 3rem);
		--thumb-ratio: auto;
		--thumb-shape: tile;
		--thumb-r: var(--thumb-tile-r, 9px);
	}
	.pt[data-shape='wide'] {
		--thumb-w: 100%;
		--thumb-h: auto;
		--thumb-ratio: 16 / 9;
		--thumb-shape: wide;
		--thumb-r: 10px;
	}
	.pt[data-shape='banner'] {
		--thumb-w: 100%;
		--thumb-h: var(--thumb-banner-h, 3.5rem);
		--thumb-ratio: auto;
		--thumb-shape: banner;
		--thumb-r: 8px;
		--pt-dir: 90deg;
	}

	/*
	 * THE GENERATED IDENTITY: a plate face, a wash of the unit's tint, and the
	 * glyph in the tint's ink. The tints are identity colors, eight of them,
	 * per theme; each ink clears 3:1 on its own washed face (a glyph is a
	 * graphical object), measured in the browser pass and recorded in the
	 * history entry.
	 */
	.pt {
		--pt-face-top: var(--plate-face-top, var(--surface-2, #2f3431));
		--pt-face-bot: var(--plate-face-bot, var(--surface-1, #252a27));
		--pt-tint: var(--text-2);
		--pt-wash-a: color-mix(in srgb, var(--pt-tint) 20%, transparent);
		--pt-wash-b: color-mix(in srgb, var(--pt-tint) 7%, transparent);
		--pt-edge: color-mix(in srgb, var(--pt-tint) 32%, var(--plate-hair, var(--hairline, #3a413c)));
		--pt-ink: var(--pt-tint);
		--thumb-tint-0: #8fe08a;
		--thumb-tint-1: #e8b765;
		--thumb-tint-2: #7cc8f0;
		--thumb-tint-3: #b9a8f2;
		--thumb-tint-4: #f2a3bb;
		--thumb-tint-5: #d8cb8f;
		--thumb-tint-6: #62d8c2;
		--thumb-tint-7: #f6a67e;
	}
	:global(:root[data-theme='space-white']) .pt {
		--thumb-tint-0: #2b7a30;
		--thumb-tint-1: #855508;
		--thumb-tint-2: #1b6a93;
		--thumb-tint-3: #5a43ad;
		--thumb-tint-4: #9e3760;
		--thumb-tint-5: #675d14;
		--thumb-tint-6: #0c6f61;
		--thumb-tint-7: #9b441a;
		--pt-wash-a: color-mix(in srgb, var(--pt-tint) 16%, transparent);
		--pt-wash-b: color-mix(in srgb, var(--pt-tint) 5%, transparent);
		/* The plate's key face is a mid grey here (#b8bdc5 to #cdd2d9), which
		   held every tint's glyph under 3:1 (2.42 at worst, measured); the tile
		   takes a light face instead, a step off the card it sits on. */
		--pt-face-top: #f4f6f9;
		--pt-face-bot: #e3e7ed;
	}
	.pt[data-tint='0'] { --pt-tint: var(--thumb-tint-0); }
	.pt[data-tint='1'] { --pt-tint: var(--thumb-tint-1); }
	.pt[data-tint='2'] { --pt-tint: var(--thumb-tint-2); }
	.pt[data-tint='3'] { --pt-tint: var(--thumb-tint-3); }
	.pt[data-tint='4'] { --pt-tint: var(--thumb-tint-4); }
	.pt[data-tint='5'] { --pt-tint: var(--thumb-tint-5); }
	.pt[data-tint='6'] { --pt-tint: var(--thumb-tint-6); }
	.pt[data-tint='7'] { --pt-tint: var(--thumb-tint-7); }
	/* A notebook check-in in no unit wears the cyan its row's glyph always has. */
	.pt[data-glyph='checkin'][data-tint='none']:not(.muted) {
		--pt-tint: var(--cyan);
	}
	.pt.muted {
		--pt-tint: var(--text-2);
		--pt-wash-a: transparent;
		--pt-wash-b: transparent;
	}

	.pt-gen {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.pt[data-shape='banner'] .pt-gen {
		justify-items: start;
		padding-inline: 0.9rem;
	}
	.pt-gen svg {
		width: clamp(0.9rem, 50cqmin, 3rem);
		height: clamp(0.9rem, 50cqmin, 3rem);
	}
	.pt.showing .pt-gen {
		visibility: hidden;
	}

	.pt-media {
		position: absolute;
		inset: 0;
		display: block;
	}
	.pt-media img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.pt-link {
		position: absolute;
		inset: 0;
		z-index: 1;
		border-radius: inherit;
	}
</style>
