/**
 * THE ONE PREFERENCE: autocorrect and the tolerance callout, together.
 *
 * ONE SWITCH FOR BOTH, and that is a decision rather than a shortcut. The two
 * features share a vocabulary -- the callout counts the misspellings the map
 * would have corrected, through the same glossary predicate -- so a student
 * who turned corrections off and still saw a band counting the words it was no
 * longer allowed to fix would be reading a measurement of a rule that is not
 * running. Off means both, and it means it permanently: there is no periodic
 * offer to turn it back on, no badge, and no reminder. A student who switched
 * this off has answered the question.
 *
 * PER VIEWER, PER BROWSER, and the viewer half is the part that matters.
 * `profiles.preferences` is where a per-ACCOUNT preference belongs and would
 * follow a student between devices, but writing it needs the notebook route's
 * profile write path, which is outside this feature's reach; what is available
 * here is the draft mirror's own rule, and it is the one that protects the
 * case that actually occurs. A shop workstation is shared, so the key carries
 * the viewer's id exactly as `draftMirrorKey` does
 * ($lib/notebook/draft-mirror) -- a student who turns corrections off does not
 * turn them off for the next person to sit down, and does not read the last
 * person's setting as their own. The cost is that the choice does not follow
 * them to a different browser, where it re-reads as the default.
 *
 * DEFAULT ON. A student who has never touched it gets both features, which is
 * the point of building them; `read()` answers `true` for an absent key, an
 * unreadable store and an unrecognised value alike.
 *
 * A reactive module-level `$state` backed by localStorage -- the
 * notebook-theme.svelte.ts convention, one directory over, for the same reason
 * it was chosen there: no migration, no route change, and no round trip
 * between pressing the switch and the switch taking effect.
 */

/**
 * Namespaced beside `notebook_draft_mirror:` and `notebook_pending_capture`.
 * The trailing colon is the viewer id's separator, so the prefix is a legible
 * sweep target the way the mirror's is.
 */
export const WRITING_AID_PREFIX = 'notebook_writing_aid:';

/** The key for one viewer. Signed out reads and writes the `anon` slot. */
export function writingAidKey(viewerId: string | undefined): string {
	return `${WRITING_AID_PREFIX}${viewerId || 'anon'}`;
}

/** What a viewer who has never touched the switch gets. */
export const WRITING_AID_DEFAULT = true;

/**
 * The two stored values, written in full words rather than as `'1'`/`'0'` so a
 * student who finds the key in their browser's storage can read what it says.
 */
const ON = 'on';
const OFF = 'off';

function read(viewerId: string | undefined): boolean {
	if (typeof localStorage === 'undefined') return WRITING_AID_DEFAULT;
	try {
		const stored = localStorage.getItem(writingAidKey(viewerId));
		if (stored === OFF) return false;
		if (stored === ON) return true;
		// Absent, or a value no branch renders. Both take the default, and an
		// unrecognised one is dropped rather than left to be re-read forever --
		// the notebook-theme.svelte.ts rule.
		if (stored !== null) localStorage.removeItem(writingAidKey(viewerId));
		return WRITING_AID_DEFAULT;
	} catch {
		// Storage blocked (private browsing, site data off). The feature runs on
		// its default; only the persistence is lost.
		return WRITING_AID_DEFAULT;
	}
}

/**
 * THE READ MUST NOT WRITE REACTIVE STATE, and the first version of this module
 * did.
 *
 * `writingAidEnabled` is called from a `$derived` in `NoteEditor`, and it was
 * lazily assigning a module-level `$state` on the first read for a viewer.
 * Svelte throws `state_unsafe_mutation` for that -- and the cost is not the
 * error, it is what follows it: an unhandled rejection during render after
 * which NO click handler anywhere in the tree fires again. Measured in
 * Chromium against /dev/notebook, where the whole notebook stopped responding
 * to input. It is the trap CLAUDE.md names under Svelte 5, reached from the
 * `$derived` side rather than the `$effect` side.
 *
 * SO THE REACTIVE PART IS A COUNTER AND THE CACHE IS PLAIN. `version` is the
 * only `$state` here and only `setWritingAidEnabled` writes it; the per-viewer
 * values live in an ordinary `Map`, whose mutation Svelte neither tracks nor
 * objects to. A read establishes its dependency on `version`, then answers
 * from the map or from storage -- no reactive write, on any path.
 *
 * The map is also what keeps two viewers apart in memory: a module-level
 * `$state` outlives a component, so a second student signing in on the same
 * browser must not inherit the value loaded for the first.
 */
let version = $state(0);
const cache = new Map<string, boolean>();

/** Is the writing aid on for this viewer? */
export function writingAidEnabled(viewerId: string | undefined): boolean {
	// Read FIRST, so the dependency is registered even on the cached path.
	void version;
	const key = writingAidKey(viewerId);
	const known = cache.get(key);
	if (known !== undefined) return known;
	const value = read(viewerId);
	cache.set(key, value);
	return value;
}

/** Set it, for this viewer, and persist. */
export function setWritingAidEnabled(viewerId: string | undefined, next: boolean): void {
	cache.set(writingAidKey(viewerId), next);
	version += 1;
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(writingAidKey(viewerId), next ? ON : OFF);
	} catch {
		// A blocked or full store costs the persistence, never the choice.
	}
}

/** The switch's own label and the sentence under it. */
export const WRITING_AID_LABEL = 'Spelling help';
export const WRITING_AID_ON_NOTE =
	'Fixes common misspellings as you type, and shows this note’s tolerance band. Course vocabulary is never changed.';
export const WRITING_AID_OFF_NOTE = 'Off. Nothing is corrected and no band is shown.';
