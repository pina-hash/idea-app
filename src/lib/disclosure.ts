/**
 * THE ONE DISCLOSURE RULE, and the one place it is written down.
 *
 * A disclosure is a real button plus a region it hides. There are two dozen
 * hand-rolled ones in this repo already -- native `<details>` in one half,
 * `aria-expanded` + `aria-controls` over a `max-height` rule in the other --
 * and they disagree about the small things that matter: whether the trigger is
 * in the tab order, whether the region is announced, whether anything is
 * remembered. `Disclosure.svelte` is the component; this module is the
 * arithmetic behind it, kept out of the component so it can be asserted
 * without a browser.
 *
 * WHAT IS STORED IS A MANUAL CHOICE, NEVER THE CURRENT STATE. `disclosureOpen`
 * below is the whole rule: with nothing stored the panel follows its caller's
 * `collapseWhen` signal, and a person who has toggled it themselves overrides
 * that signal for good. Storing the current state instead would freeze the
 * FIRST render forever -- a student who opened an assignment, read the
 * instructions and started typing would have "expanded" written down and would
 * be handed the whole wall of text again on every visit after, which is the
 * defect the collapse exists to fix (IDEA_INTERFACE_STANDARDS 1, "Reading
 * material does not sit between a person and their work on every return
 * visit").
 *
 * PER PERSON AND PER ITEM. The key carries the viewer's own id, so two
 * students on one shop workstation never inherit each other's answer, and an
 * account that has never toggled anything has nothing stored under it.
 *
 * A BLOCKED OR FULL STORE COSTS THE MEMORY, NEVER THE CONTROL. Every call
 * below is wrapped: private browsing, a full quota and a disabled store all
 * degrade to "nothing remembered", which is exactly the first-visit behaviour
 * and is never an error anybody is shown.
 */

/** A remembered manual choice, or `null` for "this person has not chosen". */
export type DisclosureStored = boolean | null;

/**
 * Versioned so a future shape change is a new namespace rather than a
 * migration: the old keys simply stop being read, and a stale one is a dead
 * string in a store nobody is charged for.
 */
const PREFIX = 'idea:disclosure:1:';

const OPEN = 'open';
const CLOSED = 'closed';

/**
 * The storage key for one disclosure, or null when it must not be remembered.
 *
 * A null/blank scope is the deliberate "do not persist" answer, not a bug: a
 * teacher previewing an unsaved spec in the importer, or a component mounted
 * in a harness, has no item to remember anything against.
 */
export function disclosureKey(
	viewer: string | null | undefined,
	scope: string | null | undefined
): string | null {
	const s = (scope ?? '').trim();
	if (!s) return null;
	const who = (viewer ?? '').trim() || 'anon';
	return `${PREFIX}${who}:${s}`;
}

/**
 * The stored choice, validated against the only two values that mean
 * anything.
 *
 * AN UNRECOGNISED VALUE IS DROPPED rather than coerced (the `preferences`
 * doctrine, applied to the browser's own store): a truthiness check on some
 * other string would put the panel into a state no branch of the component
 * renders, and it would stay there because nothing would ever overwrite it.
 */
export function readDisclosure(key: string | null): DisclosureStored {
	if (!key || typeof localStorage === 'undefined') return null;
	try {
		const stored = localStorage.getItem(key);
		if (stored === OPEN) return true;
		if (stored === CLOSED) return false;
		if (stored !== null) localStorage.removeItem(key);
		return null;
	} catch {
		return null;
	}
}

export function writeDisclosure(key: string | null, open: boolean): void {
	if (!key || typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(key, open ? OPEN : CLOSED);
	} catch {
		/* A blocked or full store costs the memory, never the choice. */
	}
}

export function clearDisclosure(key: string | null): void {
	if (!key || typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(key);
	} catch {
		/* As above. */
	}
}

/**
 * IS IT OPEN.
 *
 * `stored` is what this person chose, if they ever chose. `collapseWhen` is
 * the caller's signal that the reading is no longer the thing in front of them
 * -- on an assignment, that the student has put something into the work.
 *
 * EXPANDED IS THE DEFAULT, AND IT IS THE DEFAULT FOR EVERYONE. There is no
 * role in this signature on purpose: an instructor opening the item they wrote
 * gets the same panel in the same state a student does, because a per-role
 * default is two behaviours to keep in step and this repo has paid for that
 * several times already (IDEA_INTERFACE_STANDARDS 2).
 */
export function disclosureOpen(stored: DisclosureStored, collapseWhen: boolean): boolean {
	return stored ?? !collapseWhen;
}
