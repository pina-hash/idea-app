<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import '$lib/classroom/classroom.css';
	import ClassroomSettings from '$lib/classroom/ClassroomSettings.svelte';
	import PanelStack from '$lib/classroom/PanelStack.svelte';
	import PanelsHiddenNote from '$lib/classroom/PanelsHiddenNote.svelte';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import ClassTeams from '$lib/classroom/ClassTeams.svelte';
	import { createClassroomPreferences } from '$lib/preferences/classroom';
	import { provideClassroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import {
		CLASS_PANELS,
		classNoticesFirst,
		classPanelDefaults,
		itemPanelDefaults,
		panelDef,
		panelLabels,
		resolvePanels,
		type PanelLayout,
		type PanelPage
	} from '$lib/classroom/panel-layout';
	import type { ClassTeamSet } from '$lib/classroom/class-teams';
	import type { HallPassState } from '$lib/classroom/hall-pass';
	import { classroomMeasure, locateClassroom } from '$lib/classroom/nav';

	/*
	 * THE PAGE-LAYOUT MECHANISM, END TO END, IN ONE PLACE (ledger 0360, R23).
	 * Everything below the fixtures is the shipping code: the store, the
	 * settings panel and its editor, `resolvePanels`, `PanelStack` and the
	 * hidden-panels note. See +page.ts for the parameters.
	 */
	const params = page.url.searchParams;
	const pageKind: PanelPage = params.get('page') === 'item' ? 'item' : 'class';
	const teacher = params.get('role') === 'teacher';
	const role = teacher ? 'manager' : 'student';
	const material = params.get('kind') === 'material';
	const itemLayout = {
		links: params.get('links') === 'top' ? ('top' as const) : ('bottom' as const),
		files: params.get('files') === 'top' ? ('top' as const) : ('bottom' as const)
	};
	const preset = params.get('preset') ?? 'default';
	const themeParam = params.get('theme');

	/* FORCED THEME ATTRIBUTE, the classroom-live harness's way: no session here,
	   so ThemeRoot decides "none"; `?theme=space-white` writes the attribute and
	   re-writes it once after ThemeRoot's first effect. */
	$effect(() => {
		if (themeParam !== 'space-white') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', 'space-white');
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	/** The stored layouts each `?preset=` names, exactly as a person's editor would store them. */
	function presetLayouts(): { classPage: PanelLayout | null; itemPage: PanelLayout | null } {
		if (preset === 'reordered') {
			return {
				// The posts moved up under the class header: everything after
				// them in the stored order now renders below the anchor.
				classPage: { order: ['banner', 'stream', 'teams', 'find', 'videos'], hidden: [] },
				// The instructions moved below the work.
				itemPage: { order: ['deck', 'notebook', 'reference', 'links', 'files', 'work', 'body', 'rubric'], hidden: [] }
			};
		}
		if (preset === 'hidden') {
			return {
				classPage: { order: [], hidden: ['videos', 'theme'] },
				itemPage: { order: [], hidden: ['rubric'] }
			};
		}
		if (preset === 'search-first') {
			// The search row moved above the class header: the notices lead the page.
			return {
				classPage: { order: ['find', 'banner', 'teams', 'videos', 'stream'], hidden: [] },
				itemPage: null
			};
		}
		return { classPage: null, itemPage: null };
	}

	const store = createClassroomPreferences({ viewer: null, account: null, storage: null });
	store.set('panels', presetLayouts());
	provideClassroomPreferences(store);
	const prefs = reactivePreferences(store);

	/* What renders on each page in this fixture: every panel the page's own
	   conditions would show. The item's `work` exists on an assignment only and
	   a reference document on a material only; `actions` (a piece of the class
	   header, with the tools and the theme vote) is a manager's. */
	const present = $derived(
		pageKind === 'class'
			? new Set(CLASS_PANELS.map((p) => p.id).filter((id) => id !== 'actions' || teacher))
			: new Set(
					itemPanelDefaults(itemLayout).filter((id) =>
						id === 'work' ? !material : id === 'reference' ? material : id === 'rubric' ? !material : true
					)
				)
	);
	const defaults = $derived(pageKind === 'class' ? classPanelDefaults() : itemPanelDefaults(itemLayout));
	const layout = $derived(pageKind === 'class' ? prefs.current.panels.classPage : prefs.current.panels.itemPage);
	const resolved = $derived(resolvePanels(pageKind, defaults, layout, present));
	/** The panels in DOM order, as a spec reads them off the root. */
	const order = $derived([...resolved.above, ...(resolved.anchor ? [resolved.anchor] : []), ...resolved.below]);
	/** The header's pieces render inside it unless this person hid them. */
	const pieceShown = (id: string) => present.has(id) && !resolved.hidden.includes(id);
	/** The class page's notices lead it once anything is above the header (`classNoticesFirst`). */
	const noticesFirst = $derived(pageKind === 'class' && classNoticesFirst(resolved));

	let settingsEl = $state<ReturnType<typeof ClassroomSettings> | null>(null);
	const arrange = () => settingsEl?.open(`panels:${pageKind}`);
	onMount(() => {
		if (params.get('settings') === 'open') arrange();
	});

	/* THE ANCHOR'S FRAME COUNTS ITS OWN LOADS. Moving an iframe in the DOM
	   reloads it, so a reorder that moved the work slot would post a second
	   load. `srcdoc` and a sandbox with scripts only: it reaches nothing. */
	let frameLoads = $state(0);
	/* The frame is created only after the listener is attached: a server-rendered
	   frame loads before hydration, and its first message would be lost. */
	let listening = $state(false);
	onMount(() => {
		const onMessage = (e: MessageEvent) => {
			if (e.data === 'layout-harness-frame-loaded') frameLoads += 1;
		};
		window.addEventListener('message', onMessage);
		listening = true;
		return () => window.removeEventListener('message', onMessage);
	});
	const FRAME = `<!doctype html><meta charset="utf-8"><body style="font:14px sans-serif;margin:8px">Worksheet frame<script>parent.postMessage('layout-harness-frame-loaded','*')<\/script></body>`;

	const SECTION_ID = 's-layout';
	/* The width the real route gives this page (CLAUDE.md: a classroom harness
	   that omits it measures a width the route never has). */
	const measure = classroomMeasure(
		locateClassroom(pageKind === 'class' ? `/classroom/${SECTION_ID}` : `/classroom/${SECTION_ID}/item/i-1`)
	);
	const now = Date.now();
	const hallPass: HallPassState = teacher
		? { scope: 'manager', section_id: SECTION_ID, taken: false, mine: false, open: null, history: [] }
		: { scope: 'student', section_id: SECTION_ID, taken: false, mine: false, opened_at: null };
	const TEAMS: ClassTeamSet[] = [
		{
			id: 'set-1',
			label: 'Lab pairs',
			posted_at: new Date(now - 3_600_000).toISOString(),
			visible_until: null,
			edited: false,
			teams: [
				{
					id: 't-1',
					team_number: 1,
					name: 'Torque Squad',
					accent_color: '#3fb0a0',
					background_type: null,
					background_value: null,
					badge: null,
					flourish: null,
					tagline: null,
					mine: !teacher,
					members: ['Ana Reyes', 'Ben Okafor']
				},
				{
					id: 't-2',
					team_number: 2,
					name: null,
					accent_color: null,
					background_type: null,
					background_value: null,
					badge: null,
					flourish: null,
					tagline: null,
					mine: false,
					members: ['Dee Marsh', 'Eli Nakamura']
				}
			]
		}
	];
	const FIXTURE_WORDS: Record<string, string> = {
		banner: 'Engineering Design Honors',
		theme: 'Class theme',
		actions: 'Quick post · New post · Units (3)',
		find: 'Search this class · To do · Missing · Done',
		videos: 'Videos (2)',
		deck: 'Open the slides',
		notebook: 'Notebook check-in for today',
		links: 'Two links',
		files: 'Three files',
		body: 'Read the brief, then sketch three options.',
		reference: 'The reference document for this unit.',
		rubric: 'How this is graded: four criteria'
	};
</script>

<svelte:head><title>dev / classroom page layout</title></svelte:head>

{#snippet panel(id: string)}
	{#if id === 'teams'}
		<div data-panel="teams">
			<ClassTeams sets={TEAMS} manage={teacher ? { href: `/classroom/${SECTION_ID}/people`, label: 'People' } : null} />
		</div>
	{:else if id === 'banner'}
		<!-- The class header (ledger 0360, R19): the title, then ONE row holding
		     the tools, the theme vote's key and a teacher's posting keys, each a
		     piece that hides in place. The notices follow it while it leads. -->
		<header class="card lh-panel lh-banner" data-panel="banner" data-testid="lh-panel">
			<h1 class="lh-title">{FIXTURE_WORDS.banner}</h1>
			<div class="lh-row" data-testid="lh-header-row">
				{#if pieceShown('tools')}
					<div class="class-tools" data-testid="class-tools" data-panel="tools">
						<HallPass sectionId={SECTION_ID} state={hallPass} transports={null} {now} tool />
					</div>
				{/if}
				{#if pieceShown('theme')}
					<button type="button" class="btn secondary tiny" data-panel="theme">{FIXTURE_WORDS.theme}</button>
				{/if}
				{#if pieceShown('actions')}
					<span class="lh-keys" data-panel="actions">{FIXTURE_WORDS.actions}</span>
				{/if}
			</div>
		</header>
		{#if !noticesFirst}{@render notices()}{/if}
	{:else}
		<section class="card lh-panel" data-panel={id} data-testid="lh-panel">
			<h2 class="lh-label">{panelDef(pageKind, id)?.label ?? id}</h2>
			<p class="lh-words">{FIXTURE_WORDS[id] ?? ''}</p>
		</section>
	{/if}
{/snippet}

{#snippet notices()}
	<section class="card lh-panel lh-notices" data-testid="lh-notices">
		<p class="lh-words">Notice: special schedule today. Until 3:00 PM today</p>
	</section>
{/snippet}

{#snippet anchor()}
	{#if pageKind === 'class'}
		<section class="card lh-panel lh-anchor" data-panel="stream" data-testid="lh-anchor">
			<h2 class="lh-label">Posts</h2>
			<ul class="lh-posts">
				<li data-testid="item-row">Truss sketch</li>
				<li data-testid="item-row">Slides: levers and linkages</li>
				<li data-testid="item-row">Bridge load test</li>
			</ul>
		</section>
	{:else if resolved.anchor}
		<section class="engine-host lh-anchor" data-panel="work" data-testid="lh-anchor">
			{#if listening}
				<iframe class="lh-frame" title="Worksheet" sandbox="allow-scripts" srcdoc={FRAME}></iframe>
			{:else}
				<div class="lh-frame" aria-hidden="true"></div>
			{/if}
		</section>
	{/if}
{/snippet}

<div
	class="cr-root {CLASSROOM_PLATE} harness-page"
	data-testid="layout-harness"
	data-order={order.join(',')}
	data-hidden={resolved.hidden.join(',')}
	data-frame-loads={frameLoads}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
>
	<main class="lh-main">
		<p class="lh-bar">
			<button type="button" class="btn secondary tiny" data-testid="settings-trigger" onclick={() => settingsEl?.open()}>
				Display settings
			</button>
		</p>
		{#if noticesFirst}{@render notices()}{/if}
		<PanelStack above={resolved.above} below={resolved.below} {panel} {anchor} />
		<PanelsHiddenNote labels={panelLabels(pageKind, resolved.hidden)} onArrange={arrange} />
	</main>
	<ClassroomSettings bind:this={settingsEl} preferences={store} {role} />
</div>

<style>
	.harness-page {
		padding: 1.5rem var(--cr-gutter, 1rem) 6rem;
	}
	.lh-main {
		max-width: var(--cr-measure-route, 60rem);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.lh-bar {
		margin: 0;
	}
	.lh-panel {
		margin: 0;
	}
	.lh-title {
		margin: 0;
		font-size: 1.3rem;
	}
	.lh-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		min-width: 0;
	}
	.lh-keys {
		color: var(--text-2);
	}
	.lh-label {
		margin: 0 0 0.3rem;
		font-size: 1rem;
	}
	.lh-words {
		margin: 0;
		color: var(--text-2);
	}
	.lh-posts {
		margin: 0;
		padding-left: 1.1rem;
	}
	.lh-frame {
		display: block;
		width: 100%;
		height: 6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: #fff;
	}
	/* The section layout's own row rule, restated because it is scoped to that
	   file; the components inside it are the real ones. */
	.class-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		min-width: 0;
	}
	.class-tools > :global(*) {
		flex: 1 1 12rem;
		min-width: 0;
	}
</style>
