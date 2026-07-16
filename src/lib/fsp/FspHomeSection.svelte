<script lang="ts">
	import type { Section, Assignment } from '$lib/curriculum';

	/**
	 * The FSP section card pinned atop the homepage, factored out so the dev
	 * harness (/dev/fsp-home) mounts the exact same component (the FspTechSelection
	 * / FrcInterestForm convention). Rendering-only: the parent owns the opened-set
	 * and the write, this component just reports OPEN clicks through `onOpen`.
	 *
	 * All base chrome (.course-card, .assignment-item, .course-header) is styled in
	 * app.css under `.legacy-index`; the FSP-specific additions (grouping, HUD
	 * corner brackets, drifting grid backdrop, live pulse, progress dots) live in
	 * the `.fsp-home-card` block there too, so this file is markup only and the
	 * harness renders identically by wrapping itself in `.legacy-index`.
	 */

	interface Props {
		/** The FSP section (summer program) — supplies the card header. */
		section: Section;
		/** Full ordered item list (section assignments + any teacher extras). */
		items: Assignment[];
		/** Whether a user is signed in (progress dots only render when signed in). */
		signedIn?: boolean;
		/** Slugs the student has already opened (filled dot / check). */
		openedSet?: Set<string>;
		/** Fired on an item's OPEN click; the parent persists first-open state. */
		onOpen?: (slug: string) => void;
	}

	let { section, items, signedIn = false, openedSet = new Set(), onOpen }: Props = $props();

	// Row icon-glyph kind by assignment slug. Live items (Q&A, question feed) are
	// the `pulse` kind and additionally get the pulsing LIVE indicator.
	type AssignmentIconKind = 'deck' | 'pulse' | 'plugin' | 'book' | 'clipboard' | 'archive';
	const ICON_KINDS: Record<string, AssignmentIconKind> = {
		'fsp-day1': 'deck',
		'fsp-day2': 'deck',
		'fsp-ask': 'pulse',
		'fsp-live': 'pulse',
		'fsp-addin': 'plugin',
		'IDEA-Blade_Rulebook_v2_2': 'book',
		'frc-interest': 'clipboard',
		'course-archive': 'archive'
	};
	const iconKind = (slug: string): AssignmentIconKind | undefined => ICON_KINDS[slug];

	// A single flat list (no section headers), but kept in a sensible order:
	// presentations, then the live items adjacent, then tools, then the form. Any
	// slug not in this order sorts to the end (stable) so nothing is ever dropped.
	const ORDER = [
		'fsp-day1',
		'fsp-day2',
		'fsp-ask',
		'fsp-live',
		'fsp-addin',
		'IDEA-Blade_Rulebook_v2_2',
		'frc-interest',
		'course-archive'
	];
	const orderedItems = $derived.by(() => {
		const rank = (slug: string) => {
			const i = ORDER.indexOf(slug);
			return i === -1 ? ORDER.length : i;
		};
		return [...items].sort((a, b) => rank(a.slug) - rank(b.slug));
	});

	const isLive = (slug: string) => iconKind(slug) === 'pulse';
	const handleOpen = (slug: string) => {
		if (signedIn && !openedSet.has(slug)) onOpen?.(slug);
	};
</script>

{#snippet icon(kind: AssignmentIconKind)}
	<div class="assignment-icon-thumb" class:icon-pulse={kind === 'pulse'}>
		{#if kind === 'deck'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="4" width="18" height="13" rx="1.5" />
				<path d="M7 9h6M7 12h4" />
				<path d="M8 20l4-3 4 3" />
			</svg>
		{:else if kind === 'pulse'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M2 12h4l2-7 4 14 3-10 2 3h5" />
			</svg>
		{:else if kind === 'plugin'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
				<path d="M12 12v9M12 12l8-4.5M12 12l-8-4.5" />
			</svg>
		{:else if kind === 'book'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 014 18.5v-13z" />
				<path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 001.5-1.5v-13z" />
			</svg>
		{:else if kind === 'clipboard'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="5" y="4" width="14" height="17" rx="1.5" />
				<rect x="9" y="2.5" width="6" height="3" rx="1" />
				<path d="M8.5 11l2 2 4-4.5M8.5 16h7" />
			</svg>
		{:else if kind === 'archive'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="4" width="18" height="4" rx="1" />
				<path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
				<path d="M10 12h4" />
			</svg>
		{/if}
	</div>
{/snippet}

<div class="course-card section-card fsp-home-card">
	<span class="hud-corner tl" aria-hidden="true"></span>
	<span class="hud-corner tr" aria-hidden="true"></span>
	<span class="hud-corner bl" aria-hidden="true"></span>
	<span class="hud-corner br" aria-hidden="true"></span>

	<div class="course-header collapsible">
		<div class="course-header-left">
			<div class="course-id">{section.course}</div>
			<div class="course-updated">{section.title}</div>
		</div>
		<div class="course-meta">
			<span class="course-badge badge-block">{section.yearLabel}</span>
			<span class="section-meta">{section.instructor} &middot; {section.term}</span>
			{#if section.status === 'live'}
				<span class="assignment-status status-live">Live</span>
			{/if}
			{#if section.isNew}<span class="badge-new">New</span>{/if}
		</div>
		<span class="course-collapse-arrow">&#9662;</span>
	</div>

	<div class="assignment-list">
		{#each orderedItems as a (a.slug)}
			{@const opened = openedSet.has(a.slug)}
			<a
				class="assignment-item linked"
				href={a.href ?? `/assignments/${a.slug}`}
				onclick={() => handleOpen(a.slug)}
			>
				<div class="assignment-left">
					{#if iconKind(a.slug)}
						{@render icon(iconKind(a.slug)!)}
					{/if}
					<div class="assignment-name">{a.title}</div>
					{#if isLive(a.slug)}
						<span class="live-pulse" aria-hidden="true"></span>
					{/if}
				</div>
				<div class="assignment-right">
					{#if signedIn}
						<span
							class="open-progress"
							class:done={opened}
							title={opened ? 'Opened' : 'Not opened yet'}
							aria-label={opened ? 'Opened' : 'Not opened yet'}
						>
							{#if opened}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
									<path d="M5 12.5l4.5 4.5L19 6.5" />
								</svg>
							{/if}
						</span>
					{/if}
					<span class="assignment-status status-live">Open</span>
				</div>
			</a>
		{/each}
	</div>
</div>
