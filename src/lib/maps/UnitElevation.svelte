<script lang="ts">
	/**
	 * THE FRONT ELEVATION OF ONE UNIT -- spec 7's "elevation editor per unit:
	 * stack compartments with typed heights, name them".
	 *
	 * A STACK IS DRAWN AS A STACK, NOT LISTED AS AN ORDERED LIST. Somebody
	 * standing in front of the toolbox has to recognise what is on screen, so
	 * each slot's drawn height is PROPORTIONAL to its typed height and the
	 * slots sit on top of each other in slot order, widest at the unit's own
	 * width. A list that happened to be sorted would answer "which drawer is
	 * third" and not "which drawer is the deep one", which is the question
	 * being asked in front of the unit.
	 *
	 * THE TYPED NUMBER IS THE DRAWING'S SOURCE, NEVER THE OTHER WAY ROUND.
	 * Nothing here is draggable and no slot can be resized by pointer: the
	 * drawn box is a rendering OF `elevation_h_in`, so the only way to change a
	 * height is to type one. That is the same rule the plan canvas states from
	 * the other side (a drag positions, a typed dimension defines) -- here
	 * there is simply no drag at all to have to constrain.
	 *
	 * REORDERING NEVER RETYPES A HEIGHT. The array position IS the order and
	 * `elevation_order` is derived from it at save time (`mapsElevationWrites`),
	 * so Move up carries the slot's own typed inches with it and writes only
	 * the rows whose number actually moved.
	 *
	 * DRAFT PER OBJECT (spec 4.3) SURVIVES THE BATCH. Each slot is its own
	 * `maps_nodes` row and each write goes through `mapsSaveObject`, the same
	 * one decision every other maps form calls: a draft compartment is updated
	 * in place, a PUBLISHED one has its edit staged as a pending revision and
	 * the public keeps seeing the old stack until somebody publishes. The panel
	 * batches the PRESS, never the rule -- and says so in words, because a
	 * person who reordered a published stack and walked away should know the
	 * map has not moved yet.
	 */
	import { onMount, untrack } from 'svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import {
		formatInches,
		mapsElevationStack,
		mapsElevationWrites,
		mapsMoveSlot,
		mapsPublishState,
		mapsStackTotals,
		parseInches,
		type MapsEditorData,
		type MapsElevationDraft,
		type MapsFormHandle,
		type MapsNode
	} from './maps';
	import { mapsSaveObject, type MapsTransports } from './transports';
	import MapsStatusChip from './MapsStatusChip.svelte';

	let {
		unit,
		data,
		transports,
		onchanged,
		onselectnode,
		onaddchild,
		registerForm
	}: {
		unit: MapsNode;
		data: MapsEditorData;
		transports: MapsTransports;
		onchanged: () => Promise<void>;
		onselectnode: (id: string) => void;
		onaddchild: (parentId: string, presetKind: 'compartment') => void;
		registerForm: (key: string, handle: MapsFormHandle | null) => void;
	} = $props();

	/* Keyed per selection by the shell, so reading the id once at init is a
	   deliberate capture: untrack says so. */
	const formKey = untrack(() => `elevation:${unit.id}`);

	/* The stack as STORED, resolved against the current data on every read --
	   never a snapshot taken at click time, so a slot added or published
	   elsewhere in the editor is here on the next render. */
	const stored = $derived(mapsElevationStack(data, unit.id));

	/* The stack as EDITED. Seeded once from the stored order (deliberate
	   capture, so: untrack) and thereafter owned by this panel, because a
	   reorder that reset itself on every reload would be unusable. */
	let rows = $state<MapsElevationDraft[]>(
		untrack(() =>
			mapsElevationStack(data, unit.id).map((slot) => ({
				id: slot.node.id,
				name: slot.name,
				heightIn: slot.heightIn,
				widthIn: slot.widthIn
			}))
		)
	);
	/* The typed TEXT, kept beside the parsed value: an input holding "3." is
	   mid-typing, not a bad number, and rewriting it under the person's cursor
	   is how a field fights back. */
	let heightText = $state<Record<string, string>>(
		untrack(() =>
			Object.fromEntries(
				mapsElevationStack(data, unit.id).map((s) => [s.node.id, formatInches(s.heightIn)])
			)
		)
	);
	let widthText = $state<Record<string, string>>(
		untrack(() =>
			Object.fromEntries(
				mapsElevationStack(data, unit.id).map((s) => [s.node.id, formatInches(s.widthIn)])
			)
		)
	);

	/* A compartment created or deleted while this panel is open: adopt it
	   without discarding the reorder in progress. Appending a new id at the
	   bottom is the honest place for it -- it has no slot yet. */
	$effect(() => {
		const ids = stored.map((s) => s.node.id);
		untrack(() => {
			const known = new Set(rows.map((r) => r.id));
			const gone = new Set(ids);
			const kept = rows.filter((r) => gone.has(r.id));
			const added = stored
				.filter((s) => !known.has(s.node.id))
				.map((s) => ({
					id: s.node.id,
					name: s.name,
					heightIn: s.heightIn,
					widthIn: s.widthIn
				}));
			for (const entry of added) {
				heightText[entry.id] = formatInches(entry.heightIn);
				widthText[entry.id] = formatInches(entry.widthIn);
			}
			if (kept.length !== rows.length || added.length > 0) rows = [...kept, ...added];
		});
	});

	const slotById = $derived(new Map(stored.map((s) => [s.node.id, s])));

	const signature = () =>
		JSON.stringify(
			rows.map((r) => [r.id, r.name.trim(), heightText[r.id] ?? '', widthText[r.id] ?? ''])
		);
	const baseline = new EditBaseline();
	baseline.seed(signature());

	/** The draft as the writes function wants it: parsed inches, in stack order. */
	const draft = $derived<MapsElevationDraft[]>(
		rows.map((r) => {
			const h = parseInches(heightText[r.id] ?? '');
			const w = parseInches(widthText[r.id] ?? '');
			return {
				id: r.id,
				name: r.name.trim(),
				heightIn: h.kind === 'value' ? h.value : null,
				widthIn: w.kind === 'value' ? w.value : null
			};
		})
	);

	const problems = $derived.by(() => {
		const out: string[] = [];
		for (const r of rows) {
			const label = r.name.trim() === '' ? 'A compartment' : `"${r.name.trim()}"`;
			if (r.name.trim() === '') out.push('Every compartment needs a name.');
			for (const [what, text] of [
				['height', heightText[r.id] ?? ''],
				['width', widthText[r.id] ?? '']
			] as const) {
				if (text.trim() === '') continue;
				const parsed = parseInches(text);
				if (parsed.kind !== 'value' || parsed.value <= 0) {
					out.push(`${label}: the ${what} must be a number of inches above zero.`);
				}
			}
		}
		return [...new Set(out)];
	});

	/* The drawing. A slot with no typed height is NOT drawn as a zero-height
	   sliver and NOT given a made-up one: it is drawn at the unsized band and
	   says so, because a compartment whose height nobody has measured is a real
	   state of a real toolbox and inventing 4 inches for it would be a drawing
	   that lies. */
	const totals = $derived(mapsStackTotals(stored));
	/* THE DRAWING IS PROPORTIONAL, AND WHERE IT CANNOT BE IT SAYS SO. The scale
	   is inches-to-pixels, capped so a two-drawer chest does not fill the pane
	   and floored so a whole stack still fits it -- one scale for every slot,
	   which is what makes two boxes' heights comparable at a glance. A slot
	   below the legibility floor is drawn AT the floor rather than as an
	   unreadable sliver, and that is the one case where the drawing stops being
	   to scale, so the surface states it in words instead of letting a reader
	   compare two boxes that no longer mean what they look like. */
	const UNSIZED_PX = 26;
	const MIN_PX = 22;
	const MAX_STACK_PX = 420;
	const MAX_PX_PER_INCH = 12;
	const pxPerInch = $derived.by(() => {
		const inches = draft.reduce((sum, d) => sum + (d.heightIn ?? 0), 0);
		if (inches <= 0) return MAX_PX_PER_INCH;
		return Math.min(MAX_PX_PER_INCH, MAX_STACK_PX / inches);
	});
	function slotPx(heightIn: number | null): number {
		if (heightIn === null) return UNSIZED_PX;
		return Math.max(MIN_PX, heightIn * pxPerInch);
	}
	/** Which slots the floor moved, so the sentence names them rather than hinting. */
	const flooredNames = $derived(
		draft
			.filter((d) => d.heightIn !== null && d.heightIn * pxPerInch < MIN_PX)
			.map((d) => d.name || 'an unnamed compartment')
	);

	let report = $state<{ total: number; saved: number; failures: { name: string; message: string }[] } | null>(
		null
	);
	let moveNotice = $state<string | null>(null);

	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'The elevation was not saved.',
		async save() {
			const writes = mapsElevationWrites(stored, draft);
			if (writes.length === 0) {
				baseline.advance(signature());
				return { ok: true };
			}
			const failures: { name: string; message: string }[] = [];
			let saved = 0;
			for (const write of writes) {
				// Per-object, through the ONE write decision: a draft row is
				// updated in place, a published one is staged as pending.
				const result = await mapsSaveObject(transports, {
					table: 'maps_nodes',
					row: write.row,
					// The content columns as a plain record: `mapsSaveObject`'s
					// patch/snapshot shape, which is deliberately untyped
					// because it serves four different tables.
					content: { ...write.content } as unknown as Record<string, unknown>,
					publishNow: false
				});
				if (result.ok) saved += 1;
				else failures.push({ name: write.name, message: result.message });
			}
			report = { total: writes.length, saved, failures };
			await onchanged();
			if (failures.length > 0) {
				return {
					ok: false,
					retryable: false,
					message: `Saved ${saved} of ${writes.length}. ${failures[0].name}: ${failures[0].message}`
				};
			}
			baseline.advance(signature());
			return { ok: true };
		}
	});
	$effect(() => save.attach());

	function touch() {
		if (baseline.changed(signature())) save.markDirty();
	}

	function move(index: number, delta: number) {
		const moved = rows[index];
		const target = index + delta;
		if (target < 0 || target >= rows.length) return;
		rows = mapsMoveSlot(rows, index, target);
		moveNotice = `Moved "${moved.name || 'the compartment'}" to slot ${target + 1} of ${rows.length}. Its typed height came with it. Save to write the new order.`;
		touch();
	}

	async function doSave() {
		if (problems.length > 0) return;
		save.markDirty();
		await save.saveNow();
	}

	const publishedCount = $derived(stored.filter((s) => s.node.status === 'published').length);

	onMount(() => {
		registerForm(formKey, {
			get label() {
				return `the front elevation of "${unit.name}"`;
			},
			dirty: () => save.dirty,
			flush: async () => {
				if (save.dirty && problems.length === 0) await doSave();
			}
		});
		return () => registerForm(formKey, null);
	});
</script>

<section class="elevation" data-testid="maps-unit-elevation">
	<h3>Front elevation</h3>
	<p class="hint">
		The side view for the last ten feet: this unit's compartments, stacked top to bottom, drawn
		from the height you type. Slot 1 is the top. Reordering carries each height with its
		compartment, so nothing has to be retyped.
	</p>

	{#if stored.length === 0}
		<p class="hint empty" data-testid="maps-elevation-empty">
			No compartments in this unit yet. Add one and it takes the top slot.
		</p>
		<button type="button" class="btn secondary" onclick={() => onaddchild(unit.id, 'compartment')}>
			Add compartment
		</button>
	{:else}
		<div class="stack-wrap">
			<div class="stack" data-testid="maps-elevation-stack" aria-hidden="true">
				{#each draft as slot (slot.id)}
					<div
						class="slot-draw"
						class:unsized={slot.heightIn === null}
						data-slot-id={slot.id}
						style="height: {slotPx(slot.heightIn)}px"
					>
						<span class="slot-draw-name">{slot.name || 'Unnamed'}</span>
						<span class="slot-draw-size">
							{#if slot.heightIn === null}no height yet{:else}{slot.heightIn}&Prime;{/if}
						</span>
					</div>
				{/each}
			</div>
			<p class="stack-total" data-testid="maps-elevation-total">
				{stored.length} compartment{stored.length === 1 ? '' : 's'}, {totals.totalIn}&Prime; of
				typed height{#if totals.unsized > 0}, {totals.unsized} with no height typed yet{/if}.
				{#if totals.widestIn !== null}Widest opening {totals.widestIn}&Prime;.{/if}
			</p>
			{#if flooredNames.length > 0}
				<p class="hint" data-testid="maps-elevation-floor-note">
					{flooredNames.join(', ')} {flooredNames.length === 1 ? 'is' : 'are'} drawn at the
					minimum readable height rather than to scale. Read the typed inches for
					{flooredNames.length === 1 ? 'it' : 'them'}, not the box.
				</p>
			{/if}
		</div>

		<ol class="slots" data-testid="maps-elevation-rows">
			{#each rows as row, i (row.id)}
				{@const slot = slotById.get(row.id)}
				<li class="slot">
					<div class="slot-head">
						<span class="slot-number">Slot {i + 1}</span>
						{#if slot}
							<MapsStatusChip state={mapsPublishState(slot.node, slot.pending)} />
						{/if}
						{#if slot?.subtype}<span class="slot-subtype">{slot.subtype}</span>{/if}
					</div>
					<div class="slot-fields">
						<div class="field">
							<label for="{formKey}-name-{row.id}">Name</label>
							<input
								id="{formKey}-name-{row.id}"
								type="text"
								bind:value={row.name}
								oninput={touch}
								autocomplete="off"
							/>
						</div>
						<div class="field">
							<label for="{formKey}-h-{row.id}">Height (in)</label>
							<input
								id="{formKey}-h-{row.id}"
								type="text"
								inputmode="decimal"
								bind:value={heightText[row.id]}
								oninput={touch}
								autocomplete="off"
							/>
						</div>
						<div class="field">
							<label for="{formKey}-w-{row.id}">Width (in)</label>
							<input
								id="{formKey}-w-{row.id}"
								type="text"
								inputmode="decimal"
								bind:value={widthText[row.id]}
								oninput={touch}
								autocomplete="off"
							/>
						</div>
					</div>
					<div class="slot-actions">
						<button
							type="button"
							class="btn secondary slot-btn"
							aria-disabled={i === 0}
							onclick={() => move(i, -1)}
						>
							Move up
						</button>
						<button
							type="button"
							class="btn secondary slot-btn"
							aria-disabled={i === rows.length - 1}
							onclick={() => move(i, 1)}
						>
							Move down
						</button>
						<button type="button" class="btn secondary slot-btn" onclick={() => onselectnode(row.id)}>
							Open
						</button>
					</div>
				</li>
			{/each}
		</ol>

		{#if moveNotice}
			<p class="notice" role="status" data-testid="maps-elevation-move-notice">{moveNotice}</p>
		{/if}

		{#if problems.length > 0}
			<ul class="problems" role="alert" data-testid="maps-elevation-problems">
				{#each problems as problem (problem)}<li>{problem}</li>{/each}
			</ul>
		{/if}

		<div class="actions">
			<button type="button" class="btn" aria-disabled={problems.length > 0} onclick={doSave}>
				Save elevation
			</button>
			<SaveIndicator state={save} />
			<button type="button" class="btn secondary" onclick={() => onaddchild(unit.id, 'compartment')}>
				Add compartment
			</button>
		</div>

		{#if publishedCount > 0}
			<p class="hint" data-testid="maps-elevation-publish-note">
				{publishedCount === 1
					? 'One of these compartments is'
					: `${publishedCount} of these compartments are`} already public. Saving here stages the
				change as a pending edit; the public map keeps the old elevation until you publish the
				compartment or this unit's subtree.
			</p>
		{/if}

		{#if report}
			<p class="notice" role="status" data-testid="maps-elevation-report">
				Saved {report.saved} of {report.total} compartment{report.total === 1 ? '' : 's'}.
				{#if report.failures.length === 0}Nothing else needed writing.{/if}
			</p>
			{#if report.failures.length > 0}
				<ul class="problems">
					{#each report.failures as f (f.name + f.message)}<li>{f.name}: {f.message}</li>{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.elevation {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		border-top: 1px solid var(--line);
		padding-top: 0.8rem;
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.stack-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg0);
		max-width: 22rem;
	}
	.slot-draw {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.5rem;
		overflow: hidden;
		border: 1px solid var(--maps-accent, var(--boundary));
		border-radius: 3px;
		background: var(--bg2);
		color: var(--white);
		font-size: 0.78rem;
	}
	.slot-draw.unsized {
		border-style: dashed;
		background: var(--bg1);
	}
	.slot-draw-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.slot-draw-size {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--cyan);
		flex: 0 0 auto;
	}
	.stack-total {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2, var(--dim));
	}
	.slots {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.slot {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
		padding: 0.6rem;
		background: var(--bg1);
		min-width: 0;
	}
	.slot-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.slot-number {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.slot-subtype {
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.slot-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(8.5rem, 100%), 1fr));
		gap: 0.6rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	input {
		/* The 375px overflow rule this surface already paid for once: an
		   input's intrinsic ~20-char width beats a grid track minimum. */
		width: 100%;
		min-width: 0;
		min-height: 44px;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
	}
	.slot-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.slot-btn {
		padding: 0.5rem 0.9rem;
		min-height: 44px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.notice {
		margin: 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		color: var(--white);
		font-size: 0.85rem;
	}
	.problems {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--crimson);
		font-size: 0.85rem;
	}
</style>
