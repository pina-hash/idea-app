<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins, COIN_SYMBOL } from '$lib/coin-format';
	import { cents, coinRefusalWords, num, type CoinRefusal } from './v2';

	/**
	 * A SIGNED BALANCE ADJUSTMENT FOR ONE STUDENT (coin_admin_adjust_balance,
	 * which since 0251 takes the email, the amount and a required reason and
	 * nothing else). A full coin admin's tool on the Students area; the
	 * student, the history and the rest of the tools are the StudentView's.
	 *
	 * It used to be the whole "one student" card: lookup, history and tools.
	 * The Students area now owns the lookup once and hands the email here, so
	 * there is one read of a student per page, not one per panel.
	 */
	let {
		supabase,
		email,
		onChanged
	}: {
		supabase: SupabaseClient;
		email: string;
		onChanged: () => void | Promise<void>;
	} = $props();

	let adjustAmount = $state<string | number>('');
	let adjustNote = $state('');
	let busy = $state(false);
	let errorMsg = $state('');
	let notice = $state('');

	const adjustValue = $derived(Number(adjustAmount));
	const canAdjust = $derived(
		!busy &&
			String(adjustAmount).trim() !== '' &&
			Number.isFinite(adjustValue) &&
			adjustValue !== 0 &&
			!!adjustNote.trim()
	);

	async function applyAdjustment() {
		if (!canAdjust) return;
		errorMsg = '';
		notice = '';
		busy = true;
		let resp: { data: unknown; error: { message: string } | null };
		try {
			resp = await supabase.rpc('coin_admin_adjust_balance', {
				p_email: email,
				p_amount: cents(adjustValue),
				p_note: adjustNote.trim()
			});
		} finally {
			busy = false;
		}
		if (resp.error) {
			errorMsg = resp.error.message;
			return;
		}
		const r = resp.data as CoinRefusal & { ok: boolean };
		if (!r.ok) {
			errorMsg = coinRefusalWords(r);
			return;
		}
		notice = `Applied ${adjustValue > 0 ? '+' : ''}${coins(cents(adjustValue))}. The balance is now ${coins(num(r.balance))}.`;
		adjustAmount = '';
		adjustNote = '';
		await onChanged();
	}
</script>

<div class="adjust" data-testid="cd-adjust">
	<p class="cdx-note">
		A correction of the balance, up or down, with the reason. It is a row of its own in the history,
		so Undo can cancel it later.
	</p>
	{#if errorMsg}<p class="cdx-feedback error">{errorMsg}</p>{/if}
	{#if notice}<p class="cdx-feedback notice">{notice}</p>{/if}
	<div class="cdx-row">
		<label class="cdx-field">
			<span>Amount (+ or -, {COIN_SYMBOL})</span>
			<input class="cdx-input" type="number" step="0.01" data-testid="cd-adjust-amount" bind:value={adjustAmount} />
		</label>
		<label class="cdx-field grow">
			<span>Reason (required)</span>
			<input class="cdx-input" type="text" maxlength="500" bind:value={adjustNote} />
		</label>
		<button class="btn" data-testid="cd-adjust-apply" disabled={!canAdjust} onclick={applyAdjustment}>
			{busy ? 'Applying…' : 'Apply adjustment'}
		</button>
	</div>
</div>

<style>
	.adjust {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.grow {
		flex: 1 1 14rem;
	}
</style>
