<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import { itemTitle, sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		locateClassroom,
		sectionTabs
	} from '$lib/classroom/nav';

	/**
	 * The classroom's own room.
	 *
	 * THREE JOBS, all of which have to happen exactly once. It loads the shared
	 * surface layer (see classroom.css), provides the `.cr-root` wrapper every
	 * rule in that file is scoped under -- which is also what the `.bg-fx`
	 * suppression keys off -- and renders the PERSISTENT SHELL: the masthead, the
	 * section switcher, the breadcrumb trail and the section tabs, so every page
	 * below /classroom sits inside one structure instead of each owning its own
	 * header and its own way back.
	 *
	 * The routing knowledge lives HERE and in $lib/classroom/nav, not in the
	 * shell: the shell takes finished props, so /dev/classroom can mount it with
	 * no router at all.
	 *
	 * `page.data` is the merge of this layout's data and the current page's, so
	 * the section and item labels come from whichever page is showing without any
	 * page having to push them up.
	 *
	 * /reference has a layout of its own doing the same thing -- it is a separate
	 * route tree serving the same documents to people with no account.
	 */
	let { data, children } = $props();

	const loc = $derived(locateClassroom(page.url.pathname));
	const section = $derived((page.data.section as ClassroomSection | undefined) ?? null);
	const item = $derived(page.data.item as { title?: string | null } | undefined);

	const crumbs = $derived(
		classroomCrumbs(loc, {
			section: section ? sectionTitle(section) : null,
			// The item page's own title rule, so a titleless announcement reads the
			// same in the trail as it does on the page.
			item: item ? itemTitle(item as never) : null
		})
	);

	const tabs = $derived(loc.sectionId ? sectionTabs(loc.sectionId) : []);
	const tab = $derived(activeTab(loc));

	/**
	 * The way up out of view-as, which depends on how deep in it you are: the
	 * picker's own way up is the classroom, and everything below it goes back to
	 * the picker. (Leaving impersonation entirely is the banner's job.)
	 */
	const atPicker = $derived(page.url.pathname.replace(/\/+$/, '') === '/classroom/view-as');

	/**
	 * HOW WIDE THIS ROUTE IS, set once here so the shell's breadcrumbs and tabs
	 * and the content beneath them read the SAME number. They used to be decided
	 * in two places -- 60rem hardcoded in the shell, a different literal in each
	 * page component -- so they only agreed on the pages that happened to be
	 * 60rem. Null (view-as, an unrecognized path) sets nothing at all and every
	 * component falls back to its own measure, which is what it had before.
	 */
	const measure = $derived(classroomMeasure(loc));

	/**
	 * A CONSOLE IS THE VIEWPORT, and this is the only place that can say so.
	 *
	 * `.cr-app` (in $lib/shell/split.css) is the shell's application frame:
	 * above 1024px the room is `100dvh` and does not scroll, the chrome above --
	 * masthead, trail, tabs -- measures itself, and the page's own `.cr-app-body`
	 * takes whatever is left. It has to go on THIS element because the chrome and
	 * the page are siblings here; a component can only ever claim the second half
	 * of that contract.
	 *
	 * Read off the same `classroomMeasure` answer as the width, rather than from
	 * a second list of routes: a route is a full-height application exactly when
	 * it asked for the console measure.
	 */
	const isConsole = $derived(measure === 'console');
</script>

<div
	class="cr-root"
	class:cr-app={isConsole}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
>
	<ClassroomShell
		sections={data.navSections ?? []}
		currentSectionId={loc.sectionId}
		{crumbs}
		{tabs}
		{tab}
		canManage={page.data.canManage === true}
		isStaff={data.navIsStaff === true}
		isAdmin={data.navIsAdmin === true}
		minimal={loc.place === 'view-as'}
		backHref={atPicker ? '/classroom' : '/classroom/view-as'}
		backLabel={atPicker ? 'Classroom' : 'Pick a student'}
	>
		{@render children()}
	</ClassroomShell>
</div>
