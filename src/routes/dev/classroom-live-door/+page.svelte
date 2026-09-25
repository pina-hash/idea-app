<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import SongQueue from '$lib/classroom/SongQueue.svelte';
	import ClassTeams from '$lib/classroom/ClassTeams.svelte';
	import LiveDoor from '$lib/classroom/live-class/LiveDoor.svelte';
	import { liveItemChoices } from '$lib/classroom/live-class/grid';
	import type { ClassTeamSet } from '$lib/classroom/class-teams';
	import type { SongQueueManagerState } from '$lib/classroom/song-queue';
	import { PRESENCE_LIMITS_FALLBACK, type PresencePayload } from '$lib/classroom/presence/state';
	import { SECTION, hallPass, items, presence, today } from '../classroom-live/fixture';

	/*
	 * THE CLASS PAGE'S NEW PIECES, as src/routes/classroom/[sectionId]/+layout.svelte
	 * mounts them: the door is chosen by `liveItemChoices` exactly as the layout
	 * chooses it (the first item that sends presence), and the teams are the
	 * projection `postedTeamSets` hands the page -- names and styles, no address.
	 */
	const params = page.url.searchParams;
	const student = params.get('role') === 'student';
	const noTeams = params.get('teams') === 'none';

	/*
	 * THE DOOR'S WORST CASES (ledger 0298, R21). The door wrapped its count onto
	 * two lines ("0" over "on") in a three-tool row at 871px, so these put it
	 * back in exactly that row and push on it:
	 *   ?count=<n>    the presence read answers n students on the page (0 is a
	 *                 real answer and renders; absent keeps the shared fixture)
	 *   ?title=long   an assignment title longer than any row can hold
	 *   ?music=1      the song queue's tool between the pass and the door, the
	 *                 order the real layout mounts all three in
	 *   ?pane=<rem>   the row capped at a class-list pane's width (the list is
	 *                 26rem by default beside an open item), the narrowest row
	 *                 the door is handed
	 *   ?theme=space-white   the same row on the light theme
	 */
	const themeParam = params.get('theme');

	/* ?theme=space-white: FORCED, the way /dev/classroom-live forces it. A
	   harness holds no session, so ThemeRoot's own decision is always "none"
	   here; the attribute is written, and re-written once after ThemeRoot's
	   first effect. */
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

	const countParam = params.get('count');
	const forcedCount = countParam !== null && /^\d{1,3}$/.test(countParam) ? Number(countParam) : null;
	const longTitle = params.get('title') === 'long';
	const withMusic = params.get('music') === '1' && !student;
	const paneParam = params.get('pane');
	const paneRem = paneParam !== null && /^\d{2}$/.test(paneParam) ? Number(paneParam) : null;
	const LONG_TITLE =
		'Cantilever bridge design review: load paths, deflection estimates and the member sizing worksheet';

	const now = Date.now();
	const chosen = liveItemChoices(items(now), now, today(now)).find((c) => c.signal) ?? null;
	const choice = chosen && longTitle ? { ...chosen, title: LONG_TITLE } : chosen;

	/** n students on the page seconds ago and typing seconds ago: every one of them counts. */
	function presenceOf(itemId: string, n: number): PresencePayload {
		const at = Date.now();
		const ago = (s: number) => new Date(at - s * 1000).toISOString();
		return {
			item_id: itemId,
			section_id: SECTION.id,
			at: new Date(at).toISOString(),
			limits: PRESENCE_LIMITS_FALLBACK,
			students: Array.from({ length: n }, (_, i) => ({
				student_email: `student${i + 1}@boscotech.net`,
				state: null,
				last_seen_at: ago(4),
				last_input_at: ago(6),
				page_visible: true,
				active_seconds: 600,
				first_seen_at: ago(1800)
			}))
		};
	}
	const presenceTransports = {
		loadPresence: async (itemId: string) =>
			forcedCount === null ? presence(itemId) : presenceOf(itemId, forcedCount)
	};

	/** An empty queue: the instructor's chip reads "Queue empty", the idle state. */
	const songQueue: SongQueueManagerState = {
		scope: 'manager',
		section_id: SECTION.id,
		price: 2,
		pending_cap: 3,
		pending: [],
		decided: []
	};

	const team = (
		id: string,
		n: number,
		members: string[],
		style: Partial<ClassTeamSet['teams'][number]> = {}
	): ClassTeamSet['teams'][number] => ({
		id,
		team_number: n,
		name: null,
		accent_color: null,
		background_type: null,
		background_value: null,
		badge: null,
		flourish: null,
		tagline: null,
		mine: false,
		members,
		...style
	});
	const SETS: ClassTeamSet[] = [
		{
			id: 'set-1',
			label: 'Lab pairs',
			teams: [
				team('t-1', 1, ['Ana Reyes', 'Ben Okafor', 'Cruz Delgado'], {
					name: 'Torque Squad',
					accent_color: '#3fb0a0',
					background_type: 'gradient',
					background_value: ['#12352f', '#1d5a4f'],
					tagline: 'Measure twice',
					mine: student
				}),
				team('t-2', 2, ['Dee Marsh', 'Eli Nakamura', 'Fay Obi']),
				team('t-3', 3, ['Gus Varga', 'Hana Ito', 'Ivan Petrov'], { accent_color: '#d08030' }),
				team('t-4', 4, ['Jo Lindqvist', 'Kim Soto', 'Lee Amari'])
			]
		}
	];
</script>

<svelte:head><title>dev / classroom live door and teams</title></svelte:head>

<main class="cr-root harness-page" data-testid="live-door-harness">
	<div class="classroom-page">
		<div class="class-tools" data-testid="class-tools" style={paneRem ? `max-width: ${paneRem}rem` : undefined}>
			<!-- A student is handed the student projection, exactly as the real layout
			     hands it: taken or free, never who. -->
			<HallPass
				sectionId={SECTION.id}
				state={student
					? { scope: 'student', section_id: SECTION.id, taken: true, mine: false, opened_at: null }
					: hallPass(now)}
				transports={null}
				{now}
				tool
			/>
			{#if withMusic}
				<SongQueue sectionId={SECTION.id} state={songQueue} transports={null} {now} tool />
			{/if}
			{#if !student}
				<LiveDoor href="/dev/classroom-live" sectionId={SECTION.id} {choice} presence={presenceTransports} />
			{/if}
		</div>
		{#if !noTeams}
			<ClassTeams sets={SETS} />
		{/if}
	</div>
</main>

<style>
	/* The section layout's own row rule, restated because it is scoped to that
	   file; the components inside are the real ones. */
	.harness-page {
		max-width: none;
		padding: 1.5rem var(--cr-gutter, 1rem) 6rem;
	}
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
