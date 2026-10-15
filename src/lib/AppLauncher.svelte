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
	import ClassroomMark from '$lib/marks/ClassroomMark.svelte';
	import NotebookMark from '$lib/marks/NotebookMark.svelte';
	import TournamentMark from '$lib/marks/TournamentMark.svelte';
	import CoinDeskMark from '$lib/marks/CoinDeskMark.svelte';
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
	 * restored as stylesheet rules: five `[data-app=...]` rules below re-declare
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
	{:else if id === 'classroom'}
		<ClassroomMark once />
	{:else if id === 'notebook'}
		<NotebookMark once />
	{:else if id === 'tournament'}
		<TournamentMark once />
	{:else if id === 'coin-desk'}
		<CoinDeskMark once />
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
		/* THE SHARED BRASS/GOLD PAIR IS THE DEFAULT, NOT THE ONLY VALUE, and it
		   is a real default: four of the eleven cards declare nothing and paint
		   from exactly these two lines. A per-app pair, where one exists, is
		   declared below on `[data-app=...]`, a plain class-level rule that this
		   one loses to on specificity and wins against for anybody who declares
		   nothing. The pair used to arrive as an INLINE style instead, which beat
		   this rule on all eleven cards and made it dead code.

		   --acc-primary and --acc-secondary are IDENTITY (the strip, the brand).
		   Nothing derived for legibility may move them; --acc-ink is what moves.
		   See the contrast note above the per-app block. */
		--acc-primary: var(--gold);
		--acc-secondary: var(--green);
		/* THE GLYPH COLOUR, and the one an app re-pins when its identity colour
		   cannot carry text. Defaults to the identity colour, which every accent
		   but one clears 4.5:1 with, measured on --bg1. */
		--acc-ink: var(--acc-primary);
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
	   PER-APP IDENTITY, KEYED ON THE CARD'S OWN `data-app` ATTRIBUTE.

	   These pairs painted for months, as an inline style written from a
	   `PortalApp.theme` field, and the identity was always deliberate: GAUNTLET
	   and GREENLINE carry their product colours, VANGUARD its arcade green, and
	   the FRC card carries FIRST's own red and blue. What was wrong was the
	   MECHANISM. An inline custom property beats every class rule, so the shared
	   default was unreachable, no later rule could correct a single card, and
	   the value was discoverable only by reading the registry.

	   As a stylesheet rule keyed on an attribute, the same data sits INSIDE the
	   cascade: the default above is live for the four cards that declare nothing
	   (classroom, notebook, ideacad, coin-desk), a new app needs no entry anywhere
	   to look right, and overriding one card is one selector rather than a
	   registry edit. The attribute is `data-app`, which both card branches
	   already carried for the tour and for drag-and-drop.

	   THE PAIR IS IDENTITY AND IS NEVER MOVED FOR CONTRAST. Where a brand
	   colour cannot carry text at 4.5:1 on --bg1, the card re-pins --acc-ink
	   ONLY and --acc-primary keeps painting the strip. FRC is the one case; the
	   measured table is in docs/HISTORY.md.
	   ====================================================================== */
	.app-card[data-app='gauntlet'] {
		--acc-primary: #00ff41;
		--acc-secondary: #00f0ff;
		/* 24px blueprint grid. */
		--card-texture:
			linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px);
		--card-texture-size: 24px 24px;
	}
	.app-card[data-app='frc'] {
		/* FIRST red and FIRST blue, unmodified: a trademark colour used as the
		   mark, not as a colour we picked. Neither moves, and the strip, the
		   texture and the FIRST logo itself all still paint from them. */
		--acc-primary: #ed1c24;
		--acc-secondary: #0066b3;
		/* THE ONE RE-PINNED INK ON THE LAUNCHER. #ed1c24 carries text at
		   3.41:1 on this card, measured -- it is a mid-luminance red made for
		   white paper, and .frc-root uses it on #eef1f5 where it works. Here
		   it fails, so the GLYPH moves and the identity does not.

		   The move is LIGHTNESS ONLY: #ed1c24 is hsl(357.7 85.3% 52.0%) and
		   this is the same hue and the same saturation at 68% lightness. It is
		   not a desaturation, which is the thing that would quietly stop it
		   being FIRST red. Measured 4.99 resting, 4.76 on the card hover wash,
		   4.73 on the CTA hover fill. Written as hsl() so the next reader can
		   see the one number that changed; #f3686d is the same colour. */
		--acc-ink: hsl(357.7 85.3% 68%);
		/* Diagonal stripes. */
		--card-texture:
			repeating-linear-gradient(
				45deg,
				rgba(237, 28, 36, 0.025) 0px,
				rgba(237, 28, 36, 0.025) 1px,
				transparent 1px,
				transparent 16px
			);
	}
	.app-card[data-app='greenline'] {
		--acc-primary: #2ae57e;
		--acc-secondary: #cfdae2;
	}
	.app-card[data-app='vanguard'] {
		--acc-primary: #00ff41;
		--acc-secondary: #c8ff00;
		/* Horizontal scanlines. */
		--card-texture: repeating-linear-gradient(
			0deg,
			rgba(0, 255, 65, 0.03) 0px,
			rgba(0, 255, 65, 0.03) 1px,
			transparent 1px,
			transparent 4px
		);
	}
	.app-card[data-app='coins'] {
		/* THE LEDGER HAS A REAL SURFACE AND THIS CARD WAS NOT QUOTING IT. The
		   Coin Ledger is a standalone neon-terminal page (src/lib/legacy/coins/index.html)
		   whose own palette is green #00FF41, gold #C8FF00 and cyan #00F0FF on a
		   near-black base; the card fell to the shared brass/mint default, so the
		   one app on the launcher with a fully designed room of its own was the
		   one showing none of it.

		   GOLD LEADS because gold leads there: it is the page's most-used colour
		   (50 references against green's 31), it is the legendary rank and payout
		   treatment, and it is the colour the particle field is drawn in. Cyan is
		   the second stop because gold-to-cyan is literally how that page's own
		   legendary gradient opens. Green is the page's ambient border colour and
		   is deliberately NOT one of the two slots here: paired with gold it would
		   make this card a mirror of VANGUARD's, which is the opposite of an
		   identity. Measured on the card: #C8FF00 carries text at 12.78:1 and its
		   edge reads 9.11:1 against the page, so neither value moves. */
		--acc-primary: #c8ff00;
		--acc-secondary: #00f0ff;
		/* The page's background particle field, quoted rather than the brushed
		   default: 90 drifting gold specks, 0.7-2.0px, over near-black. Three
		   dot layers on different tile sizes so the field does not read as a
		   grid, all at <=3% so it can never touch text legibility. */
		--card-texture:
			radial-gradient(circle at 18% 26%, rgba(200, 255, 0, 0.03) 1px, transparent 1.6px),
			radial-gradient(circle at 71% 61%, rgba(200, 255, 0, 0.028) 1.3px, transparent 1.9px),
			radial-gradient(circle at 43% 85%, rgba(200, 255, 0, 0.03) 0.9px, transparent 1.5px);
		--card-texture-size: 47px 47px, 63px 63px, 37px 37px;
	}
	.app-card[data-app='notebook'] {
		/* NO ACCENT RULE, DELIBERATELY: brass is right for this card and brass is
		   the shared default, so declaring it would only put a second copy of the
		   default somewhere it can drift. What the notebook does declare is a
		   TEXTURE, because ruled paper is the one thing that room is about --
		   7px apart, at 2.5%.

		   THE RULE'S INK QUOTES THE CLASSROOM NOW, NOT THE RETIRED PAPER PLATE
		   (ledger 0297, package F1b). It was the light plate's own off-white
		   (#fafaf7), and the notebook is moving inside the classroom, whose plate
		   the light one no longer is. The lines take the classroom register's
		   primary ink, `--text-1`, so they are the room's own writing color on
		   every theme -- near-white rules on the dark card, near-black rules on
		   Space White's light one -- and they never need a second value. */
		--card-texture: repeating-linear-gradient(
			0deg,
			color-mix(in srgb, var(--text-1) 2.5%, transparent) 0px,
			color-mix(in srgb, var(--text-1) 2.5%, transparent) 1px,
			transparent 1px,
			transparent 7px
		);
	}
	.app-card[data-app='tournaments'] {
		/* THE ROOM'S OWN TWO TOKENS, where this card previously quoted neither:
		   #00ff41 is VANGUARD's arcade green and #c8a848 the portal's brass, and
		   nothing on /tournaments paints either. --tnm-accent and --tnm-gold
		   (tournaments-theme.css) are what a student actually sees there.

		   AND THE ROOM'S RULE COMES WITH THEM. At most ONE dominant emerald
		   element per screen is a hard rule in that theme, so the card spends its
		   emerald once -- on the mark, via --acc-ink, which defaults to the
		   primary -- and gold appears nowhere but the 2px strip along the card's
		   top edge. Measured on the card: emerald carries text at 6.23:1 and its
		   edge (75% of it) reads 4.81:1 against the page, so nothing has to move
		   for legibility and the identity stays exactly the room's. */
		--acc-primary: #0fbe7a;
		--acc-secondary: #e0ac4e;
	}
	/* THE FORGE, IN THE FORGE'S OWN COLOUR -- and this rule used to be green.
	   /foundry IS a designed room: src/lib/foundry/forge.css opens by saying so
	   in words -- "near-black with a faint WARM cast, worked metal under a
	   banked fire ... THE WARMTH IS THE ROOM'S IDENTITY" -- against a portal
	   plate that is green and a classroom register that is green-neutral. So
	   the Foundry was the one app on this launcher with a room of its own and a
	   card showing none of it, which is the defect the Coin Ledger card two
	   rules up was fixed for.

	   WHAT THIS REPLACES, AND WHY THE OLD ARGUMENT WAS WRONG RATHER THAN
	   MERELY OUTVOTED. The card read --green / --cyan on the grounds that
	   /foundry is built on the portal console register, so those two "ARE its
	   colours". Two things are wrong with that. Green in this room is not the
	   room, it is a STATE -- forge.css spends it on `--fg-st-done-ink`
	   (approved: struck and cooled to green) and `--fg-st-live-ink`, which is
	   the FINISHED state and nothing else. And on this page green is not an
	   identity at all: GAUNTLET #00ff41, VANGUARD #00ff41, GREENLINE #2ae57e
	   and dashboard/admin #78b870 are already spending it, and --green
	   resolves to #78b870, so the Foundry card and the admin card were
	   painting the SAME hex. A fifth green is not a way of telling five things
	   apart.

	   AND THE "HEAT MEANS IN PROGRESS" OBJECTION DOES NOT REACH THIS SURFACE,
	   which is what the comment this replaces got wrong. That rule is
	   forge.css's and it governs `.fg-root` -- inside the room, where a chip
	   wearing heat has to mean "submitted" and nothing else. A launcher card is
	   not in the room and cannot even read `--fg-*`. This launcher ALREADY
	   quotes two in-room state colours as out-of-room identity: #2ae57e is
	   GREENLINE's surgical player thread and #c8ff00 is the Ledger's legendary
	   rank treatment, and on a card each simply means "that app". A colour is a
	   state where the state language is defined; out here it is a name.

	   SO THE PAIR IS THE POUR, TAKEN FROM forge.css's OWN SCALE: `--fg-heat`
	   #f6952f, the working molten amber, cooling to `--fg-heat-ember` #c65a1d
	   along the strip. AS RE-TYPED HEX, NOT AS var(), and that is forced rather
	   than sloppy -- the `--fg-*` tokens are declared on `.fg-root` and this
	   card is not inside it, so var(--fg-heat) here resolves to nothing at all.
	   Every other card that quotes a room does the same for the same reason.

	   MEASURED, on this page's real grounds rather than described. #f6952f as
	   text: 7.83 on --bg0, 6.66 on --bg1, 6.25 on --bg2 -- so --acc-ink is NOT
	   re-pinned, because the identity already carries text and the FRC case is
	   the only one that does not. The card edge (--acc-edge, the identity at
	   75%) reads 4.89:1 against the page, comfortably past the 3:1 a boundary
	   carries and slightly better than the green it replaces at 4.81.
	   #c65a1d is the far stop of the gradient strip and paints no text and no
	   boundary: --acc-secondary is read at exactly one place in this file, the
	   strip's linear-gradient. */
	.app-card[data-app='foundry'] {
		--acc-primary: #f6952f;
		--acc-secondary: #c65a1d;
		/* Horizontal hairlines at 7px -- the same rhythm as before, moved off
		   cyan onto the card's own accent so the texture keeps quoting the pair
		   two lines up rather than the pair it used to. Still distinct from
		   GAUNTLET's blueprint grid and GREENLINE's diagonals, so the three do
		   not read as one family, and still at 3.5% where it cannot touch
		   legibility. */
		--card-texture: repeating-linear-gradient(
			to bottom,
			rgba(246, 149, 47, 0.035) 0 1px,
			transparent 1px 7px
		);
	}
	/* IDEA MAPS -- JADE, AND THE ONE HUE ON THIS PAGE NOBODY ELSE IS SPENDING.
	   Mr. Pina closed spec section 10's undecided accent on 2026-09-02: Maps
	   takes a GREEN, because green is the pathway's brand identity and an IDEA
	   product should read as one. This rule is the implementation of that
	   decision, not a re-litigation of it; what was open was WHICH green.

	   THE PROBLEM WAS THAT FOUR CARDS ALREADY SPEND ONE, and a fifth chosen by
	   eye would have been a fifth thing nobody can tell apart at a glance.
	   Measured in oklch, every incumbent green sits between hue 141.7 and
	   158.6 -- admin/dashboard #78b870 at 141.7, GAUNTLET and VANGUARD #00ff41
	   at 144.5, GREENLINE #2ae57e at 152.5, Tournaments #0fbe7a at 158.6 --
	   with the Coin Ledger's chartreuse #c8ff00 below them at 124.0 and the
	   --cyan token above at 177.6. The gap between the emerald and the cyan is
	   the only green nothing on this page is using. This is oklch(0.820 0.150
	   168), the middle of it: a jade, unambiguously green (its green channel
	   leads its blue by 50 of 255) and unambiguously not one of the four.

	   MEASURED, BECAUSE A FIFTH GREEN IS EXACTLY THE CLAIM THAT HAS TO BE.
	   CIEDE2000 against every colour already on the launcher: GREENLINE 9.8,
	   Tournaments 10.8, admin/dashboard 15.1, GAUNTLET and VANGUARD 18.6, the
	   Coin Ledger 27.5, the shared brass default 34.7, the Foundry 50.1, FRC
	   75.9 -- and 11.4 against --cyan, which is the token it is nearest in hue
	   and which is nowhere near it in chroma. The worst of those, 9.8, is
	   WIDER than the closest pair this page already ships (Tournaments against
	   admin/dashboard, 9.0), so the board is not made tighter by adding to it.

	   THE INK DOES NOT MOVE, unlike FRC's. As text it measures 10.86 / 9.24 /
	   8.66 on --bg0 / --bg1 / --bg2, so the identity carries the glyph itself
	   and there is nothing to re-pin; the 75% edge reads 6.89:1 against the
	   page, past the 3:1 a load-bearing boundary owes.

	   THE SECOND STOP IS THE PORTAL'S BRASS, AND IT IS THE ROOM QUOTED RATHER
	   THAN A COLOUR PICKED. /maps paints its chrome in this jade and marks the
	   thing you were looking for in --gold -- gold is a STATE on that surface,
	   the way crimson is reserved for live and error -- so the card's 2px strip
	   running jade to brass is the two roles the room actually has. It is the
	   one strip on this launcher whose stops are a surface's own semantics
	   rather than two colours that go together.

	   THIS RULE PAINTS A REAL CARD NOW, AND THIS PARAGRAPH USED TO SAY IT DID
	   NOT. It read "THERE IS NO `maps` ENTRY IN `PORTAL_APPS` YET AND THIS
	   RULE PAINTS NOTHING UNTIL THERE IS", which was true the day 0020 wrote
	   it and was made false by the very next bundle: `ca5d950` added the
	   `maps` entry to the registry and `MapsMark.svelte` beside it, so the
	   selector below has matched a mounted card ever since. 0021 was right not
	   to revise another bundle's prose while landing that entry; the sentence
	   is corrected here by the bundle that owns this file.

	   The reason it mattered is the reason the sentence was written: a
	   stylesheet rule keyed on an attribute no card carries is INERT AND
	   NOTHING ON SCREEN REPORTS IT -- there is no wrong colour to notice, only
	   a card that is not there. A comment claiming that state after it has
	   passed is the same failure one layer up: it tells the next reader the
	   rule is unreachable, which is exactly the thing that stops anybody
	   measuring it. `tests/home-order-and-accent.test.ts` is what closes the
	   loop in code, asserting the registry entry exists and that the launcher
	   draws MapsMark for it rather than the fallback glyph. */
	.app-card[data-app='maps'] {
		--acc-primary: #40e3b1;
		--acc-secondary: var(--gold);
	}
	/* One admin card since ledger 0117 (the Site Admins card merged into it);
	   the pair is unchanged. */
	.app-card[data-app='dashboard'] {
		--acc-primary: #78b870;
		--acc-secondary: #5abda8;
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
		color: var(--green);
		border-color: rgba(0, 255, 65, 0.4);
	}
	.app-tools .pin.pinned {
		color: var(--gold);
		border-color: rgba(200, 255, 0, 0.5);
		text-shadow: 0 0 6px rgba(200, 255, 0, 0.6);
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
	   UNDER SPACE WHITE: LIGHT CARDS, EACH IN A COLOUR OF ITS OWN (ledger
	   0297, package F1b; round 2026-10-07; ledger 0380, report 48bdb5be; and
	   Mr. Pina's decision of 2026-10-14, which decision 60 records).

	   THIS REVERSES DECISION 55's LIGHTNESS-ONLY RULE FOR SPACE WHITE, AND
	   ONLY FOR SPACE WHITE. Until 2026-10-14 every card's light ink was its
	   dark identity moved in lightness alone, hue and saturation held. Measured
	   on this theme that put eleven of the fourteen cards in one dark-green
	   band: the five cards that declare no accent (classroom, notebook,
	   IdeaCAD, Armory, Coin Desk) took the theme's own green #3b6c36, the admin
	   card's lightness twin was #3f7239, GAUNTLET and VANGUARD share the brand
	   #00ff41 and so shared one twin #007d20, and GREENLINE, Tournaments and
	   Maps are three more greens a hue step apart (#0f783e, #09794d, #117657).
	   Only FRC red, the Foundry's burnt orange and the Coin Ledger's teal
	   could be told apart, and Mr. Pina's report was "all my apps look the same
	   in white mode, this sucks". His answer: a DISTINCT colour per app on
	   Space White, while the dark themes keep their brand colours exactly.

	   SO EACH CARD HERE NAMES A CURATED INK, NOT A DERIVED ONE. The palette is
	   spread round the hue wheel and across lightness so no two cards are near
	   neighbours: FRC keeps FIRST red, the Foundry its burnt orange and the
	   Coin Ledger its teal (those three were already distinct); the notebook is
	   a warm amber, deliberately redder and stronger than the olive-brown
	   --gold (#715d22) decision 40 took off this theme's words; GAUNTLET takes
	   the lime its own room re-points --gold to, GREENLINE a true green and
	   Tournaments a deep emerald; Maps a cyan blue, IdeaCAD a steel slate, the
	   classroom a royal blue and Armory an indigo; VANGUARD a violet, the admin
	   card a plum and the Coin Desk a raspberry. The closest pair is the
	   classroom against Maps at a CIEDE2000 difference of 12.0, and no ink
	   comes within 10 of --gold.

	   WHAT DID NOT MOVE. Every ink still clears 4.5 as words on the card
	   (#f7f9f9), on its own hover wash and on the CTA hover fill (#edf1f0),
	   3:1 at 75% against the page, and 3.0 under the projector-washout model;
	   tests/space-white-inks.test.ts measures all of it and the pairwise
	   difference. The identity pair (--acc-primary, --acc-secondary) is not
	   moved, and nothing here reaches IDEA or Matrix: every declaration sits
	   under the theme attribute. The card's EDGE is still the plate's hairline
	   rather than the ink at 75%, and its strip is the ink, solid.

	   Nothing here is a theme file's: the theme may not declare an identity
	   token (tests/theme-tokens.test.ts), so the card re-pins its OWN ink,
	   keyed on the attribute, exactly where its dark ink is declared.
	   ====================================================================== */
	:global(:root[data-theme='space-white']) .app-card {
		/* THE FALLBACK FOR A CARD NOBODY HAS GIVEN AN INK YET: the theme's
		   green (#3b6c36, 5.87 on the card). Every card the launcher draws
		   today names its own below; a new app lands here until it does. */
		--acc-ink: var(--green);
		/* `--acc` is NOT re-pinned here (ledger 0380): it derives from the
		   card's own `--acc-ink` in the base rule, which is what lets each
		   card's ink below reach its word, glyph and call to action. */
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
		   transparent over the page. On the dark default the page is darker
		   than the card and a see-through wash only adds contrast; here it is
		   the other way round, and a 5% veil over #e8eceb took card titles
		   under 4.5 on hover. Mixed into --bg1 it is the same tint on the
		   ground the ink was pinned against. */
		--acc-wash: color-mix(in srgb, var(--acc) 5%, var(--bg1));
	}
	/* The strip is the card's own light ink, solid: the brand pair is neon
	   (#00ff41, #c8ff00, #00f0ff) and a neon gradient on near-white is the
	   look this theme exists not to have. */
	:global(:root[data-theme='space-white']) .app-strip {
		background: var(--acc-ink);
	}
	:global(:root[data-theme='space-white']) .app-icon,
	:global(:root[data-theme='space-white']) .app-icon.frc-icon :global(.frc-icon-img) {
		filter: none;
	}
	:global(:root[data-theme='space-white']) a.app-card:hover .app-cta {
		box-shadow: none;
	}
	/* THE FOURTEEN INKS, one rule per card, each a single colour that paints
	   the card's word, glyph, call to action and strip. The figures are
	   WCAG ratios on the card / on the CTA hover fill. */
	:global(:root[data-theme='space-white']) .app-card[data-app='classroom'] {
		/* Royal blue: 6.08 / 5.64. */
		--acc-ink: #1f55d0;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='notebook'] {
		/* Warm amber, the brass of the dark card taken toward orange and kept
		   saturated, so it reads as amber rather than the olive-brown --gold
		   (CIEDE2000 10.8 from it): 6.35 / 5.89. */
		--acc-ink: #845000;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='ideacad'] {
		/* Steel slate, the one low-chroma ink, which is what sets it apart from
		   the classroom's and Maps' blues: 7.86 / 7.30. */
		--acc-ink: #3a5068;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='armory'] {
		/* Deep indigo: 9.50 / 8.82. */
		--acc-ink: #3e2f9c;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='maps'] {
		/* Cyan blue, the map's water rather than the jade Tournaments'
		   emerald would crowd: 5.57 / 5.17. */
		--acc-ink: #006aa0;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='coins'] {
		/* KEPT: the Coin Ledger's teal, its second identity colour (cyan
		   #00f0ff) at a lightness that carries text: 5.30 / 4.92. */
		--acc-ink: hsl(183.5 100% 24%);
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='gauntlet'] {
		/* Lime, the colour the GAUNTLET room re-points --gold to, taken dark
		   enough to read: 5.51 / 5.11. */
		--acc-ink: #4f6f00;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='frc'] {
		/* KEPT: FIRST red at the lightness that carries text here (FIRST red
		   itself measures 4.15 on the card): 4.90 / 4.55. */
		--acc-ink: hsl(357.7 85.3% 46%);
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='greenline'] {
		/* A true green, the one green left on this board: 5.15 / 4.78. */
		--acc-ink: #0f7a35;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='vanguard'] {
		/* Arcade violet, which also parts VANGUARD from GAUNTLET, whose brand
		   green it shares on the dark themes: 6.05 / 5.61. */
		--acc-ink: #8a2fc4;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='foundry'] {
		/* KEPT: the Foundry's burnt orange, its second identity colour (the
		   ember #c65a1d) at a lightness that carries text: 5.07 / 4.71. */
		--acc-ink: hsl(21.7 74.4% 39%);
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='tournaments'] {
		/* Deep emerald, darker than GREENLINE's green so the two part on
		   lightness as well as hue: 7.35 / 6.82. */
		--acc-ink: #005e4b;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='coin-desk'] {
		/* Raspberry: the desk is the coins' other half, and teal is the
		   Ledger's. Not --crimson, which stays reserved for live and error
		   status: 5.76 / 5.34. */
		--acc-ink: #b8245e;
	}
	:global(:root[data-theme='space-white']) .app-card[data-app='dashboard'] {
		/* Plum, for the admin console: 8.32 / 7.73. */
		--acc-ink: #7d2a64;
	}
	/* GAUNTLET's and VANGUARD's marks paint their accent strokes from
	   `var(--gold, ...)` -- the sketch and scan line, the thruster -- which on
	   this theme is #715d22, brown, beside a lime or violet glyph. Inside the
	   icon only, --gold points at the card's one ink, the way the GAUNTLET room
	   re-points it at its lime; the marks are not edited and the dark cards
	   paint exactly what they did. */
	:global(:root[data-theme='space-white']) .app-card[data-app='gauntlet'] .app-icon,
	:global(:root[data-theme='space-white']) .app-card[data-app='vanguard'] .app-icon {
		--gold: var(--acc);
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
