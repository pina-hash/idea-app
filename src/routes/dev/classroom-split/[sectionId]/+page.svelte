<script lang="ts">
	/**
	 * The empty detail pane, mirroring the real
	 * src/routes/classroom/[sectionId]/+page.svelte -- which is now empty, at
	 * every width: nothing is open, so `.cr-split:not(.has-detail) .cr-detail`
	 * does not render this pane at all and the class list has the whole measure.
	 *
	 * THE FILE STAYS because the real one does: a route needs a page, and this
	 * is what the harness's own /dev/classroom-split/<id> resolves to. An empty
	 * page here is the harness mirroring the shipping arrangement rather than a
	 * stub standing in for it.
	 */
</script>
