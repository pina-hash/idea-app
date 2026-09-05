<script lang="ts">
	/**
	 * THE OWNER'S DASHBOARD (decision 07): what all of this student's apps have
	 * done, at the top of their own shelf.
	 *
	 * THE DECISION THIS IMPLEMENTS was "owner-only telemetry does NOT become
	 * public; build the owner dashboard instead." The per-app panel
	 * (`FoundryPlayStats`) already existed and is already mounted on every app
	 * a student opens; what did not exist was the answer to "how is my work
	 * doing" without opening five apps one at a time.
	 *
	 * IT IS ARITHMETIC OVER A READ THE PAGE ALREADY MAKES. `foundryOwnerRollup`
	 * folds `foundry_play_counts()` -- which answers for the caller's own
	 * population -- so there is no new RPC, no new grant, and no second
	 * statement of any figure. Nothing owner-only moved anywhere: `players`,
	 * time played and last-played stay on the gated per-app read.
	 *
	 * COUNTS OVER APPS, NEVER OVER PEOPLE. There is no per-person figure in
	 * the input, so there is none here and none this could be widened into.
	 *
	 * THE COVERAGE SENTENCE IS PART OF THE FIGURE AND RENDERS AT ZERO TOO. A
	 * play started from an app's own direct address is not counted -- that
	 * route has no portal chrome on the page to see it -- so every number here
	 * is plays through the portal, and a zero is exactly when somebody reads a
	 * count as "nobody opened it".
	 */
	import {
		FOUNDRY_PLAY_COVERAGE_NOTE,
		foundryOwnerRollup,
		type FoundryPlayCounts
	} from './telemetry.ts';

	let {
		apps = [],
		playCounts = {}
	}: {
		apps?: { id: string; title: string }[];
		/**
		 * OPTIONAL AND DEFAULTS TO NOTHING, the same contract the gallery's
		 * counts have: a load that degraded (or a deployment with no 0139)
		 * renders zeroes and the sentence, rather than throwing or vanishing.
		 */
		playCounts?: FoundryPlayCounts;
	} = $props();

	const roll = $derived(foundryOwnerRollup(apps, playCounts));
</script>

{#if apps.length > 0}
	<section class="fdy-own" data-testid="foundry-owner-stats">
		<h2>Your apps so far</h2>
		<dl class="fdy-own-grid">
			<div>
				<dt>Plays, all time</dt>
				<dd data-testid="fdy-own-plays">{roll.plays}</dd>
			</div>
			<div>
				<dt>Plays this week</dt>
				<dd data-testid="fdy-own-plays7">{roll.plays7d}</dd>
			</div>
			<div>
				<dt>Apps played</dt>
				<dd data-testid="fdy-own-apps">{roll.appsPlayed} of {apps.length}</dd>
			</div>
		</dl>

		{#if roll.top}
			<p class="fdy-own-top">
				Most played: <strong>{roll.top.title}</strong>, {roll.top.plays}
				{roll.top.plays === 1 ? 'play' : 'plays'}.
			</p>
		{/if}

		<p class="fdy-own-note">{FOUNDRY_PLAY_COVERAGE_NOTE}</p>
	</section>
{/if}

<style>
	.fdy-own {
		padding: 1rem;
		margin-bottom: 1rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-own h2 {
		margin: 0 0 0.7rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1);
	}

	.fdy-own-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
		gap: 0.75rem;
		margin: 0 0 0.7rem;
	}

	/* min-width: 0 on the grid children: an item's automatic minimum is its
	   min-content, so a nowrap value would force the page wider than the
	   viewport at 375. */
	.fdy-own-grid > div {
		min-width: 0;
	}

	.fdy-own-grid dt {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
	}

	.fdy-own-grid dd {
		margin: 0.15rem 0 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		color: var(--fg-heat-ink, var(--text-1));
	}

	.fdy-own-top {
		margin: 0 0 0.5rem;
		color: var(--text-1);
	}

	.fdy-own-top strong {
		color: var(--fg-st-live-ink, var(--green));
	}

	.fdy-own-note {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-2);
	}
</style>
