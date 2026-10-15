<script lang="ts">
	/**
	 * THE RECORDS TABLE (the spec's Records screen): every award the caller's
	 * certifications hold, newest first as the function orders them, each a
	 * row with its serial, holder, certification, date and status readout, and
	 * an Open key to the record. A certifier reads; an admin acts on the
	 * record page.
	 */
	import { deskRecordHref } from '$lib/certifications/nav';
	import { formatCertDate } from '$lib/certifications/status';
	import type { CertAwardJson } from '$lib/certifications/types';
	import { AWARD_READOUTS } from './desk';
	import Readout from './Readout.svelte';

	let { awards }: { awards: CertAwardJson[] } = $props();
	let filter = $state('');
	const shown = $derived(
		awards.filter((a) => {
			const q = filter.trim().toLowerCase();
			if (!q) return true;
			return [a.serial, a.holder_name, a.email, a.code, a.name, a.status].some((v) => (v ?? '').toLowerCase().includes(q));
		})
	);
</script>

<section class="cert-panel" id="records" aria-labelledby="cert-records-h" data-testid="cert-records">
	<div class="cert-titlebar">
		<h2 id="cert-records-h">Awards on record</h2>
		<label class="cert-field dk-filter">
			<span>Filter</span>
			<input type="search" bind:value={filter} placeholder="Serial, name, code or status" data-testid="cert-records-filter" />
		</label>
	</div>
	{#if awards.length === 0}
		<p class="dk-empty" data-testid="cert-records-none">Nothing has been awarded yet.</p>
	{:else if shown.length === 0}
		<p class="dk-empty" data-testid="cert-records-no-match">No award matches that filter.</p>
	{:else}
		<div class="dk-table-wrap">
			<table class="dk-table cert-well">
				<thead>
					<tr><th>Serial</th><th>Holder</th><th>Certification</th><th>Awarded</th><th>Status</th><th><span class="dk-sr">Open</span></th></tr>
				</thead>
				<tbody>
					{#each shown as a (a.id)}
						<tr data-testid="cert-record-row" data-status={a.status}>
							<td class="dk-mono"><span class="cert-serial">{a.serial}</span></td>
							<td>{a.holder_name}</td>
							<td><strong>{a.code}</strong> {a.name}</td>
							<td>{formatCertDate(a.awarded_at)}</td>
							<td><Readout readout={AWARD_READOUTS[a.status]} /></td>
							<td><a class="btn cert-btn secondary" href={deskRecordHref(a.id)} data-testid="cert-record-open">Open</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="dk-row-meta">{shown.length} of {awards.length} shown.</p>
	{/if}
</section>

<style>
	.dk-filter {
		margin: 0;
		min-width: min(100%, 20rem);
	}
</style>
