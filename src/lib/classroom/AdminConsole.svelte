<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		emailLocal,
		sectionTitle,
		sortSections,
		type ClassroomAdminTransports,
		type ClassroomCourse,
		type ClassroomSection
	} from '$lib/classroom/classroom';

	/**
	 * The ONE global classroom area, and only the genuinely cross-cutting half:
	 * courses (which are a shared catalog), creating a class, and the doors to
	 * the feedback console and the view-as preview.
	 *
	 * WHAT IS NOT HERE, ON PURPOSE. The old manage console also held every
	 * class's roster, settings and content behind an accordion -- a second place
	 * to do what the class's own tabs now do, and a page you had to leave a class
	 * to reach. Those moved into the section they belong to (People and Class);
	 * this is what genuinely has no single class to live in.
	 *
	 * Presentation + injected transports. `isAdmin` unlocks course EDITING (0082
	 * makes course metadata admin-only because a rename lands on every teacher's
	 * sections at once), and classroom_upsert_course refuses a non-admin edit
	 * regardless -- so this only decides whether a control is worth showing.
	 */
	let {
		ready = true,
		email,
		isAdmin = false,
		initialSections,
		initialCourses,
		transports
	}: {
		ready?: boolean;
		email: string;
		isAdmin?: boolean;
		initialSections: ClassroomSection[];
		initialCourses: ClassroomCourse[];
		transports: ClassroomAdminTransports;
	} = $props();

	type Msg = { ok: boolean; text: string } | null;

	// Seeded ONCE from the load; refreshSections() is the live path afterwards.
	// svelte-ignore state_referenced_locally
	let sections = $state<ClassroomSection[]>([...initialSections]);
	// svelte-ignore state_referenced_locally
	let courses = $state<ClassroomCourse[]>([...initialCourses]);
	const orderedSections = $derived(sortSections(sections));

	let newCourseCode = $state('');
	let newCourseTitle = $state('');
	let newSectionCourseId = $state('');
	let newSectionLabel = $state('');
	let newSectionBlock = $state('');
	let busy = $state(false);
	let msg = $state<Msg>(null);

	async function refreshSections() {
		const res = await transports.reloadSections();
		if (res.ok) {
			sections = res.data.sections;
			courses = res.data.courses;
		}
	}

	async function createCourse() {
		if (busy) return;
		busy = true;
		msg = null;
		const res = await transports.upsertCourse(newCourseCode, newCourseTitle);
		if (res.ok) {
			msg = {
				ok: true,
				text: res.data.created
					? `Course ${newCourseCode.trim().toUpperCase()} created.`
					: 'That course already exists -- pick it in the class form below.'
			};
			newCourseCode = '';
			newCourseTitle = '';
			await refreshSections();
			if (!newSectionCourseId) newSectionCourseId = res.data.courseId;
		} else {
			msg = { ok: false, text: res.message };
		}
		busy = false;
	}

	async function createSection() {
		if (busy) return;
		busy = true;
		msg = null;
		const res = await transports.upsertSection(
			newSectionCourseId,
			newSectionLabel,
			newSectionBlock.trim() || null
		);
		if (res.ok) {
			msg = { ok: true, text: `Class "${newSectionLabel.trim()}" created.` };
			newSectionLabel = '';
			newSectionBlock = '';
			await refreshSections();
		} else {
			msg = { ok: false, text: res.message };
		}
		busy = false;
	}

	// --- Course editing (admin only) --------------------------------------
	let courseEditId = $state<string | null>(null);
	let courseCode = $state('');
	let courseTitle = $state('');
	let courseActive = $state(true);

	function startEditCourse(c: ClassroomCourse) {
		courseEditId = courseEditId === c.id ? null : c.id;
		courseCode = c.code;
		courseTitle = c.title;
		courseActive = c.active;
		msg = null;
	}

	async function saveCourse() {
		if (!courseEditId || busy) return;
		busy = true;
		const res = await transports.upsertCourse(courseCode, courseTitle, courseActive, courseEditId);
		if (res.ok) {
			msg = { ok: true, text: `${courseCode.trim().toUpperCase()} saved.` };
			courseEditId = null;
			await refreshSections();
		} else {
			msg = { ok: false, text: res.message };
		}
		busy = false;
	}
</script>

<svelte:head>
	<title>Courses &amp; setup // IDEA Classroom</title>
</svelte:head>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Classroom</div>
		<h1>Courses &amp; setup</h1>
		<p class="lead">
			Courses and the classes that run them. Signed in as <strong>{emailLocal(email)}</strong>.
			Each class's roster, settings and content live on that class's own tabs.
		</p>
	</section>

	{#if !ready}
		<section class="card">
			<p class="feedback error">
				Classroom is not available yet -- migration 0082 does not appear to be applied.
			</p>
		</section>
	{:else}
		{#if msg}
			<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
		{/if}

		<section class="card">
			<h2>New course or class</h2>
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
						<input type="text" placeholder="Intro to Engineering Design" bind:value={newCourseTitle} />
					</label>
					<button class="btn" type="submit" disabled={busy}>Create course</button>
				</form>
				<form
					class="setup-form"
					onsubmit={(e) => {
						e.preventDefault();
						createSection();
					}}
				>
					<h3>New class</h3>
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
						<span>Class label</span>
						<input type="text" placeholder="Period 1" bind:value={newSectionLabel} required />
					</label>
					<label>
						<span>Block / period (optional)</span>
						<input type="text" placeholder="Block A" bind:value={newSectionBlock} />
					</label>
					<button class="btn" type="submit" disabled={busy || !newSectionCourseId}>
						Create class
					</button>
				</form>
			</div>
		</section>

		<section class="card">
			<h2>Your classes</h2>
			{#if orderedSections.length === 0}
				<p class="note empty-state">
					No classes yet. Create a course and a class above -- each one then carries its own
					content, roster and grades.
				</p>
			{:else}
				<p class="note">
					Open a class to manage it: <strong>Class</strong> for content and units,
					<strong>People</strong> for the roster and settings, <strong>Grades</strong> for marking.
				</p>
				<ul class="section-links">
					{#each orderedSections as s (s.id)}
						<li>
							<a class="section-link" href={`/classroom/${s.id}`} data-testid="admin-section-link">
								<span class="section-name">{sectionTitle(s)}</span>
								{#if s.active === false}<span class="draft-chip">Archived</span>{/if}
							</a>
							<span class="section-jump">
								<a class="btn secondary tiny" href={`/classroom/${s.id}/people`}>People</a>
								<a class="btn secondary tiny" href={`/classroom/${s.id}/grades`}>Grades</a>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if isAdmin}
			<section class="card">
				<h2>Edit courses</h2>
				<p class="note">
					Course code, title and the active flag are shared catalog metadata, so only a site admin
					can change them -- a rename lands on every teacher's classes at once.
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
								<button class="btn tiny" type="submit" disabled={busy}>Save course</button>
							</form>
						{/if}
					{/each}
				</div>
			</section>

			<section class="card">
				<h2>Site tools</h2>
				<p class="note">Things that span every class rather than living in one.</p>
				<div class="tool-links">
					<a class="btn secondary" href="/classroom/feedback">Feedback console</a>
					<a class="btn secondary" href="/classroom/view-as">View as student</a>
				</div>
			</section>
		{/if}
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-panel));
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
		margin: 0;
		font-size: 0.85rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.lead strong {
		color: var(--text-1);
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
	.setup-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.8rem;
	}
	.setup-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
	}
	.section-links {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
	}
	.section-links li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--hairline);
	}
	.section-links li:last-child {
		border-bottom: none;
	}
	.section-link {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		text-decoration: none;
		color: var(--text-1);
		font-weight: 700;
		font-size: 0.95rem;
	}
	.section-link:hover .section-name {
		color: var(--gold);
	}
	.section-jump {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
	}
	.tool-links {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
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
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--hairline);
	}
	.course-row:last-child {
		border-bottom: none;
	}
	.course-main {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	.course-code {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--gold);
	}
	.course-title {
		font-size: 0.92rem;
	}
	.course-row button {
		margin-left: auto;
	}

	/* Forms, moved here from the retired console. */
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
	select {
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	input:focus,
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
		border-radius: var(--radius-card);
		background: var(--surface-2);
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
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 560px) {
		.section-jump {
			margin-left: 0;
		}
		.course-row button {
			margin-left: 0;
		}
	}
</style>
