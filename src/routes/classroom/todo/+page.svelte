<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import TodoPage from '$lib/classroom/TodoPage.svelte';
	import { isTodoView, type TodoView } from '$lib/classroom/todo';
	import { classroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/*
	 * THE VIEW THE PAGE OPENS ON IS A DEFAULT CHOSEN IN SETTINGS (ledger 0297,
	 * LEARN), never the last view pressed: a view is a filter, and a filter
	 * remembered from a press is how a student's page reopens hiding work. The
	 * class filter is never remembered at all (see `TODO_OPENS_ON`).
	 */
	const prefStore = classroomPreferences();
	const prefs = prefStore ? reactivePreferences(prefStore) : null;
	const opensOn = $derived<TodoView>(prefs ? prefs.current.classView.todoOpensOn : 'assigned');

	/* The view and the class a door opened this page on (`?view=missing&class=<id>`);
	   anything else reads as the default. */
	const requested = $derived(page.url.searchParams.get('view'));
	const view = $derived<TodoView>(isTodoView(requested) ? requested : opensOn);
	const classId = $derived(page.url.searchParams.get('class'));

	/** A press on the page writes the address back without a navigation, so the load never re-runs for it. */
	function onstatechange(next: TodoView, nextClass: string | null) {
		const url = new URL(page.url);
		if (next === opensOn) url.searchParams.delete('view');
		else url.searchParams.set('view', next);
		if (nextClass) url.searchParams.set('class', nextClass);
		else url.searchParams.delete('class');
		replaceState(url, page.state);
	}
</script>

<TodoPage
	ready={data.todo.ready}
	sections={data.todo.sections}
	items={data.todo.items}
	submissions={data.todo.submissions}
	checkIns={data.todo.checkIns}
	myEmail={data.todoEmail}
	isAdmin={data.todoIsAdmin}
	clock={data.todo.clock}
	{view}
	{classId}
	{onstatechange}
/>
