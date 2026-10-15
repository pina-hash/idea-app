<script lang="ts">
	/**
	 * ONE AWARD'S RECORD: the facts as `.cert-facts`, the status, the history
	 * as rows (date, action word, actor, reason), Print certificate and Verify
	 * links, and for an admin the actions. Suspend, Reinstate and Revoke are
	 * each a two-step `ConfirmKey` with a REQUIRED reason, posting the page's
	 * `action`; revoke's confirm names the serial and says it is final. Correct
	 * is a form (holder name, email, a required reason) that POSTs
	 * `CERT_API.correct` through fetch, because a correction re-signs the
	 * record and only the server holds the key.
	 */
	import { invalidateAll } from '$app/navigation';
	import { CERT_API, certificateHref, verifyHref } from '$lib/certifications/nav';
	import { formatCertDate, formatCertDateTime } from '$lib/certifications/status';
	import type { CertAwardJson } from '$lib/certifications/types';
	import { AWARD_READOUTS, HISTORY_WORDS, type DeskFormResult } from './desk';
	import ConfirmKey from './ConfirmKey.svelte';
	import Readout from './Readout.svelte';

	let {
		award,
		isAdmin = false,
		actionResult = null,
		correct = defaultCorrect
	}: {
		award: CertAwardJson;
		isAdmin?: boolean;
		actionResult?: DeskFormResult | null;
		correct?: (input: { award_id: string; holder_name: string; email: string; reason: string }) => Promise<{ ok: boolean; message: string }>;
	} = $props();

	async function defaultCorrect(input: { award_id: string; holder_name: string; email: string; reason: string }) {
		try {
			const res = await fetch(CERT_API.correct, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
			const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
			if (res.ok && body?.ok === true) return { ok: true, message: 'The record was corrected and re-signed under the same serial.' };
			return { ok: false, message: body?.message || `The correction was not recorded (HTTP ${res.status}).` };
		} catch (e) {
			return { ok: false, message: (e as Error)?.message || 'The correction was not recorded: the server could not be reached.' };
		}
	}

	const status = $derived(AWARD_READOUTS[award.status]);
	let reason = $state<Record<string, string>>({ suspend: '', reinstate: '', revoke: '' });
	// svelte-ignore state_referenced_locally
	let correctName = $state(award.holder_name);
	// svelte-ignore state_referenced_locally
	let correctEmail = $state(award.email);
	let correctReason = $state('');
	let correctBusy = $state(false);
	let correctResult = $state<{ ok: boolean; message: string } | null>(null);
	const correctCanSend = $derived(!correctBusy && correctName.trim().length > 0 && correctEmail.includes('@') && correctReason.trim().length > 0);

	async function sendCorrect(event: Event) {
		event.preventDefault();
		if (!correctCanSend) return;
		correctBusy = true;
		try {
			correctResult = await correct({ award_id: award.id, holder_name: correctName.trim(), email: correctEmail.trim().toLowerCase(), reason: correctReason.trim() });
			if (correctResult.ok) {
				correctReason = '';
				await invalidateAll();
			}
		} finally {
			correctBusy = false;
		}
	}
</script>

<div class="dk-record" data-testid="cert-record" data-status={award.status}>
	<header class="cert-titlebar">
		<div>
			<p class="eyebrow cert-eyebrow">Record</p>
			<h1 class="cert-title plate-title cert-serial" data-testid="cert-record-serial">{award.serial}</h1>
		</div>
		<Readout readout={status} testId="cert-record-status" />
	</header>

	<div class="cert-cols">
		<section class="cert-panel" id="facts" aria-labelledby="cert-record-facts-h">
			<h2 id="cert-record-facts-h">The record</h2>
			<dl class="cert-facts" data-testid="cert-record-facts">
				<dt>Holder</dt><dd>{award.holder_name}</dd>
				<dt>Email</dt><dd>{award.email}</dd>
				<dt>Certification</dt><dd>{award.name}</dd>
				<dt>Code</dt><dd>{award.code}</dd>
				<dt>Level</dt><dd>{award.level}</dd>
				<dt>Category</dt><dd>{award.category}</dd>
				<dt>Awarded</dt><dd>{formatCertDate(award.awarded_at)}</dd>
				<dt>Expires</dt><dd>{award.expires_at ? formatCertDate(award.expires_at) : 'Never'}</dd>
				<dt>Certifier</dt><dd>{award.awarded_by_name}</dd>
				<dt>Status</dt><dd>{status.word}</dd>
				<dt>Key id</dt><dd class="dk-mono-text">{award.key_id}</dd>
			</dl>
			<div class="cert-actions dk-record-links">
				<a class="btn cert-btn" href={certificateHref(award.serial)} data-testid="cert-record-print">Print certificate</a>
				<a class="btn cert-btn secondary" href={verifyHref(award.serial)} data-testid="cert-record-verify">Verify</a>
			</div>
		</section>

		<section class="cert-panel" id="history" aria-labelledby="cert-record-history-h">
			<h2 id="cert-record-history-h">History</h2>
			{#if !award.history?.length}
				<p class="dk-empty">No history rows were returned.</p>
			{:else}
				<ol class="cert-well" data-testid="cert-record-history">
					{#each award.history as row, i (i)}
						<li class="dk-row" data-action={row.action}>
							<div class="dk-row-main">
								<strong>{HISTORY_WORDS[row.action] ?? row.action}</strong>
								<span class="dk-row-meta">{formatCertDateTime(row.at)}</span>
								<span class="dk-row-meta">by {row.actor_name ?? 'the system'}</span>
								{#if row.reason}<span class="dk-row-note">{row.reason}</span>{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		{#if isAdmin}
			<section class="cert-panel" id="actions" aria-labelledby="cert-record-actions-h" data-testid="cert-record-actions">
				<h2 id="cert-record-actions-h">Actions</h2>
				<p class="cert-help">Each action needs a written reason and is kept forever in the history. Nothing is ever deleted.</p>
				{#if actionResult}
					<p class="cert-notice {actionResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-record-action-result">
						<span class="cert-notice-glyph" aria-hidden="true">{actionResult.ok ? '✓' : '!'}</span>
						<span>{actionResult.message}</span>
					</p>
				{/if}
				<div class="dk-record-actions">
					{#if award.status === 'valid' || award.status === 'expired'}
						<form method="post" action="?/action">
							<input type="hidden" name="award_id" value={award.id} />
							<input type="hidden" name="action" value="suspend" />
							<ConfirmKey word="Suspend" confirmWord="Suspend this award" cost="The certificate shows Suspended on the verify page until it is reinstated." canConfirm={reason.suspend.trim().length > 0} heldBecause="A suspension needs a reason." testId="cert-record-suspend">
								<label class="cert-field"><span>Reason (required)</span><textarea name="reason" rows="3" bind:value={reason.suspend}></textarea></label>
							</ConfirmKey>
						</form>
					{/if}
					{#if award.status === 'suspended'}
						<form method="post" action="?/action">
							<input type="hidden" name="award_id" value={award.id} />
							<input type="hidden" name="action" value="reinstate" />
							<ConfirmKey word="Reinstate" confirmWord="Reinstate this award" cost="The certificate shows Valid again on the verify page." canConfirm={reason.reinstate.trim().length > 0} heldBecause="A reinstatement needs a reason." testId="cert-record-reinstate">
								<label class="cert-field"><span>Reason (required)</span><textarea name="reason" rows="3" bind:value={reason.reinstate}></textarea></label>
							</ConfirmKey>
						</form>
					{/if}
					{#if award.status !== 'revoked'}
						<form method="post" action="?/action">
							<input type="hidden" name="award_id" value={award.id} />
							<input type="hidden" name="action" value="revoke" />
							<ConfirmKey word="Revoke" confirmWord="Revoke {award.serial}" cost="This revokes {award.serial} for good. A revoked award is final: it can never be reinstated, and the verify page shows Revoked forever." danger={true} canConfirm={reason.revoke.trim().length > 0} heldBecause="A revocation needs a reason." testId="cert-record-revoke">
								<label class="cert-field"><span>Reason (required)</span><textarea name="reason" rows="3" bind:value={reason.revoke}></textarea></label>
							</ConfirmKey>
						</form>
					{/if}
					{#if award.status === 'revoked'}
						<p class="dk-empty" data-testid="cert-record-final">This award is revoked, which is final. No action is offered.</p>
					{/if}
				</div>
			</section>

			<section class="cert-panel" id="correct" aria-labelledby="cert-record-correct-h" data-testid="cert-record-correct">
				<h2 id="cert-record-correct-h">Correct</h2>
				<p class="cert-help">A misspelled name or a wrong address is corrected here. The record is re-signed under the same serial and the old values stay in its history.</p>
				<form onsubmit={sendCorrect} class="dk-fields">
					<label class="cert-field"><span>Holder name</span><input type="text" bind:value={correctName} required /></label>
					<label class="cert-field"><span>Email</span><input type="email" bind:value={correctEmail} required /></label>
					<label class="cert-field dk-wide"><span>Reason (required)</span><textarea rows="3" bind:value={correctReason}></textarea></label>
					<div class="cert-actions dk-wide">
						<button type="submit" class="btn cert-btn" aria-disabled={correctCanSend ? undefined : 'true'} data-testid="cert-record-correct-send">{correctBusy ? 'Re-signing' : 'Correct and re-sign'}</button>
						{#if !correctCanSend && !correctBusy}<span class="dk-held">A correction needs a name, an address and a reason.</span>{/if}
					</div>
					{#if correctResult}
						<p class="cert-notice dk-wide {correctResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-record-correct-result">
							<span class="cert-notice-glyph" aria-hidden="true">{correctResult.ok ? '✓' : '!'}</span>
							<span>{correctResult.message}</span>
						</p>
					{/if}
				</form>
			</section>
		{/if}
	</div>
</div>

<style>
	.dk-record-links {
		margin-top: 1rem;
	}
	.dk-record-actions {
		display: grid;
		gap: 0.75rem;
	}
	.dk-mono-text {
		font-family: var(--font-mono);
	}
</style>
