<script lang="ts">
	import './coin-page.css';
	import {
		contractPayWords,
		contractRefusalWords,
		contractStateWords,
		type CoinActionResult,
		type CoinMyContract
	} from './extras';
	import { coins } from '$lib/coin-format';

	/**
	 * MY CONTRACTS (2.8, 0248). Open contracts a student may claim, and the ones
	 * they hold. Marking one done sends it to the queue with the amount filled
	 * in (hours are required on an hourly contract); it pays when a teacher
	 * approves it, and a denial hands the work back. A restitution job is open
	 * only to a student whose balance is below zero, and says so.
	 *
	 * An omitted `claim` removes every Claim; an omitted `markDone` every Mark
	 * done. The list still shows.
	 */
	let {
		contracts,
		claim = null,
		markDone = null,
		ondone = null
	}: {
		contracts: CoinMyContract[];
		claim?: ((id: string) => Promise<CoinActionResult>) | null;
		markDone?: ((id: string, hours: number | null, note: string | null) => Promise<CoinActionResult>) | null;
		ondone?: (() => void) | null;
	} = $props();

	const mine = $derived(contracts.filter((c) => c.mine));
	const open = $derived(contracts.filter((c) => !c.mine));

	let busyId = $state<string | null>(null);
	let doneFor = $state<string | null>(null);
	let hoursText = $state('');
	let noteText = $state('');
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	const hours = $derived.by(() => {
		const t = hoursText.trim();
		if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
		const n = Number(t);
		return n > 0 && n <= 200 ? n : null;
	});

	function doneBlocked(c: CoinMyContract): string | null {
		if (c.pay_type === 'hourly' && hours === null) {
			return hoursText.trim() ? contractRefusalWords({ reason: 'hours' }) : 'Enter the hours you worked.';
		}
		return null;
	}

	async function doClaim(c: CoinMyContract) {
		if (!claim || busyId) return;
		busyId = c.id;
		try {
			const r = await claim(c.id);
			outcome = r.ok
				? { ok: true, text: `Claimed: ${c.title}. Mark it done when the work is finished.` }
				: { ok: false, text: contractRefusalWords(r) };
			if (r.ok) ondone?.();
		} catch {
			outcome = { ok: false, text: contractRefusalWords({ reason: 'error' }) };
		} finally {
			busyId = null;
		}
	}

	async function doDone(c: CoinMyContract) {
		if (!markDone || busyId || doneBlocked(c)) return;
		busyId = c.id;
		try {
			const r = await markDone(c.id, c.pay_type === 'hourly' ? hours : null, noteText.trim() || null);
			if (r.ok) {
				const amt = typeof r.data.amount === 'number' || typeof r.data.amount === 'string' ? Number(r.data.amount) : null;
				outcome = {
					ok: true,
					text: `Sent for approval: ${c.title}${amt !== null && Number.isFinite(amt) ? `, ${coins(amt)}` : ''}. It pays when your teacher approves it.`
				};
				doneFor = null;
				hoursText = '';
				noteText = '';
				ondone?.();
			} else {
				outcome = { ok: false, text: contractRefusalWords(r) };
			}
		} catch {
			outcome = { ok: false, text: contractRefusalWords({ reason: 'error' }) };
		} finally {
			busyId = null;
		}
	}
</script>

{#snippet details(c: CoinMyContract)}
	<div class="cpx-line">
		<span class="cpx-name">{c.title}</span>
		<span class="cpx-meta">{c.claimed_count} of {c.max_contractors} claimed</span>
	</div>
	{#if c.debt_only}
		<span class="cpx-chip bad wrap" data-testid="contract-restitution">Restitution job, for students in debt</span>
	{/if}
	<p class="cpx-text">{contractPayWords(c)}.{#if c.section}{' '}For {c.section}.{/if}</p>
	{#if c.description}<p class="cpx-text">{c.description}</p>{/if}
{/snippet}

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-contracts" data-testid="coin-contracts">
	<h2 id="cpx-h-contracts">Contracts</h2>
	<p class="cpx-lead">
		Paid jobs. Claim one, do the work, then mark it done. It pays when your teacher approves it. An hourly
		contract asks for your hours.
	</p>

	<h3>Yours</h3>
	{#if mine.length}
		<ul class="cpx-list">
			{#each mine as c (c.id)}
				<li data-testid="contract-mine">
					{@render details(c)}
					<span
						class="cpx-chip wrap {c.paid_at ? 'good' : c.done_at ? 'wait' : ''}"
						data-testid="contract-state">{contractStateWords(c)}</span
					>
					{#if markDone && !c.done_at && !c.paid_at}
						{#if doneFor === c.id}
							{#if c.pay_type === 'hourly'}
								<label class="cpx-field">
									<span>Hours you worked</span>
									<input type="text" inputmode="decimal" autocomplete="off" bind:value={hoursText} data-testid="contract-hours" />
								</label>
							{/if}
							<label class="cpx-field">
								<span>A note for your teacher (optional)</span>
								<textarea maxlength="1000" bind:value={noteText} data-testid="contract-note"></textarea>
							</label>
							<div class="cpx-row">
								<button
									type="button"
									class="btn cpx-key"
									aria-disabled={doneBlocked(c) || busyId ? 'true' : undefined}
									data-testid="contract-done-send"
									onclick={() => doDone(c)}>{busyId === c.id ? 'Sending...' : 'Send for approval'}</button
								>
								<button type="button" class="btn secondary cpx-key" onclick={() => (doneFor = null)}>Cancel</button>
							</div>
							{#if doneBlocked(c)}<p class="cpx-why">{doneBlocked(c)}</p>{/if}
						{:else}
							<button
								type="button"
								class="btn cpx-key"
								data-testid="contract-done"
								onclick={() => {
									outcome = null;
									hoursText = '';
									noteText = '';
									doneFor = c.id;
								}}>Mark done</button
							>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="cpx-note">You hold no contracts.</p>
	{/if}

	<h3>Open to claim</h3>
	{#if open.length}
		<ul class="cpx-list">
			{#each open as c (c.id)}
				{@const full = c.claimed_count >= c.max_contractors}
				<li data-testid="contract-open">
					{@render details(c)}
					{#if claim}
						<button
							type="button"
							class="btn cpx-key"
							aria-disabled={full || busyId ? 'true' : undefined}
							data-testid="contract-claim"
							onclick={() => (full ? null : doClaim(c))}>{busyId === c.id ? 'Claiming...' : 'Claim'}</button
						>
						{#if full}<p class="cpx-why">{contractRefusalWords({ reason: 'full' })}</p>{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="cpx-note">No open contracts right now.</p>
	{/if}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="contract-outcome">
		{outcome?.text ?? ''}
	</p>
</section>
