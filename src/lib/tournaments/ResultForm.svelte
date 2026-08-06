<script lang="ts">
	import type { BracketMatch, TournamentEntry } from './tournaments';

	/**
	 * Host result entry for one bracket match: one row per game up to the
	 * match's best-of, honoring the tournament's score-entry vs win/loss
	 * toggle. Used for both first submission and corrections (correct mode
	 * additionally requires a logged reason). Validation here is convenience;
	 * the RPC re-validates everything server-side.
	 */
	let {
		match,
		entries,
		scoreEntry,
		mode = 'submit',
		busy = false,
		onsubmit
	}: {
		match: BracketMatch;
		entries: Record<string, TournamentEntry>;
		scoreEntry: boolean;
		mode?: 'submit' | 'correct';
		busy?: boolean;
		onsubmit: (result: unknown, reason: string) => void;
	} = $props();

	interface GameRow {
		winner: 'a' | 'b' | null;
		score_a: string;
		score_b: string;
	}
	const emptyGame = (): GameRow => ({ winner: null, score_a: '', score_b: '' });
	let games = $state<GameRow[]>([emptyGame()]);
	let reason = $state('');
	let localError = $state('');

	const nameA = $derived(
		match.entry_a_id ? (entries[match.entry_a_id]?.display_name ?? '?') : 'TBD'
	);
	const nameB = $derived(
		match.entry_b_id ? (entries[match.entry_b_id]?.display_name ?? '?') : 'TBD'
	);
	const need = $derived(Math.floor(match.best_of / 2) + 1);

	function addGame() {
		if (games.length < match.best_of) games.push(emptyGame());
	}
	function removeGame() {
		if (games.length > 1) games.pop();
	}

	function submit() {
		localError = '';
		const payload: Record<string, unknown>[] = [];
		for (let i = 0; i < games.length; i++) {
			const g = games[i];
			if (scoreEntry) {
				const a = Number.parseInt(g.score_a, 10);
				const b = Number.parseInt(g.score_b, 10);
				if (Number.isNaN(a) || Number.isNaN(b)) {
					localError = `Game ${i + 1}: enter both scores.`;
					return;
				}
				if (a === b) {
					localError = `Game ${i + 1}: scores cannot tie.`;
					return;
				}
				payload.push({ score_a: a, score_b: b });
			} else {
				if (!g.winner) {
					localError = `Game ${i + 1}: pick the winner.`;
					return;
				}
				payload.push({ winner: g.winner });
			}
		}
		if (mode === 'correct' && !reason.trim()) {
			localError = 'A correction needs a reason (it is logged).';
			return;
		}
		onsubmit({ games: payload }, reason.trim());
	}
</script>

<div class="result-form">
	<div class="rf-head">
		<span class="vs">{nameA} <span class="vs-sep">vs</span> {nameB}</span>
		<span class="bo">Best of {match.best_of} · first to {need}</span>
	</div>
	{#each games as g, i (i)}
		<div class="game-row">
			<span class="game-n">G{i + 1}</span>
			{#if scoreEntry}
				<input
					class="score"
					type="number"
					min="0"
					placeholder={nameA}
					bind:value={g.score_a}
					aria-label={`Game ${i + 1} score for ${nameA}`}
				/>
				<span class="dash">–</span>
				<input
					class="score"
					type="number"
					min="0"
					placeholder={nameB}
					bind:value={g.score_b}
					aria-label={`Game ${i + 1} score for ${nameB}`}
				/>
			{:else}
				<button
					type="button"
					class="pick"
					class:on={g.winner === 'a'}
					onclick={() => (g.winner = 'a')}
				>
					{nameA}
				</button>
				<button
					type="button"
					class="pick"
					class:on={g.winner === 'b'}
					onclick={() => (g.winner = 'b')}
				>
					{nameB}
				</button>
			{/if}
		</div>
	{/each}
	{#if match.best_of > 1}
		<div class="game-controls">
			<button type="button" class="mini" onclick={addGame} disabled={games.length >= match.best_of}>
				+ game
			</button>
			<button type="button" class="mini" onclick={removeGame} disabled={games.length <= 1}>
				− game
			</button>
		</div>
	{/if}
	{#if mode === 'correct'}
		<input
			class="reason"
			type="text"
			placeholder="Reason for the correction (logged)"
			bind:value={reason}
		/>
	{/if}
	{#if localError}
		<div class="err">{localError}</div>
	{/if}
	<button type="button" class="btn go" onclick={submit} disabled={busy}>
		{mode === 'correct' ? 'Apply correction' : 'Submit result'}
	</button>
</div>

<style>
	.result-form {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		border-radius: 6px;
		background: var(--bg2, #101610);
	}
	.rf-head {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
		font-family: 'Rajdhani', sans-serif;
	}
	.vs {
		font-weight: 700;
		color: var(--white, #e8ffe8);
	}
	.vs-sep {
		color: var(--dim, #7a8a7a);
		font-weight: 400;
	}
	.bo {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--gold, #c8a848);
	}
	.game-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.game-n {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim, #7a8a7a);
		width: 1.6rem;
		flex: none;
	}
	.score {
		width: 5.4rem;
		background: var(--bg0, #070a07);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Share Tech Mono', monospace;
		padding: 0.3rem 0.45rem;
	}
	.dash {
		color: var(--dim, #7a8a7a);
	}
	.pick {
		flex: 1;
		min-width: 0;
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
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
	}
	.game-controls {
		display: flex;
		gap: 0.4rem;
	}
	.mini {
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--dim, #7a8a7a);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.reason {
		background: var(--bg0, #070a07);
		border: 1px solid var(--gold, #c8a848);
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.35rem 0.5rem;
	}
	.err {
		color: var(--amber, #ffb347);
		font-size: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
	}
	.go {
		align-self: flex-start;
	}
</style>
