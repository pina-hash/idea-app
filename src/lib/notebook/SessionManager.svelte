<script lang="ts">
	import { sessionsInOrder, shortDate, type GridSession, type ReviewResult, type SessionInput } from '$lib/notebook-review';

	/**
	 * The section's scheduled check-ins: list, add, edit, delete.
	 *
	 * This has to exist for the grid to have columns at all -- before it there
	 * was no way to create a notebook_sessions row outside direct database
	 * access, so every section's grid was necessarily empty.
	 *
	 * Presentation + callbacks only (the Minimap / FrcReviewQueue convention):
	 * `onSave` and `onDelete` carry a ready-made payload to
	 * `notebook_admin_upsert_session` / `notebook_admin_delete_session`, and
	 * the parent refetches. Both RPCs allow the section's own instructor OR a
	 * site admin, enforced inside the function; this component does no
	 * permission check of its own, because a second copy of that rule is a
	 * copy that can drift.
	 */
	let {
		sectionId,
		sessions,
		onSave,
		onDelete
	}: {
		sectionId: string;
		sessions: GridSession[];
		onSave: (input: SessionInput) => Promise<ReviewResult<{ session_id: string }>>;
		onDelete: (sessionId: string) => Promise<ReviewResult<{ detached_entries: number }>>;
	} = $props();

	const ordered = $derived(sessionsInOrder(sessions));

	/** null = closed, 'new' = the add form, otherwise the session being edited. */
	let editing = $state<string | null>(null);
	/**
	 * `string | number` on purpose: `bind:value` on `<input type="number">`
	 * COERCES, so this holds a number once the field is edited (and null when
	 * it is cleared) even though it is seeded with a string. Treating it as a
	 * string threw `.trim is not a function` and silently wedged the Save
	 * button; everything below goes through `unitText` instead.
	 */
	let unitNumber = $state<string | number | null>('');
	let sessionDate = $state('');
	let sessionLabel = $state('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let notice = $state<string | null>(null);
	/** Two-step delete confirm (the gauntlet-room / SectionManager pattern). */
	let confirmDelete = $state<string | null>(null);

	function todayIso(): string {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	}

	function openNew() {
		editing = 'new';
		errorMsg = null;
		// Carry the most recent session's unit forward: a run of check-ins
		// almost always belongs to the same unit, and retyping it every time
		// is the sort of friction that gets a tool abandoned.
		unitNumber = ordered.length ? String(ordered[ordered.length - 1].unit_number) : '1';
		sessionDate = todayIso();
		sessionLabel = '';
	}

	function openEdit(session: GridSession) {
		editing = session.id;
		errorMsg = null;
		unitNumber = String(session.unit_number);
		sessionDate = session.session_date;
		sessionLabel = session.session_label;
	}

	function close() {
		editing = null;
		errorMsg = null;
	}

	const unitText = $derived(String(unitNumber ?? '').trim());
	const unitValid = $derived(
		/^\d+$/.test(unitText) && Number(unitText) >= 0 && Number(unitText) <= 1000
	);
	const canSave = $derived(unitValid && sessionDate !== '' && sessionLabel.trim() !== '');

	async function save() {
		if (busy || !canSave || editing === null) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onSave({
			id: editing === 'new' ? null : editing,
			section_id: sectionId,
			unit_number: Number(unitText),
			session_date: sessionDate,
			session_label: sessionLabel.trim()
		});
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		notice = editing === 'new' ? 'Check-in added.' : 'Check-in updated.';
		close();
	}

	async function remove(session: GridSession) {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onDelete(session.id);
		busy = false;
		confirmDelete = null;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		const n = result.value.detached_entries;
		notice =
			n === 0
				? 'Check-in deleted.'
				: `Check-in deleted. ${n} ${n === 1 ? 'entry was' : 'entries were'} kept and relabelled.`;
	}
</script>

<section class="card sessions">
	<header class="sessions-head">
		<div>
			<h2>Check-ins</h2>
			<p class="note">
				The scheduled notebook check-ins for this section. Each one becomes a column in the grid
				below.
			</p>
		</div>
		{#if editing !== 'new'}
			<button type="button" class="btn" onclick={openNew} disabled={busy}>Add check-in</button>
		{/if}
	</header>

	{#if errorMsg}
		<p class="msg error" role="alert">{errorMsg}</p>
	{/if}
	{#if notice}
		<p class="msg ok">{notice}</p>
	{/if}

	{#if editing === 'new'}
		{@render form('Add a check-in')}
	{/if}

	{#if ordered.length === 0}
		<p class="empty">
			No check-ins scheduled yet. Add one and every student in this section gets a column for it.
		</p>
	{:else}
		<ul class="session-list">
			{#each ordered as session (session.id)}
				<li class="session-row">
					{#if editing === session.id}
						{@render form('Edit check-in')}
					{:else}
						<div class="session-main">
							<span class="unit">Unit {session.unit_number}</span>
							<span class="label">{session.session_label}</span>
							<span class="date">{shortDate(session.session_date)}</span>
						</div>
						<div class="session-actions">
							{#if confirmDelete === session.id}
								<span class="confirm-hint">Delete this check-in?</span>
								<button
									type="button"
									class="btn danger"
									onclick={() => remove(session)}
									disabled={busy}>Yes, delete</button
								>
								<button type="button" class="btn secondary" onclick={() => (confirmDelete = null)}>
									Cancel
								</button>
							{:else}
								<button type="button" class="btn secondary" onclick={() => openEdit(session)}>
									Edit
								</button>
								<button
									type="button"
									class="btn secondary"
									onclick={() => (confirmDelete = session.id)}>Delete</button
								>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#snippet form(title: string)}
	<div class="session-form">
		<h3>{title}</h3>
		<div class="form-grid">
			<label class="field">
				<span>Unit</span>
				<input type="number" min="0" max="1000" bind:value={unitNumber} />
			</label>
			<label class="field">
				<span>Date</span>
				<input type="date" bind:value={sessionDate} />
			</label>
			<label class="field wide">
				<span>Label</span>
				<input
					type="text"
					maxlength="200"
					placeholder="Bearing teardown"
					bind:value={sessionLabel}
				/>
			</label>
		</div>
		<div class="form-actions">
			<button type="button" class="btn" onclick={save} disabled={busy || !canSave}>
				{busy ? 'Saving...' : 'Save'}
			</button>
			<button type="button" class="btn secondary" onclick={close} disabled={busy}>Cancel</button>
			{#if !unitValid && unitText !== ''}
				<span class="hint">Unit must be a whole number from 0 to 1000.</span>
			{/if}
		</div>
		<p class="note">
			Deleting a check-in never deletes work: entries filed against it are kept and relabelled with
			its name.
		</p>
	</div>
{/snippet}

<style>
	.sessions {
		display: grid;
		gap: 0.9rem;
	}
	.sessions-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.sessions-head h2 {
		margin: 0;
	}
	.note {
		color: var(--nb-ink-soft);
		font-size: 0.85rem;
		margin: 0.2rem 0 0;
	}
	.empty {
		color: var(--nb-ink-soft);
		font-size: 0.9rem;
	}
	.session-list {
		list-style: none;
		display: grid;
		gap: 0.4rem;
	}
	.session-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
	}
	.session-main {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.unit {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--nb-ink-faint);
		white-space: nowrap;
	}
	.label {
		color: var(--nb-ink);
		font-weight: 500;
	}
	.date {
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.session-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.confirm-hint {
		font-size: 0.8rem;
		color: var(--nb-warn);
	}
	.session-form {
		display: grid;
		gap: 0.7rem;
		padding: 0.9rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
		width: 100%;
	}
	.session-form h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.form-grid {
		display: grid;
		grid-template-columns: 6rem 11rem 1fr;
		gap: 0.7rem;
	}
	.field {
		display: grid;
		gap: 0.25rem;
	}
	.field span {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--nb-ink-faint);
	}
	.field input {
		width: 100%;
		padding: 0.45rem 0.55rem;
		background: var(--nb-surface);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--nb-radius-control);
		color: var(--nb-ink);
		font-family: inherit;
		font-size: 0.95rem;
	}
	.field input:focus {
		outline: none;
		border-color: var(--nb-accent);
	}
	.form-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.hint {
		font-size: 0.8rem;
		color: var(--nb-warn);
	}
	.msg {
		margin: 0;
		font-size: 0.88rem;
	}
	.msg.error {
		color: var(--nb-error);
	}
	.msg.ok {
		color: var(--nb-ok);
	}
	.btn.danger {
		background: var(--nb-surface);
		border-color: var(--nb-error);
		color: var(--nb-error);
	}
	.btn.danger:hover {
		background: var(--nb-error);
		border-color: var(--nb-error);
		color: var(--nb-surface);
		box-shadow: none;
		text-shadow: none;
	}

	@media (max-width: 640px) {
		.form-grid {
			grid-template-columns: 1fr 1fr;
		}
		.field.wide {
			grid-column: 1 / -1;
		}
	}
</style>
