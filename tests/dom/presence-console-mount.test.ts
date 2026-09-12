// tests/dom/presence-console-mount.test.ts
//
// 0200: THE INSTRUCTOR SIDE, MOUNTED, IN BOTH DIRECTIONS.
//
// Every visibility claim in this repo is asserted BOTH WAYS -- what must be
// present alongside what must be absent, with both counts reported -- because
// "the read-only view has no edit controls" is not a result and "0 forms
// against 6 on the same fixture with transports handed in" is. So this file
// mounts the REAL `GradingConsole` twice against the identical roster, once
// with a presence transport and once without, and the absence half is the
// positive control for the presence half.
//
// WHY THE ABSENCE MATTERS MORE THAN IT LOOKS. A deployment sitting before 0200
// has no `classroom_presence_state` at all -- the transport's `PGRST202` rung
// answers null -- and a console that drew the region anyway would tell an
// instructor every student was away when the truth is that nobody asked. That
// is not a cosmetic degradation: it is a false statement about a child, made
// confidently, on the surface a teacher acts from. Absence is therefore
// STRUCTURAL (no transport, no region) rather than a flag somebody could get
// wrong.
//
// AND THE COVERAGE SENTENCE IS ASSERTED AS PRESENT WHENEVER THE FIGURES ARE.
// A working-time figure read as effort can cost a student a conversation they
// did not earn, and the sentence is the only thing on screen that says what the
// number does not include.
//
// NO GEOMETRY IS ASSERTED HERE. happy-dom has no layout engine, so the chip's
// box, its contrast and its tap-target size are read as zero and would pass
// vacuously. Those belong to `npm run verify:browser` and to
// `tools/browser-verify/routes/presence-*.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import GradingConsole from '$lib/classroom/GradingConsole.svelte';
import {
	PRESENCE_COVERAGE_NOTE,
	PRESENCE_NEVER_OPENED,
	PRESENCE_LIMITS_FALLBACK,
	type PresencePayload
} from '$lib/classroom/presence/state';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;

afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const SECTION = { id: 's1', label: 'Period 1', course: { code: 'IDEA100', title: 'Design' } };
const ITEM = {
	id: 'i1',
	kind: 'assignment' as const,
	title: 'Bridge Sketch',
	body: 'Do it.',
	points: 20,
	published: true
};

/**
 * THE FIXTURE IS BUILT RELATIVE TO THE REAL CLOCK, and it has to be. The console
 * threads its OWN `now` down to every row -- `presenceNow`, read once per poll
 * so thirty rows are rendered at one instant -- and that clock is the real one.
 * A fixture pinned to a literal instant therefore measures the distance between
 * that literal and whenever the suite happens to run, which on the afternoon
 * this was written put every row in the FUTURE and reported three students as
 * `working` who were meant to be viewing, elsewhere and away.
 *
 * The offsets below are what the states actually turn on, so they are chosen
 * well clear of every boundary: nothing here sits within a minute of the 60s
 * input window or the 120s away window, and the few milliseconds a mount takes
 * cannot move a case across one.
 */
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

/**
 * FOUR STUDENTS, ONE PER STATE, PLUS A FIFTH WITH NO ROW AT ALL. The fifth is
 * the case the payload cannot carry and the roster has to answer.
 */
const ROSTER = [
	{ student_email: 'ana@boscotech.net', display_name: 'Ana Reyes', active: true },
	{ student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: true },
	{ student_email: 'cruz@boscotech.net', display_name: 'Cruz Delgado', active: true },
	{ student_email: 'dee@boscotech.net', display_name: 'Dee Marsh', active: true },
	{ student_email: 'eli@boscotech.net', display_name: 'Eli Nakamura', active: true }
];

/**
 * THE REAL `GradingData` SHAPE, built to what `studentWorkRows` actually reads
 * rather than to what a roster looked like it needed. The roster is the only
 * populated half: this file is about presence, and a student with no work is
 * exactly the row a presence line is most informative on.
 */
const GRADING = {
	roster: ROSTER,
	submissions: [],
	responses: [],
	files: [],
	approvals: []
};

const PRESENCE: PresencePayload = {
	item_id: 'i1',
	section_id: 's1',
	at: new Date().toISOString(),
	limits: PRESENCE_LIMITS_FALLBACK,
	students: [
		{
			student_email: 'ana@boscotech.net',
			state: 'working',
			last_seen_at: ago(5),
			last_input_at: ago(5),
			page_visible: true,
			active_seconds: 1_500
		},
		{
			student_email: 'ben@boscotech.net',
			state: 'viewing',
			last_seen_at: ago(10),
			last_input_at: ago(400),
			page_visible: true,
			active_seconds: 240
		},
		{
			student_email: 'cruz@boscotech.net',
			state: 'open-elsewhere',
			last_seen_at: ago(20),
			last_input_at: ago(90),
			page_visible: false,
			active_seconds: 45
		},
		{
			student_email: 'dee@boscotech.net',
			state: 'away',
			last_seen_at: ago(600),
			last_input_at: ago(650),
			page_visible: true,
			active_seconds: 0
		}
		// `eli` HAS NO ROW. Never opened the assignment.
	]
};

function mountConsole(withPresence: boolean): Mounted {
	return mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
		section: SECTION,
		item: ITEM,
		spec: null,
		rubric: [
			{
				id: 'c1',
				criterion: 'Sketch',
				points: 20,
				levels: [
					{ label: 'Proficient', short: 'P', points: 20, descriptor: 'Clear.' },
					{ label: 'Developing', short: 'D', points: 10, descriptor: 'Rough.' },
					{ label: 'Not yet', short: 'NY', points: 0, descriptor: 'Nothing.' }
				]
			}
		],
		transports: {
			loadGrading: async () => ({ ok: true, data: GRADING })
		},
		presence: withPresence
			? { loadPresence: async () => PRESENCE }
			: null
	});
}

describe('with a presence transport', () => {
	it('draws one presence line per roster row, including the student with no row', async () => {
		mounted = mountConsole(true);
		await mounted.settle();

		const lines = mounted.all('[data-testid="presence-line"]');
		// FIVE ROWS, FOUR WITH A CHIP AND ONE WITHOUT. The fifth is not a missing
		// line -- it is the answer "never opened", which the payload cannot carry
		// because there is no row to carry it.
		expect(lines).toHaveLength(5);
		expect(mounted.all('[data-testid="presence-chip"]')).toHaveLength(4);
		expect(mounted.all('[data-testid="presence-never"]')).toHaveLength(1);
		expect(mounted.one('[data-testid="presence-never"]').textContent?.trim()).toBe(
			PRESENCE_NEVER_OPENED
		);
	});

	it('each of the four states is drawn once, with its own word and glyph', async () => {
		mounted = mountConsole(true);
		await mounted.settle();

		const chips = mounted.all('[data-testid="presence-chip"]');
		const states = chips.map((c) => c.getAttribute('data-presence-state'));
		expect(states).toEqual(['working', 'viewing', 'open-elsewhere', 'away']);

		// COLOUR IS NEVER THE ONLY SIGNAL. Every chip carries a word AND a glyph,
		// and the words are distinct -- a chip that had lost its word would leave
		// the hue doing the whole job.
		const words = chips.map((c) => c.querySelector('.pword')?.textContent?.trim());
		expect(words).toEqual(['Working', 'Viewing', 'Open elsewhere', 'Away']);
		expect(new Set(words).size).toBe(4);
		for (const chip of chips) {
			const glyph = chip.querySelector('.pglyph');
			expect(glyph?.textContent?.trim().length).toBeGreaterThan(0);
			// The word is always beside it, which is exactly why the mark is hidden
			// from assistive tech rather than labelled.
			expect(glyph?.getAttribute('aria-hidden')).toBe('true');
		}
	});

	it('prints when each student last worked and how long they have worked', async () => {
		mounted = mountConsole(true);
		await mounted.settle();

		const active = mounted.all('[data-testid="presence-active"]').map((e) => e.textContent?.trim());
		// 1500s is 25m, 240s is 4m, 45s stays in seconds, 0 is not blank.
		expect(active).toEqual(['25m active', '4m active', '45s active', '0s active']);

		const worked = mounted.all('[data-testid="presence-worked"]').map((e) => e.textContent?.trim());
		// `Just now` under a minute, whole minutes above it. Every offset is well
		// clear of a boundary, so these are exact rather than approximate.
		expect(worked).toEqual(['Just now', '6m ago', '1m ago', '10m ago']);
	});

	it('renders the coverage sentence, once, above the list', async () => {
		mounted = mountConsole(true);
		await mounted.settle();
		const notes = mounted.all('[data-testid="presence-note"]');
		expect(notes).toHaveLength(1);
		expect(notes[0].textContent?.trim()).toBe(PRESENCE_COVERAGE_NOTE);
		// IT SAYS WHAT THE NUMBER DOES NOT INCLUDE, in words, not by implication.
		expect(notes[0].textContent).toMatch(/paper/i);
	});

	it('adds no control -- presence is information, not an action', async () => {
		mounted = mountConsole(true);
		await mounted.settle();
		for (const line of mounted.all('[data-testid="presence-line"]')) {
			expect(line.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
		}
	});
});

describe('with no presence transport -- the positive control for every absence above', () => {
	it('draws no presence anywhere, and the roster is otherwise identical', async () => {
		mounted = mountConsole(false);
		await mounted.settle();

		// THE ABSENCE, WITH ITS COUNTS. 0 lines, 0 chips, 0 notes -- against 5, 4
		// and 1 on the identical fixture one describe block up.
		expect(mounted.all('[data-testid="presence-line"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="presence-chip"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="presence-note"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="presence-never"]')).toHaveLength(0);

		// AND THE ROSTER IS STILL THERE, which is what makes the absence a removed
		// REGION rather than a console that failed to load.
		expect(mounted.all('.roster-row').length).toBe(5);
	});

	it('nothing on screen claims a student is away', async () => {
		// The failure this absence exists to prevent, asserted as text: a console
		// with no presence must not state anything about where a student is.
		mounted = mountConsole(false);
		await mounted.settle();
		const text = mounted.target.textContent ?? '';
		expect(text).not.toMatch(/\bAway\b/);
		expect(text).not.toMatch(/\bWorking\b/);
		expect(text).not.toMatch(/Open elsewhere/);
		expect(text).not.toContain(PRESENCE_NEVER_OPENED);
	});
});
