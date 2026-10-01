<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassHeader from '$lib/classroom/ClassHeader.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ClassroomSettings from '$lib/classroom/ClassroomSettings.svelte';
	import { createClassroomPreferences } from '$lib/preferences/classroom';
	import { provideClassroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import type { PanelLayout } from '$lib/classroom/panel-layout';
	import QuickPosts from '$lib/classroom/QuickPosts.svelte';
	import ClassTeams from '$lib/classroom/ClassTeams.svelte';
	import ClassThemePanel from '$lib/classroom/ClassThemePanel.svelte';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import SongQueue from '$lib/classroom/SongQueue.svelte';
	import LiveDoor from '$lib/classroom/live-class/LiveDoor.svelte';
	import { createMemoryClassroomLive } from '$lib/classroom/live';
	import { classHeaderTeams, nextDueFor } from '$lib/classroom/class-header';
	import { postedTeamsNotice, teamsManageLink, type ClassTeamSet } from '$lib/classroom/class-teams';
	import { CLASS_THEME_FEATURES, resolveClassTheme, type ClassThemeTransports } from '$lib/classroom/class-theme';
	import { classroomMeasure, locateClassroom } from '$lib/classroom/nav';
	import { laCalendarDay } from '$lib/classroom/school-calendar';
	import {
		QUICK_POST_MAX_AHEAD_DAYS,
		QUICK_POST_MAX_CHARS,
		type QuickPostBoard,
		type QuickPostTransports
	} from '$lib/classroom/quick-posts';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
	import type { HallPassState } from '$lib/classroom/hall-pass';
	import type { SongQueueState } from '$lib/classroom/song-queue';

	/*
	 * THE TOP OF A CLASS, AS THE CLASS PAGE MOUNTS IT (ledger 0360, R19/R21/R22):
	 * the header in the voted banner, the notices, then the posted teams. The
	 * transports below answer as 0230's three functions do -- a manager reads
	 * every live notice with its classes and may take one down, a student reads
	 * the live notices and nothing else, an ended or taken-down notice is never
	 * read back, and a post to a class the caller does not manage is refused --
	 * and everything that DRAWS is the shipping component.
	 *
	 * THE TWO KEYS IN THE ACTIONS SLOT (New post, Units) ARE THE CLASS VIEW'S,
	 * which renders them into this slot on the real page. They are drawn here
	 * only so the row has its real width; nothing in this harness asserts on
	 * them, and the class view's own harnesses cover what they do.
	 */
	const params = page.url.searchParams;
	const teacher = params.get('role') === 'teacher';
	const asPane = params.get('pane') === '1';
	const noBanner = params.get('banner') === 'none';
	const patternParam = params.get('pattern') ?? 'ripples';
	const postsParam = Number(params.get('posts') ?? '1');
	const expiring = params.get('expiring') === '1';
	const noTeams = params.get('teams') === '0';
	const pollParam = Number(params.get('poll') ?? '');
	const themeParam = params.get('theme');
	/* `?view=class`: the REAL ClassView under the header, handed the section
	   layout's own snippets, so where the class content starts is measured on
	   the page as it ships rather than on the header alone. */
	const viewClass = params.get('view') === 'class';
	/* `?layout=` (with `view=class`): the arrangement the REAL ClassView renders,
	   from an in-memory preference store the REAL settings panel edits, so a
	   change in the editor re-arranges the page under it. */
	const LAYOUTS: Record<string, PanelLayout> = {
		hidden: { order: [], hidden: ['tools', 'theme', 'teams'] },
		'search-first': { order: ['find', 'banner', 'teams', 'videos', 'stream'], hidden: [] },
		'posts-first': { order: ['stream', 'banner', 'teams', 'find', 'videos'], hidden: [] },
		'find-hidden': { order: [], hidden: ['find'] }
	};
	const layoutStore = createClassroomPreferences({ viewer: null, account: null, storage: null });
	layoutStore.set('panels', { classPage: LAYOUTS[params.get('layout') ?? ''] ?? null, itemPage: null });
	if (viewClass) provideClassroomPreferences(layoutStore);
	const layoutPrefs = reactivePreferences(layoutStore);
	let settingsEl = $state<ReturnType<typeof ClassroomSettings> | null>(null);
	/* `?opens=todo` (with `view=class`): a student's class opens on To do, which
	   is the filter a hidden search row has to own up to. */
	const opensOn = params.get('opens') === 'todo' && !params.get('role') ? 'todo' : 'all';

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

	const now = Date.now();
	const today = laCalendarDay(new Date(now));
	const HOUR = 3_600_000;
	const DAY = 24 * HOUR;
	const iso = (ms: number) => new Date(ms).toISOString();
	const ME = teacher ? 'apina@boscotech.edu' : 'ana@boscotech.net';

	const course = { id: 'c-100', code: 'IDEA100', title: 'Intro to IDEA', active: true };
	const SECTIONS: ClassroomSection[] = [
		{ id: 's-2', course_id: 'c-100', label: '2', block: '1', teacher_email: 'apina@boscotech.edu', active: true, course },
		{ id: 's-4', course_id: 'c-100', label: '4', block: '3', teacher_email: 'apina@boscotech.edu', active: true, course },
		{
			id: 's-6',
			course_id: 'c-209',
			label: '6',
			block: '5',
			teacher_email: 'apina@boscotech.edu',
			active: true,
			course: { id: 'c-209', code: 'IDEA209H', title: 'Engineering Design Honors', active: true }
		},
		{ id: 's-9', course_id: 'c-100', label: '9', block: '7', teacher_email: 'other@boscotech.edu', active: true, course },
		{ id: 's-old', course_id: 'c-100', label: '1', block: '2', teacher_email: 'apina@boscotech.edu', active: false, course }
	];
	const SECTION = SECTIONS[0];
	const BASE = '/dev/class-header';
	const measure = classroomMeasure(locateClassroom(`/classroom/${SECTION.id}`));

	const theme = noBanner
		? null
		: resolveClassTheme({ winners: { palette: 'steel', pattern: patternParam, badge: 'flame' }, accent: 'gold' });

	const item = (id: string, title: string, dueIn: number | null, over: Partial<ClassroomItem> = {}): ClassroomItem => ({
		id,
		kind: 'assignment',
		title,
		body: '',
		body_doc: null,
		points: 20,
		due_at: dueIn === null ? null : iso(now + dueIn),
		category: null,
		author_email: 'apina@boscotech.edu',
		author_name: 'Mr. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: iso(now - 3 * DAY),
		edited_at: null,
		created_at: iso(now - 3 * DAY),
		updated_at: iso(now - 3 * DAY),
		links: [],
		attachments: [],
		postings: [{ section_id: SECTION.id }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	});
	const ITEMS: ClassroomItem[] = [
		item('i-late', 'Gear ratio worksheet', -2 * DAY),
		item('i-next', 'Truss sketch: a bridge that holds a textbook', 2 * DAY),
		item('i-later', 'Bridge load test', 5 * DAY),
		item('i-draft', 'Draft: next week quiz', DAY, { published: false })
	];
	const nextDue = nextDueFor({
		items: ITEMS,
		work: {},
		now: iso(now),
		today,
		canManage: teacher,
		href: (id) => `${BASE}?item=${id}`
	});

	/* The teams the class can see: one posted draw, the student on team one. */
	const TEAMS: ClassTeamSet[] = noTeams
		? []
		: [
				{
					id: 'set-1',
					label: 'Lab pairs',
					posted_at: iso(now - HOUR),
					visible_until: null,
					edited: false,
					teams: [1, 2, 3, 4].map((n) => ({
						id: `t-${n}`,
						team_number: n,
						name: n === 1 ? 'Torque Squad' : null,
						accent_color: null,
						background_type: null,
						background_value: null,
						badge: null,
						flourish: null,
						tagline: null,
						mine: !teacher && n === 1,
						members: [`Student ${n}A`, `Student ${n}B`, `Student ${n}C`]
					}))
				}
			];
	const teams = teacher ? classHeaderTeams(postedTeamsNotice(TEAMS, today), teamsManageLink(SECTION.id)) : null;

	/* ---------------------------------------------------------------- *
	 * THE NOTICES, IN MEMORY, AS 0230 KEEPS THEM.
	 * ---------------------------------------------------------------- */
	type Stored = { id: string; body: string; created_at: string; expires_at: string | null; sections: string[]; down: boolean };
	const seeded: Stored[] = [];
	const bodies = [
		'Special schedule today: we meet in the shop for the first 20 minutes.\nBring safety glasses.',
		'Slides for the bridge build: https://docs.google.com/presentation/d/example',
		'Fire drill during third block. Leave your laptops closed.',
		'Reminder: the truss sketch is due Friday.'
	];
	for (let i = 0; i < Math.max(0, Math.min(4, postsParam)); i++) {
		seeded.push({
			id: `qp-${i + 1}`,
			body: bodies[i],
			created_at: iso(now - (i + 1) * HOUR),
			expires_at: i === 0 ? iso(now + 6 * HOUR) : i === 1 ? null : iso(now + (i + 1) * DAY),
			sections: i === 1 ? ['s-2', 's-4', 's-6'] : ['s-2'],
			down: false
		});
	}
	if (expiring) {
		seeded.unshift({
			id: 'qp-soon',
			body: 'This notice ends four seconds after the page loads.',
			created_at: iso(now - 60_000),
			expires_at: iso(now + 4_000),
			sections: ['s-2'],
			down: false
		});
	}
	let store = seeded;
	let seq = 0;
	let reads = $state(0);
	let log = $state<string[]>([]);
	const managed = new Set(teacher ? SECTIONS.map((s) => s.id) : []);

	function boardFor(sectionId: string): QuickPostBoard {
		const at = Date.now();
		return {
			manages: teacher,
			now: iso(at),
			posts: store
				.filter((p) => p.sections.includes(sectionId) && !p.down && (!p.expires_at || Date.parse(p.expires_at) > at))
				.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
				.map((p) => ({
					id: p.id,
					body: p.body,
					created_at: p.created_at,
					expires_at: p.expires_at,
					section_ids: teacher ? p.sections.filter((s) => managed.has(s)) : null,
					can_take_down: teacher
				}))
		};
	}
	const initialBoard = boardFor(SECTION.id);

	const quickTransports: QuickPostTransports = {
		async read(sectionId) {
			reads += 1;
			return { ok: true, board: boardFor(sectionId) };
		},
		async create(ids, body, expiresAt) {
			log = [...log, `create ${ids.join(',')} until ${expiresAt ?? 'taken down'}`];
			if (!ids.length) return { ok: false, reason: 'no_classes', message: 'Choose at least one class to post to.' };
			if (ids.some((id) => !managed.has(id))) {
				return { ok: false, reason: 'error', message: 'Only a teacher of every chosen class can post to it.' };
			}
			const text = body.replace(/^\s+|\s+$/g, '');
			if (!text) return { ok: false, reason: 'empty', message: 'Write something to post first.' };
			if (text.length > QUICK_POST_MAX_CHARS) return { ok: false, reason: 'too_long', message: 'Too long.' };
			const at = Date.now();
			if (expiresAt && Date.parse(expiresAt) <= at) return { ok: false, reason: 'expiry_passed', message: 'Passed.' };
			if (expiresAt && Date.parse(expiresAt) > at + QUICK_POST_MAX_AHEAD_DAYS * DAY) {
				return { ok: false, reason: 'expiry_too_far', message: 'Too far.' };
			}
			const id = `qp-new-${++seq}`;
			const sorted = [...new Set(ids)].sort();
			store = [{ id, body: text, created_at: iso(at), expires_at: expiresAt, sections: sorted, down: false }, ...store];
			return { ok: true, id, section_ids: sorted, created_at: iso(at), expires_at: expiresAt };
		},
		async takeDown(postId) {
			log = [...log, `takeDown ${postId}`];
			const post = store.find((p) => p.id === postId);
			if (!post) return { ok: false, reason: 'error', message: 'Not found.' };
			post.down = true;
			return { ok: true, already: false, section_ids: post.sections.filter((s) => managed.has(s)) };
		}
	};
	const live = createMemoryClassroomLive();
	let composing = $state(params.get('compose') === '1' && teacher);
	/* `?view=class` hands a teacher's ClassView write transports so its New post
	   and Units keys render as they do on the class page; nothing presses them. */
	const FAKE_WRITES = {} as never;

	/* ---------------------------------------------------------------- *
	 * THE CLASS THEME VOTE, the classroom-theme harness's answers, trimmed.
	 * ---------------------------------------------------------------- */
	const themeTransports: ClassThemeTransports = {
		async themes() {
			return { ok: true, themes: [] };
		},
		async tally() {
			return {
				ok: true,
				tally: {
					course_id: course.id,
					voting_open: true,
					reset_at: null,
					manages: teacher,
					can_vote: !teacher,
					voters: 6,
					counts: [
						{ feature: 'palette', option: 'steel', votes: 3 },
						{ feature: 'pattern', option: patternParam, votes: 2 },
						{ feature: 'badge', option: 'flame', votes: 2 }
					],
					winners: Object.fromEntries(CLASS_THEME_FEATURES.map((f) => [f, f === 'palette' ? 'steel' : f === 'pattern' ? patternParam : 'flame'])),
					mine: {}
				}
			};
		},
		async vote() {
			return { ok: false, reason: 'closed' };
		},
		async setVoting() {
			return { ok: false, reason: 'unavailable' };
		},
		async reset() {
			return { ok: false, reason: 'unavailable' };
		},
		async setAccent() {
			return { ok: false, reason: 'unavailable' };
		}
	};

	const hallPass: HallPassState = teacher
		? { scope: 'manager', section_id: SECTION.id, taken: false, mine: false, open: null, history: [] }
		: { scope: 'student', section_id: SECTION.id, taken: false, mine: false, opened_at: null };
	const songQueue: SongQueueState = teacher
		? { scope: 'manager', section_id: SECTION.id, price: 2, pending_cap: 3, pending: [], decided: [] }
		: { scope: 'student', section_id: SECTION.id, price: 2, pending_cap: 3, my_pending: 0, approved: [], mine: [] };
</script>

<svelte:head><title>dev / class header</title></svelte:head>

<div
	class="cr-root {CLASSROOM_PLATE} harness-page"
	data-testid="class-header-harness"
	data-reads={reads}
	data-log={log.join('|')}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
>
	<ClassSplit hasDetail={asPane} nav={classList}>
		<article class="harness-detail" data-testid="harness-detail">
			<h1>An open item</h1>
			<p>The item the class list sits beside. The header in the list is an h2 while this is open.</p>
		</article>
	</ClassSplit>
	{#if viewClass}
		<ClassroomSettings bind:this={settingsEl} preferences={layoutStore} role={teacher ? 'manager' : 'student'} />
	{/if}
</div>

{#snippet classList()}
	<div class="harness-class" data-testid="harness-class">
		{#if viewClass}
			<ClassView
				section={SECTION}
				items={ITEMS}
				sections={teacher ? SECTIONS : []}
				canManage={teacher}
				basePath={BASE}
				{asPane}
				clock={{ now: iso(now), today }}
				{theme}
				themePanel={classThemePanel}
				transports={teacher ? FAKE_WRITES : null}
				unitTransports={teacher ? FAKE_WRITES : null}
				onCompose={teacher ? () => undefined : null}
				tools={classTools}
				bulletin={notices}
				belowHeader={classTeams}
				teamsNotice={teams}
				quickPost={teacher ? { open: composing, toggle: () => (composing = !composing) } : null}
				panelLayout={layoutPrefs.current.panels.classPage}
				onArrange={() => settingsEl?.open('panels:class')}
				{opensOn}
			/>
		{:else}
		<ClassHeader
			section={SECTION}
			{theme}
			{asPane}
			{nextDue}
			{teams}
			quickPost={teacher ? { open: composing, toggle: () => (composing = !composing) } : null}
			tools={classTools}
			themePanel={classThemePanel}
			actions={teacher ? headerActions : null}
			bulletin={notices}
			below={classTeams}
		/>
		<p class="harness-after" data-testid="harness-after-header">The class's search and its items follow here.</p>
		{/if}
	</div>
{/snippet}

{#snippet classTools()}
	<div class="class-tools" data-testid="class-tools">
		<HallPass sectionId={SECTION.id} state={hallPass} transports={null} {now} tool />
		<SongQueue sectionId={SECTION.id} state={songQueue} transports={null} {now} tool />
		{#if teacher}
			<LiveDoor href={`${BASE}?live=1`} sectionId={SECTION.id} choice={null} />
		{/if}
	</div>
{/snippet}

{#snippet classThemePanel()}
	<ClassThemePanel courseId={course.id} transports={themeTransports} manageHref={teacher ? `${BASE}?settings=1` : null} />
{/snippet}

{#snippet headerActions()}
	<button type="button" class="btn secondary tiny" data-testid="harness-new-post">New post</button>
	<button type="button" class="btn secondary tiny" data-testid="harness-units">Units (4)</button>
{/snippet}

{#snippet notices()}
	<QuickPosts
		board={initialBoard}
		sectionId={SECTION.id}
		transports={quickTransports}
		{live}
		{composing}
		oncomposerclose={() => (composing = false)}
		sections={teacher ? SECTIONS : []}
		viewerEmail={ME}
		pollMs={Number.isFinite(pollParam) && pollParam > 0 ? pollParam : undefined}
		noticeJitterMs={0}
	/>
{/snippet}

{#snippet classTeams()}
	<ClassTeams sets={TEAMS} manage={null} {today} />
{/snippet}

<style>
	.harness-page {
		padding: 1.5rem var(--cr-gutter, 1rem) 6rem;
	}
	.harness-class {
		min-width: 0;
	}
	.harness-after {
		margin: 0;
		padding: var(--space-3) 0;
		border-top: 1px dashed var(--boundary);
		color: var(--text-2);
	}
	.harness-detail {
		padding: 1rem;
	}
	/* The section layout's own row rule, restated because it is scoped to that
	   file (tests/classroom-hall-pass-tool.test.ts pins the layout's copy); the
	   components inside it are the real ones. */
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
