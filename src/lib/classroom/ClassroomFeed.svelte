<script lang="ts">
	import { itemTitle, sectionTitle, emailLocal, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		actionSummary,
		emptyMessage,
		feedIndicator,
		reasonTone,
		type FeedEntry,
		type SectionFeed
	} from '$lib/classroom/feed';
	import type { ClassroomItemKind } from '$lib/classroom/classroom';

	/**
	 * The home-page classroom feed: one collapsible card per class, showing what
	 * that class is asking of you right now. It REPLACES the retired legacy class
	 * cards and deliberately reuses their chrome (.course-card, .assignment-item,
	 * the badge row) so the home page reads as continuous rather than as a
	 * bolted-on second system -- the shared styling lives in app.css under
	 * `.legacy-index`, which is why this component must be mounted inside that
	 * wrapper.
	 *
	 * Presentation only (the Minimap / Garage convention): the parent owns the
	 * data load and the collapse persistence, this reports intent through
	 * `onToggle`. That split is what lets /dev/home-feed drive the identical
	 * component with no Supabase.
	 *
	 * ACCESSIBILITY, and the reason it is stated here: the legacy cards collapsed
	 * through a document-level click listener on a bare <div>, so the control was
	 * mouse-only and invisible to assistive tech. Here the header IS a <button>
	 * with aria-expanded and aria-controls, so it is reachable by keyboard and
	 * announces its own state. Do not reintroduce a delegated handler for these
	 * cards -- it would double-toggle against this one.
	 */

	interface Props {
		feeds: SectionFeed[];
		/** Section ids the user has collapsed (persisted by the parent). */
		collapsed?: string[];
		onToggle?: (sectionId: string) => void;
		/** False when the classroom migrations are not applied yet. */
		ready?: boolean;
		/** Link root, so a future read-only mount can re-point it. */
		basePath?: string;
		/**
		 * The SAME clock the caller passed to buildFeed. It must be threaded
		 * rather than defaulted per call: "Due in 3 days" and the ranking that
		 * decided the row was due soon have to agree, and a component reading its
		 * own `new Date()` would silently disagree with the feed it is rendering.
		 */
		now?: Date;
	}

	let {
		feeds,
		collapsed = [],
		onToggle,
		ready = true,
		basePath = '/classroom',
		now = new Date()
	}: Props = $props();

	const collapsedSet = $derived(new Set(collapsed));

	// Kind glyphs, the legacy ICON_KINDS approach: one distinct mark per item
	// kind so a row's nature reads before its title does. Deliberately NO live
	// pulse and no opened-progress dot -- this surface has no live state, and
	// item views stay consumed only by the Updated badge.
	const ICON_KINDS: Record<ClassroomItemKind, 'announcement' | 'assignment' | 'material'> = {
		post: 'announcement',
		assignment: 'assignment',
		material: 'material'
	};

	const itemHref = (section: ClassroomSection, entry: FeedEntry) =>
		`${basePath}/${section.id}/item/${entry.item.id}`;
</script>

{#snippet icon(kind: ClassroomItemKind)}
	<div class="assignment-icon-thumb">
		{#if ICON_KINDS[kind] === 'announcement'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 10v4h3l6 4V6l-6 4H4z" />
				<path d="M17 9.5a3.5 3.5 0 010 5" />
				<path d="M19.5 7a7 7 0 010 10" />
			</svg>
		{:else if ICON_KINDS[kind] === 'assignment'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="5" y="4" width="14" height="17" rx="1.5" />
				<rect x="9" y="2.5" width="6" height="3" rx="1" />
				<path d="M8.5 12l2.2 2.2L15.5 9.5" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 014 18.5v-13z" />
				<path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 001.5-1.5v-13z" />
			</svg>
		{/if}
	</div>
{/snippet}

{#snippet row(feed: SectionFeed, entry: FeedEntry)}
	<a class="assignment-item linked" href={itemHref(feed.section, entry)}>
		<div class="assignment-left">
			{@render icon(entry.item.kind)}
			<div class="assignment-name">{itemTitle(entry.item)}</div>
		</div>
		<div class="assignment-right">
			<span class="feed-flag tone-{reasonTone(entry.reason)}">{feedIndicator(entry, now)}</span>
			<span class="assignment-status status-live">Open</span>
		</div>
	</a>
{/snippet}

{#if !ready}
	<div class="course-card section-card feed-card">
		<div class="empty-state">
			<div class="empty-icon">[ ]</div>
			<div class="empty-text">
				Classroom is not available yet. Your classes will show up here once it is switched on.
			</div>
		</div>
	</div>
{:else if !feeds.length}
	<div class="course-card section-card feed-card">
		<div class="empty-state">
			<div class="empty-icon">[ ]</div>
			<div class="empty-text">
				You are not in any classes yet. Your teacher adds the roster at the start of the year, and
				your classes appear here automatically. Nothing for you to do.
			</div>
		</div>
	</div>
{:else}
	{#each feeds as feed (feed.section.id)}
		{@const open = !collapsedSet.has(feed.section.id)}
		{@const summary = actionSummary(feed)}
		{@const listId = `feed-list-${feed.section.id}`}
		<div class="course-card section-card feed-card" class:collapsed={!open}>
			<button
				type="button"
				class="course-header collapsible"
				aria-expanded={open}
				aria-controls={listId}
				onclick={() => onToggle?.(feed.section.id)}
			>
				<div class="course-header-left">
					<div class="course-id">{feed.section.course?.code ?? 'CLASS'}</div>
					<div class="course-updated">{feed.section.course?.title ?? sectionTitle(feed.section)}</div>
				</div>
				<div class="course-meta">
					<span class="course-badge badge-block">{feed.section.label}</span>
					<span class="section-meta">
						{#if feed.section.block}{feed.section.block} &middot; {/if}
						{feed.manages ? 'You teach this' : emailLocal(feed.section.teacher_email)}
					</span>
					{#if summary}
						<span class="feed-flag tone-attention">{summary}</span>
					{/if}
				</div>
				<span class="course-collapse-arrow" aria-hidden="true">&#9662;</span>
			</button>

			<div class="assignment-list" id={listId}>
				{#if feed.urgent.length}
					{#each feed.urgent as entry (entry.item.id)}
						{@render row(feed, entry)}
					{/each}
				{:else}
					<div class="empty-state">
						<div class="empty-icon">[ ]</div>
						<div class="empty-text">{emptyMessage(feed)}</div>
					</div>
				{/if}

				{#if feed.standing.length}
					<div class="feed-shelf-label">Reference</div>
					{#each feed.standing as entry (entry.item.id)}
						{@render row(feed, entry)}
					{/each}
				{/if}

				<a class="feed-more" href="{basePath}/{feed.section.id}">
					{#if feed.hiddenCount}
						{feed.hiddenCount} more in this class &rsaquo;
					{:else}
						Open class &rsaquo;
					{/if}
				</a>
			</div>
		</div>
	{/each}
{/if}
