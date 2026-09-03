<script lang="ts">
	import { untrack } from 'svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		enrollmentWorkSummary,
		importReasonLabel,
		parseSectionRosterCsv,
		sectionDeleteBlockedLabel,
		sectionTitle,
		splitRoster,
		type ClassroomEnrollment,
		type ClassroomPeopleTransports,
		type ClassroomSection,
		type ImportSummary
	} from '$lib/classroom/classroom';
	import {
		CELL_STATES,
		completionLabel,
		gridSummary,
		type GridSummary,
		type ReviewTransports
	} from '$lib/notebook-review';
	import { formatSectionLabel } from '$lib/section-label';
	import Pending from '$lib/Pending.svelte';
	import {
		classEmailList,
		classEmailRecipients,
		mailtoPlan,
		mailtoPlanNote,
		rosterCsv,
		rosterCsvFilename
	} from '$lib/classroom/roster-export';
	import {
		pickerDrawNote,
		pickerOne,
		pickerPool,
		pickerSeedFrom,
		pickerShuffle,
		pickerTeams,
		type PickerCandidate
	} from '$lib/classroom/picker';

	/**
	 * ONE class's people and settings: the roster (add, correct, deactivate, CSV
	 * import) and what the class itself IS (label, block, teacher of record,
	 * archive, delete).
	 *
	 * THIS IS WHERE THE MANAGE CONSOLE WENT. Both of these used to live on a
	 * separate page listing every class a teacher runs, behind an accordion --
	 * so changing one class's roster meant leaving that class, finding it in a
	 * list, and opening a panel. Managing a class is now done standing in it.
	 *
	 * Presentation + injected transports (the ReviewConsole convention). Nothing
	 * here is a boundary: the route 404s a non-manager, and every RPC behind these
	 * controls re-checks teacher-of-record itself.
	 */
	let {
		section,
		roster = [],
		removalReady = false,
		transports,
		loadNotebookGrid = null,
		onchanged = null,
		ondeleted = null
	}: {
		section: ClassroomSection;
		roster?: ClassroomEnrollment[];
		/**
		 * Did the roster come back off the 0138 rung, so `manages` is real and
		 * `classroom_remove_enrollment` exists to be called?
		 *
		 * DEFAULTS FALSE, which is the fail-closed direction: a caller that has
		 * not asked gets the panel exactly as it was before this bundle, rather
		 * than a Remove control that would answer PGRST202 and a status chip
		 * asserting nobody manages the class.
		 */
		removalReady?: boolean;
		transports: ClassroomPeopleTransports;
		/**
		 * The notebook's own grid read, for the compliance element below (0099).
		 *
		 * It CAME WITH THE ROSTER out of the retired console: "how is this class
		 * doing on its notebook" is a question about these students, so it belongs
		 * on the page that lists them. Deliberately the SAME signature the review
		 * console's `ReviewTransports['loadGrid']` has, wired to the same
		 * `notebook_get_section_grid` -- there is no second grid query and no
		 * second copy of who may run one (that RPC asks
		 * `classroom_manages_section` itself). Null omits the element, which is the
		 * fail-soft state where the notebook migrations are not applied.
		 */
		loadNotebookGrid?: ReviewTransports['loadGrid'] | null;
		onchanged?: (() => void | Promise<void>) | null;
		/**
		 * Deleting the class removes the page under your feet, so the caller
		 * navigates instead of reloading a load that would now 404. A REFUSED
		 * delete (the designed `not_empty` path) never calls this.
		 */
		ondeleted?: (() => void | Promise<void>) | null;
	} = $props();

	type Msg = { ok: boolean; text: string } | null;

	let busy = $state(false);
	let msg = $state<Msg>(null);

	// --- Class settings ---------------------------------------------------
	let editingSection = $state(false);
	// Seeded by startEditSection, which is the only thing that opens the form --
	// so these never hold a stale copy of a section that reloaded underneath.
	let editLabel = $state('');
	let editBlock = $state('');
	let editTeacher = $state('');
	let armSectionDelete = $state(false);
	let deleteConfirmText = $state('');
	let deleteBlocked = $state<string | null>(null);

	function startEditSection() {
		editingSection = !editingSection;
		editLabel = section.label;
		editBlock = section.block ?? '';
		editTeacher = section.teacher_email;
		msg = null;
	}

	async function saveSection() {
		if (busy) return;
		busy = true;
		const res = await transports.upsertSection(
			section.course_id,
			editLabel,
			editBlock.trim() || null,
			section.id,
			editTeacher.trim().toLowerCase() || null
		);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		editingSection = false;
		msg = { ok: true, text: 'Class saved.' };
		await onchanged?.();
	}

	async function toggleActive() {
		if (busy) return;
		busy = true;
		const res = await transports.setSectionActive(section.id, section.active === false);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		msg = { ok: true, text: section.active === false ? 'Class reactivated.' : 'Class archived.' };
		await onchanged?.();
	}

	/**
	 * Two-step, and the second step is a TYPED label -- mirrored from the RPC,
	 * which enforces it server-side, so the button can never be enabled on input
	 * the database would reject.
	 */
	async function confirmDelete() {
		if (busy) return;
		busy = true;
		deleteBlocked = null;
		const res = await transports.deleteSection(section.id, deleteConfirmText);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		if (res.data.ok === false) {
			// The designed path, not an error: a class holding real work is never
			// deleted. Say what would have been lost and point at archiving.
			deleteBlocked = sectionDeleteBlockedLabel(res.data);
			return;
		}
		msg = { ok: true, text: 'Class deleted.' };
		await ondeleted?.();
	}

	// --- Roster -----------------------------------------------------------
	let addEmail = $state('');
	let addName = $state('');
	let editEmail = $state<string | null>(null);
	let newEmail = $state('');
	let newName = $state('');

	const active = $derived(roster.filter((e) => e.active));
	const inactive = $derived(roster.filter((e) => !e.active));
	/**
	 * The hero's count, THROUGH THE REAL SPLIT.
	 *
	 * It used to be `active.length`, which on a roster carrying the teacher's
	 * own enrollment reads 25 while the Grades tab beside it reads 24 -- two
	 * numbers for one class, with nothing on either page to say why. This page
	 * still LISTS every row, because the manager row is the one somebody came
	 * here to remove; it just stops calling them all students.
	 */
	const activeSplit = $derived(splitRoster(active));

	/**
	 * REMOVAL: the first path this schema has ever had for taking an enrollment
	 * OFF a class rather than archiving it (0138).
	 *
	 * IT IS OFFERED ONLY WHEN BOTH HALVES ARE THERE. The transport is optional,
	 * so its absence removes the control down through this panel the way every
	 * other write here works; `removalReady` is the other half, and says the
	 * database has the RPC at all. One derived predicate, read by the control
	 * AND by the handler, because two spellings of "can this be pressed" is
	 * what produces a click that does nothing.
	 */
	const canRemove = $derived(removalReady && typeof transports.removeEnrollment === 'function');

	// -----------------------------------------------------------------------
	// CLASS TOOLS: the roster out of the page, the class into a mail draft, and
	// a draw. All three read the rows this panel already holds -- there is no
	// second load, no new transport and no new gate, because there is nothing
	// here the instructor is not already looking at.
	//
	// ONE CARD AND ONE OPEN PANEL AT A TIME. This page is read standing up with
	// a class in front of you, so three stacked disclosures would push the
	// roster off the screen for the sake of tools used once a lesson. The three
	// controls are one row; opening one closes the others.
	// -----------------------------------------------------------------------

	type Tool = 'export' | 'email' | 'picker';
	let tool = $state<Tool | null>(null);
	function toggleTool(next: Tool) {
		tool = tool === next ? null : next;
	}

	/**
	 * The download. `<a download>` on a blob URL, revoked after the click -- the
	 * `FeedbackConsole` shape, and for the same reason: a server round trip
	 * would only re-derive rows this page already has.
	 */
	function downloadCsv() {
		if (typeof document === 'undefined') return;
		const text = rosterCsv(section, roster);
		const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = rosterCsvFilename(section, Date.now());
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		msg = { ok: true, text: `Exported ${roster.length} row${roster.length === 1 ? '' : 's'}.` };
	}

	// --- Email the class ---------------------------------------------------
	let mailSubject = $state('');
	let copiedList = $state(false);
	const recipients = $derived(classEmailRecipients(roster));
	const mailPlan = $derived(mailtoPlan(recipients, mailSubject));

	async function copyAddresses() {
		const text = classEmailList(recipients);
		try {
			await navigator.clipboard.writeText(text);
			copiedList = true;
		} catch {
			// A refused clipboard is not a failure worth a red message: the list
			// is rendered as selectable text right beside the control, which is
			// the fallback anybody reaches for anyway.
			copiedList = false;
			msg = { ok: false, text: 'Could not copy. Select the list below instead.' };
		}
	}

	// --- The picker --------------------------------------------------------
	//
	// THE SEED IS HELD HERE AND NOWHERE ELSE. Every draw is a pure function of
	// (names, seed), so a re-render -- a save landing, a resize, a navigation
	// back -- cannot change an answer the teacher has already read out. A new
	// draw is a new seed, deliberately pressed.
	let seed = $state(0);
	let teamSize = $state(3);
	let absent = $state(new Set<string>());
	let drawn = $state(false);

	const candidates = $derived<PickerCandidate[]>(
		activeSplit.students.map((e) => ({
			email: e.student_email,
			name: e.display_name || e.student_email.split('@')[0]
		}))
	);
	const pool = $derived(pickerPool(candidates, absent));
	const drawNote = $derived(pickerDrawNote(seed, pool));
	const order = $derived(drawn ? pickerShuffle(pool.included, seed) : []);
	const teams = $derived(drawn ? pickerTeams(pool.included, teamSize, seed) : []);
	const chosen = $derived(drawn ? pickerOne(pool.included, seed) : null);

	function draw() {
		// `Math.random` is read HERE, once, and never inside the draw itself --
		// which is what keeps every figure on screen reproducible from the seed
		// printed beside it.
		seed = pickerSeedFrom(Math.random());
		drawn = true;
	}

	function toggleAbsent(email: string) {
		const next = new Set(absent);
		if (next.has(email)) next.delete(email);
		else next.add(email);
		absent = next;
	}

	/** The row whose Remove is armed. Only ever one, and never across a reload. */
	let armedRemoval = $state<string | null>(null);
	/**
	 * A refusal, held against the row it belongs to. IN PLACE rather than in
	 * `msg` at the top of the page: the counts are about ONE person, and the
	 * alternative action they point at is that person's own Deactivate.
	 */
	let removalRefusal = $state<{ email: string; text: string } | null>(null);

	function armRemoval(e: ClassroomEnrollment) {
		armedRemoval = armedRemoval === e.student_email ? null : e.student_email;
		removalRefusal = null;
		msg = null;
	}

	async function confirmRemoval(e: ClassroomEnrollment) {
		const remove = transports.removeEnrollment;
		if (busy || !canRemove || !remove) return;
		busy = true;
		msg = null;
		removalRefusal = null;
		const res = await remove(section.id, e.student_email);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		if (res.data.ok === false) {
			armedRemoval = null;
			removalRefusal = {
				email: e.student_email,
				text:
					res.data.reason === 'work_attached'
						? `Not removed. ${enrollmentWorkSummary(res.data.counts)} in this class ${
								res.data.total === 1 ? 'is' : 'are'
							} attached to this enrollment, and deleting it would strand ${
								res.data.total === 1 ? 'that' : 'those'
							}.${
								// Only when an entry is actually in the count. Explaining the bin
								// beside a refusal that has nothing to do with it reads as a
								// non sequitur, and the reader goes looking for a deleted entry
								// that is not there.
								res.data.counts.notebook_entries > 0
									? ' A notebook entry in the bin still counts, because it can be restored.'
									: ''
							}`
						: 'Not removed. That enrollment is already gone from this class.'
			};
			await onchanged?.();
			return;
		}
		armedRemoval = null;
		msg = { ok: true, text: `${e.student_email} removed from this class.` };
		await onchanged?.();
	}

	/**
	 * The row's own status, in words. Colour is never the only signal here, so
	 * the chip carries the sentence and the class only tints it.
	 *
	 * MANAGING OUTRANKS ENROLLED, because it is the fact that explains why this
	 * row does not appear on the check-in grid, in the grading roster or in the
	 * FACTS export. Somebody reading this page after looking for that name
	 * somewhere else is asking exactly this question.
	 */
	function rosterStatus(e: ClassroomEnrollment): { label: string; tone: 'manager' | 'on' | 'off' } {
		if (e.manages === true) return { label: 'Manages this class', tone: 'manager' };
		if (e.active) return { label: 'Enrolled', tone: 'on' };
		return { label: 'Not on the live roster', tone: 'off' };
	}

	async function addStudent() {
		if (busy) return;
		busy = true;
		msg = null;
		const res = await transports.setEnrollment(section.id, addEmail, addName.trim() || null, true);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		msg = { ok: true, text: `${addEmail.trim().toLowerCase()} added.` };
		addEmail = '';
		addName = '';
		await onchanged?.();
	}

	function startEdit(e: ClassroomEnrollment) {
		editEmail = editEmail === e.student_email ? null : e.student_email;
		newEmail = e.student_email;
		newName = e.display_name;
		msg = null;
	}

	async function saveEnrollment(e: ClassroomEnrollment) {
		if (busy) return;
		busy = true;
		const res = await transports.updateEnrollment(
			section.id,
			e.student_email,
			newEmail.trim().toLowerCase() || null,
			newName.trim() || null
		);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		if (res.data.ok === false) {
			msg = {
				ok: false,
				text:
					res.data.reason === 'already_enrolled'
						? `${newEmail.trim().toLowerCase()} is already on this roster.`
						: 'That correction was refused.'
			};
			return;
		}
		editEmail = null;
		msg = { ok: true, text: 'Enrollment updated.' };
		await onchanged?.();
	}

	async function toggleEnrollment(e: ClassroomEnrollment) {
		if (busy) return;
		busy = true;
		const res = await transports.setEnrollment(section.id, e.student_email, null, !e.active);
		busy = false;
		if (!res.ok) msg = { ok: false, text: res.message };
		await onchanged?.();
	}

	// --- Notebook compliance (a summary; the console is one click away) ----
	let notebook = $state<GridSummary | null>(null);
	let notebookError = $state<string | null>(null);
	let notebookLoading = $state(false);

	/**
	 * A failure is reported IN PLACE rather than through `msg`: the notebook is a
	 * neighbouring feature and its absence must never read as a problem with the
	 * roster above it.
	 */
	$effect(() => {
		// TRACKED, deliberately: the transport's presence and which class this is
		// are exactly what should re-run this.
		const load = loadNotebookGrid;
		const sectionId = section.id;
		if (!load) return;
		let alive = true;
		notebookLoading = true;
		// null = every unit, which is what "how is this class doing" means. The
		// CALL is UNTRACKED, and that is the load-bearing half: `load` is
		// INJECTED, so whatever it touches before its first `await` would
		// otherwise join this effect's dependencies. See the injected-callback
		// rule in CLAUDE.md.
		void untrack(() => load(sectionId, null)).then((res) => {
			if (!alive) return;
			notebookLoading = false;
			if (res.ok) {
				notebook = gridSummary(res.value);
				notebookError = null;
			} else {
				notebook = null;
				notebookError = res.error;
			}
		});
		return () => {
			alive = false;
		};
	});

	// --- CSV import, scoped to THIS class ---------------------------------
	let csvText = $state('');
	let importBusy = $state(false);
	let importResult = $state<ImportSummary | null>(null);

	/**
	 * The class comes from the page you are standing on, so the file only has to
	 * say WHO. It maps onto the same RosterRow the same classroom_import_roster
	 * RPC has always taken -- no new write path, and a row naming a class the
	 * caller does not teach is still refused server-side.
	 */
	const parsed = $derived(
		csvText.trim()
			? parseSectionRosterCsv(csvText, section.course?.code ?? '', section.label)
			: null
	);

	async function readCsvFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		csvText = await file.text();
		importResult = null;
		input.value = '';
	}

	async function runImport() {
		if (!parsed || parsed.rows.length === 0 || importBusy) return;
		importBusy = true;
		importResult = null;
		const res = await transports.importRoster(parsed.rows);
		importBusy = false;
		if (res.ok) {
			importResult = res.data;
			await onchanged?.();
		} else {
			importResult = {
				total: 0,
				succeeded: 0,
				refused: 0,
				results: [{ row: 0, email: '', ok: false, reason: 'error', message: res.message }]
			};
		}
	}
</script>

{#snippet rosterRow(e: ClassroomEnrollment)}
	{@const status = rosterStatus(e)}
	<div class="roster-row" class:inactive={!e.active} data-testid="roster-row">
		<span class="roster-name">{e.display_name || e.student_email.split('@')[0]}</span>
		<span class="roster-email">{e.student_email}</span>
		<span class="roster-status" data-tone={status.tone} data-testid="roster-status">
			{status.label}
		</span>
		<span class="roster-actions">
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => startEdit(e)}>
				{editEmail === e.student_email ? 'Close' : 'Edit'}
			</button>
			<button
				type="button"
				class="btn secondary tiny"
				disabled={busy}
				data-testid="roster-toggle"
				onclick={() => toggleEnrollment(e)}
			>
				{e.active ? 'Deactivate' : 'Reactivate'}
			</button>
			{#if canRemove}
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy}
					data-testid="roster-remove"
					onclick={() => armRemoval(e)}
				>
					{armedRemoval === e.student_email ? 'Keep' : 'Remove'}
				</button>
			{/if}
		</span>
	</div>
	{#if armedRemoval === e.student_email}
		<div class="roster-confirm" data-testid="roster-remove-confirm">
			<p class="note">
				Delete this enrollment outright? {e.student_email} comes off this class list for good, and
				this cannot be undone. It only goes through if no saved answers, hand-ins, module approvals
				or notebook entries are attached to it. To take somebody off the live roster and keep
				everything, use Deactivate.
			</p>
			<span class="roster-confirm-actions">
				<button
					type="button"
					class="btn tiny danger tap-44"
					disabled={busy}
					data-testid="roster-remove-confirm-go"
					onclick={() => confirmRemoval(e)}
				>
					Remove permanently
				</button>
				<button
					type="button"
					class="btn secondary tiny tap-44"
					disabled={busy}
					onclick={() => (armedRemoval = null)}
				>
					Cancel
				</button>
			</span>
		</div>
	{/if}
	{#if removalRefusal?.email === e.student_email}
		<div class="roster-refusal" data-testid="roster-remove-refusal">
			<p class="note">{removalRefusal.text}</p>
			{#if e.active}
				<button
					type="button"
					class="btn secondary tiny tap-44"
					disabled={busy}
					data-testid="roster-refusal-deactivate"
					onclick={() => toggleEnrollment(e)}
				>
					Deactivate instead
				</button>
			{/if}
		</div>
	{/if}
	{#if editEmail === e.student_email}
		<form
			class="inline-form"
			onsubmit={(ev) => {
				ev.preventDefault();
				saveEnrollment(e);
			}}
		>
			<label>
				<span>Email (fix a typo)</span>
				<input type="email" bind:value={newEmail} required />
			</label>
			<label>
				<span>Display name</span>
				<input type="text" bind:value={newName} />
			</label>
			<button class="btn tiny" type="submit" disabled={busy}>Save correction</button>
		</form>
	{/if}
{/snippet}

<svelte:head>
	<title>People &middot; {sectionTitle(section)} // IDEA Classroom</title>
</svelte:head>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA // Classroom'}</div>
		<h1>People</h1>
		<p class="section-line">
			{formatSectionLabel(section.label, section.block)}
			&nbsp;&middot; {activeSplit.students.length} enrolled
			{#if activeSplit.managers.length}&nbsp;&middot; {activeSplit.managers.length}
				{activeSplit.managers.length === 1 ? 'manages' : 'manage'} this class{/if}
			{#if inactive.length}&nbsp;&middot; {inactive.length} inactive{/if}
			{#if section.active === false}&nbsp;&middot; <span class="draft-chip">Archived</span>{/if}
		</p>
	</section>

	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
	{/if}

	<section class="card">
		<h2>Roster</h2>
		{#if roster.length === 0}
			<p class="note empty-state">No students enrolled yet. Add one below or import a list.</p>
		{:else}
			<div class="roster-rows">
				{#each active as e (e.student_email)}{@render rosterRow(e)}{/each}
			</div>
			{#if inactive.length}
				<h3>Inactive</h3>
				<p class="note">
					Removed from the class, never deleted -- their work and their record stay exactly as they
					were, and reactivating puts them back.
				</p>
				<div class="roster-rows">
					{#each inactive as e (e.student_email)}{@render rosterRow(e)}{/each}
				</div>
			{/if}
		{/if}

		<form
			class="add-row"
			onsubmit={(e) => {
				e.preventDefault();
				addStudent();
			}}
		>
			<input type="email" placeholder="student@boscotech.net" bind:value={addEmail} required />
			<input type="text" placeholder="Display name" bind:value={addName} />
			<button class="btn tiny" type="submit" disabled={busy} data-testid="roster-add">Add</button>
		</form>

		<details class="csv-import">
			<summary>Import a list</summary>
			<p class="note">
				One student per line: <code>email, name</code>. A header row is fine, and extra columns are
				ignored. Everyone lands in <strong>this class</strong> &mdash; re-running the same file
				never duplicates anyone.
			</p>
			<input type="file" accept=".csv,text/csv" onchange={readCsvFile} />
			<textarea
				rows="4"
				placeholder={'alice@boscotech.net,Alice Alvarez'}
				bind:value={csvText}
				data-testid="csv-text"
			></textarea>
			{#if parsed}
				<p class="note">{parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} ready.</p>
				{#each parsed.errors as err (err)}
					<p class="feedback error">{err}</p>
				{/each}
			{/if}
			<button
				class="btn tiny"
				type="button"
				disabled={importBusy || !parsed || parsed.rows.length === 0}
				data-testid="csv-import"
				onclick={runImport}
			>
				Import {parsed?.rows.length ?? 0} rows
			</button>
			{#if importResult}
				<p
					class="feedback"
					class:ok={importResult.refused === 0}
					class:error={importResult.refused > 0}
				>
					{importResult.succeeded} imported, {importResult.refused} refused.
				</p>
				{#each importResult.results.filter((r) => !r.ok) as r (r.row)}
					<p class="feedback error">
						Row {r.row} ({r.email}): {r.message ?? importReasonLabel(r.reason)}
					</p>
				{/each}
			{/if}
		</details>
	</section>

	<!--
		CLASS TOOLS. Placed BELOW the roster and ABOVE notebook compliance: the
		roster is what the page is for and keeps the top, and all three of these
		act on the list directly above them, so nothing has to be scrolled back
		to. One row of controls, one panel open at a time.
	-->
	<section class="card" data-testid="class-tools">
		<h2>Class tools</h2>
		<div class="tools-row">
			<button
				type="button"
				class="btn secondary tiny tap-44"
				data-testid="tool-export"
				onclick={downloadCsv}
			>
				Export roster (CSV)
			</button>
			<button
				type="button"
				class="btn secondary tiny tap-44"
				data-testid="tool-email"
				aria-expanded={tool === 'email'}
				aria-controls="tool-panel-email"
				onclick={() => toggleTool('email')}
			>
				Email the class
			</button>
			<button
				type="button"
				class="btn secondary tiny tap-44"
				data-testid="tool-picker"
				aria-expanded={tool === 'picker'}
				aria-controls="tool-panel-picker"
				onclick={() => toggleTool('picker')}
			>
				Random picker
			</button>
		</div>

		{#if tool === 'email'}
			<div class="tool-panel" id="tool-panel-email" data-testid="email-panel">
				<!--
					A DRAFT, NOT A SEND. Nothing in this app can send mail, and a
					control that looked like it could would be the worst of the
					three possible answers. This hands the addresses to whatever
					mail client the machine already has, BCC, with the teacher as
					the only visible recipient.
				-->
				<p class="note">
					This opens your own mail app with the class in BCC. Nothing is sent from here, and
					nobody sees anybody else's address.
				</p>
				<label class="tool-field">
					<span>Subject (optional)</span>
					<input type="text" bind:value={mailSubject} data-testid="email-subject" />
				</label>
				<p class="note" data-testid="email-plan">{mailtoPlanNote(mailPlan)}</p>
				{#if mailPlan.drafts.length > 0}
					<div class="tools-row">
						{#each mailPlan.drafts as draft, i (draft.href)}
							<!--
								ONE LINK PER DRAFT, EACH SAYING WHO IS ON IT. A single
								control that opened several windows would be
								indistinguishable from one that opened one and dropped
								the rest, which is exactly the failure this ceiling
								exists to avoid.
							-->
							<a
								class="btn tiny tap-44"
								href={draft.href}
								data-testid="email-draft"
								data-index={i}
							>
								{mailPlan.drafts.length === 1
									? `Open draft (${draft.recipients.length})`
									: `Draft ${i + 1} of ${mailPlan.drafts.length} (${draft.recipients.length})`}
							</a>
						{/each}
					</div>
				{/if}
				{#if recipients.length > 0}
					<button
						type="button"
						class="btn secondary tiny tap-44"
						data-testid="email-copy"
						onclick={copyAddresses}
					>
						{copiedList ? 'Copied' : 'Copy all addresses'}
					</button>
					<!--
						SELECTABLE TEXT BESIDE THE COPY CONTROL, so a refused
						clipboard costs nothing and a webmail tab has somewhere to
						paste from.
					-->
					<p class="tool-addresses" data-testid="email-addresses">{classEmailList(recipients)}</p>
				{/if}
			</div>
		{/if}

		{#if tool === 'picker'}
			<div class="tool-panel" id="tool-panel-picker" data-testid="picker-panel">
				<p class="note">
					Teams, an order, or one student, drawn at random from whoever is here. The seed is shown
					so the same draw can be shown again, and so a student can check it.
				</p>
				<div class="tools-row">
					<label class="tool-field narrow">
						<span>Team size</span>
						<input
							type="number"
							min="1"
							max="20"
							bind:value={teamSize}
							data-testid="picker-team-size"
						/>
					</label>
					<button type="button" class="btn tiny tap-44" data-testid="picker-draw" onclick={draw}>
						{drawn ? 'Draw again' : 'Draw'}
					</button>
				</div>

				{#if candidates.length === 0}
					<p class="note empty-state">Nobody on the live roster to draw from yet.</p>
				{:else}
					<fieldset class="tool-absent">
						<legend>Here today</legend>
						<p class="note">Untick anybody who is absent. They stay off every draw below.</p>
						<div class="absent-grid">
							{#each candidates as person (person.email)}
								<label class="absent-item tap-44">
									<input
										type="checkbox"
										checked={!absent.has(person.email)}
										data-testid="picker-present"
										onchange={() => toggleAbsent(person.email)}
									/>
									<span>{person.name}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}

				{#if drawn}
					<p class="note" data-testid="picker-note">{drawNote}</p>
					{#if chosen}
						<p class="picker-one" data-testid="picker-one">
							<span class="picker-label">One student</span>
							{chosen.name}
						</p>
					{/if}
					{#if order.length > 0}
						<div data-testid="picker-order">
							<h3>Order</h3>
							<ol class="picker-order">
								{#each order as person (person.email)}
									<li>{person.name}</li>
								{/each}
							</ol>
						</div>
					{/if}
					{#if teams.length > 0}
						<div data-testid="picker-teams">
							<h3>Teams</h3>
							<div class="picker-teams">
								{#each teams as team, i (i)}
									<div class="picker-team">
										<h4>Team {i + 1}</h4>
										<ul>
											{#each team as person (person.email)}
												<li>{person.name}</li>
											{/each}
										</ul>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</section>

	{#if loadNotebookGrid}
		<section class="card">
			<h2>Notebook compliance</h2>
			{#if notebookLoading}
				<Pending label="Loading notebook compliance" />
			{:else if notebookError}
				<p class="note" data-testid="nb-compliance-error">{notebookError}</p>
			{:else if notebook}
				{#if notebook.sessions === 0}
					<p class="note empty-state" data-testid="nb-compliance-empty">
						No notebook check-ins are scheduled for this class yet.
						<a href={`/notebook/review?section=${section.id}`}>Add one in the review console</a>.
					</p>
				{:else}
					<p class="nb-line" data-testid="nb-compliance-line">
						{notebook.students}
						{notebook.students === 1 ? 'student' : 'students'} &middot;
						{notebook.sessions}
						{notebook.sessions === 1 ? 'check-in' : 'check-ins'} &middot;
						<strong>{notebook.outstanding}</strong> outstanding
					</p>
					<!-- Glyph AND label on every tally, and both come from CELL_STATES --
					     the same registry the grid's own cells and legend read, so the two
					     can never diverge on what a state is called or looks like. -->
					<div class="nb-tallies">
						{#each CELL_STATES as state (state.key)}
							<span class="nb-tally nb-{state.key}" title={state.hint} data-testid="nb-tally-{state.key}">
								<span class="nb-glyph" aria-hidden="true">{state.glyph}</span>
								{state.label}
								<strong>{notebook.counts[state.key]}</strong>
							</span>
						{/each}
					</div>
					{#if notebook.attention.length}
						<details class="nb-attention">
							<summary>
								{notebook.attention.length}
								{notebook.attention.length === 1 ? 'student needs' : 'students need'} a look
							</summary>
							{#each notebook.attention as row (row.student.student_key)}
								<p class="nb-student" data-testid="nb-attention-row">
									<span class="nb-student-name">{row.student.name}</span>
									<span class="nb-student-meta">
										{completionLabel(row)}
										{#if row.flagged}&nbsp;&middot; {row.flagged} flagged{/if}
										{#if row.excused}&nbsp;&middot; {row.excused} excused{/if}
										{#if !row.student.enrolled}&nbsp;&middot; left{/if}
									</span>
								</p>
							{/each}
						</details>
					{:else}
						<p class="note" data-testid="nb-all-clear">Everyone is up to date on every check-in.</p>
					{/if}
					<p class="note">
						<a href={`/notebook/review?section=${section.id}`}>Open the review console</a>
						to read entries, flag work and grade the Documentation Check.
					</p>
				{/if}
			{/if}
		</section>
	{/if}

	<section class="card">
		<h2>Class settings</h2>
		<div class="section-actions">
			<button type="button" class="btn secondary tiny" onclick={startEditSection}>
				{editingSection ? 'Close' : 'Edit details'}
			</button>
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={toggleActive}>
				{section.active === false ? 'Reactivate class' : 'Archive class'}
			</button>
			<button
				type="button"
				class="btn secondary tiny danger"
				disabled={busy}
				onclick={() => {
					armSectionDelete = !armSectionDelete;
					deleteConfirmText = '';
					deleteBlocked = null;
				}}
			>
				{armSectionDelete ? 'Cancel delete' : 'Delete class'}
			</button>
		</div>

		{#if editingSection}
			<form
				class="inline-form"
				onsubmit={(e) => {
					e.preventDefault();
					saveSection();
				}}
			>
				<label>
					<span>Class label</span>
					<input type="text" bind:value={editLabel} required />
				</label>
				<label>
					<span>Block / period</span>
					<input type="text" bind:value={editBlock} />
				</label>
				<label>
					<span>Teacher of record</span>
					<input type="email" bind:value={editTeacher} required />
				</label>
				<p class="note">
					Handing this class to another @boscotech.edu teacher removes it from your own list &mdash;
					only they (or an admin) can hand it back.
				</p>
				<button class="btn tiny" type="submit" disabled={busy}>Save class</button>
			</form>
		{/if}

		{#if armSectionDelete}
			<div class="danger-zone">
				<p class="note">
					Deleting is only possible when the class is completely empty. If it holds posted items or
					students, archive it instead &mdash; that keeps every record and takes it out of the
					publish targets.
				</p>
				<label>
					<span>Type the class label ("{section.label}") to confirm</span>
					<input type="text" bind:value={deleteConfirmText} placeholder={section.label} />
				</label>
				<button
					class="btn tiny danger"
					type="button"
					disabled={busy ||
						deleteConfirmText.trim().toLowerCase() !== section.label.trim().toLowerCase()}
					onclick={confirmDelete}
				>
					Delete this class
				</button>
				{#if deleteBlocked}
					<p class="feedback error">
						Not deleted -- this class still holds {deleteBlocked}. Archive it instead, or remove
						that content first.
					</p>
				{/if}
			</div>
		{/if}
	</section>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.classroom-page > .card {
		margin-bottom: 1.1rem;
	}
	.classroom-page h2 {
		margin-top: 0;
	}
	.classroom-page h3 {
		margin: 1rem 0 0.4rem;
		font-size: 0.85rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.section-line {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.feedback {
		margin: 0 0 0.8rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.empty-state {
		padding: 0.4rem 0;
	}
	.section-actions {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}

	/* Notebook compliance -- a summary, deliberately not the grid. The state
	   colours are the platform tokens the grid's own cells use, so the two
	   read the same; the layout is a chip row rather than a table because a
	   52rem panel is not where a wide scrolling grid belongs. */
	.nb-line {
		color: var(--text-2);
		font-size: 0.85rem;
		margin: 0 0 var(--space-2);
	}
	.nb-line strong {
		color: var(--text-1);
	}
	.nb-tallies {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.6rem;
	}
	.nb-tally {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.15rem 0.55rem;
		color: var(--text-2);
	}
	.nb-tally strong {
		color: var(--text-1);
	}
	.nb-glyph {
		font-size: 0.8rem;
	}
	.nb-on_time .nb-glyph {
		color: var(--green);
	}
	.nb-late .nb-glyph {
		color: var(--amber);
	}
	.nb-pending_review .nb-glyph {
		color: var(--cyan);
	}
	.nb-flagged .nb-glyph {
		color: var(--crimson);
	}
	/* EXCUSED IS A STATUS, NOT DECORATION. At --text-3 the glyph measured
	   3.13:1 on the card -- the one mark in the cell, below the bar. --ice is
	   both the semantic token for "disabled / not-yet-started" AND what the
	   notebook's own review grid gives excused on its dark plates, so the two
	   spellings of this hue now agree: 9.31:1. */
	.nb-excused .nb-glyph {
		color: var(--ice);
	}
	/* --dim is the notebook review grid's own "sage" ink for missing
	   (--nb-cell-missing resolves to it), so this is the same status colour
	   rather than a fresh one. */
	.nb-missing .nb-glyph {
		color: var(--dim);
	}
	.nb-attention {
		margin-bottom: 0.6rem;
	}
	.nb-attention summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--amber);
	}
	.nb-student {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: baseline;
		margin: 0.3rem 0 0;
		padding-left: 0.6rem;
	}
	.nb-student-name {
		font-size: 0.85rem;
	}
	.nb-student-meta {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}

	/* Forms + roster: moved here verbatim from the retired manage console, whose
	   roster panel this replaces. */
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	label > span {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	input,
	textarea {
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		outline: 1px solid var(--focus-ring);
	}
	.inline-form {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 0.7rem;
		margin: 0.3rem 0 0.6rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.inline-form .btn {
		align-self: flex-start;
	}
	.danger-zone {
		border: 1px solid var(--crimson);
		border-radius: var(--radius-card);
		padding: 0.6rem 0.7rem;
		margin-bottom: 0.6rem;
	}
	.roster-rows {
		display: flex;
		flex-direction: column;
	}
	.roster-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--boundary);
	}
	.roster-row:last-child {
		border-bottom: none;
	}
	/* A REMOVED STUDENT IS STILL A NAME AND AN ADDRESS SOMEBODY HAS TO READ.
	   --text-3 is decorative tertiary in this room (CLAUDE.md says so in as many
	   words) and it measured 3.13:1 on the card -- so the row that tells you who
	   was removed was the least readable row on the page. --text-2 is this
	   register's own word for secondary copy: 7.27:1. The line-through is what
	   carries "removed", which is the point -- colour was never the only
	   signal here, so dropping the dimness costs nothing. */
	.roster-row.inactive .roster-name,
	.roster-row.inactive .roster-email {
		color: var(--text-2);
		text-decoration: line-through;
	}
	.roster-name {
		font-weight: 700;
		font-size: 0.9rem;
	}
	.roster-email {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.roster-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	/* The row's own status, in words. The tint is a second signal on top of the
	   sentence, never the only one -- read with the label removed, every chip
	   here still says nothing, which is the test that it is decoration. */
	.roster-status {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.1rem var(--space-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-chip);
		white-space: nowrap;
		color: var(--text-2);
	}
	.roster-status[data-tone='on'] {
		color: var(--text-2);
	}
	/* --gold, because a manager row is a SPECIAL CALLOUT and not a warning:
	   nothing is wrong with it, it is simply the row that explains why this
	   name is absent from every student surface. --amber would say something
	   needs fixing. */
	.roster-status[data-tone='manager'] {
		color: var(--gold);
		border-color: var(--gold);
	}
	.roster-status[data-tone='off'] {
		color: var(--text-3);
	}
	/* Both blocks sit UNDER the row they belong to and inside its own list, so
	   the counts and the alternative action are next to the person they are
	   about. A refusal rendered at the top of the page would be a sentence
	   about somebody whose row has scrolled away. */
	.roster-confirm,
	.roster-refusal {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-3);
		margin: var(--space-1) 0 var(--space-3);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.roster-confirm {
		border: 1px solid var(--crimson);
	}
	/* NOT --crimson. The confirm above is about to destroy something; a refusal
	   is the system declining to, which is the safe outcome and must not be
	   dressed as an error. */
	.roster-refusal {
		border: 1px solid var(--amber);
	}
	.roster-confirm-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.add-row {
		display: grid;
		grid-template-columns: minmax(10rem, 2fr) minmax(7rem, 1.5fr) auto;
		gap: 0.4rem;
		align-items: center;
		margin-top: var(--space-2);
	}
	.csv-import {
		margin-top: 0.7rem;
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-card);
		padding: 0.5rem 0.7rem;
	}
	.csv-import summary {
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--gold);
	}
	.csv-import textarea {
		margin: 0.4rem 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.csv-import input[type='file'] {
		margin-top: 0.4rem;
		font-size: 0.75rem;
	}
	.csv-import code {
		color: var(--cyan);
	}
	@media (max-width: 560px) {
		.add-row {
			grid-template-columns: 1fr;
		}
		/* The row wraps to two lines below this width, so the actions stop
		   being pushed to a right edge that is no longer beside the name. */
		.roster-actions {
			margin-left: 0;
		}
		.roster-status {
			order: -1;
		}
	}

	/* --- Class tools ---------------------------------------------------- */
	.tools-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2, 0.5rem);
	}
	.tool-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		margin-top: var(--space-3, 0.8rem);
		padding-top: var(--space-3, 0.8rem);
		/* The only separator between the control row and the panel it opened,
		   so it is the load-bearing token rather than the decorative one. */
		border-top: 1px solid var(--boundary);
	}
	.tool-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.tool-field > span {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.tool-field input {
		min-height: 44px;
	}
	.tool-field.narrow input {
		width: 6rem;
	}
	.tool-addresses {
		margin: 0;
		/* Selectable, and it wraps: a class list is long and must not push the
		   page wider than the viewport. */
		overflow-wrap: anywhere;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		user-select: all;
	}
	.tool-absent {
		margin: 0;
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
	}
	.tool-absent legend {
		padding: 0 0.4rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.absent-grid {
		display: grid;
		/* auto-fit so a class of six gets six columns' worth of room rather than
		   a fixed grid with a void in it. */
		grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
		gap: 0.2rem;
		margin-top: 0.4rem;
	}
	.absent-item {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		/* The LABEL is what a finger hits, so the floor lives here and not on
		   the checkbox inside it. */
		min-height: 44px;
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.absent-item > span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.picker-one {
		margin: 0;
		color: var(--text-1);
		font-size: 1.1rem;
	}
	.picker-label {
		margin-right: 0.5rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.picker-order {
		margin: 0.3rem 0 0;
		padding-left: 1.4rem;
		color: var(--text-1);
	}
	.picker-teams {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
		gap: var(--space-2, 0.5rem);
		margin-top: 0.3rem;
	}
	.picker-team {
		min-width: 0;
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
	}
	.picker-team h4 {
		margin: 0 0 0.3rem;
		color: var(--cyan);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.picker-team ul {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-1);
	}
</style>
