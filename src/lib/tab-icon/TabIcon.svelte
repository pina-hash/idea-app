<script lang="ts">
	/**
	 * THE LIVE TAB ICON, mounted once in the root layout (ledger 0396). It
	 * renders nothing. It hands the painter in `./live.ts` two things the root
	 * layout knows and a module does not: the page's path (which section the
	 * tab shows) and the certification unread count the root layout already
	 * loads as `certUnread` (the one site-wide notification count, the same
	 * number the profile menu's badge shows).
	 *
	 * Everything else that lights the tab is raised where it happens, through
	 * `raise`/`clear`: the one save state (saving, done, error), the classroom
	 * file upload and the deck upload (progress), the progressive-feedback list
	 * while it holds a note this side has not seen (unread), a tournament match
	 * page while the match is live and a GAUNTLET room while its round is live
	 * (live), and the browser's own online/offline events inside the painter.
	 * `docs/design/tab-icon/README.md` lists the signals deliberately not wired.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { mountTabIcon, raise, setTabPath } from './live';

	$effect(() => {
		setTabPath(page.url.pathname);
	});

	onMount(() => mountTabIcon());

	/* A number, or null when the database cannot say (the layout's own rule);
	   anything that is not a positive count raises nothing. */
	const certUnread = $derived.by(() => {
		const n = (page.data as { certUnread?: unknown }).certUnread;
		return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
	});

	$effect(() => {
		const n = certUnread;
		if (n <= 0) return;
		const handle = raise('unread', { n });
		return () => handle.clear();
	});
</script>
