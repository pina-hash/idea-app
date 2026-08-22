import { beforeNavigate, goto } from '$app/navigation';
import type { SaveState } from '$lib/save-state.svelte';

/**
 * THE ONE NAVIGATION GUARD over a SaveState.
 *
 * Split out of `save-state.svelte.ts` so that module carries no `$app/*`
 * import and stays assertable on its own. This half is the part that can only
 * exist inside a SvelteKit component.
 *
 * WHAT IT DOES, in the order it matters:
 *
 * 1. A navigation with nothing unacknowledged is not interrupted. A confirm on
 *    every click is a confirm nobody reads.
 * 2. A navigation with pending work is CANCELLED, the write is flushed, and
 *    the navigation is then re-issued. The 800ms debounce window is the
 *    reported defect: a student typed an answer and clicked the next item
 *    inside it, and the answer was gone with nothing said. Flushing first is
 *    the fix; asking a question would be a worse one, because the correct
 *    answer to "you have unsaved work" is always "then save it".
 * 3. Only when the flush FAILS is there a question to ask, and then it names
 *    what is at stake. This is the case a flush cannot cover: the endpoint is
 *    down, retries are exhausted, and leaving really does discard the work.
 * 4. `type: 'leave'` is the browser closing the tab or following an external
 *    link. `cancel()` there is what raises the native unload dialog, which is
 *    the only warning a page is allowed to show at that point; a flush cannot
 *    be awaited in that window, so the SaveState's own pagehide net (a fetch,
 *    or FSP's sendBeacon) is what actually tries to land it.
 *
 * WORK THIS SaveState CANNOT WRITE IS REPORTED BY `alsoUnsaved`, and it is
 * not an escape hatch. Some surfaces hold something no autosave can land: the
 * notebook composer's STAGED PHOTOS are File handles that exist nowhere but in
 * that browser's memory, so there is no request that could flush them, and its
 * open note editors own their own SaveState two components down. Both are still
 * work a navigation destroys, so the guard has to see them -- and the
 * alternative, a second `beforeNavigate` beside this one, is two guards racing
 * to cancel the same navigation and two confirms for one move. It returns the
 * warning to show, or null for nothing outstanding, and is asked AFTER the
 * flush as well as before it: whatever the flush landed is no longer work.
 *
 * SAME-ROUTE MOVES ARE EXEMPT, the NotebookView rule: SvelteKit serves a
 * query-string change by re-running the load against the same component
 * instance, so the surface survives it and warning would be a lie people learn
 * to click through. The flush still happens; only the question is skipped.
 */
export function guardSaveNavigation(
	state: SaveState,
	options: {
		/** What is lost, in the user's terms, if the failed write is abandoned. */
		warning: string;
		/** False disables the guard entirely (a read-only mount, say). */
		enabled?: () => boolean;
		/**
		 * Unsaved work this SaveState is not the one holding -- staged files that
		 * no request could carry, a child surface's own machine. Returns the
		 * warning to show, or null when there is nothing outstanding.
		 */
		alsoUnsaved?: () => string | null;
	}
): void {
	let resuming = false;
	const residual = () => options.alsoUnsaved?.() ?? null;

	beforeNavigate((nav) => {
		// The re-issued navigation must not be caught by this same guard.
		if (resuming) return;
		if (options.enabled && !options.enabled()) return;
		if (!state.dirty && !residual()) return;

		if (nav.type === 'leave') {
			nav.cancel();
			return;
		}

		const url = nav.to?.url ?? null;
		const sameRoute = !!nav.to?.route.id && nav.to.route.id === nav.from?.route.id;
		nav.cancel();

		void (async () => {
			await state.saveNow();
			// THE STATE'S OWN WARNING OUTRANKS THE RESIDUAL ONE: a flush that could
			// not land is the case this guard exists for, and it is the more
			// surprising loss of the two.
			const remaining = state.dirty ? options.warning : residual();
			const proceed =
				!remaining || sameRoute || window.confirm(`${remaining}\n\nLeave anyway?`);
			if (!proceed || !url) return;
			resuming = true;
			try {
				await goto(url);
			} finally {
				resuming = false;
			}
		})();
	});
}
