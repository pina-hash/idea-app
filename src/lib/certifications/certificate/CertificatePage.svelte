<script lang="ts">
	/**
	 * THE CERTIFICATE PAGE (ledger 0391, surface f): one wrapping row of keys
	 * (Print, Back, Verify), the sheet, and a sentence saying what the paper
	 * is. The route at `/certifications/certificate/[serial]` mounts this
	 * inside the portal's shell and `/dev/cert-certificate` mounts the
	 * identical component over a fixture, so the harness measures the page a
	 * holder gets.
	 *
	 * The keys and the note leave the paper in print (`certificate.css`,
	 * scoped to `body:has(.certificate-page)`); only the sheet prints. Print
	 * is `window.print()`; Back goes where the person came from when there is
	 * a page to go back to and to My certifications otherwise; Verify is the
	 * public page with this serial filled in.
	 */
	import Certificate from './Certificate.svelte';
	import { CERT_PATHS, verifyHref } from '$lib/certifications/nav';
	import type { CertificateJson } from '$lib/certifications/types';

	let {
		record,
		qrSrc,
		verifyUrl,
		markSrc,
		markSrcset = null,
		backHref = CERT_PATHS.me
	}: {
		record: CertificateJson;
		qrSrc: string;
		verifyUrl: string;
		markSrc: string;
		markSrcset?: string | null;
		/** Where Back lands when the browser has no page to go back to. */
		backHref?: string;
	} = $props();

	function print() {
		if (typeof window !== 'undefined') window.print();
	}
	function back(event: MouseEvent) {
		if (typeof window === 'undefined') return;
		if (window.history.length > 1) {
			event.preventDefault();
			window.history.back();
		}
	}
</script>

<div class="certificate-page" data-testid="cert-certificate-page" data-serial={record.serial}>
	<div class="certificate-bar cert-actions" data-testid="cert-certificate-bar">
		<button class="btn cert-btn" type="button" onclick={print} data-testid="cert-print">Print</button>
		<a class="btn secondary cert-btn" href={backHref} onclick={back} data-testid="cert-back">Back</a>
		<a class="btn secondary cert-btn" href={verifyHref(record.serial)} data-testid="cert-verify-link">Verify</a>
	</div>
	<Certificate {record} {qrSrc} {verifyUrl} {markSrc} {markSrcset} />
	<p class="certificate-note" data-testid="cert-certificate-note">
		This paper is a pointer to the live record. Anyone who scans the code or types the serial on the verify page reads the signed
		record itself, and that record is what proves the award. Print it as often as you like; it is landscape, US Letter.
	</p>
</div>
