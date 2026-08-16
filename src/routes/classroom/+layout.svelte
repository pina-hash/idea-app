<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import { itemTitle, sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
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
</script>

<div class="cr-root">
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
