/**
 * 0211, the client half: IdeaCAD's two broadcast channels are PRIVATE, and a
 * subscription the policy refuses degrades to no live preview.
 *
 * WHY THIS IS ASSERTED AGAINST A FAKE CLIENT RATHER THAN A REAL ONE. What is
 * under test is not whether Supabase Realtime works, it is what THIS module does
 * with the four answers a join can give. The fake records the config it was
 * handed and lets a test drive `subscribe`'s callback to each of them, which is
 * the only way to reach CHANNEL_ERROR deliberately -- against a real client that
 * state needs a real refusing database, and the whole point of the degraded path
 * is that it is the state nobody can easily produce on purpose.
 *
 * THE THREE PROPERTIES THE PROMPT NAMES, each with its own test below:
 *   1. a refused subscription must not BREAK THE EDITOR  -> no throw, ever
 *   2. it must not BLOCK A SAVE                          -> this module has no
 *      write path at all, asserted structurally
 *   3. it must not SPIN A RETRY LOOP                     -> the channel is torn
 *      out of the client and never reopened; the count is pinned
 */
import { describe, expect, it, vi } from 'vitest';
import {
	IDEACAD_FRAME_HZ,
	IDEACAD_HEARTBEAT_MS,
	IDEACAD_ROSTER_POLL_MS,
	createIdeacadLive,
	createMemoryIdeacadLive,
	frameAllowed,
	ideacadDocumentChannelName,
	ideacadLiveChannelName,
	ideacadStatusFromSubscribe
} from '../src/lib/ideacad/live';
import type { SupabaseClient } from '@supabase/supabase-js';

interface FakeChannel {
	name: string;
	config: Record<string, unknown>;
	subscribeCalls: number;
	sends: unknown[];
	bindings: string[];
	fire: (status: string) => void;
}

/** A Supabase client just real enough to record what this module asks of it. */
function fakeClient() {
	const created: FakeChannel[] = [];
	const removed: string[] = [];
	const client = {
		channel(name: string, opts: { config: Record<string, unknown> }) {
			let cb: ((s: string) => void) | undefined;
			const ch: FakeChannel = {
				name,
				config: opts.config,
				subscribeCalls: 0,
				sends: [],
				bindings: [],
				fire: (status: string) => cb?.(status)
			};
			const api = {
				subscribe(fn?: (s: string) => void) {
					ch.subscribeCalls += 1;
					cb = fn;
					return api;
				},
				on(_type: string, filter: { event: string }, _fn: unknown) {
					ch.bindings.push(filter.event);
					return api;
				},
				send(payload: unknown) {
					ch.sends.push(payload);
					return Promise.resolve('ok');
				}
			};
			created.push(ch);
			(ch as unknown as { api: unknown }).api = api;
			return api;
		},
		removeChannel(_c: unknown) {
			removed.push('removed');
			return Promise.resolve('ok');
		}
	} as unknown as SupabaseClient;
	return { client, created, removed };
}

describe('0211 client -- the channels are private', () => {
	it('opens both topics with private: true', () => {
		const { client, created } = fakeClient();
		const live = createIdeacadLive(client);
		live.sendPing('item-1', { documentId: 'd', conceptId: 'c', revision: 1 });
		live.sendFrame({ documentId: 'doc-1', conceptId: 'c', revision: 1, features: {} });

		expect(created.map((c) => c.name)).toEqual([
			ideacadLiveChannelName('item-1'),
			ideacadDocumentChannelName('doc-1')
		]);
		// private: true is the ONLY thing that makes Realtime consult the 0211
		// policies. Without it the topic is public and the migration is inert.
		for (const c of created) expect({ name: c.name, private: c.config.private }).toEqual({
			name: c.name,
			private: true
		});
	});

	it('maps a subscribe status to a state, and only a real failure to refused', () => {
		expect(ideacadStatusFromSubscribe('SUBSCRIBED')).toBe('live');
		expect(ideacadStatusFromSubscribe('CHANNEL_ERROR')).toBe('refused');
		expect(ideacadStatusFromSubscribe('TIMED_OUT')).toBe('refused');
		// CLOSED is an ordinary teardown. Treating it as a refusal would make a
		// normal unmount permanently disable the feature.
		expect(ideacadStatusFromSubscribe('CLOSED')).toBeNull();
		expect(ideacadStatusFromSubscribe('anything else')).toBeNull();
	});
});

describe('0211 client -- a refused subscription is a reachable, supported state', () => {
	it('reports refused, tears the channel out, and NEVER reopens it', () => {
		const { client, created, removed } = fakeClient();
		const live = createIdeacadLive(client);
		const seen: Array<[string, string]> = [];
		live.onStatus?.((name, status) => seen.push([name, status]));

		const topic = ideacadDocumentChannelName('doc-1');
		live.subscribeFrames('doc-1', () => {});
		expect(live.statusOf?.(topic)).toBe('connecting');

		created[0].fire('CHANNEL_ERROR');
		expect(live.statusOf?.(topic)).toBe('refused');
		expect(seen).toEqual([
			[topic, 'connecting'],
			[topic, 'refused']
		]);
		expect(removed).toHaveLength(1);

		// THE RETRY-LOOP ASSERTION. Twenty further calls that would each have
		// opened a channel before the refusal open none, and subscribe is never
		// called a second time on the torn-down one.
		for (let i = 0; i < 20; i += 1) {
			live.sendFrame({ documentId: 'doc-1', conceptId: 'c', revision: i, features: {} });
			live.subscribeFrames('doc-1', () => {});
		}
		expect(created).toHaveLength(1);
		expect(created[0].subscribeCalls).toBe(1);
		expect(created[0].sends).toEqual([]);
	});

	it('does not throw on any call once refused, so the editor keeps working', () => {
		const { client, created } = fakeClient();
		const live = createIdeacadLive(client);
		live.subscribeFrames('doc-1', () => {});
		live.subscribePings('item-1', () => {});
		created.forEach((c) => c.fire('CHANNEL_ERROR'));

		expect(() => {
			live.sendFrame({ documentId: 'doc-1', conceptId: 'c', revision: 2, features: {} });
			live.sendPing('item-1', { documentId: 'doc-1', conceptId: 'c', revision: 2 });
			live.subscribeFrames('doc-1', () => {});
			live.subscribePings('item-1', () => {});
			live.statusOf?.('anything');
			live.destroy();
		}).not.toThrow();
	});

	it('refuses one topic without touching the other', () => {
		const { client, created } = fakeClient();
		const live = createIdeacadLive(client);
		live.subscribeFrames('doc-1', () => {});
		live.subscribePings('item-1', () => {});
		created[0].fire('CHANNEL_ERROR');
		created[1].fire('SUBSCRIBED');

		expect(live.statusOf?.(ideacadDocumentChannelName('doc-1'))).toBe('refused');
		expect(live.statusOf?.(ideacadLiveChannelName('item-1'))).toBe('live');

		// The live one still sends. A partial refusal must not disable the rest,
		// which is the ping-channel-only case 0211's join-rule note describes.
		live.sendPing('item-1', { documentId: 'doc-1', conceptId: 'c', revision: 3 });
		live.sendFrame({ documentId: 'doc-1', conceptId: 'c', revision: 3, features: {} });
		expect(created[1].sends).toHaveLength(1);
		expect(created[0].sends).toHaveLength(0);
	});

	it('sends normally once a join succeeds -- the positive control', () => {
		// Without this, every "sends nothing" assertion above would also pass on
		// a module that never sends anything at all.
		const { client, created } = fakeClient();
		const live = createIdeacadLive(client);
		live.subscribeFrames('doc-1', () => {});
		created[0].fire('SUBSCRIBED');
		live.sendFrame({ documentId: 'doc-1', conceptId: 'c', revision: 4, features: {} });
		expect(created[0].sends).toHaveLength(1);
		expect(live.statusOf?.(ideacadDocumentChannelName('doc-1'))).toBe('live');
	});

	it('has no write path in the module at all, so a refusal cannot block a save', () => {
		const { client } = fakeClient();
		const live = createIdeacadLive(client);
		// Structural rather than behavioural: the transport surface is four verbs
		// plus status and teardown, and none of them is an RPC. A save goes
		// through the 0201/0205 functions on a different object entirely.
		expect(Object.keys(live).sort()).toEqual([
			'destroy',
			'onStatus',
			'sendFrame',
			'sendPing',
			'statusOf',
			'subscribeFrames',
			'subscribePings'
		]);
		expect((client as unknown as { rpc?: unknown }).rpc).toBeUndefined();
	});
});

describe('0211 client -- the convenience layer is KEPT, not replaced', () => {
	it('still filters foreign and rewound frames', () => {
		// The policy makes forgery impossible; frameAllowed keeps the picture
		// correct when the channel is fine and the data is stale. Deleting it
		// because the policy now covers it is a regression, not a cleanup.
		const roster = new Set(['mine']);
		expect(frameAllowed({ documentId: 'peer', conceptId: 'c', revision: 2, features: {} }, roster, 1)).toBe(false);
		expect(frameAllowed({ documentId: 'mine', conceptId: 'c', revision: 0, features: {} }, roster, 1)).toBe(false);
		expect(frameAllowed({ documentId: 'mine', conceptId: 'c', revision: 2, features: {} }, roster, 1)).toBe(true);
	});

	it('still rereads the roster every 15 seconds', () => {
		expect(IDEACAD_ROSTER_POLL_MS).toBe(15_000);
		expect(IDEACAD_HEARTBEAT_MS).toBe(10_000);
		expect(IDEACAD_FRAME_HZ).toBe(4);
	});
});

describe('0211 client -- the in-memory transport mirrors the refused state', () => {
	it('stops delivering once a topic is refused', () => {
		const live = createMemoryIdeacadLive() as ReturnType<typeof createMemoryIdeacadLive> & {
			refuse(name: string): void;
		};
		const fn = vi.fn();
		live.subscribeFrames('d', fn);
		live.sendFrame({ documentId: 'd', conceptId: 'c', revision: 1, features: {} });
		expect(fn).toHaveBeenCalledTimes(1);

		live.refuse(ideacadDocumentChannelName('d'));
		expect(live.statusOf?.(ideacadDocumentChannelName('d'))).toBe('refused');
		live.sendFrame({ documentId: 'd', conceptId: 'c', revision: 2, features: {} });
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
