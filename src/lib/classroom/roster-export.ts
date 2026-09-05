/**
 * THE ROSTER, OUT OF THE PAGE AND INTO SOMETHING ELSE: a CSV file, or a mail
 * client addressed to the class.
 *
 * Pure functions over the rows the People tab already holds. No Svelte, no
 * Supabase, no DOM and no clock -- every function that needs "now" takes it, so
 * a filename is assertable at a pinned instant.
 *
 * NOTHING HERE IS A BOUNDARY AND NOTHING HERE FILTERS FOR PRIVACY. The rows
 * arrive from `classroom_section_roster`, which the database already gated on
 * `classroom_manages_section`; every column below is one the instructor is
 * looking at on screen when they press the control. What this module decides is
 * only SHAPE -- which columns, in what order, escaped how.
 *
 * WHAT IS DELIBERATELY LEFT OUT, and it is worth saying because an export is
 * exactly where a field gets added without anybody deciding to:
 *
 *   * `section_id`. An internal uuid that means nothing in a spreadsheet and
 *     everything in a URL somebody pastes.
 *   * `updated_at`. It is on no screen in this tab, so exporting it would be
 *     this module widening what a roster read discloses rather than moving what
 *     it already shows. A roster import stamps it, so it also says nothing
 *     about the student.
 *
 * The columns that ARE here map one-to-one onto the row as rendered:
 * `roster-name`, `roster-email` and `roster-status` (`rosterStatus` in
 * `PeoplePanel.svelte`), plus the class the whole page is about.
 */

import { csvCell, splitLastFirst } from '$lib/classroom/assignment-spec';
import type { ClassroomEnrollment, ClassroomSection } from '$lib/classroom/classroom';

/**
 * The one status vocabulary, and it is the SAME SENTENCE the row shows.
 *
 * `rosterStatus` in `PeoplePanel.svelte` decides the label on screen; this
 * decides the label in the file, and the two agree because they answer the
 * same three cases in the same order. A `manages` row is neither enrolled nor
 * inactive -- 0138's whole point is that a person who can manage the section is
 * never a student row in it -- so it gets its own word rather than being
 * flattened into "Enrolled".
 */
export function rosterStatusLabel(row: ClassroomEnrollment): string {
	if (row.manages === true) return 'Manages this class';
	return row.active ? 'Enrolled' : 'Not on the live roster';
}

/** The header row, exported so a test can assert the file against it rather than a retyped copy. */
export const ROSTER_CSV_HEADERS = [
	'Last',
	'First',
	'Email',
	'Status',
	'Class',
	'Block'
] as const;

/**
 * The roster as a CSV, sorted the way a gradebook is: last name, then first.
 *
 * IT REUSES `csvCell` AND `splitLastFirst` FROM `assignment-spec`, which is
 * where the grades CSV lives. The escape rule matters more than the sort: a
 * display name is a value a person typed, this file gets opened in Excel, and
 * Excel executes a leading `=`, `+`, `-` or `@`. A second escape written here
 * would be a second thing to remember that about.
 *
 * EVERY ROW IS INCLUDED, MANAGERS AND INACTIVE ENROLLMENTS ALIKE, and the
 * Status column is what tells them apart. This is the same call the People tab
 * makes for exactly the reason 0138 gives: a manager's row is the row somebody
 * came here to look at, and silently dropping an inactive enrollment from a
 * file called "roster" would hide a student who left in the one artifact
 * somebody keeps.
 */
export function rosterCsv(section: ClassroomSection, rows: readonly ClassroomEnrollment[]): string {
	const sorted = [...rows].sort((a, b) => {
		const an = splitLastFirst(a.display_name, a.student_email);
		const bn = splitLastFirst(b.display_name, b.student_email);
		return (
			an.last.localeCompare(bn.last, undefined, { sensitivity: 'base' }) ||
			an.first.localeCompare(bn.first, undefined, { sensitivity: 'base' }) ||
			a.student_email.localeCompare(b.student_email)
		);
	});
	const lines = [ROSTER_CSV_HEADERS.join(',')];
	for (const row of sorted) {
		const { last, first } = splitLastFirst(row.display_name, row.student_email);
		lines.push(
			[
				csvCell(last),
				csvCell(first),
				csvCell(row.student_email),
				csvCell(rosterStatusLabel(row)),
				csvCell(section.course?.code ? `${section.course.code} ${section.label}` : section.label),
				csvCell(section.block ?? '')
			].join(',')
		);
	}
	// The BOM is BUILT AT RUNTIME, the `gradesCsv` rule: a source literal and an
	// escape both proved unable to survive the toolchain here, and Excel needs it
	// to open accented names correctly.
	return String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n';
}

/** A filename a teacher can find again: the class, then the day it was taken. */
export function rosterCsvFilename(section: ClassroomSection, nowMs: number): string {
	const day = new Date(nowMs).toISOString().slice(0, 10);
	const stem = [section.course?.code ?? 'class', section.label, day]
		.join('-')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${stem || 'roster'}-roster.csv`;
}

// ---------------------------------------------------------------------------
// EMAILING THE CLASS.
// ---------------------------------------------------------------------------

/**
 * WHO GETS THE MAIL: the ACTIVE students, deduplicated, lowercased, sorted.
 *
 * MANAGERS ARE DROPPED (0138). An instructor enrolled in their own section --
 * which roster imports do routinely -- would otherwise be a recipient of every
 * class email they send, and on a co-taught section the other instructor would
 * be silently addressed as a student. `splitRoster` is the one implementation
 * of that rule and this defers to the same `manages` flag it reads.
 *
 * INACTIVE ENROLLMENTS ARE DROPPED. Somebody off the live roster is somebody
 * who left the class; mailing them the class's business is the failure mode
 * that matters here, and the CSV above is where they are still visible.
 *
 * NORMALIZED AND DEDUPED, the CLAUDE.md rule for any list of identity keys:
 * `A@x` and `a@x` are one person, and a class email that named both would
 * arrive twice.
 */
export function classEmailRecipients(rows: readonly ClassroomEnrollment[]): string[] {
	const seen = new Set<string>();
	for (const row of rows) {
		if (row.manages === true || !row.active) continue;
		const email = row.student_email.trim().toLowerCase();
		if (email.includes('@')) seen.add(email);
	}
	return [...seen].sort();
}

/**
 * THE CEILING ON A `mailto:` URL, AND WHY THERE IS ONE AT ALL.
 *
 * There is no specified limit and every layer in the chain has a different
 * practical one -- the browser, the OS handler registration, and the mail
 * client at the far end. The value that keeps being reported as the first one
 * to break is the Windows shell's command-line handling at roughly 2000
 * characters, and a class roster is exactly the payload that reaches it: forty
 * `first.last@boscotech.net` addresses percent-encoded run past 1200 before the
 * subject is added.
 *
 * SO THE CEILING IS DELIBERATELY CONSERVATIVE, AND THE FAILURE IS NEVER
 * SILENT. The one outcome this module refuses to produce is a link that opens a
 * draft with some of the class missing and nothing on screen saying so -- a
 * teacher would send it, and the students who did not get it would have no way
 * to know they had not.
 */
export const MAILTO_URL_LIMIT = 1800;

export interface MailtoDraft {
	/** The `mailto:` URL for this draft. */
	href: string;
	/** The addresses this draft actually carries, in order. */
	recipients: string[];
}

export interface MailtoPlan {
	/** One entry per draft the mail client will be asked to open. */
	drafts: MailtoDraft[];
	/** Every recipient, across every draft. Equal to the input, deduped. */
	recipients: string[];
	/** True when one address alone will not fit, so no draft can be built at all. */
	impossible: boolean;
}

/**
 * BCC, NEVER TO. A class list in the `To:` field hands every student every
 * other student's address, on every message, forever -- and it is the kind of
 * disclosure nobody notices making because the mail client renders it as one
 * blob. The teacher is the only visible recipient, which is also what makes a
 * reply go to them rather than to thirty people.
 *
 * COMMA-SEPARATED, per RFC 6068. Semicolons are an Outlook convention that
 * other clients read as part of an address.
 */
function mailtoHref(recipients: readonly string[], subject: string): string {
	const bcc = recipients.join(',');
	const params = [`bcc=${encodeURIComponent(bcc)}`];
	if (subject.trim()) params.push(`subject=${encodeURIComponent(subject.trim())}`);
	return `mailto:?${params.join('&')}`;
}

/**
 * SPLIT THE CLASS INTO AS MANY DRAFTS AS THE CEILING NEEDS, AND SAY SO.
 *
 * The alternative shapes were both rejected:
 *
 *   * ONE URL, TRUNCATED. This is the defect. A control that quietly drops
 *     recipients produces a message that looks sent and is not, and the people
 *     it failed for are precisely the ones who cannot tell.
 *   * ONE URL, REFUSED WHEN TOO LONG. Better, but it leaves the ordinary case
 *     -- a class of forty -- with no working control at all, which is the
 *     report this was written for.
 *
 * The chunks are built by MEASURING THE ENCODED URL, not by counting
 * addresses: `%40` is three characters for one, and a roster of long names
 * encodes to nearly double its plain length, so an address count would be a
 * guess that fails on exactly the class that needs it.
 *
 * `impossible` IS A REAL OUTCOME, not a defensive branch: a single address long
 * enough to exceed the ceiling on its own cannot be chunked any further, and
 * the surface then offers the copyable list instead.
 */
export function mailtoPlan(
	recipients: readonly string[],
	subject = '',
	limit: number = MAILTO_URL_LIMIT
): MailtoPlan {
	const all = [...new Set(recipients)];
	if (all.length === 0) return { drafts: [], recipients: [], impossible: false };

	const drafts: MailtoDraft[] = [];
	let batch: string[] = [];
	for (const email of all) {
		const next = [...batch, email];
		if (mailtoHref(next, subject).length <= limit) {
			batch = next;
			continue;
		}
		if (batch.length === 0) {
			// This one address does not fit by itself. Nothing smaller exists to
			// try, so the plan says so rather than emitting a URL that is over
			// the ceiling or a draft that is missing somebody.
			return { drafts: [], recipients: all, impossible: true };
		}
		drafts.push({ href: mailtoHref(batch, subject), recipients: batch });
		batch = [email];
	}
	if (batch.length > 0) drafts.push({ href: mailtoHref(batch, subject), recipients: batch });

	return { drafts, recipients: all, impossible: false };
}

/**
 * THE SENTENCE ON SCREEN, WHICH IS THE HALF THAT MAKES THIS HONEST.
 *
 * A teacher must know BEFORE they press how many drafts are about to open and
 * that between them they carry the whole class. "Opens 1 draft" and "opens 2
 * drafts, 25 and 16 students" are different pieces of information and only the
 * second one lets somebody notice that the second window never appeared.
 */
export function mailtoPlanNote(plan: MailtoPlan): string {
	if (plan.recipients.length === 0) {
		return 'Nobody on the live roster to email. Only active students are included, and instructors are left out.';
	}
	if (plan.impossible) {
		return `${plan.recipients.length} student${plan.recipients.length === 1 ? '' : 's'}, but one address is too long for a mail link. Copy the list instead so nobody is left off.`;
	}
	if (plan.drafts.length === 1) {
		return `Opens one draft, BCC to all ${plan.recipients.length} student${plan.recipients.length === 1 ? '' : 's'}. Nobody sees anybody else's address.`;
	}
	const sizes = plan.drafts.map((d) => d.recipients.length).join(' + ');
	return `Too many addresses for one mail link, so this opens ${plan.drafts.length} drafts (${sizes} = ${plan.recipients.length} students), each BCC. Send all ${plan.drafts.length} or some of the class will not get it.`;
}

/**
 * The addresses as text, for pasting anywhere a `mailto:` cannot reach --
 * webmail, a mailing list, a district tool. Comma-separated, which every mail
 * client accepts in a manually pasted field.
 */
export function classEmailList(recipients: readonly string[]): string {
	return recipients.join(', ');
}
