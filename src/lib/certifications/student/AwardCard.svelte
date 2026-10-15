<script lang="ts">
	/**
	 * One earned certification on My certifications (ledger 0391): the name,
	 * code and level, the serial in its mono spelling, the award date, the
	 * status as a readout with a tone and its word, the expiry when set, and
	 * two links: Print certificate (the certificate page, surface f) and Verify
	 * (the public page, with the serial filled in).
	 */
	import { certificateHref, verifyHref } from '$lib/certifications/nav';
	import { formatCertDate, STATUS_WORDS } from '$lib/certifications/status';
	import type { CertAwardMine } from '$lib/certifications/types';

	let { award }: { award: CertAwardMine } = $props();

	const tone = $derived(award.status === 'valid' ? 'is-ok' : award.status === 'suspended' ? 'is-warn' : 'is-bad');
	const glyph = $derived(award.status === 'valid' ? '✓' : award.status === 'suspended' ? '!' : '✕');
</script>

<article class="cert-panel cert-award" data-testid="cert-award-card" data-status={award.status} data-code={award.code}>
	<div class="cert-readouts">
		<span class="cert-readout">{award.code}</span>
		<span class="cert-readout">Level {award.level}</span>
		<span class="cert-readout {tone}" data-testid="cert-award-status"><span aria-hidden="true">{glyph}</span> {STATUS_WORDS[award.status]}</span>
	</div>
	<h3 class="cert-award-name">{award.name}</h3>
	<dl class="cert-facts cert-award-facts">
		<dt>Serial</dt>
		<dd><span class="cert-serial">{award.serial}</span></dd>
		<dt>Awarded</dt>
		<dd>{formatCertDate(award.awarded_at)} by {award.awarded_by_name}</dd>
		{#if award.expires_at}
			<dt>{award.status === 'expired' ? 'Expired' : 'Expires'}</dt>
			<dd>{formatCertDate(award.expires_at)}</dd>
		{/if}
	</dl>
	<div class="cert-actions">
		<a class="btn cert-btn" href={certificateHref(award.serial)} data-testid="cert-award-print">Print certificate</a>
		<a class="btn secondary cert-btn" href={verifyHref(award.serial)} data-testid="cert-award-verify">Verify</a>
	</div>
</article>

<style>
	.cert-award {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.cert-award-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
	}
	.cert-award-name::before {
		content: none;
	}
	.cert-award-facts {
		margin: 0;
	}
	.cert-award .cert-actions {
		margin-top: auto;
	}
</style>
