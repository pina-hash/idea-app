<script lang="ts">
	import '$lib/gauntlet/viewport/viewport.css';
	import { page } from '$app/state';
	import RouteBuilder from '$lib/gauntlet/RouteBuilder.svelte';

	/**
	 * Dev-only harness for the community speedrun builder (0297, ledger 0433).
	 * It mounts the REAL `RouteBuilder` over a literal list of published parts;
	 * `?picked=3` starts with three in the order, which is the state with every
	 * control on screen (order rows with up, down and remove, the pick list
	 * with ticked and unticked parts, Save live). The default starts empty, so
	 * the Save button says why it cannot save yet.
	 *
	 * `onsave` records the draft into `data-saved` instead of calling the
	 * database, so a spec can read what one press would send.
	 */
	const PARTS = [
		{ id: 'p1', title: 'Hex Standoff', difficulty: 1 },
		{ id: 'p2', title: 'Angle Bracket', difficulty: 2 },
		{ id: 'p3', title: 'Bearing Block', difficulty: 2 },
		{ id: 'p4', title: 'Shaft Collar', difficulty: 3 },
		{ id: 'p5', title: 'Motor Plate', difficulty: 3 },
		{ id: 'p6', title: 'Gearbox Side Plate With A Long Name For Wrapping', difficulty: 4 },
		{ id: 'p7', title: 'Drive Pulley', difficulty: 4 },
		{ id: 'p8', title: 'Bumper Bracket', difficulty: 5 }
	];
	const picked = Number(page.url.searchParams.get('picked') ?? '0');
	const initial =
		picked > 0
			? { title: 'Shop sprint', description: 'Three parts, fastest total wins.', ids: PARTS.slice(0, picked).map((p) => p.id) }
			: { title: '', description: '', ids: [] };
	let saved = $state('');
</script>

<svelte:head><title>dev / gauntlet community speedrun builder</title></svelte:head>

<main class="gauntlet" data-testid="route-builder-harness" data-saved={saved}>
	<section class="mode-hero">
		<span class="eyebrow">Speedrun</span>
		<h1>Make a speedrun</h1>
	</section>
	<div class="card">
		<RouteBuilder parts={PARTS} {initial} onsave={(d) => (saved = JSON.stringify(d))} oncancel={() => {}} />
	</div>
</main>
