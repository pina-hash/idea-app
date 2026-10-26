/**
 * AN ASSIGNMENT'S DUE DATE AND DAY-BY-DAY PLAN ON ITS OWN PAGE (ledger 0439):
 * read once from `classroom_item_pacing` (0308's one resolver, which re-checks
 * that the caller may read the post), then judged for this student against the
 * progress rail's own `hxProgress`, so a step is done exactly when the rail
 * says its modules are.
 *
 * The answer goes two places: the strip above the worksheet (`PacingStrip`)
 * and `schedule` on `idea:state` (SPEC 17.4), which is the same object.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HxPacingState, HxPacingStep, HxSchedule } from '$lib/classroom/html-assignment/bridge';
import type { HxProgress } from '$lib/classroom/html-assignment/progress';
import { schoolDayOf } from '$lib/classroom/school-calendar';

export interface ItemPacing {
	today: string;
	dueAt: string | null;
	steps: { id: string; title: string; day: string; modules: string[] }[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The database's answer, read defensively; null when there is none to show. */
export function parseItemPacing(raw: unknown): ItemPacing | null {
	const r = raw as { ok?: boolean; today?: unknown; due_at?: unknown; pacing?: unknown } | null;
	if (!r || r.ok !== true || typeof r.today !== 'string' || !DAY_RE.test(r.today)) return null;
	const steps = Array.isArray(r.pacing)
		? r.pacing
				.map((p) => p as { id?: unknown; title?: unknown; day?: unknown; modules?: unknown })
				.filter((p) => typeof p.id === 'string' && typeof p.title === 'string' && typeof p.day === 'string' && DAY_RE.test(p.day))
				.map((p) => ({
					id: p.id as string,
					title: p.title as string,
					day: p.day as string,
					modules: Array.isArray(p.modules) ? p.modules.filter((m): m is string => typeof m === 'string') : []
				}))
		: [];
	return { today: r.today, dueAt: typeof r.due_at === 'string' ? r.due_at : null, steps };
}

/**
 * READ IT. A missing function (`PGRST202`, the database before 0308) and any
 * other failure answer null: the page shows no plan rather than an error.
 */
export async function loadItemPacing(supabase: SupabaseClient, itemId: string): Promise<ItemPacing | null> {
	try {
		const { data, error } = await supabase.rpc('classroom_item_pacing', { p_item_id: itemId });
		return error ? null : parseItemPacing(data);
	} catch {
		return null;
	}
}

/**
 * A STEP IS DONE when every counted block in its modules is met, by the rail's
 * own judgment; a step naming no module (a reminder) is never done. Then: its
 * day passed and not done is `behind`, today is `today`, the first after today
 * is `next`, the rest `later`.
 */
export function hxScheduleFor(pacing: ItemPacing, progress: HxProgress | null): HxSchedule {
	const moduleDone = new Map((progress?.modules ?? []).map((m) => [m.id, m.weight > 0 ? m.done : null]));
	const isDone = (modules: string[]) => {
		const judged = modules.map((m) => moduleDone.get(m)).filter((d): d is boolean => d !== null && d !== undefined);
		return judged.length > 0 && judged.every(Boolean);
	};
	let nextGiven = false;
	const steps: HxPacingStep[] = pacing.steps.map((s) => {
		let state: HxPacingState;
		if (isDone(s.modules)) state = 'done';
		else if (s.day < pacing.today) state = 'behind';
		else if (s.day === pacing.today) state = 'today';
		else if (!nextGiven) {
			state = 'next';
			nextGiven = true;
		} else state = 'later';
		if (state === 'today') nextGiven = true;
		return { ...s, state };
	});
	return { today: pacing.today, due: { at: pacing.dueAt, day: schoolDayOf(pacing.dueAt) }, pacing: steps };
}

/** The words for a step's state, as the strip prints them. */
export const PACING_STATE_WORDS: Record<HxPacingState, string> = {
	done: 'Done',
	behind: 'Behind',
	today: 'Today',
	next: 'Next',
	later: 'Coming up'
};
