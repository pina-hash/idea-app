<script lang="ts">
	import MigrateWizard from '$lib/coin-desk/MigrateWizard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The PULL transport: a POST to this route's own server endpoint, which
	 * fetches the published CSVs + the coin-ledger contracts server-side and
	 * creates the batch. Injected into the wizard (the harness answers it
	 * from a fixture instead).
	 */
	async function pull() {
		try {
			const res = await fetch('/coin-desk/migrate/pull', { method: 'POST' });
			const body = (await res.json()) as
				| { ok: true; batch: PageData['batch']; warnings: string[] }
				| { ok: false; error: string };
			if (!body.ok) return { ok: false as const, error: body.error };
			return { ok: true as const, batch: body.batch!, warnings: body.warnings };
		} catch {
			return { ok: false as const, error: 'The pull endpoint did not answer.' };
		}
	}
</script>

<svelte:head>
	<title>Migrate // Coin Desk</title>
</svelte:head>

<MigrateWizard
	supabase={data.supabase}
	profiles={data.profiles}
	initialBatch={data.batch}
	initialMappings={data.savedMappings}
	configured={data.migrateConfigured}
	{pull}
/>
