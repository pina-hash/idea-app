<script lang="ts">
	/**
	 * A NEW PART'S FIRST MOMENT: one short line and two direct actions, below
	 * the Front, Top and Right planes the empty document already shows. It is
	 * not a tour and it blocks nothing: the planes themselves take a press, and
	 * the cue goes the moment the part has its first feature.
	 */
	let { onsketch, onbox, busy = false }: { onsketch: () => void; onbox: () => void; busy?: boolean } = $props();
</script>

<div class="empty-cue" role="group" aria-label="Start a part" data-testid="ideacad-empty-cue">
	<p>Press a plane to sketch on it</p>
	<div class="actions">
		<button type="button" onclick={onsketch}>
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-12h12l-6 12zM8 13h6v-4" /></svg>
			Sketch on a plane
		</button>
		<button type="button" aria-disabled={busy ? 'true' : undefined} onclick={() => { if (!busy) onbox(); }}>
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8l8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8" /></svg>
			Start from a box
		</button>
	</div>
</div>

<style>
	.empty-cue { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px 12px; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 8px; color: var(--text-1); font-family: Rajdhani, sans-serif; pointer-events: auto; }
	p { margin: 0; font-size: 17px; color: var(--text-2); }
	.actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
	button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; font: 600 16px Rajdhani, sans-serif; color: var(--text-1); background: var(--surface-2); border: 1px solid var(--boundary); border-radius: 6px; cursor: pointer; }
	button:hover { border-color: var(--green); color: var(--green); }
	button:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
	button[aria-disabled='true'] { color: var(--text-2); cursor: default; }
	@media (max-width: 700px) { .actions { flex-wrap: nowrap; gap: 6px; } button { padding: 0 10px; gap: 6px; font-size: 15px; } p { font-size: 16px; } }
</style>
