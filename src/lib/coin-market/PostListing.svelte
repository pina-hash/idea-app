<script lang="ts">
	import { coins } from '$lib/coin-format';
	import { MARKET_CATEGORIES, parsePrice, type MarketRules } from './market';
	import type { MarketTransports } from './transports';

	/**
	 * POST A LISTING: an offer (something you sell) or a request (something
	 * you need done). Everything the database checks is said here first, so a
	 * refusal is the backstop, never the first word. Present only when the
	 * route hands in `post` (absence is the mechanism).
	 */
	let {
		rules,
		balance,
		openCount,
		post,
		uploadPhoto = null,
		ondone
	}: {
		rules: MarketRules;
		balance: number;
		openCount: number;
		post: NonNullable<MarketTransports['post']>;
		uploadPhoto?: MarketTransports['uploadPhoto'] | null;
		ondone: (message: string) => void;
	} = $props();

	let kind = $state<'offer' | 'request'>('offer');
	let title = $state('');
	let description = $state('');
	let priceText = $state('');
	let category = $state('service');
	let once = $state(true);
	let quantityText = $state('2');
	let file = $state<File | null>(null);
	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);

	const price = $derived(parsePrice(priceText));
	const quantity = $derived(once ? null : /^\d+$/.test(quantityText.trim()) ? Number(quantityText) : NaN);
	const problem = $derived.by(() => {
		if (openCount >= rules.max_open) return `You already have ${rules.max_open} open listings. Close one first.`;
		const t = title.trim();
		if (t.length < 3 || t.length > 80) return 'Give it a title of 3 to 80 characters.';
		if (description.length > 1000) return 'Keep the description under 1000 characters.';
		if (!priceText.trim()) return 'Set a price.';
		if (price === null) return `A price is ${coins(0.1)} to ${coins(1000)}, with at most two decimals.`;
		if (quantity !== null && !(Number.isInteger(quantity) && quantity >= 1 && quantity <= 50)) return 'A quantity is 1 to 50.';
		if (kind === 'request' && balance < 0) return 'You are in debt, so you cannot post a paid request.';
		if (kind === 'request' && balance - price < 0) return `A request has to be covered by your balance (${coins(balance)}).`;
		return null;
	});

	async function send(e: SubmitEvent) {
		e.preventDefault();
		if (problem || busy || price === null) return;
		busy = true;
		said = null;
		let photoPath: string | null = null;
		if (file && uploadPhoto) {
			const up = await uploadPhoto(file);
			if (!up.ok) {
				busy = false;
				said = { ok: false, text: up.words };
				return;
			}
			photoPath = up.path;
		}
		const r = await post({ kind, title: title.trim(), description: description.trim(), price, category, quantity, photoPath });
		busy = false;
		if (r.ok) {
			title = '';
			description = '';
			priceText = '';
			file = null;
			said = { ok: true, text: 'Posted.' };
			ondone(kind === 'offer' ? 'Your offer is on the board.' : 'Your request is on the board.');
		} else said = { ok: false, text: r.words };
	}
</script>

<form class="mk-form" onsubmit={send} data-testid="mk-post-form" novalidate>
	<div class="mk-field wide">
		<span id="mk-post-kind">What are you posting?</span>
		<div class="mk-seg" role="radiogroup" aria-labelledby="mk-post-kind">
			<button type="button" class="btn secondary mk-key" role="radio" aria-checked={kind === 'offer'} onclick={() => (kind = 'offer')} data-testid="mk-post-offer">Offer: I sell</button>
			<button type="button" class="btn secondary mk-key" role="radio" aria-checked={kind === 'request'} onclick={() => (kind = 'request')} data-testid="mk-post-request">Request: I need</button>
		</div>
	</div>
	<label class="mk-field wide">
		Title
		<input type="text" maxlength="80" bind:value={title} placeholder={kind === 'offer' ? 'Laser-cut name tags' : 'Help sanding my bridge'} data-testid="mk-post-title" />
	</label>
	<label class="mk-field wide">
		Description
		<textarea maxlength="1000" bind:value={description} placeholder="What it is, how long it takes, anything a buyer should know." data-testid="mk-post-description"></textarea>
	</label>
	<label class="mk-field">
		{kind === 'offer' ? 'Price (coins)' : 'You pay (coins)'}
		<input type="text" inputmode="decimal" bind:value={priceText} placeholder="2.5" data-testid="mk-post-price" />
	</label>
	<label class="mk-field">
		Category
		<select bind:value={category} data-testid="mk-post-category">
			{#each MARKET_CATEGORIES as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
		</select>
	</label>
	<div class="mk-field">
		<span>How many</span>
		<div class="mk-row">
			<label class="mk-check">
				<input type="checkbox" bind:checked={once} data-testid="mk-post-once" /> One time
			</label>
			{#if !once}
				<input type="text" inputmode="numeric" bind:value={quantityText} aria-label="How many claims" class="mk-qty" data-testid="mk-post-quantity" />
			{/if}
		</div>
	</div>
	{#if uploadPhoto}
		<label class="mk-field">
			Photo (optional)
			<input type="file" accept="image/*" onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} data-testid="mk-post-photo" />
		</label>
	{/if}
	<div class="wide mk-row">
		<button type="submit" class="btn mk-key" aria-disabled={problem !== null || busy} data-testid="mk-post-send">{busy ? 'Posting…' : 'Post it'}</button>
		<span class="mk-note">Open for {rules.listing_days} days. Renew it any time. {openCount} of {rules.max_open} open.</span>
	</div>
	{#if problem && (title || priceText)}<p class="mk-why wide" data-testid="mk-post-problem">{problem}</p>{/if}
	{#if said}<p class="wide {said.ok ? 'mk-ok' : 'mk-why'}" role="status" data-testid="mk-post-said">{said.text}</p>{/if}
</form>
