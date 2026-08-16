<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import AssignmentEngine from '$lib/classroom/AssignmentEngine.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import ClassroomFeedback from '$lib/classroom/ClassroomFeedback.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import DeckPanel from '$lib/classroom/DeckPanel.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import LinkPreviewCard from '$lib/classroom/LinkPreviewCard.svelte';
	import ReferenceDoc from '$lib/classroom/ReferenceDoc.svelte';
	import RevisionHistory from '$lib/classroom/RevisionHistory.svelte';
	import RubricBuilder from '$lib/classroom/RubricBuilder.svelte';
	import SpecImporter from '$lib/classroom/SpecImporter.svelte';
	import type { ReferenceSpec, ReferenceTransports } from '$lib/classroom/reference-spec';
	import type { RevisionTransports } from '$lib/classroom/revisions';
	import type { ClassroomDeck, DeckTransports } from '$lib/classroom/deck';
	import type {
		AssignmentEngineTransports,
		AssignmentSpec,
		AssignmentTeacherTransports,
		RubricCriterion,
		StudentEngineData
	} from '$lib/classroom/assignment-spec';
	import {
		authorLabel,
		editedWhen,
		formatDue,
		instructorAttachmentSrc,
		isScheduled,
		isUpdatedForViewer,
		itemKindLabel,
		itemTitle,
		scheduleLabel,
		sectionTitle,
		shortWhen,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomSection,
		type LinkPreview
	} from '$lib/classroom/classroom';
	import type { FeedbackEntry } from '$lib/feedback/feedback';

	/**
	 * One classroom item in full: an assignment, a material, or an announcement
	 * opened on its own page.
	 *
	 * Replaces the 0082-era AssignmentDetail. There is one canonical record with
	 * a `kind` now, so one page serves all three -- the differences are which
	 * chips render (points and a due date are assignment vocabulary) and what the
	 * engine slot says, not three copies of the same layout.
	 *
	 * OPENING THIS PAGE IS WHAT CLEARS THE "UPDATED" BADGE: the student is
	 * looking at the current version, which is exactly what the badge was asking
	 * them to do. The write is fire-and-forget -- nobody should wait on a
	 * bookkeeping row -- and the badge clears locally on the same tick.
	 */
	let {
		section,
		item,
		sections = [],
		canManage = false,
		transports = null,
		attachmentsEnabled = true,
		basePath = '/classroom',
		viewAs = null,
		fetchPreview = null,
		submitFeedback = null,
		onchanged = null,
		ondeleted = null,
		engine = null,
		engineTransports = null,
		spec = null,
		rubric = null,
		teacherTransports = null,
		gradeHref = null,
		referenceSpec = null,
		referenceTransports = null,
		deck = null,
		deckTransports = null,
		revisionTransports = null
	}: {
		section: ClassroomSection;
		item: ClassroomItem;
		sections?: ClassroomSection[];
		canManage?: boolean;
		transports?: ClassroomComposerTransports | null;
		attachmentsEnabled?: boolean;
		basePath?: string;
		viewAs?: string | null;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		submitFeedback?: ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null;
		onchanged?: (() => void | Promise<void>) | null;
		ondeleted?: (() => void) | null;
		/** The STUDENT engine slice + its transports (assignments only). */
		engine?: StudentEngineData | null;
		engineTransports?: AssignmentEngineTransports | null;
		/** The teacher tools' data + transports (assignments only). */
		spec?: AssignmentSpec | null;
		rubric?: RubricCriterion[] | null;
		teacherTransports?: AssignmentTeacherTransports | null;
		gradeHref?: string | null;
		/**
		 * The reference document on a MATERIAL (0092), when it has one. Present
		 * = this material renders as a structured document; absent = it renders
		 * its written details exactly as every material always has.
		 */
		referenceSpec?: ReferenceSpec | null;
		referenceTransports?: ReferenceTransports | null;
		/**
		 * The item's presentation deck (0101). Null = it has none; a manager
		 * still gets the upload control, a student gets nothing at all.
		 * DELIBERATELY NOT PASSED IN VIEW-AS: classroom_view_as_section's payload
		 * carries no deck, exactly as it carries no notebook check-in, so the
		 * panel simply does not render there rather than an admin's own read
		 * being shown under a student's name.
		 */
		deck?: ClassroomDeck | null;
		deckTransports?: DeckTransports | null;
		/**
		 * The item's content history (0110). Manager-only, and absent rather
		 * than empty where it does not apply -- view-as carries none, exactly as
		 * it carries no deck: previewing what a STUDENT sees must not include a
		 * teacher's drafts.
		 */
		revisionTransports?: RevisionTransports | null;
	} = $props();

	let editing = $state(false);
	let armDelete = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let seen = $state(false);

	const editable = $derived(canManage && !!transports);
	const showUpdated = $derived(!seen && isUpdatedForViewer(item));
	// instructorAttachments/instructorLinks are only ever loaded (non-undefined)
	// for a manager's own read (see transports.ts's mergeInstructorMaterials),
	// but this section ALSO gates on canManage directly -- a belt-and-braces
	// rule, not a redundancy: undefined vs [] is a loading detail, never the
	// security boundary.
	const instructorAttachments = $derived(canManage ? (item.instructorAttachments ?? []) : []);
	const instructorLinks = $derived(canManage ? (item.instructorLinks ?? []) : []);
	const hasInstructorMaterial = $derived(instructorAttachments.length > 0 || instructorLinks.length > 0);
	const alsoIn = $derived(
		item.postings
			.filter((p) => p.section_id !== section.id)
			.map((p) => sections.find((s) => s.id === p.section_id))
			.filter((s): s is ClassroomSection => !!s)
	);

	$effect(() => {
		const id = item.id;
		const write = transports;
		if (canManage || !write || seen) return;
		// Deferred: see the note on ClassPage's effect -- a state write (or a
		// transport that makes one before its first await) must not land while
		// this render is still settling.
		queueMicrotask(() => {
			seen = true;
			void write.markViewed(id);
		});
	});

	async function remove() {
		if (!transports) return;
		if (!armDelete) {
			armDelete = true;
			return;
		}
		armDelete = false;
		busy = true;
		error = null;
		const res = await transports.deleteItem(item.id);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		ondeleted?.();
	}

	async function togglePin() {
		if (!transports) return;
		busy = true;
		error = null;
		const res = await transports.setPinned(item.id, !item.pinned);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		await onchanged?.();
	}

	async function duplicate() {
		if (!transports) return;
		busy = true;
		error = null;
		const res = await transports.duplicateItem(item.id);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		notice = 'Copied as a new draft in this class. Find it under Classwork to edit and post it.';
		await onchanged?.();
	}

	async function saved() {
		editing = false;
		await onchanged?.();
	}
</script>

<svelte:head>
	<title>{itemTitle(item)} // {sectionTitle(section)}</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href={`${basePath}/${section.id}`}>&lsaquo; {sectionTitle(section)}</a>
		<ProfileMenu />
	</div>
</div>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">{itemKindLabel(item.kind)}</div>
		<h1>{itemTitle(item)}</h1>
		<p class="meta-line">
			{#if item.kind === 'assignment'}
				Due {formatDue(item.due_at)}
				{#if item.points != null}&nbsp;&middot; {item.points} pts{/if}
				{#if item.category}&nbsp;&middot; {item.category}{/if}
				&nbsp;&middot;
			{/if}
			Posted {shortWhen(item.created_at)} by {authorLabel(item.author_name, item.author_email)}
		</p>
		<p class="chip-line">
			{#if item.pinned}<span class="chip pin-chip">Pinned</span>{/if}
			{#if canManage && !item.published}<span class="draft-chip">Draft</span>{:else if canManage && isScheduled(item)}<span class="sched-chip" title="Students see this from {scheduleLabel(item)}">Scheduled &middot; {scheduleLabel(item)}</span>{/if}
			{#if canManage && item.is_public}<span class="chip pin-chip">Public link</span>{/if}
			{#if showUpdated}<span class="chip updated-chip">Updated</span>{/if}
		</p>
		{#if item.edited_at}
			<p class="edited-line">Last updated {editedWhen(item.edited_at)}</p>
		{/if}
	</section>

	{#if error}<p class="feedback error">{error}</p>{/if}
	{#if notice}<p class="feedback ok">{notice}</p>{/if}

	{#if editable}
		<section class="card actions-card">
			<span class="card-actions">
				<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => (editing = !editing)}>
					{editing ? 'Close editor' : 'Edit'}
				</button>
				<button type="button" class="btn secondary tiny" disabled={busy} onclick={togglePin}>
					{item.pinned ? 'Unpin' : 'Pin'}
				</button>
				<button type="button" class="btn secondary tiny" disabled={busy} onclick={duplicate}>Copy</button>
				<button type="button" class="btn secondary tiny danger" disabled={busy} onclick={remove}>
					{armDelete ? 'Really delete?' : 'Delete'}
				</button>
			</span>
			{#if alsoIn.length}
				<p class="also-line">
					Also posted to {alsoIn.map((s) => sectionTitle(s)).join(', ')} -- one shared copy, so an
					edit here changes all of them.
				</p>
			{/if}
			{#if editing}
				{#key item.id}
					<ContentComposer
						mode="edit"
						{item}
						{sections}
						transports={transports!}
						{attachmentsEnabled}
						{deck}
						{deckTransports}
						{spec}
						{teacherTransports}
						compact
						onsaved={saved}
						oncancel={() => (editing = false)}
					/>
				{/key}
			{/if}
		</section>
	{/if}

	<!-- The deck sits ABOVE the written content on purpose: when an item has one
	     it is the thing the class is looking at, and the instructions are what
	     goes with it. Renders nothing at all for a student on an item with no
	     deck. -->
	<DeckPanel
		{deck}
		itemId={item.id}
		sectionId={section.id}
		{basePath}
		{canManage}
		transports={deckTransports}
		{onchanged}
	/>

	<!-- A MATERIAL WITH A REFERENCE DOCUMENT RENDERS THE DOCUMENT. Without one it
	     renders its written details exactly as every material always has, which
	     is what keeps every pre-0092 material untouched.

	     THE WRITTEN BODY IS NOT SWALLOWED BY THE DOCUMENT. It used to be: the
	     two were an if/else, so attaching a reference document silently hid
	     whatever the teacher had already written on the item -- with no warning,
	     and no way to see it again short of detaching the document. They answer
	     different questions ("what is this and why am I being given it" vs. the
	     reference itself), so the body goes ABOVE, where it reads as the
	     introduction it is. -->
	{#if item.body.trim()}
		<section class="card">
			<h2 class="section-label">
				{item.kind === 'assignment' ? 'Instructions' : 'Details'}
			</h2>
			<ItemBody {item} />
		</section>
	{/if}

	{#if referenceSpec}
		<section class="card ref-card">
			<ReferenceDoc spec={referenceSpec} {fetchPreview} showHeader={false} />
		</section>
	{/if}

	{#if item.links.length}
		<section class="card">
			<h2 class="section-label">Links</h2>
			<div class="link-list">
				{#each item.links as l (l.id ?? l.url)}
					<LinkPreviewCard link={l} {fetchPreview} />
				{/each}
			</div>
		</section>
	{/if}

	{#if item.attachments.length}
		<section class="card">
			<h2 class="section-label">Files</h2>
			<AttachmentList attachments={item.attachments} {viewAs} />
		</section>
	{/if}

	{#if canManage && hasInstructorMaterial}
		<section class="card instructor-card">
			<h2 class="section-label instructor-section-label">
				<span class="lock-glyph" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
						<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
					</svg>
				</span>
				Instructor only
			</h2>
			<p class="note instructor-note">Visible only to this item's teachers of record and admins.</p>
			{#if instructorLinks.length}
				<div class="link-list">
					{#each instructorLinks as l (l.id ?? l.url)}
						<LinkPreviewCard link={l} {fetchPreview} />
					{/each}
				</div>
			{/if}
			{#if instructorAttachments.length}
				<AttachmentList
					attachments={instructorAttachments}
					resolveSrc={(a) => instructorAttachmentSrc(a.id)}
				/>
			{/if}
		</section>
	{/if}

	{#if item.kind === 'material' && canManage && referenceTransports}
		<section class="card engine-tools">
			<h2 class="section-label">Reference document</h2>
			<SpecImporter
				kind="reference"
				itemId={item.id}
				spec={referenceSpec}
				isPublic={item.is_public === true}
				attachmentCount={item.attachments.length}
				transports={referenceTransports}
				onchanged={() => onchanged?.()}
			/>
		</section>
	{/if}

	{#if item.kind === 'assignment'}
		{#if canManage && teacherTransports}
			<section class="card engine-tools">
				<h2 class="section-label">Assignment engine</h2>
				<SpecImporter
					kind="assignment"
					itemId={item.id}
					{spec}
					transports={teacherTransports}
					onchanged={() => onchanged?.()}
				/>
				<hr class="tool-rule" />
				<RubricBuilder
					itemId={item.id}
					criteria={rubric}
					{spec}
					transports={teacherTransports}
					onchanged={() => onchanged?.()}
				/>
				{#if gradeHref}
					<hr class="tool-rule" />
					<a class="btn tiny" href={gradeHref}>Open grading console</a>
				{/if}
			</section>
		{:else if engine && engineTransports}
			<section class="engine-host">
				<h2 class="section-label">Your work</h2>
				{#key item.id}
					<AssignmentEngine {item} data={engine} transports={engineTransports} uploadEnabled={attachmentsEnabled} />
				{/key}
			</section>
		{:else}
			<section class="card engine-slot">
				<h2 class="section-label">Handing this in</h2>
				<p class="note">
					{#if viewAs}
						Submission tools are hidden while viewing as a student.
					{:else}
						<!-- NOT "not available right now", which read as an outage and left a
						     student waiting for a form that was never coming. This assignment
						     genuinely has no online hand-in; the instructions say where the
						     work goes. -->
						This assignment has no online hand-in. Follow the instructions above --
						your teacher has said there how to turn this one in.
					{/if}
				</p>
			</section>
		{/if}
	{/if}

	{#if canManage && revisionTransports}
		<section class="card">
			<RevisionHistory
				itemId={item.id}
				transports={revisionTransports}
				onchanged={() => onchanged?.()}
			/>
		</section>
	{/if}

	<ClassroomFeedback
		context="item"
		meta={{
			section_id: section.id,
			section: sectionTitle(section),
			item_id: item.id,
			kind: item.kind
		}}
		submit={submitFeedback}
	/>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/* Spacing only: the look lives in classroom.css. */
	.feedback {
		margin: 0 0 0.8rem;
	}

	.classroom-page {
		max-width: 46rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.meta-line,
	.edited-line {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-2);
		margin: 0.2rem 0 0;
	}
	.chip-line {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: 0.4rem 0 0;
	}
	.section-label {
		margin: 0 0 var(--space-2);
		font-size: 0.85rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.link-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.card {
		margin-bottom: 0.9rem;
	}
	.instructor-card {
		border: 1px dashed var(--gold);
	}
	.instructor-section-label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--gold);
	}
	.instructor-note {
		margin: 0 0 0.6rem;
	}
	.lock-glyph {
		display: inline-flex;
		width: 0.85rem;
		height: 0.85rem;
	}
	.lock-glyph svg {
		width: 100%;
		height: 100%;
	}
	.card-actions {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.also-line {
		margin: var(--space-2) 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.engine-slot {
		border-style: dashed;
	}
	.ref-card {
		padding-top: 0.6rem;
	}
	.engine-tools {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.engine-host {
		margin-bottom: 0.9rem;
	}
	.engine-tools .btn.tiny {
		align-self: flex-start;
	}
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0;
	}
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--cyan);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		white-space: nowrap;
	}
	.pin-chip {
		color: var(--gold);
		border-color: var(--gold);
	}
	.updated-chip {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
