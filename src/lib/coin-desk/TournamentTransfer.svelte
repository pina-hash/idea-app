<script lang="ts">
	import { onMount } from 'svelte';
	import { coins } from '$lib/coin-format';
	import { V2_UNAVAILABLE } from './v2';
	import {
		entryTotalDefault,
		parseAmount,
		placementWords,
		settleRefusal,
		TOURNAMENT_DEFAULT_MODE,
		tournamentAmounts,
		transferPlan,
		type TournamentEntry,
		type TournamentMode,
		type TournamentPending,
		type TournamentTransports
	} from './tournament-transfer';

	/**
	 * THE TOURNAMENT TRANSFER (IDEA Coin V2, 2.9). A full coin admin's area.
	 *
	 * Each concluded tournament with rewards waiting is one card: its teams,
	 * each with a total (what the team earned, or the placement default when it
	 * earned nothing), and every member's amount from that total and the
	 * per-tournament choice of how to pay a team. Every figure is editable.
	 * `tournamentAmounts` is the one arithmetic; this file only renders it.
	 *
	 * BOTH FINISHES ARE TWO PRESSES, because each one closes the tournament for
	 * good: Transfer names the coins and the number of students before it
	 * posts, Paid physically says that nothing will be posted. Afterwards the
	 * tournament leaves the list and its record is said in its place.
	 */
	let { transports }: { transports: TournamentTransports } = $props();

	let list = $state<TournamentPending[]>([]);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');

	let modes = $state<Record<string, TournamentMode>>({});
	/** An entry's total as typed, by entry id. */
	let totals = $state<Record<string, string>>({});
	/** A member's amount as typed, by member key. */
	let overrides = $state<Record<string, string>>({});
	let armed = $state<{ id: string; outcome: 'transferred' | 'paid_physically' } | null>(null);
	let busy = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});
	let finished = $state<{ id: string; name: string; words: string }[]>([]);

	async function load() {
		phase = 'loading';
		const r = await transports.load();
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			phase = 'error';
			message = r.message;
			return;
		}
		const done = new Set(finished.map((f) => f.id));
		list = (r.data ?? []).filter((t) => !done.has(t.id));
		const m = { ...modes };
		const tt = { ...totals };
		for (const t of list) {
			m[t.id] ??= TOURNAMENT_DEFAULT_MODE;
			for (const e of t.entries) tt[e.entry_id] ??= String(entryTotalDefault(e));
		}
		modes = m;
		totals = tt;
		phase = 'ready';
	}

	onMount(() => {
		void load();
	});

	function clearOverrides(entries: TournamentEntry[]) {
		const prefixes = entries.map((e) => `${e.entry_id}:`);
		overrides = Object.fromEntries(
			Object.entries(overrides).filter(([k]) => !prefixes.some((p) => k.startsWith(p)))
		);
	}

	function setMode(t: TournamentPending, mode: TournamentMode) {
		if (modes[t.id] === mode) return;
		modes = { ...modes, [t.id]: mode };
		clearOverrides(t.entries);
		armed = null;
	}

	function setTotal(e: TournamentEntry, text: string) {
		totals = { ...totals, [e.entry_id]: text };
		clearOverrides([e]);
		armed = null;
	}

	function totalOf(e: TournamentEntry): number {
		return parseAmount(totals[e.entry_id]) ?? 0;
	}

	function numericTotals(t: TournamentPending): Record<string, number> {
		return Object.fromEntries(t.entries.map((e) => [e.entry_id, totalOf(e)]));
	}

	function totalProblem(t: TournamentPending): string | null {
		const bad = t.entries.find((e) => parseAmount(totals[e.entry_id]) == null);
		return bad ? `${bad.name}’s total must be between 0 and 10000 coins.` : null;
	}

	function planFor(t: TournamentPending) {
		return transferPlan(t, modes[t.id] ?? TOURNAMENT_DEFAULT_MODE, numericTotals(t), overrides);
	}

	function arm(t: TournamentPending, outcome: 'transferred' | 'paid_physically') {
		errors = { ...errors, [t.id]: '' };
		if (outcome === 'transferred') {
			const problem = totalProblem(t) ?? planFor(t).problem;
			if (problem) {
				errors = { ...errors, [t.id]: problem };
				return;
			}
			if (!planFor(t).lines.length) {
				errors = {
					...errors,
					[t.id]: 'Nobody would be paid: every amount is zero or every member is a walk-up. Use Paid physically instead.'
				};
				return;
			}
		}
		armed = { id: t.id, outcome };
	}

	async function confirm(t: TournamentPending) {
		const settle = transports.settle;
		if (!settle || !armed || armed.id !== t.id || busy) return;
		const outcome = armed.outcome;
		const mode = modes[t.id] ?? TOURNAMENT_DEFAULT_MODE;
		const plan = planFor(t);
		busy = t.id;
		try {
			const r = await settle(
				t.id,
				outcome,
				outcome === 'transferred' ? mode : null,
				outcome === 'transferred' ? plan.lines : null
			);
			armed = null;
			if (r.kind === 'missing') {
				errors = { ...errors, [t.id]: V2_UNAVAILABLE };
				return;
			}
			if (r.kind === 'error') {
				errors = { ...errors, [t.id]: r.message };
				return;
			}
			if (!r.data?.ok) {
				errors = { ...errors, [t.id]: settleRefusal(r.data?.reason) };
				if (r.data?.reason === 'already_settled') await load();
				return;
			}
			const words =
				outcome === 'transferred'
					? `Transferred: ${coins(plan.coins)} in ${r.data.paid ?? plan.lines.length} payment${(r.data.paid ?? plan.lines.length) === 1 ? '' : 's'}${r.data.skipped ? `, ${r.data.skipped} skipped` : ''}.`
					: 'Paid physically: nothing was posted to any balance.';
			finished = [{ id: t.id, name: t.name, words }, ...finished];
			list = list.filter((x) => x.id !== t.id);
		} finally {
			busy = null;
		}
	}
</script>

<section class="card" data-testid="cd-tournaments">
	<div class="t-head">
		<h2>Tournament rewards</h2>
		<button type="button" class="btn secondary cdx-small" onclick={load} disabled={phase === 'loading'}>Refresh</button>
	</div>
	<p class="cdx-note" data-testid="cd-tournaments-explain">
		Concluded tournaments whose rewards are waiting. Transfer them to the students' balances, or record that
		the prizes were handed out as physical coins.
	</p>

	{#if finished.length}
		<ul class="t-finished" role="status" data-testid="cd-tournament-finished">
			{#each finished as f (f.id)}
				<li class="cdx-feedback notice"><strong>{f.name}</strong>: {f.words}</li>
			{/each}
		</ul>
	{/if}

	{#if phase === 'loading'}
		<p class="cdx-note">Loading tournaments…</p>
	{:else if phase === 'missing'}
		<p class="cdx-feedback error" data-testid="cd-tournaments-missing">{V2_UNAVAILABLE}</p>
	{:else if phase === 'error'}
		<p class="cdx-feedback error">{message}</p>
	{:else if !list.length}
		<p class="cdx-note" data-testid="cd-tournaments-empty">No concluded tournament is waiting for its rewards.</p>
	{:else}
		{#each list as t (t.id)}
			{@const mode = modes[t.id] ?? TOURNAMENT_DEFAULT_MODE}
			{@const plan = planFor(t)}
			<article class="t-card" data-testid="cd-tournament">
				<h3 class="t-name">{t.name}</h3>

				<div class="t-modes" role="group" aria-label="How to pay a team">
					<button
						type="button"
						class="btn secondary cdx-small t-mode"
						aria-pressed={mode === 'duplicate'}
						class:on={mode === 'duplicate'}
						data-testid="cd-tournament-mode"
						data-mode="duplicate"
						onclick={() => setMode(t, 'duplicate')}
					>
						Give each member the full amount
					</button>
					<button
						type="button"
						class="btn secondary cdx-small t-mode"
						aria-pressed={mode === 'split'}
						class:on={mode === 'split'}
						data-testid="cd-tournament-mode"
						data-mode="split"
						onclick={() => setMode(t, 'split')}
					>
						Split the team’s total among its members
					</button>
				</div>
				<p class="cdx-note t-rule" data-testid="cd-tournament-rule">
					{mode === 'duplicate'
						? 'Each member gets the team’s whole total. This is the default, and how tournaments always recorded a team’s reward.'
						: 'The total is divided evenly among everyone on the team, walk-ups included, to the cent; leftover cents go to the first members listed. A walk-up’s share is not paid.'}
					Changing this, or a team’s total, works every member’s amount out again.
				</p>

				<ol class="t-entries">
					{#each t.entries as e (e.entry_id)}
						{@const rows = tournamentAmounts(e, mode, totalOf(e))}
						{@const place = placementWords(e.placement)}
						<li class="t-entry" data-testid="cd-tournament-entry">
							<div class="t-entry-head">
								<span class="t-entry-name">{e.name}</span>
								{#if place}<span class="cdx-chip ok">{place}</span>{/if}
								<label class="cdx-field t-total">
									<span>Team total (coins)</span>
									<input
										class="cdx-input"
										type="text"
										inputmode="decimal"
										data-testid="cd-tournament-total"
										value={totals[e.entry_id] ?? ''}
										oninput={(ev) => setTotal(e, (ev.currentTarget as HTMLInputElement).value)}
									/>
								</label>
							</div>
							<p class="cdx-note t-source">
								{Number(e.earned) > 0
									? `Earned in the tournament: ${coins(Number(e.earned))}.`
									: place
										? `Earned nothing in the tournament, so the ${place} default is filled in.`
										: 'Earned nothing in the tournament.'}
							</p>
							<ul class="t-members">
								{#each rows as m (m.key)}
									<li class="t-member" data-testid="cd-tournament-member">
										<span class="person-name t-member-name" title={m.name}>{m.name}</span>
										{#if m.paid}
											<label class="t-member-amount">
												<span class="t-sr">Amount for {m.name} (coins)</span>
												<input
													class="cdx-input"
													type="text"
													inputmode="decimal"
													data-testid="cd-tournament-amount"
													value={overrides[m.key] ?? String(m.amount)}
													oninput={(ev) => {
														overrides = { ...overrides, [m.key]: (ev.currentTarget as HTMLInputElement).value };
														armed = null;
													}}
												/>
											</label>
										{:else}
											<span class="cdx-chip warn" data-testid="cd-tournament-walkup">No account, skipped</span>
										{/if}
									</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ol>

				{#if transports.settle}
					<div class="t-finish">
						{#if armed?.id === t.id && armed.outcome === 'transferred'}
							<p class="t-ask" data-testid="cd-tournament-ask">
								Transfer {coins(plan.coins)} to {plan.students} student{plan.students === 1 ? '' : 's'}?
								{#if plan.skipped}{plan.skipped} walk-up{plan.skipped === 1 ? '' : 's'} will not be paid.{/if}
								This closes the tournament.
							</p>
							<button type="button" class="btn" data-testid="cd-tournament-confirm" disabled={busy === t.id} onclick={() => confirm(t)}>
								{busy === t.id ? 'Transferring…' : 'Yes, transfer'}
							</button>
							<button type="button" class="btn secondary" onclick={() => (armed = null)}>Cancel</button>
						{:else if armed?.id === t.id && armed.outcome === 'paid_physically'}
							<p class="t-ask" data-testid="cd-tournament-ask">
								Record that the prizes were handed out as physical coins? Nothing is posted to any balance, and
								this closes the tournament.
							</p>
							<button type="button" class="btn" data-testid="cd-tournament-confirm" disabled={busy === t.id} onclick={() => confirm(t)}>
								{busy === t.id ? 'Recording…' : 'Yes, paid physically'}
							</button>
							<button type="button" class="btn secondary" onclick={() => (armed = null)}>Cancel</button>
						{:else}
							<button type="button" class="btn" data-testid="cd-tournament-transfer" onclick={() => arm(t, 'transferred')}>
								Transfer
							</button>
							<button
								type="button"
								class="btn secondary"
								data-testid="cd-tournament-physical"
								onclick={() => arm(t, 'paid_physically')}
							>
								Paid physically
							</button>
							<span class="cdx-note t-sum">
								{coins(plan.coins)} to {plan.students} student{plan.students === 1 ? '' : 's'} as it stands.
							</span>
						{/if}
					</div>
				{/if}
				{#if errors[t.id]}<p class="cdx-feedback error" role="alert">{errors[t.id]}</p>{/if}
			</article>
		{/each}
	{/if}
</section>

<style>
	.t-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	.t-finished {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
	}
	.t-card {
		border: 1px solid var(--boundary, var(--line));
		border-radius: 4px;
		background: var(--bg0);
		padding: 0.8rem 0.9rem;
		margin-top: 0.9rem;
		min-width: 0;
	}
	.t-name {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
		overflow-wrap: anywhere;
	}
	.t-modes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.t-mode {
		white-space: normal;
		text-align: left;
	}
	.t-mode.on {
		color: var(--green);
		border-color: var(--green);
		border-width: 2px;
	}
	.t-rule {
		margin: 0.4rem 0 0.2rem;
	}
	.t-entries,
	.t-members {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.t-entry {
		border-top: 1px solid var(--line);
		padding: 0.6rem 0;
	}
	.t-entry-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.4rem 0.8rem;
	}
	.t-entry-name {
		font-weight: 600;
		color: var(--white);
		flex: 1 1 10rem;
		min-width: 0;
		overflow-wrap: anywhere;
		align-self: center;
	}
	.t-total input {
		width: 8rem;
	}
	.t-source {
		margin: 0.3rem 0;
	}
	.t-member {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.8rem;
		min-height: 44px;
		padding-left: 0.8rem;
	}
	.t-member-name {
		flex: 1 1 9rem;
		min-width: 0;
		color: var(--white);
	}
	.t-member-amount input {
		width: 7rem;
	}
	.t-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.t-finish {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.6rem;
	}
	.t-ask {
		flex-basis: 100%;
		margin: 0;
		color: var(--white);
	}
	.t-sum {
		margin: 0;
	}
</style>
