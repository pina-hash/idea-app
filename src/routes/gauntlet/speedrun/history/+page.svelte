<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import { formatTime } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, attempts } = $derived(data);

	const RESULT_LABEL: Record<string, string> = {
		passed: 'Passed',
		failed: 'Outside tolerance',
		abandoned: 'Abandoned',
		in_progress: 'In progress'
	};

	// elapsed_ms is milliseconds; formatTime takes seconds.
	const fmtElapsed = (ms: number | null) =>
		ms === null || ms === undefined ? '--' : formatTime(ms / 1000);

	const fmtWhen = (iso: string) => {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
	};

	const passed = $derived(attempts.filter((a) => a.result === 'passed').length);
</script>

<svelte:head>
	<title>My Speedrun attempts // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[{ label: 'Speedrun', href: '/gauntlet/speedrun' }, { label: 'My attempts' }]}
/>

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Speedrun</span>
		<h1>My attempts</h1>
		<p class="lead">
			Every run is recorded, whether you cleared it, missed the tolerance, or started a run and never
			finished it. This is your own history; only you and your teachers can see it.
		</p>
		<div class="mode-hero-meta">
			<span class="mono">{attempts.length} attempts &middot; {passed} passed</span>
		</div>
	</section>

	{#if attempts.length === 0}
		<div class="card">
			<p>No attempts yet. <a href="/gauntlet/speedrun">Start a Speedrun</a> and your runs show up here.</p>
		</div>
	{:else}
		<table class="board attempts">
			<thead>
				<tr>
					<th>Drawing</th>
					<th class="hide-sm">Series</th>
					<th>Result</th>
					<th class="time-col">Time</th>
					<th class="hide-sm">When</th>
				</tr>
			</thead>
			<tbody>
				{#each attempts as a (a.id)}
					<tr>
						<td>
							<a class="attempt-link" href="/gauntlet/speedrun/{a.challenge_id}">{a.challenge_title}</a>
							{#if a.room_id}<span class="room-tag">room</span>{/if}
						</td>
						<td class="hide-sm dim">{a.series_name ?? '--'}</td>
						<td>
							<span class="result-pill result-{a.result}">{RESULT_LABEL[a.result] ?? a.result}</span>
						</td>
						<td class="time-col mono">{fmtElapsed(a.elapsed_ms)}</td>
						<td class="hide-sm dim mono">{fmtWhen(a.created_at)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet/speedrun">&lsaquo; Speedrun</a>
		<a class="btn secondary" href="/gauntlet/leaderboard">Leaderboard</a>
	</div>
</main>

<style>
	.attempts {
		width: 100%;
	}
	.attempt-link {
		color: var(--white);
		text-decoration: none;
	}
	.attempt-link:hover {
		color: var(--green);
	}
	.room-tag {
		font-family: var(--font-mono);
		font-size: 0.56rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
		border: 1px solid var(--line);
		border-radius: 2px;
		padding: 0.05rem 0.35rem;
		margin-left: 0.4rem;
	}
	.result-pill {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 3px;
		padding: 0.15rem 0.5rem;
		border: 1px solid;
	}
	.result-passed {
		color: var(--green);
		border-color: var(--green);
		background: rgba(0, 255, 65, 0.08);
	}
	.result-failed {
		color: var(--amber);
		border-color: var(--amber);
		background: rgba(255, 140, 0, 0.08);
	}
	.result-abandoned {
		color: var(--dim);
		border-color: var(--line-strong);
	}
	.result-in_progress {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	@media (max-width: 620px) {
		.hide-sm {
			display: none;
		}
	}
</style>
