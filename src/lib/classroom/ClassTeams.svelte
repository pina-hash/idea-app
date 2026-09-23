<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import { teamLabel, teamStyleVars, hasStyle, teamStyle } from '$lib/classroom/teams';
	import type { ClassTeam, ClassTeamSet } from '$lib/classroom/class-teams';

	/**
	 * THE TEAMS A TEACHER POSTED, ON THE CLASS PAGE (ledger 0297).
	 *
	 * The class reads the same board the People tab posts, through the same
	 * audience-gated read, projected to names (`postedTeamSets`). A student sees
	 * their own team first, as a card in the team's own colours, and the whole
	 * draw one tap away; a teacher sees the board exactly as the class does,
	 * which is the role-parity rule, with no team of their own.
	 *
	 * THE WHOLE BOARD IS A DISCLOSURE, CLOSED BY DEFAULT, because it sits at the
	 * top of the class pane and thirty names there push the class a screen down.
	 * The count stays on the trigger, so shutting it hides nothing a reader needs
	 * to decide whether to open it.
	 */
	let { sets }: { sets: ClassTeamSet[] } = $props();

	function mineOf(set: ClassTeamSet): ClassTeam | null {
		return set.teams.find((t) => t.mine) ?? null;
	}
</script>

{#snippet card(team: ClassTeam, own: boolean)}
	<div
		class="ct-card"
		class:has-style={hasStyle(teamStyle(team))}
		class:own
		style={teamStyleVars(team)}
		data-testid={own ? 'class-team-mine' : 'class-team'}
	>
		<h3 class="ct-name">{teamLabel(team)}</h3>
		{#if team.tagline}<p class="ct-tagline">{team.tagline}</p>{/if}
		<ul class="ct-members">
			{#each team.members as name, i (i)}
				<li>{name}</li>
			{/each}
		</ul>
	</div>
{/snippet}

<section class="ct-root" data-testid="class-teams" aria-label="Teams">
	{#each sets as set (set.id)}
		{@const mine = mineOf(set)}
		{#if mine}
			<div class="ct-mine">
				<p class="ct-mine-label">Your team · {set.label}</p>
				{@render card(mine, true)}
			</div>
		{/if}
		<Disclosure label={set.label} scope={`class-teams:${set.id}`} collapseWhen={true} testId="class-teams-board">
			{#snippet meta()}
				<span class="ct-count">{set.teams.length} team{set.teams.length === 1 ? '' : 's'}</span>
			{/snippet}
			<div class="ct-cards">
				{#each set.teams as team (team.id)}
					{@render card(team, false)}
				{/each}
			</div>
		</Disclosure>
	{/each}
</section>

<style>
	.ct-root {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		min-width: 0;
	}
	.ct-mine-label {
		margin: 0 0 var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ct-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	/* Cards of unequal height side by side: a multi-column container, capped,
	   the People tab's own arrangement for the same cards. */
	.ct-cards {
		columns: 13rem 4;
		column-gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.ct-card {
		break-inside: avoid;
		margin-bottom: var(--space-2);
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-left: 4px solid var(--team-accent, var(--boundary));
		border-radius: var(--radius-card);
		color: var(--text-1);
	}
	.ct-card.has-style {
		background: var(--team-bg, var(--surface-1));
		color: var(--team-ink, inherit);
	}
	.ct-name {
		margin: 0 0 0.2rem;
		font-size: 1rem;
		line-height: 1.3;
		color: inherit;
	}
	.ct-tagline {
		margin: 0 0 0.3rem;
		font-style: italic;
		font-size: 0.85rem;
	}
	.ct-members {
		margin: 0;
		padding-left: 1.1rem;
	}
</style>
