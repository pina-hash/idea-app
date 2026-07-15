<script lang="ts">
	import FrcInterestAdmin from '$lib/fsp/FrcInterestAdmin.svelte';
	import type { FrcInterestRow } from '$lib/fsp/frc-interest';

	/**
	 * /fsp/frc-interest/admin — teacher-only roster of FRC interest form
	 * submissions. Gated server-side in +page.server.ts (role lives in
	 * `profiles`, checked there, same pattern as /coin-entry and /dashboard).
	 * The table itself is $lib/fsp/FrcInterestAdmin.svelte, shared with the dev
	 * harness.
	 */

	let { data }: { data: { rows: FrcInterestRow[]; ready: boolean } } = $props();
</script>

<svelte:head>
	<title>FRC Interest — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<FrcInterestAdmin rows={data.rows} ready={data.ready} />
