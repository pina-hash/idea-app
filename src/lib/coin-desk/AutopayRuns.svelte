<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { signedCoins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import {
		autopayGroups,
		autopayRunSentence,
		callV2,
		num,
		reverseTransaction,
		triggerLabel,
		V2_UNAVAILABLE,
		type AutopayGroup,
		type AutopayRecent,
		type AutopayRow
	} from './v2';

	/**
	 * AUTOPAY RUNS (IDEA Coin V2, 0242): what autopay paid to whom over the
	 * last three weeks, grouped by run, with a reversal on every row and a
	 * "Run autopay now".
	 *
	 * A REVERSAL IS TWO PRESSES, the same shape as Undo in a student's history,
	 * and posts a reversing row (coin_reverse_transaction). A reversed row stays
	 * on the list, marked, so the run still reads as what it paid.
	 *
	 * Running autopay pays only what is owed (every payment has a key that can
	 * be paid once), so pressing it twice pays nothing the second time.
	 */
	let {
		supabase,
		settingsHref = '/coin/settings',
		days = 21
	}: {
		supabase: SupabaseClient;
		/** Where the paused note points. A harness with no router passes null. */
		settingsHref?: string | null;
		days?: number;
	} = $props();

	let recent = $state<AutopayRecent | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');

	async function load() {
		const r = await callV2<AutopayRecent>(supabase, 'coin_autopay_recent', { p_days: days });
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			phase = 'error';
			message = r.message;
			return;
		}
		recent = r.data;
		phase = 'ready';
	}

	onMount(() => {
		void load();
	});

	const groups = $derived<AutopayGroup[]>(recent ? autopayGroups(recent) : []);

	let running = $state(false);
	let runNotice = $state('');
	let runError = $state('');

	async function runNow() {
		running = true;
		runNotice = '';
		runError = '';
		const r = await callV2<{ ran?: boolean; reason?: string }>(supabase, 'coin_autopay_run', {
			p_trigger: 'admin'
		});
		running = false;
		if (r.kind === 'missing') runError = V2_UNAVAILABLE;
		else if (r.kind === 'error') runError = r.message;
		else runNotice = autopayRunSentence(r.data ?? {});
		await load();
	}

	let armed = $state<string | null>(null);
	let busyId = $state<string | null>(null);
	let rowError = $state<{ id: string; message: string } | null>(null);

	async function reverse(row: AutopayRow) {
		busyId = row.id;
		rowError = null;
		const r = await reverseTransaction(supabase, row.id, 'Autopay reversed');
		busyId = null;
		armed = null;
		if (!r.ok) {
			rowError = { id: row.id, message: r.message };
			return;
		}
		await load();
	}

	function when(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function groupLabel(g: AutopayGroup): string {
		if (!g.run) return 'Other automatic rows';
		return `${triggerLabel(g.run.trigger)}, ${when(g.run.started_at)}`;
	}
</script>

<section class="card" data-testid="cd-autopay">
	<div class="head">
		<h2>Autopay runs</h2>
		{#if phase === 'ready' && recent}
			{#if recent.paused}
				<span class="cdx-chip warn" data-testid="cd-autopay-paused">Paused</span>
			{:else}
				<span class="cdx-chip ok">On</span>
			{/if}
		{/if}
		<button
			type="button"
			class="btn"
			data-testid="cd-autopay-run"
			disabled={running || phase === 'missing'}
			onclick={runNow}
		>
			{running ? 'Running…' : 'Run autopay now'}
		</button>
	</div>
	<p class="cdx-note">
		Wages, Highest Grade and Perfect Score awards are paid automatically, and catch up by themselves
		whenever someone opens the desk. A run pays only what is still owed.
	</p>
	{#if recent?.paused}
		<p class="cdx-feedback error">
			Autopay is paused: nothing is paid until it is turned back on{#if settingsHref}
				in <a href={settingsHref}>Settings</a>{/if}.
		</p>
	{/if}
	{#if runNotice}<p class="cdx-feedback notice" data-testid="cd-autopay-notice">{runNotice}</p>{/if}
	{#if runError}<p class="cdx-feedback error">{runError}</p>{/if}

	{#if phase === 'loading'}
		<p class="cdx-note">Loading runs…</p>
	{:else if phase === 'missing'}
		<p class="cdx-feedback error">{V2_UNAVAILABLE}</p>
	{:else if phase === 'error'}
		<p class="cdx-feedback error">{message}</p>
	{:else if !groups.length}
		<p class="cdx-note">No autopay runs in the last {days} days.</p>
	{:else}
		<div class="groups">
			{#each groups as g (g.run ? `run-${g.run.id}` : 'loose')}
				<div class="group cdx-disc" data-testid="cd-autopay-run-group">
					<Disclosure label={groupLabel(g)} collapseWhen={true}>
						{#snippet meta()}
							<span class="cdx-chip">{g.rows.length} paid</span>
						{/snippet}
						{#if !g.rows.length}
							<p class="cdx-note">This run paid nobody: everything was already paid.</p>
						{:else}
							<ul class="rows">
								{#each g.rows as row (row.id)}
									<li class="row" class:reversed={row.reversed} data-testid="cd-autopay-row">
										<span class="person-name who" title={row.email}>{row.name}</span>
										<span class="what">{row.category}</span>
										<span class="amount" class:struck={row.reversed}>{signedCoins(num(row.amount))}</span>
										{#if row.reversed}
											<span class="cdx-chip warn">Reversed</span>
										{:else if armed === row.id}
											<button
												type="button"
												class="btn cdx-small"
												data-testid="cd-autopay-reverse-confirm"
												disabled={busyId === row.id}
												onclick={() => reverse(row)}
											>
												{busyId === row.id ? 'Reversing…' : 'Confirm reversal'}
											</button>
											<button type="button" class="btn secondary cdx-small" onclick={() => (armed = null)}>
												Keep
											</button>
										{:else}
											<button
												type="button"
												class="btn secondary cdx-small"
												data-testid="cd-autopay-reverse"
												onclick={() => {
													armed = row.id;
													rowError = null;
												}}
											>
												Reverse
											</button>
										{/if}
										{#if rowError?.id === row.id}
											<p class="cdx-feedback error full">{rowError.message}</p>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</Disclosure>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	.head .btn {
		margin-left: auto;
	}
	.groups {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.group {
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.2rem 0.6rem;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.who {
		flex: 1 1 10rem;
		min-width: 0;
		color: var(--white);
	}
	.what {
		color: var(--text-2, var(--dim));
		font-size: 0.85rem;
	}
	.amount {
		font-family: var(--font-mono);
		color: var(--green);
		min-width: 4rem;
		text-align: right;
	}
	.amount.struck {
		text-decoration: line-through;
		color: var(--text-2, var(--dim));
	}
	.full {
		flex-basis: 100%;
	}
</style>
