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
/**
 * THE DOMAIN THE PREDICATE ANSWERS OVER, WHICH IS WIDER THAN THE TAB STRIP.
 *
 * `FoundryPlace` is `nav.ts`'s answer to "which tab is lit", and the three
 * routes below are not tabs: `/foundry/preview`, `/foundry/download` and
 * `/foundry/starter` are `+server.ts` endpoints that hand over BYTES. They
 * have no layout, so the group-wide gate that carries the closure never runs
 * for them, and `locateFoundry` correctly places none of them.
 *
 * 0042 REPORTED THAT AND THIS IS THE FIX. A closure that reached only the
 * places a tab can be lit for was, in 0042's own words, a shutter on five
 * documents: a student in a closed class pressed Preview on their own shelf
 * and their build ran. So the predicate's domain gains the three serve
 * routes, and each route asks it for ITSELF rather than inheriting an answer
 * from a layout it does not have.
 *
 * IT IS A WIDENING OF THE SAME PREDICATE, NOT A SECOND ONE. One array, one
 * `includes`, one null-fails-closed rule, and every existing caller passing a
 * `FoundryPlace` still type-checks unchanged. Two predicates for "does a
 * closure reach here" is precisely how a page goes dark on the server and
 * stays lit in the markup.
 */
export type FoundryGuarded = FoundryPlace | 'preview' | 'download' | 'starter';

/**
 * WHAT A CLOSURE ACTUALLY TAKES AWAY: THE TWO PLACES A BUNDLE RUNS.
 *
 * 0042's argument for the tab set is above and is unchanged. What 0045 adds
 * is the half that was missing, and the rule that decides it is the same one
 * that put `gallery` here in the first place: A CLOSURE BLOCKS WHAT RUNS A
 * STUDENT'S BUNDLE IN THE PORTAL, and nothing else.
 *
 *   preview   BLOCKED, and it is the one this bundle exists for.
 *             `/foundry/preview` executes a student's own build, at ANY
 *             status, on the portal origin. It is one press from
 *             `/foundry/mine` and one press from a successful upload on
 *             `/foundry/submit`, and both of those surfaces are deliberately
 *             OPEN -- so before this, the shortest path to playing a game in
 *             a closed class was to be the person who wrote it. That is a
 *             running game on our own host during somebody's lesson, which is
 *             the whole of what decision 01 was asked for.
 *   download  OPEN, and this is a decision rather than an omission. The route
 *             serves the AUTHOR or an admin and nobody else, so every byte it
 *             hands over is a byte that student supplied: they uploaded the
 *             zip, so they already have it, and refusing the download closes
 *             no path they do not already have open. What it would cost is
 *             real -- "does my work still exist" is the `mine` question 0042
 *             settled as open, and an admin is exempt from closures anyway.
 *   starter   OPEN. A generated template with no student app in it and
 *             nothing to run. `locateFoundry` already places `/foundry/starter`
 *             at `submit`, which 0042 settled as open because publishing is
 *             handing work IN; the file you START from cannot be the
 *             distraction.
 *
 * WHAT IS NOT HERE AND CANNOT BE, stated where the set is so nobody reads the
 * list as complete: `/a/` and `/b/`. Those answer on the APPS ORIGIN, which
 * holds no session by design, so there is no viewer there for a per-viewer
 * rule to be about. See `FOUNDRY_CLOSURE_REACH` for what the instructor is
 * told about it and the history entry for what was priced and rejected.
 */
export const FOUNDRY_CLOSURE_BLOCKS: readonly FoundryGuarded[] = ['gallery', 'preview'];

export function foundryClosureBlocks(place: FoundryGuarded | null): boolean {
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
 * THE TWO THINGS A CLOSURE CANNOT STOP ARE IN `REACH` AND DELIBERATELY NOT IN
 * `LIMIT`, AND WHICH CONSTANT THEY LAND IN IS A DISCLOSURE DECISION RATHER
 * THAN A TIDINESS ONE. `LIMIT` is rendered on `FoundryClosed`, which is THE
 * STUDENT'S OWN REFUSAL PANEL; `REACH` is rendered only on
 * `FoundryClassAccess`, which lives behind `classroom_manages_section`. So a
 * sentence naming the share link is read by the person deciding whether to
 * press the switch and never by the person it is being pressed on. Writing
 * "a published app opened by its own share link keeps running" onto a closed
 * student's panel would be handing them the way around it, in our own words,
 * on the surface refusing them.
 *
 * AND THE SENTENCE STILL HAS TO BE THERE. An instructor who believes the
 * button stops a student playing, and finds out in front of a class that it
 * does not, is worse off than one who was told the limit up front. That is
 * the whole argument for naming it rather than leaving the control quiet:
 * `/a/` and `/b/` answer on an origin that holds no session by design, so
 * there is no viewer there to gate, and there is no version of this feature
 * in which that sentence stops being true.
 *
 * NO EM DASHES, per the copy conventions.
 */
export const FOUNDRY_CLOSURE_EFFECT =
	'Closing it takes the app gallery away from students in that class, and stops them running one of their own builds in the Foundry. They cannot browse or open apps until you open it again.';

export const FOUNDRY_CLOSURE_LIMIT =
	'It leaves everything else alone: their own apps, publishing, taking a copy of their own work and the build contract all stay reachable.';

export const FOUNDRY_CLOSURE_REACH =
	'It applies to those students in every class and at home, not only during your period. The site has no way to tell which class somebody is sitting in, so there is no schedule behind this and it stays closed until you open it. Two things it cannot stop, so you know before you press it: a published app opened by its own share link keeps running, because those links work without signing in and nothing there can tell who is opening one, and a page already on a student screen keeps running until they reload it.';

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
 * THE DEGRADATION LADDER, WRITTEN DOWN ONCE.
 *
 * `foundry_section_access()` is called from FOUR places now, not one: the
 * group-wide layout gate, and each of the three serve routes, which are
 * `+server.ts` endpoints and therefore get no layout data to inherit an
 * answer from. Four inline copies of "what does an error from this RPC mean"
 * is four things that can stop agreeing about whether a failure is open or
 * closed, on the one predicate in this feature where being wrong in either
 * direction is a real outage: wrong one way locks every student out of a
 * feature nobody turned off, wrong the other way leaves the control inert.
 *
 * `PGRST202` ALONE DEGRADES TO OPEN. A deployment sitting between 0172 and
 * 0173 is a real state and the function is genuinely absent on it; the gate
 * did not exist in that world, so open is "as it was". ANY OTHER ERROR IS A
 * RUNTIME FAILURE INSIDE A GATE AND CLOSES, per the standing rule that an
 * access helper fails closed rather than falling through to a weaker check.
 * Spelled as a code check rather than a `catch` for exactly that reason.
 *
 * PURE, so it is assertable with no database: it takes the two halves
 * PostgREST already hands its caller and returns the answer.
 */
export function foundryAccessFromRpc(
	row: unknown,
	err: { code?: string | null } | null
): FoundryAccess {
	if (err) {
		return err.code === 'PGRST202' ? FOUNDRY_ACCESS_OPEN : { open: false, closed: [] };
	}
	if (!row) return FOUNDRY_ACCESS_OPEN;
	return row as FoundryAccess;
}

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
