import { error } from '@sveltejs/kit';
import { mergeEvents, parseCalendarFeed, visibleEvents, eventHref } from '$lib/calendar/model';
import { renderIcs } from '$lib/calendar/feed-io';
import { laCalendarDay, schoolDayPlus } from '$lib/classroom/school-calendar';
import { outsideEvents } from '$lib/server/calendar/feeds';
import type { RequestHandler } from './$types';

/**
 * A PERSON'S CALENDAR AS A SUBSCRIPTION (ledger 0439). A phone's calendar app
 * reads this with no session, so the read is `calendar_feed_by_token`, the one
 * anonymous entry 0308 opens: it answers the link's owner's calendar or
 * nothing. A wrong, replaced or revoked link is the same bodyless 404, so a
 * link cannot be probed. The owner's own layer and class choices are applied
 * here, the same `visibleEvents` the page uses.
 *
 * Sixty days back and three hundred ahead; the phone asks again within the hour.
 */
export const GET: RequestHandler = async ({ params, url, locals: { supabase } }) => {
	const token = params.token.replace(/\.ics$/i, '').toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(token)) error(404, 'Not found');
	const today = laCalendarDay(new Date());
	const from = schoolDayPlus(today, -60) ?? today;
	const to = schoolDayPlus(today, 300) ?? today;
	const { data, error: failed } = await supabase.rpc('calendar_feed_by_token', { p_token: token, p_from: from, p_to: to });
	if (failed) error(503, 'The calendar is not available right now.');
	const feed = parseCalendarFeed(data);
	if (!feed) error(404, 'Not found');
	const hidden = new Set(feed.prefs.hidden);
	const outside = await outsideEvents(from, to);
	const events = visibleEvents(
		mergeEvents(
			feed.events,
			hidden.has('school') ? [] : outside.school.events,
			hidden.has('robotics') ? [] : outside.robotics.events
		),
		feed.prefs
	);
	const body = renderIcs(events, {
		name: 'IDEA calendar',
		origin: url.origin,
		stamp: new Date().toISOString(),
		href: (e) => eventHref(e)
	});
	return new Response(body, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': 'inline; filename="idea-calendar.ics"',
			'cache-control': 'private, max-age=900',
			'x-robots-tag': 'noindex'
		}
	});
};
