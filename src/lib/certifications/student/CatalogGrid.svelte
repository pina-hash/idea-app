<script lang="ts">
	/**
	 * The catalog (ledger 0391): every published certification grouped by
	 * category, each group a `.cert-cols` multicolumn of `CatalogCard`s (panels
	 * of unequal height go in COLUMNS, never a grid: CLAUDE.md). An empty
	 * catalog says so in one notice. `serials` is this person's own awards by
	 * code, so Earned can show the serial's tail.
	 */
	import type { CertSummary } from '$lib/certifications/types';
	import type { CertActionPost } from './actions';
	import { groupCatalog } from './catalog';
	import CatalogCard from './CatalogCard.svelte';
	import CertNotice from './CertNotice.svelte';

	let {
		items,
		serials = {},
		post = null
	}: { items: CertSummary[]; serials?: Record<string, string>; post?: CertActionPost | null } = $props();

	const groups = $derived(groupCatalog(items));
</script>

{#if groups.length === 0}
	<CertNotice tone="quiet" title="No certification is published yet." testId="cert-catalog-empty">
		Check back once Mr. Pina publishes the first one. Everything you need to earn it will be here.
	</CertNotice>
{:else}
	{#each groups as group (group.category)}
		<section class="cert-catalog-group" data-testid="cert-catalog-group" data-category={group.category}>
			<h2 class="cert-section-h cert-catalog-h">{group.category} <span class="cert-readout">{group.items.length}</span></h2>
			<div class="cert-cols">
				{#each group.items as cert (cert.id)}
					<CatalogCard {cert} serial={serials[cert.code] ?? null} {post} />
				{/each}
			</div>
		</section>
	{/each}
{/if}

<style>
	.cert-catalog-group {
		margin: 0 0 1.5rem;
	}
	.cert-catalog-h {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.9rem;
	}
</style>
