<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { STATUS_GLYPHS, toneStyle } from '$lib/ui/status-tone';
	import { itemTitle, sectionTitle, emailLocal, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		actionSummary,
		attentionWords,
		dueSoonSummary,
		dueUrgency,
		entryHref,
		emptyMessage,
		feedCover,
		feedIndicator,
		reasonGlyph,
		reasonTone,
		type FeedEntry,
		type SectionFeed
	} from '$lib/classroom/feed';
	import PostThumbnail from '$lib/classroom/PostThumbnail.svelte';
	import {
		KIND_GLYPHS,
		hasThumbnailMedia,
		resolveThumbShape,
		unitTint,
		type ItemThumbnail,
		type ThumbShape,
		type ThumbShapeChoice
	} from '$lib/classroom/thumbnail';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { classroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import { readDeviceClassroomPreferences } from '$lib/preferences/classroom';
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
	 * mouse-only and invisible to assistive tech. Do not reintroduce a delegated
	 * handler for these cards -- it would fire on top of the two controls below.
	 *
	 * THE HEADER IS TWO CONTROLS SIDE BY SIDE, NEVER ONE INSIDE THE OTHER (ledger
	 * 0396, part 3: "open a class in one click, without expanding its card
	 * first"). The class's identity (code, section, attention count, title,
	 * block and teacher) is ONE real <a> to the class page, so a plain click
	 * goes in and a middle-click or Ctrl-click opens a tab like any link. The
	 * fold is its OWN <button> at the header's right edge, with aria-expanded
	 * and aria-controls, a 44px box and a word beside the arrow (a glyph alone is
	 * not a control). They are siblings: a button inside an anchor is invalid
	 * markup, and a click on either would reach both. Tab order is the link,
	 * then the fold, which is their order in the DOM. The collapse state and its
	 * persistence stay the parent's, through `onToggle`, exactly as before.
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
		/**
		 * THE "SEE ALL" DOOR (ledger 0297): where the cross-class to-do lives.
		 * These cards rank what each class asks right now and stop at six rows;
		 * the to-do is the whole list, Assigned, Missing and Done. Null removes
		 * the door, which is what a teacher's feed gets.
		 */
		todoHref?: string | null;
		/**
		 * EACH COURSE'S UNITS IN THE CLASS PAGE'S ORDER (ledger 0396), keyed by
		 * course id: a post's generated thumbnail is tinted by its unit's place
		 * there (`unitTint`), exactly as the class page tints it, so a post is
		 * one identity in both places. Absent or empty draws every post in the
		 * neutral ink, which is a post in no unit.
		 */
		unitOrder?: Record<string, string[]>;
	}

	let {
		feeds,
		collapsed = [],
		onToggle,
		ready = true,
		basePath = '/classroom',
		now = new Date(),
		todoHref = null,
		unitOrder = {}
	}: Props = $props();

	const collapsedSet = $derived(new Set(collapsed));

	/**
	 * Items whose cover would not decode, so the card shows its glyph instead.
	 *
	 * PER MOUNT AND IN MEMORY, keyed on the item id: a new Set on every failure
	 * because Svelte 5 tracks the reference, and mutating one in place would
	 * change nothing on screen.
	 */
	let failedCovers = $state(new Set<string>());

	/** A post's unit tint, the class page's own rule over its course's unit order. */
	const tintOf = (feed: SectionFeed, entry: FeedEntry): number | null =>
		unitTint(entry.item.unit_id, unitOrder[feed.section.course_id] ?? []);

	/**
	 * WHERE A ROW GOES (report e4bc53e5, ledger 0416): a hand-in to grade
	 * opens that post's grading page for this class, which is where the work
	 * is; anything else opens the post.
	 */
	const itemHref = (section: ClassroomSection, entry: FeedEntry, manages = false) => entryHref(basePath, section.id, entry, manages);

	/*
	 * THE OWED-THINGS LIST a teacher's header chip opens, one card at a time.
	 * One thing owed: the chip is a link straight to its fix. Several: it opens
	 * a short list here, each line saying what is owed and going to where it is
	 * done. Escape or a second press closes it.
	 */
	let openAttention = $state<string | null>(null);
	function toggleAttention(sectionId: string) {
		openAttention = openAttention === sectionId ? null : sectionId;
	}

	/*
	 * THE SHAPE A CARD'S ROWS DRAW POST THUMBNAILS IN (ledger 0396): the
	 * person's own Display settings choice, else the class's default, else
	 * Tile, the class page's one rule (`resolveThumbShape`). The choice lives
	 * in this device's classroom slot; the home page provides no classroom
	 * store, so the slot is read once the page is in the browser (the server
	 * cannot see it, and reading it before hydration would draw a different
	 * page than the server sent). A surface that does provide the store (a
	 * harness) is read through it, live.
	 */
	const prefStore = classroomPreferences();
	const storePrefs = prefStore ? reactivePreferences(prefStore) : null;
	let deviceShape = $state<ThumbShapeChoice>('class');
	onMount(() => {
		if (prefStore) return;
		deviceShape = readDeviceClassroomPreferences(page.data.claims?.sub ?? null).display.thumbShape;
	});
	const personalShape = $derived(storePrefs ? storePrefs.current.display.thumbShape : deviceShape);
	const shapeFor = (feed: SectionFeed): ThumbShape => resolveThumbShape(personalShape, feed.section.thumbnail_shape);

	/** The body's first picture as a thumbnail row, drawn through the one slot renderer. */
	const COVER_THUMB: ItemThumbnail = {
		source: 'image',
		manual: true,
		image_key: 'cover',
		attachment_id: null,
		image_width: null,
		image_height: null,
		focal_x: 0.5,
		focal_y: 0.5,
		html_document_id: null,
		interactive: false,
		updated_at: null
	};
	/**
	 * WHAT A WIDE OR BANNER SLOT DRAWS: the post's own thumbnail, else its
	 * body's first picture (the cover this card's mark already shows in Tile),
	 * else the generated look. One slot renderer for all three.
	 */
	/** A live thumbnail that declared `"interactive": true`, the class page's own test. */
	const keepsOwnClicks = (item: FeedEntry['item']) =>
		item.thumbnail?.source === 'html' && !!item.thumbnail.html_document_id && item.thumbnail.interactive;

	function slotOf(entry: FeedEntry): { item: { id: string; thumbnail?: ItemThumbnail | null; published?: boolean; publish_at?: string | null }; src: ((item: { id: string }) => string | null) | null } {
		if (hasThumbnailMedia(entry.item)) return { item: entry.item, src: null };
		const cover = feedCover(entry.item);
		if (!cover || failedCovers.has(entry.item.id)) return { item: { id: entry.item.id, thumbnail: null }, src: null };
		return { item: { id: entry.item.id, thumbnail: COVER_THUMB }, src: () => cover.src };
	}
</script>

{#snippet icon(kind: FeedEntry['item']['kind'])}
	<!-- The class page's own kind glyphs (`KIND_GLYPHS`, the same marks its Off
	     rows and every generated thumbnail draw), so a post's mark does not
	     change between the home page and its class, or between shapes.
	     Deliberately NO live pulse and no opened-progress dot: this surface has
	     no live state, and item views stay consumed only by the Updated badge. -->
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#each KIND_GLYPHS[kind] as d (d)}<path {d} />{/each}
	</svg>
{/snippet}

{#snippet thumb(feed: SectionFeed, entry: FeedEntry, glyphOnly = false)}
	{@const cover = glyphOnly ? null : feedCover(entry.item)}
	<!-- `glyphOnly`: thumbnails Off, so the mark is the kind glyph and nothing
	     else, the cover included ("no pictures, titles only"). -->
	{#if !glyphOnly && hasThumbnailMedia(entry.item)}
		<!--
			A POST WITH A THUMBNAIL OF ITS OWN (ledger 0396) shows it in the same
			34px box the cover and the glyph use, so the row's geometry does not
			move. `passive`: the row is the link, so an interactive HTML thumbnail
			is mounted as a plain one here and the click is the row's. A post with
			nothing set shows its body's cover, or the generated identity below.
		-->
		<div class="assignment-icon-thumb has-cover feed-post-thumb" data-testid="feed-post-thumb">
			<PostThumbnail item={entry.item} shape="tile" glyph={entry.item.kind} tint={tintOf(feed, entry)} label={itemTitle(entry.item)} passive />
		</div>
	{:else if !glyphOnly && !(cover && !failedCovers.has(entry.item.id))}
		<!--
			NOTHING OF ITS OWN AND NO PICTURE IN ITS BODY: the generated identity,
			the class page's Tile for the same post (its type glyph on a plate tile
			in its unit's tint), in the same 34px box. A cover that fails to decode
			lands here too.
		-->
		<div class="assignment-icon-thumb feed-post-thumb" data-testid="feed-post-glyph">
			<PostThumbnail item={{ id: entry.item.id, thumbnail: null }} shape="tile" glyph={entry.item.kind} tint={tintOf(feed, entry)} label={itemTitle(entry.item)} passive />
		</div>
	{:else}
	<div class="assignment-icon-thumb" class:has-cover={cover && !failedCovers.has(entry.item.id)}>
		{#if cover && !failedCovers.has(entry.item.id)}
			<!--
				THE THUMBNAIL, AND THE GLYPH IS STILL UNDERNEATH IT (0176).

				`alt=""` is deliberate and is not a missing description. The row is a
				LINK whose accessible name is already the item's title, and the
				picture is decoration on that link -- announcing the body's own
				description here would read the same item out twice, once by name and
				once by photograph. The description is not lost: `ItemBody` renders it
				as the figure's `alt` AND its caption on the item page, which is where
				a reader is actually looking at the picture. This is the same call the
				per-kind glyph already makes with `aria-hidden`.

				A COVER THAT FAILS TO DECODE FALLS BACK TO THE GENERATED IDENTITY,
				through the img's own `onerror` -- the classroom rule for a storage-backed
				thumbnail, applied here for the same reason: an attachment can be
				deleted after the body that names it was written, and a broken image
				icon in a 44px box is worse than the mark that was there before.
			-->
			<img
				src={cover.src}
				alt=""
				loading="lazy"
				decoding="async"
				onerror={() => (failedCovers = new Set(failedCovers).add(entry.item.id))}
			/>
		{:else}
			{@render icon(entry.item.kind)}
		{/if}
	</div>
	{/if}
{/snippet}

{#snippet slot(feed: SectionFeed, entry: FeedEntry, shape: 'wide' | 'banner')}
	{@const s = slotOf(entry)}
	<!-- Wide and Banner (ledger 0396): the slot above the title, the class
	     page's two stacked shapes, inside the row's own link (`passive`). -->
	<div class="feed-slot" data-testid="feed-post-thumb">
		<PostThumbnail item={s.item} {shape} glyph={entry.item.kind} tint={tintOf(feed, entry)} label={itemTitle(entry.item)} imageSrc={s.src} passive />
	</div>
{/snippet}

{#snippet rowText(feed: SectionFeed, entry: FeedEntry, shape: ThumbShape, own = false)}
	<a
		class="assignment-item linked feed-row"
		class:feed-row-under={own}
		href={itemHref(feed.section, entry, feed.manages)}
		data-urgency={dueUrgency(entry, now) ?? undefined}
		data-thumbs={shape}
		title={feed.manages && entry.reason === 'ungraded' ? `${attentionWords(entry)}: opens grading for this class` : undefined}
	>
		{#if own}
			<!-- The slot is above this link, keeping its own clicks. -->
		{:else if shape === 'wide' || shape === 'banner'}
			{@render slot(feed, entry, shape)}
			{#if shape === 'wide' && dueUrgency(entry, now)}
				<!-- The deadline marker beside this post's own slot and title, not
				     on the row's edge, which in columns is the line between two. -->
				<span class="feed-mark" aria-hidden="true"></span>
			{/if}
		{:else}
			{@render thumb(feed, entry, shape === 'off')}
		{/if}
		<div class="assignment-name">{itemTitle(entry.item)}</div>
		<StatusChip class="feed-flag" tone={reasonTone(entry.reason)} glyph={reasonGlyph(entry.reason)} label={feedIndicator(entry, now)} />
	</a>
{/snippet}

{#snippet row(feed: SectionFeed, entry: FeedEntry)}
	{@const shape = shapeFor(feed)}
	{#if (shape === 'wide' || shape === 'banner') && keepsOwnClicks(entry.item)}
		<!-- AN INTERACTIVE LIVE THUMBNAIL KEEPS ITS OWN CLICKS where it is drawn
		     big enough to have controls (the class page's rule): it sits ABOVE
		     the row's link rather than inside it, a press on one of its own
		     controls is its own, and a press anywhere else in it opens the post.
		     Drawn inert inside the link, its controls would show and do nothing. -->
		<div class="feed-own" data-thumbs={shape} data-urgency={dueUrgency(entry, now) ?? undefined}>
			{#if shape === 'wide' && dueUrgency(entry, now)}
				<span class="feed-mark" aria-hidden="true"></span>
			{/if}
			<div class="feed-slot" data-testid="feed-post-thumb">
				<PostThumbnail item={entry.item} {shape} glyph={entry.item.kind} tint={tintOf(feed, entry)} label={itemTitle(entry.item)} href={itemHref(feed.section, entry, feed.manages)} />
			</div>
			{@render rowText(feed, entry, shape, true)}
		</div>
	{:else}
		{@render rowText(feed, entry, shape)}
	{/if}
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
	{#if todoHref}
		<a class="feed-todo-all" href={todoHref} data-testid="feed-todo-all"
			>See all in To-do <span aria-hidden="true">&rsaquo;</span></a
		>
	{/if}
	{#each feeds as feed (feed.section.id)}
		{@const open = !collapsedSet.has(feed.section.id)}
		{@const summary = actionSummary(feed)}
		{@const soonSummary = dueSoonSummary(feed)}
		{@const listId = `feed-list-${feed.section.id}`}
		{@const code = feed.section.course?.code ?? 'CLASS'}
		{@const label = sectionLabelText(feed.section.label)}
		<div class="course-card section-card feed-card" class:collapsed={!open}>
			<div class="course-header feed-head">
				<a class="feed-open" href="{basePath}/{feed.section.id}" data-testid="feed-open">
					<div class="course-header-left">
						<div class="feed-ident">
							<span class="course-id">{code}</span>
							<span class="course-badge badge-block">{label}</span>
							{#if summary && !feed.manages}
								<StatusChip tone="warn" label={summary} data-testid="feed-attention" />
							{/if}
							{#if soonSummary}
								<StatusChip tone="info" glyph="clock" label={soonSummary} data-testid="feed-due-soon" />
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
				</a>
				{#if summary && feed.manages}
					<!--
						WHAT THIS CLASS NEEDS FROM ITS TEACHER, AS A CONTROL (report
						e4bc53e5, ledger 0416). It said "7 need attention" inside the
						class's link, so a press opened the class and nothing said what
						to do there. Now it names what is owed ("3 to grade · 1 draft")
						and goes to the fix: one owed thing is a link straight to it,
						several open the short list under this header.
					-->
					{#if feed.attention.length === 1}
						<a
							class="feed-attn feed-attn-key"
							style={toneStyle('warn')}
							href={itemHref(feed.section, feed.attention[0], true)}
							data-testid="feed-attention"
							title="{attentionWords(feed.attention[0])}: {itemTitle(feed.attention[0].item)}"
							><svg class="feed-attn-mark" viewBox="0 0 24 24" aria-hidden="true"
								><path d={STATUS_GLYPHS.alert.d} /></svg
							>{summary}<span class="feed-sr">: {attentionWords(feed.attention[0])}, {itemTitle(feed.attention[0].item)}</span></a
						>
					{:else}
						<button
							type="button"
							class="feed-attn feed-attn-key"
							style={toneStyle('warn')}
							class:on={openAttention === feed.section.id}
							aria-expanded={openAttention === feed.section.id}
							aria-controls="feed-needs-{feed.section.id}"
							data-testid="feed-attention"
							onclick={() => toggleAttention(feed.section.id)}
							onkeydown={(e) => {
								if (e.key === 'Escape' && openAttention === feed.section.id) {
									e.preventDefault();
									openAttention = null;
								}
							}}
							><svg class="feed-attn-mark" viewBox="0 0 24 24" aria-hidden="true"
								><path d={STATUS_GLYPHS.alert.d} /></svg
							>{summary}<span class="feed-sr">&nbsp;in {code} {label}: show what</span></button
						>
					{/if}
				{/if}
				<!--
					THE FOLD, AND ITS WORD. Wears `.changelog-toggle` because that is the
					home page's own key (Clear and Show more wear it for the same reason),
					so plate.css's key list draws it raised in every theme, and `.on` is
					the lit state a control that opens something keeps while open. The
					visible word is the start of its name, and the class it folds follows
					it for a screen reader, so four cards are not four "Hide" buttons.
				-->
				<button
					type="button"
					class="changelog-toggle feed-toggle"
					class:on={open}
					aria-expanded={open}
					aria-controls={listId}
					data-testid="feed-toggle"
					onclick={() => onToggle?.(feed.section.id)}
				>
					<span class="feed-toggle-word">{open ? 'Hide' : 'Show'}</span><span class="feed-sr"
						>&nbsp;{code} {label}</span
					><svg class="course-collapse-arrow" viewBox="0 0 10 6" aria-hidden="true"
						><path d="M0.5 0.5h9L5 5.5z" /></svg
					>
				</button>
			</div>

			{#if feed.manages && openAttention === feed.section.id && feed.attention.length > 1}
				<ul class="feed-needs" id="feed-needs-{feed.section.id}" data-testid="feed-needs" aria-label="What {code} {label} needs from you">
					{#each feed.attention as entry (entry.item.id)}
						<li>
							<a class="feed-need" href={itemHref(feed.section, entry, true)} data-reason={entry.reason}>
								<span class="feed-need-what" style={toneStyle(reasonTone(entry.reason))}>{attentionWords(entry)}</span>
								<span class="feed-need-title">{itemTitle(entry.item)}</span>
								<span class="feed-need-go" aria-hidden="true">&rsaquo;</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="assignment-list" id={listId} inert={!open}>
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
	/* A COVER FILLS THE MARK'S OWN BOX, so the row's geometry is byte-identical
	   whether a card has a picture or a glyph -- a feed whose rows changed
	   height depending on whether somebody attached a photo would be a worse
	   list than one with no pictures in it at all.

	   `cover` HERE AND `contain` IN THE BODY, on purpose. At 34px this is a
	   recognition cue and a letterboxed one is mostly empty box; on the item
	   page it is the picture itself, where cropping would hide the cut-off edge
	   somebody needs to read. Two sizes, two honest answers. */
	.assignment-icon-thumb.has-cover {
		padding: 0;
		overflow: hidden;
		background: var(--surface-2, var(--bg2));
	}
	.assignment-icon-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.feed-row .assignment-name {
		grid-area: name;
	}
	.feed-row :global(.feed-flag) {
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
		.feed-row :global(.feed-flag) {
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
	.feed-row[data-urgency='imminent'] :global(.feed-flag),
	.feed-row[data-urgency='today'] :global(.feed-flag),
	.feed-row[data-urgency='overdue'] :global(.feed-flag) {
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
	 * DUE TODAY BREATHES (prompt 0098, item I). The static rule above is the
	 * base state and is what a reduced-motion reader sees: fully drawn, nothing
	 * hidden. With motion allowed the same marker widens and eases back on a
	 * slow cycle -- an addition on top of the words, the weight and the rule,
	 * never the signal itself, and in the hue the row is already wearing.
	 * Slow and small on purpose: a row that flashes teaches a reader to ignore
	 * the one row that matters. ONLY `today`: overdue is already stated as
	 * loudly as this palette allows, and a scale whose every step moves has no
	 * "now" left in it. The keyframe starts and ends AT the static value, so the
	 * cycle never passes through a frame the base state does not already show.
	 */
	@media (prefers-reduced-motion: no-preference) {
		.feed-row[data-urgency='today'] > .feed-mark,
		.feed-own[data-urgency='today'] > .feed-mark,
		.feed-row[data-urgency='today'] {
			animation: feed-due-today 2.8s ease-in-out infinite;
		}
		@keyframes feed-due-today {
			0%,
			100% {
				box-shadow: inset 3px 0 0 0 var(--cyan);
			}
			50% {
				box-shadow: inset 7px 0 0 0 color-mix(in srgb, var(--cyan) 72%, transparent);
			}
		}
	}

	/*
	 * THE HEADER LOSES A LINE AT PHONE WIDTH, WHICH IS WHERE IT HAD TWO STACKED
	 * BLOCKS. `.course-meta` used to be a third flex child that dropped below the
	 * code and title at 375px; the badge and the count chip sit up on the code's
	 * own line now and the block/teacher line joins the title, so the header is
	 * two lines instead of three (111px -> 78px measured). Nothing was removed:
	 * every field the header carried, it still carries.
	 */
	/*
	 * THE HEADER IS A ROW OF TWO CONTROLS (ledger 0396, part 3). The shared
	 * `.course-header` rule keeps the ground, the rule under it and the plate;
	 * this takes its padding OFF the row and puts it on the link, so the link
	 * IS the header's whole left side and a click anywhere on the class's
	 * identity goes in, not just a click on its words. The fold sits at the
	 * right edge in a column of its own and never wraps under the link: a fold
	 * that dropped to a second line at 375 would sit under a different part of
	 * the header on every card. `.course-card` in the selector out-ranks the
	 * shared `.legacy-index .course-header` padding and its phone override.
	 */
	.course-card .feed-head {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-start;
		gap: 0;
		padding: 0;
	}
	/*
	 * ONE HOVER FOR THE WHOLE HEADER. The wash the header took when it was one
	 * button goes on the HEADER, never on the link: on the link it stopped at
	 * the fold key's column and drew a seam down the card beside the key. What
	 * says WHICH control the pointer is on is that control's own cue, the
	 * underlined title for the link and the key's lit edge for the fold.
	 * Pointer devices only, so a tap on Show does not leave a phone's header
	 * washed until the next tap somewhere else.
	 */
	@media (hover: hover) {
		.course-card .feed-head:hover {
			background: color-mix(in srgb, var(--green) 4%, var(--bg2));
		}
	}
	/*
	 * 0.75rem of right padding at EVERY width keeps the class's words at least
	 * 12px off the fold key. It was 0.25rem on a phone, where a teacher's
	 * "You teach this" ran to 5.4px from the key; a subline that no longer
	 * fits takes a second line instead.
	 *
	 * THE FOCUS RING FOLLOWS THE CARD'S CORNER. The card clips the header to
	 * its own inner radius (its panel radius less its 1px edge), so the link
	 * takes that radius wherever its corner IS the card's corner: the top left
	 * always, and the bottom left while the card is folded and the header is
	 * its last line. `--plate-r-panel` is the plate's card radius; 4px is
	 * app.css's, for the `SITE_PLATE = ''` revert.
	 */
	.feed-open {
		flex: 1 1 auto;
		align-self: stretch;
		display: flex;
		align-items: center;
		min-width: 0;
		padding: 1.1rem 0.75rem 1.1rem 1.5rem;
		color: inherit;
		text-decoration: none;
		cursor: pointer;
		border-top-left-radius: calc(var(--plate-r-panel, 4px) - 1px);
	}
	.feed-card.collapsed .feed-open {
		border-bottom-left-radius: calc(var(--plate-r-panel, 4px) - 1px);
	}
	/* The app-shell `a:hover` glow would blur every word of the identity at
	   once; the header's wash and an underlined title say it instead. */
	.feed-open,
	.feed-open:hover {
		text-shadow: none;
	}
	.feed-open:hover .course-updated,
	.feed-open:focus-visible .course-updated {
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.feed-open:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	.feed-open .course-header-left {
		min-width: 0;
	}
	/*
	 * THE FOLD. A 44px key at the right edge with its word beside the arrow.
	 * `.changelog-toggle` (app.css) is a full-width row with its parts pushed
	 * apart; this sizes it to its content, through `.feed-head` so it wins on
	 * specificity rather than on which stylesheet the dev server happened to
	 * inject last (a tie there flipped once on a cold start and drew the key
	 * across the whole header). Under the site plate, plate.css's
	 * key list paints the face, the hover and the lit state; the line and the
	 * word colour app.css gives it are the `SITE_PLATE = ''` revert.
	 *
	 * THE ARROW POINTS WHERE THE PRESS GOES, AS THE CHANGELOG'S KEY ON THIS
	 * PAGE ALREADY DOES: down while folded (Show opens downward), up while open
	 * (Hide folds it up). It pointed the other way while the whole header was
	 * the control and carried no word; with "Show" beside it, an up arrow on a
	 * folded card would contradict the word it sits next to.
	 */
	.feed-head .feed-toggle {
		flex: none;
		position: relative;
		width: auto;
		min-width: 44px;
		min-height: 44px;
		box-sizing: border-box;
		margin: 0 1.5rem 0 0;
		padding: 0 0.85rem;
		gap: 0.5rem;
		justify-content: center;
		white-space: nowrap;
	}
	/*
	 * THE FOLD ANSWERS ITS WHOLE COLUMN. The key is 44px tall in a header
	 * 79 to 134px tall with its margin to the card's edge beside it, so a press
	 * a little above, below or right of the face used to land on the bare
	 * header and do nothing (19 of 280 grid points a header at 1440, 24 to 28
	 * at 375). A transparent `::before` runs from the key's left edge past the
	 * header's top, bottom and right, and the header clips it, so the reach is
	 * exactly the column: the key's own button, never a second control and
	 * never a listener on the header, and nothing it can reach outside the
	 * header (the list's rows below keep every press). Behind `@supports`,
	 * because without `overflow: clip` the reach would run out over the list.
	 * plate.css draws nothing on a `.changelog-toggle`'s `::before`.
	 */
	@supports (overflow: clip) {
		.course-card .feed-head {
			overflow: clip;
		}
		.feed-head .feed-toggle::before {
			content: '';
			position: absolute;
			top: -20rem;
			bottom: -20rem;
			left: -1px;
			right: -20rem;
		}
	}
	/* The arrow is the same small down triangle the header always drew (the
	   `&#9662;` glyph), drawn as a shape: a font's triangle sits low in its em
	   box, so turned over for the open state it rode visibly above the word
	   beside it. A path turns about its own centre. */
	.feed-toggle .course-collapse-arrow {
		display: block;
		flex: none;
		width: 0.6rem;
		height: 0.36rem;
		color: inherit;
		fill: currentColor;
		transform: rotate(180deg);
	}
	.feed-card.collapsed .feed-toggle .course-collapse-arrow {
		transform: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.feed-toggle .course-collapse-arrow {
			transition: none;
		}
	}
	.feed-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	/* The shared header's phone padding (0.9rem 1rem at 768px and under),
	   moved onto the link and the fold with the rest of it. */
	@media (max-width: 768px) {
		.feed-open {
			padding: 0.9rem 0.75rem 0.9rem 1rem;
		}
		.feed-head .feed-toggle {
			margin-right: 1rem;
			padding: 0 0.7rem;
		}
	}
	/* ON A PHONE THE ARROW STANDS OVER ITS WORD, the way the header's
	   feedback control stacks its glyph over its word there. Side by side the
	   key took 66px of a 341px header and pushed the class's own subline onto
	   a second line (79.4px to 102.4px on a card with no attention count,
	   measured at 375); stacked it is 44px wide and the identity keeps the
	   room. The word stays: a glyph alone is not a control. */
	@media (max-width: 480px) {
		.feed-head .feed-toggle {
			flex-direction: column-reverse;
			gap: 0.3rem;
			margin-right: 0.625rem;
			padding: 0.35rem 0.45rem;
		}
	}
	.feed-ident {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	/* THE ATTENTION COUNT (ledger 0392, report 54b43698). A mark beside the
	   words, never color alone; the warn tone's solid face and its word
	   (ledger 0466, the one tone map), so it is the one warm thing on the card. */
	.feed-attn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-weight: 700;
		color: var(--st-on);
		background: var(--st-solid);
		border: 1px solid var(--st-edge);
	}
	/* THE TEACHER'S KEY: the same warm flag, pressable, at least 44px tall,
	   between the class's identity and its fold. */
	.feed-head .feed-attn-key {
		flex: none;
		position: relative;
		z-index: 1;
		min-height: 44px;
		box-sizing: border-box;
		margin: 0 0.6rem 0 0;
		padding: 0 0.8rem;
		border-radius: var(--plate-r-control, 8px);
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.feed-head .feed-attn-key:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.feed-head .feed-attn-key.on {
		box-shadow: inset 0 0 0 2px var(--st-edge);
	}
	/* THE KEY ANSWERS ITS WHOLE COLUMN, as the fold does: the header around it
	   (above it, below it, and the gap to the fold) is the key, never the bare
	   header (tools/browser-verify's header grid holds every point to a control).
	   The header clips it, under the same `@supports` as the fold's reach. */
	@supports (overflow: clip) {
		.feed-head .feed-attn-key::before {
			content: '';
			position: absolute;
			top: -20rem;
			bottom: -20rem;
			left: 0;
			right: -0.6rem;
		}
	}
	/* The short list: one line per owed thing, what is owed first, then the
	   post, then where the press goes. Recessed under the header, so it reads as
	   the header's own detail and not as more of the class's posts. */
	.feed-needs {
		list-style: none;
		margin: 0;
		padding: 0.35rem 1.5rem 0.6rem;
		display: grid;
		gap: 0.15rem;
		border-bottom: 1px solid var(--plate-groove-dk, color-mix(in srgb, var(--white) 10%, transparent));
		background: var(--plate-well-face, color-mix(in srgb, var(--bg0) 70%, transparent));
	}
	.feed-need {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem;
		min-height: 44px;
		padding: 0 0.4rem;
		border-radius: var(--plate-r-small, 6px);
		color: inherit;
		text-decoration: none;
		text-shadow: none;
		background: none;
	}
	.feed-need:hover,
	.feed-need:focus-visible {
		background: color-mix(in srgb, var(--green) 6%, transparent);
	}
	.feed-need:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	.feed-need-what {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--st-ink);
		white-space: nowrap;
	}
	.feed-need-title {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 0.98rem;
		color: var(--white);
	}
	.feed-need-go {
		color: var(--dim);
		font-size: 1.1rem;
	}
	@media (max-width: 768px) {
		.feed-needs {
			padding: 0.35rem 1rem 0.6rem;
		}
	}
	/* On a phone the key takes its own line under the class's identity. */
	@media (max-width: 480px) {
		.course-card .feed-head:has(.feed-attn-key) {
			flex-wrap: wrap;
		}
		.course-card .feed-head:has(.feed-attn-key) .feed-open {
			flex: 1 1 calc(100% - 64px);
		}
		/* Its own line under the identity, stopping short of the fold's column
		   (the fold key, its 0.625rem margin and a 0.6rem gap), so a press
		   under the fold is still the fold's. Its reach runs down to the
		   header's foot and out to the card's left edge, never up into the
		   class's link. */
		.feed-head .feed-attn-key {
			order: 3;
			flex: 1 1 0;
			margin: 0 calc(44px + 0.625rem + 0.6rem) 0.75rem 1rem;
			justify-content: center;
		}
		@supports (overflow: clip) {
			.feed-head .feed-attn-key::before {
				top: 0;
				bottom: -0.75rem;
				left: -1rem;
			}
		}
		.feed-need {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'what go' 'title go';
			gap: 0.1rem 0.6rem;
			padding: 0.35rem 0.4rem;
		}
		.feed-need-what {
			grid-area: what;
		}
		.feed-need-title {
			grid-area: title;
		}
		.feed-need-go {
			grid-area: go;
		}
	}
	.feed-attn-mark {
		width: 0.85rem;
		height: 0.85rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* SPACE WHITE: the section label steps back to the room's quiet ink, so the
	   card holds two colors (the class code and the warning) rather than four. */
	:global(:root[data-theme='space-white']) .feed-ident :global(.badge-block) {
		color: var(--text-2);
		border-color: var(--hairline);
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

	/*
	 * THE DOOR TO THE WHOLE LIST, right-aligned above the cards so it reads as
	 * the heading's continuation. 44px, like every student control, and only
	 * as wide as its words: a full-width box would make the empty stretch to
	 * its left a link nobody can see.
	 */
	.feed-todo-all {
		display: flex;
		align-items: center;
		width: fit-content;
		min-height: 44px;
		margin: -0.4rem 0 0.4rem auto;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--hover-ink);
		text-decoration: none;
	}
	.feed-todo-all:hover {
		color: var(--green);
	}
	/*
	 * SPACE WHITE TAKES THE BRASS OFF IT (ledger 0298, decision 40 item 1). A
	 * lightness-only gold on a white ground is the brown #715d22, so there the
	 * link takes the home page's own link pair instead -- cyan at rest, green
	 * under the pointer, as Sign in, Tour and every text button on the page
	 * already are. Both halves are restated because the themed rest rule
	 * outranks the plain hover one. The dark themes keep the brass.
	 */
	:global(:root[data-theme='space-white']) .feed-todo-all {
		color: var(--cyan);
	}
	:global(:root[data-theme='space-white']) .feed-todo-all:hover {
		color: var(--green);
	}
	/*
	 * "OPEN CLASS" measured 40.9px tall at 375 (FRICTION.md, student to-do):
	 * the shared app.css rule gives it padding and no floor. The floor is added
	 * here, on this component's own link, so the other `.feed-more` surfaces
	 * are untouched.
	 */
	.assignment-list .feed-more {
		display: flex;
		align-items: center;
		min-height: 44px;
		box-sizing: border-box;
	}

	/* A post's own thumbnail (ledger 0396) fills the 34px mark box exactly:
	   the slot draws its own edge, so the box gives up its border and wash.
	   (The box keeps its 1px border, transparent, so the row's geometry is the
	   mark's to the pixel, and the slot fills what is inside it.) */
	.assignment-icon-thumb.feed-post-thumb {
		--thumb-tile: 100%;
		--thumb-tile-r: var(--radius-control, 3px);
		border-color: transparent;
		background: none;
	}

	/*
	 * WIDE AND BANNER ON A CARD'S ROWS (ledger 0396, the person's Display
	 * settings shape reaching the home page). The slot takes the row's first
	 * line and the title and its flag sit under it, the class page's stacked
	 * shapes; the kind glyph steps aside, as it does there, because the slot
	 * carries the identity. A Wide picture is held to the class list's own
	 * pane width (26rem) so a card on a wide window stays a list a reader can
	 * scan rather than a column of posters; a Banner is the strip across the
	 * whole row. Tile and Off keep the 34px mark column exactly as it was.
	 */
	.feed-row[data-thumbs='wide'],
	.feed-row[data-thumbs='banner'] {
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas:
			'thumb'
			'name'
			'flag';
		row-gap: 0.35rem;
		/* A row stretched to its grid line's tallest neighbour keeps its slot
		   and its title at the top, so titles line up across the line. */
		align-content: start;
	}
	/* THE HOVER NUDGE NEVER RESIZES A PICTURE (integration review). app.css's
	   shared row hover grows the row's left padding, which in a Tile or Off row
	   slides the mark and the title; a Wide or Banner slot takes its height from
	   its width, so the same nudge shrank and recropped the picture and moved
	   every row under a row alone on its line (375: 309x174 to 296x167, the card
	   below jumping 7.2px). These rows keep their resting padding (app.css's own
	   two values, 1.5rem and 1rem at 768px and under) and keep the wash. */
	:global(.legacy-index) .feed-row[data-thumbs='wide']:hover,
	:global(.legacy-index) .feed-row[data-thumbs='banner']:hover {
		padding-left: 1.5rem;
	}
	@media (max-width: 768px) {
		:global(.legacy-index) .feed-row[data-thumbs='wide']:hover,
		:global(.legacy-index) .feed-row[data-thumbs='banner']:hover {
			padding-left: 1rem;
		}
	}
	.feed-slot {
		grid-area: thumb;
		min-width: 0;
	}
	.feed-row[data-thumbs='wide'] .feed-slot {
		width: 100%;
		max-width: 26rem;
	}
	@media (min-width: 700px) {
		.feed-row[data-thumbs='wide'],
		.feed-row[data-thumbs='banner'] {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'thumb thumb'
				'name flag';
		}
	}
	/*
	 * A WIDE CARD USES ITS WIDTH. One Wide row a line left most of a desktop
	 * card empty beside each picture (measured at 1440: a 416px slot in a
	 * 1034px row), so the rows go into as many columns of at least 20rem as
	 * the card holds, read left to right in the ranking's order, the way the
	 * class page lays its units in columns; a phone keeps one. The shelf label,
	 * an empty card's sentence and the Open class link span the whole card.
	 */
	.assignment-list:has(> [data-thumbs='wide']) {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
	}
	.assignment-list:has(> [data-thumbs='wide']) > :not([data-thumbs]) {
		grid-column: 1 / -1;
	}

	/* The slot answers the row's own hover, the way the class page's does. */
	.feed-row:hover :global(.pt),
	.feed-own:hover :global(.pt) {
		outline-color: var(--hover-ink);
	}
	/*
	 * An interactive live thumbnail's row: the slot above, inset by the row's
	 * own padding (app.css: 1.5rem, 1rem at 768px and under) so it lines up
	 * with every other row's slot, and the title's link under it carrying the
	 * divider the whole row would carry. The link keeps its hover shift; the
	 * slot is its own control and does not move with it.
	 */
	.feed-own {
		border-bottom: 1px solid color-mix(in srgb, var(--li-mint, var(--green)) 5%, transparent);
	}
	.feed-own > .feed-slot {
		padding: 0.65rem 1.5rem 0;
	}
	.feed-own[data-thumbs='wide'] > .feed-slot {
		max-width: calc(26rem + 3rem);
		box-sizing: border-box;
	}
	.feed-own > .feed-row-under {
		align-content: start;
		padding-top: 0.35rem;
		/* Its own 44px target: on one line above 700px it measured 39.2px. */
		min-height: 44px;
		box-sizing: border-box;
		border-bottom: none;
		grid-template-areas:
			'name'
			'flag';
	}
	/* The deadline's leading-edge marker runs down the whole row, slot
	   included, so it is the wrapper's here rather than the title link's (the
	   static marks only: this rare row does not breathe). */
	.feed-own[data-urgency='imminent'] {
		box-shadow: inset 3px 0 0 -1px color-mix(in srgb, var(--cyan) 45%, transparent);
	}
	.feed-own[data-urgency='today'] {
		box-shadow: inset 3px 0 0 0 var(--cyan);
	}
	.feed-own[data-urgency='overdue'] {
		box-shadow: inset 3px 0 0 0 var(--amber);
	}
	.feed-own > .feed-row {
		box-shadow: none;
		animation: none;
	}
	@media (max-width: 768px) {
		.feed-own > .feed-slot {
			padding-inline: 1rem;
		}
		.feed-own[data-thumbs='wide'] > .feed-slot {
			max-width: calc(26rem + 2rem);
		}
	}
	@media (min-width: 700px) {
		.feed-own > .feed-row-under {
			grid-template-areas: 'name flag';
		}
	}

	/*
	 * AN EXPANDED CARD SHOWS EVERY ROW AND ITS OPEN CLASS LINK, IN EVERY SHAPE
	 * (ledger 0396, review of the polish round). app.css caps
	 * `.legacy-index .assignment-list` at 1200px with `overflow: hidden` so the
	 * fold has a height to ease from, which was harmless while every row was a
	 * 34px mark. A Wide row is about 250px at 375 and a Banner row about 133px,
	 * so the cap clipped whole posts and the Open class link (measured: a full
	 * card in Wide at 375 was 1200 of 2349px, five rows and the link out of
	 * reach), and `hidden`, being a scroll container, let a focus or a
	 * `scrollIntoView` onto the link scroll the list inside itself and strand
	 * the rows at its top. So an open card's list has no ceiling and clips
	 * rather than hides (`clip` has no scroll position to get stuck at), and
	 * the fold eases from the list's real height: `interpolate-size` lets
	 * `max-height` move between `max-content` and 0, and it sits on the list in
	 * BOTH states because a transition reads it from the style it moves to. A
	 * browser without it folds at once (`max-content` cannot be interpolated
	 * there), which costs a 0.35s ease and never a row.
	 */
	.feed-card > .assignment-list {
		interpolate-size: allow-keywords;
	}
	.feed-card:not(.collapsed) > .assignment-list {
		max-height: none;
		max-height: max-content;
		overflow: hidden;
		overflow: clip;
	}

	/*
	 * A WIDE ROW'S DEADLINE MARKER HUGS ITS OWN POST (ledger 0396, review of
	 * the polish round). On a list row the inset marker runs down the row's
	 * leading edge, which is the card's edge; once Wide lays the rows in
	 * columns, a row's leading edge is the line between two columns, so the
	 * third column's marker read as a rule belonging to the second. In Wide the
	 * marker is its own element instead (`.feed-mark`, a real node: Svelte
	 * prunes a scoped pseudo-element), a grid item spanning the slot, the title
	 * and the flag, sitting 4px from the post's own left edge in the row's
	 * padding. It follows the row's hover shift because it is in the row's
	 * grid, and it breathes on the same keyframe as the list marker
	 * (`feed-due-today`, in the reduced-motion block above). The row itself
	 * draws no marker in Wide.
	 */
	.feed-row[data-thumbs='wide'][data-urgency],
	.feed-own[data-thumbs='wide'][data-urgency] {
		box-shadow: none;
		animation: none;
	}
	.feed-mark {
		grid-column: 1;
		grid-row: 1 / -1;
		justify-self: start;
		align-self: stretch;
		width: 7px;
		margin-left: -11px;
		pointer-events: none;
	}
	.feed-row[data-urgency='imminent'] > .feed-mark,
	.feed-own[data-urgency='imminent'] > .feed-mark {
		box-shadow: inset 3px 0 0 -1px color-mix(in srgb, var(--cyan) 45%, transparent);
	}
	.feed-row[data-urgency='today'] > .feed-mark,
	.feed-own[data-urgency='today'] > .feed-mark {
		box-shadow: inset 3px 0 0 0 var(--cyan);
	}
	.feed-row[data-urgency='overdue'] > .feed-mark,
	.feed-own[data-urgency='overdue'] > .feed-mark {
		box-shadow: inset 3px 0 0 0 var(--amber);
	}
	/* The interactive thumbnail's row is a block, not the row's grid: the
	   marker is placed against the wrapper, from the slot's top to the title
	   link's foot, at the same 4px from the slot as every other Wide row. */
	.feed-own[data-thumbs='wide'] {
		position: relative;
	}
	.feed-own > .feed-mark {
		position: absolute;
		top: 0.65rem;
		bottom: 0.65rem;
		left: calc(1.5rem - 11px);
		margin-left: 0;
	}
	@media (max-width: 768px) {
		.feed-own > .feed-mark {
			left: calc(1rem - 11px);
		}
	}
</style>
