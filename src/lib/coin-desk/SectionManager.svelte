<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		curriculumSectionOptions,
		termLabel,
		parseEmailList,
		sectionDisplayName,
		type AssignResult,
		type CoinSectionRow,
		type CoinSectionStudentRow
	} from './sections';
	import {
		buildRosterImportPlan,
		readCoinPlacement,
		samePlannedAdds,
		studentCount,
		type ClassRosterTransports,
		type RosterImportPlan
	} from './roster-import';
	import { sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
	import Pending from '$lib/Pending.svelte';

	/**
	 * Section management: create/edit sections (reusing curriculum.ts's class
	 * list as the canonical id source, see sections.ts), archive them, and
	 * assign/remove students by email. Its own component, so /coin-desk/students
	 * and the dev harness mount the identical thing.
	 *
	 * `sections` is bindable: every mutation here refetches the list and
	 * writes it back up. That used to feed the bulk-log section picker on the
	 * old single-page tool; since the route-group split each area loads its
	 * own copy, so the binding now only keeps THIS card's own list current.
	 */
	let {
		supabase,
		sections = $bindable<CoinSectionRow[]>([]),
		configured = true,
		classRoster
	}: {
		supabase: SupabaseClient;
		sections?: CoinSectionRow[];
		configured?: boolean;
		/**
		 * The classroom roster read behind "Import from class roster"
		 * (roster-import.ts). OPTIONAL, and its absence removes that control
		 * and nothing else.
		 */
		classRoster?: ClassRosterTransports;
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
		resetImport();
		if (classRoster && classes === null) void loadClasses();
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

	// ---------------------------------------------------------------------
	// Import from a class roster (roster-import.ts has the rules). Adds only;
	// it never removes anybody from this section or moves anybody out of
	// another one. Driven from event handlers, never an effect.
	// ---------------------------------------------------------------------
	let classes = $state<ClassroomSection[] | null>(null);
	let classesLoading = $state(false);
	let classesError = $state('');
	let importClassId = $state('');
	let importPlan = $state<RosterImportPlan | null>(null);
	let importPlanning = $state(false);
	let importBusy = $state(false);
	let importError = $state('');
	let importNotice = $state('');
	let importOutcome = $state<{
		plan: RosterImportPlan;
		className: string;
		added: string[];
		refused: AssignResult[];
	} | null>(null);
	/** Stale-answer guard: a slower preview for a class no longer chosen is dropped. */
	let importSeq = 0;

	/** A finished class is not somewhere a coin roster is filled from. */
	const importableClasses = $derived((classes ?? []).filter((c) => c.active !== false));

	function className(id: string): string {
		const c = classes?.find((x) => x.id === id);
		return c ? sectionTitle(c) : 'that class';
	}

	/**
	 * An ARCHIVED coin section says so: a student left in one is not paid when
	 * the active section is, and the name alone does not tell an admin that.
	 */
	function coinSectionName(id: string): string {
		const s = sections.find((x) => x.id === id);
		if (!s) return id;
		return s.active ? sectionDisplayName(s) : `${sectionDisplayName(s)}, archived`;
	}

	function resetImport() {
		importSeq++;
		importClassId = '';
		importPlan = null;
		importPlanning = false;
		importError = '';
		importNotice = '';
		importOutcome = null;
	}

	async function loadClasses() {
		if (!classRoster) return;
		classesLoading = true;
		classesError = '';
		try {
			const res = await classRoster.listClasses();
			if (res.ok) classes = res.data;
			else classesError = res.message;
		} catch (e) {
			classesError = (e as Error).message || 'Could not load the class list.';
		} finally {
			classesLoading = false;
		}
	}

	function planFor(classId: string, sectionId: string) {
		const transports = classRoster as ClassRosterTransports;
		return buildRosterImportPlan(
			{
				loadRoster: (id) => transports.loadRoster(id),
				readPlacement: (emails) => readCoinPlacement(supabase, emails)
			},
			classId,
			sectionId
		);
	}

	async function previewImport(sectionId: string) {
		const classId = importClassId;
		const seq = ++importSeq;
		importPlan = null;
		importError = '';
		importNotice = '';
		importOutcome = null;
		if (!classId || !classRoster) {
			importPlanning = false;
			return;
		}
		importPlanning = true;
		try {
			const res = await planFor(classId, sectionId);
			if (seq !== importSeq) return;
			if (res.ok) importPlan = res.data;
			else importError = res.message;
		} catch (e) {
			if (seq === importSeq) importError = (e as Error).message || 'Could not read that class roster.';
		} finally {
			if (seq === importSeq) importPlanning = false;
		}
	}

	async function runImport(sectionId: string) {
		const shown = importPlan;
		if (!shown || !shown.add.length || !classRoster || importBusy) return;
		const seq = ++importSeq;
		importBusy = true;
		importError = '';
		importNotice = '';
		try {
			// RE-PLANNED AT THE PRESS. The count on the button was true when it
			// was drawn; somebody may have moved a student since (the per-row
			// remove above, another tab). Writing a list nobody saw is refused.
			const fresh = await planFor(shown.classId, sectionId);
			if (seq !== importSeq) return;
			if (!fresh.ok) {
				importPlan = null;
				importError = fresh.message;
				return;
			}
			if (!samePlannedAdds(shown, fresh.data)) {
				importPlan = fresh.data;
				importNotice =
					'The class or this coin section changed since that count was worked out. Check the new count and press again.';
				return;
			}
			const resp = await supabase.rpc('coin_admin_assign_section_students', {
				p_section_id: sectionId,
				p_emails: fresh.data.add
			});
			// Past this point the write has been sent, so the roster is refreshed
			// whatever happens to the panel; only the words are guarded.
			if (resp.error) {
				if (seq === importSeq) importError = resp.error.message;
				return;
			}
			const results = ((resp.data as { results?: AssignResult[] } | null)?.results ?? []) as AssignResult[];
			if (seq === importSeq) {
				importOutcome = {
					plan: fresh.data,
					className: className(fresh.data.classId),
					added: results.filter((r) => r.ok).map((r) => r.email),
					refused: results.filter((r) => !r.ok)
				};
				importPlan = null;
			}
			await loadRoster(sectionId);
			await refreshSections();
		} catch (e) {
			if (seq === importSeq) importError = (e as Error).message || 'The import did not finish.';
		} finally {
			importBusy = false;
		}
	}

	/** "Jordan Kim (Engineering I Honors ...)", for the ones left where they are. */
	function elsewhereList(plan: RosterImportPlan): string {
		return plan.elsewhere
			.map((e) => `${plan.names.get(e.email) ?? e.email} (${coinSectionName(e.sectionId)})`)
			.join(', ');
	}

	/** The rows the import did not count, in one sentence, or '' when there were none. */
	function skippedLine(plan: RosterImportPlan): string {
		const parts: string[] = [];
		if (plan.managers) parts.push(`${plan.managers} ${plan.managers === 1 ? 'person who teaches' : 'people who teach'} the class`);
		if (plan.inactive) parts.push(`${plan.inactive} inactive enrollment${plan.inactive === 1 ? '' : 's'}`);
		if (plan.invalid) parts.push(`${plan.invalid} address${plan.invalid === 1 ? '' : 'es'} with no @`);
		return parts.length ? `Not counted: ${parts.join(', ')}.` : '';
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
						<button class="mini" data-testid="cd-section-manage" onclick={() => toggleExpand(s)}>
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
											<!-- Read-only look at this student's own coin
											     screens. Not impersonation: it renders the
											     student components from the admin-read RPCs
											     this session already holds, with every
											     mutating control removed. -->
											<a
												class="mini"
												href={`/coin-desk/preview?student=${encodeURIComponent(r.student_email)}`}
											>
												preview as student
											</a>
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

						{#if classRoster}
							<div class="import-row" data-testid="cd-roster-import">
								<label for={`import-class-${s.id}`}>Import from class roster</label>
								<p class="note">
									Adds a class's active students to this coin section. Nobody is removed, and a
									student already in another coin section stays there.
								</p>
								{#if classesLoading}
									<Pending label="Loading classes" />
								{:else if classesError}
									<p class="feedback error">{classesError}</p>
								{:else if classes !== null && !importableClasses.length}
									<p class="note">There are no active classes to import from.</p>
								{:else}
									<select
										id={`import-class-${s.id}`}
										class="import-select"
										data-testid="cd-roster-import-class"
										bind:value={importClassId}
										disabled={importBusy}
										onchange={(e) => {
											// Read off the event, so the preview never depends on
											// which of the binding and this handler ran first.
											importClassId = e.currentTarget.value;
											void previewImport(s.id);
										}}
									>
										<option value="">Choose a class&hellip;</option>
										{#each importableClasses as c (c.id)}
											<option value={c.id}>{sectionTitle(c)}</option>
										{/each}
									</select>
								{/if}

								{#if importPlanning}
									<Pending label="Reading that class roster" />
								{/if}
								{#if importError}
									<p class="feedback error" data-testid="cd-roster-import-error">{importError}</p>
								{/if}
								{#if importNotice}
									<p class="feedback notice">{importNotice}</p>
								{/if}

								{#if importPlan}
									<div class="import-plan" data-testid="cd-roster-import-plan">
										{#if importPlan.already.length}
											<p class="note">
												{studentCount(importPlan.already.length)} from this class
												{importPlan.already.length === 1 ? 'is' : 'are'} already in this coin section.
											</p>
										{/if}
										{#if importPlan.elsewhere.length}
											<p class="note">
												{studentCount(importPlan.elsewhere.length)}
												{importPlan.elsewhere.length === 1 ? 'is' : 'are'} in another coin section
												and will stay there: {elsewhereList(importPlan)}. To move one here, paste
												their address in the box above.
											</p>
										{/if}
										{#if skippedLine(importPlan)}
											<p class="note">{skippedLine(importPlan)}</p>
										{/if}
										{#if importPlan.add.length}
											<div class="btn-row">
												<button
													class="btn"
													data-testid="cd-roster-import-go"
													disabled={importBusy}
													onclick={() => runImport(s.id)}
												>
													{importBusy
														? 'Adding…'
														: `Add ${studentCount(importPlan.add.length)} from ${className(importPlan.classId)}`}
												</button>
											</div>
										{:else if importPlan.already.length || importPlan.elsewhere.length}
											<p class="note" data-testid="cd-roster-import-nothing">
												Nobody to add: every active student on this roster is already in a coin
												section.
											</p>
										{:else}
											<!-- No active student at all (an empty class, or only its
											     teachers and students who left): "already in a coin
											     section" would be a claim about nobody. -->
											<p class="note" data-testid="cd-roster-import-nothing">
												Nobody to add: this class roster has no active students.
											</p>
										{/if}
									</div>
								{/if}

								{#if importOutcome}
									<div class="import-outcome" role="status" data-testid="cd-roster-import-outcome">
										<p class="feedback ok">
											Added {studentCount(importOutcome.added.length)} from {importOutcome.className}.
										</p>
										{#if importOutcome.refused.length}
											<p class="feedback error">
												Refused: {importOutcome.refused
													.map((r) => `${r.email}${r.reason ? ` (${r.reason.replace(/_/g, ' ')})` : ''}`)
													.join(', ')}
											</p>
										{/if}
										{#if importOutcome.plan.already.length}
											<p class="note">
												{studentCount(importOutcome.plan.already.length)}
												{importOutcome.plan.already.length === 1 ? 'was' : 'were'} already in this coin
												section.
											</p>
										{/if}
										{#if importOutcome.plan.elsewhere.length}
											<p class="note">
												Left in their own coin section: {elsewhereList(importOutcome.plan)}.
											</p>
										{/if}
										{#if skippedLine(importOutcome.plan)}
											<p class="note">{skippedLine(importOutcome.plan)}</p>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
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
							<option value={c.id}>{c.course} — {c.title} ({c.yearLabel}, {termLabel(c)})</option>
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
		/* The preview control is an <a>, so the shared chrome has to hold for
		   a link as well as a button. */
		text-decoration: none;
		display: inline-block;
		line-height: 1.5;
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
	/* Import from class roster: the assign row's shape, one rule below it. */
	.import-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.7rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--line);
		min-width: 0;
	}
	.import-row > label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.import-row .note {
		margin: 0;
	}
	.import-select {
		background: var(--bg0);
		border: 1px solid var(--boundary, var(--line));
		border-radius: 4px;
		color: var(--white);
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
		/* A control somebody taps: the floor, never a height. */
		min-height: 44px;
		max-width: 100%;
	}
	.import-select:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.import-plan,
	.import-outcome {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}
	/* The count is on a button that owns its row; a long class name wraps
	   inside it rather than widening the page. */
	.import-plan .btn {
		white-space: normal;
		text-align: left;
		max-width: 100%;
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--green);
		margin-bottom: 0;
	}
	.feedback.notice {
		color: var(--cyan);
		border: 1px solid var(--cyan);
		margin-bottom: 0;
	}
</style>
