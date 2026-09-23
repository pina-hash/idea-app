<script lang="ts">
	import { page } from '$app/state';
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import { buildTodo, todoSections, todoSummaries } from '$lib/classroom/todo';
	import { BASE, CHECK_INS, CLOCK, ITEMS, ME, SECTIONS, SUBMISSIONS } from './fixture';

	/*
	 * MY CLASSES WITH EACH CLASS'S COUNTS, computed exactly as
	 * src/routes/classroom/+page.server.ts computes them: the rows `buildTodo`
	 * lists, summarized per class by `todoSummaries`. `?staff=1` is the teacher
	 * case, which takes no such read and gets no counts and no door.
	 */
	const staff = $derived(page.url.searchParams.get('staff') === '1');
	const rows = buildTodo({
		sections: SECTIONS,
		items: ITEMS,
		submissions: SUBMISSIONS,
		checkIns: CHECK_INS,
		myEmail: ME,
		isAdmin: false,
		clock: CLOCK,
		basePath: BASE
	});
	const todo = todoSummaries(rows, todoSections(SECTIONS, ME, false), CLOCK.today);
</script>

<MyClasses ready={true} isStaff={staff} sections={SECTIONS} todo={staff ? null : todo} todoHref={`${BASE}/todo`} />
