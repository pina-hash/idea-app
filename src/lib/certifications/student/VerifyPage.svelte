<script lang="ts">
	/**
	 * The public verify page's body (ledger 0391): one form with one serial box
	 * (44px, mono, the serial's own shape as the placeholder) and a Check key
	 * that submits by GET to the same address, then the answer. The route
	 * decides the answer on the server (normalize, rate limit, `cert_verify`,
	 * re-check the signature); a harness hands in a `view` directly.
	 */
	import { CERT_PATHS } from '$lib/certifications/nav';
	import type { VerifyView } from './verify';
	import VerifyResult from './VerifyResult.svelte';

	let { view }: { view: VerifyView } = $props();
</script>

<div class="cert-verify" data-testid="cert-verify">
	<form class="cert-panel cert-verify-form" method="GET" action={CERT_PATHS.verify} data-testid="cert-verify-form">
		<label class="cert-field cert-verify-field">
			<span>Serial</span>
			<input
				class="cert-verify-input plate-well"
				type="text"
				name="serial"
				value={view.typed}
				placeholder="IDEA-XXXX-XXXX-XXXX-XXXX"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				inputmode="text"
				maxlength="40"
				data-testid="cert-verify-input"
			/>
		</label>
		<div class="cert-actions">
			<button type="submit" class="btn cert-btn" data-testid="cert-verify-check">Check</button>
			<span class="cert-help">Capitals and hyphens do not matter. I and L read as 1, O as 0.</span>
		</div>
	</form>
	<VerifyResult {view} />
</div>

<style>
	.cert-verify {
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
	}
	@media (min-width: 64rem) {
		.cert-verify {
			grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
		}
	}
	.cert-verify-form {
		margin: 0;
	}
	.cert-verify-field {
		margin-bottom: 0.75rem;
	}
	.cert-verify-input {
		width: 100%;
		font-family: var(--font-mono);
		letter-spacing: 0.1em;
		font-size: 1rem;
		text-transform: uppercase;
	}
</style>
