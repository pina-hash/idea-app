<script lang="ts">
	/**
	 * A UNIT'S FRONT ELEVATION -- the last ten feet. Compartments stacked top to
	 * bottom at their typed heights, with at most one marked in gold and at
	 * most one marked "here".
	 *
	 * DRAWN IN PROPORTION, BUT NEVER BELOW A TAPPABLE ROW. Each slot's height is
	 * its share of the typed total, which is what makes a 3in drawer read as a
	 * drawer and a 12in bay read as a bay -- and then `min-height` puts a 44px
	 * floor under every one of them, because unlike a plan shape a compartment
	 * row IS the control. The proportion survives everywhere it can and the
	 * floor wins where it cannot; a stack of ten 1in drawers is a list of
	 * equal-looking rows rather than ten 4px slivers nobody can hit.
	 *
	 * IN THE MAP PANE THE STACK GROWS TO THE PANE (`fill`), and the proportion
	 * survives that too: every slot's `flex-grow` is its weight, so the free
	 * height is shared in the same ratio the minimums already are. A flex
	 * column with no height distributes nothing, which is why the pixel
	 * minimums stay -- they are the drawing on a phone, where the column has
	 * no height to give.
	 *
	 * A COMPARTMENT WITH NO TYPED HEIGHT STILL GETS A ROW. The editor's own
	 * stack sorts an unplaced compartment to the bottom rather than dropping it
	 * (`mapsElevationStack`), for the reason a map cannot omit things; this
	 * draws it at the floor height and says its height is unrecorded, rather
	 * than inventing one.
	 */
	import type { MapsElevationSlot } from '../maps';
	import { formatInches } from '../maps';

	let {
		slots,
		unitName,
		markId = null,
		hereId = null,
		hotId = null,
		onhot = null,
		hrefFor,
		fill = false
	}: {
		slots: MapsElevationSlot[];
		unitName: string;
		markId?: string | null;
		/** The compartment that is OPEN, when the pane shows its unit's elevation. */
		hereId?: string | null;
		hotId?: string | null;
		onhot?: ((id: string | null) => void) | null;
		hrefFor: (slot: MapsElevationSlot) => string;
		fill?: boolean;
	} = $props();

	/**
	 * THE NOMINAL STACK HEIGHT, IN PIXELS, AND IT IS A CONSTANT ON PURPOSE.
	 * A unit's real height is inches and the screen's is pixels, so something
	 * has to set the exchange rate; a viewport calculation would be the wrong
	 * one twice over -- CLAUDE.md forbids `100vh - <constant>` on a surface
	 * that is not the top of the page, and this component is mounted inside
	 * somebody else's column. 420px is a drawing tall enough for a ten-slot
	 * chest and short enough that a two-slot cabinet still fits a phone
	 * screen beside the list.
	 */
	const STACK_PX = 420;
	const FLOOR_PX = 44;

	const sized = $derived(slots.filter((s) => s.heightIn !== null));
	const sizedTotal = $derived(sized.reduce((sum, s) => sum + (s.heightIn ?? 0), 0));
	/**
	 * An UNSIZED slot is given the average of the sized ones rather than zero
	 * or one: it is a real compartment of unknown depth, and drawing it as a
	 * sliver would be the drawing making a claim the data does not support in
	 * the other direction. What it is NOT given is a made-up number in the
	 * label -- the row says "height not recorded" in words.
	 */
	const weight = (slot: MapsElevationSlot) =>
		slot.heightIn !== null
			? slot.heightIn
			: sized.length > 0
				? sizedTotal / sized.length
				: 1;
	const total = $derived(slots.reduce((sum, s) => sum + weight(s), 0));

	/**
	 * A SLOT'S DRAWN HEIGHT: its share of the stack, never below the tap
	 * floor. Both halves are load-bearing and they genuinely conflict -- a
	 * stack of ten one-inch drawers is ten 42px slivers in proportion and ten
	 * untappable rows in practice -- so the proportion survives everywhere it
	 * can and the floor wins where it cannot. `flex-grow` alone could not do
	 * this: a flex column with no height distributes nothing, and every row
	 * came back at exactly the floor (measured on the harness: 45/45/45 for a
	 * 3in, a 9in and an unsized slot).
	 */
	const slotPx = (slot: MapsElevationSlot) =>
		total > 0 ? Math.max(FLOOR_PX, Math.round((weight(slot) / total) * STACK_PX)) : FLOOR_PX;
	/** The elevation's typed width, for the sheet's caption. */
	const widthIn = $derived(
		slots.reduce<number | null>((w, s) => (s.widthIn !== null ? Math.max(w ?? 0, s.widthIn) : w), null)
	);
	const heightIn = $derived(sized.length === slots.length && slots.length > 0 ? sizedTotal : null);
</script>

<figure class="mv-elev-sheet" class:is-fill={fill}>
	<div
		class="mv-elev"
		data-testid="maps-viewer-stack"
		aria-label={`Front elevation of ${unitName}`}
	>
		{#each slots as slot (slot.node.id)}
			{@const here = slot.node.id === hereId}
			<a
				class="mv-slot"
				class:is-marked={slot.node.id === markId}
				class:is-here={here}
				class:is-hot={slot.node.id === hotId}
				href={hrefFor(slot)}
				style={`min-height:${slotPx(slot)}px;flex-grow:${weight(slot)}`}
				data-marked={slot.node.id === markId ? '' : undefined}
				data-here={here ? '' : undefined}
				data-node={slot.node.id}
				onpointerenter={() => onhot?.(slot.node.id)}
				onpointerleave={() => onhot?.(null)}
				onfocus={() => onhot?.(slot.node.id)}
				onblur={() => onhot?.(null)}
			>
				<span class="mv-slot-name">{slot.name}</span>
				<span class="mv-slot-meta">
					{#if here}<span class="mv-slot-here">you are here</span>{/if}
					{#if slot.subtype}<span class="mv-slot-kind">{slot.subtype}</span>{/if}
					{#if slot.heightIn !== null}
						<span>{formatInches(slot.heightIn)} in</span>
					{:else}
						<span class="mv-slot-unsized">height not recorded</span>
					{/if}
				</span>
			</a>
		{/each}
	</div>
	<figcaption>
		<span class="mv-elev-name">{unitName}, from the front</span>
		{#if widthIn !== null || heightIn !== null}
			<span class="mv-elev-dim">
				{#if widthIn !== null}{formatInches(widthIn)} wide{/if}{#if widthIn !== null && heightIn !== null},
				{/if}{#if heightIn !== null}{formatInches(heightIn)} tall{/if}, in inches
			</span>
		{/if}
	</figcaption>
</figure>

<style>
	.mv-elev-sheet {
		margin: 0;
		min-width: 0;
	}
	.mv-elev {
		display: flex;
		flex-direction: column;
		gap: 2px;
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2, #161a18);
		padding: 2px;
	}
	/* THE MAP PANE, above the application breakpoint only: the sheet is
	   centred on the blueprint ground at a width a toolbox actually has, and
	   the stack takes the height there is. Below it the sheet is a block in
	   the document at the phone's full width. */
	@media (min-width: 1024px) {
		.mv-elev-sheet.is-fill {
			height: 100%;
			min-height: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: var(--space-5) var(--space-5) var(--space-8);
			box-sizing: border-box;
			overflow-y: auto;
		}
		.mv-elev-sheet.is-fill .mv-elev {
			width: min(100%, 40rem);
			flex: 1 1 auto;
			min-height: 0;
		}
		.mv-elev-sheet.is-fill figcaption {
			width: min(100%, 40rem);
			flex: none;
		}
	}
	.mv-slot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		/* The floor is declared here as well as computed above: an inline
		   min-height is what carries the PROPORTION, and this is what holds
		   when a slot has none to carry (a stack of one). */
		min-height: 44px;
		flex-basis: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--mv-shape-fill);
		border: 1px solid var(--mv-accent);
		border-radius: 2px;
		color: var(--text-1, #e7eae8);
		text-decoration: none;
		font-family: var(--font-display);
	}
	.mv-slot:hover,
	.mv-slot:focus-visible,
	.mv-slot.is-hot {
		background: var(--mv-shape-fill-hover);
		border-color: var(--mv-accent-strong);
	}
	.mv-slot.is-here {
		background: var(--mv-shape-fill-hover);
		border-width: 2px;
		border-color: var(--mv-accent-strong);
	}
	.mv-slot.is-marked {
		background: var(--mv-mark-fill);
		border-color: var(--mv-mark);
		border-width: 2px;
		color: var(--mv-mark-ink);
	}
	.mv-slot-name {
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mv-slot-meta {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, #9aa49d);
	}
	.mv-slot.is-marked .mv-slot-meta {
		color: var(--mv-mark-ink);
	}
	.mv-slot-here {
		color: var(--mv-accent-ink);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.mv-slot-kind {
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.mv-slot-unsized {
		font-style: italic;
	}
	figcaption {
		margin-top: var(--space-1);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, #9aa49d);
	}
	.mv-elev-name {
		color: var(--text-1, #e7eae8);
		font-weight: 600;
	}
</style>
