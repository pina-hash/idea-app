/**
 * ONE "NEEDS GRADING" VIEW ACROSS CLASSES (ledger 0457, gap ba704a08).
 *
 * Mr. Pina, 2026-10-28: "I need to catch up on grading for all my classes,
 * except for the idea 2 9H, block 4, section 3." The read is one call,
 * `classroom_needs_grading` (0315): every past-due assignment with saved work
 * and no grade, by class, leaving out the classes named. This module parses
 * its answer and keeps the classes left out on this device, and is the one
 * shape the page and its harness read.
 *
 * The connector's read grades with no post is the same function, so the site
 * and a chat cannot disagree about what is waiting.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueueStudent {
	email: string;
	name: string;
	turnedIn: boolean;
	answers: number;
	files: number;
	lastSaved: string | null;
	savedAfterDue: boolean;
}

export interface QueueItem {
	itemId: string;
	title: string;
	points: number | null;
	dueAt: string | null;
	html: boolean;
	team: boolean;
	waiting: number;
	students: QueueStudent[];
}

export interface QueueClass {
	sectionId: string;
	course: string;
	courseTitle: string;
	label: string;
	block: string | null;
	waiting: number;
	items: QueueItem[];
}

export interface NeedsGrading {
	classes: QueueClass[];
	excluded: Array<{ sectionId: string; course: string; label: string; block: string | null }>;
	total: number;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** The function's jsonb answer as the page reads it. Anything unreadable is an empty queue, never a throw. */
export function parseNeedsGrading(raw: unknown): NeedsGrading {
	const r = (raw ?? {}) as Record<string, unknown>;
	const classes = (Array.isArray(r.classes) ? r.classes : []).map((c: Record<string, unknown>) => ({
		sectionId: str(c.section_id),
		course: str(c.course),
		courseTitle: str(c.course_title),
		label: str(c.label),
		block: typeof c.block === 'string' ? c.block : null,
		waiting: num(c.waiting),
		items: (Array.isArray(c.items) ? c.items : []).map((i: Record<string, unknown>) => ({
			itemId: str(i.item_id),
			title: str(i.title) || 'Untitled',
			points: typeof i.points === 'number' ? i.points : null,
			dueAt: typeof i.due_at === 'string' ? i.due_at : null,
			html: i.html === true,
			team: i.team === true,
			waiting: num(i.waiting),
			students: (Array.isArray(i.students) ? i.students : []).map((s: Record<string, unknown>) => ({
				email: str(s.email),
				name: str(s.name) || str(s.email),
				turnedIn: s.turned_in === true,
				answers: num(s.answers),
				files: num(s.files),
				lastSaved: typeof s.last_saved === 'string' ? s.last_saved : null,
				savedAfterDue: s.saved_after_due === true
			}))
		}))
	}));
	const excluded = (Array.isArray(r.excluded) ? r.excluded : []).map((e: Record<string, unknown>) => ({
		sectionId: str(e.section_id),
		course: str(e.course),
		label: str(e.label),
		block: typeof e.block === 'string' ? e.block : null
	}));
	return { classes, excluded, total: classes.reduce((n, c) => n + c.waiting, 0) };
}

/** The read, as the signed-in teacher. A deployment before 0315 says so rather than showing nothing. */
export async function readNeedsGrading(
	supabase: SupabaseClient,
	exclude: string[]
): Promise<{ ok: true; data: NeedsGrading } | { ok: false; missing: boolean; message: string }> {
	const { data, error } = await supabase.rpc('classroom_needs_grading', {
		p_sections: null,
		p_exclude: exclude.length ? exclude : null
	});
	if (error) {
		return { ok: false, missing: error.code === 'PGRST202', message: error.message };
	}
	return { ok: true, data: parseNeedsGrading(data) };
}

/** Where to grade one waiting post: the team page for a team post, otherwise the cross-class console. */
export function gradeHref(item: Pick<QueueItem, 'itemId' | 'team'>, sectionId: string, basePath = '/classroom'): string {
	return item.team ? `${basePath}/${sectionId}/item/${item.itemId}/teams` : `${basePath}/grading/${item.itemId}`;
}

/** What one waiting student has saved, in a few words. */
export function studentSaved(s: QueueStudent, html: boolean): string {
	const parts: string[] = [];
	if (s.turnedIn) parts.push('turned in');
	if (html || s.answers) parts.push(`${s.answers} ${s.answers === 1 ? 'answer' : 'answers'} saved`);
	if (s.files) parts.push(`${s.files} ${s.files === 1 ? 'file' : 'files'}`);
	if (s.savedAfterDue) parts.push('saved after due');
	return parts.join(', ');
}

/** The classes left out, kept on this device only: a view, never a grade. */
export const QUEUE_EXCLUDE_KEY = 'idea.grading.queueExclude';

export function readExcluded(storage: Pick<Storage, 'getItem'> | null): string[] {
	try {
		const v = JSON.parse(storage?.getItem(QUEUE_EXCLUDE_KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export function writeExcluded(storage: Pick<Storage, 'setItem'> | null, ids: string[]): void {
	try {
		storage?.setItem(QUEUE_EXCLUDE_KEY, JSON.stringify([...new Set(ids)].sort()));
	} catch {
		/* a view preference; nothing depends on it */
	}
}
