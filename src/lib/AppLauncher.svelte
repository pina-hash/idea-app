<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { UserProfile } from '$lib/profile';
	import GauntletMark from '$lib/marks/GauntletMark.svelte';
	import VanguardMark from '$lib/marks/VanguardMark.svelte';
	import CoinMark from '$lib/marks/CoinMark.svelte';
	// Official FRC icon (triangle/circle/diamond emblem only, no wordmark), the
	// compact mark that fits the launcher's square icon slot.
	import frcIcon from '$lib/frc/assets/frc-icon.png';
	import {
		APP_GROUPS,
		orderedGroupApps,
		pinnedApps,
		readHomepagePrefs,
		visibleApps,
		type AppGroupId,
		type HomepagePrefs,
		type PortalApp
	} from '$lib/portal-apps';

	/**
	 * The homepage app launcher: curated groups (Games / Tools / Class) by
	 * default, optionally customized per user (pin favorites, reorder within a
	 * group, collapse groups, compact view). Signed-in layouts persist to
	 * `profiles.preferences.homepage`; anonymous visitors get the clean curated
	 * default (collapse/compact still work for the session, unsaved).
	 */
	let { onRequireSignIn }: { onRequireSignIn: (next: string) => void } = $props();

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);
	const signedIn = $derived(!!claims);
	const isTeacher = $derived(profile?.role === 'teacher');

	let prefs = $state<HomepagePrefs>({});
	$effect(() => {
		prefs = readHomepagePrefs(profile?.preferences);
	});

	let customizing = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	const apps = $derived(visibleApps(isTeacher));
	const pinned = $derived(pinnedApps(apps, prefs));
	const compact = $derived(!!prefs.compact);

	const persist = async (next: HomepagePrefs) => {
		prefs = next;
		if (!claims) return; // anonymous: session-only, nothing to save
		saving = true;
		saveError = '';
		const merged = { ...(profile?.preferences ?? {}), homepage: next };
		const { error } = await supabase
			.from('profiles')
			.update({ preferences: merged })
			.eq('id', claims.sub);
		if (error) saveError = error.message;
		saving = false;
	};

	const togglePin = (id: string) => {
		const cur = prefs.pinned ?? [];
		persist({
			...prefs,
			pinned: cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]
		});
	};

	const move = (group: AppGroupId, id: string, dir: -1 | 1) => {
		const ids = orderedGroupApps(apps, group, prefs).map((a) => a.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (i === -1 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		persist({ ...prefs, order: { ...(prefs.order ?? {}), [group]: ids } });
	};

	const toggleCollapse = (group: AppGroupId) => {
		const cur = prefs.collapsed ?? [];
		persist({
			...prefs,
			collapsed: cur.includes(group) ? cur.filter((g) => g !== group) : [...cur, group]
		});
	};

	const toggleCompact = () => persist({ ...prefs, compact: !prefs.compact });

	const appClick = (e: MouseEvent, app: PortalApp) => {
		if (app.requiresAuth && !signedIn) {
			e.preventDefault();
			onRequireSignIn(app.href);
		}
	};

	/**
	 * Per-theme card interior texture (background-image), keyed off the card's
	 * primary/secondary accent. Kept at <=3% opacity so it never touches text
	 * readability. Returns the image string plus a background-size (only the
	 * blueprint grid needs a fixed tile; the rest are repeating gradients).
	 */
	const cardTexture = (primary: string, secondary: string): { image: string; size: string } => {
		const p = primary.toUpperCase();
		const s = secondary.toUpperCase();
		// VANGUARD (green + chartreuse): horizontal scanlines.
		if (p === '#00FF41' && s === '#C8FF00')
			return {
				image:
					'repeating-linear-gradient(0deg, rgba(0,255,65,0.03) 0px, rgba(0,255,65,0.03) 1px, transparent 1px, transparent 4px)',
				size: 'auto'
			};
		// GAUNTLET (green + cyan): 24px blueprint grid.
		if (p === '#00FF41' && s === '#00F0FF')
			return {
				image:
					'linear-gradient(rgba(0,240,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.03) 1px, transparent 1px)',
				size: '24px 24px'
			};
		// FRC (red primary): diagonal stripes.
		if (p === '#ED1C24')
			return {
				image:
					'repeating-linear-gradient(45deg, rgba(237,28,36,0.025) 0px, rgba(237,28,36,0.025) 1px, transparent 1px, transparent 16px)',
				size: 'auto'
			};
		// Everything else: the design-system brushed-metal token.
		return { image: 'var(--texture-brushed)', size: 'auto' };
	};

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

		// Stagger is per section group (each .app-grid), so a card's delay is its
		// index within its own group, not a global running count.
		document.querySelectorAll<HTMLElement>('.launcher .app-grid').forEach((grid) => {
			grid.querySelectorAll<HTMLElement>('.app-card').forEach((card, i) => {
				card.style.opacity = '0';
				card.style.transform = 'translateY(18px)';
				card.style.transition = 'opacity 0.45s ease-out, transform 0.45s ease-out';
				card.style.transitionDelay = i * 60 + 'ms';
				observer.observe(card);
			});
		});

		return () => observer.disconnect();
	});
</script>

{#snippet appIcon(id: string)}
	{#if id === 'vanguard'}
		<VanguardMark />
	{:else if id === 'gauntlet'}
		<GauntletMark />
	{:else if id === 'coins'}
		<CoinMark />
	{:else if id === 'frc'}
		<!-- Official FIRST icon (emblem only), used unmodified: intrinsic
		     dimensions set so width:auto preserves the exact aspect (no crop or
		     distortion) while it fills the icon slot like every other app mark. -->
		<img class="frc-icon-img" src={frcIcon} width="516" height="309" alt="FIRST Robotics Competition" />
	{:else}
	<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if id === 'coin-entry'}
			<!-- IDEA Coin (i¢) with an award "+", so it reads as awarding coins. -->
			<circle cx="13" cy="17" r="9.5" />
			<text x="13" y="17.5" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" style="font:700 9px 'Share Tech Mono', monospace">i&#162;</text>
			<path d="M25 8v6m3-3h-6" />
		{:else if id === 'dashboard'}
			<path d="M5 24a11 11 0 1122 0z" /><path d="M16 24l5.5-7" /><circle cx="16" cy="24" r="1.6" />
		{:else if id === 'courses'}
			<path d="M7 6h18v20H7z" /><path d="M11 12h10M11 16h10M11 20h6" />
		{:else if id === 'greenline'}
			<path d="M 6,22 C 6,10 14,6 20,12 C 26,18 26,24 20,26 C 14,28 6,22 6,22 Z" />
			<path d="M 6,22 C 6,10 14,6 20,12 C 26,18 26,24 20,26" stroke-dasharray="2,3" />
		{:else if id === 'archive'}
			<path d="M5 7h22v6H5z" /><path d="M7 13v12h18V13" /><path d="M13 18h6" />
		{/if}
	</svg>
	{/if}
{/snippet}

{#snippet appCard(app: PortalApp, group: AppGroupId | null)}
	{@const primary = app.theme?.primary ?? 'var(--green)'}
	{@const secondary = app.theme?.secondary ?? 'var(--gold)'}
	{@const tex = cardTexture(primary, secondary)}
	{@const accStyle = `--acc-primary:${primary};--acc-secondary:${secondary};--card-texture:${tex.image};--card-texture-size:${tex.size};`}
	{#if customizing}
		<div class="app-card static" class:compact style={accStyle}>
			<span class="app-strip"></span>
			<span class="app-icon" class:frc-icon={app.id === 'frc'}>{@render appIcon(app.icon)}</span>
			<span class="app-text">
				<span class="app-title">{app.title}</span>
				{#if !compact}<span class="app-sub">{app.sub}</span>{/if}
			</span>
			<span class="app-tools">
				{#if group}
					<button type="button" title="Move up" aria-label="Move {app.title} up" onclick={() => move(group, app.id, -1)}>&#9650;</button>
					<button type="button" title="Move down" aria-label="Move {app.title} down" onclick={() => move(group, app.id, 1)}>&#9660;</button>
				{/if}
				<button
					type="button"
					class="pin"
					class:pinned={(prefs.pinned ?? []).includes(app.id)}
					title={(prefs.pinned ?? []).includes(app.id) ? 'Unpin' : 'Pin to top'}
					aria-label="{(prefs.pinned ?? []).includes(app.id) ? 'Unpin' : 'Pin'} {app.title}"
					onclick={() => togglePin(app.id)}
				>&#9733;</button>
			</span>
		</div>
	{:else}
		<a class="app-card" class:compact href={app.href} onclick={(e) => appClick(e, app)} style={accStyle}>
			<span class="app-strip"></span>
			<span class="app-icon" class:frc-icon={app.id === 'frc'}>{@render appIcon(app.icon)}</span>
			<span class="app-text">
				<span class="app-title">{app.title}</span>
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
			<button type="button" class="bar-btn" onclick={toggleCompact}>
				{compact ? 'Comfortable view' : 'Compact view'}
			</button>
			{#if signedIn}
				<button type="button" class="bar-btn" class:active={customizing} onclick={() => (customizing = !customizing)}>
					{customizing ? 'Done' : 'Customize'}
				</button>
			{/if}
		</span>
	</div>

	{#if pinned.length}
		<div class="group-head">
			<span class="group-label pinned-label">&#9733; Pinned</span>
			<span class="group-line"></span>
		</div>
		<div class="app-grid" class:compact>
			{#each pinned as app (app.id)}
				{@render appCard(app, null)}
			{/each}
		</div>
	{/if}

	{#each APP_GROUPS as group (group.id)}
		{@const groupApps = orderedGroupApps(apps, group.id, prefs)}
		{@const isCollapsed = (prefs.collapsed ?? []).includes(group.id)}
		{#if groupApps.length}
			<div class="group-head">
				<button
					type="button"
					class="group-toggle"
					aria-expanded={!isCollapsed}
					onclick={() => toggleCollapse(group.id)}
				>
					<span class="group-slash" aria-hidden="true">//</span>
					<span class="group-label">{group.label}</span>
					<span class="group-line"></span>
					<span class="group-count">{groupApps.length}</span>
					<span class="group-chev" class:closed={isCollapsed} aria-hidden="true">&#9662;</span>
				</button>
			</div>
			{#if !isCollapsed}
				<div class="app-grid" class:compact>
					{#each groupApps as app (app.id)}
						{@render appCard(app, group.id)}
					{/each}
				</div>
			{/if}
		{/if}
	{/each}

	{#if customizing}
		<p class="launcher-hint">
			Star an app to pin it to the top. Arrows reorder within a group. Your layout saves to your
			profile.
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
	.group-head {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 1.1rem 0 0.7rem;
	}
	.group-toggle {
		display: flex;
		align-items: center;
		width: 100%;
		gap: 0.45rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	/* House `//` motif leading each section label, in dimmed cyan. */
	.group-slash {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: var(--cyan);
		opacity: 0.7;
	}
	.group-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.group-toggle:hover .group-label {
		color: var(--green);
	}
	.pinned-label {
		color: var(--gold);
		text-shadow: var(--glow-gold);
	}
	.group-count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		color: rgba(74, 122, 82, 0.8);
	}
	.group-chev {
		font-size: 0.65rem;
		color: var(--dim);
		transition: transform 0.25s ease;
	}
	.group-chev.closed {
		transform: rotate(-90deg);
	}
	.group-line {
		flex: 1;
		height: 1px;
		background: var(--line);
		margin: 0 0.75rem;
		align-self: center;
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
	.app-card {
		/* Per-card accent, set inline from PortalApp.theme (primary/secondary);
		   falls back to the shared brass/gold scheme when a card has no theme.
		   The `--acc*` vars keep the card's icon, edges, title, and CTA tied to
		   its own two-color scheme. */
		--acc-primary: var(--gold);
		--acc-secondary: var(--green);
		--acc: var(--acc-primary);
		--acc-title: var(--acc);
		--acc-glow: color-mix(in srgb, var(--acc-primary) 30%, transparent);
		--acc-line: color-mix(in srgb, var(--acc-primary) 20%, transparent);
		--acc-line-strong: color-mix(in srgb, var(--acc-primary) 50%, transparent);
		--acc-wash: color-mix(in srgb, var(--acc-primary) 5%, transparent);
		--acc-hover-glow: color-mix(in srgb, var(--acc-primary) 20%, transparent);
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.9rem;
		/* Base surface + a subtle per-theme interior texture (<=3% opacity) layered
		   as a background-image behind content. Kept off ::before so the accent
		   strip is untouched. Both vars are set inline per card by cardTexture(). */
		background-color: var(--bg1);
		background-image: var(--card-texture, none);
		background-size: var(--card-texture-size, auto);
		border: 1px solid var(--acc-line);
		border-radius: var(--radius-card);
		box-shadow: var(--bevel-raised);
		padding: 0.85rem 1rem;
		text-decoration: none;
		overflow: hidden;
		transition: border-color 0.2s, background 0.2s, transform 0.2s, box-shadow 0.2s;
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
		border-color: var(--acc-line-strong);
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
		background: color-mix(in srgb, var(--acc-primary) 12%, transparent);
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
		.group-chev,
		.bar-btn,
		.app-tools button {
			transition: none;
		}
		a.app-card:hover {
			transform: none;
		}
	}
</style>
