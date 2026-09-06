<script lang="ts">
	import '$lib/tournaments/tournaments-theme.css';

	/**
	 * THE TOURNAMENTS ROOM, put on by the LAYOUT CHAIN (prompt 0077), the way
	 * `/coin-desk/+layout.svelte` gives every area `.cd-root`. Every page
	 * under /tournaments used to render in the portal's own chrome -- only
	 * the projector stage and the two detail components wore `.tnm-root` --
	 * which is why the surface "just looked like the standard website".
	 *
	 * This is a class and a stylesheet and nothing else: no load, no guard,
	 * no session read. /tournaments is the public tier and this layout must
	 * never gain a check (CLAUDE.md, access model). The projector route pins
	 * itself `position: fixed` over the top of this wrapper and hides the
	 * portal background itself, so it is unaffected.
	 */
	let { children } = $props();
</script>

<div class="tnm-root tnm-shell">
	{@render children()}
</div>
