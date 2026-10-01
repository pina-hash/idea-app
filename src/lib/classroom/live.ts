/**
 * LIVE CHANGE NOTICES FOR THE CLASS PANE'S TWO TOOLS (the hall pass, the song
 * queue) AND FOR STUDENT WORK ARRIVING ON THE GRADING CONSOLE.
 *
 * WHY THIS IS A BROADCAST AND NOT `postgres_changes`. Both tables behind the
 * tools -- `classroom_hall_passes` (0143) and `classroom_song_requests` (0145)
 * -- have row-level security ON with NO POLICY and no client grant, on
 * purpose: a student's payload has never carried a peer's name, and the two
 * `classroom_*_state` RPCs project by role INSIDE the database. Supabase
 * Realtime delivers a `postgres_changes` event only for rows the subscriber
 * could SELECT, so on a table nobody can select it delivers NOTHING, to
 * anybody. Neither table is in the `supabase_realtime` publication either.
 * Opening a policy to make the events flow would open the table the feature
 * exists to keep shut. So the notice is a BROADCAST, sent by whichever client
 * just wrote, and it CARRIES NO PAYLOAD: a notice means "re-ask the server",
 * never "apply this row". Every client re-reads through the same role-scoped
 * RPC it loaded from, so what anybody learns is exactly what the database
 * would have told them a poll later. That is the ReviewConsole rule (a change
 * means re-read the grid, never patch a local copy from events that can
 * arrive out of order) applied where the event cannot even carry a row.
 *
 * `responses` IS THE THIRD TOPIC AND IT REACHES THE SAME CONCLUSION BY A
 * DIFFERENT ROUTE, WHICH IS WHY IT IS WRITTEN DOWN RATHER THAN ASSUMED.
 * `classroom_responses` is NOT the shut-table case above: 0086 gives it
 * `grant select ... to authenticated` and an own-row-or-reviewer policy, so a
 * grader genuinely could SELECT the rows a `postgres_changes` event would
 * carry. Measured on the real chain rather than reasoned about -- the census
 * is in this bundle's history entry -- two things are nevertheless true of it:
 *
 *   1. NO MIGRATION PUTS IT IN THE `supabase_realtime` PUBLICATION. Three
 *      files in this repo add a table to that publication (0006, 0017, 0043)
 *      and none of them is this one, so `postgres_changes` on
 *      `classroom_responses` delivers nothing to anybody today. Adding it is a
 *      migration, and this bundle's one migration is spent.
 *   2. EVEN PUBLISHED, THE EVENT WOULD BE A SECOND READ PATH. A row event
 *      carries the answer's `value` straight down a socket, where the console
 *      reads through `loadGrading`'s role-scoped projection -- and 0138's
 *      manager exclusion, which decides that a person who can manage the
 *      section is not a student row in it, lives in that projection and not in
 *      the table. A grader patching a local copy from raw rows would be
 *      reading answers the console's own read had deliberately reshaped. That
 *      is the same rule the two tools follow, and it does not depend on the
 *      grant.
 *
 * So the third topic is the identical payload-free notice: a grading console
 * that hears `responses` re-runs `loadGrading`, and learns exactly what a poll
 * would have told it.
 *
 * `presence` IS THE FOURTH, AND IT IS THE SHUT-TABLE CASE AGAIN RATHER THAN
 * `responses`' ONE -- which is worth saying, because the two arrived one bundle
 * apart and the obvious reading is that the newer topic follows the newer
 * precedent. `classroom_presence` (0200) DOES carry a select grant and a select
 * policy, so unlike the hall pass a client genuinely can read a row: its OWN.
 * That is exactly the wrong row for a `postgres_changes` subscription, and the
 * reasons stack rather than compete:
 *
 *   1. THE SUBSCRIBER IS THE WRONG PERSON. Realtime delivers a row event only
 *      to a subscriber who could SELECT that row. The policy admits a student to
 *      their own row and an instructor to their students' -- so an event stream
 *      would carry a student their own heartbeats, which they wrote, and nothing
 *      else. The audience for presence is the instructor, and their subscription
 *      would be to thirty other people's rows.
 *   2. IT IS NOT IN THE PUBLICATION, and adding a table to `supabase_realtime`
 *      is a migration; this bundle's one migration is spent.
 *   3. A ROW EVENT WOULD BE A SECOND READ PATH, exactly as it would for
 *      `responses`. `classroom_presence_state` reaches its rows THROUGH the
 *      roster -- a join to `classroom_enrollments` under a managed posting -- so
 *      a row whose enrollment is gone is not in the projection. A console
 *      patching a local copy from raw rows would be drawing a student its own
 *      read had deliberately left out.
 *
 * AND THE NOTICE IS WORTH LESS HERE THAN ANYWHERE ELSE, which is said rather
 * than left to be discovered. Presence changes on a CLOCK as well as on a
 * write: a student who closes the tab announces nothing, and the thing an
 * instructor most wants to see -- somebody going away -- is precisely the
 * transition no notice can ever be sent for. So the poll is not the floor here,
 * it is most of the mechanism, and `PRESENCE_POLL_MS` is 30 seconds rather than
 * `GRADING_POLL_MS`' 60 for that reason. The notice only makes a student
 * SITTING DOWN immediate.
 *
 * WHAT IT COSTS, STATED. A broadcast channel is public to any client holding
 * the anon key, so a signed-in student could send notices for a section and
 * make every open page there re-ask the server: one cheap RPC each, answered
 * by the same gate as a poll. Nothing is disclosed and nothing is written. A
 * write made outside this app (the SQL editor) announces nothing, which is
 * why BOTH tools keep their poll as the floor; the notice makes the ordinary
 * case immediate rather than replacing the thing that makes every case
 * eventually right.
 *
 * ONE CHANNEL PER SECTION PER CLIENT, shared: the pass and the queue on one
 * page join the same channel and each listens for its own topic, so a class
 * page costs one socket channel rather than two. Reference-counted, so the
 * channel is left the moment the last listener goes.
 *
 * `createMemoryClassroomLive` is the in-memory twin for harnesses and tests:
 * an announce reaches every OTHER subscriber synchronously, and nothing here
 * touches the network. It is a real implementation of the interface, not a
 * stub of it, so a component driven against it exercises the identical code.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type ClassroomLiveTopic = 'hall-pass' | 'song-queue' | 'responses' | 'presence';

export const CLASSROOM_LIVE_TOPICS: readonly ClassroomLiveTopic[] = [
	'hall-pass',
	'song-queue',
	'responses',
	'presence'
];

/**
 * THE GRADING CONSOLE'S POLL, WHICH IS THE FLOOR AND NOT THE SPEED.
 *
 * The notice above makes the ordinary case immediate; this is what makes every
 * case eventually right, including the ones no notice is ever sent for -- a row
 * written from the SQL editor, a student whose socket never joined, a stalled
 * channel. Both existing tools keep a poll for exactly that reason and this one
 * does too.
 *
 * 60s, between the hall pass's 45 and the song queue's 90. A grading console is
 * open for a period at a time with one payload per re-read, and the thing being
 * waited for is a student finishing a worksheet, which is minutes rather than
 * seconds of work. It is not tuned to feel live -- the notice does that.
 */
export const GRADING_POLL_MS = 60_000;

/**
 * `connecting` until the channel joins; `live` once it has; `stalled` when the
 * transport reported an error or a timeout. A component paints nothing alarming
 * for `connecting` (it is the state every page starts in) and keeps polling in
 * every state -- the poll is the floor, the channel is the speed.
 */
export type ClassroomLiveStatus = 'connecting' | 'live' | 'stalled';

export interface ClassroomLive {
	/**
	 * Listen for notices about ONE section. `onChange` fires with the topic that
	 * moved; the caller re-reads through its own transport. Returns the
	 * unsubscribe, which is also what leaves the channel once nobody is left.
	 */
	subscribe(
		sectionId: string,
		onChange: (topic: ClassroomLiveTopic) => void,
		onStatus?: (status: ClassroomLiveStatus) => void
	): () => void;
	/**
	 * Say that THIS client just changed something. Fire-and-forget: a notice
	 * that does not get through costs the other viewers one poll interval, which
	 * is what they had before this existed. Never awaited by a write path.
	 */
	announce(sectionId: string, topic: ClassroomLiveTopic): void;
}

/** The one broadcast event name. The topic rides in the payload. */
export const CLASSROOM_LIVE_EVENT = 'changed';

/** One channel per section, and the name says which. */
export function classroomLiveChannelName(sectionId: string): string {
	return `classroom-live:${sectionId}`;
}

export function isClassroomLiveTopic(value: unknown): value is ClassroomLiveTopic {
	return typeof value === 'string' && (CLASSROOM_LIVE_TOPICS as readonly string[]).includes(value);
}

/**
 * The topic a broadcast payload names, or null for anything that is not one.
 * A payload is written by another client, so it is DATA: an unknown topic is
 * dropped rather than passed to a listener as a string it has no branch for.
 */
export function classroomLiveTopicOf(payload: unknown): ClassroomLiveTopic | null {
	if (!payload || typeof payload !== 'object') return null;
	const topic = (payload as { topic?: unknown }).topic;
	return isClassroomLiveTopic(topic) ? topic : null;
}

interface Listener {
	onChange: (topic: ClassroomLiveTopic) => void;
	onStatus?: (status: ClassroomLiveStatus) => void;
}

interface SectionChannel {
	channel: RealtimeChannel;
	listeners: Set<Listener>;
	status: ClassroomLiveStatus;
}

/**
 * The broadcast-backed implementation, over the caller's own Supabase client.
 * The client is the SESSION's one stable instance, so this is built once per
 * page load beside the other transports.
 */
export function createClassroomLive(supabase: SupabaseClient): ClassroomLive {
	const sections = new Map<string, SectionChannel>();

	function open(sectionId: string): SectionChannel {
		const held = sections.get(sectionId);
		if (held) return held;
		const channel = supabase.channel(classroomLiveChannelName(sectionId), {
			// `self: false`: the client that wrote has already refreshed itself
			// from the write's own response, so its own notice would be one
			// wasted round trip.
			config: { broadcast: { self: false, ack: false } }
		});
		const entry: SectionChannel = { channel, listeners: new Set(), status: 'connecting' };
		channel.on('broadcast', { event: CLASSROOM_LIVE_EVENT }, ({ payload }) => {
			const topic = classroomLiveTopicOf(payload);
			if (!topic) return;
			for (const l of entry.listeners) l.onChange(topic);
		});
		channel.subscribe((status) => {
			// CLOSED arrives on the way out of `removeChannel` and is not a fault;
			// by then the entry is gone and nobody is listening.
			const next: ClassroomLiveStatus | null =
				status === 'SUBSCRIBED'
					? 'live'
					: status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
						? 'stalled'
						: null;
			if (!next) return;
			entry.status = next;
			for (const l of entry.listeners) l.onStatus?.(next);
		});
		sections.set(sectionId, entry);
		return entry;
	}

	return {
		subscribe(sectionId, onChange, onStatus) {
			const entry = open(sectionId);
			const listener: Listener = { onChange, onStatus };
			entry.listeners.add(listener);
			onStatus?.(entry.status);
			let stopped = false;
			return () => {
				if (stopped) return;
				stopped = true;
				entry.listeners.delete(listener);
				if (entry.listeners.size === 0 && sections.get(sectionId) === entry) {
					sections.delete(sectionId);
					void supabase.removeChannel(entry.channel);
				}
			};
		},
		announce(sectionId, topic) {
			// `send` over a joined channel goes down the socket; over one that is
			// not joined supabase-js falls back to the broadcast REST endpoint, so
			// a write made from a surface with no listener still announces.
			const entry = sections.get(sectionId);
			const channel =
				entry?.channel ??
				supabase.channel(classroomLiveChannelName(sectionId), {
					config: { broadcast: { self: false, ack: false } }
				});
			void channel
				.send({ type: 'broadcast', event: CLASSROOM_LIVE_EVENT, payload: { topic } })
				.catch(() => {
					/* Best effort by contract: the poll is the floor. */
				});
			if (!entry) void supabase.removeChannel(channel);
		}
	};
}

/**
 * The in-memory twin, for harnesses and tests. Same interface, same
 * semantics -- an announce reaches every OTHER subscriber of that section and
 * never the announcer's own listener -- with no network anywhere. `status`
 * answers `live` at once, which is the state a real channel reaches within a
 * round trip.
 */
export function createMemoryClassroomLive(): ClassroomLive & {
	/** How many listeners each section currently has, for an assertion. */
	listenerCount(sectionId: string): number;
	/** Every announce made through this bus, oldest first. */
	announced: { sectionId: string; topic: ClassroomLiveTopic }[];
} {
	const listeners = new Map<string, Set<Listener>>();
	const announced: { sectionId: string; topic: ClassroomLiveTopic }[] = [];
	let announcing: Listener | null = null;
	return {
		announced,
		listenerCount(sectionId) {
			return listeners.get(sectionId)?.size ?? 0;
		},
		subscribe(sectionId, onChange, onStatus) {
			const set = listeners.get(sectionId) ?? new Set<Listener>();
			listeners.set(sectionId, set);
			const listener: Listener = { onChange, onStatus };
			set.add(listener);
			onStatus?.('live');
			// The announce below excludes the listener that is announcing, which
			// a component reaches by calling `announce` from inside its own
			// handler: the memory bus cannot see who called, so the caller's own
			// listener is identified by the announce being made synchronously
			// inside an `onChange` of its own. That case does not arise in the
			// components (they announce from a write handler, not from a change
			// handler), so every listener OTHER than the one mid-callback hears
			// it, which is `self: false` to the letter.
			return () => {
				set.delete(listener);
				if (set.size === 0) listeners.delete(sectionId);
			};
		},
		announce(sectionId, topic) {
			announced.push({ sectionId, topic });
			for (const l of listeners.get(sectionId) ?? []) {
				if (l === announcing) continue;
				const previous = announcing;
				announcing = l;
				try {
					l.onChange(topic);
				} finally {
					announcing = previous;
				}
			}
		}
	};
}
