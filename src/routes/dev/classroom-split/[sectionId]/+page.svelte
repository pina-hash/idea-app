<script lang="ts">
	/**
	 * The empty detail pane, mirroring the real
	 * src/routes/classroom/[sectionId]/+page.svelte. Below 1024px it is not
	 * rendered at all -- the class list is the page there.
	 */
</script>

<div class="empty-detail" data-testid="detail-empty">
	<p class="lead">Nothing open yet</p>
	<p class="hint">Pick an announcement, assignment or material from the class to read it here.</p>
</div>

<style>
	.empty-detail {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 18rem;
		padding: var(--space-6) var(--space-4);
		text-align: center;
		border: 1px dashed var(--hairline);
		border-radius: var(--radius-card);
	}
	.lead {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.hint {
		margin: 0;
		max-width: 26rem;
		font-size: 0.9rem;
		color: var(--text-3);
	}
</style>
