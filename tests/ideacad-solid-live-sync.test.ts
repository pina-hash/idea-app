// tests/ideacad-solid-live-sync.test.ts
//
// THE DIRECT MODELER'S LIVE LAYER (feedback R34), as pure logic. Every guarantee
// here fails SILENTLY in use: a stale or foreign ping that moved the model, a
// session with unsaved work that was replayed over, a save in flight read as
// somebody else's edit, or a refused channel that stopped the poll would all
// look like an ordinary modeler with nothing on screen to say otherwise.
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	appendPulled, changedBy, committedSeq, connectIdeacadLive, liveDecide, liveHead, liveLoaded, liveNeedsRead, livePing,
	liveSaved, liveStart, liveStatusWord, newerSentence, readHistoryAfter, updatedSentence, LIVE_WORDS, type LiveSession
} from '../src/lib/ideacad/solid/live-sync';
import { createIdeacadLive, createMemoryIdeacadLive, ideacadDocumentChannelName, type IdeacadLive, type IdeacadLiveStatus, type IdeacadPing } from '../src/lib/ideacad/live';
import { stateAt } from '../src/lib/ideacad/history';
import type { DirectRow } from '../src/lib/ideacad/solid/history';

const CLEAN_IDLE: LiveSession = { pending: false, writing: false, idle: true };
const ANA = 'ana.reyes@boscotech.net', BEN = 'ben.ortiz@boscotech.net';

/** A real-shaped direct history: the origin, then one rename operation per title, each its own revision. */
function historyOf(titles: string[], actors: string[] = []): DirectRow[] {
	const rows: DirectRow[] = [{ seq: 0, kind: 'origin', path: '', after: { format: 'ideacad-solid-v1', title: 'Start', bodies: [] } }];
	let before = 'Start';
	titles.forEach((title, i) => {
		rows.push({ seq: rows.length, kind: 'set', path: '/title', before, after: title, operationId: `op-${i}`, operationStart: true, operationLabel: 'Rename', resultRevision: i + 2, actor: actors[i] ?? ANA });
		before = title;
	});
	return rows;
}

describe('the decision: clean pulls, dirty is told, a save in flight and a busy session wait', () => {
	const ahead = liveHead(liveStart('d', 'c', 3), 4);
	it('answers current while the database is not ahead, whatever the session is doing', () => {
		const s = liveStart('d', 'c', 3);
		for (const session of [CLEAN_IDLE, { pending: true, writing: false, idle: true }, { pending: false, writing: true, idle: false }])
			expect(liveDecide(s, session)).toBe('current');
	});
	it('a clean, idle session pulls; one with unsaved work is offered, and NEVER pulled', () => {
		expect(liveDecide(ahead, CLEAN_IDLE)).toBe('pull');
		expect(liveDecide(ahead, { pending: true, writing: false, idle: true })).toBe('offer');
		expect(liveDecide(ahead, { pending: true, writing: false, idle: false })).toBe('offer');
	});
	it('a save on the wire waits, even with unsaved work behind it: the newer revision may be its own', () => {
		expect(liveDecide(ahead, { pending: true, writing: true, idle: true })).toBe('wait');
		expect(liveDecide(ahead, { pending: false, writing: true, idle: true })).toBe('wait');
	});
	it('a clean session in the middle of something waits rather than having the model swapped under it', () => {
		expect(liveDecide(ahead, { pending: false, writing: false, idle: false })).toBe('wait');
	});
	it('its own accepted save brings the session level with the database it moved', () => {
		const saving = liveHead(liveStart('d', 'c', 3), 4);
		expect(liveDecide(saving, { pending: true, writing: true, idle: true })).toBe('wait');
		expect(liveDecide(liveSaved(saving, 4), CLEAN_IDLE)).toBe('current');
	});
});

describe('a ping is a hint to read the database, never a fact', () => {
	const s = liveStart('doc-1', 'concept-1', 5);
	it('a ping for another document or concept is ignored, the same object handed back', () => {
		expect(livePing(s, { documentId: 'doc-2', conceptId: 'concept-1', revision: 9 })).toBe(s);
		expect(livePing(s, { documentId: 'doc-1', conceptId: 'concept-2', revision: 9 })).toBe(s);
	});
	it('a stale ping, this session\'s own echo and a malformed one are ignored', () => {
		expect(livePing(s, { documentId: 'doc-1', conceptId: 'concept-1', revision: 4 })).toBe(s);
		expect(livePing(s, { documentId: 'doc-1', conceptId: 'concept-1', revision: 5 })).toBe(s);
		for (const revision of [NaN, 6.5, -1, 0, Number.MAX_SAFE_INTEGER + 1] as number[])
			expect(livePing(s, { documentId: 'doc-1', conceptId: 'concept-1', revision })).toBe(s);
		expect(livePing(s, null)).toBe(s);
	});
	it('a newer ping asks for a read and moves NOTHING the decision reads (positive control for the ignores above)', () => {
		const hinted = livePing(s, { documentId: 'doc-1', conceptId: 'concept-1', revision: 7 });
		expect(hinted).not.toBe(s);
		expect(liveNeedsRead(hinted)).toBe(true);
		expect(hinted.remote).toBe(5);
		expect(liveDecide(hinted, CLEAN_IDLE)).toBe('current');
		expect(liveDecide(liveHead(hinted, 7), CLEAN_IDLE)).toBe('pull');
	});
	it('out of order: an older ping after a newer one asks for nothing more', () => {
		const seven = livePing(s, { documentId: 'doc-1', conceptId: 'concept-1', revision: 7 });
		expect(livePing(seven, { documentId: 'doc-1', conceptId: 'concept-1', revision: 6 })).toBe(seven);
	});
	it('a ping claiming more than the database holds is settled by the read and pulls nothing', () => {
		const lying = livePing(s, { documentId: 'doc-1', conceptId: 'concept-1', revision: 99 });
		const read = liveHead(lying, 5);
		expect(liveNeedsRead(read)).toBe(false);
		expect(liveDecide(read, CLEAN_IDLE)).toBe('current');
	});
});

describe('the database answer only moves forward', () => {
	it('a slow read that lands after a newer one cannot take the newer answer back', () => {
		const s = liveHead(liveHead(liveStart('d', 'c', 2), 6), 4);
		expect(s.remote).toBe(6);
		expect(liveDecide(s, CLEAN_IDLE)).toBe('pull');
	});
	it('loading a revision makes the session current with it', () => {
		const s = liveLoaded(liveHead(liveStart('d', 'c', 2), 6), 6);
		expect(liveDecide(s, CLEAN_IDLE)).toBe('current');
	});
});

describe('a refused channel degrades to the poll, never to a stopped layer', () => {
	it('the memory bus refused: the status says so, nothing is sent or delivered, and the poll still pulls', () => {
		const bus = createMemoryIdeacadLive() as IdeacadLive & { refuse(n: string): void };
		bus.refuse(ideacadDocumentChannelName('doc-1'));
		const statuses: IdeacadLiveStatus[] = [], pings: IdeacadPing[] = [];
		const a = connectIdeacadLive(bus, 'doc-1', { ping: (p) => pings.push(p), status: (st) => statuses.push(st) });
		const b = connectIdeacadLive(bus, 'doc-1', { ping: (p) => pings.push(p), status: () => {} });
		b.send({ documentId: 'doc-1', conceptId: 'c', revision: 3 });
		expect(statuses).toEqual(['refused']);
		expect(liveStatusWord(statuses.at(-1))).toBe(LIVE_WORDS.unavailable);
		expect(pings).toHaveLength(0);
		// The floor still works with no channel at all.
		expect(liveDecide(liveHead(liveStart('doc-1', 'c', 2), 3), CLEAN_IDLE)).toBe('pull');
		a.close(); b.close();
	});
	it('the same bus NOT refused delivers a ping to the other copy (positive control)', () => {
		const bus = createMemoryIdeacadLive();
		const statuses: IdeacadLiveStatus[] = [], got: IdeacadPing[] = [];
		const a = connectIdeacadLive(bus, 'doc-1', { ping: (p) => got.push(p), status: (st) => statuses.push(st) });
		const b = connectIdeacadLive(bus, 'doc-1', { ping: () => {}, status: () => {} });
		b.send({ documentId: 'doc-1', conceptId: 'c', revision: 3, features: { secret: true } } as IdeacadPing);
		expect(statuses.at(-1)).toBe('live');
		expect(got).toEqual([{ documentId: 'doc-1', conceptId: 'c', revision: 3 }]);
		a.close();
		b.send({ documentId: 'doc-1', conceptId: 'c', revision: 4 });
		expect(got).toHaveLength(1);
		b.close();
	});
	it('a ping for another document is not delivered by the bus at all', () => {
		const bus = createMemoryIdeacadLive(), got: IdeacadPing[] = [];
		const a = connectIdeacadLive(bus, 'doc-1', { ping: (p) => got.push(p), status: () => {} });
		bus.sendDocumentPing?.({ documentId: 'doc-2', conceptId: 'c', revision: 9 });
		expect(got).toHaveLength(0);
		bus.sendDocumentPing?.({ documentId: 'doc-1', conceptId: 'c', revision: 9 });
		expect(got).toHaveLength(1);
		a.close();
	});
	it('a live object that cannot carry document pings reports refused rather than pretending to be live', () => {
		const statuses: IdeacadLiveStatus[] = [], released = vi.fn();
		const bare = { sendPing() {}, subscribePings: () => () => {}, sendFrame() {}, subscribeFrames: () => () => {}, destroy() {} } as IdeacadLive;
		const c = connectIdeacadLive(bare, 'doc-1', { ping: () => {}, status: (st) => statuses.push(st) }, released);
		expect(statuses).toEqual(['refused']);
		c.close();
		expect(released).toHaveBeenCalledOnce();
	});
	it('"cannot tell" reads as connecting, never as live', () => {
		expect(liveStatusWord(undefined)).toBe(LIVE_WORDS.connecting);
		expect(liveStatusWord('connecting')).toBe(LIVE_WORDS.connecting);
		expect(liveStatusWord('live')).toBe(LIVE_WORDS.live);
	});
});

describe('the real client: a document ping is a private broadcast that carries three fields', () => {
	function fakeClient() {
		const created: { name: string; config: Record<string, unknown>; sends: unknown[]; bindings: string[]; fire(s: string): void; emit(event: string, payload: unknown): void }[] = [];
		const client = {
			channel(name: string, opts: { config: Record<string, unknown> }) {
				let status: ((s: string) => void) | undefined;
				const handlers: [string, (m: { payload: unknown }) => void][] = [];
				const ch = { name, config: opts.config, sends: [] as unknown[], bindings: [] as string[], fire: (s: string) => status?.(s), emit: (event: string, payload: unknown) => handlers.filter(([e]) => e === event).forEach(([, fn]) => fn({ payload })) };
				const api = {
					subscribe(fn?: (s: string) => void) { status = fn; return api; },
					on(_type: string, filter: { event: string }, fn: (m: { payload: unknown }) => void) { ch.bindings.push(filter.event); handlers.push([filter.event, fn]); return api; },
					send(payload: unknown) { ch.sends.push(payload); return Promise.resolve('ok'); }
				};
				created.push(ch);
				return api;
			},
			removeChannel: () => Promise.resolve('ok')
		} as unknown as SupabaseClient;
		return { client, created };
	}
	it('opens ideacad-doc:<id> privately, sends event ping with exactly the ids and the revision, and delivers until unsubscribed', () => {
		const { client, created } = fakeClient();
		const live = createIdeacadLive(client), got: IdeacadPing[] = [];
		const off = live.subscribeDocumentPings!('doc-1', (p) => got.push(p));
		live.sendDocumentPing!({ documentId: 'doc-1', conceptId: 'c', revision: 4, features: { bodies: [1] } } as IdeacadPing);
		expect(created.map((c) => [c.name, c.config.private])).toEqual([[ideacadDocumentChannelName('doc-1'), true]]);
		expect(created[0].bindings).toEqual(['ping']);
		expect(created[0].sends).toEqual([{ type: 'broadcast', event: 'ping', payload: { documentId: 'doc-1', conceptId: 'c', revision: 4 } }]);
		created[0].emit('ping', { documentId: 'doc-1', conceptId: 'c', revision: 5 });
		expect(got).toHaveLength(1);
		off();
		created[0].emit('ping', { documentId: 'doc-1', conceptId: 'c', revision: 6 });
		expect(got).toHaveLength(1);
	});
	it('once the database refuses the topic, a ping is a no-op rather than a reconnect', () => {
		const { client, created } = fakeClient();
		const live = createIdeacadLive(client);
		live.subscribeDocumentPings!('doc-1', () => {});
		created[0].fire('CHANNEL_ERROR');
		expect(live.statusOf?.(ideacadDocumentChannelName('doc-1'))).toBe('refused');
		live.sendDocumentPing!({ documentId: 'doc-1', conceptId: 'c', revision: 4 });
		expect(created).toHaveLength(1);
		expect(created[0].sends).toHaveLength(0);
	});
});

describe('the history arithmetic', () => {
	it('reads the rows after a position across pages, pinned to the first head, dropping the repeated origin', async () => {
		const all = historyOf(['A', 'B', 'C', 'D', 'E']);
		const pages: number[] = [];
		let head = 5;
		const fetchPage = async (after: number, limit: number) => {
			pages.push(after);
			const rows = [all[0], ...all.filter((r) => r.seq > after).slice(0, limit - 1)];
			const answer = { rows, newestSeq: head, total: all.length };
			head = 99; // a later page claiming a newer head must not move the pin
			return answer;
		};
		const { rows, head: pinned } = await readHistoryAfter(fetchPage, 2, 2);
		expect(rows.map((r) => r.seq)).toEqual([3, 4, 5]);
		expect(pinned).toBe(5);
		expect(pages).toEqual([2, 3, 4]);
	});
	it('refuses a gap, and a head at or behind the position is nothing to read', async () => {
		const all = historyOf(['A', 'B', 'C']);
		await expect(readHistoryAfter(async () => ({ rows: [all[0], all[1], all[3]], newestSeq: 3, total: 4 }), 0)).rejects.toThrow(/missing|progress/);
		expect((await readHistoryAfter(async () => ({ rows: [all[0]], newestSeq: 1, total: 2 }), 1)).rows).toEqual([]);
	});
	it('appends pulled rows to a clean history and lands on the same tree a full replay does', () => {
		const full = historyOf(['A', 'B', 'C', 'D'], [ANA, ANA, BEN, BEN]);
		const mine = full.slice(0, 3);
		const next = appendPulled<{ title: string }>(mine, full.slice(3));
		expect(next?.revision).toBe(5);
		expect(next?.lastSeq).toBe(4);
		expect(next?.manifest).toEqual(stateAt(full));
		expect(next?.manifest.title).toBe('D');
		expect(appendPulled(mine, [])).toBeNull();
	});
	it('refuses rows that do not continue this history, and replays a multi-row operation whole', () => {
		const full = historyOf(['A', 'B', 'C']);
		expect(() => appendPulled(full.slice(0, 2), full.slice(3))).toThrow(/does not continue/);
		const split: DirectRow[] = [...historyOf(['A']), { seq: 2, kind: 'set', path: '/title', before: 'A', after: 'B', operationId: 'op-x', operationStart: true, operationLabel: 'Two part', resultRevision: 3, actor: BEN }];
		const tail: DirectRow = { seq: 3, kind: 'set', path: '/title', before: 'B', after: 'C', operationId: 'op-x', operationStart: false, operationLabel: null, resultRevision: null, actor: BEN };
		const joined = appendPulled<{ title: string }>(split.slice(0, 2), [split[2], tail]);
		expect(joined?.revision).toBe(3);
		expect(joined?.manifest.title).toBe('C');
	});
	it('the committed position skips this session\'s own unsaved rows', () => {
		const withPending = historyOf(['A', 'B', 'C']);
		expect(committedSeq(withPending, 2)).toBe(1);
		expect(committedSeq(withPending, 4)).toBe(3);
		expect(committedSeq(historyOf([]), 1)).toBe(0);
	});
});

describe('who changed it, in words', () => {
	it('names people through the timeline\'s one rule: the reader is "you", a non-person is never named', () => {
		const rows = historyOf(['A', 'B', 'C', 'D'], [BEN, 'system', ANA, BEN]);
		expect(changedBy(rows.slice(1), ANA)).toEqual(['Ben Ortiz', 'You']);
		expect(updatedSentence(changedBy(rows.slice(1, 2), ANA))).toBe('Updated by Ben Ortiz');
		expect(updatedSentence(changedBy(rows.slice(3, 4), ANA))).toBe('Updated by you in another window');
		expect(updatedSentence(['Ben Ortiz', 'You'])).toBe('Updated by Ben Ortiz and you');
		expect(updatedSentence(['Ben Ortiz', 'Ana Reyes', 'Cam Diaz'])).toBe('Updated by Ben Ortiz and 2 others');
		expect(updatedSentence(changedBy(rows.slice(2, 3), ANA))).toBe('Updated from another session');
	});
	it('the offer names who saved the newer version, and says someone when it could not be read', () => {
		expect(newerSentence(['Ben Ortiz'])).toBe('Ben Ortiz saved a newer version of this model.');
		expect(newerSentence(['You'])).toBe('You saved a newer version of this model in another window.');
		expect(newerSentence([])).toBe('Someone saved a newer version of this model.');
	});
});
