<script lang="ts">
	import { deckEntrySrc, type ClassroomDeck } from '$lib/classroom/deck';

	/**
	 * A deck, full-bleed, in an iframe pointed at its own entry page.
	 *
	 * THE VIEWER HOSTS THE DECK, AND DRIVES IT ONLY THROUGH ITS PUBLIC API.
	 * deck-stage.js implements ArrowLeft/ArrowRight inside the deck, so the deck
	 * must HAVE KEYBOARD FOCUS: the iframe is focused on load, and every control
	 * here hands focus straight back after it acts. Nothing sends synthetic keys
	 * into the frame.
	 *
	 * A PHONE HAS NO ARROW KEYS (ledger 0297, package ITEM), and the slide index
	 * used to be read-only with a sentence telling a phone to use them. So the
	 * viewer now reads deck-stage's DOCUMENTED public API -- `goTo(i)`, `next()`,
	 * `prev()`, and the `slidechange` event it dispatches on itself -- off the
	 * frame's own document, which is same-origin by the sandbox below. That is
	 * not guessing at internal state: those four names are the component's
	 * published interface ("Public API" in deck-stage.js). A deck with no
	 * deck-stage (or one this build cannot reach) simply offers no Previous /
	 * Next and a read-only index, exactly as before -- absence removes the
	 * control.
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

	/** deck-stage's public surface, the four names it publishes. */
	interface DeckStageApi extends HTMLElement {
		goTo(i: number): void;
		next(): void;
		prev(): void;
		readonly index: number;
		readonly length: number;
	}
	/** The deck's own stage, when this frame has one this page can reach. */
	let stageApi = $state<DeckStageApi | null>(null);
	/** The slide on screen, from the deck's own `slidechange`. */
	let current = $state<number | null>(null);
	let total = $state(0);
	let detachStage: (() => void) | null = null;

	/**
	 * FIND THE DECK'S STAGE AND LISTEN TO IT. Every read is guarded: a frame
	 * whose document is not reachable (a different origin, a document still
	 * loading) or holds no `deck-stage` leaves `stageApi` null, which is the
	 * old read-only viewer.
	 */
	function connectStage() {
		detachStage?.();
		detachStage = null;
		stageApi = null;
		current = null;
		try {
			const doc = frame?.contentDocument;
			const el = doc?.querySelector('deck-stage') as DeckStageApi | null;
			if (!doc || !el) return;
			if (typeof el.goTo !== 'function') {
				// Present but not yet upgraded: the deck's script defines it after
				// parsing. Ask again the moment it does, once.
				const registry = doc.defaultView?.customElements;
				registry
					?.whenDefined('deck-stage')
					.then(() => {
						if (!stageApi) connectStage();
					})
					.catch(() => {});
				return;
			}
			stageApi = el;
			current = typeof el.index === 'number' ? el.index : null;
			total = typeof el.length === 'number' ? el.length : deck.slides.length;
			const onChange = (e: Event) => {
				const detail = (e as CustomEvent<{ index?: number; total?: number }>).detail;
				if (typeof detail?.index === 'number') current = detail.index;
				if (typeof detail?.total === 'number') total = detail.total;
			};
			doc.addEventListener('slidechange', onChange);
			detachStage = () => doc.removeEventListener('slidechange', onChange);
		} catch {
			stageApi = null;
		}
	}

	$effect(() => () => detachStage?.());

	function goToSlide(i: number) {
		try {
			stageApi?.goTo(i);
		} catch {
			/* a deck that refuses a jump keeps its own slide */
		}
		showIndex = false;
		focusDeck();
	}
	function stepSlide(delta: 1 | -1) {
		try {
			if (delta > 0) stageApi?.next();
			else stageApi?.prev();
		} catch {
			/* as above */
		}
		focusDeck();
	}

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
		// deck-stage defines itself from a script in the deck, which may run
		// after `load` has already fired on a fast cache; ask now and once more
		// a moment later rather than waiting on a signal the deck never sends.
		connectStage();
		setTimeout(() => {
			if (!stageApi) connectStage();
		}, 400);
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
		{#if stageApi}
			<!-- TAP TO MOVE (ledger 0297): the deck's own next/prev, for a phone
			     and for anybody not at a keyboard. Present only when the deck
			     publishes them. -->
			<span class="deck-step" role="group" aria-label="Slides">
				<button type="button" class="deck-btn" data-testid="deck-prev" onclick={() => stepSlide(-1)}>
					&lsaquo; Previous
				</button>
				{#if current !== null && total}
					<span class="deck-pos" data-testid="deck-position" aria-live="polite">{current + 1} / {total}</span>
				{/if}
				<button type="button" class="deck-btn" data-testid="deck-next" onclick={() => stepSlide(1)}>
					Next &rsaquo;
				</button>
			</span>
		{/if}
		{#if deck.slides.length}
			<button
				type="button"
				class="deck-btn"
				aria-expanded={showIndex}
				aria-controls="deck-index"
				data-testid="deck-index-toggle"
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
				THE INDEX JUMPS WHEN THE DECK LETS IT (ledger 0297). Each entry is a
				44px button calling the deck's own `goTo`, and the slide on screen is
				marked in a word as well as a tint. A deck with no reachable stage
				keeps the read-only list, where the arrow keys in the deck are how
				you move -- the one case its sentence is still true.
			-->
			<div class="deck-index" id="deck-index" data-testid="deck-index">
				{#if !stageApi}
					<p class="deck-index-note">Use the arrow keys in the deck to move between slides.</p>
				{/if}
				<ol>
					{#each deck.slides as slide (slide.index)}
						<li>
							{#if stageApi}
								<button
									type="button"
									class="deck-index-go"
									class:on={current === slide.index}
									aria-current={current === slide.index ? 'true' : undefined}
									data-testid="deck-index-go"
									onclick={() => goToSlide(slide.index)}
								>
									<span class="deck-index-n">{slide.index + 1}</span>
									<span class="deck-index-label">{slide.label}</span>
									{#if current === slide.index}<span class="deck-index-here">On screen</span>{/if}
								</button>
							{:else}
								<span class="deck-index-n">{slide.index + 1}</span>{slide.label}
							{/if}
						</li>
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
	.deck-step {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.deck-pos {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--white);
		min-width: 3.2rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	/* 44px, a whole row: on a phone the index is how a slide is reached. */
	.deck-index-go {
		appearance: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 44px;
		padding: 0.25rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 6px;
		background: none;
		color: var(--white);
		font: inherit;
		font-size: 0.82rem;
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.deck-index-go:hover,
	.deck-index-go:focus-visible {
		border-color: var(--gold);
		outline: none;
	}
	.deck-index-go.on {
		border-color: var(--line);
		background: rgba(255, 255, 255, 0.06);
	}
	.deck-index-label {
		flex: 1 1 auto;
		min-width: 0;
	}
	.deck-index-here {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--gold);
	}
	@media (max-width: 520px) {
		.deck-title {
			display: none;
		}
	}
</style>
