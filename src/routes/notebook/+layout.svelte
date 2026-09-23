<script lang="ts">
	/**
	 * THE NOTEBOOK'S SHARE OF THE COMMAND PALETTE (ledger 0297), and nothing else.
	 *
	 * Ctrl+K (Cmd+K on a Mac) and `?` work on every notebook page the way they do
	 * in the classroom: the same `CommandPalette`, the same registry, the same
	 * shortcut legend -- which on the review console lists the console's own keys
	 * (`REVIEW_KEYS`, read from the array the console dispatches from). This
	 * layout adds no markup of its own: the palette renders nothing until it is
	 * opened, and every page below keeps its own frame and masthead exactly as
	 * before.
	 *
	 * The student's notebook offers its entries by name; opening one runs the
	 * notebook's own `selectEntry` through the handler `NotebookView` registers,
	 * so an entry is listed only where something on the page can open it.
	 */
	import { page } from '$app/state';
	import CommandPalette from '$lib/shell/CommandPalette.svelte';
	import { surfaceFor } from '$lib/shell/commands';
	import type { PaletteNotebookEntry, PaletteSources } from '$lib/shell/palette';
	import { entryTitle, statusLabel, type NotebookEntry } from '$lib/notebook';
	import { createClassroomPreferences } from '$lib/preferences/classroom';

	let { children }: { children: import('svelte').Snippet } = $props();

	/* Recent picks follow this device, the classroom's own slot for this viewer;
	   nothing here writes the profile row. */
	const preferences = createClassroomPreferences({
		viewer: (page.data.claims?.sub as string | undefined) ?? null,
		account: null
	});

	const surface = $derived(surfaceFor(page.url.pathname));
	const entries = $derived((page.data.entries as NotebookEntry[] | undefined) ?? []);
	const notebookEntries = $derived<PaletteNotebookEntry[]>(
		entries.map((e) => ({
			id: e.id,
			title: entryTitle(e),
			detail: e.submitted_at ? statusLabel(e.status) : 'Draft'
		}))
	);
	const sources = $derived<PaletteSources>({
		section: null,
		items: [],
		units: [],
		sections: [],
		checkIns: [],
		notebookEntries
	});
	const env = $derived({
		// The review console and a student's notebook opened from it are staff
		// screens; the notebook itself is the student's own.
		role: page.url.pathname.startsWith('/notebook/review') ? ('manager' as const) : ('student' as const),
		surface,
		sectionId: null,
		itemId: null,
		basePath: '/classroom',
		isStaff: page.data.canReview === true || page.data.isInstructor === true,
		isAdmin: page.data.isAdmin === true
	});
</script>

<CommandPalette {sources} {env} {preferences} />

{@render children()}
