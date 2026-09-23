<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import '$lib/notebook/notebook-theme.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import NotebookTimeline from '$lib/notebook/NotebookTimeline.svelte';
	import { buildTimeline, classDayStreak } from '$lib/notebook/timeline';
	import { sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
	import { activeTab, classNotebookHref, classroomCrumbs, classroomMeasure, locateClassroom, sectionTabs } from '$lib/classroom/nav';
	import type { NotebookEntry } from '$lib/notebook';

	/**
	 * ONE CLASS'S NOTEBOOK TIMELINE, AS A STUDENT OPENS IT (ledger 0297, package
	 * F4b): the real shell under the real route's measure and frame, the real
	 * NotebookTimeline, built by the real `buildTimeline` and `classDayStreak`
	 * over a fixture of entries, hand-ins and assignment photos.
	 * `?empty=1` shows a class with nothing in it yet.
	 */
	const BASE = '/dev/notebook-timeline';
	const TODAY = '2026-09-23';
	const empty = page.url.searchParams.get('empty') === '1';
	const SECTION = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 2',
		block: 'B',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
	} as ClassroomSection;

	function entry(id: string, at: string, over: Partial<NotebookEntry> = {}): NotebookEntry {
		return {
			id,
			session_id: null,
			section_id: 's-1',
			folder_id: null,
			pinned_at: null,
			custom_label: null,
			upload_timestamp: at,
			submitted_at: at,
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [],
			notes: [],
			...over
		};
	}
	const photo = (n: number) => ({ id: `ph-${n}`, drive_file_id: 'd', variant: 'original' as const, sequence_order: n, original_filename: `page${n}.jpg` });
	const entries: NotebookEntry[] = empty
		? []
		: [
				entry('e1', '2026-09-23T16:10:00Z', {
					session_id: 'ns-3',
					session: { session_label: 'Day 12 gearbox teardown', unit_number: 3, session_date: TODAY },
					photos: [photo(1), photo(2)]
				}),
				entry('e2', '2026-09-22T18:00:00Z', { custom_label: 'Gear ratio sketch', photos: [photo(1)] }),
				entry('e3', '2026-09-21T17:30:00Z', { custom_label: 'Why the first test failed', submitted_at: null })
			];
	const days = buildTimeline({
		entries,
		items: [
			{ id: 'i1', title: 'Gearbox teardown', kind: 'assignment' },
			{ id: 'i2', title: 'Bridge truss lab', kind: 'assignment' }
		],
		submissions: empty
			? []
			: [
					{ id: 'sub1', item_id: 'i1', state: 'submitted', submitted_at: '2026-09-23T19:00:00Z', returned_at: null },
					{ id: 'sub2', item_id: 'i2', state: 'returned', submitted_at: '2026-09-22T19:30:00Z', returned_at: '2026-09-23T15:00:00Z' }
				],
		files: empty
			? []
			: [
					{ id: 'f1', submission_id: 'sub1', block_id: 'z1', filename: 'stage1.jpg', created_at: '2026-09-23T18:40:00Z', image: true },
					{ id: 'f2', submission_id: 'sub1', block_id: 'z1', filename: 'stage2.jpg', created_at: '2026-09-23T18:45:00Z', image: true }
				]
	});
	const classDays = [
		{ session_id: 'ns-1', session_date: '2026-09-21' },
		{ session_id: 'ns-2', session_date: '2026-09-22' },
		{ session_id: 'ns-3', session_date: TODAY },
		{ session_id: 'ns-4', session_date: '2026-09-25' }
	];
	const streak = classDayStreak(entries, classDays, TODAY);

	const loc = locateClassroom('/classroom/s-1/notebook/timeline');
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(loc, { section: sectionTitle(SECTION) }, BASE);
	const tabs = sectionTabs('s-1', BASE);
</script>

<svelte:head><title>dev // notebook timeline</title></svelte:head>

<div
	class="cr-root"
	class:cr-app={measure === 'console'}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
>
	<ClassroomShell basePath={BASE} sections={[SECTION]} currentSectionId="s-1" {crumbs} {tabs} tab={activeTab(loc)} canManage={false}>
		<div class="nb-root cr-app-body nbt-page">
			<NotebookTimeline
				{days}
				today={TODAY}
				{streak}
				notebookHref={classNotebookHref('s-1', BASE)}
				itemHref={(id) => `${BASE}?item=${id}`}
			/>
		</div>
	</ClassroomShell>
</div>

<style>
	.nbt-page {
		overflow-y: auto;
	}
</style>
