<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		curriculumSectionOptions,
		parseEmailList,
		sectionDisplayName,
		type AssignResult,
		type CoinSectionRow,
		type CoinSectionStudentRow
	} from './sections';

	/**
	 * Section management: create/edit sections (reusing curriculum.ts's class
	 * list as the canonical id source, see sections.ts), archive them, and
	 * assign/remove students by email. Factored out of CoinDeskTool.svelte the
	 * same way it is factored out of /coin-desk, so a dev harness can mount
	 * this against a fake ledger too.
	 *
	 * `sections` is bindable: every mutation here refetches the list and
	 * writes it back up, so the bulk-log section picker in CoinDeskTool.svelte
	 * always reads the current roster/section state with no separate refresh
	 * wiring.
	 */
	let {
		supabase,
		sections = $bindable<CoinSectionRow[]>([]),
		configured = true
	}: {
		supabase: SupabaseClient;
		sections?: CoinSectionRow[];
		configured?: boolean;
	} = $props();

	async function refreshSections() {
		const resp = await supabase.rpc('coin_admin_list_sections');
		if (!resp.error) sections = (resp.data ?? []) as CoinSectionRow[];
	}

	// ---------------------------------------------------------------------
	// Add a section
	// ---------------------------------------------------------------------
	let addMode = $state<'curriculum' | 'custom'>('curriculum');
	let pickedCurriculumId = $state('');
	let customId = $state('');
	let customLabel = $state('');
	let newColor = $state('#00ff41');
	let newNote = $state('');
	let addBusy = $state(false);
	let addError = $state('');

	const availableCurriculumSections = $derived(
		curriculumSectionOptions(sections.map((s) => s.id))
	);

	function resetAddForm() {
		pickedCurriculumId = '';
		customId = '';
		customLabel = '';
		newColor = '#00ff41';
		newNote = '';
	}

	const canAddSection = $derived(
		addMode === 'curriculum' ? !!pickedCurriculumId : !!customId.trim() && !!customLabel.trim()
	);

	async function addSection() {
		if (!canAddSection) return;
		addError = '';
		addBusy = true;
		const id = addMode === 'curriculum' ? pickedCurriculumId : customId.trim();
		const label = addMode === 'curriculum' ? null : customLabel.trim();
		const resp = await supabase.rpc('coin_admin_upsert_section', {
			p_id: id,
			p_label: label,
			p_color: newColor || null,
			p_active: true,
			p_note: newNote.trim() || null
		});
		addBusy = false;
		if (resp.error) {
			addError = resp.error.message;
			return;
		}
		resetAddForm();
		await refreshSections();
	}

	// ---------------------------------------------------------------------
	// Edit / archive
	// ---------------------------------------------------------------------
	let editingId = $state<string | null>(null);
	let editLabel = $state('');
	let editColor = $state('#00ff41');
	let editNote = $state('');
	let editBusy = $state(false);
	let editError = $state('');

	function startEdit(s: CoinSectionRow) {
		editingId = s.id;
		editLabel = s.label ?? '';
		editColor = s.color ?? '#00ff41';
		editNote = s.note ?? '';
		editError = '';
	}

	async function saveEdit(s: CoinSectionRow) {
		editBusy = true;
		editError = '';
		const resp = await supabase.rpc('coin_admin_upsert_section', {
			p_id: s.id,
			p_label: editLabel.trim() || null,
			p_color: editColor || null,
			p_active: s.active,
			p_note: editNote.trim() || null
		});
		editBusy = false;
		if (resp.error) {
			editError = resp.error.message;
			return;
		}
		editingId = null;
		await refreshSections();
	}

	async function toggleActive(s: CoinSectionRow) {
		await supabase.rpc('coin_admin_upsert_section', {
			p_id: s.id,
			p_label: s.label,
			p_color: s.color,
			p_active: !s.active,
			p_note: s.note
		});
		await refreshSections();
	}

	// ---------------------------------------------------------------------
	// Roster
	// ---------------------------------------------------------------------
	let expandedId = $state<string | null>(null);
	let roster = $state<Record<string, CoinSectionStudentRow[]>>({});
	let rosterBusy = $state<Record<string, boolean>>({});
	let assignEmails = $state('');
	let assignBusy = $state(false);
	let assignError = $state('');
	let assignResults = $state<AssignResult[] | null>(null);

	async function loadRoster(id: string) {
		rosterBusy = { ...rosterBusy, [id]: true };
		const resp = await supabase.rpc('coin_admin_list_section_students', { p_section_id: id });
		rosterBusy = { ...rosterBusy, [id]: false };
		if (!resp.error) roster = { ...roster, [id]: (resp.data ?? []) as CoinSectionStudentRow[] };
	}

	async function toggleExpand(s: CoinSectionRow) {
		if (expandedId === s.id) {
			expandedId = null;
			return;
		}
		expandedId = s.id;
		assignEmails = '';
		assignError = '';
		assignResults = null;
		if (!roster[s.id]) await loadRoster(s.id);
	}

	async function removeStudent(sectionId: string, email: string) {
		await supabase.rpc('coin_admin_set_student_section', { p_email: email, p_section_id: null });
		await loadRoster(sectionId);
		await refreshSections();
	}

	const canAssign = $derived(parseEmailList(assignEmails).length > 0);

	async function assignStudents(sectionId: string) {
		const emails = parseEmailList(assignEmails);
		if (!emails.length) return;
		assignBusy = true;
		assignError = '';
		const resp = await supabase.rpc('coin_admin_assign_section_students', {
			p_section_id: sectionId,
			p_emails: emails
		});
		assignBusy = false;
		if (resp.error) {
			assignError = resp.error.message;
			return;
		}
		const data = resp.data as { results: AssignResult[] };
		assignResults = data.results;
		assignEmails = '';
		await loadRoster(sectionId);
		await refreshSections();
	}
</script>

<section class="card section-manager">
	<h2>Sections</h2>
	<p class="note">
		Sections mirror the 2026-27 curriculum (or a short custom group for a one-off roster) so the
		bulk logger below can target a whole class at once. Assignment is email-keyed, independent of
		login status, the same pattern the rest of the coin ledger uses.
	</p>

	{#if !configured}
		<p class="feedback error">
			Migration 0073 does not appear to be applied yet -- sections are unavailable. Apply it in
			the Supabase SQL editor, then reload this page.
		</p>
	{:else}
		{#if !sections.length}
			<p class="note">No sections yet. Add one below.</p>
		{/if}

		<div class="rows section-rows">
			{#each sections as s (s.id)}
				<div class="row section-row" class:archived={!s.active}>
					<div class="who">
						<span class="swatch" style={`background:${s.color ?? 'var(--dim)'}`}></span>
						<span class="email">{sectionDisplayName(s)}</span>
						{#if !s.active}<span class="tag archived-tag">Archived</span>{/if}
					</div>
					<div class="meta">
						<span class="since">
							{s.student_count} student{s.student_count === 1 ? '' : 's'}{s.note
								? ` · ${s.note}`
								: ''}
						</span>
					</div>
					<div class="actions">
						<button class="mini" onclick={() => toggleExpand(s)}>
							{expandedId === s.id ? 'close' : 'manage'}
						</button>
						<button class="mini" onclick={() => startEdit(s)}>edit</button>
						<button class="mini" onclick={() => toggleActive(s)}>
							{s.active ? 'archive' : 'reactivate'}
						</button>
					</div>
				</div>

				{#if editingId === s.id}
					<div class="sub-panel">
						{#if editError}<p class="feedback error">{editError}</p>{/if}
						<div class="field-row">
							<label for={`sec-label-${s.id}`}>Display label override (optional)</label>
							<input id={`sec-label-${s.id}`} type="text" maxlength="200" bind:value={editLabel} />
						</div>
						<div class="field-row color-row">
							<label for={`sec-color-${s.id}`}>Color</label>
							<input id={`sec-color-${s.id}`} type="color" bind:value={editColor} />
						</div>
						<div class="field-row">
							<label for={`sec-note-${s.id}`}>Note (optional)</label>
							<input id={`sec-note-${s.id}`} type="text" maxlength="200" bind:value={editNote} />
						</div>
						<div class="btn-row">
							<button class="btn secondary" disabled={editBusy} onclick={() => saveEdit(s)}>
								{editBusy ? 'Saving…' : 'Save'}
							</button>
							<button class="mini" onclick={() => (editingId = null)}>cancel</button>
						</div>
					</div>
				{/if}

				{#if expandedId === s.id}
					<div class="sub-panel">
						<h3>Roster</h3>
						{#if rosterBusy[s.id]}
							<p class="note">Loading&hellip;</p>
						{:else if roster[s.id]?.length}
							<div class="rows roster-rows">
								{#each roster[s.id] as r (r.student_email)}
									<div class="row">
										<div class="who">
											<span class="email">
												{r.display_name || r.full_name || r.student_email}
											</span>
										</div>
										<div class="meta">
											<span class="since">{r.student_email}</span>
										</div>
										<div class="actions">
											<button
												class="mini danger"
												onclick={() => removeStudent(s.id, r.student_email)}
											>
												remove
											</button>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="note">No students assigned yet.</p>
						{/if}

						<div class="assign-row">
							<label for={`assign-${s.id}`}>
								Add students (one email per line, or comma-separated)
							</label>
							<textarea
								id={`assign-${s.id}`}
								rows="3"
								placeholder="student1@boscotech.net, student2@boscotech.net"
								bind:value={assignEmails}
							></textarea>
							{#if assignError}<p class="feedback error">{assignError}</p>{/if}
							{#if assignResults}
								<p class="note">
									Assigned {assignResults.filter((r) => r.ok).length} of {assignResults.length}.
									{#if assignResults.some((r) => !r.ok)}
										Skipped (invalid email): {assignResults
											.filter((r) => !r.ok)
											.map((r) => r.email)
											.join(', ')}
									{/if}
								</p>
							{/if}
							<div class="btn-row">
								<button
									class="btn secondary"
									disabled={assignBusy || !canAssign}
									onclick={() => assignStudents(s.id)}
								>
									{assignBusy ? 'Adding…' : 'Add to section'}
								</button>
							</div>
						</div>
					</div>
				{/if}
			{/each}
		</div>

		<div class="sub-panel add-panel">
			<h3>Add a section</h3>
			{#if addError}<p class="feedback error">{addError}</p>{/if}
			<div class="mode-toggle">
				<button
					type="button"
					class:active={addMode === 'curriculum'}
					onclick={() => (addMode = 'curriculum')}
				>
					From curriculum
				</button>
				<button
					type="button"
					class:active={addMode === 'custom'}
					onclick={() => (addMode = 'custom')}
				>
					Custom group
				</button>
			</div>
			{#if addMode === 'curriculum'}
				<div class="field-row">
					<label for="curriculum-select">Class</label>
					<select id="curriculum-select" bind:value={pickedCurriculumId}>
						<option value="" disabled selected>Choose a class&hellip;</option>
						{#each availableCurriculumSections as c (c.id)}
							<option value={c.id}>{c.course} — {c.title} ({c.yearLabel})</option>
						{/each}
					</select>
					{#if !availableCurriculumSections.length}
						<p class="note">Every curriculum class already has a coin section.</p>
					{/if}
				</div>
			{:else}
				<div class="field-row">
					<label for="custom-id">Section id</label>
					<input
						id="custom-id"
						type="text"
						maxlength="100"
						bind:value={customId}
						placeholder="e.g. period-3-makeup"
					/>
				</div>
				<div class="field-row">
					<label for="custom-label">Display label</label>
					<input id="custom-label" type="text" maxlength="200" bind:value={customLabel} />
				</div>
			{/if}
			<div class="field-row color-row">
				<label for="new-color">Color</label>
				<input id="new-color" type="color" bind:value={newColor} />
			</div>
			<div class="field-row">
				<label for="new-note">Note (optional)</label>
				<input id="new-note" type="text" maxlength="200" bind:value={newNote} />
			</div>
			<div class="btn-row">
				<button class="btn" disabled={addBusy || !canAddSection} onclick={addSection}>
					{addBusy ? 'Adding…' : 'Add section'}
				</button>
			</div>
		</div>
	{/if}
</section>

<style>
	.note {
		color: var(--dim);
		font-size: 0.9rem;
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
	.rows {
		display: flex;
		flex-direction: column;
	}
	.section-rows {
		margin-top: 0.6rem;
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
	.section-row.archived {
		opacity: 0.55;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
	}
	.swatch {
		display: inline-block;
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 3px;
		border: 1px solid var(--line-strong);
		flex-shrink: 0;
	}
	.email {
		font-weight: 700;
		color: var(--white);
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}
	.archived-tag {
		color: var(--dim);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
		align-items: center;
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
	.add-panel {
		margin-top: 1rem;
	}
	.mode-toggle {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
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
	.field-row select {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.field-row input:focus,
	.field-row select:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.color-row input[type='color'] {
		width: 4rem;
		padding: 0.15rem;
		cursor: pointer;
	}
	.assign-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.7rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--line);
	}
	.assign-row label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.assign-row textarea {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		resize: vertical;
	}
	.btn-row {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
</style>
