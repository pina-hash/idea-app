<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { toneFrom, verdictGlyph, type LegacyTone } from '$lib/ui/status-tone';
	import './coin-page.css';
	import type { CoinPageHistoryRow } from '$lib/coin-balance';
	import { disputeRefusalWords, disputeWords, type CoinActionResult } from './extras';

	/**
	 * A DISPUTE OF AN AUTOMATIC FINE (2.11, 0245), on one history row. A row
	 * the database marks `disputable` gets a Dispute key that asks for the
	 * reason; a row with a dispute shows where it stands. An omitted `dispute`
	 * removes the key and keeps the state line.
	 */
	let {
		row,
		dispute = null,
		ondone = null
	}: {
		row: CoinPageHistoryRow;
		dispute?: ((transactionId: string, reason: string) => Promise<CoinActionResult>) | null;
		ondone?: (() => void) | null;
	} = $props();

	let open = $state(false);
	let reason = $state('');
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	const canAsk = $derived(!!dispute && row.disputable && row.dispute?.status !== 'pending');
	const blocked = $derived(
		!reason.trim() || reason.trim().length > 1000 ? disputeRefusalWords({ reason: 'reason_required' }) : null
	);

	async function send() {
		if (!dispute || blocked || busy) return;
		busy = true;
		try {
			const r = await dispute(row.id, reason.trim());
			if (r.ok) {
				outcome = { ok: true, text: 'Sent. Your teacher reads it, and if it is approved the fine is undone.' };
				open = false;
				reason = '';
				ondone?.();
			} else {
				outcome = { ok: false, text: disputeRefusalWords(r) };
			}
		} catch {
			outcome = { ok: false, text: disputeRefusalWords({ reason: 'error' }) };
		} finally {
			busy = false;
		}
	}

	function tone(s: string): LegacyTone {
		return s === 'approved' ? 'good' : s === 'denied' ? 'bad' : s === 'pending' ? 'wait' : '';
	}
</script>

{#if row.dispute}
	<StatusChip
		tone={toneFrom(tone(row.dispute.status))}
		glyph={verdictGlyph(tone(row.dispute.status))}
		wrap
		label={disputeWords(row.dispute)}
		data-testid="coin-dispute-state"
	/>
{/if}
{#if canAsk}
	{#if !open}
		<button
			type="button"
			class="btn secondary cpx-key"
			data-testid="coin-dispute"
			onclick={() => {
				outcome = null;
				open = true;
			}}>Dispute this fine</button
		>
	{:else}
		<div class="cpx-confirm" data-testid="coin-dispute-form">
			<label class="cpx-field">
				<span>Why is this fine wrong?</span>
				<textarea maxlength="1000" bind:value={reason} data-testid="coin-dispute-reason"></textarea>
			</label>
			<div class="cpx-row">
				<button
					type="button"
					class="btn cpx-key"
					aria-disabled={blocked || busy ? 'true' : undefined}
					data-testid="coin-dispute-send"
					onclick={send}>{busy ? 'Sending...' : 'Send the dispute'}</button
				>
				<button type="button" class="btn secondary cpx-key" onclick={() => (open = false)}>Cancel</button>
			</div>
			{#if blocked && reason.length > 0}<p class="cpx-why">{blocked}</p>{/if}
		</div>
	{/if}
{/if}
{#if dispute && (row.disputable || row.dispute)}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status">{outcome?.text ?? ''}</p>
{/if}
