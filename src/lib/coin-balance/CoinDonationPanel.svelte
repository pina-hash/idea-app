<script lang="ts">
	import './coin-page.css';
	import { coinNumber, coins } from '$lib/coin-format';
	import type { CoinDonationRules } from '$lib/coin-balance';
	import { donationRefusalWords, type CoinActionResult, type CoinDonationItem } from './extras';
	import { coinUploadRefusal, type CoinUploadResult } from './uploads';

	/**
	 * THE WANT AD (2.7, 0245). The want list is Mr. Pina's; a student picks an
	 * item (or Other, described), says how many, and adds a photo of what they
	 * brought. It pays when a teacher approves it, at the item's rate per item,
	 * and never past the rolling limit: a claim over it pays up to the limit.
	 *
	 * Sending needs `upload` and `submit`; without them the panel lists the
	 * want list and its rules only.
	 */
	let {
		items,
		rules = null,
		upload = null,
		submit = null,
		ondone = null
	}: {
		items: CoinDonationItem[];
		rules?: CoinDonationRules | null;
		upload?: ((file: Blob & { name?: string }) => Promise<CoinUploadResult>) | null;
		submit?:
			| ((itemId: string | null, quantity: number, other: string | null, path: string) => Promise<CoinActionResult>)
			| null;
		ondone?: (() => void) | null;
	} = $props();

	const OTHER = '__other__';
	let pick = $state('');
	let otherText = $state('');
	let qtyText = $state('1');
	let file = $state<File | null>(null);
	let fileProblem = $state<string | null>(null);
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);

	const canSend = $derived(!!upload && !!submit);
	const item = $derived(items.find((i) => i.id === pick) ?? null);
	const qty = $derived.by(() => {
		const t = qtyText.trim();
		if (!/^\d+$/.test(t)) return null;
		const n = Number(t);
		return n >= 1 && n <= 100 ? n : null;
	});
	const estimate = $derived(item && item.rate !== null && qty !== null ? Math.round(item.rate * qty * 100) / 100 : null);
	const capWords = $derived(
		rules && rules.cap_coins !== null && rules.cap_days !== null
			? `At most ${coins(rules.cap_coins)} from donations every ${rules.cap_days} days. A claim over the limit pays up to the limit.`
			: 'There is a limit on what donations pay in a few weeks. A claim over it pays up to the limit.'
	);
	const blocked = $derived.by(() => {
		if (!pick) return 'Pick what you are donating.';
		if (pick === OTHER && !otherText.trim()) return donationRefusalWords({ reason: 'describe_other' });
		if (pick === OTHER && otherText.trim().length > 200) return donationRefusalWords({ reason: 'describe_other' });
		if (qty === null) return donationRefusalWords({ reason: 'quantity' });
		if (fileProblem) return fileProblem;
		if (!file) return 'Add a photo of what you brought.';
		return null;
	});

	function picked(e: Event & { currentTarget: HTMLInputElement }) {
		outcome = null;
		const f = e.currentTarget.files?.[0] ?? null;
		file = f;
		fileProblem = f ? coinUploadRefusal(f) : null;
	}

	async function send() {
		if (!upload || !submit || blocked || busy || !file || qty === null) return;
		busy = true;
		try {
			const up = await upload(file);
			if (!up.ok) {
				outcome = { ok: false, text: up.words };
				return;
			}
			const r = await submit(pick === OTHER ? null : pick, qty, pick === OTHER ? otherText.trim() : null, up.path);
			if (r.ok) {
				outcome = { ok: true, text: 'Sent. It pays when your teacher approves it. You can see where it stands under Your submissions.' };
				pick = '';
				otherText = '';
				qtyText = '1';
				file = null;
				if (inputEl) inputEl.value = '';
				ondone?.();
			} else {
				outcome = { ok: false, text: donationRefusalWords(r) };
			}
		} catch {
			outcome = { ok: false, text: donationRefusalWords({ reason: 'error' }) };
		} finally {
			busy = false;
		}
	}
</script>

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-donate" data-testid="coin-donations">
	<h2 id="cpx-h-donate">Donations</h2>
	<p class="cpx-lead">Bring in something from the want list and earn coins for it.</p>
	<ul class="cpx-limits">
		<li>Each item pays its rate per item. Other is set by your teacher.</li>
		<li data-testid="donation-cap">{capWords}</li>
		{#if rules && rules.room !== null}
			<li data-testid="donation-room">You can still earn <strong>{coins(rules.room)}</strong> from donations right now.</li>
		{/if}
		<li>Add a photo. It pays when your teacher approves it.</li>
	</ul>

	{#if items.length}
		<h3>Wanted</h3>
		<ul class="cpx-list" data-testid="want-list">
			{#each items as i (i.id)}
				<li data-testid="want-item">
					<div class="cpx-row">
						{#if i.photo_url}<img class="cpx-thumb" src={i.photo_url} alt="" loading="lazy" />{/if}
						<span class="cpx-name">{i.name}</span>
						<span class="cpx-meta">{i.rate !== null ? `${coins(i.rate)} each` : 'set by your teacher'}</span>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="cpx-note">Nothing is on the want list right now. You can still offer something as Other.</p>
	{/if}

	{#if canSend}
		<h3>Donate</h3>
		<label class="cpx-field">
			<span>What you are donating</span>
			<select bind:value={pick} data-testid="donation-item">
				<option value="">Pick one</option>
				{#each items as i (i.id)}
					<option value={i.id}>{i.name}</option>
				{/each}
				<option value={OTHER}>Other (describe it)</option>
			</select>
		</label>
		{#if pick === OTHER}
			<label class="cpx-field">
				<span>Describe it</span>
				<input type="text" maxlength="200" autocomplete="off" bind:value={otherText} data-testid="donation-other" />
			</label>
		{/if}
		<label class="cpx-field">
			<span>How many</span>
			<input type="text" inputmode="numeric" autocomplete="off" bind:value={qtyText} data-testid="donation-qty" />
		</label>
		<label class="cpx-field">
			<span>Photo of what you brought</span>
			<input type="file" accept="image/*" onchange={picked} bind:this={inputEl} data-testid="donation-file" />
		</label>
		{#if estimate !== null}
			<p class="cpx-note" data-testid="donation-estimate">
				{coinNumber(qty ?? 0)} at {coins(item?.rate ?? 0)} each is {coins(estimate)}, up to the limit.
			</p>
		{/if}
		<button
			type="button"
			class="btn cpx-key"
			aria-disabled={blocked || busy ? 'true' : undefined}
			data-testid="donation-send"
			onclick={send}>{busy ? 'Sending...' : 'Send the donation'}</button
		>
		{#if blocked}<p class="cpx-why" data-testid="donation-blocked">{blocked}</p>{/if}
	{/if}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="donation-outcome">
		{outcome?.text ?? ''}
	</p>
</section>
