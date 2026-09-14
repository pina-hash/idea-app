<script lang="ts">
	/**
	 * The PropertyManager: the selected node's parameters. Ordinary values commit
	 * on blur, Enter, or the end of a scrub; the confirm pair remains for the
	 * structural station and build-order changes that need a deliberate boundary.
	 *
	 * IT REPLACES THE TREE IN THE SAME PANE (0145 PART 5) rather than opening
	 * beside it, which is what SolidWorks does and what the 300px pane has room
	 * for. Closing it is Escape or the red X, and both are the SAME cancel the
	 * viewport's own pair calls -- two spellings of "revert the preview" is the
	 * pair that stops agreeing.
	 *
	 * EVERY BOUND IS READ FROM `panelFor`, never typed into the markup, so a
	 * slider cannot offer a value the readouts rail then calls FAIL with nothing
	 * on screen to say why.
	 *
	 * THE REORDER CONTROLS LIVE HERE, on the selection, rather than as a pair
	 * per row: twelve 44px controls in a 300px pane is a tree nobody can read,
	 * and a refusal ("built on X, cannot move above it") needs somewhere to be
	 * said, which a 44px glyph does not have.
	 */
	import type { Station } from '../blade/tree';
	import {
		MAX_STATIONS,
		MIN_STATIONS,
		stationsCanAdd,
		stationsCanRemove,
		type PmPanel
	} from './feature-model';
	import ProfilePreview from './ProfilePreview.svelte';

	let {
		panel,
		dirty = false,
		canMoveUp = false,
		canMoveDown = false,
		refusal = null,
		readOnly = false,
		onfield,
		onstation,
		onaddstation,
		onremovestation,
		onmove,
		onaccept,
		oncancel,
		onclose
	}: {
		panel: PmPanel;
		dirty?: boolean;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		refusal?: string | null;
		readOnly?: boolean;
		onfield: (key: string, value: number | string) => void;
		onstation: (index: number, axis: 'r' | 'z', value: number) => void;
		onaddstation: (index: number) => void;
		onremovestation: (index: number) => void;
		onmove: (direction: -1 | 1) => void;
		onaccept: () => void;
		oncancel: () => void;
		onclose: () => void;
	} = $props();

	const stations = $derived<Station[]>(panel.stations ?? []);
	/* Materials and Standard Parts are nodes, not features, so they have no place
	   in the build order and no reorder pair. */
	const reorderable = $derived(panel.id !== 'materials' && panel.id !== 'standard-parts');

	/** A number field reports a real number or nothing at all. `bind:value` on a
	 *  number input coerces, and an empty box coerces to NaN -- which would write
	 *  NaN into a saved document and take every readout with it. */
	function number(e: Event, then: (n: number) => void) {
		const raw = (e.currentTarget as HTMLInputElement).value;
		if (raw.trim() === '') return;
		const n = Number(raw);
		if (Number.isFinite(n)) then(n);
	}

	function acceptAfter(update: () => void) {
		update();
		queueMicrotask(onaccept);
	}

	function remember(input: HTMLInputElement) {
		input.dataset.startValue = input.value;
	}

	function commitNumber(input: HTMLInputElement, then: (n: number) => void) {
		const raw = input.value;
		if (raw.trim() === '') return;
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		acceptAfter(() => then(value));
		input.dataset.startValue = input.value;
	}

	function numberKey(e: KeyboardEvent, then: (n: number) => void) {
		const input = e.currentTarget as HTMLInputElement;
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			commitNumber(input, then);
			input.blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			input.value = input.dataset.startValue ?? input.defaultValue;
			number({ currentTarget: input } as unknown as Event, then);
			input.blur();
		}
	}

	function scrub(e: PointerEvent, then: (n: number) => void) {
		if (e.button !== 0 || readOnly) return;
		const input = e.currentTarget as HTMLInputElement;
		remember(input);
		const startX = e.clientX;
		const start = Number(input.value);
		const step = Number(input.step) || 1;
		let moved = false;
		input.setPointerCapture(e.pointerId);
		input.focus();
		const move = (event: PointerEvent) => {
			const dx = event.clientX - startX;
			if (Math.abs(dx) < 3) return;
			moved = true;
			const fine = event.shiftKey ? 0.1 : 1;
			const min = input.min === '' ? -Infinity : Number(input.min);
			const max = input.max === '' ? Infinity : Number(input.max);
			const value = Math.min(max, Math.max(min, start + dx * step * fine));
			const decimals = Math.min(6, Math.max(0, (step.toString().split('.')[1] ?? '').length + (fine < 1 ? 1 : 0)));
			input.value = String(Number(value.toFixed(decimals)));
			then(Number(input.value));
		};
		const up = () => {
			input.removeEventListener('pointermove', move);
			input.removeEventListener('pointerup', up);
			input.removeEventListener('pointercancel', up);
			if (moved) commitNumber(input, then);
		};
		input.addEventListener('pointermove', move);
		input.addEventListener('pointerup', up);
		input.addEventListener('pointercancel', up);
	}

	/** The form preserves explicit Accept for structural edits. Numeric inputs
	 * claim Enter and Escape themselves; Escape stops before the editor-wide
	 * handler so reverting one field never discards unrelated structural work. */
	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!readOnly) onaccept();
	}
</script>

<form class="pm" data-testid="ideacad-property-manager" onsubmit={submit} aria-labelledby="pm-label">
	<header>
		<h3 id="pm-label">{panel.label}</h3>
		<button type="button" class="back" onclick={onclose}>Feature tree</button>
	</header>

	<h4>Parameters</h4>

	{#each panel.fields as field (field.key)}
		{#if field.kind === 'number'}
			<label class="field">
				<span class="lab">{field.label}</span>
				<span class="number-control"><span class="scrub-mark" aria-hidden="true">↔</span><input
					type="number"
					value={field.value}
					min={field.min}
					max={field.max}
					step={field.step}
					disabled={readOnly}
					title="Drag horizontally or type"
					oninput={(e) => number(e, (n) => onfield(field.key, n))}
					onfocus={(e) => remember(e.currentTarget)}
					onblur={(e) => commitNumber(e.currentTarget, (n) => onfield(field.key, n))}
					onkeydown={(e) => numberKey(e, (n) => onfield(field.key, n))}
					onpointerdown={(e) => scrub(e, (n) => onfield(field.key, n))}
				/>{#if field.unit}<i>{field.unit}</i>{/if}</span>
			</label>
			{#if field.slider}
				<input
					class="slider"
					type="range"
					value={field.value}
					min={field.min}
					max={field.max}
					step={field.step}
					disabled={readOnly}
					aria-label={`${field.label} slider`}
					oninput={(e) => number(e, (n) => onfield(field.key, n))}
					onchange={() => queueMicrotask(onaccept)}
				/>
				<p class="range">{field.min} to {field.max}{#if field.unit}&nbsp;{field.unit}{/if}</p>
			{/if}
		{:else if field.kind === 'choice'}
			<label class="field">
				<span class="lab">{field.label}</span>
				<select
					value={field.value}
					disabled={readOnly}
					onchange={(e) => acceptAfter(() => onfield(field.key, e.currentTarget.value))}
				>
					{#each field.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
				</select>
			</label>
		{:else}
			<div class="field fact">
				<span class="lab">{field.label}</span>
				<span class="val">{field.value} <i>{field.note}</i></span>
			</div>
		{/if}
	{/each}

	{#if panel.stations}
		<div class="stations">
			<table>
				<caption>Stations, {MIN_STATIONS} to {MAX_STATIONS}, heights increasing</caption>
				<thead><tr><th scope="col">#</th><th scope="col">r (in)</th><th scope="col">z (in)</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
				<tbody>
					{#each stations as station, i (i)}
						<tr>
							<th scope="row">{i + 1}</th>
							<td>
								<input
									type="number"
									step="0.005"
									min="0"
									value={station.r}
									disabled={readOnly}
									aria-label={`Station ${i + 1} radius`}
									title="Drag horizontally or type"
									oninput={(e) => number(e, (n) => onstation(i, 'r', n))}
									onfocus={(e) => remember(e.currentTarget)}
									onblur={(e) => commitNumber(e.currentTarget, (n) => onstation(i, 'r', n))}
									onkeydown={(e) => numberKey(e, (n) => onstation(i, 'r', n))}
									onpointerdown={(e) => scrub(e, (n) => onstation(i, 'r', n))}
								/>
							</td>
							<td>
								<input
									type="number"
									step="0.005"
									value={station.z}
									disabled={readOnly}
									aria-label={`Station ${i + 1} height`}
									title="Drag horizontally or type"
									oninput={(e) => number(e, (n) => onstation(i, 'z', n))}
									onfocus={(e) => remember(e.currentTarget)}
									onblur={(e) => commitNumber(e.currentTarget, (n) => onstation(i, 'z', n))}
									onkeydown={(e) => numberKey(e, (n) => onstation(i, 'z', n))}
									onpointerdown={(e) => scrub(e, (n) => onstation(i, 'z', n))}
								/>
							</td>
							<td class="acts">
								{#if !readOnly}
									<button type="button" aria-label={`Add a station after ${i + 1}`} title={stationsCanAdd(stations.length) ? 'Add station' : `Maximum: ${MAX_STATIONS} stations`} aria-disabled={!stationsCanAdd(stations.length)} onclick={() => onaddstation(i)}>+</button>
									<button type="button" aria-label={`Remove station ${i + 1}`} title={stationsCanRemove(stations.length) ? 'Remove station' : `Minimum: ${MIN_STATIONS} stations`} aria-disabled={!stationsCanRemove(stations.length)} onclick={() => onremovestation(i)}>−</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<ProfilePreview {stations} />
		</div>
	{/if}

	{#if !readOnly}
		<div class="actions">
			<div class="confirm">
				<button type="submit" class="accept" aria-disabled={!dirty} title="Accept (Enter)">
					✓ <span>Accept</span>
				</button>
				<button type="button" class="cancel" onclick={oncancel} aria-disabled={!dirty} title="Cancel (Escape)">
					× <span>Cancel</span>
				</button>
			</div>
			{#if reorderable}
				<div class="reorder">
					<button type="button" onclick={() => onmove(-1)} aria-disabled={!canMoveUp}>Move up</button>
					<button type="button" onclick={() => onmove(1)} aria-disabled={!canMoveDown}>Move down</button>
				</div>
				<div class="feature-state" title="Name and deletion fixed">FIXED FEATURE</div>
			{/if}
			{#if refusal}<p class="refusal" role="status">{refusal}</p>{/if}
		</div>
	{/if}
</form>

<style>
	.pm {
		display: block;
	}
	header {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	h3 {
		margin: 0.15rem 0;
	}
	h4 {
		margin: 0.75rem 0 0.25rem;
		font: 700 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green);
	}
	button,
	input,
	select {
		min-height: 44px;
		min-width: 44px;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
	}
	button {
		padding: 0 0.7rem;
		cursor: pointer;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
		border-color: var(--hairline);
	}
	.confirm,
	.reorder {
		display: flex;
		gap: 0.4rem;
		margin: 0.5rem 0;
	}
	.confirm button {
		flex: 1 1 0;
	}
	.reorder button {
		flex: 1 1 0;
	}
	.accept {
		border-color: var(--green);
	}
	.cancel {
		border-color: var(--crimson);
	}
	.field {
		display: grid;
		grid-template-columns: 1fr minmax(6rem, auto);
		gap: 0.4rem;
		align-items: center;
		padding: 0.35rem 0;
	}
	.field input,
	.field select {
		width: 100%;
		padding: 0 0.5rem;
	}
	.number-control {
		display: grid;
		grid-template-columns: 1.2rem minmax(0, 1fr) 2.8rem;
		align-items: center;
		gap: 0.35rem;
	}
	.scrub-mark {
		color: var(--green);
		font-weight: 700;
		cursor: ew-resize;
	}
	.number-control input {
		font-size: 1.15rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-align: right;
		touch-action: none;
		cursor: ew-resize;
	}
	.number-control i {
		font: 12px 'Share Tech Mono', monospace;
		font-style: normal;
		color: var(--copper);
		text-align: left;
	}
	.lab {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.val i {
		font-style: normal;
		color: var(--copper);
		margin-left: 0.35rem;
	}
	.val {
		text-align: right;
	}
	.slider {
		width: 100%;
		padding: 0;
	}
	.range,
	.refusal {
		margin: 0.15rem 0 0.6rem;
		font: 12px 'Share Tech Mono', monospace;
		line-height: 1.5;
		color: var(--text-2);
	}
	.refusal {
		color: var(--amber);
	}
	.actions {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--hairline);
	}
	.feature-state {
		width: max-content;
		margin-top: 0.5rem;
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--hairline);
		border-radius: 2px;
		font: 10px 'Share Tech Mono', monospace;
		letter-spacing: 0.1em;
		color: var(--text-2);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.5rem;
	}
	caption {
		text-align: left;
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
		padding-bottom: 0.35rem;
	}
	th,
	td {
		padding: 0.15rem;
		text-align: left;
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
	}
	tbody th {
		color: var(--text-1);
	}
	td input {
		width: 100%;
		min-width: 0;
		padding: 0 0.3rem;
		font-size: 1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-align: right;
		touch-action: none;
		cursor: ew-resize;
	}
	.acts {
		display: flex;
		gap: 0.2rem;
	}
	.acts button {
		padding: 0;
		width: 44px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
