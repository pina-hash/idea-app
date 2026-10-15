<script lang="ts">
	/**
	 * The holders board (ledger 0391, DECISIONS D12): who holds what, by
	 * certification and by person, switched by two lit keys (`aria-pressed`),
	 * with a search box that filters client-side. Names only: `cert_holders`
	 * projects no address, and two holders with one name are two rows.
	 */
	import { HOLDERS_SENTENCE } from '$lib/certifications/copy';
	import { formatCertDate, STATUS_WORDS } from '$lib/certifications/status';
	import type { AwardShownStatus, HoldersJson } from '$lib/certifications/types';
	import CertNotice from './CertNotice.svelte';

	let { holders, initialView = 'certification' }: { holders: HoldersJson; initialView?: 'certification' | 'person' } = $props();

	/* The person's own choice once they make one; until then the caller's. Derived, not seeded, so a prop change is not lost. */
	let chosen = $state<'certification' | 'person' | null>(null);
	const view = $derived(chosen ?? initialView);
	let query = $state('');
	const q = $derived(query.trim().toLowerCase());
	const matches = (...words: (string | null | undefined)[]) => !q || words.some((w) => (w ?? '').toLowerCase().includes(q));

	const byCert = $derived(
		holders.by_certification
			.map((c) => ({ ...c, holders: c.holders.filter((h) => matches(h.name, c.code, c.name)) }))
			.filter((c) => c.holders.length > 0 || matches(c.code, c.name))
	);
	const byPerson = $derived(
		holders.by_person
			.map((p) => ({ ...p, certifications: p.certifications.filter((c) => matches(p.name, c.code)) }))
			.filter((p) => p.certifications.length > 0)
	);
	const total = $derived(holders.by_person.length);

	const tone = (s: AwardShownStatus) => (s === 'valid' ? 'is-ok' : s === 'suspended' ? 'is-warn' : 'is-bad');
	const glyph = (s: AwardShownStatus) => (s === 'valid' ? '✓' : s === 'suspended' ? '!' : '✕');
</script>

<div class="cert-holders" data-testid="cert-holders" data-view={view}>
	<p class="cert-lead">{HOLDERS_SENTENCE}</p>
	<div class="cert-holders-bar">
		<div class="cert-actions" role="group" aria-label="Arrange by">
			<button type="button" class="btn secondary cert-btn" class:on={view === 'certification'} aria-pressed={view === 'certification'} onclick={() => (chosen = 'certification')} data-testid="cert-holders-by-cert">By certification</button>
			<button type="button" class="btn secondary cert-btn" class:on={view === 'person'} aria-pressed={view === 'person'} onclick={() => (chosen = 'person')} data-testid="cert-holders-by-person">By person</button>
		</div>
		<label class="cert-field cert-holders-search">
			<span>Search a name or a code</span>
			<input type="search" class="plate-well" bind:value={query} placeholder="Reyes, MILL-1" data-testid="cert-holders-search" />
		</label>
		<span class="cert-readout" data-testid="cert-holders-total">{total} {total === 1 ? 'holder' : 'holders'}</span>
	</div>

	{#if total === 0}
		<CertNotice tone="quiet" title="Nobody holds a certification yet." testId="cert-holders-empty">The first award lands here, with its date.</CertNotice>
	{:else if view === 'certification'}
		{#if byCert.length === 0}
			<p class="cert-help" data-testid="cert-holders-none">Nothing matches that search.</p>
		{/if}
		<div class="cert-cols">
			{#each byCert as c (c.code)}
				<section class="cert-panel cert-holders-cert" data-testid="cert-holders-cert" data-code={c.code}>
					<div class="cert-readouts">
						<span class="cert-readout">{c.code}</span>
						<span class="cert-readout">Level {c.level}</span>
						<span class="cert-readout">{c.category}</span>
					</div>
					<h3 class="cert-holders-h">{c.name} <span class="cert-readout">{c.holders.length}</span></h3>
					<ul class="cert-well cert-holders-list">
						{#each c.holders as h, i (i)}
							<li class="cert-holders-row" data-testid="cert-holder-row">
								<span class="cert-holders-name person-name" title={h.name}>{h.name}</span>
								<span class="cert-help">{formatCertDate(h.awarded_at)}</span>
								<span class="cert-readout {tone(h.status)}"><span aria-hidden="true">{glyph(h.status)}</span> {STATUS_WORDS[h.status]}</span>
							</li>
						{:else}
							<li class="cert-holders-row"><span class="cert-help">No holders yet.</span></li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{:else}
		{#if byPerson.length === 0}
			<p class="cert-help" data-testid="cert-holders-none">Nothing matches that search.</p>
		{/if}
		<ul class="cert-well cert-holders-people" data-testid="cert-holders-people">
			{#each byPerson as p (p.email_hash)}
				<li class="cert-holders-person" data-testid="cert-holder-person">
					<span class="cert-holders-name person-name" title={p.name}>{p.name}</span>
					<div class="cert-readouts">
						{#each p.certifications as c (c.code)}
							<span class="cert-readout {tone(c.status)}" title={`${c.code}, level ${c.level}, ${formatCertDate(c.awarded_at)}, ${STATUS_WORDS[c.status]}`}>
								<span aria-hidden="true">{glyph(c.status)}</span> {c.code}{#if c.status !== 'valid'} ({STATUS_WORDS[c.status]}){/if}
							</span>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.cert-holders-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1.25rem;
		margin: 0 0 1.25rem;
	}
	.cert-holders-search {
		flex: 1 1 16rem;
		max-width: 28rem;
		margin: 0;
	}
	.cert-holders-search input {
		width: 100%;
	}
	.cert-holders-h {
		margin: 0.5rem 0 0.6rem;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.cert-holders-h::before {
		content: none;
	}
	.cert-holders-list,
	.cert-holders-people {
		margin: 0;
	}
	.cert-holders-row,
	.cert-holders-person {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.75rem;
		min-height: 44px;
		padding: 0.45rem 0;
	}
	.cert-holders-name {
		flex: 1 1 10rem;
		font-weight: 700;
	}
	.cert-holders-person .cert-readouts {
		flex: 2 1 16rem;
	}
	.btn[aria-pressed='true'] {
		color: var(--green);
		border-color: var(--green);
	}
</style>
