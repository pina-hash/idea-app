<script lang="ts">
	/**
	 * WHAT MY TEAM DOES TODAY (ledger 0456, report d23bc63d.5), on the class
	 * home for a student on a team: the student's own tasks due today or
	 * behind, what the team checked in on, anything blocked, and the next
	 * sign-off with its state. One read, the team plan (`classroom_team_plan`),
	 * the same answer the Team plan page draws, so the two never disagree.
	 * Renders nothing for a student on no team, before teams are posted, or
	 * when the read fails.
	 */
	import { untrack } from 'svelte';
	import { parseTeamPlan, teamDayWords, teamToday, TEAM_CHECKPOINT_WORDS, TEAM_STATUS_WORDS, type TeamPlan } from './team-plan';

	let {
		sectionId,
		read
	}: {
		sectionId: string;
		read: (sectionId: string) => Promise<unknown>;
	} = $props();

	let plan = $state<TeamPlan | null>(null);
	$effect(() => {
		const id = sectionId;
		untrack(() => {
			void read(id)
				.then((raw) => {
					if (id === sectionId) plan = parseTeamPlan(raw).plan;
				})
				.catch(() => {});
		});
	});
	const today = $derived(plan ? teamToday(plan) : null);
</script>

{#if plan && today}
	<section class="card ttc" data-testid="team-today" aria-label={`Today for ${plan.team.name}`}>
		<header class="ttc-head">
			<h2 class="section-label">Today for {plan.team.name}</h2>
			<a class="ttc-plan" href={`/classroom/${sectionId}/plan`}>Team plan</a>
		</header>
		{#if today.mine.length}
			<ul class="ttc-list" aria-label="Your tasks">
				{#each today.mine as t (t.id)}
					<li class:behind={t.status === 'behind'}>
						<span class="ttc-title">{t.title}</span>
						<span class="ttc-meta">{t.dueOn ? teamDayWords(t.dueOn) : ''} · {TEAM_STATUS_WORDS[t.status]}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="ttc-note">Nothing of yours is due today. Check in on a task, or help a teammate.</p>
		{/if}
		{#if today.onIt.length}
			<p class="ttc-note"><strong>Checked in:</strong> {today.onIt.join(', ')}</p>
		{/if}
		{#if today.blocked.length}
			<p class="ttc-warn"><strong>Blocked:</strong> {today.blocked.join('; ')}</p>
		{/if}
		{#if today.next}
			<p class="ttc-next">
				Next sign-off: <strong>{today.next.title}</strong>{today.next.date ? `, ${teamDayWords(today.next.date)}` : ''}
				({TEAM_CHECKPOINT_WORDS[today.next.state] ?? today.next.state})
			</p>
		{/if}
	</section>
{/if}

<style>
	.ttc {
		display: grid;
		gap: 0.5rem;
		padding: 0.8rem 0.9rem;
		min-width: 0;
	}
	.ttc-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.ttc-head .section-label {
		margin: 0 auto 0 0;
	}
	.ttc-plan {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--cyan);
	}
	.ttc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.ttc-list li {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text-1, var(--white));
	}
	.ttc-list li.behind .ttc-meta {
		color: var(--amber);
	}
	.ttc-meta {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
		white-space: nowrap;
	}
	.ttc-note,
	.ttc-next {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.ttc-warn {
		margin: 0;
		font-family: var(--font-display);
		color: var(--amber);
	}
</style>
