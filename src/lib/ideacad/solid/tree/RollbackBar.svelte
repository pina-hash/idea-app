<script lang="ts">
	/**
	 * THE ROLLBACK BAR, as SolidWorks draws it: a line across the design tree
	 * that the model is built down to. Rows below it are grayed and not built.
	 * Drag it with the pointer, or focus it and use the arrow keys, Home and End.
	 *
	 * IT EXISTS ONLY WHERE THE WORKSPACE CAN ROLL BACK. The tree mounts it when
	 * the api carries `rollback`, and not otherwise: a bar whose only possible
	 * answer is nothing must not be drawn.
	 *
	 * The bar never moves while it is being dragged (so the pointer it captured
	 * stays captured); the tree draws the target as a line where the bar will
	 * land and moves the bar there on release.
	 */
	let { position, count, valueText, locate, onpreview, onset }: {
		/** How many top-level rows are above the bar. */
		position: number;
		/** How many top-level rows there are; the bar at `count` builds everything. */
		count: number;
		valueText: string;
		/** The position a pointer at this height would put the bar at. */
		locate: (clientY: number) => number;
		onpreview: (position: number | null) => void;
		onset: (position: number) => void;
	} = $props();
	let dragging = $state(false), target = -1;
	const at = (p: number) => Math.max(0, Math.min(count, p));
	function keydown(e: KeyboardEvent) {
		const next = e.key === 'ArrowUp' ? position - 1 : e.key === 'ArrowDown' ? position + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? count : null;
		if (next === null) return;
		e.preventDefault(); e.stopPropagation();
		if (at(next) !== position) onset(at(next));
	}
	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
		dragging = true; target = position;
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		const p = at(locate(e.clientY));
		if (p !== target) { target = p; onpreview(p === position ? null : p); }
	}
	function up() {
		if (!dragging) return;
		dragging = false; onpreview(null);
		if (target !== position) onset(target);
	}
</script>
<div class="rollback" class:dragging class:rolled={position < count} role="slider" tabindex="0" aria-label="Rollback bar" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={count} aria-valuenow={position} aria-valuetext={valueText} data-testid="ideacad-rollback-bar" onkeydown={keydown} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
	<span class="word">Rollback</span><span class="line" aria-hidden="true"></span>
</div>
<style>
	.rollback{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 8px;box-sizing:border-box;cursor:ns-resize;touch-action:none;user-select:none;color:var(--text-2);border-radius:4px}.rollback:hover,.rollback.dragging{color:var(--text-1);background:var(--surface-2)}.rollback:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.word{font:11px 'Share Tech Mono',monospace;letter-spacing:.08em;text-transform:uppercase;flex-shrink:0}.rolled .word{color:var(--cyan)}
	.line{flex:1 1 auto;height:3px;border-radius:2px;background:var(--text-2)}.rolled .line{background:var(--cyan)}
</style>
