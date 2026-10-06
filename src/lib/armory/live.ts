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
				if (Array.isArray(data) && data.length > 0) onChange();
				return 'ok';
			}
		});
	};
	const channel = supabase
		.channel(`armory:${projectId}`)
		.on(
			'postgres_changes',
			{ event: 'INSERT', schema: 'public', table: 'armory_change_feed', filter: `project_id=eq.${projectId}` },
			() => onChange()
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
		poller?.stop();
		void supabase.removeChannel(channel);
	};
}
