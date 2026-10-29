<script lang="ts">
	import { COIN_SYMBOL } from '$lib/coin-format';
	import { onMount } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { UserProfile } from '$lib/profile';
	import GauntletMark from '$lib/marks/GauntletMark.svelte';
	import VanguardMark from '$lib/marks/VanguardMark.svelte';
	import GreenlineMark from '$lib/marks/GreenlineMark.svelte';
	import CoinMark from '$lib/marks/CoinMark.svelte';
	import MarketMark from '$lib/marks/MarketMark.svelte';
	import ClassroomMark from '$lib/marks/ClassroomMark.svelte';
	import NotebookMark from '$lib/marks/NotebookMark.svelte';
	import TournamentMark from '$lib/marks/TournamentMark.svelte';
	import DashboardMark from '$lib/marks/DashboardMark.svelte';
	import FoundryMark from '$lib/marks/FoundryMark.svelte';
	import MapsMark from '$lib/marks/MapsMark.svelte';
	import ArmoryMark from '$lib/marks/ArmoryMark.svelte';
	import IdeaCadMark from '$lib/marks/IdeaCadMark.svelte';
	// Official FRC icon (triangle/circle/diamond emblem only, no wordmark), the
	// compact mark that fits the launcher's square icon slot.
	import frcIcon from '$lib/frc/assets/frc-icon.png';
	// EVERY CARD IS A MINIATURE OF ITS OWN APP (ledger 0472, decision 73): the
	// room's paint (`cards.css`, keyed on `data-app`), its shapes (`CardArt`)
	// and, where the room's type is not already on the page, its faces. A
	// face downloads only when a card draws a letter in it, so the FRC card's
	// Roboto costs nothing to anybody who is not shown that card.
	import CardArt from '$lib/launcher/CardArt.svelte';
	import { launcherRoom } from '$lib/launcher/rooms';
	import '$lib/launcher/cards.css';
	import '@fontsource/archivo-black/400.css';
	import '@fontsource/saira-condensed/600.css';
	import '@fontsource/roboto/700.css';
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
	 * A CARD'S LOOK IS ITS ROOM'S, AND IT ARRIVES THROUGH THE CASCADE (ledger
	 * 0472). The paint is `$lib/launcher/cards.css`, keyed on `data-app`; the
	 * shapes are `CardArt`; neither is ever an inline style read out of the
	 * registry, for the reason `PortalApp`'s own comment gives.
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
	EVERY APP MARK IS A COMPONENT IN $lib/marks NOW, except the two that cannot
	be. Six of these glyphs used to be inline paths in the {#else} branch below,
	and being inline is exactly what kept them still: an animation belongs beside
	the geometry it moves, and putting six sets of keyframes into this file's
	400-line <style> block would have been the wrong home for all of them. They
	are the SAME PATHS, extracted rather than redrawn.

	TWO EXCEPTIONS, each for its own reason. FRC is the official FIRST emblem,
	used unmodified: FIRST's brand guidelines prohibit altering the mark, and
	that outranks looking consistent with the cards either side of it, so it is
	an <img> and it does not move. `coin-balance` has no app card pointing at it
	(a student reaches their coin page from the profile menu's My coins) and is
	left inline as the generic fallback branch rather than promoted.

	EVERY MARK PLAYS ONCE HERE AND RESTS ON ITS FINISHED FRAME (ledger 0298,
	decision 40 item 3). The launcher used to mount them looping, so a grid of
	eleven glyphs never stopped moving and IdeaCAD's showed a collapsed diamond
	for 18% of every loop; a card is a door, not a screensaver. `once` is each
	mark's own prop and each mark decides what "once" means for its keyframes
	(half a cycle where the rest frame sits at 50%, one cycle where it sits at
	both ends). `/dev/marks` mounts them WITHOUT it, because the reduced-motion
	sweep needs an animation still running to measure.
-->
{#snippet appIcon(id: string)}
	{#if id === 'vanguard'}
		<VanguardMark once />
	{:else if id === 'gauntlet'}
		<GauntletMark once />
	{:else if id === 'greenline'}
		<GreenlineMark once />
	{:else if id === 'coins'}
		<CoinMark once />
	{:else if id === 'market'}
		<MarketMark once />
	{:else if id === 'classroom'}
		<ClassroomMark once />
	{:else if id === 'notebook'}
		<NotebookMark once />
	{:else if id === 'tournament'}
		<TournamentMark once />
	{:else if id === 'dashboard'}
		<DashboardMark once />
	{:else if id === 'foundry'}
		<FoundryMark once />
	{:else if id === 'maps'}
		<MapsMark once />
	{:else if id === 'armory'}
		<ArmoryMark once />
	{:else if id === 'ideacad'}
		<IdeaCadMark once />
	{:else if id === 'frc'}
		<!-- Official FIRST icon (emblem only), used unmodified: intrinsic
		     dimensions set so width:auto preserves the exact aspect (no crop or
		     distortion) while it fills the icon slot like every other app mark.
		     UNANIMATED, deliberately: altering the mark, motion included, is what
		     FIRST's guidelines forbid. -->
		<img class="frc-icon-img" src={frcIcon} width="516" height="309" alt="FIRST Robotics Competition" />
	{:else}
	<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if id === 'coin-balance'}
			<!-- IDEA Coin (i¢) with short ledger lines, reading as a personal statement. -->
			<circle cx="11" cy="16" r="8" />
			<text x="11" y="16.5" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" style="font:700 8px 'Share Tech Mono', monospace">{COIN_SYMBOL}</text>
			<path d="M22 9h6M22 14h6M22 19h4" />
		{/if}
	</svg>
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
			<span class="app-icon" class:frc-icon={app.id === 'frc'}>{@render appIcon(app.icon)}</span>
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
			<span class="app-icon" class:frc-icon={app.id === 'frc'}>{@render appIcon(app.icon)}</span>
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
		gap: 0.8rem;
	}
	/* 300px IN EVERY VIEW NOW (ledger 0472). At 210px the title took the
	   whole compact card and the app's own drawing had nowhere to stand but
	   under the words; at 300px a title ends by about 216px and the drawing
	   has the card's right third. Three columns at 1440 (four at 1920), one
	   at 375, which is what it already was. */
	.app-grid.compact {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.6rem;
	}
	/* Customizing adds a grip and three tool buttons to every row. At the compact
	   track width that leaves the title so little room it breaks mid-word
	   ("MY NOTEB OOK"), so the cards keep their compact HEIGHT but take the roomy
	   track while the controls are on screen. */
	.app-grid.compact.customizing {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	}
	/* ======================================================================
	   EVERY CARD IS A MINIATURE OF ITS OWN APP (ledger 0472, decision 73).

	   Mr. Pina: "I don't want it to be like some palette. It has to be
	   representative, perfectly representative of what is inside that page
	   visually", and "each app should be unique visually, completely, like
	   real apps on a computer." This replaced ledger 0467's six colour
	   families (one hue shared by several apps), which he called off-brand.

	   So the card is the app's own surface: its ground, edge, title face and
	   ink, its accent, its call to action, and its shapes drawn by
	   `CardArt`. Every one of those arrives as a `--rm-*` custom property
	   from `$lib/launcher/cards.css`, keyed on `data-app`, quoting the
	   room's own stylesheet (`$lib/launcher/rooms.ts` lists the files, and
	   tests/home-order-and-accent.test.ts traces every colour to them). This
	   rule only READS them, each with a fallback to the site plate, so an
	   app that declares nothing arrives as a plain plate card rather than
	   borrowing somebody else's look.

	   THE WORDS STAND ON THE CARD'S OWN GROUND. `--rm-ground` is the card's
	   background colour, which is what every contrast check walks up to,
	   and the drawing fades in from its own left edge so the title keeps that
	   ground behind it. Under the site plate this rule outranks
	   site-plate.css's `--bg1` face (see the `:global(:root .site-plate)`
	   rule below), which took the plate's depth and kept one ground for every
	   card.
	   ====================================================================== */
	/* THE TITLE SITS WHERE THE APP'S PAGE PUTS ITS NAME, and that differs
	   from card to card (the second review: four plate cards that all put
	   an icon and a title top left over a row of tiles read as one chassis).
	   cards.css places it with layout properties, never a colour:
	   `--rm-align` (top, centre or foot of the card), `--rm-justify` with
	   `--rm-text-flex` (centred along the card, as My Classes, the Admin
	   console and GREENLINE's title screen centre theirs), and
	   `--rm-head-drop` (pushed under a rail drawn across the card's top).
	   CardArt's drawing fills the rest. Every card is 88px, so a row of the
	   grid is one height whichever composition stands in it. */
	.app-card {
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: var(--rm-align, center);
		justify-content: var(--rm-justify, flex-start);
		gap: 0.9rem;
		background-color: var(--rm-ground, var(--bg1));
		border: 1px solid var(--rm-edge, var(--boundary));
		border-radius: var(--rm-radius, var(--radius-card));
		box-shadow: var(--bevel-raised);
		padding: 0.85rem 1rem;
		min-height: 88px;
		text-decoration: none;
		overflow: hidden;
		transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
	}
	.app-card:not(.static) .app-icon,
	.app-card:not(.static) .app-text {
		margin-top: var(--rm-head-drop, 0);
	}
	/* Everything a reader uses sits above the drawing. */
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
		box-shadow: var(--bevel-raised), 0 0 16px var(--rm-glow, transparent);
	}
	a.app-card:active {
		transform: translateY(0);
		box-shadow: var(--bevel-inset);
	}

	.app-card.compact {
		padding: 0.6rem 0.8rem;
	}
	/* Compact cards are icon + title only: drop the CTA pill so a long title
	   ("Courses & Assignments", "IDEA Coin Ledger") has the full row and never
	   collides with the pill or the neighboring tile. */
	.app-card.compact .app-cta {
		display: none;
	}
	.app-title {
		overflow-wrap: anywhere;
	}
	.app-title-row {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	/* The admin-only review reminder on the Foundry card. --amber is the
	   portal's own warning copper and measures 4.90:1 on --bg1 / 4.60 on
	   --bg2, so the count is read, not just noticed. */
	.review-count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
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
	   equal-weight with its replacement, without inventing a per-card accent
	   color (the uniform-chrome rule). The badge above carries the "why". */
	.app-card.legacy {
		border-style: dashed;
		opacity: 0.82;
	}
	a.app-card.legacy:hover {
		opacity: 1;
	}
	.app-icon {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		color: var(--rm-icon, var(--text-1));
		filter: var(--rm-icon-filter, none);
	}
	.app-card.compact .app-icon {
		width: 24px;
		height: 24px;
	}
	.app-icon svg {
		width: 100%;
		height: 100%;
	}
	/* FRC card: the official FIRST icon replaces the glyph, sized to the same
	   height as every other app-icon so the card reads consistently; width
	   follows the icon's own aspect (auto), never stretched or cropped. No
	   green glow (it is a full-color mark); a faint FIRST-Blue underglow ties
	   it to FRC on the dark card. */
	.app-icon.frc-icon {
		width: auto;
		height: 34px;
		filter: none;
		display: inline-flex;
		align-items: center;
	}
	.app-card.compact .app-icon.frc-icon {
		/* Restate width:auto: `.app-card.compact .app-icon` (3 classes) otherwise
		   outranks `.app-icon.frc-icon` (2 classes) on specificity and would
		   clip this span back to a fixed 24px, letting the image silently
		   overflow its box. */
		width: auto;
		height: 24px;
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
		flex: var(--rm-text-flex, 1);
	}
	/* THE TITLE IS SET THE WAY ITS ROOM SETS ITS OWN NAME: Orbitron 900 for
	   the Ledger, Archivo Black italic for GREENLINE, Roboto bold italic for
	   FRC, Chakra Petch for IdeaCAD and VANGUARD, Rajdhani for the plate
	   rooms. The halo is the card's own ground, so a stroke of the drawing
	   passing behind a letter never touches the letter's edge. */
	.app-title {
		font-family: var(--rm-title-font, var(--font-display));
		font-size: var(--rm-title-size, 1rem);
		font-weight: var(--rm-title-weight, 700);
		font-style: var(--rm-title-style, normal);
		letter-spacing: var(--rm-title-track, 0.02em);
		text-transform: var(--rm-title-case, none);
		line-height: 1.15;
		color: var(--rm-title, var(--text-1));
		text-shadow: var(--rm-title-glow, 0 0 3px var(--rm-ground, var(--bg1)), 0 0 6px var(--rm-ground, var(--bg1)));
		/* A room whose wordmark is a material, not an ink (GREENLINE's chrome):
		   the gradient is clipped to the letters, and --rm-title stays the
		   solid ink every instrument reads and the gradient's own light. */
		background-image: var(--rm-title-img, none);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: var(--rm-title-fill, currentColor);
		filter: var(--rm-title-filter, none);
	}
	/* "IDEA <Coin> Ledger", "IDEA<CAD>": the part the room paints in its accent. */
	.app-title-accent {
		color: var(--rm-accent, inherit);
		text-shadow: var(--rm-accent-glow, inherit);
	}
	/* The description and the call to action are at the site's 11px label
	   floor (`--plate-label-size`). The description was 10.9px and the call to
	   action an 8.3px Orbitron the rest of the site does not use for a label;
	   the action now takes the mono label face every key on the site wears. */
	.app-sub {
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		color: var(--rm-sub, var(--text-2));
		line-height: 1.5;
		text-shadow: 0 0 3px var(--rm-ground, var(--bg1)), 0 0 6px var(--rm-ground, var(--bg1));
	}
	/* THE CALL TO ACTION IS THE ROOM'S OWN KEY: GAUNTLET's green-to-lime key,
	   VANGUARD's filled neon, IdeaCAD's green New model key, the Armory's
	   plate key with its screw dot, GREENLINE's START box, a link word on
	   FRC paper. `--rm-cta-bg` is a colour, so the word is measured on it;
	   `--rm-cta-img` lays a gradient over that colour where the room's key
	   is one. */
	.app-cta {
		display: inline-flex;
		align-items: center;
		font-family: var(--rm-cta-font, var(--font-mono));
		font-size: var(--plate-label-size, 0.6875rem);
		font-weight: var(--rm-cta-weight, 400);
		letter-spacing: var(--rm-cta-track, 0.08em);
		text-transform: var(--rm-cta-case, uppercase);
		color: var(--rm-cta-ink, var(--text-1));
		background-color: var(--rm-cta-bg, transparent);
		background-image: var(--rm-cta-img, none);
		border: 1px solid var(--rm-cta-edge, transparent);
		border-radius: var(--rm-cta-radius, var(--radius-chip));
		text-shadow: var(--rm-cta-glow, none);
		padding: 0.3rem 0.6rem;
		white-space: nowrap;
		flex-shrink: 0;
		transition: box-shadow 0.2s;
	}
	/* A lit LED before the word, where the room's key carries one. */
	.app-cta::before {
		content: '';
		flex: none;
		width: var(--rm-cta-led-size, 0px);
		height: var(--rm-cta-led-size, 0px);
		margin-right: calc(var(--rm-cta-led-size, 0px) * 0.8);
		border-radius: 50%;
		background: var(--rm-cta-led, transparent);
		box-shadow: 0 0 6px var(--rm-cta-led, transparent);
	}
	/* A screw dot in the key's corner, where the room's key carries one (the
	   Armory's plate keys). */
	.app-cta::after {
		content: '';
		position: absolute;
		right: 3px;
		bottom: 3px;
		width: var(--rm-cta-dot-size, 3px);
		height: var(--rm-cta-dot-size, 3px);
		border-radius: 50%;
		background: var(--rm-cta-dot, transparent);
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
	   THE COMFORTABLE VIEW IS A TIGHT CARD (ledger 0380, reports 4895b22f and
	   b4fd83d4: "ugly, too much dead space, a lot of text, not like the rest
	   of the site"). It was a flex row that centred the icon, a text column
	   and a CTA pinned to the far edge, so a card with a short description
	   showed bands of nothing above and below and a gap before the button,
	   and one 170-character description made every card in its row seven
	   lines tall.

	   SINCE LEDGER 0472 IT IS A BANNER OVER A LINE OF TEXT: the first row is
	   the compact card exactly (the icon, the title, the app's drawing behind
	   them, the same 88px), and under it the description, clamped to two lines,
	   with the call to action at its end. The drawing is confined to the banner
	   (`--rm-band`), so it never runs under the description or the key, which
	   is what a single row did when the drawing came back. Only the link card;
	   the Customize card keeps its row, which carries a grip and tools. The
	   full text is on the link's `title`. */
	a.app-card:not(.compact) {
		--rm-band: 5.75rem;
		--rm-scene-top: 40px;
		display: grid;
		grid-template-columns: var(--rm-cols, auto minmax(0, 1fr) auto);
		grid-template-rows: calc(var(--rm-band) - 0.6rem) auto;
		column-gap: 0.75rem;
		row-gap: 0.55rem;
		align-items: center;
		align-content: start;
		padding: 0.6rem 0.85rem 0.65rem;
	}
	a.app-card:not(.compact) :global(.art) {
		bottom: auto;
		height: var(--rm-band);
	}
	a.app-card:not(.compact) .app-icon {
		grid-column: var(--rm-icon-col, 1);
		grid-row: 1;
		align-self: var(--rm-align, center);
	}
	a.app-card:not(.compact) .app-icon:not(.frc-icon) {
		width: 28px;
		height: 28px;
	}
	a.app-card:not(.compact) .app-icon.frc-icon {
		height: 28px;
	}
	/* `display: contents` takes the text column's box away, so its two
	   children are positioned themselves to stay above the drawing. */
	a.app-card:not(.compact) .app-text {
		display: contents;
	}
	a.app-card:not(.compact) .app-title-row,
	a.app-card:not(.compact) .app-sub {
		position: relative;
		z-index: 1;
	}
	a.app-card:not(.compact) .app-title-row {
		grid-column: var(--rm-title-col, 2 / -1);
		grid-row: 1;
		min-width: 0;
		align-self: var(--rm-align, center);
		margin-top: var(--rm-head-drop, 0);
	}
	/* The title row of a scene card is the 28px icon's height, so it lines up
	   with the icon rather than with the row's own top. */
	a.app-card:not(.compact) .app-icon ~ .app-text .app-title-row {
		min-height: 28px;
		align-items: center;
	}
	a.app-card:not(.compact) .app-cta {
		grid-column: var(--rm-cta-col, 3);
		grid-row: 2;
		align-self: end;
		justify-self: end;
	}
	a.app-card:not(.compact) .app-sub {
		grid-column: var(--rm-sub-col, 1 / 3);
		padding-right: var(--rm-sub-room, 0);
		grid-row: 2;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		font-size: var(--plate-label-size, 0.6875rem);
		line-height: 1.4;
	}
	/* 300px, the Customize track's width: the description reads at 11px now,
	   and at 280px its two clamped lines cut most descriptions short. It is
	   still three columns at 1440 and 1258, and the wider home measure makes it
	   four at 1920 and ten at 3840 rather than three in a band. */
	.app-grid:not(.compact) {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.6rem;
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
	   UNDER SPACE WHITE A CARD DOES WHAT ITS ROOM DOES (ledger 0472, decision
	   73). The plate rooms read site tokens, so their cards turn light with
	   the theme on their own; the Coin Ledger, the Foundry and Tournaments
	   carry their rooms' own Space White twins in `cards.css`; GAUNTLET,
	   GREENLINE, VANGUARD, IdeaCAD and FRC do not change in their rooms, so
	   their cards do not change here. Nothing in this file names a theme for
	   a card any more: decisions 55 and 62 (one green, then one curated ink
	   per card) and ledger 0467 (one ink per family) are all replaced by the
	   room's own answer.
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
