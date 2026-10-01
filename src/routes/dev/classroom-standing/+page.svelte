<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import '$lib/classroom/classroom.css';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { page } from '$app/state';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
	import { studentWorkMap } from '$lib/classroom/classroom';
	import { buildFeed, type FeedSubmission } from '$lib/classroom/feed';
	import { buildTodo, todoSections, todoSummaries } from '$lib/classroom/todo';
	import { readWorksheetCompletions, withWorksheetCompletions } from '$lib/classroom/student-work';
	import { classroomMeasure, locateClassroom } from '$lib/classroom/nav';
	import { overlayWork } from '$lib/classroom/live-work';
	import { LiveWork } from '$lib/classroom/live-work.svelte';
	import {
		BASE,
		CHECK_INS,
		CLOCK,
		ITEMS,
		ITEMS_0360,
		LIVE_FINISHED_AT,
		ME,
		SECTION,
		SUBMISSIONS,
		TABLES,
		TABLES_0360,
		TEACHER,
		memoryClient
	} from './fixture';

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
	 *
	 * `?state=optional` (and `optional-before`) SWAPS IN LEDGER 0360'S FOUR WORKSHEETS (see `fixture.ts`): an
	 * optional photo slot left empty, a checkbox stored as a string, the control
	 * with a required photo missing, and one the "Finished in this tab" toggle
	 * overlays through the REAL `LiveWork` and `overlayWork` -- the class
	 * layout's own mechanism -- with the client's read count printed beside it,
	 * so a spec can assert the row moved with no read.
	 */
	const measure = classroomMeasure(locateClassroom(`/classroom/${SECTION.id}`));
	const case0360 = (page.url.searchParams.get('state') ?? '').startsWith('optional');
	const items = case0360 ? ITEMS_0360 : ITEMS;
	const checkIns = case0360 ? [] : CHECK_INS;
	/** A PLAIN counter, read by the spec off `window.__standing`: every read the
	    fake client is asked for, from load to the last toggle. */
	const reads = { reads: 0 };
	if (typeof window !== 'undefined') (window as unknown as { __standing: unknown }).__standing = reads;

	let completions = $state<Map<string, string> | null | undefined>(undefined);
	readWorksheetCompletions(
		memoryClient(case0360 ? TABLES_0360 : TABLES, reads) as unknown as SupabaseClient,
		items.map((i) => i.id),
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
	const serverWork = $derived(
		studentWorkMap(
			submissions
				.filter((s) => s.student_email === ME)
				.map((s) => ({ item_id: s.item_id, state: s.state, score: null, completed_at: s.completed_at }))
		)
	);
	/** The class layout's own overlay, driven by the toggle instead of a rail. */
	const live = new LiveWork();
	let finishedHere = $state(false);
	function toggleFinished() {
		finishedHere = !finishedHere;
		if (finishedHere) live.set('ws-live', LIVE_FINISHED_AT);
		else live.clear();
	}
	const work = $derived(overlayWork(serverWork, live.overrides));
	const todo = $derived(
		todoSummaries(
			buildTodo({
				sections: [SECTION],
				items,
				submissions,
				checkIns,
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
		buildFeed({ sections: [SECTION], items, submissions: SUBMISSIONS, myEmail: TEACHER, now: new Date(CLOCK.now) })
	);
</script>

<svelte:head>
	<title>Classroom standing // dev harness</title>
</svelte:head>

{#if completions === undefined}
	<p>Reading the worksheets…</p>
{:else}
	<div class="harness standing-harness" data-testid="standing-ready" data-completions={completions?.size ?? 'none'}>
		{#if case0360}
			<div class="cr-root {CLASSROOM_PLATE} standing-drive">
				<button
					type="button"
					class="btn"
					data-testid="standing-finished-here"
					aria-pressed={finishedHere}
					onclick={toggleFinished}
				>
					Finished in this tab
				</button>
				<span class="note">The row below moves with no read; the spec counts them.</span>
			</div>
		{/if}
		<section class="cr-root {CLASSROOM_PLATE}" aria-label="The class page, as the student" data-testid="standing-student"
			style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}>
			<ClassView
				section={SECTION}
				{items}
				canManage={false}
				{checkIns}
				{work}
				clock={CLOCK}
				basePath={BASE}
			/>
		</section>
		<section class="cr-root {CLASSROOM_PLATE}" aria-label="My Classes, with the to-do's counts" data-testid="standing-my-classes">
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
	.standing-drive {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.standing-drive .btn {
		min-height: 44px;
		min-width: 44px;
	}
</style>
