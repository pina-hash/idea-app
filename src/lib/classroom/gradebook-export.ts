/**
 * THE GRADES TAB'S EXPORT (ledger 0438, report 4fbab5ca: "the Grades tab has no
 * export"): one row per student in this class, one column per assignment, the
 * score of record in each cell. Pure: the Grades load reads the rows it already
 * read for its counts (`classroom_submissions`, own-row-or-reviewer, pinned to
 * this class's assignments and this class's roster), and nothing here reads.
 *
 * A cell is the stored `score` when the work is graded and blank otherwise, so
 * an ungraded hand-in never reads as a zero. Last name first, the order a
 * gradebook sorts by; `splitLastFirst` and `csvCell` are the console's own.
 */
import { csvCell, splitLastFirst } from './assignment-spec';

export interface GradebookAssignment {
	id: string;
	title: string;
	points: number | null;
}

export interface GradebookStudent {
	email: string;
	displayName: string;
}

export interface GradebookScore {
	item_id: string;
	student_email: string;
	score: number | null;
	graded_at: string | null;
}

export interface Gradebook {
	assignments: GradebookAssignment[];
	students: GradebookStudent[];
	scores: GradebookScore[];
}

/**
 * THE GRADEBOOK FOR ONE CLASS, from the Grades load's own rows. ONLY THIS
 * CLASS'S ROSTER: an assignment posted to two classes hands a manager of both
 * the other class's rows too, and a file named for this class must not carry
 * them (`tests/classroom-gradebook-export.test.ts` holds both directions).
 */
export function gradebookFor(
	items: ReadonlyArray<{ id: string; kind: string; title?: string | null; points?: number | null }>,
	roster: ReadonlyArray<{ student_email: string; display_name?: string | null }>,
	rows: ReadonlyArray<GradebookScore>
): Gradebook {
	const onRoster = new Set(roster.map((s) => s.student_email.toLowerCase()));
	return {
		assignments: items
			.filter((i) => i.kind === 'assignment')
			.map((i) => ({ id: i.id, title: i.title ?? 'Untitled', points: i.points ?? null })),
		students: roster.map((s) => ({ email: s.student_email, displayName: s.display_name ?? '' })),
		scores: rows
			.filter((r) => onRoster.has(r.student_email.toLowerCase()))
			.map((r) => ({ item_id: r.item_id, student_email: r.student_email, score: r.score, graded_at: r.graded_at }))
	};
}

export function gradebookCsv(book: Gradebook): string {
	const header = [
		'Last name',
		'First name',
		'Email',
		...book.assignments.map((a) => (a.points != null ? `${a.title} (${a.points})` : a.title)),
		'Points earned',
		'Points possible'
	];
	const key = (item: string, email: string) => `${item}\u0000${email.toLowerCase()}`;
	const byKey = new Map(book.scores.map((s) => [key(s.item_id, s.student_email), s] as const));
	const rows = [...book.students]
		.map((s) => ({ s, ...splitLastFirst(s.displayName, s.email) }))
		.sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
	const lines = [header.map((h) => csvCell(h)).join(',')];
	for (const r of rows) {
		let earned = 0;
		let possible = 0;
		const cells = book.assignments.map((a) => {
			const row = byKey.get(key(a.id, r.s.email));
			if (!row || row.graded_at === null || row.score === null) return '';
			earned += Number(row.score);
			possible += a.points ?? 0;
			return row.score;
		});
		lines.push(
			[r.last, r.first, r.s.email, ...cells, earned, possible].map((c) => csvCell(c as string | number | null)).join(',')
		);
	}
	// The BOM `gradesCsv` writes, so Excel opens accented names correctly.
	return String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n';
}

export function gradebookCsvFilename(sectionTitle: string): string {
	const slug = sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
	return `grades-${slug}.csv`;
}
