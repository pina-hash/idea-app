<script lang="ts">
	/**
	 * One certification on the catalog (ledger 0391): its code and level as
	 * readouts, the name, the definition (two sentences, the rest behind a
	 * Disclosure), the prerequisites with a lock glyph and the missing codes in
	 * words, the holders and completion readouts, and ONE state key:
	 * Start (a form action, enabled only when every prerequisite is held),
	 * Continue, Earned with the serial's tail, or "Withdrawn: start again".
	 * `catalogKey` in `./catalog.ts` is the decision; this file only draws it.
	 *
	 * `post` is the route's form-action transport; absent, Start posts natively.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import { certHref } from '$lib/certifications/nav';
	import type { CertSummary } from '$lib/certifications/types';
	import type { CertActionPost } from './actions';
	import { catalogKey, completionWords, definitionLead, holdersWords, needsWords } from './catalog';
	import CertNotice from './CertNotice.svelte';

	let {
		cert,
		serial = null,
		post = null
	}: { cert: CertSummary; serial?: string | null; post?: CertActionPost | null } = $props();

	const key = $derived(catalogKey(cert, serial ? { [cert.code]: serial } : {}));
	const lead = $derived(definitionLead(cert.definition));
	const completion = $derived(completionWords(cert.avg_completion_days));
	const dormant = $derived(cert.my.state === 'dormant');

	let refusal = $state<string | null>(null);
	let sending = $state(false);

	async function onStart(event: SubmitEvent) {
		if (!post) return; // the native post reaches the same action
		event.preventDefault();
		if (key.kind !== 'start' && key.kind !== 'withdrawn') return;
		if (!key.enabled || sending) return;
		sending = true;
		refusal = null;
		try {
			const answer = await post('start', { code: cert.code });
			if (!answer.ok) refusal = answer.message;
		} finally {
			sending = false;
		}
	}
</script>

<article class="cert-panel cert-card" data-testid="cert-catalog-card" data-code={cert.code} data-key={key.kind}>
	<div class="cert-readouts cert-card-readouts">
		<span class="cert-readout">{cert.code}</span>
		<span class="cert-readout">Level {cert.level}</span>
		{#if cert.renewal === 'school_year'}<span class="cert-readout">Renews each school year</span>{/if}
		{#if dormant}<span class="cert-readout is-warn" data-testid="cert-card-dormant">Dormant</span>{/if}
	</div>
	<h3 class="cert-card-name"><a href={certHref(cert.code)} class="cert-card-link">{cert.name}</a></h3>
	{#if lead.lead}
		<p class="cert-card-def">{lead.lead}</p>
		{#if lead.rest}
			<Disclosure label="Definition" collapseWhen={true} scope={`cert:catalog:${cert.code}:definition`} showWord="Read more" hideWord="Hide">
				<p class="cert-card-def">{lead.rest}</p>
			</Disclosure>
		{/if}
	{/if}

	{#if cert.prerequisites.length > 0}
		{@const missing = cert.prerequisites.filter((p) => !p.held).map((p) => p.code)}
		<p class="cert-card-prereq" class:is-locked={missing.length > 0} data-testid="cert-card-prereq">
			{#if missing.length > 0}
				<!-- A padlock drawn in currentColor: no emoji anywhere (the design standard's iconography rule). -->
				<svg class="cert-card-lock" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
					<rect x="3" y="7" width="10" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5" />
					<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5" />
					<circle cx="8" cy="10.5" r="1" fill="currentColor" />
				</svg>
			{:else}
				<span class="cert-card-lock" aria-hidden="true">✓</span>
			{/if}
			{#if missing.length > 0}
				<span data-testid="cert-card-needs">{needsWords(missing)}</span>
			{:else}
				<span>Requires {cert.prerequisites.map((p) => p.code).join(', ')}, which you hold</span>
			{/if}
		</p>
	{/if}

	<div class="cert-readouts cert-card-stats">
		<span class="cert-readout">{holdersWords(cert.holders_count)}</span>
		{#if completion}<span class="cert-readout">{completion}</span>{/if}
	</div>

	{#if refusal}
		<CertNotice tone="bad" testId="cert-card-refusal">{refusal}</CertNotice>
	{/if}

	<div class="cert-actions cert-card-actions">
		{#if key.kind === 'continue'}
			<a class="btn cert-btn" href={certHref(cert.code)} data-testid="cert-card-continue">{key.label}</a>
		{:else if key.kind === 'earned'}
			<span class="cert-readout is-ok cert-card-earned" data-testid="cert-card-earned">
				<span aria-hidden="true">✓</span> {key.label}{#if key.serialTail}<span class="cert-serial cert-card-tail"> {key.serialTail}</span>{/if}
			</span>
			<a class="btn secondary cert-btn" href={certHref(cert.code)}>Open</a>
		{:else}
			<form method="POST" action="?/start" onsubmit={onStart} class="cert-card-start">
				<input type="hidden" name="code" value={cert.code} />
				<button
					type="submit"
					class="btn cert-btn"
					aria-disabled={!key.enabled || sending}
					aria-describedby={!key.enabled ? `cert-card-why-${cert.code}` : undefined}
					data-testid="cert-card-start"
					data-enabled={key.enabled ? 'yes' : 'no'}
				>{sending ? 'Starting' : key.label}</button>
				{#if !key.enabled}
					<span class="cert-help cert-card-why" id={`cert-card-why-${cert.code}`}>{needsWords(key.missing)}</span>
				{/if}
			</form>
			<a class="btn secondary cert-btn" href={certHref(cert.code)}>Explore</a>
		{/if}
	</div>
</article>

<style>
	.cert-card {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.cert-card-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
	}
	.cert-card-name::before {
		content: none;
	}
	.cert-card-link {
		color: var(--text-1);
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.cert-card-link:hover {
		color: var(--hover-ink, var(--green));
	}
	.cert-card-def {
		margin: 0;
		line-height: 1.5;
	}
	.cert-card-prereq {
		margin: 0;
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.04em;
	}
	.cert-card-prereq.is-locked {
		color: var(--text-1);
	}
	.cert-card-lock {
		flex: none;
	}
	.cert-card-actions {
		margin-top: auto;
		padding-top: 0.25rem;
	}
	.cert-card-start {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
		align-items: center;
		margin: 0;
	}
	.cert-card-start .btn[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.cert-card-why {
		flex-basis: 100%;
	}
	.cert-card-earned {
		min-height: 44px;
		padding-inline: 0.8rem;
		font-size: 0.82rem;
	}
	.cert-card-tail {
		font-size: 0.85rem;
	}
</style>
