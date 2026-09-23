<script lang="ts">
	/**
	 * THE MOVE PANEL: typed offsets and a typed turn for the selected body,
	 * applied as a `transform` feature exactly as a triad drag is, and the
	 * snapping settings the drag reads.
	 *
	 * A typed move is the same feature a drag makes -- one `transform` row
	 * with a row-major matrix -- so the tree, the history and undo treat the
	 * two identically. The turn is about the body's centre of mass, which is
	 * the centre the triad turns about too (`SolidWorkspace.svelte`'s
	 * `gestureCenter`). The matrices are built the way `commandFor` builds
	 * them (a three.js matrix, transposed into row-major), so a typed 90° and
	 * a dragged 90° are the same sixteen numbers.
	 *
	 * SNAPPING AND FINE CONTROL are stated here and decided in
	 * `viewport/drag-math.ts`: the checkboxes write `snapSettings`, which is
	 * module-level and not reactive, so the panel keeps its own `$state`
	 * mirror for the screen and writes through -- the same arrangement as
	 * `features/options.ts`. The modifier sentences are `MODIFIER_WORDS`, one
	 * spelling.
	 *
	 * NOTHING IS CLAMPED. Every box is a text field with no min, max or step;
	 * a number that is not a number is refused in the student's terms, and a
	 * transform the kernel refuses is the kernel's own sentence in the feature
	 * row. Zero everywhere is refused as an empty form, not as a bad value.
	 */
	import { untrack } from 'svelte';
	import * as THREE from 'three';
	import type { WorkspaceApi } from './workspace-api';
	import type { Vec3 } from './types';
	import { snapSettings, MODIFIER_WORDS, ANGLE_STEP } from './viewport/drag-math';
	let { api }: { api: WorkspaceApi } = $props();
	let x = $state('0'), y = $state('0'), z = $state('0'), angle = $state('90'), about = $state<'X' | 'Y' | 'Z'>('Z');
	let references = $state(snapSettings.references), bodies = $state(snapSettings.bodies), angles = $state(snapSettings.angles);
	const shown = $derived(api.tool === 'move' || api.tool === 'rotate' || api.tool === 'scale');
	const bodyIds = $derived([...new Set(api.selections.map((s) => s.bodyId).filter(Boolean))]);
	const body = $derived(api.model.bodies.find((b) => b.id === bodyIds[0]));
	const number = (v: string) => (v.trim() === '' ? 0 : Number(v.trim()));
	const AXIS: Record<'X' | 'Y' | 'Z', Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
	/** The bodies a typed change applies to, or the sentence saying why none can. */
	function targets(): string[] | null {
		if (!bodyIds.length) { api.error('Select a body to move.'); return null; }
		return bodyIds;
	}
	function move() {
		const ids = targets(); if (!ids) return;
		const d: Vec3 = [number(x), number(y), number(z)];
		if (!d.every(Number.isFinite)) { api.error('Enter a distance in inches, like 0.5, in each box.'); return; }
		if (d.every((v) => v === 0)) { api.error('Enter how far to move in at least one direction.'); return; }
		const matrix = new THREE.Matrix4().makeTranslation(...d);
		void api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'transform', bodies: ids, matrix: matrix.transpose().toArray() } }, 'Move');
	}
	function rotate() {
		const ids = targets(); if (!ids) return;
		const a = number(angle);
		if (!Number.isFinite(a)) { api.error('Enter an angle in degrees, like 90.'); return; }
		if (a === 0) { api.error('Enter an angle other than 0.'); return; }
		const c = new THREE.Vector3(...(body?.centerOfMass ?? [0, 0, 0]));
		const matrix = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...AXIS[about]), (a * Math.PI) / 180);
		matrix.premultiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
		void api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'transform', bodies: ids, matrix: matrix.transpose().toArray() } }, 'Rotate');
	}
	/* Each box mirrors into the module-level settings the drag reads; the boxes are the only writer. */
	/* Settings changed while this panel is open (Preferences, Snaps) show here at once, not on the next open. */
	$effect(() => { const s = api.prefs?.snaps; if (!s) return; untrack(() => { if (references !== s.references) references = s.references; if (bodies !== s.bodies) bodies = s.bodies; if (angles !== s.angles) angles = s.angles; }); });
	/** A box ticked here is the student's setting too, so it survives a change made to any other group of settings. */
	const saveSnaps = (patch: Partial<{ references: boolean; bodies: boolean; angles: boolean }>) => api.setPreference?.('snaps', { references, bodies, angles, ...patch });
	$effect(() => { snapSettings.references = references; });
	$effect(() => { snapSettings.bodies = bodies; });
	$effect(() => { snapSettings.angles = angles; });
</script>
{#if shown}
	<section class="move panel" aria-label="Move and rotate" data-testid="ideacad-move-panel">
		<h2>Move and rotate</h2>
		<p class="state" role="status" data-testid="ideacad-move-target">{body ? `Moving ${body.name}${bodyIds.length > 1 ? ` and ${bodyIds.length - 1} more` : ''}` : 'Select a body, then drag a handle or type a distance.'}</p>
		<div class="row three">
			<label>X (in)<input inputmode="decimal" bind:value={x} data-testid="ideacad-move-x" /></label>
			<label>Y (in)<input inputmode="decimal" bind:value={y} data-testid="ideacad-move-y" /></label>
			<label>Z (in)<input inputmode="decimal" bind:value={z} data-testid="ideacad-move-z" /></label>
		</div>
		{#if api.canWrite}<button type="button" class="primary" onclick={move} disabled={api.busy} data-testid="ideacad-move-apply">Move by X, Y, Z</button>{/if}
		<div class="row two">
			<label>Angle (deg)<input inputmode="decimal" bind:value={angle} data-testid="ideacad-move-angle" /></label>
			<label>About<select value={about} onchange={(e) => (about = e.currentTarget.value as 'X' | 'Y' | 'Z')} data-testid="ideacad-move-about"><option value="X">X axis</option><option value="Y">Y axis</option><option value="Z">Z axis</option></select></label>
		</div>
		{#if api.canWrite}<button type="button" class="primary" onclick={rotate} disabled={api.busy} data-testid="ideacad-rotate-apply">Rotate about the centre</button>{/if}
		<h3>Snapping while dragging</h3>
		<label class="toggle"><input type="checkbox" bind:checked={references} onchange={(e) => saveSnaps({ references: e.currentTarget.checked })} data-testid="ideacad-snap-references" /><span>Snap to reference planes and axes</span></label>
		<label class="toggle"><input type="checkbox" bind:checked={bodies} onchange={(e) => saveSnaps({ bodies: e.currentTarget.checked })} data-testid="ideacad-snap-bodies" /><span>Snap to other bodies' faces and corners</span></label>
		<label class="toggle"><input type="checkbox" bind:checked={angles} onchange={(e) => saveSnaps({ angles: e.currentTarget.checked })} data-testid="ideacad-snap-angles" /><span>Snap turns to {ANGLE_STEP}° steps</span></label>
		<p class="hint" data-testid="ideacad-move-modifiers">{MODIFIER_WORDS.fine} {MODIFIER_WORDS.noSnap}</p>
	</section>
{/if}
<style>
	.move{display:grid;gap:8px}h2{margin:0;font-size:18px}h3{margin:6px 0 0;font-size:15px;color:var(--text-2);font-weight:600}
	.hint,.state{margin:0;color:var(--text-2);font-size:14px;line-height:1.4}.state{font:14px 'Share Tech Mono',monospace;color:var(--text-1)}
	.row{display:grid;gap:6px}.row.three{grid-template-columns:repeat(3,minmax(0,1fr))}.row.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
	label{display:grid;gap:4px;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}
	input,select{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;padding:0 8px}
	.toggle{display:flex;align-items:center;gap:8px;min-height:44px;color:var(--text-1);cursor:pointer}.toggle input{width:20px;height:20px;min-height:0;margin:0;flex-shrink:0}
	.move button{min-height:44px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif;cursor:pointer;width:100%}
	.move button.primary{border-color:var(--green);color:var(--green)}.move button:disabled{opacity:.4;cursor:default}
</style>
