/**
 * A NOTEBOOK THAT GIVES BACK (ledger 0297, package F4b): one class's project
 * timeline for a student, stitching their notebook entries, their hand-ins and
 * the photos they put into assignments, in date order.
 *
 * WHY THE HAND-INS ARE IN IT. `IDEA_MATERIALS_PROCESS.md` ("Notebook Work
 * Attaches To An Assignment"): paper photographed into an assignment's image
 * zone IS notebook work, and a student must never photograph the same page
 * twice to have it count in both places. So the assignment's own photos appear
 * here, read-only, as they were handed in -- nothing is copied, re-filed or
 * re-stored, and how a graded assignment stores its answers does not change.
 *
 * THE STREAK IS THE STUDENT'S OWN AND NEVER A RANKING. It counts the class
 * days (this class's check-in dates, up to today) in a row, most recent first,
 * on which the student filed an entry. No other student's number is read, and
 * nothing compares one student to another.
 *
 * Pure: no Svelte, no Supabase, no clock (the caller hands `today`).
 */

import { livePhotos, type NotebookEntry } from '$lib/notebook';
import { laCalendarDay } from '$lib/classroom/school-calendar';

export interface TimelineItem {
	id: string;
	title: string | null;
	kind: string;
}

export interface TimelineSubmission {
	id: string;
	item_id: string;
	state: string | null;
	submitted_at: string | null;
	returned_at: string | null;
}

export interface TimelineFile {
	id: string;
	submission_id: string;
	block_id: string | null;
	filename: string;
	created_at: string;
	image: boolean;
}

export type TimelineEvent =
	| { kind: 'entry'; at: string; id: string; entry: NotebookEntry; photos: number; draft: boolean }
	| { kind: 'hand-in'; at: string; id: string; itemId: string; itemTitle: string; returned: boolean }
	| { kind: 'photos'; at: string; id: string; itemId: string; itemTitle: string; files: TimelineFile[] };

export interface TimelineDay {
	day: string;
	events: TimelineEvent[];
}

/** Every event, grouped by the school's calendar day, newest day and newest event first. */
export function buildTimeline(input: {
	entries: NotebookEntry[];
	items: TimelineItem[];
	submissions: TimelineSubmission[];
	files: TimelineFile[];
}): TimelineDay[] {
	const titles = new Map(input.items.map((i) => [i.id, i.title?.trim() || 'Untitled item']));
	const subItem = new Map(input.submissions.map((s) => [s.id, s.item_id]));
	const events: TimelineEvent[] = [];

	for (const e of input.entries) {
		events.push({
			kind: 'entry',
			at: e.submitted_at ?? e.upload_timestamp,
			id: `entry:${e.id}`,
			entry: e,
			photos: livePhotos(e.photos).length,
			draft: e.submitted_at === null
		});
	}
	for (const s of input.submissions) {
		if (!s.submitted_at || !titles.has(s.item_id)) continue;
		events.push({
			kind: 'hand-in',
			at: s.submitted_at,
			id: `hand-in:${s.id}`,
			itemId: s.item_id,
			itemTitle: titles.get(s.item_id) as string,
			returned: !!s.returned_at
		});
	}
	// The assignment's PHOTOS, one event per assignment per day: a student who
	// photographed six pages into one assignment made one piece of work.
	const photoGroups = new Map<string, TimelineFile[]>();
	for (const f of input.files) {
		const itemId = subItem.get(f.submission_id);
		if (!f.image || !itemId || !titles.has(itemId)) continue;
		const key = `${itemId}|${laCalendarDay(new Date(f.created_at))}`;
		photoGroups.set(key, [...(photoGroups.get(key) ?? []), f]);
	}
	for (const [key, files] of photoGroups) {
		const itemId = key.split('|')[0];
		const sorted = [...files].sort((a, b) => a.created_at.localeCompare(b.created_at));
		events.push({
			kind: 'photos',
			at: sorted[sorted.length - 1].created_at,
			id: `photos:${key}`,
			itemId,
			itemTitle: titles.get(itemId) as string,
			files: sorted
		});
	}

	events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
	const days: TimelineDay[] = [];
	for (const ev of events) {
		const day = laCalendarDay(new Date(ev.at));
		const last = days[days.length - 1];
		if (last && last.day === day) last.events.push(ev);
		else days.push({ day, events: [ev] });
	}
	return days;
}

/**
 * Class days in a row, counting back from the latest class day up to today,
 * on which this student filed an entry (by its check-in, or by the day it was
 * made). A class day not yet reached does not count against it; a class day
 * today with nothing filed YET does not break it either, because the day is
 * not over.
 */
export function classDayStreak(
	entries: Pick<NotebookEntry, 'session_id' | 'upload_timestamp' | 'submitted_at'>[],
	classDays: { session_id: string; session_date: string }[],
	today: string
): number {
	const days = [...new Set(classDays.map((c) => c.session_date).filter((d) => d <= today))].sort().reverse();
	if (!days.length) return 0;
	const sessionsByDay = new Map<string, Set<string>>();
	for (const c of classDays) {
		sessionsByDay.set(c.session_date, (sessionsByDay.get(c.session_date) ?? new Set()).add(c.session_id));
	}
	const filedDays = new Set(entries.map((e) => laCalendarDay(new Date(e.upload_timestamp))));
	const filedSessions = new Set(entries.map((e) => e.session_id).filter(Boolean) as string[]);
	const filedOn = (day: string) =>
		filedDays.has(day) || [...(sessionsByDay.get(day) ?? [])].some((s) => filedSessions.has(s));

	let streak = 0;
	for (const [i, day] of days.entries()) {
		if (filedOn(day)) streak++;
		else if (i === 0 && day === today) continue;
		else break;
	}
	return streak;
}

/** "Tuesday" is never printed (ledger 0297, TODO): "Sep 23". */
export function timelineDayLabel(day: string, today: string): string {
	if (day === today) return 'Today';
	const d = new Date(`${day}T12:00:00Z`);
	if (Number.isNaN(d.getTime())) return day;
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
