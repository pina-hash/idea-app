/**
 * THE OPEN WORKSHEETS' OPINIONS, AS STATE THE CLASS LAYOUT OWNS (ledger 0360).
 *
 * The section layout creates one with `setLiveWork()` and overlays it onto the
 * `work` it hands `ClassView` (`overlayWork`, `./live-work.ts`); the progress
 * rail inside an open worksheet finds it with `getLiveWork()` and publishes its
 * row's completion there. No network call anywhere: this is two components in
 * one page agreeing about a fact one of them already holds.
 *
 * `getLiveWork()` ANSWERS UNDEFINED where no class layout is above the rail --
 * a `/dev` harness, a grading surface, a test -- and the rail then publishes
 * nothing, which is the behaviour before this existed.
 *
 * THE LAYOUT DOES NOT CLEAR IT WHEN ITS `work` IS RE-READ, deliberately. An
 * opinion is only ever published from an ACKNOWLEDGED write, so it is at least
 * as new as any read that started before that write landed -- and an
 * `invalidateAll()` whose read began a moment earlier would otherwise put a
 * just-finished worksheet back to Missing beside a rail reading 100, which is
 * the defect this exists to end. A read that began after agrees with it; a
 * row that is submitted or returned, or that already carries the server's own
 * completion, is never overridden (`overlayWork`). What this costs is one
 * case: another device emptying the same answers during this visit, which the
 * next full load corrects. `clear()` is there for a surface that does want to
 * drop every opinion. No `$effect` lives here, by the same rule as
 * `answers-store`.
 */

import { getContext, setContext } from 'svelte';

/** Exported for a test that mounts the rail under a context map; nothing else reads it. */
export const LIVE_WORK_KEY = Symbol('classroom-live-work');

export class LiveWork {
	/** Item id to the open worksheet's opinion (`liveWorksheetCompletion`). */
	overrides = $state<ReadonlyMap<string, string | null>>(new Map());

	/** Record one worksheet's opinion. A repeat of the same opinion writes nothing. */
	set(itemId: string, at: string | null): void {
		if (this.overrides.has(itemId) && this.overrides.get(itemId) === at) return;
		const next = new Map(this.overrides);
		next.set(itemId, at);
		this.overrides = next;
	}

	/** Forget every opinion: the layout has fresh rows from the server. */
	clear(): void {
		if (this.overrides.size) this.overrides = new Map();
	}
}

/** Create the class layout's one `LiveWork` and put it in context. Component init only. */
export function setLiveWork(): LiveWork {
	return setContext(LIVE_WORK_KEY, new LiveWork());
}

/** The class layout's `LiveWork`, or undefined where there is none. Component init only. */
export function getLiveWork(): LiveWork | undefined {
	return getContext<LiveWork | undefined>(LIVE_WORK_KEY);
}
