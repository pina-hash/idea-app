/**
 * WHAT A COMMIT'S FIRST LINE MAY BE (ledger 0458, report fb08d358). The first
 * line of every commit is a title on the site's update list (CLAUDE.md,
 * "Commit subjects are user-facing changelog copy"), and the changes go in the
 * body as `- ` bullets. On 2026-10-28 two commits carried their whole message
 * on the first line, clauses joined with " - ", and the update list showed one
 * long title.
 *
 * ONE RULE, TWO READERS: `tools/commit-subjects.mjs` (the CI check on every
 * push) refuses such a line, and `src/lib/site-versions.ts` splits one that
 * already landed into a title and its bullets. Dependency-free and plain
 * TypeScript, so Node runs it in CI with no build.
 */

/** The longest first line the update list shows whole. The report said "about 90"; 100 lets through the 94-character titles sessions write every day (13 of the last 100 commits ran 91 to 99) and still catches every joined one-line message. */
export const SUBJECT_MAX = 100;

/** The joint a one-line message used between its clauses. */
const JOINT = ' - ';

/** Why a first line is refused, in words, or an empty list. */
export function subjectProblems(subject: string): string[] {
	const s = subject.trim();
	const out: string[] = [];
	if (s.length > SUBJECT_MAX) out.push(`it is ${s.length} characters; keep the first line to ${SUBJECT_MAX} and put the rest in the body as "- " lines`);
	if (s.includes(JOINT)) out.push('it joins clauses with " - "; put each one in the body as its own "- " line');
	return out;
}

/**
 * A ONE-LINE MESSAGE ALREADY LANDED, AS A TITLE AND ITS BULLETS: split at each
 * " - " only when the line is over the limit, so a short title with a dash in
 * it ("Drive Team Playbook - re-tuned") reads as written.
 */
export function splitJoinedSubject(subject: string): { title: string; details: string[] } {
	const s = subject.trim();
	if (s.length <= SUBJECT_MAX || !s.includes(JOINT)) return { title: s, details: [] };
	const [title, ...rest] = s.split(JOINT).map((p) => p.trim()).filter(Boolean);
	return { title: title ?? s, details: rest };
}
