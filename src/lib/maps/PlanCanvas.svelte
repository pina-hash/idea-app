<script lang="ts">
	/**
	 * DIMENSIONED SHAPE PLACEMENT -- spec 7's "typed inch dimensions, drag
	 * placement, snapping, parent assignment", and its one governing sentence:
	 * ACCURACY COMES FROM THE TYPED NUMBERS, NOT THE MOUSE.
	 *
	 * THE TYPED FIELD IS THE ONLY STORE OF THE VALUE, WHICH IS WHY A DRAG
	 * CANNOT OVERWRITE A DIMENSION. This component holds no position state of
	 * its own: it RENDERS `x`/`y`/`outline`/`rotationDeg` handed down from the
	 * form's own typed inputs, and a drag calls `onplace(x, y)` which the form
	 * writes back into those same inputs. So typing 12 moves the shape, and
	 * dragging types a number into the field -- one value, one place, and the
	 * disagreement the spec warns about is unrepresentable rather than
	 * resolved. `onplace` carries an X and a Y and NOTHING ELSE: there is no
	 * width or height anywhere in what a drag can produce, so no reachable
	 * pointer path can change a dimension.
	 *
	 * SNAPPING SAYS WHAT IT SNAPPED TO, in words, every time. A shape that
	 * silently jumped 0.4in is a shape whose typed number somebody will later
	 * find wrong with no way to know why; `mapsPlaceShape` names the target and
	 * the edge, and this surface prints that sentence beside the value.
	 *
	 * PARENT ASSIGNMENT IS NOT INFERRED FROM OVERLAP, and this surface says so
	 * where the overlap happens. Two shapes on top of each other are two things
	 * in one room, which is an ordinary state of an ordinary room; making the
	 * lower one a CHILD of the upper one would re-home an object because
	 * somebody dragged past it. Reparenting is the Inside picker, deliberately,
	 * and it is the picker the schema's own kind ladder constrains.
	 *
	 * EVERY DRAG HAS A KEYBOARD PATH. The shape is a real focusable button:
	 * arrow keys nudge it by the step chosen beside it (the same handler the
	 * nudge buttons call), and the snap a drag applies continuously is reachable
	 * as its own control. Nothing here is mouse-only.
	 *
	 * THE DRAWN SHAPE IS SMALLER THAN 44px ON PURPOSE, AND IT IS NOT THE
	 * CONTROL. It is a SCALE DRAWING: a 30in chest in a 400in room is 30/400 of
	 * the pane whatever anybody would prefer, and inflating it to clear a tap
	 * floor would make the drawing lie about the dimension it exists to show.
	 * The controls that move it -- the nudge pad, the snap control and the
	 * typed inputs above -- all clear 44px, so the floor is met by the
	 * interface rather than by distorting the plan.
	 */
	import {
		MAPS_KIND_LABELS,
		mapsEffectiveNodeContent,
		mapsFootprint,
		mapsPlaceShape,
		mapsShapeCorners,
		mapsSnapTargets,
		pendingFor,
		type MapsEditorData,
		type MapsNode,
		type MapsOutline
	} from './maps';

	let {
		selfId = null,
		selfName,
		parent,
		outline,
		rotationDeg,
		x,
		y,
		data,
		onplace
	}: {
		/** Null while the node is being created: it has no siblings to exclude yet. */
		selfId?: string | null;
		selfName: string;
		parent: MapsNode | null;
		/** The outline as the TYPED fields currently read. Never written here. */
		outline: MapsOutline | null;
		rotationDeg: number | null;
		x: number | null;
		y: number | null;
		data: MapsEditorData;
		/** Hands the new position back to the typed fields, with what it snapped to. */
		onplace: (next: { x: number; y: number; note: string }) => void;
	} = $props();

	/** Nudge steps, in inches. A whole inch and a sixteenth: the two a person
	    working from SolidWorks numbers actually reaches for. */
	const STEPS = [1, 0.0625] as const;
	let step = $state<number>(1);

	/* A pane that has not been laid out yet draws at a nominal width rather
	   than dividing by zero; the real width arrives on the first layout. */
	let paneWidth = $state(0);
	const NOMINAL_PX = 600;

	const parentOutline = $derived(parent?.outline ?? null);
	const parentBox = $derived(parentOutline ? mapsFootprint(parentOutline, null) : null);
	const footprint = $derived(outline ? mapsFootprint(outline, rotationDeg) : null);

	const planW = $derived(parentBox ? parentBox.maxX - parentBox.minX : 0);
	const planH = $derived(parentBox ? parentBox.maxY - parentBox.minY : 0);
	const pxPerInch = $derived.by(() => {
		if (planW <= 0) return 1;
		const width = paneWidth > 0 ? paneWidth : NOMINAL_PX;
		return width / planW;
	});

	const targets = $derived(mapsSnapTargets(data, parent, selfId));
	/* Siblings drawn as context: the same rows the snap targets come from,
	   minus the parent's own walls, so what is drawn and what is snapped to
	   cannot be two different sets. */
	const siblings = $derived(
		parent
			? data.nodes
					.filter((n) => n.parent_id === parent.id && n.id !== selfId)
					.map((n) => ({
						node: n,
						content: mapsEffectiveNodeContent(n, pendingFor(data.pending, 'maps_nodes', n.id))
					}))
					.filter((s) => s.content.outline && s.content.position_x_in !== null)
			: []
	);

	const placed = $derived(outline !== null && x !== null && y !== null);

	function pointsFor(o: MapsOutline, rot: number | null, box: { minX: number; minY: number }): string {
		return mapsShapeCorners(o, rot)
			.map(([px, py]) => `${(px - box.minX).toFixed(3)},${(py - box.minY).toFixed(3)}`)
			.join(' ');
	}

	let pane = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);
	let lastNote = $state<string | null>(null);

	/**
	 * A NUDGE DOES NOT SNAP, AND A DRAG DOES. That is one rule about where the
	 * imprecision is, not two behaviours: a pointer lands somewhere
	 * approximate, so a snap is the correction that makes it exact; an arrow
	 * key IS an exact number already, and snapping it would mean that beside an
	 * aligned neighbour the step silently did nothing and the shape read as
	 * stuck (measured, before this split existed: nudging down from a position
	 * flush with a sibling's top edge came straight back to it). Snapping stays
	 * reachable from the keyboard as its own deliberate control.
	 */
	function place(desiredX: number, desiredY: number, how: string, snap: boolean) {
		if (!footprint) return;
		const result = snap
			? mapsPlaceShape({
					desiredX,
					desiredY,
					footprint,
					targets,
					// A tolerance in PIXELS converted to inches, so the snap
					// feels the same at any scale rather than grabbing half a
					// room on a plan drawn small.
					toleranceIn: 7 / pxPerInch
				})
			: mapsPlaceShape({ desiredX, desiredY, footprint, targets: [], toleranceIn: 0 });
		const snaps: string[] = [];
		if (result.snapX) snaps.push(`X: ${result.snapX}`);
		if (result.snapY) snaps.push(`Y: ${result.snapY}`);
		const note =
			snaps.length > 0
				? `${how} to X ${result.x}in, Y ${result.y}in. Snapped ${snaps.join('; ')}.`
				: snap
					? `${how} to X ${result.x}in, Y ${result.y}in. Nothing was near enough to snap to.`
					: `${how} to X ${result.x}in, Y ${result.y}in, exactly. A nudge is arithmetic, not a snap: press Snap to nearest edge to snap it.`;
		lastNote = note;
		onplace({ x: result.x, y: result.y, note });
	}

	let origin = { pointerX: 0, pointerY: 0, x: 0, y: 0 };

	function onPointerDown(event: PointerEvent) {
		if (!placed || !footprint) return;
		dragging = true;
		origin = { pointerX: event.clientX, pointerY: event.clientY, x: x ?? 0, y: y ?? 0 };
		/* Pointer capture is an ENHANCEMENT -- it keeps the drag alive when the
		   pointer leaves the small shape -- and it throws NotFoundError for a
		   pointer id the browser does not consider active, which is every
		   synthesized event a verification run dispatches. A failure to capture
		   must not be a failure to drag. */
		try {
			(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		} catch {
			/* no capture: the drag still tracks while the pointer is over the shape */
		}
		event.preventDefault();
	}
	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const dx = (event.clientX - origin.pointerX) / pxPerInch;
		const dy = (event.clientY - origin.pointerY) / pxPerInch;
		place(origin.x + dx, origin.y + dy, 'Dragged', true);
	}
	function onPointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		} catch {
			/* nothing was captured */
		}
	}

	/** The keyboard path, and the nudge buttons' own handler: one function. */
	function nudge(dx: number, dy: number) {
		if (!placed) return;
		place((x ?? 0) + dx * step, (y ?? 0) + dy * step, 'Nudged', false);
	}
	function onKeyDown(event: KeyboardEvent) {
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		nudge(move[0], move[1]);
	}
	/** The snap a drag applies continuously, as a control a keyboard can press. */
	function snapNearest() {
		if (!placed) return;
		place(x ?? 0, y ?? 0, 'Snapped', true);
	}
</script>

<section class="plan" data-testid="maps-plan-canvas">
	<h3>Placement{#if parent} in {parent.name}{/if}</h3>

	{#if !parent}
		<p class="hint" data-testid="maps-plan-reason">
			A top-level container has no frame to be placed in. Its outline is the frame everything
			else is placed against.
		</p>
	{:else if !parentOutline}
		<p class="hint" data-testid="maps-plan-reason">
			{parent.name} has no outline yet, so there is nothing to place this against. Give the
			{MAPS_KIND_LABELS[parent.kind].toLowerCase()} a typed outline first.
		</p>
	{:else if !outline}
		<p class="hint" data-testid="maps-plan-reason">
			Type an outline above and this shape appears in {parent.name}'s plan, drawn to scale.
		</p>
	{:else if !placed}
		<p class="hint" data-testid="maps-plan-reason">
			Type a position X and Y above to place this shape in the plan. Until then it is a shape
			with a size and no location.
		</p>
	{/if}

	{#if parent && parentOutline && outline && footprint && parentBox}
		<p class="hint">
			Drawn to scale: 1 inch is {(pxPerInch).toFixed(2)}px at this width. Dragging moves the
			shape and never resizes it. The width and depth come from the typed dimensions above, and
			typing one moves the drawing.
		</p>
		<div class="pane" bind:this={pane} bind:clientWidth={paneWidth}>
			<div
				class="plan-frame"
				style="width: {planW * pxPerInch}px; height: {planH * pxPerInch}px"
				data-testid="maps-plan-frame"
			>
				{#each siblings as s (s.node.id)}
					{@const sf = mapsFootprint(s.content.outline!, s.content.rotation_deg)}
					<div
						class="sibling"
						data-testid="maps-plan-sibling"
						style="
							left: {((s.content.position_x_in ?? 0) + sf.minX - parentBox.minX) * pxPerInch}px;
							top: {((s.content.position_y_in ?? 0) + sf.minY - parentBox.minY) * pxPerInch}px;
							width: {(sf.maxX - sf.minX) * pxPerInch}px;
							height: {(sf.maxY - sf.minY) * pxPerInch}px;
						"
					>
						<svg viewBox="0 0 {sf.maxX - sf.minX} {sf.maxY - sf.minY}" preserveAspectRatio="none" aria-hidden="true">
							<polygon points={pointsFor(s.content.outline!, s.content.rotation_deg, sf)} />
						</svg>
						<span class="sibling-name">{s.node.name}</span>
					</div>
				{/each}

				{#if placed}
					<button
						type="button"
						class="shape"
						class:dragging
						data-testid="maps-plan-shape"
						aria-label="{selfName}: drag to move, or use the arrow keys to nudge by {step} inch"
						style="
							left: {((x ?? 0) + footprint.minX - parentBox.minX) * pxPerInch}px;
							top: {((y ?? 0) + footprint.minY - parentBox.minY) * pxPerInch}px;
							width: {(footprint.maxX - footprint.minX) * pxPerInch}px;
							height: {(footprint.maxY - footprint.minY) * pxPerInch}px;
						"
						onpointerdown={onPointerDown}
						onpointermove={onPointerMove}
						onpointerup={onPointerUp}
						onpointercancel={onPointerUp}
						onkeydown={onKeyDown}
					>
						<svg
							viewBox="0 0 {footprint.maxX - footprint.minX} {footprint.maxY - footprint.minY}"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							<polygon points={pointsFor(outline, rotationDeg, footprint)} />
						</svg>
					</button>
				{/if}
			</div>
		</div>

		<p class="readout" data-testid="maps-plan-readout">
			<span class="readout-key">X</span> {x ?? 0}&Prime;
			<span class="readout-key">Y</span> {y ?? 0}&Prime;
			<span class="readout-key">footprint</span>
			{Math.round((footprint.maxX - footprint.minX) * 100) / 100}&Prime; &times;
			{Math.round((footprint.maxY - footprint.minY) * 100) / 100}&Prime;
			{#if rotationDeg}<span class="readout-key">rotated</span> {rotationDeg}&deg;{/if}
		</p>

		<div class="nudge" data-testid="maps-plan-nudge">
			<fieldset class="steps">
				<legend>Nudge step</legend>
				{#each STEPS as s (s)}
					<label class="step-option">
						<input type="radio" name="maps-plan-step" value={s} bind:group={step} />
						<span>{s}&Prime;</span>
					</label>
				{/each}
			</fieldset>
			<div class="pad">
				<button type="button" class="btn secondary pad-btn" onclick={() => nudge(0, -1)}>
					Up
				</button>
				<button type="button" class="btn secondary pad-btn" onclick={() => nudge(-1, 0)}>
					Left
				</button>
				<button type="button" class="btn secondary pad-btn" onclick={() => nudge(1, 0)}>
					Right
				</button>
				<button type="button" class="btn secondary pad-btn" onclick={() => nudge(0, 1)}>
					Down
				</button>
				<button type="button" class="btn secondary pad-btn" onclick={snapNearest}>
					Snap to nearest edge
				</button>
			</div>
		</div>

		<p class="snap-note" role="status" data-testid="maps-plan-snap-note">
			{#if lastNote}{lastNote}{:else}
				Nothing moved yet. A drag, a nudge or a snap says here exactly what it landed on.
			{/if}
		</p>

		<p class="hint" data-testid="maps-plan-parent-note">
			Dragging this shape over another one does not put it inside it. Two shapes overlapping are
			two things in one {MAPS_KIND_LABELS[parent.kind].toLowerCase()}. What this shape is inside
			is the Inside picker above, which offers only containers whose kind may hold it.
		</p>
	{/if}
</section>

<style>
	.plan {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
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
	.pane {
		min-width: 0;
		width: 100%;
		overflow-x: auto;
	}
	.plan-frame {
		position: relative;
		border: 1px solid var(--boundary);
		border-radius: 2px;
		background: var(--bg0);
		flex: 0 0 auto;
	}
	.sibling {
		position: absolute;
		display: block;
		color: var(--text-2, var(--dim));
	}
	.sibling svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.sibling polygon {
		fill: var(--bg2);
		stroke: var(--boundary);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.sibling-name {
		position: absolute;
		left: 2px;
		top: 1px;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		line-height: 1;
		white-space: nowrap;
		color: var(--text-2, var(--dim));
		pointer-events: none;
	}
	.shape {
		position: absolute;
		padding: 0;
		margin: 0;
		border: 0;
		background: transparent;
		cursor: grab;
		touch-action: none;
	}
	.shape.dragging {
		cursor: grabbing;
	}
	.shape svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.shape polygon {
		fill: color-mix(in srgb, var(--maps-accent, var(--green)) 30%, transparent);
		stroke: var(--maps-accent, var(--green));
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.shape:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.readout {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--white);
	}
	.readout-key {
		color: var(--cyan);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.68rem;
		margin-left: 0.5rem;
	}
	.readout-key:first-child {
		margin-left: 0;
	}
	.nudge {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: flex-start;
	}
	.steps {
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
		padding: 0.3rem 0.6rem 0.5rem;
		margin: 0;
		min-width: 0;
	}
	legend {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
		padding: 0 0.2rem;
	}
	.step-option {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding-right: 0.6rem;
		color: var(--white);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.step-option input {
		width: 20px;
		height: 20px;
		accent-color: var(--maps-accent, var(--green));
	}
	.pad {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pad-btn {
		min-height: 44px;
		min-width: 44px;
		padding: 0.5rem 0.9rem;
	}
	.snap-note {
		margin: 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		color: var(--white);
		font-size: 0.82rem;
	}
</style>
