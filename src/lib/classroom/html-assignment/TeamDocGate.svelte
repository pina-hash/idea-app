<script lang="ts">
	/**
	 * WHAT A STUDENT SEES WHERE A TEAM DOCUMENT GOES (ledger 0436). Before the
	 * first read: one line saying it is opening. With no team: the sentence,
	 * never an error and never an empty form ("Teams are drawn in class..." is
	 * Mr. Pina's, verbatim). With a team: who is on it and who owns each part,
	 * then the document itself, which the caller hands in as `children` so the
	 * frame is the caller's one mount and never moves.
	 *
	 * The item page and the `/dev/team-document` harness both render THIS, so
	 * the harness measures the markup students get.
	 */
	import type { Snippet } from 'svelte';
	import TeamDocBar from './TeamDocBar.svelte';
	import type { TeamDocSession } from './team-doc-session.svelte';

	let { session, children }: { session: TeamDocSession; children: Snippet } = $props();
</script>

{#if !session.loaded}
	<section class="card team-doc-wait" role="status" data-testid="team-doc-opening">
		<p class="team-doc-wait-text">Opening your team's document.</p>
	</section>
{:else if session.waiting}
	<section class="card team-doc-wait" role="status" data-testid="team-doc-waiting">
		<p class="team-doc-wait-text">{session.waiting}</p>
	</section>
{:else}
	{#if session.doc?.team}
		<TeamDocBar doc={session.doc} />
	{/if}
	{@render children()}
{/if}

<style>
	.team-doc-wait {
		padding: 1.1rem 1.2rem;
	}
	.team-doc-wait-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1, var(--white));
	}
</style>
