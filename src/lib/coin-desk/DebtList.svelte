<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins } from '$lib/coin-format';
	import { callV2, num, sortDebt, V2_UNAVAILABLE, type DebtRow } from './v2';

	/**
	 * STUDENTS IN DEBT (IDEA Coin V2, 0240's coin_debt_list): every student
	 * whose one balance is below zero, deepest first, each a link to that
	 * student on the Students area.
	 *
	 * `open` stands in for the link where there is no router (the dev
	 * harness); without it each row is a real link.
	 */
	let {
		supabase,
		open
	}: {
		supabase: SupabaseClient;
		open?: (email: string) => void;
	} = $props();

	let rows = $state<DebtRow[]>([]);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');

	async function load() {
		phase = 'loading';
		const r = await callV2<DebtRow[]>(supabase, 'coin_debt_list');
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			phase = 'error';
			message = r.message;
			return;
		}
		rows = sortDebt(r.data ?? []);
		phase = 'ready';
	}

	onMount(() => {
		void load();
	});

	const total = $derived(rows.reduce((sum, r) => sum + num(r.balance), 0));

	function studentHref(email: string): string {
		return `/coin-desk/students?student=${encodeURIComponent(email)}`;
	}
</script>

<section class="card" data-testid="cd-debt-list">
	<div class="head">
		<h2>Students in debt</h2>
		<button type="button" class="btn secondary cdx-small" onclick={load} disabled={phase === 'loading'}>
			Refresh
		</button>
	</div>
	<p class="cdx-note">
		A balance below zero is debt. Purchases are refused until it is back to zero; physical coins
		handed over pay it down (open the student to log a debt payment).
	</p>

	{#if phase === 'loading'}
		<p class="cdx-note">Loading the list…</p>
	{:else if phase === 'missing'}
		<p class="cdx-feedback error">{V2_UNAVAILABLE}</p>
	{:else if phase === 'error'}
		<p class="cdx-feedback error">{message}</p>
	{:else if !rows.length}
		<p class="cdx-note" data-testid="cd-debt-empty">Nobody is in debt.</p>
	{:else}
		<p class="cdx-note">
			{rows.length} student{rows.length === 1 ? '' : 's'}, {coins(total)} in all.
		</p>
		<ol class="debt-rows">
			{#each rows as r (r.email)}
				<li class="debt-row" data-testid="cd-debt-row">
					{#if open}
						<button type="button" class="who" onclick={() => open?.(r.email)}>
							<span class="person-name" title={r.name}>{r.name}</span>
							<span class="email">{r.email}</span>
						</button>
					{:else}
						<a class="who" href={studentHref(r.email)}>
							<span class="person-name" title={r.name}>{r.name}</span>
							<span class="email">{r.email}</span>
						</a>
					{/if}
					<span class="section">{r.section ?? 'No class'}</span>
					<span class="cdx-balance negative">{coins(num(r.balance))}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	.debt-rows {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
	}
	.debt-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.4rem 1rem;
		border-bottom: 1px solid var(--line);
	}
	.debt-row:last-child {
		border-bottom: none;
	}
	.who {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-height: 44px;
		min-width: 0;
		padding: 0.3rem 0;
		background: none;
		border: none;
		color: var(--cyan);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		font: inherit;
	}
	.who:hover .person-name {
		text-decoration: underline;
	}
	.email {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2, var(--dim));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.section {
		color: var(--text-2, var(--dim));
		font-size: 0.85rem;
	}
	@media (max-width: 32rem) {
		.debt-row {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.section {
			grid-column: 1;
		}
	}
</style>
