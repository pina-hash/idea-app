<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import { callV2, V2_UNAVAILABLE } from './v2';
	import type { CoinClass } from './log';
	import {
		CLAIMANT_STATE_WORDS,
		CONTRACT_PAY_TYPES,
		CONTRACT_STATUS_LABELS,
		PAY_TYPE_LABELS,
		claimantName,
		claimantState,
		contractDraftProblem,
		contractPostParams,
		contractPostRefusal,
		emptyContractDraft,
		payLine,
		splitContracts,
		waitingInQueue,
		type AdminContract,
		type ContractDraft
	} from './contracts';

	/**
	 * CONTRACTS (IDEA Coin V2 session two, 0248). Post a job, see where each
	 * claimant is, cancel or reset one. Completion is not a button here: a
	 * claimant marks their part done and it appears in the Queue with the
	 * amount filled in, and approving it there pays them. When every claimant
	 * is paid, the contract completes itself.
	 *
	 * Every read and write goes through `callV2`, so a database without 0248
	 * says V2_UNAVAILABLE in one place rather than erroring.
	 *
	 * `queueHref` null removes the link to the queue (the dev harness, which
	 * has no router); the real route passes `/coin-desk/queue`.
	 */
	let {
		supabase,
		classes = [],
		queueHref = '/coin-desk/queue'
	}: {
		supabase: SupabaseClient;
		/** The classes a contract may be restricted to: `coinStaff.sections`. */
		classes?: CoinClass[];
		queueHref?: string | null;
	} = $props();

	let contracts = $state<AdminContract[]>([]);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let loadMessage = $state('');

	async function load() {
		const r = await callV2<AdminContract[]>(supabase, 'coin_contracts_admin');
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			if (phase !== 'ready') {
				phase = 'error';
				loadMessage = r.message;
			}
			return;
		}
		contracts = r.data ?? [];
		phase = 'ready';
	}

	onMount(() => {
		void load();
	});

	const groups = $derived(splitContracts(contracts));

	// --- posting ----------------------------------------------------------------
	let draft = $state<ContractDraft>(emptyContractDraft());
	let postBusy = $state(false);
	let postError = $state('');
	let postNotice = $state('');
	const problem = $derived(contractDraftProblem(draft));

	async function post() {
		if (problem || postBusy) return;
		postBusy = true;
		postError = '';
		postNotice = '';
		const r = await callV2<{ ok: boolean; reason?: string; id?: string }>(
			supabase,
			'coin_contract_post',
			contractPostParams(draft)
		);
		postBusy = false;
		if (r.kind === 'missing') return void (postError = V2_UNAVAILABLE);
		if (r.kind === 'error') return void (postError = r.message);
		if (!r.data?.ok) return void (postError = contractPostRefusal(r.data?.reason));
		postNotice = `Posted "${draft.title.trim()}".`;
		draft = emptyContractDraft();
		await load();
	}

	// --- cancel and reset: two presses each ---------------------------------------
	let armed = $state<{ id: string; action: 'cancel' | 'reset' } | null>(null);
	let cancelReason = $state('');
	let rowBusy = $state<string | null>(null);
	let rowError = $state<{ id: string; message: string } | null>(null);
	let rowNotice = $state('');

	function arm(id: string, action: 'cancel' | 'reset') {
		armed = { id, action };
		cancelReason = '';
		rowError = null;
	}

	async function confirm(c: AdminContract) {
		if (!armed || armed.id !== c.id) return;
		const action = armed.action;
		rowBusy = c.id;
		rowError = null;
		rowNotice = '';
		const r =
			action === 'cancel'
				? await callV2<{ ok: boolean }>(supabase, 'coin_admin_cancel_contract', {
						p_contract_id: c.id,
						p_reason: cancelReason.trim() || null
					})
				: await callV2<{ ok: boolean; cleared?: number }>(supabase, 'coin_admin_reset_contract', {
						p_contract_id: c.id
					});
		rowBusy = null;
		armed = null;
		if (r.kind !== 'ok' || !r.data?.ok) {
			rowError = {
				id: c.id,
				message: r.kind === 'missing' ? V2_UNAVAILABLE : r.kind === 'error' ? r.message : 'Refused by the server.'
			};
			return;
		}
		rowNotice =
			action === 'cancel'
				? `Cancelled "${c.title}". Nothing was paid for it; its claims stay as history.`
				: `Reset "${c.title}": every claim cleared, open again.`;
		await load();
	}

	function when(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function claimedCount(c: AdminContract): number {
		return c.claimants.length;
	}
</script>

{#snippet contractCard(c: AdminContract)}
	{@const waiting = waitingInQueue(c)}
	<li class="contract" data-testid="cd-contract" data-status={c.status}>
		<div class="head">
			<span class="title">{c.title}</span>
			<span class="cdx-chip" class:ok={c.status === 'open'} class:warn={c.status === 'full'}>
				{CONTRACT_STATUS_LABELS[c.status]}
			</span>
			{#if c.debt_only}
				<span class="cdx-chip warn" data-testid="cd-contract-debt-only">Students in debt only</span>
			{/if}
		</div>
		{#if c.description}<p class="desc">{c.description}</p>{/if}
		<p class="facts">
			<span>{payLine(c, coins)}</span>
			<span>{claimedCount(c)} of {c.max_contractors} claimed</span>
			<span>{c.section ? `Only ${c.section}` : 'Any class'}</span>
			<span>Posted {when(c.created_at)}</span>
			{#if c.cancelled_at}<span>Cancelled {when(c.cancelled_at)}{c.cancel_reason ? `: ${c.cancel_reason}` : ''}</span>{/if}
			{#if c.completed_at}<span>Completed {when(c.completed_at)}</span>{/if}
		</p>

		{#if c.claimants.length}
			<ul class="claimants" data-testid="cd-contract-claimants">
				{#each c.claimants as k (k.email)}
					{@const st = claimantState(k)}
					<li>
						<span class="claimant" title={k.email}>{claimantName(k)}</span>
						<span class="cdx-chip" class:ok={st === 'paid'} class:warn={st === 'marked_done'} data-state={st}>
							{CLAIMANT_STATE_WORDS[st]}
						</span>
						{#if k.hours != null && Number(k.hours) > 0}<span class="hours">{k.hours} h reported</span>{/if}
					</li>
				{/each}
			</ul>
			{#if waiting && queueHref}
				<p class="cdx-note">
					{waiting} waiting to be paid:
					<a href={queueHref} data-testid="cd-contract-queue-link">open the Queue</a>, where the amount is
					already filled in.
				</p>
			{:else if waiting}
				<p class="cdx-note">{waiting} waiting to be paid in the Queue, where the amount is already filled in.</p>
			{/if}
		{:else if c.status === 'open'}
			<p class="cdx-note">Nobody has claimed it yet.</p>
		{/if}

		{#if c.status === 'open' || c.status === 'full'}
			<div class="cdx-row actions">
				{#if armed?.id === c.id && armed.action === 'cancel'}
					<label class="cdx-field grow">
						<span>Why (optional, kept with the contract)</span>
						<input class="cdx-input" type="text" maxlength="300" bind:value={cancelReason} />
					</label>
					<button
						type="button"
						class="btn cdx-small"
						data-testid="cd-contract-cancel-confirm"
						disabled={rowBusy === c.id}
						onclick={() => confirm(c)}
					>
						Confirm cancel, pays nobody
					</button>
					<button type="button" class="btn secondary cdx-small" onclick={() => (armed = null)}>Keep it</button>
				{:else if armed?.id === c.id && armed.action === 'reset'}
					<span class="cdx-note">
						This clears {claimedCount(c)} claim{claimedCount(c) === 1 ? '' : 's'} and opens it again. A claim
						marked done loses its place.
					</span>
					<button
						type="button"
						class="btn cdx-small"
						data-testid="cd-contract-reset-confirm"
						disabled={rowBusy === c.id}
						onclick={() => confirm(c)}
					>
						Confirm reset
					</button>
					<button type="button" class="btn secondary cdx-small" onclick={() => (armed = null)}>Keep it</button>
				{:else}
					<button
						type="button"
						class="btn secondary cdx-small"
						data-testid="cd-contract-cancel"
						onclick={() => arm(c.id, 'cancel')}
					>
						Cancel contract
					</button>
					{#if claimedCount(c)}
						<button
							type="button"
							class="btn secondary cdx-small"
							data-testid="cd-contract-reset"
							onclick={() => arm(c.id, 'reset')}
						>
							Reset claims
						</button>
					{/if}
				{/if}
			</div>
		{/if}
		{#if rowError?.id === c.id}<p class="cdx-feedback error">{rowError.message}</p>{/if}
	</li>
{/snippet}

{#if phase === 'missing'}
	<section class="card" data-testid="cd-contracts-missing">
		<h2>Contracts</h2>
		<p class="cdx-feedback error">{V2_UNAVAILABLE}</p>
	</section>
{:else if phase === 'error'}
	<section class="card">
		<h2>Contracts</h2>
		<p class="cdx-feedback error">{loadMessage}</p>
	</section>
{:else}
	<section class="card" data-testid="cd-contracts-post">
		<h2>Post a contract</h2>
		<p class="cdx-note">
			A job a student claims, does, and marks done. Marking it done puts a card in the Queue with the
			amount filled in; approving it pays them.
		</p>
		{#if postError}<p class="cdx-feedback error" data-testid="cd-contract-post-error">{postError}</p>{/if}
		{#if postNotice}<p class="cdx-feedback notice" data-testid="cd-contract-post-notice">{postNotice}</p>{/if}
		<div class="cdx-row">
			<label class="cdx-field grow">
				<span>Title</span>
				<input class="cdx-input" type="text" maxlength="200" data-testid="cd-contract-title" bind:value={draft.title} />
			</label>
		</div>
		<label class="cdx-field">
			<span>What the job is (optional)</span>
			<textarea class="cdx-textarea" maxlength="2000" bind:value={draft.description}></textarea>
		</label>
		<fieldset class="pay">
			<legend>How it pays</legend>
			{#each CONTRACT_PAY_TYPES as t (t)}
				<label class="radio">
					<input type="radio" name="cd-pay-type" value={t} bind:group={draft.payType} />
					<span>{PAY_TYPE_LABELS[t]}</span>
				</label>
			{/each}
		</fieldset>
		<div class="cdx-row">
			{#if draft.payType === 'hourly'}
				<label class="cdx-field">
					<span>Rate (coins an hour)</span>
					<input class="cdx-input" type="number" min="0.01" max="1000" step="0.01" data-testid="cd-contract-rate" bind:value={draft.hourlyRate} />
				</label>
			{:else}
				<label class="cdx-field">
					<span>{draft.payType === 'quality' ? 'Base payout (coins)' : 'Payout (coins, split between claimants)'}</span>
					<input class="cdx-input" type="number" min="1" step="1" data-testid="cd-contract-payout" bind:value={draft.payout} />
				</label>
			{/if}
			<label class="cdx-field">
				<span>Students who may claim it</span>
				<input class="cdx-input" type="number" min="1" max="50" step="1" bind:value={draft.maxContractors} />
			</label>
			<label class="cdx-field">
				<span>Class</span>
				<select class="cdx-select" data-testid="cd-contract-class" bind:value={draft.sectionId}>
					<option value="">Any class</option>
					{#each classes as c (c.id)}
						<option value={c.id}>Only {c.label}</option>
					{/each}
				</select>
			</label>
		</div>
		<label class="check">
			<input type="checkbox" data-testid="cd-contract-debt-only-box" bind:checked={draft.debtOnly} />
			<span>
				Students in debt only. A restitution job: only a student whose balance is below zero can see or
				claim it, and it never appears on the public board.
			</span>
		</label>
		<div class="cdx-row">
			<button
				type="button"
				class="btn"
				data-testid="cd-contract-post"
				aria-disabled={!!problem || postBusy}
				onclick={post}
			>
				{postBusy ? 'Posting…' : 'Post contract'}
			</button>
			{#if problem}<span class="cdx-note" data-testid="cd-contract-problem">{problem}</span>{/if}
		</div>
	</section>

	<section class="card" data-testid="cd-contracts-list">
		<h2>Open contracts</h2>
		{#if rowNotice}<p class="cdx-feedback notice">{rowNotice}</p>{/if}
		{#if phase === 'loading'}
			<p class="cdx-note">Loading the contracts…</p>
		{:else if !groups.live.length}
			<p class="cdx-note">No open contracts.</p>
		{:else}
			<ul class="contracts">
				{#each groups.live as c (c.id)}
					{@render contractCard(c)}
				{/each}
			</ul>
		{/if}
		{#if groups.closed.length}
			<div class="cdx-disc closed">
				<Disclosure
					label="Completed and cancelled ({groups.closed.length})"
					collapseWhen={true}
					testId="cd-contracts-closed"
				>
					<ul class="contracts">
						{#each groups.closed as c (c.id)}
							{@render contractCard(c)}
						{/each}
					</ul>
				</Disclosure>
			</div>
		{/if}
	</section>
{/if}

<style>
	h2 {
		margin-top: 0;
	}
	.grow {
		flex: 1 1 16rem;
	}
	.pay {
		border: 1px solid var(--line);
		border-radius: 6px;
		margin: 0.6rem 0;
		padding: 0.4rem 0.8rem 0.6rem;
	}
	legend {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2, var(--dim));
		padding: 0 0.3rem;
	}
	.radio,
	.check {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 44px;
		color: var(--white);
		cursor: pointer;
	}
	.radio input,
	.check input {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
		accent-color: var(--green);
	}
	.contracts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(26rem, 100%), 1fr));
		gap: 0.8rem;
	}
	.contract {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.title {
		font-weight: 700;
		color: var(--white);
		overflow-wrap: anywhere;
	}
	.desc {
		margin: 0.3rem 0;
		color: var(--white);
		font-size: 0.9rem;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 1rem;
		margin: 0.3rem 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2, var(--dim));
	}
	.claimants {
		list-style: none;
		margin: 0.3rem 0;
		padding: 0;
	}
	.claimants li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
	.claimant {
		color: var(--white);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.hours {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2, var(--dim));
	}
	.closed {
		margin-top: 0.8rem;
	}
</style>
