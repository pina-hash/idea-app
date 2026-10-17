<script lang="ts">
	/**
	 * THE TAB ICON HARNESS (ledger 0396). 404 in production; no auth, no
	 * Supabase.
	 *
	 * Three things, all drawn by the SHIPPING code, never a copy of it:
	 *
	 *   1. THIS TAB. Keys that raise and clear each status through the real
	 *      `raise`/`clear` in `$lib/tab-icon/live`, painted by the real
	 *      `TabIcon` the root layout mounts on every page, including this one.
	 *      The preview beside them is read from the page's own SVG icon link,
	 *      so what it shows is what the browser's tab strip shows.
	 *   2. EVERY GLYPH IN EVERY STATE at real 16 and 32 px on the six tab
	 *      grounds the design was judged on, as images, which is how a browser
	 *      draws a favicon. Animated states are shown at both of their frames.
	 *   3. THE HOME-SCREEN ICONS on a mid-blue wallpaper, the shipped PNGs and
	 *      the geometry's own SVGs side by side: Android unframed, iPhone
	 *      masked to its rounded square, maskable masked to a circle.
	 *
	 * `?theme=matrix` or `?theme=space-white` paints the page chrome in that
	 * theme; the icons themselves are images and do not change with it.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { appIcon, G, icon, TAB_SECTIONS, type TabIconStatus, type TabSection } from '$lib/tab-icon/geometry';
	import {
		clearAllTabStatuses,
		currentTabStatus,
		framePhase,
		raise,
		subscribeTabStatus,
		type TabStatusHandle,
		type TabStatusKind
	} from '$lib/tab-icon/live';
	import { TAB_STATUS_PRIORITY } from '$lib/tab-icon/status';

	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	/** The six tab grounds the icon was chosen on. */
	const GROUNDS = [
		{ id: 'white', bg: '#FFFFFF', ink: '#1F1F1F', label: 'White' },
		{ id: 'light-gray', bg: '#DEE1E6', ink: '#1F1F1F', label: 'Light gray' },
		{ id: 'dark', bg: '#202124', ink: '#E8EAED', label: 'Dark' },
		{ id: 'dark-gray', bg: '#35363A', ink: '#E8EAED', label: 'Dark gray' },
		{ id: 'blue', bg: '#D3E3FD', ink: '#041E49', label: 'Blue' },
		{ id: 'pink', bg: '#F6D6E3', ink: '#3B0A1F', label: 'Pink' }
	] as const;

	/** Every state, and both frames of the two that animate. Each animated
	    state's first column is the frame its cycle opens on, which is also
	    the frame reduced motion holds. */
	const STATES: ReadonlyArray<{ id: string; label: string; status: TabIconStatus }> = [
		{ id: 'none', label: 'Resting', status: { kind: 'none' } },
		{ id: 'unread', label: 'Unread', status: { kind: 'unread', n: 3 } },
		{ id: 'attention', label: 'Attention', status: { kind: 'attention' } },
		{ id: 'progress', label: 'Progress 60%', status: { kind: 'progress', p: 0.6 } },
		{ id: 'saving-on', label: 'Saving, lamp on', status: { kind: 'saving', phase: framePhase('saving', 0) } },
		{ id: 'saving-off', label: 'Saving, lamp off', status: { kind: 'saving', phase: framePhase('saving', 1) } },
		{ id: 'live-high', label: 'Live, pulse high', status: { kind: 'live', phase: framePhase('live', 0) } },
		{ id: 'live-low', label: 'Live, pulse low', status: { kind: 'live', phase: framePhase('live', 2) } },
		{ id: 'done', label: 'Done', status: { kind: 'done' } },
		{ id: 'error', label: 'Error', status: { kind: 'error' } },
		{ id: 'offline', label: 'Offline', status: { kind: 'offline' } }
	];

	/** What each status key says, in the priority order the tab follows. */
	const KEY_WORDS: Record<TabStatusKind, string> = {
		error: 'Error',
		live: 'Live',
		unread: 'Unread',
		attention: 'Attention',
		progress: 'Progress',
		saving: 'Saving',
		done: 'Done',
		offline: 'Offline'
	};

	const APP_ICONS = [
		{ id: 'android', label: 'Android', file: '/IDEA/icon-192.png', shape: 'free' },
		{ id: 'ios', label: 'iPhone', file: '/IDEA/apple-touch-icon.png', shape: 'squircle' },
		{ id: 'maskable', label: 'Android, maskable', file: '/IDEA/icon-maskable-512.png', shape: 'circle' }
	] as const;

	/* Blob URLs, one per distinct drawing, made on the client: two thousand
	   inline data URLs would be several megabytes of markup. */
	let urls = $state<Record<string, string>>({});
	let ready = $state(false);

	const cellKey = (section: TabSection, state: string) => `${section}|${state}`;

	onMount(() => {
		const made: Record<string, string> = {};
		const blob = (svg: string) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
		let uid = 0;
		for (const section of TAB_SECTIONS)
			for (const s of STATES) made[cellKey(section, s.id)] = blob(icon('gearkey', section, s.status, `c${uid++}`));
		for (const a of APP_ICONS) made[`app|${a.id}`] = blob(appIcon('gearkey', a.id));
		urls = made;
		ready = true;
		return () => {
			for (const u of Object.values(made)) URL.revokeObjectURL(u);
		};
	});

	/* ---- this tab ---------------------------------------------------- */

	const handles: Partial<Record<TabStatusKind, TabStatusHandle>> = {};
	let active = $state<Partial<Record<TabStatusKind, boolean>>>({});
	let showing = $state<TabIconStatus>({ kind: 'none' });
	let liveHref = $state('/IDEA/favicon.svg');
	let title = $state('');
	let unreadN = $state(3);
	let progressPct = $state(40);
	let reducedMotion = $state(false);

	function refresh() {
		const next: Partial<Record<TabStatusKind, boolean>> = {};
		for (const k of TAB_STATUS_PRIORITY) next[k] = !!handles[k]?.active;
		active = next;
		showing = currentTabStatus();
	}

	onMount(() => {
		const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
		const readLink = () => {
			liveHref = link?.getAttribute('href') ?? '';
			title = document.title;
		};
		readLink();
		const watch = new MutationObserver(readLink);
		if (link) watch.observe(link, { attributes: true, attributeFilter: ['href'] });
		watch.observe(document.head, { childList: true, subtree: true, characterData: true });
		/* Deferred: a status can be raised from inside another component's
		   effect, and this harness must not write its own state mid-render. */
		const off = subscribeTabStatus(() => queueMicrotask(refresh));
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = motion.matches;
		const onMotion = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		motion.addEventListener('change', onMotion);
		refresh();
		return () => {
			watch.disconnect();
			off();
			motion.removeEventListener('change', onMotion);
			for (const k of TAB_STATUS_PRIORITY) handles[k]?.clear();
		};
	});

	function toggle(kind: TabStatusKind) {
		const h = handles[kind];
		if (h?.active) {
			h.clear();
			delete handles[kind];
		} else {
			handles[kind] = raise(kind, { n: unreadN, p: progressPct / 100 });
		}
		refresh();
	}

	function setUnread(v: number) {
		unreadN = Math.max(0, Math.min(999, Math.floor(v) || 0));
		handles.unread?.update({ n: unreadN });
	}

	function setProgress(v: number) {
		progressPct = Math.max(0, Math.min(100, Math.round(v) || 0));
		handles.progress?.update({ p: progressPct / 100 });
	}

	function clearAll() {
		for (const k of TAB_STATUS_PRIORITY) delete handles[k];
		clearAllTabStatuses();
		refresh();
	}

	const showingWords = $derived(
		showing.kind === 'none'
			? 'Resting'
			: showing.kind === 'unread'
				? `Unread, ${showing.n}`
				: showing.kind === 'progress'
					? `Progress, ${Math.round((showing.p ?? 0) * 100)}%`
					: KEY_WORDS[showing.kind]
	);
</script>

<svelte:head><title>dev / tab icon</title></svelte:head>

<main class="ti" data-testid="tab-icon-harness" data-ready={ready ? 'yes' : 'no'}>
	<header class="ti-head">
		<h1>Tab icon</h1>
		<p class="ti-lede">
			Gear Key, the icon on every ideabosco.com tab. The key says this is IDEA, the glyph says where you are,
			and the lamp and the hairline say what is happening.
		</p>
		<nav class="ti-jump" aria-label="On this page">
			<a href="#ti-live">This tab</a>
			<a href="#ti-strips">Tab strips</a>
			<a href="#ti-matrix">Every glyph and state</a>
			<a href="#ti-home">Home screen</a>
		</nav>
	</header>

	<section class="ti-card" id="ti-live" aria-labelledby="ti-live-h">
		<h2 id="ti-live-h">This tab</h2>
		<p class="ti-note">
			Each key raises a status on this tab, and pressing it again clears it. Watch the browser's own tab strip:
			the preview here is read from this page's icon link, so it shows exactly what the tab shows. When several
			are raised, the highest in this row wins.
		</p>
		<div class="ti-live">
			<div class="ti-live-preview" aria-label="This tab's icon now">
				{#if liveHref}
					<img src={liveHref} width="16" height="16" alt="" data-testid="ti-live-16" />
					<img src={liveHref} width="32" height="32" alt="" />
					<img src={liveHref} width="64" height="64" alt="" />
				{/if}
			</div>
			<dl class="ti-facts">
				<div><dt>Showing</dt><dd data-testid="ti-showing">{showingWords}</dd></div>
				<div><dt>Title</dt><dd data-testid="ti-title">{title}</dd></div>
				<div>
					<dt>Motion</dt>
					<dd>{reducedMotion ? 'Reduced: still frames only' : 'Full: live pulses, saving blinks'}</dd>
				</div>
			</dl>
		</div>
		<div class="ti-keys" role="group" aria-label="Statuses, highest priority first">
			{#each TAB_STATUS_PRIORITY as kind (kind)}
				<button
					type="button"
					class="ti-key"
					aria-pressed={active[kind] ? 'true' : 'false'}
					data-testid={`ti-key-${kind}`}
					onclick={() => toggle(kind)}>{KEY_WORDS[kind]}</button
				>
			{/each}
			<button type="button" class="ti-key ti-key-quiet" data-testid="ti-clear-all" onclick={clearAll}
				>Clear all</button
			>
		</div>
		<div class="ti-dials">
			<label class="ti-dial">
				<span>Unread count</span>
				<input
					type="number"
					min="0"
					max="999"
					value={unreadN}
					data-testid="ti-unread-n"
					oninput={(e) => setUnread(Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</label>
			<label class="ti-dial">
				<span>Progress {progressPct}%</span>
				<input
					type="range"
					min="0"
					max="100"
					value={progressPct}
					data-testid="ti-progress-p"
					oninput={(e) => setProgress(Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</label>
		</div>
		<p class="ti-note">
			Done clears itself after four seconds. Error stays until it is cleared. Offline also follows the browser's
			own connection, on its own.
		</p>
	</section>

	<section class="ti-card" id="ti-strips" aria-labelledby="ti-strips-h">
		<h2 id="ti-strips-h">Tab strips</h2>
		<p class="ti-note">Every section at rest, at 16 px, in a tab on each ground. The strips are wider than most screens and scroll sideways.</p>
		{#each GROUNDS as g (g.id)}
			<div class="ti-strip-row">
				<span class="ti-ground-name">{g.label} <code>{g.bg}</code></span>
				<div class="ti-strip" style:--ti-ground={g.bg} style:--ti-ink={g.ink} data-testid={`ti-strip-${g.id}`}>
					{#each TAB_SECTIONS as s (s)}
						<span class="ti-tab">
							{#if ready}<img src={urls[cellKey(s, 'none')]} width="16" height="16" alt="" />{/if}
							<span class="ti-tab-title">{G[s].label}</span>
						</span>
					{/each}
				</div>
			</div>
		{/each}
	</section>

	<section class="ti-card" id="ti-matrix" aria-labelledby="ti-matrix-h">
		<h2 id="ti-matrix-h">Every glyph in every state</h2>
		<p class="ti-note">
			Each cell is the same drawing at 16 px and at 32 px. Live and saving animate on a real tab; both of their
			frames are shown here, the one each opens on first, which is also the one reduced motion holds.
		</p>
		<p class="ti-note" data-testid="ti-matrix-scroll-note">
			Where the screen is narrower than a table, the table scrolls sideways and the Section column stays in
			place.
		</p>
		{#each GROUNDS as g (g.id)}
			<h3 class="ti-ground-h">{g.label} <code>{g.bg}</code></h3>
			<div class="ti-scroll" data-testid={`ti-matrix-${g.id}`}>
				<table class="ti-matrix" style:--ti-ground={g.bg} style:--ti-ink={g.ink}>
					<thead>
						<tr>
							<th scope="col">Section</th>
							{#each STATES as st (st.id)}<th scope="col">{st.label}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each TAB_SECTIONS as s (s)}
							<tr>
								<th scope="row">{G[s].label}</th>
								{#each STATES as st (st.id)}
									<td>
										{#if ready}
											<img src={urls[cellKey(s, st.id)]} width="16" height="16" alt="" />
											<img src={urls[cellKey(s, st.id)]} width="32" height="32" alt="" />
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/each}
	</section>

	<section class="ti-card" id="ti-home" aria-labelledby="ti-home-h">
		<h2 id="ti-home-h">Home screen</h2>
		<p class="ti-note">
			The shipped files (top) and the geometry's own drawings (bottom), as each device shows them. No black
			square or circle sits behind the key anywhere.
		</p>
		<div class="ti-wallpaper" data-testid="ti-wallpaper">
			{#each ['file', 'svg'] as row (row)}
				<div class="ti-apps">
					{#each APP_ICONS as a (a.id)}
						<figure class="ti-app">
							{#if row === 'file'}
								<img
									class="ti-app-icon {a.shape}"
									src={a.file}
									width="96"
									height="96"
									alt=""
									data-testid={`ti-app-${a.id}`}
								/>
							{:else if ready}
								<img class="ti-app-icon {a.shape}" src={urls[`app|${a.id}`]} width="96" height="96" alt="" />
							{/if}
							<figcaption>{a.label}{row === 'svg' ? ', geometry' : ''}</figcaption>
						</figure>
					{/each}
				</div>
			{/each}
		</div>
	</section>
</main>

<style>
	.ti {
		box-sizing: border-box;
		max-width: 88rem;
		margin: 0 auto;
		padding: 24px 16px 96px;
		color: var(--text-1);
		font-family: var(--font-display);
		position: relative;
		z-index: 1;
	}
	.ti-head h1 {
		font-family: var(--font-title);
		font-size: 1.6rem;
		margin: 0 0 6px;
	}
	.ti-lede,
	.ti-note {
		color: var(--text-2);
		max-width: 46rem;
		margin: 0 0 12px;
		font-size: 1.02rem;
		line-height: 1.4;
	}
	.ti-jump {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin: 4px 0 16px;
	}
	.ti-jump a {
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.ti-card {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: 10px;
		padding: 16px;
		margin: 0 0 16px;
		min-width: 0;
	}
	.ti-card h2 {
		margin: 0 0 6px;
		font-size: 1.25rem;
	}
	/* The shell's green "//" heading prefix is not current IDEA branding, and
	   ledger 0396 keeps it out of everything the tab icon work draws. */
	.ti h2::before {
		content: none;
	}
	.ti-live {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 32px;
		align-items: center;
		margin: 8px 0 12px;
	}
	.ti-live-preview {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px 16px;
		background: #202124;
		border-radius: 8px;
	}
	.ti-live-preview img {
		display: block;
	}
	.ti-facts {
		display: grid;
		gap: 4px;
		margin: 0;
		min-width: 0;
	}
	.ti-facts div {
		display: flex;
		gap: 10px;
		min-width: 0;
	}
	.ti-facts dt {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: uppercase;
		color: var(--text-2);
		min-width: 4.5rem;
	}
	.ti-facts dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ti-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 12px;
	}
	.ti-key {
		min-height: 44px;
		min-width: 44px;
		padding: 0 14px;
		border-radius: 8px;
		border: 1px solid var(--boundary);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.ti-key[aria-pressed='true'] {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
		color: var(--text-1);
		background: color-mix(in srgb, var(--green) 18%, var(--surface-2));
	}
	.ti-key:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.ti-key-quiet {
		background: transparent;
	}
	.ti-dials {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 24px;
		margin: 0 0 8px;
	}
	.ti-dial {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.ti-dial input[type='number'] {
		width: 5rem;
		min-height: 44px;
		box-sizing: border-box;
		padding: 0 8px;
		border: 1px solid var(--boundary);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--text-1);
		font: inherit;
	}
	.ti-dial input[type='range'] {
		width: min(14rem, 50vw);
		min-height: 44px;
		accent-color: var(--green);
	}
	.ti-strip-row {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		margin: 0 0 8px;
	}
	.ti-ground-name,
	.ti-ground-h {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.ti-ground-h {
		margin: 16px 0 6px;
		font-weight: 400;
	}
	code {
		font-family: var(--font-mono);
	}
	.ti-strip {
		display: flex;
		gap: 2px;
		overflow-x: auto;
		padding: 6px 6px 0;
		background: color-mix(in srgb, var(--ti-ground) 82%, #808080);
		border-radius: 8px 8px 0 0;
		min-width: 0;
	}
	.ti-tab {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 34px;
		padding: 0 14px 0 10px;
		background: var(--ti-ground);
		color: var(--ti-ink);
		border-radius: 8px 8px 0 0;
		font-family: system-ui, sans-serif;
		font-size: 12px;
	}
	.ti-tab img {
		display: block;
	}
	.ti-tab-title {
		white-space: nowrap;
	}
	.ti-scroll {
		overflow-x: auto;
		min-width: 0;
		border-radius: 8px;
	}
	.ti-matrix {
		border-collapse: collapse;
		background: var(--ti-ground);
		color: var(--ti-ink);
		font-size: 0.78rem;
	}
	.ti-matrix th,
	.ti-matrix td {
		padding: 6px 8px;
		text-align: left;
		vertical-align: middle;
		white-space: nowrap;
	}
	.ti-matrix thead th {
		font-family: var(--font-mono);
		font-weight: 400;
		font-size: 0.7rem;
		white-space: normal;
		width: 4.6rem;
		line-height: 1.2;
	}
	.ti-matrix tbody th {
		font-weight: 600;
	}
	/* The Section column stays in view while a narrow screen scrolls the
	   states sideways, so every cell can still be matched to its section. It
	   paints over the cells it slides across (a z-index, because a sticky box
	   is positioned and would otherwise paint in tree order) on the table's
	   own opaque ground, with a rule on its edge. Nothing in a cell is
	   focusable, so no scroll-padding is needed for a cell scrolled into view. */
	.ti-matrix tr > :first-child {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--ti-ground);
		box-shadow: inset -1px 0 0 color-mix(in srgb, var(--ti-ink) 30%, transparent);
	}
	.ti-matrix td img {
		display: inline-block;
		vertical-align: middle;
	}
	.ti-matrix td img + img {
		margin-left: 6px;
	}
	.ti-wallpaper {
		border-radius: 12px;
		padding: 24px 16px;
		/* A mid-blue home screen, dark enough that white captions clear 4.5:1
		   at its lightest stop (5.17:1 on #3a6fae). The lightest stop is also
		   the background-color under the gradient, so a contrast check that
		   walks ancestors for a colour measures the worst case and not the
		   page around the wallpaper. */
		background-color: #3a6fae;
		background-image: linear-gradient(160deg, #24518a, #3a6fae 55%, #2f63a3);
		display: grid;
		gap: 24px;
	}
	.ti-apps {
		display: flex;
		flex-wrap: wrap;
		gap: 24px 40px;
		justify-content: center;
	}
	.ti-app {
		margin: 0;
		display: grid;
		justify-items: center;
		gap: 8px;
		width: 9rem;
	}
	.ti-app-icon {
		display: block;
	}
	.ti-app-icon.squircle {
		border-radius: 22.37%;
	}
	.ti-app-icon.circle {
		border-radius: 50%;
	}
	.ti-app figcaption {
		color: #fff;
		font-family: system-ui, sans-serif;
		font-size: 13px;
		text-align: center;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
	}
	@media (max-width: 40rem) {
		.ti-strip-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 4px;
		}
	}
</style>
