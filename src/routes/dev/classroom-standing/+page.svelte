<script lang="ts">
	import '$lib/classroom/classroom.css';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
	import { studentWorkMap } from '$lib/classroom/classroom';
	import { buildFeed, type FeedSubmission } from '$lib/classroom/feed';
	import { buildTodo, todoSections, todoSummaries } from '$lib/classroom/todo';
	import { readWorksheetCompletions, withWorksheetCompletions } from '$lib/classroom/student-work';
	import { classroomMeasure, locateClassroom } from '$lib/classroom/nav';
	import { BASE, CHECK_INS, CLOCK, ITEMS, ME, SECTION, SUBMISSIONS, TEACHER, memoryClient } from './fixture';

	/*
	 * WHAT A STUDENT OWES, ON THREE REAL SURFACES OVER ONE FIXTURE (ledger 0298):
	 * the class page (ClassView, as the student), My Classes (the to-do's own
	 * counts, which the home page's To-do door prints too), and the home feed
	 * card as the class's teacher (the to-grade tally). Every number on screen
	 * comes from the shipping functions -- the completeness read, the rows it
	 * adds, the work map, `buildTodo`, `buildFeed` -- and none is typed here.
	 *
	 * THE READ IS THE ONE THE PAGES MAKE: pinned to the student (`onlyEmail`),
	 * as `loadClassroomWork` and the class layout pin it. And the teacher's card
	 * is handed the submission rows alone, because that is what the home page
	 * hands a teacher: it reads no student's answers (an unpinned read is
	 * measured in `student-work.ts`), so a finished worksheet is counted in the
	 * grading console's roster and not in this tally.
	 */
	const measure = classroomMeasure(locateClassroom(`/classroom/${SECTION.id}`));

	let completions = $state<Map<string, string> | null | undefined>(undefined);
	readWorksheetCompletions(
		memoryClient() as unknown as SupabaseClient,
		ITEMS.map((i) => i.id),
		{ onlyEmail: ME }
	).then((map) => {
		completions = map;
	});

	const blank = (item_id: string, student_email: string): FeedSubmission => ({
		item_id,
		student_email,
		state: 'draft',
		submitted_at: null,
		returned_at: null,
		graded_at: null
	});
	const submissions = $derived(withWorksheetCompletions(SUBMISSIONS, completions ?? null, blank));
	const work = $derived(
		studentWorkMap(
			submissions
				.filter((s) => s.student_email === ME)
				.map((s) => ({ item_id: s.item_id, state: s.state, score: null, completed_at: s.completed_at }))
		)
	);
	const todo = $derived(
		todoSummaries(
			buildTodo({
				sections: [SECTION],
				items: ITEMS,
				submissions,
				checkIns: CHECK_INS,
				myEmail: ME,
				isAdmin: false,
				clock: CLOCK,
				basePath: BASE
			}),
			todoSections([SECTION], ME, false),
			CLOCK.today
		)
	);
	const teacherFeeds = $derived(
		buildFeed({ sections: [SECTION], items: ITEMS, submissions: SUBMISSIONS, myEmail: TEACHER, now: new Date(CLOCK.now) })
	);
</script>

<svelte:head>
	<title>Classroom standing // dev harness</title>
</svelte:head>

{#if completions === undefined}
	<p>Reading the worksheets…</p>
{:else}
	<div class="harness standing-harness" data-testid="standing-ready" data-completions={completions?.size ?? 'none'}>
		<section class="cr-root" aria-label="The class page, as the student" data-testid="standing-student"
			style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}>
			<ClassView
				section={SECTION}
				items={ITEMS}
				canManage={false}
				checkIns={CHECK_INS}
				{work}
				clock={CLOCK}
				basePath={BASE}
			/>
		</section>
		<section class="cr-root" aria-label="My Classes, with the to-do's counts" data-testid="standing-my-classes">
			<MyClasses ready={true} isStaff={false} sections={[SECTION]} {todo} todoHref={`${BASE}/todo`} />
		</section>
		<section aria-label="The home feed, as the teacher" data-testid="standing-teacher">
			<h2>The home feed, as the class's teacher</h2>
			<ClassroomFeed feeds={teacherFeeds} now={new Date(CLOCK.now)} basePath={BASE} />
		</section>
	</div>
{/if}

<style>
	.standing-harness {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		padding: 1rem;
	}
</style>
