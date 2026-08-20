<script lang="ts">
	import {
		sectionName,
		sessionsInOrder,
		shortDate,
		type GridSession,
		type ReviewResult,
		type ReviewSection,
		type SessionInput
	} from '$lib/notebook-review';

	/**
	 * The section's scheduled check-ins: list, add, edit, delete, and (since
	 * 0098) which sections each one runs in.
	 *
	 * This has to exist for the grid to have columns at all -- before it there
	 * was no way to create a notebook_sessions row outside direct database
	 * access, so every section's grid was necessarily empty.
	 *
	 * MULTI-SECTION IS THE POINT OF THE FORM. Three sections on identical
	 * pacing used to mean creating the same check-in three times, with three
	 * chances to mistype the date. One canonical check-in posted to three
	 * sections is one date, edited once.
	 *
	 * Presentation + callbacks only (the Minimap / FrcReviewQueue convention):
	 * every callback carries a ready-made payload to its RPC and the parent
	 * refetches. Each RPC enforces its own tier inside the function -- and they
	 * are deliberately not the same tier (editing needs every section the
	 * check-in runs in; taking your OWN class off it needs only that section),
	 * so this component does no permission check of its own. A second copy of
	 * that rule is a copy that can drift.
	 */
	let {
		sectionId,
		sections,
		sessions,
		onSave,
		onDelete,
		onAddSections,
		onRemoveSection
	}: {
		sectionId: string;
		/** Every section the caller manages -- what a check-in may be posted to. */
		sections: ReviewSection[];
		sessions: GridSession[];
		onSave: (input: SessionInput) => Promise<ReviewResult<{ session_id: string }>>;
		onDelete: (sessionId: string) => Promise<ReviewResult<{ detached_entries: number }>>;
		onAddSections: (
			sessionId: string,
			sectionIds: string[]
		) => Promise<ReviewResult<{ added: number }>>;
		onRemoveSection: (
			sessionId: string,
			sectionId: string
		) => Promise<
			ReviewResult<{ ok: boolean; reason?: string; detached_entries?: number; remaining?: number }>
		>;
	} = $props();

	const ordered = $derived(sessionsInOrder(sessions));

	/** The sections a check-in runs in, falling back to the one being viewed. */
	function postedTo(session: GridSession): string[] {
		return session.section_ids?.length ? session.section_ids : [sectionId];
	}

	function nameOf(id: string): string {
		const found = sections.find((s) => s.id === id);
		return found ? sectionName(found) : 'Another section';
	}

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
	/**
	 * Which sections a NEW check-in runs in. Only the add form offers this: an
	 * edit sends the current set unchanged, so the upsert's reconcile can never
	 * unpost a class as a side effect of fixing a typo. Adding and removing are
	 * their own actions on the row, where the consequence can be stated.
	 */
	let newSections = $state<string[]>([]);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let notice = $state<string | null>(null);
	/** Two-step delete confirm (the gauntlet-room / SectionManager pattern). */
	let confirmDelete = $state<string | null>(null);
	/** Which session's "posted to" panel is open, if any. */
	let managing = $state<string | null>(null);
	/** Two-step confirm on an unpost, since it detaches that class's entries. */
	let confirmRemove = $state<string | null>(null);
	/** Sections ticked in the open panel's "add a class" list. */
	let addSections = $state<string[]>([]);

	function toggle(list: string[], id: string): string[] {
		return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
	}

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
		// The section being viewed, and only that one: adding classes is a
		// decision, never a default.
		newSections = [sectionId];
	}

	function openEdit(session: GridSession) {
		editing = session.id;
		errorMsg = null;
		unitNumber = String(session.unit_number);
		sessionDate = session.session_date;
		sessionLabel = session.session_label;
		newSections = postedTo(session);
	}

	function close() {
		editing = null;
		errorMsg = null;
	}

	const unitText = $derived(String(unitNumber ?? '').trim());
	const unitValid = $derived(
		/^\d+$/.test(unitText) && Number(unitText) >= 0 && Number(unitText) <= 1000
	);
	const canSave = $derived(
		unitValid && sessionDate !== '' && sessionLabel.trim() !== '' && newSections.length > 0
	);

	async function save() {
		if (busy || !canSave || editing === null) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const creating = editing === 'new';
		const result = await onSave({
			id: creating ? null : editing,
			section_ids: newSections,
			unit_number: Number(unitText),
			session_date: sessionDate,
			session_label: sessionLabel.trim()
		});
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		notice = creating
			? newSections.length > 1
				? `Check-in added to ${newSections.length} classes.`
				: 'Check-in added.'
			: 'Check-in updated everywhere it runs.';
		close();
	}

	function openManage(session: GridSession) {
		managing = managing === session.id ? null : session.id;
		confirmRemove = null;
		addSections = [];
		errorMsg = null;
	}

	async function addTo(session: GridSession) {
		if (busy || addSections.length === 0) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onAddSections(session.id, addSections);
		busy = false;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		const n = result.value.added;
		notice = `Now also running in ${n} more ${n === 1 ? 'class' : 'classes'}.`;
		addSections = [];
	}

	async function removeFrom(session: GridSession, id: string) {
		if (busy) return;
		busy = true;
		errorMsg = null;
		notice = null;
		const result = await onRemoveSection(session.id, id);
		busy = false;
		confirmRemove = null;
		if (!result.ok) {
			errorMsg = result.error;
			return;
		}
		if (!result.value.ok) {
			errorMsg =
				result.value.reason === 'last_posting'
					? 'This is the only class it runs in. Delete the check-in instead.'
					: 'That class could not be removed.';
			return;
		}
		const n = result.value.detached_entries ?? 0;
		notice =
			n === 0
				? `Removed from ${nameOf(id)}.`
				: `Removed from ${nameOf(id)}. ${n} ${n === 1 ? 'entry was' : 'entries were'} kept and relabelled.`;
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
				below. A check-in can run in several classes at once: schedule it once and every class
				it runs in gets the same date and label.
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
							{#if postedTo(session).length > 1}
								<span class="shared">in {postedTo(session).length} classes</span>
							{/if}
						</div>
						<div class="session-actions">
							{#if confirmDelete === session.id}
								<!-- The sibling "remove from one class" confirm has always
							     said what happens to the work; this one, which takes
							     the check-in off EVERY class it runs in, said only
							     "Delete this check-in?" -- so the more destructive of
							     the two read as the safer. -->
							<span class="confirm-hint">
								Delete it from {postedTo(session).length > 1
									? `all ${postedTo(session).length} classes`
									: 'this class'}? Entries already filed against it are kept and relabelled.
							</span>
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
								<button
									type="button"
									class="btn secondary"
									aria-expanded={managing === session.id}
									onclick={() => openManage(session)}>Classes</button
								>
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
						{#if managing === session.id}
							{@const posted = postedTo(session)}
							{@const available = sections.filter((s) => !posted.includes(s.id))}
							<div class="posted-panel">
								<h4>Runs in</h4>
								<ul class="posted-list">
									{#each posted as id (id)}
										<li>
											<span class="posted-name">{nameOf(id)}</span>
											{#if !sections.some((s) => s.id === id)}
												<!-- Another teacher's class. They own the decision to
												     take it off, and the RPC refuses anyone else, so
												     there is no control to offer here. -->
												<span class="note">not yours to remove</span>
											{:else if confirmRemove === id}
												<span class="confirm-hint">
													Remove it from this class? Entries already filed against it are kept
													and relabelled.
												</span>
												<button
													type="button"
													class="btn danger"
													onclick={() => removeFrom(session, id)}
													disabled={busy}>Yes, remove</button
												>
												<button
													type="button"
													class="btn secondary"
													onclick={() => (confirmRemove = null)}>Cancel</button
												>
											{:else}
												<button
													type="button"
													class="btn secondary"
													onclick={() => (confirmRemove = id)}
													disabled={busy}>Remove</button
												>
											{/if}
										</li>
									{/each}
								</ul>

								{#if available.length === 0}
									<p class="note">It already runs in every class you teach.</p>
								{:else}
									<h4>Add a class</h4>
									<div class="section-picker">
										{#each available as s (s.id)}
											<label class="check">
												<input
													type="checkbox"
													checked={addSections.includes(s.id)}
													onchange={() => (addSections = toggle(addSections, s.id))}
												/>
												<span>{sectionName(s)}</span>
											</label>
										{/each}
									</div>
									<button
										type="button"
										class="btn"
										onclick={() => addTo(session)}
										disabled={busy || addSections.length === 0}
									>
										{busy ? 'Working...' : 'Add'}
									</button>
								{/if}
							</div>
						{/if}
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
		{#if editing === 'new'}
			<fieldset class="section-field">
				<legend>Classes</legend>
				<div class="section-picker">
					{#each sections as s (s.id)}
						<label class="check">
							<input
								type="checkbox"
								checked={newSections.includes(s.id)}
								onchange={() => (newSections = toggle(newSections, s.id))}
							/>
							<span>{sectionName(s)}</span>
						</label>
					{/each}
				</div>
				<p class="note">
					One check-in, one date, in every class you tick. Editing it later changes all of them.
				</p>
			</fieldset>
		{:else}
			<p class="note">
				This edit applies in every class this check-in runs in. Use <strong>Classes</strong> on
				the row to add or remove one.
			</p>
		{/if}
		<div class="form-actions">
			<button type="button" class="btn" onclick={save} disabled={busy || !canSave}>
				{busy ? 'Saving...' : 'Save'}
			</button>
			<button type="button" class="btn secondary" onclick={close} disabled={busy}>Cancel</button>
			{#if !unitValid && unitText !== ''}
				<span class="hint">Unit must be a whole number from 0 to 1000.</span>
			{/if}
			{#if newSections.length === 0}
				<span class="hint">Tick at least one class.</span>
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
		gap: var(--space-4);
	}
	.sessions-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.sessions-head h2 {
		margin: 0;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
		margin: var(--space-1) 0 0;
	}
	.empty {
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.session-list {
		list-style: none;
		display: grid;
		gap: var(--space-2);
	}
	.session-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.session-main {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.unit {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
		white-space: nowrap;
	}
	.label {
		color: var(--text-1);
		font-weight: 500;
	}
	.date {
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}
	.shared {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--nb-accent-ink);
		white-space: nowrap;
	}
	.session-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.posted-panel {
		/* A row is a wrapping flex line; the panel is a block under it. */
		width: 100%;
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
	.posted-panel h4 {
		margin: 0;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.posted-list {
		list-style: none;
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
	}
	.posted-list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.posted-name {
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.section-field {
		border: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.section-field legend {
		padding: 0;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.section-picker {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.9rem;
		color: var(--text-1);
		/* A 44px tap target on a phone without moving the label off the line. */
		min-height: 2.75rem;
	}
	.check input {
		width: 1.05rem;
		height: 1.05rem;
		accent-color: var(--nb-accent-ink);
	}
	.confirm-hint {
		font-size: 0.8rem;
		color: var(--nb-warn);
	}
	.session-form {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		width: 100%;
	}
	.session-form h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.form-grid {
		display: grid;
		grid-template-columns: 6rem 11rem 1fr;
		gap: var(--space-3);
	}
	.field {
		display: grid;
		gap: var(--space-1);
	}
	.field span {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.field input {
		width: 100%;
		padding: var(--space-2);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		color: var(--text-1);
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
		gap: var(--space-2);
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
		background: var(--surface-1);
		border-color: var(--nb-error);
		color: var(--nb-error);
	}
	.btn.danger:hover {
		background: var(--nb-error);
		border-color: var(--nb-error);
		color: var(--surface-1);
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
