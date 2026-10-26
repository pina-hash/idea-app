/**
 * AN HTML ASSIGNMENT'S DAY-BY-DAY PACING (ledger 0439, report 0ccf7bff): which
 * part of the assignment a student should have done by which class day.
 *
 *   "pacing": [
 *     { "id": "d1", "day": 1, "title": "Read the brief and sketch three ideas", "modules": ["brief"] },
 *     { "id": "d2", "day": 2, "title": "Pick one idea and size it", "modules": ["sizing"] },
 *     { "id": "review", "date": "2026-11-02", "title": "Design review ready" }
 *   ]
 *
 * A DISPLAY KEY IN THE SENSE OF SPEC 4.8. It changes what a student and the
 * calendar SEE and nothing about what may be stored: the manifest gate (0195,
 * 0301) does not read it, so a document carrying it imports exactly as one
 * without it, and this validator only WARNS. A step this reader cannot
 * understand is dropped, never a refused upload.
 *
 * `day` IS A SCHOOL DAY OF THE ASSIGNMENT, counted from the day it opens (day
 * 1), skipping weekends and the site's no-school days, so one document paces
 * every section and every year. `date` is a fixed calendar day, for a unit
 * whose dates are set (Unit 4's sign-offs are written that way). A step names
 * exactly one of the two.
 *
 * ONE READER HERE, ONE RESOLVER IN THE DATABASE. `manifestPacing` decides what
 * the key says; the database's `_classroom_item_pacing` (0308) reads the same
 * shape and turns a `day` into a date against the real no-school days, because
 * only it knows them, and it is what the calendar, the item page and the
 * document are all handed. `tests/db/calendar.test.ts` puts both to one
 * corpus.
 */

/** A step's id: `classroom_responses`'s id charset, the rule every manifest id follows (manifest.ts `HTML_ID_RE`). */
export const PACING_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** At most this many steps; past it the rest are dropped with a warning. */
export const PACING_MAX_STEPS = 40;

/** The furthest school day a `day` step may name. */
export const PACING_MAX_DAY = 60;

/** The longest title, in characters. */
export const PACING_TITLE_MAX = 120;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** One step as the reader understood it. */
export interface PacingStep {
	id: string;
	title: string;
	/** A school day of the assignment, 1 being the day it opens. Null when `date` is set. */
	day: number | null;
	/** A fixed calendar day, YYYY-MM-DD. Null when `day` is set. */
	date: string | null;
	/** The module ids the step covers, only those the manifest declares, in the order written. */
	modules: string[];
}

function isObject(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** True for a real calendar day written YYYY-MM-DD. */
export function isPacingDate(v: unknown): v is string {
	if (typeof v !== 'string') return false;
	const m = DATE_RE.exec(v);
	if (!m) return false;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return d.toISOString().slice(0, 10) === v;
}

function moduleIdsOf(manifest: Record<string, unknown>): Set<string> {
	const out = new Set<string>();
	if (Array.isArray(manifest.modules)) {
		for (const m of manifest.modules) if (isObject(m) && typeof m.id === 'string') out.add(m.id);
	}
	return out;
}

/** Why a step is not read, or null when it is. One statement, used by the reader and the warnings. */
function stepProblem(step: unknown, seen: Set<string>): string | null {
	if (!isObject(step)) return 'is not an object';
	const id = typeof step.id === 'string' ? step.id : '';
	if (!PACING_ID_RE.test(id)) return 'needs an id of letters, digits, - and _ (up to 40 characters)';
	if (seen.has(id)) return `repeats the id "${id}"`;
	const title = typeof step.title === 'string' ? step.title.trim() : '';
	if (!title) return 'needs a title';
	const hasDay = step.day !== undefined && step.day !== null;
	const hasDate = step.date !== undefined && step.date !== null;
	if (hasDay === hasDate) return 'needs exactly one of day (a school day of the assignment) or date (YYYY-MM-DD)';
	if (hasDay) {
		const d = step.day;
		if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > PACING_MAX_DAY) {
			return `day must be a whole number from 1 to ${PACING_MAX_DAY}`;
		}
	} else if (!isPacingDate(step.date)) {
		return 'date must be a real day written YYYY-MM-DD';
	}
	if (step.modules !== undefined && !Array.isArray(step.modules)) return 'modules must be a list of module ids';
	return null;
}

/**
 * THE STEPS A MANIFEST DECLARES, as this reader understands them. A missing
 * key, a key that is not a list, and every step with a problem contribute
 * nothing. Module ids the manifest does not declare are dropped from a step.
 */
export function manifestPacing(manifest: unknown): PacingStep[] {
	if (!isObject(manifest) || !Array.isArray(manifest.pacing)) return [];
	const modules = moduleIdsOf(manifest);
	const seen = new Set<string>();
	const out: PacingStep[] = [];
	for (const raw of manifest.pacing) {
		if (out.length >= PACING_MAX_STEPS) break;
		if (stepProblem(raw, seen)) continue;
		const s = raw as Record<string, unknown>;
		const id = s.id as string;
		seen.add(id);
		out.push({
			id,
			title: (s.title as string).trim().slice(0, PACING_TITLE_MAX),
			day: s.day === undefined || s.day === null ? null : (s.day as number),
			date: s.date === undefined || s.date === null ? null : (s.date as string),
			modules: Array.isArray(s.modules)
				? [...new Set(s.modules.filter((m): m is string => typeof m === 'string' && modules.has(m)))]
				: []
		});
	}
	return out;
}

/**
 * WHAT THE READER WILL DO WITH THE KEY, said before import. Every sentence is a
 * warning: a pacing typo must never stop a worksheet importing.
 */
export function manifestPacingWarnings(manifest: unknown): string[] {
	if (!isObject(manifest) || manifest.pacing === undefined || manifest.pacing === null) return [];
	if (!Array.isArray(manifest.pacing)) {
		return ['The manifest pacing must be a list of steps; it is ignored, so the assignment shows no day-by-day plan.'];
	}
	const out: string[] = [];
	const modules = moduleIdsOf(manifest);
	const seen = new Set<string>();
	manifest.pacing.forEach((raw, i) => {
		const where = `Pacing step ${i + 1}`;
		if (i >= PACING_MAX_STEPS) {
			if (i === PACING_MAX_STEPS) {
				out.push(`Pacing has more than ${PACING_MAX_STEPS} steps; the steps after ${PACING_MAX_STEPS} are ignored.`);
			}
			return;
		}
		const problem = stepProblem(raw, seen);
		if (problem) {
			out.push(`${where} ${problem}, so it is ignored.`);
			return;
		}
		const s = raw as Record<string, unknown>;
		seen.add(s.id as string);
		const title = (s.title as string).trim();
		if (title.length > PACING_TITLE_MAX) {
			out.push(`${where} title is ${title.length} characters; only the first ${PACING_TITLE_MAX} are shown.`);
		}
		if (/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(title)) {
			out.push(`${where} title names a weekday. A step already has its day; a weekday is right for one section in one term.`);
		}
		if (Array.isArray(s.modules)) {
			const unknown = s.modules.filter((m) => typeof m !== 'string' || !modules.has(m));
			if (unknown.length) {
				out.push(`${where} names modules the manifest does not declare (${unknown.map((m) => JSON.stringify(m)).join(', ')}); they are ignored.`);
			}
		}
	});
	return out;
}
