<script lang="ts">
	/**
	 * THE TEAM BOARD (ledger 0436, 0306; decision 71). One card per team: the
	 * burn-up (planned points as a dashed line, done points as a stack by whose
	 * task it was), percent done, the flags (Behind, Slipping, Uneven, Blocked),
	 * the next sign-off with the school days left, and the shop gates. Under the
	 * cards, every machine's tagged tasks by the day they are due, across every
	 * class on the board. Built for a desktop first (1440); one column at 375.
	 */
	import {
		boardDays,
		boardTeamCard,
		machineCounts,
		teamBurnUp,
		type TeamBoard
	} from './team-board';
	import { TEAM_CHECKPOINT_WORDS, teamDayWords } from './team-plan';

	let { board }: { board: TeamBoard } = $props();

	const days = $derived(boardDays(board));
	const machines = $derived(machineCounts(board, days).filter((m) => m.total > 0));
	const W = 320;
	const H = 120;
	/** Done stack shades, darkest first; the team's own tasks are the faintest. */
	const SHADES = [1, 0.72, 0.5, 0.34];

	function chart(team: TeamBoard['teams'][number]) {
		const points = teamBurnUp(team, days);
		const max = Math.max(1, ...points.map((p) => Math.max(p.planned, p.done)));
		const x = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * W);
		const y = (v: number) => H - (v / max) * H;
		const owners = [...team.plan.members.map((m) => m.key), ''];
		// Done is drawn up to today only: nothing is done in the future.
		const upto = points.filter((p) => p.day <= board.today);
		const layers = owners.map((key, li) => {
			const top = upto.map((p, i) => {
				const below = owners.slice(0, li + 1).reduce((s, k) => s + (p.byOwner[k] ?? 0), 0);
				return [x(i), y(below)] as const;
			});
			const bottom = upto.map((p, i) => {
				const below = owners.slice(0, li).reduce((s, k) => s + (p.byOwner[k] ?? 0), 0);
				return [x(i), y(below)] as const;
			});
			const d = top.length < 2 ? '' : [...top, ...bottom.reverse()].map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ') + ' Z';
			const doneNow = upto.at(-1)?.byOwner[key] ?? 0;
			const name = key ? (team.plan.members.find((m) => m.key === key)?.name ?? '') : 'Team';
			return { key, d, name, doneNow, opacity: key ? SHADES[li % SHADES.length] : 0.2 };
		});
		const planned = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.planned).toFixed(1)}`).join(' ');
		const todayIndex = days.indexOf(board.today);
		return { layers, planned, max, todayX: todayIndex >= 0 ? x(todayIndex) : null };
	}
</script>

<section class="tb" data-testid="team-board" aria-label="Team board">
	{#if !board.teams.length}
		<p class="card tb-empty">No class you teach has a posted team draw. Draw and post teams on the People tab.</p>
	{:else}
		<div class="tb-grid">
			{#each board.teams as team (team.plan.team.id)}
				{@const card = boardTeamCard(team)}
				{@const c = chart(team)}
				<article class="card tb-team" data-testid="board-team" data-team={team.plan.team.id} aria-label={`${team.plan.team.name}, ${team.sectionLabel}`}>
					<header class="tb-head">
						<p class="tb-where">{team.sectionLabel}</p>
						<h2 class="tb-name"><a href={`/classroom/${team.plan.team.sectionId}/plan?team=${team.plan.team.id}`}>{team.plan.team.name}</a></h2>
						<p class="tb-pct" data-testid="board-percent"><strong>{card.percent}%</strong> done · {card.done} of {card.total} points</p>
					</header>
					<ul class="tb-flags" aria-label="Flags">
						{#if card.behind}<li class="chip tb-warn" data-testid="board-behind">Behind {card.behind}</li>{/if}
						{#if card.slipping}<li class="chip tb-warn" data-testid="board-slipping">Slipping</li>{/if}
						{#if card.uneven}<li class="chip tb-warn" data-testid="board-uneven">Uneven</li>{/if}
						{#if card.blocked}<li class="chip tb-warn">Blocked {card.blocked}</li>{/if}
						{#if !card.behind && !card.slipping && !card.uneven && !card.blocked}<li class="chip">On pace</li>{/if}
					</ul>
					<figure class="tb-chart">
						<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Burn-up: ${card.done} points done, ${card.plannedToDate} planned to date`}>
							{#each c.layers as layer (layer.key)}
								<path d={layer.d} class="tb-done" style:opacity={layer.opacity} />
							{/each}
							<path d={c.planned} class="tb-planned" />
							{#if c.todayX !== null}<line x1={c.todayX} x2={c.todayX} y1="0" y2={H} class="tb-today" />{/if}
						</svg>
						<figcaption class="tb-legend">
							<span class="tb-key"><span class="tb-swatch planned" aria-hidden="true"></span>Planned {card.plannedToDate} to date</span>
							{#each c.layers.filter((l) => l.doneNow > 0 || l.key) as layer (layer.key)}
								<span class="tb-key"><span class="tb-swatch" style:opacity={layer.opacity} aria-hidden="true"></span>{layer.name} {layer.doneNow}</span>
							{/each}
						</figcaption>
					</figure>
					{#if card.next}
						<p class="tb-next" data-testid="board-next">
							Next: <strong>{card.next.title}</strong>{card.next.date ? `, ${teamDayWords(card.next.date)}` : ''}
							{#if card.next.schoolDaysLeft !== null}· {card.next.schoolDaysLeft === 0 ? 'today' : `${card.next.schoolDaysLeft} school day${card.next.schoolDaysLeft === 1 ? '' : 's'}`}{/if}
							· {TEAM_CHECKPOINT_WORDS[card.next.state] ?? card.next.state}
						</p>
					{:else if team.plan.checkpoints.length}
						<p class="tb-next">Every sign-off approved.</p>
					{/if}
					{#each card.gates as g (g.title)}
						<p class="tb-gate" class:open={g.open}>{g.open ? `Open: ${g.title} is approved.` : g.gate}</p>
					{/each}
				</article>
			{/each}
		</div>

		<section class="card tb-machines" aria-label="Machines by day">
			<h2 class="section-label">Machines by day, every class</h2>
			{#if !machines.length}
				<p class="tb-note">No task is tagged with a machine yet.</p>
			{:else}
				<div class="tb-scroll">
					<table data-testid="board-machines">
						<thead>
							<tr>
								<th scope="col">Machine</th>
								{#each days as d (d)}<th scope="col" class:today={d === board.today}>{teamDayWords(d)}</th>{/each}
								<th scope="col">All</th>
							</tr>
						</thead>
						<tbody>
							{#each machines as m (m.id)}
								<tr data-machine={m.id}>
									<th scope="row">{m.label}</th>
									{#each days as d (d)}<td class:today={d === board.today} class:busy={m.byDay[d] > 0}>{m.byDay[d] || ''}</td>{/each}
									<td class="tb-total">{m.total}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</section>

<style>
	.tb {
		display: grid;
		gap: 0.9rem;
		min-width: 0;
		padding-bottom: var(--feedback-clear-block, 0px);
	}
	.tb-empty {
		margin: 0;
		padding: 1.1rem;
		font-family: var(--font-display);
		font-size: var(--fs-body);
	}
	.tb-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		gap: 0.8rem;
	}
	.tb-team {
		display: grid;
		gap: 0.55rem;
		padding: 0.9rem;
		min-width: 0;
	}
	.tb-head p,
	.tb-name {
		margin: 0;
	}
	.tb-where {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
	.tb-name {
		font-family: var(--font-display);
		font-size: var(--fs-h2);
	}
	.tb-name a {
		color: var(--text-1, var(--white));
	}
	.tb-pct {
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.tb-pct strong {
		color: var(--text-1, var(--white));
		font-size: var(--fs-h4);
	}
	.tb-flags {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.tb-flags li {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--dim) 45%, transparent);
		color: var(--text-2, var(--dim));
	}
	.tb-flags li.tb-warn {
		border-color: var(--amber);
		color: var(--amber);
	}
	.tb-chart {
		margin: 0;
		display: grid;
		gap: 0.35rem;
	}
	.tb-chart svg {
		width: 100%;
		height: 7.5rem;
		display: block;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
	}
	.tb-done {
		fill: var(--green);
	}
	.tb-planned {
		fill: none;
		stroke: var(--text-1, var(--white));
		stroke-width: 1.5;
		stroke-dasharray: 5 4;
		vector-effect: non-scaling-stroke;
	}
	.tb-today {
		stroke: var(--cyan);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.tb-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.8rem;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		color: var(--text-2, var(--dim));
	}
	.tb-key {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.tb-swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 2px;
		background: var(--green);
	}
	.tb-swatch.planned {
		background: none;
		border-top: 2px dashed var(--text-1, var(--white));
		height: 0;
	}
	.tb-next,
	.tb-gate {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-ui);
		color: var(--text-1, var(--white));
	}
	.tb-gate {
		color: var(--amber);
	}
	.tb-gate.open {
		color: var(--text-2, var(--dim));
	}
	.tb-machines {
		display: grid;
		gap: 0.5rem;
		padding: 0.9rem;
		min-width: 0;
	}
	.tb-machines h2 {
		margin: 0;
	}
	.tb-note {
		margin: 0;
		font-family: var(--font-display);
	}
	.tb-scroll {
		overflow-x: auto;
		min-width: 0;
	}
	table {
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
	}
	th,
	td {
		padding: 0.35rem 0.5rem;
		text-align: center;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 25%, transparent);
		white-space: nowrap;
	}
	th[scope='row'] {
		text-align: left;
		font-family: var(--font-display);
		font-size: var(--fs-sm);
	}
	.today {
		background: color-mix(in srgb, var(--cyan) 12%, transparent);
	}
	td.busy {
		color: var(--text-1, var(--white));
		font-weight: 700;
	}
	.tb-total {
		color: var(--text-1, var(--white));
	}
</style>
