<script lang="ts">
	/**
	 * Host-console reward configuration. Presentation + one callback: SAVE
	 * hands back the complete rule set (tournament_set_reward_rules replaces
	 * the whole set in one call, so the editor's state IS the rule set).
	 * Blank amount = no rule of that kind.
	 */
	import type { RewardRule } from './tournaments';

	let {
		rules = [],
		busy = false,
		locked = false,
		onsave
	}: {
		rules?: RewardRule[];
		busy?: boolean;
		locked?: boolean;
		onsave: (
			rules: { trigger_type: string; trigger_value: number | null; amount: number }[]
		) => void;
	} = $props();

	// bind:value on a type="number" input coerces the bound state to a NUMBER
	// (or '' when cleared), so every field is string | number and read through
	// txt() -- calling .trim() on the raw state crashes after the first edit.
	type FieldValue = string | number;
	const txt = (v: FieldValue | null | undefined): string =>
		v === null || v === undefined ? '' : String(v).trim();

	let winAmount = $state<FieldValue>('');
	let placement = $state<Record<number, FieldValue>>({ 1: '', 2: '', 3: '' });
	let roundRows = $state<{ round: FieldValue; amount: FieldValue }[]>([]);
	let dirty = $state(false);

	// Re-seed the form whenever the server rows change (a save round-trips
	// through invalidateAll, so this is also what confirms the save landed).
	$effect(() => {
		const r = rules;
		winAmount = String(r.find((x) => x.trigger_type === 'win')?.amount ?? '') || '';
		const p: Record<number, FieldValue> = { 1: '', 2: '', 3: '' };
		for (const rule of r) {
			if (rule.trigger_type === 'placement' && rule.trigger_value) {
				p[rule.trigger_value] = String(rule.amount);
			}
		}
		placement = p;
		roundRows = r
			.filter((x) => x.trigger_type === 'round_reached')
			.sort((a, b) => (a.trigger_value ?? 0) - (b.trigger_value ?? 0))
			.map((x) => ({ round: String(x.trigger_value ?? ''), amount: String(x.amount) }));
		dirty = false;
	});

	function parseAmount(s: FieldValue): number | null {
		const n = Number.parseInt(txt(s), 10);
		return Number.isFinite(n) && n >= 1 ? n : null;
	}

	let formError = $state('');

	function save() {
		formError = '';
		const out: { trigger_type: string; trigger_value: number | null; amount: number }[] = [];
		if (txt(winAmount)) {
			const amt = parseAmount(winAmount);
			if (!amt) {
				formError = 'Win amount must be a positive whole number.';
				return;
			}
			out.push({ trigger_type: 'win', trigger_value: null, amount: amt });
		}
		for (const place of [1, 2, 3]) {
			if (!txt(placement[place])) continue;
			const amt = parseAmount(placement[place]);
			if (!amt) {
				formError = 'Placement amounts must be positive whole numbers.';
				return;
			}
			out.push({ trigger_type: 'placement', trigger_value: place, amount: amt });
		}
		const seenRounds = new Set<number>();
		for (const row of roundRows) {
			if (!txt(row.round) && !txt(row.amount)) continue;
			const round = Number.parseInt(txt(row.round), 10);
			const amt = parseAmount(row.amount);
			if (!Number.isFinite(round) || round < 1 || round > 20 || !amt) {
				formError = 'Each round bonus needs a round (1–20) and a positive amount.';
				return;
			}
			if (seenRounds.has(round)) {
				formError = `Round ${round} appears twice.`;
				return;
			}
			seenRounds.add(round);
			out.push({ trigger_type: 'round_reached', trigger_value: round, amount: amt });
		}
		onsave(out);
	}
</script>

<div class="rr-editor">
	{#if locked}
		<p class="note">The tournament is complete; rewards are settled and rules are locked.</p>
	{:else}
		<p class="note">
			Amounts pay into the public reward ledger as matches are won; leave a field blank for no
			reward of that kind. Round bonuses match winners-bracket rounds.
		</p>
	{/if}

	<div class="rr-grid" class:locked>
		<label class="rr-field">
			<span>Every match win</span>
			<input type="number" min="1" placeholder="—" bind:value={winAmount}
				disabled={locked} oninput={() => (dirty = true)} />
		</label>
		{#each [1, 2, 3] as place (place)}
			<label class="rr-field">
				<span>{place === 1 ? '1st place' : place === 2 ? '2nd place' : '3rd place'}</span>
				<input type="number" min="1" placeholder="—" bind:value={placement[place]}
					disabled={locked} oninput={() => (dirty = true)} />
			</label>
		{/each}
	</div>

	<div class="rr-rounds">
		<span class="rr-rounds-label">Round bonuses</span>
		{#each roundRows as row, i (i)}
			<span class="rr-round-row">
				<input type="number" min="1" max="20" placeholder="round" bind:value={row.round}
					disabled={locked} oninput={() => (dirty = true)} />
				<input type="number" min="1" placeholder="amount" bind:value={row.amount}
					disabled={locked} oninput={() => (dirty = true)} />
				{#if !locked}
					<button
						class="mini"
						type="button"
						onclick={() => {
							roundRows = roundRows.filter((_, j) => j !== i);
							dirty = true;
						}}
					>
						✕
					</button>
				{/if}
			</span>
		{/each}
		{#if !locked}
			<button
				class="mini"
				type="button"
				onclick={() => {
					roundRows = [...roundRows, { round: '', amount: '' }];
					dirty = true;
				}}
			>
				+ round bonus
			</button>
		{/if}
	</div>

	{#if formError}<p class="rr-error">{formError}</p>{/if}
	{#if !locked}
		<button class="btn" disabled={busy || !dirty} onclick={save}>Save reward rules</button>
	{/if}
</div>

<style>
	.rr-editor {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		align-items: flex-start;
	}
	.note {
		color: var(--dim, #7a8a7a);
		font-size: 0.85rem;
		margin: 0;
	}
	.rr-grid {
		display: flex;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.rr-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim, #7a8a7a);
	}
	.rr-field input,
	.rr-round-row input {
		width: 6.4rem;
		background: var(--bg0, #060a06);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.35rem 0.5rem;
	}
	.rr-rounds {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		align-items: flex-start;
	}
	.rr-rounds-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim, #7a8a7a);
	}
	.rr-round-row {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.rr-round-row input {
		width: 5.4rem;
	}
	.mini {
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--dim, #7a8a7a);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.18rem 0.5rem;
		cursor: pointer;
	}
	.mini:hover {
		color: var(--white, #e8ffe8);
		border-color: var(--green, #00ff41);
	}
	.rr-error {
		color: var(--amber, #ffb400);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		margin: 0;
	}
</style>
