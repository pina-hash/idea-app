<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import ClassroomFeedback from '$lib/classroom/ClassroomFeedback.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import LinkPreviewCard from '$lib/classroom/LinkPreviewCard.svelte';
	import {
		authorLabel,
		classworkGroups,
		editedWhen,
		emailLocal,
		formatDue,
		instructorAttachmentSrc,
		isUpdatedForViewer,
		itemKindLabel,
		itemTitle,
		reorderedIds,
		sectionTitle,
		shortWhen,
		streamItems,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomSection,
		type LinkPreview
	} from '$lib/classroom/classroom';
	import type { FeedbackEntry } from '$lib/feedback/feedback';

	/**
	 * One class: the Stream view (announcements + assignments, pinned first,
	 * then newest) and the Classwork view (pinned, then assignments by due date,
	 * with materials on their own shelf).
	 *
	 * RLS already decided what is in `items` -- a student load simply never
	 * receives drafts -- and `canManage` only adds chrome and controls, never
	 * data. The MANAGEMENT controls live on the cards themselves, because "edit
	 * that announcement" is a thought someone has while looking at the
	 * announcement, not one that survives a trip to a separate console. Editing
	 * mounts the SHARED ContentComposer; there is no second editor in this
	 * module, and an edit changes the one canonical record every class reads.
	 */
	let {
		section,
		items,
		sections = [],
		canManage = false,
		transports = null,
		attachmentsEnabled = true,
		basePath = '/classroom',
		viewAs = null,
		fetchPreview = null,
		submitFeedback = null,
		onchanged = null
	}: {
		section: ClassroomSection;
		items: ClassroomItem[];
		/** Every section the caller manages, for the composer's linkage controls. */
		sections?: ClassroomSection[];
		canManage?: boolean;
		/** Omitted (null) on every read-only surface, view-as included. */
		transports?: ClassroomComposerTransports | null;
		attachmentsEnabled?: boolean;
		/** Link root -- rewritten under /classroom/view-as/<email>. */
		basePath?: string;
		viewAs?: string | null;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		submitFeedback?: ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let tab: 'stream' | 'classwork' = $state('stream');
	let editing = $state<string | null>(null);
	let armDelete = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	/**
	 * Locally-cleared "Updated" badges. The mark-viewed write is fire-and-forget
	 * (a student should never wait on it), so the badge is cleared here the
	 * moment the item is genuinely on screen rather than on the next reload.
	 */
	let seen = $state<Record<string, boolean>>({});

	const stream = $derived(streamItems(items));
	const groups = $derived(classworkGroups(items));
	/** Controls appear only where BOTH the section allows it and a write path exists. */
	const editable = $derived(canManage && !!transports);
	const editingItem = $derived(items.find((i) => i.id === editing) ?? null);

	function updated(item: ClassroomItem): boolean {
		return !seen[item.id] && isUpdatedForViewer(item);
	}

	/** Every OTHER class this item is posted to that the viewer can see. */
	function alsoIn(item: ClassroomItem): ClassroomSection[] {
		const others = item.postings.filter((p) => p.section_id !== section.id);
		return others
			.map((p) => sections.find((s) => s.id === p.section_id))
			.filter((s): s is ClassroomSection => !!s);
	}

	/**
	 * An announcement is fully rendered in the Stream -- body, files and all --
	 * so being on this page IS opening it, and holding the badge until they
	 * click something that does not exist would be a badge that never clears.
	 * Assignments and materials only show a summary here; those mark themselves
	 * viewed on their own page.
	 */
	$effect(() => {
		if (canManage || !transports) return;
		const write = transports;
		const pending = items.filter((i) => i.kind === 'post' && isUpdatedForViewer(i) && !seen[i.id]);
		if (!pending.length) return;
		// Deferred for the same reason LinkPreviewCard defers its loader: the
		// write (and anything the transport does synchronously before its first
		// await) must not land while this render is still settling.
		queueMicrotask(() => {
			for (const item of pending) {
				seen = { ...seen, [item.id]: true };
				void write.markViewed(item.id);
			}
		});
	});

	function toggleEdit(id: string) {
		editing = editing === id ? null : id;
		armDelete = null;
		error = null;
		notice = null;
	}

	async function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok?: string) {
		busy = true;
		error = null;
		notice = null;
		const res = await fn();
		busy = false;
		if (!res.ok) {
			error = res.message ?? 'Something went wrong.';
			return false;
		}
		if (ok) notice = ok;
		await onchanged?.();
		return true;
	}

	async function remove(id: string) {
		if (!transports) return;
		// Two-step confirm, the gauntlet-room-delete convention: the first click
		// only arms it.
		if (armDelete !== id) {
			armDelete = id;
			return;
		}
		armDelete = null;
		if (editing === id) editing = null;
		await run(() => transports.deleteItem(id));
	}

	async function togglePin(item: ClassroomItem) {
		if (!transports) return;
		await run(
			() => transports.setPinned(item.id, !item.pinned),
			item.pinned ? 'Unpinned.' : 'Pinned to the top.'
		);
	}

	async function duplicate(item: ClassroomItem) {
		if (!transports) return;
		const res = await transports.duplicateItem(item.id);
		if (!res.ok) {
			error = res.message;
			return;
		}
		await onchanged?.();
		// Open the copy straight away: a duplicate exists to be changed, and the
		// composer prefilled with it IS the "copy" action's real destination.
		editing = res.data.itemId;
		tab = item.kind === 'post' ? 'stream' : 'classwork';
		notice = 'Copied as a new draft. Edit it below, then post it.';
	}

	async function move(groupItems: ClassroomItem[], item: ClassroomItem, direction: -1 | 1) {
		if (!transports) return;
		const ids = reorderedIds(groupItems, item.id, direction);
		if (!ids) return;
		await run(() => transports.setOrder(ids));
	}

	async function saved() {
		editing = null;
		await onchanged?.();
	}
</script>

{#snippet badges(item: ClassroomItem)}
	{#if item.pinned}
		<span class="chip pin-chip" title="Pinned to the top of this class">
			<span aria-hidden="true">&#9679;</span> Pinned
		</span>
	{/if}
	{#if canManage && !item.published}<span class="draft-chip">Draft</span>{/if}
	{#if updated(item)}<span class="chip updated-chip">Updated</span>{/if}
{/snippet}

{#snippet manageActions(item: ClassroomItem, groupItems: ClassroomItem[] | null)}
	{#if editable}
		<span class="card-actions">
			{#if groupItems && groupItems.length > 1}
				<button
					type="button"
					class="btn secondary tiny"
					aria-label="Move up"
					disabled={busy || groupItems[0]?.id === item.id}
					onclick={() => move(groupItems, item, -1)}>&uarr;</button
				>
				<button
					type="button"
					class="btn secondary tiny"
					aria-label="Move down"
					disabled={busy || groupItems[groupItems.length - 1]?.id === item.id}
					onclick={() => move(groupItems, item, 1)}>&darr;</button
				>
			{/if}
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => togglePin(item)}>
				{item.pinned ? 'Unpin' : 'Pin'}
			</button>
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => toggleEdit(item.id)}>
				{editing === item.id ? 'Close' : 'Edit'}
			</button>
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => duplicate(item)}>
				Copy
			</button>
			<button type="button" class="btn secondary tiny danger" disabled={busy} onclick={() => remove(item.id)}>
				{armDelete === item.id ? 'Really delete?' : 'Delete'}
			</button>
		</span>
	{/if}
{/snippet}

{#snippet editorFor(item: ClassroomItem)}
	{#if editable && editing === item.id}
		{#key item.id}
			<ContentComposer
				mode="edit"
				{item}
				{sections}
				transports={transports!}
				{attachmentsEnabled}
				compact
				onsaved={saved}
				oncancel={() => (editing = null)}
			/>
		{/key}
	{/if}
{/snippet}

{#snippet extras(item: ClassroomItem)}
	{#if item.links.length}
		<div class="link-list">
			{#each item.links as l (l.id ?? l.url)}
				<LinkPreviewCard link={l} {fetchPreview} />
			{/each}
		</div>
	{/if}
	{#if item.attachments.length}
		<AttachmentList attachments={item.attachments} {viewAs} />
	{/if}
	{#if canManage && ((item.instructorLinks?.length ?? 0) > 0 || (item.instructorAttachments?.length ?? 0) > 0)}
		<div class="instructor-note-box">
			<span class="instructor-note-label">
				<span class="lock-glyph" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
						<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
					</svg>
				</span>
				Instructor only
			</span>
			{#if item.instructorLinks?.length}
				<div class="link-list">
					{#each item.instructorLinks as l (l.id ?? l.url)}
						<LinkPreviewCard link={l} {fetchPreview} />
					{/each}
				</div>
			{/if}
			{#if item.instructorAttachments?.length}
				<AttachmentList
					attachments={item.instructorAttachments}
					resolveSrc={(a) => instructorAttachmentSrc(a.id)}
				/>
			{/if}
		</div>
	{/if}
	{#if item.edited_at}
		<p class="edited-line">Updated {editedWhen(item.edited_at)}</p>
	{/if}
{/snippet}

<svelte:head>
	<title>{sectionTitle(section)} // IDEA Classroom</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href={basePath}>&lsaquo; My Classes</a>
		<ProfileMenu />
	</div>
</div>

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA // Classroom'}</div>
		<h1>{section.course?.title ?? section.label}</h1>
		<p class="section-line">
			{section.label}{#if section.block}&nbsp;&middot; {section.block}{/if}
			&nbsp;&middot; {emailLocal(section.teacher_email)}
			{#if section.active === false}&nbsp;&middot; <span class="draft-chip">Archived</span>{/if}
			{#if canManage}
				&nbsp;&middot; <a class="manage-link" href="/classroom/manage">Manage</a>
			{/if}
		</p>
	</section>

	{#if error}
		<p class="feedback error">{error}</p>
	{/if}
	{#if notice}
		<p class="feedback ok">{notice}</p>
	{/if}

	<div class="tabs" role="tablist" aria-label="Class views">
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={tab === 'stream'}
			aria-selected={tab === 'stream'}
			onclick={() => (tab = 'stream')}
		>
			Stream
		</button>
		<button
			type="button"
			role="tab"
			class="tab"
			class:active={tab === 'classwork'}
			aria-selected={tab === 'classwork'}
			onclick={() => (tab = 'classwork')}
		>
			Classwork
		</button>
	</div>

	{#if tab === 'stream'}
		{#if stream.length === 0}
			<section class="card">
				<p class="note empty-state">
					Nothing posted yet. Announcements and assignments from your teacher will show up here.
				</p>
			</section>
		{:else}
			{#each stream as item (item.id)}
				<article class="card stream-card" class:pinned={item.pinned}>
					<div class="stream-head">
						{#if item.kind === 'assignment'}
							<span class="asg-flag">Assignment</span>
						{:else}
							<span class="stream-author">{authorLabel(item.author_name, item.author_email)}</span>
						{/if}
						<span class="stream-when">{shortWhen(item.created_at)}</span>
						{@render badges(item)}
						{@render manageActions(item, null)}
					</div>

					{#if item.kind === 'assignment'}
						<a class="stream-link" href={`${basePath}/${section.id}/item/${item.id}`}>
							<h2 class="stream-title">{itemTitle(item)}</h2>
							<p class="asg-meta">
								Due {formatDue(item.due_at)}
								{#if item.points != null}&nbsp;&middot; {item.points} pts{/if}
								{#if item.category}&nbsp;&middot; {item.category}{/if}
							</p>
						</a>
					{:else}
						{#if item.title}<h2 class="stream-title">{item.title}</h2>{/if}
						<p class="stream-body">{item.body}</p>
					{/if}

					{#if canManage && alsoIn(item).length}
						<p class="also-line">
							Also posted to {alsoIn(item)
								.map((s) => sectionTitle(s))
								.join(', ')}
						</p>
					{/if}

					{@render extras(item)}
					{@render editorFor(item)}
				</article>
			{/each}
		{/if}
	{:else if groups.length === 0}
		<section class="card">
			<p class="note empty-state">
				No classwork yet. When your teacher posts assignments or materials, they will be listed
				here.
			</p>
		</section>
	{:else}
		{#each groups as group (group.id)}
			<section class="card work-group">
				<h2 class="group-label">{group.label}</h2>
				<div class="work-rows">
					{#each group.items as item (item.id)}
						<div class="work-item">
							<a class="work-row" href={`${basePath}/${section.id}/item/${item.id}`}>
								<span class="work-main">
									<span class="work-title">
										{itemTitle(item)}
										{@render badges(item)}
									</span>
									<span class="work-due" class:overdue={group.id === 'past'}>
										{#if item.kind === 'material'}
											{itemKindLabel(item.kind)}
										{:else}
											Due {formatDue(item.due_at)}
										{/if}
									</span>
								</span>
								<span class="work-chips">
									{#if item.points != null}<span class="chip">{item.points} pts</span>{/if}
									{#if item.category}<span class="chip">{item.category}</span>{/if}
									{#if item.attachments.length}
										<span class="chip"
											>{item.attachments.length} file{item.attachments.length === 1 ? '' : 's'}</span
										>
									{/if}
									{#if item.links.length}
										<span class="chip"
											>{item.links.length} link{item.links.length === 1 ? '' : 's'}</span
										>
									{/if}
								</span>
							</a>
							{@render manageActions(item, group.items)}
							{@render editorFor(item)}
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}

	<ClassroomFeedback
		context="class"
		meta={{ section_id: section.id, section: sectionTitle(section), tab }}
		submit={submitFeedback}
	/>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.classroom-page {
		max-width: 46rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.section-line {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim);
	}
	.manage-link {
		color: var(--gold);
	}
	.tabs {
		display: flex;
		gap: 0.4rem;
		margin: 0 0 1rem;
		border-bottom: 1px solid var(--line);
	}
	.tab {
		appearance: none;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.5rem 0.9rem;
		cursor: pointer;
	}
	.tab.active {
		color: var(--green);
		border-bottom-color: var(--green);
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.empty-state {
		padding: 0.6rem 0;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		border-radius: 5px;
		padding: 0.4rem 0.65rem;
		margin: 0 0 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
	.stream-card {
		display: block;
		margin-bottom: 0.9rem;
		color: var(--white);
	}
	.stream-card.pinned {
		border-color: var(--line-strong);
	}
	.stream-link {
		display: block;
		text-decoration: none;
		color: inherit;
	}
	.stream-link:hover .stream-title {
		color: var(--gold);
	}
	.stream-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.35rem;
	}
	.card-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.stream-author {
		font-weight: 700;
		font-size: 0.9rem;
	}
	.stream-when {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	.draft-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
	}
	.stream-title {
		margin: 0.1rem 0 0.3rem;
		font-size: 1.05rem;
	}
	.stream-body {
		margin: 0;
		white-space: pre-wrap;
		line-height: 1.55;
		font-size: 0.95rem;
	}
	.asg-flag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		color: var(--gold);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.08rem 0.4rem;
	}
	.asg-meta {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.also-line,
	.edited-line {
		margin: 0.5rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim);
	}
	.link-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}
	.instructor-note-box {
		margin-top: 0.6rem;
		padding: 0.6rem 0.7rem;
		border: 1px dashed var(--gold);
		border-radius: 6px;
	}
	.instructor-note-label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--gold);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
	}
	.lock-glyph {
		display: inline-flex;
		width: 0.8rem;
		height: 0.8rem;
	}
	.lock-glyph svg {
		width: 100%;
		height: 100%;
	}
	.work-group {
		margin-bottom: 1rem;
	}
	.group-label {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.work-rows {
		display: flex;
		flex-direction: column;
	}
	.work-item {
		border-bottom: 1px solid var(--line);
		padding-bottom: 0.3rem;
	}
	.work-item:last-child {
		border-bottom: none;
	}
	.work-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		padding: 0.55rem 0.2rem;
		text-decoration: none;
		color: var(--white);
	}
	.work-row:hover .work-title {
		color: var(--gold);
	}
	.work-main {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.work-title {
		font-weight: 700;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.work-due {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	.work-due.overdue {
		color: var(--amber);
	}
	.work-chips {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--cyan);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		white-space: nowrap;
	}
	/* Gold is the module's one accent; the pin is a placement marker, not a
	   status, so it never borrows the reserved crimson or amber. */
	.pin-chip {
		color: var(--gold);
		border-color: var(--gold);
	}
	.updated-chip {
		color: var(--green);
		border-color: var(--green);
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
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 560px) {
		.card-actions {
			margin-left: 0;
		}
		.work-chips {
			margin-left: 0;
		}
	}
</style>
