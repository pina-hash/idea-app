<script lang="ts">
	/**
	 * WHAT THIS PERSON HID ON THIS PAGE, IN ONE QUIET LINE (ledger 0360, report
	 * R23). A section a person hid is not rendered at all, so without this a
	 * class page with its search hidden reads as a class page with no search,
	 * and a student who hid the rubric six weeks ago reads it as "this
	 * assignment has no rubric". The line names each hidden section and, where
	 * the page can open the settings, offers Arrange to put it back.
	 *
	 * It renders NOTHING when nothing that would have shown is hidden: the
	 * caller passes `resolvePanels(...).hidden`, which counts only panels that
	 * had something to show here.
	 */
	let {
		labels,
		onArrange = null
	}: {
		/** The hidden panels' words (`panelLabels(page, resolved.hidden)`). */
		labels: readonly string[];
		/** Opens the page-layout settings. Null (a harness with no shell) removes the control. */
		onArrange?: (() => void) | null;
	} = $props();
</script>

{#if labels.length}
	<p class="phn" data-testid="panels-hidden-note">
		<span class="phn-text">Hidden on this page: {labels.join(', ')}.</span>
		{#if onArrange}
			<button type="button" class="btn secondary tiny" data-testid="panels-hidden-arrange" onclick={() => onArrange?.()}>
				Arrange
			</button>
		{/if}
	</p>
{/if}

<style>
	.phn {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin: var(--space-3) 0 0;
		min-width: 0;
		font-size: 0.85rem;
		/* `--text-2`: muted, and measured at 4.5:1 or better on every classroom
	   ground this line can land on (the page, a card, the pane). */
		color: var(--text-2);
	}
	.phn-text {
		min-width: 0;
		overflow-wrap: break-word;
	}
</style>
