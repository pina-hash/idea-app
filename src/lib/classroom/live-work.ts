/**
 * THE CLASS LIST BESIDE AN OPEN WORKSHEET, TOLD WHAT THE WORKSHEET KNOWS
 * (ledger 0360, report d983e776), with no read at all.
 *
 * WHY THIS EXISTS. The class page's `work` -- where the student stands on
 * every assignment, and so what the row beside the worksheet says -- is
 * computed ONCE, in the section layout's load, and that load reads no `url`
 * and so never re-runs on a navigation inside the class. A student who
 * finished a ported worksheet therefore kept reading "Missing" in the list
 * beside a rail that said "All filled in", until a full reload. Re-reading the
 * class's completions on every save is the load the 2026-09-29 stall was made
 * of, so it is not the answer: the open worksheet already holds the ONE fact
 * the row needs, and this hands it over in memory.
 *
 * WHAT IT MAY SAY, AND THE ONE THING IT MAY NEVER SAY. It speaks only for the
 * worksheet that is open in this tab, only after something was written this
 * visit, and only while nothing the bar counts is still owed to the server.
 * "Complete" here therefore means exactly what the next page load will say:
 * the answers are stored. It never touches a row that is submitted or
 * returned -- those say where the work stands by themselves -- and it never
 * replaces a completion instant the server already gave.
 *
 * Pure: no Svelte, no Supabase. `live-work.svelte.ts` holds the `$state` and
 * the context; `Progress.svelte` publishes; the section layout overlays.
 */

import type { StudentWork } from '$lib/classroom/classroom';
import type { HxProgress } from '$lib/classroom/html-assignment/progress';

/**
 * THE OPEN WORKSHEET'S OPINION OF ITS OWN ROW:
 *
 *   undefined  no opinion -- nothing written this visit (the server's word
 *              stands), or a counted answer is still unsaved or failed
 *   string     complete, and the answers are stored: the instant of the last
 *              acknowledgement
 *   null       not complete, and that too is stored
 */
export function liveWorksheetCompletion(input: {
	progress: Pick<HxProgress, 'complete' | 'blocks'>;
	ack: { at: string; ok: boolean } | null;
}): string | null | undefined {
	if (!input.ack) return undefined;
	const owed = input.progress.blocks.some((b) => b.weight > 0 && b.unsaved);
	if (owed) return undefined;
	return input.progress.complete ? input.ack.at : null;
}

/**
 * THE SERVER'S `work` WITH THE OPEN WORKSHEETS' OPINIONS ON TOP. A new object
 * when anything changes, the same object when nothing does, so a renderer
 * keyed on identity does not re-render for nothing.
 */
export function overlayWork(
	work: Readonly<Record<string, StudentWork>>,
	overrides: ReadonlyMap<string, string | null>
): Record<string, StudentWork> {
	if (!overrides.size) return work as Record<string, StudentWork>;
	let out: Record<string, StudentWork> | null = null;
	const write = (itemId: string, next: StudentWork) => {
		out ??= { ...work };
		out[itemId] = next;
	};
	for (const [itemId, at] of overrides) {
		const row = work[itemId];
		// A TURNED-IN, CLOSED OR RETURNED ROW ALREADY SAYS WHERE IT STANDS.
		if (row && (row.state === 'submitted' || row.state === 'returned')) continue;
		if (at === null) {
			if (row && typeof row.completedAt === 'string') {
				const rest: StudentWork = { ...row };
				delete rest.completedAt;
				write(itemId, rest);
			}
			continue;
		}
		// THE SERVER'S OWN INSTANT IS NEVER REPLACED: it is what the next load
		// will say, and moving it in the tab would flip a row between on time
		// and late with nothing new stored.
		if (row && typeof row.completedAt === 'string') continue;
		write(itemId, { ...(row ?? { state: 'in-progress', score: null }), completedAt: at });
	}
	return out ?? (work as Record<string, StudentWork>);
}
