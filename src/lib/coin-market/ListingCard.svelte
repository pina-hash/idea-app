<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { toneFrom } from '$lib/ui/status-tone';
	import { coins } from '$lib/coin-format';
	import Glyph from './Glyph.svelte';
	import Stars from './Stars.svelte';
	import { categoryLabel, type Listing } from './market';

	/** One student listing on the board. The whole card is one button that opens it. */
	let { listing, onopen }: { listing: Listing; onopen: (l: Listing) => void } = $props();
	const stateChip = $derived.by(() => {
		if (listing.hidden) return { label: 'Hidden by staff', tone: 'bad' };
		if (listing.closed) return { label: listing.closed_reason === 'filled' ? 'Filled' : 'Closed', tone: 'plain' };
		if (listing.expired) return { label: 'Expired', tone: 'bad' };
		if (listing.featured) return { label: 'Featured', tone: 'gold' };
		return null;
	});
</script>

<li>
	<button
		type="button"
		class="mk-tile"
		class:featured={listing.featured}
		onclick={() => onopen(listing)}
		data-testid="mk-listing"
		data-listing-id={listing.id}
		data-kind={listing.kind}
	>
		<span class="mk-tile-top">
			<span class="mk-kind" data-testid="mk-listing-kind">
				<Glyph name={listing.kind === 'request' ? 'request' : 'offer'} size={12} />
				{listing.kind === 'request' ? 'Request' : 'Offer'} · {categoryLabel(listing.category)}
			</span>
			{#if stateChip}<StatusChip tone={toneFrom(stateChip.tone as 'bad' | 'plain' | 'gold')} label={stateChip.label} />{/if}
		</span>
		{#if listing.photo_url}
			<img class="mk-photo" src={listing.photo_url} alt="" loading="lazy" />
		{/if}
		<span class="mk-tile-title">{listing.title}</span>
		{#if listing.description}<span class="mk-tile-line">{listing.description}</span>{/if}
		<span class="mk-tile-foot">
			<span class="mk-price" data-testid="mk-listing-price">{listing.price !== null ? coins(listing.price) : ''}</span>
			<span class="mk-who">
				{listing.mine ? 'You' : listing.owner.name}
				{#if listing.quantity}· {listing.remaining} of {listing.quantity} left{/if}
			</span>
		</span>
		{#if listing.owner.rating && !listing.mine}
			<Stars average={listing.owner.rating.average} count={listing.owner.rating.count} compact />
		{/if}
	</button>
</li>
