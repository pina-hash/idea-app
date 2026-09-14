<script lang="ts">
	let { children } = $props();
</script>

{@render children()}

<style>
	/* app.css gives every main a reading-column ceiling. IdeaCAD is the one
	   application workspace in this route, so its main owns the viewport. */
	:global(main) {
		max-width: none;
		margin: 0;
		padding: 0;
	}
</style>
