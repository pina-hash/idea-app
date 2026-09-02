/**
 * THE CLASS GATE, ON THE CLIENT SIDE OF IT.
 *
 * 0173 gives `classroom_sections` a `foundry_closed_at` stamp and
 * `foundry_section_access()` answers, for the caller, whether any class they
 * are actively enrolled in has closed the Foundry. THE DATABASE IS THE GATE
 * AND THIS IS NOT: everything here shapes a sentence and decides what to
 * render, and none of it is what stops a student publishing. That is the
 * layout's server load refusing to hand the page any data, and 0173's own
 * predicates underneath it.
 *
 * PURE, CLIENT-SAFE, NO SVELTE. The registry shape every subsystem here has:
 * plain data and pure helpers, so the arithmetic is assertable with no browser
 * and no database.
 */

/** One class that has closed it. The shape `foundry_section_access` returns. */
export interface FoundryClosedSection {
	section_id: string;
	label: string;
	course_title: string;
	note: string | null;
	closed_at: string;
}

export interface FoundryAccess {
	open: boolean;
	closed: FoundryClosedSection[];
}

/**
 * THE ANSWER WHEN NOBODY ASKED, AND IT IS OPEN.
 *
 * A deployment sitting between 0172 and 0173 is a real state -- migrations
 * here are applied by hand and separately -- and on it the RPC does not
 * exist. Degrading to CLOSED there would lock every student out of a feature
 * nobody had turned off, which is the worse failure by a distance: the gate
 * did not exist in that world, so "as it was" is open.
 *
 * THAT IS NOT A FAIL-OPEN ACCESS HELPER. The caller degrades on `PGRST202`
 * ALONE -- the function genuinely not being there -- and treats any other
 * error as closed, which is the repository's standing rule for a missing RPC
 * and the reason it is spelled as a code check rather than a `catch`.
 */
export const FOUNDRY_ACCESS_OPEN: FoundryAccess = { open: true, closed: [] };

/**
 * WHAT A CLOSED-OUT STUDENT READS. One implementation, because the layout
 * renders it and the harness asserts it, and two spellings of a refusal is
 * how a surface ends up explaining something the database is not doing.
 *
 * IT NAMES THE CLASS, NEVER THE TEACHER'S ADDRESS. The payload does not carry
 * one (0173 projects the course title and the label and nothing else), so a
 * student who wants it back knows which room to ask in without the function
 * having handed out a directory.
 *
 * NO EM DASHES, per the copy conventions.
 */
export function foundryClosedSentence(closed: readonly FoundryClosedSection[]): string {
	if (closed.length === 0) {
		// Not reachable from a closed state, and written rather than thrown: a
		// sentence is what this returns, and an empty string on a panel that
		// rendered is a blank refusal, which is the thing being avoided.
		return 'The Foundry is closed for one of your classes right now.';
	}
	const names = closed.map((c) => `${c.course_title} (${c.label})`);
	const list =
		names.length === 1
			? names[0]
			: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
	return names.length === 1
		? `${list} has the Foundry closed right now.`
		: `${list} have the Foundry closed right now.`;
}

/**
 * The notes an instructor left, in order, with the blanks dropped. Separate
 * from the sentence above because a note is OPTIONAL and the sentence is not:
 * folding them together would make the refusal read differently depending on
 * whether somebody happened to type a reason.
 */
export function foundryClosedNotes(
	closed: readonly FoundryClosedSection[]
): { section_id: string; course_title: string; label: string; note: string }[] {
	return closed
		.filter((c): c is FoundryClosedSection & { note: string } => {
			return typeof c.note === 'string' && c.note.trim().length > 0;
		})
		.map((c) => ({
			section_id: c.section_id,
			course_title: c.course_title,
			label: c.label,
			note: c.note.trim()
		}));
}

/** One section on the instructor's own control. `foundry_manageable_sections`. */
export interface FoundryManagedSection {
	section_id: string;
	label: string;
	block: string | null;
	course_title: string;
	course_code: string;
	foundry_closed_at: string | null;
	foundry_closed_note: string | null;
}

/**
 * "Open" and "Closed" as one vocabulary. A word, never only a colour and never
 * only a switch position (`IDEA_INTERFACE_STANDARDS` 10).
 */
export function foundrySectionStateLabel(section: {
	foundry_closed_at: string | null;
}): 'Open' | 'Closed' {
	return section.foundry_closed_at === null ? 'Open' : 'Closed';
}

/**
 * THE ORDER THE INSTRUCTOR'S LIST RENDERS IN: closed first.
 *
 * A control panel exists to be turned back on, and the row somebody came to
 * the page for is the one that is currently stopping their students. Within
 * each group the database's own order (course title, then label) is kept, so
 * two loads never disagree.
 */
export function foundrySectionOrder<T extends { foundry_closed_at: string | null }>(
	sections: readonly T[]
): T[] {
	const closed = sections.filter((s) => s.foundry_closed_at !== null);
	const open = sections.filter((s) => s.foundry_closed_at === null);
	return [...closed, ...open];
}
