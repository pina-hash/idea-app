<script lang="ts">
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { UserProfile } from '$lib/profile';
	import GauntletMark from '$lib/marks/GauntletMark.svelte';
	import VanguardMark from '$lib/marks/VanguardMark.svelte';
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
</script>

{#snippet appIcon(id: string)}
	{#if id === 'vanguard'}
		<VanguardMark />
	{:else if id === 'gauntlet'}
		<GauntletMark />
	{:else}
	<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if id === 'coins'}
			<circle cx="16" cy="16" r="10" /><circle cx="16" cy="16" r="6.5" /><path d="M16 9.5v13" />
		{:else if id === 'coin-entry'}
			<circle cx="13" cy="16" r="9" /><path d="M13 12v8m-4-4h8" /><path d="M25 8v6m3-3h-6" />
		{:else if id === 'dashboard'}
			<path d="M5 24a11 11 0 1122 0z" /><path d="M16 24l5.5-7" /><circle cx="16" cy="24" r="1.6" />
		{:else if id === 'courses'}
			<path d="M7 6h18v20H7z" /><path d="M11 12h10M11 16h10M11 20h6" />
		{:else if id === 'archive'}
			<path d="M5 7h22v6H5z" /><path d="M7 13v12h18V13" /><path d="M13 18h6" />
		{/if}
	</svg>
	{/if}
{/snippet}

{#snippet appCard(app: PortalApp, group: AppGroupId | null)}
	{#if customizing}
		<div class="app-card static" class:compact>
			<span class="app-icon">{@render appIcon(app.icon)}</span>
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
		<a class="app-card" class:compact href={app.href} onclick={(e) => appClick(e, app)}>
			<span class="app-icon">{@render appIcon(app.icon)}</span>
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
					<span class="group-label">{group.label}</span>
					<span class="group-count">{groupApps.length}</span>
					<span class="group-chev" class:closed={isCollapsed} aria-hidden="true">&#9662;</span>
				</button>
				<span class="group-line"></span>
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
		display: inline-flex;
		align-items: baseline;
		gap: 0.5rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.group-label {
		font-family: 'Orbitron', sans-serif;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.2em;
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
		background: linear-gradient(to right, rgba(0, 255, 65, 0.25), transparent);
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
		display: flex;
		align-items: center;
		gap: 0.9rem;
		background: var(--bg1);
		border: 1px solid rgba(0, 255, 65, 0.14);
		border-radius: 4px;
		padding: 0.85rem 1rem;
		text-decoration: none;
		transition: border-color 0.2s, background 0.2s, transform 0.2s;
	}
	a.app-card:hover {
		border-color: rgba(0, 255, 65, 0.4);
		background: rgba(0, 255, 65, 0.04);
		transform: translateY(-2px);
	}
	.app-card.compact {
		padding: 0.6rem 0.8rem;
	}
	.app-icon {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		color: var(--green);
		filter: drop-shadow(0 0 6px rgba(0, 255, 65, 0.35));
	}
	.app-card.compact .app-icon {
		width: 24px;
		height: 24px;
	}
	.app-icon svg {
		width: 100%;
		height: 100%;
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
		color: var(--gold);
		text-shadow: 0 0 8px rgba(200, 255, 0, 0.4);
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
		color: var(--gold);
		border: 1px solid rgba(200, 255, 0, 0.35);
		border-radius: 2px;
		padding: 0.3rem 0.6rem;
		white-space: nowrap;
		flex-shrink: 0;
	}
	a.app-card:hover .app-cta {
		color: var(--green);
		border-color: rgba(0, 255, 65, 0.4);
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
