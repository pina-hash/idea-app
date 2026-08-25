<script lang="ts">
	/**
	 * The Foundry's own room.
	 *
	 * THREE JOBS, the classroom layout's three, each exactly once: it loads the
	 * forge stylesheet (forge.css), provides the `.fg-root` wrapper every rule
	 * in it is scoped under -- which is also what the `.bg-fx` suppression keys
	 * off -- and renders the PERSISTENT SHELL: the masthead, the molten seam
	 * and the tabs, so every page under /foundry sits inside one structure
	 * instead of each owning its own header and its own way back.
	 *
	 * The routing knowledge lives in `$lib/foundry/nav`, not in the shell: the
	 * shell takes finished props, so a dev harness can mount it with no router.
	 * A COMPONENT reading `page.url` is fine here -- the layout LOAD is what
	 * must never read `url`, and it does not.
	 *
	 * `isAdmin` rides `page.data` from the root layout; `reviewPending` comes
	 * from this route's own layout load, which asks only for admins.
	 */
	import { page } from '$app/state';

	import '$lib/foundry/forge.css';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import { locateFoundry } from '$lib/foundry/nav';

	let { data, children } = $props();

	const active = $derived(locateFoundry(page.url.pathname));
</script>

<div class="fg-root">
	<FoundryShell
		{active}
		isAdmin={page.data.isAdmin === true}
		reviewPending={data.reviewPending ?? null}
	>
		{@render children()}
	</FoundryShell>
</div>
