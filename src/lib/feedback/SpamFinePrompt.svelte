<script lang="ts">
	/**
	 * THE READY FINE FOR FEEDBACK SPAM (ledger 0432, feedback 4f1bdc96). One
	 * card per account with open spam: the reports themselves, the evidence for
	 * and against the account owner, and the amount the rule in
	 * `$lib/feedback/spam` works out. One tap fines, one dismisses; nothing is
	 * ever fined without the tap. A fine is a system fine, so the student can
	 * dispute it from their coin page.
	 *
	 * Transports are handed in: absent, the card still shows the evidence but
	 * offers no key, the console's convention for every write.
	 */
	import { coins } from '$lib/coin-format';
	import { AUTO_SPAM_WORDS, SPAM_BURST_SENTENCE, spamFineRefusalWords, type SpamPrompt } from './spam';

	type Act = (ids: string[], amount: number) => Promise<{ ok: boolean; reason?: string; message?: string }>;
	let {
		prompts,
		fine,
		dismiss
	}: {
		prompts: SpamPrompt[];
		fine?: Act;
		dismiss?: (ids: string[]) => Promise<{ ok: boolean; reason?: string; message?: string }>;
	} = $props();

	let done = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});
	const open = $derived(prompts.filter((p) => !done[p.userId]));

	function when(iso: string): string {
		return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	async function act(p: SpamPrompt, kind: 'fine' | 'dismiss') {
		if (busy) return;
		busy = p.userId;
		errors = { ...errors, [p.userId]: '' };
		try {
			const ids = p.reports.map((r) => r.id);
			const r = kind === 'fine' ? await fine!(ids, p.amount) : await dismiss!(ids);
			if (r.ok) {
				done = { ...done, [p.userId]: kind === 'fine' ? `Fined ${p.name} ${coins(p.amount)}. They can dispute it from their coin page.` : `Dismissed. ${p.name} was not fined.` };
			} else {
				errors = { ...errors, [p.userId]: r.reason ? spamFineRefusalWords(r.reason) : (r.message ?? 'That did not go through.') };
			}
		} finally {
			busy = null;
		}
	}
</script>

{#if prompts.length}
	<section class="card sfp" aria-labelledby="sfp-title" data-testid="spam-fine-prompt">
		<header class="sfp-head">
			<h2 id="sfp-title">Spam to review ({open.length})</h2>
			<p class="note sfp-rule" data-testid="spam-burst-sentence">{SPAM_BURST_SENTENCE} Nothing is fined until you press Fine.</p>
		</header>
		{#each Object.entries(done) as [user, words] (user)}
			<p class="sfp-done" data-testid="spam-fine-done">{words}</p>
		{/each}
		{#each open as p (p.userId)}
			<article class="sfp-account" data-testid="spam-fine-account">
				<div class="sfp-who">
					<h3>{p.name}</h3>
					<span class="sfp-count">{p.reports.length} spam {p.reports.length === 1 ? 'report' : 'reports'}{p.bursts.length ? `, ${p.bursts.length} ${p.bursts.length === 1 ? 'burst' : 'bursts'}` : ''}</span>
				</div>
				<ul class="sfp-reports">
					{#each p.reports as r (r.id)}
						<li>
							<span class="sfp-when">{when(r.created_at)}</span>
							<q class="sfp-msg">{r.message}</q>
							{#if r.page}<span class="sfp-page">{r.page}</span>{/if}
							{#if r.auto_spam && AUTO_SPAM_WORDS[r.auto_spam]}<span class="sfp-auto">{AUTO_SPAM_WORDS[r.auto_spam]}</span>{/if}
						</li>
					{/each}
				</ul>
				{#if p.doubts.length}
					<div class="sfp-doubts" data-testid="spam-fine-doubts">
						<strong>Check before fining: the evidence may not point to this student.</strong>
						<ul>
							{#each p.doubts as d (d)}<li>{d}</li>{/each}
						</ul>
					</div>
				{:else}
					<p class="sfp-points">Nothing in the evidence points away from this student.</p>
				{/if}
				<ul class="sfp-facts">
					{#each p.facts as f (f)}<li>{f}</li>{/each}
				</ul>
				{#if errors[p.userId]}<p class="feedback error">{errors[p.userId]}</p>{/if}
				{#if fine || dismiss}
					<div class="sfp-actions">
						{#if fine}
							<button
								type="button"
								class="btn {p.doubts.length ? 'secondary' : ''}"
								data-testid="spam-fine-go"
								disabled={busy !== null}
								onclick={() => act(p, 'fine')}
							>
								{p.doubts.length ? `Fine anyway, ${coins(p.amount)}` : `Fine ${coins(p.amount)}`}
							</button>
						{/if}
						{#if dismiss}
							<button type="button" class="btn secondary" data-testid="spam-fine-dismiss" disabled={busy !== null} onclick={() => act(p, 'dismiss')}>
								Dismiss
							</button>
						{/if}
					</div>
				{/if}
			</article>
		{/each}
	</section>
{/if}

<style>
	.sfp {
		margin-bottom: 1rem;
	}
	.sfp-head h2 {
		margin: 0 0 0.3rem;
	}
	.sfp-rule {
		margin: 0 0 0.8rem;
	}
	.sfp-done {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--green);
		margin: 0 0 0.5rem;
	}
	.sfp-account {
		border-top: 1px solid var(--line);
		padding: 0.8rem 0;
	}
	.sfp-who {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem;
	}
	.sfp-who h3 {
		margin: 0;
		font-size: 1.05rem;
	}
	.sfp-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--cyan);
	}
	.sfp-reports,
	.sfp-facts,
	.sfp-doubts ul {
		margin: 0.5rem 0;
		padding-left: 1.1rem;
	}
	.sfp-reports li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.6rem;
		margin-bottom: 0.25rem;
		overflow-wrap: anywhere;
	}
	.sfp-when,
	.sfp-page,
	.sfp-auto {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.sfp-msg {
		min-width: 0;
	}
	.sfp-doubts {
		border-left: 3px solid var(--amber);
		padding: 0.4rem 0.7rem;
		margin: 0.5rem 0;
	}
	.sfp-doubts strong {
		color: var(--amber);
		font-weight: 600;
	}
	.sfp-points {
		margin: 0.5rem 0;
		color: var(--text-2);
	}
	.sfp-facts {
		color: var(--text-2);
		font-size: 0.92rem;
	}
	.sfp-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.sfp-actions .btn {
		min-height: 44px;
	}
	.feedback.error {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--amber);
	}
</style>
