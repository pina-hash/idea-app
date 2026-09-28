<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import { classroomCrumbs, classroomMeasure, classroomPathname, locateClassroom } from '$lib/classroom/nav';
	import { createClassroomPreferences } from '$lib/preferences/classroom';
	import type { PaletteSources } from '$lib/shell/palette';
	import { BASE, harnessSections } from './fixture';

	let { children }: { children: import('svelte').Snippet } = $props();

	/* THE OUTER CLASSROOM LAYOUT'S HALF (src/routes/classroom/+layout.svelte):
	   where the page is, how wide it is, the trail, and the same header tools. */
	const loc = $derived(locateClassroom(classroomPathname(page.url.pathname, BASE)));
	const measure = $derived(classroomMeasure(loc));
	const crumbs = $derived(classroomCrumbs(loc, {}, BASE));
	const preferences = createClassroomPreferences({ viewer: 'harness-todo', account: null });
	/* `?archived=1` adds last year's classes (report R12), and `?current=<id>`
	   stands the strip on one class, so the Archived key and a current class
	   that is itself archived can both be measured. */
	const sections = $derived(harnessSections(page.url));
	const currentId = $derived(page.url.searchParams.get('current'));
	const palette = $derived<PaletteSources>({ section: null, items: [], units: [], sections, checkIns: [] });
	/* `?staff=1` is the teacher's case, and the real layout hands a teacher no
	   To-do door (`navIsStaff`), so neither does this one. */
	const staff = $derived(page.url.searchParams.get('staff') === '1');
</script>

<div
	class="cr-root {CLASSROOM_PLATE}"
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	data-testid="todo-harness"
>
	<ClassroomShell
		basePath={BASE}
		{sections}
		currentSectionId={currentId}
		{crumbs}
		tabs={[]}
		tab={null}
		{palette}
		{preferences}
		todoHref={staff ? null : `${BASE}/todo`}
	>
		{@render children()}
	</ClassroomShell>
</div>
