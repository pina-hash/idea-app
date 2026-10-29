<script lang="ts">
	/**
	 * THE MACHINE WEEK (ledger 0456, report d23bc63d.3). Every team's machine
	 * tasks for one school week on a shared calendar: a row per machine, a
	 * column per day, each booking with its class, team, part and owner. Two
	 * teams on one machine on one day is a clash, marked in amber with the
	 * word. A booking is a team plan task with a machine and a day; a team
	 * makes one in its Team plan, so this page only reads.
	 */
	import { untrack } from 'svelte';
	import { parseMachineWeek, machineWeekGrid, type MachineWeek } from '$lib/classroom/team-board';
	import { teamDayWords } from '$lib/classroom/team-plan';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	let from = $state<string | null>(null);
	let week = $state<MachineWeek | null>(null);
	let failed = $state(false);

	async function read(start: string | null) {
		const { data: raw, error } = await supabase.rpc('classroom_machine_week', { p_from: start });
		failed = !!error;
		week = error ? null : parseMachineWeek(raw);
	}
	$effect(() => {
		const start = from;
		untrack(() => void read(start));
	});
	function move(days: number) {
		if (!week) return;
		const d = new Date(`${week.from}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() + days);
		from = d.toISOString().slice(0, 10);
	}
	const grid = $derived(week ? machineWeekGrid(week) : null);
</script>

<svelte:head><title>Machine week</title></svelte:head>

<div class="mwp">
	<header class="mwp-head">
		<h1 class="mwp-title">Machine week</h1>
		<a class="btn ghost" href="/classroom/board">Board</a>
		<a class="btn ghost" href="/classroom/signoffs">Sign-offs</a>
	</header>
	{#if failed && !week}
		<p class="card mwp-note">The machine week could not be read. Reload the page to try again.</p>
	{:else if !week || !grid}
		<p class="card mwp-note">Reading the week.</p>
	{:else}
		<nav class="mwp-nav" aria-label="Week">
			<button type="button" class="btn secondary" onclick={() => move(-7)}>Last week</button>
			<p class="mwp-range">{teamDayWords(week.from)} to {teamDayWords(week.to)}</p>
			<button type="button" class="btn secondary" onclick={() => move(7)}>Next week</button>
		</nav>
		{#if grid.clashes}
			<p class="card mwp-clash" data-testid="machine-clashes">
				{grid.clashes} {grid.clashes === 1 ? 'clash' : 'clashes'} this week: two teams on one machine on one day.
			</p>
		{/if}
		<div class="mwp-scroll">
			<table class="mwp-grid" data-testid="machine-week">
				<thead>
					<tr>
						<th scope="col">Machine</th>
						{#each grid.days as d (d)}<th scope="col">{teamDayWords(d)}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each grid.rows as row (row.machine.id)}
						<tr>
							<th scope="row">{row.machine.label}</th>
							{#each row.cells as cell, ci (ci)}
								<td class:clash={cell.clash}>
									{#each cell.bookings as b, bi (bi)}
										<p class="mwp-b" class:blocked={b.blocked}>
											<strong>{b.team}</strong> <span class="mwp-sec">{b.section}</span>
											<span class="mwp-task">{b.task}{b.owner ? `, ${b.owner}` : ''}{b.blocked ? ' (blocked)' : ''}</span>
										</p>
									{/each}
									{#if cell.clash}<p class="mwp-clash-word">Clash</p>{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if !week.bookings.length}
			<p class="card mwp-note">No team has a machine task this week. A team books a machine by giving a task in its Team plan a machine and a day.</p>
		{/if}
	{/if}
</div>

<style>
	.mwp {
		display: grid;
		gap: 0.75rem;
		padding: 0.5rem 0 2rem;
		min-width: 0;
	}
	.mwp-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.mwp-title {
		margin: 0 auto 0 0;
		font-family: var(--font-display);
		font-size: 1.6rem;
		color: var(--text-1, var(--white));
	}
	.mwp-head .btn,
	.mwp-nav .btn {
		min-height: 44px;
	}
	.mwp-note {
		margin: 0;
		padding: 1rem;
		font-family: var(--font-display);
	}
	.mwp-nav {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.mwp-range {
		margin: 0 auto;
		font-family: var(--font-mono);
		color: var(--cyan);
	}
	.mwp-clash {
		margin: 0;
		padding: 0.6rem 0.9rem;
		font-family: var(--font-display);
		color: var(--amber);
		border-color: var(--amber);
	}
	.mwp-scroll {
		overflow-x: auto;
		min-width: 0;
	}
	.mwp-grid {
		width: 100%;
		min-width: 46rem;
		border-collapse: collapse;
		font-family: var(--font-display);
	}
	.mwp-grid th,
	.mwp-grid td {
		padding: 0.45rem;
		border: 1px solid var(--boundary, color-mix(in srgb, var(--dim) 30%, transparent));
		vertical-align: top;
		text-align: left;
	}
	.mwp-grid thead th {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.mwp-grid tbody th {
		font-size: 0.95rem;
		color: var(--text-1, var(--white));
		white-space: nowrap;
	}
	.mwp-grid td.clash {
		border-color: var(--amber);
		box-shadow: inset 0 0 0 1px var(--amber);
	}
	.mwp-b {
		margin: 0 0 0.35rem;
		font-size: 0.9rem;
		color: var(--text-1, var(--white));
	}
	.mwp-b.blocked {
		color: var(--text-2, var(--dim));
	}
	.mwp-sec {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--cyan);
	}
	.mwp-task {
		display: block;
		color: var(--text-2, var(--dim));
	}
	.mwp-clash-word {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--amber);
	}
</style>
