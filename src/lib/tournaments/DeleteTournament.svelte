<script lang="ts">
	/**
	 * The delete-a-tournament control, shared by the host console (full card)
	 * and the tournament list (compact strip). Presentation + one callback, so
	 * the dev harness drives it with no Supabase.
	 *
	 * Deletion is irreversible and takes the reward ledger with it, so the
	 * control is deliberately three gestures, not one: reveal, then type the
	 * tournament's own name, then confirm. The typed name is ALSO required by
	 * tournament_delete itself once a tournament has entries (see 0066) -- this
	 * form mirrors that rule so the button is never enabled on input the server
	 * would reject, but the server is the one enforcing it.
	 *
	 * An empty draft has nothing to lose and skips the typing step, exactly as
	 * the RPC does.
	 *
	 * When the tournament has ANY reward ledger rows (0068), a distinct payout
	 * warning step comes FIRST, before the name field is even reachable: the
	 * real coin total and entry count (as loaded by the page, not guessed),
	 * plus its own explicit "I understand" acknowledgment. tournament_delete
	 * itself refuses without a matching p_acknowledge_payout_loss -- this form
	 * mirrors that gate the same way it mirrors the name-match one, and the
	 * server is still the one enforcing it.
	 */
	import type { Tournament } from './tournaments';

	let {
		tournament,
		entryCount = 0,
		matchCount = 0,
		rewardCount = 0,
		rewardCoins = 0,
		rewardEntries = 0,
		compact = false,
		busy = false,
		error = '',
		ondelete
	}: {
		tournament: Tournament;
		entryCount?: number;
		matchCount?: number;
		/** Number of reward ledger rows (payout events), for the summary line. */
		rewardCount?: number;
		/** Total IDEA Coins across those rows, for the payout-loss warning. */
		rewardCoins?: number;
		/** Distinct entries that received a payout, for the payout-loss warning. */
		rewardEntries?: number;
		/** List-page variant: one line, no explanatory card around it. */
		compact?: boolean;
		busy?: boolean;
		error?: string;
		/**
		 * Called with the typed confirmation (empty string when none is needed)
		 * and whether the payout loss was acknowledged (false when there was
		 * nothing to acknowledge).
		 */
		ondelete: (confirmName: string, acknowledgePayoutLoss: boolean) => void;
	} = $props();

	let armed = $state(false);
	// Two separate flags on purpose: checking the box only arms the Continue
	// button, it must not itself advance past the warning -- otherwise
	// checking the box and reaching the name step would be the same gesture,
	// which is exactly the "one click past a real warning" this step exists
	// to prevent.
	let payoutBoxChecked = $state(false);
	let payoutAcked = $state(false);
	let typed = $state('');

	const needsPayoutAck = $derived(rewardCount > 0);
	const needsName = $derived(entryCount > 0);
	// The payout warning is a gate the caller must pass through before the
	// name step is even shown, mirroring the RPC checking acknowledgment
	// before the name match.
	const showingPayoutWarning = $derived(needsPayoutAck && !payoutAcked);
	// The server compares case-insensitively after trimming the ends; nothing
	// else is normalized, so neither is this.
	const nameMatches = $derived(
		typed.trim().toLowerCase() === tournament.name.trim().toLowerCase()
	);
	const canGo = $derived(!busy && !showingPayoutWarning && (!needsName || nameMatches));

	function reset() {
		armed = false;
		payoutBoxChecked = false;
		payoutAcked = false;
		typed = '';
	}

	function continuePastPayoutWarning() {
		if (!payoutBoxChecked) return;
		payoutAcked = true;
	}

	function go() {
		if (!canGo) return;
		ondelete(needsName ? typed.trim() : '', needsPayoutAck);
	}

	const summary = $derived(
		[
			`${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`,
			`${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`,
			`${rewardCount} reward ${rewardCount === 1 ? 'payout' : 'payouts'}`
		].join(', ')
	);
</script>

<div class="del" class:compact>
	{#if !armed}
		<button type="button" class="trigger" disabled={busy} onclick={() => (armed = true)}>
			Delete tournament
		</button>
		{#if !compact}
			<p class="hint">
				Removes this tournament and everything in it. There is no undo.
			</p>
		{/if}
	{:else if showingPayoutWarning}
		<div class="panel payout">
			<p class="warn">
				<strong>{tournament.name}</strong> has already paid out
				<strong>{rewardCoins} IDEA Coin{rewardCoins === 1 ? '' : 's'}</strong>
				to <strong>{rewardEntries} {rewardEntries === 1 ? 'entry' : 'entries'}</strong>
				as reward payouts. Deleting this tournament permanently erases that record; the coins
				already paid cannot be clawed back and the payout history cannot be recovered.
			</p>
			<label class="ack">
				<input type="checkbox" bind:checked={payoutBoxChecked} />
				<span>
					I understand this permanently erases the record of {rewardCoins}i¢ paid to
					{rewardEntries}
					{rewardEntries === 1 ? 'entry' : 'entries'}.
				</span>
			</label>
			{#if error}<p class="err">{error}</p>{/if}
			<div class="actions">
				<button
					type="button"
					class="go"
					disabled={!payoutBoxChecked}
					onclick={continuePastPayoutWarning}
				>
					Continue
				</button>
				<button type="button" class="cancel" onclick={reset}>Cancel</button>
			</div>
		</div>
	{:else}
		<div class="panel">
			<p class="warn">
				{#if needsName}
					This permanently deletes <strong>{tournament.name}</strong> along with {summary}. It
					cannot be undone.
				{:else}
					This deletes <strong>{tournament.name}</strong>. It has no entries yet.
				{/if}
			</p>
			{#if needsName}
				<label class="confirm">
					<span>Type <strong>{tournament.name}</strong> to confirm</span>
					<input
						type="text"
						autocomplete="off"
						placeholder={tournament.name}
						bind:value={typed}
						onkeydown={(e) => {
							if (e.key === 'Enter') go();
							if (e.key === 'Escape') reset();
						}}
					/>
				</label>
			{/if}
			{#if error}<p class="err">{error}</p>{/if}
			<div class="actions">
				<button type="button" class="go" disabled={!canGo} onclick={go}>
					{busy ? 'Deleting…' : 'Delete permanently'}
				</button>
				<button type="button" class="cancel" disabled={busy} onclick={reset}>Cancel</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.del {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.trigger,
	.cancel {
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--dim, #7a8a7a);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		align-self: flex-start;
	}
	.trigger:hover:not(:disabled) {
		color: var(--crimson, #ff3355);
		border-color: var(--crimson, #ff3355);
	}
	.compact .trigger {
		font-size: 0.66rem;
		padding: 0.15rem 0.5rem;
	}
	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--dim, #7a8a7a);
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--crimson, #ff3355);
		border-radius: 6px;
		background: rgba(255, 51, 85, 0.06);
	}
	.panel.payout {
		border-color: var(--gold, #ffd24a);
		background: rgba(255, 210, 74, 0.08);
	}
	.warn {
		margin: 0;
		font-size: 0.88rem;
		color: var(--white, #e8ffe8);
	}
	.ack {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim, #7a8a7a);
		cursor: pointer;
	}
	.ack input {
		margin-top: 0.15rem;
		accent-color: var(--gold, #ffd24a);
		cursor: pointer;
	}
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim, #7a8a7a);
	}
	.confirm input {
		background: var(--bg0, #070a07);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.35rem 0.5rem;
		max-width: 22rem;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.go {
		background: none;
		border: 1px solid var(--crimson, #ff3355);
		border-radius: 4px;
		color: var(--crimson, #ff3355);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.payout .go {
		border-color: var(--gold, #ffd24a);
		color: var(--gold, #ffd24a);
	}
	.go:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.err {
		margin: 0;
		color: var(--amber, #ffb347);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
	}
</style>
