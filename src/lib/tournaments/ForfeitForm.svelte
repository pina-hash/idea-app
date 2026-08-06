<script lang="ts">
	/**
	 * Host forfeit / no-show entry for one bracket match: pick which side
	 * advances, give a short reason, confirm.
	 *
	 * Deliberately SEPARATE from ResultForm rather than a mode of it. A
	 * forfeit is not a score or a win/loss pick -- nothing was played -- and
	 * folding it into the result form would put a "nobody turned up" control
	 * one mis-click away from entering a real scoreline. It is also gold, not
	 * the primary action colour: awarding a match nobody played is an
	 * exception, and it should not look like the normal way to finish one.
	 *
	 * Presentation only; the RPC re-validates the winner, the reason and the
	 * match state server-side.
	 */
	import type { BracketMatch, TournamentEntry } from './tournaments';

	let {
		match,
		entries,
		busy = false,
		onsubmit,
		oncancel
	}: {
		match: BracketMatch;
		entries: Record<string, TournamentEntry>;
		busy?: boolean;
		/** Called with the forfeit payload tournament_submit_match_result takes. */
		onsubmit: (result: { forfeit: true; winner_id: string; reason: string }) => void;
		oncancel?: () => void;
	} = $props();

	let winnerId = $state<string | null>(null);
	let reason = $state('');
	let localError = $state('');
	let confirming = $state(false);

	const nameOf = (id: string | null) => (id ? (entries[id]?.display_name ?? '?') : 'TBD');
	const loserId = $derived(
		winnerId === null ? null : winnerId === match.entry_a_id ? match.entry_b_id : match.entry_a_id
	);

	function go() {
		localError = '';
		if (!winnerId) {
			localError = 'Pick which side advances.';
			return;
		}
		if (!reason.trim()) {
			localError = 'Give a short reason (it is logged on the match).';
			return;
		}
		if (!confirming) {
			confirming = true;
			return;
		}
		onsubmit({ forfeit: true, winner_id: winnerId, reason: reason.trim() });
	}
</script>

<div class="ff">
	<div class="ff-head">
		<span class="ff-tag">Forfeit / no-show</span>
		<span class="ff-note">No games are recorded and no reward is paid.</span>
	</div>

	<div class="picks">
		{#each [match.entry_a_id, match.entry_b_id] as eid (eid)}
			<button
				type="button"
				class="pick"
				class:on={winnerId === eid}
				disabled={!eid}
				onclick={() => {
					winnerId = eid;
					confirming = false;
				}}
			>
				{nameOf(eid)} advances
			</button>
		{/each}
	</div>

	<input
		class="reason"
		type="text"
		maxlength="200"
		placeholder="Reason (e.g. no-show, withdrew, disqualified)"
		bind:value={reason}
		oninput={() => (confirming = false)}
	/>

	{#if localError}<div class="err">{localError}</div>{/if}

	<div class="actions">
		<button type="button" class="go" class:confirm={confirming} disabled={busy} onclick={go}>
			{#if confirming}
				Confirm: {nameOf(winnerId)} advances, {nameOf(loserId)} is out
			{:else}
				Award by forfeit
			{/if}
		</button>
		{#if oncancel}
			<button type="button" class="cancel" onclick={oncancel}>cancel</button>
		{/if}
	</div>
</div>

<style>
	.ff {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--gold, #c8a848);
		border-radius: 6px;
		background: rgba(200, 168, 72, 0.06);
	}
	.ff-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.ff-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--gold, #c8a848);
	}
	.ff-note {
		font-size: 0.8rem;
		color: var(--dim, #7a8a7a);
	}
	.picks {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.pick {
		flex: 1;
		min-width: 9rem;
		background: var(--bg0, #070a07);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		font-weight: 600;
		padding: 0.3rem 0.45rem;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pick.on {
		border-color: var(--gold, #c8a848);
		color: var(--gold, #c8a848);
	}
	.pick:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.reason {
		background: var(--bg0, #070a07);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.35rem 0.5rem;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.go {
		background: none;
		border: 1px solid var(--gold, #c8a848);
		border-radius: 4px;
		color: var(--gold, #c8a848);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.go.confirm {
		background: rgba(200, 168, 72, 0.16);
		color: var(--white, #e8ffe8);
	}
	.go:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.cancel {
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--dim, #7a8a7a);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
	}
	.err {
		color: var(--amber, #ffb347);
		font-size: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
	}
</style>
