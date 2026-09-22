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
	PRESENCE_STALE_NOTE,
	PRESENCE_UNKNOWN,
	PRESENCE_LIMITS_FALLBACK,
	presenceLineKind,
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

/**
 * WORK ON THE ROSTER, FOR THE ONE CASE THE PRESENCE-ONLY FIXTURE CANNOT SHOW.
 *
 * `GRADING` above is deliberately empty -- a student with nothing handed in is
 * the row a presence line is most informative on -- but the defect Mr. Pina
 * reported is the OPPOSITE row: work that arrived, with "Not opened" printed
 * underneath it. So this is the same roster with `eli`, the student presence has
 * no row for, having handed the assignment in and had it RETURNED. A console
 * that prints a verdict about him from the heartbeat table is contradicting the
 * chip on the line above.
 */
const GRADING_WITH_WORK = {
	roster: ROSTER,
	submissions: [
		{ student_email: 'eli@boscotech.net', item_id: 'i1', state: 'returned', score: 18 }
	],
	responses: [
		{ student_email: 'eli@boscotech.net', item_id: 'i1', block_id: 'b1', value: 'My answer' }
	],
	files: [],
	approvals: []
};

function mountConsole(
	withPresence: boolean,
	options: {
		loadPresence?: () => Promise<PresencePayload | null>;
		grading?: unknown;
	} = {}
): Mounted {
	const grading = options.grading ?? GRADING;
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
			loadGrading: async () => ({ ok: true, data: grading })
		},
		presence: withPresence
			? { loadPresence: options.loadPresence ?? (async () => PRESENCE) }
			: null
	});
}

/** One row's name, work chip and presence line, as three strings. */
function rosterLines(m: Mounted) {
	return [...m.target.querySelectorAll('.roster-item')].map((r) => ({
		name: r.querySelector('.roster-name')?.textContent?.trim() ?? null,
		chip: r.querySelector('.roster-chip')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
		presence:
			r.querySelector('[data-testid="presence-line"]')?.textContent?.replace(/\s+/g, ' ').trim() ??
			null
	}));
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

/**
 * =========================================================================
 * 0278: "NOT OPENED" IS A VERDICT AND IT HAS TO BE EARNED.
 * =========================================================================
 *
 * Mr. Pina, grading on 2026-09-12: "grading status says not opened ... but the
 * student has opened it and completed it, it's definitely a wrong status."
 *
 * WHAT IT WAS. `PresenceLine` had two branches -- a row, or
 * `PRESENCE_NEVER_OPENED` -- and the console handed it
 * `presenceRows.get(email) ?? null`, where `presenceRows` is
 * `presenceByEmail(presenceData)` and `presenceData` was a single nullable
 * payload. So `null` meant FOUR different things and printed one sentence for
 * all of them. Measured on this component before the fix, every one of the four
 * printed "Not opened" under a chip reading "Returned · 18/20":
 *
 *   presence never resolves     -> Not opened   (EVERY row, on EVERY load)
 *   transport answered null     -> Not opened   (a deployment before 0200)
 *   the read threw              -> Not opened   (a swallowed network error)
 *   resolved with zero rows     -> Not opened   (retention sweep, or pre-0200 work)
 *
 * Only the fourth is a case where the verdict could be right, and only when the
 * student also handed nothing in.
 *
 * WHY THIS IS A `tests/dom/` FILE AND NOT A BROWSER PASS. Every claim here is
 * about WHICH STRING a row prints, which happy-dom answers exactly; and the four
 * states are reached by handing the real component four transports, which no URL
 * can do. The geometry that came out of the same report -- how many names fit --
 * is `npm run verify:browser`, where it can be measured rather than read as zero.
 */
describe('a missing presence row is three answers, and only one of them is a verdict', () => {
	const NEVER_RESOLVES = () => new Promise<PresencePayload | null>(() => {});
	const EMPTY_PAYLOAD: PresencePayload = {
		item_id: 'i1',
		section_id: 's1',
		at: new Date().toISOString(),
		limits: PRESENCE_LIMITS_FALLBACK,
		students: []
	};

	it('prints "Not known", never "Not opened", while the first poll is in flight', async () => {
		mounted = mountConsole(true, { loadPresence: NEVER_RESOLVES });
		await mounted.settle();

		// THE POSITIVE CONTROL FIRST: the roster IS rendered, so the counts below
		// are about what the rows say rather than about a console that never drew.
		expect(mounted.all('.roster-row')).toHaveLength(5);
		expect(mounted.all('[data-testid="presence-unknown"]')).toHaveLength(5);
		expect(mounted.all('[data-testid="presence-never"]')).toHaveLength(0);
		expect(mounted.one('[data-testid="presence-unknown"]').textContent?.trim()).toBe(
			PRESENCE_UNKNOWN
		);
		// AND THE CHIPS ARE STILL THERE. Nothing about presence touches the work
		// column, which is the whole reason it is best-effort instrumentation.
		expect(mounted.all('[data-testid="presence-chip"]')).toHaveLength(0);
	});

	it('removes the whole region when the transport says this deployment has no presence', async () => {
		// The `PGRST202` rung answers null, and THAT is the absence the
		// "no transport, no region" rule was always meant to cover. It never fired:
		// the region keyed on the TRANSPORT OBJECT, which the grade route hands in
		// unconditionally and correctly, so every row read "Not opened" instead.
		mounted = mountConsole(true, { loadPresence: async () => null });
		await mounted.settle();

		expect(mounted.all('.roster-row')).toHaveLength(5); // the positive control
		expect(mounted.all('[data-testid="presence-line"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="presence-note"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="presence-never"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="presence-unknown"]')).toHaveLength(0);
		// NOTHING ON SCREEN CLAIMS ANYTHING ABOUT A STUDENT'S WHEREABOUTS.
		expect(mounted.target.textContent ?? '').not.toContain(PRESENCE_NEVER_OPENED);
	});

	it('says a failed read failed, out loud, instead of printing a verdict', async () => {
		mounted = mountConsole(true, {
			loadPresence: async () => {
				throw new Error('network');
			}
		});
		await mounted.settle();

		expect(mounted.all('.roster-row')).toHaveLength(5);
		expect(mounted.all('[data-testid="presence-stale"]')).toHaveLength(1);
		expect(mounted.one('[data-testid="presence-stale"]').textContent?.trim()).toBe(
			PRESENCE_STALE_NOTE
		);
		expect(mounted.all('[data-testid="presence-never"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="presence-unknown"]')).toHaveLength(5);
	});

	it('the stale notice is ABSENT on a healthy read -- the positive control for it', async () => {
		mounted = mountConsole(true);
		await mounted.settle();
		expect(mounted.all('[data-testid="presence-stale"]')).toHaveLength(0);
		// against 1 on the identical fixture with a throwing transport, one case up.
	});

	it('earns "Not opened" only when presence answered AND nothing was handed in', async () => {
		mounted = mountConsole(true, { loadPresence: async () => EMPTY_PAYLOAD });
		await mounted.settle();

		// Five students, presence answered for none of them, none of them has any
		// work: this is the one reading where the verdict is true of all five.
		expect(mounted.all('[data-testid="presence-never"]')).toHaveLength(5);
		expect(mounted.all('[data-testid="presence-unknown"]')).toHaveLength(0);
	});

	it('never prints a verdict under a chip that says the work arrived', async () => {
		// THE REPORTED DEFECT, ASSERTED AS THE ROW MR. PINA WAS LOOKING AT.
		// `eli` has no presence row in `PRESENCE` and has had work RETURNED.
		mounted = mountConsole(true, { grading: GRADING_WITH_WORK });
		await mounted.settle();

		const rows = rosterLines(mounted);
		const eli = rows.find((r) => r.name === 'Eli Nakamura');
		expect(eli?.chip).toMatch(/^Returned/);
		// PRESENCE SAYS NOTHING AT ALL on that row -- not "Not opened", not
		// "Not known", no line. Absence is the mechanism.
		expect(eli?.presence).toBeNull();

		// AND THE OTHER FOUR ARE UNCHANGED, which is what makes this a narrowing
		// of one case rather than the line being switched off.
		expect(mounted.all('[data-testid="presence-chip"]')).toHaveLength(4);
		expect(mounted.all('[data-testid="presence-never"]')).toHaveLength(0);
	});

	it('work outranks presence on EVERY path a row can go missing', async () => {
		// The matrix, driven rather than reasoned about: with work on the roster,
		// no path prints a presence sentence for that student.
		for (const loadPresence of [
			NEVER_RESOLVES,
			async () => EMPTY_PAYLOAD,
			async () => {
				throw new Error('network');
			}
		]) {
			mounted = mountConsole(true, { grading: GRADING_WITH_WORK, loadPresence });
			await mounted.settle();
			const eli = rosterLines(mounted).find((r) => r.name === 'Eli Nakamura');
			expect(eli?.chip).toMatch(/^Returned/);
			expect(eli?.presence).toBeNull();
			await mounted.stop();
			mounted = null;
		}
	});
});

/**
 * THE DECISION ITSELF, AWAY FROM ANY MOUNT. `presenceLineKind` is where the
 * ORDER lives, and the order is the part that is easy to get wrong: `workArrived`
 * is weighed BEFORE `loaded`, so a row being graded says nothing rather than
 * "Not known".
 */
describe('presenceLineKind', () => {
	it('is exhaustive over the eight inputs, and the order is the rule', () => {
		const k = (hasRow: boolean, loaded: boolean, workArrived: boolean) =>
			presenceLineKind({ hasRow, loaded, workArrived });

		// A ROW IS ALWAYS PRINTED. A record and a work chip are two facts about
		// one student and neither contradicts the other.
		expect(k(true, true, true)).toBe('row');
		expect(k(true, true, false)).toBe('row');
		expect(k(true, false, true)).toBe('row');
		expect(k(true, false, false)).toBe('row');

		// NO ROW BUT WORK ARRIVED -> silence, whether or not presence answered.
		expect(k(false, true, true)).toBe('outranked');
		expect(k(false, false, true)).toBe('outranked');

		// NO ROW, NO WORK: the verdict needs presence to have answered.
		expect(k(false, false, false)).toBe('unknown');
		expect(k(false, true, false)).toBe('never-opened');
	});
});

/**
 * THE COVERAGE SENTENCE SAYS WHAT PRESENCE DOES NOT COVER, IN WORDS. The
 * retention window is READ from the payload's own limits rather than written
 * down here -- the travelling rule in `state.ts`'s header -- so a deployment
 * that changes `_classroom_presence_retention_days()` gets a correct sentence
 * without anybody editing a constant twice.
 */
describe('the coverage sentence', () => {
	it('names the three things a blank line is not evidence of', async () => {
		mounted = mountConsole(true);
		await mounted.settle();
		const note = mounted.one('[data-testid="presence-note"]').textContent ?? '';
		expect(note.trim()).toBe(PRESENCE_COVERAGE_NOTE);
		expect(note).toMatch(/paper/i);
		// Only the assignment page, only since it was switched on, only the
		// retention window -- and it says outright that a blank is not evidence.
		expect(note).toMatch(/assignment page/i);
		expect(note).toMatch(/switched on/i);
		expect(note).toContain(String(PRESENCE_LIMITS_FALLBACK.retentionDays));
		expect(note).toMatch(/never evidence/i);
	});
});

/**
 * `workArrived` AND `statusChip` ARE ONE DEFINITION, PINNED AS A PROPERTY OF THE
 * RENDERED ROW.
 *
 * `workArrived` is private to the component, so this asserts the INVARIANT rather
 * than the function: a row printing "Not submitted" is exactly a row presence is
 * allowed to speak about, and every other chip silences it. Written this way a
 * branch added to `statusChip` cannot change what the presence line does without
 * a case here saying so -- which is the whole reason `workArrived` asks
 * `statusChip` instead of walking the rows a second time.
 */
describe('the chip and the presence line cannot contradict each other', () => {
	it('exactly the "Not submitted" rows carry a presence sentence, and no others', async () => {
		const MIXED = {
			roster: ROSTER,
			submissions: [
				{ student_email: 'ana@boscotech.net', item_id: 'i1', state: 'returned', score: 20 },
				{ student_email: 'ben@boscotech.net', item_id: 'i1', state: 'submitted' }
			],
			// `cruz` has responses but no submission: "In progress".
			responses: [
				{ student_email: 'cruz@boscotech.net', item_id: 'i1', block_id: 'b1', value: 'x' }
			],
			files: [],
			approvals: []
		};
		// PRESENCE ANSWERED WITH NOTHING, so every row is a missing row and the
		// only thing deciding what it prints is whether work arrived.
		mounted = mountConsole(true, {
			grading: MIXED,
			loadPresence: async () => ({
				item_id: 'i1',
				section_id: 's1',
				at: new Date().toISOString(),
				limits: PRESENCE_LIMITS_FALLBACK,
				students: []
			})
		});
		await mounted.settle();

		const rows = rosterLines(mounted);
		expect(rows).toHaveLength(5);
		for (const row of rows) {
			if (row.chip === 'Not submitted') {
				expect(row.presence, `${row.name} has no work, so presence may speak`).toBe(
					PRESENCE_NEVER_OPENED
				);
			} else {
				expect(row.presence, `${row.name} reads "${row.chip}", so presence stands down`).toBeNull();
			}
		}
		// BOTH COUNTS, because a sweep that matched nothing would pass the loop
		// above vacuously: 3 rows carry work (returned, turned in, in progress) and
		// 2 do not.
		expect(rows.filter((r) => r.presence === null)).toHaveLength(3);
		expect(rows.filter((r) => r.presence === PRESENCE_NEVER_OPENED)).toHaveLength(2);
	});
});

/**
 * =========================================================================
 * 0278: NEXT AND PREVIOUS STUDENT EXIST AS CONTROLS.
 * =========================================================================
 *
 * `moveStudent` has been there since the console was -- it clamps, routes through
 * `requestSelect` so the unsaved-work guard fires, and lands focus on the first
 * criterion -- and it was dispatched ONLY from `n` and `p`. Mr. Pina, 2026-09-13:
 * "I want to be able to click the next student button when I finish grading one
 * student." A mouse user had to go back to the roster and find the next name.
 *
 * NO NEW LOGIC IS ASSERTED HERE because none was written: these cases check that
 * the controls exist, that they move the selection, and that they say so rather
 * than going dead at the ends of the roster.
 */
describe('the student pager', () => {
	async function openFirstStudent(): Promise<Mounted> {
		const m = mountConsole(false);
		await m.settle();
		(m.one('.roster-list .roster-row') as HTMLElement).click();
		await m.settle();
		return m;
	}

	it('renders both controls once a student is open, and neither before', async () => {
		mounted = mountConsole(false);
		await mounted.settle();
		// NOTHING OPEN IS ONE PANE: there is no rubric column, so there is no dock.
		expect(mounted.all('[data-testid="student-next"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="student-prev"]')).toHaveLength(0);

		(mounted.one('.roster-list .roster-row') as HTMLElement).click();
		await mounted.settle();
		expect(mounted.all('[data-testid="student-next"]')).toHaveLength(1);
		expect(mounted.all('[data-testid="student-prev"]')).toHaveLength(1);
		// ONE DOCK, NOT TWO. "It must not appear twice" is a property of there
		// being a single sticky element rather than a second rendered copy.
		expect(mounted.all('[data-testid="grade-return"]')).toHaveLength(1);
	});

	it('moves the selection forward and back', async () => {
		mounted = await openFirstStudent();
		const selected = () => mounted!.one('.roster-row.active').textContent ?? '';
		expect(selected()).toContain('Ana Reyes');

		(mounted.one('[data-testid="student-next"]') as HTMLElement).click();
		await mounted.settle();
		expect(selected()).toContain('Ben Okafor');

		(mounted.one('[data-testid="student-prev"]') as HTMLElement).click();
		await mounted.settle();
		expect(selected()).toContain('Ana Reyes');
	});

	it('marks an end of the roster with aria-disabled, never disabled', async () => {
		// A GENUINELY `disabled` CONTROL SWALLOWS ITS OWN POINTER EVENTS, so it can
		// never explain itself -- and `moveStudent` does explain, in the live
		// `key-note` region. That is the `aria-disabled` rule, so both halves are
		// asserted: the attribute is there AND `disabled` is not.
		mounted = await openFirstStudent();
		const prev = mounted.one('[data-testid="student-prev"]');
		const next = mounted.one('[data-testid="student-next"]');
		expect(prev.getAttribute('aria-disabled')).toBe('true');
		expect(prev.hasAttribute('disabled')).toBe(false);
		expect(next.getAttribute('aria-disabled')).toBe('false');

		// AND IT SAYS SO WHEN PRESSED, rather than doing nothing quietly.
		(prev as HTMLElement).click();
		await mounted.settle();
		expect(mounted.target.textContent).toContain('First student on the roster.');
		expect(mounted.one('.roster-row.active').textContent).toContain('Ana Reyes');
	});

	it('the keyboard path still works and the legend still advertises it', async () => {
		// THE KEYS ARE NOT REPLACED BY THE BUTTONS. Both dispatch `moveStudent`,
		// and the legend is generated from `GRADE_KEYS`, so a key that stopped
		// working would stop being advertised -- this pins that it has not.
		mounted = await openFirstStudent();
		expect(mounted.one('[data-testid="grade-key-legend"]').textContent).toContain(
			'Next / previous student'
		);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
		await mounted.settle();
		expect(mounted.one('.roster-row.active').textContent).toContain('Ben Okafor');
	});
});

/**
 * THE TWO PANELS ABOVE THE NAMES ARE COLLAPSED AND STILL COMPLETE.
 *
 * Collapsing HIDES, it never removes -- `Disclosure`'s own rule, so the material
 * prints and reopening costs nothing -- which means "collapsed" cannot be
 * asserted here as an absence from the DOM. happy-dom has no layout engine, so
 * `aria-expanded` is the assertable half and the measured heights belong to
 * `npm run verify:browser`.
 */
describe('the panels above the roster', () => {
	it('start closed, keep their controls in the DOM, and keep the count visible', async () => {
		mounted = mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
			section: SECTION,
			item: ITEM,
			spec: null,
			rubric: [],
			transports: { loadGrading: async () => ({ ok: true, data: GRADING }) },
			presence: null,
			close: async () => ({ ok: true, data: { total: 5, succeeded: 5, refused: 0, results: [] } })
		});
		await mounted.settle();

		const close = mounted.one('[data-testid="close-disclosure"]');
		const exports = mounted.one('[data-testid="work-export-disclosure"]');
		expect(close.getAttribute('aria-expanded')).toBe('false');
		expect(exports.getAttribute('aria-expanded')).toBe('false');

		// THE COUNT HE ACTS ON IS OUTSIDE THE PANEL, so shutting it does not hide
		// whether there is anything left to close.
		expect(close.textContent).toContain('open');
		expect(close.textContent).toContain('closed');

		// AND NOTHING WAS REMOVED: every control is still one press away.
		expect(mounted.all('[data-testid="close-arm"]')).toHaveLength(1);
		expect(mounted.all('[data-testid="export-json-class"]')).toHaveLength(1);
		expect(mounted.all('[data-testid="export-identity"]')).toHaveLength(1);

		// OPENING ONE IS THE POSITIVE CONTROL for the two `false`s above.
		(close as HTMLElement).click();
		await mounted.settle();
		expect(close.getAttribute('aria-expanded')).toBe('true');
		expect(exports.getAttribute('aria-expanded')).toBe('false');
	});
});
