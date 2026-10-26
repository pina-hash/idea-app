import { error, json } from '@sveltejs/kit';
import { dayIndex } from '$lib/classroom/school-calendar';
import { outsideEvents } from '$lib/server/calendar/feeds';
import type { RequestHandler } from './$types';

/**
 * THE SCHOOL'S AND THE ROBOTICS TEAM'S EVENTS FOR A FEW DAYS (ledger 0439),
 * for the "this week" strip, which loads itself in the browser. Signed in only
 * (the pages it serves are); at most 62 days per ask. Nothing here is about the
 * caller: both feeds are the same for everyone.
 */
export const GET: RequestHandler = async ({ url, locals: { claims } }) => {
	if (!claims) error(401, 'Sign in to see the calendar.');
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	const a = dayIndex(from);
	const b = dayIndex(to);
	if (a === null || b === null || b < a || b - a > 62) error(400, 'Ask for up to 62 days.');
	const { school, robotics } = await outsideEvents(from, to);
	return json(
		{ school: school.events, robotics: robotics.events, status: { school: school.status, robotics: robotics.status } },
		{ headers: { 'cache-control': 'private, max-age=600' } }
	);
};
