<script lang="ts">
	import { untrack } from 'svelte';
	import { coins } from '$lib/coin-format';
	import Glyph from './Glyph.svelte';
	import Stars from './Stars.svelte';
	import { categoryLabel, claimable, parseProfile, type Listing, type MarketProfile } from './market';
	import type { MarketTransports } from './transports';

	/**
	 * ONE LISTING, OPENED: what it is, who posted it with their stars and
	 * newest reviews, and the one action that fits. Claiming asks once more and
	 * says where the coins go (escrow) before anything moves. A transport left
	 * out removes its control.
	 */
	let {
		listing,
		balance,
		inEconomy,
		transports,
		onclose,
		ondone
	}: {
		listing: Listing;
		balance: number;
		inEconomy: boolean;
		transports: MarketTransports;
		onclose: () => void;
		ondone: (message: string) => void;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let profile = $state<MarketProfile | null>(null);
	let armed = $state(false);
	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);

	$effect(() => {
		const el = dialogEl;
		if (el && !el.open) {
			try {
				el.showModal();
			} catch {
				el.setAttribute('open', '');
			}
		}
	});

	$effect(() => {
		const id = listing.owner.id;
		const load = transports.profile;
		if (!id || !load || listing.zone !== 'student') return;
		untrack(() =>
			load(id).then((r) => {
				if (r.ok) profile = parseProfile(r.data);
			})
		);
	});

	const isRequest = $derived(listing.kind === 'request');
	const canClaim = $derived(claimable(listing) && inEconomy && !!transports.claim);
	const afford = $derived(isRequest || listing.price === null || balance - listing.price >= 0);
	const blocked = $derived.by(() => {
		if (!canClaim) return null;
		if (!isRequest && balance < 0) return 'You are in debt, so you cannot buy until your balance is back to zero.';
		if (!afford) return `This costs ${coins(listing.price ?? 0)} and your balance is ${coins(balance)}.`;
		return null;
	});

	async function claim() {
		if (!transports.claim || busy) return;
		busy = true;
		const r = await transports.claim(listing.id);
		busy = false;
		armed = false;
		if (r.ok) {
			ondone(isRequest ? `You took "${listing.title}". Their coins are held until you finish.` : `Claimed. ${coins(listing.price ?? 0)} is held in escrow.`);
			close();
		} else said = { ok: false, text: r.words };
	}

	async function setListing(action: 'withdraw' | 'renew') {
		if (!transports.listingSet || busy) return;
		busy = true;
		const r = await transports.listingSet(listing.id, action);
		busy = false;
		if (r.ok) {
			ondone(action === 'withdraw' ? 'Listing closed.' : 'Listing renewed.');
			close();
		} else said = { ok: false, text: r.words };
	}

	function close() {
		try {
			dialogEl?.close();
		} catch {
			/* a dialog that never opened has nothing to close */
		}
		onclose();
	}

	function dayWords(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
	}
</script>

<dialog
	class="mk-dialog"
	bind:this={dialogEl}
	aria-labelledby="mk-listing-title"
	onclose={() => onclose()}
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
	data-testid="mk-listing-dialog"
>
	<div class="mk-dialog-body">
		<div class="mk-dialog-head">
			<div>
				<span class="mk-kind"
					><Glyph name={isRequest ? 'request' : 'offer'} size={12} />{isRequest ? 'Request' : 'Offer'} · {categoryLabel(listing.category)}</span
				>
				<h2 id="mk-listing-title">{listing.title}</h2>
			</div>
			<button type="button" class="btn secondary mk-key" onclick={close} data-testid="mk-dialog-close">Close</button>
		</div>
		{#if listing.photo_url}<img class="mk-photo" src={listing.photo_url} alt="" />{/if}
		{#if listing.description}<p class="mk-body">{listing.description}</p>{/if}
		<dl class="mk-dl">
			<dt>{isRequest ? 'Pays' : 'Price'}</dt>
			<dd class="mk-price">{listing.price !== null ? coins(listing.price) : 'None'}</dd>
			<dt>{isRequest ? 'Asked by' : 'Sold by'}</dt>
			<dd>{listing.mine ? 'You' : listing.owner.name}{#if listing.owner.classes?.length}, {listing.owner.classes.map((c) => c.label).join(', ')}{/if}</dd>
			<dt>Left</dt>
			<dd>{listing.quantity ? `${listing.remaining} of ${listing.quantity}` : listing.remaining > 0 ? 'One time' : 'None'}</dd>
			<dt>Open until</dt>
			<dd>{dayWords(listing.expires_at)}</dd>
		</dl>

		{#if listing.hidden}
			<p class="mk-why" data-testid="mk-hidden-reason">Hidden by staff: {listing.hidden_reason ?? 'no reason given'}.</p>
		{/if}

		{#if listing.mine}
			{#if transports.listingSet && !listing.closed}
				<div class="mk-row">
					{#if !listing.hidden}
						<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => setListing('renew')} data-testid="mk-renew">Renew for another stretch</button>
					{/if}
					<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => setListing('withdraw')} data-testid="mk-withdraw">Close listing</button>
				</div>
			{/if}
		{:else if canClaim}
			{#if blocked}
				<p class="mk-why" data-testid="mk-claim-blocked">{blocked}</p>
			{:else if !armed}
				<button type="button" class="btn mk-key" onclick={() => (armed = true)} data-testid="mk-claim">
					{isRequest ? 'Take this job' : `Claim for ${coins(listing.price ?? 0)}`}
				</button>
			{:else}
				<div class="mk-confirm">
					<p class="mk-body">
						{#if isRequest}
							{listing.owner.name}'s {coins(listing.price ?? 0)} is held in escrow now. Do the job, mark it done, and it is paid to you when they confirm.
						{:else}
							{coins(listing.price ?? 0)} leaves your balance now and is held in escrow. It goes to {listing.owner.name} when you confirm you got it.
						{/if}
					</p>
					<div class="mk-row">
						<button type="button" class="btn mk-key" disabled={busy} onclick={claim} data-testid="mk-claim-confirm">{busy ? 'Working…' : 'Yes, claim it'}</button>
						<button type="button" class="btn secondary mk-key" onclick={() => (armed = false)}>Not now</button>
					</div>
				</div>
			{/if}
		{:else if !listing.mine && !inEconomy}
			<p class="mk-note">Only students in a class using IDEA Coins can claim listings.</p>
		{/if}
		{#if said}<p class={said.ok ? 'mk-ok' : 'mk-why'} role="status" data-testid="mk-dialog-said">{said.text}</p>{/if}

		{#if profile && !listing.mine}
			<section class="mk-panel" aria-labelledby="mk-prof-h" data-testid="mk-profile">
				<header>
					<h3 id="mk-prof-h">{profile.name}</h3>
					<Stars average={profile.rating.average} count={profile.rating.count} />
				</header>
				{#if profile.reviews.length}
					<ul class="idea-list mk-list">
						{#each profile.reviews as r (r.id)}
							<li class="mk-review">
								<Stars average={r.stars} count={1} single />
								<p>{r.body}</p>
								<span class="mk-note">{r.author}, {dayWords(r.at)}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mk-note">No reviews yet.</p>
				{/if}
			</section>
		{/if}
	</div>
</dialog>
