<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	/**
	 * THE PHRASES THE COIN TOOL LEARNED (ledger 0432, feedback fba5bfcd). When
	 * Mr. Pina logs coins by voice through Claude, a new phrase he gives with a
	 * number is saved with that number as its default, so the next time the
	 * same words need no number. This list is where he sees them, changes a
	 * default, makes one an official category, or forgets one. A full coin
	 * admin's; every call re-checks that in the database.
	 */
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins } from '$lib/coin-format';
	import { parseCoinPhrases, phraseRefusalWords, type CoinPhrase } from './phrases';

	let { supabase }: { supabase: Pick<SupabaseClient, 'rpc'> } = $props();

	let phrases = $state<CoinPhrase[] | null>(null);
	let missing = $state(false);
	let drafts = $state<Record<string, { amount: string | number; name: string; promoting: boolean; forgetting: boolean }>>({});
	let lines = $state<Record<string, { ok: boolean; text: string }>>({});
	let busy = $state<string | null>(null);
	let filter = $state<'learned' | 'all'>('learned');

	const shown = $derived((phrases ?? []).filter((p) => filter === 'all' || p.source !== 'seed'));

	async function load() {
		const { data, error } = await supabase.rpc('coin_alias_list');
		if (error) {
			missing = error.code === 'PGRST202' || error.code === '42883';
			phrases = missing ? [] : (phrases ?? []);
			return;
		}
		phrases = parseCoinPhrases(data);
		const next: typeof drafts = {};
		for (const p of phrases) next[p.id] = { amount: p.amount === null ? '' : String(p.amount), name: '', promoting: false, forgetting: false };
		drafts = next;
	}
	onMount(() => {
		void load();
	});

	async function act(p: CoinPhrase, fn: string, args: Record<string, unknown>, done: string) {
		if (busy) return;
		busy = p.id;
		try {
			const { data, error } = await supabase.rpc(fn, args);
			const r = (data ?? {}) as { ok?: unknown; reason?: unknown };
			if (error) lines = { ...lines, [p.id]: { ok: false, text: error.message } };
			else if (r.ok === true) {
				lines = { ...lines, [p.id]: { ok: true, text: done } };
				await load();
			} else lines = { ...lines, [p.id]: { ok: false, text: phraseRefusalWords(String(r.reason ?? 'unknown')) } };
		} finally {
			busy = null;
		}
	}

	function amountOf(p: CoinPhrase): number | null {
		const raw = String(drafts[p.id]?.amount ?? '').trim();
		const v = Number(raw);
		return raw && Number.isFinite(v) && v > 0 ? v : null;
	}
</script>

<section class="card" id="cd-set-phrases" data-testid="cd-coin-phrases">
	<h2>Phrases Claude learned</h2>
	<p class="cdx-note">
		When you give coins by voice with a number, the words you used are kept with that number, so next time the same words need no number. A set price always wins over a phrase.
	</p>
	{#if missing}
		<p class="cdx-feedback error">The phrase list needs a database update that has not been applied yet.</p>
	{:else if phrases === null}
		<p class="cdx-note">Loading the phrases…</p>
	{:else}
		<div class="ph-filter" role="group" aria-label="Which phrases">
			<button type="button" class="btn secondary" aria-pressed={filter === 'learned'} onclick={() => (filter = 'learned')}>Learned from you</button>
			<button type="button" class="btn secondary" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All, with the starter words</button>
		</div>
		{#if !shown.length}
			<p class="cdx-note" data-testid="cd-coin-phrases-empty">
				{filter === 'learned' ? 'Nothing learned yet. Give coins by voice with a number, and the words show up here.' : 'No phrases.'}
			</p>
		{/if}
		<ul class="ph-list">
			{#each shown as p (p.id)}
				{@const d = drafts[p.id]}
				<li class="ph" data-testid="cd-coin-phrase">
					<div class="ph-head">
						<q class="ph-words">{p.phrase}</q>
						<StatusChip tone="neutral" label={p.kind} />
						<span class="ph-cat">{p.category}</span>
						<span class="ph-amount">
							{#if p.pricing_model === 'flat' && p.categoryAmount !== null}
								Set price {coins(p.categoryAmount)}
							{:else if p.amount !== null}
								Default {coins(p.amount)}
							{:else}
								Asks for a number
							{/if}
						</span>
						<span class="ph-uses">{p.uses === 1 ? 'Used once' : `Used ${p.uses} times`}</span>
					</div>
					{#if d && p.pricing_model !== 'flat'}
						<div class="cdx-row ph-actions">
							<label class="cdx-field">
								<span>Default coins</span>
								<input class="cdx-input" type="number" min="1" step="1" inputmode="numeric" bind:value={drafts[p.id].amount} />
							</label>
							<button type="button" class="btn" disabled={busy !== null || amountOf(p) === null || amountOf(p) === p.amount} onclick={() => act(p, 'coin_alias_set_amount', { p_id: p.id, p_amount: amountOf(p) }, `Saved: ${coins(amountOf(p) ?? 0)}.`)}>
								Save default
							</button>
							{#if p.amount !== null && Number.isInteger(p.amount)}
								<button type="button" class="btn secondary" aria-expanded={d.promoting} onclick={() => (drafts[p.id].promoting = !d.promoting)}>Make official</button>
							{/if}
							<button type="button" class="btn secondary" onclick={() => (drafts[p.id].forgetting = !d.forgetting)}>Forget</button>
						</div>
						{#if d.promoting}
							<div class="cdx-row">
								<label class="cdx-field grow">
									<span>Name for the new {p.kind} category</span>
									<input class="cdx-input" type="text" maxlength="80" bind:value={drafts[p.id].name} placeholder="Trick Shot" />
								</label>
								<button type="button" class="btn" disabled={busy !== null || !d.name.trim()} onclick={() => act(p, 'coin_alias_promote', { p_id: p.id, p_name: d.name.trim() }, `${d.name.trim()} is an official category at ${coins(p.amount ?? 0)}.`)}>
									Make {d.name.trim() || 'it'} official at {coins(p.amount ?? 0)}
								</button>
							</div>
						{/if}
						{#if d.forgetting}
							<div class="cdx-row">
								<p class="cdx-note">Forget these words? Coins already given stay; the next time they will need a number again.</p>
								<button type="button" class="btn secondary" disabled={busy !== null} onclick={() => act(p, 'coin_alias_delete', { p_id: p.id }, 'Forgotten.')}>Forget for good</button>
							</div>
						{/if}
					{:else if d}
						<div class="cdx-row ph-actions">
							<button type="button" class="btn secondary" onclick={() => (drafts[p.id].forgetting = !d.forgetting)}>Forget</button>
							{#if d.forgetting}
								<button type="button" class="btn secondary" disabled={busy !== null} onclick={() => act(p, 'coin_alias_delete', { p_id: p.id }, 'Forgotten.')}>Forget for good</button>
							{/if}
						</div>
					{/if}
					{#if lines[p.id]}
						<p class="cdx-feedback {lines[p.id].ok ? 'notice' : 'error'}">{lines[p.id].text}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.ph-filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 0.8rem;
	}
	.ph-filter .btn[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--white);
	}
	.ph-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ph {
		border-top: 1px solid var(--line);
		padding: 0.7rem 0;
	}
	.ph-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.7rem;
	}
	.ph-words {
		font-size: 1.05rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ph-cat,
	.ph-amount,
	.ph-uses {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.ph-amount {
		color: var(--cyan);
	}
	.ph-actions {
		margin-top: 0.5rem;
		align-items: flex-end;
	}
	.ph .btn {
		min-height: 44px;
	}
</style>
