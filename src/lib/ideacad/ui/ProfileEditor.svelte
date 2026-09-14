<script lang="ts">
	import type { Station } from '../blade/tree';
	import {
		addProfileStation,
		deleteProfileStation,
		dragProfileStation,
		PROFILE_MAX_STATIONS,
		PROFILE_MIN_STATIONS,
		profileScale,
		stationToScreen
	} from './profile-drag';

	let { stations, readOnly = false, onstation, onstations, oncommit }: {
		stations: Station[];
		readOnly?: boolean;
		onstation: (index: number, axis: 'r' | 'z', value: number) => void;
		onstations: (stations: Station[]) => void;
		oncommit: () => void;
	} = $props();

	const width = 520;
	const height = 390;
	const scale = $derived(profileScale(stations, width, height));
	const points = $derived(stations.map((station) => stationToScreen(station, scale)));
	let selected = $state(0);
	let limits = $state<string[]>([]);
	let dragging = $state(false);

	function drag(event: PointerEvent, index: number) {
		if (readOnly || event.button !== 0) return;
		event.stopPropagation();
		selected = index;
		dragging = true;
		const handle = event.currentTarget as SVGCircleElement;
		handle.focus();
		const snapshot = stations.map((station) => ({ ...station }));
		const dragScale = { ...scale };
		const startX = event.clientX;
		const startY = event.clientY;
		handle.setPointerCapture(event.pointerId);
		const move = (next: PointerEvent) => {
			const result = dragProfileStation(snapshot, index, next.clientX - startX, next.clientY - startY, dragScale);
			limits = result.limits;
			onstation(index, 'r', result.station.r);
			onstation(index, 'z', result.station.z);
		};
		const key = (keyEvent: KeyboardEvent) => {
			if (keyEvent.key !== 'Escape') return;
			keyEvent.preventDefault();
			keyEvent.stopPropagation();
			onstations(snapshot);
			finish(false);
		};
		const finish = (commit = true) => {
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', up);
			handle.removeEventListener('pointercancel', cancel);
			window.removeEventListener('keydown', key, true);
			dragging = false;
			limits = [];
			if (commit) queueMicrotask(oncommit);
		};
		const up = () => finish();
		const cancel = () => { onstations(snapshot); finish(false); };
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
		handle.addEventListener('pointercancel', cancel);
		window.addEventListener('keydown', key, true);
	}

	function add(event: MouseEvent, index: number) {
		if (readOnly || stations.length >= PROFILE_MAX_STATIONS) return;
		event.stopPropagation();
		const line = event.currentTarget as SVGLineElement;
		const rect = line.ownerSVGElement!.getBoundingClientRect();
		const x = (event.clientX - rect.left) * (width / rect.width);
		const y = (event.clientY - rect.top) * (height / rect.height);
		const a = points[index];
		const b = points[index + 1];
		const vx = b.x - a.x;
		const vy = b.y - a.y;
		const t = ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy);
		onstations(addProfileStation(stations, index, t));
		selected = index + 1;
		queueMicrotask(oncommit);
	}

	function addAtMiddle(event: KeyboardEvent, index: number) {
		if (readOnly || (event.key !== 'Enter' && event.key !== ' ')) return;
		event.preventDefault();
		onstations(addProfileStation(stations, index, .5));
		selected = index + 1;
		queueMicrotask(oncommit);
	}

	function removeSelected() {
		const next = deleteProfileStation(stations, selected);
		if (next === stations) { limits = ['minimum']; return; }
		onstations(next);
		selected = Math.min(selected, next.length - 1);
		queueMicrotask(oncommit);
	}

	function keydown(event: KeyboardEvent) {
		if (!readOnly && document.activeElement?.closest('.profile-editor') && (event.key === 'Delete' || event.key === 'Backspace') && !dragging) {
			event.preventDefault();
			removeSelected();
		}
	}

	function precise(axis: 'r' | 'z', event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		const target = axis === 'r'
			? dragProfileStation(stations, selected, (value - stations[selected].r) * scale.width / scale.maxR, 0, scale)
			: dragProfileStation(stations, selected, 0, -(value - stations[selected].z) * scale.height / (scale.maxZ - scale.minZ), scale);
		limits = target.limits;
		onstation(selected, axis, target.station[axis]);
	}
</script>

<svelte:window onkeydown={keydown} />
<section class="profile-editor" aria-label="Body profile editor">
	<div class="sketch">
		<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Editable body profile, ${stations.length} stations`}>
			<line class="axis" x1={scale.left} y1="12" x2={scale.left} y2={height - 12} />
			<text class="axis-label" x={scale.left + 9} y="22">AXIS OF REVOLUTION</text>
			{#each points.slice(0, -1) as point, index (index)}
				<line class="hit-segment" x1={point.x} y1={point.y} x2={points[index + 1].x} y2={points[index + 1].y} role="button" tabindex={readOnly ? undefined : 0} aria-label={`Add station between ${index + 1} and ${index + 2}`} onclick={(event) => add(event, index)} onkeydown={(event) => addAtMiddle(event, index)} />
				<line class="segment" x1={point.x} y1={point.y} x2={points[index + 1].x} y2={points[index + 1].y} />
			{/each}
			{#each points as point, index (index)}
				<circle class:selected={selected === index} class="handle" cx={point.x} cy={point.y} r="9" role="button" tabindex={readOnly ? undefined : 0} aria-label={`Station ${index + 1}`} onpointerdown={(event) => drag(event, index)} onclick={() => (selected = index)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') selected = index; }} />
			{/each}
		</svg>
		<div class="scale-label radius">RADIUS →</div>
		<div class="scale-label height-label">Z ↑</div>
	</div>
	<div class="selected-values">
		<strong>Station {selected + 1}</strong>
		<label>r <span><input aria-label={`Station ${selected + 1} radius`} type="number" min="0" step="0.005" value={stations[selected]?.r} disabled={readOnly} oninput={(event) => precise('r', event)} onchange={oncommit} /> in</span></label>
		<label>z <span><input aria-label={`Station ${selected + 1} height`} type="number" step="0.005" value={stations[selected]?.z} disabled={readOnly} oninput={(event) => precise('z', event)} onchange={oncommit} /> in</span></label>
	</div>
	<p class="hint">Drag a handle · Click a segment to add · Delete removes selected</p>
	{#if limits.length}<p class="limit" role="status">{limits.includes('axis') ? 'Radius limit: axis' : limits.includes('minimum') ? `Minimum ${PROFILE_MIN_STATIONS} stations` : limits.includes('tip-z') ? 'Tip height is fixed' : 'Height limit: next station'}</p>{/if}
</section>

<style>
	.profile-editor { outline: none; }
	.sketch { position: relative; margin-top: .5rem; }
	svg { display: block; width: 100%; min-height: 280px; max-height: 48vh; background: linear-gradient(var(--surface-0), color-mix(in srgb, var(--surface-0), var(--green) 3%)); border: 1px solid var(--boundary); border-radius: var(--radius-control); touch-action: none; }
	.axis { stroke: var(--copper); stroke-width: 2; stroke-dasharray: 7 5; }
	.axis-label, .scale-label { fill: var(--copper); color: var(--copper); font: 10px 'Share Tech Mono', monospace; letter-spacing: .08em; }
	.segment { stroke: var(--green); stroke-width: 3; pointer-events: none; }
	.hit-segment { stroke: transparent; stroke-width: 24; cursor: copy; }
	.handle { fill: var(--surface-0); stroke: var(--green); stroke-width: 4; cursor: grab; }
	.handle:active { cursor: grabbing; }
	.handle.selected { fill: var(--green); stroke: var(--text-1); }
	.scale-label { position: absolute; }
	.radius { right: 1rem; bottom: .55rem; }
	.height-label { left: .45rem; top: 2rem; writing-mode: vertical-rl; }
	.selected-values { display: grid; grid-template-columns: auto 1fr 1fr; align-items: center; gap: .5rem; margin-top: .65rem; }
	.selected-values strong { color: var(--green); font: 700 12px 'Share Tech Mono', monospace; }
	.selected-values label { display: grid; grid-template-columns: auto 1fr; gap: .35rem; align-items: center; color: var(--text-2); font: 12px 'Share Tech Mono', monospace; }
	.selected-values span { display: flex; align-items: center; gap: .25rem; }
	input { width: 100%; min-width: 0; min-height: 44px; padding: 0 .4rem; color: var(--text-1); background: var(--surface-2); border: 1px solid var(--boundary); border-radius: var(--radius-control); font: 700 1rem 'Share Tech Mono', monospace; text-align: right; }
	.hint, .limit { margin: .5rem 0 0; font: 11px/1.4 'Share Tech Mono', monospace; color: var(--text-2); }
	.limit { color: var(--amber); }
	@media (max-width: 520px) { .selected-values { grid-template-columns: 1fr 1fr; } .selected-values strong { grid-column: 1 / -1; } svg { min-height: 240px; } }
</style>
