<script lang="ts">
	import { deckEntrySrc, type ClassroomDeck } from '$lib/classroom/deck';

	/**
	 * A deck, full-bleed, in an iframe pointed at its own entry page.
	 *
	 * THE VIEWER HOSTS THE DECK, IT DOES NOT DRIVE IT. deck-stage.js already
	 * implements ArrowLeft/ArrowRight navigation inside the deck, so the only
	 * thing this component has to get right is that the deck HAS KEYBOARD FOCUS:
	 * the iframe is focused on load, and every control here hands focus straight
	 * back after it acts. Nothing sends synthetic keys into the frame and nothing
	 * tries to jump to a slide -- that would mean guessing at deck-stage's
	 * internal state, which is precisely the interference the slide index is
	 * supposed to avoid.
	 *
	 * SANDBOX, DELIBERATELY WITH BOTH allow-scripts AND allow-same-origin. A deck
	 * is HTML and JavaScript: without scripts it does not run at all, and without
	 * same-origin its own `fetch('.image-slots.state.json')` becomes a
	 * cross-origin request and every image loses the author's crop and pan. Those
	 * two together are, for the frame's own origin, close to no sandbox -- what
	 * remains is real but modest (no top-level navigation, no forms, no pointer
	 * lock unless granted). The trust that pays for it is upstream: only the
	 * teacher of record for every class an item is posted to, or an admin, can
	 * upload a deck at all, which is the same bar that already governs anything
	 * else they put in front of a class. The serving route adds a CSP that keeps
	 * a deck from posting off-origin; see its header.
	 */
	let {
		deck,
		backHref,
		backLabel = 'Back',
		controls
	}: {
		deck: ClassroomDeck;
		backHref: string;
		backLabel?: string;
		/**
		 * Extra chrome for the bar. THE STAGE IS PROJECTED, so nothing may float
		 * over it: the shell's report affordance is excluded on this route and the
		 * route hands it in here instead, where it sits in the bar the viewer
		 * already owns rather than in the photograph of the lesson.
		 */
		controls?: import('svelte').Snippet;
	} = $props();

	let frame = $state<HTMLIFrameElement | null>(null);
	/* Full screen takes the WHOLE viewer, bar included (ledger 0297): the bar is
	   a strip above the stage, never over it, so going full screen keeps the
	   way back and Exit full screen on screen without anything floating over
	   the projected slide. */
	let pageEl = $state<HTMLDivElement | null>(null);
	let showIndex = $state(false);
	let isFull = $state(false);

	const src = $derived(deckEntrySrc(deck));

	/**
	 * The deck's arrow keys only work while the frame has focus, and a click on
	 * any chrome here takes it away. Every control calls this afterwards.
	 */
	function focusDeck() {
		frame?.focus();
	}

	function onFrameLoad() {
		// Deferred a tick: focusing inside the load handler can lose the race
		// with the frame's own first paint on a cold document.
		queueMicrotask(focusDeck);
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
			} else {
				await pageEl?.requestFullscreen();
			}
		} catch {
			// A browser (or an embedded pane) that refuses fullscreen is not an
			// error state for the page it is on -- the deck still plays inline.
		}
		focusDeck();
	}

	function onFullscreenChange() {
		isFull = !!document.fullscreenElement;
		focusDeck();
	}

	function toggleIndex() {
		showIndex = !showIndex;
		if (!showIndex) focusDeck();
	}
</script>

<svelte:document onfullscreenchange={onFullscreenChange} />

<svelte:head>
	<title>{deck.title} // deck</title>
</svelte:head>

<!--
	THE BAR IS A STRIP ABOVE THE STAGE, NOT A SCRIM OVER IT (ledger 0297,
	report 34: "the back button on this page should be in the top left of the
	screen, all back buttons should be somewhere on the top left of the
	screen"). It used to be a 58px gradient absolutely positioned over the
	bottom of the slide frame, with Back at the bottom left -- so the way out
	was at the wrong corner, the scrim sat in the photograph of every projected
	lesson, and at 375 the Report control ran off the right edge. Now the page is
	a column: the bar first, in the flow and wrapping onto a second line where it
	must, and the stage below it taking what is left, so the deck letterboxes
	inside its own frame and nothing floats over the projected image. This
	supersedes rebuild-plan decision 3's "deck stage untouched" for the bar's
	position only; the stage, the frame and the deck inside it are unchanged.
-->
<!-- `deck-stage` names the WHOLE viewer as the dark island Space White leaves
     dark (themes/space-white.css), bar included: the bar is on the black stage
     ground and must keep its dark tokens with it. -->
<div class="deck-page deck-stage" bind:this={pageEl} class:full={isFull}>
	<div class="deck-bar" data-testid="deck-bar">
		<a class="deck-btn deck-back" href={backHref} data-testid="deck-back">&lsaquo; {backLabel}</a>
		<span class="deck-title">{deck.title}</span>
		<span class="deck-spacer"></span>
		{#if deck.slides.length}
			<button
				type="button"
				class="deck-btn"
				aria-expanded={showIndex}
				aria-controls="deck-index"
				onclick={toggleIndex}
			>
				{deck.slides.length} slides
			</button>
		{/if}
		<button type="button" class="deck-btn" onclick={toggleFullscreen}>
			{isFull ? 'Exit full screen' : 'Full screen'}
		</button>
		{#if controls}
			<span class="deck-extra">{@render controls()}</span>
		{/if}
	</div>

	<div class="deck-screen">
		<iframe
			bind:this={frame}
			{src}
			title={deck.title}
			class="deck-frame"
			onload={onFrameLoad}
			allow="fullscreen; autoplay; clipboard-write"
			sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
		></iframe>

		{#if showIndex && deck.slides.length}
			<!--
				A READ-ONLY index. It says what is in the deck and how far through a
				label sits; it does not jump, because jumping means driving
				deck-stage from outside and guessing at its state. Arrow keys, in
				the deck itself, are how you move. It opens only when asked for and
				closes from the same control in the bar.
			-->
			<div class="deck-index" id="deck-index">
				<p class="deck-index-note">Use the arrow keys in the deck to move between slides.</p>
				<ol>
					{#each deck.slides as slide (slide.index)}
						<li><span class="deck-index-n">{slide.index + 1}</span>{slide.label}</li>
					{/each}
				</ol>
			</div>
		{/if}
	</div>
</div>

<style>
	.deck-page {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: #000;
	}
	.deck-screen {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		background: #000;
	}
	.deck-frame {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
		background: #000;
	}
	.deck-bar {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.6rem;
		background: #0a0a0a;
		border-bottom: 1px solid var(--line);
	}
	.deck-spacer {
		flex: 1;
	}
	.deck-extra {
		display: inline-flex;
		align-items: center;
	}
	.deck-title {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.deck-btn {
		appearance: none;
		background: rgba(10, 10, 10, 0.85);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--white);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		padding: 0 0.9rem;
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
		/*
		 * 44px, stated as a box rather than inferred from padding: this bar is
		 * used on a phone as well as a projector, and padding plus a 0.68rem line
		 * box lands at 35px (measured, not guessed).
		 */
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.deck-btn:hover {
		color: var(--gold);
		border-color: var(--gold);
	}
	.deck-index {
		position: absolute;
		right: 0.6rem;
		top: 0.6rem;
		width: min(22rem, calc(100vw - 1.2rem));
		max-height: min(60vh, 30rem);
		overflow: auto;
		background: rgba(10, 10, 10, 0.96);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.7rem 0.8rem;
	}
	.deck-index-note {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.deck-index ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.deck-index li {
		display: flex;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--white);
		overflow-wrap: anywhere;
	}
	.deck-index-n {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--gold);
		min-width: 1.4rem;
	}
	@media (max-width: 520px) {
		.deck-title {
			display: none;
		}
	}
</style>
