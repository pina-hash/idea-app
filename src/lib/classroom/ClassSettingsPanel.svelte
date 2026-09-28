<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ClassThemeSettings from '$lib/classroom/ClassThemeSettings.svelte';
	import type { ClassThemeTransports } from '$lib/classroom/class-theme';
	import {
		sectionDeleteBlockedLabel,
		sectionTitle,
		type ClassroomPeopleTransports,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import { formatSectionLabel } from '$lib/section-label';

	/**
	 * ONE CLASS'S OWN SETTINGS: what the class IS (label, block, teacher of
	 * record) and whether it goes on (archive, reactivate, delete). The class's
	 * Settings tab (report R06, 2026-09-28: "it's odd how the class settings are
	 * in the people tab ... it's not the place I would look ... it's confusing
	 * multiple times already").
	 *
	 * MOVED, NOT COPIED. These controls, their handlers and their styles were
	 * the "Class settings" card at the bottom of `PeoplePanel`, which keeps the
	 * roster and the teams; there is one copy of each and it is this one. It is
	 * NOT the header's Display settings (`ClassroomSettings`), which holds one
	 * person's own preferences on every page.
	 *
	 * Presentation + injected transports (the ReviewConsole convention). Nothing
	 * here is a boundary: the route 404s a non-manager, and every RPC behind
	 * these controls re-checks teacher-of-record itself.
	 */
	let {
		section,
		transports,
		onchanged = null,
		ondeleted = null,
		themeTransports = null
	}: {
		section: ClassroomSection;
		/**
		 * The class theme's manager controls (decision 45). Null removes the
		 * card; a deployment without 0225 removes it too, inside the card.
		 */
		themeTransports?: ClassThemeTransports | null;
		transports: Pick<ClassroomPeopleTransports, 'upsertSection' | 'setSectionActive' | 'deleteSection'>;
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

	let editingSection = $state(false);
	// Seeded by startEditSection, which is the only thing that opens the form --
	// so these never hold a stale copy of a section that reloaded underneath.
	let editLabel = $state('');
	let editBlock = $state('');
	let editTeacher = $state('');
	let armSectionDelete = $state(false);
	let deleteConfirmText = $state('');
	let deleteBlocked = $state<string | null>(null);

	const archived = $derived(section.active === false);

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
</script>

<svelte:head>
	<title>Settings &middot; {sectionTitle(section)} // IDEA Classroom</title>
</svelte:head>

<main class="classroom-page cr-instructor-surface" data-testid="class-settings">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA // Classroom'}</div>
		<h1>Settings</h1>
		<p class="section-line">
			{formatSectionLabel(section.label, section.block)}
			{#if section.course?.title}&nbsp;&middot; {section.course.title}{/if}
			{#if archived}&nbsp;&middot; <span class="draft-chip" data-testid="settings-archived-chip">Archived</span>{/if}
		</p>
	</section>

	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok} data-testid="settings-msg">{msg.text}</p>
	{/if}

	<!--
		TWO CARDS SIDE BY SIDE FROM 1100px, one column below it: what the class
		is, and whether it goes on. The page takes the width its sibling tabs
		take (`classroomMeasure`), so moving between People, Grades and Settings
		never moves the tab bar; the sentences inside keep a reading measure.
	-->
	<div class="settings-grid">
		<section class="card" data-testid="settings-details">
			<h2>Class details</h2>
			<dl class="details">
				<div>
					<dt>Class label</dt>
					<dd>{section.label}</dd>
				</div>
				<div>
					<dt>Block / period</dt>
					<dd>{section.block || 'None'}</dd>
				</div>
				<div>
					<dt>Teacher of record</dt>
					<dd>{section.teacher_email}</dd>
				</div>
			</dl>
			<div class="section-actions">
				<!-- `.on` while the form is open (report R15): the key that closes
				     it is lit, so "Close" reads as the way back. -->
				<button
					type="button"
					class="btn secondary tiny"
					class:on={editingSection}
					aria-expanded={editingSection}
					aria-controls={editingSection ? 'class-details-form' : undefined}
					data-testid="settings-edit-details"
					onclick={startEditSection}
				>
					{editingSection ? 'Close' : 'Edit details'}
				</button>
			</div>

			{#if editingSection}
				<form
					id="class-details-form"
					class="inline-form"
					data-testid="settings-details-form"
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
						Handing this class to another @boscotech.edu teacher removes it from your own list, and
						only they (or an admin) can hand it back.
					</p>
					<button class="btn tiny" type="submit" disabled={busy}>Save class</button>
				</form>
			{/if}
		</section>

		<section class="card" data-testid="settings-lifecycle">
			<h2>Archive or delete</h2>
			<!-- WHAT ARCHIVING COSTS, IN WORDS, BEFORE THE PRESS: nothing is lost,
			     and where the class goes. -->
			<p class="note" data-testid="settings-archive-note">
				{#if archived}
					This class is archived. Every post, grade and roster row is kept; it is not offered as a
					class to post to, and it sits under Archived on My Classes and in the header. Reactivate
					puts it back as it was.
				{:else}
					Archiving keeps every post, grade and roster row. The class stops being offered as a class
					to post to and moves under Archived on My Classes and in the header. Reactivate puts it
					back.
				{/if}
			</p>
			<div class="section-actions">
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy}
					data-testid="settings-archive"
					onclick={toggleActive}
				>
					{archived ? 'Reactivate class' : 'Archive class'}
				</button>
				<button
					type="button"
					class="btn secondary tiny danger"
					class:on={armSectionDelete}
					aria-expanded={armSectionDelete}
					aria-controls={armSectionDelete ? 'class-delete-zone' : undefined}
					disabled={busy}
					data-testid="settings-delete"
					onclick={() => {
						armSectionDelete = !armSectionDelete;
						deleteConfirmText = '';
						deleteBlocked = null;
					}}
				>
					{armSectionDelete ? 'Cancel delete' : 'Delete class'}
				</button>
			</div>

			{#if armSectionDelete}
				<div class="danger-zone" id="class-delete-zone" data-testid="settings-delete-zone">
					<p class="note">
						Deleting is only possible when the class is completely empty. If it holds posted items or
						students, archive it instead, which keeps every record and takes it out of the classes
						you post to.
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
							Not deleted. This class still holds {deleteBlocked}. Archive it instead, or remove
							that content first.
						</p>
					{/if}
				</div>
			{/if}
		</section>

		{#if themeTransports && section.course_id}
			<ClassThemeSettings
				sectionId={section.id}
				courseId={section.course_id}
				transports={themeTransports}
				{onchanged}
			/>
		{/if}
	</div>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/* The width its sibling tabs take (nav.ts `classroomMeasure` answers
	   `split` for `settings`), so the chrome above does not move between
	   People, Grades and Settings. */
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.classroom-page h2 {
		margin-top: 0;
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
		max-width: var(--measure-reading);
	}
	/* One column, then two cards side by side where both fit a form's
	   width (the People tab's own breakpoint). */
	.settings-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.1rem var(--space-5);
		align-items: start;
	}
	@media (min-width: 1100px) {
		.settings-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.settings-grid > .card {
		min-width: 0;
		margin: 0;
	}
	.details {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin: 0 0 0.8rem;
	}
	.details > div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.8rem;
		min-width: 0;
	}
	.details dt {
		flex: 0 0 9.5rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.details dd {
		margin: 0;
		min-width: 0;
		color: var(--text-1);
		/* A teacher's address has no space to break at. */
		overflow-wrap: anywhere;
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

	/* Forms: moved here verbatim from the People tab, which held these controls
	   before the Settings tab existed. */
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
	input {
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
	input:focus {
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
</style>
