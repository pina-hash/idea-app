<script lang="ts">
	import { COIN_SYMBOL } from '$lib/coin-format';
	import { onMount } from 'svelte';
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
	import AdminMark from '$lib/marks/AdminMark.svelte';
	import FoundryMark from '$lib/marks/FoundryMark.svelte';
	// Official FRC icon (triangle/circle/diamond emblem only, no wordmark), the
	// compact mark that fits the launcher's square icon slot.
	import frcIcon from '$lib/frc/assets/frc-icon.png';
	import {
		APP_SORT_MODES,
		arrangeApps,
		readHomepagePrefs,
		recordUsage,
		visibleApps,
		type AppSortMode,
		type HomepagePrefs,
		type PortalApp
	} from '$lib/portal-apps';

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
		const merged = { ...(profile?.preferences ?? {}), homepage: next };
		const { error } = await supabase
			.from('profiles')
			.update({ preferences: merged })
			.eq('id', claims.sub);
		if (!opts.silent) {
			if (error) saveError = error.message;
			saving = false;
		}
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
	an <img> and it does not move. `coin-balance` has no app pointing at it and
	is left inline as the generic fallback branch rather than promoted.
-->
{#snippet appIcon(id: string)}
	{#if id === 'vanguard'}
		<VanguardMark />
	{:else if id === 'gauntlet'}
		<GauntletMark />
	{:else if id === 'greenline'}
		<GreenlineMark />
	{:else if id === 'coins'}
		<CoinMark />
	{:else if id === 'classroom'}
		<ClassroomMark />
	{:else if id === 'notebook'}
		<NotebookMark />
	{:else if id === 'tournament'}
		<TournamentMark />
	{:else if id === 'coin-desk'}
		<CoinDeskMark />
	{:else if id === 'dashboard'}
		<DashboardMark />
	{:else if id === 'admin'}
		<AdminMark />
	{:else if id === 'foundry'}
		<FoundryMark />
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
			</span>
		</div>
	{:else}
		<a
			class="app-card"
			class:compact
			class:legacy={app.legacy}
			href={app.href}
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
	<div class="launcher-bar">
		<span class="launcher-title">Apps</span>
		<span class="launcher-actions">
			{#if saving}<span class="launcher-note">Saving...</span>{/if}
			{#if saveError}<span class="launcher-err">{saveError}</span>{/if}
			<!-- A sort picker, not a hero element: a native select styled to match
			     the two buttons beside it. -->
			<select
				class="bar-select"
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
			<button type="button" class="bar-btn" class:active={customizing} onclick={() => (customizing = !customizing)}>
				{customizing ? 'Done' : 'Customize'}
			</button>
		</span>
	</div>

	<!-- The tour points at the CARDS, not the title/actions strip above them.
	     While customizing, every child is a static reorderable div rather than a
	     link, so the grid is a real list and each card a listitem -- which is both
	     honest for assistive tech and what gives the drop targets their role. -->
	<div
		class="app-grid"
		class:compact
		class:customizing
		data-tour="apps"
		role={customizing ? 'list' : undefined}
	>
		{#each arranged as app, i (app.id)}
			{@render appCard(app, i)}
		{/each}
	</div>

	{#if customizing}
		<p class="launcher-hint">
			Drag a card by its handle to reorder it, or use the arrows. Star an app to pin it to the
			front.
			{#if signedIn}
				Your layout saves to your profile.
			{:else}
				Sign in to save your layout; changes last for this visit only.
			{/if}
		</p>
	{/if}
</section>

<style>
	.launcher {
		position: relative;
		z-index: 1;
		max-width: 1100px;
		margin: 0 auto 2.5rem;
		padding: 0 2rem;
	}
	.launcher-bar {
		display: flex;
		align-items: baseline;
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
		align-items: baseline;
		gap: 0.9rem;
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
	}
	.launcher-err {
		color: var(--amber);
	}
	.bar-btn {
		font-family: 'Orbitron', sans-serif;
		font-size: 0.55rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim);
		background: none;
		border: 1px solid rgba(74, 122, 82, 0.3);
		border-radius: 2px;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: color 0.2s, border-color 0.2s;
	}
	.bar-btn:hover,
	.bar-btn.active {
		color: var(--green);
		border-color: rgba(0, 255, 65, 0.4);
	}
	/* The sort picker sits with the buttons and reads as one of them. */
	.bar-select {
		font-family: 'Orbitron', sans-serif;
		font-size: 0.55rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim);
		background: var(--bg1);
		border: 1px solid rgba(74, 122, 82, 0.3);
		border-radius: 2px;
		padding: 0.3rem 0.5rem;
		cursor: pointer;
		transition: color 0.2s, border-color 0.2s;
	}
	.bar-select:hover,
	.bar-select:focus-visible {
		color: var(--green);
		border-color: rgba(0, 255, 65, 0.4);
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
	   (classroom, notebook, coins, coin-desk), a new app needs no entry anywhere
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
		   Coin Ledger is a standalone neon-terminal page (static/coins/index.html)
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
		   TEXTURE, because paper is the one thing that room is actually about --
		   ruled lines at the plate's own off-white (#fafaf7, --nb-bg on the light
		   palette), 7px apart, at 2.5%. */
		--card-texture: repeating-linear-gradient(
			0deg,
			rgba(250, 250, 247, 0.025) 0px,
			rgba(250, 250, 247, 0.025) 1px,
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
	/* IDEA FOUNDRY. The card QUOTES ITS OWN ROOM, which is the only honest
	   source for a pair: /foundry is built on the portal's own console register
	   -- .cr-root surfaces, --green for the launch control, --cyan for the
	   author line -- so those two ARE its colours rather than a pair invented
	   for the card. Molten copper was the tempting alternative and is exactly
	   what the rule refuses: it would be inventing an identity for an app that
	   already has one.

	   --acc-ink is NOT re-pinned: --green already carries text on --bg1
	   everywhere else on this page, so there is nothing for the ink to
	   correct. */
	.app-card[data-app='foundry'] {
		--acc-primary: var(--green);
		--acc-secondary: var(--cyan);
		/* Horizontal hairlines at 7px: the lines of content inside the window in
		   the mark, and distinct from GAUNTLET's blueprint grid and GREENLINE's
		   diagonals so the three do not read as one family. */
		--card-texture: repeating-linear-gradient(
			to bottom,
			rgba(0, 240, 255, 0.035) 0 1px,
			transparent 1px 7px
		);
	}
	.app-card[data-app='dashboard'],
	.app-card[data-app='admin'] {
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
		border: 1px solid rgba(208, 128, 48, 0.55);
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
	.app-sub {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
		line-height: 1.5;
	}
	.app-cta {
		font-family: 'Orbitron', sans-serif;
		font-size: 0.52rem;
		letter-spacing: 0.16em;
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
	.launcher-hint {
		margin-top: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
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
