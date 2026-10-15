<script lang="ts">
	/**
	 * THE PRINTED CERTIFICATE (ledger 0391, surface f; docs/CERTIFICATIONS.md,
	 * "The printed certificate"). Landscape US Letter, every field real and
	 * taken from the record `cert_certificate` returned: the full IDEA mark
	 * with the gear, the holder's name large, the certification's name, code,
	 * level and category, the true award date and the expiry when the award
	 * has one, the certifier's name over a signature line, the serial, and a
	 * QR code that opens the verify page for that serial. No filler text and
	 * no decorative number: the paper is a pointer to the live, signed record,
	 * and a dead award (suspended, revoked, expired) prints its state across
	 * the sheet so a reprint cannot pass for a live one.
	 *
	 * ONE SHEET, TWO SHOWINGS. `certificate.css` draws the sheet at 11in by
	 * 8.5in; on screen the frame keeps that proportion at any width and this
	 * component measures the frame and scales the sheet into it, so a phone
	 * shows the whole page. In print the transform comes off and the sheet is
	 * the page (`@page { size: letter landscape; margin: 0 }`, injected at
	 * mount and removed on unmount, because an `@page` rule cannot be scoped
	 * to one page and a route's stylesheet outlives the route).
	 *
	 * THE SHEET DOES NOT FOLLOW THE SITE THEME. Paper is white; its inks are
	 * literals on the sheet (see the stylesheet's header for the measured
	 * ratios). The QR is handed in as a data URL `src` by the server load,
	 * never rendered as markup.
	 */
	import { onMount } from 'svelte';
	import { formatCertDate, STATUS_WORDS } from '$lib/certifications/status';
	import type { CertificateJson } from '$lib/certifications/types';
	import { nameSizeIn, sheetScale } from './layout';
	import './certificate.css';

	let {
		record,
		qrSrc,
		verifyUrl,
		markSrc,
		markSrcset = null
	}: {
		record: CertificateJson;
		/** The verify page's QR code, as a `data:image/svg+xml` URL (`qrSvgDataUrl`). */
		qrSrc: string;
		/** The absolute verify URL the QR encodes, printed under it. */
		verifyUrl: string;
		/** The full IDEA mark with the gear (`CERT_MARK_SRC`). */
		markSrc: string;
		/** Optional wider copies for print (`CERT_MARK_SRCSET`). */
		markSrcset?: string | null;
	} = $props();

	const status = $derived(record.status);
	const live = $derived(status === 'valid');
	const statusWord = $derived(STATUS_WORDS[status] ?? status);
	const awardedWords = $derived(formatCertDate(record.awarded_at));
	const expiryWords = $derived(record.expires_at ? formatCertDate(record.expires_at) : '');
	const nameSize = $derived(nameSizeIn(record.holder_name));

	let frame = $state<HTMLDivElement | null>(null);
	let scale = $state(1);

	onMount(() => {
		const measure = () => {
			if (frame) scale = sheetScale(frame.clientWidth);
		};
		measure();
		const ro = typeof ResizeObserver === 'function' && frame ? new ResizeObserver(measure) : null;
		if (ro && frame) ro.observe(frame);
		window.addEventListener('resize', measure);

		/* The page rule for this sheet alone: letter, landscape, no margin. */
		const tag = document.createElement('style');
		tag.setAttribute('data-certificate-page-rule', '');
		tag.textContent = '@media print { @page { size: letter landscape; margin: 0; } }';
		document.head.appendChild(tag);

		return () => {
			ro?.disconnect();
			window.removeEventListener('resize', measure);
			tag.remove();
		};
	});
</script>

<div class="certificate-frame" bind:this={frame} data-testid="cert-frame" data-scale={scale}>
	<article
		class="certificate"
		lang="en"
		data-testid="cert-sheet"
		data-status={status}
		data-serial={record.serial}
		style="--cert-scale: {scale}"
		aria-label="IDEA Certification, {record.name}, awarded to {record.holder_name}"
	>
		<div class="certificate-inner">
			{#if !live}
				<div class="certificate-watermark" data-testid="cert-watermark" aria-hidden="true">{statusWord}</div>
			{/if}
			<div class="certificate-body">
				<header class="certificate-head">
					<span class="certificate-seal">
						<img
							class="certificate-mark"
							src={markSrc}
							srcset={markSrcset ?? undefined}
							sizes={markSrcset ? '2.5in' : undefined}
							width="1200"
							height="564"
							alt="IDEA"
							data-testid="cert-mark"
						/>
					</span>
					<p class="certificate-eyebrow">Bosco Tech</p>
					<h2 class="certificate-title"><span class="certificate-title-idea">IDEA</span> Certification</h2>
				</header>

				<p class="certificate-certifies">This certifies that</p>
				<p class="certificate-name" data-testid="cert-holder-name" style="font-size: {nameSize}in">{record.holder_name}</p>
				<div class="certificate-name-rule" aria-hidden="true"></div>
				<p class="certificate-claim">has demonstrated, alone and with zero outside help, the skills of</p>
				<p class="certificate-cert-name" data-testid="cert-cert-name">{record.name}</p>
				<p class="certificate-readout" data-testid="cert-readout">
					<span>{record.code}</span>
					<span class="certificate-dot" aria-hidden="true">/</span>
					<span>Level {record.level}</span>
					<span class="certificate-dot" aria-hidden="true">/</span>
					<span>{record.category}</span>
				</p>
				<p class="certificate-dates" data-testid="cert-dates">
					<span>Awarded {awardedWords}</span>
					{#if expiryWords}
						<span class="certificate-dot" aria-hidden="true">/</span>
						<span>Valid through {expiryWords}</span>
					{/if}
				</p>
				{#if !live}
					<p class="certificate-status" data-testid="cert-status-line">
						This certificate is {statusWord.toUpperCase()}. The live record at ideabosco.com decides.
					</p>
				{/if}

				<footer class="certificate-foot">
					<div class="certificate-certifier" data-testid="cert-certifier">
						<div class="certificate-signature-line" aria-hidden="true"></div>
						<p class="certificate-certifier-name">{record.awarded_by_name}</p>
						<p class="certificate-label">Certifier</p>
					</div>
					<div class="certificate-serial-block">
						<p class="certificate-label">Serial</p>
						<p class="cert-serial certificate-serial" data-testid="cert-serial">{record.serial}</p>
					</div>
					<div class="certificate-qr">
						<img class="certificate-qr-img" src={qrSrc} alt="QR code: verify this certificate" width="106" height="106" data-testid="cert-qr" />
						<p class="certificate-label">Scan to verify</p>
						<p class="certificate-verify-url" data-testid="cert-verify-url">{verifyUrl}</p>
					</div>
				</footer>
			</div>
		</div>
	</article>
</div>
