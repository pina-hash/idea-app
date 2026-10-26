<script lang="ts">
	/**
	 * WHO IS ON THIS TEAM DOCUMENT AND WHO OWNS EACH PART (ledger 0436), one
	 * line above a student's shared worksheet. Names only, never an address;
	 * a part with no owner says so, because an owned box nobody owns is a box
	 * nobody can write until the team plan names someone.
	 */
	import type { TeamDocument } from './team-doc';

	let { doc }: { doc: TeamDocument } = $props();

	const teammates = $derived(doc.members.filter((m) => m.active || m.me));
</script>

<section class="card tdb" data-testid="team-doc-bar" aria-label="Your team">
	<div class="tdb-team">
		<span class="section-label">Your team</span>
		<strong class="tdb-name">{doc.team?.name}</strong>
		{#if doc.team?.section_id}
			<a class="btn secondary tdb-plan" href={`/classroom/${doc.team.section_id}/plan`} data-testid="team-plan-link">Team plan</a>
		{/if}
		<ul class="tdb-people">
			{#each teammates as m (m.name + (m.me ? ':me' : ''))}
				<li class="chip tdb-person" class:me={m.me}>{m.name}{m.me ? ' (you)' : ''}</li>
			{/each}
		</ul>
	</div>
	{#if doc.roles.length}
		<ul class="tdb-roles" aria-label="Who owns each part">
			{#each doc.roles as r (r.id)}
				<li class="tdb-role" class:mine={r.mine} data-role={r.id}>
					<span class="tdb-role-title">{r.title}</span>
					<span class="tdb-role-owner">{r.owner ? (r.mine ? 'You' : r.owner) : 'No owner yet'}</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if doc.pastDue}
		<p class="tdb-closed">This post is past its due date, so your team's answers are read only.</p>
	{/if}
</section>

<style>
	.tdb {
		display: grid;
		gap: 0.6rem;
		padding: 0.75rem 0.9rem;
		margin-bottom: 0.75rem;
	}
	.tdb-team {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.7rem;
		min-width: 0;
	}
	.tdb-name {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-1, var(--white));
	}
	.tdb-plan {
		margin-left: auto;
		order: 3;
		min-height: 44px;
	}
	.tdb-people {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tdb-person.me {
		color: var(--text-1, var(--white));
	}
	.tdb-roles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
		gap: 0.4rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tdb-role {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--bg0) 55%, transparent);
		border: 1px solid color-mix(in srgb, var(--dim) 30%, transparent);
		min-width: 0;
	}
	.tdb-role.mine {
		border-color: color-mix(in srgb, var(--green) 55%, transparent);
	}
	.tdb-role-title {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tdb-role-owner {
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--text-1, var(--white));
		white-space: nowrap;
	}
	.tdb-closed {
		margin: 0;
		color: var(--amber);
		font-family: var(--font-display);
	}
</style>
