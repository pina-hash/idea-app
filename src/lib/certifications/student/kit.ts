/**
 * The certification page's arithmetic (ledger 0391): which kit section a
 * checklist row jumps to, whether a part's submission form is open and why
 * not, how a form's answers become the evidence jsonb `cert_submit` takes,
 * and the words a student reads about progress. Pure, so a test can put a
 * corpus to each with no browser; the database (`_cert_part_unlocked`,
 * `cert_submit`'s own checks) is still the gate.
 */
import { PART_WORDS, partUnlocked } from '$lib/certifications/parts';
import {
	CERT_PARTS,
	type CertAttemptJson,
	type CertCheckJson,
	type CertEvidence,
	type CertEvidenceFile,
	type CertGetJson,
	type CertPart,
	type CertSubmissionJson,
	type CertTrainingProgress,
	type EvidenceItem,
	type SelfInspectionAnswer,
	type SubmissionPart,
	WATCH_COVERAGE
} from '$lib/certifications/types';
import { normalizeYouTubeId } from '$lib/youtube';

/* ---------------------------------------------------------------------- */
/* Sections and jumps                                                      */
/* ---------------------------------------------------------------------- */

export const KIT_SECTIONS = [
	'definition',
	'training',
	'practice',
	'study',
	'mistakes',
	'guided',
	'exam',
	'autonomous',
	'checkout'
] as const;
export type KitSection = (typeof KIT_SECTIONS)[number];

export const KIT_SECTION_WORDS: Record<KitSection, string> = {
	definition: 'Definition',
	training: 'Training',
	practice: 'Practice quiz',
	study: 'Study guide',
	mistakes: 'Common mistakes',
	guided: 'Guided project',
	exam: 'Exam',
	autonomous: 'Autonomous project',
	checkout: 'Checkout'
};

/** Every anchored section carries an id; a stacked harness prefixes them so two pages never share one. */
export function sectionId(prefix: string, section: KitSection): string {
	return `${prefix}-${section}`;
}

/** The section a checklist row jumps to: every part has one of the same name. */
export function partSection(part: CertPart): KitSection {
	return part;
}

/**
 * Scrolls an anchored section fully into view below the sticky bar
 * (`cert.css` sets `scroll-margin-top` on every `[id]` in the room). `instant`
 * because `app.css` sets `scroll-behavior: smooth` globally and a jump that
 * eases reads as the page drifting.
 */
export function jumpTo(id: string, doc: Document | null = typeof document === 'undefined' ? null : document): boolean {
	const el = doc?.getElementById(id);
	if (!el) return false;
	el.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
	return true;
}

/* ---------------------------------------------------------------------- */
/* Checklist words                                                         */
/* ---------------------------------------------------------------------- */

/** The required part before this one that is still pending, for "Unlocks after <part>". */
export function lockedAfter(checks: readonly CertCheckJson[], part: CertPart): string | null {
	if (partUnlocked(checks as CertCheckJson[], part)) return null;
	let last: CertPart | null = null;
	for (const p of CERT_PARTS) {
		if (p === part) break;
		const s = checks.find((c) => c.part === p)?.state;
		if (s === 'pending') last = p;
	}
	return last ? PART_WORDS[last] : null;
}

/** "Checked by Mr. Pina", "Checked itself off", or nothing. */
export function checkedByWords(check: CertCheckJson): string {
	if (check.state !== 'done') return '';
	const who = (check.checked_by_name ?? '').trim();
	if (!who || who.toLowerCase() === 'system') return 'Checked itself off';
	return `Checked by ${who}`;
}

/* ---------------------------------------------------------------------- */
/* Submissions                                                             */
/* ---------------------------------------------------------------------- */

/** This part's submissions, newest first. */
export function submissionsFor(attempt: CertAttemptJson | null, part: SubmissionPart): CertSubmissionJson[] {
	if (!attempt) return [];
	return attempt.submissions
		.filter((s) => s.part === part)
		.slice()
		.sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
}

export function pendingSubmission(attempt: CertAttemptJson | null, part: SubmissionPart): CertSubmissionJson | null {
	return submissionsFor(attempt, part).find((s) => s.state === 'pending') ?? null;
}

export type FormState =
	| { open: true }
	| { open: false; reason: 'no_attempt' | 'closed' | 'waived' | 'locked' | 'pending' | 'done'; words: string };

/**
 * Whether this part takes a hand-in right now, and the sentence for why not.
 * The database refuses the same cases (`cert_submit`); this only decides what
 * is drawn, so a control whose only answer is a refusal is never offered.
 */
export function formStateFor(cert: Pick<CertGetJson, 'my_attempt' | 'parts'>, part: SubmissionPart): FormState {
	const attempt = cert.my_attempt;
	if (!attempt) return { open: false, reason: 'no_attempt', words: 'Press Start to open this certification.' };
	if (attempt.state !== 'active' && attempt.state !== 'dormant') {
		return { open: false, reason: 'closed', words: 'This attempt is closed. Start again to hand in work.' };
	}
	if (!cert.parts[part]) return { open: false, reason: 'waived', words: 'This certification does not use this part.' };
	const check = attempt.checks.find((c) => c.part === part);
	if (check?.state === 'done') return { open: false, reason: 'done', words: 'This part is checked off.' };
	const after = lockedAfter(attempt.checks, part);
	if (after) return { open: false, reason: 'locked', words: `Unlocks after ${after}.` };
	if (pendingSubmission(attempt, part)) {
		return { open: false, reason: 'pending', words: 'Your hand-in is waiting for review. You can hand in again once it is returned.' };
	}
	return { open: true };
}

/* ---------------------------------------------------------------------- */
/* Evidence                                                                */
/* ---------------------------------------------------------------------- */

/** What the form holds for one evidence item, keyed by the item's index. */
export interface EvidenceValue {
	text: string;
	files: CertEvidenceFile[];
}

export function emptyEvidenceValue(): EvidenceValue {
	return { text: '', files: [] };
}

export function youtubeIdOf(input: string): string | null {
	const id = normalizeYouTubeId(input);
	return id || null;
}

function urlOk(value: string): boolean {
	try {
		const u = new URL(value.trim());
		return u.protocol === 'https:' || u.protocol === 'http:';
	} catch {
		return false;
	}
}

/** Whether one item's value counts as present and well formed. */
export function evidenceItemFilled(item: EvidenceItem, value: EvidenceValue | undefined): boolean {
	const v = value ?? emptyEvidenceValue();
	switch (item.kind) {
		case 'photo':
		case 'file':
			return v.files.length > 0;
		case 'text':
			return v.text.trim().length > 0;
		case 'link':
			return urlOk(v.text);
		case 'youtube':
			return youtubeIdOf(v.text) !== null;
	}
}

/** The labels of every required item still missing, and of any filled item that is malformed. */
export function evidenceProblems(items: readonly EvidenceItem[], values: Readonly<Record<number, EvidenceValue>>): string[] {
	const out: string[] = [];
	items.forEach((item, i) => {
		const v = values[i];
		const filled = evidenceItemFilled(item, v);
		if (item.required && !filled) {
			const typed = v && (v.text.trim() || v.files.length);
			if (typed && item.kind === 'link') out.push(`${item.label}: that is not a web address`);
			else if (typed && item.kind === 'youtube') out.push(`${item.label}: that is not a YouTube link`);
			else out.push(`${item.label} is required`);
		} else if (!item.required && v && v.text.trim() && !filled) {
			out.push(item.kind === 'youtube' ? `${item.label}: that is not a YouTube link` : `${item.label}: that is not a web address`);
		}
	});
	return out;
}

/**
 * The evidence jsonb `cert_submit` takes, from the form's values. The stored
 * shape has ONE text, ONE youtube id, a list of links and a list of files, so
 * several text items are joined under their labels, the first YouTube item is
 * the id and any further one travels as a full link.
 */
export function buildEvidence(items: readonly EvidenceItem[], values: Readonly<Record<number, EvidenceValue>>): CertEvidence {
	const texts: string[] = [];
	const links: string[] = [];
	const files: CertEvidenceFile[] = [];
	let youtube: string | null = null;
	items.forEach((item, i) => {
		const v = values[i] ?? emptyEvidenceValue();
		switch (item.kind) {
			case 'photo':
			case 'file':
				files.push(...v.files);
				break;
			case 'text':
				if (v.text.trim()) texts.push(items.filter((x) => x.kind === 'text').length > 1 ? `${item.label}\n${v.text.trim()}` : v.text.trim());
				break;
			case 'link':
				if (urlOk(v.text)) links.push(v.text.trim());
				break;
			case 'youtube': {
				const id = youtubeIdOf(v.text);
				if (!id) break;
				if (youtube === null) youtube = id;
				else links.push(`https://www.youtube.com/watch?v=${id}`);
				break;
			}
		}
	});
	return { text: texts.join('\n\n'), links, youtube_id: youtube, files };
}

export function buildSelfInspection(items: readonly string[], checked: readonly boolean[]): SelfInspectionAnswer[] {
	return items.map((item, i) => ({ item, checked: !!checked[i] }));
}

/** Everything the Submit key needs: every required item, every box. */
export function submitProblems(
	items: readonly EvidenceItem[],
	values: Readonly<Record<number, EvidenceValue>>,
	selfInspection: readonly string[],
	checked: readonly boolean[]
): string[] {
	const out = evidenceProblems(items, values);
	const unticked = selfInspection.filter((_, i) => !checked[i]).length;
	if (unticked > 0) out.push(`${unticked} self-inspection box${unticked === 1 ? '' : 'es'} still unticked`);
	return out;
}

/* ---------------------------------------------------------------------- */
/* Training progress                                                       */
/* ---------------------------------------------------------------------- */

export function trainingProgressFor(rows: readonly CertTrainingProgress[], itemKey: string): CertTrainingProgress | null {
	return rows.find((r) => r.item_key === itemKey) ?? null;
}

/** "Watched", "Done", "62% played", "Not started". */
export function trainingWords(row: CertTrainingProgress | null, kind: 'video' | 'lesson'): { word: string; done: boolean } {
	if (!row) return { word: 'Not started', done: false };
	if (row.completed_at) return { word: kind === 'video' ? 'Watched' : 'Done', done: true };
	if (kind === 'lesson') return { word: 'In progress', done: false };
	const d = row.duration_seconds;
	if (!d || d <= 0) return { word: 'Started', done: false };
	const pct = Math.min(100, Math.floor((row.covered_seconds / d) * 100));
	return { word: `${pct}% played`, done: false };
}

/** The coverage a watch report answered, as a sentence: "Counted: 97% played." */
export function coverageWords(coverage: number, complete: boolean): string {
	const pct = Math.max(0, Math.min(100, Math.round(coverage * 100)));
	if (complete) return `Counted: ${pct}% played. This video is watched.`;
	return `Counted: ${pct}% played. ${Math.round(WATCH_COVERAGE * 100)}% counts as watched.`;
}

/* ---------------------------------------------------------------------- */
/* Exam words                                                              */
/* ---------------------------------------------------------------------- */

/** "Passed", "Not passed: Setup, Speeds and feeds", "In progress", "Released", "Expired". */
export function examAttemptWords(exam: { state: string; passed: boolean | null; missed_topics: string[] }, topicNames: Readonly<Record<string, string>> = {}): string {
	if (exam.passed === true) return 'Passed';
	if (exam.passed === false) {
		const names = exam.missed_topics.map((t) => topicNames[t] ?? t);
		return names.length ? `Not passed: ${names.join(', ')}` : 'Not passed';
	}
	if (exam.state === 'in_progress') return 'In progress';
	if (exam.state === 'released') return 'Released';
	if (exam.state === 'expired') return 'Release expired';
	return 'Submitted';
}

/** The exam this student may open right now: released or in progress. */
export function openableExam(attempt: CertAttemptJson | null): { id: string; state: string } | null {
	if (!attempt) return null;
	return attempt.exams.find((e) => e.state === 'released' || e.state === 'in_progress') ?? null;
}
