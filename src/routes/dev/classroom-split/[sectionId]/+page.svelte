<script lang="ts">
	/**
	 * The empty detail pane, mirroring the real
	 * src/routes/classroom/[sectionId]/+page.svelte. Below 1024px it is not
	 * rendered at all -- the class list is the page there.
	 */
</script>

<div class="empty-detail" data-testid="detail-empty">
	<p class="hint">Pick something from the class to read it here.</p>
</div>

<style>
	.empty-detail {
		padding-top: var(--space-2);
	}
	.hint {
		margin: 0;
		max-width: 26rem;
		font-size: 0.9rem;
		color: var(--text-3);
	}
</style>
