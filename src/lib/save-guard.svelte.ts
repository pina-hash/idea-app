import { beforeNavigate, goto } from '$app/navigation';
import type { SaveState } from '$lib/save-state.svelte';
import { beginResumedNavigation } from '$lib/shell/deploy-safety';

/**
 * HOW LONG THE FLUSH MAY TAKE BEFORE THE GUARD ASKS ANYWAY: twelve seconds.
 *
 * `SaveState` gives a write no deadline of its own, so a request that never
 * answers held every in-app link on the page dead, silently, for as long as it
 * hung -- measured on the real `AssignmentEngine`: a hung write, a link clicked,
 * and the address unchanged at 300ms, 1s, 3s and 8s with nothing on screen but
 * "Saving..." on the card. Twelve seconds is the machine's own retry ladder
 * (800 + 1600 + 3200 + 6400ms of backoff between its five attempts), so a save
 * that is genuinely retrying through a bad patch of wifi gets its whole ladder
 * before anybody is asked, and one that has simply hung is asked about instead
 * of trapping the person on the page. The write is not abandoned by asking: it
 * keeps going, and a surface with a draft mirror still holds what was typed.
 */
export const SAVE_GUARD_FLUSH_TIMEOUT_MS = 12_000;

/** Resolves true when the flush settles, false when the deadline wins. */
function settlesWithin(work: Promise<void>, ms: number): Promise<boolean> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), ms);
		work.then(
			() => {
				clearTimeout(timer);
				resolve(true);
			},
			() => {
				clearTimeout(timer);
				resolve(true);
			}
		);
	});
}

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
 *
 * THE FLUSH HAS A DEADLINE (`SAVE_GUARD_FLUSH_TIMEOUT_MS`), after which the
 * question is asked exactly as if the flush had failed, because to the person
 * waiting on a dead link a hung save and a failed one are the same thing.
 *
 * THE RE-ISSUED NAVIGATION IS MARKED (`beginResumedNavigation`). It has to be a
 * `goto`, and `$lib/shell/DeployWatch.svelte` refuses to reload on a
 * programmatic `goto` -- so without the mark, a page with unsaved work could
 * never take a new version of the site, which is the page that most needs the
 * flush-then-upgrade order this gives it: the save is acknowledged first, and
 * only then does the navigation happen, as a full load if one is due.
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
		const originalType = nav.type;
		const sameRoute = !!nav.to?.route.id && nav.to.route.id === nav.from?.route.id;
		nav.cancel();

		void (async () => {
			await settlesWithin(state.saveNow(), SAVE_GUARD_FLUSH_TIMEOUT_MS);
			// THE STATE'S OWN WARNING OUTRANKS THE RESIDUAL ONE: a flush that could
			// not land is the case this guard exists for, and it is the more
			// surprising loss of the two.
			const remaining = state.dirty ? options.warning : residual();
			const proceed =
				!remaining || sameRoute || window.confirm(`${remaining}\n\nLeave anyway?`);
			if (!proceed || !url) return;
			resuming = true;
			const endResume = beginResumedNavigation(url, originalType);
			try {
				await goto(url);
			} finally {
				resuming = false;
				endResume();
			}
		})();
	});
}
