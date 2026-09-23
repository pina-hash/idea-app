<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import TodoPage from '$lib/classroom/TodoPage.svelte';
	import { isTodoView, type TodoView } from '$lib/classroom/todo';
	import { BASE, CHECK_INS, CLOCK, ITEMS, ME, SECTIONS, SUBMISSIONS } from '../fixture';

	/*
	 * THE REAL TO-DO PAGE over the fixture, wired the way
	 * src/routes/classroom/todo/+page.svelte wires it: the view and the class
	 * come from the address, and a press writes them back without a navigation.
	 * `?empty=1` hands over no work at all, for the empty states.
	 */
	const empty = $derived(page.url.searchParams.get('empty') === '1');
	const requested = $derived(page.url.searchParams.get('view'));
	const view = $derived<TodoView>(isTodoView(requested) ? requested : 'assigned');
	const classId = $derived(page.url.searchParams.get('class'));

	function onstatechange(next: TodoView, nextClass: string | null) {
		const url = new URL(page.url);
		if (next === 'assigned') url.searchParams.delete('view');
		else url.searchParams.set('view', next);
		if (nextClass) url.searchParams.set('class', nextClass);
		else url.searchParams.delete('class');
		replaceState(url, page.state);
	}
</script>

<TodoPage
	sections={SECTIONS}
	items={empty ? [] : ITEMS}
	submissions={empty ? [] : SUBMISSIONS}
	checkIns={empty ? [] : CHECK_INS}
	myEmail={ME}
	clock={CLOCK}
	basePath={BASE}
	{view}
	{classId}
	{onstatechange}
/>
