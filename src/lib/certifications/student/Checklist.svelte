<script lang="ts">
	/**
	 * THE STUDENT'S LIVE CHECKLIST (ledger 0391): every part in the fixed order,
	 * each row a glyph, the word, who checked it and when; a locked row dim with
	 * "Unlocks after <previous part>"; a waived row named as waived; and an Open
	 * key that scrolls the matching kit section fully into view below the
	 * sticky bar. Under it: Start, or Withdraw (two presses, with the sentence
	 * that says what withdrawing keeps), and the cooldown sentence.
	 *
	 * `./kit.ts` and `$lib/certifications/parts.ts` decide; this draws. The
	 * database (`cert_start`, `cert_withdraw`) is the gate and its refusal is
	 * rendered here, verbatim.
	 */
	import { CERT_PARTS, type CertGetJson, type CertPart, type CheckState } from '$lib/certifications/types';
	import { PART_DESCRIPTIONS, PART_WORDS, partsProgress } from '$lib/certifications/parts';
	import { COOLDOWN_SENTENCE, DORMANT_SENTENCE, WITHDRAW_SENTENCE } from '$lib/certifications/copy';
	import { cooldownActive, formatCertDate, formatCertDateTime } from '$lib/certifications/status';
	import type { CertActionPost } from './actions';
	import { needsWords, missingPrerequisites } from './catalog';
	import { checkedByWords, jumpTo, lockedAfter, partSection, sectionId } from './kit';
	import CertNotice from './CertNotice.svelte';

	let {
		cert,
		anchorPrefix = 'kit',
		dormancyDays = null,
		post = null
	}: {
		cert: CertGetJson;
		anchorPrefix?: string;
		dormancyDays?: number | null;
		post?: CertActionPost | null;
	} = $props();

	const attempt = $derived(cert.my_attempt);
	const open = $derived(!!attempt && (attempt.state === 'active' || attempt.state === 'dormant'));
	const missing = $derived(missingPrerequisites(cert));
	const canStart = $derived(!open && cert.state === 'published' && missing.length === 0 && !(cert.my.held && !cert.my.expired));
	const earned = $derived(cert.my.held && !cert.my.expired);
	const progress = $derived(attempt ? partsProgress(attempt.checks) : null);
	const cooldown = $derived(cert.cooldown_until ?? attempt?.cooldown_until ?? null);

	interface Row {
		part: CertPart;
		state: CheckState | 'planned';
		locked: string | null;
		next: boolean;
		meta: string;
	}
	const rows = $derived.by((): Row[] => {
		const checks = attempt?.checks ?? [];
		const next = attempt?.next_part ?? null;
		return CERT_PARTS.map((part) => {
			const check = checks.find((c) => c.part === part) ?? null;
			if (!attempt || !check) {
				const waived = part !== 'training' && !cert.parts[part];
				return { part, state: waived ? 'waived' : 'planned', locked: null, next: false, meta: '' };
			}
			const locked = check.state === 'pending' ? lockedAfter(checks, part) : null;
			const who = checkedByWords(check);
			const when = check.checked_at ? formatCertDateTime(check.checked_at) : '';
			return {
				part,
				state: check.state,
				locked,
				next: next === part,
				meta: who && when ? `${who}, ${when}` : who || when
			};
		});
	});

	const GLYPH: Record<Row['state'] | 'locked' | 'next', string> = {
		done: '✓',
		pending: '○',
		waived: '·',
		planned: '○',
		locked: '○',
		next: '→'
	};
	const glyphOf = (r: Row) => (r.state === 'done' ? GLYPH.done : r.state === 'waived' ? GLYPH.waived : r.locked ? GLYPH.locked : r.next ? GLYPH.next : GLYPH.pending);
	const stateWords = (r: Row) =>
		r.state === 'done' ? 'Done' : r.state === 'waived' ? 'Waived' : r.locked ? `Unlocks after ${r.locked}` : r.next ? 'Next' : r.state === 'planned' ? 'Pending' : 'Pending';

	let refusal = $state<string | null>(null);
	let sending = $state(false);
	let armed = $state(false);

	function jump(event: MouseEvent, part: CertPart) {
		const id = sectionId(anchorPrefix, partSection(part));
		if (jumpTo(id)) event.preventDefault();
	}

	async function send(action: 'start' | 'withdraw', event: SubmitEvent) {
		if (!post) return; // the native post reaches the same action
		event.preventDefault();
		if (sending) return;
		if (action === 'withdraw' && !armed) {
			armed = true;
			return;
		}
		sending = true;
		refusal = null;
		try {
			const fields: Record<string, string> = action === 'start' ? { code: cert.code } : { attempt_id: attempt?.id ?? '' };
			const answer = await post(action, fields);
			if (!answer.ok) refusal = answer.message;
			else armed = false;
		} finally {
			sending = false;
		}
	}
</script>

<section class="cert-panel cert-checklist-panel" aria-labelledby={`${anchorPrefix}-checklist-h`} data-testid="cert-checklist">
	<h2 id={`${anchorPrefix}-checklist-h`}>
		My checklist
		{#if progress}<span class="cert-readout" data-testid="cert-checklist-progress">{progress.done} of {progress.total} parts done</span>{/if}
	</h2>

	{#if attempt?.state === 'dormant'}
		<CertNotice tone="warn" title="This attempt is dormant." testId="cert-dormant">
			{DORMANT_SENTENCE(dormancyDays ?? 60)}
		</CertNotice>
	{/if}

	<ol class="cert-checklist">
		{#each rows as row (row.part)}
			<li
				class="cert-check-row"
				class:is-done={row.state === 'done'}
				class:is-waived={row.state === 'waived'}
				class:is-locked={!!row.locked}
				class:is-next={row.next}
				data-testid="cert-check-row"
				data-part={row.part}
				data-state={row.state === 'planned' ? 'pending' : row.state}
				data-locked={row.locked ? 'yes' : 'no'}
			>
				<span class="cert-check-glyph" aria-hidden="true">{glyphOf(row)}</span>
				<div class="cert-check-body">
					<div class="cert-check-word">{PART_WORDS[row.part]} <span class="cert-check-state" data-testid="cert-check-state">{stateWords(row)}</span></div>
					<p class="cert-check-desc">{PART_DESCRIPTIONS[row.part]}</p>
					{#if row.meta}<p class="cert-check-meta">{row.meta}</p>{/if}
				</div>
				{#if row.state !== 'waived'}
					<a class="btn secondary cert-btn cert-check-open" href={`#${sectionId(anchorPrefix, partSection(row.part))}`} onclick={(e) => jump(e, row.part)} data-testid="cert-check-open">Open</a>
				{/if}
			</li>
		{/each}
	</ol>

	{#if refusal}
		<CertNotice tone="bad" testId="cert-checklist-refusal">{refusal}</CertNotice>
	{/if}

	{#if cooldown && cooldownActive(cooldown)}
		<CertNotice tone="warn" title="Exam cooldown" testId="cert-cooldown">{COOLDOWN_SENTENCE(formatCertDate(cooldown))}</CertNotice>
	{/if}

	<div class="cert-actions cert-checklist-actions">
		{#if earned && attempt?.award}
			<span class="cert-readout is-ok" data-testid="cert-checklist-earned"><span aria-hidden="true">✓</span> Earned {formatCertDate(attempt.award.awarded_at)}</span>
		{:else if open}
			<form method="POST" action="?/withdraw" onsubmit={(e) => send('withdraw', e)} class="cert-withdraw">
				<input type="hidden" name="attempt_id" value={attempt?.id ?? ''} />
				{#if armed}
					<p class="cert-help cert-withdraw-why" data-testid="cert-withdraw-sentence">{WITHDRAW_SENTENCE}</p>
					<div class="cert-actions">
						<button type="submit" class="btn danger cert-btn" aria-disabled={sending} data-testid="cert-withdraw-confirm">{sending ? 'Withdrawing' : 'Yes, withdraw'}</button>
						<button type="button" class="btn secondary cert-btn" onclick={() => (armed = false)} data-testid="cert-withdraw-cancel">Keep going</button>
					</div>
				{:else}
					<button type="submit" class="btn secondary cert-btn" data-testid="cert-withdraw">Withdraw</button>
				{/if}
			</form>
		{:else}
			<form method="POST" action="?/start" onsubmit={(e) => send('start', e)} class="cert-start">
				<input type="hidden" name="code" value={cert.code} />
				<button type="submit" class="btn cert-btn" aria-disabled={!canStart || sending} data-testid="cert-start" data-enabled={canStart ? 'yes' : 'no'}>
					{sending ? 'Starting' : attempt ? 'Start again' : 'Start'}
				</button>
				{#if cert.state !== 'published'}
					<span class="cert-help" data-testid="cert-start-why">This certification is retired. Existing awards stay valid; it takes no new starts.</span>
				{:else if missing.length > 0}
					<span class="cert-help" data-testid="cert-start-why">{needsWords(missing)}</span>
				{/if}
			</form>
		{/if}
	</div>
</section>

<style>
	.cert-checklist-panel h2 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.cert-check-body {
		min-width: 0;
	}
	.cert-check-word {
		font-weight: 700;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
		align-items: baseline;
	}
	.cert-check-state {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
		font-weight: 400;
	}
	.is-done .cert-check-state {
		color: var(--green);
	}
	.is-next .cert-check-state {
		color: var(--text-1);
	}
	.is-locked .cert-check-word,
	.is-locked .cert-check-desc,
	.is-waived .cert-check-word,
	.is-waived .cert-check-desc {
		color: var(--text-2);
	}
	.cert-check-desc {
		margin: 0.15rem 0 0;
		font-size: 0.88rem;
		line-height: 1.4;
		color: var(--text-2);
	}
	.cert-check-meta {
		margin: 0.2rem 0 0;
	}
	.cert-check-open {
		align-self: center;
		padding-inline: 0.8rem;
	}
	.cert-checklist-actions {
		margin-top: 0.9rem;
	}
	.cert-withdraw,
	.cert-start {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.75rem;
		align-items: center;
	}
	.cert-withdraw-why {
		flex-basis: 100%;
		margin: 0;
	}
	.btn[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
	@media (max-width: 479.98px) {
		.cert-checklist :global(.cert-check-row) {
			grid-template-columns: 2rem 1fr;
		}
		.cert-check-open {
			grid-column: 2;
			justify-self: start;
		}
	}
</style>
