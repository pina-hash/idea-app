// tests/classroom-live-agenda.test.ts
//
// THE FRONT-OF-ROOM AGENDA (ledger 0297, package LIVE), at pinned instants.
//
// The agenda is derived from what the class already holds -- what is due
// today, what opened today, today's notebook check-in -- plus lines a teacher
// types, kept on this device for this class and this day. Two things here fail
// quietly: the DAY (a UTC day puts tomorrow's work on tonight's wall, the
// calendar bug CLAUDE.md names for `session_date`), and a scheduled item that
// has not opened (the wall must not show students something they cannot open
// yet unless the teacher chose to). So the clock is pinned at 8pm Pacific,
// where the Los Angeles day and the UTC day disagree.

import { describe, expect, it } from 'vitest';
import {
	AGENDA_MAX_CHARS,
	AGENDA_MAX_TYPED,
	EMPTY_AGENDA,
	addAgendaLine,
	agendaLines,
	agendaStorageKey,
	derivedAgenda,
	moveAgendaLine,
	parseAgendaStore,
	readAgendaStore,
	removeAgendaLine,
	toggleAgendaLine,
	wallAgenda,
	writeAgendaStore
} from '$lib/classroom/live-class/agenda';
import type { ClassroomItem } from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';

// 8:00pm Pacific on Aug 27, which is 03:00 on Aug 28 in UTC.
const NOW = Date.parse('2026-08-28T03:00:00Z');
const TODAY = '2026-08-27';

const item = (over: Partial<ClassroomItem>): ClassroomItem =>
	({
		id: 'i',
		kind: 'assignment',
		title: 'Untitled',
		body: '',
		published: true,
		publish_at: null,
		due_at: null,
		first_published_at: '2026-08-20T16:00:00Z',
		...over
	}) as unknown as ClassroomItem;

const checkIn = (over: Partial<ClassCheckIn>): ClassCheckIn =>
	({ session_id: 'c', section_id: 's-1', unit_number: 3, session_date: TODAY, session_label: 'Gearbox', ...over }) as ClassCheckIn;

const ITEMS = [
	// Due at 11:59pm Pacific TODAY, which is Aug 28 in UTC.
	item({ id: 'due-tonight', title: 'Truss sketch', due_at: '2026-08-28T06:59:00Z' }),
	// Due at 9:00am Pacific TOMORROW (Aug 28), which UTC also calls Aug 28.
	item({ id: 'due-tomorrow', title: 'Gear ratios', due_at: '2026-08-28T16:00:00Z' }),
	// Posted this afternoon.
	item({ id: 'posted-today', kind: 'material', title: 'Slides: levers', first_published_at: '2026-08-27T21:00:00Z' }),
	// Scheduled to open at 9:30pm tonight: not live yet.
	item({ id: 'opens-tonight', title: 'Quiz 2', publish_at: '2026-08-28T04:30:00Z', first_published_at: null }),
	// A draft due today never reaches the agenda.
	item({ id: 'draft', title: 'Draft', published: false, due_at: '2026-08-28T06:59:00Z' }),
	// Old and not due: not today's business.
	item({ id: 'old', title: 'Week 1 reading' })
];

describe('the derived agenda reads the school day, not the UTC day', () => {
	const lines = derivedAgenda(ITEMS, [checkIn({ session_id: 'today' }), checkIn({ session_id: 'tomorrow', session_date: '2026-08-28' })], TODAY, NOW);

	it("names today's check-in, what is due tonight, what was posted today and what opens later", () => {
		expect(lines.map((l) => l.key)).toEqual([
			'checkin:today',
			'item:posted-today',
			'item:opens-tonight',
			'item:due-tonight'
		]);
	});

	it('leaves out tomorrow, which the UTC day would have called today', () => {
		expect(lines.some((l) => l.key === 'item:due-tomorrow')).toBe(false);
		expect(lines.some((l) => l.key === 'checkin:tomorrow')).toBe(false);
		expect(lines.some((l) => l.key === 'item:draft')).toBe(false);
		expect(lines.some((l) => l.key === 'item:old')).toBe(false);
	});

	it('says when, in the school zone, and holds back what has not opened', () => {
		const due = lines.find((l) => l.key === 'item:due-tonight')!;
		expect(due.when).toBe('Due 11:59 PM');
		expect(due.shownByDefault).toBe(true);
		const opens = lines.find((l) => l.key === 'item:opens-tonight')!;
		expect(opens.when).toBe('Opens 9:30 PM');
		expect(opens.shownByDefault).toBe(false);
		expect(lines.find((l) => l.key === 'checkin:today')!.text).toBe('Notebook check-in: Gearbox');
	});

	it('the wall shows what is shown, and a scheduled line only once the teacher shows it', () => {
		let store = EMPTY_AGENDA;
		expect(wallAgenda(agendaLines(lines, store))).toEqual([
			'Notebook check-in: Gearbox',
			'Slides: levers',
			'Truss sketch · Due 11:59 PM'
		]);
		const opens = lines.find((l) => l.key === 'item:opens-tonight')!;
		store = toggleAgendaLine(store, opens);
		expect(wallAgenda(agendaLines(lines, store))).toContain('Quiz 2 · Opens 9:30 PM');
		const due = lines.find((l) => l.key === 'item:due-tonight')!;
		store = toggleAgendaLine(store, due);
		expect(wallAgenda(agendaLines(lines, store))).not.toContain('Truss sketch · Due 11:59 PM');
		// Toggling twice is a round trip.
		expect(toggleAgendaLine(toggleAgendaLine(EMPTY_AGENDA, due), due)).toEqual(EMPTY_AGENDA);
	});
});

describe('typed lines', () => {
	it('are trimmed, capped, keyed uniquely, moved and removed', () => {
		let s = addAgendaLine(EMPTY_AGENDA, '  Clean   your bench  ');
		s = addAgendaLine(s, 'Exit ticket');
		s = addAgendaLine(s, '   ');
		expect(s.typed.map((t) => t.text)).toEqual(['Clean your bench', 'Exit ticket']);
		expect(new Set(s.typed.map((t) => t.key)).size).toBe(2);
		s = moveAgendaLine(s, s.typed[1].key, -1);
		expect(s.typed.map((t) => t.text)).toEqual(['Exit ticket', 'Clean your bench']);
		expect(moveAgendaLine(s, s.typed[0].key, -1)).toBe(s);
		const gone = s.typed[0].key;
		s = removeAgendaLine(s, gone);
		expect(s.typed.map((t) => t.text)).toEqual(['Clean your bench']);
		// A re-add after a removal cannot collide with a surviving key.
		const again = addAgendaLine(s, 'New');
		expect(new Set(again.typed.map((t) => t.key)).size).toBe(again.typed.length);
		expect(addAgendaLine(EMPTY_AGENDA, 'x'.repeat(500)).typed[0].text).toHaveLength(AGENDA_MAX_CHARS);
		let full = EMPTY_AGENDA;
		for (let i = 0; i < AGENDA_MAX_TYPED + 3; i++) full = addAgendaLine(full, `Line ${i}`);
		expect(full.typed).toHaveLength(AGENDA_MAX_TYPED);
	});
});

describe("this device's copy, per viewer, per class, per day", () => {
	function memoryStorage(seed: Record<string, string> = {}) {
		const map = new Map(Object.entries(seed));
		return {
			map,
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
			removeItem: (k: string) => void map.delete(k),
			key: (i: number) => [...map.keys()][i] ?? null,
			get length() {
				return map.size;
			}
		};
	}

	it('is keyed by viewer, class and day, and a new day sweeps the old one for that class only', () => {
		const key = agendaStorageKey('u-1', 's-1', TODAY);
		expect(key).toBe('idea_live_agenda:u-1:s-1:2026-08-27');
		const storage = memoryStorage({
			'idea_live_agenda:u-1:s-1:2026-08-26': '{"typed":[],"hidden":[],"shown":[]}',
			'idea_live_agenda:u-1:s-2:2026-08-26': '{"typed":[],"hidden":[],"shown":[]}',
			'idea_live_agenda:u-2:s-1:2026-08-26': '{"typed":[],"hidden":[],"shown":[]}',
			'notebook_draft_mirror:u-1:e-1': 'keep'
		});
		const store = addAgendaLine(EMPTY_AGENDA, 'Clean your bench');
		expect(writeAgendaStore(storage, key, store)).toBe(true);
		expect([...storage.map.keys()].sort()).toEqual(
			[
				'idea_live_agenda:u-1:s-1:2026-08-27',
				'idea_live_agenda:u-1:s-2:2026-08-26',
				'idea_live_agenda:u-2:s-1:2026-08-26',
				'notebook_draft_mirror:u-1:e-1'
			].sort()
		);
		expect(readAgendaStore(storage, key)).toEqual(store);
	});

	it('reads what it cannot use as empty, and a refusing storage reports false instead of throwing', () => {
		expect(readAgendaStore(memoryStorage({ k: 'not json' }), 'k')).toEqual(EMPTY_AGENDA);
		expect(readAgendaStore(null, 'k')).toEqual(EMPTY_AGENDA);
		expect(parseAgendaStore({ typed: [{ key: 1, text: 'x' }, { key: 'typed:1', text: 'ok' }], hidden: [3, 'a'] })).toEqual({
			typed: [{ key: 'typed:1', text: 'ok' }],
			hidden: ['a'],
			shown: []
		});
		const refusing = {
			...memoryStorage(),
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		};
		expect(writeAgendaStore(refusing, 'k:1', EMPTY_AGENDA)).toBe(false);
		expect(writeAgendaStore(null, 'k:1', EMPTY_AGENDA)).toBe(false);
	});
});
