/**
 * THE CLASSROOM'S TWO WALKTHROUGHS: a teacher's and a student's (ledger 0297,
 * LEARN). PLAIN DATA and pure decisions, client-safe like `orientation.ts`;
 * `ClassroomTour.svelte` offers and runs them on the existing spotlight engine.
 *
 * WRITTEN FOR SOMEBODY WHO WAS NEVER SHOWN ANYTHING (Mr. Cosso, who teaches
 * Block 4 with no Claude access, and a student on their first day): plain
 * words, one idea per step, never more than two short sentences, and every
 * control named by the word printed on it.
 *
 * ONE CONCEPT PER STEP, SEVERAL PLACES IT CAN POINT. A step definition carries
 * VARIANTS, tried in order, and the first whose target is on screen is the one
 * shown: on the grading page the grading step points at the key legend itself,
 * on a class page it points at the Grades tab that leads there. So the tour is
 * whole wherever it is started, and nothing it says points at a control that is
 * not in front of the reader. The engine still drops a step with no target at
 * all (`SpotlightTour.svelte`), which is what lets one list serve a phone,
 * where the header's tools are folded into the Menu, and a desktop.
 *
 * A TARGET IS A STABLE HOOK, NEVER A STYLE CLASS: the `data-testid` the
 * browser specs already hold the control to, so renaming a hook breaks a spec
 * and this list in the same run (`tests/classroom-tour.test.ts` sweeps `src/`
 * for every one of them).
 *
 * A STEP THAT DESCRIBES A REGISTERED ACTION NAMES ITS COMMAND, and the test
 * holds that command to the registry: it must exist, and its role must be one
 * the tour's reader has. That is the check that keeps a manager-only door out
 * of the student tour even when both tours are edited at once.
 */
import type { ClassroomTourId, TourState } from '$lib/preferences/classroom';
import type { TourCloseReason, TourStep } from './tour';
import { REPORT_LABEL_SHORT } from '$lib/feedback/context';

/** One place a step can point, with the words for that place. */
export interface TourVariant {
	/** A CSS selector for one stable hook (`[data-testid="..."]`). */
	target: string;
	title: string;
	/** One or two short sentences. `{mod}` becomes Ctrl, or ⌘ on a Mac. */
	body: string;
}

export interface ClassroomTourStep {
	/** Stable, for tests and for the harness: never shown. */
	id: string;
	/** The registry command this step describes, when it describes one. */
	command?: string;
	/** Tried in order; the first on screen is shown. */
	variants: readonly TourVariant[];
}

const tid = (id: string) => `[data-testid="${id}"]`;

/**
 * THE MENU STEP, shared by both tours, and it exists for narrow windows only.
 * Below 1180px the header's tools fold into one Menu button (ClassroomShell),
 * so every tool step's target is hidden and drops; this one names what is
 * inside instead. Above 1180px the Menu button is hidden and this drops.
 * Report is NOT inside it: it keeps its own slot in the header row at every
 * width (report 30), so the sentence says where it is instead.
 */
const MENU_STEP = (who: 'teacher' | 'student'): ClassroomTourStep => ({
	id: 'menu',
	variants: [
		{
			target: tid('shell-menu'),
			title: 'Menu',
			body:
				who === 'teacher'
					? `Menu holds Search, Settings, the Light switch, Tour and your classes by name; ${REPORT_LABEL_SHORT} stays beside it. {mod} K opens Search from anywhere.`
					: `Menu holds To-do, Search, Settings, the Light switch, Tour and your classes by name. ${REPORT_LABEL_SHORT} stays beside it.`
		}
	]
});

/** The last stop of both tours: where to find this again. */
const TOUR_AGAIN: ClassroomTourStep = {
	id: 'tour-again',
	command: 'tour.start',
	variants: [
		{
			target: tid('tour-trigger'),
			title: 'Tour',
			body: 'Tour shows you around again whenever you want.'
		}
	]
};

export const TEACHER_TOUR: readonly ClassroomTourStep[] = [
	{
		id: 'class-icons',
		variants: [
			{
				target: tid('class-strip'),
				title: 'Your classes',
				body: 'Each class you teach is an icon here. The one you are in has a bar under it.'
			}
		]
	},
	{
		id: 'classes-menu',
		command: 'go.classes',
		variants: [
			{
				target: tid('section-switcher'),
				title: 'Classes',
				body: 'Classes lists every class by name, and All my classes.'
			}
		]
	},
	MENU_STEP('teacher'),
	{
		id: 'new-post',
		command: 'class.new-post',
		variants: [
			{
				target: tid('new-post'),
				title: 'New post',
				body: 'New post writes an announcement, an assignment or a material. Tick more than one class under Post to, and add a Notebook check-in at the bottom.'
			}
		]
	},
	{
		id: 'live',
		command: 'class.live',
		variants: [
			{
				target: tid('live-open-projector'),
				title: 'Projector view',
				body: 'This opens a window for the projector with the agenda, the clock and the timer. It never shows a grade or a name.'
			},
			{
				target: tid('section-tab-live'),
				title: 'Live',
				body: 'Live shows who is working right now, a timer and the hall pass. Its Open projector view button puts the agenda on the wall.'
			}
		]
	},
	{
		id: 'grading',
		command: 'class.grades',
		variants: [
			{
				target: tid('grade-key-legend'),
				title: 'Grading keys',
				body: 'Grade without the mouse: 1 to 4 picks a level and S saves. N opens the next student.'
			},
			{
				target: tid('section-tab-grades'),
				title: 'Grades',
				body: 'Grades lists every assignment and what is left to mark. Open one to grade it with the keys 1 to 4.'
			}
		]
	},
	{
		id: 'notebook',
		command: 'class.notebook',
		variants: [
			{
				target: tid('mode-approve'),
				title: 'Approve',
				body: "Approve accepts a class day's notebook entries in one pass. You can add a next step for a student as you go."
			},
			{
				target: tid('section-tab-notebook'),
				title: 'Notebook',
				body: "Notebook is this class's notebook review. Its Approve view accepts a day's entries in one pass."
			}
		]
	},
	{
		id: 'search',
		command: 'palette.open',
		variants: [
			{
				target: tid('palette-trigger'),
				title: 'Search',
				body: 'Search finds a class, an assignment, a student or an action by name. Press {mod} K to open it, and ? to see every shortcut.'
			}
		]
	},
	{
		id: 'settings',
		command: 'settings.open',
		variants: [
			{
				target: tid('settings-trigger'),
				title: 'Settings',
				body: 'Settings holds density, list width and what a class opens on. Each group has its own Reset.'
			}
		]
	},
	{
		id: 'light',
		variants: [
			{
				target: tid('theme-switch'),
				title: 'Light',
				body: 'Light switches to the white theme, which is easier to read on a projector.'
			}
		]
	},
	TOUR_AGAIN
];

export const STUDENT_TOUR: readonly ClassroomTourStep[] = [
	{
		id: 'todo',
		command: 'go.todo',
		variants: [
			{
				target: tid('todo-door'),
				title: 'To-do',
				body: 'To-do lists what is assigned, missing and done in all your classes.'
			}
		]
	},
	MENU_STEP('student'),
	{
		id: 'class-search',
		command: 'class.search',
		variants: [
			{
				target: tid('stream-search'),
				title: 'Search this class',
				body: 'Type part of a name to find an assignment in this class.'
			},
			{
				target: tid('class-strip'),
				title: 'Your classes',
				body: 'Each class is an icon here. Open one to see its work, unit by unit.'
			}
		]
	},
	{
		id: 'missing',
		command: 'class.show-missing',
		variants: [
			{
				target: tid('stream-status-missing'),
				title: 'Missing',
				body: 'Missing shows work that is past its due date and not turned in.'
			}
		]
	},
	{
		id: 'notebook-capture',
		command: 'class.notebook',
		variants: [
			{
				target: tid('capture'),
				title: 'Add to your notebook',
				body: 'Take a photo of your notebook pages or write a note right here. It is filed under this assignment for you.'
			},
			{
				target: tid('section-tab-notebook'),
				title: 'Notebook',
				body: 'Notebook holds your entries for this class. You can also add pages from any assignment that has a check-in.'
			}
		]
	},
	{
		id: 'search',
		command: 'palette.open',
		variants: [
			{
				target: tid('palette-trigger'),
				title: 'Search',
				body: 'Search finds any class, assignment or check-in by name. Press {mod} K to open it from anywhere.'
			}
		]
	},
	TOUR_AGAIN
];

export const CLASSROOM_TOURS: Readonly<Record<ClassroomTourId, readonly ClassroomTourStep[]>> = {
	teacher: TEACHER_TOUR,
	student: STUDENT_TOUR
};

/* -------------------------------------------------------------------------
 * THE DECISIONS, pure so each is assertable (and mutation-provable) without a
 * browser.
 * ---------------------------------------------------------------------- */

/**
 * WHICH TOUR THIS VIEWER GETS, HERE. Inside a class the answer is the server's
 * own `canManage` for that class, the same fact the section tabs are filtered
 * by; outside one it is the staff flag, which is the command palette's rule
 * for what a person is offered on My Classes. A student is never staff, so a
 * student never reaches the teacher tour.
 */
export function classroomTourFor(where: {
	inClass: boolean;
	canManage: boolean;
	isStaff: boolean;
	isAdmin: boolean;
}): ClassroomTourId {
	if (where.inClass) return where.canManage ? 'teacher' : 'student';
	return where.isStaff || where.isAdmin ? 'teacher' : 'student';
}

/** THE OFFER IS MADE ONCE: only a tour nobody has offered this person yet. */
export function shouldOfferTour(state: TourState): boolean {
	return state === 'unseen';
}

/** How a run ended, as the state stored for it. Every ending counts as seen. */
export function tourStateAfter(reason: TourCloseReason): TourState {
	return reason === 'completed' ? 'finished' : 'dismissed';
}

/** The modifier word for the palette's chord on this keyboard. */
export function tourModKey(platform: string | null | undefined): string {
	return /mac|iphone|ipad/i.test(platform ?? '') ? '⌘' : 'Ctrl';
}

/**
 * THE STEPS TO RUN, for what is on screen: each definition's first variant
 * whose target is present, and never the same target twice (the second step
 * that would point at one control is dropped rather than repeating it). A
 * definition with no variant on screen is left out here; the engine's own
 * check then drops anything that vanished between this call and its mount.
 */
export function resolveTourSteps(
	defs: readonly ClassroomTourStep[],
	present: (selector: string) => boolean,
	mod = 'Ctrl'
): (TourStep & { id: string })[] {
	const used = new Set<string>();
	const out: (TourStep & { id: string })[] = [];
	for (const def of defs) {
		const v = def.variants.find((c) => present(c.target));
		if (!v || used.has(v.target)) continue;
		used.add(v.target);
		out.push({ id: def.id, target: v.target, title: v.title, body: v.body.replaceAll('{mod}', mod) });
	}
	return out;
}

/** Every hook either tour can point at, for the sweep that holds them to the source. */
export function tourTargets(): string[] {
	const out = new Set<string>();
	for (const defs of Object.values(CLASSROOM_TOURS)) for (const d of defs) for (const v of d.variants) out.add(v.target);
	return [...out];
}
