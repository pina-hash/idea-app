// tests/dom/palette-voice-mount.test.ts
//
// THE PALETTE'S MICROPHONE, DRIVEN WITH A STUBBED RECOGNISER AND NO MICROPHONE
// (ledger 0298, report 31: voice folded into the command palette).
//
// `$lib/feedback/dictation.ts` ships STRUCTURAL interfaces precisely so this is
// possible: `SpeechRecognitionCtor` is a shape, so a fake with `say()` on it is
// indistinguishable to `Dictation` from the real service. Everything below
// drives the REAL `CommandPalette` through the REAL `Dictation` driver.
//
// SIX CLAIMS, EACH OF WHICH FAILS SILENTLY:
//
//  1. NOTHING IS CONSTRUCTED UNTIL SOMEBODY PRESSES SPEAK. A recogniser built
//     when the dialog opens asks the browser for a microphone on every Ctrl+K.
//  2. A BROWSER WITHOUT THE API GETS NO SPEAK CONTROL, and an explicit `null`
//     means none rather than "go and ask the browser" (the VoiceNav lesson,
//     with a planted constructor as the positive control).
//  3. AN EXACT NAME ACTS, AND ENDS THE SESSION FIRST.
//  4. A MISS ACTS ON NOTHING and leaves the heard words in the field.
//  5. AN INTERIM RESULT ACTS ONLY ONCE IT HAS HELD STILL: one that changes
//     inside the window never acts on its first reading.
//  6. TYPING, CLOSING AND "STOP" EACH END THE SESSION.
//
// NO GEOMETRY IS ASSERTED HERE; see `tests/dom/mount.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import CommandPalette from '$lib/shell/CommandPalette.svelte';
import { registerCommandHandler } from '$lib/shell/command-handlers';
import type { PaletteSources } from '$lib/shell/palette';
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import type {
	SpeechRecognitionCtor,
	SpeechRecognitionErrorLike,
	SpeechRecognitionEventLike,
	SpeechRecognitionLike
} from '$lib/feedback/dictation';
import { VOICE_INTERIM_STABLE_MS } from '$lib/voice/commands';
import * as nav from '../stubs/app-navigation';
import { mountInto, type Mounted } from './mount';

const Palette = CommandPalette as unknown as Component<Record<string, unknown>>;

class Fake implements SpeechRecognitionLike {
	static built = 0;
	static last: Fake | null = null;
	lang = '';
	continuous = false;
	interimResults = false;
	onstart: ((ev: unknown) => void) | null = null;
	onresult: ((ev: SpeechRecognitionEventLike) => void) | null = null;
	onerror: ((ev: SpeechRecognitionErrorLike) => void) | null = null;
	onend: ((ev: unknown) => void) | null = null;
	calls: string[] = [];
	constructor() {
		Fake.built++;
		Fake.last = this;
	}
	start() {
		this.calls.push('start');
		this.onstart?.({});
	}
	stop() {
		this.calls.push('stop');
		this.onend?.({});
	}
	abort() {
		this.calls.push('abort');
	}
	say(text: string) {
		this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, length: 1, 0: { transcript: text } }] });
	}
	hearing(text: string) {
		this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, length: 1, 0: { transcript: text } }] });
	}
}
const FakeCtor = Fake as unknown as SpeechRecognitionCtor;

const SECTION = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 2',
	block: 'B',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
} as ClassroomSection;
const ITEM = {
	id: 'i-1',
	kind: 'assignment',
	title: 'Truss bridge build',
	body: '',
	body_doc: null,
	points: null,
	due_at: null,
	category: null,
	published: true,
	pinned: false,
	unit_id: null,
	sort_order: 0,
	attachments: [],
	links: [],
	postings: [{ section_id: 's-1' }]
} as unknown as ClassroomItem;
const SOURCES: PaletteSources = { section: SECTION, items: [ITEM], units: [], sections: [SECTION], checkIns: [] };
const ENV = { role: 'manager', surface: 'classroom', sectionId: 's-1', itemId: null, basePath: '/classroom', isStaff: true };

const mounted: Mounted[] = [];
const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

/** Mount, open with Ctrl+K from the page, and hand back the mount. */
function openPalette(recognizer: SpeechRecognitionCtor | null | undefined = FakeCtor): Mounted {
	const m = mountInto(Palette, { sources: SOURCES, env: ENV, recognizer });
	mounted.push(m);
	document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
	m.flush();
	return m;
}
const mic = (m: Mounted) => m.target.querySelector<HTMLButtonElement>('[data-testid="palette-mic"]');
const input = (m: Mounted) => m.one<HTMLInputElement>('[data-testid="palette-input"]');
const note = (m: Mounted) => (m.target.querySelector('[data-testid="palette-voice-note"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
function speak(m: Mounted): Fake {
	click(mic(m)!);
	m.flush();
	if (!Fake.last) throw new Error('Speak built no recogniser');
	return Fake.last;
}
const gotos = () => nav.calls.filter((c) => c.fn === 'goto').map((c) => c.args[0]);

beforeEach(() => {
	Fake.built = 0;
	Fake.last = null;
	nav.reset();
});
afterEach(async () => {
	vi.useRealTimers();
	for (const m of mounted.splice(0)) await m.stop();
	for (const d of Array.from(document.querySelectorAll('dialog'))) d.remove();
	delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe('nothing listens until somebody presses Speak', () => {
	it('opening the palette builds no recogniser; Speak builds exactly one', () => {
		const m = openPalette();
		expect(m.all('[data-testid="command-palette"]')).toHaveLength(1);
		expect(mic(m)).toBeTruthy();
		expect(Fake.built).toBe(0);
		const rec = speak(m);
		expect(Fake.built).toBe(1);
		expect(rec.calls).toEqual(['start']);
		// The word says what a press does now; listening is not colour alone.
		expect(mic(m)!.textContent).toMatch(/Stop/);
		expect(note(m)).toMatch(/^Listening\./);
	});
});

describe('a browser without the API gets no Speak control', () => {
	it('an explicit null renders none, even with a constructor planted on window', () => {
		(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeCtor;
		const none = openPalette(null);
		expect(mic(none)).toBeNull();
		expect(none.all('[data-testid="palette-voice-note"]')).toHaveLength(0);
	});
	it('POSITIVE CONTROL: undefined asks the browser, and the planted one answers', () => {
		(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeCtor;
		const asks = openPalette(undefined);
		expect(mic(asks)).toBeTruthy();
		expect(Fake.built).toBe(0);
	});
});

describe('what an utterance does', () => {
	it('an exact name acts: the session ends first, then the palette navigates', async () => {
		const m = openPalette();
		const rec = speak(m);
		rec.say('Open the truss bridge build.');
		await m.settle();
		expect(rec.calls).toContain('abort');
		expect(gotos()).toEqual(['/classroom/s-1/item/i-1']);
		expect(m.all('[data-testid="command-palette"]')).toHaveLength(0);
	});

	it('a registered action runs by its name through its handler', async () => {
		let ran = 0;
		const off = registerCommandHandler('class.new-post', () => void ran++);
		try {
			const m = openPalette();
			speak(m).say('new post');
			await m.settle();
			expect(ran).toBe(1);
			expect(gotos()).toEqual([]);
		} finally {
			off();
		}
	});

	it('a miss acts on nothing, keeps listening, and leaves what it heard in the field', async () => {
		const m = openPalette();
		const rec = speak(m);
		rec.say('truss bridge');
		await m.settle();
		expect(gotos()).toEqual([]);
		expect(rec.calls).toEqual(['start']);
		expect(input(m).value).toBe('truss bridge');
		expect(note(m)).toContain('Heard "truss bridge". Nothing is named exactly that');
		// The ranked list answers the words, so the near miss is one press away.
		expect(m.all('[data-testid="palette-row"]').some((r) => r.textContent?.includes('Truss bridge build'))).toBe(true);
	});
});

describe('an interim result acts only once it has held still', () => {
	it('a stable exact name acts after the window, not before', async () => {
		vi.useFakeTimers();
		const m = openPalette();
		const rec = speak(m);
		rec.hearing('grades');
		m.flush();
		vi.advanceTimersByTime(VOICE_INTERIM_STABLE_MS - 1);
		expect(gotos()).toEqual([]);
		expect(input(m).value).toBe('grades');
		await vi.advanceTimersByTimeAsync(1);
		expect(gotos()).toEqual(['/classroom/s-1/grades']);
		expect(rec.calls).toContain('abort');
	});

	it('an interim that changes inside the window never acts on its first reading', async () => {
		vi.useFakeTimers();
		const m = openPalette();
		const rec = speak(m);
		rec.hearing('grades');
		m.flush();
		vi.advanceTimersByTime(VOICE_INTERIM_STABLE_MS - 50);
		rec.hearing('grades for block');
		m.flush();
		// Well past the FIRST reading's window, short of the idle cap.
		await vi.advanceTimersByTimeAsync(VOICE_INTERIM_STABLE_MS + 50);
		expect(gotos()).toEqual([]);
		expect(rec.calls).toEqual(['start']);
		expect(input(m).value).toBe('grades for block');
	});
});

describe('typing, closing and "stop" each end the session', () => {
	it('typing in the field', () => {
		const m = openPalette();
		const rec = speak(m);
		input(m).dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(rec.calls).toContain('abort');
		expect(mic(m)!.textContent).toMatch(/Speak/);
	});
	it('closing the palette', () => {
		const m = openPalette();
		const rec = speak(m);
		click(m.one('[data-testid="palette-close"]'));
		m.flush();
		expect(rec.calls).toContain('abort');
	});
	it('saying stop, which acts on nothing else', async () => {
		const m = openPalette();
		const rec = speak(m);
		rec.say('stop listening');
		await m.settle();
		expect(rec.calls).toContain('abort');
		expect(gotos()).toEqual([]);
		expect(note(m)).toBe('Stopped listening.');
	});
});
