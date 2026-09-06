<script lang="ts">
	/**
	 * A COMPARTMENT'S PLACE IN ITS UNIT, DRAWN. A compartment carries no plan
	 * geometry (the schema gives it none), so the sheet a room or a unit gets
	 * would be empty for it; what a compartment HAS is a slot in the unit's
	 * front elevation, and that is what this draws: the whole stack, top slot
	 * first, with the compartment being edited marked and drawn at the HEIGHT
	 * AND WIDTH CURRENTLY TYPED in the inspector rather than the stored ones --
	 * so typing 5 into the height field makes the drawer taller as it is typed,
	 * which is the same rule the plan sheet keeps one dimension over.
	 *
	 * READ-ONLY ON PURPOSE. The unit's own view carries the elevation EDITOR
	 * (`UnitElevation`), whose rows are the second place a compartment's height
	 * can be typed; mounting that editor here would put two editable copies of
	 * one number on one screen, and two copies of a value is the pair that stops
	 * agreeing. This is a drawing of the stack and nothing on it is a field.
	 *
	 * THE SCALE IS THE ELEVATION EDITOR'S OWN: the same inches-to-pixels ladder
	 * and the same legibility floor, so a stack reads the same size on the
	 * unit's sheet and on its compartment's. A slot with no typed height is
	 * drawn at the unsized band and says so, never at an invented height.
	 */
	import { mapsElevationStack, type MapsEditorData, type MapsNode } from './maps';

	let {
		unit,
		markId,
		liveHeightIn,
		liveWidthIn,
		liveName,
		liveOrder,
		data,
		onselect = undefined
	}: {
		/** The unit whose stack is drawn. */
		unit: MapsNode;
		/** The compartment being edited, marked on the drawing. Null while it is being created. */
		markId: string | null;
		/** The marked compartment's height and width AS TYPED right now; null falls back to the stored slot. */
		liveHeightIn: number | null;
		liveWidthIn: number | null;
		liveName: string;
		/** The typed slot order, so a compartment being re-slotted moves in the drawing. */
		liveOrder: number | null;
		data: MapsEditorData;
		onselect?: (id: string) => void;
	} = $props();

	const stored = $derived(mapsElevationStack(data, unit.id));

	type Slot = {
		id: string | null;
		name: string;
		heightIn: number | null;
		widthIn: number | null;
		order: number | null;
		marked: boolean;
	};
	/* The stack as it reads with the LIVE compartment substituted in, re-sorted
	   by the same total order the editor uses (order, then name), so a typed
	   slot number moves the marked box. A compartment being created is appended
	   as a marked slot with no order yet. */
	const slots = $derived.by<Slot[]>(() => {
		const rows: Slot[] = stored.map((s) => {
			const marked = s.node.id === markId;
			return {
				id: s.node.id,
				name: marked && liveName.trim() !== '' ? liveName.trim() : s.name,
				heightIn: marked ? liveHeightIn : s.heightIn,
				widthIn: marked ? liveWidthIn : s.widthIn,
				order: marked ? liveOrder : s.order,
				marked
			};
		});
		if (markId === null) {
			rows.push({
				id: null,
				name: liveName.trim() === '' ? 'New compartment' : liveName.trim(),
				heightIn: liveHeightIn,
				widthIn: liveWidthIn,
				order: liveOrder,
				marked: true
			});
		}
		return rows.sort((a, b) => {
			if (a.order === null && b.order === null) return a.name.localeCompare(b.name);
			if (a.order === null) return 1;
			if (b.order === null) return -1;
			if (a.order !== b.order) return a.order - b.order;
			return a.name.localeCompare(b.name);
		});
	});

	const UNSIZED_PX = 26;
	const MIN_PX = 22;
	const MAX_STACK_PX = 420;
	const MAX_PX_PER_INCH = 12;
	const pxPerInch = $derived.by(() => {
		const inches = slots.reduce((sum, s) => sum + (s.heightIn ?? 0), 0);
		if (inches <= 0) return MAX_PX_PER_INCH;
		return Math.min(MAX_PX_PER_INCH, MAX_STACK_PX / inches);
	});
	const slotPx = (h: number | null) => (h === null ? UNSIZED_PX : Math.max(MIN_PX, h * pxPerInch));
	const widest = $derived(slots.reduce<number | null>((w, s) => (s.widthIn === null ? w : w === null ? s.widthIn : Math.max(w, s.widthIn)), null));
	const total = $derived(Math.round(slots.reduce((sum, s) => sum + (s.heightIn ?? 0), 0) * 1000) / 1000);
	const unsized = $derived(slots.filter((s) => s.heightIn === null).length);
	const markedIndex = $derived(slots.findIndex((s) => s.marked));
</script>

<section class="sketch" data-testid="maps-elevation-sketch" aria-label="Front elevation of {unit.name}">
	<div class="head">
		<h3>Front elevation of {unit.name}</h3>
		<span class="meta">
			{slots.length} compartment{slots.length === 1 ? '' : 's'} &middot; {total}&Prime; typed
			{#if unsized > 0}&middot; {unsized} without a height{/if}
		</span>
	</div>
	<p class="hint">
		Compartments carry no plan geometry. This one is drawn in its unit's stack, {#if markedIndex >= 0}slot
			{markedIndex + 1} of {slots.length}, {/if}at the height and width typed in the inspector, and
		it moves as the slot order is typed. Slot 1 is the top. The stack itself is edited on the
		unit.
	</p>
	<div class="stack" data-testid="maps-elevation-sketch-stack">
		{#each slots as slot, i (slot.id ?? 'new')}
			{@const widthPct = widest && slot.widthIn ? Math.max(30, (slot.widthIn / widest) * 100) : 100}
			<div class="row">
				<span class="slot-no">{i + 1}</span>
				{#if slot.id && !slot.marked && onselect}
					<button
						type="button"
						class="slot"
						class:unsized={slot.heightIn === null}
						style="height: {slotPx(slot.heightIn)}px; width: {widthPct}%"
						onclick={() => onselect?.(slot.id!)}
						aria-label="{slot.name}, {slot.heightIn === null ? 'no height yet' : slot.heightIn + ' inches'}. Open it."
					>
						<span class="slot-name">{slot.name}</span>
						<span class="slot-size">{#if slot.heightIn === null}no height yet{:else}{slot.heightIn}&Prime;{/if}</span>
					</button>
				{:else}
					<div
						class="slot"
						class:marked={slot.marked}
						class:unsized={slot.heightIn === null}
						data-testid={slot.marked ? 'maps-elevation-sketch-marked' : undefined}
						style="height: {slotPx(slot.heightIn)}px; width: {widthPct}%"
					>
						<span class="slot-name">{slot.name}</span>
						<span class="slot-size">{#if slot.heightIn === null}no height yet{:else}{slot.heightIn}&Prime;{/if}{#if slot.widthIn !== null} &times; {slot.widthIn}&Prime;{/if}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</section>

<style>
	.sketch {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		color: var(--cyan);
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		background: var(--blueprint-bg, var(--bg0));
		box-shadow: var(--bevel-inset);
		max-width: 30rem;
	}
	.row {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
	}
	.slot-no {
		flex: 0 0 1.6rem;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2, var(--dim));
	}
	.slot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.5rem;
		overflow: hidden;
		border: 1px solid var(--boundary);
		border-radius: 3px;
		background: var(--bg2);
		color: var(--white);
		font: inherit;
		font-size: 0.78rem;
		text-align: left;
		box-sizing: border-box;
		min-width: 0;
	}
	button.slot {
		cursor: pointer;
	}
	button.slot:hover,
	button.slot:focus-visible {
		border-color: var(--green);
	}
	button.slot:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.slot.marked {
		border: 2px solid var(--maps-accent, var(--green));
		background: color-mix(in srgb, var(--maps-accent, var(--green)) 24%, var(--bg2));
	}
	.slot.unsized {
		border-style: dashed;
		background: var(--bg1);
	}
	.slot-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.slot-size {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--cyan);
		flex: 0 0 auto;
	}
</style>
