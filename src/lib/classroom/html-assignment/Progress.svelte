<script lang="ts">
	/**
	 * THE PROGRESS RAIL ABOVE A PORTED HTML ASSIGNMENT.
	 *
	 * Parent chrome, never inside the document: it sits between the section
	 * label and the frame in `ItemDetail`'s schema-3 branch, so every worksheet
	 * gets it for free and no author builds one. Props in, nothing out -- it
	 * takes the manifest and the two records the answer controller already
	 * holds, hands them to `hxProgress`, and draws the result. Every rule about
	 * what the number IS lives in `progress.ts`; this file decides only how it
	 * looks.
	 *
	 * WHAT IT DRAWS, and what was rejected on the way:
	 *
	 *   THE NUMBER, large, in the mono face the register uses for metadata,
	 *   with a stage WORD and a filling-circle GLYPH beside it. Colour is never
	 *   the only signal, and the bar's hue is the loudest thing here, so the
	 *   number and the word are always in ink tokens and never tinted.
	 *
	 *   THE BAR, one track split into MODULE SEGMENTS whose widths are the
	 *   modules' point shares. The weighting the brief asked for is therefore
	 *   visible rather than merely applied: a five-point module is a wider
	 *   segment than a one-point one, and a student can see which part of the
	 *   assignment is worth the most of the bar without a number being printed.
	 *   Each segment fills from its own left edge, so where the work is done is
	 *   also visible. The fill colour is one `color-mix` between two of the
	 *   room's own tokens, driven by three custom properties set inline from
	 *   `hxProgressPaint`: red at the bottom of the ramp, amber in the middle,
	 *   green at the top. A rejected shape was a single unsegmented bar, which
	 *   hides the weighting entirely; another was a ring, which cannot be
	 *   segmented legibly and is cramped at 375px.
	 *
	 *   THE MODULE CHIPS, one per counted module, each carrying the module's
	 *   title and either "done" or how many ANSWERS are left -- a count of
	 *   blocks, never of points, so a chip cannot be read as a score. The
	 *   segments carry no words and the chips are where the words go.
	 *
	 *   THE NEXT LINE, naming the first unmet module and what it wants.
	 *
	 *   THE NOTE, at every value: this is how much, not how well. It is the one
	 *   sentence this feature cannot ship without, because a percentage above a
	 *   graded assignment reads as a mark by default.
	 *
	 * REJECTED OUTRIGHT: points anywhere on screen ("7 of 10" is a grade to a
	 * fifteen-year-old however it is labelled), confetti or particles at 100%
	 * (they celebrate a mark, and they cannot be made to say nothing under
	 * reduced motion), streaks or levels (there is no storage for them and they
	 * would be a second gamification with its own rules), a progress bar drawn
	 * by the document itself (the authoring standard tells authors not to,
	 * because this exists), and a per-block dot row (a manifest may carry four
	 * hundred blocks).
	 *
	 * MOTION: the fill eases when the number moves, a gloss sweeps the bar once
	 * on reaching 100%, and the stage badge pops once at the same moment. All
	 * three are inside `prefers-reduced-motion: no-preference`; under `reduce`
	 * every element is painted at full opacity with no transform, so the
	 * reduced reader sees the same rail at rest. The gloss is a background
	 * layer on the fill itself rather than a separate element, which is what
	 * keeps "nothing is hidden in a base state" true of it.
	 *
	 * NO CONTROL. Nothing here is tappable, so the 44px floor has nothing to
	 * measure on this surface; the harness's own controls are measured instead.
	 */
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type { HxImageState } from '$lib/classroom/html-assignment/bridge';
	import {
		HX_PROGRESS_BAR_LABEL,
		HX_PROGRESS_COMPLETE_NOTE,
		HX_PROGRESS_NOT_A_GRADE,
		hxProgress,
		hxProgressModuleLine,
		hxProgressNextLine,
		hxProgressPaint,
		hxProgressStageRow,
		hxProgressSummary
	} from '$lib/classroom/html-assignment/progress';

	let {
		manifest,
		values,
		images = {}
	}: {
		/** The manifest STORED AT IMPORT, never one a frame sent. */
		manifest: HtmlAssignmentManifest;
		/** Keyed by FIELD, as the answer controller holds them. */
		values: Readonly<Record<string, string | boolean>>;
		images?: Readonly<Record<string, HxImageState>>;
	} = $props();

	const progress = $derived(hxProgress(manifest, values, images));
	const stage = $derived(hxProgressStageRow(progress.stage));
	const paint = $derived(hxProgressPaint(progress.percent));
	const nextLine = $derived(hxProgressNextLine(progress));
	const summary = $derived(hxProgressSummary(progress));
	/** Only the modules the bar counts get a segment and a chip. */
	const counted = $derived(progress.modules.filter((m) => m.weight > 0));

	/** A stable id for `aria-describedby`; one rail per mount. */
	const noteId = `hxp-note-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div
	class="hxp"
	class:is-complete={progress.complete}
	class:is-blank={!progress.started}
	data-hx-progress
	data-stage={progress.stage}
	data-percent={progress.percent}
	data-basis={progress.basis}
	style="--hxp-from: var({paint.from}); --hxp-to: var({paint.to}); --hxp-t: {Math.round(paint.t * 100)}%;"
>
	<div class="hxp-head">
		<p class="hxp-pct" data-testid="hxp-percent">
			<span class="hxp-num">{progress.percent}</span><span class="hxp-sign">%</span>
			<span class="hxp-pct-word">filled in</span>
		</p>
		<div class="hxp-words">
			<p class="hxp-stage" data-testid="hxp-stage">
				<span class="hxp-glyph" aria-hidden="true">{stage.glyph}</span>
				<span class="hxp-stage-word">{stage.label}</span>
			</p>
			{#if progress.complete}
				<p class="hxp-next" data-testid="hxp-next">{HX_PROGRESS_COMPLETE_NOTE}</p>
			{:else if nextLine}
				<p class="hxp-next" data-testid="hxp-next">{nextLine}</p>
			{/if}
		</div>
	</div>

	<div
		class="hxp-bar"
		role="progressbar"
		aria-label={HX_PROGRESS_BAR_LABEL}
		aria-valuenow={progress.percent}
		aria-valuemin="0"
		aria-valuemax="100"
		aria-valuetext={summary}
		aria-describedby={noteId}
		data-testid="hxp-bar"
	>
		{#each counted as mod (mod.id)}
			<!--
				THE SEGMENT'S WIDTH IS THE MODULE'S POINT SHARE, as a flex-grow
				weight, so the track divides itself and no width is ever computed
				against a pixel. Its fill is the module's OWN fraction, from its
				own left edge; the colour is the whole bar's.
			-->
			<span
				class="hxp-seg"
				class:is-done={mod.done}
				style="flex-grow: {mod.weight}; --hxp-seg: {Math.round(mod.fraction * 1000) / 10}%;"
				data-hx-seg={mod.id}
				data-hx-seg-weight={mod.weight}
				data-hx-seg-fraction={mod.fraction}
				title={hxProgressModuleLine(mod)}
			>
				<span class="hxp-fill" data-hx-fill></span>
			</span>
		{/each}
	</div>

	{#if counted.length > 0}
		<ul class="hxp-mods" aria-label="Modules">
			{#each counted as mod (mod.id)}
				<li class="hxp-mod" class:is-done={mod.done} data-hx-mod={mod.id}>
					<span class="hxp-mod-glyph" aria-hidden="true">{mod.done ? '✓' : '·'}</span>
					<span class="hxp-mod-word">{hxProgressModuleLine(mod)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="hxp-note" id={noteId} data-testid="hxp-note">{HX_PROGRESS_NOT_A_GRADE}</p>
</div>

<style>
	.hxp {
		/* THE FILL COLOUR, MIXED HERE FROM THE THREE INLINE PROPERTIES. A point
		   on the line between two register tokens, never a new colour. */
		--hxp-fill: color-mix(in oklab, var(--hxp-from) calc(100% - var(--hxp-t)), var(--hxp-to) var(--hxp-t));
		--hxp-track: var(--surface-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		color: var(--text-1);
		min-width: 0;
	}

	.hxp-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-4);
		min-width: 0;
	}

	.hxp-pct {
		margin: 0;
		font-family: var(--font-mono);
		line-height: 1;
		display: flex;
		align-items: baseline;
		gap: 0.2rem;
		flex: 0 0 auto;
	}
	.hxp-num {
		font-size: 2.6rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.hxp-sign {
		font-size: 1.3rem;
		color: var(--text-2);
	}
	.hxp-pct-word {
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
		margin-left: 0.35rem;
	}

	.hxp-words {
		flex: 1 1 14rem;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.hxp-stage {
		margin: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.15rem;
		letter-spacing: 0.02em;
	}
	.hxp-glyph {
		font-size: 1.05em;
		line-height: 1;
		display: inline-block;
	}
	.hxp-next {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-2);
	}

	/* THE TRACK. A row of segments, each a rounded slot, divided by a hairline
	   gap so the module boundaries read as boundaries. */
	.hxp-bar {
		display: flex;
		gap: 3px;
		height: 14px;
		width: 100%;
		min-width: 0;
	}
	.hxp-seg {
		flex: 1 1 0;
		min-width: 6px;
		position: relative;
		overflow: hidden;
		background: var(--hxp-track);
		border: 1px solid var(--hairline);
		border-radius: 999px;
	}
	.hxp-seg:first-child {
		border-top-left-radius: 999px;
		border-bottom-left-radius: 999px;
	}
	.hxp-fill {
		position: absolute;
		inset: 0;
		width: var(--hxp-seg);
		border-radius: inherit;
		/* THE GLOSS IS A LAYER ON THE FILL, NOT A SEPARATE ELEMENT. At rest it
		   is a faint highlight sitting at the fill's left; on completion it
		   sweeps once. Either way the fill is painted at full opacity, so a
		   reduced-motion reader sees the same fill with the gloss standing still. */
		background:
			linear-gradient(110deg, transparent 35%, rgba(255, 255, 255, 0.28) 50%, transparent 65%)
				-100% 0 / 200% 100% no-repeat,
			var(--hxp-fill);
	}
	.hxp-seg.is-done .hxp-fill {
		width: 100%;
	}

	/* THE CHIPS. Words for the segments. */
	.hxp-mods {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.hxp-mod {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.55rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-chip, 999px);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.03em;
		color: var(--text-2);
		background: var(--surface-2);
		max-width: 100%;
		min-width: 0;
	}
	/* WRAPS, NEVER ELLIPSISES. Measured at 375 with a long module title: the
	   ellipsis ate the count ("2 an..."), which is the half of the chip a
	   student needs. A chip that grows a line is better than one that hides
	   what it is for. */
	.hxp-mod-word {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.hxp-mod.is-done {
		color: var(--green);
		border-color: color-mix(in oklab, var(--green) 45%, transparent);
	}
	.hxp-mod-glyph {
		line-height: 1;
	}

	.hxp-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}

	/* THE COMPLETE STATE. The stage line takes the green and the whole rail
	   gets the accent on its edge, which is the one place `--green` spends
	   itself here: completion is what the token is for. */
	.hxp.is-complete {
		border-color: color-mix(in oklab, var(--green) 55%, var(--boundary));
	}
	.hxp.is-complete .hxp-stage {
		color: var(--green);
	}

	@media (prefers-reduced-motion: no-preference) {
		.hxp-fill {
			transition:
				width 480ms cubic-bezier(0.22, 1, 0.36, 1),
				background-color 480ms ease;
		}
		.hxp.is-complete .hxp-fill {
			animation: hxp-gloss 1400ms ease-out 1 both;
		}
		.hxp.is-complete .hxp-stage {
			animation: hxp-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 1 both;
		}
	}
	@keyframes hxp-gloss {
		from {
			background-position:
				-100% 0,
				0 0;
		}
		to {
			background-position:
				200% 0,
				0 0;
		}
	}
	@keyframes hxp-pop {
		0% {
			transform: scale(0.94);
		}
		60% {
			transform: scale(1.06);
		}
		100% {
			transform: none;
		}
	}

	@media (max-width: 480px) {
		.hxp-num {
			font-size: 2.2rem;
		}
		.hxp-words {
			flex-basis: 100%;
		}
	}
</style>
