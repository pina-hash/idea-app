<script lang="ts">
	import FrcShell from '$lib/frc/FrcShell.svelte';

	/**
	 * FRC Training section layout: wraps every /frc page in the Team 5669 shell
	 * and the scoped FRC-derivative theme (see frc-theme.css). Visual layer
	 * only: the signed-in guard lives in hooks.server.ts (any authenticated
	 * user; the whole track is open access, pathway is never a gate).
	 */

	let { children } = $props();
</script>

<FrcShell>
	{@render children()}
</FrcShell>
