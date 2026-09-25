/**
 * THE STUDENT'S LOG (ledger 0298, R32): the pure rules behind the notebook's
 * first screen for somebody writing in their own notebook -- a feed of their
 * entries with one box at the top that files itself.
 *
 * THE CHECK-IN IS A STATE ON A CHIP, NOT THE FIRST QUESTION. The composer used
 * to open on "What is this for?" and a row of check-in buttons. It still files
 * to the check-in nearest today exactly as it always did (`nearestOutstanding`,
 * the auto-pick the whole notebook shares), because a photo that stopped
 * answering today's check-in would stop counting on the teacher's grid. What
 * moved is the asking: the pick sits behind "Filed to ..., change", and where
 * the student stands on it is a word and a tone on a chip.
 *
 * THE WORDS AND TONES ARE THE CLASSROOM'S OWN (`$lib/classroom/class-check-ins`),
 * never a second vocabulary: "Not filed yet", "Draft, not turned in", "Not due
 * yet" read the same here as on the class page, and "missing" still has one
 * implementation there (`checkInStanding`), which this module never restates.
 *
 * Pure and client-safe: no Svelte, no Supabase, no DOM.
 */

import {
	checkInIsScheduled,
	checkInStatus,
	checkInStatusLabel,
	checkInTone,
	type CheckInEntry,
	type CheckInStatus,
	type CheckInTone
} from '$lib/classroom/class-check-ins';
import {
	nearestOutstanding,
	sessionHasDraft,
	type NotebookEntry,
	type NotebookSession
} from '$lib/notebook';

/** A word and a tone. The word carries the meaning; the tone never does alone. */
export interface LogCheckInState {
	status: CheckInStatus | 'all-filed';
	word: string;
	tone: CheckInTone;
}

type EntryFacts = Pick<NotebookEntry, 'session_id' | 'section_id' | 'submitted_at' | 'status'>;

/**
 * WHERE ONE ENTRY IS FILED: its check-in (or none), its class (or none) and its
 * folder (or none). The composer records one for the draft it made, because
 * once that draft exists every later save only adds to it and the picks on
 * screen stop deciding anything (ledger 0298 review).
 */
export interface DraftFiling {
	session: string | null;
	section: string | null;
	folder: string | null;
}

/**
 * THE VIEWER'S ENTRIES AS THE CHECK-IN CHIPS SHOULD SEE THEM: the loaded feed,
 * plus the draft the composer is holding when the feed has not caught up with
 * it yet. An autosave deliberately does not reload the feed, so without this a
 * check-in the student has been writing a draft against for ten minutes still
 * read "Not filed yet" -- a word that a draft on the SAME screen contradicts.
 * The draft is never turned in here, so it can never make a check-in read filed.
 */
export function withComposerDraft(
	entries: readonly EntryFacts[],
	draft: { id: string; filing: DraftFiling } | null,
	has: (id: string) => boolean
): EntryFacts[] {
	if (!draft || !draft.filing.session || has(draft.id)) return [...entries];
	return [
		...entries,
		{
			session_id: draft.filing.session,
			section_id: draft.filing.section,
			submitted_at: null,
			status: 'compliant'
		}
	];
}

/**
 * WHERE THE VIEWER STANDS ON ONE POSTING OF A CHECK-IN, from their own entries.
 *
 * Turned in is keyed on the check-in id alone, which is the rule
 * `outstandingSessions` already applies (a check-in answered through either
 * class is answered); a draft is keyed on the PAIR, which is `sessionHasDraft`'s.
 * An excusal is not known to the notebook, so it is never claimed here.
 */
export function checkInState(
	session: Pick<NotebookSession, 'id' | 'section_id' | 'session_date'>,
	entries: readonly EntryFacts[],
	today: string
): LogCheckInState {
	const turnedIn = entries.find((e) => e.session_id === session.id && e.submitted_at !== null);
	let entry: CheckInEntry | null = null;
	if (turnedIn) entry = { submitted: true, status: turnedIn.status };
	else if (sessionHasDraft(session, [...entries])) entry = { submitted: false, status: 'compliant' };
	const status = checkInStatus(entry, false, checkInIsScheduled(session.session_date, today));
	return { status, word: checkInStatusLabel(status), tone: checkInTone(status) };
}

/** The words for "every check-in you have is turned in". */
export const ALL_CHECK_INS_FILED = 'All filed';

/**
 * THE HEAD'S CHECK-IN CHIP: the check-in the composer would file to next and
 * where the student stands on it, or -- when nothing is outstanding -- that
 * every check-in is filed. Null when the student has no check-ins at all,
 * which is a normal state and shows nothing.
 */
export type LogCheckIn =
	| { kind: 'next'; session: NotebookSession; state: LogCheckInState }
	| { kind: 'clear'; state: LogCheckInState };

export function logCheckIn(
	sessions: NotebookSession[],
	entries: EntryFacts[],
	today: string
): LogCheckIn | null {
	if (sessions.length === 0) return null;
	const next = nearestOutstanding(sessions, entries, today);
	if (next) return { kind: 'next', session: next, state: checkInState(next, entries, today) };
	return { kind: 'clear', state: { status: 'all-filed', word: ALL_CHECK_INS_FILED, tone: 'good' } };
}

/**
 * WHERE THE NEXT SAVE GOES, IN WORDS, for the one line under the box.
 *
 * A check-in is named by its own label (and its class, where the student has
 * two classes it could be in); a free entry by its class, or "No class" when
 * the student chose none. A folder follows, when there is one. The title is
 * not part of it: that is the entry's name, not where it goes.
 */
export function filedToWords(input: {
	sessionLabel: string | null;
	/** The class, when naming it tells two postings apart or a free entry has one. */
	classLabel: string | null;
	folderName: string | null;
}): string {
	const where = input.sessionLabel?.trim() || input.classLabel?.trim() || 'No class';
	const parts = [where];
	if (input.sessionLabel?.trim() && input.classLabel?.trim()) parts.push(input.classLabel.trim());
	// Named as a folder, so a folder that shares a check-in's name reads as one.
	if (input.folderName?.trim()) parts.push(`${input.folderName.trim()} folder`);
	return parts.join(' · ');
}

/**
 * WHICH CLASS A CHECK-IN IS FOR, named only where it could be confused: the
 * whole notebook spans every class, and two classes routinely share a
 * check-in's name and date (a teacher posts one to both periods), which
 * rendered two identical picks. A class's own tab is one class, and says
 * nothing extra. One rule for the picks and the "Filed to" line alike.
 */
export function checkInClassLabel(
	sectionId: string | null | undefined,
	context: { scopeSectionId: string | null; classes: readonly { id: string; label: string }[] }
): string | null {
	if (context.scopeSectionId || context.classes.length < 2 || !sectionId) return null;
	return context.classes.find((c) => c.id === sectionId)?.label ?? null;
}
