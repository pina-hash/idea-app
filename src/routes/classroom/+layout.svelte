<script lang="ts">
	import '$lib/classroom/classroom.css';

	/**
	 * The classroom's own room.
	 *
	 * TWO JOBS, both of which have to happen exactly once. It loads the shared
	 * surface layer (see classroom.css for what moved into it and why), and it
	 * provides the `.cr-root` wrapper every rule in that file is scoped under --
	 * which is also what the `.bg-fx` suppression keys off, so the scanline
	 * overlay lifts on these routes and nowhere else.
	 *
	 * The wrapper is a plain block with no layout of its own: the pages inside
	 * render their own `.app-header` and a centred `<main>` exactly as they did
	 * before, and both still measure the same.
	 *
	 * /reference has a layout of its own doing the same thing -- it is a separate
	 * route tree serving the same documents to people with no account.
	 */
	let { children } = $props();
</script>

<div class="cr-root">
	{@render children()}
</div>
