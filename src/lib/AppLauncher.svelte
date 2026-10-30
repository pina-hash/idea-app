<script lang="ts">
	import { onMount } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { UserProfile } from '$lib/profile';
	// Official FRC icon (triangle/circle/diamond emblem only, no wordmark), the
	// compact mark that fits the launcher's square icon slot.
	import frcIcon from '$lib/frc/assets/frc-icon.png';
	// EVERY CARD IS A FILM STILL LIT BY ITS APP'S LIGHT (ledger 0475, decision
	// 73 as amended the second time): the inks (`cards.css`, keyed on
	// `data-app`), the scene (`CardArt`) and the filled icon (`iconSvg`), all
	// from the sample Mr. Pina chose. Where a card's title face is not already
	// on the page it is loaded here, and a face downloads only when a card
	// draws a letter in it, so the FRC card's Roboto costs nothing to anybody
	// who is not shown that card.
	import CardArt from '$lib/launcher/CardArt.svelte';
	import { iconSvg } from '$lib/launcher/art';
	import { launcherRoom } from '$lib/launcher/rooms';
	import '$lib/launcher/cards.css';
	import '@fontsource/archivo-black/400.css';
	import '@fontsource/roboto/700-italic.css';
	import {
		APP_SORT_MODES,
		arrangeApps,
		readHiddenIds,
		readHomepagePrefs,
		recordUsage,
		setAppHidden,
		splitHidden,
		visibleApps,
		type AppSortMode,
		type HomepagePrefs,
		type PortalApp
	} from '$lib/portal-apps';
	import { supabaseProfileIo, writeProfileNamespace } from '$lib/preferences/profile-io';

	/**
	 * The homepage app launcher: ONE flat grid in curated order, optionally
	 * customized per user (pin favorites, drag to reorder, sort by most used or
	 * recently opened, compact view). Signed-in layouts persist to
	 * `profiles.preferences.homepage`; anonymous visitors get the clean curated
	 * default and can rearrange for the session only, unsaved.
	 */
	let { onRequireSignIn }: { onRequireSignIn: (next: string) => void } = $props();

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);
	const signedIn = $derived(!!claims);
	// Admin, not teacher (0067): the launcher's gated tools are admin surfaces.
	const isAdmin = $derived(page.data.isAdmin === true);

	/**
	 * The Foundry review queue's size, on the Foundry card, for admins only. A
	 * queue nobody is reminded of goes stale; this is the same number the
	 * Foundry shell's Review tab carries. The home load answers it null for
	 * everyone who is not an admin (that is the real gate -- the data never
	 * arrives), and the isAdmin check here is the markup's second layer.
	 */
	const foundryPending = $derived(
		isAdmin ? ((page.data.foundryReviewPending as number | null | undefined) ?? null) : null
	);

	let prefs = $state<HomepagePrefs>({});
	$effect(() => {
		prefs = readHomepagePrefs(profile?.preferences);
	});

	let customizing = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	const apps = $derived(visibleApps(isAdmin));
	const sortMode = $derived<AppSortMode>(prefs.sort ?? 'default');
	// Compact is the DEFAULT view: absent reads as true, only an explicit false
	// gives the roomy cards back.
	const compact = $derived(prefs.compact !== false);
	const arranged = $derived(arrangeApps(apps, prefs, sortMode));
	const pinnedIds = $derived(new Set(prefs.pinned ?? []));
	/* HIDE AND SHOW (ledger 0380, report 125e674f). The grid is `shown` outside
	   Customize and EVERY app inside it, so a hidden app can always be brought
	   back from the screen that hid it; outside Customize the put-away apps are
	   listed under "Hidden apps", each a link and a Show key, so none is ever
	   unreachable. */
	const split = $derived(splitHidden(arranged, prefs));
	const hiddenIds = $derived(new Set(readHiddenIds(prefs)));
	const gridApps = $derived(customizing ? arranged : split.shown);

	/**
	 * `silent` is for the usage write: it is fire-and-forget during a navigation,
	 * so it must not flash "Saving..." or leave an error where the user is about
	 * to not be.
	 */
	const persist = async (next: HomepagePrefs, opts: { silent?: boolean } = {}) => {
		prefs = next;
		if (!claims) return; // anonymous: session-only, nothing to save
		if (!opts.silent) {
			saving = true;
			saveError = '';
		}
		// READ THEN MERGE (ledger 0297): the row as it stands now, never the
		// page-load snapshot, which is what let a pin erase a fold made a moment
		// earlier. Only `homepage` is replaced; every sibling is kept.
		const res = await writeProfileNamespace(supabaseProfileIo(supabase, claims.sub), 'homepage', next);
		if (!opts.silent) {
			if (!res.ok) saveError = res.message;
			saving = false;
		}
	};

	const toggleHidden = (id: string) => persist(setAppHidden(prefs, id, !hiddenIds.has(id)));
	const showAll = () => {
		const { hidden: _drop, ...rest } = prefs;
		return persist(rest);
	};

	const togglePin = (id: string) => {
		const cur = prefs.pinned ?? [];
		persist({
			...prefs,
			pinned: cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]
		});
	};

	/**
	 * Write a new flat order and switch to Custom.
	 *
	 * The order written is the order the user was LOOKING at, so rearranging while
	 * sorted by most-used snapshots that view and then keeps it. Switching away to
	 * another mode leaves this stored list alone; switching back to Custom
	 * restores it.
	 */
	const applyOrder = (ids: string[]) => persist({ ...prefs, order: ids, sort: 'custom' });

	/** The keyboard path; writes the same flat order the grip does. */
	const move = (id: string, dir: -1 | 1) => {
		const ids = arranged.map((a) => a.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (i === -1 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		applyOrder(ids);
	};

	const setSort = (mode: AppSortMode) => persist({ ...prefs, sort: mode });

	const toggleCompact = () => persist({ ...prefs, compact: !compact });

	/**
	 * Record an open. FIRE AND FORGET: never awaited, so it cannot delay the
	 * navigation that is already underway (the cost is that a write still in
	 * flight when the page unloads is lost, which for a usage counter is fine).
	 * Merges over the CURRENT in-memory prefs, so it can never clobber a layout
	 * change the user just made.
	 */
	const noteOpen = (id: string) => {
		if (!claims) return; // anonymous: nothing recorded, nothing persisted
		void persist(recordUsage(prefs, id, new Date()), { silent: true });
	};

	const appClick = (e: MouseEvent, app: PortalApp) => {
		if (app.requiresAuth && !signedIn) {
			e.preventDefault();
			onRequireSignIn(app.href);
			return; // refused, not opened
		}
		noteOpen(app.id);
	};

	/* ---- drag to reorder (native DnD, initiated only from the grip) ----
	   The PieceChainBuilder pattern: only the grip is draggable, so the card's
	   own link and its text stay usable, and the row the card would land on is
	   marked while the drag is live. */
	let dragFrom = $state<number | null>(null);
	let dragOver = $state<number | null>(null);

	function onDragStart(e: DragEvent, i: number) {
		dragFrom = i;
		dragOver = i;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			// Firefox refuses to start a drag without payload.
			e.dataTransfer.setData('text/plain', String(i));
		}
	}
	function onDragOver(e: DragEvent, i: number) {
		if (dragFrom === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOver = i;
	}
	function onDrop(e: DragEvent, i: number) {
		if (dragFrom === null) return;
		e.preventDefault();
		const ids = arranged.map((a) => a.id);
		if (dragFrom !== i) {
			const [moved] = ids.splice(dragFrom, 1);
			ids.splice(i, 0, moved);
			applyOrder(ids);
		}
		dragFrom = null;
		dragOver = null;
	}
	function onDragEnd() {
		dragFrom = null;
		dragOver = null;
	}

	/**
	 * A CARD'S LOOK IS ITS APP'S LIGHT, AND IT ARRIVES THROUGH THE CASCADE
	 * (ledger 0475). The inks are `$lib/launcher/cards.css`, keyed on
	 * `data-app`; the scene is `CardArt`; neither is ever an inline style read
	 * out of the registry, for the reason `PortalApp`'s own comment gives.
	 */

	/**
	 * Card entrance: cards rise in as they scroll into view. Initial hidden state
	 * is stamped inline on mount (before the observer fires) so there is no flash;
	 * a per-group stagger walks them in; inline styles are cleared on transitionend
	 * so the CSS hover/active transforms take over again. Skipped entirely under
	 * prefers-reduced-motion (cards stay immediately visible).
	 */
	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		// Clear the inline entrance styles once a card has risen in, so the CSS
		// hover/active transforms (which inline transform would otherwise beat on
		// specificity) take over again. transitionend is the normal trigger; a
		// timeout fallback guarantees cleanup even if no transition fired.
		const clearCard = (el: HTMLElement) => {
			el.style.opacity = '';
			el.style.transform = '';
			el.style.transition = '';
			el.style.transitionDelay = '';
		};

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const el = entry.target as HTMLElement;
					el.style.opacity = '1';
					el.style.transform = 'translateY(0)';
					observer.unobserve(el);
					el.addEventListener('transitionend', () => clearCard(el), { once: true });
					const delayMs = parseFloat(el.style.transitionDelay) || 0;
					setTimeout(() => clearCard(el), delayMs + 600);
				}
			},
			{ threshold: 0.15 }
		);

		// One grid now, so the stagger is a single walk. It is CAPPED at eight
		// steps: the sections used to bound it to a handful of cards each, and an
		// uncapped walk over a dozen would leave the last card waiting most of a
		// second.
		document.querySelectorAll<HTMLElement>('.launcher .app-grid').forEach((grid) => {
			grid.querySelectorAll<HTMLElement>('.app-card').forEach((card, i) => {
				card.style.opacity = '0';
				card.style.transform = 'translateY(18px)';
				card.style.transition = 'opacity 0.45s ease-out, transform 0.45s ease-out';
				card.style.transitionDelay = Math.min(i, 8) * 60 + 'ms';
				observer.observe(card);
			});
		});

		return () => observer.disconnect();
	});
</script>

<!--
	EVERY APP'S ICON IS ITS FILLED MARK, LIT (ledger 0475): one shared
	treatment from the sample Mr. Pina chose, the app's white-hot core running
	down into its hue, lifted by a shadow and a glow in that hue
	(`--rm-icon-filter`). It does not move: a card is a door, not a
	screensaver, and the scene behind it is a still.

	ONE EXCEPTION: FRC is the official FIRST emblem, used unmodified. FIRST's
	brand guidelines prohibit altering the mark, and that outranks looking
	consistent with the cards either side of it, so it is an <img>, with no
	filter and no motion.
-->
{#snippet appIcon(id: string)}
	{#if id === 'frc'}
		<!-- Official FIRST icon (emblem only), used unmodified: intrinsic
		     dimensions set so width:auto preserves the exact aspect (no crop or
		     distortion) while it fills the icon slot like every other app mark. -->
		<img class="frc-icon-img" src={frcIcon} width="516" height="309" alt="FIRST Robotics Competition" />
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html iconSvg(id)}
	{/if}
{/snippet}

{#snippet appTitle(app: PortalApp)}
	{@const accent = launcherRoom(app.id)?.titleAccent}
	{@const at = accent ? app.title.indexOf(accent) : -1}
	{#if accent && at >= 0}
		<span class="app-title">{app.title.slice(0, at)}<span class="app-title-accent">{accent}</span>{app.title.slice(at + accent.length)}</span>
	{:else}
		<span class="app-title">{app.title}</span>
	{/if}
{/snippet}

{#snippet appCard(app: PortalApp, i: number)}
	{@const isPinned = pinnedIds.has(app.id)}
	{#if customizing}
		<div
			class="app-card static"
			class:compact
			class:legacy={app.legacy}
			class:dragging={dragFrom === i}
			class:dropinto={dragFrom !== null && dragOver === i && dragFrom !== i}
			class:put-away={hiddenIds.has(app.id)}
			data-tour={app.id}
			data-app={app.id}
			role="listitem"
			ondragover={(e) => onDragOver(e, i)}
			ondrop={(e) => onDrop(e, i)}
		>
			<CardArt app={app.id} />
			<!-- Only the grip is draggable: a draggable card would fight the card's
			     own link and swallow text selection. Decorative for assistive tech --
			     the up/down buttons beside it are the keyboard path. -->
			<span
				class="app-grip"
				aria-hidden="true"
				title="Drag to reorder"
				draggable="true"
				data-grip={app.id}
				ondragstart={(e) => onDragStart(e, i)}
				ondragend={onDragEnd}
			>&#10283;</span>
			<span class="app-icon" class:frc-icon={app.id === 'frc'}>{@render appIcon(app.id)}</span>
			<span class="app-text">
				<span class="app-title-row">
					{@render appTitle(app)}
					{#if isPinned}<span class="pin-mark" title="Pinned">&#9733;</span>{/if}
					{#if app.legacy}<span class="legacy-badge">Legacy</span>{/if}
					{#if hiddenIds.has(app.id)}<span class="hidden-badge" data-testid="app-hidden-badge">Hidden</span>{/if}
					{#if app.id === 'foundry' && foundryPending !== null && foundryPending > 0}
						<span class="review-count">{foundryPending} to review</span>
					{/if}
				</span>
				{#if !compact}<span class="app-sub">{app.sub}</span>{/if}
			</span>
			<span class="app-tools">
				<button type="button" title="Move up" aria-label="Move {app.title} up" onclick={() => move(app.id, -1)}>&#9650;</button>
				<button type="button" title="Move down" aria-label="Move {app.title} down" onclick={() => move(app.id, 1)}>&#9660;</button>
				<button
					type="button"
					class="pin"
					class:pinned={isPinned}
					title={isPinned ? 'Unpin' : 'Pin to top'}
					aria-label="{isPinned ? 'Unpin' : 'Pin'} {app.title}"
					onclick={() => togglePin(app.id)}
				>&#9733;</button>
				<button
					type="button"
					class="hide-toggle"
					class:hiding={hiddenIds.has(app.id)}
					aria-pressed={hiddenIds.has(app.id)}
					aria-label="{hiddenIds.has(app.id) ? 'Show' : 'Hide'} {app.title} on my home screen"
					data-testid="app-hide-toggle"
					onclick={() => toggleHidden(app.id)}
				>{hiddenIds.has(app.id) ? 'Show' : 'Hide'}</button>
			</span>
		</div>
	{:else}
		<a
			class="app-card"
			class:compact
			class:legacy={app.legacy}
			href={app.href}
			title={app.sub}
			onclick={(e) => appClick(e, app)}
			data-tour={app.id}
			data-app={app.id}
		>
			<CardArt app={app.id} />
			<span class="app-icon" class:frc-icon={app.id === 'frc'}>{@render appIcon(app.id)}</span>
			<span class="app-text">
				<span class="app-title-row">
					{@render appTitle(app)}
					{#if isPinned}<span class="pin-mark" title="Pinned">&#9733;</span>{/if}
					{#if app.legacy}<span class="legacy-badge">Legacy</span>{/if}
					{#if app.id === 'foundry' && foundryPending !== null && foundryPending > 0}
						<!-- The word rides the number: a bare count on a card is a
						     mystery, and colour is never the only signal. -->
						<span class="review-count">{foundryPending} to review</span>
					{/if}
				</span>
				{#if !compact}
					<span class="app-sub">
						{app.sub}
						{#if app.requiresAuth && !signedIn}Sign in to enter.{/if}
					</span>
				{/if}
			</span>
			<span class="app-cta">
				{app.requiresAuth && !signedIn ? 'Sign in' : app.cta} &#9656;
			</span>
		</a>
	{/if}
{/snippet}

<section class="launcher" aria-label="Portal apps">
	<div class="launcher-bar" data-tour="app-tools">
		<span class="launcher-title">Apps</span>
		<span class="launcher-actions">
			{#if saving}<span class="launcher-note">Saving...</span>{/if}
			{#if saveError}<span class="launcher-err">{saveError}</span>{/if}
			<!-- A sort picker, not a hero element: a native select styled to match
			     the two buttons beside it, wearing the site's approved dropdown
			     (`cr-select`) so the plate draws it as every other select. -->
			<select
				class="bar-select cr-select"
				aria-label="Sort apps"
				value={sortMode}
				onchange={(e) => setSort(e.currentTarget.value as AppSortMode)}
			>
				{#each APP_SORT_MODES as m (m.id)}
					<option value={m.id}>{m.label}</option>
				{/each}
			</select>
			<button type="button" class="bar-btn" onclick={toggleCompact}>
				{compact ? 'Comfortable view' : 'Compact view'}
			</button>
			<button
				type="button"
				class="bar-btn"
				class:active={customizing}
				aria-pressed={customizing}
				onclick={() => (customizing = !customizing)}
			>
				{customizing ? 'Done' : 'Customize'}
			</button>
		</span>
	</div>

	<!-- The home tour gives every CARD its own step (`data-tour={app.id}`), and
	     its Apps step points at the strip above, where Customize and the sort
	     menu it names are (ledger 0298). While customizing, every child is a
	     static reorderable div rather than a link, so the grid is a real list
	     and each card a listitem -- which is both
	     honest for assistive tech and what gives the drop targets their role. -->
	<div
		class="app-grid"
		class:compact
		class:customizing
		data-tour="apps"
		role={customizing ? 'list' : undefined}
	>
		{#each gridApps as app, i (app.id)}
			{@render appCard(app, i)}
		{/each}
	</div>

	{#if !customizing && split.hidden.length > 0}
		<!-- THE WAY BACK, ON THE PAGE THAT HID THEM: a hidden app is a row here
		     with its own link and a Show key, so putting an app away never makes
		     it unreachable (ledger 0380, report 125e674f). It ARRIVES CLOSED
		     (`collapseWhen` constant-true, the latched idiom): opened by default,
		     every app somebody put away was still listed by name under the grid,
		     which is the opposite of putting it away. The count stays on the
		     trigger, and a person's own press is remembered under the scope. -->
		<div class="hidden-apps" data-testid="hidden-apps">
			<Disclosure
				label="Hidden apps ({split.hidden.length})"
				scope="home:hidden-apps"
				collapseWhen={true}
				testId="hidden-apps-disclosure"
			>
				<ul class="hidden-list">
					{#each split.hidden as app (app.id)}
						<li class="hidden-row">
							<a
								class="hidden-link"
								href={app.href}
								data-testid="hidden-app-link"
								onclick={(e) => appClick(e, app)}>{app.title}</a
							>
							<button
								type="button"
								class="hidden-show"
								aria-label="Show {app.title} on my home screen"
								data-testid="hidden-app-show"
								onclick={() => toggleHidden(app.id)}>Show</button
							>
						</li>
					{/each}
				</ul>
				<button type="button" class="hidden-show hidden-all" data-testid="hidden-show-all" onclick={showAll}>Show all apps</button>
			</Disclosure>
		</div>
	{/if}

	{#if customizing}
		<p class="launcher-hint">
			Drag a card by its handle to reorder it, or use the arrows. Star an app to pin it to the
			front. Hide puts an app away; it stays under "Hidden apps" on this page, and Show brings
			it back.
			{#if signedIn}
				Your layout saves to your profile.
			{:else}
				Sign in to save your layout; changes last for this visit only.
			{/if}
		</p>
	{/if}
</section>

<style>
	/* THE MEASURE IS THE HOME PAGE'S, NOT A FIXED 1100px (reports "a lot of
	   dead space" at 1258px and "too much dead space" at 3840px). Every home
	   section reads `--li-measure`, which the home page declares as a width
	   that grows with the window above about 1440px; a page that declares
	   none (the theme harness) keeps the old 1100px. */
	/* THE FEEDBACK BUTTON'S CORNER (`data-corner-reserve`) is fixed over the
	   window's bottom right: 48px tall and 24px up at 375 (72px in all),
	   44px and 12px up at 1440. The space under the grid is more than that,
	   so with the page scrolled to its end the button never rests on a
	   card's key, even where the launcher is the last thing on the page. */
	.launcher {
		position: relative;
		z-index: 1;
		max-width: var(--li-measure, 1100px);
		margin: 0 auto 2.5rem;
		padding: 0 2rem 5rem;
	}
	.launcher-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}
	.launcher-title {
		font-family: 'Orbitron', sans-serif;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--cyan);
		text-shadow: var(--glow-cyan);
	}
	.launcher-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem 0.9rem;
		/* A FLEX ITEM'S AUTOMATIC MINIMUM IS ITS MIN-CONTENT, and a nowrap row of
		   a 156px select plus two buttons is 396.5px of it -- 53.5px past the
		   343px bar at a 375px layout viewport, which is what put the home page
		   into a horizontal scroll on a phone (measured: documentElement
		   scrollWidth 412 against clientWidth 375; window.innerWidth reports 412
		   there and is the wrong number to read, because an overflowing document
		   zooms the VISUAL viewport out and leaves the layout one alone).
		   Wrapping drops the requirement to the widest single control, and
		   min-width: 0 keeps it dropped if a future child ever refuses to wrap.
		   Do not solve this by clipping: these are the sort, density and
		   customize controls for the app grid, and a phone must be able to reach
		   all three. */
		flex-wrap: wrap;
		min-width: 0;
	}
	.launcher-note,
	.launcher-err {
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		color: var(--text-2);
	}
	.launcher-err {
		color: var(--amber);
	}
	/* THE BAR'S CONTROLS ARE THE SITE'S KEYS, NOT THE LAUNCHER'S OWN (report
	   "doesn't adhere to the rest of the website design"). They were Orbitron
	   at 8.8px with a translucent neon border, 24px tall: a look nothing else
	   on the site has, under the 11px label floor and the 44px tap floor. Now
	   each is the home page's own key, the shape `.changelog-toggle` already
	   is: the mono label face at the plate's label size, a 44px box and the
	   load-bearing boundary. Under the site plate the plate paints them --
	   `.bar-btn` is in plate.css's key list (`.active` is its lit state, and
	   so is the `aria-pressed` Customize now carries), and the sort picker
	   wears `.cr-select`, the approved dropdown, so it is the same well and
	   caret as every classroom select. What is declared here is the geometry,
	   which the plate never moves, and a look for the `SITE_PLATE = ''`
	   revert. */
	.bar-btn,
	.bar-select {
		box-sizing: border-box;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		text-transform: uppercase;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 2px);
		cursor: pointer;
		transition: color 0.2s, border-color 0.2s;
	}
	.bar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 1rem;
		letter-spacing: 0.08em;
		color: var(--text-2);
		background: none;
	}
	.bar-btn:hover,
	.bar-btn.active {
		color: var(--green);
		border-color: var(--green);
	}
	/* The sort picker sits with the buttons and reads as one of them: the
	   same face, size and floor, with its own drawn caret (`appearance: none`
	   drops the native one, which no theme could re-ink). */
	.bar-select {
		appearance: none;
		-webkit-appearance: none;
		max-width: 100%;
		padding: 0 2.4rem 0 0.8rem;
		letter-spacing: 0.06em;
		color: var(--text-1);
		background-color: var(--bg2);
		background-image:
			linear-gradient(45deg, transparent 50%, var(--text-2) 50%),
			linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
		background-position:
			calc(100% - 1.25rem) 50%,
			calc(100% - 0.85rem) 50%;
		background-size: 0.4rem 0.4rem;
		background-repeat: no-repeat;
	}
	.bar-select:hover,
	.bar-select:focus-visible {
		border-color: var(--green);
	}
	.app-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
	}
	/* 300px IN EVERY VIEW (ledgers 0472 and 0475). The longest title ends
	   about 220px into its card, so at 300px the scene's light, two-thirds
	   across, stands clear of the words. Three columns at 1440 (four at
	   1920), one at 375; 12px apart, the chosen sample's gap. */
	.app-grid.compact {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
	}
	/* Customizing adds a grip and three tool buttons to every row. At the compact
	   track width that leaves the title so little room it breaks mid-word
	   ("MY NOTEB OOK"), so the cards keep their compact HEIGHT but take the roomy
	   track while the controls are on screen. */
	.app-grid.compact.customizing {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	}
	/* ======================================================================
	   EVERY CARD IS A FILM STILL LIT BY ITS APP'S LIGHT (ledger 0475,
	   decision 73 as amended the second time, 2026-10-30).

	   Mr. Pina chose "cinematic light" from four samples, and asked for
	   GREENLINE and the Foundry to be "adjusted in the same way". So every
	   card is one shape, ported from that sample: the app's filled icon and
	   its title at the left, 16px in, 12px apart, on the eased scrim of a
	   dark scene lit by one light in the app's hue (`CardArt`, drawn by
	   `$lib/launcher/art`), 88px tall. The comfortable view adds a 56px foot
	   under the scene: the description and the key on the card's own
	   ground. Every colour arrives as a `--rm-*` custom property from
	   `$lib/launcher/cards.css`, keyed on `data-app` and derived from the
	   app's light (`$lib/launcher/rooms.ts` records each hue and where it
	   came from). This rule only READS them, each with a site fallback, so
	   an app that declares nothing arrives as a plain plate card rather than
	   borrowing somebody else's look.

	   THE WORDS STAND ON THE CARD'S OWN GROUND. `--rm-ground` is the card's
	   background colour, the scene's scrim is that ground at 94% where the
	   title starts, and the title carries a halo of it, so every contrast
	   check walks up to the colour the title is actually read on. Under the
	   site plate this rule outranks site-plate.css's `--bg1` face (see the
	   `:global(:root .site-plate)` rule below). A card is a film, not plate:
	   it looks the same on every theme.
	   ====================================================================== */
	/* 88px of scene inside a 1px edge, which is the sample's band. */
	.app-card {
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: center;
		gap: 12px;
		background-color: var(--rm-ground, var(--bg1));
		border: 1px solid var(--rm-edge, var(--boundary));
		border-radius: var(--rm-radius, var(--radius-card));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.07),
			0 1px 0 rgba(0, 0, 0, 0.5),
			0 8px 18px -10px rgba(0, 0, 0, 0.8);
		padding: 0 16px;
		min-height: 90px;
		text-decoration: none;
		overflow: hidden;
		transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
	}
	/* Everything a reader uses sits above the scene. */
	.app-icon,
	.app-text,
	.app-cta,
	.app-grip,
	.app-tools {
		position: relative;
		z-index: 1;
	}
	:global(:root .site-plate) .app-card {
		background-color: var(--rm-ground, var(--bg1));
	}
	a.app-card:hover {
		transform: translateY(-2px);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.07),
			0 0 16px var(--rm-glow, transparent);
	}
	a.app-card:active {
		transform: translateY(0);
		box-shadow: var(--bevel-inset);
	}

	/* Compact cards are the scene alone, icon and title: no key. */
	.app-card.compact .app-cta {
		display: none;
	}
	.app-title-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	/* The admin-only review reminder on the Foundry card. Measured on the
	   card's own ground with the amber the portal warns in. */
	.review-count {
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber);
		border: 1px solid color-mix(in srgb, var(--amber) 55%, transparent);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
		white-space: nowrap;
	}

	.legacy-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.5rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--amber);
		border: 1px solid rgba(255, 140, 0, 0.5);
		border-radius: 2px;
		padding: 0.08rem 0.4rem;
		white-space: nowrap;
		flex-shrink: 0;
	}
	/* Legacy tools: dimmed and dashed, so a superseded tool never reads as
	   equal-weight with its replacement. The badge above carries the "why". */
	.app-card.legacy {
		border-style: dashed;
		opacity: 0.82;
	}
	a.app-card.legacy:hover {
		opacity: 1;
	}
	/* The icon, 30px in every view, lit by its own hue (`--rm-icon-filter`).
	   `--rm-icon` is the hue itself, the colour the glyph check measures. */
	.app-icon {
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		color: var(--rm-icon, var(--text-1));
		filter: var(--rm-icon-filter, none);
	}
	.app-icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	/* FRC card: the official FIRST icon replaces the glyph, at the same
	   height as every other icon; width follows the icon's own aspect (auto),
	   never stretched or cropped, and nothing is laid over it. */
	.app-icon.frc-icon {
		width: auto;
		height: 30px;
		display: inline-flex;
		align-items: center;
	}
	.app-icon.frc-icon :global(.frc-icon-img) {
		height: 100%;
		width: auto;
		display: block;
	}
	.app-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1;
	}
	/* THE TITLE IS SET THE WAY ITS ROOM SETS ITS OWN NAME, at the sample's
	   size: Orbitron for the Ledger, GAUNTLET, VANGUARD, the Foundry and
	   Admin, Archivo Black italic for GREENLINE, Roboto bold italic for FRC,
	   Share Tech Mono for Maps, Rajdhani for the rest. One line: a title is a
	   name, and every one fits a 300px card. */
	.app-title {
		font-family: var(--rm-title-font, var(--font-display));
		font-size: var(--rm-title-size, 1rem);
		font-weight: var(--rm-title-weight, 700);
		font-style: var(--rm-title-style, normal);
		letter-spacing: var(--rm-title-track, 0.02em);
		text-transform: var(--rm-title-case, none);
		line-height: 1.1;
		white-space: nowrap;
		color: var(--rm-title, var(--text-1));
		text-shadow: var(--rm-title-glow, 0 0 3px var(--rm-ground, var(--bg1)), 0 0 6px var(--rm-ground, var(--bg1)));
	}
	/* While customizing, the grip and the tools share the row, so a long
	   title may wrap rather than run under them. */
	.app-card.static .app-title {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	/* "IDEA <Coin> Ledger", "IDEA<CAD>": the part painted in the light. */
	.app-title-accent {
		color: var(--rm-accent, inherit);
	}
	/* The description and the key are at the site's 11px label floor
	   (`--plate-label-size`), in the mono label face. */
	.app-sub {
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		color: var(--rm-sub, var(--text-2));
		line-height: 1.4;
	}
	/* THE KEY: the app's light at 8% behind its own ink, edged in the light. */
	.app-cta {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		line-height: 1;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--rm-cta-ink, var(--text-1));
		background-color: var(--rm-cta-bg, transparent);
		border: 1px solid var(--rm-cta-edge, transparent);
		border-radius: 2px;
		padding: 7px 10px;
		white-space: nowrap;
		flex-shrink: 0;
		transition: box-shadow 0.2s;
	}
	a.app-card:hover .app-cta {
		box-shadow: 0 0 10px var(--rm-glow, transparent);
	}
	.app-tools {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
	}
	.app-tools button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim);
		background: var(--bg2);
		border: 1px solid rgba(74, 122, 82, 0.35);
		border-radius: 2px;
		width: 1.7rem;
		height: 1.7rem;
		cursor: pointer;
		transition: color 0.2s, border-color 0.2s;
	}
	.app-tools button:hover {
		color: var(--hover-ink);
		border-color: color-mix(in srgb, var(--hover-ink) 40%, transparent);
	}
	.app-tools .pin.pinned {
		color: var(--gold);
		border-color: color-mix(in srgb, var(--gold) 50%, transparent);
		text-shadow: 0 0 6px color-mix(in srgb, var(--gold) 60%, transparent);
	}
	/* A pinned app now appears ONCE, in place, marked -- rather than a second
	   time in a separate pinned row. */
	.pin-mark {
		font-size: 0.6rem;
		line-height: 1;
		color: var(--gold);
		text-shadow: 0 0 6px rgba(200, 168, 72, 0.55);
		flex-shrink: 0;
	}
	.app-grip {
		flex-shrink: 0;
		font-size: 0.85rem;
		line-height: 1;
		color: var(--dim);
		cursor: grab;
		user-select: none;
		padding: 0 0.1rem;
	}
	.app-grip:active {
		cursor: grabbing;
	}
	.app-card.static:hover .app-grip {
		color: var(--green);
	}
	.app-card.dragging {
		opacity: 0.4;
	}
	/* Where the dragged card would land. */
	.app-card.dropinto {
		border-color: var(--rm-title, var(--text-1));
		box-shadow: inset 0 0 0 1px var(--rm-glow, transparent);
	}
	/* ======================================================================
	   THE COMFORTABLE VIEW IS THE SCENE OVER A FOOT (ledger 0475, the chosen
	   sample's 144px card): the first 88px are the compact card exactly (the
	   scene, the icon, the title), and under it a 56px foot on the card's
	   own ground, a hairline above it, with the description at the left and
	   the key at the right. The description is clamped to two lines; the full
	   text is on the link's `title`. Only the link card: the Customize card
	   keeps its row, which carries a grip and tools.
	   ====================================================================== */
	a.app-card:not(.compact) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-rows: 88px 56px;
		gap: 0 12px;
		align-items: center;
		padding: 0 16px;
		min-height: 146px;
	}
	a.app-card:not(.compact) :global(.art) {
		bottom: auto;
		height: 88px;
	}
	/* The hairline between the scene and the foot. */
	a.app-card:not(.compact)::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 88px;
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
	}
	a.app-card:not(.compact) .app-icon {
		grid-column: 1;
		grid-row: 1;
	}
	/* `display: contents` takes the text column's box away, so its two
	   children are placed themselves, above the scene. */
	a.app-card:not(.compact) .app-text {
		display: contents;
	}
	a.app-card:not(.compact) .app-title-row,
	a.app-card:not(.compact) .app-sub {
		position: relative;
		z-index: 1;
	}
	a.app-card:not(.compact) .app-title-row {
		grid-column: 2 / -1;
		grid-row: 1;
		min-width: 0;
	}
	a.app-card:not(.compact) .app-sub {
		grid-column: 1 / 3;
		grid-row: 2;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	a.app-card:not(.compact) .app-cta {
		grid-column: 3;
		grid-row: 2;
		justify-self: end;
	}
	.app-grid:not(.compact) {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
	}
	.app-grid.customizing:not(.compact) {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	}
	/* HIDE AND SHOW (ledger 0380, report 125e674f). */
	.app-card.put-away {
		opacity: 0.55;
		border-style: dashed;
	}
	.hidden-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-chip, 3px);
		padding: 0.05rem 0.35rem;
	}
	.app-tools .hide-toggle {
		width: auto;
		min-width: 2.75rem;
		min-height: 2.75rem;
		padding: 0 0.6rem;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.app-tools .hide-toggle.hiding {
		color: var(--text-1);
	}
	.hidden-apps {
		margin-top: 0.8rem;
	}
	.hidden-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.25rem;
	}
	.hidden-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 2.75rem;
	}
	.hidden-link {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		font-family: 'Orbitron', sans-serif;
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-1);
		text-decoration: none;
	}
	.hidden-link:hover {
		color: var(--hover-ink, var(--gold));
	}
	.hidden-show {
		min-height: 2.75rem;
		min-width: 2.75rem;
		padding: 0 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--text-1);
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: 2px;
		cursor: pointer;
	}
	.hidden-all {
		margin-top: 0.4rem;
	}
	.launcher-hint {
		margin-top: 0.8rem;
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		color: var(--text-2);
	}

	/* ======================================================================
	   UNDER SPACE WHITE A CARD KEEPS ITS DARK FILM STILL (ledger 0475,
	   decision 73 as amended the second time). A card is a film, not plate,
	   so neither this file nor `cards.css` names a theme for a card: decisions
	   55 and 62, ledger 0467's family inks and 0472's "a card follows its
	   room" are all replaced by the app's own light. Only the bar's and the
	   tools' controls below move with the theme.
	   ====================================================================== */
	/* The bar's and the tools' own controls: their outer edge is the theme's
	   load-bearing boundary, and the neon hover and pin tints become the
	   theme's inks. */
	:global(:root[data-theme='space-white']) .bar-btn,
	:global(:root[data-theme='space-white']) .bar-select,
	:global(:root[data-theme='space-white']) .app-tools button {
		border-color: var(--boundary);
	}
	:global(:root[data-theme='space-white']) .bar-btn.active,
	:global(:root[data-theme='space-white']) .bar-select:focus-visible {
		border-color: var(--green);
	}
	:global(:root[data-theme='space-white']) .bar-btn:hover,
	:global(:root[data-theme='space-white']) .bar-select:hover,
	:global(:root[data-theme='space-white']) .app-tools button:hover {
		border-color: var(--hover-ink);
	}
	:global(:root[data-theme='space-white']) .app-tools .pin.pinned {
		border-color: var(--gold);
		text-shadow: none;
	}
	:global(:root[data-theme='space-white']) .pin-mark {
		text-shadow: none;
	}
	:global(:root[data-theme='space-white']) .legacy-badge {
		border-color: color-mix(in srgb, var(--amber) 55%, transparent);
	}
	@media (max-width: 768px) {
		.launcher {
			padding: 0 1rem 5rem;
		}
		.app-grid,
		.app-grid.compact {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.app-card,
		.bar-btn,
		.bar-select,
		.app-tools button {
			transition: none;
		}
		a.app-card:hover {
			transform: none;
		}
	}
</style>
