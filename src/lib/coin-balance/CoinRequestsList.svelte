<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { toneFrom, verdictGlyph } from '$lib/ui/status-tone';
	import './coin-page.css';
	import { coins } from '$lib/coin-format';
	import { coinWhen, type CoinMyRequest } from '$lib/coin-balance';
	import {
		cancelRequestRefusalWords,
		requestCancellable,
		requestStatusShort,
		requestStatusWords,
		requestTitle,
		sentence,
		type CoinActionResult
	} from './extras';

	/**
	 * WHAT HAPPENED TO WHAT I SENT (coin_my_page.requests, 0250): the student's
	 * own queue cards from the last 60 days, newest first, each in words:
	 * waiting for your teacher, approved, denied with the reason. A pending card
	 * may be cancelled, except a split payment (a payment in progress) and a
	 * contract (work already reported), which the queue settles. An omitted
	 * `cancel` removes every Cancel.
	 */
	let {
		requests,
		cancel = null,
		ondone = null
	}: {
		requests: CoinMyRequest[];
		cancel?: ((id: string) => Promise<CoinActionResult>) | null;
		ondone?: (() => void) | null;
	} = $props();

	let busyId = $state<string | null>(null);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	function tone(r: CoinMyRequest): 'good' | 'bad' | 'wait' | '' {
		if (r.status === 'approved') return 'good';
		if (r.status === 'denied') return 'bad';
		if (r.status === 'pending') return 'wait';
		return '';
	}

	async function drop(r: CoinMyRequest) {
		if (!cancel || busyId) return;
		busyId = r.id;
		try {
			const a = await cancel(r.id);
			outcome = a.ok ? { ok: true, text: `Cancelled: ${requestTitle(r)}.` } : { ok: false, text: cancelRequestRefusalWords(a) };
			if (a.ok) ondone?.();
		} catch {
			outcome = { ok: false, text: cancelRequestRefusalWords({ reason: 'error' }) };
		} finally {
			busyId = null;
		}
	}
</script>

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-req" data-testid="coin-requests">
	<h2 id="cpx-h-req">Your submissions</h2>
	<p class="cpx-lead">Everything you sent in the last 60 days, and what your teacher decided.</p>
	{#if requests.length}
		<ul class="cpx-list">
			{#each requests as r (r.id)}
				<li data-testid="request" data-status={r.status}>
					<div class="cpx-line">
						<span class="cpx-name">{requestTitle(r)}</span>
						{#if r.amount !== null && r.amount > 0 && r.kind !== 'reported_coins'}
							<span class="cpx-meta">{coins(r.amount)}</span>
						{/if}
					</div>
					<div class="cpx-row">
						<StatusChip tone={toneFrom(tone(r))} glyph={verdictGlyph(tone(r))} label={requestStatusShort(r)} />
						<span class="cpx-meta">Sent {coinWhen(r.created_at)}</span>
					</div>
					<p class="cpx-text" data-testid="request-status">{sentence(requestStatusWords(r))}</p>
					{#if cancel && requestCancellable(r)}
						<button
							type="button"
							class="btn secondary cpx-key"
							aria-disabled={busyId ? 'true' : undefined}
							data-testid="request-cancel"
							onclick={() => drop(r)}>{busyId === r.id ? 'Cancelling...' : 'Cancel this'}</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="cpx-note">Nothing sent yet.</p>
	{/if}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="request-outcome">
		{outcome?.text ?? ''}
	</p>
</section>
