/**
 * ONE LOAD FOR EVERY CALENDAR PAGE (ledger 0439): the person's calendar from
 * the database (`calendar_feed`, which re-checks who is asking), and the two
 * outside feeds for the same days. The page draws both; the database decides
 * every class event, and the server adds only what is public to the school.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { monthGridBounds, monthOf, parseCalendarFeed, readMonth, type CalendarFeed } from '$lib/calendar/model';
import { laCalendarDay } from '$lib/classroom/school-calendar';
import { outsideEvents, type FeedResult } from './feeds';

export interface CalendarLoad {
	/** False when the database has no calendar yet (the migration not applied) or the read failed. */
	ready: boolean;
	month: string;
	today: string;
	feed: CalendarFeed | null;
	school: FeedResult;
	robotics: FeedResult;
}

export async function loadCalendar(supabase: SupabaseClient, url: URL): Promise<CalendarLoad> {
	// The ONE clock read on this surface: the loader's.
	const today = laCalendarDay(new Date());
	const month = readMonth(url.searchParams.get('m')) ?? monthOf(today);
	const { from, to } = monthGridBounds(month);
	const [db, outside] = await Promise.all([
		supabase.rpc('calendar_feed', { p_from: from, p_to: to }),
		outsideEvents(from, to)
	]);
	const feed = db.error ? null : parseCalendarFeed(db.data);
	return { ready: !!feed, month, today: feed?.today ?? today, feed, school: outside.school, robotics: outside.robotics };
}
