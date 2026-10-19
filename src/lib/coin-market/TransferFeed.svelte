<script lang="ts">
	import { coins } from '$lib/coin-format';
	import Glyph from './Glyph.svelte';
	import type { TransferRow } from './market';

	/** The public transfer feed: from, to, amount, message. A private transfer is never in it. */
	let { rows, limit = 12 }: { rows: TransferRow[]; limit?: number } = $props();

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
	}
</script>

{#if rows.length}
	<ul class="mk-feed" data-testid="mk-feed">
		{#each rows.slice(0, limit) as t (t.id)}
			<li data-testid="mk-feed-row">
				<span class="mk-feed-who"><Glyph name="transfer" size={13} /> {t.from.name} to {t.to.name}</span>
				<span class="mk-feed-amt">{coins(t.amount)}</span>
				{#if t.message}<span class="mk-feed-msg">“{t.message}”</span>{:else if t.message_removed}<span class="mk-feed-msg">Message removed by staff.</span>{/if}
				<span class="mk-feed-when">{when(t.at)}</span>
			</li>
		{/each}
	</ul>
{:else}
	<p class="mk-empty">No public transfers yet.</p>
{/if}
