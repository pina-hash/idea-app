<script lang="ts">
	import { page } from '$app/state';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import ThemeSwitch from '$lib/shell/ThemeSwitch.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import { sectionTitle, sortSections, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		canCollapseNav,
		locateClassroom,
		visibleSectionTabs,
		type Crumb,
		type SectionTab,
		type SectionTabId,
		classroomPathname
	} from '$lib/classroom/nav';
	import { navCollapseKey, readNavCollapsed, writeNavCollapsed } from '$lib/classroom/nav-collapse';
	import { formatSectionLabel } from '$lib/section-label';
	import { classGlyph } from '$lib/classroom/class-glyph';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import VoiceNav from '$lib/voice/VoiceNav.svelte';
	import { feedbackIsAnonymous, feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild } from '$lib/feedback/context';
	import { version as buildId } from '$app/environment';
	import { deploy } from 'virtual:site-versions';
	import CommandPalette from '$lib/shell/CommandPalette.svelte';
	import ClassroomSettings from '$lib/classroom/ClassroomSettings.svelte';
	import { ICONS, keysFor, surfaceFor } from '$lib/shell/commands';
	import { registerCommandHandler } from '$lib/shell/command-handlers';
	import type { PaletteSources, PaletteStudent } from '$lib/shell/palette';
	import type { ClassroomPreferences } from '$lib/preferences/classroom';
	import type { PreferenceStore } from '$lib/preferences/store';

	/**
	 * The persistent room every /classroom page renders inside.
	 *
	 * WHY IT EXISTS: each capability used to own its own page with nothing
	 * between them, so moving between a class, an item, grading and the roster
	 * meant returning to the hub and drilling back down. The switcher is the fix
	 * -- every class the caller is enrolled in or teaches, always on screen, one
	 * click away, on every route below /classroom.
	 *
	 * Presentation only (the MyClasses/ClassPage convention): the layout works
	 * out where it is from the URL through `$lib/classroom/nav` and hands the
	 * answer down, so this component can be mounted in the dev harness with no
	 * router at all. It decides nothing about access -- `tabs` is filtered by the
	 * `canManage` the SERVER answered with, and the People and Grades routes 404
	 * for anybody else regardless of what is rendered here.
	 */
	let {
		sections = [],
		currentSectionId = null,
		crumbs = [],
		tabs = [],
		tab = null,
		canManage = false,
		isStaff = false,
		isAdmin = false,
		minimal = false,
		basePath = '/classroom',
		backHref = '/classroom',
		backLabel = 'Classroom',
		palette = null,
		preferences = null,
		loadStudents = null,
		todoHref = null,
		children
	}: {
		sections?: ClassroomSection[];
		currentSectionId?: string | null;
		crumbs?: Crumb[];
		/** Every tab this section has; manager-only ones are filtered here. */
		tabs?: SectionTab[];
		tab?: SectionTabId | null;
		canManage?: boolean;
		isStaff?: boolean;
		isAdmin?: boolean;
		/**
		 * The view-as tree: that page renders somebody else's classroom under an
		 * impersonation banner, so a switcher listing the ADMIN'S OWN classes
		 * beside a student's name would be actively misleading. It keeps the room
		 * and loses the furniture.
		 */
		minimal?: boolean;
		/** Where this shell is mounted; the dev harnesses pass their own base so the location logic reads true there. */
		basePath?: string;
		/** The way up in minimal mode, where there is no switcher to be the way up. */
		backHref?: string;
		backLabel?: string;
		/**
		 * WHAT THE COMMAND PALETTE SEARCHES (ledger 0297): the class the layout
		 * loaded, the switcher's classes, the viewer's check-ins. Null removes the
		 * Search control AND the Ctrl+K listener -- absence is the mechanism, the
		 * way an omitted transport removes its control.
		 */
		palette?: PaletteSources | null;
		/** The classroom preference store. Null removes the Settings control. */
		preferences?: PreferenceStore<ClassroomPreferences> | null;
		/** A manager's roster for the palette's `@` search. */
		loadStudents?: ((sectionId: string) => Promise<PaletteStudent[]>) | null;
		/**
		 * THE TO-DO DOOR (ledger 0297): where a student's cross-class to-do lives.
		 * Null removes the control; the layout hands it to a viewer who is not
		 * staff, which is who the page lists work for.
		 */
		todoHref?: string | null;
		children: import('svelte').Snippet;
	} = $props();

	let switcherOpen = $state(false);
	/* The whole right-hand group: the narrow Menu button, the class menu and
	   the tools. Outside-dismiss asks whether a press landed inside it. */
	let switcherEl = $state<HTMLElement | null>(null);
	let stripEl = $state<HTMLElement | null>(null);

	/*
	 * REPORT AND VOICE LIVE IN THIS HEADER (ledger 0297). `FEEDBACK_EXCLUSIONS`
	 * takes both floating pills off every classroom route (its `classroom`
	 * rule), and this is where they reappear, so nothing floats over a row, a
	 * grip or a Return button. The same props the root mount hands SiteFeedback,
	 * derived the same way the GAUNTLET layout derives them for its own
	 * relocation: one predicate for the writer and the anonymous flag.
	 * Not on the deck: that route has its own bar and its own relocation.
	 */
	const feedbackBuild = describeBuild(deploy, buildId);
	const feedbackSubmit = $derived(feedbackWriter(page.data.supabase, page.data.claims?.sub));
	const feedbackAnonymous = $derived(feedbackIsAnonymous(page.data.supabase, page.data.claims?.sub));
	const signedIn = $derived(!!page.data?.claims?.sub);

	/**
	 * THE NAV-COLLAPSE TOGGLE (see $lib/classroom/nav-collapse.ts for why this
	 * lives outside the pane it affects).
	 *
	 * This component is mounted by the OUTER classroom layout, which is not
	 * remounted when the URL moves from one item to the next -- so a plain
	 * `$state` here already survives "every subsequent item" with no module-
	 * level trick. What it does not survive on its own is a reload, which is
	 * what the localStorage round trip is for.
	 *
	 * SAME OVERRIDE SHAPE AS `Disclosure.svelte`: `stored` is a derived read so
	 * the first render already has the remembered answer, and `override` is
	 * what a click can see immediately without waiting on localStorage to
	 * become reactive (it is not). Keyed on the viewer, like a disclosure --
	 * this is a decision about how this person reads, not about the screen
	 * in front of them.
	 */
	/* Read through `classroomPathname` so a harness mounting this shell under
	   another base sees the same place the shipping route does -- the collapse
	   control below is gated on it, and a harness that never rendered the
	   control measured nothing (prompt 0098, item H). */
	const loc = $derived(locateClassroom(classroomPathname(page.url.pathname, basePath)));
	const showNavToggle = $derived(!minimal && canCollapseNav(loc));
	const viewer = $derived((page.data?.claims?.sub as string | undefined) ?? null);
	const navCollapseStorageKey = $derived(navCollapseKey(viewer));
	const storedNavCollapsed = $derived(readNavCollapsed(navCollapseStorageKey));
	let navCollapseOverride = $state<{ key: string; collapsed: boolean } | null>(null);
	const navCollapsed = $derived(
		navCollapseOverride && navCollapseOverride.key === navCollapseStorageKey
			? navCollapseOverride.collapsed
			: storedNavCollapsed
	);

	function toggleNavCollapsed() {
		const next = !navCollapsed;
		navCollapseOverride = { key: navCollapseStorageKey, collapsed: next };
		writeNavCollapsed(navCollapseStorageKey, next);
	}

	const ordered = $derived(sortSections(sections));
	const current = $derived(ordered.find((s) => s.id === currentSectionId) ?? null);
	// The filter is `visibleSectionTabs` in nav.ts -- see its header for why it
	// is not written out here.
	const visibleTabs = $derived(visibleSectionTabs(tabs, canManage));

	/*
	 * THE PALETTE'S VIEW OF WHERE IT IS. Inside a class the role is the
	 * server's `canManage` for that class; outside one, staff are offered the
	 * staff doors. Presentation only, like the tabs: every destination re-checks.
	 */
	let paletteEl = $state<ReturnType<typeof CommandPalette> | null>(null);
	let settingsEl = $state<ReturnType<typeof ClassroomSettings> | null>(null);
	const paletteRole = $derived<'student' | 'manager'>(
		currentSectionId ? (canManage ? 'manager' : 'student') : isStaff || isAdmin ? 'manager' : 'student'
	);
	const paletteEnv = $derived({
		role: paletteRole,
		surface: surfaceFor(page.url.pathname, basePath, paletteRole),
		sectionId: currentSectionId,
		itemId: loc.itemId,
		itemKind: loc.itemId ? (palette?.items.find((i) => i.id === loc.itemId)?.kind ?? null) : null,
		basePath,
		isStaff,
		isAdmin
	});
	/* The shortcut, spelled for this keyboard (Cmd on a Mac), for the tooltip. */
	let platform = $state('');
	$effect(() => {
		platform = navigator.platform ?? '';
	});
	const paletteKeys = $derived(keysFor('Ctrl K', platform));

	/* Settings is a registry command as well as a header control. */
	$effect(() => {
		if (!preferences) return;
		return registerCommandHandler('settings.open', () => settingsEl?.open());
	});

	/**
	 * Dismiss on POINTERDOWN, not click, and ignore a target already detached --
	 * the ProfileMenu trap: the press that OPENS the panel would otherwise be the
	 * same event that closes it.
	 */
	function onPointerDown(event: PointerEvent) {
		if (!switcherOpen) return;
		const target = event.target as Node | null;
		if (!target || !target.isConnected) return;
		if (switcherEl?.contains(target)) return;
		switcherOpen = false;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && switcherOpen) {
			switcherOpen = false;
			/* Back to whichever trigger this width shows: the Classes button
			   above the fold breakpoint, the Menu button below it. */
			const triggers = [...(switcherEl?.querySelectorAll<HTMLElement>('.sw-trigger, .menu-trigger') ?? [])];
			triggers.find((t) => t.offsetParent !== null)?.focus();
		}
	}

	/* A tool pressed from inside the narrow Menu closes it, the way a menu
	   item does; the theme switch keeps it open so the change is visible. */
	function closeMenu() {
		switcherOpen = false;
	}

	/*
	 * THE CLASS ROW (report 26): IDEA_INTERFACE_STANDARDS section 1's strip
	 * rule, because `navSections` has no limit (an admin's is every section in
	 * the school). The row scrolls, not the page; it carries a real scrollbar;
	 * a vertical wheel scrolls it sideways and a mouse can drag it; every icon
	 * is a link in the tab order; and the current class is brought into view on
	 * mount and whenever the class changes. The class menu beside it lists every
	 * class in words as well, so selecting is never the only way to move.
	 */
	$effect(() => {
		const id = currentSectionId;
		const el = stripEl;
		if (!el) return;
		queueMicrotask(() => {
			const active = id ? el.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(id)}"]`) : null;
			if (!active) return;
			const left = active.offsetLeft - el.offsetLeft;
			const right = left + active.offsetWidth;
			if (left < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
				el.scrollLeft = Math.max(0, left - (el.clientWidth - active.offsetWidth) / 2);
			}
		});
	});

	/** Wheel and mouse drag on the row, attached directly (non-passive for the wheel). */
	function stripScroll(node: HTMLElement) {
		const onWheel = (e: WheelEvent) => {
			if (node.scrollWidth <= node.clientWidth) return;
			if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
			e.preventDefault();
			node.scrollLeft += e.deltaY;
		};
		let startX = 0;
		let startLeft = 0;
		let dragging = false;
		let moved = false;
		const onDown = (e: PointerEvent) => {
			if (e.pointerType !== 'mouse' || e.button !== 0) return;
			if (node.scrollWidth <= node.clientWidth) return;
			dragging = true;
			moved = false;
			startX = e.clientX;
			startLeft = node.scrollLeft;
		};
		const onMove = (e: PointerEvent) => {
			if (!dragging) return;
			const dx = e.clientX - startX;
			if (!moved && Math.abs(dx) < 6) return;
			moved = true;
			node.scrollLeft = startLeft - dx;
		};
		const onUp = () => {
			dragging = false;
		};
		/* A drag is not a click on whichever icon it ended over. */
		const onClick = (e: MouseEvent) => {
			if (moved) {
				e.preventDefault();
				e.stopPropagation();
				moved = false;
			}
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		node.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		node.addEventListener('click', onClick, true);
		return {
			destroy() {
				node.removeEventListener('wheel', onWheel);
				node.removeEventListener('pointerdown', onDown);
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				node.removeEventListener('click', onClick, true);
			}
		};
	}
</script>

<svelte:window onpointerdown={onPointerDown} onkeydown={onKeyDown} />

<!--
	ONE ROW AT EVERY WIDTH (ledger 0297). The masthead used to wrap to 134px at
	375 and to two rows between about 430 and 590px, spending a phone's first
	screen on chrome. Left to right: the way back (view-as only), the logo, the
	class row (report 26), then the right-hand group. Above the fold breakpoint
	the group is the class menu and the tools in a row; below it the tools fold
	into ONE labeled Menu button with the class list inside it. Nothing is
	dropped: every control is either in the row or one press away in the Menu,
	and the command palette reaches Settings and the theme too.
-->
<div class="app-header cr-header" class:cr-header-minimal={minimal}>
	{#if minimal}
		<!-- REPORT 34: "all back buttons should be somewhere on the top left of
		     the screen". The first thing in the masthead, before the logo. -->
		<a class="shell-back" href={backHref} data-testid="shell-back">&lsaquo; {backLabel}</a>
	{/if}
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"
		><AnimatedLogo width="clamp(56px, 11vw, 104px)" /></a
	>

	{#if !minimal}
		<!-- THE CLASSES, AS ICONS IN THE BANNER (report 26): "my classes should
		     just be listed on the top page banner itself in the form of icons".
		     Each is a link with a glyph derived from the course code and the
		     section (there is no per-section glyph in the data), 44px, in the tab
		     order; the current one carries aria-current, a filled ground and an
		     underline bar, so colour is never the only signal. -->
		<nav class="cls-strip-wrap" aria-label="Your classes">
			<ul class="cls-strip" bind:this={stripEl} use:stripScroll data-testid="class-strip">
				{#each ordered as s (s.id)}
					{@const g = classGlyph(s)}
					{@const name = `${s.course?.code ?? 'Class'} ${formatSectionLabel(s.label, s.block)}`}
					<li>
						<a
							class="cls-icon"
							class:current={s.id === currentSectionId}
							class:archived={s.active === false}
							href={`${basePath}/${s.id}`}
							aria-current={s.id === currentSectionId ? 'page' : undefined}
							aria-label={s.active === false ? `${name}, archived` : name}
							title={s.course?.title ? `${s.course.title}: ${name}` : name}
							data-section-id={s.id}
							data-testid="class-icon"
						>
							<span class="cls-code" aria-hidden="true">{g.code}</span>
							{#if g.sub}<span class="cls-sub" aria-hidden="true">{g.sub}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}

	<div class="header-right" class:menu-open={switcherOpen} bind:this={switcherEl}>
		{#if !minimal}
			<!-- The narrow-width Menu: the tools and the class list behind one
			     labeled control. Hidden above the fold breakpoint, where the same
			     tools sit in the row. -->
			<button
				type="button"
				class="menu-trigger"
				aria-expanded={switcherOpen}
				aria-controls="shell-tools"
				data-testid="shell-menu"
				onclick={() => (switcherOpen = !switcherOpen)}
			>
				<span class="menu-glyph" aria-hidden="true"><span></span><span></span><span></span></span>
				<span class="shell-tool-word">Menu</span>
			</button>
		{/if}
		<div class="shell-tools" id="shell-tools">
			{#if !minimal}
				<!-- The class menu: every class in words, the way to All my classes,
				     and the staff doors. Above the fold breakpoint it drops from its
				     own button; below it the Menu shows it in place. -->
				<div class="switcher">
					<button
						type="button"
						class="sw-trigger"
						class:on={switcherOpen}
						aria-expanded={switcherOpen}
						aria-haspopup="menu"
						data-testid="section-switcher"
						onclick={() => (switcherOpen = !switcherOpen)}
					>
						<span class="sw-name">Classes</span>
						<span class="sw-caret" aria-hidden="true">{switcherOpen ? '▴' : '▾'}</span>
					</button>

					{#if switcherOpen}
						<div class="sw-menu" role="menu" data-testid="section-switcher-menu">
							<a
								class="sw-item"
								class:current={!currentSectionId}
								role="menuitem"
								href="/classroom"
								onclick={closeMenu}
							>
								<span class="sw-item-name">All my classes</span>
							</a>
							{#if ordered.length}
								<div class="sw-sep" aria-hidden="true"></div>
							{/if}
							{#each ordered as s (s.id)}
								<a
									class="sw-item"
									class:current={s.id === currentSectionId}
									role="menuitem"
									aria-current={s.id === currentSectionId ? 'true' : undefined}
									href={`/classroom/${s.id}`}
									data-testid="switcher-section"
									onclick={closeMenu}
								>
									<span class="sw-item-code">{s.course?.code ?? 'CLASS'}</span>
									<span class="sw-item-name">{formatSectionLabel(s.label, s.block)}</span>
									{#if s.active === false}<span class="sw-item-flag">Archived</span>{/if}
								</a>
							{/each}
							{#if isStaff}
								<div class="sw-sep" aria-hidden="true"></div>
								<a class="sw-item" role="menuitem" href="/classroom/admin" onclick={closeMenu}>
									<span class="sw-item-name">Courses &amp; setup</span>
								</a>
							{/if}
							{#if isAdmin}
								<a class="sw-item" role="menuitem" href="/classroom/view-as" onclick={closeMenu}>
									<span class="sw-item-name">Student notebooks</span>
								</a>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
			{#if todoHref && !minimal}
				<!-- The to-do door (ledger 0297): one element, the header tools' own
				     look, current when it is the page on screen. -->
				<a
					class="shell-tool todo-door"
					href={todoHref}
					aria-current={loc.place === 'todo' ? 'page' : undefined}
					data-testid="todo-door"
					onclick={closeMenu}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.checklist} /></svg>
					<span class="shell-tool-word">To-do</span>
				</a>
			{/if}
			{#if palette}
				<button
					type="button"
					class="shell-tool"
					title="Search and commands ({paletteKeys})"
					data-testid="palette-trigger"
					onclick={() => {
						closeMenu();
						paletteEl?.open('search');
					}}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.search} /></svg>
					<span class="shell-tool-word">Search</span>
					<kbd class="shell-tool-keys" aria-hidden="true">{paletteKeys}</kbd>
				</button>
			{/if}
			{#if preferences}
				<button
					type="button"
					class="shell-tool"
					title="Classroom settings"
					data-testid="settings-trigger"
					onclick={() => {
						closeMenu();
						settingsEl?.open();
					}}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.settings} /></svg>
					<span class="shell-tool-word">Settings</span>
				</button>
			{/if}
			<ThemeSwitch />
			{#if loc.place !== 'item-deck'}
				<span class="shell-docked" data-testid="shell-docked">
					<VoiceNav {signedIn} isAdmin={!!page.data?.isAdmin} place="header" />
					<SiteFeedback
						place="relocated"
						label="Report"
						routeId={page.route.id}
						pathname={page.url.pathname}
						role={page.data.userProfile?.role ?? null}
						sectionId={page.params.sectionId ?? null}
						build={feedbackBuild}
						submit={feedbackSubmit}
						anonymous={feedbackAnonymous}
					/>
				</span>
			{/if}
		</div>
		<ProfileMenu />
	</div>
</div>

{#if palette}
	<CommandPalette
		bind:this={paletteEl}
		sources={palette}
		env={paletteEnv}
		{preferences}
		{loadStudents}
	/>
{/if}
{#if preferences}
	<ClassroomSettings bind:this={settingsEl} {preferences} role={paletteRole} />
{/if}

<!--
	THE TRAIL AND THE TABS SHARE ONE ROW, AND IT SPANS THE CONTENT (ledger 0297).
	In split mode `.cr-root` becomes a flex column and the two used to
	shrink-wrap and centre on `margin: 0 auto` (the trail 305px at x=567 over a
	split spanning 32 to 1408), so the way back sat mid-screen rather than at
	the top left (report 34). Both now live in `.cr-chrome`, which is as wide as
	the page under it and starts at its left edge; the trail takes the left and
	the tabs the right of one row, which is 50px less chrome above the class
	than two rows were, and they wrap onto two lines only where one does not
	fit.
-->
{#if !minimal && (crumbs.length > 1 || (visibleTabs.length > 1 && tab))}
	<div class="cr-chrome" data-testid="shell-chrome">
		{#if crumbs.length > 1}
			<nav class="crumbs" aria-label="Breadcrumb" data-testid="crumbs">
				<ol>
					{#each crumbs as crumb, i (crumb.label + i)}
						<li>
							{#if crumb.href}
								<a class="tap-reach-44" href={crumb.href}>{crumb.label}</a>
								<span class="crumb-sep" aria-hidden="true">/</span>
							{:else}
								<span aria-current="page">{crumb.label}</span>
							{/if}
						</li>
					{/each}
				</ol>

				<!--
					HIDE THE REST OF THE CLASS, GIVE THE ROOM TO THIS ONE. Filed three times
					by one student: reading an assignment with every other item in the class
					sitting beside it in the list pane is a distraction, and there is no way
					to put it away.

					THE PANE ITSELF IS NOT TOUCHED. `ClassView` and the `.cr-nav` element that
					holds it are mounted by src/routes/classroom/[sectionId]/+layout.svelte,
					which this session does not own -- so this is a marker, not a removal.
					classroom.css matches `[aria-pressed="true"]` on THIS button with a
					`:has()` selector rooted at `.cr-root` (the same tool `body:has(.cr-root)`
					already uses to reach a sibling this component cannot see) and hides the
					nav pane in CSS alone. Nothing here unmounts anything: `ClassView` keeps
					running, keeps its scroll position and its folded groups, and gets no
					`{#if}` of its own -- collapsed is a view state, never a content one.

					WHY IT SITS BESIDE THE TRAIL. The trail is the only chrome an item page
					has (the section tabs above never render for `item` -- see `tab` being
					null there), and the two controls answer the same question together:
					how do I get back, and how do I put the rest of the class away while I
					read this one. Hiding one must never cost the other, which is why this
					is a second child of `.crumbs` rather than a replacement for it.

					ONLY ON THE ITEM PAGE (`canCollapseNav`). On the class list nothing is
					open, so the list already has the whole split to itself (split.css's
					`:not(.has-detail)` rule) -- there is nothing beside it to hide, and a
					control that could not do anything must not be offered.

					ABSENT BELOW THE DESKTOP BREAKPOINT, deliberately: split.css's `swap`
					behaviour already shows the item ALONE, full width, below 1024px --
					the nav pane it would hide is not rendered there at all, so the control
					would have nothing to do. classroom.css hides it at that width.
				-->
				{#if showNavToggle}
					<button
						type="button"
						class="nav-toggle tap-44"
						aria-pressed={navCollapsed}
						data-testid="nav-collapse-toggle"
						onclick={toggleNavCollapsed}
					>
						<span class="nav-toggle-caret" aria-hidden="true">{navCollapsed ? '▸' : '▾'}</span>
						<span class="nav-toggle-label"
							>{navCollapsed ? 'Show other items' : 'Hide other items'}</span
						>
					</button>
				{/if}
			</nav>
		{/if}
		<!--
			THE BAR WRAPS RATHER THAN OVERFLOWING, and that is a rule about the phone
			rather than a preference. It was `display: flex` with no `flex-wrap` and
			`overflow-x: visible`: three tabs measured 16px to 226.4px inside a 375px
			viewport, so it fit with 132.6px to spare and nothing said what the fourth
			one would do. A flex item's automatic minimum is its min-content, and every
			label here is one unbreakable word, so a bar one tab too wide does not
			scroll and does not clip -- it pushes the DOCUMENT past the viewport, which
			is exactly the reachability defect prompt 0025 spent a bundle undoing on the
			Coin Ledger's tab bar (a fourth tab off the right edge of a phone under
			`body { overflow-x: hidden }`, unreachable by scrolling, by swiping, or at
			all). Wrapping is the answer that cannot produce that at ANY tab count, so
			the next tab added here needs no second look at this file.

			A DEPARTURE IS MARKED AND IS NEVER `aria-current`. `external` tabs leave
			/classroom, so `activeTab` cannot ever name one (see nav.ts) -- rendering
			one that silently never highlights would read as a broken tab rather than
			as a door. The guillemet is `aria-hidden` because the accessible name is
			already the label and a screen reader announcing "Check-ins right angle
			quotation mark" is noise; what carries the meaning for everyone is that the
			tab never takes the active underline and its target is another room.
		-->
		{#if visibleTabs.length > 1 && tab}
			<nav class="sec-tabs" aria-label="Class views" data-testid="section-tabs">
				{#each visibleTabs as t (t.id)}
					<a
						class="sec-tab"
						class:active={!t.external && t.id === tab}
						aria-current={!t.external && t.id === tab ? 'page' : undefined}
						href={t.href}
						data-testid="section-tab-{t.id}"
					>
						{t.label}{#if t.count}<span class="sec-tab-count" data-testid="section-tab-{t.id}-count"
								>{t.count.count} {t.count.word}</span
							>{/if}{#if t.external}<span class="sec-tab-out" aria-hidden="true">&rsaquo;</span>{/if}
					</a>
				{/each}
			</nav>
		{/if}
	</div>
{/if}

{@render children()}

<style>
	/* --- The masthead: one row at every width (ledger 0297) -----------------
	   `.app-header` (src/app.css) is a wrapping flex row with 1rem of block
	   padding; the classroom's is a row that never wraps, because a wrapped
	   masthead is 134px of a phone's 812 before the class starts. What does not
	   fit folds into the Menu below the fold breakpoint instead of onto a second
	   line. The shared `.cr-root .app-header` rule in classroom.css still owns
	   its ground, its edge and its stacking. */
	.cr-header {
		flex-wrap: nowrap;
		gap: var(--space-3);
		padding: var(--space-2) var(--cr-gutter, 1.2rem);
		min-height: 60px;
		box-sizing: border-box;
	}
	.logo-mark {
		flex: none;
		display: inline-flex;
		align-items: center;
	}
	.cr-header :global(.header-right) {
		flex: none;
		flex-wrap: nowrap;
		gap: var(--space-2);
		margin-left: auto;
		position: relative;
	}

	/* REPORT 34: the way back is the first thing in the masthead. */
	.shell-back {
		flex: none;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.shell-back:hover {
		border-color: var(--gold);
		text-decoration: none;
	}

	/* --- The class row (report 26) -----------------------------------------
	   It takes the slack between the logo and the tools and SCROLLS inside it
	   (IDEA_INTERFACE_STANDARDS section 1's strip rule): a thin visible
	   scrollbar is the control, the wheel and a mouse drag move it (see
	   `stripScroll`), and the class menu lists every class in words. */
	.cls-strip-wrap {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
	}
	.cls-strip {
		display: flex;
		gap: var(--space-1);
		list-style: none;
		margin: 0;
		/* Room under the icons for the scrollbar, so it never paints over one. */
		padding: 2px 2px 6px;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: thin;
		min-width: 0;
	}
	.cls-strip li {
		flex: none;
		display: flex;
	}
	.cls-icon {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		min-width: 44px;
		min-height: 44px;
		padding: 0 0.4rem;
		box-sizing: border-box;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		color: var(--text-1);
		text-decoration: none;
		font-family: var(--font-mono);
		line-height: 1.1;
	}
	.cls-icon:hover {
		border-color: var(--gold);
		text-decoration: none;
	}
	.cls-code {
		font-size: 0.7rem;
		letter-spacing: 0.03em;
		white-space: nowrap;
	}
	.cls-sub {
		font-size: 0.6rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	/* THE CURRENT CLASS IS MARKED THREE WAYS: aria-current for a reader, a
	   raised ground, and a 3px bar under the glyph -- a SHAPE, so colour is
	   never the only signal. The bar is green because green is this register's
	   active-navigation colour. */
	.cls-icon.current {
		background: var(--surface-2);
		border-color: var(--green);
		box-shadow: inset 0 -3px 0 var(--green);
	}
	.cls-icon.current .cls-code {
		font-weight: 700;
	}
	.cls-icon.archived {
		border-style: dashed;
	}

	/* --- The class menu ----------------------------------------------------- */
	.switcher {
		position: relative;
		min-width: 0;
	}
	.sw-trigger,
	.menu-trigger {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 44px;
		padding: 0 0.7rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		cursor: pointer;
		font: inherit;
		font-size: 0.86rem;
		white-space: nowrap;
	}
	.sw-trigger:hover,
	.sw-trigger.on,
	.menu-trigger:hover,
	.menu-trigger[aria-expanded='true'] {
		border-color: var(--gold);
	}
	.sw-name {
		white-space: nowrap;
	}
	.sw-caret {
		font-size: 0.6rem;
		color: var(--text-2);
	}
	/* The Menu button exists only below the fold breakpoint. */
	.menu-trigger {
		display: none;
	}
	.menu-glyph {
		display: inline-flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		width: 14px;
	}
	.menu-glyph span {
		display: block;
		height: 2px;
		border-radius: 1px;
		background: currentColor;
	}
	.sw-menu {
		position: absolute;
		top: calc(100% + 0.35rem);
		right: 0;
		z-index: 40;
		min-width: 15rem;
		max-width: min(22rem, 90vw);
		max-height: 60vh;
		overflow-y: auto;
		padding: 0.3rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		/* The lifted elevation, which is this exact value in the dark register
		   and a hard ledge under Space White. */
		box-shadow: var(--elevation-2);
	}
	.sw-item {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.55rem;
		border-radius: var(--radius-card);
		text-decoration: none;
		color: var(--text-1);
		/* 40px measured before ledger 0297: a menu a student picks a class from
		   takes the 44px floor (IDEA_INTERFACE_STANDARDS section 10). */
		min-height: 44px;
		box-sizing: border-box;
	}
	.sw-item:hover {
		background: var(--surface-2);
	}
	/* The current class is marked by more than colour: it carries a gold rule. */
	.sw-item.current {
		background: var(--surface-2);
		box-shadow: inset 2px 0 0 var(--gold);
	}
	.sw-item-code {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.sw-item-name {
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sw-item-flag {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-2);
	}
	.sw-sep {
		height: 1px;
		margin: 0.3rem 0.2rem;
		background: var(--hairline);
	}

	/* --- The tools ----------------------------------------------------------
	   A glyph AND a word, 44px, and the palette's shortcut printed beside its
	   word where there is room for it. */
	.shell-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.shell-docked {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	/* Docked, the report control is one of the header's tools and takes their
	   shape and their load-bearing edge rather than the floating pill's. */
	.shell-docked :global(.sfb-trigger) {
		border-radius: var(--radius-card);
		border-color: var(--boundary);
	}
	.shell-tool {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0 0.7rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font: inherit;
		font-size: 0.86rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.shell-tool:hover {
		border-color: var(--gold);
	}
	.shell-tool svg {
		flex: none;
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--text-2);
	}
	.todo-door {
		text-decoration: none;
	}
	.todo-door[aria-current='page'] {
		border-color: var(--green);
		box-shadow: inset 0 -3px 0 var(--green);
	}
	.shell-tool-keys {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		padding: 0.05rem 0.35rem;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	/* The shortcut chip is the first thing to go when the row tightens. */
	@media (max-width: 1365.98px) {
		.shell-tool-keys {
			display: none;
		}
	}

	/* --- The fold (ledger 0297) ---------------------------------------------
	   BELOW 1180px the tools do not fit beside a class row worth having, so
	   they fold behind the Menu button and the class list folds in with them.
	   The breakpoint is where the full row stops fitting a teacher's masthead
	   (logo, Classes, Search, Settings, Light, Voice, Report and the profile
	   menu); a student's row carries To-do as well. It is the same DOM in both
	   arrangements -- one copy of every control -- so no test id is doubled and
	   no control has a second handler to keep in step. */
	@media (max-width: 1179.98px) {
		.menu-trigger {
			display: inline-flex;
		}
		.shell-tools {
			display: none;
		}
		.header-right.menu-open .shell-tools {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			position: absolute;
			top: calc(100% + 0.35rem);
			right: 0;
			z-index: 40;
			width: min(20rem, calc(100vw - 2 * var(--cr-gutter, 1.2rem)));
			max-height: min(80vh, 40rem);
			overflow-y: auto;
			padding: var(--space-2);
			box-sizing: border-box;
			background: var(--surface-1);
			border: 1px solid var(--boundary);
			border-radius: var(--radius-card);
			box-shadow: var(--elevation-2);
		}
		/* Inside the Menu the class list is shown in place, after the tools. */
		.switcher {
			order: 10;
		}
		.sw-trigger {
			display: none;
		}
		.sw-menu {
			position: static;
			min-width: 0;
			max-width: none;
			max-height: none;
			overflow: visible;
			padding: 0;
			border: none;
			border-top: 1px solid var(--hairline);
			border-radius: 0;
			box-shadow: none;
			margin-top: var(--space-1);
			padding-top: var(--space-1);
		}
		.shell-tool,
		.shell-docked,
		.shell-tools :global(.theme-switch) {
			width: 100%;
			justify-content: flex-start;
		}
		.shell-docked {
			flex-direction: column;
			align-items: stretch;
		}
		.shell-docked :global(.vnav),
		.shell-docked :global(.sfb),
		.shell-docked :global(.vnav-row),
		.shell-docked :global(.vnav-trigger),
		.shell-docked :global(.sfb-trigger) {
			width: 100%;
			justify-content: flex-start;
		}
		/* Inside the Menu the voice panel opens in the flow under its button. */
		.shell-docked :global(.vnav-header .vnav-panel) {
			position: static;
			width: 100%;
		}
	}

	/* --- The trail and the tabs: one row that spans the content -------------
	   THE CHROME IS AS WIDE AS THE PAGE UNDER IT. It reads `--cr-measure`,
	   which src/routes/classroom/+layout.svelte sets once per route from
	   nav.ts's `classroomMeasure`, and `width: 100%` is what makes it SPAN that
	   measure rather than shrink-wrap: in split mode `.cr-root` is a flex column
	   and an item with auto margins shrinks to fit and centres (the trail sat
	   at x=567 over a split starting at x=32). The fallback is what the dev
	   harness (which mounts this with no layout) and view-as get. */
	.cr-chrome {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--space-4);
		width: 100%;
		box-sizing: border-box;
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto var(--space-4);
		padding: var(--space-1) var(--cr-gutter, 1.2rem) 0;
	}
	/* THE TRAIL OWNS A 44px BAND, and `min-height` with centred items is what
	   buys it. `.tap-reach-44` expands each 18.4px link to 44px by centring a
	   pseudo-element on it, which needs 12.8px of clear space above and below
	   the link; a band 44px tall with the link centred in it is exactly that,
	   so the reach never runs up into the masthead (whose `z-index: 2` would
	   paint over it and take the tap -- the pin `.sw-menu` relies on, which
	   stays) and never down into a tab. It is 20px shorter than the padding and
	   margin that used to buy the same clearance. */
	.crumbs {
		/* THE ROW HOLDS THE TRAIL AND THE NAV-COLLAPSE TOGGLE, one on each end. */
		display: flex;
		flex: 1 1 18rem;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		min-width: 0;
		min-height: 44px;
	}
	.crumbs ol {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
		list-style: none;
		margin: 0;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		min-width: 0;
	}
	.crumbs li {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		min-width: 0;
	}
	.crumbs a {
		/* 18.4px measured. The BOX cannot grow: the crumb list is
		   `align-items: baseline`, and a 44px link drags the `/` separators off
		   the baseline they align on. The hit area is expanded instead -- see
		   `.tap-reach-44` in src/app.css -- and the clear space that reach needs
		   is the band `.crumbs` holds. Height only, so two crumbs sitting
		   0.35rem apart on the same line keep their own taps
		   (IDEA_INTERFACE_STANDARDS 10). */
		--tap-reach-w: 0px;
		color: var(--text-2);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.crumbs a:hover {
		color: var(--gold);
	}
	/* The current crumb wraps rather than ellipsising: the row is wide enough
	   to say the whole title (it was cut at 22rem in an 828px row). */
	.crumbs span[aria-current] {
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	/* A SEPARATOR GLYPH IS A BOUNDARY, AND A HAIRLINE TOKEN MUST NEVER PAINT
	   ONE. --boundary is the load-bearing token and clears the 3:1 a boundary
	   carries: 4.44:1 here. */
	.crumb-sep {
		color: var(--boundary);
	}

	/* THE NAV-COLLAPSE TOGGLE. A real button, not a bare glyph; `.tap-44`
	   (src/app.css) buys the 44px floor, and `flex: none` keeps it from being
	   squeezed by a long trail. */
	.nav-toggle {
		appearance: none;
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.6rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	.nav-toggle:hover {
		color: var(--text-1);
		border-color: var(--gold);
	}
	.nav-toggle-caret {
		font-size: 0.65rem;
		color: var(--text-2);
		flex: none;
	}

	/* THE TAB BAR. It WRAPS rather than overflowing (see the comment above the
	   markup), sits at the right of the trail's row where there is room, and
	   the rule under the whole row is what separates the chrome from the page. */
	.sec-tabs {
		display: flex;
		flex: 0 1 auto;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-left: auto;
	}
	.cr-chrome:has(.sec-tabs) {
		border-bottom: 1px solid var(--hairline);
	}
	.sec-tab {
		/* 44px floor (IDEA_INTERFACE_STANDARDS 10); `box-sizing` keeps the 2px
		   underline inside it. */
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.9rem;
		border-bottom: 2px solid transparent;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		text-decoration: none;
		min-height: 44px;
		box-sizing: border-box;
	}
	.sec-tab:hover {
		color: var(--text-1);
	}
	.sec-tab.active {
		color: var(--green);
		border-bottom-color: var(--green);
	}
	.sec-tab-out {
		margin-left: 0.3rem;
	}
	/* THE NOTEBOOK TAB'S COUNT (ledger 0297): the number and its word, in the
	   tab's own ink on a pinned status fill -- never a bare digit and never the
	   hue alone. */
	.sec-tab-count {
		margin-left: 0.45rem;
		padding: 0.05rem 0.4rem;
		border-radius: var(--radius-control);
		background: var(--status-warn-fill);
		color: var(--text-1);
		white-space: nowrap;
	}

	/* NO NAV-COLLAPSE TOGGLE BELOW THE SPLIT'S OWN BREAKPOINT (split.css's
	   `min-width: 1024px`, matched here exactly): below it the item shows alone
	   and there is no list pane for the control to hide. */
	@media (max-width: 1023.98px) {
		.nav-toggle {
			display: none;
		}
	}

	/* Phone: the tabs take their own line under the trail and start at its left
	   edge, like every other back control (report 34). */
	@media (max-width: 640px) {
		.cr-header {
			gap: var(--space-2);
		}
		.sec-tabs {
			margin-left: 0;
		}
		/* A student's two tabs and a teacher's first five fit one phone line
		   at this size (they wrapped to two at 0.78rem with 0.9rem sides). With
		   the Live tab a teacher has six, and at 375 the sixth wraps to a
		   second line (chrome 142px against 93px): shrinking the tabs under the
		   44px floor or hiding one behind a scroll were both worse, and a
		   teacher runs the class from a laptop, where all six sit in one row. */
		.sec-tab {
			padding: 0.5rem 0.45rem;
			font-size: 0.72rem;
		}
	}
</style>
