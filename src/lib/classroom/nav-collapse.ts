/**
 * WHETHER THE ITEM PAGE'S CLASS LIST IS PUT AWAY, AND WHO DECIDED.
 *
 * A student filed the same report three times over two days: reading one
 * assignment while every other item in the class sits beside it in the list
 * pane is a distraction, and they want to put it away and get the room back
 * for the thing they are actually doing. The pane itself
 * (`$lib/shell/ClassSplit.svelte`'s `.cr-nav`, mounted by
 * `src/routes/classroom/[sectionId]/+layout.svelte` as `ClassView`) is not
 * this module's to remove, so the mechanism works from the outside: a marker
 * this module's caller (`ClassroomShell.svelte`) puts on screen, read by an
 * ancestor `:has()` selector in classroom.css. Nothing here renders anything
 * or touches the DOM -- it is the same split classroom.css already keeps
 * between "where a URL sits" (nav.ts) and "the arithmetic behind a control"
 * (disclosure.ts, tab-strip.ts): pure and client-safe, so the rule can be
 * asserted without a browser.
 *
 * WORK MAKES ITS OWN ROOM (ledger 0298, report 25). Mr. Pina: students "never
 * really make room for it, they don't hide the left hand classroom browser".
 * A control nobody presses is not a fix, so on a WORK SURFACE -- a ported HTML
 * worksheet or a spec assignment, the two things a student fills in inside the
 * page -- the list starts put away, and everywhere else it starts on screen.
 *
 * WHAT IS STORED IS THE MANUAL CHOICE, NEVER THE CURRENT STATE, and that is
 * `Disclosure.svelte`'s rule for the same reason: storing the state freezes the
 * first render forever. So there are three stored answers, not two -- the
 * person chose collapsed, the person chose expanded, or the person never chose
 * -- and the current state is `navCollapsedFor(choice, workSurface)`. Before
 * ledger 0298 expanding CLEARED the key, which was harmless while "nothing
 * stored" and "expanded" meant the same thing; with a default that depends on
 * the item they no longer do, so an explicit expand is written as `'0'`.
 *
 * ONE ANSWER PER PERSON, NOT PER ITEM. A disclosure is remembered per item,
 * because a wall of instructions is a decision about that item; this is a
 * decision about how this person likes to read the whole class, so one stored
 * choice follows them from one item to the next rather than starting over. A
 * student who pressed Show class list once has said so for every item.
 *
 * PER PERSON ON THIS DEVICE. The key carries the viewer, so two students
 * sharing a lab workstation never inherit each other's choice; it is
 * `localStorage`, so the same student on another computer starts from the
 * default again. (This header said "per person, not per browser" until ledger
 * 0298, which the storage never was.)
 */

import { htmlAssignmentMount, type HtmlAssignmentData } from '$lib/classroom/html-assignment/mount';

/** Unchanged since the first version: a stored `'1'` from before ledger 0298
 *  is still somebody's explicit collapse, and reads as one. */
const PREFIX = 'idea:classnav-collapsed:1:';

/** What a person chose, or null when they never pressed the control. */
export type NavCollapseChoice = 'collapsed' | 'expanded' | null;

/** The storage key for one viewer. Never null -- unlike a disclosure, this
 *  has no per-scope "nothing to remember it against" case. */
export function navCollapseKey(viewer: string | null | undefined): string {
	const who = (viewer ?? '').trim() || 'anon';
	return `${PREFIX}${who}`;
}

/**
 * A BLOCKED OR FULL STORE COSTS THE MEMORY, NEVER THE CONTROL. Private
 * browsing, a disabled store and a full quota all degrade to "never chose",
 * which is the same answer a first-time visitor gets, and so does a value this
 * build does not recognise: a stored value can never put the control in a
 * state no branch renders.
 */
export function readNavCollapseChoice(key: string): NavCollapseChoice {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(key);
		return raw === '1' ? 'collapsed' : raw === '0' ? 'expanded' : null;
	} catch {
		return null;
	}
}

/** Both choices are written, because "never chose" is the third answer. */
export function writeNavCollapseChoice(key: string, choice: 'collapsed' | 'expanded'): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(key, choice === 'collapsed' ? '1' : '0');
	} catch {
		/* As above: the memory is lost, not the choice just made. */
	}
}

/** THE CURRENT STATE: the person's choice when they made one, else the item's default. */
export function navCollapsedFor(choice: NavCollapseChoice, workSurface: boolean): boolean {
	return choice === null ? workSurface : choice === 'collapsed';
}

/**
 * IS THE OPEN ITEM SOMETHING A STUDENT WORKS INSIDE, read off the item page's
 * own payload -- the SAME keys `src/routes/classroom/[sectionId]/item/[itemId]`
 * hands `ItemDetail` (`item`, `htmlAssignment`, `spec` for a manager, `engine`
 * for a student), so the list is put away exactly where the page mounts a work
 * surface and never on a guess.
 *
 *   - A PORTED HTML DOCUMENT is `htmlAssignmentMount`'s `'html'` answer, the
 *     one place "is this a ported document" is decided. `'unavailable'` is a
 *     sentence saying the document could not be opened, not a worksheet, so it
 *     keeps the list.
 *   - A SPEC ASSIGNMENT is an assignment whose spec the page loaded: `spec` on
 *     a manager's payload, `engine.spec` on a student's (the two roles read it
 *     through different loads, `+page.server.ts`).
 *
 * THE ITEM MUST BE THE ONE IN THE URL, so a payload that has not caught up
 * with a navigation cannot decide for the next item. Anything this cannot read
 * answers false, which is the list on screen: the behaviour every item had
 * before ledger 0298.
 */
export function navCollapseWorkSurface(data: unknown, itemId: string | null | undefined): boolean {
	if (!itemId || !data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	const item = d.item;
	if (!item || typeof item !== 'object') return false;
	const row = item as Record<string, unknown>;
	if (row.id !== itemId || row.kind !== 'assignment') return false;
	if (htmlAssignmentMount(row, d.htmlAssignment as HtmlAssignmentData | null | undefined) === 'html') return true;
	if (d.spec) return true;
	const engine = d.engine;
	return !!engine && typeof engine === 'object' && !!(engine as Record<string, unknown>).spec;
}
