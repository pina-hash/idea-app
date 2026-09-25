<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import ClassTeams from '$lib/classroom/ClassTeams.svelte';
	import LiveDoor from '$lib/classroom/live-class/LiveDoor.svelte';
	import { liveItemChoices } from '$lib/classroom/live-class/grid';
	import type { ClassTeamSet } from '$lib/classroom/class-teams';
	import { SECTION, hallPass, items, presence, today } from '../classroom-live/fixture';

	/*
	 * THE CLASS PAGE'S NEW PIECES, as src/routes/classroom/[sectionId]/+layout.svelte
	 * mounts them: the door is chosen by `liveItemChoices` exactly as the layout
	 * chooses it (the first item that sends presence), and the teams are the
	 * projection `postedTeamSets` hands the page -- names and styles, no address.
	 */
	const student = page.url.searchParams.get('role') === 'student';
	const noTeams = page.url.searchParams.get('teams') === 'none';
	const now = Date.now();
	const choice = liveItemChoices(items(now), now, today(now)).find((c) => c.signal) ?? null;
	const presenceTransports = { loadPresence: async (itemId: string) => presence(itemId) };

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
			posted_at: new Date(now - 3_600_000).toISOString(),
			visible_until: null,
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
		<div class="class-tools" data-testid="class-tools">
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
