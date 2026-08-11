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
		editedWhen,
		formatDue,
		isUpdatedForViewer,
		itemKindLabel,
		itemTitle,
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
		ondeleted = null
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
	} = $props();

	let editing = $state(false);
	let armDelete = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let seen = $state(false);

	const editable = $derived(canManage && !!transports);
	const showUpdated = $derived(!seen && isUpdatedForViewer(item));
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
			{#if canManage && !item.published}<span class="draft-chip">Draft</span>{/if}
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
						compact
						onsaved={saved}
						oncancel={() => (editing = false)}
					/>
				{/key}
			{/if}
		</section>
	{/if}

	{#if item.body.trim()}
		<section class="card">
			<h2 class="section-label">
				{item.kind === 'assignment' ? 'Instructions' : 'Details'}
			</h2>
			<p class="body-text">{item.body}</p>
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

	{#if item.kind === 'assignment'}
		<section class="card engine-slot">
			<h2 class="section-label">Submission</h2>
			<p class="note">
				Handing work in from here arrives in a later release. For now, follow the instructions
				above.
			</p>
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
	.classroom-page {
		max-width: 46rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.meta-line,
	.edited-line {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
		margin: 0.2rem 0 0;
	}
	.chip-line {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: 0.4rem 0 0;
	}
	.section-label {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.body-text {
		margin: 0;
		white-space: pre-wrap;
		line-height: 1.6;
		font-size: 0.95rem;
	}
	.link-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.card {
		margin-bottom: 0.9rem;
	}
	.card-actions {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.also-line {
		margin: 0.5rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim);
	}
	.engine-slot {
		border-style: dashed;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
		margin: 0;
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
	.draft-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.02rem 0.45rem;
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
</style>
