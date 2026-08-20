<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import AssignmentEngine from '$lib/classroom/AssignmentEngine.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import CheckInStager from '$lib/classroom/CheckInStager.svelte';
	import ClassroomFeedback from '$lib/classroom/ClassroomFeedback.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import DeckPanel from '$lib/classroom/DeckPanel.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import LinkPreviewCard from '$lib/classroom/LinkPreviewCard.svelte';
	import ReferenceDoc from '$lib/classroom/ReferenceDoc.svelte';
	import RevisionHistory from '$lib/classroom/RevisionHistory.svelte';
	import RubricBuilder from '$lib/classroom/RubricBuilder.svelte';
	import SpecImporter from '$lib/classroom/SpecImporter.svelte';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import type { ReferenceSpec, ReferenceTransports } from '$lib/classroom/reference-spec';
	import { flagReasonLabel } from '$lib/notebook';
	import {
		checkInHref,
		checkInMeta,
		checkInStatusLabel,
		checkInTone,
		type CheckInDraft,
		type ClassCheckIn,
		type ClassCheckInTransports
	} from '$lib/classroom/class-check-ins';
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
	import { itemInspector, toggleItemInspector } from '$lib/classroom/inspector.svelte';

	/**
	 * One classroom item in full: an assignment, a material, or an announcement
	 * opened on its own page.
	 *
	 * Replaces the 0082-era AssignmentDetail. There is one canonical record with
	 * a `kind` now, so one page serves all three -- the differences are which
	 * chips render (points and a due date are assignment vocabulary) and what the
	 * engine slot says, not three copies of the same layout.
	 *
	 * THE GOVERNING RULE: AN INSTRUCTOR'S VIEW IS THE STUDENT VIEW PLUS EDIT
	 * AFFORDANCES, NEVER A DIFFERENT ARRANGEMENT.
	 *
	 * So the reading order below is exactly the student's -- title and the chips
	 * a student can see, the deck, the body, the reference document, links,
	 * files, then the engine -- and every instructor-only affordance lives in ONE
	 * inspector region above it. Before this, an instructor opening an item was
	 * met with an actions card, a deck uploader, two spec importers, a rubric
	 * builder and a revision history interleaved with the content, and could not
	 * tell by looking what a student would actually be reading.
	 *
	 * THE INSPECTOR IS ONE `{#if canManage}`. Every block inside it keeps its own
	 * original gate unchanged, so the region is a second, outer guard rather than
	 * a replacement for any of them -- which is what makes "nothing
	 * instructor-only escaped into the student path" checkable by reading one
	 * line instead of nine.
	 *
	 * ONE DELIBERATE EXCEPTION, and it is the rule rather than a hole in it: the
	 * DECK. A deck is content -- a student with one opens it -- so the open link
	 * stays in the reading order for everybody and only its upload/replace/remove
	 * controls move into the inspector. See DeckPanel's `mode` prop.
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
		revisionTransports = null,
		checkIns = [],
		checkInTransports = null
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
		/**
		 * THE NOTEBOOK CHECK-INS THAT HANG OFF THIS ITEM in this class (0120),
		 * already narrowed by the caller (checkInsForItem). Each carries the
		 * VIEWER'S OWN status, or null for a manager -- a teacher has no personal
		 * standing on their own class's check-in.
		 *
		 * DELIBERATELY NOT PASSED IN VIEW-AS, exactly as the deck is not:
		 * `classroom_view_as_section`'s payload carries no check-in, so the block
		 * does not render there rather than an admin's own read appearing under a
		 * student's name.
		 */
		checkIns?: ClassCheckIn[];
		/**
		 * Attaching one to this item and detaching it again. Null on a project
		 * without 0120 and for anyone who cannot manage the class, and its
		 * ABSENCE is what removes both controls -- the block still renders what
		 * is there, read-only.
		 */
		checkInTransports?: ClassCheckInTransports | null;
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

	// --- The inspector ----------------------------------------------------
	//
	// Each of these mirrors, term for term, the gate the block it names already
	// carried. Nothing here is the boundary: the boundary is the single
	// `{#if canManage}` these all sit inside, plus each block's own unchanged
	// condition. They exist so an inspector with nothing in it does not render
	// an empty strip.
	const canEditReference = $derived(item.kind === 'material' && canManage && !!referenceTransports);
	const canEditAssignment = $derived(item.kind === 'assignment' && canManage && !!teacherTransports);
	const canManageDeck = $derived(canManage && !!deckTransports);
	const canManageCheckIn = $derived(canManage && !!checkInTransports);

	// --- The notebook check-in (0120) --------------------------------------
	//
	// One busy flag and one message for both writes, cleared in `finally` so a
	// throw mid-attach cannot disable the controls for good.
	let checkInBusy = $state(false);
	let checkInError = $state<string | null>(null);
	/** Two-step, because detaching moves where a student reads their obligation. */
	let detaching = $state<string | null>(null);

	async function attachCheckIn(draft: CheckInDraft) {
		if (!checkInTransports || checkInBusy) return;
		checkInBusy = true;
		checkInError = null;
		try {
			const res = await checkInTransports.createForItem(item.id, draft);
			if (!res.ok) {
				checkInError = res.message ?? 'Could not attach that check-in.';
				return;
			}
			await onchanged?.();
		} catch (e) {
			checkInError = (e as Error).message || 'Could not attach that check-in.';
		} finally {
			checkInBusy = false;
		}
	}

	async function detachCheckIn(checkIn: ClassCheckIn) {
		if (!checkInTransports || checkInBusy) return;
		checkInBusy = true;
		checkInError = null;
		try {
			const res = await checkInTransports.unlink(checkIn.session_id, checkIn.section_id);
			if (!res.ok) {
				checkInError = res.message ?? 'Could not detach that check-in.';
				return;
			}
			detaching = null;
			await onchanged?.();
		} catch (e) {
			checkInError = (e as Error).message || 'Could not detach that check-in.';
		} finally {
			checkInBusy = false;
		}
	}
	const hasState = $derived(canManage && (!item.published || isScheduled(item) || item.is_public === true));
	const hasInspector = $derived(
		editable ||
			hasInstructorMaterial ||
			canEditReference ||
			canEditAssignment ||
			canManageDeck ||
			canManageCheckIn ||
			hasState ||
			!!revisionTransports
	);
	/**
	 * Open state lives in a module (inspector.svelte.ts), NOT here: this
	 * component is the page, so clicking through to another item remounts it and
	 * a local `$state` would collapse the tools on every single item.
	 */
	const inspectorOpen = $derived(itemInspector.open);

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

<!--
	NO MASTHEAD HERE. Every /classroom page renders inside the persistent shell
	(src/routes/classroom/+layout.svelte), which owns the logo, the section
	switcher and the breadcrumb trail back up.
-->
<main class="classroom-page">
	<!--
		THE INSPECTOR: every instructor-only affordance on this page, in one
		region, above the content and visually apart from it.

		ONE `{#if canManage}` GUARDS THE WHOLE THING. Each block inside keeps the
		exact gate it carried before it moved here, so this is an added outer
		guard, never a replacement for one.

		Pinned at the top rather than beside the content: the detail pane is
		already the narrower half of a two-pane shell at 1440px, and a third
		column would leave neither the tools nor the reading enough room.
	-->
	{#if canManage && hasInspector}
		<section class="inspector" data-testid="item-inspector">
			<button
				type="button"
				class="insp-strip"
				aria-expanded={inspectorOpen}
				aria-controls="item-inspector-body"
				data-testid="inspector-toggle"
				onclick={toggleItemInspector}
			>
				<span class="insp-caret" aria-hidden="true">{inspectorOpen ? '▾' : '▸'}</span>
				<span class="insp-glyph" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
						<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
					</svg>
				</span>
				<span class="insp-label">Instructor tools</span>
				<!-- STATE RIDES THE COLLAPSED STRIP, on purpose: whether a class can
				     see this at all is the one thing a teacher must not have to
				     expand anything to find out. -->
				<span class="insp-state">
					{#if !item.published}
						<span class="draft-chip">Draft</span>
					{:else if isScheduled(item)}
						<span class="sched-chip" title="Students see this from {scheduleLabel(item)}"
							>Scheduled &middot; {scheduleLabel(item)}</span
						>
					{/if}
					{#if item.is_public}<span class="chip pin-chip">Public link</span>{/if}
				</span>
				<span class="insp-hint">{inspectorOpen ? 'Hide' : 'Show'}</span>
			</button>

			{#if inspectorOpen}
				<div class="insp-body" id="item-inspector-body">
					{#if error}<p class="feedback error">{error}</p>{/if}
					{#if notice}<p class="feedback ok">{notice}</p>{/if}

					{#if editable}
						<div class="insp-block">
							<span class="card-actions">
								<button
									type="button"
									class="btn secondary tiny"
									disabled={busy}
									onclick={() => (editing = !editing)}
								>
									{editing ? 'Close editor' : 'Edit'}
								</button>
								<button type="button" class="btn secondary tiny" disabled={busy} onclick={togglePin}>
									{item.pinned ? 'Unpin' : 'Pin'}
								</button>
								<button type="button" class="btn secondary tiny" disabled={busy} onclick={duplicate}
									>Copy</button
								>
								<button
									type="button"
									class="btn secondary tiny danger"
									disabled={busy}
									onclick={remove}
								>
									{armDelete ? 'Really delete?' : 'Delete'}
								</button>
							</span>
							{#if alsoIn.length}
								<p class="also-line">
									Also posted to {alsoIn.map((s) => sectionTitle(s)).join(', ')} -- one shared copy,
									so an edit here changes all of them.
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
										compact
										onsaved={saved}
										oncancel={() => (editing = false)}
									/>
								{/key}
							{/if}
						</div>
					{/if}

					{#if canManageDeck}
						<!-- The CONTROLS only. The deck's own open link is content and
						     stays in the reading order below, for a teacher exactly as
						     for a student. -->
						<div class="insp-block">
							<DeckPanel
								{deck}
								itemId={item.id}
								sectionId={section.id}
								{basePath}
								{canManage}
								transports={deckTransports}
								mode="manage"
								{onchanged}
							/>
						</div>
					{/if}

					{#if canManageCheckIn}
						<!-- ATTACH AND DETACH, the management half. The check-in
						     itself reads in the content flow above for everyone.
						     Editing its date, its name or which classes it runs in
						     stays in /notebook/review's SessionManager, which owns
						     the check-in; this only decides what it hangs off. -->
						<div class="insp-block">
							{#if checkIns.length}
								<h2 class="section-label">Notebook check-in</h2>
								{#each checkIns as checkIn (checkIn.session_id)}
									<p class="insp-line" data-testid="insp-check-in">
										<strong>{checkIn.session_label}</strong>
										<span class="ci-meta">{checkInMeta(checkIn)}</span>
									</p>
									{#if detaching === checkIn.session_id}
										<!-- Names what it costs before the confirm: nothing is
										     destroyed, and saying so is the honest version. -->
										<p class="hint" data-testid="detach-warning">
											It goes back to being its own row in the class. The check-in, and
											every entry filed against it, stay exactly as they are.
										</p>
										<span class="ci-actions">
											<button
												type="button"
												class="btn secondary tiny"
												data-testid="detach-confirm"
												disabled={checkInBusy}
												onclick={() => detachCheckIn(checkIn)}
											>
												{checkInBusy ? 'Detaching...' : 'Yes, detach it'}
											</button>
											<button
												type="button"
												class="btn secondary tiny"
												data-testid="detach-cancel"
												disabled={checkInBusy}
												onclick={() => (detaching = null)}
											>
												Keep it here
											</button>
										</span>
									{:else}
										<span class="ci-actions">
											<button
												type="button"
												class="btn secondary tiny"
												data-testid="detach-check-in"
												disabled={checkInBusy}
												onclick={() => (detaching = checkIn.session_id)}
											>
												Detach check-in
											</button>
										</span>
									{/if}
								{/each}
							{:else}
								<CheckInStager
									label="Notebook check-in"
									submitLabel={checkInBusy ? 'Attaching...' : 'Attach check-in'}
									hint="Students photograph their notebook page against this. It appears on this item rather than as a separate row, and runs in every class this item is posted to."
									busy={checkInBusy}
									onstage={attachCheckIn}
								/>
							{/if}
							{#if checkInError}
								<p class="feedback error" data-testid="check-in-error">{checkInError}</p>
							{/if}
						</div>
					{/if}

					{#if canEditReference}
						<div class="insp-block engine-tools">
							<h2 class="section-label">Reference document</h2>
							<SpecImporter
								kind="reference"
								itemId={item.id}
								spec={referenceSpec}
								isPublic={item.is_public === true}
								attachmentCount={item.attachments.length}
								transports={referenceTransports!}
								onchanged={() => onchanged?.()}
							/>
						</div>
					{/if}

					{#if canEditAssignment}
						<div class="insp-block engine-tools">
							<h2 class="section-label">Assignment engine</h2>
							<SpecImporter
								kind="assignment"
								itemId={item.id}
								{spec}
								transports={teacherTransports!}
								onchanged={() => onchanged?.()}
							/>
							<hr class="tool-rule" />
							<RubricBuilder
								itemId={item.id}
								criteria={rubric}
								{spec}
								transports={teacherTransports!}
								onchanged={() => onchanged?.()}
							/>
							{#if gradeHref}
								<hr class="tool-rule" />
								<a class="btn tiny" href={gradeHref}>Open grading console</a>
							{/if}
						</div>
					{/if}

					{#if hasInstructorMaterial}
						<div class="insp-block">
							<h2 class="section-label instructor-section-label">
								<span class="lock-glyph" aria-hidden="true">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
										<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
									</svg>
								</span>
								Instructor only
							</h2>
							<p class="note instructor-note">
								Visible only to this item's teachers of record and admins.
							</p>
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
						</div>
					{/if}

					{#if revisionTransports}
						<div class="insp-block">
							<RevisionHistory
								itemId={item.id}
								transports={revisionTransports}
								onchanged={() => onchanged?.()}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<section class="hero">
		<div class="eyebrow">{itemKindLabel(item.kind)}</div>
		<h1>{itemTitle(item)}</h1>
		<p class="meta-line">
			{#if item.kind === 'assignment'}
				<!-- NO DUE SEGMENT WHEN THERE IS NO DUE DATE. `formatDue(null)` is
				     "No due date", which reads as a value in a list of values and
				     rendered as the sentence "Due No due date". An assignment with
				     no deadline simply has nothing to say here, so it says
				     nothing -- the label and its value come or go together. -->
				{#if item.due_at}Due {formatDue(item.due_at)}&nbsp;&middot;{/if}
				{#if item.points != null}{item.points} pts&nbsp;&middot;{/if}
				{#if item.category}{item.category}&nbsp;&middot;{/if}
			{/if}
			Posted {shortWhen(item.created_at)} by {authorLabel(item.author_name, item.author_email)}
		</p>
		{#if item.pinned || showUpdated}
			<p class="chip-line">
				{#if item.pinned}<span class="chip pin-chip">Pinned</span>{/if}
				{#if showUpdated}<span class="chip updated-chip">Updated</span>{/if}
			</p>
		{/if}
		{#if item.edited_at}
			<p class="edited-line">Last updated {editedWhen(item.edited_at)}</p>
		{/if}
	</section>

	<!-- The deck sits ABOVE the written content on purpose: when an item has one
	     it is the thing the class is looking at, and the instructions are what
	     goes with it. `view` mode is the OPEN LINK ONLY -- the upload and
	     removal controls are management and live in the inspector -- so this
	     renders identically for a teacher and a student, and nothing at all on
	     an item with no deck. -->
	<!-- NO `canManage` AND NO TRANSPORTS. `view` mode could not render a control
	     with them anyway (`showManage` is false by construction there), but not
	     handing them over at all is what makes "nothing instructor-only renders
	     in the content flow" true by inspection rather than by reading
	     DeckPanel to check. -->
	<DeckPanel {deck} itemId={item.id} sectionId={section.id} {basePath} mode="view" />

	<!--
		THE NOTEBOOK CHECK-IN THAT BELONGS TO THIS ITEM (0120), high in the
		reading order because it is an OBLIGATION rather than a detail: what a
		student has to do about this item, where the due date and points already
		sit in the hero above.

		THE CONTROLS ARE NOT HERE. This renders identically for a teacher and a
		student -- attaching and detaching are management and live in the
		inspector, exactly as the deck's upload does.

		A MANAGER'S CHECK-IN CARRIES NO STATUS (`status: null`), so the chip
		simply does not render for them rather than reporting a state assembled
		from somebody else's work.
	-->
	{#if checkIns.length}
		<section class="card ci-card" data-testid="item-check-ins">
			<h2 class="section-label">
				{checkIns.length === 1 ? 'Notebook check-in' : 'Notebook check-ins'}
			</h2>
			{#each checkIns as checkIn (checkIn.session_id)}
				<div class="ci-row" data-testid="item-check-in">
					<span class="ci-head">
						<span class="ci-name">{checkIn.session_label}</span>
						{#if checkIn.status}
							<span
								class="chip tone-{checkInTone(checkIn.status)}"
								data-testid="item-check-in-status"
							>
								{checkIn.status === 'flagged'
									? (flagReasonLabel(checkIn.flag_reason) ?? checkInStatusLabel(checkIn.status))
									: checkInStatusLabel(checkIn.status)}
							</span>
						{/if}
					</span>
					<span class="ci-meta">{checkInMeta(checkIn)}</span>
					<!-- The same door the stream row offers, carrying both ids: the
					     upload flow files against a (check-in, class) PAIR, and a
					     student in two classes that share one has two to choose
					     between. This page knows which; the notebook cannot guess. -->
					<a class="ci-link" href={checkInHref(checkIn)} data-testid="item-check-in-link">
						{canManage ? 'Open the notebook' : 'Open your notebook'}
					</a>
				</div>
			{/each}
		</section>
	{/if}

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

	<!--
		THE ENGINE SLOT: a student's own hand-in, or -- same slot, same position
		in the reading order -- a manager's read-only view of what that hand-in
		looks like.

		A manager gets no `engine` (the STUDENT slice is only ever loaded for a
		non-manager: their own RLS read would return every student's rows, which
		this page must never do), so a manager reaching the old `{:else}` was
		told this assignment has no online hand-in -- which is not true, and is
		not a sentence to put in front of the person who set it. What they get
		instead is the spec itself rendered by SpecRenderer's existing `readonly`
		flag -- the same component and the same flag GradingConsole and
		SpecImporter's preview already use for a look-but-do-not-touch render, so
		this is a fourth caller of an existing contract, not a new one. No
		`onvalue`/`onupload`/etc. are wired up, so there is no dispatch path for a
		manager's input to reach a write -- readonly is presentational (`canEdit`
		is `!locked && !readonly`) but every actual mutation still requires a
		transport this view never receives.

		Editing the spec is still only in the inspector (SpecImporter /
		RubricBuilder); this only makes the already-loaded `spec` visible where a
		student would read it.
	-->
	{#if item.kind === 'assignment'}
		{#if canManage}
			{#if spec}
				<section class="engine-host">
					<h2 class="section-label">Assignment</h2>
					{#key item.id}
						<SpecRenderer {spec} initialValues={{}} readonly uploadEnabled={false} />
					{/key}
				</section>
			{/if}
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
		max-width: var(--cr-measure, var(--measure-reading));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	/* The app-shell `.hero` is the LANDING hero: centred, with 4rem of air above
	   it. This is a document opening inside a pane, so it reads from the left
	   and starts near the top. */
	.hero {
		text-align: left;
		padding: var(--space-4) 0 var(--space-3);
	}

	/* --- The instructor inspector ------------------------------------------
	   GOLD AND DASHED, this module's own instructor-only marking (the same
	   treatment the instructor-materials card carried before it moved inside),
	   on the raised surface -- so it cannot be read as a card of student
	   content whatever ends up in it. */
	.inspector {
		margin: var(--space-3) 0 var(--space-4);
		border: 1px dashed var(--gold);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.insp-strip {
		appearance: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 44px;
		padding: 0.35rem 0.6rem;
		background: none;
		border: none;
		color: var(--gold);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.insp-caret {
		font-size: 0.7rem;
		flex: none;
	}
	.insp-glyph {
		display: inline-flex;
		width: 0.85rem;
		height: 0.85rem;
		flex: none;
	}
	.insp-glyph svg {
		width: 100%;
		height: 100%;
	}
	.insp-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		flex: none;
	}
	/* The state chips take the slack and truncate, so a long "Scheduled ·
	   <date>" never pushes the Show/Hide affordance off a narrow pane. */
	.insp-state {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
	}
	.insp-hint {
		flex: none;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--text-2);
	}
	.insp-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: 0 0.6rem 0.7rem;
	}
	.insp-body .feedback {
		margin: 0;
	}
	/* A plain block, NOT a second dashed gold box: the region already says whose
	   these are, and nesting the marking would only shout. */
	.insp-block {
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-3);
	}
	.insp-block:first-child {
		border-top: none;
		padding-top: 0;
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
	/* --- The notebook check-in block (0120) --------------------------------
	   `ci-` prefixed like every other component class here: app.css owns a
	   global `.row` that is a flex ROW with its own padding, and an unprefixed
	   name would inherit a layout this block never asked for. */
	.ci-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-3);
	}
	.ci-row + .ci-row {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}
	.ci-head {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.ci-name {
		font-weight: 700;
		font-size: 0.95rem;
	}
	.ci-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.ci-link {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--gold);
		white-space: nowrap;
		/* A phone touches this. */
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.ci-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.insp-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0 0 var(--space-1);
		font-size: 0.9rem;
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
