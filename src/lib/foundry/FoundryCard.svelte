<script lang="ts">
	/**
	 * ONE FOUNDRY CARD: a student's thumbnail, at the shape they uploaded.
	 *
	 * IT IS A COMPONENT RATHER THAN A BLOCK INSIDE THE GALLERY BECAUSE TWO
	 * SURFACES NEED THE IDENTICAL THING. The gallery draws the card; the
	 * student's own page draws a PREVIEW of the card so they can see what the
	 * gallery will show before anybody else does. A preview that is a second
	 * copy of the markup is a preview that stops matching, and the thing it
	 * would stop matching about is the one a student is deciding from.
	 *
	 * ===========================================================================
	 * THE CARD IS THE THUMBNAIL
	 * ===========================================================================
	 *
	 * No frame, no padding, no panel, no body. What used to sit under every
	 * cover -- title, tagline, author, class, plays, on an opaque plate inside a
	 * boundary -- is gone, and every one of those facts is on the detail pane one
	 * tap away. `aspect-ratio` comes from the image's OWN measured size, stamped
	 * on this element by `foundryCoverMeasured` once the picture decodes, because
	 * no cover dimension is stored anywhere in the schema.
	 *
	 * ===========================================================================
	 * FOUR ROUTES TO THE NAME, AND HOVER IS ONLY ONE OF THEM
	 * ===========================================================================
	 *
	 * A hover popup cannot be the whole answer on a surface students open on
	 * phones, so the name is reachable four ways and only the third needs a
	 * pointer:
	 *
	 *   1. A GENERATED cover paints the name as its art, permanently, at every
	 *      width -- the one case where "the name is in the thumbnail" can be
	 *      guaranteed rather than asked of a student.
	 *   2. An UPLOADED cover carries a name plate, PERMANENT on a touch device
	 *      and at phone widths.
	 *   3. On a wide viewport with a pointer, that same plate is the hover
	 *      popup, and keyboard focus opens it too.
	 *   4. `aria-label` on the link, in every configuration, so the accessible
	 *      name never depends on a visual state.
	 */
	import { foundryCoverFailed, foundryCoverMeasured } from './covers.ts';
	import { foundryGeneratedHue } from './mosaic.ts';
	import { foundryAuthorName } from './surface.ts';
	import type { FoundryAuthor } from './transports.ts';

	/**
	 * EXACTLY WHAT THE CARD READS, AND NOT ONE FIELD MORE.
	 *
	 * Typed structurally rather than as `FoundryAppSummary` so that BOTH
	 * callers can hand over what they already hold: the gallery has summaries,
	 * the student's own page has a full `FoundryApp`, and neither is a subtype
	 * of the other (a summary carries `version_count` and a detail row does
	 * not). Asking for the union of both would make the preview impossible;
	 * asking for the intersection is what the card actually needs.
	 */
	export type FoundryCardApp = FoundryAuthor & {
		id: string;
		slug: string;
		title: string;
		cover_path: string | null;
	};

	let {
		app,
		href,
		selected = false,
		coverUrl = (path: string) => path,
		plays = '',
		onselect
	}: {
		app: FoundryCardApp;
		href: string;
		selected?: boolean;
		/** Turns a stored cover path into a URL. Injected, never built here. */
		coverUrl?: (path: string) => string | null;
		/**
		 * The already-worded play count, or the empty string for none. A STRING
		 * and not a number, so the card holds no opinion about when a count is
		 * worth rendering -- the caller decides that, because it is the caller
		 * that knows which ranking is in force.
		 */
		plays?: string;
		/** Absent means the link simply navigates, which is what a preview wants. */
		onselect?: (slug: string) => void;
	} = $props();

	const src = $derived(app.cover_path ? coverUrl(app.cover_path) : null);

	/**
	 * `made` IS "THIS CARD PAINTS A GENERATED COVER", WHICH IS NARROWER THAN
	 * "THERE IS NO SRC". A stored `cover_path` that is not a storage key has no
	 * src either, but it renders `.fg-cover-bad` rather than a generated cover
	 * -- so keying on the src alone gave that card a generated hue it never used
	 * AND withheld the name plate from it, leaving an app whose name appeared
	 * nowhere at any width. Measured on the mosaic harness before the fix:
	 * `bad-key` came back `made Y plate null`.
	 */
	const made = $derived(!src && !app.cover_path);
	const author = $derived(foundryAuthorName(app));
</script>

<!--
	A LINK, not a button with a click handler. It carries a real href so the
	card can be middle-clicked, copied and opened in a tab; `onselect` is what
	keeps the navigation client-side where a caller wants that.

	THE ACCESSIBLE NAME IS ON THE LINK AND NOT ON ANYTHING INSIDE IT. The
	visible plate is revealed on hover on a pointer device, so a reader who
	never hovers would otherwise be reading an unlabelled link to an image with
	an empty alt. `aria-label` makes the name a property of the CONTROL rather
	than of one of its visual states, and it overrides the contents, so the
	plate is never announced twice.
-->
<a
	class="fdy-card"
	class:selected
	class:made
	{href}
	data-app-slug={app.slug}
	data-fdy-card
	data-testid="fdy-card"
	aria-label={author ? `${app.title}, by ${author}` : app.title}
	style={made ? `--fdy-hue: ${foundryGeneratedHue(app.id)}` : undefined}
	onclick={(e) => {
		if (!onselect) return;
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		onselect(app.slug);
	}}
>
	{#if src}
		<!--
			NO `loading="lazy"`, AND THAT IS THE MOSAIC'S DOING rather than an
			oversight. The card's height comes from the image's own measured
			ratio, so an image that loads late changes its card's height late --
			and multicol re-balances the WHOLE container when any card's height
			moves, so one lazy image arriving mid-scroll reflows every card above
			it. Deferring the picture here is deferring the gallery.
		-->
		<img
			class="fdy-card-shot"
			{src}
			alt=""
			decoding="async"
			onload={foundryCoverMeasured}
			onerror={foundryCoverFailed}
		/>
	{:else if app.cover_path}
		<!-- A stored `cover_path` that is not a storage key: judged locally by
		     `foundryCoverObjectKey`, with no request made. -->
		<span class="fdy-card-shot fg-cover-bad" aria-hidden="true"></span>
	{:else}
		<!--
			NO COVER IS AN ORDINARY PUBLISHED STATE -- `foundryPublishBlockers`
			requires a description and never a picture -- so this is a real cover
			generated for the app rather than a "no image" placeholder. The hue is
			the app's own, stable across loads and devices, and can never land in
			the band this room reserves for heat.
		-->
		<span class="fdy-card-shot fdy-card-made" aria-hidden="true">
			<span class="fdy-card-made-name">{app.title}</span>
		</span>
	{/if}

	{#if !made || plays}
		<!--
			THE NAME PLATE. Permanent everywhere EXCEPT a wide viewport on a
			device that can hover, where it is the hover popup instead.

			A GENERATED COVER GETS ONE ONLY WHEN THERE IS A COUNT, AND IT
			CARRIES THE COUNT ALONE. It has no plate otherwise, because it
			already states its name permanently and larger, and a plate would be
			the same name twice. But a COUNT is not a repeat, it is the only
			thing on the card that is not already there -- and without this
			branch a coverless app ranked by plays showed no number at all,
			which is a ranking the reader cannot check. Found by the test in
			`tests/dom/foundry-card-mosaic.test.ts` rather than by looking.
		-->
		<span
			class="fdy-card-name"
			class:count-only={made}
			class:has-count={!!plays}
			data-testid="fdy-card-name"
		>
			{#if !made}
				<span class="fdy-card-name-title">{app.title}</span>
			{/if}
			{#if plays}
				<span class="fdy-card-plays" data-testid="fdy-card-plays">{plays}</span>
			{/if}
		</span>
	{/if}
</a>

<style>
	/* ======================================================================
	   THE CARD IS THE THUMBNAIL

	   No padding, no border, no background panel and no body: what used to
	   sit under every cover -- title, tagline, author, class, plays, on an
	   opaque `--surface-1` plate inside a `--boundary` frame -- is gone, and
	   every one of those facts is on the detail pane one tap away. The card
	   is the student's picture at the shape they uploaded.

	   `--fdy-ar` IS WRITTEN BY THE BROWSER, ON THIS ELEMENT, ONCE ITS IMAGE
	   HAS DECODED (`foundryCoverMeasured`). No cover dimension is stored in
	   the schema and this lane carries no migration, so measuring the
	   decoded image is the only source there is. The `var()` fallback is
	   what a card is before that happens and what a generated cover stays.

	   THE SELECTED AND HOVER RINGS ARE `outline`, NOT `border`. A border
	   would take part in the box and move the picture by a pixel on hover;
	   an outline is drawn outside it and moves nothing. The ring is also why
	   the tile keeps a hair of radius -- that is the picture's own corner,
	   not a frame around it.
	   ====================================================================== */
	.fdy-card {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: var(--fdy-ar, 1.5);
		overflow: hidden;
		border-radius: var(--radius-sm, 6px);
		/* The bed a picture is composited onto while it decodes, and what a
		   transparent PNG sits on. Not a frame: nothing of it is visible once
		   an opaque cover has painted. */
		background: var(--surface-2, var(--bg2));
		text-decoration: none;
		color: inherit;
		/* The generated cover's name is sized in `cqw`, so the card is what
		   that is a fraction of. It also makes the card the containing block
		   for the name plate, which it already was by `position: relative`. */
		container-type: inline-size;
	}

	.fdy-card:hover,
	.fdy-card:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	/* Colour is not the only signal: the selected card is the one whose
	   contents are in the pane beside it, and the ring is thicker as well as
	   accented. */
	.fdy-card.selected {
		outline: 3px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-card-shot {
		display: block;
		width: 100%;
		height: 100%;
	}

	/*
	   `cover`, NOT `scale-down`, AND THE REASON CHANGED WITH THE BOX.

	   The old box was a fixed 16:9 that most covers did not match, so
	   `scale-down` was right: it letterboxed rather than cropping, and
	   refused to upscale a small screenshot into a blurry one. This box IS
	   the image's own measured ratio, so for every unclamped cover `cover`
	   and `contain` are the same rendering and neither crops anything.

	   What `cover` decides is the two cases where the box is NOT the
	   image's ratio: a shape outside the clamp (a very tall phone
	   screenshot loses roughly its top and bottom 9%; a 1:9 loses most of
	   its length) and the sub-pixel rounding of the box itself. Letterboxing
	   there would put bars inside a card that is supposed to BE a picture.
	*/
	img.fdy-card-shot {
		object-fit: cover;
	}

	/* ======================================================================
	   THE GENERATED COVER, for an app whose student uploaded none.

	   A per-app hue, not one flat plate: the complaint this work answers is
	   that every card looked alike, and a single fallback colour reproduces
	   it exactly for every coverless app. The hue comes from the app's own
	   id, so it is the same on every load and every device, and
	   `foundryGeneratedHue` can never return one inside the band this room
	   reserves for heat.

	   THE NAME IS THE ART. It is the one case where "the name lives in the
	   thumbnail" is a guarantee rather than a request, which is why a
	   generated cover carries no hover plate of its own.
	   ====================================================================== */
	.fdy-card-made {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4, 1rem);
		background-image: linear-gradient(
			150deg,
			hsl(var(--fdy-hue, 210) 34% 27%),
			hsl(calc(var(--fdy-hue, 210) + 18) 40% 15%)
		);
	}

	.fdy-card-made-name {
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 9cqw, 1.9rem);
		line-height: 1.15;
		text-align: center;
		/* The room's own ink, measured on the generated plate rather than
		   assumed: the gradient is fixed in lightness and only its hue moves,
		   so one measurement stands for every app. */
		color: var(--fg-ink, var(--text-1, var(--white)));
		overflow-wrap: anywhere;
	}

	/* ======================================================================
	   THE NAME PLATE

	   PERMANENT BY DEFAULT, and the hover reveal is the ENHANCEMENT that
	   has to be opted into. Written the other way round -- hidden by
	   default, shown under `(hover: none)` -- every device the query cannot
	   speak for would get a card with no name on it, and that set includes
	   every touch device a media query mis-reports. This way the failure is
	   a plate somebody did not need.

	   The condition is `(hover: hover) and (min-width: 48rem)` because BOTH
	   have to hold for hover to be a route to the name: a coarse pointer
	   cannot hover at all, and a phone-width window is where a reader is
	   least able to spend a gesture finding out what something is.

	   A SCRIM, NOT A PANEL. It is a gradient that fades into the picture,
	   carrying the name and nothing else -- the tagline, author, class and
	   the rest are on the detail pane.
	   ====================================================================== */
	.fdy-card-name {
		position: absolute;
		inset: auto 0 0 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.15rem 0.5rem;
		padding: 1.6rem var(--space-3, 0.75rem) var(--space-2, 0.5rem);
		/* Pinned, never mixed from the ink above it: a scrim derived from its
		   own text moves whenever the text does and hands the contrast back. */
		background-image: linear-gradient(
			to top,
			rgba(6, 5, 4, 0.94) 0%,
			rgba(6, 5, 4, 0.82) 45%,
			rgba(6, 5, 4, 0) 100%
		);
	}

	/*
	   A COUNT-ONLY PLATE SITS ON A GENERATED COVER, whose own name is centred
	   behind it -- so the scrim is shorter (there is one short line to cover,
	   not a wrapped title) and the count takes the full ink rather than the
	   secondary tier, because it is the only thing on the plate.
	*/
	.fdy-card-name.count-only {
		padding-top: 0.9rem;
	}

	.fdy-card-name.count-only .fdy-card-plays {
		color: var(--white, #ece8e0);
	}

	.fdy-card-name-title {
		font-family: var(--font-display);
		font-size: 0.95rem;
		line-height: 1.2;
		color: var(--white, #ece8e0);
		overflow-wrap: anywhere;
	}

	/*
	   Metadata beside the name. It sits on the same pinned scrim as the
	   title, so it is measured against that and not against the picture,
	   which is the whole reason the scrim is opaque at the bottom.
	*/
	.fdy-card-plays {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--fg-ink-2, var(--text-2, var(--dim)));
	}

	@media (hover: hover) and (min-width: 48rem) {
		/*
		   `:not(.has-count)` IS THE WHOLE OF WHY A RANKED GALLERY STILL SHOWS
		   ITS NUMBERS. A plate carries a count only while a play ranking is in
		   force, and somebody who pressed Most played asked to see a ranking --
		   hiding its evidence behind a hover would leave them a wall of
		   pictures in an order they cannot check, which is worse here than
		   anywhere because the mosaic reads down its columns rather than across
		   its rows. Under `Recent`, the default and the state this gallery is
		   normally looked at in, no card carries a count and every one of them
		   is the pure picture. Found by the browser spec reporting the chips
		   `present 2, visible 0` at 1440, not by looking.
		*/
		.fdy-card-name:not(.has-count) {
			opacity: 0;
		}

		/*
		   OPACITY, NEVER `display` OR `visibility`: those take the plate out
		   of the accessibility tree, and while the link's own `aria-label`
		   already carries the name, a rule that removes text from the tree to
		   hide it is the shape that costs a reader the next time somebody
		   adds something to this plate.
		*/
		.fdy-card:hover .fdy-card-name,
		.fdy-card:focus-visible .fdy-card-name,
		.fdy-card.selected .fdy-card-name {
			opacity: 1;
		}

		/* Everything that moves is gated. */
		@media (prefers-reduced-motion: no-preference) {
			.fdy-card-name {
				transition: opacity 180ms ease;
			}
		}
	}
</style>
