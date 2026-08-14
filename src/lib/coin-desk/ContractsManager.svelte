<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		CONTRACT_STATUS_LABELS,
		claimantLabel,
		contractPayoutGuideline,
		contractSharePreview,
		type CoinContractRow,
		type ContractStatus
	} from './contracts';
	import { sectionDisplayName, type CoinSectionRow } from './sections';

	/**
	 * Contracts admin: post a job, watch students self-claim it, complete it
	 * (splits the payout evenly across current claimants) or cancel it, reset
	 * one back to open. Built the SAME way RolesManager.svelte was -- its own
	 * card, a plain post form, and a status-filtered list with per-row actions
	 * behind a two-step confirm for the destructive ones -- so a dev harness
	 * can mount this against a fake ledger the same way. See
	 * supabase/migrations/0077_coin_contracts.sql for the write-side design
	 * (why the capacity check needs a row lock, why status is computed).
	 *
	 * `sections` is read-only here (the RolesManager convention): this
	 * component never creates a section, only offers the existing list for
	 * the optional "restrict to a section" picker.
	 */
	let {
		supabase,
		sections = [],
		configured = true
	}: {
		supabase: SupabaseClient;
		sections?: CoinSectionRow[];
		configured?: boolean;
	} = $props();

	function reasonMessage(r: { reason?: string; message?: string }): string {
		switch (r.reason) {
			case 'error':
				return r.message ? `Error: ${r.message}` : 'An unexpected error occurred.';
			default:
				return r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
		}
	}

	// ---------------------------------------------------------------------
	// Post a contract. payout_amount is always free entry (0077's own
	// header): the docs' "~1i¢/hour, +50% specialized" formula is shown here
	// as a HINT only, computed client-side, never sent to the server or
	// enforced by it.
	// ---------------------------------------------------------------------
	let newTitle = $state('');
	let newDescription = $state('');
	let newPayout = $state('');
	let newMax = $state('1');
	let newSectionId = $state('');
	let guidelineHours = $state('');
	let guidelineSpecialized = $state(false);

	const guidelinePreview = $derived.by(() => {
		const hours = Number(guidelineHours);
		if (!Number.isFinite(hours) || hours <= 0) return null;
		return contractPayoutGuideline(hours, guidelineSpecialized);
	});

	let postBusy = $state(false);
	let postError = $state('');
	let postNotice = $state('');

	const canPost = $derived.by(() => {
		if (postBusy || !newTitle.trim()) return false;
		const amt = Number(newPayout);
		const max = Number(newMax);
		return Number.isFinite(amt) && amt > 0 && Number.isFinite(max) && max > 0;
	});

	async function submitPost() {
		if (!canPost) return;
		postBusy = true;
		postError = '';
		postNotice = '';
		const resp = await supabase.rpc('coin_admin_post_contract', {
			p_title: newTitle.trim(),
			p_description: newDescription.trim() || null,
			p_payout_amount: Math.round(Number(newPayout)),
			p_max_contractors: Math.round(Number(newMax)),
			p_section_id: newSectionId || null
		});
		postBusy = false;
		if (resp.error) {
			postError = resp.error.message;
			return;
		}
		postNotice = 'Contract posted -- it now shows in the list below.';
		newTitle = '';
		newDescription = '';
		newPayout = '';
		newMax = '1';
		newSectionId = '';
		guidelineHours = '';
		guidelineSpecialized = false;
		await loadContracts();
	}

	// ---------------------------------------------------------------------
	// List + filter.
	// ---------------------------------------------------------------------
	let contracts = $state<CoinContractRow[]>([]);
	let listBusy = $state(false);
	let listError = $state('');
	let statusFilter = $state<'all' | ContractStatus>('all');

	async function loadContracts() {
		listBusy = true;
		listError = '';
		const resp = await supabase.rpc('coin_admin_list_contracts');
		listBusy = false;
		if (resp.error) {
			listError = resp.error.message;
			return;
		}
		contracts = (resp.data ?? []) as CoinContractRow[];
	}

	onMount(() => {
		if (configured) loadContracts();
	});

	const filteredContracts = $derived(
		statusFilter === 'all' ? contracts : contracts.filter((c) => c.status === statusFilter)
	);

	function sectionLabel(sectionId: string | null): string {
		if (!sectionId) return 'Open to everyone';
		const s = sections.find((sec) => sec.id === sectionId);
		return s ? sectionDisplayName(s) : sectionId;
	}

	// ---------------------------------------------------------------------
	// Complete -- splits payout_amount evenly across current claimants.
	// ---------------------------------------------------------------------
	let completeBusy = $state<Record<string, boolean>>({});
	let completeFeedback = $state<Record<string, { ok: boolean; message: string }>>({});

	async function completeContract(c: CoinContractRow) {
		completeBusy = { ...completeBusy, [c.id]: true };
		const { [c.id]: _cleared, ...restFeedback } = completeFeedback;
		completeFeedback = restFeedback;

		const resp = await supabase.rpc('coin_admin_complete_contract', { p_contract_id: c.id, p_note: null });
		completeBusy = { ...completeBusy, [c.id]: false };
		if (resp.error) {
			completeFeedback = { ...completeFeedback, [c.id]: { ok: false, message: resp.error.message } };
			return;
		}
		const r = resp.data as { share: number; claimant_count: number; succeeded: number };
		completeFeedback = {
			...completeFeedback,
			[c.id]: {
				ok: true,
				message: `Paid ${r.share}i¢ to each of ${r.claimant_count} claimant${r.claimant_count === 1 ? '' : 's'} (${r.succeeded} succeeded).`
			}
		};
		await loadContracts();
	}

	// ---------------------------------------------------------------------
	// Cancel -- two-step confirm (the SectionManager / RolesManager revoke
	// convention), since it's destructive and pays nothing.
	// ---------------------------------------------------------------------
	let cancelConfirmId = $state<string | null>(null);
	let cancelReason = $state<Record<string, string>>({});
	let cancelBusy = $state<Record<string, boolean>>({});
	let cancelError = $state('');

	function askCancel(id: string) {
		cancelConfirmId = id;
		cancelError = '';
		resetConfirmId = null;
	}

	async function confirmCancel(id: string) {
		cancelBusy = { ...cancelBusy, [id]: true };
		const resp = await supabase.rpc('coin_admin_cancel_contract', {
			p_contract_id: id,
			p_reason: (cancelReason[id] ?? '').trim() || null
		});
		cancelBusy = { ...cancelBusy, [id]: false };
		cancelConfirmId = null;
		if (resp.error) {
			cancelError = resp.error.message;
			return;
		}
		await loadContracts();
	}

	// ---------------------------------------------------------------------
	// Reset -- two-step confirm, only offered on a non-terminal contract.
	// ---------------------------------------------------------------------
	let resetConfirmId = $state<string | null>(null);
	let resetBusy = $state<Record<string, boolean>>({});
	let resetError = $state('');
	let resetNotice = $state('');

	function askReset(id: string) {
		resetConfirmId = id;
		resetError = '';
		resetNotice = '';
		cancelConfirmId = null;
	}

	async function confirmReset(id: string) {
		resetBusy = { ...resetBusy, [id]: true };
		const resp = await supabase.rpc('coin_admin_reset_contract', { p_contract_id: id });
		resetBusy = { ...resetBusy, [id]: false };
		resetConfirmId = null;
		if (resp.error) {
			resetError = resp.error.message;
			return;
		}
		const r = resp.data as { cleared: number };
		resetNotice = `Cleared ${r.cleared} claim${r.cleared === 1 ? '' : 's'} -- back to open.`;
		await loadContracts();
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

<section class="card contracts-manager">
	<h2>Contracts</h2>
	<p class="note">
		Post a job, students self-claim it up to its capacity, complete it once someone has and split
		the payout evenly across whoever claimed it -- an ordinary Contract Completion award
		(coin_admin_complete_contract), the same category a single-student entry already used. Cancel
		pays nothing; reset clears claims and reopens it, only while it is still neither completed nor
		cancelled.
	</p>

	{#if !configured}
		<p class="feedback error">
			Migration 0077 does not appear to be applied yet -- contracts are unavailable. Apply it in
			the Supabase SQL editor, then reload this page.
		</p>
	{:else}
		<div class="sub-panel">
			<h3>Post a contract</h3>
			{#if postError}<p class="feedback error">{postError}</p>{/if}
			{#if postNotice}<p class="feedback notice">{postNotice}</p>{/if}
			<div class="field-row">
				<label for="contract-title">Title</label>
				<input id="contract-title" type="text" maxlength="200" bind:value={newTitle} />
			</div>
			<div class="field-row">
				<label for="contract-description">Description (optional)</label>
				<textarea id="contract-description" rows="2" maxlength="2000" bind:value={newDescription}
				></textarea>
			</div>
			<div class="field-row">
				<label for="contract-payout">Payout (i¢, split evenly across whoever claims it)</label>
				<input id="contract-payout" type="number" min="1" step="1" bind:value={newPayout} />
			</div>
			<div class="field-row">
				<label for="contract-max">Max contractors</label>
				<input id="contract-max" type="number" min="1" step="1" bind:value={newMax} />
			</div>
			<div class="field-row">
				<label for="contract-section">Restrict to a section (optional -- blank is open to everyone)</label>
				<select id="contract-section" bind:value={newSectionId}>
					<option value="">Open to everyone</option>
					{#each sections.filter((s) => s.active) as s (s.id)}
						<option value={s.id}>{sectionDisplayName(s)}</option>
					{/each}
				</select>
			</div>

			<div class="guideline">
				<p class="note small">
					Guideline only, never enforced: ~1i¢/hour, +50% for specialized skill over general
					labor (docs Part 3). Payout above is always a free amount you type in.
				</p>
				<div class="guideline-row">
					<label for="guideline-hours">Estimated hours</label>
					<input id="guideline-hours" type="number" min="0" step="0.5" bind:value={guidelineHours} />
					<label class="checkbox-row">
						<input type="checkbox" bind:checked={guidelineSpecialized} />
						Specialized skill (+50%)
					</label>
					{#if guidelinePreview !== null}
						<span class="preview">suggests {guidelinePreview}i¢</span>
					{/if}
				</div>
			</div>

			<div class="btn-row">
				<button class="btn" disabled={!canPost} onclick={submitPost}>
					{postBusy ? 'Posting…' : 'Post contract'}
				</button>
			</div>
		</div>

		<div class="sub-panel">
			<h3>All contracts</h3>
			<div class="mode-toggle">
				{#each [['all', 'All'], ['open', 'Open'], ['full', 'Full'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as [value, label] (value)}
					<button
						type="button"
						class:active={statusFilter === value}
						onclick={() => (statusFilter = value as 'all' | ContractStatus)}
					>
						{label}
					</button>
				{/each}
			</div>

			{#if listError}<p class="feedback error">{listError}</p>{/if}
			{#if cancelError}<p class="feedback error">{cancelError}</p>{/if}
			{#if resetError}<p class="feedback error">{resetError}</p>{/if}
			{#if resetNotice}<p class="feedback notice">{resetNotice}</p>{/if}

			{#if listBusy}
				<p class="note">Loading&hellip;</p>
			{:else if !filteredContracts.length}
				<p class="note">No contracts{statusFilter === 'all' ? ' yet' : ` with status "${statusFilter}"`}.</p>
			{:else}
				<div class="rows contract-rows">
					{#each filteredContracts as c (c.id)}
						{@const feedback = completeFeedback[c.id]}
						<div class="row contract-row">
							<div class="who">
								<span class="email">{c.title}</span>
								<span class={`tag status-tag status-${c.status}`}>{CONTRACT_STATUS_LABELS[c.status]}</span>
							</div>
							<div class="meta">
								<span class="since">
									{c.payout_amount}i¢ total &middot; {c.claimed_count}/{c.max_contractors} claimed
									&middot; {sectionLabel(c.section_id)} &middot; posted {when(c.created_at)} by {c.created_by}
								</span>
								{#if c.description}<span class="note-text">{c.description}</span>{/if}
								{#if c.cancel_reason}
									<span class="note-text">Cancelled: {c.cancel_reason}</span>
								{/if}
							</div>

							{#if c.claimants.length}
								<div class="claimants">
									{#each c.claimants as claimant (claimant.student_email)}
										<span class="claimant-chip">
											{claimantLabel(claimant)}
											{#if c.status === 'open' || c.status === 'full'}
												<span class="preview-inline">
													&rarr; {contractSharePreview(c.payout_amount, c.claimed_count)}i¢ if completed now
												</span>
											{/if}
										</span>
									{/each}
								</div>
							{:else}
								<p class="note small">No one has claimed this yet.</p>
							{/if}

							{#if feedback}
								<p class={`feedback inline-feedback ${feedback.ok ? 'notice' : 'error'}`}>{feedback.message}</p>
							{/if}

							<div class="actions review-actions">
								{#if c.status === 'open' || c.status === 'full'}
									<button
										class="btn secondary"
										disabled={!c.claimed_count || completeBusy[c.id]}
										onclick={() => completeContract(c)}
									>
										{completeBusy[c.id] ? '…' : 'Complete'}
									</button>

									{#if resetConfirmId === c.id}
										<span class="confirm-text">Clear all claims and reopen?</span>
										<button class="mini danger" disabled={resetBusy[c.id]} onclick={() => confirmReset(c.id)}>
											{resetBusy[c.id] ? '…' : 'confirm'}
										</button>
										<button class="mini" onclick={() => (resetConfirmId = null)}>cancel</button>
									{:else}
										<button class="mini" onclick={() => askReset(c.id)}>reset</button>
									{/if}

									{#if cancelConfirmId === c.id}
										<input
											type="text"
											class="mini-input"
											placeholder="reason (optional)"
											bind:value={cancelReason[c.id]}
										/>
										<button class="mini danger" disabled={cancelBusy[c.id]} onclick={() => confirmCancel(c.id)}>
											{cancelBusy[c.id] ? '…' : 'confirm'}
										</button>
										<button class="mini" onclick={() => (cancelConfirmId = null)}>back</button>
									{:else}
										<button class="mini danger" onclick={() => askCancel(c.id)}>cancel</button>
									{/if}
								{:else if c.status === 'completed'}
									<span class="since">completed {when(c.completed_at as string)}</span>
								{:else}
									<span class="since">cancelled {when(c.cancelled_at as string)}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.note.small {
		font-size: 0.78rem;
		margin-top: 0.3rem;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin-bottom: 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line);
	}
	.inline-feedback {
		margin: 0.4rem 0;
	}
	.sub-panel {
		margin: 0.4rem 0 0.9rem;
		padding: 0.7rem 0.85rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.sub-panel h3 {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		color: var(--green);
	}
	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.8rem;
	}
	.field-row label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.field-row input,
	.field-row select,
	.field-row textarea {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.field-row textarea {
		resize: vertical;
	}
	.field-row input:focus,
	.field-row select:focus,
	.field-row textarea:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.guideline {
		margin: 0.2rem 0 0.9rem;
		padding: 0.5rem 0.65rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 5px;
	}
	.guideline-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	.guideline-row input[type='number'] {
		width: 6rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.3rem 0.5rem;
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: 'Rajdhani', sans-serif;
		color: var(--white);
		cursor: pointer;
	}
	.preview {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--cyan);
	}
	.preview-inline {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--cyan);
	}
	.btn-row {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	.mode-toggle {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.mode-toggle button {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.mode-toggle button.active {
		color: var(--bg0);
		background: var(--green);
		border-color: var(--green);
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.contract-rows {
		margin-top: 0.4rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.contract-row {
		flex-direction: column;
		align-items: stretch;
		gap: 0.3rem;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
	}
	.email {
		font-weight: 700;
		color: var(--white);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.note-text {
		font-size: 0.85rem;
		color: var(--dim);
	}
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}
	.status-tag.status-open {
		color: var(--green);
	}
	.status-tag.status-full {
		color: var(--cyan);
	}
	.status-tag.status-completed {
		color: var(--gold);
	}
	.status-tag.status-cancelled {
		color: var(--amber);
	}
	.claimants {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0.4rem 0.6rem;
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 5px;
	}
	.claimant-chip {
		font-size: 0.82rem;
		color: var(--white);
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.review-actions {
		margin-left: 0;
		margin-top: 0.3rem;
	}
	.confirm-text {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--amber);
	}
	.mini {
		background: none;
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.mini:hover:not(:disabled) {
		color: var(--white);
		border-color: var(--green);
	}
	.mini.danger {
		color: var(--crimson, #ff3355);
		border-color: var(--crimson, #ff3355);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.mini-input {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.8rem;
		padding: 0.15rem 0.4rem;
		max-width: 10rem;
	}
</style>
