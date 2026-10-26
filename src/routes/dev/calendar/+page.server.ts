import { readFileSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { expandIcs, parseIcs } from '$lib/calendar/ical';
import { occurrencesToEvents } from '$lib/calendar/feed-io';
import { monthGridBounds, readMonth } from '$lib/calendar/model';
import type { PageServerLoad } from './$types';

/**
 * THE CALENDAR HARNESS (ledger 0439): the real calendar page, week strip and
 * pacing strip over a fixture feed, with the school and robotics layers read
 * through the real reader from the recorded feeds in tests/fixtures/calendar.
 * Dev only.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const month = readMonth(url.searchParams.get('m')) ?? '2026-10';
	const { from, to } = monthGridBounds(month);
	const read = (name: string) => parseIcs(readFileSync(`tests/fixtures/calendar/${name}`, 'utf8'));
	return {
		month,
		school: occurrencesToEvents('school', expandIcs(read('bosco-2026-27.ics'), from, to)),
		robotics: occurrencesToEvents('robotics', expandIcs(read('techmen-sample.ics'), from, to))
	};
};
