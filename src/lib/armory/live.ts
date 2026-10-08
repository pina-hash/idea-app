/**
 * HOW THE PROJECT PAGE HEARS ABOUT CHANGES (contract section 4): Supabase
 * realtime on `armory_change_feed`, whose RLS already limits a subscriber to
 * their own projects; and when the channel cannot be joined, the classroom's
 * one poller (`startPoller`, out of step, paused while hidden, backing off,
 * stopping on a lost session) asking `armory_list_changes` for anything after
 * the last cursor the page saw. Either way a change is only a reason to reload
 * the page's data; nothing in a change row is rendered directly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSignedOutFailure, PollSignedOut, startPoller, type Poller } from '$lib/classroom/poll';
import { pollSignedOut } from '$lib/classroom/poll-session';

export const ARMORY_POLL_MS = 15_000;

/**
 * REALTIME FIRES ONE EVENT PER ROW, AND A CHANGE IS A RELOAD, SO THEY ARE
 * COALESCED. A "check out all" of sixty files is sixty inserts in a second;
 * reloading the project on each was sixty full reads of its files, team and
 * storage (report of 2026-10-07). A trailing timer of this length turns a burst
 * into ONE reload after it settles, and a single change still lands within a
 * second.
 */
export const ARMORY_CHANGE_COALESCE_MS = 1000;

/**
 * AND A STREAM THAT NEVER SETTLES STILL RELOADS. A trailing timer alone is
 * restarted by every event, so a busy class saving a row less than a second
 * apart, or a long check-out-all, would hold the page on what it last read
 * until the stream stopped. The first change of a burst starts this clock;
 * the reload is never later than this after it.
 */
export const ARMORY_CHANGE_MAX_WAIT_MS = 5000;

/**
 * The coalescer, apart from the channel so its timing is testable: `changed()`
 * per event, ONE `onChange` per burst, after the burst has been quiet for
 * `waitMs` or after `maxWaitMs` from its first event, whichever comes first.
 */
export function changeCoalescer(
	onChange: () => void,
	{ waitMs = ARMORY_CHANGE_COALESCE_MS, maxWaitMs = ARMORY_CHANGE_MAX_WAIT_MS, now = () => Date.now() } = {}
): { changed: () => void; stop: () => void } {
	let pending: ReturnType<typeof setTimeout> | null = null;
	let firstAt: number | null = null;
	let stopped = false;
	return {
		changed() {
			if (stopped) return;
			const t = now();
			if (firstAt === null) firstAt = t;
			if (pending !== null) clearTimeout(pending);
			const wait = Math.max(0, Math.min(waitMs, firstAt + maxWaitMs - t));
			pending = setTimeout(() => {
				pending = null;
				firstAt = null;
				if (!stopped) onChange();
			}, wait);
		},
		stop() {
			stopped = true;
			if (pending !== null) clearTimeout(pending);
			pending = null;
		}
	};
}

export type LiveMode = 'live' | 'polling' | 'off';

export function watchArmoryProject(
	supabase: SupabaseClient,
	projectId: string,
	cursor: () => number,
	onChange: () => void,
	onMode: (mode: LiveMode) => void
): () => void {
	let poller: Poller | null = null;
	let stopped = false;
	const coalescer = changeCoalescer(() => {
		if (!stopped) onChange();
	});
	const changed = coalescer.changed;
	const startPolling = () => {
		if (poller || stopped) return;
		onMode('polling');
		poller = startPoller({
			intervalMs: ARMORY_POLL_MS,
			onSignedOut: pollSignedOut,
			async run() {
				const { data, error } = await supabase.rpc('armory_list_changes', { p_project: projectId, p_after: cursor() });
				if (error) {
					if (isSignedOutFailure(error)) throw new PollSignedOut();
					return 'failed';
				}
				if (Array.isArray(data) && data.length > 0) changed();
				return 'ok';
			}
		});
	};
	const channel = supabase
		.channel(`armory:${projectId}`)
		.on(
			'postgres_changes',
			{ event: 'INSERT', schema: 'public', table: 'armory_change_feed', filter: `project_id=eq.${projectId}` },
			() => changed()
		)
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				poller?.stop();
				poller = null;
				onMode('live');
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
				startPolling();
			}
		});
	return () => {
		stopped = true;
		coalescer.stop();
		poller?.stop();
		void supabase.removeChannel(channel);
	};
}
