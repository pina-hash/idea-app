<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import { teamLabel, teamStyleVars, hasStyle, teamStyle } from '$lib/classroom/teams';
	import { ownTeams, postedTeamsNotice, type ClassTeam, type ClassTeamSet } from '$lib/classroom/class-teams';

	/**
	 * THE TEAMS A TEACHER POSTED, ON THE CLASS PAGE (ledger 0297, reordered in
	 * ledger 0298 for R23).
	 *
	 * The class reads the same board the People tab posts, through the same
	 * audience-gated read, projected to names (`postedTeamSets`). Three parts,
	 * in this order, and the order is the fix:
	 *
	 *   1. THE STUDENT'S OWN TEAM, OPEN, FIRST. Every own-team card across every
	 *      posted draw comes before any board (`ownTeams`), so a student who
	 *      opens the class sees their team without opening anything, and a
	 *      second draw's card never sits below the first draw's board.
	 *   2. A TEACHER'S ONE-LINE STRIP: "Teams posted until <date>", with the
	 *      People tab one press away. A teacher is on no team, so before it the
	 *      only trace of a posted draw on their own class page was a closed
	 *      board, and a draw the class could see read the same as one nobody
	 *      could. `manage` is null for everyone else, which removes the strip.
	 *   3. THE WHOLE DRAW, A DISCLOSURE, CLOSED BY DEFAULT, because it sits at
	 *      the top of the class pane and thirty names there push the class a
	 *      screen down. The count stays on the trigger, so shutting it hides
	 *      nothing a reader needs to decide whether to open it. A teacher sees
	 *      the board exactly as the class does (role parity).
	 *
	 * NAMES ONLY. The projection this reads carries no address, and nothing
	 * here asks for one.
	 */
	let {
		sets,
		manage = null,
		today = null
	}: {
		sets: ClassTeamSet[];
		/** Where a teacher manages the draw (the People tab). Null for a student: no strip. */
		manage?: { href: string; label: string } | null;
		/** The loader's school day, so the strip's date prints the year only when it is not this year. */
		today?: string | null;
	} = $props();

	const own = $derived(ownTeams(sets));
	const notice = $derived(manage ? postedTeamsNotice(sets, today) : null);
</script>

{#snippet card(team: ClassTeam, isOwn: boolean)}
	<div
		class="ct-card"
		class:has-style={hasStyle(teamStyle(team))}
		class:own={isOwn}
		style={teamStyleVars(team)}
		data-testid={isOwn ? 'class-team-mine' : 'class-team'}
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
	{#each own as o (`${o.set.id}:${o.team.id}`)}
		<div class="ct-mine" data-testid="class-team-mine-wrap">
			<p class="ct-mine-label">Your team · {o.set.label}</p>
			{@render card(o.team, true)}
		</div>
	{/each}

	{#if manage && notice}
		<p class="ct-posted" data-testid="class-teams-posted">
			<span class="ct-posted-text">{notice}</span>
			<a class="btn tiny ct-posted-link" href={manage.href} data-testid="class-teams-manage">
				Manage in {manage.label}
			</a>
		</p>
	{/if}

	{#each sets as set (set.id)}
		<Disclosure
			label={`All teams · ${set.label}`}
			scope={`class-teams:${set.id}`}
			collapseWhen={true}
			testId="class-teams-board"
		>
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
	/* One card, not a banner across the class pane: the width of a team card
	   on the board below, a little more. */
	.ct-mine {
		max-width: 32rem;
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
	/* The teacher's strip. One line where the pane allows it, wrapping (never
	   clipping) where it does not; the link keeps its own 44px floor through
	   the classroom's `.btn.tiny`. The own card's width, not the pane's: at
	   1440 a full-width strip put the link 950px from the words it acts on. */
	.ct-posted {
		max-width: 32rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		min-width: 0;
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
	}
	.ct-posted-text {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ct-posted-link {
		flex: none;
		text-decoration: none;
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
	/* The student's own card sits alone in the pane, so it drops the gap the
	   board's columns need under each card. */
	.ct-mine .ct-card {
		margin-bottom: 0;
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
