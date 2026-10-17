<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import TodoPage from '$lib/classroom/TodoPage.svelte';
	import { isTodoView, type TodoView } from '$lib/classroom/todo';
	import { BASE, CHECK_INS, CLOCK, ITEMS, ME, SECTIONS, SUBMISSIONS } from '../fixture';
	import { createClassroomPreferences } from '$lib/preferences/classroom';
	import { provideClassroomPreferences } from '$lib/preferences/context';

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
	/* `?thumbs=1` (ledger 0396): two posts carry a thumbnail of their own, a
	   picture and a live HTML thumbnail from the /hx dev fixtures, in the
	   glyph's place. Without it the fixture is exactly as it was. */
	const thumbs = $derived(page.url.searchParams.get('thumbs') === '1');
	/* `&mine=off`: a person who chose Off in Display settings, through the real
	   classroom preference store the classroom layout provides. */
	if (page.url.searchParams.get('mine') === 'off') {
		const store = createClassroomPreferences({ viewer: null, account: null, storage: null });
		store.set('display', { ...store.current.display, thumbShape: 'off' });
		provideClassroomPreferences(store);
	}
	const thumbRow = (over: Record<string, unknown>) => ({
		source: 'image', manual: true, image_key: null, attachment_id: null, image_width: 800, image_height: 600,
		focal_x: 0.7, focal_y: 0.6, html_document_id: null, interactive: false, updated_at: '2026-08-10T09:00:00.000Z', ...over
	});
	const items = $derived(
		thumbs
			? ITEMS.map((i) =>
					i.id === 'i-truss'
						? { ...i, thumbnail: thumbRow({ image_key: 'i-truss/bench.png' }) }
						: i.id === 'i-loadlog'
							? { ...i, thumbnail: thumbRow({ source: 'html', manual: false, html_document_id: 'thumb-gear' }) }
							: i
				)
			: ITEMS
	) as typeof ITEMS;

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
	items={empty ? [] : items}
	submissions={empty ? [] : SUBMISSIONS}
	checkIns={empty ? [] : CHECK_INS}
	myEmail={ME}
	clock={CLOCK}
	basePath={BASE}
	{view}
	{classId}
	{onstatechange}
/>
