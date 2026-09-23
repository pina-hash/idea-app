// tests/dom/voice-nav-mount.test.ts
//
// VOICE NAVIGATION, DRIVEN WITH A STUBBED RECOGNISER AND NO MICROPHONE.
//
// `$lib/feedback/dictation.ts` ships STRUCTURAL interfaces precisely so this is
// possible: `SpeechRecognitionCtor` is a shape, not a browser global, so a fake
// with a `say()` method on it is indistinguishable to `Dictation` from the real
// service. Everything below drives the REAL `VoiceNav` component through the
// REAL `Dictation` driver; the only thing replaced is the thing that would have
// opened a microphone.
//
// FOUR CLAIMS, EACH OF WHICH FAILS SILENTLY:
//
//  1. NOTHING IS CONSTRUCTED UNTIL SOMEBODY PRESSES START. A recogniser built
//     at mount asks the browser for a microphone at mount. That is the single
//     worst regression this feature can have and it is invisible in code review
//     -- the prompt appears on a real device, once, to a real student.
//  2. A BROWSER WITHOUT THE API GETS NO CONTROL AT ALL. Absence is the
//     mechanism; a disabled button that errors when pressed is the failure.
//  3. A MATCH NAVIGATES, AND ENDS THE SESSION. One activation is one command,
//     which is the whole of what bounds how long the microphone is open.
//  4. A MISS NAVIGATES NOWHERE. A near-miss that guesses is strictly worse than
//     one that does nothing, and a matcher that started guessing would look
//     like a feature working better.
//
// NO GEOMETRY IS ASSERTED HERE. happy-dom has no layout engine; the 44px
// targets and the contrast live in `npm run verify:browser`. See
// `tests/dom/mount.ts`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import VoiceNav from '$lib/voice/VoiceNav.svelte';
import type {
	SpeechRecognitionCtor,
	SpeechRecognitionErrorLike,
	SpeechRecognitionEventLike,
	SpeechRecognitionLike
} from '$lib/feedback/dictation';
import { VOICE_ACTIONS, voiceDestinations } from '$lib/voice/commands';
import { mountInto, type Mounted } from './mount';

const Nav = VoiceNav as unknown as Component<Record<string, unknown>>;

/** The stub the whole file drives. Counts its own constructions. */
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
	/** One committed utterance, exactly as the service delivers one. */
	say(text: string) {
		this.onresult?.({
			resultIndex: 0,
			results: [{ isFinal: true, length: 1, 0: { transcript: text } }]
		});
	}
	/** Words the service has not committed to yet. */
	hearing(text: string) {
		this.onresult?.({
			resultIndex: 0,
			results: [{ isFinal: false, length: 1, 0: { transcript: text } }]
		});
	}
}
const FakeCtor = Fake as unknown as SpeechRecognitionCtor;

const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

const mounted: Mounted[] = [];
const went: string[] = [];

interface Opts {
	signedIn?: boolean;
	isAdmin?: boolean;
	suppressed?: boolean;
	recognizer?: SpeechRecognitionCtor | null;
	startOpen?: boolean;
}

function open(opts: Opts = {}): Mounted {
	const m = mountInto(Nav, {
		signedIn: true,
		isAdmin: true,
		recognizer: FakeCtor,
		startOpen: true,
		navigate: (href: string) => went.push(href),
		...opts
	});
	mounted.push(m);
	return m;
}

/** Press Start and hand back the recogniser that press constructed. */
function listen(m: Mounted): Fake {
	const start = m.target.querySelector('.vnav-start');
	if (!start) throw new Error('no Start control on screen');
	click(start);
	m.flush();
	const rec = Fake.last;
	if (!rec) throw new Error('Start built no recogniser');
	return rec;
}

beforeEach(() => {
	Fake.built = 0;
	Fake.last = null;
	went.length = 0;
	// happy-dom has no scroll implementation; the two scroll ACTIONS are
	// exercised for their dispatch, not their effect, which is a geometry claim
	// and belongs in the browser harness.
	(window as unknown as { scrollTo: (o: unknown) => void }).scrollTo = () => {};
});

afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

describe('nothing listens until somebody says so', () => {
	it('builds no recogniser at mount, and none when the panel is opened', () => {
		const m = open({ startOpen: false });
		expect(Fake.built).toBe(0);
		// The control is there: this is the positive control for the zero above.
		const trigger = m.one<HTMLButtonElement>('.vnav-trigger');
		expect(trigger).toBeTruthy();
		click(trigger);
		m.flush();
		expect(m.all('.vnav-panel')).toHaveLength(1);
		// Opening the panel is reading, not listening.
		expect(Fake.built).toBe(0);
		expect(m.all('.vnav-start')).toHaveLength(1);
		expect(m.all('.vnav-stop')).toHaveLength(0);
	});

	it('builds exactly one when Start is pressed, and reports it is listening', () => {
		const m = open();
		const rec = listen(m);
		expect(Fake.built).toBe(1);
		expect(rec.calls).toEqual(['start']);
		expect(m.all('.vnav-stop')).toHaveLength(1);
		expect(m.all('.vnav-start')).toHaveLength(0);
		expect(m.one('.vnav-trigger').textContent).toMatch(/listening/i);
	});

	it('the word changes, so listening is never signalled by colour alone', () => {
		const m = open();
		expect(m.one('.vnav-trigger').textContent).toMatch(/voice/i);
		expect(m.one('.vnav-trigger').textContent).not.toMatch(/listening/i);
		listen(m);
		expect(m.one('.vnav-trigger').textContent).toMatch(/listening/i);
		expect(m.one('.vnav-state').textContent).toMatch(/microphone open/i);
	});

	it('Stop ends the session and says so', () => {
		const m = open();
		const rec = listen(m);
		click(m.one('.vnav-stop'));
		m.flush();
		expect(rec.calls).toContain('stop');
		expect(m.all('.vnav-start')).toHaveLength(1);
		expect(m.one('.vnav-state').textContent).toMatch(/microphone off/i);
	});
});

describe('a browser without the API gets nothing', () => {
	/**
	 * BOTH DIRECTIONS AND BOTH COUNTS, which is what makes the absence mean
	 * something: 0 controls with no constructor, against 1 trigger, 1 Start and
	 * 1 panel on the identical props with one.
	 */
	/**
	 * THE PLANTED CONSTRUCTOR IS THE POSITIVE CONTROL FOR THE CONTROL, and it is
	 * here because this assertion once passed for the wrong reason. The
	 * component read `recognizer ?? dictationConstructor()`, so an explicit
	 * `null` fell THROUGH to the browser -- and happy-dom has no
	 * `webkitSpeechRecognition`, so the fallback answered null too and the test
	 * was green while a real Chromium rendered a control that would open a real
	 * microphone. Planting one on `window` makes the fallback reachable here, so
	 * the row below fails if `null` ever stops meaning "none".
	 */
	beforeEach(() => {
		(window as unknown as Record<string, unknown>).SpeechRecognition = FakeCtor;
	});
	afterEach(() => {
		delete (window as unknown as Record<string, unknown>).SpeechRecognition;
	});

	it('the planted constructor is reachable, so the row below is not vacuous', () => {
		// No `recognizer` prop at all: the component asks the browser, and finds
		// the planted one.
		const asked = open({ recognizer: undefined, startOpen: true });
		expect(asked.all('.vnav-trigger')).toHaveLength(1);
	});

	it('renders no control at all, against a full control with one', () => {
		const without = open({ recognizer: null, startOpen: true });
		expect(without.all('.vnav-trigger')).toHaveLength(0);
		expect(without.all('.vnav-panel')).toHaveLength(0);
		expect(without.all('button')).toHaveLength(0);

		const with_ = open({ startOpen: true });
		expect(with_.all('.vnav-trigger')).toHaveLength(1);
		expect(with_.all('.vnav-panel')).toHaveLength(1);
		expect(with_.all('.vnav-start')).toHaveLength(1);
	});

	it('a surface that owns its viewport gets nothing either', () => {
		const m = open({ suppressed: true });
		expect(m.all('.vnav-trigger')).toHaveLength(0);
		expect(m.all('button')).toHaveLength(0);
	});
});

describe('every phrase in the vocabulary navigates where the list says', () => {
	const destinations = voiceDestinations({ signedIn: true, isAdmin: true });

	it('drives the whole printed list through the real driver', () => {
		const m = open();
		const results: [string, string][] = [];
		for (const d of destinations) {
			// The PRINTED phrase, the one the panel tells a person to say.
			const rec = listen(m);
			rec.say(d.phrases[0]);
			m.flush();
			results.push([d.phrases[0], went[went.length - 1] ?? '(nothing)']);
		}
		expect(results).toEqual(destinations.map((d) => [d.phrases[0], d.href]));
		// The sweep generated something.
		expect(results.length).toBeGreaterThan(12);
		expect(went).toHaveLength(destinations.length);
	});

	it('accepts a leading verb and trailing punctuation from the service', () => {
		const m = open();
		const rec = listen(m);
		rec.say('Go to my notebook.');
		m.flush();
		expect(went).toEqual(['/classroom/notebook']);
	});

	/**
	 * A MATCH ENDS THE SESSION BEFORE IT NAVIGATES. This is what bounds how
	 * long a microphone is open: not a timer somebody has to trust, but the
	 * fact that acting on a command is also the end of the activation.
	 */
	it('drops the recogniser on a match, before navigating', () => {
		const m = open();
		const rec = listen(m);
		rec.say('maps');
		m.flush();
		expect(rec.calls).toContain('abort');
		expect(went).toEqual(['/maps']);
		expect(m.all('.vnav-start')).toHaveLength(1);
		expect(m.one('.vnav-state').textContent).toMatch(/microphone off/i);
	});
});

describe('a miss goes nowhere', () => {
	it('navigates nowhere, says what it heard, and keeps listening', () => {
		const m = open();
		const rec = listen(m);
		rec.say('please open the gauntlets');
		m.flush();
		expect(went).toEqual([]);
		expect(m.one('.vnav-live-region').textContent).toMatch(/gauntlets/);
		expect(m.one('.vnav-live-region').textContent).toMatch(/not a command/i);
		// Still open, so the person can simply say it again.
		expect(rec.calls).not.toContain('abort');
		expect(m.all('.vnav-stop')).toHaveLength(1);
	});

	it('the retry lands', () => {
		const m = open();
		const rec = listen(m);
		rec.say('gauntlets');
		m.flush();
		expect(went).toEqual([]);
		rec.say('gauntlet');
		m.flush();
		expect(went).toEqual(['/gauntlet']);
	});

	/**
	 * INTERIM TEXT IS SHOWN AND NEVER MATCHED. A service changes its mind about
	 * a word several times before committing to it, and acting on an uncommitted
	 * transcript is how half a sentence navigates.
	 */
	it('shows what it is hearing without acting on it', () => {
		const m = open();
		const rec = listen(m);
		rec.hearing('maps');
		m.flush();
		expect(went).toEqual([]);
		expect(m.one('.vnav-interim').textContent).toMatch(/maps/);
		rec.say('maps');
		m.flush();
		expect(went).toEqual(['/maps']);
	});
});

describe('the page actions', () => {
	it('"stop" ends the session and navigates nowhere', () => {
		const m = open();
		const rec = listen(m);
		rec.say('stop listening');
		m.flush();
		expect(went).toEqual([]);
		expect(rec.calls).toContain('abort');
		expect(m.all('.vnav-start')).toHaveLength(1);
	});

	it('"help" opens the list and navigates nowhere', () => {
		const m = open({ startOpen: false });
		const trigger = m.one<HTMLButtonElement>('.vnav-trigger');
		click(trigger);
		m.flush();
		const rec = listen(m);
		click(m.one('.vnav-close'));
		m.flush();
		expect(m.all('.vnav-panel')).toHaveLength(0);
		rec.say('what can i say');
		m.flush();
		expect(went).toEqual([]);
		expect(m.all('.vnav-panel')).toHaveLength(1);
	});

	it('every action phrase resolves without navigating', () => {
		const m = open();
		for (const action of VOICE_ACTIONS) {
			const rec = listen(m);
			rec.say(action.phrases[0]);
			m.flush();
		}
		expect(went).toEqual([]);
		expect(VOICE_ACTIONS.length).toBe(5);
	});
});

describe('the list on screen is the list that works', () => {
	it('prints one row per destination, and the admin rows only for an admin', () => {
		const forAdmin = open();
		const adminRows = forAdmin.all('.vnav-list')[0].querySelectorAll('li');
		expect(adminRows).toHaveLength(voiceDestinations({ signedIn: true, isAdmin: true }).length);
		expect(forAdmin.target.textContent).toContain('Coin Desk');

		const forStudent = open({ isAdmin: false });
		const studentRows = forStudent.all('.vnav-list')[0].querySelectorAll('li');
		expect(studentRows).toHaveLength(voiceDestinations({ signedIn: true, isAdmin: false }).length);
		expect(forStudent.target.textContent).not.toContain('Coin Desk');
		// Positive control for the absence: the student list is not empty.
		expect(studentRows.length).toBeGreaterThan(8);
	});

	it('states where the audio goes, before the Start control is reached', () => {
		const m = open();
		const html = m.one('.vnav-panel').innerHTML;
		expect(html.indexOf('vnav-note')).toBeLessThan(html.indexOf('vnav-start'));
		expect(m.one('.vnav-note').textContent).toMatch(/never records audio/i);
	});
});
