/**
 * THE GRADING RULES THE CONSOLE SHOWS BEFORE IT SAVES (ledger 0457, items 16
 * to 19). Pure, so each is tested without a database; the database applies the
 * same arithmetic when the grade is saved (0321), and these exist so the grader
 * sees the numbers first.
 *
 *   - LATE CREDIT (item 16): per rubric line, on time + rate x (final - on time).
 *   - A RUBRIC SCALED TO THE POST'S POINTS (item 17).
 *   - TEAMS MERGED (item 18): each box's newest answer across a team, with who
 *     wrote it.
 *   - A RUBRIC LINE THE PAGE HIDES (item 19): the requirement is only in a
 *     tooltip, a closed disclosure or hidden text.
 */
import { manifestCriterionId, type HtmlAssignmentManifest } from './html-assignment/rubric';
import type { RubricCriterion } from './assignment-spec';

// ---------------------------------------------------------------------------
// Late credit
// ---------------------------------------------------------------------------

export interface LateLine {
	id: string;
	onTime: number;
	final: number;
	credited: number;
	late: boolean;
}

/** Two places, the database's own rounding (`round(x, 2)`, half away from zero). */
export function round2(n: number): number {
	const s = Math.sign(n);
	return (s * Math.round(Math.abs(n) * 100 + Number.EPSILON)) / 100;
}

/**
 * Per line: a line with no on-time score was all on time, unless `lateIds`
 * names it (an answer behind it was saved late), which lands in `needOnTime`;
 * a line whose final
 * score is below its on-time one is refused by the database ("late work never
 * lowers a grade") and is marked here so the grader sees it first.
 */
export function lateCreditLines(
	rubric: readonly RubricCriterion[],
	onTime: Readonly<Record<string, number | null | undefined>>,
	final: Readonly<Record<string, number | null | undefined>>,
	rate: number,
	lateIds: ReadonlySet<string> = new Set()
): { lines: LateLine[]; total: number; invalid: string[]; needOnTime: string[] } {
	const lines: LateLine[] = [];
	const invalid: string[] = [];
	// A LATE LINE LEFT WITHOUT AN ON-TIME SCORE WOULD COUNT AS ALL ON TIME, so
	// the database refuses it (`on_time_needed`) and this says so first.
	const needOnTime: string[] = [];
	for (const c of rubric) {
		const f = final[c.id];
		if (f == null || !Number.isFinite(f)) continue;
		const o = onTime[c.id];
		const given = o != null && Number.isFinite(o);
		if (!given && lateIds.has(c.id)) needOnTime.push(c.id);
		const on = given ? (o as number) : f;
		if (on > f) invalid.push(c.id);
		const credited = round2(on + rate * (f - on));
		lines.push({ id: c.id, onTime: on, final: f, credited, late: on < f });
	}
	return { lines, total: round2(lines.reduce((n, l) => n + l.credited, 0)), invalid, needOnTime };
}

/** Which rubric lines a block's answer feeds: its module's criteria. */
export function criteriaOfBlock(manifest: HtmlAssignmentManifest | null | undefined, blockId: string): string[] {
	for (const m of manifest?.modules ?? []) {
		if ((m.blocks ?? []).some((b) => b.id === blockId)) {
			return (m.criteria ?? []).map((c) => manifestCriterionId(m.id, c.id));
		}
	}
	return [];
}

/**
 * THE RUBRIC LINES WITH A LATE ANSWER BEHIND THEM, for one student: every line
 * of a module where an answer was saved after the student's own due date.
 */
export function lateLinesFor(
	manifest: HtmlAssignmentManifest | null | undefined,
	responses: ReadonlyArray<{ block_id: string; updated_at?: string | null }>,
	dueAt: string | null,
	files: ReadonlyArray<{ block_id: string | null; created_at?: string | null }> = []
): Set<string> {
	const out = new Set<string>();
	const due = dueAt ? Date.parse(dueAt) : NaN;
	if (!manifest || !Number.isFinite(due)) return out;
	const consider = (blockId: string | null, iso: string | null | undefined) => {
		const at = iso ? Date.parse(iso) : NaN;
		if (!blockId || !Number.isFinite(at) || at <= due) return;
		for (const id of criteriaOfBlock(manifest, blockId)) out.add(id);
	};
	for (const r of responses) consider(r.block_id, r.updated_at);
	// A picture handed in after the due date is a late answer too.
	for (const f of files) consider(f.block_id, f.created_at);
	return out;
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

export interface RubricScale {
	/** The rubric's own total. */
	from: number;
	/** The post's points. */
	to: number;
	/** The switch is on: grades are saved out of `to`. */
	on: boolean;
	/** The two disagree, so the grader must be told either way. */
	mismatch: boolean;
}

export function rubricScale(rubricTotal: number | null, points: number | null, on: boolean): RubricScale | null {
	if (rubricTotal == null || rubricTotal <= 0 || points == null || points <= 0) return null;
	return { from: rubricTotal, to: points, on: on && rubricTotal !== points, mismatch: rubricTotal !== points };
}

/** A rubric sum as it will be saved. */
export function scaledScore(sum: number, scale: RubricScale | null): number {
	if (!scale || !scale.on) return sum;
	return round2((sum * scale.to) / scale.from);
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export interface MergedAnswer {
	blockId: string;
	value: unknown;
	by: string;
	at: string | null;
	/** How many teammates answered this box. */
	answeredBy: number;
}

/**
 * EACH BOX'S NEWEST ANSWER ACROSS A TEAM, WITH WHO WROTE IT (report 62eded18).
 * An empty answer never wins over a real one; ties go to the earlier address
 * so the merge is stable.
 */
export function mergeTeamAnswers(
	rows: ReadonlyArray<{ student_email: string; block_id: string; value: unknown; updated_at?: string | null }>,
	members: readonly string[]
): MergedAnswer[] {
	const on = new Set(members.map((m) => m.toLowerCase()));
	const byBlock = new Map<string, MergedAnswer>();
	const count = new Map<string, number>();
	const blank = (v: unknown) => {
		if (v == null) return true;
		if (typeof v === 'object' && v && 'text' in v) return String((v as { text?: unknown }).text ?? '').trim() === '';
		return false;
	};
	const sorted = [...rows].sort((a, b) => a.student_email.localeCompare(b.student_email));
	for (const r of sorted) {
		const email = r.student_email.toLowerCase();
		if (!on.has(email) || blank(r.value)) continue;
		count.set(r.block_id, (count.get(r.block_id) ?? 0) + 1);
		const held = byBlock.get(r.block_id);
		const at = r.updated_at ? Date.parse(r.updated_at) : 0;
		const heldAt = held?.at ? Date.parse(held.at) : -1;
		if (!held || at > heldAt) {
			byBlock.set(r.block_id, { blockId: r.block_id, value: r.value, by: email, at: r.updated_at ?? null, answeredBy: 0 });
		}
	}
	return [...byBlock.values()].map((m) => ({ ...m, answeredBy: count.get(m.blockId) ?? 1 }));
}

/** Which team, of the posted draws, each student is on. */
export function teamOfStudent(sections: ReadonlyArray<{ teams: ReadonlyArray<{ id: string; name: string; members: readonly string[] }> }>): Map<string, { id: string; name: string; members: string[] }> {
	const out = new Map<string, { id: string; name: string; members: string[] }>();
	for (const s of sections) for (const t of s.teams) for (const m of t.members) out.set(m.toLowerCase(), { id: t.id, name: t.name, members: [...t.members] });
	return out;
}

// ---------------------------------------------------------------------------
// A rubric line the page hides
// ---------------------------------------------------------------------------

export interface HiddenLine {
	id: string;
	/** Where the requirement was found: a tooltip, a closed disclosure, hidden text. */
	where: string;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'your', 'from', 'each', 'every', 'are', 'all', 'has', 'have', 'into', 'its', 'one', 'two', 'per', 'any', 'not', 'least']);

/** The words that carry a criterion's meaning: four letters or more, no filler. */
function keyWords(text: string): string[] {
	return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
}

function textOf(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&[a-z#0-9]+;/gi, ' ')
		.toLowerCase();
}

/**
 * Each module's section of the document: `<section ... data-module="id">` or
 * an element with `id="<module id>"`, up to the next such section. A module
 * with neither is judged over the whole document.
 */
function moduleSlices(html: string, ids: readonly string[]): Map<string, string> {
	const out = new Map<string, string>();
	const marks: Array<{ id: string; at: number }> = [];
	for (const id of ids) {
		const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const re = new RegExp(`<[a-z]+[^>]*(?:data-module|id)=["']${esc}["'][^>]*>`, 'i');
		const m = re.exec(html);
		if (m) marks.push({ id, at: m.index });
	}
	marks.sort((a, b) => a.at - b.at);
	for (let i = 0; i < marks.length; i++) out.set(marks[i].id, html.slice(marks[i].at, marks[i + 1]?.at ?? html.length));
	return out;
}

/** The text a student reads without opening anything, and the text only behind something. */
function splitVisible(html: string): { visible: string; tucked: Array<{ text: string; where: string }> } {
	const tucked: Array<{ text: string; where: string }> = [];
	let rest = html;
	const take = (re: RegExp, where: string, group = 0) => {
		rest = rest.replace(re, (...m) => {
			tucked.push({ text: textOf(String(m[group])), where });
			return ' ';
		});
	};
	// A closed disclosure's body (its summary stays visible).
	rest = rest.replace(/<details(?![^>]*\bopen\b)[^>]*>([\s\S]*?)<\/details>/gi, (_m, inner: string) => {
		const sum = /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(inner);
		tucked.push({ text: textOf(inner.replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, ' ')), where: 'a closed disclosure' });
		return sum ? ` ${sum[1]} ` : ' ';
	});
	take(/<[a-z]+[^>]*\bhidden\b[^>]*>([\s\S]*?)<\/[a-z]+>/gi, 'hidden text', 1);
	take(/<[a-z]+[^>]*class=["'][^"']*\b(?:vh|sr-only|visually-hidden)\b[^"']*["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi, 'hidden text', 1);
	// Tooltip text lives in attributes.
	rest = rest.replace(/\b(?:data-tip|title|data-tooltip|aria-description)=["']([^"']+)["']/gi, (_m, t: string) => {
		tucked.push({ text: t.toLowerCase(), where: 'a tooltip' });
		return ' ';
	});
	return { visible: textOf(rest), tucked };
}

/**
 * RUBRIC LINES WHOSE REQUIREMENT A STUDENT ONLY SEES BY OPENING SOMETHING
 * (report c9d7efc3: 18 of 61 lines on Oct 28). A line is flagged when fewer
 * than half of its key words are in its step's visible text and more of them
 * are in that step's tooltips, closed disclosures or hidden text. A line with
 * no key words, or a document with no tucked text, is never flagged.
 */
export function hiddenRubricLines(html: string | null | undefined, manifest: HtmlAssignmentManifest | null | undefined): HiddenLine[] {
	if (!html || !manifest?.modules?.length) return [];
	const slices = moduleSlices(html, manifest.modules.map((m) => m.id));
	const out: HiddenLine[] = [];
	for (const m of manifest.modules) {
		const { visible, tucked } = splitVisible(slices.get(m.id) ?? html);
		if (tucked.length === 0) continue;
		for (const c of m.criteria ?? []) {
			const words = keyWords(c.text ?? '');
			if (words.length === 0) continue;
			const seen = words.filter((w) => visible.includes(w)).length;
			if (seen * 2 >= words.length) continue;
			let best: { where: string; hits: number } | null = null;
			for (const t of tucked) {
				const hits = words.filter((w) => t.text.includes(w)).length;
				if (hits > seen && (!best || hits > best.hits)) best = { where: t.where, hits };
			}
			if (best) out.push({ id: manifestCriterionId(m.id, c.id), where: best.where });
		}
	}
	return out;
}
