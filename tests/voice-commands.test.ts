// tests/voice-commands.test.ts
//
// THE PALETTE'S MICROPHONE, AND WHAT IT WILL ACT ON. Its regressions are all
// silent.
//
// Voice has no visible failure mode worth the name: a name that stops matching
// does nothing, a name that starts matching the WRONG row moves somebody off
// the page they were on, and a vocabulary that quietly narrows still renders a
// Speak control that listens politely and never acts. None of those reddens
// anything on screen.
//
// SINCE LEDGER 0298 (report 31) voice is a microphone inside the command
// palette and its vocabulary IS the palette's rows (`paletteEntries`, whose
// actions are `runnableCommands` over `commandsFor(env)`), so four guarantees
// are pinned here:
//
//  1. EXACT, AND ONLY EXACT. An utterance acts on a row only when it IS that
//     row's name after normalisation and one stripped verb. A near-miss, a
//     prefix and a plural act on nothing. No edit distance.
//  2. A TIE ACTS ON NOTHING. Two rows answering to one spoken name is a list
//     to choose from, never a guess.
//  3. THE VOCABULARY IS THE PALETTE'S, SO IT IS GATED BY THE PALETTE'S ROLE
//     FILTER. A manager can say "grades"; a student saying the same word acts
//     on nothing, because no such row is theirs.
//  4. STOP BEATS EVERYTHING, including a row that happens to be named for it.
//
// THE EXPECTED VALUES ARE TYPED BY HAND from the registry and the fixture, not
// derived from the matcher. A table built by calling the matcher and then
// asserting the matcher agrees with it cannot fail.

import { describe, expect, it } from 'vitest';
import {
	VOICE_INTERIM_STABLE_MS,
	VOICE_PRIVACY_NOTE,
	VOICE_STOP_PHRASES,
	matchSpoken,
	spokenForms,
	spokenKey,
	utteranceKey,
	voiceMissNote
} from '$lib/voice/commands';
import { COMMANDS, type CommandEnv } from '$lib/shell/commands';
import { paletteEntries, type PaletteSources } from '$lib/shell/palette';
import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';

const SECTION = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 2',
	block: 'B',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
} as ClassroomSection;
const UNITS = [{ id: 'u-1', course_id: 'c-1', name: 'Bridges', sort_order: 1 }] as ClassroomUnit[];
const item = (id: string, title: string, kind: ClassroomItem['kind']) =>
	({
		id,
		kind,
		title,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		published: true,
		pinned: false,
		unit_id: 'u-1',
		sort_order: 0,
		attachments: [],
		links: [],
		postings: [{ section_id: 's-1' }]
	}) as unknown as ClassroomItem;
const SOURCES: PaletteSources = {
	section: SECTION,
	items: [item('i-1', 'Truss bridge build', 'assignment'), item('i-2', 'Sketching reference', 'material')],
	units: UNITS,
	sections: [SECTION],
	checkIns: []
};
const env = (role: 'student' | 'manager'): CommandEnv => ({
	role,
	surface: 'classroom',
	sectionId: 's-1',
	itemId: null,
	itemKind: null,
	basePath: '/classroom',
	isStaff: role === 'manager',
	isAdmin: false,
	handlers: new Set(COMMANDS.filter((c) => c.run).map((c) => c.id))
});
const rows = (role: 'student' | 'manager') => paletteEntries(SOURCES, env(role));
const hit = (said: string, role: 'student' | 'manager') => {
	const m = matchSpoken(said, rows(role));
	return m.kind === 'one' ? m.entry.key : m.kind;
};

describe('normalisation', () => {
	it('folds case, punctuation and spacing into one key', () => {
		expect(spokenKey('  Truss-Bridge, BUILD! ')).toBe('truss bridge build');
		expect(spokenKey('Café')).toBe('cafe');
	});
	it('strips one leading verb and one trailing courtesy, longest verb first', () => {
		expect(utteranceKey('go to grades please')).toBe('grades');
		expect(utteranceKey('take me to the grades')).toBe('grades');
		expect(utteranceKey('go')).toBe('go');
	});
	it('a name is sayable with and without its own leading verb', () => {
		expect(spokenForms('Open to-do')).toEqual(['open to do', 'to do']);
		expect(spokenForms('Grades')).toEqual(['grades']);
		expect(spokenForms('!!')).toEqual([]);
	});
});

describe('exact, and only exact', () => {
	it('the row a manager names, with or without a verb, and with the service\'s punctuation', () => {
		expect(hit('Grades', 'manager')).toBe('cmd:class.grades');
		expect(hit('open grades', 'manager')).toBe('cmd:class.grades');
		expect(hit('Go to grades, please.', 'manager')).toBe('cmd:class.grades');
		expect(hit('truss bridge build', 'manager')).toBe('item:i-1');
		expect(hit('open the truss bridge build', 'student')).toBe('item:i-1');
		expect(hit('bridges', 'student')).toBe('unit:u-1');
	});
	it('a near-miss, a prefix and a plural act on nothing', () => {
		for (const said of ['grade', 'gradez', 'truss bridge', 'truss bridge builds', 'bridge', 'sketching'])
			expect(hit(said, 'manager'), said).toBe('none');
	});
	it('a tie is a list, never a guess', () => {
		const tied = [
			{ key: 'a', name: 'Notebook' },
			{ key: 'b', name: 'notebook.' }
		];
		const m = matchSpoken('notebook', tied);
		expect(m.kind).toBe('many');
		if (m.kind === 'many') expect(m.entries.map((e) => e.key)).toEqual(['a', 'b']);
		// And one row listed twice under one key is still one row.
		expect(matchSpoken('notebook', [tied[0], tied[0]]).kind).toBe('one');
	});
});

describe('the vocabulary is the palette\'s, so it is gated by the palette\'s role filter', () => {
	it('a student saying a manager\'s action acts on nothing; a manager saying it acts', () => {
		for (const said of ['grades', 'people', 'live class', 'new post']) {
			expect(hit(said, 'student'), said).toBe('none');
			expect(hit(said, 'manager'), said).toMatch(/^cmd:class\./);
		}
	});
	it('POSITIVE CONTROL: a student\'s own action is sayable by a student', () => {
		expect(hit('show missing work', 'student')).toBe('cmd:class.show-missing');
		expect(hit('show missing work', 'manager')).toBe('none');
	});
	it('every action the palette offers is sayable by its own name (none is shadowed into silence)', () => {
		let checked = 0;
		for (const role of ['student', 'manager'] as const) {
			const all = rows(role);
			for (const row of all.filter((r) => r.kind === 'action')) {
				checked++;
				const m = matchSpoken(row.name, all);
				const keys = m.kind === 'one' ? [m.entry.key] : m.kind === 'many' ? m.entries.map((e) => e.key) : [];
				expect(keys, `${role}: ${row.name}`).toContain(row.key);
			}
		}
		expect(checked).toBeGreaterThanOrEqual(20);
	});
});

describe('stop beats everything', () => {
	it('every stop phrase stops, even over a row named for it', () => {
		const rowsWithCancel = [{ key: 'item:x', name: 'Cancel' }, ...rows('manager')];
		for (const said of VOICE_STOP_PHRASES) expect(matchSpoken(said, rowsWithCancel).kind, said).toBe('stop');
		expect(matchSpoken('Stop listening.', []).kind).toBe('stop');
	});
});

describe('what a miss says', () => {
	it('names what it heard, and where to look', () => {
		expect(voiceMissNote(matchSpoken('gradez', rows('manager')))).toBe(
			'Heard "gradez". Nothing is named exactly that, so the closest matches are listed. Pick one, or say a name from the list.'
		);
		expect(voiceMissNote(matchSpoken('notebook', [{ key: 'a', name: 'Notebook' }, { key: 'b', name: 'Notebook' }]))).toBe(
			'Heard "notebook", which names 2 things. Pick one from the list, or say more of its name.'
		);
		expect(voiceMissNote({ kind: 'none', heard: '' })).toBe('Nothing was heard yet. Say the name of anything in the list.');
	});
	it('an interim result waits about 300ms of stillness', () => {
		expect(VOICE_INTERIM_STABLE_MS).toBe(300);
	});
});

describe('the sentence a person reads before the microphone is asked for', () => {
	/**
	 * PINNED BY MEANING, NOT BY BYTES: off until pressed, off again on close,
	 * nothing recorded, nothing sent.
	 */
	it('states all four claims', () => {
		const note = VOICE_PRIVACY_NOTE.toLowerCase();
		expect(note).toContain('off until you press speak');
		expect(note).toContain('closing search turns it off');
		expect(note).toContain('never records audio');
		expect(note).toContain('never sends what you say anywhere');
	});
});
