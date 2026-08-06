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
	 */
	import type { Tournament } from './tournaments';

	let {
		tournament,
		entryCount = 0,
		matchCount = 0,
		rewardCount = 0,
		compact = false,
		busy = false,
		error = '',
		ondelete
	}: {
		tournament: Tournament;
		entryCount?: number;
		matchCount?: number;
		rewardCount?: number;
		/** List-page variant: one line, no explanatory card around it. */
		compact?: boolean;
		busy?: boolean;
		error?: string;
		/** Called with the typed confirmation (empty string when none is needed). */
		ondelete: (confirmName: string) => void;
	} = $props();

	let armed = $state(false);
	let typed = $state('');

	const needsName = $derived(entryCount > 0);
	// The server compares case-insensitively after trimming the ends; nothing
	// else is normalized, so neither is this.
	const nameMatches = $derived(
		typed.trim().toLowerCase() === tournament.name.trim().toLowerCase()
	);
	const canGo = $derived(!busy && (!needsName || nameMatches));

	function reset() {
		armed = false;
		typed = '';
	}

	function go() {
		if (!canGo) return;
		ondelete(needsName ? typed.trim() : '');
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
	.warn {
		margin: 0;
		font-size: 0.88rem;
		color: var(--white, #e8ffe8);
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
