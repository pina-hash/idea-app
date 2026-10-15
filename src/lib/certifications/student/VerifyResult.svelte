<script lang="ts">
	/**
	 * The verify page's answer (ledger 0391): ONE large status panel with the
	 * state's word and sentence, a glyph and a tone; then, for a found record,
	 * the facts (holder, certification, awarded, certifier, expires); and under
	 * a closed Disclosure, "Check it yourself": the signed payload as JSON, the
	 * signature, the key id and the public key's address, so anybody can
	 * reproduce the check. It never says which check failed and never shows an
	 * email: the payload carries a hash of one, which is the point of the hash.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import { VERIFY_RATE_LIMITED, VERIFY_WORDS } from '$lib/certifications/copy';
	import { CERT_PATHS } from '$lib/certifications/nav';
	import { formatCertDate } from '$lib/certifications/status';
	import { CERT_UNAVAILABLE_SENTENCE } from './shell';
	import { payloadPretty, VERIFY_GLYPH, VERIFY_TONE, type VerifyView } from './verify';

	let { view }: { view: VerifyView } = $props();

	const words = $derived.by(() => {
		if (view.state === 'limited') return { title: 'Too many checks', body: VERIFY_RATE_LIMITED };
		if (view.state === 'idle') return { title: 'Check a certificate', body: 'Type the serial printed on it, or scan its QR code.' };
		if (view.state === 'unavailable') return { title: 'Not available yet', body: CERT_UNAVAILABLE_SENTENCE };
		return VERIFY_WORDS[view.state];
	});
	const tone = $derived(VERIFY_TONE[view.state]);
	const record = $derived(view.record);
</script>

<section class="cert-panel cert-verify-result cert-verify-{tone}" data-testid="cert-verify-result" data-state={view.state} aria-live="polite">
	<div class="cert-verify-status">
		<span class="cert-verify-glyph" aria-hidden="true">{VERIFY_GLYPH[view.state]}</span>
		<div class="cert-verify-words">
			<p class="cert-verify-title" data-testid="cert-verify-title">{words.title}</p>
			<p class="cert-verify-body" data-testid="cert-verify-body">{words.body}</p>
			{#if view.serial && view.state !== 'idle'}
				<p class="cert-serial cert-verify-serial" data-testid="cert-verify-serial">{view.serial}</p>
			{/if}
		</div>
	</div>

	{#if record}
		<dl class="cert-facts cert-verify-facts" data-testid="cert-verify-facts">
			<dt>Holder</dt>
			<dd class="cert-verify-holder">{record.holder_name}</dd>
			<dt>Certification</dt>
			<dd>{record.name} <span class="cert-help">({record.code}, level {record.level}, {record.category})</span></dd>
			<dt>Awarded</dt>
			<dd>{formatCertDate(record.awarded_at)}</dd>
			<dt>Certifier</dt>
			<dd>{record.awarded_by_name}</dd>
			<dt>Expires</dt>
			<dd>{record.expires_at ? formatCertDate(record.expires_at) : 'Never'}</dd>
		</dl>

		<Disclosure label="Check it yourself" collapseWhen={true} testId="cert-verify-self-check">
			<p class="cert-help">
				The record below is signed with Ed25519. Verify the signature over these exact bytes (the JSON with its keys in this order and no whitespace) against the public key at
				<a href={CERT_PATHS.publicKey}>{CERT_PATHS.publicKey}</a>. A made-up serial, or a real one with any field altered, fails.
			</p>
			<h4 class="cert-section-h">Signed payload</h4>
			<pre class="cert-verify-pre plate-well" data-testid="cert-verify-payload">{payloadPretty(record.signed_payload)}</pre>
			<h4 class="cert-section-h">Signature (base64)</h4>
			<pre class="cert-verify-pre plate-well" data-testid="cert-verify-signature">{record.signature}</pre>
			<dl class="cert-facts">
				<dt>Key id</dt>
				<dd><span class="cert-serial">{record.key_id}</span></dd>
				<dt>Public key</dt>
				<dd><a class="cert-verify-key-link" href={CERT_PATHS.publicKey} data-testid="cert-verify-public-key">{CERT_PATHS.publicKey}</a> <span class="cert-help">(PEM; add ?format=json for JSON)</span></dd>
			</dl>
		</Disclosure>
	{/if}
</section>

<style>
	.cert-verify-result {
		border-left-width: 5px;
		border-left-color: var(--text-2);
	}
	.cert-verify-ok {
		border-left-color: var(--green);
	}
	.cert-verify-warn {
		border-left-color: var(--amber);
	}
	.cert-verify-bad {
		border-left-color: var(--crimson);
	}
	.cert-verify-status {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.cert-verify-glyph {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3.2rem;
		height: 3.2rem;
		border-radius: 999px;
		border: 2px solid currentColor;
		font-family: var(--font-mono);
		font-size: 1.6rem;
		color: var(--text-2);
	}
	.cert-verify-ok .cert-verify-glyph {
		color: var(--green);
	}
	.cert-verify-warn .cert-verify-glyph {
		color: var(--amber);
	}
	.cert-verify-bad .cert-verify-glyph {
		color: var(--crimson);
	}
	.cert-verify-words {
		min-width: 0;
	}
	.cert-verify-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2.1rem);
		font-weight: 700;
		line-height: 1.1;
	}
	.cert-verify-body {
		margin: 0.35rem 0 0;
		line-height: 1.5;
	}
	.cert-verify-serial {
		margin: 0.5rem 0 0;
		color: var(--text-2);
	}
	.cert-verify-facts {
		margin: 1.1rem 0 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--hairline);
	}
	.cert-verify-holder {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 700;
	}
	/* The key link sits on its own line, not inside a sentence, so it takes the
	   24px floor (measured 22px as a bare inline anchor). */
	.cert-verify-key-link {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		overflow-wrap: anywhere;
	}
	.cert-verify-pre {
		margin: 0 0 0.9rem;
		padding: 0.75rem 0.9rem;
		border-radius: var(--radius-card);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		user-select: all;
	}
</style>
