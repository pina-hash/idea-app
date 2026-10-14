<script lang="ts">
	/**
	 * UP OR DOWN ON A GAME (ledger 0380, report 8274b260): two worded 44px keys
	 * and the net figure between them, one vote per person, changeable, and
	 * taken back by pressing the same direction again.
	 *
	 * THE FIGURE IS THE NET AND NOTHING ELSE. There is no split, no voter count
	 * and no name anywhere in this component or in the read behind it.
	 *
	 * ABSENCE IS THE MECHANISM: no `vote` transport, no keys. A database before
	 * 0237 hands the route no vote read, the route passes no transport, and the
	 * detail pane draws exactly what it did. The author's own game gets the
	 * figure and a sentence instead of keys (the database refuses a vote on
	 * your own game, so no control is offered whose only answer is a refusal).
	 *
	 * OPTIMISTIC, WITH THE SERVER'S WORD LAST. The keys move at once and a
	 * refusal puts them back and says why.
	 */
	import { netAfterVote, nextVote, voteRefusalSentence } from './gallery-extras.ts';

	let {
		appId,
		net,
		mine,
		own = false,
		vote
	}: {
		appId: string;
		net: number;
		mine: -1 | 0 | 1;
		/** The viewer made this game. */
		own?: boolean;
		vote?: (appId: string, value: -1 | 0 | 1) => Promise<{ ok: true; net: number } | { ok: false; reason?: string }>;
	} = $props();

	// What a press changed, held BESIDE the props so a fresh load wins the
	// moment it lands: the overlay is keyed on the app and drops with it.
	let local = $state<{ id: string; net: number; mine: -1 | 0 | 1 } | null>(null);
	let busy = $state(false);
	let problem = $state<string | null>(null);

	const shownNet = $derived(local && local.id === appId ? local.net : net);
	const shownMine = $derived(local && local.id === appId ? local.mine : mine);

	async function press(pressed: -1 | 1) {
		if (!vote || busy || own) return;
		const from = shownMine;
		const to = nextVote(from, pressed);
		const prior = { id: appId, net: shownNet, mine: from };
		local = { id: appId, net: netAfterVote(shownNet, from, to), mine: to };
		busy = true;
		problem = null;
		try {
			const r = await vote(appId, to);
			if (r.ok) local = { id: appId, net: r.net, mine: to };
			else {
				local = prior;
				problem = voteRefusalSentence(r.reason);
			}
		} catch {
			local = prior;
			problem = voteRefusalSentence(undefined);
		} finally {
			busy = false;
		}
	}
</script>

<section class="fdy-vote" aria-label="Votes" data-testid="foundry-vote">
	<h3 class="fdy-vote-h">Votes</h3>
	<div class="fdy-vote-row">
		{#if vote && !own}
			<button
				type="button"
				class="btn tap-44 fdy-vote-key"
				aria-pressed={shownMine === 1}
				disabled={busy}
				data-testid="foundry-vote-up"
				onclick={() => press(1)}
			>
				<span aria-hidden="true">▲</span> Up
			</button>
		{/if}
		<span class="fdy-vote-net" data-testid="foundry-vote-net" aria-live="polite">
			{shownNet > 0 ? `+${shownNet}` : shownNet} net
		</span>
		{#if vote && !own}
			<button
				type="button"
				class="btn tap-44 fdy-vote-key"
				aria-pressed={shownMine === -1}
				disabled={busy}
				data-testid="foundry-vote-down"
				onclick={() => press(-1)}
			>
				<span aria-hidden="true">▼</span> Down
			</button>
		{/if}
	</div>
	{#if own}
		<p class="fdy-vote-note">You cannot vote on your own game.</p>
	{:else if vote}
		<p class="fdy-vote-note">One vote each, and you can change it. Press the same key again to take it back.</p>
	{/if}
	{#if problem}
		<p class="fdy-vote-problem" role="status" data-testid="foundry-vote-problem">{problem}</p>
	{/if}
</section>

<style>
	.fdy-vote {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-3, 0.75rem) 0;
	}
	.fdy-vote-h {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.fdy-vote-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3, 0.75rem);
	}
	.fdy-vote-net {
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--text-1);
		min-width: 4.5rem;
		text-align: center;
	}
	/* The lit key is the held vote: a worded state, not the hue alone. */
	.fdy-vote-key[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--green);
	}
	.fdy-vote-note,
	.fdy-vote-problem {
		margin: 0;
		color: var(--text-2);
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.fdy-vote-problem {
		color: var(--text-1);
	}
</style>
