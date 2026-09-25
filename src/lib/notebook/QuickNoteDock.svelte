<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { getContext } from 'svelte';
	import QuickNote from '$lib/notebook/QuickNote.svelte';
	import { quickNoteFiling, quickNoteOffered } from '$lib/notebook/quick-note';
	import {
		quickNoteHidden,
		quickNoteProfileIo,
		setQuickNoteHidden
	} from '$lib/notebook/quick-note-state.svelte';
	import {
		QUICK_NOTE_HARNESS,
		createQuickNoteTransports,
		type QuickNoteHarness,
		type QuickNoteTransports
	} from '$lib/notebook/quick-note-transports';
	import { registerCommandHandler } from '$lib/shell/command-handlers';
	import { notebookHomeHref } from '$lib/classroom/nav';
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * WHERE THE QUICK NOTE IS MOUNTED, AND WHETHER (ledger 0298, R33).
	 *
	 * Two headers render this -- the classroom shell's (every classroom and
	 * notebook page) and the portal home's -- and this is the one place that
	 * decides whether the control is there: a signed-in viewer, on a route
	 * `quickNoteOffered` names (never a projected one), who has not hidden it.
	 * Everywhere else it is ABSENT, not disabled: no header control, no palette
	 * command, nothing to press that would do nothing.
	 *
	 * The mount site hands in only what its header already knows -- the class in
	 * the URL, its name, the assignment title -- and `quickNoteFiling` decides
	 * where a note from here is filed. A `/dev` harness supplies a viewer and
	 * in-memory transports through context (`QUICK_NOTE_HARNESS`); production
	 * builds the real ones from the session the root layout already loaded.
	 */
	let {
		sectionId = null,
		sectionLabel = null,
		itemTitle = null,
		triggerClass = '',
		place = 'classroom',
		anchorFallback = null,
		available = $bindable(false)
	}: {
		sectionId?: string | null;
		sectionLabel?: string | null;
		itemTitle?: string | null;
		triggerClass?: string;
		place?: 'classroom' | 'home';
		/** See QuickNote: what the panel hangs from while the trigger is folded away. */
		anchorFallback?: (() => HTMLElement | null | undefined) | null;
		/**
		 * WHETHER THE CONTROL IS HERE AT ALL, told back to the mount. The
		 * classroom header folds Note into its Menu on a phone and renders that
		 * Menu entry only while this is true, so a viewer who hid the control, or
		 * is signed out, gets no entry there either.
		 */
		available?: boolean;
	} = $props();

	const harness = getContext<QuickNoteHarness | undefined>(QUICK_NOTE_HARNESS);

	const viewerId = $derived(
		harness?.viewerId ?? ((page.data?.claims as { sub?: string } | null | undefined)?.sub ?? null)
	);
	const supabase = $derived((page.data?.supabase as SupabaseClient | undefined) ?? null);

	/* Built once per client: the client is one stable instance for the session. */
	let built: { client: SupabaseClient; transports: QuickNoteTransports } | null = null;
	const transports = $derived.by((): QuickNoteTransports | null => {
		if (harness) return harness.transports;
		if (!supabase) return null;
		if (built?.client !== supabase) built = { client: supabase, transports: createQuickNoteTransports(supabase) };
		return built.transports;
	});

	const hidden = $derived(quickNoteHidden(viewerId, page.data?.userProfile?.preferences));
	const show = $derived(!!viewerId && !!transports && !hidden && quickNoteOffered(page.route.id));

	const filing = $derived(quickNoteFiling({ sectionId, sectionLabel, itemTitle }));
	/* Every quick note lands in the whole notebook's Inbox; from a class, the way back is that class. */
	const notebookHref = $derived(`${notebookHomeHref(sectionId)}${sectionId ? '&' : '?'}view=inbox`);

	function hide() {
		if (!viewerId) return;
		void setQuickNoteHidden(viewerId, true, harness ? null : quickNoteProfileIo(supabase, viewerId));
	}

	let note = $state<ReturnType<typeof QuickNote> | null>(null);

	/**
	 * A SAVED NOTE IS RE-READ ONLY WHERE A NOTEBOOK IS ON SCREEN. The notebook's
	 * own pages list the Inbox the note just landed in; anywhere else nothing on
	 * the page shows notebook entries, and reloading an assignment page's data
	 * under somebody's open worksheet is not a cost worth paying for nothing.
	 */
	function saved() {
		if (!harness && (page.route.id ?? '').includes('/notebook')) void invalidateAll();
	}

	$effect(() => {
		available = show;
	});

	/** Open the panel from another control (the classroom Menu's Note entry), hanging it from that control. */
	export function open(from?: HTMLElement | null) {
		void note?.openPanel(from);
	}

	/* The palette's "Quick note" command, offered only while the control is here. */
	$effect(() => {
		if (!show || !note) return;
		const target = note;
		return registerCommandHandler('notebook.quick-note', () => void target.openPanel());
	});
</script>

{#if show && viewerId && transports}
	<QuickNote
		bind:this={note}
		{viewerId}
		{transports}
		{filing}
		{notebookHref}
		{triggerClass}
		{place}
		{anchorFallback}
		onHide={hide}
		onSaved={saved}
	/>
{/if}
