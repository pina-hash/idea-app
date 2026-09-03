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
 * AND `collapseWhen` ONLY EVER FALLS. `disclosureLatch` is the second half of
 * that same sentence and the reason this module has two rules rather than one:
 * the standard is about ARRIVAL -- what a person is handed on a return visit --
 * and a signal read live is a panel that folds itself away under somebody who
 * is inside it. That was reported from a real classroom ("while starting to
 * type, random modules or drop down menus suddenly minimize and entirely throw
 * the viewing to the bottom of the page, and it deselects the text box") and
 * it is one mechanism: the region is hidden with `display: none`, so the
 * browser blurs whatever inside it held focus and the document loses that
 * height in the same frame.
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

/**
 * The collapse signal a panel is currently entitled to act on, remembered
 * across renders. `key` is the panel it was sampled for; `collapsed` is the
 * value `disclosureOpen` is given. `null` (never sampled) and a latch minted
 * under a DIFFERENT key are the same answer -- "this is not this panel's
 * history" -- and both re-sample.
 */
export type DisclosureLatch = { key: string | null; collapsed: boolean };

/**
 * THE SIGNAL ONLY EVER FALLS, AND IT IS PER PANEL.
 *
 * `collapseWhen` names an arrival condition -- "should this start collapsed" --
 * and the callers derive it from live state: `started` and `complete` on an
 * assignment module, `composerStarted` on a notebook check-in. Read live, the
 * first keystroke that trips one of those FOLDS A PANEL THE PERSON IS INSIDE.
 * Latched here, the same keystroke changes nothing: the panel a person is
 * looking at is closed by their own press and by nothing else.
 *
 * IT FALLS AND DOES NOT RISE, rather than being sampled once, and the
 * difference is a real caller. `SpecImporter` starts its JSON panel collapsed
 * and flips `collapseWhen` to false when a clipboard copy is REFUSED, which is
 * the one moment the reading is what the person came for; a value sampled once
 * would leave them looking at a panel that never opens. Falling is the safe
 * direction and rising is the reported defect, so exactly one of them is
 * allowed. Once fallen it stays fallen, so a signal that flickers cannot fold
 * the panel back up on the way past.
 *
 * KEYED THE WAY `override` IS KEYED. A caller that swaps `scope` without
 * remounting -- opening a different item, picking a different check-in -- is
 * looking at a DIFFERENT panel, so it re-samples rather than carrying the last
 * one's history. Anything else and one item's arrival state decides another's.
 *
 * Returns `prev` UNCHANGED when nothing moved, so a caller can assign the
 * result unconditionally without minting a new object on every render, and a
 * caller whose latch is still `null` gets its first sample from the same call
 * rather than from a second seeding path that could sample differently.
 */
export function disclosureLatch(
	prev: DisclosureLatch | null,
	key: string | null,
	collapseWhen: boolean
): DisclosureLatch {
	if (!prev || prev.key !== key) return { key, collapsed: collapseWhen };
	if (prev.collapsed && !collapseWhen) return { key, collapsed: false };
	return prev;
}
