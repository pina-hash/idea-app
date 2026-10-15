<script lang="ts">
	import './coin-page.css';
	import { reportRefusalWords, type CoinActionResult } from './extras';

	/**
	 * COINS ON HAND (2.10, 0245). A count, not an amount of anything: it moves
	 * no balance. Once an admin or a Student Auditor checks it, the Ledger shows
	 * it beside the student as coins on hand, reported and dated; the
	 * leaderboard still ranks the balance. An omitted `report` removes the form.
	 */
	let {
		report = null,
		pending = false,
		ondone = null
	}: {
		report?: ((count: number) => Promise<CoinActionResult>) | null;
		/** A count already waiting to be checked. */
		pending?: boolean;
		ondone?: (() => void) | null;
	} = $props();

	let countText = $state('');
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	const count = $derived.by(() => {
		const t = countText.trim();
		if (!/^\d+$/.test(t)) return null;
		const n = Number(t);
		return n <= 100000 ? n : null;
	});
	const blocked = $derived.by(() => {
		if (pending) return reportRefusalWords({ reason: 'already_pending' });
		if (!countText.trim()) return 'Enter how many coins you have.';
		if (count === null) return reportRefusalWords({ reason: 'count' });
		return null;
	});

	async function send() {
		if (!report || blocked || busy || count === null) return;
		busy = true;
		try {
			const r = await report(count);
			if (r.ok) {
				outcome = { ok: true, text: 'Sent. Once it is checked, the Ledger shows it as coins on hand.' };
				countText = '';
				ondone?.();
			} else {
				outcome = { ok: false, text: reportRefusalWords(r) };
			}
		} catch {
			outcome = { ok: false, text: reportRefusalWords({ reason: 'error' }) };
		} finally {
			busy = false;
		}
	}
</script>

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-onhand" data-testid="coin-onhand">
	<h2 id="cpx-h-onhand">Coins on hand</h2>
	<p class="cpx-lead">
		Tell us how many coins you are holding. An admin or a Student Auditor checks your coins, and once it is
		approved the Ledger shows it as coins on hand, reported, with the date. The leaderboard still ranks your
		balance.
	</p>
	{#if report}
		<label class="cpx-field">
			<span>Coins you have</span>
			<input type="text" inputmode="numeric" autocomplete="off" bind:value={countText} data-testid="onhand-count" />
		</label>
		<button
			type="button"
			class="btn cpx-key"
			aria-disabled={blocked || busy ? 'true' : undefined}
			data-testid="onhand-send"
			onclick={send}>{busy ? 'Sending...' : 'Send the count'}</button
		>
		{#if blocked}<p class="cpx-why" data-testid="onhand-blocked">{blocked}</p>{/if}
	{/if}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="onhand-outcome">
		{outcome?.text ?? ''}
	</p>
</section>
