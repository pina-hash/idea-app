/**
 * THE CLASS HEADER'S ARITHMETIC (ledger 0360, report R19). Pure, so every
 * decision the header makes is assertable at a pinned instant.
 *
 * Mr. Pina, on the class banner: "The banner has no function other than to say
 * the title of a class ... it's just taking up space and I don't have a lot of
 * space to work with." The header that replaces the banner, the tools row, the
 * teams strip, the theme row and the New post row is ONE compact block whose
 * keys each do something: the next thing due, the hall pass and music, the
 * teams link, the class theme, and a manager's posting keys.
 */
import {
	assignmentStanding,
	emailLocal,
	formatDue,
	isScheduled,
	itemTitle,
	type ClassroomItem,
	type ClassroomSection,
	type StudentWork
} from '$lib/classroom/classroom';
import { formatSectionLabel } from '$lib/section-label';

export interface ClassNextDue {
	id: string;
	title: string;
	href: string;
	dueAt: string;
	/** `formatDue`'s string: "Sep 30, 11:59 PM". */
	when: string;
}

/**
 * THE NEXT THING DUE, for the header's Next due key, or null for nothing.
 *
 * A STUDENT is shown the earliest assignment still TO DO (asked of
 * `assignmentStanding`, the one implementation of where a student stands, so a
 * finished ported worksheet and a turned-in assignment are never offered as
 * next) whose due instant has not passed. Missing work is not "next": it is the
 * status filter's, which already counts it. Undated work is never next.
 *
 * A MANAGER is shown the earliest PUBLISHED, LIVE assignment due from now on: a
 * draft and a scheduled item are not due for anybody yet (`isScheduled`).
 *
 * `now` is the loader's one clock read, handed down; this reads no clock.
 */
export function nextDueFor(input: {
	items: readonly ClassroomItem[];
	work: Record<string, StudentWork>;
	now: string | null | undefined;
	today?: string | null;
	canManage: boolean;
	href: (itemId: string) => string;
}): ClassNextDue | null {
	const nowMs = input.now ? Date.parse(input.now) : Number.NaN;
	if (!Number.isFinite(nowMs)) return null;
	const nowDate = new Date(nowMs);
	let best: { item: ClassroomItem; due: number } | null = null;
	for (const item of input.items) {
		if (item.kind !== 'assignment' || !item.due_at) continue;
		const due = Date.parse(item.due_at);
		if (!Number.isFinite(due) || due < nowMs) continue;
		// Not due for anybody yet. A student's read never carries either (RLS),
		// so for them this is a second refusal rather than the one that matters.
		if (!item.published || isScheduled(item, nowDate)) continue;
		if (!input.canManage && assignmentStanding(item, input.work[item.id], input.now as string) !== 'todo') {
			continue;
		}
		if (
			!best ||
			due < best.due ||
			(due === best.due && itemTitle(item).localeCompare(itemTitle(best.item)) < 0)
		) {
			best = { item, due };
		}
	}
	if (!best) return null;
	return {
		id: best.item.id,
		title: itemTitle(best.item),
		href: input.href(best.item.id),
		dueAt: best.item.due_at as string,
		when: formatDue(best.item.due_at, input.today ?? null)
	};
}

/**
 * The class's identity line, as the header's one recessed chip carries it:
 * "IDEA100 · Period 2 (Block 2) · pina". The same words the banner's meta row
 * printed, and the full string is the chip's `title`.
 */
export function classHeaderMeta(section: ClassroomSection): string {
	return [section.course?.code ?? '', formatSectionLabel(section.label, section.block), emailLocal(section.teacher_email)]
		.filter((part) => part.trim() !== '')
		.join(' · ');
}

/** What the header's teams key carries: the strip's sentence, and where it leads. */
export interface ClassHeaderTeams {
	text: string;
	href: string;
	label: string;
}

/**
 * THE TEACHER'S TEAMS KEY, from the two pieces `class-teams.ts` already owns:
 * the one-line notice (`postedTeamsNotice`) and the People link
 * (`teamsManageLink`). Null when either is missing, which renders no key.
 */
export function classHeaderTeams(
	notice: string | null,
	link: { href: string; label: string } | null
): ClassHeaderTeams | null {
	return notice && link ? { text: notice, href: link.href, label: link.label } : null;
}
