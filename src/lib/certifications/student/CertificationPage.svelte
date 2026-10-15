<script lang="ts">
	/**
	 * THE CERTIFICATION PAGE (ledger 0391): a desktop master-detail. The left
	 * column is the live checklist with Start or Withdraw and the cooldown
	 * sentence; the right column is the kit, section by section. Above 64rem
	 * the checklist stays in view beside the kit (sticky under the bar); below
	 * it the columns stack, checklist first, which is the phone layout.
	 *
	 * The route mounts this over its load and its transports; `/dev/cert-
	 * certification` mounts the IDENTICAL component over fixtures and in-memory
	 * transports. Nothing here fetches.
	 */
	import type { CertGetJson, CertSettings } from '$lib/certifications/types';
	import type { CertActionPost, CertRpc } from './actions';
	import type { EvidenceUploader } from './evidence-upload';
	import Checklist from './Checklist.svelte';
	import KitViewer from './KitViewer.svelte';

	let {
		cert,
		settings = null,
		anchorPrefix = 'kit',
		post = null,
		rpc = null,
		makeUploader = null,
		refusal = null,
		onchanged = null,
		lessonHref = null
	}: {
		cert: CertGetJson;
		settings?: CertSettings | null;
		anchorPrefix?: string;
		post?: CertActionPost | null;
		rpc?: CertRpc | null;
		makeUploader?: ((attemptId: string) => EvidenceUploader) | null;
		refusal?: { section: string; message: string } | null;
		onchanged?: (() => void) | null;
		/** A harness's lesson document source; null is the real route. */
		lessonHref?: ((lessonId: string) => string) | null;
	} = $props();
</script>

<div class="cert-page" data-testid="cert-page" data-code={cert.code}>
	<div class="cert-readouts cert-page-readouts">
		<span class="cert-readout">{cert.code}</span>
		<span class="cert-readout">Level {cert.level}</span>
		<span class="cert-readout">{cert.category}</span>
		{#if cert.renewal === 'school_year'}<span class="cert-readout">Renews each school year</span>{/if}
		{#if cert.state === 'retired'}<span class="cert-readout is-warn">Retired</span>{/if}
	</div>
	<div class="cert-page-cols">
		<aside class="cert-page-side">
			<Checklist {cert} {anchorPrefix} dormancyDays={settings?.dormancy_days ?? null} {post} />
		</aside>
		<div class="cert-page-main">
			<KitViewer {cert} {settings} {anchorPrefix} {post} {rpc} {makeUploader} {refusal} {onchanged} {lessonHref} />
		</div>
	</div>
</div>

<style>
	.cert-page-readouts {
		margin: 0 0 1rem;
	}
	.cert-page-cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}
	@media (min-width: 64rem) {
		.cert-page-cols {
			grid-template-columns: minmax(20rem, 24rem) minmax(0, 1fr);
		}
		.cert-page-side {
			position: sticky;
			top: calc(var(--cert-bar-h, 4.25rem) + 0.75rem);
			max-height: calc(100vh - var(--cert-bar-h, 4.25rem) - 1.5rem);
			overflow-y: auto;
		}
	}
</style>
