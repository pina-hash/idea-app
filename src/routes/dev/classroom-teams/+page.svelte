<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import ClassTeams from '$lib/classroom/ClassTeams.svelte';
	import { postedTeamSets, teamsManageLink } from '$lib/classroom/class-teams';
	import { teamWindowEnd, teamWindowState, type Team, type TeamSet } from '$lib/classroom/teams';
	import { laCalendarDay } from '$lib/classroom/school-calendar';
	import { classroomMeasure, locateClassroom } from '$lib/classroom/nav';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
	import type { HallPassState } from '$lib/classroom/hall-pass';

	/*
	 * POSTED TEAMS ON THE CLASS PAGE, AS THE SECTION LAYOUT MOUNTS THEM
	 * (ledger 0298, R23). The board below is shaped as `classroom_team_board`
	 * answers THIS viewer: a teacher gets every saved draw with `showing`
	 * computed, a student gets only the draws that are showing (0223's
	 * audience gate). `showing` is `teamWindowState` here, the client twin of
	 * `_classroom_team_set_visible`, because there is no database; the
	 * database half is tests/classroom-class-teams.test.ts, on real Postgres.
	 * Everything after the board is the shipping code: `postedTeamSets`, the
	 * `{#if teams.length}` gate, and ClassTeams with the layout's three props.
	 *
	 * The members carry ADDRESSES, as the real board does, so a render that let
	 * one through would show it: the projection is what removes them.
	 */
	const params = page.url.searchParams;
	const teacher = params.get('role') === 'teacher';
	const windowMode = params.get('window') ?? 'open';
	const mineOff = params.get('mine') === '0';
	const twoSets = params.get('sets') === '2';
	const noTeams = params.get('teams') === 'none';
	const themeParam = params.get('theme');

	/* FORCED THEME ATTRIBUTE, the classroom-live harness's way. A harness holds
	   no session, so ThemeRoot's own decision is always "none" here; the class
	   page is in the Space White scope, so `?theme=space-white` writes the
	   attribute and re-writes it once after ThemeRoot's first effect. */
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

	const now = Date.now();
	const today = laCalendarDay(new Date(now));
	const iso = (ms: number) => new Date(ms).toISOString();
	const HOUR = 3_600_000;
	const DAY = 24 * HOUR;

	const SECTION: ClassroomSection = {
		id: 's-teams',
		course_id: 'c-1',
		label: 'Period 3',
		block: '3',
		teacher_email: 'pina@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering Design Honors', active: true }
	};
	const BASE = '/dev/classroom-teams';
	const measure = classroomMeasure(locateClassroom(`/classroom/${SECTION.id}`));

	const person = (name: string) => ({
		student_email: `${name.split(' ')[0].toLowerCase()}@boscotech.net`,
		display_name: name,
		still_enrolled: true
	});
	const team = (id: string, n: number, names: string[], over: Partial<Team> = {}): Team => ({
		id,
		team_number: n,
		name: null,
		accent_color: null,
		background_type: null,
		background_value: null,
		badge: null,
		flourish: null,
		tagline: null,
		style_updated_by: null,
		style_updated_at: null,
		mine: false,
		members: names.map(person),
		...over
	});

	/** The posting window each `?window=` names, as 0223 would have stored it. */
	function windowOf(mode: string): Pick<TeamSet, 'posted_at' | 'visible_until'> {
		if (mode === 'closed') return { posted_at: iso(now - 3 * DAY), visible_until: iso(now - DAY) };
		if (mode === 'forever') return { posted_at: iso(now - HOUR), visible_until: null };
		// "today", through the People tab's own option: the end of today in Los Angeles.
		return { posted_at: iso(now - HOUR), visible_until: teamWindowEnd(now, 1) };
	}

	const iAmOnTeamOne = !teacher && !mineOff;
	const SAVED: TeamSet[] = noTeams
		? []
		: [
				{
					id: 'set-1',
					label: 'Lab pairs',
					seed: '4242',
					mode: 'count',
					mode_value: 4,
					created_at: iso(now - 4 * DAY),
					...windowOf(windowMode),
					showing: false,
					teams: [
						team('t-1', 1, ['Ana Reyes', 'Ben Okafor', 'Cruz Delgado'], {
							name: 'Torque Squad',
							accent_color: '#3fb0a0',
							background_type: 'gradient',
							background_value: ['#12352f', '#1d5a4f'],
							tagline: 'Measure twice',
							mine: iAmOnTeamOne
						}),
						team('t-2', 2, ['Dee Marsh', 'Eli Nakamura', 'Fay Obi']),
						team('t-3', 3, ['Gus Varga', 'Hana Ito', 'Ivan Petrov'], { accent_color: '#d08030' }),
						team('t-4', 4, ['Jo Lindqvist', 'Kim Soto', 'Lee Amari'])
					]
				},
				...(twoSets
					? [
							{
								id: 'set-2',
								label: 'Bridge build crews',
								seed: '777',
								mode: 'size' as const,
								mode_value: 6,
								created_at: iso(now - 2 * DAY),
								posted_at: iso(now - 2 * HOUR),
								visible_until: teamWindowEnd(now, 5),
								showing: false,
								teams: [
									team('t-5', 1, ['Ana Reyes', 'Dee Marsh', 'Gus Varga', 'Jo Lindqvist', 'Ben Okafor', 'Eli Nakamura'], {
										mine: iAmOnTeamOne
									}),
									team('t-6', 2, ['Hana Ito', 'Kim Soto', 'Cruz Delgado', 'Fay Obi', 'Ivan Petrov', 'Lee Amari'])
								]
							}
						]
					: [])
			];

	// What `classroom_team_board` answers: a manager every saved draw, a student
	// only the showing ones; `showing` stamped on each at call time.
	const board = SAVED.map((s) => ({ ...s, showing: teamWindowState(s, now) === 'showing' })).filter(
		(s) => teacher || s.showing
	);
	const teams = postedTeamSets(board);

	const hallPass: HallPassState = teacher
		? { scope: 'manager', section_id: SECTION.id, taken: false, mine: false, open: null, history: [] }
		: { scope: 'student', section_id: SECTION.id, taken: false, mine: false, opened_at: null };

	const at = (n: number) => iso(Date.UTC(2026, 8, 21) + n * DAY);
	const item = (id: string, kind: ClassroomItem['kind'], title: string, n: number): ClassroomItem => ({
		id,
		kind,
		title,
		body: '',
		body_doc: null,
		points: kind === 'assignment' ? 20 : null,
		due_at: kind === 'assignment' ? at(n + 1) : null,
		category: null,
		author_email: 'pina@boscotech.edu',
		author_name: 'Mr. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: n,
		first_published_at: at(n),
		edited_at: null,
		created_at: at(n),
		updated_at: at(n),
		links: [],
		attachments: [],
		postings: [{ section_id: SECTION.id }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: []
	});
	const ITEMS: ClassroomItem[] = [
		item('i-1', 'assignment', 'Truss sketch', 0),
		item('i-2', 'material', 'Slides: levers and linkages', 1),
		item('i-3', 'assignment', 'Bridge load test', 2),
		item('i-4', 'post', 'Bring safety glasses on Monday', 3)
	];
</script>

<svelte:head><title>dev / classroom posted teams</title></svelte:head>

<div
	class="cr-root harness-page"
	data-testid="class-teams-harness"
	data-teams={teams.length}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
>
	<ClassSplit hasDetail={false} nav={classList}>{@render nothing()}</ClassSplit>
</div>

{#snippet nothing()}{/snippet}

{#snippet classList()}
	<div class="class-tools" data-testid="class-tools">
		<HallPass sectionId={SECTION.id} state={hallPass} transports={null} {now} tool />
	</div>
	{#if teams?.length}
		<ClassTeams sets={teams} manage={teacher ? teamsManageLink(SECTION.id) : null} {today} />
	{/if}
	<ClassView section={SECTION} items={ITEMS} canManage={teacher} basePath={BASE} />
{/snippet}

<style>
	.harness-page {
		padding: 1.5rem var(--cr-gutter, 1rem) 6rem;
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
