<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import {
		coinAmountDisplay,
		coinRowLabel,
		coinTxnType,
		COIN_TXN_TYPE_LABELS,
		signedCoins,
		type CoinAmountDisplay
	} from '$lib/coin-format';
	import { COIN_TYPE_GLYPHS, COIN_TYPE_TONES } from './transaction-types';
	import { deskHistoryRows, isUndoable, num, type DeskHistoryRow, type DeskTxn } from './v2';
	import {
		editLine,
		isEditable,
		liveEdits,
		type DeskEdit,
		type DeskHistoryTxn,
		type DeskWrite
	} from './student-view';

	/**
	 * ONE STUDENT'S HISTORY ON THE DESK, WITH UNDO (IDEA Coin V2).
	 *
	 * It replaced `$lib/coin-balance/CoinTransactionRows` on the desk because
	 * the desk's history now has two things the student's page does not: an
	 * Undo on every row that can be undone, and undone pairs folded into one
	 * line. `deskHistoryRows` in `./v2` is the rule; this file only draws it.
	 *
	 * UNDO IS TWO PRESSES. The first arms the row and says what it will do;
	 * the second calls the `reverse` transport. Without a `reverse` transport
	 * there is no Undo anywhere in the list: absence is the mechanism.
	 *
	 * A physical row is history only (it moved no balance since 0239), so it
	 * carries a "Not counted" chip and never an Undo.
	 *
	 * EDITING A PAST AMOUNT (0250) is the `edit` transport, handed in only for
	 * a full coin admin (`coin_admin_lookup().can_edit`). Absent, there is no
	 * Edit control anywhere in the list. An edited row shows its value NOW,
	 * an "Edited" chip, and every change underneath it (old value, new value,
	 * when); `undoEdit` puts back the value before the newest change.
	 */
	let {
		transactions,
		kinds = {},
		reverse,
		onReversed,
		edit,
		undoEdit,
		emptyMessage = 'No transactions logged yet for this email.'
	}: {
		transactions: DeskTxn[];
		kinds?: Record<string, string>;
		reverse?: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
		onReversed?: () => void | Promise<void>;
		/** Edit one row's amount (coin_edit_amount). Full coin admins only. */
		edit?: (id: string, amount: number, note: string | null) => Promise<DeskWrite>;
		/** Undo the newest edit of one row (coin_edit_undo). */
		undoEdit?: (id: string) => Promise<DeskWrite>;
		emptyMessage?: string;
	} = $props();

	function editsOf(t: DeskTxn): DeskEdit[] {
		return (t as DeskHistoryTxn).edits ?? [];
	}

	function wasEdited(t: DeskTxn): boolean {
		const h = t as DeskHistoryTxn;
		return h.edited === true || liveEdits(h).length > 0;
	}

	// --- the amount editor: one row at a time ---------------------------------
	let editing = $state<string | null>(null);
	let editValue = $state<string | number>('');
	let editNote = $state('');
	let armedUndoEdit = $state<string | null>(null);

	function openEdit(t: DeskHistoryRow) {
		editing = t.id;
		editValue = String(num(t.amount));
		editNote = '';
		rowError = null;
		armed = null;
	}

	const editNumber = $derived(Number(editValue));
	const editReady = $derived(String(editValue).trim() !== '' && Number.isFinite(editNumber));

	async function saveEdit(t: DeskHistoryRow) {
		if (!edit || !editReady) return;
		busyId = t.id;
		rowError = null;
		notice = '';
		let r: DeskWrite;
		try {
			r = await edit(t.id, editNumber, editNote.trim() || null);
		} finally {
			busyId = null;
		}
		if (!r.ok) {
			rowError = { id: t.id, message: r.message };
			return;
		}
		editing = null;
		notice = `Changed ${t.category_name} from ${signedCoins(num(t.amount))} to ${signedCoins(editNumber)}.`;
		await onReversed?.();
	}

	async function confirmUndoEdit(t: DeskHistoryRow) {
		if (!undoEdit) return;
		busyId = t.id;
		rowError = null;
		notice = '';
		let r: DeskWrite;
		try {
			r = await undoEdit(t.id);
		} finally {
			busyId = null;
		}
		armedUndoEdit = null;
		if (!r.ok) {
			rowError = { id: t.id, message: r.message };
			return;
		}
		notice = `Undid the last change to ${t.category_name}.`;
		await onReversed?.();
	}

	const rows = $derived(deskHistoryRows(transactions));

	let armed = $state<string | null>(null);
	let busyId = $state<string | null>(null);
	let rowError = $state<{ id: string; message: string } | null>(null);
	let notice = $state('');

	function amountOf(t: DeskHistoryRow): CoinAmountDisplay {
		const type = coinTxnType(t, kinds[t.category_id]);
		// A payout's digital half lowered the balance; it keeps its sign.
		if (t.isPayout) return { tone: 'transfer', text: signedCoins(num(t.amount)) };
		return coinAmountDisplay(num(t.amount), type);
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	/** Who logged it and when, and who undid it and when: one sentence. */
	function sinceLine(t: DeskHistoryRow): string {
		const who = (e: string | null | undefined) => (e === 'system' ? 'autopay' : e);
		const parts: string[] = [];
		parts.push(t.actor_email ? `by ${who(t.actor_email)}, ${when(t.created_at)}` : when(t.created_at));
		if (t.undoneBy) {
			parts.push(
				t.undoneBy.actor_email
					? `undone by ${who(t.undoneBy.actor_email)}, ${when(t.undoneBy.created_at)}`
					: `undone ${when(t.undoneBy.created_at)}`
			);
		}
		return parts.join(' · ');
	}

	async function confirmUndo(t: DeskHistoryRow) {
		if (!reverse) return;
		busyId = t.id;
		rowError = null;
		notice = '';
		let r: { ok: true } | { ok: false; message: string };
		try {
			r = await reverse(t.id);
		} finally {
			busyId = null;
		}
		armed = null;
		if (!r.ok) {
			rowError = { id: t.id, message: r.message };
			return;
		}
		notice = `Undid ${t.category_name} (${signedCoins(num(t.amount))}).`;
		await onReversed?.();
	}
</script>

{#if notice}<p class="cdx-feedback notice" data-testid="cd-undo-notice">{notice}</p>{/if}

{#if rows.length}
	<ul class="desk-rows" data-testid="cd-desk-history">
		{#each rows as t (t.id)}
			{@const type = coinTxnType(t, kinds[t.category_id])}
			{@const amount = amountOf(t)}
			{@const named = coinRowLabel(t)}
			<li class="row" class:undone={t.undone} class:uncounted={!t.counted} data-testid="cd-history-row">
				<div class="who">
					<span class="reason">{t.isPayout ? 'Payout' : named.label}</span>
					<StatusChip
						tone={COIN_TYPE_TONES[type]}
						paths={COIN_TYPE_GLYPHS[type].paths}
						pathsName={COIN_TYPE_GLYPHS[type].name}
						label={t.isPayout ? 'Payout' : COIN_TXN_TYPE_LABELS[type]}
						data-type={type}
					/>
					{#if t.undone}
						<StatusChip tone="warn" glyph="undo" label="Undone" data-testid="cd-undone-chip" />
					{/if}
					{#if !t.counted}
						<StatusChip tone="neutral" label="Not counted" title="A physical coin row is history and does not count toward the balance." />
					{/if}
					{#if t.reverses}
						<StatusChip tone="neutral" glyph="undo" label="Undo of an older row" />
					{/if}
					{#if wasEdited(t)}
						<StatusChip tone="warn" label="Edited" data-testid="cd-edited-chip" />
					{/if}
				</div>
				<div class="meta">
					{#if t.note && !named.fromNote}<span class="note-text">{t.note}</span>{/if}
					<span class="since">{sinceLine(t)}</span>
				</div>
				<div class="actions">
					<span class="amount {amount.tone}" class:struck={t.undone}>{amount.text}</span>
					{#if edit && isEditable(t as DeskHistoryTxn) && editing !== t.id}
						<button
							type="button"
							class="btn secondary cdx-small"
							data-testid="cd-edit-amount"
							aria-label="Edit the amount of {t.category_name}"
							onclick={() => openEdit(t)}
						>
							Edit amount
						</button>
					{/if}
					{#if undoEdit && wasEdited(t) && !t.undone}
						{#if armedUndoEdit === t.id}
							<button
								type="button"
								class="btn cdx-small"
								data-testid="cd-undo-edit-confirm"
								disabled={busyId === t.id}
								onclick={() => confirmUndoEdit(t)}
							>
								{busyId === t.id ? 'Undoing…' : 'Confirm undo edit'}
							</button>
							<button type="button" class="btn secondary cdx-small" onclick={() => (armedUndoEdit = null)}>
								Keep
							</button>
						{:else}
							<button
								type="button"
								class="btn secondary cdx-small"
								data-testid="cd-undo-edit"
								onclick={() => {
									armedUndoEdit = t.id;
									rowError = null;
								}}
							>
								Undo edit
							</button>
						{/if}
					{/if}
					{#if reverse && isUndoable(t)}
						{#if armed === t.id}
							<button
								type="button"
								class="btn cdx-small"
								data-testid="cd-undo-confirm"
								disabled={busyId === t.id}
								onclick={() => confirmUndo(t)}
							>
								{busyId === t.id ? 'Undoing…' : `Confirm undo ${signedCoins(-num(t.amount))}`}
							</button>
							<button type="button" class="btn secondary cdx-small" onclick={() => (armed = null)}>
								Keep
							</button>
						{:else}
							<button
								type="button"
								class="btn secondary cdx-small"
								data-testid="cd-undo"
								onclick={() => {
									armed = t.id;
									rowError = null;
								}}
							>
								Undo
							</button>
						{/if}
					{/if}
				</div>
				{#if editsOf(t).length}
					<ul class="edits" data-testid="cd-edit-trail">
						{#each editsOf(t) as e, i (e.id ?? i)}
							<li class:undone-edit={e.undone}>{editLine(e)}</li>
						{/each}
					</ul>
				{/if}
				{#if editing === t.id}
					<div class="edit-form" data-testid="cd-edit-form">
						<label class="cdx-field">
							<span>New amount (signed: a fine is negative)</span>
							<input
								class="cdx-input"
								type="number"
								step="0.01"
								data-testid="cd-edit-value"
								bind:value={editValue}
							/>
						</label>
						<label class="cdx-field grow">
							<span>Why (optional)</span>
							<input class="cdx-input" type="text" maxlength="300" bind:value={editNote} />
						</label>
						<button
							type="button"
							class="btn cdx-small"
							data-testid="cd-edit-save"
							aria-disabled={!editReady || busyId === t.id}
							onclick={() => saveEdit(t)}
						>
							{busyId === t.id ? 'Saving…' : 'Save amount'}
						</button>
						<button type="button" class="btn secondary cdx-small" onclick={() => (editing = null)}>
							Cancel
						</button>
						<p class="cdx-note edit-hint">
							The history keeps the old value: an edit is a linked correction row, and Undo edit puts
							the old value back.
						</p>
					</div>
				{/if}
				{#if rowError?.id === t.id}
					<p class="cdx-feedback error row-error">{rowError.message}</p>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="cdx-note">{emptyMessage}</p>
{/if}

<style>
	.desk-rows {
		list-style: none;
		margin: 0.2rem 0 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.4rem 0.8rem;
		flex-wrap: wrap;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		min-width: 0;
		flex: 1 1 14rem;
	}
	.reason {
		font-weight: 700;
		color: var(--white);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
		flex: 1 1 12rem;
	}
	.note-text {
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
		overflow-wrap: anywhere;
	}
	.since {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-2, var(--dim));
	}
	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.row-error {
		flex-basis: 100%;
	}
	.edits {
		flex-basis: 100%;
		list-style: none;
		margin: 0;
		padding: 0 0 0 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2, var(--dim));
	}
	.edits .undone-edit {
		text-decoration: line-through;
	}
	.edit-form {
		flex-basis: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem;
	}
	.edit-form .grow {
		flex: 1 1 12rem;
	}
	.edit-hint {
		flex-basis: 100%;
		margin: 0;
	}
	.amount {
		font-family: var(--font-mono);
	}
	.amount.positive {
		color: var(--green);
	}
	.amount.negative,
	.amount.purchase {
		color: var(--amber);
	}
	.amount.adjustment {
		color: var(--violet-ink);
	}
	.amount.transfer {
		color: var(--cyan);
	}
	/* Undone is said in a word (the chip); the strike is the second signal. */
	.amount.struck {
		text-decoration: line-through;
		color: var(--text-2, var(--dim));
	}
	.row.uncounted .reason,
	.row.uncounted .amount {
		color: var(--text-2, var(--dim));
	}
	@media (max-width: 32rem) {
		.actions {
			margin-left: 0;
		}
	}
</style>
