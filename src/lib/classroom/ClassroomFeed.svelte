<script lang="ts">
	import { itemTitle, sectionTitle, emailLocal, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		actionSummary,
		dueUrgency,
		emptyMessage,
		feedIndicator,
		reasonTone,
		type FeedEntry,
		type SectionFeed
	} from '$lib/classroom/feed';
	import type { ClassroomItemKind } from '$lib/classroom/classroom';
	import { sectionLabelText, sectionBlockText } from '$lib/section-label';

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
	<a
		class="assignment-item linked feed-row"
		href={itemHref(feed.section, entry)}
		data-urgency={dueUrgency(entry, now) ?? undefined}
	>
		{@render icon(entry.item.kind)}
		<div class="assignment-name">{itemTitle(entry.item)}</div>
		<span class="feed-flag tone-{reasonTone(entry.reason)}">{feedIndicator(entry, now)}</span>
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
					<div class="feed-ident">
						<span class="course-id">{feed.section.course?.code ?? 'CLASS'}</span>
						<span class="course-badge badge-block">{sectionLabelText(feed.section.label)}</span>
						{#if summary}
							<span class="feed-flag tone-attention">{summary}</span>
						{/if}
					</div>
					<div class="feed-subline">
						<span class="course-updated"
							>{feed.section.course?.title ?? sectionTitle(feed.section)}</span
						>
						<span class="section-meta">
							{#if sectionBlockText(feed.section.block)}{sectionBlockText(
									feed.section.block
								)}&nbsp;&middot;&nbsp;{/if}{feed.manages
								? 'You teach this'
								: emailLocal(feed.section.teacher_email)}
						</span>
					</div>
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

<style>
	/*
	 * THIS COMPONENT OWNS ITS OWN GEOMETRY NOW, and the shared `.legacy-index`
	 * chrome in app.css still owns everything else (the card, the plate, the
	 * hover, the flag tones, the badge). The split is deliberate: those rules are
	 * shared with the archive page and every other `.course-card` surface, so a
	 * height fix made there would move markup this component does not render.
	 *
	 * WHAT IT COST, AT 375px, PER CLASS: the card was 596px, which put the first
	 * app card 2.44 screens down for a student with two classes. Almost all of it
	 * was one flex rule -- `.assignment-left` wrapped, `.assignment-name` took the
	 * full measure, and the 34px kind icon was pushed onto a line of its own above
	 * a two-line title. The row cost 142px to say one thing. As a grid with the
	 * icon in its own column the same row says the same thing in 89px, with the
	 * title still on two lines and the icon still there.
	 */
	.feed-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'icon name'
			'icon flag';
		align-items: center;
		column-gap: 0.7rem;
		row-gap: 0.25rem;
		padding-top: 0.65rem;
		padding-bottom: 0.65rem;
	}
	.feed-row :global(.assignment-icon-thumb) {
		grid-area: icon;
		align-self: center;
	}
	.feed-row .assignment-name {
		grid-area: name;
	}
	.feed-row .feed-flag {
		grid-area: flag;
		justify-self: start;
	}

	/*
	 * Above the phone the row has room for one line: icon, title, flag, with the
	 * flag pinned right the way it has always been. The 89px measurement above is
	 * the narrow case, which is the one that was costing screens.
	 */
	@media (min-width: 700px) {
		.feed-row {
			grid-template-columns: auto minmax(0, 1fr) auto;
			grid-template-areas: 'icon name flag';
		}
		.feed-row .feed-flag {
			justify-self: end;
		}
	}

	/*
	 * DUE-DATE URGENCY. Four steps from `dueUrgency()`, which reads the reason the
	 * ranking already assigned and the SAME `now` this component was handed, so
	 * the emphasis and the words can never name different days.
	 *
	 * COLOUR IS NEVER THE SIGNAL HERE, and it could not be even if it were
	 * wanted: the flag's hue is already spoken for by `reasonTone` (the tone says
	 * WHAT the row is, not how near it is), a reader who cannot separate two hues
	 * would get nothing from a fifth one, and `--crimson` -- the one token that
	 * reads as alarm in this palette -- is reserved for LIVE/REC/error and is not
	 * available. So the steps are carried by three things that are not colour:
	 *
	 *   POSITION -- `compare()` already puts the soonest deadline first inside a
	 *     rank, and overdue outranks due-soon, so the pressing row is the row a
	 *     student reads first. Nothing here had to be added for that.
	 *   WORDS -- `feedIndicator` already writes the date out: "Overdue 2 days
	 *     ago", "Due today", "Due tomorrow", "Due in 5 days". A student never has
	 *     to decode a treatment to learn when a thing is due.
	 *   WEIGHT AND A RULE -- below. Type gets heavier and the row takes a marker
	 *     down its leading edge as the date closes.
	 *
	 * `soon` IS DELIBERATELY UNTREATED. It is the ordinary state of the whole
	 * seven-day window, and a scale whose bottom step is already emphasised has
	 * no room left to say "now". The marker earns its meaning by being absent
	 * most of the time.
	 *
	 * NOTHING HERE SAYS A DEADLINE IS SOFT. The steps only change how loudly the
	 * same date is stated; there is no wording, no fading and no de-emphasis that
	 * would read as "this one can wait", including on `soon`.
	 */
	.feed-row[data-urgency='imminent'] .feed-flag,
	.feed-row[data-urgency='today'] .feed-flag,
	.feed-row[data-urgency='overdue'] .feed-flag {
		font-weight: 700;
	}
	.feed-row[data-urgency='today'] .assignment-name,
	.feed-row[data-urgency='overdue'] .assignment-name {
		font-weight: 600;
	}

	/*
	 * The leading-edge marker. `box-shadow` inset and not a `border-left`,
	 * because a border changes the row's box and would shift every title by 3px
	 * as a deadline crosses midnight -- and not a `::before`, because Svelte
	 * prunes a scoped pseudo-element whose base class it cannot see used (the
	 * app.css `.tap-reach-44` note). It rides the flag's own tone token so it
	 * cannot introduce a hue the row is not already wearing.
	 */
	.feed-row[data-urgency='imminent'] {
		box-shadow: inset 3px 0 0 -1px color-mix(in srgb, var(--cyan) 45%, transparent);
	}
	.feed-row[data-urgency='today'] {
		box-shadow: inset 3px 0 0 0 var(--cyan);
	}
	.feed-row[data-urgency='overdue'] {
		box-shadow: inset 3px 0 0 0 var(--amber);
	}

	/*
	 * THE HEADER LOSES A LINE AT PHONE WIDTH, WHICH IS WHERE IT HAD TWO STACKED
	 * BLOCKS. `.course-meta` used to be a third flex child that dropped below the
	 * code and title at 375px; the badge and the count chip sit up on the code's
	 * own line now and the block/teacher line joins the title, so the header is
	 * two lines instead of three (111px -> 78px measured). Nothing was removed:
	 * every field the header carried, it still carries.
	 */
	.feed-ident {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	.feed-subline {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	/*
	 * `overflow-wrap: anywhere` is carried over from app.css's own `.section-meta`
	 * rule and for its reason: an address local part has no space to break at, so
	 * its min-content is the whole token and a flex row cannot get under a 375px
	 * viewport without it.
	 */
	.feed-subline .section-meta {
		overflow-wrap: anywhere;
	}
</style>
