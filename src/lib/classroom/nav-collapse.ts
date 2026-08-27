/**
 * WHETHER THIS PERSON HAS COLLAPSED THE ITEM PAGE'S NAVIGATION PANE.
 *
 * A student filed the same report three times over two days: reading one
 * assignment while every other item in the class sits beside it in the list
 * pane is a distraction, and they want to put it away and get the room back
 * for the thing they are actually doing. The pane itself
 * (`$lib/shell/ClassSplit.svelte`'s `.cr-nav`, mounted by
 * `src/routes/classroom/[sectionId]/+layout.svelte` as `ClassView`) is not a
 * file this session owns, so the mechanism has to work from the outside: a
 * marker this module's caller (`ClassroomShell.svelte`) puts on screen, read
 * by an ancestor `:has()` selector in classroom.css. Nothing here renders
 * anything or touches the DOM -- it is the same split classroom.css already
 * keeps between "where a URL sits" (nav.ts) and "the arithmetic behind a
 * control" (disclosure.ts, tab-strip.ts): pure and client-safe, so the
 * persistence rule can be asserted without a browser.
 *
 * THE `disclosure.ts` MODEL, ADAPTED. Same shape -- a viewer-keyed storage
 * key, a wrapped read, a wrapped write, nothing thrown on a blocked or full
 * store -- but with no per-scope dimension. A disclosure is remembered PER
 * ITEM, because a wall of instructions is a decision about that item; this is
 * a decision about how this person likes to read the whole class, so one
 * stored answer follows them from one item to the next rather than starting
 * over. That is also why it is deliberately NOT keyed the draft-mirror way
 * (`prefix:<viewer>:<record>`): there is no record here, only a person.
 *
 * PER PERSON, NOT PER BROWSER. Unlike the notebook's theme (a preference about
 * the screen in front of you), collapsing the class list is a preference
 * about how this person reads -- the same student on a different machine
 * wants the same answer, and two students sharing a lab workstation must
 * never inherit each other's.
 */

const PREFIX = 'idea:classnav-collapsed:1:';

/** The storage key for one viewer. Never null -- unlike a disclosure, this
 *  has no per-scope "nothing to remember it against" case. */
export function navCollapseKey(viewer: string | null | undefined): string {
	const who = (viewer ?? '').trim() || 'anon';
	return `${PREFIX}${who}`;
}

/**
 * A BLOCKED OR FULL STORE COSTS THE MEMORY, NEVER THE CONTROL. Private
 * browsing, a disabled store and a full quota all degrade to "not collapsed",
 * which is the same answer a first-time visitor gets.
 */
export function readNavCollapsed(key: string): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(key) === '1';
	} catch {
		return false;
	}
}

/** Cleared rather than written `'0'` when expanding, so a person who has
 *  never touched the control and one who explicitly put it back leave the
 *  same, empty trace. */
export function writeNavCollapsed(key: string, collapsed: boolean): void {
	if (typeof localStorage === 'undefined') return;
	try {
		if (collapsed) localStorage.setItem(key, '1');
		else localStorage.removeItem(key);
	} catch {
		/* As above: the memory is lost, not the choice just made. */
	}
}
