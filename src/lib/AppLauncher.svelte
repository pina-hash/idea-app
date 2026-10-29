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
	 * THE PER-CARD TEXTURE CAME BACK WITH THE PER-CARD ACCENT, and this comment
	 * used to say the opposite. `cardTexture` once keyed a card's interior
	 * pattern off a `PortalApp.theme` field and was deleted when that field was;
	 * the note left behind claimed cards are told apart by name, tagline and
	 * badge alone. They are not, and have not been since the accents were
	 * restored as stylesheet rules: six `[data-app=...]` rules below re-declare
	 * `--card-texture`, and `.app-card`'s own
	 * `background-image: var(--card-texture, var(--texture-brushed))` is written
	 * as a fallback chain precisely so they can. The brushed-metal token is the
	 * DEFAULT, not the only value. What is still true, and is the part worth
	 * keeping, is the MECHANISM: the pattern is a stylesheet rule keyed on
	 * `data-app`, never an inline style read out of the registry.
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
			data-family={app.family}
			role="listitem"
			ondragover={(e) => onDragOver(e, i)}
			ondrop={(e) => onDrop(e, i)}
		>
			<span class="app-strip"></span>
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
					<span class="app-title">{app.title}</span>
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
			data-family={app.family}
		>
			<span class="app-strip"></span>
			<span class="app-icon" class:frc-icon={app.id === 'frc'}>{@render appIcon(app.icon)}</span>
			<span class="app-text">
				<span class="app-title-row">
					<span class="app-title">{app.title}</span>
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
	.launcher {
		position: relative;
		z-index: 1;
		max-width: var(--li-measure, 1100px);
		margin: 0 auto 2.5rem;
		padding: 0 2rem;
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
	.app-grid.compact {
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 0.6rem;
	}
	/* Customizing adds a grip and three tool buttons to every row. At the compact
	   track width that leaves the title so little room it breaks mid-word
	   ("MY NOTEB OOK"), so the cards keep their compact HEIGHT but take the roomy
	   track while the controls are on screen. */
	.app-grid.compact.customizing {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	}
	.app-card {
		/* THE DEFAULT IS THE NEUTRAL FAMILY, AND IT IS A LIVE ONE (ledger 0467).
		   Every card's colour is its FAMILY's (`data-family`, from
		   `PortalApp.family`), one entry of the kit's colour library
		   (tools/hx-kit/kit/colors.json) solved per theme into the `--id-*`
		   tokens. The Tools family declares nothing and paints from these
		   lines, so a card with no family rule is the warm grey titanium: an
		   app that has not been given an identity looks like one, rather than
		   borrowing somebody else's.

		   --acc-primary and --acc-secondary are IDENTITY (the strip). Nothing
		   derived for legibility moves them; --acc-ink is what a word and a
		   glyph read, and it is solve()'s ink for the same entry, which clears
		   6:1 on every dark ground and 4.8:1 on every Space White one, so no
		   card re-pins it by hand. */
		--acc-primary: var(--id-titanium-fill);
		--acc-secondary: var(--id-titanium-fill);
		--acc-ink: var(--id-titanium-ink);
		--acc: var(--acc-ink);
		--acc-title: var(--acc);
		--acc-glow: color-mix(in srgb, var(--acc-ink) 30%, transparent);
		/* A LOAD-BEARING BOUNDARY AND A DECORATIVE ONE ARE TWO TOKENS, not one
		   hairline used twice (IDEA_INTERFACE_STANDARDS 10). --acc-edge draws
		   the CARD edge, which is the only thing separating a card from the
		   page (--bg1 on --bg0 measures 1.18:1, one region to the eye), so it
		   clears 3:1 -- 75% of the ink is the floor that gets every accent
		   there, FRC at 3.35 being the worst. --acc-line is the CTA pill
		   outline, which decorates a LABEL whose own text already clears
		   4.5:1 and is not a control anyone can operate on its own; raising
		   it to the edge weight would draw every card as a wireframe.

		   --acc-edge IS THE --boundary CONTRACT WITH AN IDENTITY COLOUR IN IT,
		   and it is the only place in the app that needs its own spelling of
		   it. The shared token (design-system/colors.css) is the neutral answer
		   every other load-bearing boundary takes; this one cannot take it,
		   because a launcher card's edge carries the app's brand and swapping
		   in a neutral grey would delete eleven deliberate identity decisions
		   to satisfy a rule the accent already satisfies. Same floor, same
		   measurement method, colour supplied by the card. */
		--acc-edge: color-mix(in srgb, var(--acc-ink) 75%, transparent);
		--acc-edge-strong: var(--acc-ink);
		--acc-line: color-mix(in srgb, var(--acc-ink) 20%, transparent);
		--acc-line-strong: color-mix(in srgb, var(--acc-ink) 50%, transparent);
		--acc-wash: color-mix(in srgb, var(--acc-ink) 5%, transparent);
		--acc-hover-glow: color-mix(in srgb, var(--acc-ink) 20%, transparent);
		/* PINNED, AND THAT IS THE POINT. This was color-mix(ink 12%), a fill
		   derived from the very ink it sits behind, so lightening the ink
		   lightened its ground with it and the ratio barely moved: sweeping
		   FRC from 80% to 40% brand red moved this case 3.41 -> 4.89 and cost
		   the entire colour. Pinned to --bg2 the ground stops chasing the ink,
		   and every accent clears 4.5:1 on it (worst 4.73, FRC). */
		--acc-cta-hover-fill: var(--bg2);
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.9rem;
		/* Base surface + the card's interior texture, at <=3% opacity so it can
		   never touch text legibility. Kept off ::before so the accent strip is
		   untouched. Both vars are declared per app below; the fallback is the
		   design system's brushed-metal token, which is what most cards take. */
		background-color: var(--bg1);
		background-image: var(--card-texture, var(--texture-brushed));
		background-size: var(--card-texture-size, auto);
		border: 1px solid var(--acc-edge);
		border-radius: var(--radius-card);
		box-shadow: var(--bevel-raised);
		padding: 0.85rem 1rem;
		text-decoration: none;
		overflow: hidden;
		transition: border-color 0.2s, background 0.2s, transform 0.2s, box-shadow 0.2s;
	}
	/* ======================================================================
	   ONE HUE PER FAMILY, KEYED ON THE CARD'S `data-family` ATTRIBUTE
	   (ledger 0467, feedback ac7d7b60).

	   Mr. Pina's rule for the whole site: at most five to seven hues a reader
	   has to tell apart on one screen, each with a word or a glyph beside it;
	   green only for act and done; no neon. The launcher used to give every
	   app a colour of its own -- nine on the dark home screen, fourteen on
	   Space White, five of them greens and two of them neon (the arcade green
	   and the chartreuse) -- so the hues could not be told apart and the greens said
	   "done" about a game. Now apps of one kind share one hue, six families
	   in all, and each card still carries its own name and its own mark.

	   EVERY VALUE IS AN ENTRY OF THE KIT'S LIBRARY, NEVER A HEX TYPED HERE.
	   tools/identity-colors.mjs puts each entry through solve() for the dark
	   themes (IDEA and Matrix together) and for Space White, so the same
	   rule paints the right ink on every theme with no theme-keyed copy:

	     class  sky         Classroom, My Notebook
	     make   indigo      IdeaCAD, Armory, Foundry
	     coins  marigold    Coin Ledger, Market
	     play   magenta     GAUNTLET, GREENLINE, VANGUARD, Tournaments
	     frc    first-red   FRC Training, FIRST blue as the strip's far stop
	     tools  titanium    Maps, Admin (the default above, declared nowhere)

	   The FILLS (the strip) of the six clear CIEDE2000 10 apart in normal
	   vision and 8 under simulated deuteranopia and protanopia on both
	   grounds, and none is within 10 of the brand green;
	   tests/identity-colors.test.ts measures all of it. The FIRST logo on the
	   FRC card is the unmodified image, as before.
	   ====================================================================== */
	.app-card[data-family='class'] {
		--acc-primary: var(--id-sky-fill);
		--acc-secondary: var(--id-sky-fill);
		--acc-ink: var(--id-sky-ink);
	}
	.app-card[data-family='make'] {
		--acc-primary: var(--id-indigo-fill);
		--acc-secondary: var(--id-indigo-fill);
		--acc-ink: var(--id-indigo-ink);
	}
	.app-card[data-family='coins'] {
		--acc-primary: var(--id-marigold-fill);
		--acc-secondary: var(--id-marigold-fill);
		--acc-ink: var(--id-marigold-ink);
	}
	.app-card[data-family='play'] {
		--acc-primary: var(--id-magenta-fill);
		--acc-secondary: var(--id-magenta-fill);
		--acc-ink: var(--id-magenta-ink);
	}
	.app-card[data-family='frc'] {
		--acc-primary: var(--id-first-red-fill);
		--acc-secondary: var(--id-first-blue-fill);
		--acc-ink: var(--id-first-red-ink);
	}
	/* THE TEXTURES ARE PER APP AND TAKE THE FAMILY'S OWN FILL, never a literal:
	   they used to be the neon rgba of each app's old pair. They are drawn only
	   with `SITE_PLATE = ''` (the plate replaces every texture), at 3% or less,
	   where they cannot touch legibility. */
	.app-card[data-app='gauntlet'] {
		/* 24px blueprint grid. */
		--card-texture:
			linear-gradient(color-mix(in srgb, var(--acc-primary) 3%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in srgb, var(--acc-primary) 3%, transparent) 1px, transparent 1px);
		--card-texture-size: 24px 24px;
	}
	.app-card[data-app='frc'] {
		/* Diagonal stripes. */
		--card-texture: repeating-linear-gradient(
			45deg,
			color-mix(in srgb, var(--acc-primary) 2.5%, transparent) 0px,
			color-mix(in srgb, var(--acc-primary) 2.5%, transparent) 1px,
			transparent 1px,
			transparent 16px
		);
	}
	.app-card[data-app='vanguard'] {
		/* Horizontal scanlines. */
		--card-texture: repeating-linear-gradient(
			0deg,
			color-mix(in srgb, var(--acc-primary) 3%, transparent) 0px,
			color-mix(in srgb, var(--acc-primary) 3%, transparent) 1px,
			transparent 1px,
			transparent 4px
		);
	}
	.app-card[data-app='coins'] {
		/* The Ledger's drifting particle field: three dot layers on different
		   tile sizes so the field does not read as a grid. */
		--card-texture:
			radial-gradient(circle at 18% 26%, color-mix(in srgb, var(--acc-primary) 3%, transparent) 1px, transparent 1.6px),
			radial-gradient(circle at 71% 61%, color-mix(in srgb, var(--acc-primary) 2.8%, transparent) 1.3px, transparent 1.9px),
			radial-gradient(circle at 43% 85%, color-mix(in srgb, var(--acc-primary) 3%, transparent) 0.9px, transparent 1.5px);
		--card-texture-size: 47px 47px, 63px 63px, 37px 37px;
	}
	.app-card[data-app='notebook'] {
		/* Ruled paper, 7px apart at 2.5%, in the room's own writing colour. */
		--card-texture: repeating-linear-gradient(
			0deg,
			color-mix(in srgb, var(--text-1) 2.5%, transparent) 0px,
			color-mix(in srgb, var(--text-1) 2.5%, transparent) 1px,
			transparent 1px,
			transparent 7px
		);
	}
	.app-card[data-app='foundry'] {
		/* Horizontal hairlines at 7px. */
		--card-texture: repeating-linear-gradient(
			to bottom,
			color-mix(in srgb, var(--acc-primary) 3.5%, transparent) 0 1px,
			transparent 1px 7px
		);
	}
	.app-strip {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		border-radius: var(--radius-card) var(--radius-card) 0 0;
		background: linear-gradient(to right, var(--acc-primary), var(--acc-secondary));
		pointer-events: none;
	}
	a.app-card:hover {
		border-color: var(--acc-edge-strong);
		/* background-color (not the shorthand) so the interior texture image
		   survives the hover wash. */
		background-color: var(--acc-wash);
		transform: translateY(-2px);
		box-shadow: var(--bevel-raised), 0 0 16px var(--acc-hover-glow);
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
	.app-card.legacy .app-strip {
		opacity: 0.55;
	}
	a.app-card.legacy:hover {
		opacity: 1;
	}
	.app-icon {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		color: var(--acc);
		filter: drop-shadow(0 0 6px var(--acc-glow));
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
		filter: drop-shadow(0 0 5px var(--acc-glow));
	}
	.app-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1;
	}
	.app-title {
		font-family: 'Orbitron', sans-serif;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--acc-title);
		text-shadow: 0 0 8px var(--acc-glow);
	}
	/* The description and the call to action are at the site's 11px label
	   floor (`--plate-label-size`). The description was 10.9px and the call to
	   action an 8.3px Orbitron the rest of the site does not use for a label;
	   the action now takes the mono label face every key on the site wears. */
	.app-sub {
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		color: var(--dim);
		line-height: 1.5;
	}
	.app-cta {
		font-family: var(--font-mono);
		font-size: var(--plate-label-size, 0.6875rem);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--acc);
		border: 1px solid var(--acc-line);
		border-radius: var(--radius-chip);
		padding: 0.3rem 0.6rem;
		white-space: nowrap;
		flex-shrink: 0;
		transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;
	}
	a.app-card:hover .app-cta {
		border-color: var(--acc-line-strong);
		/* See --acc-cta-hover-fill: a pinned surface, never a mix of the ink
		   the label above it is written in. */
		background: var(--acc-cta-hover-fill);
		box-shadow: 0 0 10px var(--acc-wash);
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
		border-color: var(--acc-edge-strong);
		box-shadow: inset 0 0 0 1px var(--acc-hover-glow);
	}
	/* ======================================================================
	   THE COMFORTABLE VIEW IS A TIGHT CARD (ledger 0380, reports 4895b22f and
	   b4fd83d4: "ugly, too much dead space, a lot of text, not like the rest
	   of the site"). It was a flex row that centred the icon, a text column
	   and a CTA pinned to the far edge, so a card with a short description
	   showed bands of nothing above and below and a gap before the button,
	   and one 170-character description made every card in its row seven
	   lines tall. Now a three-column grid: the icon spans the title and the
	   description, the title row and the CTA share the first line, and the
	   description runs under both clamped to two lines. Only the link card;
	   the Customize card keeps its row, which carries a grip and tools. The
	   full text is on the link's `title`. */
	a.app-card:not(.compact) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		column-gap: 0.75rem;
		row-gap: 0.15rem;
		align-items: center;
		/* A card stretched to its row's tallest neighbour keeps its two lines
		   together in the middle, rather than spreading them apart with a band
		   of nothing between the title and the description. */
		align-content: center;
		padding: 0.6rem 0.85rem;
	}
	a.app-card:not(.compact) .app-icon {
		grid-row: 1 / span 2;
		align-self: start;
		margin-top: 0.1rem;
	}
	a.app-card:not(.compact) .app-icon:not(.frc-icon) {
		width: 28px;
		height: 28px;
	}
	a.app-card:not(.compact) .app-icon.frc-icon {
		height: 28px;
	}
	a.app-card:not(.compact) .app-text {
		display: contents;
	}
	a.app-card:not(.compact) .app-title-row {
		grid-column: 2;
		grid-row: 1;
		min-width: 0;
	}
	a.app-card:not(.compact) .app-cta {
		grid-column: 3;
		grid-row: 1;
	}
	a.app-card:not(.compact) .app-sub {
		grid-column: 2 / -1;
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
	   UNDER SPACE WHITE: LIGHT CARDS, EACH IN ITS FAMILY'S LIGHT INK (ledger
	   0297, round 2026-10-07, ledger 0380, ledger 0467).

	   No card names a Space White ink any more. The family rules above read
	   `--id-*`, and identity.css answers those per theme: on Space White the
	   ink is solve()'s answer over this theme's grounds (4.8:1 on every one,
	   the card and the CTA hover fill among them), so the word, the glyph, the
	   call to action and the strip follow the family with no theme-keyed copy.
	   This replaces the fifteen curated inks of decision 62 ("Distinct colour
	   per app", 2026-10-14): fourteen hues on one screen is what Mr. Pina's
	   2026-10-28 rule (at most five to seven) retires, and every card keeps
	   its own name and mark beside the shared hue.

	   What stays theme-keyed is the card's material: its edge is the plate's
	   hairline rather than the ink at 75%, the glow goes flat, and the hover
	   wash is mixed into the card's own ground.
	   ====================================================================== */
	:global(:root[data-theme='space-white']) .app-card {
		/* The card's edge is the plate's hairline (3.27:1 on the plate's page,
		   the load-bearing 3:1), not the brand at 75%; the fallback is the
		   theme's own boundary, for the `SITE_PLATE = ''` revert. */
		--acc-edge: var(--plate-hair, var(--boundary));
		--acc-edge-strong: var(--hover-ink);
		--acc-line: color-mix(in srgb, var(--acc) 20%, transparent);
		--acc-line-strong: color-mix(in srgb, var(--acc) 50%, transparent);
		/* No glow and no blur: the halo tokens go flat, and the icon's
		   drop-shadow filter goes with them rather than filtering nothing. */
		--acc-glow: transparent;
		--acc-hover-glow: transparent;
		/* The hover wash is laid over the CARD's own ground, not left
		   transparent over the page: a 5% veil over #e8eceb took card titles
		   under 4.5 on hover. Mixed into --bg1 it is the same tint on the
		   ground the ink was solved against. */
		--acc-wash: color-mix(in srgb, var(--acc) 5%, var(--bg1));
	}
	:global(:root[data-theme='space-white']) .app-icon,
	:global(:root[data-theme='space-white']) .app-icon.frc-icon :global(.frc-icon-img) {
		filter: none;
	}
	:global(:root[data-theme='space-white']) a.app-card:hover .app-cta {
		box-shadow: none;
	}
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
			padding: 0 1rem;
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
