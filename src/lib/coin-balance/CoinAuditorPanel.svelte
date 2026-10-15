<script lang="ts">
	import './coin-page.css';
	import { coinNumber } from '$lib/coin-format';
	import { coinWhen } from '$lib/coin-balance';
	import { auditorRefusalWords, type CoinActionResult, type CoinAuditorPending } from './extras';

	/**
	 * THE STUDENT AUDITOR (2.10, 0245). Only for a student Mr. Pina made an
	 * auditor, and only when `coin_auditor_queue()` says so. The classmates'
	 * reported counts of coins on hand, each approved or denied after looking
	 * at the coins. Every validation carries the auditor's name, and an auditor
	 * can never validate their own count; the database refuses both ways. An
	 * omitted `validate` removes Approve and Deny.
	 */
	let {
		pending,
		validate = null,
		ondone = null
	}: {
		pending: CoinAuditorPending[];
		validate?: ((id: string, approve: boolean, note: string | null) => Promise<CoinActionResult>) | null;
		ondone?: (() => void) | null;
	} = $props();

	let notes = $state<Record<string, string>>({});
	let busyId = $state<string | null>(null);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	async function decide(p: CoinAuditorPending, approve: boolean) {
		if (!validate || busyId) return;
		busyId = p.id;
		try {
			const r = await validate(p.id, approve, (notes[p.id] ?? '').trim() || null);
			outcome = r.ok
				? { ok: true, text: `${approve ? 'Approved' : 'Denied'}: ${p.name}, ${coinNumber(p.count)} coins on hand.` }
				: { ok: false, text: auditorRefusalWords(r) };
			if (r.ok) ondone?.();
		} catch {
			outcome = { ok: false, text: auditorRefusalWords({ reason: 'error' }) };
		} finally {
			busyId = null;
		}
	}
</script>

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-audit" data-testid="coin-auditor">
	<h2 id="cpx-h-audit">Student Auditor</h2>
	<p class="cpx-lead">
		Classmates' counts of coins on hand, waiting to be checked. Look at the coins, then approve or deny. Every
		check carries your name, and you can never check your own.
	</p>
	{#if pending.length}
		<ul class="cpx-list">
			{#each pending as p (p.id)}
				<li data-testid="audit-row">
					<div class="cpx-line">
						<span class="cpx-name">{p.name}</span>
						<span class="cpx-meta">{coinNumber(p.count)} on hand, sent {coinWhen(p.created_at)}</span>
					</div>
					{#if validate}
						<label class="cpx-field">
							<span>Note (optional, shown with a denial)</span>
							<input
								type="text"
								maxlength="500"
								autocomplete="off"
								value={notes[p.id] ?? ''}
								oninput={(e) => (notes = { ...notes, [p.id]: e.currentTarget.value })}
							/>
						</label>
						<div class="cpx-row">
							<button
								type="button"
								class="btn cpx-key"
								aria-disabled={busyId ? 'true' : undefined}
								data-testid="audit-approve"
								onclick={() => decide(p, true)}>Approve the count</button
							>
							<button
								type="button"
								class="btn secondary cpx-key"
								aria-disabled={busyId ? 'true' : undefined}
								data-testid="audit-deny"
								onclick={() => decide(p, false)}>Deny the count</button
							>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="cpx-note" data-testid="audit-empty">No counts are waiting.</p>
	{/if}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="audit-outcome">
		{outcome?.text ?? ''}
	</p>
</section>
