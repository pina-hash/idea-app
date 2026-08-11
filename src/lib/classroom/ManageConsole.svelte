<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		emailLocal,
		formatDue,
		importReasonLabel,
		isoToLocalInput,
		localInputToIso,
		parseRosterCsv,
		sectionTitle,
		shortWhen,
		sortSections,
		type ClassroomAssignment,
		type ClassroomCourse,
		type ClassroomEnrollment,
		type ClassroomManageTransports,
		type ClassroomPost,
		type ClassroomSection,
		type ImportSummary
	} from '$lib/classroom/classroom';

	/**
	 * The teacher console: courses + sections setup, the post/assignment
	 * composer with multi-section publish, and per-section roster (with CSV
	 * import) + content management. Presentation + orchestration only -- every
	 * server call goes through the INJECTED transports (the ReviewConsole
	 * convention), so /dev/classroom mounts this same component against an
	 * in-memory store. The transports are thin callers of the 0082 SECURITY
	 * DEFINER RPCs; nothing here is a boundary.
	 */
	let {
		ready = true,
		email,
		initialSections,
		initialCourses,
		transports
	}: {
		ready?: boolean;
		email: string;
		initialSections: ClassroomSection[];
		initialCourses: ClassroomCourse[];
		transports: ClassroomManageTransports;
	} = $props();

	type Msg = { ok: boolean; text: string } | null;

	// Seeded ONCE from the load's data on purpose; refreshSections() is the
	// live path afterwards (the CoinDeskTool initialSections convention).
	// svelte-ignore state_referenced_locally
	let sections = $state<ClassroomSection[]>([...initialSections]);
	// svelte-ignore state_referenced_locally
	let courses = $state<ClassroomCourse[]>([...initialCourses]);
	const orderedSections = $derived(sortSections(sections));

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

	// --- Composer ---------------------------------------------------------
	let composerKind = $state<'post' | 'assignment'>('post');
	let editing = $state<{ kind: 'post' | 'assignment'; id: string; sectionId: string } | null>(null);
	let postTitle = $state('');
	let postBody = $state('');
	let asgTitle = $state('');
	let asgDescription = $state('');
	// bind:value on <input type="number"> COERCES to a number (the
	// ReviewConsole unit-field lesson), so this is string | number and every
	// read goes through String().
	let asgPoints = $state<string | number>('');
	let asgDue = $state('');
	let asgCategory = $state('');
	let resources = $state<{ label: string; url: string }[]>([]);
	let targets = $state<Record<string, boolean>>({});
	let composerBusy = $state(false);
	let composerMsg = $state<Msg>(null);

	const targetIds = $derived(orderedSections.filter((s) => targets[s.id]).map((s) => s.id));

	function resetComposer() {
		editing = null;
		postTitle = '';
		postBody = '';
		asgTitle = '';
		asgDescription = '';
		asgPoints = '';
		asgDue = '';
		asgCategory = '';
		resources = [];
		composerMsg = null;
	}

	function assignmentInput() {
		const rawPoints = String(asgPoints ?? '').trim();
		const pts = rawPoints === '' ? null : Number.parseInt(rawPoints, 10);
		return {
			title: asgTitle,
			description: asgDescription,
			points: Number.isNaN(pts as number) ? null : pts,
			dueAt: localInputToIso(asgDue),
			category: asgCategory.trim() || null,
			resources: resources
				.map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
				.filter((r) => r.url !== '')
		};
	}

	async function submitComposer(publish: boolean) {
		if (composerBusy) return;
		composerBusy = true;
		composerMsg = null;
		try {
			await runSubmit(publish);
		} finally {
			// Whatever happens, the buttons come back -- a stuck busy flag is a
			// silently wedged console (found live: the number-input coercion
			// throw left both buttons disabled forever).
			composerBusy = false;
		}
	}

	async function runSubmit(publish: boolean) {
		let res;
		if (editing) {
			res =
				editing.kind === 'post'
					? await transports.updatePost(editing.id, postBody, postTitle.trim() || null, publish)
					: await transports.updateAssignment(editing.id, assignmentInput(), publish);
		} else if (targetIds.length === 0) {
			res = { ok: false as const, message: 'Pick at least one section to publish to.' };
		} else {
			res =
				composerKind === 'post'
					? await transports.createPost(targetIds, postBody, postTitle.trim() || null, publish)
					: await transports.createAssignment(targetIds, assignmentInput(), publish);
		}
		if (res.ok) {
			const what = (editing?.kind ?? composerKind) === 'post' ? 'Post' : 'Assignment';
			const where = editing
				? 'updated'
				: `${publish ? 'published' : 'saved as a draft'} to ${targetIds.length} section${targetIds.length === 1 ? '' : 's'}`;
			const text = `${what} ${editing ? (publish ? 'updated and published' : 'updated (draft)') : where}.`;
			// Reset FIRST, then set the confirmation: resetComposer() clears
			// composerMsg, so the other order flashes the success away on the
			// same tick (the coin-desk runLookup lesson).
			resetComposer();
			composerMsg = { ok: true, text };
			if (selectedSectionId) await loadSelectedContent();
		} else {
			composerMsg = { ok: false, text: res.message };
		}
	}

	function startEditPost(p: ClassroomPost) {
		composerKind = 'post';
		editing = { kind: 'post', id: p.id, sectionId: p.section_id };
		postTitle = p.title ?? '';
		postBody = p.body;
		composerMsg = null;
		document.getElementById('classroom-composer')?.scrollIntoView({ block: 'start' });
	}

	function startEditAssignment(a: ClassroomAssignment) {
		composerKind = 'assignment';
		editing = { kind: 'assignment', id: a.id, sectionId: a.section_id };
		asgTitle = a.title;
		asgDescription = a.description;
		asgPoints = a.points == null ? '' : String(a.points);
		asgDue = isoToLocalInput(a.due_at);
		asgCategory = a.category ?? '';
		resources = a.resources.map((r) => ({ label: r.label, url: r.url }));
		composerMsg = null;
		document.getElementById('classroom-composer')?.scrollIntoView({ block: 'start' });
	}

	// --- Selected section: roster + content -------------------------------
	let selectedSectionId = $state<string | null>(null);
	const selectedSection = $derived(sections.find((s) => s.id === selectedSectionId) ?? null);
	let roster = $state<ClassroomEnrollment[]>([]);
	let posts = $state<ClassroomPost[]>([]);
	let assignments = $state<ClassroomAssignment[]>([]);
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
			posts = res.data.posts;
			assignments = res.data.assignments;
		} else {
			panelMsg = { ok: false, text: res.message };
		}
	}

	// Roster add + toggle
	let addEmail = $state('');
	let addName = $state('');

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

	// Content actions
	async function togglePostPublished(p: ClassroomPost) {
		if (panelBusy) return;
		panelBusy = true;
		const res = await transports.updatePost(p.id, p.body, p.title, !p.published);
		if (!res.ok) panelMsg = { ok: false, text: res.message };
		await loadSelectedContent();
		panelBusy = false;
	}

	async function toggleAssignmentPublished(a: ClassroomAssignment) {
		if (panelBusy) return;
		panelBusy = true;
		const res = await transports.updateAssignment(
			a.id,
			{
				title: a.title,
				description: a.description,
				points: a.points,
				dueAt: a.due_at,
				category: a.category,
				resources: a.resources.map((r) => ({ label: r.label, url: r.url }))
			},
			!a.published
		);
		if (!res.ok) panelMsg = { ok: false, text: res.message };
		await loadSelectedContent();
		panelBusy = false;
	}

	async function deleteContent(kind: 'post' | 'assignment', id: string) {
		const key = `${kind}:${id}`;
		if (armDelete !== key) {
			armDelete = key;
			return;
		}
		armDelete = null;
		panelBusy = true;
		const res =
			kind === 'post' ? await transports.deletePost(id) : await transports.deleteAssignment(id);
		if (!res.ok) panelMsg = { ok: false, text: res.message };
		if (editing?.id === id) resetComposer();
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
		</section>

		<!-- 2. Composer -->
		<section class="card" id="classroom-composer">
			<h2>{editing ? `Edit ${editing.kind}` : 'Compose'}</h2>
			{#if !editing}
				<div class="kind-toggle" role="tablist" aria-label="Content type">
					<button
						type="button"
						class="kind"
						class:active={composerKind === 'post'}
						onclick={() => (composerKind = 'post')}
					>
						Announcement
					</button>
					<button
						type="button"
						class="kind"
						class:active={composerKind === 'assignment'}
						onclick={() => (composerKind = 'assignment')}
					>
						Assignment
					</button>
				</div>
			{:else}
				<p class="note">
					Editing the copy in <strong>{sectionTitle(sections.find((s) => s.id === editing?.sectionId) ?? sections[0] ?? { id: '', course_id: '', label: '?', block: null, teacher_email: '', course: null })}</strong>.
					A multi-section publish made one copy per section; edits apply to this one.
					<button type="button" class="linklike" onclick={resetComposer}>Cancel editing</button>
				</p>
			{/if}

			{#if (editing?.kind ?? composerKind) === 'post'}
				<label>
					<span>Title (optional)</span>
					<input type="text" bind:value={postTitle} placeholder="Welcome to class" />
				</label>
				<label>
					<span>Announcement</span>
					<textarea rows="4" bind:value={postBody} placeholder="Share something with your class..."
					></textarea>
				</label>
			{:else}
				<label>
					<span>Title</span>
					<input type="text" bind:value={asgTitle} placeholder="Bridge sketch" />
				</label>
				<label>
					<span>Instructions (plain text)</span>
					<textarea rows="5" bind:value={asgDescription} placeholder="What to do, step by step..."
					></textarea>
				</label>
				<div class="field-row">
					<label>
						<span>Points</span>
						<input type="number" min="0" max="10000" bind:value={asgPoints} placeholder="20" />
					</label>
					<label>
						<span>Due date</span>
						<input type="datetime-local" bind:value={asgDue} />
					</label>
					<label>
						<span>Grading category</span>
						<input type="text" bind:value={asgCategory} placeholder="Unit Labs" />
					</label>
				</div>
				<div class="resources-editor">
					<span class="mini-label">Linked materials</span>
					{#each resources as r, i (i)}
						<div class="resource-row">
							<input type="text" placeholder="Label" bind:value={r.label} />
							<input type="url" placeholder="https://..." bind:value={r.url} />
							<button
								type="button"
								class="btn secondary tiny"
								aria-label="Remove resource"
								onclick={() => (resources = resources.filter((_, j) => j !== i))}
							>
								&times;
							</button>
						</div>
					{/each}
					<button
						type="button"
						class="btn secondary tiny"
						onclick={() => (resources = [...resources, { label: '', url: '' }])}
					>
						+ Add link
					</button>
				</div>
			{/if}

			{#if !editing}
				<div class="target-picker">
					<span class="mini-label">Publish to</span>
					{#if orderedSections.length === 0}
						<p class="note">Create a section above first.</p>
					{:else}
						<div class="target-list">
							{#each orderedSections as s (s.id)}
								<label class="target-check">
									<input type="checkbox" bind:checked={targets[s.id]} />
									<span>{sectionTitle(s)}</span>
								</label>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="composer-actions">
				<button class="btn" type="button" disabled={composerBusy} onclick={() => submitComposer(true)}>
					{editing ? 'Save & publish' : 'Publish'}
				</button>
				<button
					class="btn secondary"
					type="button"
					disabled={composerBusy}
					onclick={() => submitComposer(false)}
				>
					Save draft
				</button>
			</div>
			{#if composerMsg}
				<p class="feedback" class:ok={composerMsg.ok} class:error={!composerMsg.ok}>
					{composerMsg.text}
				</p>
			{/if}
		</section>

		<!-- 3. Sections: roster + content -->
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
							<span class="section-caret">{selectedSectionId === s.id ? '▾' : '▸'}</span>
						</button>

						{#if selectedSectionId === s.id}
							<div class="section-panel">
								{#if panelMsg}
									<p class="feedback" class:ok={panelMsg.ok} class:error={!panelMsg.ok}>
										{panelMsg.text}
									</p>
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
												<button
													type="button"
													class="btn secondary tiny"
													disabled={panelBusy}
													onclick={() => toggleActive(e)}
												>
													{e.active ? 'Deactivate' : 'Reactivate'}
												</button>
											</div>
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

								<h3>Posts</h3>
								{#if posts.length === 0}
									<p class="note empty-state">No posts in this section yet.</p>
								{:else}
									<div class="content-rows">
										{#each posts as p (p.id)}
											<div class="content-row">
												<span class="content-main">
													<span class="content-title">
														{p.title ?? p.body.slice(0, 60)}
														{#if !p.published}<span class="draft-chip">Draft</span>{/if}
													</span>
													<span class="content-when">{shortWhen(p.created_at)}</span>
												</span>
												<span class="content-actions">
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => startEditPost(p)}>Edit</button>
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => togglePostPublished(p)}>
														{p.published ? 'Unpublish' : 'Publish'}
													</button>
													<button type="button" class="btn secondary tiny danger" disabled={panelBusy} onclick={() => deleteContent('post', p.id)}>
														{armDelete === `post:${p.id}` ? 'Really delete?' : 'Delete'}
													</button>
												</span>
											</div>
										{/each}
									</div>
								{/if}

								<h3>Assignments</h3>
								{#if assignments.length === 0}
									<p class="note empty-state">No assignments in this section yet.</p>
								{:else}
									<div class="content-rows">
										{#each assignments as a (a.id)}
											<div class="content-row">
												<span class="content-main">
													<span class="content-title">
														{a.title}
														{#if !a.published}<span class="draft-chip">Draft</span>{/if}
													</span>
													<span class="content-when">
														Due {formatDue(a.due_at)}
														{#if a.points != null}&nbsp;&middot; {a.points} pts{/if}
														{#if a.category}&nbsp;&middot; {a.category}{/if}
													</span>
												</span>
												<span class="content-actions">
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => startEditAssignment(a)}>Edit</button>
													<button type="button" class="btn secondary tiny" disabled={panelBusy} onclick={() => toggleAssignmentPublished(a)}>
														{a.published ? 'Unpublish' : 'Publish'}
													</button>
													<button type="button" class="btn secondary tiny danger" disabled={panelBusy} onclick={() => deleteContent('assignment', a.id)}>
														{armDelete === `assignment:${a.id}` ? 'Really delete?' : 'Delete'}
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
	label > span,
	.mini-label {
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
	.field-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.6rem;
	}
	.kind-toggle {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
	}
	.kind {
		appearance: none;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.9rem;
		cursor: pointer;
	}
	.kind.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.resources-editor {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0.4rem 0 0.6rem;
	}
	.resource-row {
		display: grid;
		grid-template-columns: minmax(6rem, 1fr) minmax(8rem, 2fr) auto;
		gap: 0.4rem;
		align-items: center;
	}
	.target-picker {
		margin: 0.6rem 0;
	}
	.target-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		margin-top: 0.35rem;
	}
	.target-check {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		margin: 0;
		cursor: pointer;
	}
	.target-check input {
		width: auto;
		accent-color: var(--green);
	}
	.target-check span {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--white);
		letter-spacing: 0;
	}
	.composer-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
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
	.roster-row button {
		margin-left: auto;
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
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 560px) {
		.add-row,
		.resource-row {
			grid-template-columns: 1fr;
		}
		.content-actions,
		.roster-row button {
			margin-left: 0;
		}
	}
</style>
