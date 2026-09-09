// tests/classroom-live.test.ts
//
// The class pane's live-notice bus (prompt 0118, item SIX). What would regress
// SILENTLY here is the shape of the contract rather than the network: a
// listener that hears its own announce (one wasted round trip per write, on
// every write), a listener that keeps hearing after it unsubscribed, or a
// payload topic that reaches a component as a string it has no branch for.
// The memory twin is the real implementation of the interface, so what is
// asserted of it is what the components are driven against in the harness.

import { describe, expect, it } from 'vitest';
import {
	CLASSROOM_LIVE_TOPICS,
	classroomLiveChannelName,
	classroomLiveTopicOf,
	createMemoryClassroomLive,
	isClassroomLiveTopic
} from '../src/lib/classroom/live';

describe('the topic vocabulary', () => {
	it('is exactly the two tools, and nothing else parses as one', () => {
		expect([...CLASSROOM_LIVE_TOPICS]).toEqual(['hall-pass', 'song-queue']);
		expect(isClassroomLiveTopic('hall-pass')).toBe(true);
		expect(isClassroomLiveTopic('song-queue')).toBe(true);
		expect(isClassroomLiveTopic('roster')).toBe(false);
		expect(isClassroomLiveTopic(undefined)).toBe(false);
	});

	it('a payload is data: an unknown or malformed topic is dropped, never passed on', () => {
		expect(classroomLiveTopicOf({ topic: 'hall-pass' })).toBe('hall-pass');
		expect(classroomLiveTopicOf({ topic: 'drop table' })).toBeNull();
		expect(classroomLiveTopicOf('hall-pass')).toBeNull();
		expect(classroomLiveTopicOf(null)).toBeNull();
		expect(classroomLiveTopicOf({})).toBeNull();
	});

	it('one channel per section, named for it', () => {
		expect(classroomLiveChannelName('abc')).toBe('classroom-live:abc');
		expect(classroomLiveChannelName('abc')).not.toBe(classroomLiveChannelName('abd'));
	});
});

describe('the memory bus', () => {
	it('an announce reaches every other listener of that section and no other section', () => {
		const live = createMemoryClassroomLive();
		const heardA: string[] = [];
		const heardB: string[] = [];
		const heardOther: string[] = [];
		live.subscribe('s1', (t) => heardA.push(t));
		live.subscribe('s1', (t) => heardB.push(t));
		live.subscribe('s2', (t) => heardOther.push(t));
		live.announce('s1', 'hall-pass');
		expect(heardA).toEqual(['hall-pass']);
		expect(heardB).toEqual(['hall-pass']);
		expect(heardOther).toEqual([]);
		expect(live.announced).toEqual([{ sectionId: 's1', topic: 'hall-pass' }]);
	});

	it('a listener that unsubscribed hears nothing more, and the count says so', () => {
		const live = createMemoryClassroomLive();
		const heard: string[] = [];
		const stop = live.subscribe('s1', (t) => heard.push(t));
		expect(live.listenerCount('s1')).toBe(1);
		live.announce('s1', 'song-queue');
		stop();
		expect(live.listenerCount('s1')).toBe(0);
		live.announce('s1', 'song-queue');
		expect(heard).toEqual(['song-queue']);
	});

	it('status reports live at once, which is what a joined channel reports', () => {
		const live = createMemoryClassroomLive();
		const statuses: string[] = [];
		live.subscribe('s1', () => {}, (s) => statuses.push(s));
		expect(statuses).toEqual(['live']);
	});

	it('an announce made from inside a change handler does not echo back to that handler', () => {
		// `self: false` to the letter: the client that wrote does not hear its
		// own notice. The memory twin identifies "self" as the listener that is
		// mid-callback, which is the only identity it has.
		const live = createMemoryClassroomLive();
		let echoes = 0;
		const other: string[] = [];
		live.subscribe('s1', (t) => {
			echoes += 1;
			if (echoes === 1 && t === 'hall-pass') live.announce('s1', 'song-queue');
		});
		live.subscribe('s1', (t) => other.push(t));
		live.announce('s1', 'hall-pass');
		expect(echoes).toBe(1);
		// Delivery is synchronous and the nested announce runs INSIDE the first
		// listener's callback, so the other listener hears the nested topic
		// first; what is pinned is that it hears BOTH and the announcer hears
		// neither echo, not the order.
		expect([...other].sort()).toEqual(['hall-pass', 'song-queue']);
	});
});
