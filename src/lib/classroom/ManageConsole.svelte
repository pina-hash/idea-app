<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ClassroomFeedback from '$lib/classroom/ClassroomFeedback.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import {
		emailLocal,
		formatDue,
		importReasonLabel,
		itemKindLabel,
		itemTitle,
		parseRosterCsv,
		sectionDeleteBlockedLabel,
		sectionTitle,
		shortWhen,
		sortSections,
		type ClassroomCourse,
		type ClassroomEnrollment,
		type ClassroomItem,
		type ClassroomItemKind,
		type ClassroomManageTransports,
		type ClassroomSection,
		type ImportSummary
	} from '$lib/classroom/classroom';
	import type { FeedbackEntry } from '$lib/feedback/feedback';

	/**
	 * The teacher console: courses + sections setup and lifecycle, the shared
	 * content composer with multi-section publish, and per-section roster (with
	 * CSV import + in-place corrections) and content management.
	 *
	 * Presentation + orchestration only -- every server call goes through the
	 * INJECTED transports (the ReviewConsole convention), so /dev/classroom
	 * mounts this same component against an in-memory store. The transports are
	 * thin callers of the 0082/0083 SECURITY DEFINER RPCs; nothing here is a
	 * boundary. The content editor itself is ContentComposer, the SAME component
	 * the class page and the assignment page mount.
	 */
	let {
		ready = true,
		email,
		isAdmin = false,
		attachmentsEnabled = true,
		initialSections,
		initialCourses,
		transports,
		submitFeedback = null
	}: {
		ready?: boolean;
		email: string;
		/** Unlocks course editing (0082 makes course metadata admin-only). */
		isAdmin?: boolean;
		attachmentsEnabled?: boolean;
		initialSections: ClassroomSection[];
		initialCourses: ClassroomCourse[];
		transports: ClassroomManageTransports;
		submitFeedback?: ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null;
	} = $props();

	type Msg = { ok: boolean; text: string } | null;

	// Seeded ONCE from the load's data on purpose; refreshSections() is the
	// live path afterwards (the CoinDeskTool initialSections convention).
	// svelte-ignore state_referenced_locally
	let sections = $state<ClassroomSection[]>([...initialSections]);
	// svelte-ignore state_referenced_locally
	let courses = $state<ClassroomCourse[]>([...initialCourses]);
	const orderedSections = $derived(sortSections(sections));
	// Archived sections stay in the list (and keep every tool) but drop out of
	// the publish targets: posting new work into a class that is over is a
	// mistake, not a workflow.
	const publishTargets = $derived(orderedSections.filter((s) => s.active !== false));

	// --- Setup card -----------------------------------------------------
	let newCourseCode = $state('');
	let newCourseTitle = $state('');
	let newSectionCourseId = $state('');
	let newSectionLabel = $state('');
	let newSectionBlock = $state('');
	let setupBusy = $state(false);
	let setupMsg = $state<Msg>(null);

	async function refreshSections() {
		const res = await transports.reloadSections();
		if (res.ok) {
			sections = res.data.sections;
			courses = res.data.courses;
		}
	}

	async function createCourse() {
		if (setupBusy) return;
		setupBusy = true;
		setupMsg = null;
		const res = await transports.upsertCourse(newCourseCode, newCourseTitle);
		if (res.ok) {
			setupMsg = {
				ok: true,
				text: res.data.created
					? `Course ${newCourseCode.trim().toUpperCase()} created.`
					: `That course already exists -- pick it in the section form below.`
			};
			newCourseCode = '';
			newCourseTitle = '';
			await refreshSections();
			if (!newSectionCourseId) newSectionCourseId = res.data.courseId;
		} else {
			setupMsg = { ok: false, text: res.message };
		}
		setupBusy = false;
	}

	async function createSection() {
		if (setupBusy) return;
		setupBusy = true;
		setupMsg = null;
		const res = await transports.upsertSection(
			newSectionCourseId,
			newSectionLabel,
			newSectionBlock.trim() || null
		);
		if (res.ok) {
			setupMsg = { ok: true, text: `Section "${newSectionLabel.trim()}" created.` };
			newSectionLabel = '';
			newSectionBlock = '';
			await refreshSections();
		} else {
			setupMsg = { ok: false, text: res.message };
		}
		setupBusy = false;
	}

	// --- Course editing (admin only) --------------------------------------
	let courseEditId = $state<string | null>(null);
	let courseCode = $state('');
	let courseTitle = $state('');
	let courseActive = $state(true);
	let courseMsg = $state<Msg>(null);
	let courseBusy = $state(false);

	function startEditCourse(c: ClassroomCourse) {
		courseEditId = courseEditId === c.id ? null : c.id;
		courseCode = c.code;
		courseTitle = c.title;
		courseActive = c.active;
		courseMsg = null;
	}

	async function saveCourse() {
		if (!courseEditId || courseBusy) return;
		courseBusy = true;
		const res = await transports.upsertCourse(courseCode, courseTitle, courseActive, courseEditId);
		if (res.ok) {
			courseMsg = { ok: true, text: `${courseCode.trim().toUpperCase()} saved.` };
			courseEditId = null;
			await refreshSections();
		} else {
			courseMsg = { ok: false, text: res.message };
		}
		courseBusy = false;
	}

	// --- Selected section: roster + content -------------------------------
	let selectedSectionId = $state<string | null>(null);
	let roster = $state<ClassroomEnrollment[]>([]);
	let items = $state<ClassroomItem[]>([]);
	let panelBusy = $state(false);
	let panelMsg = $state<Msg>(null);
	let armDelete = $state<string | null>(null);

	async function selectSection(id: string) {
		if (selectedSectionId === id) {
			selectedSectionId = null;
			return;
		}
		selectedSectionId = id;
		panelMsg = null;
		armDelete = null;
		sectionEditId = null;
		armSectionDelete = null;
		await Promise.all([loadSelectedRoster(), loadSelectedContent()]);
	}

	async function loadSelectedRoster() {
		if (!selectedSectionId) return;
		const res = await transports.loadRoster(selectedSectionId);
		if (res.ok) roster = res.data;
		else panelMsg = { ok: false, text: res.message };
	}

	async function loadSelectedContent() {
		if (!selectedSectionId) return;
		const res = await transports.loadContent(selectedSectionId);
		if (res.ok) {
			items = res.data.items;
		} else {
			panelMsg = { ok: false, text: res.message };
		}
	}

	// --- Composer ---------------------------------------------------------
	let composerKind = $state<ClassroomItemKind>('post');
	let editingId = $state<string | null>(null);
	// Remount key: switching edit targets rebuilds the composer with the right
	// initial values rather than reaching into it imperatively.
	const composerKey = $derived(editingId ?? 'new');
	const editingItem = $derived(items.find((i) => i.id === editingId) ?? null);

	function startEdit(id: string) {
		editingId = id;
		document.getElementById('classroom-composer')?.scrollIntoView({ block: 'start' });
	}

	async function onComposerSaved() {
		editingId = null;
		if (selectedSectionId) await loadSelectedContent();
		await refreshSections();
	}

	// --- Section editing / archiving / deletion ---------------------------
	let sectionEditId = $state<string | null>(null);
	let editLabel = $state('');
	let editBlock = $state('');
	let editTeacher = $state('');
	let armSectionDelete = $state<string | null>(null);
	let deleteConfirmText = $state('');
	let deleteBlocked = $state<string | null>(null);

	function startEditSection(s: ClassroomSection) {
		sectionEditId = sectionEditId === s.id ? null : s.id;
		editLabel = s.label;
		editBlock = s.block ?? '';
		editTeacher = s.teacher_email;
		panelMsg = null;
	}

	async function saveSection(s: ClassroomSection) {
		if (panelBusy) return;
		panelBusy = true;
		const res = await transports.upsertSection(
			s.course_id,
			editLabel,
			editBlock.trim() || null,
			s.id,
			editTeacher.trim().toLowerCase() || null
		);
		if (res.ok) {
			panelMsg = { ok: true, text: 'Section saved.' };
			sectionEditId = null;
			await refreshSections();
		} else {
			panelMsg = { ok: false, text: res.message };
		}
		panelBusy = false;
	}

	async function toggleSectionActive(s: ClassroomSection) {
		if (panelBusy) return;
		panelBusy = true;
		const res = await transports.setSectionActive(s.id, s.active === false);
		if (res.ok) {
			panelMsg = {
				ok: true,
				text: s.active === false ? 'Section reactivated.' : 'Section archived.'
			};
			await refreshSections();
		} else {
			panelMsg = { ok: false, text: res.message };
		}
		panelBusy = false;
	}

	/**
	 * Two-step, and the second step is a TYPED label -- mirrored from the RPC,
	 * which enforces it server-side, so the button can never be enabled on input
	 * the database would reject.
	 */
	function armDeleteSection(s: ClassroomSection) {
		if (armSectionDelete === s.id) {
			armSectionDelete = null;
			return;
		}
		armSectionDelete = s.id;
		deleteConfirmText = '';
		deleteBlocked = null;
	}

	async function confirmDeleteSection(s: ClassroomSection) {
		if (panelBusy) return;
		panelBusy = true;
		deleteBlocked = null;
		const res = await transports.deleteSection(s.id, deleteConfirmText);
		if (!res.ok) {
			panelMsg = { ok: false, text: res.message };
		} else if (res.data.ok === false) {
			// The designed path, not an error: the section holds real work, so it
			// is never deleted. Say exactly what would have been lost and point at
			// archiving, which keeps all of it.
			deleteBlocked = sectionDeleteBlockedLabel(res.data);
		} else {
			armSectionDelete = null;
			selectedSectionId = null;
			panelMsg = { ok: true, text: `Section "${s.label}" deleted.` };
			await refreshSections();
		}
		panelBusy = false;
	}

	// --- Roster add / edit / toggle ---------------------------------------
	let addEmail = $state('');
	let addName = $state('');
	let rosterEditEmail = $state<string | null>(null);
	let rosterNewEmail = $state('');
	let rosterNewName = $state('');

	async function addStudent() {
		if (!selectedSectionId || panelBusy) return;
		panelBusy = true;
		panelMsg = null;
		const res = await transports.setEnrollment(
			selectedSectionId,
			addEmail,
			addName.trim() || null,
			true
		);
		if (res.ok) {
			panelMsg = { ok: true, text: `${addEmail.trim().toLowerCase()} added to the roster.` };
			addEmail = '';
			addName = '';
			await loadSelectedRoster();
		} else {
			panelMsg = { ok: false, text: res.message };
		}
		panelBusy = false;
	}

	function startEditEnrollment(e: ClassroomEnrollment) {
		rosterEditEmail = rosterEditEmail === e.student_email ? null : e.student_email;
		rosterNewEmail = e.student_email;
		rosterNewName = e.display_name;
		panelMsg = null;
	}

	async function saveEnrollment(e: ClassroomEnrollment) {
		if (!selectedSectionId || panelBusy) return;
		panelBusy = true;
		const res = await transports.updateEnrollment(
			selectedSectionId,
			e.student_email,
			rosterNewEmail.trim().toLowerCase() || null,
			rosterNewName.trim() || null
		);
		if (!res.ok) {
			panelMsg = { ok: false, text: res.message };
		} else if (res.data.ok === false) {
			panelMsg = {
				ok: false,
				text:
					res.data.reason === 'already_enrolled'
						? `${rosterNewEmail.trim().toLowerCase()} is already on this roster.`
						: 'That correction was refused.'
			};
		} else {
			panelMsg = { ok: true, text: 'Enrollment updated.' };
			rosterEditEmail = null;
			await loadSelectedRoster();
		}
		panelBusy = false;
	}

	async function toggleActive(e: ClassroomEnrollment) {
		if (!selectedSectionId || panelBusy) return;
		panelBusy = true;
		const res = await transports.setEnrollment(selectedSectionId, e.student_email, null, !e.active);
		if (!res.ok) panelMsg = { ok: false, text: res.message };
		await loadSelectedRoster();
		panelBusy = false;
	}

	// CSV import
	let csvText = $state('');
	let importBusy = $state(false);
	let importResult = $state<ImportSummary | null>(null);
	const parsedCsv = $derived(csvText.trim() ? parseRosterCsv(csvText) : null);

	async function readCsvFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		csvText = await file.text();
		importResult = null;
		input.value = '';
	}

	async function runImport() {
		if (!parsedCsv || parsedCsv.rows.length === 0 || importBusy) return;
		importBusy = true;
		importResult = null;
		const res = await transports.importRoster(parsedCsv.rows);
		if (res.ok) {
			importResult = res.data;
			if (selectedSectionId) await loadSelectedRoster();
		} else {
			importResult = {
				total: 0,
				succeeded: 0,
				refused: 0,
				results: [{ row: 0, email: '', ok: false, reason: 'error', message: res.message }]
			};
		}
		importBusy = false;
	}

	// Content actions. Publishing a DRAFT publishes it in every class it is
	// posted to at once -- `published` lives on the canonical record, so there is
	// no per-class copy left behind still reading as a draft.
	async function togglePublished(item: ClassroomItem) {
		if (panelBusy) return;
		panelBusy = true;
		const res = await transports.updateItem(
			item.id,
			{
				title: item.title,
				body: item.body,
				points: item.points,
				dueAt: item.due_at,
				category: item.category,
				links: item.links.map((r) => ({ label: r.label, url: r.url }))
			},
			!item.published
		);
		if (!res.ok) panelMsg = { ok: false, text: res.message };
		await loadSelectedContent();
		panelBusy = false;
	}

	async function togglePinned(item: ClassroomItem) {
		if (panelBusy) return;
		panelBusy = true;
		const res = await transports.setPinned(item.id, !item.pinned);
		if (!res.ok) panelMsg = { ok: false, text: res.message };
		await loadSelectedContent();
		panelBusy = false;
	}

	async function duplicateItem(item: ClassroomItem) {
		if (panelBusy) return;
		panelBusy = true;
		const res = await transports.duplicateItem(item.id);
		panelBusy = false;
		if (!res.ok) {
			panelMsg = { ok: false, text: res.message };
			return;
		}
		await loadSelectedContent();
		panelMsg = { ok: true, text: 'Copied as a new draft. It is open in the composer above.' };
		startEdit(res.data.itemId);
	}

	async function deleteContent(id: string) {
		if (armDelete !== id) {
			armDelete = id;
			return;
		}
		armDelete = null;
		panelBusy = true;
		const res = await transports.deleteItem(id);
		if (!res.ok) panelMsg = { ok: false, text: res.message };
		if (editingId === id) editingId = null;
		await loadSelectedContent();
		panelBusy = false;
	}
</script>

<svelte:head>
	<title>Manage Classes // IDEA Classroom</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		{#if isAdmin}
			<a class="btn secondary" href="/classroom/view-as">View as student</a>
		{/if}
		<a class="btn secondary" href="/classroom">&lsaquo; My Classes</a>
		<ProfileMenu />
	</div>
</div>

<main class="manage-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Classroom</div>
		<h1>Manage Classes</h1>
		<p class="lead">
			Your sections, rosters, and content. Signed in as
			<strong>{emailLocal(email)}</strong> -- you can manage sections where you are the teacher of
			record.
		</p>
	</section>

	{#if !ready}
		<section class="card">
			<p class="feedback error">
				Classroom is not available yet -- migration 0082 does not appear to be applied.
			</p>
		</section>
	{:else}
		<!-- 1. Courses + sections setup -->
		<section class="card">
			<h2>Courses &amp; sections</h2>
			<div class="setup-grid">
				<form
					class="setup-form"
					onsubmit={(e) => {
						e.preventDefault();
						createCourse();
					}}
				>
					<h3>New course</h3>
					<label>
						<span>Course code</span>
						<input type="text" placeholder="IDEA100" bind:value={newCourseCode} required />
					</label>
					<label>
						<span>Title</span>
						<input
							type="text"
							placeholder="Intro to Engineering Design"
							bind:value={newCourseTitle}
						/>
					</label>
					<button class="btn" type="submit" disabled={setupBusy}>Create course</button>
				</form>
				<form
					class="setup-form"
					onsubmit={(e) => {
						e.preventDefault();
						createSection();
					}}
				>
					<h3>New section</h3>
					<label>
						<span>Course</span>
						<select bind:value={newSectionCourseId} required>
							<option value="" disabled>Pick a course</option>
							{#each courses as c (c.id)}
								<option value={c.id}>{c.code} &middot; {c.title}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>Section label</span>
						<input type="text" placeholder="Period 1" bind:value={newSectionLabel} required />
					</label>
					<label>
						<span>Block / period (optional)</span>
						<input type="text" placeholder="Block A" bind:value={newSectionBlock} />
					</label>
					<button class="btn" type="submit" disabled={setupBusy || !newSectionCourseId}>
						Create section
					</button>
				</form>
			</div>
			{#if setupMsg}
				<p class="feedback" class:ok={setupMsg.ok} class:error={!setupMsg.ok}>{setupMsg.text}</p>
			{/if}

			{#if isAdmin}
				<h3>Edit courses (admin)</h3>
				<p class="note">
					Course code, title and the active flag are shared catalog metadata, so only a site admin
					can change them -- a rename lands on every teacher's sections at once.
				</p>
				<div class="course-rows">
					{#each courses as c (c.id)}
						<div class="course-row">
							<span class="course-main">
								<span class="course-code">{c.code}</span>
								<span class="course-title">{c.title}</span>
								{#if !c.active}<span class="draft-chip">Inactive</span>{/if}
							</span>
							<button type="button" class="btn secondary tiny" onclick={() => startEditCourse(c)}>
								{courseEditId === c.id ? 'Close' : 'Edit'}
							</button>
						</div>
						{#if courseEditId === c.id}
							<form
								class="inline-form"
								onsubmit={(e) => {
									e.preventDefault();
									saveCourse();
								}}
							>
								<label>
									<span>Code</span>
									<input type="text" bind:value={courseCode} required />
								</label>
								<label>
									<span>Title</span>
									<input type="text" bind:value={courseTitle} required />
								</label>
								<label class="check-row">
									<input type="checkbox" bind:checked={courseActive} />
									<span>Active</span>
								</label>
								<button class="btn tiny" type="submit" disabled={courseBusy}>Save course</button>
							</form>
						{/if}
					{/each}
				</div>
				{#if courseMsg}
					<p class="feedback" class:ok={courseMsg.ok} class:error={!courseMsg.ok}>{courseMsg.text}</p>
				{/if}
			{/if}
		</section>

		<!-- 2. Composer (the SHARED editor, also mounted on the class pages) -->
		<section class="card" id="classroom-composer">
			<h2>{editingItem ? `Edit ${itemKindLabel(editingItem.kind).toLowerCase()}` : 'Compose'}</h2>
			{#if editingItem}
				<p class="note">
					Editing the one shared copy of <strong>{itemTitle(editingItem)}</strong>. Every class it
					is posted to sees the change; use the linkage controls below to add or remove a class.
					<button type="button" class="linklike" onclick={() => (editingId = null)}>
						Cancel editing
					</button>
				</p>
			{/if}
			{#key composerKey}
				<ContentComposer
					mode={editingItem ? 'edit' : 'create'}
					bind:kind={composerKind}
					sections={editingItem ? orderedSections : publishTargets}
					item={editingItem}
					{transports}
					{attachmentsEnabled}
					onsaved={onComposerSaved}
				/>
			{/key}
		</section>

		<!-- 3. Sections: settings, roster, content -->
		<section class="card">
			<h2>Your sections</h2>
			{#if orderedSections.length === 0}
				<p class="note empty-state">
					No sections yet. Create a course and a section above -- then your roster and content
					tools appear here.
				</p>
			{:else}
				{#each orderedSections as s (s.id)}
					<div class="section-block" class:open={selectedSectionId === s.id}>
						<button type="button" class="section-head" onclick={() => selectSection(s.id)}>
							<span class="section-name">{sectionTitle(s)}</span>
							{#if s.block}<span class="section-block-chip">{s.block}</span>{/if}
							{#if s.active === false}<span class="draft-chip">Archived</span>{/if}
							<span class="section-caret">{selectedSectionId === s.id ? '▾' : '▸'}</span>
						</button>

						{#if selectedSectionId === s.id}
							<div class="section-panel">
								{#if panelMsg}
									<p class="feedback" class:ok={panelMsg.ok} class:error={!panelMsg.ok}>
										{panelMsg.text}
									</p>
								{/if}

								<h3>Section settings</h3>
								<div class="section-actions">
									<button type="button" class="btn secondary tiny" onclick={() => startEditSection(s)}>
										{sectionEditId === s.id ? 'Close' : 'Edit details'}
									</button>
									<button
										type="button"
										class="btn secondary tiny"
										disabled={panelBusy}
										onclick={() => toggleSectionActive(s)}
									>
										{s.active === false ? 'Reactivate' : 'Archive'}
									</button>
									<button
										type="button"
										class="btn secondary tiny danger"
										disabled={panelBusy}
										onclick={() => armDeleteSection(s)}
									>
										{armSectionDelete === s.id ? 'Cancel delete' : 'Delete section'}
									</button>
								</div>

								{#if sectionEditId === s.id}
									<form
										class="inline-form"
										onsubmit={(e) => {
											e.preventDefault();
											saveSection(s);
										}}
									>
										<label>
											<span>Section label</span>
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
											Handing the section to another @boscotech.edu teacher removes it from
											your own list -- only they (or an admin) can hand it back.
										</p>
										<button class="btn tiny" type="submit" disabled={panelBusy}>Save section</button>
									</form>
								{/if}

								{#if armSectionDelete === s.id}
									<div class="danger-zone">
										<p class="note">
											Deleting a section is only possible when it is completely empty. If it
											holds posted items or students, archive it instead -- that keeps every
											record and takes it out of the publish targets.
										</p>
										<label>
											<span>Type the section label ("{s.label}") to confirm</span>
											<input type="text" bind:value={deleteConfirmText} placeholder={s.label} />
										</label>
										<button
											class="btn tiny danger"
											type="button"
											disabled={panelBusy ||
												deleteConfirmText.trim().toLowerCase() !== s.label.trim().toLowerCase()}
											onclick={() => confirmDeleteSection(s)}
										>
											Delete this section
										</button>
										{#if deleteBlocked}
											<p class="feedback error">
												Not deleted -- this section still holds {deleteBlocked}. Archive it
												instead, or remove that content first.
											</p>
										{/if}
									</div>
								{/if}

								<h3>Roster</h3>
								{#if roster.length === 0}
									<p class="note empty-state">
										No students enrolled yet. Add one below or import a CSV.
									</p>
								{:else}
									<div class="roster-rows">
										{#each roster as e (e.student_email)}
											<div class="roster-row" class:inactive={!e.active}>
												<span class="roster-name">{e.display_name}</span>
												<span class="roster-email">{e.student_email}</span>
												<span class="roster-actions">
													<button
														type="button"
														class="btn secondary tiny"
														disabled={panelBusy}
														onclick={() => startEditEnrollment(e)}
													>
														{rosterEditEmail === e.student_email ? 'Close' : 'Edit'}
													</button>
													<button
														type="button"
														class="btn secondary tiny"
														disabled={panelBusy}
														onclick={() => toggleActive(e)}
													>
														{e.active ? 'Deactivate' : 'Reactivate'}
													</button>
												</span>
											</div>
											{#if rosterEditEmail === e.student_email}
												<form
													class="inline-form"
													onsubmit={(ev) => {
														ev.preventDefault();
														saveEnrollment(e);
													}}
												>
													<label>
														<span>Email (fix a typo)</span>
														<input type="email" bind:value={rosterNewEmail} required />
													</label>
													<label>
														<span>Display name</span>
														<input type="text" bind:value={rosterNewName} />
													</label>
													<button class="btn tiny" type="submit" disabled={panelBusy}>
														Save correction
													</button>
												</form>
											{/if}
										{/each}
									</div>
								{/if}

								<form
									class="add-row"
									onsubmit={(e) => {
										e.preventDefault();
										addStudent();
									}}
								>
									<input
										type="email"
										placeholder="student@boscotech.net"
										bind:value={addEmail}
										required
									/>
									<input type="text" placeholder="Display name" bind:value={addName} />
									<button class="btn tiny" type="submit" disabled={panelBusy}>Add</button>
								</form>

								<details class="csv-import">
									<summary>Import roster from CSV</summary>
									<p class="note">
										Columns in order: <code>email, name, course code, section label</code>. A
										header row is fine. Re-running the same file never duplicates anyone.
									</p>
									<input type="file" accept=".csv,text/csv" onchange={readCsvFile} />
									<textarea
										rows="4"
										placeholder={'alice@boscotech.net,Alice Alvarez,IDEA100,Period 1'}
										bind:value={csvText}
									></textarea>
									{#if parsedCsv}
										<p class="note">
											{parsedCsv.rows.length} row{parsedCsv.rows.length === 1 ? '' : 's'} ready.
										</p>
										{#each parsedCsv.errors as err (err)}
											<p class="feedback error">{err}</p>
										{/each}
									{/if}
									<button
										class="btn tiny"
										type="button"
										disabled={importBusy || !parsedCsv || parsedCsv.rows.length === 0}
										onclick={runImport}
									>
										Import {parsedCsv?.rows.length ?? 0} rows
									</button>
									{#if importResult}
										<p class="feedback" class:ok={importResult.refused === 0} class:error={importResult.refused > 0}>
											{importResult.succeeded} imported, {importResult.refused} refused.
										</p>
										{#each importResult.results.filter((r) => !r.ok) as r (r.row)}
											<p class="feedback error">
												Row {r.row} ({r.email}): {r.message ?? importReasonLabel(r.reason)}
											</p>
										{/each}
									{/if}
								</details>

								<h3>Posted here</h3>
								{#if items.length === 0}
									<p class="note empty-state">Nothing posted to this section yet.</p>
								{:else}
									<div class="content-rows">
										{#each items as item (item.id)}
											<div class="content-row">
												<span class="content-main">
													<span class="content-title">
														{itemTitle(item)}
														<span class="kind-chip">{itemKindLabel(item.kind)}</span>
														{#if item.pinned}<span class="kind-chip pinned">Pinned</span>{/if}
														{#if !item.published}<span class="draft-chip">Draft</span>{/if}
													</span>
													<span class="content-when">
														{#if item.kind === 'assignment'}
															Due {formatDue(item.due_at)}
															{#if item.points != null}&nbsp;&middot; {item.points} pts{/if}
															{#if item.category}&nbsp;&middot; {item.category}{/if}
														{:else}
															{shortWhen(item.created_at)}
														{/if}
														{#if item.postings.length > 1}
															&nbsp;&middot; in {item.postings.length} classes
														{/if}
														{#if item.attachments.length}
															&nbsp;&middot; {item.attachments.length} file{item.attachments.length === 1 ? '' : 's'}
														{/if}
													</span>
												</span>
												<span class="content-actions">
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => startEdit(item.id)}>Edit</button>
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => togglePublished(item)}>
														{item.published ? 'Unpublish' : 'Publish'}
													</button>
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => togglePinned(item)}>
														{item.pinned ? 'Unpin' : 'Pin'}
													</button>
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => duplicateItem(item)}>Copy</button>
													<button type="button" class="btn secondary tiny danger" disabled={panelBusy} onclick={() => deleteContent(item.id)}>
														{armDelete === item.id ? 'Really delete?' : 'Delete'}
													</button>
												</span>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</section>
	{/if}

	<ClassroomFeedback
		context="manage"
		meta={{ section_id: selectedSectionId }}
		submit={submitFeedback}
	/>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.manage-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.manage-page > .card {
		margin-bottom: 1.1rem;
	}
	.manage-page h2 {
		margin-top: 0;
	}
	.manage-page h3 {
		margin: 1rem 0 0.4rem;
		font-size: 0.85rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.lead strong {
		color: var(--white);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		padding: 0.4rem 0.65rem;
		border-radius: 5px;
		margin: 0.6rem 0 0;
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.note {
		color: var(--dim);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.empty-state {
		padding: 0.4rem 0;
	}
	.linklike {
		appearance: none;
		background: none;
		border: none;
		padding: 0;
		color: var(--gold);
		cursor: pointer;
		font: inherit;
		text-decoration: underline;
	}
	/* Setup */
	.setup-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 1rem;
	}
	.setup-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.setup-form h3 {
		margin: 0;
	}
	/* Forms */
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	label > span {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--dim);
	}
	input,
	textarea,
	select {
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus,
	select:focus {
		outline: 1px solid var(--focus-ring);
	}
	.inline-form {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 0.7rem;
		margin: 0.3rem 0 0.6rem;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		background: var(--bg2);
	}
	.inline-form .btn {
		align-self: flex-start;
	}
	.check-row {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
	}
	.check-row input {
		width: auto;
		accent-color: var(--green);
	}
	.section-actions {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.danger-zone {
		border: 1px solid var(--crimson);
		border-radius: 6px;
		padding: 0.6rem 0.7rem;
		margin-bottom: 0.6rem;
	}
	.course-rows {
		display: flex;
		flex-direction: column;
	}
	.course-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--line);
	}
	.course-main {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	.course-code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--gold);
	}
	.course-title {
		font-size: 0.9rem;
	}
	.course-row button {
		margin-left: auto;
	}
	.btn.tiny,
	.btn.secondary.tiny {
		font-size: 0.65rem;
		padding: 0.28rem 0.6rem;
	}
	.btn.danger {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	/* Sections list */
	.section-block {
		border: 1px solid var(--line);
		border-radius: 6px;
		margin-bottom: 0.5rem;
	}
	.section-block.open {
		border-color: var(--line-strong);
	}
	.section-head {
		appearance: none;
		background: none;
		border: none;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.8rem;
		color: var(--white);
		cursor: pointer;
		text-align: left;
		flex-wrap: wrap;
	}
	.section-name {
		font-weight: 700;
		font-size: 0.95rem;
	}
	.section-block-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
	}
	.section-caret {
		margin-left: auto;
		color: var(--dim);
	}
	.section-panel {
		padding: 0 0.8rem 0.8rem;
	}
	.roster-rows,
	.content-rows {
		display: flex;
		flex-direction: column;
	}
	.roster-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--line);
	}
	.roster-row:last-child {
		border-bottom: none;
	}
	.roster-row.inactive .roster-name,
	.roster-row.inactive .roster-email {
		color: var(--ice);
		text-decoration: line-through;
	}
	.roster-name {
		font-weight: 700;
		font-size: 0.9rem;
	}
	.roster-email {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
		overflow-wrap: anywhere;
	}
	.roster-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.add-row {
		display: grid;
		grid-template-columns: minmax(10rem, 2fr) minmax(7rem, 1.5fr) auto;
		gap: 0.4rem;
		align-items: center;
		margin-top: 0.5rem;
	}
	.csv-import {
		margin-top: 0.7rem;
		border: 1px dashed var(--line);
		border-radius: 6px;
		padding: 0.5rem 0.7rem;
	}
	.csv-import summary {
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--gold);
	}
	.csv-import textarea {
		margin: 0.4rem 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
	}
	.csv-import input[type='file'] {
		margin-top: 0.4rem;
		font-size: 0.75rem;
	}
	.csv-import code {
		color: var(--cyan);
	}
	.content-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line);
	}
	.content-row:last-child {
		border-bottom: none;
	}
	.content-main {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.content-title {
		font-weight: 700;
		font-size: 0.92rem;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		overflow-wrap: anywhere;
	}
	.content-when {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim);
	}
	.content-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.draft-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.02rem 0.4rem;
	}
	.kind-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		color: var(--cyan);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.02rem 0.4rem;
	}
	.kind-chip.pinned {
		color: var(--gold);
		border-color: var(--gold);
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 560px) {
		.add-row {
			grid-template-columns: 1fr;
		}
		.content-actions,
		.roster-actions,
		.course-row button {
			margin-left: 0;
		}
	}
</style>
