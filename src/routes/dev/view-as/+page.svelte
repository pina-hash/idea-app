<script lang="ts">
	/**
	 * /dev/view-as (ledger 0422): the REAL floating panel over a stand-in page,
	 * in view mode, or act mode with `?mode=act`, and the REAL View as / Act as
	 * keys. `?long=1` gives a long name, to see the panel truncate.
	 */
	import { page } from '$app/state';
	import ViewAsPanel from '$lib/shell/ViewAsPanel.svelte';
	import ViewAsButtons from '$lib/shell/ViewAsButtons.svelte';
	import type { ViewAsState } from '$lib/view-as';

	const mode = page.url.searchParams.get('mode') === 'act' ? 'act' : 'view';
	const long = page.url.searchParams.get('long') === '1';
	const state: ViewAsState = {
		mode,
		target_email: 'ana.reyes@boscotech.net',
		target_name: long ? 'Anastasia Esperanza Reyes-Villanueva' : 'Ana Reyes',
		admin_email: 'apina@boscotech.edu',
		admin_name: 'Mr. Pina',
		started_at: new Date(Date.now() - 20 * 60000).toISOString(),
		expires_at: new Date(Date.now() + 160 * 60000).toISOString(),
		expired: false,
		test_account: false,
		changes: mode === 'act' ? 3 : 0
	};
	const people = [
		{ id: '11111111-1111-4111-8111-111111111111', name: 'Ana Reyes' },
		{ id: '22222222-2222-4222-8222-222222222222', name: 'Ben Ortiz' }
	];
</script>

<main class="dv-page">
	<h1>Your Classes</h1>
	<p>A stand-in for any page of the site. Everything here is what the student sees; the panel is the only thing laid over it.</p>
	<section class="card dv-card">
		<h2 class="section-label">IDEA100 Block 2</h2>
		<p>Bridge Build: due in two days</p>
	</section>
	<section class="card dv-card">
		<h2 class="section-label">People</h2>
		<ul class="dv-list">
			{#each people as p (p.id)}
				<li><span>{p.name}</span><ViewAsButtons userId={p.id} name={p.name} /></li>
			{/each}
		</ul>
	</section>
</main>
<ViewAsPanel viewAs={state} />

<style>
	.dv-page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 6rem;
	}
	.dv-card {
		padding: 1rem 1.2rem;
		margin: 0 0 1rem;
	}
	.dv-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.dv-list li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
		justify-content: space-between;
	}
</style>
