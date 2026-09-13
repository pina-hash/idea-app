<script lang="ts">
	/**
	 * THE HISTORY, SCROLLABLE, ALL THE WAY BACK TO THE CREATION OF THE PART.
	 *
	 * Mr. Pina asked for this in his own words (2026-09-12): a history you can
	 * SCROLL THROUGH, like SolidWorks or Fusion 360, at MAXIMUM RESOLUTION, all
	 * the way back to the creation of the part. 0209 built the durable log; this
	 * is the surface over it, and the in-memory `ui/undo.ts` stack it replaces
	 * is gone.
	 *
	 * IT IS A FOURTH MODE OF THE TREE PANE, NOT A FOURTH GRID ROW AND NOT AN
	 * OVERLAY. `.ideacad` is a three-row grid (header, stage, concept strip) and
	 * its header already carries a comment saying a fourth child would take an
	 * implicit row and steal height from the viewport. That pane meanwhile
	 * ALREADY has three modes -- the FeatureManager, the PropertyManager and
	 * 0208's Materials panel all replace each other in it -- so this is the
	 * established arrangement rather than a new one, it inherits the pane's own
	 * measured 300px and its own scrolling, and it is where SolidWorks puts a
	 * history. THE RULES RAIL WAS NOT AN OPTION: ledger 0178 left it 40px over
	 * its box and it sits at 502px in 515px with 13px spare.
	 *
	 * TRANSPORTS ARE THE GATE, AS EVERYWHERE ELSE HERE. No `onundo` means no
	 * Undo control, no `onscrub` means the rows are not buttons. A read-only
	 * timeline is structural rather than a flag somebody has to remember: a
	 * teacher reading a student's part, and a deployment sitting between 0208
	 * and 0209 with no log at all, both get exactly what they can have.
	 *
	 * THERE IS NO CURSOR ON SCREEN AND THERE MUST NEVER BE ONE. 0189 chose
	 * append-an-inverse over move-a-pointer: four presses over two edits leave
	 * SIX rows, and all six render. Nothing is greyed out as "ahead of" anything
	 * and nothing is ever removed. What a row carries is its own state --
	 * applied or undone -- and `TIMELINE_WORDS.note` says so in words, because a
	 * student who knows other CAD expects an undone step to vanish and would
	 * otherwise read the list as broken.
	 */
	import {
		TIMELINE_WORDS,
		depthWord,
		timelineTime,
		type Timeline,
		type TimelineEntry
	} from './timeline';

	let {
		timeline,
		previewSeq = null,
		busy = false,
		onundo = undefined,
		onredo = undefined,
		onscrub = undefined,
		onclose = undefined
	}: {
		timeline: Timeline;
		/** The seq being looked at, or null for "now". A LOOK, never a write. */
		previewSeq?: number | null;
		busy?: boolean;
		onundo?: () => void;
		onredo?: () => void;
		onscrub?: (seq: number | null) => void;
		onclose?: () => void;
	} = $props();

	const entries = $derived(timeline.entries);
	const count = $derived(entries.length);
	/* The origin is a step of the history and is counted as one -- it is the
	   creation of the part, which is the thing the student was promised they
	   could get back to. */
	const countLine = $derived(`${count} ${count === 1 ? 'step' : 'steps'}`);

	/** A row's own accessible sentence, which is what a screen reader hears and
	 *  is deliberately the same words the row prints rather than a second copy
	 *  written for assistive tech. */
	function rowLabel(e: TimelineEntry): string {
		const verb = depthWord(e.depth);
		const when = timelineTime(e.at);
		return [
			`Step ${e.seq}`,
			verb,
			`${e.sentence.where}${e.sentence.what ? `, ${e.sentence.what}` : ''}`,
			e.state === 'undone' ? 'currently undone' : '',
			e.actor ?? '',
			when
		]
			.filter(Boolean)
			.join('. ');
	}
</script>

<section class="tl" data-testid="ideacad-timeline" aria-labelledby="ideacad-tl-heading">
	<header>
		<h3 id="ideacad-tl-heading">{TIMELINE_WORDS.heading}<i data-testid="ideacad-timeline-count">{countLine}</i></h3>
		{#if onclose}
			<button type="button" class="back tap-44" onclick={onclose}>Feature tree</button>
		{/if}
	</header>

	{#if onundo || onredo}
		<!-- A CONTROL THAT CANNOT ACT STILL EXPLAINS ITSELF, so these are
		     `aria-disabled` and never `disabled`: a genuinely disabled control
		     swallows the pointer event, and the sentence under it is exactly
		     what the student needs when Undo does nothing. -->
		<div class="acts">
			{#if onundo}
				<button
					type="button"
					class="act tap-44"
					data-testid="ideacad-timeline-undo"
					aria-disabled={!timeline.canUndo || busy}
					onclick={() => timeline.canUndo && !busy && onundo?.()}>{TIMELINE_WORDS.undo}</button
				>
			{/if}
			{#if onredo}
				<button
					type="button"
					class="act tap-44"
					data-testid="ideacad-timeline-redo"
					aria-disabled={!timeline.canRedo || busy}
					onclick={() => timeline.canRedo && !busy && onredo?.()}>{TIMELINE_WORDS.redo}</button
				>
			{/if}
		</div>
	{/if}

	{#if previewSeq !== null}
		<!-- THE SCRUB SAYS IT IS A LOOK, WHERE THE STUDENT IS LOOKING. Committing
		     to a past state is Undo pressed until it is reached, which is what
		     keeps the log append-only; a timeline that silently rewrote the
		     document on a click would be a cursor wearing a list's clothes. -->
		<p class="preview" role="status" data-testid="ideacad-timeline-preview">
			{TIMELINE_WORDS.previewing}
			<button type="button" class="now tap-44" data-testid="ideacad-timeline-now" onclick={() => onscrub?.(null)}
				>{TIMELINE_WORDS.back}</button
			>
		</p>
	{/if}

	<p class="note">{TIMELINE_WORDS.note}</p>

	{#if count === 0}
		<p class="empty" data-testid="ideacad-timeline-empty">{TIMELINE_WORDS.empty}</p>
	{:else}
		<!-- `scrollbar-gutter: stable` IS LOAD-BEARING AND NOT TIDINESS. This
		     Chromium paints no scrollbar into a screenshot at any colour (ledger
		     0186 proved it with a magenta-on-green control), so a list that let
		     its content run under the scrollbar would measure correct and read
		     clipped, and nothing would report it. The gutter is reserved whether
		     or not the list overflows, so the right edge never moves either. -->
		<ol class="rows" data-testid="ideacad-timeline-rows">
			{#each entries as entry (entry.seq)}
				<li
					class="row"
					class:undone={entry.state === 'undone'}
					class:origin={entry.state === 'origin'}
					class:broken={entry.state === 'broken'}
					class:here={previewSeq === entry.seq}
					class:next={entry.isUndoTarget && previewSeq === null}
					data-seq={entry.seq}
					data-state={entry.state}
					data-testid="ideacad-timeline-row"
				>
					<svelte:element
						this={onscrub ? 'button' : 'div'}
						class="hit tap-44"
						role={onscrub ? undefined : 'group'}
						type={onscrub ? 'button' : undefined}
						aria-label={onscrub ? rowLabel(entry) : undefined}
						aria-current={previewSeq === entry.seq ? 'step' : undefined}
						onclick={onscrub ? () => onscrub(entry.seq) : undefined}
					>
						<span class="seq" aria-hidden="true">{entry.seq}</span>
						<span class="say">
							{#if entry.depth > 0}<b class="verb">{depthWord(entry.depth)}</b>{/if}
							<b class="where">{entry.sentence.where}</b>
							<span class="what">{entry.sentence.what}</span>
							<span class="meta">
								{#if entry.state === 'undone'}<em class="chip undone-chip">undone</em>{/if}
								{#if entry.state === 'broken'}<em class="chip broken-chip">{TIMELINE_WORDS.broken}</em>{/if}
								{#if entry.actor}<span class="who">{entry.actor}</span>{/if}
								{#if timelineTime(entry.at)}<span class="when">{timelineTime(entry.at)}</span>{/if}
							</span>
						</span>
					</svelte:element>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	/**
	 * THE PANEL TAKES THE PANE'S HEIGHT, WHICH IS WHAT KEEPS THE LIST INSIDE IT.
	 *
	 * Rasterized at 1440 before this was here: the list carried its own
	 * `max-height` and came out TALLER than the pane, so rows 5 to 7 sat below
	 * the pane's bottom edge -- reachable only by scrolling the PANE, inside a
	 * box that was itself scrollable, which is two nested scroll regions and the
	 * exact 0171 defect this surface was written to avoid. Worse, it passed:
	 * the browser check measured each row against the LIST box, which is the
	 * wrong box, and every row was inside it.
	 *
	 * So the panel is `height: 100%` of the pane and the list is the flex child
	 * that takes what is left. There is then exactly ONE scroll region, its
	 * bottom edge is the pane's, and a row below it is reachable by the scroll a
	 * student is already making.
	 */
	.tl {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		height: 100%;
		min-height: 0;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	h3 {
		margin: 0;
		font: 13px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-1);
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	/* THE COUNT IS THE FOLD'S ONLY HONEST CUE. With no painted scrollbar, a
	   student cannot see that eleven of forty steps are showing; a number can
	   say it. */
	h3 i {
		font-style: normal;
		font-size: 11px;
		color: var(--text-2);
		letter-spacing: 0.04em;
	}
	/* `.tap-44` IS `inline-flex` WITH NO `justify-content`, so a label inside one
	   sits at flex-start against the border unless the control says otherwise.
	   Rasterized before this was here: UNDO and REDO were flush against their
	   own left edge, which reads as a clipped button. Centring is a property of
	   these controls rather than of the floor class, which is shared. */
	.back,
	.now {
		font: 11px 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: 4px;
		padding: 0 0.6rem;
		justify-content: center;
		cursor: pointer;
	}
	.acts {
		display: flex;
		gap: 0.4rem;
	}
	.act {
		flex: 1;
		font: 12px 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: 4px;
		padding: 0 0.6rem;
		justify-content: center;
		cursor: pointer;
	}
	/* AN UNAVAILABLE CONTROL IS STILL READ, so it takes `--text-2` and not
	   `--text-3`. Measured on this pane's own ground: `--text-3` is 2.95:1,
	   which is not a near miss -- a student cannot tell whether the word says
	   Undo or Redo. It is still distinguishable from the available state, which
	   is `--text-1` at 14.5:1, and the `aria-disabled` attribute is what carries
	   the state to a screen reader rather than the lightness. This is the same
	   argument `aria-disabled` over `disabled` rests on: the control has to be
	   able to explain itself, which starts with being legible. */
	.act[aria-disabled='true'] {
		color: var(--text-2);
		cursor: default;
	}
	.preview {
		margin: 0;
		padding: 0.4rem 0.5rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		font: 12px Rajdhani, sans-serif;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--amber);
		border-radius: 4px;
	}
	.note,
	.empty {
		margin: 0;
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
		line-height: 1.35;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		/* NO `max-height`, AND THAT IS THE FIX RATHER THAN AN OMISSION. A cap in
		   viewport units cannot know how tall this pane is, so it produced a list
		   taller than its own container. `flex: 1` plus `min-height: 0` takes
		   exactly the room left under the controls -- the controls stay put at
		   forty steps and the list never runs past the pane. */
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		scrollbar-gutter: stable;
		/* A scroll into a row must not land it under the sticky nothing above;
		   there is no sticky header inside this box, so the padding is the small
		   breathing room a keyboard scroll needs rather than an overlay offset. */
		scroll-padding-block: 4px;
	}
	.row {
		margin: 0;
	}
	.hit {
		display: flex;
		width: 100%;
		gap: 0.5rem;
		align-items: flex-start;
		text-align: left;
		padding: 0.35rem 0.45rem;
		background: var(--surface-2);
		border: 1px solid transparent;
		border-left: 3px solid var(--boundary);
		border-radius: 3px;
		color: var(--text-1);
		font: 13px Rajdhani, sans-serif;
	}
	/* Only a scrubbable row is a button, so only a button gets a pointer. */
	button.hit {
		cursor: pointer;
	}
	button.hit:hover,
	button.hit:focus-visible {
		border-color: var(--green);
	}
	.seq {
		font: 11px 'Share Tech Mono', monospace;
		color: var(--text-2);
		min-width: 1.6rem;
		padding-top: 2px;
	}
	.say {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		flex: 1;
	}
	.where {
		font-weight: 600;
		color: var(--text-1);
	}
	.verb {
		font: 11px 'Share Tech Mono', monospace;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--amber);
	}
	.what {
		color: var(--text-2);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		font: 11px 'Share Tech Mono', monospace;
		color: var(--text-2);
	}
	.chip {
		font-style: normal;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid currentColor;
		border-radius: 3px;
		padding: 0 0.3rem;
	}
	/* COLOUR IS NEVER THE ONLY SIGNAL. An undone step carries the word "undone",
	   a dashed left edge AND the hue; a reader who sees none of the three is
	   reading a row that says "Undid" in its own verb line. */
	.undone-chip {
		color: var(--amber);
	}
	.broken-chip {
		color: var(--amber);
	}
	.row.undone .hit {
		border-left-style: dashed;
		border-left-color: var(--amber);
	}
	.row.origin .hit {
		border-left-color: var(--cyan);
	}
	.row.broken .hit {
		border-left-color: var(--amber);
	}
	/* "WHAT CTRL+Z DOES NEXT", WHICH IS NOT A CURSOR. It is a fact about the
	   fold -- the newest live row -- and it moves when the log does rather than
	   being a position anybody scrolls. */
	.row.next .hit {
		border-left-color: var(--green);
	}
	.row.here .hit {
		border-color: var(--amber);
		background: var(--surface-1);
	}
	@media (max-width: 1023px) {
		.tl {
			/* The pane does not scroll below 1024px -- the document does -- so the
			   panel takes its content's height and the whole list renders. */
			height: auto;
		}
		.rows {
			/* A scroll region inside a scrolling page is the arrangement a thumb
			   cannot aim at, so below 1024px there is exactly one: the document. */
			flex: none;
			overflow-y: visible;
		}
	}
</style>
