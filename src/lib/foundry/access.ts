/**
 * THE CLASS GATE, ON THE CLIENT SIDE OF IT.
 *
 * 0173 gives `classroom_sections` a `foundry_closed_at` stamp and
 * `foundry_section_access()` answers, for the caller, whether any class they
 * are actively enrolled in has closed the Foundry. THE DATABASE ANSWERS WHO
 * CLOSED IT; THIS MODULE ANSWERS WHAT THAT REACHES. Everything here shapes a
 * sentence and decides which surfaces stand down, and none of it is what
 * enforces the standing down: that is each page load short-circuiting for
 * itself, on the server, with 0173's own predicates underneath.
 *
 * WHAT IT REACHES IS ONE SURFACE, and the argument for that is on
 * `FOUNDRY_CLOSURE_BLOCKS` below. It is the whole subject of this module now.
 *
 * PURE, CLIENT-SAFE, NO SVELTE. The registry shape every subsystem here has:
 * plain data and pure helpers, so the arithmetic is assertable with no browser
 * and no database.
 */

import type { FoundryPlace } from './nav.ts';

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
 * WHAT A CLOSURE ACTUALLY TAKES AWAY, AND IT IS ONE SURFACE.
 *
 * 0173 built the toggle as decision 01 was answered -- per section, checked on
 * the server -- and then flagged what it costs: THE SITE CANNOT TELL WHICH
 * CLASS A STUDENT IS SITTING IN. There is no bell schedule anywhere in this
 * schema, `classroom_sections.block` is free-form display text with no time in
 * it, a hall pass records that somebody is OUT of a room rather than in one,
 * and `classroom_item_views` is keyed `(student_email, item_id)` on a
 * CANONICAL item that is posted to many sections, so it names no section and
 * no session. Nothing else records a presence of any kind. So "during my
 * class" is not a question this application can ask, and any closure that
 * binds a student at all binds them in every class and at home until somebody
 * opens it again.
 *
 * WHICH LEAVES SCOPE AS THE ONLY LEVER, and it is a lever on SURFACES rather
 * than on time. A closure blocks the GALLERY and nothing else:
 *
 *   gallery   BLOCKED. Everybody's published apps, and the one surface in the
 *             portal where a student's bundle actually RUNS -- `FoundryDetail`
 *             is what mounts `AppStage`. This is the "somebody is playing a
 *             game in my class" surface and it is the one the control exists
 *             for.
 *   mine      OPEN. The student's own shelf: their apps, their versions, their
 *             play figures, their share links, their delete. Nothing here runs
 *             an app. Taking a student's own record away from them in five
 *             other classes and at home, because one teacher closed one
 *             period, is the defect this scope exists to end.
 *   submit    OPEN. Publishing is handing work IN. In an IDEA class the
 *             Foundry app can BE the assignment, so a close in period 3 must
 *             not stop a hand-in for period 6 or at home. What a student
 *             publishes during a closed period lands in a gallery that period
 *             cannot open.
 *   contract  OPEN. A generated reference document with no student data and no
 *             app in it, and the thing a student pastes into an AI tool to
 *             build correctly. Blocking it blocks the work rather than the
 *             distraction.
 *   classes   OPEN, AND THIS ONE IS A FIX RATHER THAN A PREFERENCE.
 *             Instructors enroll themselves in their own sections to see the
 *             class the way a student does, and `foundry_section_access` reads
 *             ENROLLMENTS -- so a section manager who is not also an admin was
 *             locked out by their own close, out of the only control that
 *             reopens it. A one-way door.
 *   review    OPEN. Admin only, and `foundry_section_access` already answers
 *             open for an admin; named here so the set is total.
 *
 * AND `null` FAILS CLOSED. A route added under /foundry that `locateFoundry`
 * does not yet place is blocked until somebody decides where it belongs, which
 * is the same argument the group-wide gate itself is hoisted for: a new page
 * must not ship past a decision by nobody having made it.
 *
 * NONE OF THIS IS THE ENFORCEMENT. Each page load short-circuits for itself
 * and the layout renders the reason; this is the one statement of which
 * surfaces those are, so the panel, the loads and the instructor's own copy
 * cannot come to disagree about what a close does.
 */
export const FOUNDRY_CLOSURE_BLOCKS: readonly FoundryPlace[] = ['gallery'];

export function foundryClosureBlocks(place: FoundryPlace | null): boolean {
	if (place === null) return true;
	return FOUNDRY_CLOSURE_BLOCKS.includes(place);
}

/**
 * THE THREE SENTENCES THE INSTRUCTOR READS BEFORE PRESSING, AND THE STUDENT
 * READS AFTER.
 *
 * A CONTROL WHOSE BLAST RADIUS NOBODY CAN PREDICT IS THE DEFECT BEING FIXED,
 * so the reach sentence is not a footnote: it says out loud that a close binds
 * the student everywhere, because that is the one thing about this toggle that
 * a reasonable person would guess wrong. They live here rather than in the
 * component so the panel a student reads and the copy an instructor presses
 * cannot describe two different closures.
 *
 * NO EM DASHES, per the copy conventions.
 */
export const FOUNDRY_CLOSURE_EFFECT =
	'Closing it takes the app gallery away from students in that class. They cannot browse or open other students apps until you open it again.';

export const FOUNDRY_CLOSURE_LIMIT =
	'It leaves everything else alone: their own apps, publishing, the build contract and anything already published all stay reachable.';

export const FOUNDRY_CLOSURE_REACH =
	'It applies to those students in every class and at home, not only during your period. The site has no way to tell which class somebody is sitting in, so there is no schedule behind this and it stays closed until you open it.';

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
